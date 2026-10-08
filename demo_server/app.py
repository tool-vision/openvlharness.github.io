"""OpenVLHarness live demo backend (Gradio), built on the released openvlharness package.

The project page (static/js/demo.js) calls four endpoints:
  /tools_note()                                                  -> markdown listing the deployed tools
  /test_connection(provider, base_url, api_key, model)           -> markdown status line
  /start_run(message, provider, base_url, api_key, model, serper_key) -> job id
  /poll(job_id)                                                  -> {"chat": [...], "done": bool}

Each run builds a fresh MainAgent around the visitor's orchestrator model. GPU perception
tools and zoom go through one shared tool router, so its per-backend concurrency gates apply
to every visitor. Search tools (with the visitor's Serper key) and
the coding generator run in this process, one instance per run. The visitor's model is the only
LLM: it orchestrates, writes code for the coding tool and summarizes search/webpage results, so
the deployment hosts no language model of its own. Visitor keys live only in that run's objects
and are never logged or stored.
"""
import base64
import copy
import ipaddress
import json
import logging
import os
import re
import socket
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import gradio as gr
import requests

from openvlharness.agent.agent import MainAgent
from openvlharness.bootstrap import build_capabilities, load_agent_config, memory_factory
from openvlharness.services import models as ovh_models
from openvlharness.services.envelope import (
    _build_error_payload, _build_success_payload, _normalize_result_payload)
from openvlharness.services.models import AuxiliaryModel, ModelAdapter, failure_text
from openvlharness.capabilities._base import failure
from PIL import Image, ImageOps
from openvlharness.services.tools.base import ToolArgumentError
from openvlharness.services.tools.serper_common import SerperClient
from openvlharness.contracts import ServiceResult

log = logging.getLogger("ovh-demo")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

OPENAI = "OpenAI"
COMPAT = "OpenAI-compatible (vLLM / SGLang)"
OPENAI_BASE = "https://api.openai.com/v1"

ROUTER_URL = os.environ.get("DEMO_TOOL_SERVER_URL", "http://127.0.0.1:8101")
ALLOW_PRIVATE = os.environ.get("DEMO_ALLOW_PRIVATE_ENDPOINTS", "0") == "1"
IMAGE_SEARCH = os.environ.get("DEMO_IMAGE_SEARCH", "0") == "1"
MAX_RUNS = int(os.environ.get("DEMO_MAX_RUNS", "4"))
MAX_ITERATIONS = int(os.environ.get("DEMO_MAX_ITERATIONS", "15"))
OUT_DIR = Path(os.environ.get("DEMO_OUTPUT_DIR", "/tmp/ovh-demo")).resolve()
JOB_TTL = 3 * 3600
MAX_IMAGES, MAX_BYTES, MAX_QUESTION = 4, 10 * 1024 * 1024, 4000
# SAM3, DA3 and OCR share GPU 7 under per-process memory caps sized for these limits: inputs are
# downscaled to a 1536 px longer side and pose takes at most 4 frames (measured peaks: DA3 28.8 GB
# for 4-frame pose, SAM3 6.8 GB with 132 masks, OCR 6 GB fixed; 41.7 GB with all running at once).
MAX_SIDE = int(os.environ.get("DEMO_MAX_IMAGE_SIDE", "1536"))
MAX_POSE_FRAMES = int(os.environ.get("DEMO_MAX_POSE_FRAMES", "4"))
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
OUT_DIR.mkdir(parents=True, exist_ok=True)

GPU_CAPABILITIES = {"grounding": "sam3_segment", "ocr": "ocr", "depth": "depth_estimation",
                    "camera_pose": "camera_trajectory", "zoom": "zoom_in_image_by_bbox"}
SEARCH_CAPABILITIES = {"text_search": "serper_text_search", "web_visit": "serper_webpage_visit",
                       "image_search": "serper_image_search"}
LABELS = {"Visual_Grounding_Tool": "Visual Grounding", "OCR_Tool": "OCR", "Depth_Estimation_Tool": "Depth Estimation",
          "Camera_Trajectory_Tool": "Camera Trajectory", "Zoom_In_Tool": "Zoom-in",
          "Python_Coding_Agent_Tool": "Python Coding Agent", "Text_Search_Tool": "Text Search",
          "Image_Search_Tool": "Image Search", "Webpage_Visit_Tool": "Webpage Visit"}


# ---------------------------------------------------------------- visitor model profiles
# The package registry holds exact paper profiles only. A visitor names an arbitrary model, so each
# run registers a private profile derived from the matching protocol before validation.
_PROFILES = {}
_registry_load_profile = ovh_models.load_profile


def _load_profile(alias):
    if alias in _PROFILES:
        return copy.deepcopy(_PROFILES[alias])
    return _registry_load_profile(alias)


ovh_models.load_profile = _load_profile


def _is_reasoning_openai(model):
    return bool(re.match(r"^(o\d|gpt-5|gpt-6)", model.lower()))


def is_qwen3_vl(model):
    """Qwen3-VL models get the paper's Qwen prompt and sampling; every other model gets openai_v1."""
    return bool(re.search(r"qwen3[-_.]?vl", model.lower()))


def visitor_model(provider, base_url, api_key, model):
    """Register a run-private profile and return its services.models entry."""
    alias = f"demo-{uuid.uuid4().hex}"
    if provider == OPENAI:
        profile = _registry_load_profile("gpt-6-luna")
        profile["model_id"] = model
        entry = {"alias": alias, "base": OPENAI_BASE, "key": api_key, "max_tokens": 16000}
        if _is_reasoning_openai(model):
            entry["reasoning_effort"] = "medium"
        else:
            profile["allowed_options"] = ["max_tokens"]
            entry["max_tokens"] = 4096
    else:
        qwen = is_qwen3_vl(model)
        if qwen:
            # The paper's Qwen3-VL profile (answer tags, continuation when the tag is missing, final
            # text-only request), minus local tokenizer counting and raw trace export.
            profile = _registry_load_profile("qwen3-vl-8b-instruct")
            profile.update(model_id=model, context_policy="provider_enforced")
            profile["allowed_options"] = [o for o in profile["allowed_options"] if o != "return_token_ids"]
            for key in ("raw_trace_format", "raw_trace_tokenizer_revision"):
                profile.pop(key, None)
        else:
            profile = {"model_id": model, "prompt_bundle": "openai_v1",
                       "adapter": "chat_completions", "final_answer": "answer_tag_or_text",
                       "context_policy": "provider_enforced", "extra_final_request": False,
                       "continue_empty_answer": False, "append_final_message": False,
                       "context_error_fallback": True,
                       "allowed_options": ["max_tokens", "temperature", "top_p"]}
        entry = {"alias": alias, "base": base_url, "key": api_key or "empty", "max_tokens": 12800 if qwen else 8192}
        # Qwen3-VL paper sampling; other models keep provider defaults
        entry.update({"temperature": 0.7, "top_p": 0.8, "top_k": 20, "repetition_penalty": 1.0,
                      "presence_penalty": 1.5} if qwen else {})
    # Always end with a text-only request on the last iteration, so a run that uses every turn on
    # tools still returns an answer (the paper's GPT profile leaves this off).
    profile["extra_final_request"] = True
    _PROFILES[alias] = profile
    entry.update(timeout=300, retry=2)
    return entry


def check_endpoint(provider, base_url):
    """Reject endpoints a public server should not call on a visitor's behalf."""
    if provider == OPENAI:
        return
    url = urlparse(base_url)
    if url.scheme not in ({"http", "https"} if ALLOW_PRIVATE else {"https"}) or not url.hostname:
        raise gr.Error("Enter an https base URL for your endpoint.")
    if url.username or url.password or url.query or url.fragment:
        raise gr.Error("The base URL must not contain credentials, a query or a fragment.")
    if ALLOW_PRIVATE:
        return
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(url.hostname, url.port or 443)}
    except OSError:
        raise gr.Error(f"Could not resolve {url.hostname}.")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise gr.Error("The endpoint must be publicly reachable; private and local addresses are not allowed.")


def validate_settings(provider, base_url, api_key, model):
    provider, base_url, api_key, model = (provider or "").strip(), (base_url or "").strip(), (api_key or "").strip(), (model or "").strip()
    if provider not in (OPENAI, COMPAT):
        raise gr.Error("Choose a provider.")
    if not model or len(model) > 200:
        raise gr.Error("Enter the model name.")
    if provider == OPENAI and not api_key:
        raise gr.Error("An OpenAI API key is required.")
    check_endpoint(provider, base_url)
    return provider, base_url, api_key, model


# ---------------------------------------------------------------- deployment tools
def router_tools():
    """Concrete tool names the shared router serves, or an empty set when it is down."""
    try:
        response = requests.get(f"{ROUTER_URL}/tools", timeout=5)
        response.raise_for_status()
        return set(response.json())
    except Exception as exc:
        log.warning("router unavailable: %s", exc)
        return set()


def deployed_gpu_capabilities():
    """GPU/zoom capabilities whose backends the router currently serves."""
    served = router_tools()
    if not served:
        return {}
    from openvlharness.bootstrap import PAPER_CAPABILITIES  # noqa: F401  (registry import check)
    import importlib
    selected = {}
    for name, backend in GPU_CAPABILITIES.items():
        cls = importlib.import_module(f"openvlharness.capabilities.{name}").Capability
        if cls.backends[backend] in served:
            selected[name] = backend
    return selected


def tools_note():
    gpu = deployed_gpu_capabilities()
    names = [LABELS[n] for n in ("Visual_Grounding_Tool", "OCR_Tool", "Depth_Estimation_Tool",
             "Camera_Trajectory_Tool", "Zoom_In_Tool") if _capability_name(n) in gpu]
    names.append("Python Coding Agent")
    names += ["Text Search", "Webpage Visit"] + (["Image Search"] if IMAGE_SEARCH else [])
    return f"**Tools on this deployment:** {', '.join(names)} (web tools need a Serper key)"


def _capability_name(public):
    return {"Visual_Grounding_Tool": "grounding", "OCR_Tool": "ocr", "Depth_Estimation_Tool": "depth",
            "Camera_Trajectory_Tool": "camera_pose", "Zoom_In_Tool": "zoom"}[public]


# ---------------------------------------------------------------- per-run agent
class LocalToolClient:
    """In-process stand-in for the router's /execute, for per-run tool instances."""
    def __init__(self, tool):
        self.tool = tool

    def execute(self, tool_name, args, *, tool_call_id):
        try:
            result = self.tool.execute(**args)
            extra = {}
            if isinstance(result, ServiceResult):
                extra, result = result.metadata, result.value
            result, meta = _normalize_result_payload(result)
            meta.update(extra)
            return _build_success_payload(tool_name, tool_call_id, result, meta)
        except Exception as exc:
            code = "tool_execution_error"
            return _build_error_payload(tool_name, tool_call_id, code, str(exc),
                                        {"exception_type": type(exc).__name__, "client_error": isinstance(exc, ToolArgumentError)})


class VisitorSummarizer(AuxiliaryModel):
    """The search/webpage summarizer, running on the visitor's orchestrator model.

    AuxiliaryModel always requests medium reasoning on Responses and disables Qwen template
    thinking on Chat Completions. Non-reasoning OpenAI models reject the reasoning field, and
    the template flag only applies to Qwen3-VL servers, so both are sent only where they apply.
    """
    def generate(self, prompt_or_messages, system_prompt=None, **generation_kwargs):
        if self.adapter.protocol == "responses" and _is_reasoning_openai(self.model):
            return super().generate(prompt_or_messages, system_prompt, **generation_kwargs)
        if self.adapter.protocol == "chat_completions" and is_qwen3_vl(self.model):
            return super().generate(prompt_or_messages, system_prompt, **generation_kwargs)
        messages = ([{"role": "user", "content": prompt_or_messages}]
                    if isinstance(prompt_or_messages, str) else copy.deepcopy(prompt_or_messages))
        if system_prompt and not any(m.get("role") == "system" for m in messages):
            messages.insert(0, {"role": "system", "content": system_prompt})
        budget = generation_kwargs.pop("max_tokens", 8192)
        temperature = generation_kwargs.pop("temperature", 0.0)
        top_p = generation_kwargs.pop("top_p", 1.0)
        if generation_kwargs:
            raise ValueError(f"Unsupported auxiliary generation options: {sorted(generation_kwargs)}")
        if self.adapter.protocol == "responses":
            payload = self.adapter.payload([self.adapter.encode_message(m) for m in messages],
                                           options={"max_tokens": budget})
            response = self.client.responses.create(**payload).model_dump()
        else:
            payload = self.adapter.payload(messages, options={"max_tokens": budget, "temperature": temperature, "top_p": top_p})
            response = self.client.chat.completions.create(**payload).model_dump()
        return self.adapter.parse(response, 0)[0]


def build_run_agent(provider, base_url, api_key, model, serper_key):
    """Build a validated MainAgent whose model, coding and search use this visitor's settings."""
    orchestrator = visitor_model(provider, base_url, api_key, model)
    tools = {**deployed_gpu_capabilities(),
             "coding": {"generator": "python_coding_agent", "executor": "python_executor_local"}}
    tools = {name: (value if isinstance(value, dict) else {"backend": value}) for name, value in tools.items()}
    web = bool(serper_key)
    if web:
        for name, backend in SEARCH_CAPABILITIES.items():
            if name != "image_search" or IMAGE_SEARCH:
                tools[name] = {"backend": backend}
    service_tools = {"python_coding_agent": {"model_service": "orchestrator", "context": "fresh"},
                     "python_executor_local": {"transport": "local", "timeout_seconds": 30},
                     "zoom_in_image_by_bbox": {}}
    for name, settings in tools.items():
        backend = settings.get("backend")
        if backend in ("sam3_segment", "ocr", "depth_estimation", "camera_trajectory"):
            # Raw URLs are injected by the router; the agent side only needs a syntactically valid base.
            service_tools[backend] = {"server_url": "http://router-managed"}
        elif backend and backend.startswith("serper_"):
            # search summarization and webpage extraction use the visitor's model too
            service_tools[backend] = {"model_service": "orchestrator"}
    models = {"orchestrator": orchestrator}
    config = load_agent_config({
        "agent_name": "MainAgent", "agent_config_version": "demo_v1",
        "agent": {"model_service": "orchestrator", "max_iterations": MAX_ITERATIONS, "tool_choice": "auto"},
        "memory": {"emit_policy": "always", "modules": [{"name": "image"}, {"name": "tool_context"},
                   {"name": "url", "webpage_env_update_limit": 20}]},
        "capabilities": {"registries": ["paper"], "tools": tools},
        "services": {"client": {"base_url": ROUTER_URL, "timeout_seconds": 600, "retry": 2},
                     "server": {"registration": "configured_only"}, "tools": service_tools, "models": models},
    })
    adapter = ModelAdapter(config["services"]["models"]["orchestrator"])
    capabilities = build_capabilities(config)
    from openvlharness.services.tools.python_coding_agent.tool import Python_Coding_Agent_Tool
    for capability in capabilities.values():
        if capability.backend == "python_coding_agent":
            coder = ModelAdapter({**config["services"]["models"]["orchestrator"], "timeout": 600})
            capability.client = LocalToolClient(Python_Coding_Agent_Tool(model_adapter=coder))
        elif capability.backend.startswith("serper_"):
            import importlib
            module = importlib.import_module(f"openvlharness.services.tools.{capability.backend}.tool")
            summarizer = VisitorSummarizer({**orchestrator, "timeout": 600})
            tool = getattr(module, capability.concrete_name)(llm_engine=summarizer)
            tool._client = SerperClient(api_key=serper_key)
            capability.client = LocalToolClient(tool)
    from importlib.resources import files
    prompts = files("openvlharness.prompts")
    system = prompts.joinpath(adapter.profile["prompt_bundle"] + "_system.txt").read_text()
    prefix = prompts.joinpath("user_prefix.txt").read_text()
    agent = MainAgent(adapter, capabilities, memory_factory(config["memory"]), system, prefix,
                      max_iterations=MAX_ITERATIONS, tool_choice="auto")
    return agent, orchestrator["alias"]


# ---------------------------------------------------------------- live trace
class Job:
    def __init__(self, job_id):
        self.id, self.dir = job_id, OUT_DIR / job_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.chat, self.status, self.done, self.created = [], None, False, time.time()
        self.lock, self.images = threading.Lock(), 0

    def add(self, content, title=None):
        message = {"role": "assistant", "content": content}
        if title:
            message["metadata"] = {"title": title}
        with self.lock:
            self.chat.append(message)

    def set_status(self, text):
        with self.lock:
            self.status = text

    def snapshot(self):
        with self.lock:
            chat = list(self.chat)
            if self.status and not self.done:
                chat.append({"role": "assistant", "content": self.status, "metadata": {"title": "⏳ Working"}})
            return {"chat": chat, "done": self.done}

    def save_image(self, url):
        match = re.match(r"data:image/(\w+);base64,(.*)", url or "", re.DOTALL)
        if not match:
            return None
        ext = {"jpeg": "jpg"}.get(match.group(1), match.group(1))
        with self.lock:
            self.images += 1
            path = self.dir / f"tool_{self.images:03d}.{ext}"
        path.write_bytes(base64.b64decode(match.group(2)))
        return str(path)


JOBS, JOBS_LOCK = {}, threading.Lock()
RUN_SLOTS = threading.BoundedSemaphore(MAX_RUNS)


def _strip_answer(text):
    return re.sub(r"<answer>.*?</answer>", "", text or "", flags=re.DOTALL | re.IGNORECASE).strip()


def instrument(agent, job):
    """Wrap model parsing and capability invocation so the job sees each step as it happens."""
    adapter = agent.adapter
    request, parse = adapter.request, adapter.parse

    def traced_request(*args, **kwargs):
        job.set_status("Waiting for the model…")
        try:
            return request(*args, **kwargs)
        finally:
            job.set_status(None)

    def traced_parse(response, turn_idx, **kwargs):
        text, calls, original = parse(response, turn_idx, **kwargs)
        thought = _strip_answer(text)
        # an untagged final reply is the answer itself; show it once, as the answer
        if thought and (calls or thought != adapter.final_answer(text).strip()):
            job.add(thought)
        return text, calls, original

    adapter.request, adapter.parse = traced_request, traced_parse
    for capability in agent.capabilities.values():
        invoke = capability.invoke

        def traced_invoke(call, memory, _invoke=invoke, _name=capability.name):
            job.add("```json\n" + json.dumps(call.arguments, ensure_ascii=False, indent=2) + "\n```", title=f"🛠️ {_name}")
            job.set_status(f"Running {LABELS.get(_name, _name)}…")
            frames = call.arguments.get("image_ids") if _name == "Camera_Trajectory_Tool" else None
            try:
                if isinstance(frames, list) and len(frames) > MAX_POSE_FRAMES:
                    result = failure(call, "invalid_tool_arguments",
                                     f"This demo accepts at most {MAX_POSE_FRAMES} frames per camera trajectory call.")
                else:
                    result = _invoke(call, memory)
            finally:
                job.set_status(None)
            if result.ok:
                text = "\n".join(part.get("text", "") for part in result.evidence if part.get("type") == "text").strip()
                images = [part.get("image_url", {}).get("url") for part in result.evidence if part.get("type") == "image_url"]
            else:
                text, images = "Error: " + failure_text(result.payload or {"error": result.error}), []
            job.add(text or "(no text output)", title="📋 Result")
            for url in images:
                path = job.save_image(url)
                if path:
                    job.add({"path": path, "mime_type": "image/" + path.rsplit(".", 1)[-1]})
            return result

        capability.invoke = traced_invoke


def run_job(job, agent, alias, inputs, question):
    try:
        instrument(agent, job)
        message = [{"type": "image", "value": path} for path in inputs] + [{"type": "text", "value": question}]
        result = agent.generate(message, task_id=job.id)
        error = result["extra_records"]["trajectory"].get("error")
        prediction = result.get("prediction")
        if error or not prediction or prediction == MainAgent.fail_msg:
            job.add(f"**Answer:** ⚠️ {error or 'The model did not return an answer.'}")
        else:
            job.add(f"**Answer:** {prediction}")
    except Exception as exc:
        log.exception("run %s failed", job.id)
        job.add(f"**Answer:** ⚠️ {type(exc).__name__}: {exc}")
    finally:
        _PROFILES.pop(alias, None)
        job.done = True
        job.set_status(None)
        RUN_SLOTS.release()


def _gc_jobs():
    cutoff = time.time() - JOB_TTL
    with JOBS_LOCK:
        for job_id in [j for j, job in JOBS.items() if job.done and job.created < cutoff]:
            JOBS.pop(job_id, None)


# ---------------------------------------------------------------- endpoints
def _file_path(item):
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return item.get("path")
    return getattr(item, "path", None)


def prepare_input(path, job_dir, index):
    """Apply EXIF orientation and downscale to MAX_SIDE; returns the path given to the agent."""
    try:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
    except Exception:
        raise gr.Error("One of the files could not be read as an image.")
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    out = Path(job_dir) / f"input_{index + 1}.png"
    image.save(out)
    return str(out)


def start_run(message, provider, base_url, api_key, model, serper_key):
    provider, base_url, api_key, model = validate_settings(provider, base_url, api_key, model)
    message = message or {}
    question = (message.get("text") or "").strip()
    paths = [p for p in (_file_path(f) for f in message.get("files") or []) if p]
    if not paths:
        raise gr.Error("Add at least one image.")
    if len(paths) > MAX_IMAGES:
        raise gr.Error(f"At most {MAX_IMAGES} images per question.")
    if not question or len(question) > MAX_QUESTION:
        raise gr.Error("Enter a question (up to 4000 characters).")
    for path in paths:
        if Path(path).suffix.lower() not in IMAGE_EXT:
            raise gr.Error("Only image files are accepted.")
        if os.path.getsize(path) > MAX_BYTES:
            raise gr.Error("Each image must be 10 MB or smaller.")
    if not RUN_SLOTS.acquire(blocking=False):
        raise gr.Error("The demo is busy with other runs. Please try again in a minute.")
    try:
        agent, alias = build_run_agent(provider, base_url, api_key, model, (serper_key or "").strip())
    except gr.Error:
        RUN_SLOTS.release()
        raise
    except Exception as exc:
        RUN_SLOTS.release()
        raise gr.Error(f"Could not configure the agent: {exc}")
    _gc_jobs()
    job = Job(uuid.uuid4().hex)
    try:
        paths = [prepare_input(path, job.dir, i) for i, path in enumerate(paths)]
    except gr.Error:
        _PROFILES.pop(alias, None)
        RUN_SLOTS.release()
        raise
    with JOBS_LOCK:
        JOBS[job.id] = job
    log.info("run %s: provider=%s model=%s images=%d web=%s", job.id, provider, model, len(paths), bool(serper_key))
    threading.Thread(target=run_job, args=(job, agent, alias, paths, question), daemon=True).start()
    return job.id


def poll(job_id):
    with JOBS_LOCK:
        job = JOBS.get((job_id or "").strip())
    if job is None:
        raise gr.Error("Unknown or expired run.")
    return job.snapshot()


def test_connection(provider, base_url, api_key, model):
    try:
        provider, base_url, api_key, model = validate_settings(provider, base_url, api_key, model)
    except gr.Error as exc:
        return f"❌ {exc.message}"
    entry = visitor_model(provider, base_url, api_key, model)
    try:
        adapter = ModelAdapter({**entry, "retry": 0, "timeout": 60})
        options = {"max_tokens": 256}
        if adapter.protocol == "responses" and _is_reasoning_openai(model):
            options["reasoning_effort"] = "low"
        messages = [adapter.encode_message({"role": "user", "content": "Reply with the single word OK."})]
        text, _, _ = adapter.parse(adapter.request(messages, options=options), 0)
        return f"✅ Connected to **{model}**" + (f" · replied `{text.strip()[:40]}`" if text.strip() else "")
    except Exception as exc:
        detail = str(exc).replace(api_key, "***") if api_key else str(exc)
        return f"❌ {detail[:400]}"
    finally:
        _PROFILES.pop(entry["alias"], None)


# ---------------------------------------------------------------- UI (also what the HF Space iframes)
def ui_run(message, provider, base_url, api_key, model, serper_key):
    job_id = start_run(message, provider, base_url, api_key, model, serper_key)
    while True:
        state = poll(job_id)
        yield state["chat"]
        if state["done"]:
            return
        time.sleep(1)


with gr.Blocks(title="OpenVLHarness demo") as demo:
    gr.Markdown("## OpenVLHarness demo\nAsk a question about up to four images. The agent loop and tools run on "
                "our server; the orchestrator is your model (OpenAI, or an OpenAI-compatible endpoint with tool calling).")
    note = gr.Markdown()
    with gr.Row():
        with gr.Column(scale=2):
            message = gr.MultimodalTextbox(file_types=["image"], file_count="multiple",
                                           placeholder="Upload images and ask a question", label="Question")
            provider = gr.Radio([OPENAI, COMPAT], value=OPENAI, label="Provider")
            base_url = gr.Textbox(label="Base URL (OpenAI-compatible only)", placeholder="https://your-server.example.com/v1")
            model = gr.Textbox(label="Model", value="gpt-6.1-sol")
            api_key = gr.Textbox(label="Model API key", type="password")
            serper_key = gr.Textbox(label="Serper key (optional, enables web search)", type="password")
            with gr.Row():
                test_btn = gr.Button("Test connection")
                run_btn = gr.Button("Run", variant="primary")
            test_out = gr.Markdown()
        with gr.Column(scale=3):
            chat = gr.Chatbot(type="messages", label="Trajectory", height=720)
    demo.load(tools_note, None, note, api_name="tools_note")
    test_btn.click(test_connection, [provider, base_url, api_key, model], test_out, api_name="test_connection")
    run_btn.click(ui_run, [message, provider, base_url, api_key, model, serper_key], chat, api_name="run_ui")
    # Endpoints used by the project page; hidden components carry their values.
    job_box, poll_out = gr.Textbox(visible=False), gr.JSON(visible=False)
    gr.Button(visible=False).click(start_run, [message, provider, base_url, api_key, model, serper_key], job_box,
                                   api_name="start_run", concurrency_limit=MAX_RUNS * 2)
    gr.Button(visible=False).click(poll, job_box, poll_out, api_name="poll", concurrency_limit=None)


if __name__ == "__main__":
    demo.queue(default_concurrency_limit=MAX_RUNS * 2).launch(
        server_name=os.environ.get("DEMO_HOST", "127.0.0.1"), server_port=int(os.environ.get("DEMO_PORT", "7860")),
        allowed_paths=[str(OUT_DIR)], show_error=True)
