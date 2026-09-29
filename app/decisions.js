/* The five decisions.

   The first screen, and the test it has to pass: a chief executive opens it
   and in a minute knows where the opportunity is and what to do. That is a
   question about subtraction. Five decisions, each with one number, one basis,
   one action and a stated confidence — and nothing else competing for the eye.

   Every figure stops at payment volume. Nothing here prices a transaction,
   because no public source publishes merchant charges or interchange, and the
   page says so rather than letting a reader assume otherwise. */
(function (global) {
  'use strict';

  const DA = global.DataAccess, U = global.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };

  function money(v) {
    if (v === null || v === undefined) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return '€' + (v / 1e9).toFixed(2) + 'bn';
    if (a >= 1e6) return '€' + (v / 1e6).toFixed(1) + 'm';
    if (a >= 1e3) return '€' + Math.round(v / 1e3) + 'k';
    return '€' + Math.round(v);
  }

  function figure(d) {
    if (d.number === null || d.number === undefined) return '—';
    if (/volume|value/.test(d.unit)) return money(d.number);
    if (/of businesses/.test(d.unit)) return U.pct(d.number, 0);
    return U.exact(Math.round(d.number));
  }

  function card(d) {
    return '<article class="dc-card dc-' + d.confidence.toLowerCase() + '">' +
      '<div class="dc-n">' + U.esc(d.n) + '</div>' +
      '<div class="dc-body">' +
        '<div class="dc-verb">' + U.esc(d.verb) +
          '<span class="dc-conf">' + U.esc(d.confidence) + ' confidence</span>' +
        '</div>' +
        '<h3 class="dc-q">' + U.esc(d.question) + '</h3>' +
        '<p class="dc-a">' + U.esc(d.answer) + '</p>' +
        '<div class="dc-fig"><span class="dc-v">' + figure(d) + '</span>' +
          '<span class="dc-u">' + U.esc(d.unit) + '</span></div>' +
        '<p class="dc-basis"><strong>Because.</strong> ' + U.esc(d.basis) + '</p>' +
        '<p class="dc-action"><strong>Do.</strong> ' + U.esc(d.action) + '</p>' +
        (d.limit ? '<p class="dc-limit"><strong>But.</strong> ' +
          U.esc(d.limit) + '</p>' : '') +
        (d.needs ? '<p class="dc-needs"><strong>Would settle it.</strong> ' +
          U.esc(d.needs) + '</p>' : '') +
      '</div></article>';
  }

  function render(host) {
    const dc = DA.getDecisions();
    if (!dc || !dc.decisions.length) {
      host.innerHTML = U.emptyState('Not available',
        'The decisions are derived from the operational levers; none are loaded.');
      return;
    }
    const h0 = dc.headline;

    let h = '<header class="page-head"><h1>Five decisions</h1>' +
      '<p class="q">Where the opportunity is, how large it is, and what the ' +
      'evidence supports doing about it.</p></header>';

    if (h0) {
      h += '<section class="dc-headline">' +
        '<span class="label">The comparison the five produce between them</span>' +
        '<h2>' + U.esc(h0.claim) + '</h2>' +
        '<div class="dc-versus">' +
          '<div class="dc-side"><div class="dc-side-v">' +
            money(h0.build_value) + '</div>' +
            '<div class="dc-side-k">' + U.esc(h0.build_label) + '</div></div>' +
          '<div class="dc-vs">against</div>' +
          '<div class="dc-side dc-side-lead"><div class="dc-side-v">' +
            money(h0.activate_value) + '</div>' +
            '<div class="dc-side-k">' + U.esc(h0.activate_label) + '</div></div>' +
        '</div>' +
        '<p class="dc-reading">' + U.esc(h0.reading) + '</p>' +
        '<p class="dc-caveat">' + U.esc(h0.caveat) + '</p>' +
        '</section>';
    }

    h += '<div class="dc-grid">' + dc.decisions.map(card).join('') + '</div>';

    h += '<section class="sec" style="margin-top:var(--s6)">' +
      '<div class="card"><div class="card-b" style="padding-top:20px">' +
      '<h3 style="font-size:15px;font-weight:600;margin-bottom:8px">' +
      'Where the arithmetic stops</h3>' +
      '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.7;max-width:64ch">' +
      U.esc(dc.note) + '</p>' +
      '<p style="font-size:12px;color:var(--ink-3);line-height:1.6;max-width:64ch;' +
      'margin-top:12px">To carry any of these figures through to contribution, ' +
      'the bank supplies what no publisher does: merchant discount rate, ' +
      'interchange, scheme and processing cost, terminal cost and servicing. ' +
      'Those are inputs, not estimates, and none is assumed here.</p>' +
      '</div></div></section>';

    host.innerHTML = h;
    U.observeReveals(host);
  }

  global.Decisions = { render: render };
})(window);
