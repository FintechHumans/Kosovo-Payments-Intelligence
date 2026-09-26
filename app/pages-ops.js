/* The operational pages: where the money is, which way it is moving, and
   where acceptance lags the economy around it.

   These answer a commercial question rather than a statistical one, but they
   are built from the same curated figures and carry the same qualifications.
   Nothing here estimates a bank's revenue: public data sizes the opportunity,
   it does not price it. Every page says so where it matters. */
(function (global) {
  'use strict';

  const DA = global.DataAccess, C = global.Charts, U = global.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  function card(title, note, opts) {
    const o = opts || {};
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = '<div class="card-h"><h3>' + U.esc(title) + '</h3>' +
      (note ? '<span class="note">' + U.esc(note) + '</span>' : '') +
      '</div><div class="card-b"></div>';
    return d;
  }
  function put(host, node) { host.appendChild(node); return $('.card-b', node); }

  function sec(title, sub) {
    return '<section class="sec"><div class="sec-head"><h2>' + U.esc(title) + '</h2>' +
      (sub ? '<span class="sub">' + U.esc(sub) + '</span>' : '') + '</div>';
  }
  function disclosure(summary, body) {
    return '<details class="more"><summary>' + U.esc(summary) + '</summary>' +
      '<div class="body">' + body + '</div></details>';
  }
  function headline(eyebrow, h, lede, figs, meta) {
    return '<section class="home-hero"><span class="label">' + U.esc(eyebrow) + '</span>' +
      '<h1>' + U.esc(h) + '</h1>' +
      (lede ? '<p class="lede">' + lede + '</p>' : '') +
      (figs ? '<div class="home-figs">' + figs + '</div>' : '') +
      (meta ? '<div class="home-meta">' + meta + '</div>' : '') + '</section>';
  }
  function fig(v, k, lead) {
    if (!v) return '';
    return '<div class="home-fig' + (lead ? ' lead' : '') + '"><div class="v">' +
      U.esc(v) + '</div><div class="k">' + U.esc(k) + '</div></div>';
  }

  // =====================================================================
  // CASH & CAPTURE — the biggest pool, and whether cards are winning it
  // =====================================================================
  function renderPool(host) {
    const cash = DA.getCashPool();
    const cap = DA.getRetailCapture();
    if (!cash) { host.innerHTML = U.emptyState('Not available', 'No overlapping channel data.'); return; }
    const L = cash.latest, F = cash.first;

    let h = '<header class="page-head"><h1>Cash and capture</h1>' +
      '<p class="q">How much spending is still settled in cash, and whether cards are ' +
      'taking it.</p></header>';

    h += headline(
      'The pool · ' + U.monthLabel(L.year_month),
      U.money(cash.annualised_cash_pool) + ' is still withdrawn as cash each year',
      'Against ' + U.money(L.pos_value) + ' spent on cards in ' +
        U.monthLabel(L.year_month) + ', ' + U.money(L.atm_value) + ' was taken out of ' +
        'ATMs — <strong>' + L.ratio.toFixed(2) + '×</strong> as much. The ratio was ' +
        F.ratio.toFixed(2) + '× in ' + U.monthLabel(F.year_month) + ', so cards are ' +
        'gaining, steadily.',
      fig(U.money(cash.value_of_one_point), 'a year, for each percentage point moved to cards', true) +
      fig(L.ratio.toFixed(2) + '×', 'cash withdrawn per euro on cards') +
      fig(U.pct(L.card_share_of_the_two, 0), 'of the two channels now on card') +
      fig('€' + L.avg_withdrawal.toFixed(0) + ' / €' + L.avg_card_payment.toFixed(2),
          'average withdrawal against average card payment'),
      '<span>Withdrawals bound the pool from above — not every euro taken out could ' +
      'have been spent at a till.</span>');

    h += '<div class="kpis">' +
      U.kpiTile({ label: 'Card share of the two channels', value: L.card_share_of_the_two,
        display: U.pct(L.card_share_of_the_two, 1),
        foot: U.deltaSpan(L.card_share_of_the_two / F.card_share_of_the_two - 1) +
              ' since ' + U.monthLabel(F.year_month) }) +
      U.kpiTile({ label: 'Cash-to-card ratio', value: L.ratio, display: L.ratio.toFixed(2) + '×',
        foot: 'was ' + F.ratio.toFixed(2) + '× — falling is good' }) +
      U.kpiTile({ label: 'Annual cash pool', value: cash.annualised_cash_pool,
        display: U.money(cash.annualised_cash_pool),
        exact: U.exactMoney(cash.annualised_cash_pool), foot: 'upper bound' }) +
      U.kpiTile({ label: 'One point of it', value: cash.value_of_one_point,
        display: U.money(cash.value_of_one_point),
        exact: U.exactMoney(cash.value_of_one_point), foot: 'extra card turnover a year' }) +
      '</div>';

    h += sec('The ratio is falling', 'Euros withdrawn for every euro spent on cards') +
      '<div class="grid2" id="pool-charts"></div></section>';

    if (cap) {
      h += sec('Cards against the shops themselves',
        'If card value grows faster than retail trade, cards are taking share, not ' +
        'just riding the economy.') +
        '<div class="kpis" style="margin-bottom:12px">' +
        U.kpiTile({ label: 'Card payment value', value: cap.card_value_yoy,
          display: U.signedPct(cap.card_value_yoy),
          foot: 'year on year, ' + cap.months + ' months' }) +
        U.kpiTile({ label: 'Retail trade turnover', value: cap.retail_mean_yoy,
          display: U.signedPct(cap.retail_mean_yoy),
          foot: 'unweighted mean of ' + cap.of + ' activities' }) +
        U.kpiTile({ label: 'Cards ahead by', value: cap.gap_pp,
          display: U.pp(cap.gap_pp), foot: 'percentage points' }) +
        U.kpiTile({ label: 'Activities outgrown', value: cap.outgrown,
          display: cap.outgrown + ' of ' + cap.of, foot: 'retail sectors' }) +
        '</div><div class="card"><div class="card-b" id="cap-chart"></div></div>' +
        disclosure('How this comparison is built',
          '<p>ASK publishes retail turnover as an index (2021 = 100) and does not ' +
          'publish an aggregate retail total, so no total is constructed. Each ' +
          'published activity is compared against the same calendar months a year ' +
          'earlier, and the mean across activities is unweighted — a small activity ' +
          'counts as much as a large one.</p>' +
          '<p>The comparison is of growth rates, not levels. It shows that card value ' +
          'is rising faster than the retail base, which is consistent with cards ' +
          'displacing cash. It does not measure what share of retail spending is on ' +
          'card, because the index carries no euro level.</p>') +
        '</section>';
    }

    host.innerHTML = h;

    const pc = $('#pool-charts', host);
    put(pc, card('Cash-to-card ratio', 'ATM value ÷ POS value'))
      .appendChild(C.line(cash.series.map(function (r) {
        return { year_month: r.year_month, ratio: r.ratio }; }), {
        series: [{ key: 'ratio', color: C.colors.neg, fill: true }], labelEvery: 4,
        yFmt: function (v) { return v.toFixed(2) + '×'; },
        hover: function (r) {
          const s = cash.series.filter(function (x) { return x.year_month === r.year_month; })[0];
          return { name: 'Cash-to-card ratio', value: r.ratio.toFixed(2) + '×',
            delta: s ? U.money(s.atm_value) + ' withdrawn vs ' + U.money(s.pos_value) + ' on cards' : null,
            rows: [['Period', U.monthLabel(r.year_month)], ['Source', 'BQK Raport Mujor']] }; } }));

    put(pc, card('The two channels', 'EUR per month'))
      .appendChild(C.line(cash.series.map(function (r) {
        return { year_month: r.year_month, atm: r.atm_value, pos: r.pos_value }; }), {
        series: [{ key: 'atm', color: C.colors.neg, fill: true },
                 { key: 'pos', color: C.colors.purple, fill: true }],
        labelEvery: 4, yFmt: function (v) { return '€' + C.short(v); },
        hover: function (r) {
          return { name: U.monthLabel(r.year_month),
            value: U.money(r.atm) + ' cash', delta: U.money(r.pos) + ' on cards',
            rows: [['Source', 'BQK Raport Mujor']] }; } }));
    pc.lastChild.insertAdjacentHTML('afterbegin',
      '<div class="legend" style="padding-top:10px">' +
      '<span><i style="background:' + C.colors.neg + '"></i>ATM withdrawals</span>' +
      '<span><i style="background:' + C.colors.purple + '"></i>Card payments</span></div>');

    if (cap) {
      $('#cap-chart', host).appendChild(C.hbars(
        cap.retail_activities.map(function (a) {
          return { label: a.activity.length > 34 ? a.activity.slice(0, 33) + '…' : a.activity,
            value: a.yoy * 100,
            color: a.yoy < cap.card_value_yoy ? C.colors.purpleSoft : C.colors.gold,
            tip: function () {
              return { name: a.activity, value: U.signedPct(a.yoy),
                delta: a.yoy < cap.card_value_yoy ? 'Cards grew faster' : 'Grew faster than cards',
                rows: [['Measure', 'Turnover index, YoY'],
                       ['Months', String(cap.months)], ['Source', 'ASK retail trade']] }; } };
        }).concat([{ label: 'CARD PAYMENT VALUE', value: cap.card_value_yoy * 100,
                     color: C.colors.pos,
                     tip: function () {
                       return { name: 'Card payment value', value: U.signedPct(cap.card_value_yoy),
                         rows: [['Source', 'BQK Raport Mujor']] }; } }]),
        { fmt: function (v) { return v.toFixed(1) + '%'; },
          pad: { t: 6, r: 84, b: 6, l: 210 } }));
    }
  }

  // =====================================================================
  // MIX & MARGIN
  // =====================================================================
  function renderMix(host) {
    const mix = DA.getCardMix();
    const em = DA.getEmergingChannels();
    const b = DA.getPaymentBehaviour();
    const cards = b.cards, lc = cards[cards.length - 1];

    let h = '<header class="page-head"><h1>Mix and margin</h1>' +
      '<p class="q">Volume is growing. What is happening to the composition behind it?' +
      '</p></header>';

    if (mix) {
      const a = mix.first, z = mix.latest;
      const av = mix.first_with_value, zv = mix.latest_with_value;
      const falling = z.credit_share_count < a.credit_share_count;
      h += headline(
        'Card function · ' + U.monthLabel(a.year_month) + ' → ' + U.monthLabel(z.year_month),
        falling ? 'The credit share is shrinking' : 'The credit share is growing',
        'Credit-function cards carried <strong>' + U.pct(a.credit_share_count, 1) +
        '</strong> of card payments in ' + U.monthLabel(a.year_month) + ' and <strong>' +
        U.pct(z.credit_share_count, 1) + '</strong> in ' + U.monthLabel(z.year_month) +
        '. Volume is rising throughout; the composition is moving toward debit.',
        fig(U.pct(z.credit_share_count, 1), 'of transactions on credit function', true) +
        (zv ? fig(U.pct(zv.credit_share_value, 1), 'of value on credit function') : '') +
        fig(U.pp(z.credit_share_count - a.credit_share_count), 'change in share') +
        fig(U.pct(lc['Contactless'] / lc['All cards'], 0), 'of cards are contactless'),
        '<span>Instalment plans are not published by BQK — credit-function payments ' +
        'are the nearest proxy and are not the same measure.</span>');

      h += sec('Credit share over time', 'Share of card payments by card function') +
        '<div class="grid2" id="mix-charts"></div>' +
        disclosure('Why this matters commercially, and what it does not tell you',
          '<p>Card function affects the economics of acceptance: schemes price credit ' +
          'and debit differently, so a shift in composition moves acquiring margin even ' +
          'when volume is flat. A falling credit share is a margin headwind.</p>' +
          '<p>Public data shows the mix. It does not show what any bank earns on it — ' +
          'merchant service charges, interchange and scheme fees are not published. ' +
          'Sizing the effect requires internal data.</p>' +
          '<p>BQK publishes no instalment or buy-now-pay-later series in any reviewed ' +
          'table. Credit-function payments include instalment purchases but are not ' +
          'limited to them.</p>') +
        '</section>';
    }

    if (em) {
      const scale = em._pos_scale;
      h += sec('The small, fast channels',
        'Tiny against POS, but growing several times faster.') +
        '<div class="kpis" style="margin-bottom:12px">' +
        ['E-commerce', 'Digital Wallet', 'E-money'].filter(function (k) { return em[k]; })
          .map(function (k) {
            const e = em[k];
            return U.kpiTile({ label: k, value: e.latest, display: U.compact(e.latest),
              exact: U.exact(e.latest),
              foot: U.deltaSpan(e.yoy) + ' YoY · ' + U.monthLabel(e.latest_period) });
          }).join('') +
        (scale ? U.kpiTile({ label: 'POS, for scale', value: scale.latest,
          display: U.compact(scale.latest), exact: U.exact(scale.latest),
          foot: U.monthLabel(scale.latest_period) }) : '') +
        '</div><div class="grid2" id="em-charts"></div></section>';
    }

    h += sec('The card estate', 'What the market carries') +
      '<div class="grid2" id="mix-cards"></div></section>';

    host.innerHTML = h;

    if (mix) {
      const mc = $('#mix-charts', host);
      put(mc, card('Credit share of transactions', 'by count'))
        .appendChild(C.line(mix.series.map(function (r) {
          return { year_month: r.year_month, s: r.credit_share_count }; }), {
          series: [{ key: 's', color: C.colors.neg, fill: true }], labelEvery: 3,
          yFmt: function (v) { return (v * 100).toFixed(1) + '%'; },
          hover: function (r) {
            const s = mix.series.filter(function (x) { return x.year_month === r.year_month; })[0];
            return { name: 'Credit share, count', value: U.pct(r.s, 2),
              delta: s ? U.exact(s.credit_count) + ' credit / ' + U.exact(s.debit_count) + ' debit' : null,
              rows: [['Period', U.monthLabel(r.year_month)],
                     ['Source', 'BQK, payments by instrument']] }; } }));
      const withv = mix.series.filter(function (r) { return r.credit_share_value != null; });
      if (withv.length) {
        put(mc, card('Credit share of value', 'by EUR'))
          .appendChild(C.line(withv.map(function (r) {
            return { year_month: r.year_month, s: r.credit_share_value }; }), {
            series: [{ key: 's', color: C.colors.gold, fill: true }], labelEvery: 3,
            yFmt: function (v) { return (v * 100).toFixed(1) + '%'; },
            hover: function (r) {
              return { name: 'Credit share, value', value: U.pct(r.s, 2),
                rows: [['Period', U.monthLabel(r.year_month)],
                       ['Source', 'BQK, payments by instrument']] }; } }));
      }
    }

    if (em) {
      const ec = $('#em-charts', host);
      ['E-commerce', 'Digital Wallet'].forEach(function (k) {
        if (!em[k]) return;
        put(ec, card(k, 'transactions per month'))
          .appendChild(C.line(em[k].series, {
            series: [{ key: 'count', color: C.colors.purple, fill: true }],
            labelEvery: 3, hover: function (r) {
              return { name: k, value: U.exact(r.count),
                rows: [['Period', U.monthLabel(r.year_month)],
                       ['Source', 'BQK, payments by instrument']] }; } }));
      });
    }

    const cardHost = $('#mix-cards', host);
    put(cardHost, card('Card composition', U.monthLabel(lc.year_month)))
      .appendChild(C.hbars([
        { label: 'Contactless', value: lc['Contactless'] },
        { label: 'Contact only', value: lc['Contact'] },
        { label: 'Debit', value: lc['Debit'] },
        { label: 'Credit', value: lc['Credit'] },
        { label: 'Visa', value: lc['Visa'] },
        { label: 'Mastercard', value: lc['Mastercard'] }
      ], { fmt: C.short }));
    put(cardHost, card('Contactless adoption', 'share of all valid cards'))
      .appendChild(C.line(cards.map(function (r) {
        return { year_month: r.year_month,
          share: r['All cards'] ? r['Contactless'] / r['All cards'] : null }; }), {
        series: [{ key: 'share', color: C.colors.pos, fill: true }], labelEvery: 4,
        yFmt: function (v) { return (v * 100).toFixed(0) + '%'; },
        hover: function (r) {
          return { name: 'Contactless share', value: U.pct(r.share, 2),
            rows: [['Period', U.monthLabel(r.year_month)], ['Source', 'BQK Raport Mujor']] }; } }));
  }

  // =====================================================================
  // POSITION — Kosovo against the euro area
  // =====================================================================
  function renderPosition(host) {
    const bm = DA.getBenchmarks();
    if (!bm) { host.innerHTML = U.emptyState('Not available', 'No benchmark data.'); return; }

    const perCap = bm.levels[0];
    let h = '<header class="page-head"><h1>Position</h1>' +
      '<p class="q">Where Kosovo sits against the euro area, and how fast the gap is ' +
      'closing.</p></header>';

    h += headline(
      'Against the euro area · ' + bm.reference,
      'Kosovo runs at ' + U.pct(perCap.index, 0) + ' of euro-area card usage per person',
      'Every euro-area figure is quoted from the ECB release for the same half-year, so ' +
      'the comparison is like for like. Kosovo is far behind on levels — and growing ' +
      'several times faster on every usage measure.',
      bm.levels.filter(function (r) { return r.index; }).slice(0, 4).map(function (r, i) {
        return fig(U.pct(r.index, 0), r.measure.toLowerCase(), i === 0);
      }).join(''),
      '<span>' + U.esc(bm.source) + '</span><span>·</span>' +
      '<span>Population ' + U.exact(bm.population) + ', ASK census 2024</span>');

    h += sec('Levels', 'Kosovo against the euro area, same half-year') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Measure</th>' +
      '<th class="n">Kosovo</th><th class="n">Euro area</th><th class="n">Kosovo as %</th>' +
      '</tr></thead><tbody>' +
      bm.levels.map(function (r) {
        return '<tr><td class="strong">' + U.esc(r.measure) + '</td>' +
          '<td class="n">' + (r.kosovo == null ? '—' :
            (r.unit === 'EUR' ? '€' + r.kosovo.toFixed(2) : r.kosovo.toFixed(2))) + '</td>' +
          '<td class="n">' + (r.unit === 'EUR' ? '€' + r.euro_area.toFixed(2)
                                                : r.euro_area.toFixed(2)) + '</td>' +
          '<td class="n">' + (r.index ? U.pct(r.index, 0) : '—') + '</td></tr>';
      }).join('') +
      '<tr><td class="strong">Payments per terminal per year</td>' +
      '<td class="n">' + U.exact(bm.payments_per_terminal_year) + '</td>' +
      '<td class="n">' + U.exact(bm.euro_area_payments_per_terminal_year) + '</td>' +
      '<td class="n">' + U.pct(bm.productivity_index, 0) + '</td></tr>' +
      '</tbody></table></div></div></section>';

    h += sec('Growth', 'Kosovo against the euro area, year on year') +
      '<div class="card"><div class="card-b" id="pos-growth"></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Measure</th><th class="n">Kosovo</th><th class="n">Euro area</th>' +
      '<th class="n">Multiple</th></tr></thead><tbody>' +
      bm.growth.map(function (g) {
        return '<tr><td class="strong">' + U.esc(g.measure) + '</td>' +
          '<td class="n">' + (g.kosovo == null ? '—' : U.signedPct(g.kosovo)) + '</td>' +
          '<td class="n">' + U.signedPct(g.euro_area) + '</td>' +
          '<td class="n">' + (g.multiple ? g.multiple.toFixed(1) + '×' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      disclosure('What the comparison does and does not establish',
        '<p>Kosovo figures are computed from BQK publications for exactly the half-year ' +
        'the ECB reports, and euro-area figures are quoted from the ECB release rather ' +
        'than recomputed. Population comes from the ASK 2024 census.</p>' +
        '<p>Card payments per terminal are shown because they are the measure that ' +
        'surprises: Kosovo has far fewer terminals per person than the euro area, but ' +
        'each terminal is closer to euro-area workload than the per-person gap would ' +
        'suggest. The two should not be conflated — one is about coverage, the other ' +
        'about utilisation.</p>' +
        '<p>Nothing here adjusts for price level, tourism, cash preference or the ' +
        'informal economy, all of which differ between the two.</p>') +
      '</section>';

    host.innerHTML = h;

    $('#pos-growth', host).appendChild(C.bars(
      bm.growth.filter(function (g) { return g.kosovo != null; }).map(function (g) {
        return { label: g.measure.replace(' ', '\n'), value: g.kosovo,
          color: g.multiple > 1 ? C.colors.pos : C.colors.neg,
          tip: function () {
            return { name: g.measure, value: U.signedPct(g.kosovo),
              delta: 'Euro area ' + U.signedPct(g.euro_area),
              rows: [['Multiple', g.multiple ? g.multiple.toFixed(1) + '×' : '—'],
                     ['Period', bm.reference]] }; } };
      }), { h: 250 }));
  }

  // =====================================================================
  // COVERAGE — where acceptance lags the economy around it
  // =====================================================================
  function renderCoverage(host, state) {
    const hr = DA.getHeadroom();
    const ent = DA.getEnterprises();
    const years = DA.atkYears();
    const year = (state && state.year) || years[years.length - 1];
    const muni = (state && state.municipality) || 'All';
    const rows = DA.getSectorIntelligence({ year: year, municipality: muni });
    const total = rows.reduce(function (a, r) { return a + r.turnover; }, 0);
    const byCls = {};
    rows.forEach(function (r) {
      byCls[r.addressability] = (byCls[r.addressability] || 0) + r.turnover; });
    const floor = byCls['HIGH'] || 0;
    const ceiling = floor + (byCls['REVIEW_REQUIRED'] || 0);

    let h = '<header class="page-head"><h1>Coverage</h1>' +
      '<p class="q">Where acceptance sits below the economy around it, and which parts ' +
      'of that economy can plausibly take a card.</p></header>';

    if (hr && hr.rows.length) {
      const gaps = hr.rows.filter(function (r) { return r.terminals_to_median; });
      const totalGap = gaps.reduce(function (a, r) { return a + r.terminals_to_median; }, 0);
      h += headline(
        'Acceptance density · 2024',
        gaps.length
          ? 'Three cities sit below the median density of their peers'
          : 'Acceptance density is even across the published cities',
        gaps.length
          ? 'Bringing every city up to the median of <strong>' +
            hr.median_density.toFixed(2) + '</strong> terminals per €1m of ' +
            'card-addressable turnover would take roughly <strong>' + totalGap +
            '</strong> more terminals, most of them in ' + gaps[gaps.length - 1].city + '.'
          : '',
        gaps.map(function (r, i) {
          return fig('+' + r.terminals_to_median, r.city + ', to reach the median', i === gaps.length - 1);
        }).join('') +
        fig(hr.median_density.toFixed(2), 'median terminals per €1m addressable'),
        '<span>Terminal counts are BQK city estimates against ATK municipality ' +
        'turnover — indicative of relative position, not a target.</span>');
    }

    h += '<div class="kpis">' +
      U.kpiTile({ label: 'Declared turnover', value: total, display: U.money(total),
        exact: U.exactMoney(total), foot: muni + ' · ' + year }) +
      U.kpiTile({ label: 'Card-addressable', value: floor,
        display: U.money(floor) + ' – ' + U.money(ceiling), small: true,
        foot: U.pct(floor / total, 0) + ' – ' + U.pct(ceiling / total, 0) + ' of turnover' }) +
      (ent ? U.kpiTile({ label: 'Registered enterprises',
        value: (ent.by_municipality[muni] || {}).total ||
               Object.keys(ent.by_municipality).reduce(function (a, k) {
                 return a + ent.by_municipality[k].total; }, 0),
        display: U.compact((ent.by_municipality[muni] || {}).total ||
               Object.keys(ent.by_municipality).reduce(function (a, k) {
                 return a + ent.by_municipality[k].total; }, 0)),
        foot: 'ASK register · ' + ent.latest }) : '') +
      U.kpiTile({ label: 'Sectors', value: rows.length, display: String(rows.length),
        foot: 'NACE sections' }) +
      '</div>';

    if (hr && hr.rows.length) {
      h += sec('Density by city', 'Terminals against the local economy') +
        '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>City</th>' +
        '<th class="n">Terminals (est.)</th><th class="n">Enterprises</th>' +
        '<th class="n">Taxpayers</th><th class="n">Addressable</th>' +
        '<th class="n">Per €1m</th><th class="n">To median</th></tr></thead><tbody>' +
        hr.rows.map(function (r) {
          return '<tr><td class="strong">' + U.esc(r.city) + '</td>' +
            '<td class="n">' + U.exact(r.pos_terminals) + '</td>' +
            '<td class="n">' + (r.enterprises ? U.exact(r.enterprises) : '—') + '</td>' +
            '<td class="n">' + (r.taxpayers ? U.exact(r.taxpayers) : '—') + '</td>' +
            '<td class="n">' + U.money(r.addressable_ceiling) + '</td>' +
            '<td class="n">' + (r.pos_per_eur1m_ceiling
              ? r.pos_per_eur1m_ceiling.toFixed(2) : '—') + '</td>' +
            '<td class="n">' + (r.terminals_to_median
              ? '<span class="delta down">+' + r.terminals_to_median + '</span>' : '—') +
            '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        disclosure('Two denominators, and why both are shown',
          '<p>ATK counts registered <em>taxpayers</em> — entities filing a return, ' +
          'including many that accept no cards. ASK counts registered ' +
          '<em>enterprises</em> in its business register, which is closer to a ' +
          'merchant population but still includes businesses that never trade.</p>' +
          '<p>Neither is a count of card-accepting merchants; BQK publishes that only ' +
          'as a national total. Both are shown so the difference is visible rather ' +
          'than hidden inside one ratio.</p>' +
          '<p>Terminal counts remain BQK city estimates read from an annual chart, ' +
          'against ATK municipality turnover. The grain does not match and the ' +
          'comparison is indicative.</p>') +
        '</section>';
    }

    h += sec('Which sectors can take a card', year + ' · ' + muni) +
      '<div class="grid2" id="cov-sectors"></div>' +
      disclosure('Why card-addressable turnover is a range, not a number',
        '<p>ATK publishes sector only at NACE section level. Wholesale and retail are ' +
        'one section worth about 46% of all turnover — wholesale is not a card ' +
        'channel, retail is the most card-facing activity there is, and no split is ' +
        'published.</p>' +
        '<p>Rather than invent a percentage, the floor counts only unambiguously ' +
        'card-facing sectors and the ceiling adds the combined trade section. The ' +
        'classification is an analytical judgement, listed in full under Methodology.</p>') +
      '</section>';

    h += sec('Sector detail', 'Turnover and taxpayers by section') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Sector</th>' +
      '<th>Card-addressable</th><th class="n">Turnover</th><th class="n">Share</th>' +
      '<th class="n">Taxpayers</th></tr></thead><tbody>' +
      rows.slice().sort(function (a, b) { return b.turnover - a.turnover; })
        .map(function (r) {
          return '<tr><td class="strong">' + U.esc(r.sector) + '</td>' +
            '<td><span class="badge ' + r.addressability + '">' +
            U.esc(r.addressability.replace(/_/g, ' ')) + '</span></td>' +
            '<td class="n">' + U.money(r.turnover) + '</td>' +
            '<td class="n">' + U.pct(r.turnover / total) + '</td>' +
            '<td class="n">' + U.exact(r.taxpayers) + '</td></tr>';
        }).join('') + '</tbody></table></div></div></section>';

    host.innerHTML = h;

    const colorOf = function (c) {
      return c === 'HIGH' ? C.colors.pos : c === 'REVIEW_REQUIRED' ? C.colors.neg
           : c === 'MEDIUM' ? C.colors.gold : C.colors.purpleSoft;
    };
    const sorted = rows.slice().sort(function (a, b) { return b.turnover - a.turnover; });
    const sh = $('#cov-sectors', host);
    put(sh, card('Largest sectors', year + ' · top 10'))
      .appendChild(C.hbars(sorted.slice(0, 10).map(function (r) {
        return { label: r.sector.length > 28 ? r.sector.slice(0, 27) + '…' : r.sector,
          value: r.turnover, color: colorOf(r.addressability),
          tip: function () {
            return { name: r.sector, value: U.exactMoney(r.turnover),
              rows: [['Share', U.pct(r.turnover / total)],
                     ['Taxpayers', U.exact(r.taxpayers)],
                     ['Addressable', r.addressability.replace(/_/g, ' ')],
                     ['Source', 'ATK Qarkullimi']] }; } };
      }), { fmt: function (v) { return '€' + C.short(v); }, pad: { t: 6, r: 92, b: 6, l: 190 } }));

    put(sh, card('By card-addressability', String(year)))
      .appendChild(C.hbars(['HIGH', 'MEDIUM', 'LOW', 'REVIEW_REQUIRED']
        .filter(function (k) { return byCls[k]; }).map(function (k) {
          return { label: k.replace(/_/g, ' '), value: byCls[k], color: colorOf(k) };
        }), { fmt: function (v) { return '€' + C.short(v); },
               pad: { t: 6, r: 92, b: 6, l: 160 } }));
  }

  global.OpsPages = { renderPool: renderPool, renderMix: renderMix,
                      renderPosition: renderPosition, renderCoverage: renderCoverage };
})(window);
