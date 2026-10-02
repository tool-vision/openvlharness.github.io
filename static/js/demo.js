/* Live demo client. Talks to the OpenVLHarness Gradio app (agent loop + GPU tools) that the
   Hugging Face Space fronts. The app's public URL is a Cloudflare quick tunnel that can change, so
   it is read from the Space page at load time. The visitor's model settings and keys go only into
   the request (Gradio's /run_agent), never into storage. */
import { Client, prepare_files, upload } from 'https://cdn.jsdelivr.net/npm/@gradio/client@1.19.1/dist/index.min.js';

const SPACE_PAGE = 'https://bryanzhou008-openvlharness-demo.static.hf.space/index.html';
const SPACE_URL = 'https://huggingface.co/spaces/bryanzhou008/OpenVLHarness-Demo';
const MAX_IMAGES = 4, MAX_BYTES = 10 * 1024 * 1024;
const COMPAT = 'OpenAI-compatible (vLLM / SGLang)';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#dm');
if (!root) throw new Error('demo section missing');

const TOOL_ICON = {
  Visual_Grounding_Tool: ['i-ground', 'Visual Grounding'], SAM3_Grounding_Tool: ['i-ground', 'Visual Grounding'],
  OCR_Tool: ['i-ocr', 'OCR'], Depth_Estimation_Tool: ['i-depth', 'Depth Estimation'],
  Camera_Trajectory_Tool: ['i-camera', 'Camera Trajectory'], Zoom_In_Tool: ['i-zoom', 'Zoom-in'], Crop_Tool: ['i-zoom', 'Crop'],
  Python_Coding_Agent_Tool: ['i-code', 'Python Coding Agent'], Text_Search_Tool: ['i-tsearch', 'Text Search'],
  Image_Search_Tool: ['i-isearch', 'Image Search'], Webpage_Visit_Tool: ['i-web', 'Webpage Visit'],
};
// Samples: the recorded examples whose inputs fit the demo's limit, with their original questions.
const SEARCH_TAGS = ['text-search', 'image-search', 'webpage-visit'];
const SAMPLES = (window.OVH_EXAMPLES || []).filter(e => e.inputs.length <= MAX_IMAGES).map(e => ({
  label: e.dataset, imgs: e.inputs.map(x => x.src), q: e.question.trim(),
  web: e.tags.some(t => SEARCH_TAGS.includes(t)), n: e.inputs.length,
}));

const OPENAI_MODEL = 'gpt-6-luna';
const S = { client: null, base: null, files: [], provider: 'OpenAI', job: null, running: false };
const R = {
  status: $('#dmStatus'), form: $('#dmForm'), drop: $('#dmDrop'), input: $('#dmFiles'), thumbs: $('#dmThumbs'), samples: $('#dmSamples'),
  q: $('#dmQ'), prov: $('#dmProv'), baseW: $('#dmBaseW'), baseIn: $('#dmBase'), model: $('#dmModel'), key: $('#dmKey'), serper: $('#dmSerper'),
  test: $('#dmTest'), testOut: $('#dmTestOut'), run: $('#dmRun'), stop: $('#dmStop'), runNote: $('#dmRunNote'), steps: $('#dmSteps'), meta: $('#dmMeta'),
};

function setStatus(kind, html) { R.status.dataset.k = kind; $('.txt', R.status).innerHTML = html; }

/* ---------------------------------------------------------------- connection */
async function discover() {
  const r = await fetch(SPACE_PAGE, { cache: 'no-store' });
  const m = (await r.text()).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m) throw new Error('no server URL on the Space page');
  return m[0];
}
async function connect() {
  try {
    S.base = await discover();
    S.client = await Client.connect(S.base, { events: ['data', 'status'] });
    let note = '';
    try { note = (await S.client.predict('/tools_note', {})).data[0] || ''; } catch (e) { /* optional */ }
    const tools = (note.match(/\*\*Tools on this deployment:\*\*\s*([^*\n]+)/) || [])[1];
    setStatus('ok', `Demo server online${tools ? ` · ${esc(tools.replace(/\s*\(.*$/, '').trim())}` : ''}`);
  } catch (e) {
    S.client = null;
    setStatus('off', `Demo server unreachable. It may be restarting; try again in a few minutes or use the <a href="${SPACE_URL}" target="_blank" rel="noopener">Hugging Face Space</a>.`);
  }
}

/* ---------------------------------------------------------------- inputs */
function renderThumbs() {
  R.thumbs.innerHTML = S.files.map((f, i) => `<figure><img src="${f.url}" alt="input_image_${i + 1}"><figcaption>input_image_${i + 1}</figcaption><button type="button" data-i="${i}" aria-label="Remove image ${i + 1}">×</button></figure>`).join('');
}
// the server validates uploads by file extension, so every file needs a name like input_1.jpg
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };
function named(f, i) {
  const ext = EXT[f.type] || ((f.name || '').match(/\.(\w+)$/) || [])[1] || 'jpg';
  return new File([f], `input_${i + 1}.${ext}`, { type: f.type || 'image/jpeg' });
}
function addFiles(list) {
  for (const f of list) {
    if (!f.type.startsWith('image/')) continue;
    if (f.size > MAX_BYTES) { R.runNote.textContent = `${f.name} is larger than 10 MB.`; continue; }
    if (S.files.length >= MAX_IMAGES) { R.runNote.textContent = 'At most 4 images per question.'; break; }
    S.files.push({ blob: named(f, S.files.length), url: URL.createObjectURL(f) });
  }
  renderThumbs();
}
R.input.addEventListener('change', () => { addFiles(R.input.files); R.input.value = ''; });
['dragenter', 'dragover'].forEach(t => R.drop.addEventListener(t, e => { e.preventDefault(); R.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => R.drop.addEventListener(t, e => { e.preventDefault(); R.drop.classList.remove('over'); }));
R.drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
R.thumbs.addEventListener('click', e => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  const [f] = S.files.splice(+b.dataset.i, 1); URL.revokeObjectURL(f.url); renderThumbs();
});
R.samples.innerHTML = SAMPLES.map((s, i) => `<button type="button" class="dm-sample" data-i="${i}" title="${esc(s.q.split('\n')[0])}"><img src="${s.imgs[0].replace(/[^/]+$/, 'thumb.webp')}" alt="" loading="lazy"><span>${esc(s.label)}${s.n > 1 ? ` <em class="x">×${s.n}</em>` : ''}${s.web ? ' <em>web</em>' : ''}</span></button>`).join('');
R.samples.addEventListener('click', async e => {
  const b = e.target.closest('.dm-sample'); if (!b) return;
  const s = SAMPLES[+b.dataset.i];
  S.files.forEach(f => URL.revokeObjectURL(f.url)); S.files = [];
  for (const src of s.imgs) {
    const blob = await (await fetch(src)).blob();
    S.files.push({ blob: named(new File([blob], src.split('/').pop(), { type: blob.type || 'image/jpeg' }), S.files.length), url: URL.createObjectURL(blob) });
  }
  R.q.value = s.q; renderThumbs();
});

R.prov.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  S.provider = b.dataset.v;
  R.prov.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b));
  const compat = S.provider === COMPAT;
  R.baseW.hidden = !compat;
  // OpenAI keeps its default model; a compatible endpoint starts empty (the user names their own server's model)
  if (compat && R.model.value === OPENAI_MODEL) R.model.value = '';
  if (!compat && !R.model.value) R.model.value = OPENAI_MODEL;
  R.key.placeholder = compat ? 'leave empty if none' : 'sk-…';
});
function settings() {
  return { provider: S.provider, base_url: S.provider === COMPAT ? R.baseIn.value.trim() : '', api_key: R.key.value.trim(), model: R.model.value.trim() };
}
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
R.test.addEventListener('click', async () => {
  if (!S.client) return;
  R.testOut.textContent = 'Testing…';
  try { R.testOut.innerHTML = md((await S.client.predict('/test_connection', settings())).data[0]); }
  catch (e) { R.testOut.textContent = errText(e); }
});
function errText(e) { return (e && (e.message || e.title)) || 'Request failed.'; }

/* ---------------------------------------------------------------- trajectory rendering */
function fileUrl(c) {
  const f = c && (c.file || c);
  const u = f && (f.url || (f.path ? `${S.base}/gradio_api/file=${f.path}` : null));
  return u && !/^https?:/.test(u) ? `${S.base}${u.startsWith('/') ? '' : '/'}${u}` : u;
}
function stripFence(t) { const m = String(t).match(/```(?:json)?\n([\s\S]*?)\n```/); return m ? m[1] : String(t); }
function toSteps(chat) {
  // Gradio chat messages -> [{kind:'thought'|'call'|'result'|'answer'|'status', ...}] ; images attach to the previous result
  const out = []; let seenUserText = false;
  for (const m of chat || []) {
    const title = m.metadata && m.metadata.title || '';
    const c = m.content;
    if (m.role === 'user') { seenUserText = true; continue; }
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      const url = fileUrl(c); if (!url) continue;
      const last = out[out.length - 1];
      if (last && (last.kind === 'result' || last.kind === 'images')) (last.imgs = last.imgs || []).push(url);
      else out.push({ kind: 'images', imgs: [url] });
      continue;
    }
    const text = typeof c === 'string' ? c : '';
    if (title.startsWith('🛠️')) out.push({ kind: 'call', tool: title.replace('🛠️', '').trim(), args: stripFence(text) });
    else if (title.startsWith('📋')) out.push({ kind: 'result', text });
    else if (title.startsWith('⏳')) out.push({ kind: 'status', text });
    else if (text.startsWith('**Answer:**')) {
      const t = text.replace('**Answer:**', '').trim();
      out.push(t.startsWith('⚠️') ? { kind: 'error', text: t.replace('⚠️', '').trim() } : { kind: 'answer', text: t });
    }
    else if (text.trim()) { const t = text.replace(/<\/?(thinking|think|answer)>/g, '').trim(); if (t) out.push({ kind: 'thought', text: t }); }
  }
  return out;
}
const clip = (t, n) => (t = String(t || '')).length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + ' …' : t;
function renderTrace(chat, done) {
  const steps = toSteps(chat);
  let n = 0;
  const html = steps.map(s => {
    if (s.kind === 'thought') return `<li class="dm-st th"><p>${esc(clip(s.text, 900))}</p></li>`;
    if (s.kind === 'call') {
      n++;
      const [ic, name] = TOOL_ICON[s.tool] || ['i-code', s.tool];
      return `<li class="dm-st call"><div class="dm-st-h"><span class="dm-n">${n}</span><svg aria-hidden="true"><use href="#${ic}"/></svg><b>${esc(name)}</b><code>${esc(s.tool)}</code></div><pre class="dm-args">${esc(clip(s.args, 1200))}</pre></li>`;
    }
    if (s.kind === 'result' || s.kind === 'images') {
      const long = s.text && s.text.length > 600;
      return `<li class="dm-st res">${s.imgs ? `<div class="dm-imgs">${s.imgs.map(u => `<img src="${esc(u)}" alt="tool output" loading="lazy" data-zoom>`).join('')}</div>` : ''}${s.text ? (long ? `<pre class="dm-out">${esc(clip(s.text, 600))}</pre><details><summary>Full output</summary><pre class="dm-out">${esc(s.text)}</pre></details>` : `<pre class="dm-out">${esc(s.text)}</pre>`) : ''}</li>`;
    }
    if (s.kind === 'answer') return `<li class="dm-st ans"><span>Answer</span><b>${esc(s.text)}</b></li>`;
    if (s.kind === 'error') return `<li class="dm-st err"><span>Error</span><p>${esc(s.text)}</p></li>`;
    if (s.kind === 'status' && !done) return `<li class="dm-st wait"><span class="dm-spin"></span>${esc(s.text)}</li>`;
    return '';
  }).join('');
  // follow new steps inside the trace panel only while the reader is at its bottom
  const box = R.steps, atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  box.innerHTML = html || '<li class="dm-empty">Waiting for the first model response…</li>';
  if (atBottom) box.scrollTop = box.scrollHeight;
  R.meta.textContent = `${n} tool call${n === 1 ? '' : 's'}`;
}
R.steps.addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]'); const lb = $('#lightbox');
  if (z && lb) { $('img', lb).src = z.src; $('.lb-cap', lb).textContent = ''; lb.hidden = false; }
});

/* ---------------------------------------------------------------- run */
function setRunning(on) {
  S.running = on; R.run.disabled = on; R.stop.hidden = !on; R.run.textContent = on ? 'Running…' : 'Run';
}
R.form.addEventListener('submit', async e => {
  e.preventDefault();
  R.runNote.textContent = '';
  if (!S.client) { R.runNote.textContent = 'The demo server is not reachable.'; return; }
  const q = R.q.value.trim(), st = settings();
  if (!S.files.length) { R.runNote.textContent = 'Add at least one image.'; return; }
  if (!q) { R.runNote.textContent = 'Enter a question.'; return; }
  if (!st.model) { R.runNote.textContent = 'Enter the model name.'; return; }
  if (st.provider === 'OpenAI' && !st.api_key) { R.runNote.textContent = 'An OpenAI API key is required.'; return; }
  if (st.provider === COMPAT && !/^https:\/\//.test(st.base_url)) { R.runNote.textContent = 'Enter an https base URL for your endpoint.'; return; }
  setRunning(true);
  R.steps.innerHTML = '<li class="dm-st wait"><span class="dm-spin"></span>Uploading images and starting the agent…</li>';
  let finished = false;
  // reset the UI as soon as the run ends; leaving the client's async iterator early can hang, so
  // completion is handled here rather than in a finally block
  const finish = note => {
    if (finished) return; finished = true;
    if (note) R.runNote.textContent = note;
    setRunning(false); S.job = null;
    R.steps.querySelectorAll('.dm-st.wait').forEach(li => li.remove());
  };
  try {
    const root = (S.client.config && S.client.config.root) || S.base;
    const files = await upload.call(S.client, await prepare_files(S.files.map(f => f.blob)), root);
    // Start the run, then poll for the trajectory. The server's tunnel holds back streamed
    // responses until they finish, so short polling requests keep the view up to date.
    const jobId = (await S.client.predict('/start_run', { message: { text: q, files }, ...st, serper_key: R.serper.value.trim() })).data[0];
    S.job = { id: jobId, stop: false };
    const job = S.job;
    while (!job.stop) {
      const r = (await S.client.predict('/poll', { job_id: jobId })).data[0];
      if (job.stop) break;
      renderTrace(r.chat, r.done);
      if (r.done) break;
      await new Promise(res => setTimeout(res, 1000));
    }
    finish();
  } catch (err) {
    finish(errText(err));
  }
});
R.stop.addEventListener('click', () => { if (S.job) { S.job.stop = true; setRunning(false); S.job = null; R.runNote.textContent = 'Stopped watching this run.'; R.steps.querySelectorAll('.dm-st.wait').forEach(li => li.remove()); } });

// connect only when the demo is about to be seen, so ordinary page views don't touch the backend
const near = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { near.disconnect(); connect(); } }, { rootMargin: '600px 0px' });
near.observe($('#playground'));
