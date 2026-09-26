/* Hand-built SVG charts.

   No charting library: the shapes needed here are few and the control matters
   more than the convenience — an emphasised final point, a faint grid, a
   dual-axis growth comparison, a bubble plot with labels that do not collide.
   Everything renders as static SVG, so the page has no runtime dependency. */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const ACCENT = '#230078';
  const ACCENT2 = '#5B3FD9';
  const POS = '#12634A';
  const NEG = '#8C4A00';

  function el(name, attrs, text) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function svg(w, h) {
    const s = el('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'chart',
                          preserveAspectRatio: 'xMidYMid meet' });
    return s;
  }

  function niceMax(v) {
    if (!v || v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  function fmtShort(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'bn';
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'm';
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return String(Math.round(v * 100) / 100);
  }

  /* ---- line / area chart over a monthly series ------------------------- */
  function line(rows, opts) {
    const o = Object.assign({
      w: 560, h: 200, pad: { t: 12, r: 14, b: 26, l: 46 },
      series: [{ key: 'value', color: ACCENT, fill: true }],
      labelEvery: 6, yFmt: fmtShort, baseZero: false
    }, opts || {});
    const s = svg(o.w, o.h);
    const iw = o.w - o.pad.l - o.pad.r;
    const ih = o.h - o.pad.t - o.pad.b;
    const pts = rows.filter(function (r) {
      return o.series.some(function (sr) { return r[sr.key] !== null && r[sr.key] !== undefined; });
    });
    if (pts.length < 2) return s;

    let lo = Infinity, hi = -Infinity;
    pts.forEach(function (r) {
      o.series.forEach(function (sr) {
        const v = r[sr.key];
        if (v === null || v === undefined) return;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
    });
    if (o.baseZero) lo = 0;
    if (lo === hi) { hi = lo + 1; }
    const span = hi - lo;
    lo = o.baseZero ? 0 : lo - span * 0.12;
    hi = hi + span * 0.1;

    const x = function (i) { return o.pad.l + (i / (pts.length - 1)) * iw; };
    const y = function (v) { return o.pad.t + ih - ((v - lo) / (hi - lo)) * ih; };

    // gridlines
    for (let g = 0; g <= 3; g++) {
      const v = lo + (hi - lo) * (g / 3);
      const yy = y(v);
      s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: yy, y2: yy, class: 'grid' }));
      s.appendChild(el('text', { x: o.pad.l - 7, y: yy + 3, 'text-anchor': 'end' }, o.yFmt(v)));
    }

    o.series.forEach(function (sr) {
      const valid = [];
      pts.forEach(function (r, i) {
        const v = r[sr.key];
        if (v !== null && v !== undefined) valid.push([x(i), y(v), i]);
      });
      if (valid.length < 2) return;
      const d = valid.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      if (sr.fill) {
        const base = o.pad.t + ih;
        s.appendChild(el('path', {
          d: d + ' L' + valid[valid.length - 1][0].toFixed(1) + ',' + base +
             ' L' + valid[0][0].toFixed(1) + ',' + base + ' Z',
          fill: sr.color, opacity: 0.07
        }));
      }
      s.appendChild(el('path', {
        d: d, fill: 'none', stroke: sr.color, 'stroke-width': sr.width || 1.9,
        'stroke-linejoin': 'round', 'stroke-dasharray': sr.dash || null
      }));
      const last = valid[valid.length - 1];
      s.appendChild(el('circle', { cx: last[0], cy: last[1], r: 3, fill: sr.color }));
    });

    // x labels
    pts.forEach(function (r, i) {
      if (i % o.labelEvery !== 0 && i !== pts.length - 1) return;
      s.appendChild(el('text', { x: x(i), y: o.h - 8, 'text-anchor': 'middle' },
                       (r.label || r.year_month || '').slice(2)));
    });
    s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r,
                               y1: o.pad.t + ih, y2: o.pad.t + ih, class: 'axis' }));
    return s;
  }

  /* ---- grouped bars, used for growth comparisons ----------------------- */
  function bars(items, opts) {
    const o = Object.assign({ w: 560, h: 210, pad: { t: 12, r: 14, b: 42, l: 46 },
                              fmt: function (v) { return (v * 100).toFixed(1) + '%'; } }, opts || {});
    const s = svg(o.w, o.h);
    const iw = o.w - o.pad.l - o.pad.r;
    const ih = o.h - o.pad.t - o.pad.b;
    const vals = items.map(function (i) { return i.value; });
    const hi = niceMax(Math.max.apply(null, vals.concat([0])));
    const lo = Math.min(0, Math.min.apply(null, vals) * 1.15);
    const y = function (v) { return o.pad.t + ih - ((v - lo) / (hi - lo)) * ih; };
    const bw = iw / items.length;

    for (let g = 0; g <= 3; g++) {
      const v = lo + (hi - lo) * (g / 3);
      s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: y(v), y2: y(v), class: 'grid' }));
      s.appendChild(el('text', { x: o.pad.l - 7, y: y(v) + 3, 'text-anchor': 'end' }, o.fmt(v)));
    }
    const zero = y(0);
    items.forEach(function (it, i) {
      const cx = o.pad.l + bw * i + bw / 2;
      const w = Math.min(46, bw * 0.52);
      const top = Math.min(zero, y(it.value));
      const h = Math.abs(y(it.value) - zero);
      s.appendChild(el('rect', { x: cx - w / 2, y: top, width: w, height: Math.max(1, h),
                                 fill: it.color || ACCENT, rx: 1 }));
      s.appendChild(el('text', { x: cx, y: top - 5, 'text-anchor': 'middle',
                                 style: 'font-weight:600;fill:' + (it.color || ACCENT) },
                       o.fmt(it.value)));
      (it.label || '').split('\n').forEach(function (ln, k) {
        s.appendChild(el('text', { x: cx, y: o.h - 24 + k * 11, 'text-anchor': 'middle' }, ln));
      });
    });
    s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: zero, y2: zero, class: 'axis' }));
    return s;
  }

  /* ---- horizontal share bars ------------------------------------------ */
  function hbars(items, opts) {
    const o = Object.assign({ w: 560, rowH: 26, pad: { t: 6, r: 78, b: 6, l: 150 },
                              fmt: fmtShort }, opts || {});
    const h = o.pad.t + o.pad.b + items.length * o.rowH;
    const s = svg(o.w, h);
    const iw = o.w - o.pad.l - o.pad.r;
    const hi = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    items.forEach(function (it, i) {
      const y = o.pad.t + i * o.rowH;
      s.appendChild(el('text', { x: o.pad.l - 9, y: y + o.rowH / 2 + 3, 'text-anchor': 'end',
                                 style: 'fill:var(--ink-2);font-family:var(--sans);font-size:11.5px' },
                       it.label));
      s.appendChild(el('rect', { x: o.pad.l, y: y + 6, width: iw, height: o.rowH - 13,
                                 fill: 'var(--surface-2)', stroke: 'var(--line)', rx: 1 }));
      s.appendChild(el('rect', { x: o.pad.l, y: y + 6, width: Math.max(1, iw * it.value / hi),
                                 height: o.rowH - 13, fill: it.color || ACCENT, rx: 1 }));
      s.appendChild(el('text', { x: o.w - o.pad.r + 8, y: y + o.rowH / 2 + 3,
                                 style: 'font-weight:600;fill:var(--ink)' }, o.fmt(it.value)));
    });
    return s;
  }

  /* ---- bubble scatter for the opportunity matrix ----------------------- */
  function bubbles(items, opts) {
    const o = Object.assign({ w: 560, h: 380, pad: { t: 18, r: 22, b: 46, l: 62 },
                              xLabel: '', yLabel: '', xFmt: fmtShort, yFmt: fmtShort }, opts || {});
    const s = svg(o.w, o.h);
    const iw = o.w - o.pad.l - o.pad.r;
    const ih = o.h - o.pad.t - o.pad.b;
    const xs = items.map(function (i) { return i.x; });
    const ys = items.map(function (i) { return i.y; });
    const xhi = niceMax(Math.max.apply(null, xs) * 1.08);
    const yhi = niceMax(Math.max.apply(null, ys) * 1.12);
    const rmax = Math.max.apply(null, items.map(function (i) { return i.r || 1; }));
    const X = function (v) { return o.pad.l + (v / xhi) * iw; };
    const Y = function (v) { return o.pad.t + ih - (v / yhi) * ih; };

    for (let g = 0; g <= 4; g++) {
      const yy = o.pad.t + ih * g / 4;
      s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: yy, y2: yy, class: 'grid' }));
      s.appendChild(el('text', { x: o.pad.l - 7, y: yy + 3, 'text-anchor': 'end' },
                       o.yFmt(yhi * (1 - g / 4))));
      const xx = o.pad.l + iw * g / 4;
      s.appendChild(el('line', { x1: xx, x2: xx, y1: o.pad.t, y2: o.pad.t + ih, class: 'grid' }));
      s.appendChild(el('text', { x: xx, y: o.h - 26, 'text-anchor': 'middle' }, o.xFmt(xhi * g / 4)));
    }

    // median crosshairs define the quadrants
    const med = function (a) {
      const b = a.slice().sort(function (p, q) { return p - q; });
      return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
    };
    const mx = med(xs), my = med(ys);
    s.appendChild(el('line', { x1: X(mx), x2: X(mx), y1: o.pad.t, y2: o.pad.t + ih,
                               stroke: ACCENT2, 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: .5 }));
    s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: Y(my), y2: Y(my),
                               stroke: ACCENT2, 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: .5 }));

    items.forEach(function (it) {
      const r = 6 + 16 * Math.sqrt((it.r || 1) / rmax);
      s.appendChild(el('circle', { cx: X(it.x), cy: Y(it.y), r: r,
                                   fill: ACCENT, opacity: .16, stroke: ACCENT, 'stroke-width': 1.3 }));
      s.appendChild(el('text', { x: X(it.x), y: Y(it.y) - r - 5, 'text-anchor': 'middle',
                                 style: 'font-family:var(--sans);font-size:11px;font-weight:600;fill:var(--ink)' },
                       it.label));
    });

    s.appendChild(el('text', { x: o.pad.l + iw / 2, y: o.h - 8, 'text-anchor': 'middle',
                               style: 'font-weight:600' }, o.xLabel));
    s.appendChild(el('text', { x: 12, y: o.pad.t + ih / 2, 'text-anchor': 'middle',
                               transform: 'rotate(-90 12 ' + (o.pad.t + ih / 2) + ')',
                               style: 'font-weight:600' }, o.yLabel));
    return s;
  }

  global.Charts = { line: line, bars: bars, hbars: hbars, bubbles: bubbles,
                    fmtShort: fmtShort, colors: { ACCENT: ACCENT, ACCENT2: ACCENT2, POS: POS, NEG: NEG } };
})(window);
