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
  const fmt1 = v => v.toFixed(1);
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

  /* ================================================================ HERO: grouped bars */
  chart($('#heroBars'), (el, W) => {
    const data = D.BACKBONES;
    const Hh = W < 480 ? 250 : 280;
    const m = { l: 30, r: 6, t: 34, b: 44 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const y = lin(0, 75, Hh - m.b, m.t);
    [0, 20, 40, 60].forEach(v => {
      S('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v ? 'grid-line' : 'base-line' }, svg);
      S('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-label', text: v }, svg);
    });
    const gw = (W - m.l - m.r) / data.length;
    const bw = Math.min(30, gw * 0.3);
    data.forEach((d, i) => {
      const cx = m.l + gw * (i + 0.5);
      const xb = cx - bw - 1.5, xo = cx + 1.5;
      const delay = i * 90;
      const rb = S('rect', { x: xb, y: y(d.base), width: bw, height: y(0) - y(d.base), rx: 4, class: 'anim-bar', style: `fill:var(--s-base);transition-delay:${delay}ms` }, svg);
      const ro = S('rect', { x: xo, y: y(d.ours), width: bw, height: y(0) - y(d.ours), rx: 4, class: 'anim-bar', style: `fill:var(--s-ours);transition-delay:${delay + 120}ms` }, svg);
      // square off the bottom corners
      S('rect', { x: xb, y: y(0) - 4, width: bw, height: 4, class: 'anim-bar', style: `fill:var(--s-base);transition-delay:${delay}ms` }, svg);
      S('rect', { x: xo, y: y(0) - 4, width: bw, height: 4, class: 'anim-bar', style: `fill:var(--s-ours);transition-delay:${delay + 120}ms` }, svg);
      if (bw >= 22) {
        S('text', { x: xb + bw / 2, y: y(d.base) - 5, 'text-anchor': 'middle', class: 'val-label anim-fade', style: `transition-delay:${delay + 700}ms;font-size:10.5px`, text: fmt1(d.base) }, svg);
      }
      S('text', { x: xo + bw / 2, y: y(d.ours) - 5, 'text-anchor': 'middle', class: 'val-label strong anim-fade', style: `transition-delay:${delay + 800}ms;font-size:10.5px`, text: fmt1(d.ours) }, svg);
      // delta chip row
      const g = S('g', { class: 'delta-chip anim-fade', style: `transition-delay:${delay + 900}ms` }, svg);
      const txt = '+' + (d.ours - d.base).toFixed(1);
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
      const hit = S('rect', { x: cx - gw / 2, y: m.t, width: gw, height: Hh - m.t - m.b, fill: 'transparent' }, svg);
      hover(hit, `<b>${d.name}</b><br><span class="k">Base</span> ${d.base.toFixed(2)}<br><span class="k">+ OpenVLHarness</span> <b>${d.ours.toFixed(2)}</b> (${txt})`);
      [rb, ro].forEach(r => r.setAttribute('pointer-events', 'none'));
    });
  });

  /* ================================================================ HERO: pareto */
  const lg = $('#paretoLegend');
  D.EFFORT.forEach(s => lg.appendChild(H('span', {}, `<i style="background:var(${s.color})"></i>${s.name}`)));
  lg.appendChild(H('span', {}, `<i class="line" style="background:repeating-linear-gradient(90deg,var(--ink-3) 0 4px,transparent 4px 7px)"></i>Pareto frontier`));

  chart($('#heroPareto'), (el, W) => {
    const Hh = W < 480 ? 260 : 288;
    const m = { l: 34, r: 16, t: 14, b: 40 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const lx = lin(Math.log10(0.5), Math.log10(5), m.l, W - m.r);
    const x = v => lx(Math.log10(v));
    const y = lin(45, 71, Hh - m.b, m.t);
    [45, 50, 55, 60, 65, 70].forEach(v => {
      S('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 45 ? 'base-line' : 'grid-line' }, svg);
      S('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-label', text: v }, svg);
    });
    [0.5, 1, 2, 4].forEach(v => S('text', { x: x(v), y: Hh - m.b + 16, 'text-anchor': 'middle', class: 'ax-label', text: '$' + v }, svg));
    S('text', { x: (m.l + W - m.r) / 2, y: Hh - 6, 'text-anchor': 'middle', class: 'ax-title', text: 'Model-token cost, $ per 1k questions (log scale)' }, svg);

    // pareto frontier across all points
    const pts = [];
    D.EFFORT.forEach(s => s.cost.forEach((c, i) => pts.push([c, s.score[i]])));
    pts.sort((a, b) => a[0] - b[0]);
    const front = []; let best = -1;
    pts.forEach(p => { if (p[1] > best) { front.push(p); best = p[1]; } });
    const fpath = front.map((p, i) => (i ? 'L' : 'M') + x(p[0]) + ',' + y(p[1])).join(' ') + ` L${W - m.r},${y(best)}`;
    // region dominated by the frontier
    S('path', { d: fpath + ` L${W - m.r},${Hh - m.b} L${x(front[0][0])},${Hh - m.b} Z`, class: 'anim-fade', style: 'fill:var(--cap-soft);transition-delay:1.4s;fill-opacity:.6' }, svg);
    S('path', { d: fpath, class: 'anim-fade', style: 'fill:none;stroke:var(--ink-3);stroke-width:1.5;stroke-dasharray:4 4;transition-delay:1.6s' }, svg);
    D.EFFORT.forEach((s, si) => {
      const isOurs = s.key === 'ours';
      const d = s.cost.map((c, i) => (i ? 'L' : 'M') + x(c) + ',' + y(s.score[i])).join(' ');
      S('path', { d, pathLength: 1, class: 'anim-line', style: `fill:none;stroke:var(${s.color});stroke-width:${isOurs ? 2.5 : 2};stroke-linejoin:round;stroke-linecap:round;transition-delay:${si * 150}ms` }, svg);
      s.cost.forEach((c, i) => {
        const cx = x(c), cy = y(s.score[i]);
        const r = isOurs ? 5 : 4;
        S('circle', { cx, cy, r, class: 'anim-pop', style: `fill:var(${s.color});stroke:var(--surface);stroke-width:2;transition-delay:${400 + si * 150 + i * 110}ms` }, svg);
        const hit = S('circle', { cx, cy, r: 11, fill: 'transparent' }, svg);
        hover(hit, `<b>${s.name}</b> · ${D.EFFORTS[i]} effort<br>score <b>${s.score[i].toFixed(2)}</b> · $${c.toFixed(2)} / 1k q`);
        if (isOurs && (i === 0 || i === 3)) {
          S('text', { x: cx + (i === 0 ? -8 : 8), y: cy - 10, 'text-anchor': i === 0 ? 'end' : 'middle', class: 'val-label anim-fade', style: 'transition-delay:1.5s;font-size:10.5px', text: D.EFFORTS[i] }, svg);
        }
      });
    });
    // direct label for ours + annotation
    const o = D.EFFORT[3];
    S('text', { x: x(o.cost[3]) + 9, y: y(o.score[3]) + 4, class: 'val-label strong anim-fade', style: 'transition-delay:1.6s', text: o.score[3].toFixed(1) }, svg);
    const ax = x(o.cost[0]), ay = y(o.score[0]);
    const ann = S('g', { class: 'anim-fade', style: 'transition-delay:1.9s' }, svg);
    S('text', { x: ax + 10, y: ay + 22, class: 'val-label', style: 'font-size:11px', text: 'medium effort already beats' }, ann);
    S('text', { x: ax + 10, y: ay + 36, class: 'val-label', style: 'font-size:11px', text: 'every baseline at max' }, ann);
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

  /* ================================================================ INSIGHT 3: effort scaling */
  const el3 = $('#effortLegend');
  D.EFFORT.forEach(s => el3.appendChild(H('span', {}, `<i class="line" style="background:var(${s.color})"></i>${s.name}`)));
  chart($('#effortChart'), (el, W) => {
    const Hh = 270;
    const m = { l: 34, r: 44, t: 14, b: 34 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const x = i => m.l + 16 + i * (W - m.l - m.r - 32) / 3;
    const y = lin(45, 71, Hh - m.b, m.t);
    [45, 50, 55, 60, 65, 70].forEach(v => {
      S('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 45 ? 'base-line' : 'grid-line' }, svg);
      S('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-label', text: v }, svg);
    });
    D.EFFORTS.forEach((e, i) => S('text', { x: x(i), y: Hh - m.b + 18, 'text-anchor': 'middle', class: 'ax-label', text: e }, svg));
    S('text', { x: (m.l + W - m.r) / 2, y: Hh - 2, 'text-anchor': 'middle', class: 'ax-title', text: 'reasoning effort' }, svg);
    // gap annotation: ours@medium vs best baseline@max
    const bestMax = Math.max(...D.EFFORT.filter(s => s.key !== 'ours').map(s => s.score[3]));
    const g = S('g', { class: 'anim-fade', style: 'transition-delay:1.6s' }, svg);
    S('line', { x1: x(0), x2: x(3), y1: y(D.EFFORT[3].score[0]), y2: y(D.EFFORT[3].score[0]), style: 'stroke:var(--cap);stroke-width:1;stroke-dasharray:3 4' }, g);
    S('text', { x: x(3) - 2, y: y(D.EFFORT[3].score[0]) + 15, 'text-anchor': 'end', class: 'val-label', style: 'font-size:10.5px;fill:var(--cap)', text: `ours @ medium (62.9) > best baseline @ max (${bestMax.toFixed(1)})` }, g);
    D.EFFORT.forEach((s, si) => {
      const isOurs = s.key === 'ours';
      const d = s.score.map((v, i) => (i ? 'L' : 'M') + x(i) + ',' + y(v)).join(' ');
      S('path', { d, pathLength: 1, class: 'anim-line', style: `fill:none;stroke:var(${s.color});stroke-width:${isOurs ? 2.5 : 2};stroke-linejoin:round;transition-delay:${si * 160}ms` }, svg);
      s.score.forEach((v, i) => {
        S('circle', { cx: x(i), cy: y(v), r: isOurs ? 5 : 4, class: 'anim-pop', style: `fill:var(${s.color});stroke:var(--surface);stroke-width:2;transition-delay:${300 + si * 160 + i * 100}ms` }, svg);
        const hit = S('circle', { cx: x(i), cy: y(v), r: 11, fill: 'transparent' }, svg);
        hover(hit, `<b>${s.name}</b> · ${D.EFFORTS[i]}<br>score <b>${v.toFixed(2)}</b> · $${s.cost[i].toFixed(2)} / 1k q`);
      });
    });
    S('text', { x: x(3) + 9, y: y(D.EFFORT[3].score[3]) + 4, class: 'val-label strong anim-fade', style: 'transition-delay:1.2s', text: '68.6' }, svg);
  });

  /* ================================================================ INSIGHT 4: ablation staircase */
  let abM = '8B', abD = 'Overall';
  const abChart = chart($('#ablation'), (el, W) => {
    const vals = D.ABLATION[abM][abD];
    const Hh = 290;
    const m = { l: 30, r: 6, t: 26, b: 46 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, height: Hh }, el);
    const top = Math.ceil((Math.max(...vals) + 6) / 10) * 10;
    const y = lin(0, top, Hh - m.b, m.t);
    for (let v = 0; v <= top; v += top > 60 ? 20 : 10) {
      S('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v ? 'grid-line' : 'base-line' }, svg);
      S('text', { x: m.l - 7, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-label', text: v }, svg);
    }
    const gw = (W - m.l - m.r) / vals.length;
    const bw = Math.min(64, gw * 0.62);
    vals.forEach((v, i) => {
      const cx = m.l + gw * (i + 0.5), x0 = cx - bw / 2;
      const prev = i ? vals[i - 1] : 0;
      const d = v - prev;
      const last = i === vals.length - 1;
      const delay = i * 220;
      // body (carry-over)
      const body = Math.min(v, prev || v);
      if (i) S('rect', { x: x0, y: y(body), width: bw, height: y(0) - y(body), class: 'anim-bar', style: `fill:color-mix(in srgb, var(--ink-3) 18%, transparent);transition-delay:${delay}ms` }, svg);
      else S('rect', { x: x0, y: y(v), width: bw, height: y(0) - y(v), rx: 4, class: 'anim-bar', style: `fill:var(--s-base);transition-delay:${delay}ms` }, svg);
      if (i) {
        const yTop = y(Math.max(v, prev)), hgt = Math.max(2, Math.abs(y(v) - y(prev)));
        const col = d >= 0 ? (last ? 'var(--mem)' : 'var(--cap)') : 'var(--neg)';
        S('rect', { x: x0, y: yTop, width: bw, height: hgt, rx: 3, class: 'anim-bar', style: `fill:${col};transition-delay:${delay + 200}ms;transform-origin:50% ${d >= 0 ? '100%' : '0'}` }, svg);
        // connector from previous bar top
        S('line', { x1: x0 - (gw - bw), x2: x0, y1: y(prev), y2: y(prev), class: 'anim-fade', style: `stroke:var(--ink-3);stroke-width:1;stroke-dasharray:2 3;transition-delay:${delay}ms` }, svg);
        S('text', { x: cx, y: yTop - 18, 'text-anchor': 'middle', class: 'val-label anim-fade', style: `fill:${col};font-weight:700;font-family:var(--f-mono);font-size:11px;transition-delay:${delay + 450}ms`, text: sign(d) }, svg);
      }
      S('text', { x: cx, y: y(Math.max(v, prev)) - 5, 'text-anchor': 'middle', class: 'val-label anim-fade' + (last ? ' strong' : ''), style: `transition-delay:${delay + 450}ms`, text: v.toFixed(1) }, svg);
      const lbl = D.ABL_STEPS[i].split(' ');
      const t = S('text', { x: cx, y: Hh - m.b + 16, 'text-anchor': 'middle', class: 'cat-label', style: 'font-size:11px' }, svg);
      if (lbl.length > 2) {
        S('tspan', { x: cx, dy: 0, text: lbl[0] + ' ' + lbl[1] }, t);
        S('tspan', { x: cx, dy: 13, text: lbl.slice(2).join(' ') }, t);
      } else S('tspan', { x: cx, dy: 0, text: D.ABL_STEPS[i] }, t);
      const hit = S('rect', { x: cx - gw / 2, y: m.t, width: gw, height: Hh - m.t - m.b, fill: 'transparent' }, svg);
      hover(hit, `<b>${D.ABL_STEPS[i]}</b><br>${abD} · Qwen3-VL-${abM}: <b>${v.toFixed(2)}</b>${i ? ` (${sign(d)})` : ''}`);
    });
  });
  segmented($('#abModel'), [['8B', 'Qwen3-VL-8B'], ['32B', '32B']], abM, v => { abM = v; abChart.draw(true); });
  segmented($('#abDomain'), ['Overall', 'Count & Ground', 'Search', 'General VQA', 'Spatial'].map(d => [d, d]), abD, v => { abD = v; abChart.draw(true); });

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

  /* ================================================================ METHOD: animated figure */
  (function methodFigure() {
    const IM = 'static/images/';
    const IMGS = {
      in1: { h: 'input_image_1', src: IM + 'method/input_image_1.png' },
      in2: { h: 'input_image_2', src: IM + 'method/input_image_2.png' },
      in3: { h: 'input_image_3', src: IM + 'method/input_image_3.png' },
      traj: { h: 'tool_image_1', src: IM + 'method/trajectory.png', sq: true },
      d1: { h: 'tool_image_2', src: IM + 'method/depth_1.png' },
      d2: { h: 'tool_image_3', src: IM + 'method/depth_2.png' },
      d3: { h: 'tool_image_4', src: IM + 'method/depth.png' },
      win: { h: 'tool_image_5', src: IM + 'method/window_overlay.png' },
      cab: { h: 'tool_image_6', src: IM + 'method/cabinet_overlay.png' },
    };
    const STEPS = [
      { n: 'query', title: 'A query arrives with three views',
        desc: 'Input images are registered in persistent memory under reusable handles. The orchestrator only ever sees names and compact descriptors; the harness keeps the payloads.',
        orch: 'planning…', imgs: ['in1', 'in2', 'in3'], data: [] },
      { n: 'camera', title: 'Recover camera poses',
        desc: 'Camera Trajectory runs Depth Anything 3 behind a task-level interface. The pose plot is rendered for the model to inspect; intrinsics and extrinsics go to memory as a data binding.',
        orch: 'calling tool', cap: 'camera', be: 'da',
        call: ['Camera_Trajectory_Tool', ['images: [input_image_1,', '         input_image_2,', '         input_image_3]']],
        ev: { img: 'traj', text: 'Recovered 3 camera poses in a shared coordinate frame.\nIntrinsics K and extrinsics [R | t] stored as camera_trajectory_result.' },
        imgs: ['traj'], data: [['camera_trajectory_result', 'dict (pose)']] },
      { n: 'depth', title: 'Estimate metric depth',
        desc: 'Dense depth arrays would flood the context. Instead the model sees colorized maps, and the raw arrays stay in memory, addressable for computation later.',
        orch: 'calling tool', cap: 'depth', be: 'da',
        call: ['Depth_Estimation_Tool', ['images: [input_image_1,', '         input_image_2,', '         input_image_3]']],
        ev: { img: 'd3', text: 'Depth maps for 3 images rendered as tool_image_2–4.\nMetric depth arrays stored as depth_result.' },
        imgs: ['d1', 'd2', 'd3'], data: [['depth_result', 'dict (depth map)']] },
      { n: 'window', title: 'Ground the window',
        desc: 'Visual Grounding (SAM 3) returns a labeled mask overlay plus normalized boxes. The precise RLE mask is retained as a binding rather than serialized into the prompt.',
        orch: 'calling tool', cap: 'ground', be: 'sam',
        call: ['Visual_Grounding_Tool', ['image: input_image_1', 'query: "window"']],
        ev: { img: 'win', text: "Visual_Grounding_Tool grounded 1 object for the prompt 'window'. Its bounding box (0–1000 scale, [x1, y1, x2, y2]) is: …" },
        imgs: ['win'], data: [['segment_window', 'dict (bbox, RLE mask)']] },
      { n: 'cabinet', title: 'Ground the cabinets',
        desc: 'The same interface, a new query. After every tool turn, an Environment Update advertises the current namespace of images and data bindings, without repeating payloads.',
        orch: 'calling tool', cap: 'ground', be: 'sam',
        call: ['Visual_Grounding_Tool', ['image: input_image_3', 'query: "cabinet"']],
        ev: { img: 'cab', text: "Visual_Grounding_Tool grounded 5 objects for the prompt 'cabinet'. Their corresponding bounding boxes (on a 0-1000 scale, [x1, y1, x2, y2]) are: …" },
        imgs: ['cab'], data: [['segment_cabinet', 'dict (bbox, RLE mask)']] },
      { n: 'compute', title: 'Compute over memory',
        desc: 'The orchestrator states an objective in plain language. A fresh coding session of the same backbone writes a program, and the harness executes it with the masks, depth arrays and poses bound as real variables.',
        orch: 'delegating', cap: 'code', be: 'coder', fetch: true,
        call: ['Python_Coding_Agent', ['objective: "3D distance between', '  the window and cabinet centers', '  using masks, depth and poses"']],
        ev: { code: '# pixel + metric depth\nX = (u - cx) * z / fx\nY = (v - cy) * z / fy\n# camera to world\nP_world = R.T @ (P_cam - t)\n# window-to-cabinet distance\nd = np.linalg.norm(P_w - P_c)\n→ 1.1957' },
        imgs: [], data: [] },
      { n: 'answer', title: 'Answer, grounded in evidence',
        desc: 'Every number in the final answer traces back to retained artifacts: poses, depth, and masks that were rendered for inspection and then reused for exact computation.',
        orch: 'answered ✓', final: '1.1957 m', imgs: [], data: [] },
    ];
    const STEP_MS = 4200;
    const fig = $('#methodFig');
    const stepsEl = $('#mfSteps');
    fig.style.setProperty('--step-ms', STEP_MS + 'ms');
    STEPS.forEach((s, i) => {
      const b = H('button', { type: 'button', 'data-n': i + 1, 'aria-label': `Step ${i + 1}: ${s.title}` }, `<span class="bar"></span>${i + 1} · ${s.n}`);
      b.addEventListener('click', () => { go(i); });
      stepsEl.appendChild(b);
    });

    let cur = -1, playing = !REDUCED, timers = [], advanceT = null, visible = false;
    const T = (fn, ms) => timers.push(setTimeout(fn, REDUCED ? 0 : ms));
    function clearTimers() { timers.forEach(clearTimeout); timers = []; clearTimeout(advanceT); }

    function memState(upto) {
      const imgs = [], data = [];
      for (let i = 0; i <= upto; i++) { imgs.push(...STEPS[i].imgs); data.push(...STEPS[i].data); }
      return { imgs, data };
    }
    function renderMem(upto, animateFrom) {
      const st = memState(upto);
      const prev = animateFrom >= 0 ? memState(animateFrom) : { imgs: [], data: [] };
      const mi = $('#memImgs'); mi.innerHTML = '';
      st.imgs.forEach(k => {
        const im = IMGS[k];
        const f = H('figure', {}, `<img src="${im.src}" alt="${im.h}"${im.sq ? ' class="sq"' : ''}><figcaption>${im.h}</figcaption>`);
        if (prev.imgs.includes(k)) f.style.animation = 'none';
        mi.appendChild(f);
      });
      const md = $('#memData'); md.innerHTML = '';
      if (!st.data.length) md.innerHTML = '<span class="ev-empty" style="font-family:var(--f-body)">no bindings yet</span>';
      st.data.forEach(([n, t]) => {
        const d = H('div', { 'data-b': n }, `${n}: <span class="ty">${t}</span>`);
        if (prev.data.find(p => p[0] === n)) d.style.animation = 'none';
        md.appendChild(d);
      });
      // environment update text
      const names = st.imgs.map(k => IMGS[k].h);
      const newNames = st.imgs.filter(k => !prev.imgs.includes(k)).map(k => IMGS[k].h);
      const newData = st.data.filter(d => !prev.data.find(p => p[0] === d[0])).map(d => d[0]);
      const inputs = names.filter(n => n.startsWith('input'));
      const tools = names.filter(n => n.startsWith('tool'));
      const span = (n, isNew) => isNew ? `<span class="new">${n}</span>` : n;
      let txt = '<span class="k">Available image IDs:</span>\n';
      txt += inputs.map(n => span(n, newNames.includes(n))).join(', ');
      if (tools.length) txt += ',\n' + tools.map(n => span(n, newNames.includes(n))).join(', ');
      txt += '\n\n<span class="k">Available data bindings:</span>\n';
      txt += st.data.length ? st.data.map(d => span(d[0] + ': dict', newData.includes(d[0]))).join(',\n') : '—';
      $('#mfEnvTxt').innerHTML = txt;
    }
    function setLit(id, cls, on) { $(id).classList.toggle(cls, !!on); }
    function resetTransient() {
      ['#mfCall', '#mfOrch', '#mfUser'].forEach(id => $(id).classList.remove('lit'));
      $('#mfEv').classList.remove('lit-a'); $('#mfMem').classList.remove('lit-v'); $('#mfEnv').classList.remove('lit-v');
      $('#mfOrch').classList.remove('thinking');
      $$('.cap', fig).forEach(c => c.classList.remove('on'));
      $$('.be', fig).forEach(c => c.classList.remove('on'));
      $('#flowDown').classList.remove('go'); $('#flowUp').classList.remove('go');
      $('#ioStore').classList.remove('on'); $('#ioFetch').classList.remove('on');
      $$('#memData div').forEach(d => d.classList.remove('fetch'));
    }
    function renderCall(s) {
      if (!s.call) return;
      const [fn, args] = s.call;
      $('#mfCallTxt').innerHTML = `<span class="fn">${fn}</span>\n${args.join('\n')}`;
      $('#mfCallTxt').classList.remove('swap'); void $('#mfCallTxt').offsetWidth; $('#mfCallTxt').classList.add('swap');
    }
    function renderEv(s) {
      const b = $('#mfEvBody');
      if (s.ev && s.ev.img) {
        const im = IMGS[s.ev.img];
        b.innerHTML = `<div class="ev"><div><img src="${im.src}" alt="${im.h}"${im.sq ? ' class="sq"' : ''}><div class="cap">${im.h}</div></div><pre>${s.ev.text}</pre></div>`;
      } else if (s.ev && s.ev.code) {
        b.innerHTML = `<div class="ev" style="grid-template-columns:1fr"><pre>${s.ev.code.replace('→ 1.1957', '<b style="color:var(--cap)">→ d = 1.1957 m</b>')}</pre></div>`;
      }
      b.firstElementChild && b.firstElementChild.classList.add('swap');
    }
    function setCaption(i) {
      const s = STEPS[i];
      const c = $('#mfCaption');
      $('.s', c).textContent = `STEP ${i + 1} / ${STEPS.length}`;
      $('.t', c).textContent = s.title;
      $('.d', c).textContent = s.desc;
    }
    function staticTo(i) {
      // put the figure into the end-state of step i-1 (no animation), keeping last call/evidence visible
      resetTransient();
      $('#mfAns').textContent = '…'; $('#mfFinal').classList.remove('done');
      $('#mfCallTxt').innerHTML = '<span class="ev-empty">waiting for the orchestrator…</span>';
      $('#mfEvBody').innerHTML = '<span class="ev-empty">Raw outputs (masks, arrays, poses) are rendered into images + concise text the model can inspect.</span>';
      for (let k = i - 1; k >= 0; k--) { if (STEPS[k].call) { renderCall(STEPS[k]); renderEv(STEPS[k]); break; } }
      renderMem(i - 1, i - 1);
      if (i - 1 < 0) { $('#memImgs').innerHTML = ''; $('#memData').innerHTML = '<span class="ev-empty" style="font-family:var(--f-body)">no bindings yet</span>'; $('#mfEnvTxt').innerHTML = '<span class="k">Available image IDs:</span>\n—\n\n<span class="k">Available data bindings:</span>\n—'; }
    }
    function animate(i) {
      const s = STEPS[i];
      setCaption(i);
      $('#mfOrchSt').textContent = s.orch;
      $('#mfOrch').classList.add('lit', 'thinking');
      if (s.n === 'query') {
        $('#mfUser').classList.add('lit');
        T(() => { $('#ioStore').classList.add('on'); $('#mfMem').classList.add('lit-v'); renderMem(i, i - 1); $('#mfEnv').classList.add('lit-v'); }, 700);
        T(() => { $('#mfOrch').classList.remove('thinking'); }, 1800);
        return;
      }
      if (s.final) {
        T(() => { $('#mfOrch').classList.remove('thinking'); $('#mfUser').classList.add('lit'); $('#mfAns').textContent = s.final; $('#mfFinal').classList.add('done'); }, 600);
        return;
      }
      T(() => { $('#mfCall').classList.add('lit'); renderCall(s); }, 350);
      T(() => {
        $('#flowDown').classList.add('go');
        $(`.cap[data-cap="${s.cap}"]`, fig).classList.add('on');
        $(`.be[data-be="${s.be}"]`, fig).classList.add('on');
        if (s.fetch) { $('#ioFetch').classList.add('on'); $('#mfMem').classList.add('lit-v'); $$('#memData div').forEach((d, k) => setTimeout(() => d.classList.add('fetch'), REDUCED ? 0 : k * 150)); }
      }, 1000);
      T(() => {
        $('#flowDown').classList.remove('go'); $('#flowUp').classList.add('go');
        $('#mfCall').classList.remove('lit'); $('#mfEv').classList.add('lit-a'); renderEv(s);
      }, 1800);
      T(() => {
        $('#flowUp').classList.remove('go'); $('#mfOrch').classList.remove('thinking');
        if (!s.fetch) { $('#ioStore').classList.add('on'); $('#mfMem').classList.add('lit-v'); renderMem(i, i - 1); $('#mfEnv').classList.add('lit-v'); }
      }, 2600);
    }
    function markSteps() {
      $$('button', stepsEl).forEach((b, k) => {
        b.classList.toggle('done', k < cur);
        b.classList.toggle('cur', k === cur);
        b.classList.toggle('paused', !playing);
        const bar = $('.bar', b); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
      });
    }
    function go(i) {
      clearTimers();
      cur = (i + STEPS.length) % STEPS.length;
      staticTo(cur);
      markSteps();
      animate(cur);
      schedule();
    }
    function schedule() {
      clearTimeout(advanceT);
      if (playing && visible) advanceT = setTimeout(() => go(cur === STEPS.length - 1 ? 0 : cur + 1), cur === STEPS.length - 1 ? STEP_MS + 1800 : STEP_MS);
    }
    function setPlaying(p) {
      playing = p;
      $('#mfPlay use').setAttribute('href', p ? '#i-pause' : '#i-play');
      markSteps();
      if (p) { if (cur === STEPS.length - 1) go(0); else schedule(); }
      else clearTimeout(advanceT);
    }
    $('#mfPlay').addEventListener('click', () => setPlaying(!playing));
    $('#mfPrev').addEventListener('click', () => { setPlaying(false); go(cur - 1); });
    $('#mfNext').addEventListener('click', () => { setPlaying(false); go(cur + 1); });
    if (!playing) $('#mfPlay use').setAttribute('href', '#i-play');

    staticTo(0); setCaption(0);
    new IntersectionObserver(es => es.forEach(e => {
      visible = e.isIntersecting;
      if (visible && cur < 0) go(0);
      else if (visible) schedule();
      else clearTimeout(advanceT);
    }), { threshold: 0.35 }).observe(fig);
  })();

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

    function scoreMark(e) {
      if (e.score === 1 || e.correct === true) return '<span class="ok">✓</span>';
      if (typeof e.score === 'number' && e.score > 0) return `<span class="ok part" title="partial credit">≈</span>`;
      return '';
    }

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
    $('#exgGrid').addEventListener('click', e => { const c = e.target.closest('.exg-card'); if (c) open(+c.dataset.i); });

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
        $('[data-close].ctl', exv).focus();
      }
    }
    function close() {
      exv.classList.remove('show');
      document.documentElement.classList.remove('modal-open');
      setTimeout(() => { exv.hidden = true; }, 200);
      if (lastFocus) lastFocus.focus();
    }
    exv.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) close();
      const z = e.target.closest('[data-zoom]');
      if (z) lightbox(z.src, z.alt);
    });
    $('#exvPrev').addEventListener('click', () => open(cur - 1));
    $('#exvNext').addEventListener('click', () => open(cur + 1));
    const lb = $('#lightbox');
    function lightbox(src, cap) { $('img', lb).src = src; $('.lb-cap', lb).textContent = cap; lb.hidden = false; }
    lb.addEventListener('click', () => { lb.hidden = true; });
    document.addEventListener('keydown', e => {
      if (!lb.hidden && e.key === 'Escape') { lb.hidden = true; return; }
      if (exv.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') open(cur + 1);
      else if (e.key === 'ArrowLeft') open(cur - 1);
    });
  })();

  /* ================================================================ RESULTS TABLE */
  (function table() {
    const NAMES = { Base: 'Base', OT: 'OT', VS: 'VS', CX: 'CX', Ours: 'Ours' };
    let filter = 'all';
    const FILTERS = { all: ['q8', 'q32', 'luna', 'sol', 'gpt5', 'kimi'], qwen: ['q8', 'q32'], gpt6: ['luna', 'sol'], app: ['gpt5', 'kimi'] };
    function render() {
      const groups = D.GROUPS.filter(g => FILTERS[filter].includes(g.id));
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
    segmented($('#tblSeg'), [['all', 'All backbones'], ['qwen', 'Qwen3-VL'], ['gpt6', 'GPT-6'], ['app', 'GPT-5 · Kimi K3']], filter, v => { filter = v; render(); });
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
