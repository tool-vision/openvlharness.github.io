# Live demo server

Backend for the project page's interactive demo (`static/js/demo.js`). It runs the released
[OpenVLHarness](https://github.com/tool-vision/mini-vlm-toolkit/tree/opensource) agent
(`openvlharness` package) behind a small Gradio app.

## How it works

- **The visitor's model is the only LLM.** It orchestrates the agent, writes the Python for the
  coding tool, and summarizes text-search results and webpages. The server hosts no language model.
- **Prompts follow the paper.** Qwen3-VL models (any model name matching `qwen3-vl`) get the paper's
  Qwen prompt, sampling, and answer handling. Every other model gets the generic `openai_v1` prompt.
  OpenAI models use the Responses API; OpenAI-compatible endpoints use Chat Completions.
- **The GPU perception tools run on one GPU.** SAM 3, Depth Anything 3 (depth and camera pose) and
  PaddleOCR-VL sit behind one tool router (`configs/router_gpu.yaml`). The router's per-backend
  concurrency gates therefore apply to every visitor.
- **Search and coding run inside the app**, with one instance per run. Search uses the visitor's
  Serper key and model; coding uses the visitor's model. Keys exist only in that run's objects and
  are never logged or stored.

The page calls four endpoints; their names and parameters are the contract with `demo.js`.

| Endpoint | Input | Output |
| --- | --- | --- |
| `/tools_note` | — | Markdown: `**Tools on this deployment:** …` |
| `/test_connection` | `provider, base_url, api_key, model` | Markdown status |
| `/start_run` | `message {text, files}, provider, base_url, api_key, model, serper_key` | job id |
| `/poll` | `job_id` | `{chat: [Gradio chat messages], done}` |

The app also serves a regular Gradio UI at `/`, which the Hugging Face Space embeds.

## Sharing one 48 GB GPU

These are peak per-process memory measurements on an RTX A6000 (CUDA context included):

| Service | Worst case at the demo limits | Hard cap |
| --- | --- | --- |
| SAM 3 | 6.8 GB (132 masks, 1536 px) | `GPU_MEM_FRACTION=0.17` |
| DA3 | 28.8 GB (camera pose, 4 frames at 1536 px); single-image depth 13 GB | `0.63` |
| PaddleOCR-VL (vLLM) | 6.0 GB, fixed reservation | `--gpu-memory-utilization 0.12` |

With all three running their worst cases at once, the GPU peaked at 41.7 of 48 GB.

Two demo limits keep the services within those numbers:

- **Uploads are downscaled to a 1536 px longer side** (`DEMO_MAX_IMAGE_SIDE`). DA3 processes images
  at full resolution, and pose memory grows with frames × resolution. Seven frames at 2048 px need
  more than 40 GB.
- **Camera-trajectory calls take at most 4 frames** (`DEMO_MAX_POSE_FRAMES`).

`gpu_capped.py` sets `torch.cuda.set_per_process_memory_fraction` before a service loads its
model. A request that still exceeds its cap fails with a CUDA OOM inside that process only, and the
other services keep running. Start OCR first (`scripts/start_gpu7.sh`): vLLM checks free memory at
startup.

## Running it

`OVH_DEPLOY` is a deployment directory containing:

- `envs/{sam3,da3,vllm,router}`: Python environments. Install the raw services with the
  installers in `src/openvlharness/services/tools/*/install.sh`. The router environment needs
  `openvlharness[server]` and `gradio>=5.30,<6`, which matches the page's `@gradio/client` 1.19.1.
- `cache/huggingface`: the pinned SAM 3, DA3 and PaddleOCR-VL checkpoints.
- `logs/`: service logs.

```bash
export OVH_DEPLOY=/path/to/deploy
scripts/start_gpu7.sh                                         # OCR :8085, SAM3 :8086, DA3 :8087 on GPU 7
nohup scripts/run_router.sh > $OVH_DEPLOY/logs/router.log 2>&1 &  # tool router :8101
nohup scripts/run_demo.sh > $OVH_DEPLOY/logs/demo.log 2>&1 &      # demo app :7860
```

To make the app public, expose port 7860 and put the public URL in the Hugging Face Space page. The
project page reads the backend URL from the Space page at load time. For local testing, open the
project page with `?demo_server=http://127.0.0.1:7860`. Then use `DEMO_ALLOW_PRIVATE_ENDPOINTS=1`
so the app accepts a local model endpoint. Keep it at `0` in public: endpoints must then be public
`https` addresses.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEMO_TOOL_SERVER_URL` | `http://127.0.0.1:8101` | Tool router |
| `DEMO_MAX_RUNS` | `4` | Concurrent runs; further runs are refused until a slot frees |
| `DEMO_MAX_ITERATIONS` | `15` | Agent turns. The last turn is a text-only request for the answer |
| `DEMO_MAX_IMAGE_SIDE` / `DEMO_MAX_POSE_FRAMES` | `1536` / `4` | GPU memory limits above |
| `DEMO_IMAGE_SEARCH` | `0` | Reverse image search. It needs S3 or GCS upload credentials in the app's environment |
| `DEMO_OUTPUT_DIR` | `/tmp/ovh-demo` | Inputs and tool images served to the page |

The coding tool executes model-written Python in a subprocess on the server. Its timeout is not a
security sandbox, so run the demo on a machine and account with no access to sensitive data.
