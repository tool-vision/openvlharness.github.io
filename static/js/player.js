/* Trajectory player: replays any example from examples.js through the method figure.
   The orchestrator's reasoning streams in, tool calls type out, evidence is rendered with a
   capability-specific animation (boxes for grounding, a depth sweep, a zoom into the crop,
   a typing code editor), and every artifact lands in persistent memory under its handle. */
(function () {
  'use strict';
  const EX = window.OVH_EXAMPLES || [];
  const fig = document.getElementById('methodFig');
  if (!EX.length || !fig) return;

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Marker dots drawn by the benchmark (SparBench) on input images, located offline.
  const MARKERS = {
    'static/examples/ex15/input_1.jpg': [{ c: 'red', x: 0.8803, y: 0.3305 }],
    'static/examples/ex15/input_3.jpg': [{ c: 'blue', x: 0.8178, y: 0.0483 }],
    'static/examples/ex16/input_3.jpg': [{ c: 'red', x: 0.8565, y: 0.9503 }],
    'static/examples/ex17/input_1.jpg': [{ c: 'red', x: 0.0078, y: 0.1136 }],
    'static/examples/ex17/input_3.jpg': [{ c: 'blue', x: 0.5038, y: 0.7084 }],
  };

  const CAP = {
    grounding: { n: 'Visual Grounding', i: 'i-ground', ui: 'ground', be: 'sam' },
    zoom: { n: 'Zoom-in', i: 'i-zoom', ui: 'zoom', be: 'imgp' },
    ocr: { n: 'OCR', i: 'i-ocr', ui: 'ocr', be: 'ocr' },
    depth: { n: 'Depth Estimation', i: 'i-depth', ui: 'depth', be: 'da' },
    camera: { n: 'Camera Trajectory', i: 'i-camera', ui: 'camera', be: 'da' },
    tsearch: { n: 'Text Search', i: 'i-tsearch', ui: 'tsearch', be: 'serper' },
    isearch: { n: 'Image Search', i: 'i-isearch', ui: 'isearch', be: 'serper' },
    web: { n: 'Webpage Visit', i: 'i-web', ui: 'web', be: 'serper' },
    code: { n: 'Python Coding Agent', i: 'i-code', ui: 'code', be: 'coder' },
  };
  const DOMS = [['all', 'All'], ['count', 'Counting & Grounding'], ['search', 'Search'], ['vqa', 'General VQA'], ['spatial', 'Spatial']];

  /* ------------------------------------------------------------ data prep */
  const snake = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28) || 'query';
  function parseBoxes(out) {
    const i = out.indexOf('are:');
    const src = i >= 0 ? out.slice(i) : out;
    const re = /\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    const boxes = []; let m;
    while ((m = re.exec(src)) && boxes.length < 220) boxes.push([+m[1], +m[2], +m[3], +m[4]]);
    return boxes;
  }
  function markerLabels(q) {
    const lab = {};
    const re = /\((red|blue) point\)/gi; let m;
    while ((m = re.exec(q))) {
      const pre = q.slice(Math.max(0, m.index - 48), m.index).trim();
      const k = pre.toLowerCase().lastIndexOf(' of ');
      let name = k >= 0 ? pre.slice(k + 4) : pre.split(/\s+/).slice(-2).join(' ');
      lab[m[1].toLowerCase()] = name.replace(/^the /i, '').trim();
    }
    return lab;
  }
  function prep(e) {
    if (e._p) return e._p;
    const imgs = {};               // handle -> src
    e.inputs.forEach(im => { imgs[im.h] = im.src; });
    const seen = { depth: 0 }, bindNames = new Set();
    const steps = e.steps.map((s, k) => {
      const a = s.args || {};
      const srcId = a.image_id || (Array.isArray(a.image_ids) ? a.image_ids[0] : null);
      const st = { ...s, k, srcId, srcSrc: srcId ? imgs[srcId] : null, binds: [], web: [], boxes: [] };
      if (s.cap === 'grounding') {
        let b = 'segment_' + snake(a.query); while (bindNames.has(b)) b += '_2';
        st.binds.push([b, 'pred_boxes, pred_scores, pred_masks, num_masks']);
        st.boxes = parseBoxes(s.out);
        const mN = s.out.match(/grounded (\d+) object/); st.nObj = mN ? +mN[1] : st.boxes.length;
      } else if (s.cap === 'depth') {
        seen.depth++; st.binds.push([seen.depth === 1 ? 'depth_result' : 'depth_result_' + seen.depth, 'depth_meters, depth_shape, colormap']);
      } else if (s.cap === 'camera') {
        st.binds.push(['camera_trajectory_result', 'image_ids, intrinsics, extrinsics']);
      }
      st.binds.forEach(([n]) => bindNames.add(n));
      st.web = [...new Set((s.out.match(/webpage_url_\d+/g) || []))];
      st.err = s.cap === 'code' && /^\s*(Execution error|Error|Traceback)/i.test(s.out);
      s.imgs.forEach(im => { imgs[im.h] = im.src; });
      return st;
    });
    // attempt numbers for repeated coding calls
    let ca = 0; steps.forEach(s => { if (s.cap === 'code') s.attempt = ++ca; });
    e._p = { steps, markers: markerLabels(e.question) };
    return e._p;
  }

  /* ------------------------------------------------------------ timing + typing */
  let speed = 1, run = 0;
  const alive = r => r === run;
  const sleep = (ms, r) => new Promise(res => setTimeout(res, REDUCED ? 0 : ms / speed)).then(() => alive(r));
  function typeText(el, text, { r, maxMs = 1600, cps = 220, render = t => esc(t), caret = true, scroll = null } = {}) {
    return new Promise(res => {
      if (REDUCED || maxMs <= 0) { el.innerHTML = render(text); res(alive(r)); return; }
      const dur = Math.min(maxMs, (text.length / cps) * 1000) / speed;
      const t0 = performance.now();
      const step = now => {
        if (!alive(r)) { res(false); return; }
        const p = Math.min(1, (now - t0) / Math.max(dur, 1));
        const n = Math.round(text.length * p);
        el.innerHTML = render(text.slice(0, n)) + (caret && p < 1 ? '<span class="caret"></span>' : '');
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
        if (p < 1) requestAnimationFrame(step); else res(true);
      };
      requestAnimationFrame(step);
    });
  }
  // tiny Python highlighter, robust to partially typed input
  const PYK = /\b(import|from|as|def|return|for|in|if|elif|else|while|try|except|finally|with|lambda|None|True|False|and|or|not|is|class|raise|continue|break|pass|print|range|len|float|int|round|min|max|abs|sorted|enumerate|zip)\b/;
  function hlPy(src) {
    const re = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]\w*)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index)); last = re.lastIndex;
      if (m[1]) out += `<span class="c">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="s">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="n">${m[3]}</span>`;
      else if (PYK.test(m[4]) && m[4].length === (m[4].match(PYK) || [''])[0].length) out += `<span class="k">${m[4]}</span>`;
      else if (/(_result(_\d)?|^segment_\w+)$/.test(m[4])) out += `<span class="b">${m[4]}</span>`;
      else out += esc(m[4]);
    }
    return out + esc(src.slice(last));
  }
  const clip = (t, n) => { t = String(t || '').trim(); return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + ' …'; };

  /* ------------------------------------------------------------ DOM refs */
  const R = {
    head: $('#tpHead'), q: $('#mfQ'), thumbs: $('#mfThumbs'), ans: $('#mfAns'), final: $('#mfFinal'), gt: $('#mfGt'),
    orch: $('#mfOrch'), orchSt: $('#mfOrchSt'), tok: $('#mfTok'), thought: $('#mfThought'),
    env: $('#mfEnv'), envTxt: $('#mfEnvTxt'), call: $('#mfCall'), callTxt: $('#mfCallTxt'), ev: $('#mfEv'), evBody: $('#mfEvBody'),
    mem: $('#mfMem'), memImgs: $('#memImgs'), memData: $('#memData'), memWeb: $('#memWeb'), memCount: $('#memCount'),
    steps: $('#mfSteps'), cap: $('#mfCaption'), play: $('#mfPlay'), user: $('#mfUser'),
    strip: $('#tpStrip'), dom: $('#tpDomain'), speed: $('#mfSpeed'),
  };

  /* ------------------------------------------------------------ picker */
  let ex = null, P = null, cur = -1, playing = !REDUCED, visible = false, userPicked = false, domain = 'all';
  const thumbOf = e => e.inputs[0].src;
  function renderStrip() {
    const list = EX.filter(e => domain === 'all' || e.domain === domain);
    R.strip.innerHTML = list.map(e => {
      const caps = [...new Set(e.steps.map(s => s.cap))].filter(c => CAP[c]);
      return `<button type="button" class="tp-chip${ex === e ? ' on' : ''}" data-id="${e.id}" role="option" aria-selected="${ex === e}" title="${esc(e.question.split('\n')[0])}">
        <img src="${thumbOf(e)}" alt="" loading="lazy">
        <span class="tc-t"><b>${esc(e.dataset)}</b><span>${caps.slice(0, 5).map(c => `<svg><use href="#${CAP[c].i}"/></svg>`).join('')}</span></span></button>`;
    }).join('');
  }
  if (R.dom) {
    R.dom.innerHTML = DOMS.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === domain}">${l}</button>`).join('');
    R.dom.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      domain = b.dataset.k; $$('button', R.dom).forEach(x => x.setAttribute('aria-pressed', x === b));
      renderStrip();
      const first = EX.find(e => domain === 'all' || e.domain === domain);
      if (first && !(domain === 'all' || ex.domain === domain)) { userPicked = true; load(first.id); }
    });
  }
  R.strip.addEventListener('click', ev => {
    const b = ev.target.closest('.tp-chip'); if (!b) return;
    userPicked = true; load(b.dataset.id);
  });

  /* ------------------------------------------------------------ static pieces */
  function thumbHTML(im, big = false) {
    const mk = (MARKERS[im.src] || []).map(m => `<i class="mk ${m.c}" style="left:${m.x * 100}%;top:${m.y * 100}%" title="${esc(P.markers[m.c] || m.c + ' point')}">${big ? `<em>${esc(P.markers[m.c] || m.c + ' point')}</em>` : ''}</i>`).join('');
    return `<figure class="${big ? 'big' : ''}"><div class="im"><img src="${im.src}" alt="${esc(im.h)}" data-zoom>${mk}</div><figcaption>${esc(im.h)}</figcaption></figure>`;
  }
  function renderHead() {
    const caps = [...new Set(ex.steps.map(s => s.cap))].filter(c => CAP[c]);
    R.head.innerHTML = `<span class="pill">${ex.inPaper ? 'Example ' + ex.num + ' · in paper' : 'Extra example'}</span>
      <span>${esc(ex.dataset)}</span><span>${esc(ex.model)}</span><span>${ex.steps.length} tool calls</span>
      <span class="caps">${caps.map(c => `<svg title="${CAP[c].n}"><use href="#${CAP[c].i}"/></svg>`).join('')}</span>
      <button type="button" class="tp-full" id="tpFull">Full write-up →</button>`;
    $('#tpFull').addEventListener('click', () => { setPlaying(false); window.OVHGallery && window.OVHGallery.openById(ex.id); });
  }
  function renderUser() {
    R.q.textContent = ex.question.split('\n')[0];
    const mkl = Object.entries(P.markers);
    $('#mfMk').innerHTML = mkl.map(([c, l]) => `<span class="${c}"><i></i>${esc(l)}</span>`).join('');
    R.thumbs.className = 'thumbs n' + Math.min(ex.inputs.length, 4);
    const ins = ex.inputs.slice(0, 4);
    R.thumbs.innerHTML = ins.map(im => thumbHTML(im)).join('') + (ex.inputs.length > 4 ? `<span class="more">+${ex.inputs.length - 4}</span>` : '');
  }
  function renderSteps() {
    const items = [{ c: 'query', t: 'Query' }, ...P.steps.map(s => ({ c: s.cap, t: (CAP[s.cap] || { n: s.tool }).n })), { c: 'answer', t: 'Answer' }];
    R.steps.innerHTML = items.map((it, i) => {
      const ic = it.c === 'query' ? 'i-eye' : it.c === 'answer' ? 'i-check' : (CAP[it.c] || {}).i;
      return `<button type="button" data-i="${i}" title="${i + 1} · ${esc(it.t)}" aria-label="Step ${i + 1}: ${esc(it.t)}"><span class="bar"></span>${ic ? `<svg><use href="#${ic}"/></svg>` : ''}<span class="nn">${i + 1}</span></button>`;
    }).join('');
  }
  R.steps.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) { setPlaying(false); go(+b.dataset.i); } });
  const nSteps = () => P.steps.length + 2;

  // memory state after step index i (0 = query, 1..n = tools, n+1 = answer)
  function memAt(i) {
    const imgs = ex.inputs.map(im => ({ ...im, from: 'user_input' })), binds = [], web = [];
    for (let k = 0; k < Math.min(i, P.steps.length); k++) {
      const s = P.steps[k];
      s.imgs.forEach(im => imgs.push({ ...im, from: s.tool }));
      binds.push(...s.binds); s.web.forEach(w => { if (!web.includes(w)) web.push(w); });
    }
    return { imgs, binds, web };
  }
  function renderMem(i, prevI) {
    const st = memAt(i), pv = prevI == null ? st : memAt(prevI);
    const isNew = (arr, key, v) => !arr.some(x => (key ? x[key] : x[0]) === (key ? v[key] : v[0]));
    const showImgs = st.imgs.slice(-9);
    R.memImgs.innerHTML = showImgs.map(im => `<figure class="${isNew(pv.imgs, 'h', im) ? 'new' : ''}"><img src="${im.src}" alt="${esc(im.h)}" data-zoom loading="lazy"><figcaption>${esc(im.h.replace('tool_generated_image', 'tool_image'))}</figcaption></figure>`).join('');
    R.memCount.textContent = st.imgs.length > 9 ? `${st.imgs.length} images · showing latest 9` : `${st.imgs.length} image${st.imgs.length === 1 ? '' : 's'}`;
    R.memData.innerHTML = st.binds.length ? st.binds.map(b => `<div class="${isNew(pv.binds, null, b) ? 'new' : ''}" data-b="${b[0]}">${b[0]}: <span class="ty">dict</span></div>`).join('') : '<span class="ev-empty">no bindings yet</span>';
    R.memWeb.innerHTML = st.web.length ? st.web.slice(-4).map(w => `<span class="${pv.web.includes(w) ? '' : 'new'}">${w}</span>`).join('') + (st.web.length > 4 ? `<span class="more">+${st.web.length - 4} more</span>` : '') : '<span class="ev-empty">registered when search is used</span>';
    // environment update, paper format (compact)
    const nm = h => h.replace('tool_generated_image', 'tool_generated_image');
    const span = (t, on) => on ? `<span class="new">${t}</span>` : t;
    const imgsShown = st.imgs.length > 6 ? ['…', ...st.imgs.slice(-5)] : st.imgs;
    let t = '<span class="k">Available image IDs:</span>\n' + imgsShown.map(im => im === '…' ? '…' : span(nm(im.h), isNew(pv.imgs, 'h', im))).join(', ');
    t += '\n\n<span class="k">Available data bindings:</span>\n' + (st.binds.length ? st.binds.map(b => span(`${b[0]}: dict`, isNew(pv.binds, null, b))).join('\n') : '—');
    if (st.web.length) t += '\n\n<span class="k">Web references:</span>\n' + st.web.slice(-3).map(w => span(w, !pv.web.includes(w))).join(', ');
    R.envTxt.innerHTML = t;
  }
  function resetTransient() {
    [R.call, R.orch, R.user].forEach(b => b.classList.remove('lit'));
    R.ev.classList.remove('lit-a'); R.mem.classList.remove('lit-v'); R.env.classList.remove('lit-v'); R.orch.classList.remove('thinking');
    $$('.cap', fig).forEach(c => c.classList.remove('on')); $$('.be', fig).forEach(c => c.classList.remove('on'));
    ['#flowDown', '#flowUp', '#flowDown2', '#flowUp2'].forEach(id => $(id).classList.remove('go'));
    $('#ioStore').classList.remove('on'); $('#ioFetch').classList.remove('on');
    $$('#memData div').forEach(d => d.classList.remove('fetch'));
  }
  function setCaption(i) {
    const n = nSteps();
    let t;
    if (i === 0) { t = `Query · ${ex.inputs.length} input image${ex.inputs.length > 1 ? 's' : ''}`; }
    else if (i === n - 1) { t = `Answer · ${ex.pred}`; }
    else {
      const s = P.steps[i - 1], c = CAP[s.cap] || { n: s.tool };
      const a = s.args || {};
      const detail = s.cap === 'grounding' ? `"${a.query}" in ${a.image_id}` : s.cap === 'code' ? `attempt ${s.attempt}` : s.cap === 'camera' && Array.isArray(a.image_ids) ? `${a.image_ids.length} views` : (a.query ? `"${clip(a.query, 48)}"` : s.srcId || (a.url || ''));
      t = `${c.n}${detail ? ' · ' + detail : ''}`;
      if (s.err) t += ' · execution error';
    }
    $('.s', R.cap).textContent = `STEP ${i + 1} / ${n}`;
    $('.t', R.cap).textContent = t;
  }
  function markSteps() {
    $$('button', R.steps).forEach((b, k) => { b.classList.toggle('done', k < cur); b.classList.toggle('cur', k === cur); });
    const c = $('button.cur', R.steps); if (c) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function callText(s) {
    const a = s.args || {};
    const lines = Object.entries(a).map(([k, v]) => {
      let val = typeof v === 'string' ? JSON.stringify(clip(v, 140)) : JSON.stringify(v);
      return `<span class="k">${esc(k)}</span>: ${esc(val)}`;
    });
    return `<span class="fn">${esc(s.tool)}</span>\n` + lines.join('\n');
  }
  function thoughtFor(s) {
    if (s.say) return s.say;
    const a = s.args || {}, c = CAP[s.cap] || { n: s.tool };
    if (s.cap === 'grounding') return `Next I will locate "${a.query}" in ${a.image_id} with ${c.n}.`;
    if (s.cap === 'zoom') return `I will zoom into region [${(a.coords || []).join(', ')}] of ${a.image_id} to look closer.`;
    if (s.cap === 'ocr') return `I will read any text in ${a.image_id}.`;
    if (s.cap === 'tsearch') return `I will search for: ${a.query}`;
    if (s.cap === 'isearch') return `I will run a reverse image search on ${a.image_id || 'the image'}.`;
    if (s.cap === 'web') return `I will open the most promising page and extract the relevant facts.`;
    if (s.cap === 'code' && a.objective) return `Objective for the coding agent: ${a.objective}`;
    return `Calling ${s.tool}.`;
  }

  /* ------------------------------------------------------------ evidence renderers */
  function stage(srcImg, extra = '') {
    return `<div class="stage">${srcImg ? `<img class="base" src="${srcImg}" alt="">` : ''}${extra}</div>`;
  }
  function fitStage(st) {
    const im = $('img.base', st) || $('img', st);
    if (!im) return;
    const set = () => { if (im.naturalWidth) st.style.aspectRatio = `${im.naturalWidth} / ${im.naturalHeight}`; };
    im.complete ? set() : im.addEventListener('load', set, { once: true });
  }
  async function evidence(s, r, fast) {
    const b = R.evBody;
    let out = s.out;
    if (s.cap === 'grounding') { const k = out.indexOf('are:'); if (k > 0) out = out.slice(0, k + 4) + ' […]'; }
    const img = s.imgs[0];
    const handle = img ? `<div class="hd">${esc(img.h)}</div>` : '';
    const typed = async (el, n = 240, ms = 900) => typeText(el, clip(out, n), { r, maxMs: fast ? 0 : ms, cps: 320 });

    if (s.cap === 'code') {
      const lines = s.code ? s.code.split('\n').length : 0;
      b.innerHTML = `<div class="ev2 code">
        <div class="ed"><div class="ed-bar"><span>program.py</span><span>${lines} lines · bindings injected</span></div><pre class="ed-src"></pre></div>
        <div class="term ${s.err ? 'err' : 'ok'}"><div class="ed-bar"><span>output</span><span class="st"></span></div><pre class="term-out"></pre></div></div>`;
      const src = $('.ed-src', b), term = $('.term-out', b);
      if (s.code) await typeText(src, s.code, { r, maxMs: fast ? 0 : 3000, cps: 1400, render: hlPy, scroll: src });
      if (!fast && !(await sleep(250, r))) return;
      $('.term .st', b).textContent = s.err ? '✗ failed' : '✓ exit 0';
      await typeText(term, clip(s.out, 400), { r, maxMs: fast ? 0 : 700, cps: 400 });
      return;
    }
    if (s.cap === 'grounding' && s.srcSrc && img) {
      const boxes = s.boxes.slice(0, 160);
      const svg = `<svg class="bx" viewBox="0 0 1000 1000" preserveAspectRatio="none">${boxes.map((q, k) => `<rect x="${q[0]}" y="${q[1]}" width="${Math.max(q[2] - q[0], 4)}" height="${Math.max(q[3] - q[1], 4)}" style="animation-delay:${fast ? 0 : Math.round(k * Math.min(40, 900 / Math.max(boxes.length, 1)) / speed)}ms"/>`).join('')}</svg>`;
      b.innerHTML = `<div class="ev2">${stage(s.srcSrc, svg + `<img class="after" src="${img.src}" alt="">`)}<div class="ev-txt">${handle}<div class="count"><b>${s.nObj}</b> ${s.nObj === 1 ? 'object' : 'objects'} · "${esc(clip(s.args.query, 40))}"</div><pre></pre></div></div>`;
      const st = $('.stage', b); fitStage(st);
      if (fast) st.classList.add('done', 'drawn');
      else { requestAnimationFrame(() => st.classList.add('drawn')); if (!(await sleep(Math.min(1100, 300 + boxes.length * 30), r))) return; st.classList.add('done'); }
      await typed($('pre', b), 200);
      return;
    }
    if (s.cap === 'depth' && s.srcSrc && img) {
      b.innerHTML = `<div class="ev2">${stage(s.srcSrc, `<img class="after wipe" src="${img.src}" alt=""><i class="scan"></i>`)}<div class="ev-txt">${handle}<div class="count">metric depth · <b>${esc(s.binds[0][0])}</b></div><pre></pre></div></div>`;
      const st = $('.stage', b); fitStage(st);
      if (fast) st.classList.add('done'); else { requestAnimationFrame(() => st.classList.add('go')); if (!(await sleep(1000, r))) return; st.classList.add('done'); }
      await typed($('pre', b), 200);
      return;
    }
    if (s.cap === 'zoom' && s.srcSrc && img && Array.isArray(s.args.coords)) {
      const [x1, y1, x2, y2] = s.args.coords.map(v => v / 10);
      b.innerHTML = `<div class="ev2">${stage(s.srcSrc, `<i class="zr" style="left:${x1}%;top:${y1}%;width:${x2 - x1}%;height:${y2 - y1}%"></i><img class="after zoomed" src="${img.src}" alt="" style="--x:${x1}%;--y:${y1}%;--w:${x2 - x1}%;--h:${y2 - y1}%">`)}<div class="ev-txt">${handle}<div class="count">crop [${s.args.coords.join(', ')}]</div><pre></pre></div></div>`;
      const st = $('.stage', b); fitStage(st);
      if (fast) st.classList.add('drawn', 'done'); else { requestAnimationFrame(() => st.classList.add('drawn')); if (!(await sleep(650, r))) return; st.classList.add('done'); if (!(await sleep(500, r))) return; }
      await typed($('pre', b), 160);
      return;
    }
    if (s.cap === 'camera' && img) {
      const ins = (s.args.image_ids || []).map(h => ex.inputs.find(x => x.h === h)).filter(Boolean);
      b.innerHTML = `<div class="ev2">${stage(null, `<div class="cam-in">${ins.map((im, k) => `<img src="${im.src}" alt="" style="--k:${k}">`).join('')}</div><img class="after plot" src="${img.src}" alt="">`)}<div class="ev-txt">${handle}<div class="count">${ins.length} camera poses · <b>camera_trajectory_result</b></div><pre></pre></div></div>`;
      const st = $('.stage', b); st.style.aspectRatio = '4 / 3';
      if (fast) st.classList.add('done'); else { requestAnimationFrame(() => st.classList.add('go')); if (!(await sleep(1100, r))) return; st.classList.add('done'); }
      await typed($('pre', b), 260, 1100);
      return;
    }
    // search, OCR, web visit, and anything else: images (if any) + streamed text
    const many = s.imgs.slice(0, 3);
    const left = many.length ? `<div class="res-grid n${many.length}">${many.map((im, k) => `<figure style="animation-delay:${fast ? 0 : k * 140}ms"><img src="${im.src}" alt="${esc(im.h)}"><figcaption>${esc(im.h.replace('tool_generated_image', 'tool_image'))}</figcaption></figure>`).join('')}</div>`
      : s.srcSrc ? stage(s.srcSrc) : '';
    b.innerHTML = `<div class="ev2${left ? '' : ' txt-only'}">${left}<div class="ev-txt">${s.web.length ? `<div class="count">${s.web.slice(0, 3).map(w => `<span class="url">${w}</span>`).join(' ')}</div>` : ''}<pre></pre></div></div>`;
    const st = $('.stage', b); if (st) { fitStage(st); st.classList.add('done'); }
    await typed($('pre', b), left ? 260 : 420, 1300);
  }

  /* ------------------------------------------------------------ step animation */
  function staticTo(i) {
    resetTransient();
    R.ans.textContent = '…'; R.final.classList.remove('done'); R.gt.textContent = '';
    R.callTxt.innerHTML = '<span class="ev-empty">waiting for the orchestrator…</span>';
    R.evBody.innerHTML = '<span class="ev-empty">Raw outputs (masks, arrays, poses) are rendered into images and concise text the model can inspect.</span>';
    R.thought.innerHTML = ''; R.tok.textContent = '';
    renderMem(i, null);
  }
  async function animate(i, r) {
    const n = nSteps();
    setCaption(i);
    R.orch.classList.add('lit', 'thinking');
    if (i === 0) {
      R.orchSt.textContent = 'reading the query';
      R.user.classList.add('lit');
      await typeText(R.thought, ex.question.split('\n')[0], { r, maxMs: 1200, cps: 120 });
      if (!alive(r)) return;
      $('#ioStore').classList.add('on'); R.mem.classList.add('lit-v'); R.env.classList.add('lit-v'); renderMem(0, null);
      R.orch.classList.remove('thinking');
      return;
    }
    if (i === n - 1) {
      R.orchSt.textContent = 'answering';
      const lastS = P.steps[P.steps.length - 1];
      if (lastS) { R.callTxt.innerHTML = callText(lastS); await evidence(lastS, r, true); }
      const txt = ex.final || `Final answer: ${ex.pred}`;
      await typeText(R.thought, clip(txt, 360), { r, maxMs: 1600, cps: 160 });
      if (!alive(r)) return;
      R.orch.classList.remove('thinking'); R.user.classList.add('lit');
      R.ans.textContent = ex.pred; R.final.classList.add('done');
      R.gt.innerHTML = ex.gt ? `ground truth <b>${esc(ex.gt)}</b> ${ex.correct ? '<span class="okm">✓</span>' : ''}` : '';
      return;
    }
    const s = P.steps[i - 1], c = CAP[s.cap] || {};
    R.orchSt.textContent = 'thinking';
    const th = clip(thoughtFor(s), 420);
    const tokTarget = Math.round(th.length / 4);
    const tokEl = R.tok; let tokShown = 0;
    const tokTimer = setInterval(() => { if (tokShown < tokTarget) { tokShown = Math.min(tokTarget, tokShown + 3); tokEl.textContent = tokShown + ' tok'; } }, 30);
    await typeText(R.thought, th, { r, maxMs: 2200, cps: 170, scroll: R.thought });
    clearInterval(tokTimer); tokEl.textContent = tokTarget + ' tok';
    if (!alive(r)) return;
    R.orchSt.textContent = s.cap === 'code' ? 'delegating to code' : 'calling tool';
    R.call.classList.add('lit');
    await typeText(R.callTxt, '', { r, maxMs: 0 });
    await typeText(R.callTxt, callText(s), { r, maxMs: 500, cps: 500, render: t => t, caret: false });
    R.callTxt.innerHTML = callText(s);
    if (!(await sleep(250, r))) return;
    $('#flowDown').classList.add('go'); $('#flowDown2').classList.add('go');
    const capEl = $(`.cap[data-cap="${c.ui}"]`, fig); if (capEl) capEl.classList.add('on');
    const beEl = $(`.be[data-be="${c.be}"]`, fig); if (beEl) beEl.classList.add('on');
    if (s.cap === 'code') {
      $('#ioFetch').classList.add('on'); R.mem.classList.add('lit-v');
      $$('#memData div').forEach((d, k) => setTimeout(() => d.classList.add('fetch'), REDUCED ? 0 : k * 120 / speed));
    }
    if (!(await sleep(550, r))) return;
    ['#flowDown', '#flowDown2'].forEach(id => $(id).classList.remove('go')); $('#flowUp').classList.add('go'); $('#flowUp2').classList.add('go');
    R.call.classList.remove('lit'); R.ev.classList.add('lit-a');
    await evidence(s, r, false);
    if (!alive(r)) return;
    $('#flowUp').classList.remove('go'); $('#flowUp2').classList.remove('go'); R.orch.classList.remove('thinking');
    $('#ioStore').classList.add('on'); R.mem.classList.add('lit-v'); R.env.classList.add('lit-v');
    renderMem(i, i - 1);
  }
  async function playFrom(i) {
    const r = ++run;
    cur = (i + nSteps()) % nSteps();
    staticTo(cur); markSteps();
    await waitVisible(r);
    if (!alive(r)) return;
    await animate(cur, r);
    if (!alive(r) || !playing) return;
    const last = cur === nSteps() - 1;
    if (!(await sleep(last ? 3800 : 1500, r))) return;
    await waitVisible(r);
    if (!alive(r) || !playing) return;
    if (!last) playFrom(cur + 1);
    else if (!userPicked) { // tour: move on to the next example in the current filter
      const list = EX.filter(e => domain === 'all' || e.domain === domain);
      const nx = list[(list.indexOf(ex) + 1) % list.length];
      load(nx.id, { keepTour: true });
    } else playFrom(0);
  }
  function go(i) { playFrom(i); }
  function waitVisible(r) {
    return new Promise(res => { const chk = () => { if (!alive(r)) return res(); if (visible) return res(); setTimeout(chk, 250); }; chk(); });
  }
  function setPlaying(p) {
    playing = p;
    $('use', R.play).setAttribute('href', p ? '#i-pause' : '#i-play');
    R.play.setAttribute('aria-label', p ? 'Pause' : 'Play');
    if (p) playFrom(cur >= nSteps() - 1 ? 0 : cur + 1);
  }
  R.play.addEventListener('click', () => setPlaying(!playing));
  $('#mfPrev').addEventListener('click', () => { setPlaying(false); go(cur - 1); });
  $('#mfNext').addEventListener('click', () => { setPlaying(false); go(cur + 1); });
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const sBtn = $('#mfSpeedBtn'), sVal = $('#mfSpeedV');
  function setSpeed(v) {
    speed = v; fig.style.setProperty('--spd', v);
    sVal.textContent = v + '×';
    $$('li', R.speed).forEach(li => li.setAttribute('aria-selected', +li.dataset.v === v));
  }
  function openMenu(o) {
    R.speed.hidden = !o; sBtn.setAttribute('aria-expanded', o);
    if (o) { const cur = $('li[aria-selected="true"]', R.speed); (cur || R.speed).focus(); }
  }
  if (R.speed && sBtn) {
    R.speed.innerHTML = SPEEDS.map(v => `<li role="option" tabindex="-1" data-v="${v}" aria-selected="${v === 1}">${v}×${v === 1 ? '<span>normal</span>' : ''}</li>`).join('');
    sBtn.addEventListener('click', () => openMenu(R.speed.hidden));
    R.speed.addEventListener('click', ev => { const li = ev.target.closest('li'); if (li) { setSpeed(+li.dataset.v); openMenu(false); sBtn.focus(); } });
    R.speed.addEventListener('keydown', ev => {
      const items = $$('li', R.speed), k = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { items[Math.max(0, Math.min(items.length - 1, k + (ev.key === 'ArrowDown' ? 1 : -1)))].focus(); ev.preventDefault(); }
      else if (ev.key === 'Enter' || ev.key === ' ') { if (k >= 0) { setSpeed(+items[k].dataset.v); openMenu(false); sBtn.focus(); } ev.preventDefault(); }
      else if (ev.key === 'Escape' || ev.key === 'Tab') { openMenu(false); sBtn.focus(); }
    });
    document.addEventListener('click', ev => { if (!R.speed.hidden && !ev.target.closest('#mfSpeedDd')) openMenu(false); });
  }

  function load(id, opt = {}) {
    const e = EX.find(x => x.id === id) || EX[0];
    if (!opt.keepTour && opt.fromGallery) userPicked = true;
    ex = e; P = prep(e);
    renderStrip(); renderHead(); renderUser(); renderSteps();
    const chip = $(`.tp-chip[data-id="${e.id}"]`, R.strip);
    if (chip) { const sl = R.strip; sl.scrollTo({ left: chip.offsetLeft - sl.clientWidth / 2 + chip.clientWidth / 2, behavior: REDUCED ? 'auto' : 'smooth' }); }
    playFrom(0);
  }

  /* ------------------------------------------------------------ expand panels */
  const X = $('#tpX'), XB = $('#tpXBody'), XT = $('#tpXTitle');
  let xLast = null;
  function openX(kind) {
    setPlaying(false);
    const i = cur, s = i > 0 && i <= P.steps.length ? P.steps[i - 1] : null;
    let title = '', body = '';
    if (kind === 'user') {
      title = 'User input';
      const ov = ex.overview || {};
      body = `<p class="xq">${esc(ex.question)}</p><div class="x-imgs">${ex.inputs.map(im => thumbHTML(im, true)).join('')}</div>
        ${ov.task ? `<p class="x-note"><b>Task.</b> ${ov.task}</p>` : ''}
        <div class="x-ans"><div><span>OpenVLHarness</span><b>${esc(ex.pred)}</b></div>${ex.gt ? `<div><span>Ground truth</span><b>${esc(ex.gt)}</b></div>` : ''}${ex.notool ? `<div><span>${esc(ex.model)} without tools</span><b>${ex.notool}</b></div>` : ''}</div>`;
    } else if (kind === 'orch') {
      title = 'Orchestrator reasoning';
      body = P.steps.map((t, k) => `<div class="x-th${k === i - 1 ? ' cur' : ''}"><div class="x-th-h"><span>${k + 2}</span>${esc((CAP[t.cap] || { n: t.tool }).n)}</div><p>${esc(thoughtFor(t))}</p></div>`).join('') + (ex.final ? `<div class="x-th${i === nSteps() - 1 ? ' cur' : ''}"><div class="x-th-h"><span>${nSteps()}</span>Final answer</div><p>${esc(ex.final)}</p></div>` : '');
    } else if (kind === 'call') {
      title = s ? `Tool call · ${s.tool}` : 'Tool call';
      body = s ? `<pre class="x-pre">${esc(JSON.stringify({ name: s.tool, arguments: s.args }, null, 2))}</pre>` : '<p class="ev-empty">No tool call at this step.</p>';
    } else if (kind === 'ev') {
      title = s ? `Rendered evidence · ${(CAP[s.cap] || { n: s.tool }).n}` : 'Rendered evidence';
      body = s ? `${s.imgs.length ? `<div class="x-imgs">${s.imgs.map(im => thumbHTML(im, true)).join('')}</div>` : ''}
        ${s.code ? `<div class="x-lbl">Generated program · ${s.code.split('\n').length} lines</div><pre class="x-pre code">${hlPy(s.code)}</pre>` : ''}
        <div class="x-lbl">${s.code ? 'Execution output' : 'Text returned to the orchestrator'}</div><pre class="x-pre">${esc(s.out)}</pre>` : '<p class="ev-empty">No evidence at this step.</p>';
    } else if (kind === 'mem' || kind === 'env') {
      const st = memAt(i);
      title = kind === 'mem' ? 'Persistent multimodal memory' : 'Environment Update';
      body = `<div class="x-lbl">Image artifacts · ${st.imgs.length}</div><div class="x-imgs grid">${st.imgs.map(im => `<figure class="big"><div class="im"><img src="${im.src}" alt="${esc(im.h)}" data-zoom loading="lazy"></div><figcaption>${esc(im.h)}<br><span>${esc(im.from)}</span></figcaption></figure>`).join('')}</div>
        <div class="x-lbl">Structured data bindings</div><pre class="x-pre">${st.binds.length ? st.binds.map(b => `${b[0]}: dict (keys: ${b[1]})`).join('\n') : 'none yet'}</pre>
        <div class="x-lbl">Web references</div><pre class="x-pre">${st.web.length ? st.web.join(', ') : 'none yet'}</pre>`;
    }
    XT.textContent = title; XB.innerHTML = body; XB.scrollTop = 0;
    xLast = document.activeElement;
    X.hidden = false; requestAnimationFrame(() => X.classList.add('show'));
    $('[data-close].ctl', X).focus();
  }
  function closeX() { X.classList.remove('show'); setTimeout(() => { X.hidden = true; }, 180); if (xLast) xLast.focus(); }
  fig.addEventListener('click', ev => {
    const z = ev.target.closest('[data-zoom]');
    if (z && !ev.target.closest('.xp')) { const lb = $('#lightbox'); if (lb) { $('img', lb).src = z.src; $('.lb-cap', lb).textContent = z.alt; lb.hidden = false; } return; }
    const xp = ev.target.closest('.xp'); if (xp) openX(xp.dataset.x);
  });
  X.addEventListener('click', ev => {
    if (ev.target.closest('[data-close]')) closeX();
    const z = ev.target.closest('[data-zoom]');
    if (z) { const lb = $('#lightbox'); $('img', lb).src = z.src; $('.lb-cap', lb).textContent = z.alt; lb.hidden = false; }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !X.hidden && $('#lightbox').hidden) closeX(); });

  /* ------------------------------------------------------------ boot */
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; }), { threshold: 0.3 }).observe(fig);
  if (!playing) $('use', R.play).setAttribute('href', '#i-play');
  const start = (new URLSearchParams(location.search).get('ex')) || 'ex17';
  window.OVHPlayer = {
    load: (id) => { userPicked = true; load(id); },
    current: () => ex && ex.id,
  };
  load(start);
})();
