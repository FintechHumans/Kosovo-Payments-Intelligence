/* The executive summary.

   One page, read top to bottom, with nothing to operate: no rail, no filters,
   no mode switch, no source buttons. Six steps, each a sentence and a picture.
   Whatever needs qualifying is qualified in the sentence itself rather than in
   a chip or a drawer.

   The analyst tool still exists behind a single link at the end. That is the
   separation: this is for reading, that is for working. */
(function (global) {
  'use strict';

  const DA = global.DataAccess, C = global.Charts, U = global.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };

  function chart(node) {
    const d = document.createElement('div');
    d.className = 'sum-chart';
    d.appendChild(node);
    return d;
  }

  function step(n, kicker, finding, note) {
    return '<section class="sum-step" id="sum-' + n + '">' +
      '<div class="sum-text">' +
      '<span class="sum-n">' + n + '</span>' +
      '<h2>' + finding + '</h2>' +
      (kicker ? '<p class="sum-k">' + kicker + '</p>' : '') +
      (note ? '<p class="sum-note">' + U.esc(note) + '</p>' : '') +
      '</div>' +
      '<div class="sum-vis" id="vis-' + n + '"></div>' +
      '</section>';
  }

  function render(host) {
    const pen = DA.getPenetration();
    const cap = DA.getRetailCapture();
    const cash = DA.getCashPool();
    const bm = DA.getBenchmarks();
    const mix = DA.getCardMix();
    const meta = DA.meta();

    let h = '';

    // ---- opening
    h += '<section class="sum-open">' +
      '<span class="sum-eyebrow">Kosovo Merchant &amp; Payments Intelligence</span>' +
      '<h1>' + (pen
        ? 'Cards are winning. Most of the economy is still up for it.'
        : 'The Kosovo payments market') + '</h1>' +
      (pen ? '<p class="sum-lede">Between ' + pen.first.year + ' and ' + pen.latest.year +
        ' the declared economy grew ' + pen.economy_multiple.toFixed(2) + ' times. ' +
        'Card spending grew ' + pen.card_multiple.toFixed(2) + ' times. Yet only ' +
        U.pct(pen.penetration_latest, 1) + ' of turnover settles on a card today.</p>' : '') +
      '<div class="sum-meta">Central Bank of Kosovo · Tax Administration · ' +
      'Kosovo Agency of Statistics · ECB &nbsp;·&nbsp; data to ' +
      U.monthLabel(meta.bqk_latest) + '</div>' +
      '</section>';

    // ---- 01 the shift
    if (pen) {
      h += step('01', null,
        'Card penetration has doubled in six years',
        'Card value over all declared business turnover. Turnover includes wholesale ' +
        'and business-to-business trade that no card could settle, so the level is a ' +
        'floor — the direction is what matters.');
    }

    // ---- 02 displacement
    if (cap) {
      h += step('02', null,
        'Cards are taking share, not just riding growth',
        'Card value grew ' + U.signedPct(cap.card_value_yoy) + ' against retail trade at ' +
        U.signedPct(cap.retail_mean_yoy) + ', outgrowing ' + cap.outgrown + ' of the ' +
        cap.of + ' retail activities the statistics agency publishes.');
    }

    // ---- 03 what remains
    if (cash) {
      h += step('03', null,
        U.money(cash.annualised_cash_pool) + ' a year still leaves cash machines',
        'Not all of it could ever be spent at a till — rent, wages and private transfers ' +
        'move as cash too. It bounds the opportunity rather than describing it.');
    }

    // ---- 04 acceptance
    if (bm) {
      h += step('04', null,
        'Acceptance is a quarter of European density',
        'Compared with the euro area for the same half-year, using the central bank’s ' +
        'own published figures.');
    }

    // ---- 05 margin
    if (mix) {
      h += step('05', null,
        'And each transaction is worth a little less',
        'Credit-function cards are priced differently from debit, so a shift in the mix ' +
        'changes what acceptance earns even when volume rises. What it costs cannot be ' +
        'calculated from public data.');
    }

    // ---- conclusion
    if (pen) {
      h += '<section class="sum-conc">' +
        '<span class="sum-eyebrow">The conclusion</span>' +
        '<h2>Demand is not the constraint.</h2>' +
        '<p>Card spending is compounding at ' + (pen.card_cagr * 100).toFixed(0) +
        '% a year against an economy growing ' + (pen.economy_cagr * 100).toFixed(0) +
        '%. Nobody needs persuading to use a card. What limits the business is where a ' +
        'card can be presented, and what each payment is worth.</p>' +
        '<p class="sum-caveat">No revenue or profit figure appears anywhere in this ' +
        'report. Merchant charges, interchange and terminal-level activity are published ' +
        'by no one. Everything here sizes the opportunity; pricing it needs internal data.</p>' +
        '<button class="sum-cta" id="go-tool">Explore the full analysis →</button>' +
        '</section>';
    }

    host.innerHTML = h;

    // ---- the pictures
    if (pen) {
      $('#vis-01', host).appendChild(chart(C.line(
        pen.series.map(function (s) {
          return { year_month: String(s.year) + '-01', pen: s.penetration }; }), {
          w: 660, h: 300, series: [{ key: 'pen', color: C.colors.purple, fill: true }],
          labelEvery: 1, baseZero: true,
          xFmt: function (r) { return r.year_month.slice(0, 4); },
          yFmt: function (v) { return (v * 100).toFixed(1) + '%'; },
          hover: function (r, i) {
            const s = pen.series[i];
            return { name: String(s.year), value: U.pct(s.penetration, 2),
              delta: U.money(s.card_value) + ' of ' + U.money(s.turnover) }; } })));
    }
    if (cap) {
      // Card payments sit in the ranking rather than on top of it, so the
      // reader can see where they actually fall among the retail activities.
      const items = cap.retail_activities.map(function (a) {
        return { label: a.activity.length > 26 ? a.activity.slice(0, 25) + '…' : a.activity,
          value: a.yoy * 100, color: C.colors.purpleSoft };
      });
      items.push({ label: 'Card payments', value: cap.card_value_yoy * 100,
                   color: C.colors.pos, card: true });
      items.sort(function (x, y) { return y.value - x.value; });
      $('#vis-02', host).appendChild(chart(C.hbars(items, {
        w: 660, rowH: 30, fmt: function (v) { return v.toFixed(1) + '%'; },
        pad: { t: 6, r: 74, b: 6, l: 180 } })));
    }
    if (cash) {
      $('#vis-03', host).appendChild(chart(C.line(
        cash.series.map(function (r) {
          return { year_month: r.year_month, atm: r.atm_value, pos: r.pos_value }; }), {
          w: 660, h: 300, labelEvery: 4,
          series: [{ key: 'atm', color: C.colors.neg, fill: true },
                   { key: 'pos', color: C.colors.purple, fill: true }],
          yFmt: function (v) { return '€' + C.short(v); },
          hover: function (r) {
            return { name: U.monthLabel(r.year_month), value: U.money(r.atm) + ' cash',
              delta: U.money(r.pos) + ' on cards' }; } })));
      $('#vis-03', host).insertAdjacentHTML('beforeend',
        '<div class="sum-legend"><span><i style="background:' + C.colors.neg +
        '"></i>Withdrawn as cash</span><span><i style="background:' + C.colors.purple +
        '"></i>Spent on cards</span></div>');
    }
    if (bm) {
      $('#vis-04', host).appendChild(chart(C.hbars(
        bm.levels.filter(function (r) { return r.index; }).map(function (r) {
          return { label: r.measure.replace(', half-year', '')
                     .replace('per 1,000 inhabitants', 'per 1,000 people'),
            value: r.index * 100,
            color: r.index < 0.5 ? C.colors.neg : C.colors.purpleSoft };
        }), { w: 660, rowH: 34, fmt: function (v) { return v.toFixed(0) + '%'; },
               pad: { t: 6, r: 74, b: 6, l: 230 } })));
      $('#vis-04', host).insertAdjacentHTML('beforeend',
        '<div class="sum-legend"><span>Kosovo as a percentage of the euro area, ' +
        U.esc(bm.reference) + '</span></div>');
    }
    if (mix) {
      $('#vis-05', host).appendChild(chart(C.line(
        mix.series.map(function (r) {
          return { year_month: r.year_month, s: r.credit_share_count }; }), {
          w: 660, h: 300, series: [{ key: 's', color: C.colors.neg, fill: true }],
          labelEvery: 3, yFmt: function (v) { return (v * 100).toFixed(1) + '%'; },
          hover: function (r) {
            return { name: 'Credit share of card payments', value: U.pct(r.s, 2),
              delta: U.monthLabel(r.year_month) }; } })));
      $('#vis-05', host).insertAdjacentHTML('beforeend',
        '<div class="sum-legend"><span>Share of card payments made on a credit-function ' +
        'card</span></div>');
    }

    const cta = $('#go-tool', host);
    if (cta) cta.addEventListener('click', function () {
      if (global.__enterTool) global.__enterTool();
    });

    U.observeReveals(host);
  }

  global.Summary = { render: render };
})(window);
