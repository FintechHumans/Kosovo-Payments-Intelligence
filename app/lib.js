/* Formatting, tooltips, drawer and the small component vocabulary the pages
   share. Kept in one place so a KPI tile, a table cell and a tooltip all
   render a number the same way.

   Two rules run through everything here:
     NULL is never zero. Missing data renders as a stated reason.
     Every rounded figure keeps its exact value available on hover. */
(function (global) {
  'use strict';

  // ------------------------------------------------------------- formatting
  const G = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const G2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function isNil(v) { return v === null || v === undefined || Number.isNaN(v); }

  /** 1248492112 -> "1.25bn", 347218000 -> "347.2m", 30148 -> "30.1K" */
  function compact(v) {
    if (isNil(v)) return null;
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'bn';
    if (a >= 1e6) return s + (a / 1e6).toFixed(1) + 'm';
    if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
    if (a >= 100) return s + a.toFixed(0);
    return s + a.toFixed(2);
  }
  function money(v) { const c = compact(v); return c === null ? null : '€' + c; }
  function exact(v) { return isNil(v) ? null : G.format(Math.round(v)); }
  function exactMoney(v) { return isNil(v) ? null : '€' + G2.format(v); }
  function pct(v, d) { return isNil(v) ? null : (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function signedPct(v, d) {
    if (isNil(v)) return null;
    return (v > 0 ? '+' : '') + (v * 100).toFixed(d === undefined ? 1 : d) + '%';
  }
  function pp(v, d) {
    if (isNil(v)) return null;
    return (v > 0 ? '+' : '') + (v * 100).toFixed(d === undefined ? 1 : d) + ' pp';
  }
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthLabel(ym) {
    if (!ym) return '—';
    return MONTH[parseInt(ym.slice(5), 10) - 1] + ' ' + ym.slice(0, 4);
  }
  function monthRange(fromYm, toYm) {
    if (!fromYm || !toYm) return '—';
    const a = MONTH[parseInt(fromYm.slice(5), 10) - 1];
    const b = MONTH[parseInt(toYm.slice(5), 10) - 1];
    return a + '–' + b + ' ' + toYm.slice(0, 4);
  }
  function esc(s) {
    return String(isNil(s) ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --------------------------------------------------------------- tooltip
  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'tip';
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  /** spec: name, big value, delta, then period / definition / source / audit */
  function showTip(ev, cfg) {
    const t = tip();
    let h = '';
    if (cfg.name) h += '<div class="t-name">' + esc(cfg.name) + '</div>';
    if (cfg.value !== undefined) h += '<div class="t-val">' + esc(cfg.value) + '</div>';
    if (cfg.delta) h += '<div class="t-d">' + esc(cfg.delta) + '</div>';
    const rows = cfg.rows || [];
    if (rows.length) {
      h += '<dl>' + rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
      }).join('') + '</dl>';
    }
    t.innerHTML = h;
    t.classList.add('on');
    place(ev);
  }
  function place(ev) {
    const t = tip();
    const pad = 14;
    const r = t.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('on'); }

  /** Attach a tooltip whose content is produced lazily. */
  function bindTip(el, build) {
    if (!el) return;
    el.addEventListener('mouseenter', function (e) { showTip(e, build()); });
    el.addEventListener('mousemove', place);
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', function () {
      const r = el.getBoundingClientRect();
      showTip({ clientX: r.left, clientY: r.bottom }, build());
    });
    el.addEventListener('blur', hideTip);
  }

  // ---------------------------------------------------------------- drawer
  let drawerEl = null;
  function drawer() {
    if (!drawerEl) {
      drawerEl = document.createElement('div');
      drawerEl.className = 'drawer';
      drawerEl.innerHTML = '<div class="drawer-scrim"></div><div class="drawer-panel" ' +
        'role="dialog" aria-modal="true" aria-label="Source and methodology">' +
        '<button class="drawer-close">Close</button><div class="drawer-body"></div></div>';
      document.body.appendChild(drawerEl);
      drawerEl.querySelector('.drawer-scrim').addEventListener('click', closeDrawer);
      drawerEl.querySelector('.drawer-close').addEventListener('click', closeDrawer);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDrawer();
      });
    }
    return drawerEl;
  }
  let lastFocus = null;
  function openDrawer(html) {
    const d = drawer();
    d.querySelector('.drawer-body').innerHTML = html;
    d.setAttribute('open', '');
    lastFocus = document.activeElement;
    d.querySelector('.drawer-close').focus();
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.removeAttribute('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /** The source/methodology drawer — the feature that makes a number defendable. */
  function sourceDrawer(o) {
    const rows = [];
    function row(k, v) { if (v) rows.push('<dt>' + esc(k) + '</dt><dd>' + v + '</dd>'); }
    row('Formula', o.formula ? '<code>' + esc(o.formula) + '</code>' : null);
    row('Numerator', esc(o.numerator));
    row('Denominator', esc(o.denominator));
    row('Definition', esc(o.definition));
    row('Universe', esc(o.universe));
    row('Coverage', esc(o.coverage));
    row('Period', esc(o.period));
    row('Aggregation', esc(o.aggregation));
    row('Comparison', esc(o.comparison));
    row('Institution', esc(o.institution));
    row('Publication', esc(o.publication));
    row('Source file', o.file ? '<code>' + esc(o.file) + '</code>' : null);
    row('Source version', o.version ? '<code>' + esc(o.version) + '</code>' : null);
    row('Downloaded', esc(o.downloaded));
    row('Parser', o.parser ? '<code>' + esc(o.parser) + '</code>' : null);
    row('Limitations', esc(o.limitations));

    openDrawer(
      '<span class="label label-gold">Source &amp; methodology</span>' +
      '<h3>' + esc(o.title) + '</h3>' +
      (o.status ? '<span class="badge ' + esc(o.status) + '">' + esc(o.status) + '</span>' : '') +
      (o.statusReason ? '<p style="margin-top:12px;font-size:12.5px;color:var(--ink-2);' +
        'max-width:60ch">' + esc(o.statusReason) + '</p>' : '') +
      '<dl class="kv">' + rows.join('') + '</dl>' +
      (o.url ? '<a class="btn" href="' + esc(o.url) + '" target="_blank" rel="noopener">' +
        'Open official source</a>' : ''));
  }

  // ------------------------------------------------------------ components
  /** A KPI tile. Renders "Not publicly available" rather than a zero. */
  function kpiTile(o) {
    const has = !isNil(o.value);
    const cls = 'kpi' + (has ? '' : ' na');
    return '<div class="' + cls + '" data-kpi="' + esc(o.id || '') + '">' +
      '<div class="k"><span class="label">' + esc(o.label) + '</span>' +
      (o.badge ? '<span class="badge ' + esc(o.badge) + '">' + esc(o.badge) + '</span>' : '') +
      '</div>' +
      '<div class="v' + (o.small ? ' sm' : '') + '" tabindex="0"' +
      (o.exact ? ' data-exact="' + esc(o.exact) + '"' : '') + '>' +
      (has ? esc(o.display) : esc(o.unavailable || 'Not publicly available')) + '</div>' +
      '<div class="f">' + (o.foot || '') + '</div>' +
      (o.source ? '<button class="src" aria-label="Source and methodology">ⓘ</button>' : '') +
      '</div>';
  }

  function deltaSpan(v, opts) {
    const o = opts || {};
    if (isNil(v)) return '<span class="delta flat">—</span>';
    const good = o.invert ? v < 0 : v > 0;
    const cls = Math.abs(v) < 0.0005 ? 'flat' : (good ? 'up' : 'down');
    return '<span class="delta ' + cls + '">' + signedPct(v) + '</span>';
  }

  function emptyState(title, detail) {
    return '<div class="empty"><div class="t">' + esc(title) + '</div>' +
           '<div class="d">' + esc(detail) + '</div></div>';
  }

  function pageHead(idx, title, question) {
    return '<header class="page-head"><span class="idx">' + esc(idx) + '</span>' +
      '<h1>' + esc(title) + '</h1>' +
      '<p class="q">' + esc(question) + '</p></header>';
  }

  // ------------------------------------------------------- scroll reveal
  /* Reveal on scroll, but never at the cost of hiding content.

     A section that starts at opacity 0 and whose observer never fires — a
     short viewport, a collapsed container, a browser that throttles the
     callback — would stay invisible for good. So anything already at or above
     the fold is revealed synchronously, and a timer reveals whatever is left
     regardless. The animation is an enhancement; legibility is not. */
  function observeReveals(root) {
    const els = Array.prototype.slice.call((root || document).querySelectorAll('.reveal'));
    if (!els.length) return;
    const reveal = function (e) { e.classList.add('in'); };

    if (!('IntersectionObserver' in window) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(reveal);
      return;
    }

    const vh = window.innerHeight || 800;
    const pending = els.filter(function (e) {
      if (e.getBoundingClientRect().top < vh * 0.95) { reveal(e); return false; }
      return true;
    });
    if (!pending.length) return;

    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0.01 });
    pending.forEach(function (e) { io.observe(e); });

    // Safety net: whatever has not revealed itself within 2s is shown anyway.
    setTimeout(function () {
      pending.forEach(function (e) {
        if (!e.classList.contains('in')) { reveal(e); io.unobserve(e); }
      });
    }, 2000);
  }

  /** Count-up on first paint; skipped when the viewer prefers less motion. */
  function countUp(el, to, render) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || isNil(to)) {
      el.textContent = render(to);
      return;
    }
    const dur = 620, t0 = performance.now();
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = render(to * e);
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = render(to);
    }
    requestAnimationFrame(step);
  }

  global.UI = {
    isNil: isNil, compact: compact, money: money, exact: exact, exactMoney: exactMoney,
    pct: pct, signedPct: signedPct, pp: pp, monthLabel: monthLabel, monthRange: monthRange,
    esc: esc, G: G, G2: G2,
    showTip: showTip, hideTip: hideTip, bindTip: bindTip,
    openDrawer: openDrawer, closeDrawer: closeDrawer, sourceDrawer: sourceDrawer,
    kpiTile: kpiTile, deltaSpan: deltaSpan, emptyState: emptyState, pageHead: pageHead,
    observeReveals: observeReveals, countUp: countUp
  };
})(window);
