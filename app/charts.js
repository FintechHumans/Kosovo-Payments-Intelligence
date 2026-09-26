/* Bespoke SVG charts.

   No charting library. The shapes needed are few, and control matters more
   than convenience: an emphasised final point, hairline gridlines that match
   the page rules, a hover band that reports the exact value with its
   definition, and bubbles whose labels do not collide.

   Every chart returns a plain <svg>, so there is no runtime dependency and
   nothing to hydrate. */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const C = {
    purple: '#230078', purpleSoft: '#5b3fd9', gold: '#b8960c', goldSoft: '#c9a84c',
    pos: '#14634a', neg: '#8c4a00', ink: '#1a1f36', ink3: '#9aa0b4'
  };

  function el(n, a, t) {
    const e = document.createElementNS(NS, n);
    for (const k in a) if (a[k] !== null && a[k] !== undefined) e.setAttribute(k, a[k]);
    if (t !== undefined) e.textContent = t;
    return e;
  }
  function svg(w, h) {
    return el('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'chart',
                       preserveAspectRatio: 'xMidYMid meet' });
  }
  function niceMax(v) {
    if (!v || v <= 0) return 1;
    const m = Math.pow(10, Math.floor(Math.log10(v))), n = v / m;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * m;
  }
  const short = function (v) { return global.UI ? global.UI.compact(v) : String(v); };

  /* ------------------------------------------------------------------ line */
  function line(rows, o) {
    o = Object.assign({
      w: 620, h: 210, pad: { t: 14, r: 16, b: 28, l: 52 },
      series: [{ key: 'value', color: C.purple, fill: true, label: '' }],
      labelEvery: 6, yFmt: short, baseZero: false, hover: null,
      xFmt: function (r) { return (r.year_month || '').slice(2); }
    }, o || {});
    const s = svg(o.w, o.h);
    const iw = o.w - o.pad.l - o.pad.r, ih = o.h - o.pad.t - o.pad.b;
    const pts = rows.filter(function (r) {
      return o.series.some(function (x) { return !nil(r[x.key]); });
    });
    if (pts.length < 2) return s;

    let lo = Infinity, hi = -Infinity;
    pts.forEach(function (r) {
      o.series.forEach(function (x) {
        const v = r[x.key];
        if (nil(v)) return;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
    });
    if (o.baseZero) lo = 0;
    if (lo === hi) hi = lo + 1;
    const span = hi - lo;
    lo = o.baseZero ? 0 : lo - span * 0.14;
    hi = hi + span * 0.1;

    const X = function (i) { return o.pad.l + (i / (pts.length - 1)) * iw; };
    const Y = function (v) { return o.pad.t + ih - ((v - lo) / (hi - lo)) * ih; };

    for (let g = 0; g <= 3; g++) {
      const v = lo + (hi - lo) * (g / 3), y = Y(v);
      s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: y, y2: y, class: 'grid' }));
      s.appendChild(el('text', { x: o.pad.l - 8, y: y + 3, 'text-anchor': 'end' }, o.yFmt(v)));
    }

    o.series.forEach(function (x) {
      const v = [];
      pts.forEach(function (r, i) { if (!nil(r[x.key])) v.push([X(i), Y(r[x.key])]); });
      if (v.length < 2) return;
      const d = v.map(function (p, i) {
        return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
      }).join(' ');
      if (x.fill) {
        const b = o.pad.t + ih;
        s.appendChild(el('path', {
          d: d + ' L' + v[v.length - 1][0].toFixed(1) + ',' + b +
             ' L' + v[0][0].toFixed(1) + ',' + b + ' Z',
          fill: x.color, opacity: .07 }));
      }
      s.appendChild(el('path', { d: d, fill: 'none', stroke: x.color,
        'stroke-width': x.width || 1.9, 'stroke-linejoin': 'round',
        'stroke-dasharray': x.dash || null }));
      const last = v[v.length - 1];
      s.appendChild(el('circle', { cx: last[0], cy: last[1], r: 3.2, fill: x.color }));
    });

    pts.forEach(function (r, i) {
      if (i % o.labelEvery !== 0 && i !== pts.length - 1) return;
      s.appendChild(el('text', { x: X(i), y: o.h - 9, 'text-anchor': 'middle' },
        o.xFmt(r)));
    });
    s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r,
      y1: o.pad.t + ih, y2: o.pad.t + ih, class: 'axis' }));

    if (o.hover) attachHover(s, pts, X, o, ih);
    return s;
  }

  /* A transparent band per point: hovering reports the exact value. */
  function attachHover(s, pts, X, o, ih) {
    const g = el('g', {});
    const marker = el('line', { y1: o.pad.t, y2: o.pad.t + ih, stroke: C.ink3,
      'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
    g.appendChild(marker);
    const half = (X(1) - X(0)) / 2;
    pts.forEach(function (r, i) {
      const b = el('rect', {
        x: X(i) - half, y: o.pad.t, width: half * 2, height: ih,
        fill: 'transparent', style: 'cursor:crosshair' });
      b.addEventListener('mouseenter', function (e) {
        marker.setAttribute('x1', X(i)); marker.setAttribute('x2', X(i));
        marker.setAttribute('opacity', '.8');
        global.UI.showTip(e, o.hover(r, i));
      });
      b.addEventListener('mousemove', function (e) { global.UI.showTip(e, o.hover(r, i)); });
      b.addEventListener('mouseleave', function () {
        marker.setAttribute('opacity', '0'); global.UI.hideTip();
      });
      g.appendChild(b);
    });
    s.appendChild(g);
  }

  /* ------------------------------------------------------------- bar group */
  function bars(items, o) {
    o = Object.assign({ w: 620, h: 220, pad: { t: 18, r: 16, b: 46, l: 52 },
      fmt: function (v) { return (v * 100).toFixed(1) + '%'; } }, o || {});
    const s = svg(o.w, o.h);
    const iw = o.w - o.pad.l - o.pad.r, ih = o.h - o.pad.t - o.pad.b;
    const vals = items.map(function (i) { return i.value || 0; });
    const hi = niceMax(Math.max.apply(null, vals.concat([0])));
    const lo = Math.min(0, Math.min.apply(null, vals) * 1.18);
    const Y = function (v) { return o.pad.t + ih - ((v - lo) / (hi - lo)) * ih; };
    const bw = iw / items.length;
    for (let g = 0; g <= 3; g++) {
      const v = lo + (hi - lo) * (g / 3);
      s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: Y(v), y2: Y(v), class: 'grid' }));
      s.appendChild(el('text', { x: o.pad.l - 8, y: Y(v) + 3, 'text-anchor': 'end' }, o.fmt(v)));
    }
    const zero = Y(0);
    items.forEach(function (it, i) {
      const cx = o.pad.l + bw * i + bw / 2, w = Math.min(44, bw * .5);
      const top = Math.min(zero, Y(it.value || 0));
      const h = Math.abs(Y(it.value || 0) - zero);
      const rect = el('rect', { x: cx - w / 2, y: top, width: w, height: Math.max(1, h),
        fill: it.color || C.purple });
      if (it.tip) {
        rect.style.cursor = 'crosshair';
        rect.addEventListener('mouseenter', function (e) { global.UI.showTip(e, it.tip()); });
        rect.addEventListener('mousemove', function (e) { global.UI.showTip(e, it.tip()); });
        rect.addEventListener('mouseleave', global.UI.hideTip);
      }
      s.appendChild(rect);
      s.appendChild(el('text', { x: cx, y: top - 6, 'text-anchor': 'middle',
        style: 'font-weight:600;fill:' + (it.color || C.purple) }, o.fmt(it.value || 0)));
      String(it.label || '').split('\n').forEach(function (ln, k) {
        s.appendChild(el('text', { x: cx, y: o.h - 26 + k * 11, 'text-anchor': 'middle' }, ln));
      });
    });
    s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: zero, y2: zero, class: 'axis' }));
    return s;
  }

  /* -------------------------------------------------------- ranked h-bars */
  function hbars(items, o) {
    o = Object.assign({ w: 620, rowH: 27, pad: { t: 6, r: 88, b: 6, l: 168 },
      fmt: short }, o || {});
    const h = o.pad.t + o.pad.b + items.length * o.rowH;
    const s = svg(o.w, h);
    const iw = o.w - o.pad.l - o.pad.r;
    const hi = Math.max.apply(null, items.map(function (i) { return i.value || 0; }).concat([1]));
    items.forEach(function (it, i) {
      const y = o.pad.t + i * o.rowH;
      s.appendChild(el('text', { x: o.pad.l - 10, y: y + o.rowH / 2 + 4, 'text-anchor': 'end',
        style: 'fill:var(--ink-2);font-family:var(--sans);font-size:11.5px' }, it.label));
      s.appendChild(el('rect', { x: o.pad.l, y: y + 7, width: iw, height: o.rowH - 15,
        fill: 'var(--surface-sunk)' }));
      const bar = el('rect', { x: o.pad.l, y: y + 7,
        width: Math.max(1, iw * (it.value || 0) / hi), height: o.rowH - 15,
        fill: it.color || C.purple });
      if (it.tip) {
        bar.style.cursor = 'crosshair';
        bar.addEventListener('mouseenter', function (e) { global.UI.showTip(e, it.tip()); });
        bar.addEventListener('mousemove', function (e) { global.UI.showTip(e, it.tip()); });
        bar.addEventListener('mouseleave', global.UI.hideTip);
      }
      s.appendChild(bar);
      s.appendChild(el('text', { x: o.w - o.pad.r + 9, y: y + o.rowH / 2 + 4,
        style: 'font-weight:600;fill:var(--ink)' }, o.fmt(it.value)));
    });
    return s;
  }

  /* ------------------------------------------------- dumbbell (compare) */
  function dumbbell(items, o) {
    o = Object.assign({ w: 620, rowH: 34, pad: { t: 14, r: 92, b: 24, l: 168 },
      fmt: short, aLabel: 'Prior', bLabel: 'Current' }, o || {});
    const h = o.pad.t + o.pad.b + items.length * o.rowH;
    const s = svg(o.w, h);
    const iw = o.w - o.pad.l - o.pad.r;
    const hi = niceMax(Math.max.apply(null, items.reduce(function (a, i) {
      return a.concat([i.a || 0, i.b || 0]); }, [1])));
    const X = function (v) { return o.pad.l + (v / hi) * iw; };
    items.forEach(function (it, i) {
      const y = o.pad.t + i * o.rowH + o.rowH / 2;
      s.appendChild(el('text', { x: o.pad.l - 10, y: y + 4, 'text-anchor': 'end',
        style: 'fill:var(--ink-2);font-family:var(--sans);font-size:11.5px' }, it.label));
      s.appendChild(el('line', { x1: X(it.a || 0), x2: X(it.b || 0), y1: y, y2: y,
        stroke: 'var(--rule-strong)', 'stroke-width': 2 }));
      s.appendChild(el('circle', { cx: X(it.a || 0), cy: y, r: 4.2,
        fill: 'var(--surface)', stroke: C.ink3, 'stroke-width': 1.6 }));
      const dot = el('circle', { cx: X(it.b || 0), cy: y, r: 4.6, fill: C.purple });
      if (it.tip) {
        dot.style.cursor = 'crosshair';
        dot.addEventListener('mouseenter', function (e) { global.UI.showTip(e, it.tip()); });
        dot.addEventListener('mouseleave', global.UI.hideTip);
      }
      s.appendChild(dot);
      const d = (it.a && it.b) ? (it.b / it.a - 1) : null;
      s.appendChild(el('text', { x: o.w - o.pad.r + 9, y: y + 4,
        style: 'font-weight:600;fill:' + (d === null ? 'var(--ink-3)' : d >= 0 ? C.pos : C.neg) },
        d === null ? '—' : global.UI.signedPct(d)));
    });
    return s;
  }

  /* --------------------------------------------------------- bubble matrix */
  function bubbles(items, o) {
    o = Object.assign({ w: 640, h: 420, pad: { t: 22, r: 26, b: 52, l: 70 },
      xLabel: '', yLabel: '', xFmt: short, yFmt: short, onClick: null }, o || {});
    const s = svg(o.w, o.h);
    const iw = o.w - o.pad.l - o.pad.r, ih = o.h - o.pad.t - o.pad.b;
    const xs = items.map(function (i) { return i.x || 0; });
    const ys = items.map(function (i) { return i.y || 0; });
    const xhi = niceMax(Math.max.apply(null, xs) * 1.1);
    const yhi = niceMax(Math.max.apply(null, ys) * 1.15);
    const rmax = Math.max.apply(null, items.map(function (i) { return i.r || 1; }));
    const X = function (v) { return o.pad.l + (v / xhi) * iw; };
    const Y = function (v) { return o.pad.t + ih - (v / yhi) * ih; };

    for (let g = 0; g <= 4; g++) {
      const y = o.pad.t + ih * g / 4, x = o.pad.l + iw * g / 4;
      s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: y, y2: y, class: 'grid' }));
      s.appendChild(el('text', { x: o.pad.l - 8, y: y + 3, 'text-anchor': 'end' },
        o.yFmt(yhi * (1 - g / 4))));
      s.appendChild(el('line', { x1: x, x2: x, y1: o.pad.t, y2: o.pad.t + ih, class: 'grid' }));
      s.appendChild(el('text', { x: x, y: o.h - 30, 'text-anchor': 'middle' }, o.xFmt(xhi * g / 4)));
    }

    const med = function (a) {
      const b = a.slice().sort(function (p, q) { return p - q; });
      return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
    };
    const mx = med(xs), my = med(ys);
    s.appendChild(el('line', { x1: X(mx), x2: X(mx), y1: o.pad.t, y2: o.pad.t + ih,
      stroke: C.gold, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .55 }));
    s.appendChild(el('line', { x1: o.pad.l, x2: o.w - o.pad.r, y1: Y(my), y2: Y(my),
      stroke: C.gold, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .55 }));

    items.forEach(function (it) {
      const r = 7 + 17 * Math.sqrt((it.r || 1) / rmax);
      const c = el('circle', { cx: X(it.x || 0), cy: Y(it.y || 0), r: r,
        fill: it.selected ? C.purple : C.purple, opacity: it.selected ? .34 : .15,
        stroke: C.purple, 'stroke-width': it.selected ? 2 : 1.3,
        style: o.onClick ? 'cursor:pointer' : '' });
      if (it.tip) {
        c.addEventListener('mouseenter', function (e) { global.UI.showTip(e, it.tip()); });
        c.addEventListener('mousemove', function (e) { global.UI.showTip(e, it.tip()); });
        c.addEventListener('mouseleave', global.UI.hideTip);
      }
      if (o.onClick) c.addEventListener('click', function () { o.onClick(it); });
      s.appendChild(c);
      s.appendChild(el('text', { x: X(it.x || 0), y: Y(it.y || 0) - r - 6, 'text-anchor': 'middle',
        style: 'font-family:var(--sans);font-size:11px;font-weight:600;fill:var(--ink);' +
               'pointer-events:none' }, it.label));
    });

    s.appendChild(el('text', { x: o.pad.l + iw / 2, y: o.h - 10, 'text-anchor': 'middle',
      style: 'font-weight:600' }, o.xLabel));
    s.appendChild(el('text', { x: 14, y: o.pad.t + ih / 2, 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + (o.pad.t + ih / 2) + ')',
      style: 'font-weight:600' }, o.yLabel));
    return s;
  }

  function nil(v) { return v === null || v === undefined || Number.isNaN(v); }

  global.Charts = { line: line, bars: bars, hbars: hbars, dumbbell: dumbbell,
                    bubbles: bubbles, colors: C, short: short };
})(window);
