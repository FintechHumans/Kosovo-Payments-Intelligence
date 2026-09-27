/* The management cockpit.

   One card per question management asks, each carrying the same six things:
   signal, scale, evidence, implication, confidence, source level. A card
   missing any of them is not built at the ETL stage, so this file renders
   what it is given and invents nothing.

   The watchlist is ranked by what is weakest, not by what reads best, so a
   healthy signal cannot crowd out a binding one. */
(function (global) {
  'use strict';

  const DA = global.DataAccess, U = global.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };

  const SIGNAL_TONE = {
    'Accelerating': 'pos', 'Expanding': 'pos', 'Falling': 'pos',
    'Above fair share': 'pos',
    'Constrained': 'neg', 'Contracting': 'neg', 'Rising': 'neg',
    'Below fair share': 'neg', 'Thinly evidenced': 'warn',
    'Slowing': 'neg', 'Unknown': 'warn'
  };

  function tone(signal) {
    for (const k in SIGNAL_TONE) {
      if (signal.indexOf(k) === 0) return SIGNAL_TONE[k];
    }
    return 'warn';
  }

  function card(c) {
    const t = tone(c.signal);
    return '<article class="ck-card ck-' + t + '" id="ck-' + U.esc(c.key) + '">' +
      '<header class="ck-head">' +
        '<div><h3>' + U.esc(c.title) + '</h3>' +
        '<p class="ck-q">' + U.esc(c.question) + '</p></div>' +
        '<div class="ck-badges">' +
          '<span class="ck-conf ck-conf-' + U.esc(c.confidence.toLowerCase()) + '">' +
            U.esc(c.confidence) + '</span>' +
          '<span class="ck-level" title="Provenance level">' +
            U.esc(c.level) + '</span>' +
        '</div>' +
      '</header>' +
      '<div class="ck-signal"><span class="ck-dot"></span>' +
        U.esc(c.signal) + '</div>' +
      '<p class="ck-scale">' + U.esc(c.scale) + '</p>' +
      '<ul class="ck-evidence">' +
        c.evidence.map(function (e) {
          return '<li>' + U.esc(e) + '</li>'; }).join('') +
      '</ul>' +
      '<p class="ck-imp">' + U.esc(c.implication) + '</p>' +
      (c.limitation
        ? '<p class="ck-lim"><strong>Limit.</strong> ' + U.esc(c.limitation) + '</p>'
        : '') +
      '<footer class="ck-foot">' + U.esc(c.sources.join(' · ')) + '</footer>' +
      '</article>';
  }

  function render(host) {
    const ck = DA.getCockpit();
    if (!ck) {
      host.innerHTML = U.emptyState('Not available',
        'The cockpit is derived from the operational levers; none are loaded.');
      return;
    }
    const warn = ck.cards.filter(function (c) {
      return c.confidence !== 'PASS'; }).length;

    let h = '<header class="page-head"><h1>Decision cockpit</h1>' +
      '<p class="q">Eight questions, each answered with a signal, its scale, the ' +
      'evidence behind it and what that evidence does not support.</p></header>';

    h += '<section class="ck-watch"><div class="ck-watch-head">' +
      '<span class="label">Watchlist</span>' +
      '<span class="note">Ranked by what is weakest or least anchored, not by ' +
      'what reads best</span></div>' +
      '<ol class="ck-watch-list">' +
      ck.watchlist.map(function (w) {
        return '<li><div class="ck-w-top">' +
          '<span class="ck-w-title">' + U.esc(w.title) + '</span>' +
          '<span class="ck-w-signal ck-' + tone(w.signal) + '">' +
            U.esc(w.signal) + '</span>' +
          '<span class="ck-conf ck-conf-' + U.esc(w.confidence.toLowerCase()) + '">' +
            U.esc(w.confidence) + '</span>' +
          '<span class="ck-level">' + U.esc(w.level) + '</span>' +
          '</div>' +
          '<div class="ck-w-scale">' + U.esc(w.scale) + '</div>' +
          '<div class="ck-w-why">' + U.esc(w.why) + '</div></li>';
      }).join('') + '</ol></section>';

    h += '<section class="sec"><div class="sec-head"><h2>The eight</h2>' +
      '<span class="sub">' + ck.cards.length + ' cards · ' + warn +
      ' carry a warning</span></div>' +
      '<div class="ck-grid">' + ck.cards.map(card).join('') + '</div>' +
      '<details class="more"><summary>What the letters mean</summary>' +
      '<div class="body">' +
      '<p><strong>PASS, WARNING, BLOCKED</strong> describe whether the inputs ' +
      'support the measure. <strong>A, B and C</strong> describe where the inputs ' +
      'came from, which is a different question — a figure can be perfectly sound ' +
      'and still rest on a supplied extract.</p><ul>' +
      Object.keys(ck.levels).map(function (k) {
        return '<li><strong>' + U.esc(k) + '</strong> — ' +
          U.esc(ck.levels[k]) + '</li>'; }).join('') +
      '</ul><p>A card takes the level of its <em>weakest</em> source. Reporting ' +
      'the strongest would let one machine-readable series vouch for a supplied ' +
      'extract sitting beside it.</p>' +
      '<p>' + U.esc(ck.note) + '</p></div></details></section>';

    host.innerHTML = h;
    U.observeReveals(host);
  }

  global.Cockpit = { render: render };
})(window);
