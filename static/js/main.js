(function () {
  'use strict';
  const D = window.OVH;
  const NS = 'http://www.w3.org/2000/svg';
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------------------------------------------------------- helpers */
  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) {
      if (attrs[k] === undefined || attrs[k] === null) continue;
      if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function H(tag, attrs, html) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
  // round half-up on the 2-decimal source value (toFixed alone turns 57.15 into "57.1")
  const fmt1 = v => (Math.round(v * 10 + (v >= 0 ? 1e-7 : -1e-7)) / 10).toFixed(1);
  const sign = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);

  // tooltip
  const tip = $('#tip');
  function showTip(evt, html) {
    tip.innerHTML = html;
    tip.classList.add('show');
    const x = evt.pageX ?? (evt.touches && evt.touches[0].pageX);
    const y = evt.pageY ?? (evt.touches && evt.touches[0].pageY);
    const w = tip.offsetWidth;
    const cx = Math.min(Math.max(x, w / 2 + 8), document.documentElement.clientWidth - w / 2 - 8);
    tip.style.left = cx + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.classList.remove('show'); }
  function hover(el, html) {
    el.style.cursor = 'pointer';
    el.addEventListener('mousemove', e => showTip(e, typeof html === 'function' ? html() : html));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('click', e => showTip(e, typeof html === 'function' ? html() : html));
  }
  document.addEventListener('scroll', hideTip, { passive: true });

  // chart registry: render on resize; animate the first time they scroll into view
  const charts = [];
  function chart(el, render) {
    const c = { el, render, seen: false };
    charts.push(c);
    c.draw = (animate) => {
      c.w = el.clientWidth;
      if (c.w < 60) return; // not laid out yet; the resize handler retries
      el.innerHTML = '';
      el.classList.remove('in');
      render(el, el.clientWidth);
      if (c.seen) {
        if (animate && !REDUCED) { void el.offsetWidth; requestAnimationFrame(() => el.classList.add('in')); }
        else el.classList.add('in');
      }
    };
    c.draw(false);
    return c;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const t = en.target;
      const c = charts.find(x => x.el === t);
      if (c) { if (!c.seen) { c.seen = true; setTimeout(() => t.classList.add('in'), 120); } }
      else t.classList.add('in');
      io.unobserve(t);
    });
  }, { threshold: 0.18 });
  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => charts.forEach(c => { if (c.el.clientWidth !== c.w) { c.w = c.el.clientWidth; c.draw(false); } }), 150);
  });

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function segmented(container, options, initial, onChange) {
    container.innerHTML = '';
    options.forEach(([val, label]) => {
      const b = H('button', { type: 'button' }, label);
      if (val === initial) b.classList.add('on');
      b.addEventListener('click', () => {
        $$('button', container).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        onChange(val);
      });
      container.appendChild(b);
    });
  }

  /* ---------------------------------------------------------------- theme */
  const themeBtn = $('#themeBtn');
  const syncSwitch = () => themeBtn.setAttribute('aria-checked', document.documentElement.getAttribute('data-theme') === 'dark');
  syncSwitch();
  themeBtn.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    syncSwitch();
    try { localStorage.setItem('ovh-theme', next); } catch (e) {}
  });

  /* ---------------------------------------------------------------- placeholder links */
  $$('[data-placeholder]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    showTip(e, 'Link coming soon');
    setTimeout(hideTip, 1400);
  }));

  /* ---------------------------------------------------------------- hero detection box */
  setTimeout(() => $('#detBox').classList.add('on'), REDUCED ? 0 : 350);
  // Title label: illustrative tool calls (arguments elided) with an output and the memory
  // artifacts it registers, shown as gray handles.
  (function detLabel() {
    const lab = $('#detBox .det-label'), box = $('#detBox');
    const R = [
      ['Visual_Grounding_Tool', 'grounded 23 objects', ['RLE masks', 'bboxes', 'tool_image_1']],
      ['Depth_Estimation_Tool', 'nearest 1.84 m · median 3.27 m', ['2D-depth-map', 'depth_meters']],
      ['Camera_Trajectory_Tool', '3 poses · baseline 0.62 m · yaw +38.4°', ['K', 'R|t', 'trajectory-plot']],
      ['Image_Search_Tool', '"Deuter Speed Lite 25, Mineral Grove"', ['image-1', 'image-2', 'image-3', 'webpage_url_1']],
      ['OCR_Tool', '"EXP 03/2027 · LOT 4471B"', ['text-boxes']],
      ['Zoom_In_Tool', '4.2× crop of input_image_1', ['tool_image_4']],
      ['Text_Search_Tool', '"ISPO Award 2024, Gold Winner"', ['webpage_url_3', 'webpage_url_4']],
      ['Webpage_Visit_Tool', '2 relevant passages', ['webpage_url_3']],
      ['Python_Coding_Agent_Tool', 'distance = 1.196 m', ['segment_window', 'depth_result', 'camera_trajectory_result']],
    ];
    const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = (t, nCall, r, nRes, hs, nH) => {
      const call = `${t}(…)`, cut = call.slice(0, nCall);
      let h = cut.length <= t.length ? `<b>${esc(cut)}</b>` : `<b>${esc(t)}</b><span class="ag">${esc(cut.slice(t.length))}</span>`;
      if (nRes > 0) h += ` <span class="ar">→</span> <span class="rs">${esc(r.slice(0, nRes))}</span>`;
      if (nH > 0) h += hs.slice(0, nH).map(x => ` <span class="hd">[${esc(x)}]</span>`).join('');
      return h;
    };
    if (REDUCED) { const [t, r, hs] = R[0]; lab.innerHTML = html(t, 1e9, r, 1e9, hs, hs.length); return; }
    let k = 0;
    function next() {
      const [t, r, hs] = R[k], call = `${t}(…)`;
      box.classList.remove('relock'); void box.offsetWidth; box.classList.add('relock');
      lab.classList.remove('out');
      let n = 0;
      (function typeCall() {
        n = Math.min(call.length, n + 2); lab.innerHTML = html(t, n, r, 0, hs, 0);
        if (n < call.length) return setTimeout(typeCall, 26);
        {
          let m = 0;
          (function typeRes() {
            m = Math.min(r.length, m + 2); lab.innerHTML = html(t, n, r, m, hs, 0);
            if (m < r.length) return setTimeout(typeRes, 22);
            let h = 0;
            (function addHandle() {
              h++; lab.innerHTML = html(t, n, r, m, hs, h);
              if (h < hs.length) return setTimeout(addHandle, 170);
              setTimeout(() => { lab.classList.add('out'); setTimeout(() => { k = (k + 1) % R.length; next(); }, 260); }, 3300);
            })();
          })();
        }
      })();
    }
    setTimeout(next, 1100);
  })();

  /* ================================================================ HERO: grouped bars */
  chart($('#heroBars'), (el, W) => {
    const data = D.BACKBONES;
    const Hh = W < 480 ? 250 : 280;
    const m = { l: 30, r: 6, t: 34, b: 58 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const Y0 = 30; // axis starts at 30, as in the paper's Fig. 1a
    const y = lin(Y0, 72, Hh - m.b, m.t);
    [30, 40, 50, 60, 70].forEach(v => {
      S('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === Y0 ? 'base-line' : 'grid-line' }, svg);
      S('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-label', text: v }, svg);
    });
    S('path', { d: `M${m.l - 5},${y(Y0) - 3} l6,-5 M${m.l - 5},${y(Y0) + 2} l6,-5`, style: 'stroke:var(--ink-3);stroke-width:1.2;fill:none' }, svg);
    const gw = (W - m.l - m.r) / data.length;
    const bw = Math.min(30, gw * 0.3);
    data.forEach((d, i) => {
      const cx = m.l + gw * (i + 0.5);
      const xb = cx - bw - 1.5, xo = cx + 1.5;
      const delay = i * 90;
      const rb = S('rect', { x: xb, y: y(d.base), width: bw, height: y(Y0) - y(d.base), rx: 4, class: 'anim-bar', style: `fill:var(--s-base);transition-delay:${delay}ms` }, svg);
      const ro = S('rect', { x: xo, y: y(d.ours), width: bw, height: y(Y0) - y(d.ours), rx: 4, class: 'anim-bar', style: `fill:var(--s-ours);transition-delay:${delay + 120}ms` }, svg);
      // square off the bottom corners
      S('rect', { x: xb, y: y(Y0) - 4, width: bw, height: 4, class: 'anim-bar', style: `fill:var(--s-base);transition-delay:${delay}ms` }, svg);
      S('rect', { x: xo, y: y(Y0) - 4, width: bw, height: 4, class: 'anim-bar', style: `fill:var(--s-ours);transition-delay:${delay + 120}ms` }, svg);
      if (bw >= 22) {
        S('text', { x: xb + bw / 2, y: y(d.base) - 5, 'text-anchor': 'middle', class: 'val-label anim-fade', style: `transition-delay:${delay + 700}ms;font-size:10.5px`, text: fmt1(d.base) }, svg);
      }
      S('text', { x: xo + bw / 2, y: y(d.ours) - 5, 'text-anchor': 'middle', class: 'val-label strong anim-fade', style: `transition-delay:${delay + 800}ms;font-size:10.5px`, text: fmt1(d.ours) }, svg);
      // delta chip row
      const g = S('g', { class: 'delta-chip anim-fade', style: `transition-delay:${delay + 900}ms` }, svg);
      const txt = '+' + (Math.round((d.ours - d.base) * 10 + 1e-6) / 10).toFixed(1);
      S('rect', { x: cx - 21, y: 2, width: 42, height: 19, rx: 6 }, g);
      S('text', { x: cx, y: 15.5, 'text-anchor': 'middle', text: txt }, g);
      // category label (two lines)
      const LBL = gw < 78
        ? { q8: ['Qwen3', '8B'], q32: ['Qwen3', '32B'], kimi: ['Kimi', 'K3'], gpt5: ['GPT-5', ''], luna: ['GPT-6', 'Luna'], sol: ['GPT-6', 'Sol'] }
        : { q8: ['Qwen3-VL', '8B'], q32: ['Qwen3-VL', '32B'], kimi: ['Kimi', 'K3'], gpt5: ['GPT-5', ''], luna: ['GPT-6', 'Luna'], sol: ['GPT-6', 'Sol'] };
      const parts = [null, ...(LBL[d.id] || [d.name, ''])];
      const t = S('text', { x: cx, y: Hh - m.b + 17, 'text-anchor': 'middle', class: 'cat-label' }, svg);
      S('tspan', { x: cx, dy: 0, text: parts ? parts[1] : d.name }, t);
      if (parts[2]) S('tspan', { x: cx, dy: 14, text: parts[2], style: 'fill:var(--ink-3)' }, t);
      const EFF = { kimi: 'max', luna: 'medium', sol: 'medium' };
      if (EFF[d.id]) S('text', { x: cx, y: Hh - m.b + 47, 'text-anchor': 'middle', class: 'ax-label', style: 'font-size:10.5px', text: `(${EFF[d.id]})` }, svg);
      const hit = S('rect', { x: cx - gw / 2, y: m.t, width: gw, height: Hh - m.t - m.b, fill: 'transparent' }, svg);
      hover(hit, `<b>${d.name}</b><br><span class="k">Base</span> ${d.base.toFixed(2)}<br><span class="k">+ OpenVLHarness</span> <b>${d.ours.toFixed(2)}</b> (${txt})`);
      [rb, ro].forEach(r => r.setAttribute('pointer-events', 'none'));
    });
  });

  /* ================================================================ HERO: score vs. cost (paper Fig. 1c) */
  const lg = $('#paretoLegend');
  D.EFFORT.forEach(s => lg.appendChild(H('span', {}, `<i style="background:var(${s.color})"></i>${s.name}`)));
  // effort-label placement per series and point: [dx, dy, anchor]
  const ELAB = {
    base: [[0, -10, 'middle'], [0, 16, 'middle'], [-8, -8, 'end'], [8, 4, 'start']],
    codex: [[9, 4, 'start'], [-9, 4, 'end'], [-7, -7, 'end'], [0, -10, 'middle']],
    vs: [[4, 15, 'start'], [0, -8, 'middle'], [8, 14, 'start'], [0, -10, 'middle']],
    ours: [[0, 18, 'middle'], [-6, -10, 'end'], [0, 18, 'middle'], [9, 4, 'start']],
  };
  chart($('#heroPareto'), (el, W) => {
    const Hh = W < 480 ? 270 : 300;
    const m = { l: 34, r: 40, t: 14, b: 40 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const x = lin(0, 4.5, m.l, W - m.r);
    const y = lin(45, 71, Hh - m.b, m.t);
    [45, 50, 55, 60, 65, 70].forEach(v => {
      S('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 45 ? 'base-line' : 'grid-line' }, svg);
      S('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-label', text: v }, svg);
    });
    [0, 1, 2, 3, 4].forEach(v => S('text', { x: x(v), y: Hh - m.b + 16, 'text-anchor': 'middle', class: 'ax-label', text: v }, svg));
    S('text', { x: (m.l + W - m.r) / 2, y: Hh - 6, 'text-anchor': 'middle', class: 'ax-title', text: 'Cost ($ / 1k questions)' }, svg);
    D.EFFORT.forEach((s, si) => {
      const isOurs = s.key === 'ours';
      const d = s.cost.map((c, i) => (i ? 'L' : 'M') + x(c) + ',' + y(s.score[i])).join(' ');
      S('path', { d, pathLength: 1, class: 'anim-line', style: `fill:none;stroke:var(${s.color});stroke-width:${isOurs ? 2.5 : 2};stroke-linejoin:round;stroke-linecap:round;transition-delay:${si * 150}ms` }, svg);
      s.cost.forEach((c, i) => {
        const cx = x(c), cy = y(s.score[i]);
        S('circle', { cx, cy, r: isOurs ? 5 : 4, class: 'anim-pop', style: `fill:var(${s.color});stroke:var(--surface);stroke-width:2;transition-delay:${400 + si * 150 + i * 110}ms` }, svg);
        const [dx, dy, an] = ELAB[s.key][i];
        S('text', { x: cx + dx, y: cy + dy, 'text-anchor': an, class: 'eff-label anim-fade', style: `fill:var(${s.color});transition-delay:${900 + si * 150}ms`, text: D.EFFORTS[i] }, svg);
        const hit = S('circle', { cx, cy, r: 11, fill: 'transparent' }, svg);
        hover(hit, `<b>${s.name}</b> · ${D.EFFORTS[i]} effort<br>score <b>${s.score[i].toFixed(2)}</b> · $${c.toFixed(2)} / 1k questions`);
      });
    });
  });

  /* ================================================================ INSIGHT 1: dumbbell explorer */
  let dbGroup = 'sol';
  let dbPrev = null;
  const dbChart = chart($('#dumbbell'), (el, W) => {
    const rowH = 19, domGap = 26;
    const m = { l: W < 480 ? 104 : 118, r: 50, t: 22, b: 26 };
    const nRows = D.DOMAINS.reduce((a, d) => a + d.rows.length, 0);
    const Hh = m.t + nRows * rowH + D.DOMAINS.length * domGap + m.b - 8;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const x = lin(0, 100, m.l, W - m.r);
    [0, 25, 50, 75, 100].forEach(v => {
      S('line', { x1: x(v), x2: x(v), y1: m.t - 6, y2: Hh - m.b + 4, class: 'grid-line' }, svg);
      S('text', { x: x(v), y: Hh - m.b + 18, 'text-anchor': 'middle', class: 'ax-label', text: v }, svg);
    });
    let yy = m.t;
    const rows = [];
    D.DOMAINS.forEach(dom => {
      S('text', { x: 0, y: yy + 8, class: 'ax-title', style: 'font-family:var(--f-mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase', text: dom.short }, svg);
      yy += domGap - 6;
      dom.rows.forEach(name => {
        const cy = yy + rowH / 2;
        S('text', { x: m.l - 10, y: cy + 4, 'text-anchor': 'end', class: 'cat-label', style: 'font-size:11.5px', text: name }, svg);
        const line = S('line', { y1: cy, y2: cy, style: 'stroke-width:3;stroke-linecap:round' }, svg);
        const cb = S('circle', { cy, r: 4.5, style: 'fill:var(--s-base);stroke:var(--surface);stroke-width:1.5' }, svg);
        const co = S('circle', { cy, r: 5, style: 'fill:var(--s-ours);stroke:var(--surface);stroke-width:1.5' }, svg);
        const lab = S('text', { y: cy + 4, class: 'val-label', style: 'font-size:10.5px;font-family:var(--f-mono)' }, svg);
        const hit = S('rect', { x: 0, y: yy, width: W, height: rowH, fill: 'transparent' }, svg);
        const r = { name, line, cb, co, lab };
        hover(hit, () => {
          const v = D.TABLE[name][dbGroup];
          return `<b>${name}</b><br><span class="k">Base</span> ${v.Base.s} → <b>${v.Ours.s}</b> (${sign(v.Ours.v - v.Base.v)})`;
        });
        rows.push(r);
        yy += rowH;
      });
      yy += 6;
    });
    el._rows = rows; el._x = x;
    placeDumbbell(el, dbPrev ? 1 : 0);
  });
  function placeDumbbell(el, t, from) {
    const x = el._x;
    el._rows.forEach(r => {
      const v = D.TABLE[r.name][dbGroup];
      const f = from ? D.TABLE[r.name][from] : null;
      const b = f ? f.Base.v + (v.Base.v - f.Base.v) * t : v.Base.v;
      const o = f ? f.Ours.v + (v.Ours.v - f.Ours.v) * t : v.Ours.v;
      r.cb.setAttribute('cx', x(b));
      r.co.setAttribute('cx', x(o));
      r.line.setAttribute('x1', x(b));
      r.line.setAttribute('x2', x(o));
      r.line.style.stroke = (o >= b) ? 'color-mix(in srgb, var(--pos) 45%, transparent)' : 'color-mix(in srgb, var(--neg) 55%, transparent)';
      const dlt = v.Ours.v - v.Base.v;
      r.lab.setAttribute('x', x(Math.max(b, o)) + 9);
      r.lab.textContent = sign(dlt);
      r.lab.style.fill = dlt >= 0 ? 'var(--pos)' : 'var(--neg)';
    });
  }
  // entrance animation: ours dot slides out from base
  (function () {
    const el = $('#dumbbell');
    const obs = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      if (REDUCED) return;
      const x = el._x; const t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / 1100), ease = 1 - Math.pow(1 - k, 3);
        el._rows.forEach((r, i) => {
          const v = D.TABLE[r.name][dbGroup];
          const kk = Math.min(1, Math.max(0, ease * 1.3 - i * 0.012));
          const o = v.Base.v + (v.Ours.v - v.Base.v) * kk;
          r.co.setAttribute('cx', x(o)); r.line.setAttribute('x2', x(o));
          r.lab.style.opacity = kk;
        });
        if (k < 1) requestAnimationFrame(step); else el._rows.forEach(r => r.lab.style.opacity = 1);
      };
      // start collapsed
      el._rows.forEach(r => { const v = D.TABLE[r.name][dbGroup]; r.co.setAttribute('cx', x(v.Base.v)); r.line.setAttribute('x2', x(v.Base.v)); r.lab.style.opacity = 0; });
      requestAnimationFrame(step);
    }), { threshold: 0.2 });
    obs.observe(el);
  })();
  segmented($('#dbSeg'), [['q8', 'Qwen3-VL-8B'], ['q32', '32B'], ['kimi', 'Kimi K3'], ['gpt5', 'GPT-5'], ['luna', 'GPT-6 Luna'], ['sol', 'GPT-6 Sol']], dbGroup, g => {
    const from = dbGroup; dbGroup = g; dbPrev = from;
    const el = $('#dumbbell');
    if (REDUCED) return placeDumbbell(el, 1);
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 650);
      placeDumbbell(el, 1 - Math.pow(1 - k, 3), from);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  /* ================================================================ INSIGHT 2: harness comparison */
  let hcSel = 'luna';
  const hcChart = chart($('#harnessCmp'), (el, W) => {
    const cfg = D.HARNESS.find(h => h.id === hcSel);
    $('#hcNote').textContent = cfg.note;
    const barH = 30, gap = 14;
    const m = { l: W < 480 ? 112 : 132, r: 50, t: 6, b: 26 };
    const Hh = m.t + cfg.bars.length * (barH + gap) - gap + m.b;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const x = lin(0, 60, m.l, W - m.r);
    [0, 20, 40, 60].forEach(v => {
      S('line', { x1: x(v), x2: x(v), y1: m.t - 4, y2: Hh - m.b + 2, class: v ? 'grid-line' : 'base-line' }, svg);
      S('text', { x: x(v), y: Hh - 8, 'text-anchor': 'middle', class: 'ax-label', text: v }, svg);
    });
    const ref = cfg.bars[0][1];
    cfg.bars.forEach(([name, v, col, tag], i) => {
      const yy = m.t + i * (barH + gap);
      const ours = name === 'OpenVLHarness';
      S('text', { x: m.l - 10, y: yy + barH / 2 + (tag ? -1 : 4), 'text-anchor': 'end', class: 'cat-label', style: ours ? 'font-weight:700;fill:var(--ink)' : '', text: name }, svg);
      if (tag) S('text', { x: m.l - 10, y: yy + barH / 2 + 12, 'text-anchor': 'end', class: 'ax-label', style: 'font-size:10.5px', text: tag }, svg);
      const r = S('rect', { x: x(0), y: yy, width: x(v) - x(0), height: barH, rx: 4, class: 'anim-hbar', style: `fill:var(${col});transition-delay:${i * 110}ms` }, svg);
      S('rect', { x: x(0), y: yy, width: 4, height: barH, class: 'anim-hbar', style: `fill:var(${col});transition-delay:${i * 110}ms` }, svg);
      S('text', { x: x(v) + 7, y: yy + barH / 2 + 4, class: 'val-label anim-fade' + (ours ? ' strong' : ''), style: `transition-delay:${500 + i * 110}ms`, text: v.toFixed(1) }, svg);
      hover(r, `<b>${name}</b><br>avg ${v.toFixed(2)}${hcSel !== 'q25' && i ? ` · ${sign(v - ref)} vs base` : ''}`);
    });
    if (hcSel !== 'q25') {
      S('line', { x1: x(ref), x2: x(ref), y1: m.t - 4, y2: Hh - m.b + 2, class: 'anim-fade', style: 'stroke:var(--ink-3);stroke-width:1.2;stroke-dasharray:3 3;transition-delay:.6s' }, svg);
    }
  });
  segmented($('#hcSeg'), D.HARNESS.map(h => [h.id, h.label]), hcSel, v => { hcSel = v; hcChart.draw(true); });

  /* ================================================================ TOOL USAGE BY DOMAIN (paper Fig. 7) */
  (function toolMix() {
    const box = $('#tmPies'); if (!box || !D.TOOL_MIX) return;
    const T = D.TOOL_MIX_TOOLS;
    const LBL = { Visual_Grounding: 'Visual Grounding', Zoom_In: 'Zoom-in', OCR: 'OCR', Depth_Estimation: 'Depth', Camera_Trajectory: 'Camera Traj.', Text_Search: 'Text Search', Image_Search: 'Image Search', Webpage_Visit: 'Webpage Visit', Python_Coding_Agent: 'Coding Agent' };
    // paper colors: perception blues, web oranges, coding purple
    const COL = { Visual_Grounding: '#1F6F8B', Zoom_In: '#3E8AA3', OCR: '#66A7BB', Depth_Estimation: '#93C3D1', Camera_Trajectory: '#BFDCE5', Text_Search: '#B4530A', Image_Search: '#CE7327', Webpage_Visit: '#E19A5C', Python_Coding_Agent: '#6A2E7A' };
    const DOMS = [['Counting and Grounding', 'Counting & Grounding'], ['Visual Search and Deep Research', 'Search & Deep Research'], ['General VQA and Hallucination', 'General VQA'], ['Spatial Understanding', 'Spatial']];
    const MODELS = [['8B', 'Qwen3-VL-8B'], ['32B', 'Qwen3-VL-32B'], ['luna', 'GPT-6 Luna'], ['sol', 'GPT-6 Sol']];
    let model = '8B', mode = 'micro';
    const fmt = n => n.toLocaleString('en-US');
    function render() {
      DOMS.forEach(([dk, dn], di) => {
        const c = D.TOOL_MIX[model][dk], v = c[mode], tot = v.reduce((a, b) => a + b, 0);
        const fig = H('figure', { class: 'tm-pie', style: `--d:${di * 110}ms` });
        fig.appendChild(H('figcaption', { class: 'tm-t' }, dn));
        const R = 70, C = 80, svg = S('svg', { viewBox: '0 0 160 160', width: 160, height: 160 }, fig);
        let a0 = -Math.PI / 2;
        T.forEach((t, i) => {
          if (!v[i]) return;
          const f = v[i] / tot, a1 = a0 + f * 2 * Math.PI;
          const el = f > 0.9995 ? S('circle', { cx: C, cy: C, r: R, fill: COL[t] }, svg)
            : S('path', { d: `M${C} ${C} L${(C + R * Math.cos(a0)).toFixed(2)} ${(C + R * Math.sin(a0)).toFixed(2)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${(C + R * Math.cos(a1)).toFixed(2)} ${(C + R * Math.sin(a1)).toFixed(2)}Z`, fill: COL[t] }, svg);
          el.setAttribute('stroke', 'var(--surface)'); el.setAttribute('stroke-width', '1.2');
          el.classList.add('tm-w');
          const pct = (100 * f).toFixed(1);
          hover(el, mode === 'micro'
            ? `<b>${LBL[t]}</b><br>${pct}% of calls · ${fmt(v[i])} calls`
            : `<b>${LBL[t]}</b><br>${pct}% of question–tool pairs<br>used on ${fmt(v[i])} of ${fmt(c.q)} questions (${(100 * v[i] / c.q).toFixed(1)}%)`);
          a0 = a1;
        });
        fig.appendChild(H('div', { class: 'tm-n' }, mode === 'micro' ? `${fmt(tot)} calls` : `${fmt(c.q)} questions`));
        box.appendChild(fig);
      });
    }
    // registered as a chart: sweeps in when scrolled into view and replays on every switch
    const tmChart = chart(box, render);
    segmented($('#tmModel'), MODELS, model, v => { model = v; tmChart.draw(true); });
    segmented($('#tmMode'), [['micro', 'Micro — every call'], ['inst', 'Per-instance — once per question']], mode, v => { mode = v; tmChart.draw(true); });
    $('#tmLegend').innerHTML = T.map(t => `<span><i style="background:${COL[t]}"></i>${LBL[t]}</span>`).join('');
  })();

  /* ================================================================ ABLATION TABLE (paper Table 2) */
  (function ablationTable() {
    const el = $('#ablTable'); if (!el) return;
    const COLS = [['Count & Ground', 'Counting & Grounding'], ['Search', 'Search & Deep Research'], ['General VQA', 'General VQA'], ['Spatial', 'Spatial'], ['Overall', 'Overall']];
    const SC = ['8B', '32B'];
    const shade = d => {
      const a = Math.min(1, Math.abs(d) / 8) * 42;            // % of the accent mixed into the cell
      return d >= 0 ? `color-mix(in srgb, var(--cap) ${a}%, transparent)` : `color-mix(in srgb, var(--ev) ${a}%, transparent)`;
    };
    let t = '<thead><tr><th rowspan="2" class="cfg">Configuration</th>' + COLS.map(([k, n]) => `<th colspan="2" class="dom${k === 'Overall' ? ' ov' : ''}">${n}</th>`).join('') + '</tr><tr>' +
      COLS.map(([k]) => SC.map((s, i) => `<th class="sc${i === 0 ? ' gs' : ''}${k === 'Overall' ? ' ov' : ''}">${s}</th>`).join('')).join('') + '</tr></thead><tbody>';
    D.ABL_STEPS.forEach((step, r) => {
      t += `<tr${r === D.ABL_STEPS.length - 1 ? ' class="full"' : ''}><th class="cfg">${step}</th>`;
      COLS.forEach(([k]) => SC.forEach((s, i) => {
        const v = D.ABLATION[s][k][r], prev = r ? D.ABLATION[s][k][r - 1] : null, d = prev == null ? null : v - prev;
        const ds = d == null ? '' : `<span class="d ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}</span>`;
        t += `<td class="${i === 0 ? 'gs' : ''}${k === 'Overall' ? ' ov' : ''}" style="${d == null ? '' : 'background:' + shade(d)}" title="${s} · ${k} · ${step}: ${v.toFixed(2)}${d == null ? '' : ` (${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)})`}"><b>${v.toFixed(1)}</b>${ds}</td>`;
      }));
      t += '</tr>';
    });
    el.innerHTML = t + '</tbody>';
  })();

  /* ================================================================ HARNESS OPTIMIZATION: failure causes + remedy channels by domain (Fig. 4a/b) */
  chart($('#failDomain'), (el, W) => {
    const narrow = W < 760;
    const PANELS = [
      { title: '(a) Primary failure cause, % of failures', keys: [
        ['NC', 'Tool not called', 'var(--cap)', '#fff'], ['Wrong', 'Tool output wrong', 'var(--ev)', '#fff'],
        ['UI', 'Output unusable or ignored', 'var(--s-octo)', '#fff'], ['Reas', 'Reasoning error', 'var(--mem)', '#fff'],
        ['Label', 'Label or question issue', 'var(--s-base)', 'var(--ink)']] },
      { title: '(b) Proposed remedy channel, % of failures', keys: [
        ['A', 'A · evidence interpretation', 'color-mix(in srgb, var(--cap) 100%, #000 18%)', '#fff'],
        ['B', 'B · output verification', 'var(--cap)', '#fff'],
        ['C', 'C · tool composition', 'color-mix(in srgb, var(--cap) 45%, var(--surface))', 'var(--ink)'],
        ['Y', 'Y · harness text', 'var(--ev)', '#fff'], ['Z', 'Z · no remedy', 'var(--s-base)', 'var(--ink)']] },
    ];
    // tiny (phones): row names sit above the bars instead of in a 152px column
    const tiny = W < 480;
    const rows = D.FAILURE, labW = tiny ? 0 : 152, barH = 24, rowH = tiny ? 50 : 36, top = tiny ? 16 : 0;
    const pw = narrow ? W : (W - 36) / 2;
    const lwOf = pi => (pi === 0 || narrow ? labW : 0);
    const itemW = lab => lab.length * 6.1 + 22;
    // lines each legend needs at its panel width, so the panel reserves exactly that height
    const legLines = PANELS.map((P, pi) => {
      let lx = lwOf(pi), n = 1;
      P.keys.forEach(([, lab]) => { if (lx + itemW(lab) > pw && lx > lwOf(pi)) { lx = lwOf(pi); n++; } lx += itemW(lab); });
      return n;
    });
    const phOf = pi => 26 + rows.length * rowH + 14 + legLines[pi] * 17;
    const ph = Math.max(phOf(0), phOf(1));
    const Hh = narrow ? phOf(0) + 16 + phOf(1) : ph;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    PANELS.forEach((P, pi) => {
      const ox = narrow ? 0 : pi * (pw + 36), oy = narrow && pi ? phOf(0) + 16 : 0;
      const lw = lwOf(pi);
      const sx = lin(0, 100, ox + lw, ox + pw - 4);
      S('text', { x: ox + lw, y: oy + 13, class: 'ax-title', style: `font-weight:600;fill:var(--ink-2)${tiny ? ';font-size:11.5px' : ''}`, text: P.title }, svg);
      rows.forEach((r, i) => {
        const y = oy + 26 + i * rowH + top;
        if (lw) S('text', { x: ox, y: y + barH / 2 + 4, class: 'cat-label', style: 'font-weight:600;fill:var(--ink)', text: r.name }, svg);
        else if (tiny) S('text', { x: ox, y: y - 5, class: 'cat-label', style: 'font-weight:600;fill:var(--ink)', text: r.name }, svg);
        let acc = 0;
        P.keys.forEach(([k, lab, col, tc], j) => {
          const v = r[k]; if (!v) { return; }
          const x0 = sx(acc) + (acc ? 1 : 0), x1 = sx(Math.min(100, acc + v)) - 1;
          const rect = S('rect', { x: x0, y, width: Math.max(1, x1 - x0), height: barH, rx: 3, class: 'anim-hbar', style: `fill:${col};transition-delay:${i * 90 + j * 110}ms` }, svg);
          if (x1 - x0 > 30) S('text', { x: (x0 + x1) / 2, y: y + barH / 2 + 4, 'text-anchor': 'middle', class: 'anim-fade', style: `fill:${tc};font-size:10.5px;font-weight:700;font-family:var(--f-mono);transition-delay:${600 + i * 90}ms`, text: Math.round(v) }, svg);
          hover(rect, `<b>${r.name}</b> · ${r.k} datasets, ${r.fail.toLocaleString()} failures<br>${lab}: <b>${v.toFixed(1)}%</b>`);
          acc += v;
        });
      });
      // legend
      let lx = ox + lw, ly = oy + 26 + rows.length * rowH + 14;
      P.keys.forEach(([k, lab, col]) => {
        const tw = itemW(lab);
        if (lx + tw > ox + pw && lx > ox + lw) { lx = ox + lw; ly += 17; }
        S('rect', { x: lx, y: ly - 8, width: 10, height: 10, rx: 2, style: `fill:${col}` }, svg);
        S('text', { x: lx + 14, y: ly + 1, class: 'ax-label', style: 'font-size:11px', text: lab }, svg);
        lx += tw;
      });
    });
  });

  /* ================================================================ INSIGHT 5: remedy profile + specialization gains */
  chart($('#remedy'), (el, W) => {
    const narrow = W < 440;
    const rowH = narrow ? 74 : 60;
    const m = { t: 40, b: 30 };
    const labW = narrow ? 0 : 92;
    const leftW = narrow ? W : (W - labW) * 0.48;
    const gapW = 26;
    const rx0 = narrow ? 0 : labW + leftW + gapW;
    const rW = narrow ? W : W - rx0;
    const rows = D.REMEDY;
    const Hh = narrow ? m.t + rows.length * rowH * 2 + 40 : m.t + rows.length * rowH + m.b;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);

    const sx = lin(0, 100, narrow ? 0 : labW, narrow ? W - 10 : labW + leftW);
    const gx0 = narrow ? 84 : rx0 + 10;
    const gx = lin(-2, 9, gx0, (narrow ? W : rx0 + rW) - 34);
    const gTop = narrow ? m.t + rows.length * rowH + 30 : m.t;

    S('text', { x: narrow ? 0 : labW, y: 14, class: 'ax-title', style: 'font-weight:600;fill:var(--ink-2)', text: 'Proposed remedy, % of failures' }, svg);
    S('text', { x: narrow ? 0 : gx0, y: narrow ? gTop - 22 : 14, class: 'ax-title', style: 'font-weight:600;fill:var(--ink-2)', text: 'Gain after specialization (pts)' }, svg);
    const lg2 = S('g', {}, svg);
    const lgy = narrow ? gTop - 8 : 30;
    S('rect', { x: gx0, y: lgy - 8, width: 10, height: 8, rx: 2, style: 'fill:var(--ev)' }, lg2);
    S('text', { x: gx0 + 14, y: lgy, class: 'ax-label', style: 'font-size:11px', text: 'harness search' }, lg2);
    S('rect', { x: gx0 + 104, y: lgy - 8, width: 10, height: 8, rx: 2, style: 'fill:var(--cap)' }, lg2);
    S('text', { x: gx0 + 118, y: lgy, class: 'ax-label', style: 'font-size:11px', text: 'tool generation' }, lg2);

    // zero line + ticks for gains
    const gBottom = gTop + rows.length * rowH;
    [0, 4, 8].forEach(v => {
      S('line', { x1: gx(v), x2: gx(v), y1: gTop + 4, y2: gBottom - 6, class: v ? 'grid-line' : 'base-line', style: v ? '' : 'stroke:var(--ink-3)' }, svg);
      S('text', { x: gx(v), y: gBottom + 8, 'text-anchor': 'middle', class: 'ax-label', text: v ? '+' + v : '0' }, svg);
    });

    rows.forEach((r, i) => {
      const yy = m.t + i * rowH;
      const by = yy + 12, bh = 22;
      S('text', { x: 0, y: narrow ? by - 4 : by + bh / 2 + 4, class: 'cat-label', style: 'font-weight:600;fill:var(--ink)', text: r.name }, svg);
      let acc = 0;
      [['tool', 'var(--cap)', 'tools'], ['text', 'var(--ev)', 'text'], ['none', 'var(--s-base)', 'none']].forEach(([k, col, lab], j) => {
        const v = r[k]; if (!v) return;
        const x0 = sx(acc) + (acc ? 1 : 0), x1 = sx(acc + v) - 1;
        const rect = S('rect', { x: x0, y: narrow ? by + 2 : by, width: Math.max(1, x1 - x0), height: bh, rx: 3, class: 'anim-hbar', style: `fill:${col};transition-delay:${i * 120 + j * 160}ms` }, svg);
        if (v >= 12) S('text', { x: (x0 + x1) / 2, y: (narrow ? by + 2 : by) + bh / 2 + 4, 'text-anchor': 'middle', class: 'anim-fade', style: `fill:#fff;font-size:11px;font-weight:700;transition-delay:${600 + i * 120}ms`, text: v + '%' }, svg);
        hover(rect, `<b>${r.name}</b><br>${lab === 'tools' ? 'New task-specific tools (A+B+C)' : lab === 'text' ? 'Harness text edits (Y)' : 'No proposed remedy (Z)'}: <b>${v}%</b>`);
        acc += v;
      });
      // gains
      const gy = narrow ? gTop + i * rowH : yy;
      if (narrow) S('text', { x: 0, y: gy + 27, class: 'cat-label', style: 'font-weight:600;fill:var(--ink)', text: r.name }, svg);
      [['hs', 'var(--ev)', 'Harness search'], ['tg', 'var(--cap)', 'Tool generation']].forEach(([k, col, lab], j) => {
        const v = r[k];
        const y0 = gy + 10 + j * 15, h = 12;
        const xa = Math.min(gx(0), gx(v)), w = Math.max(2, Math.abs(gx(v) - gx(0)));
        const rect = S('rect', { x: xa, y: y0, width: w, height: h, rx: 3, class: 'anim-hbar', style: `fill:${col};transform-origin:${v >= 0 ? '0' : '100%'} 50%;transition-delay:${900 + i * 120 + j * 100}ms` }, svg);
        S('text', { x: v >= 0 ? gx(v) + 5 : gx(v) - 5, y: y0 + 10, 'text-anchor': v >= 0 ? 'start' : 'end', class: 'val-label anim-fade', style: `font-size:10.5px;font-family:var(--f-mono);${Math.abs(v) >= 3 ? 'font-weight:700;fill:var(--ink)' : ''};transition-delay:${1200 + i * 120}ms`, text: (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) }, svg);
        hover(rect, `<b>${r.name}</b> · ${lab}<br>${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} points over the unoptimized harness`);
      });
    });
  });

  /* ================================================================ EXAMPLES GALLERY */
  (function gallery() {
    const EX = window.OVH_EXAMPLES || [];
    if (!EX.length) return;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const CAPS = {
      grounding: ['Grounding', 'i-ground'], zoom: ['Zoom-in', 'i-zoom'], ocr: ['OCR', 'i-ocr'], depth: ['Depth', 'i-depth'],
      camera: ['Camera trajectory', 'i-camera'], tsearch: ['Text search', 'i-tsearch'], isearch: ['Image search', 'i-isearch'],
      web: ['Webpage visit', 'i-web'], code: ['Coding agent', 'i-code'],
    };
    const TAG2CAP = { grounding: 'grounding', zoom: 'zoom', ocr: 'ocr', depth: 'depth', 'camera-trajectory': 'camera', 'text-search': 'tsearch', 'image-search': 'isearch', 'webpage-visit': 'web', code: 'code' };
    const DOMS = [['all', 'All tasks'], ['count', 'Counting & Grounding'], ['search', 'Search'], ['vqa', 'General VQA'], ['spatial', 'Spatial']];
    const DOMNAME = Object.fromEntries(DOMS);
    const icon = (k, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${CAPS[k][1]}"/></svg>`;
    EX.forEach(e => { e.caps = e.tags.map(t => TAG2CAP[t]).filter(Boolean); });

    const st = { domain: 'all', model: 'all', caps: new Set() };
    let shown = EX;

    function scoreMark(e) {
      if (e.score === 1 || e.correct === true) return '<span class="ok">✓</span>';
      if (typeof e.score === 'number' && e.score > 0) return `<span class="ok part" title="partial credit">≈</span>`;
      return '';
    }
    // gallery grid and filters (only when the gallery section is on the page)
    if ($('#exgGrid')) {
    // filters
      segmented($('#exgDomain'), DOMS.map(([k, l]) => [k, `${l} <span class="n">${k === 'all' ? EX.length : EX.filter(e => e.domain === k).length}</span>`]), 'all', v => { st.domain = v; render(); });
      const sel = $('#exgModel');
      sel.innerHTML = '<option value="all">All backbones</option>' + [...new Set(EX.map(e => e.model))].map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
      sel.addEventListener('change', () => { st.model = sel.value; render(); });
      const tagsEl = $('#exgTags');
      tagsEl.innerHTML = '<span class="exg-tags-l">Uses</span>' + Object.keys(CAPS).map(k => `<button type="button" class="tagchip" data-cap="${k}" aria-pressed="false">${icon(k)}${CAPS[k][0]}</button>`).join('') +
        '<button type="button" class="tagclear" id="exgClear" hidden>Clear</button>';
      tagsEl.addEventListener('click', e => {
        const b = e.target.closest('.tagchip');
        if (b) {
          const k = b.dataset.cap;
          st.caps.has(k) ? st.caps.delete(k) : st.caps.add(k);
          b.setAttribute('aria-pressed', st.caps.has(k));
          render();
        } else if (e.target.id === 'exgClear') {
          st.caps.clear(); $$('.tagchip', tagsEl).forEach(x => x.setAttribute('aria-pressed', 'false')); render();
        }
      });


      function render() {
        shown = EX.filter(e => (st.domain === 'all' || e.domain === st.domain) && (st.model === 'all' || e.model === st.model) && [...st.caps].every(c => e.caps.includes(c)));
        $('#exgClear').hidden = !st.caps.size;
        $('#exgCount').textContent = shown.length === EX.length ? `${EX.length} examples` : `Showing ${shown.length} of ${EX.length} examples`;
        const grid = $('#exgGrid');
        if (!shown.length) { grid.innerHTML = '<p class="exg-empty">No example uses all of the selected capabilities. Try removing a filter.</p>'; return; }
        grid.innerHTML = shown.map((e, i) => {
          const inp = e.inputs[0];
          const alt = (e.steps.find(s => s.imgs.length) || {}).imgs?.[0];
          return `<button type="button" class="exg-card" data-i="${i}" style="animation-delay:${Math.min(i, 12) * 40}ms">
            <div class="thumb">
              <img src="${inp.src}" alt="" loading="lazy">
              ${alt ? `<img class="alt" src="${alt.src}" alt="" loading="lazy">` : ''}
              <span class="badge-n">${e.inPaper ? 'Ex. ' + e.num : 'Extra'}</span>
              ${e.inputs.length > 1 ? `<span class="badge-k">${e.inputs.length} images</span>` : ''}
            </div>
            <div class="body">
              <div class="meta">${esc(e.dataset)} · ${esc(e.model)}</div>
              <div class="q">${esc(e.question.split('\n')[0])}</div>
              <div class="foot"><span class="tools">${e.caps.map(c => `<span title="${CAPS[c][0]}">${icon(c)}</span>`).join('')}</span><span class="calls">${e.steps.length} calls</span></div>
            </div></button>`;
        }).join('');
      }
      render();
      $('#exgGrid').addEventListener('click', e => {
        const c = e.target.closest('.exg-card'); if (!c) return;
        const ex = shown[+c.dataset.i];
        if (window.OVHPlayer) {
          // keep the clicked card where it is on screen, even if the figure above changes height
          const before = c.getBoundingClientRect().top;
          window.OVHPlayer.load(ex.id);
          const fix = () => { const d = c.getBoundingClientRect().top - before; if (Math.abs(d) > 1) window.scrollBy(0, d); };
          fix(); requestAnimationFrame(fix);
        }
        else open(+c.dataset.i);
      });
      const markPlaying = id => $$('.exg-card', $('#exgGrid')).forEach(c => c.classList.toggle('playing', shown[+c.dataset.i] && shown[+c.dataset.i].id === id));
      window.addEventListener('ovh:load', e => markPlaying(e.detail));
      const _render = render;
      render = function () { _render(); if (window.OVHPlayer) markPlaying(window.OVHPlayer.current()); };
    }
    window.OVHGallery = { openById: id => { let k = shown.findIndex(x => x.id === id); if (k < 0) { shown = EX; k = EX.findIndex(x => x.id === id); } open(k); } };

    // viewer
    const exv = $('#exv');
    let cur = 0, lastFocus = null;
    function fmtArgs(a) {
      if (!a || typeof a !== 'object') return esc(a);
      return Object.entries(a).map(([k, v]) => `<span class="k">${esc(k)}</span>: ${esc(typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v))}`).join('\n');
    }
    function imgFig(im, cls = '') { return `<figure class="${cls}"><img src="${im.src}" alt="${esc(im.h)}" loading="lazy" data-zoom><figcaption>${esc(im.h)}</figcaption></figure>`; }
    function textBlock(t, n = 360) {
      if (!t) return '';
      if (t.length <= n) return `<pre class="st-out">${esc(t)}</pre>`;
      return `<pre class="st-out">${esc(t.slice(0, n).replace(/\s+\S*$/, ''))} …</pre><details class="st-more"><summary>Full tool output</summary><pre class="st-out">${esc(t)}</pre></details>`;
    }
    function open(i) {
      cur = (i + shown.length) % shown.length;
      const e = shown[cur];
      $('#exvMeta').innerHTML = `<span class="pill">${e.inPaper ? 'Example ' + e.num + ' · in paper' : 'Extra example'}</span><span>${esc(e.dataset)}</span><span>${esc(e.model)}</span><span>${esc(DOMNAME[e.domain])}</span>`;
      const ov = e.overview || {};
      const ovRows = [['task', 'Task'], ['why it is hard', 'Why it is hard'], ['how the agent solves it', 'How the agent solves it'], ['how the agent approaches it', 'How the agent approaches it'], ['caveat', 'Caveat']]
        .filter(([k]) => ov[k]).map(([k, l]) => `<div class="ov-row"><dt>${l}</dt><dd>${ov[k]}</dd></div>`).join('');
      const ans = [];
      if (e.notool) ans.push(`<div class="ans notool"><div class="al">${esc(e.model)} without tools</div><div class="av">${e.notool /* pre-escaped by build_examples.py */}</div></div>`);
      ans.push(`<div class="ans ours"><div class="al">+ OpenVLHarness ${scoreMark(e)}</div><div class="av">${esc(e.pred)}</div></div>`);
      if (e.gt) ans.push(`<div class="ans gt"><div class="al">Ground truth</div><div class="av">${esc(e.gt)}</div></div>`);
      const steps = e.steps.map((s, k) => {
        const name = CAPS[s.cap] ? CAPS[s.cap][0] : s.tool;
        return `<li class="st">
          <div class="st-rail"><span class="st-n">${k + 1}</span></div>
          <div class="st-main">
            <div class="st-h">${s.cap ? icon(s.cap) : ''}<span class="nm">${esc(name)}</span><code>${esc(s.tool)}</code></div>
            ${s.say ? `<p class="st-say">${esc(s.say)}</p>` : ''}
            <pre class="st-args">${fmtArgs(s.args)}</pre>
            ${s.imgs.length ? `<div class="st-imgs">${s.imgs.map(im => imgFig(im)).join('')}</div>` : ''}
            ${s.code ? `<details class="st-code"><summary>Generated program · ${s.code.split('\n').length} lines</summary><pre>${esc(s.code)}</pre></details>` : ''}
            ${s.code ? (s.out ? `<div class="st-ol">Execution output</div>${textBlock(s.out, 500)}` : '') : textBlock(s.out)}
          </div></li>`;
      }).join('');
      $('#exvBody').innerHTML = `
        <h3 id="exvTitle" class="exv-q">${esc(e.question)}</h3>
        <div class="exv-inputs ${e.inputs.length > 3 ? 'many' : ''}">${e.inputs.map(im => imgFig(im)).join('')}</div>
        ${ovRows ? `<dl class="exv-ov">${ovRows}</dl>` : ''}
        <div class="exv-ans">${ans.join('')}</div>
        <div class="exv-sub">Trajectory · ${e.steps.length} tool calls</div>
        <ol class="steps-tl">${steps}</ol>
        <div class="exv-final"><svg><use href="#i-check"/></svg>Final answer: <b>${esc(e.pred)}</b></div>`;
      $('.exv-body', exv).scrollTop = 0;
      if (exv.hidden) {
        lastFocus = document.activeElement;
        exv.hidden = false;
        document.documentElement.classList.add('modal-open');
        requestAnimationFrame(() => exv.classList.add('show'));
        $('[data-close].ctl', exv).focus({ preventScroll: true });
      }
    }
    function close() {
      exv.classList.remove('show');
      document.documentElement.classList.remove('modal-open');
      setTimeout(() => { exv.hidden = true; }, 200);
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    }
    exv.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) close();
      const z = e.target.closest('[data-zoom]');
      if (z) lightbox(z.src, z.alt);
    });
    $('#exvPrev').addEventListener('click', () => open(cur - 1));
    $('#exvNext').addEventListener('click', () => open(cur + 1));
    // keep Tab / Shift+Tab inside an open modal
    function trapTab(ev, root) {
      if (ev.key !== 'Tab') return;
      const f = [...root.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(e => e.offsetParent !== null);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1], cur = document.activeElement;
      if (!root.contains(cur)) { ev.preventDefault(); a.focus(); }
      else if (ev.shiftKey && cur === a) { ev.preventDefault(); z.focus(); }
      else if (!ev.shiftKey && cur === z) { ev.preventDefault(); a.focus(); }
    }
    const lb = $('#lightbox');
    function lightbox(src, cap) { $('img', lb).src = src; $('.lb-cap', lb).textContent = cap; lb.hidden = false; }
    lb.addEventListener('click', () => { lb.hidden = true; });
    document.addEventListener('keydown', e => {
      // closing the image viewer consumes this Escape, so dialogs underneath stay open
      if (!lb.hidden && e.key === 'Escape') { lb.hidden = true; e.preventDefault(); return; }
      if (exv.hidden || e.defaultPrevented) return;
      if (lb.hidden) trapTab(e, exv);
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') open(cur + 1);
      else if (e.key === 'ArrowLeft') open(cur - 1);
    });
  })();

  /* ================================================================ RESULTS TABLE */
  (function table() {
    const NAMES = { Base: 'Base', OT: 'OctoTools', VS: 'Visual<br>Sketchpad', CX: 'Codex<br><span class="ver">v0.155.1</span>', Ours: 'Ours' };
    const ORDER = ['q8', 'q32', 'gpt5', 'kimi', 'luna', 'sol'];
    function render() {
      const groups = ORDER.map(id => D.GROUPS.find(g => g.id === id));
      let h = '<thead><tr class="grp"><th class="first" rowspan="2" style="vertical-align:bottom">Dataset</th>';
      groups.forEach(g => h += `<th colspan="${g.methods.length}" class="gstart">${g.name}</th>`);
      h += '</tr><tr class="sub">';
      groups.forEach(g => g.methods.forEach((m, i) => h += `<th class="${i === 0 ? 'gstart' : ''} ${m === 'Ours' ? 'ours' : ''}">${NAMES[m]}</th>`));
      h += '</tr></thead><tbody>';
      const rowHtml = (name, cls) => {
        const all = [];
        groups.forEach(g => g.methods.forEach(m => all.push(D.TABLE[name][g.id][m].v)));
        const gmax = Math.max(...all);
        let r = `<tr class="${cls || ''}"><td class="first">${name}</td>`;
        groups.forEach(g => {
          const vals = g.methods.map(m => D.TABLE[name][g.id][m]);
          const mx = Math.max(...vals.map(v => v.v));
          vals.forEach((v, i) => {
            const c = [i === 0 ? 'gstart' : '', g.methods[i] === 'Ours' ? 'ours' : '', v.v === mx ? 'best' : '', v.v === gmax ? 'gbest' : ''].join(' ');
            r += `<td class="${c}">${v.s}</td>`;
          });
        });
        return r + '</tr>';
      };
      const ncol = groups.reduce((a, g) => a + g.methods.length, 0);
      D.DOMAINS.forEach(dom => {
        h += `<tr class="dom"><td class="first">${dom.name}</td><td colspan="${ncol}"></td></tr>`;
        dom.rows.forEach(n => h += rowHtml(n));
      });
      h += rowHtml('Average', 'avg') + '</tbody>';
      $('#resTable').innerHTML = h;
    }
    render();
  })();

  /* ================================================================ CITE */
  $('#copyBib').addEventListener('click', async () => {
    const txt = $('#bibText').textContent;
    try { await navigator.clipboard.writeText(txt); }
    catch (e) {
      const ta = H('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {} ta.remove();
    }
    const s = $('#copyBib span'); s.textContent = 'Copied!';
    setTimeout(() => s.textContent = 'Copy', 1600);
  });

  /* ================================================================ reveal + nav highlight */
  $$('.reveal').forEach(e => io.observe(e));
  charts.forEach(c => io.observe(c.el));
  const navLinks = $$('.nav-links a');
  const navObs = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach(a => { const sec = $(a.getAttribute('href')); if (sec) navObs.observe(sec); });
})();
