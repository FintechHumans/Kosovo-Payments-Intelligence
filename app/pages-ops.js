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

    const win = cash.window
      ? U.monthLabel(cash.window[0]) + ' – ' + U.monthLabel(cash.window[1]) : null;

    h += headline(
      'The pool · ' + (win || U.monthLabel(L.year_month)),
      U.money(cash.annualised_cash_pool) + ' was withdrawn as cash over the last year',
      'Against ' + U.money(L.pos_value) + ' spent on cards in ' +
        U.monthLabel(L.year_month) + ', ' + U.money(L.atm_value) + ' was taken out of ' +
        'ATMs — <strong>' + L.ratio.toFixed(2) + '×</strong> as much. The ratio was ' +
        F.ratio.toFixed(2) + '× in ' + U.monthLabel(F.year_month) + ', so cards are ' +
        'gaining, steadily.',
      fig(U.money(cash.value_of_one_point), 'for each percentage point moved to cards', true) +
      fig((cash.cash_to_pos_t12m ? cash.cash_to_pos_t12m.toFixed(2) : L.ratio.toFixed(2)) +
          '×', 'cash withdrawn per euro on cards, full year') +
      fig(U.pct(L.card_share_of_the_two, 0), 'of the two channels now on card') +
      fig('€' + L.avg_withdrawal.toFixed(0) + ' / €' + L.avg_card_payment.toFixed(2),
          'average withdrawal against average card payment'),
      '<span>Twelve months summed, not one month annualised — withdrawals are ' +
      'seasonal.</span><span>·</span><span>Withdrawals bound the pool from above: ' +
      'not every euro taken out could have been spent at a till.</span>');

    // Why the headline number moved, and by how much. Stating the method the
    // figure replaced is cheaper than letting a reader wonder why it fell.
    if (cash.is_trailing_12m && cash.naive_overstatement > 0.01) {
      h += sec('Why this is smaller than it was', 'A method correction, not a fall in cash') +
        '<div class="card"><div class="card-b" style="padding-top:20px">' +
        '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.7;max-width:64ch">' +
        'This pool used to be reported as the latest month multiplied by twelve. ' +
        'Withdrawals are seasonal, so that projected whichever month happened to be ' +
        'last across the whole year — on ' + U.monthLabel(L.year_month) + ' it gave ' +
        '<strong>' + U.money(cash.naive_annualised) + '</strong>, overstating the ' +
        'twelve-month total by <strong>' + U.pct(cash.naive_overstatement, 1) +
        '</strong>. The figure above is ' + U.esc(win) + ' summed.</p>' +
        '</div></div></section>';
    }

    if (cash.sensitivity) {
      h += sec('What a shift would be worth', 'Sensitivity — not a forecast') +
        '<div class="card"><div class="tbl-wrap"><table><thead><tr>' +
        '<th>If this much of the pool moved onto cards</th>' +
        '<th class="n">Card value gained, a year</th></tr></thead><tbody>' +
        cash.sensitivity.map(function (s) {
          return '<tr><td class="strong">+' + s.shift_pp + ' percentage point' +
            (s.shift_pp > 1 ? 's' : '') + '</td>' +
            '<td class="n">' + U.money(s.value) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        disclosure('What this row is and is not',
          '<p>Arithmetic on the pool, nothing more: the trailing twelve-month ' +
          'withdrawal total multiplied by a share. It is not a forecast, no ' +
          'mechanism is implied, and nothing here says such a shift is achievable.</p>' +
          '<p>The pool itself is an upper bound. Rent, wages and person-to-person ' +
          'transfers move as cash and could never have been settled at a till, so ' +
          'the addressable part is smaller than the figure shown — by how much, no ' +
          'public source says.</p>') +
        '</section>';
    }

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

    const ab = DA.getAcceptanceBase();

    let h = '<header class="page-head"><h1>Coverage</h1>' +
      '<p class="q">Where acceptance sits below the economy around it, and which parts ' +
      'of that economy can plausibly take a card.</p></header>';

    // How much of the trading economy can present a card at all. This is the
    // one figure that sizes the constraint the conclusion names, so it opens
    // the page — with its own weakness written into the sentence.
    if (ab) {
      h += headline(
        'The acceptance base',
        'Fewer than ' + U.pct(ab.acceptance_ceiling, 0) + ' of trading businesses ' +
          'can take a card',
        'Kosovo had <strong>' + U.exact(ab.active_enterprises) + '</strong> active ' +
        'enterprises in ' + ab.active_year + '. BQK counts <strong>' +
        U.exact(ab.merchants) + '</strong> card-accepting merchants in ' +
        U.monthLabel(ab.merchants_period) + '. The business base has grown across ' +
        'those ' + ab.lag_years + ' years, so this share is the highest the real ' +
        'figure can be — and the <strong>' + U.exact(ab.not_accepting_floor) +
        '</strong> businesses outside acceptance are the fewest there can be.',
        fig('<' + U.pct(ab.acceptance_ceiling, 0), 'of active businesses accept', true) +
        fig('>' + U.exact(ab.not_accepting_floor), 'businesses cannot') +
        fig(U.exact(ab.active_enterprises), 'active enterprises, ' + ab.active_year) +
        (ab.formation ? fig(ab.formation.micro_share.toFixed(1) + '%',
                            'of new registrations are micro') : ''),
        '<span>ASK structural business statistics · BQK monthly</span>' +
        '<span>·</span><span>Three years apart — read as a bound, not a point</span>');

      const fn = DA.getAcceptanceFunnel();
      if (fn) {
        h += sec('From trading to accepting', 'An infrastructure view, not a target') +
          '<div class="card"><div class="tbl-wrap"><table><thead><tr>' +
          '<th>Step</th><th class="n">Count</th><th class="n">Of the top</th>' +
          '<th class="n">From previous</th><th>Source</th></tr></thead><tbody>' +
          fn.steps.map(function (s) {
            const blocked = s.status === 'BLOCKED';
            return '<tr' + (blocked ? ' style="color:var(--ink-3)"' : '') + '>' +
              '<td class="strong">' + U.esc(s.label) + '</td>' +
              '<td class="n">' + (s.value ? U.exact(s.value) : '—') + '</td>' +
              '<td class="n">' + (s.of_top ? U.pct(s.of_top, 1) : '—') + '</td>' +
              '<td class="n">' + (s.from_previous ? U.pct(s.from_previous, 1) : '—') +
              '</td><td style="font-size:12px">' + U.esc(s.source) +
              (blocked ? ' <span class="note">blocked</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div></div>' +
          disclosure('The rung that is missing, and why it is still listed',
            '<p>' + U.esc((fn.steps.filter(function (s) {
              return s.status === 'BLOCKED'; })[0] || {}).note || '') + '</p>' +
            '<p>It is shown as a blocked step rather than left out, because a funnel ' +
            'that skips a stage reads as though the stage were not there.</p>' +
            '<p>There are more terminals than merchants — ' +
            (fn.terminals_per_merchant ? fn.terminals_per_merchant.toFixed(2) : '—') +
            ' per accepting merchant — because one merchant may run several.</p>' +
            '<p>' + U.esc(fn.note) + '</p>') +
          '</section>';
      }

      h += sec('The base itself', 'Active enterprises, ASK structural statistics') +
        '<div class="card"><div class="card-b" id="cov-base"></div></div>' +
        (ab.formation ? '<div class="card" style="margin-top:12px">' +
          '<div class="card-b" style="padding-top:20px">' +
          '<h3 style="font-size:15px;font-weight:600;margin-bottom:8px">' +
          'Almost every new business is a very small one</h3>' +
          '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.65;max-width:62ch">' +
          U.esc(ab.formation.micro_share.toFixed(1)) + '% of the enterprises ' +
          'registered in ' + U.monthLabel(ab.formation.period) + ' employ between one ' +
          'and nine people. Growth in acceptance has to be won one very small ' +
          'business at a time, which is a different exercise from signing a chain.</p>' +
          '<p style="font-size:12px;color:var(--ink-3);line-height:1.6;max-width:62ch;' +
          'margin-top:12px">This is the split of businesses <em>registered</em> that ' +
          'month, not of those already trading. The micro share moves between 98.6% ' +
          'and 99.8% month to month, which a base of fifty thousand could not do.</p>' +
          '</div></div>' : '') +
        disclosure('Why this is a bound rather than a measurement',
          '<p>' + U.esc(ab.note) + '</p>' +
          '<p>Active enterprises come from ASK structural business statistics, which ' +
          'count businesses actually trading rather than businesses that have ' +
          'registered. That register originates with ARBK, whose own portal forbids ' +
          'automated collection and reuse of its pages; ASK republishes it as official ' +
          'statistics, which is why it can be used here at all.</p>' +
          '<p>A merchant in the BQK count is an acquiring relationship at a bank, so a ' +
          'business accepting through two banks may appear once in BQK’s unduplicated ' +
          'count but twice in bank-level reporting. That is why the figure above uses ' +
          'BQK rather than the KBA merchant total.</p>') +
        '</section>';
    }

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
      (ent ? (function () {
        const n = (ent.by_municipality[muni] || {}).count_4q ||
          Object.keys(ent.by_municipality).reduce(function (a, k) {
            return a + ent.by_municipality[k].count_4q; }, 0);
        return U.kpiTile({ label: 'New registrations, 4 quarters',
          value: n, display: U.compact(n), exact: U.exact(n),
          foot: 'ASK register · ' + ent.window[0] + ' to ' + ent.window[3] });
      })() : '') +
      U.kpiTile({ label: 'Sectors', value: rows.length, display: String(rows.length),
        foot: 'NACE sections' }) +
      '</div>';

    if (hr && hr.rows.length) {
      h += sec('Density by city', 'Terminals against the local economy') +
        '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>City</th>' +
        '<th class="n">Terminals (est.)</th><th class="n">New registrations, 4q</th>' +
        '<th class="n">Taxpayers</th><th class="n">Addressable</th>' +
        '<th class="n">Per €1m</th><th class="n">To median</th></tr></thead><tbody>' +
        hr.rows.map(function (r) {
          return '<tr><td class="strong">' + U.esc(r.city) + '</td>' +
            '<td class="n">' + U.exact(r.pos_terminals) + '</td>' +
            '<td class="n">' + (r.registrations_4q
              ? U.exact(r.registrations_4q) : '—') + '</td>' +
            '<td class="n">' + (r.taxpayers ? U.exact(r.taxpayers) : '—') + '</td>' +
            '<td class="n">' + U.money(r.addressable_ceiling) + '</td>' +
            '<td class="n">' + (r.pos_per_eur1m_ceiling
              ? r.pos_per_eur1m_ceiling.toFixed(2) : '—') + '</td>' +
            '<td class="n">' + (r.terminals_to_median
              ? '<span class="delta down">+' + r.terminals_to_median + '</span>' : '—') +
            '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        disclosure('Why there is no terminals-per-business column',
          '<p>There is no published count of businesses <em>trading</em> in a given ' +
          'municipality. ASK’s municipality table counts enterprises <em>registered ' +
          'in a quarter</em> — a flow, not a population — and its active-enterprise ' +
          'series exists only nationally, by activity section.</p>' +
          '<p>Dividing terminals by that flow once produced 9,584 terminals per ' +
          '1,000 enterprises, roughly ten terminals for every business in town. The ' +
          'ratio is left out rather than approximated. Registrations are shown as ' +
          'what they are: a year of business formation.</p>' +
          '<p>ATK counts registered <em>taxpayers</em> — entities filing a return, ' +
          'including many that accept no cards. Neither column is a count of ' +
          'card-accepting merchants; BQK publishes that only as a national total.</p>' +
          '<p>Terminal counts remain BQK city estimates read from an annual chart, ' +
          'against ATK municipality turnover. The grain does not match and the ' +
          'comparison is indicative.</p>') +
        '</section>';
    }

    const fm = DA.getFormation();
    if (fm) {
      const top = fm.rows.slice(0, 12);
      h += sec('Where businesses form, and where they last',
               fm.window[0] + ' to ' + fm.window[3]) +
        '<div class="card"><div class="card-b" id="cov-formation"></div></div>' +
        '<div class="card" style="margin-top:12px"><div class="card-b" ' +
        'style="padding-top:20px">' +
        '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.7;max-width:64ch">' +
        U.exact(fm.total_registered) + ' enterprises registered across those four ' +
        'quarters and ' + U.exact(fm.total_closed) + ' closed — <strong>' +
        Math.round(fm.churn * 100) + ' closures for every 100 registrations</strong>. ' +
        'Net formation was ' + U.exact(fm.total_net) + ', and ' +
        U.esc(top[0].municipality) + ' alone accounts for ' +
        U.pct(top[0].net / fm.total_net, 0) + ' of it.</p>' +
        '<p style="font-size:12px;color:var(--ink-3);line-height:1.6;max-width:64ch;' +
        'margin-top:12px">Both sides are flows counted over the same four quarters, ' +
        'so they subtract cleanly. A registration is not a trading business, and a ' +
        'closure is not always a failure.</p></div></div></section>';
    }

    const cc = DA.getTurnoverCrossCheck();
    if (cc) {
      h += sec('Two institutions, one economy',
               'ASK against ATK, turnover by section, ' + cc.year) +
        '<div class="card"><div class="tbl-wrap"><table><thead><tr>' +
        '<th>Section</th><th class="n">ASK</th><th class="n">ATK</th>' +
        '<th class="n">Gap</th></tr></thead><tbody>' +
        cc.rows.map(function (r) {
          return '<tr><td class="strong">' + U.esc(r.section.length > 44
              ? r.section.slice(0, 43) + '…' : r.section) + '</td>' +
            '<td class="n">' + r.ask_share.toFixed(2) + '%</td>' +
            '<td class="n">' + r.atk_share.toFixed(2) + '%</td>' +
            '<td class="n" style="color:var(--ink-3)">' +
              (r.gap_pp >= 0 ? '+' : '') + r.gap_pp.toFixed(2) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<div class="card" style="margin-top:12px"><div class="card-b" ' +
        'style="padding-top:20px">' +
        '<h3 style="font-size:15px;font-weight:600;margin-bottom:8px">' +
        'This agreement is too good to be a second opinion</h3>' +
        '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.65;max-width:64ch">' +
        U.esc(cc.reading) + '</p></div></div>' +
        disclosure('How the two were made comparable',
          '<p>' + U.esc(cc.note) + '</p>' +
          '<p>The card-intensity figure at the heart of this report divides BQK card ' +
          'value by ATK turnover. If ATK’s shape were wrong, so would that be — ' +
          'which is why it is worth testing, and worth saying plainly when the test ' +
          'turns out not to be independent.</p>') +
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

    if (ab && $('#cov-base', host)) {
      $('#cov-base', host).appendChild(C.line(
        ab.series.map(function (s) {
          return { year_month: s.year + '-01', active: s.active }; }), {
          w: 660, h: 300, labelEvery: 2, baseZero: true,
          series: [{ key: 'active', color: C.colors.purple, fill: true }],
          xFmt: function (r) { return r.year_month.slice(0, 4); },
          yFmt: function (v) { return C.short(v); },
          hover: function (r) {
            return { name: r.year_month.slice(0, 4),
              value: U.exact(r.active) + ' active',
              delta: 'ASK structural business statistics' }; } }));
      $('#cov-base', host).insertAdjacentHTML('beforeend',
        '<div class="sum-legend"><span>Active enterprises. The series ends ' +
        ab.active_year + '; card-accepting merchants are counted to ' +
        U.esc(U.monthLabel(ab.merchants_period)) + '.</span></div>');
    }

    // Registrations and closures were first drawn as a dumbbell, but that chart
    // labels each row with the percentage change between its two points, and
    // "+1,432%" for a place with many registrations and few closures means
    // nothing. Net formation as a bar says the same thing and says it plainly;
    // the two components stay in the tooltip.
    if (fm && $('#cov-formation', host)) {
      const med = fm.rows.map(function (r) { return r.churn; })
        .filter(function (v) { return v != null; }).sort(function (a, b) {
          return a - b; });
      const mid = med.length ? med[Math.floor(med.length / 2)] : null;
      $('#cov-formation', host).appendChild(C.hbars(
        fm.rows.slice(0, 12).map(function (r) {
          return { label: r.municipality, value: r.net,
            color: (mid != null && r.churn > mid) ? C.colors.neg : C.colors.purpleSoft,
            tip: function () {
              return { name: r.municipality,
                value: U.exact(r.net) + ' net',
                delta: U.exact(r.registered) + ' registered · ' +
                       U.exact(r.closed) + ' closed · ' +
                       Math.round(r.churn * 100) + ' per 100' }; } };
        }), { w: 660, rowH: 28, fmt: function (v) { return C.short(v); },
              pad: { t: 6, r: 74, b: 6, l: 140 } }));
      $('#cov-formation', host).insertAdjacentHTML('beforeend',
        '<div class="sum-legend"><span>Net formation over four quarters, top 12' +
        '</span><span><i style="background:' + C.colors.neg +
        '"></i>Closure rate above the median</span></div>');
    }

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

  // =====================================================================
  // PENETRATION — the spine. The only series that needs all three institutions.
  // =====================================================================
  function renderPenetration(host) {
    const p = DA.getPenetration();
    const sm = DA.getSectorMomentum();
    const cap = DA.getRetailCapture();
    if (!p) { host.innerHTML = U.emptyState('Not available', 'No overlapping years.'); return; }
    const F = p.first, L = p.latest;

    let h = '<header class="page-head"><h1>Card intensity of declared turnover</h1>' +
      '<p class="q">How much of the Kosovo economy actually settles on a card — and how ' +
      'fast that is changing.</p></header>';

    h += headline(
      'ATK × BQK × ASK · ' + F.year + ' → ' + L.year,
      'Card intensity has doubled, and 94% of declared turnover still settles elsewhere',
      'The declared economy grew <strong>' + p.economy_multiple.toFixed(2) + '×</strong> ' +
      'over ' + p.years + ' years. Card value grew <strong>' + p.card_multiple.toFixed(2) +
      '×</strong> — ' + p.card_faster_by.toFixed(1) + ' times faster. So the share of ' +
      'turnover moving across card rails rose from <strong>' + U.pct(p.penetration_first, 2) +
      '</strong> to <strong>' + U.pct(p.penetration_latest, 2) + '</strong>. It is still ' +
      'the smaller part of the story by a wide margin.',
      fig(U.pct(p.penetration_latest, 2), 'of declared turnover on card, ' + L.year, true) +
      fig(U.pct(p.still_elsewhere, 1), 'still settles some other way') +
      fig('+' + (p.card_cagr * 100).toFixed(1) + '%', 'card value, compound annual') +
      fig('+' + (p.economy_cagr * 100).toFixed(1) + '%', 'economy, compound annual'),
      '<span>ATK declared turnover · BQK Table 15 card value · ASK retail index</span>' +
      '<span>·</span><button data-src="pen">How this is built</button>');

    // The same card value against a denominator that is much closer to what
    // can actually cross a till. Shown beside the turnover ratio rather than
    // instead of it, because the distance between the two is the point.
    const den = DA.getIntensityDenominators();
    if (den) {
      const dl = den.latest;
      h += sec('Against what people actually spend',
               'Household final consumption, ASK national accounts') +
        '<div class="card"><div class="card-b" id="pen-denoms"></div></div>' +
        '<div class="card" style="margin-top:12px"><div class="tbl-wrap"><table><thead><tr>' +
        '<th>Year</th><th class="n">Card value</th>' +
        '<th class="n">Of declared turnover</th>' +
        '<th class="n">Of household consumption</th></tr></thead><tbody>' +
        den.series.map(function (r) {
          return '<tr><td class="strong">' + r.year + '</td>' +
            '<td class="n">' + U.money(r.card_value) + '</td>' +
            '<td class="n">' + U.pct(r.vs_turnover, 2) + '</td>' +
            '<td class="n" style="font-weight:600">' + U.pct(r.vs_household, 2) +
            '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<div class="card" style="margin-top:12px"><div class="card-b" ' +
        'style="padding-top:20px">' +
        '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.7;max-width:64ch">' +
        'Measured against household spending rather than all declared turnover, ' +
        '<strong>' + U.pct(dl.vs_household, 1) + '</strong> of consumption settled on ' +
        'a card in ' + dl.year + ' — ' +
        (den.ratio_between ? '<strong>' + den.ratio_between.toFixed(1) + '×</strong> ' +
          'the turnover ratio for the same year' : 'a much higher share') + '. Neither ' +
        'figure is the addressable market: the first denominator is far too large, ' +
        'the second leaves out business spending that does settle on cards. The gap ' +
        'between them is why no single number is quoted as the opportunity.</p>' +
        '<p style="font-size:12px;color:var(--ink-3);line-height:1.6;max-width:64ch;' +
        'margin-top:12px">National accounts end ' + den.household_year +
        (den.lags_turnover_by > 0
          ? ', ' + den.lags_turnover_by + ' year' + (den.lags_turnover_by > 1 ? 's' : '') +
            ' before the tax data, so the series stops earlier than the one above.'
          : '.') + '</p></div></div></section>';
    }

    h += sec('The two curves', 'Indexed to ' + F.year + ' = 100') +
      '<div class="grid2" id="pen-charts"></div>' +
      disclosure('What this ratio is, and what it is not',
        '<p><strong>Why it is not called penetration.</strong> Penetration implies a ' +
        'share of a market a card could actually reach. This denominator is not that: ' +
        'it is all declared turnover, most of which no card was ever going to settle. ' +
        'Calling the result penetration would invite it to be read as “94% of the ' +
        'opportunity is untouched”, which is not what it says. Intensity states the ' +
        'ratio without implying the missing share is winnable.</p>' +
        '<p>The numerator is card value at Kosovo POS terminals from BQK Table 15. The ' +
        'denominator is all declared business turnover from ATK — which includes ' +
        'wholesale, B2B and government contracting, none of which a card could settle.</p>' +
        '<p>So the level is a <strong>floor</strong> on intensity against addressable ' +
        'spending, not a retail share. A card cannot capture 100% of it and never will. ' +
        'What the series shows reliably is direction and speed, and both are ' +
        'unambiguous: the ratio has roughly doubled in six years.</p>' +
        '<p>Neither institution publishes this ratio. It exists only when the two are ' +
        'put together, which is why it appears nowhere else.</p>') +
      '</section>';

    if (cap) {
      h += sec('Against the shops themselves',
        'Retail trade is the part of the economy a card competes for directly.') +
        '<div class="kpis" style="margin-bottom:12px">' +
        U.kpiTile({ label: 'Card payment value', value: cap.card_value_yoy,
          display: U.signedPct(cap.card_value_yoy), foot: 'year on year · BQK' }) +
        U.kpiTile({ label: 'Retail trade turnover', value: cap.retail_mean_yoy,
          display: U.signedPct(cap.retail_mean_yoy),
          foot: 'mean of ' + cap.of + ' activities · ASK' }) +
        U.kpiTile({ label: 'Cards ahead by', value: cap.gap_pp, display: U.pp(cap.gap_pp),
          foot: 'percentage points' }) +
        U.kpiTile({ label: 'Activities outgrown', value: cap.outgrown,
          display: cap.outgrown + ' of ' + cap.of, foot: 'this is displacement' }) +
        '</div></section>';
    }

    if (sm) {
      h += sec('Where the economy grew',
        sm.from_year + ' → ' + sm.to_year + ' · and whether a card could settle it') +
        '<div class="kpis" style="margin-bottom:12px">' +
        U.kpiTile({ label: 'Turnover added', value: sm.total_added,
          display: U.money(sm.total_added), exact: U.exactMoney(sm.total_added),
          foot: sm.from_year + ' → ' + sm.to_year }) +
        U.kpiTile({ label: 'In card-addressable sectors', value: sm.addressable_added,
          display: U.money(sm.addressable_added),
          foot: U.pct(sm.addressable_share_of_growth, 0) + ' of all growth' }) +
        '</div><div class="card"><div class="card-b" id="pen-sectors"></div></div>' +
        '<div class="card" style="margin-top:12px"><div class="tbl-wrap"><table><thead><tr>' +
        '<th>Sector</th><th>Card-addressable</th><th class="n">' + sm.from_year + '</th>' +
        '<th class="n">' + sm.to_year + '</th><th class="n">Growth</th>' +
        '<th class="n">Share of growth</th></tr></thead><tbody>' +
        sm.rows.slice(0, 12).map(function (r) {
          return '<tr><td class="strong">' + U.esc(r.sector) + '</td>' +
            '<td><span class="badge ' + r.addressability + '">' +
            U.esc(r.addressability.replace(/_/g, ' ')) + '</span></td>' +
            '<td class="n">' + U.money(r.first) + '</td>' +
            '<td class="n">' + U.money(r.latest) + '</td>' +
            '<td class="n">' + U.deltaSpan(r.growth) + '</td>' +
            '<td class="n">' + U.pct(r.share_of_growth, 1) + '</td></tr>';
        }).join('') + '</tbody></table></div></div></section>';
    }

    host.innerHTML = h;

    if (den && $('#pen-denoms', host)) {
      $('#pen-denoms', host).appendChild(C.line(
        den.series.map(function (r) {
          return { year_month: String(r.year) + '-01',
                   hh: r.vs_household, to: r.vs_turnover }; }), {
          w: 660, h: 300, labelEvery: 1, baseZero: true,
          series: [{ key: 'hh', color: C.colors.purple, fill: true },
                   { key: 'to', color: C.colors.ink3 }],
          xFmt: function (r) { return r.year_month.slice(0, 4); },
          yFmt: function (v) { return (v * 100).toFixed(0) + '%'; },
          hover: function (r, i) {
            const s = den.series[i];
            return { name: String(s.year),
              value: U.pct(s.vs_household, 2) + ' of household spending',
              delta: U.pct(s.vs_turnover, 2) + ' of declared turnover' }; } }));
      $('#pen-denoms', host).insertAdjacentHTML('beforeend',
        '<div class="sum-legend"><span><i style="background:' + C.colors.purple +
        '"></i>Of household consumption</span><span><i style="background:' +
        C.colors.ink3 + '"></i>Of all declared turnover</span></div>');
    }

    const pc = $('#pen-charts', host);
    put(pc, card('Economy against card value', F.year + ' = 100'))
      .appendChild(C.line(p.series.map(function (s) {
        return { year_month: String(s.year) + '-01', econ: s.turnover_index,
                 card: s.card_index }; }), {
        series: [{ key: 'econ', color: C.colors.gold, fill: false },
                 { key: 'card', color: C.colors.purple, fill: true }],
        labelEvery: 1, yFmt: function (v) { return v.toFixed(0); },
        hover: function (r, i) {
          const s = p.series[i];
          return { name: String(s.year), value: 'Cards ' + s.card_index.toFixed(0),
            delta: 'Economy ' + s.turnover_index.toFixed(0),
            rows: [['Card value', U.exactMoney(s.card_value)],
                   ['Turnover', U.exactMoney(s.turnover)],
                   ['On card', U.pct(s.penetration, 2)]] }; } }));
    pc.lastChild.insertAdjacentHTML('afterbegin',
      '<div class="legend" style="padding-top:10px">' +
      '<span><i style="background:' + C.colors.purple + '"></i>Card value</span>' +
      '<span><i style="background:' + C.colors.gold + '"></i>Declared turnover</span></div>');

    put(pc, card('Share of turnover on card', 'BQK card value ÷ ATK turnover'))
      .appendChild(C.line(p.series.map(function (s) {
        return { year_month: String(s.year) + '-01', pen: s.penetration }; }), {
        series: [{ key: 'pen', color: C.colors.pos, fill: true }], labelEvery: 1,
        yFmt: function (v) { return (v * 100).toFixed(1) + '%'; },
        hover: function (r, i) {
          const s = p.series[i];
          return { name: String(s.year) + ' penetration', value: U.pct(s.penetration, 2),
            rows: [['Card value', U.exactMoney(s.card_value)],
                   ['Declared turnover', U.exactMoney(s.turnover)],
                   ['Sources', 'BQK Table 15 ÷ ATK Qarkullimi']] }; } }));

    if (sm) {
      $('#pen-sectors', host).appendChild(C.hbars(
        sm.rows.slice(0, 10).map(function (r) {
          return { label: r.sector.length > 30 ? r.sector.slice(0, 29) + '…' : r.sector,
            value: r.added,
            color: r.addressability === 'HIGH' ? C.colors.pos
                 : r.addressability === 'REVIEW_REQUIRED' ? C.colors.neg
                 : r.addressability === 'MEDIUM' ? C.colors.gold : C.colors.purpleSoft,
            tip: function () {
              return { name: r.sector, value: U.exactMoney(r.added) + ' added',
                delta: U.signedPct(r.growth) + ' since ' + sm.from_year,
                rows: [['Card-addressable', r.addressability.replace(/_/g, ' ')],
                       ['Share of all growth', U.pct(r.share_of_growth, 1)],
                       ['Source', 'ATK Qarkullimi']] }; } };
        }), { fmt: function (v) { return '€' + C.short(v); },
              pad: { t: 6, r: 92, b: 6, l: 200 } }));
    }

    const b = $('[data-src="pen"]', host);
    if (b) b.addEventListener('click', function () {
      U.openDrawer('<span class="label label-gold">Source &amp; methodology</span>' +
        '<h3>Card penetration of declared turnover</h3>' +
        '<dl class="kv">' +
        '<dt>Formula</dt><dd><code>BQK Table 15 card value ÷ ATK declared turnover</code></dd>' +
        '<dt>Numerator</dt><dd>Card value at Kosovo POS, domestic plus foreign cards</dd>' +
        '<dt>Denominator</dt><dd>All declared business turnover, ATK Qarkullimi</dd>' +
        '<dt>Coverage</dt><dd>' + F.year + '–' + L.year + ', annual</dd>' +
        '<dt>Institutions</dt><dd>BQK, ATK, with ASK retail as the comparison base</dd>' +
        '<dt>Limitations</dt><dd>' + U.esc(p.note) + '</dd></dl>');
    });
  }

  // =====================================================================
  // CONCLUSION — what the evidence adds up to
  // =====================================================================
  function renderConclusion(host) {
    const p = DA.getPenetration();
    const cash = DA.getCashPool();
    const cmix = DA.getCardMix();
    const bm = DA.getBenchmarks();
    const cap = DA.getRetailCapture();
    const hr = DA.getHeadroom();

    let h = '<header class="page-head"><h1>What this means</h1>' +
      '<p class="q">The evidence, in order, and what it adds up to.</p></header>';

    if (p) {
      h += headline('What the evidence supports',
        'Card spending is growing faster than the places that can take it.',
        '<strong>The fact.</strong> Card value compounded at <strong>' +
        (p.card_cagr * 100).toFixed(1) + '%</strong> a year against an economy growing ' +
        '<strong>' + (p.economy_cagr * 100).toFixed(1) + '%</strong>, outgrowing retail ' +
        'trade itself. <strong>What follows:</strong> the two sides move at different ' +
        'speeds, so the measured constraint sits on the acceptance side rather than on ' +
        'the amount being spent. <strong>What this does not establish:</strong> nothing ' +
        'here measures demand — the report observes what was spent and where it could ' +
        'be spent, never what anyone wanted.',
        fig((p.card_cagr * 100).toFixed(1) + '%', 'card value CAGR', true) +
        fig((p.economy_cagr * 100).toFixed(1) + '%', 'economy CAGR') +
        (bm ? fig(U.pct(bm.levels[1].index, 0), 'of euro-area terminal density') : '') +
        (cmix ? fig(U.pp(cmix.latest.credit_share_count - cmix.first.credit_share_count),
                    'credit share of transactions') : ''),
        '<span>Every figure below links to the page that establishes it.</span>');
    }

    const steps = [];
    if (p) steps.push({
      n: '01', t: 'The economy nearly doubled',
      d: 'ATK declared turnover grew ' + p.economy_multiple.toFixed(2) + '× between ' +
         p.first.year + ' and ' + p.latest.year + ', reaching ' + U.money(p.latest.turnover) + '.',
      src: 'ATK', go: 'penetration' });
    if (p) steps.push({
      n: '02', t: 'Card payments grew far faster',
      d: 'Card value grew ' + p.card_multiple.toFixed(2) + '× over the same years — ' +
         p.card_faster_by.toFixed(1) + ' times the pace of the economy.',
      src: 'BQK', go: 'penetration' });
    if (p) steps.push({
      n: '03', t: 'So penetration doubled, and is still small',
      d: U.pct(p.penetration_first, 2) + ' of declared turnover settled on card in ' +
         p.first.year + '; ' + U.pct(p.penetration_latest, 2) + ' in ' + p.latest.year +
         '. ' + U.pct(p.still_elsewhere, 1) + ' still settles some other way.',
      src: 'BQK ÷ ATK', go: 'penetration' });
    if (cap) steps.push({
      n: '04', t: 'It is displacement, not drift',
      d: 'Card value grew ' + U.signedPct(cap.card_value_yoy) + ' against retail trade at ' +
         U.signedPct(cap.retail_mean_yoy) + ', outgrowing ' + cap.outgrown + ' of ' +
         cap.of + ' published retail activities. Cards are taking share, not riding growth.',
      src: 'BQK vs ASK', go: 'penetration' });
    if (cash) steps.push({
      n: '05', t: 'The pool that remains is large and measurable',
      d: U.money(cash.annualised_cash_pool) + ' a year is still withdrawn as cash, ' +
         cash.latest.ratio.toFixed(2) + '× card spend — down from ' +
         cash.first.ratio.toFixed(2) + '×. Each percentage point moved is ' +
         U.money(cash.value_of_one_point) + ' of card turnover a year.',
      src: 'BQK', go: 'pool' });
    if (bm) steps.push({
      n: '06', t: 'But acceptance is thin by European standards',
      d: 'Kosovo has ' + U.pct(bm.levels[1].index, 0) + ' of euro-area terminal density ' +
         'per inhabitant and ' + U.pct(bm.levels[0].index, 0) + ' of its card usage per ' +
         'person, on the ECB’s own reference half-year.',
      src: 'BQK vs ECB', go: 'position' });
    if (hr && hr.rows.filter(function (r) { return r.terminals_to_median; }).length) {
      const gap = hr.rows.reduce(function (a, r) { return a + (r.terminals_to_median || 0); }, 0);
      steps.push({
        n: '07', t: 'And uneven within the country',
        d: 'Three of the seven cities BQK publishes sit below peer density against their ' +
           'own local economy — about ' + gap + ' terminals of shortfall.',
        src: 'BQK ÷ ATK ÷ ASK', go: 'coverage' });
    }
    if (cmix) steps.push({
      n: '08', t: 'While the margin mix moves the wrong way',
      d: 'Credit-function payments fell from ' + U.pct(cmix.first.credit_share_count, 1) +
         ' to ' + U.pct(cmix.latest.credit_share_count, 1) + ' of transactions as volume ' +
         'grew. Composition changes what each transaction earns even when counts rise.',
      src: 'BQK', go: 'mix' });

    h += sec('The argument', 'Each step rests on a published figure');
    h += '<div class="paths" style="grid-template-columns:1fr">' +
      steps.map(function (s) {
        return '<button class="path" data-go="' + s.go + '" style="min-height:0">' +
          '<span class="n">' + s.n + ' · ' + U.esc(s.src) + '</span>' +
          '<h3>' + U.esc(s.t) + '</h3><p>' + U.esc(s.d) + '</p>' +
          '<span class="go">See the evidence →</span></button>';
      }).join('') + '</div></section>';

    h += sec('What follows from it', 'Where public data stops being able to help');
    h += '<div class="grid2">' +
      concl('Coverage, not persuasion',
        'Demand is compounding at ' + (p ? (p.card_cagr * 100).toFixed(0) : '~25') +
        '% a year without intervention. The measurable constraint is where a card can ' +
        'be presented — terminal density at a quarter of euro-area levels, and uneven ' +
        'between cities relative to their own economies.') +
      concl('Mix, not just volume',
        'Transaction counts are rising while the credit share falls. Two banks can grow ' +
        'the same volume and earn differently. Public data shows the shift; only ' +
        'internal pricing data can size what it costs.') +
      concl('The pool is the ceiling',
        cash ? U.money(cash.annualised_cash_pool) + ' a year still leaves ATMs. Not all ' +
               'of it could ever settle at a till — rent, wages and transfers pass ' +
               'through cash too — so it bounds the opportunity rather than describing it.'
             : 'Cash withdrawals bound the opportunity from above.') +
      concl('Where this stops',
        'No revenue or profit figure appears anywhere in this report. Merchant service ' +
        'charges, interchange, scheme and processing fees, terminal-level activity and ' +
        'merchant-level performance are published by nobody. Everything here sizes the ' +
        'opportunity; pricing it needs internal data.') +
      '</div></section>';

    host.innerHTML = h;
    $$('.path[data-go]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        if (global.__gotoPage) global.__gotoPage(b.dataset.go);
      });
    });
  }

  function concl(t, d) {
    return '<div class="card"><div class="card-b" style="padding-top:20px">' +
      '<h3 style="font-size:15px;font-weight:600;margin-bottom:8px">' + U.esc(t) + '</h3>' +
      '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.65;max-width:56ch">' +
      U.esc(d) + '</p></div></div>';
  }

  // =====================================================================
  // FAIR SHARE — where each bank sits, and why
  //
  // The whole page lives inside one extract. Every ratio has a KBA numerator
  // and a KBA denominator, because the extract is a fourth POS universe that
  // matches none of the BQK series and carries no period label. Nothing here
  // is placed on a time axis and nothing is divided against a BQK figure.
  // =====================================================================
  function renderFairShare(host) {
    const bp = DA.getBankPosition();
    if (!bp) {
      host.innerHTML = U.emptyState(
        'Not available',
        'No bank-level extract is loaded. Bank shares cannot be derived from any ' +
        'BQK, ATK or ASK publication.');
      return;
    }
    const m = bp.market, me = bp.banks.filter(function (b) {
      return b.code === bp.focus; })[0];
    const fmtX = function (v) { return v.toFixed(2) + '×'; };
    // Two banks hold about two hundredths of a percent of the value. Rounded to
    // one decimal that prints as 0.0%, which reads as none at all — and a share
    // that is very small is not a share that is absent.
    const share = function (v) {
      return v > 0 && v < 0.001 ? U.pct(v, 2) : U.pct(v, 1);
    };

    let h = '<header class="page-head"><h1>Fair share</h1>' +
      '<p class="q">Who holds the terminals, who carries the value, and why the two ' +
      'are not the same banks.</p></header>';

    if (me) {
      const behind = me.fair_share_index < 1;
      h += headline(
        'KBA bank reporting · period not stated',
        bp.focus + ' holds ' + U.pct(me.share_pos, 1) + ' of terminals and ' +
          U.pct(me.share_value, 1) + ' of the value',
        'The Fair Share Index is share of value over share of terminals. At <strong>' +
        me.fair_share_index.toFixed(2) + '×</strong>, each ' + bp.focus + ' terminal ' +
        (behind ? 'carries less' : 'carries more') + ' than the market average. That ' +
        'figure factors exactly into how often a terminal is used and how large each ' +
        'payment is, and only one of the two is short.',
        fig(me.fair_share_index.toFixed(2) + '×', 'fair share index', true) +
        fig(U.pct(me.index_frequency, 0), 'payments per terminal vs market') +
        fig(U.pct(me.index_ticket, 0), 'average payment vs market') +
        fig('#' + me_rank(bp, 'share_value') + ' of ' + bp.banks.length, 'by value'),
        '<span>Kosovo Banking Association, supplied extract</span><span>·</span>' +
        '<span>No period label — see the note below</span>');

      h += sec('Why the gap is where it is',
               'The index is the product of these two, exactly') +
        '<div class="grid2">' +
        concl('Terminals are used ' + U.pct(me.index_frequency, 0) + ' as often',
              bp.focus + ' runs ' + U.exact(Math.round(me.tx_per_terminal)) +
              ' payments per terminal against ' + U.exact(Math.round(m.tx_per_terminal)) +
              ' across the reporting banks. This is the whole of the gap.') +
        concl('Each payment is ' + U.pct(me.index_ticket, 0) + ' of the market',
              'The average ' + bp.focus + ' payment is €' + me.avg_ticket.toFixed(2) +
              ' against €' + m.avg_ticket.toFixed(2) + ' for the market. Ticket size is ' +
              'not the problem; how often the fleet is used is.') +
        '</div></section>';

      if (bp.gap) {
        const g = bp.gap;
        h += sec('What closing it would be worth',
                 'Arithmetic on the extract, not a forecast') +
          '<div class="card"><div class="card-b" style="padding-top:20px">' +
          '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.7;max-width:62ch">' +
          'If ' + bp.focus + ' terminals were used as often as the market average, and ' +
          'every payment stayed exactly the size it is today, the fleet would carry ' +
          '<strong>' + U.exact(Math.round(g.transaction_shortfall)) + '</strong> more ' +
          'payments — <strong>' + U.money(g.value_shortfall) + '</strong> of additional ' +
          'value over the same span. Standing at fair share of value would be worth ' +
          U.money(g.fair_share_shortfall) + '.</p>' +
          '<p style="font-size:12px;color:var(--ink-3);line-height:1.6;max-width:62ch;' +
          'margin-top:12px">What that is worth as revenue cannot be computed here. ' +
          'Merchant charges and interchange are published by no one.</p>' +
          '</div></div></section>';
      }
    }

    const con = DA.getConcentration();
    if (con) {
      h += sec('Market structure', 'Herfindahl-Hirschman index, 0 to 10,000') +
        '<div class="card"><div class="tbl-wrap"><table><thead><tr>' +
        '<th>Measured on</th><th class="n">HHI</th><th>Reading</th>' +
        '<th class="n">Top 3</th><th class="n">Top 5</th></tr></thead><tbody>' +
        ['terminals', 'transactions', 'value'].map(function (k) {
          const c = con[k];
          if (!c) return '';
          return '<tr><td class="strong">' + U.esc(k.charAt(0).toUpperCase() +
              k.slice(1)) + '</td>' +
            '<td class="n" style="font-weight:600">' + U.exact(Math.round(c.hhi)) +
            '</td><td style="font-size:12.5px;color:var(--ink-2)">' +
              U.esc(c.band) + '</td>' +
            '<td class="n">' + U.pct(c.top3, 1) + '</td>' +
            '<td class="n">' + U.pct(c.top5, 1) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        disclosure('What this index does and does not say',
          '<p>' + U.esc(con.note) + '</p>' +
          '<p>It characterises structure and nothing else. Nothing here assesses ' +
          'competition or conduct, and no conclusion about either follows from a ' +
          'concentration figure on its own.</p>') +
        '</section>';
    }

    h += sec('Every reporting bank', 'Share of terminals against share of value') +
      '<div class="card"><div class="card-b" id="fs-dumbbell"></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="card-b" id="fs-index"></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Bank</th><th class="n">Terminals</th><th class="n">Share of terminals</th>' +
      '<th class="n">Share of value</th><th class="n">Fair share</th>' +
      '<th class="n">Payments per terminal</th><th class="n">Average payment</th>' +
      '</tr></thead><tbody>' +
      bp.banks.map(function (b) {
        const mine = b.code === bp.focus;
        return '<tr' + (mine ? ' style="background:var(--surface-sunk)"' : '') + '>' +
          '<td class="strong">' + U.esc(b.code) + '</td>' +
          '<td class="n">' + U.exact(b.pos_terminals) + '</td>' +
          '<td class="n">' + share(b.share_pos) + '</td>' +
          '<td class="n">' + share(b.share_value) + '</td>' +
          '<td class="n" style="font-weight:600;color:' +
            (b.fair_share_index < 1 ? 'var(--neg)' : 'var(--pos)') + '">' +
            b.fair_share_index.toFixed(2) + '×</td>' +
          '<td class="n">' + U.exact(Math.round(b.tx_per_terminal)) + '</td>' +
          '<td class="n">€' + b.avg_ticket.toFixed(2) + '</td></tr>';
      }).join('') +
      '<tr><td class="strong">All reporting</td>' +
      '<td class="n">' + U.exact(m.pos_terminals) + '</td>' +
      '<td class="n">100.0%</td><td class="n">100.0%</td>' +
      '<td class="n" style="font-weight:600">1.00×</td>' +
      '<td class="n">' + U.exact(Math.round(m.tx_per_terminal)) + '</td>' +
      '<td class="n">€' + m.avg_ticket.toFixed(2) + '</td></tr>' +
      '</tbody></table></div></div>' +
      disclosure('What this extract is, and what it is not',
        '<p><strong>Supplied, not downloaded.</strong> Every other figure in this report ' +
        'comes from a file that was fetched and hashed. This one was supplied as bank ' +
        'totals, so there is no source file, no SHA-256 and no download date. It is the ' +
        'one input here that cannot be re-derived from a publication.</p>' +
        '<p><strong>It reconciles.</strong> The bank columns sum to the published ' +
        '“ALL Banks” column exactly on all four rows — transactions, value, terminals ' +
        'and merchants. The loader refuses the file otherwise.</p>' +
        '<p><strong>No period.</strong> ' + U.esc(bp.source.period_note) + '</p>' +
        '<p><strong>A fourth universe.</strong> ' + U.esc(bp.universe.note) + ' The ' +
        'payments-per-terminal figures on this page are therefore not comparable with ' +
        'the BQK per-terminal figures elsewhere in this report.</p>' +
        '<p><strong>Merchants are double counted.</strong> ' +
        U.esc(bp.notes.merchants) + '</p>' +
        '<p><strong>Two banks are silent.</strong> ' + U.esc(bp.notes.blank_banks) +
        '</p>') +
      '</section>';

    host.innerHTML = h;

    const dumb = bp.banks.map(function (b) {
      return { label: b.code, a: b.share_pos * 100, b: b.share_value * 100,
        tip: function () {
          return { name: b.code, value: U.pct(b.share_value, 1) + ' of value',
            delta: U.pct(b.share_pos, 1) + ' of terminals' }; } };
    });
    $('#fs-dumbbell', host).appendChild(C.dumbbell(dumb, {
      w: 660, fmt: function (v) { return v.toFixed(1) + '%'; },
      aLabel: 'Terminals', bLabel: 'Value' }));
    $('#fs-dumbbell', host).insertAdjacentHTML('beforeend',
      '<div class="sum-legend"><span><i style="background:var(--rule-strong)"></i>' +
      'Open dot: share of terminals</span><span><i style="background:' + C.colors.purple +
      '"></i>Filled dot: share of value</span></div>');

    $('#fs-index', host).appendChild(C.hbars(
      bp.banks.slice().sort(function (x, y) {
        return y.fair_share_index - x.fair_share_index; }).map(function (b) {
        return { label: b.code + (b.code === bp.focus ? ' ←' : ''),
          value: b.fair_share_index,
          color: b.fair_share_index < 1 ? C.colors.neg : C.colors.pos,
          tip: function () {
            return { name: b.code, value: b.fair_share_index.toFixed(2) + '× fair share',
              delta: U.pct(b.index_frequency, 0) + ' usage × ' +
                     U.pct(b.index_ticket, 0) + ' ticket' }; } };
      }), { w: 660, rowH: 30, fmt: fmtX, pad: { t: 6, r: 74, b: 6, l: 120 } }));
    $('#fs-index', host).insertAdjacentHTML('beforeend',
      '<div class="sum-legend"><span>Share of value ÷ share of terminals. ' +
      '1.00× is the market average.</span></div>');

    U.observeReveals(host);
  }

  // =====================================================================
  // PRODUCT DEMAND — which merchant markets are being stocked
  //
  // Customs value is a supply-side signal and the page says so in the first
  // sentence rather than in a footnote. Goods entered the country; nobody has
  // bought them yet, and no retail margin is implied.
  // =====================================================================
  function renderDemand(host) {
    const im = DA.getImportMomentum();
    const cov = DA.getDoganaCoverage();
    if (!im) {
      host.innerHTML = U.emptyState('Not available',
        'No customs data is loaded. Run etl/fetch_dogana.py to prepare it.');
      return;
    }
    const up = im.rows.filter(function (r) { return r.yoy > 0 && !r.bulk_dominated; });
    const down = im.rows.filter(function (r) { return r.yoy < 0; });
    const fastest = up.slice().sort(function (a, b) { return b.yoy - a.yoy; })[0];

    let h = '<header class="page-head"><h1>Product demand</h1>' +
      '<p class="q">Which merchant markets are being stocked, and which are ' +
      'thinning.</p></header>';

    h += headline(
      'Customs import value · ' + im.window + ' · ' + im.prior_year + ' against ' +
        im.current_year,
      'Retail imports grew ' + U.signedPct(im.retail_yoy) + ' like for like',
      'Goods worth <strong>' + U.money(im.retail_current) + '</strong> were imported ' +
      'into consumer-facing categories over the ' + im.months.length + ' months both ' +
      'years cover, against ' + U.money(im.retail_prior) + ' a year earlier. This is ' +
      'what merchants are stocking, not what shoppers have bought.',
      fig(U.signedPct(im.retail_yoy), 'retail imports, like for like', true) +
      (fastest ? fig(U.signedPct(fastest.yoy), 'fastest: ' +
                     fastest.name.toLowerCase()) : '') +
      fig(String(up.length) + ' up / ' + String(down.length) + ' down',
          'of ' + im.rows.length + ' verticals') +
      (cov ? fig(U.pct(cov.consumer_facing_share, 0),
                 'of all imports are consumer-facing') : ''),
      '<span>Dogana e Kosovës, Open Data — regime IM4</span><span>·</span>' +
      '<span>A supply-side signal, not consumer spending</span>');

    h += sec('Momentum by merchant vertical', im.prior_year + ' → ' + im.current_year +
             ', ' + im.window) +
      '<div class="card"><div class="card-b" id="dem-yoy"></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Vertical</th><th class="n">' + im.prior_year + '</th>' +
      '<th class="n">' + im.current_year + '</th><th class="n">Change</th>' +
      '<th>Largest origins</th></tr></thead><tbody>' +
      im.rows.map(function (r) {
        return '<tr><td class="strong">' + U.esc(r.name) +
          (r.bulk_dominated ? ' <span class="note" style="font-weight:400">bulk</span>'
                            : '') + '</td>' +
          '<td class="n">' + U.money(r.prior) + '</td>' +
          '<td class="n">' + U.money(r.current) + '</td>' +
          '<td class="n" style="font-weight:600;color:' +
            (r.yoy >= 0 ? 'var(--pos)' : 'var(--neg)') + '">' +
            U.signedPct(r.yoy) + '</td>' +
          '<td style="color:var(--ink-3);font-size:12px">' +
            U.esc((r.top_origins || []).map(function (o) {
              return String(o[0]).split(' - ').pop(); }).join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      disclosure('What this page can and cannot tell you',
        '<p><strong>An import is not a sale.</strong> These figures count goods ' +
        'crossing the border. Nobody has bought them, no retail margin is included, ' +
        'and nothing here says where they were sold or how they were paid for. The ' +
        'page is for direction and for comparing verticals against each other.</p>' +
        (im.bulk_excluded && im.bulk_excluded.length
          ? '<p><strong>' + U.esc(im.bulk_excluded.join(' and ')) + ' sits outside ' +
            'the headline.</strong> Its import line is tanker cargo priced on a world ' +
            'market rather than merchant stock, so it moves with the oil price as ' +
            'much as with demand. Including it would take the like-for-like figure ' +
            'from ' + U.signedPct(im.retail_yoy) + ' to ' + U.signedPct(im.total_yoy) +
            '. It stays in the table, marked.</p>' : '') +
        (cov ? '<p><strong>Coverage.</strong> ' + U.pct(cov.classified_share, 1) +
          ' of import value reached a vertical. Tariff chapters that mix uses — ' +
          'chapter 84 holds both excavators and laptops — are resolved only at ' +
          'four-digit headings, and anything no heading rule claims is counted ' +
          'nowhere rather than assigned to the likeliest guess.</p>' : '') +
        '<p><strong>Scope.</strong> The customs open-data file carries regime IM4 ' +
        'alone, release for free circulation. ASK trade statistics cover every ' +
        'regime and report a slightly larger total for the same year. That is a ' +
        'difference of scope, not a disagreement, and no figure here mixes them.</p>') +
      '</section>';

    host.innerHTML = h;

    $('#dem-yoy', host).appendChild(C.hbars(
      im.rows.slice().sort(function (a, b) { return b.yoy - a.yoy; })
        .map(function (r) {
          return { label: r.name.length > 24 ? r.name.slice(0, 23) + '…' : r.name,
            value: r.yoy * 100,
            color: r.bulk_dominated ? C.colors.ink3
                 : r.yoy >= 0 ? C.colors.pos : C.colors.neg,
            tip: function () {
              return { name: r.name, value: U.signedPct(r.yoy),
                delta: U.money(r.prior) + ' → ' + U.money(r.current) }; } };
        }), { w: 660, rowH: 28,
              fmt: function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; },
              pad: { t: 6, r: 80, b: 6, l: 170 } }));
    $('#dem-yoy', host).insertAdjacentHTML('beforeend',
      '<div class="sum-legend"><span>Like-for-like import value, ' + U.esc(im.window) +
      '</span><span><i style="background:' + C.colors.ink3 +
      '"></i>Bulk-dominated, outside the headline</span></div>');

    U.observeReveals(host);
  }

  // =====================================================================
  // MERCHANT OPPORTUNITY — evidence per vertical, and how much of it exists
  //
  // The score is the smaller half of this page. The larger half is coverage:
  // how many of the six declared signals a vertical could be judged on at all.
  // A vertical below the minimum is not scored, because a number printed
  // beside "data insufficient" gets read while the label gets ignored.
  // =====================================================================
  function renderOpportunity(host) {
    const op = DA.getOpportunity();
    if (!op) {
      host.innerHTML = U.emptyState('Not available',
        'The opportunity model needs the customs layer. Run etl/fetch_dogana.py.');
      return;
    }
    const scored = op.rows.filter(function (r) { return r.score !== null; });
    const cls = {};
    op.rows.forEach(function (r) {
      cls[r.classification] = (cls[r.classification] || 0) + 1; });
    const colorFor = function (c) {
      return c === 'HIGH EVIDENCE OPPORTUNITY' ? C.colors.pos
           : c === 'INVESTIGATE' ? C.colors.purple
           : c === 'DEVELOPING' ? C.colors.gold
           : C.colors.ink3;
    };

    let h = '<header class="page-head"><h1>Merchant opportunity</h1>' +
      '<p class="q">Which merchant verticals the evidence can speak to — and how ' +
      'much evidence there actually is.</p></header>';

    h += headline(
      'Evidence coverage · ' + (op.window || ''),
      'No vertical carries more than ' + op.max_coverage + ' of ' +
        Object.keys(op.weights).length + ' signals',
      '<strong>' + op.scored + ' of ' + op.of + '</strong> verticals have enough ' +
      'evidence to score at all. The rest report insufficient data, because no ' +
      'public source sizes a merchant vertical, counts its merchants, or places ' +
      'terminals within one. What exists is momentum: what is being imported, and ' +
      'what retail activity is doing.',
      fig(op.max_coverage + '/' + Object.keys(op.weights).length,
          'best coverage of any vertical', true) +
      fig(op.scored + ' / ' + op.of, 'verticals scored') +
      fig(String(cls['INVESTIGATE'] || 0), 'worth investigating') +
      fig(String(cls['DATA INSUFFICIENT'] || 0), 'cannot be judged'),
      '<span>Scores are relative within each signal — a growth rate and a euro ' +
      'total share no unit</span>');

    h += sec('The signals, and which exist', 'Weights are declared, not hidden') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Signal</th><th>Source</th><th class="n">Default weight</th>' +
      '<th>Availability by vertical</th></tr></thead><tbody>' +
      Object.keys(op.weights).map(function (k) {
        const have = op.rows.filter(function (r) {
          return (r.signals_present || []).indexOf(k) >= 0; }).length;
        return '<tr><td class="strong">' + U.esc(op.signal_labels[k] || k) + '</td>' +
          '<td>' + U.esc(op.signal_sources[k] || '') + '</td>' +
          '<td class="n">' + U.pct(op.weights[k], 0) + '</td>' +
          '<td style="font-size:12.5px;color:' +
            (have ? 'var(--ink-2)' : 'var(--ink-3)') + '">' +
            (have ? have + ' of ' + op.of + ' verticals'
                  : U.esc(op.unavailable[k] || 'Not available')) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<p class="note" style="margin-top:10px">Weights are renormalised over the ' +
      'signals a vertical actually has, and the applied weights are carried in the ' +
      'data rather than assumed from this table.</p></section>';

    h += sec('Verticals', 'Sorted by score; unscored verticals last') +
      '<div class="card"><div class="card-b" id="opp-bars"></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Vertical</th><th class="n">Score</th><th class="n">Coverage</th>' +
      '<th>Classification</th><th class="n">Imports</th><th class="n">Retail</th>' +
      '<th class="n">ATK turnover</th></tr></thead><tbody>' +
      op.rows.map(function (r) {
        return '<tr><td class="strong">' + U.esc(r.name) + '</td>' +
          '<td class="n" style="font-weight:600">' +
            (r.score === null ? '—' : r.score.toFixed(1)) + '</td>' +
          '<td class="n">' + r.coverage + '/' + r.of_signals + '</td>' +
          '<td style="font-size:12px;font-weight:600;color:' +
            colorFor(r.classification) + '">' + U.esc(r.classification) + '</td>' +
          '<td class="n">' + (r.import_yoy === null || r.import_yoy === undefined
            ? '—' : U.signedPct(r.import_yoy)) + '</td>' +
          '<td class="n">' + (r.consumer_yoy === null || r.consumer_yoy === undefined
            ? '—' : U.signedPct(r.consumer_yoy)) + '</td>' +
          '<td class="n">' + (r.atk_turnover ? U.money(r.atk_turnover) : '—') +
          '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      disclosure('Why the coverage is this thin, and what would change it',
        '<p><strong>ATK cannot size a vertical.</strong> It publishes NACE ' +
        'sections, and grocery, fashion, electronics, automotive and construction ' +
        'retail all sit inside one wholesale-and-retail section worth about half ' +
        'of declared turnover. That section is not apportioned between them by a ' +
        'guess, so market size is absent for every vertical inside it. Only ' +
        U.esc((op.atk_exclusive_verticals || []).join(' and ') || 'none') +
        ' own a section outright, and their turnover is shown as a fact rather ' +
        'than folded into a score — two observations cannot be ranked against ' +
        'fifteen.</p>' +
        '<p><strong>ASK gives momentum, not level.</strong> The retail index ' +
        'discriminates between activities but carries no euro value, so it can say ' +
        'which way a vertical is moving and never how large it is.</p>' +
        '<p><strong>Customs gives value, but not sales.</strong> Import value maps ' +
        'to verticals cleanly and is the broadest signal here, but goods entering ' +
        'the country are not goods sold.</p>' +
        '<p><strong>What would lift coverage:</strong> merchant counts by vertical, ' +
        'terminals by vertical, or an ATK split of wholesale from retail. None is ' +
        'published today; all three would come from internal acquiring data.</p>') +
      '</section>';

    host.innerHTML = h;

    $('#opp-bars', host).appendChild(C.hbars(
      scored.map(function (r) {
        return { label: r.name.length > 24 ? r.name.slice(0, 23) + '…' : r.name,
          value: r.score, color: colorFor(r.classification),
          tip: function () {
            return { name: r.name, value: r.score.toFixed(1) + ' · ' + r.classification,
              delta: 'on ' + r.coverage + ' of ' + r.of_signals + ' signals' }; } };
      }), { w: 660, rowH: 30, fmt: function (v) { return v.toFixed(1); },
            pad: { t: 6, r: 74, b: 6, l: 170 } }));
    $('#opp-bars', host).insertAdjacentHTML('beforeend',
      '<div class="sum-legend"><span>Only verticals with at least ' +
      op.min_signals + ' signals are scored — ' + (op.of - op.scored) +
      ' of ' + op.of + ' are not</span></div>');

    U.observeReveals(host);
  }

  function me_rank(bp, key) {
    return bp.banks.slice().sort(function (x, y) { return y[key] - x[key]; })
      .map(function (b) { return b.code; }).indexOf(bp.focus) + 1;
  }

  global.OpsPages = { renderPool: renderPool, renderMix: renderMix,
                      renderPosition: renderPosition, renderCoverage: renderCoverage,
                      renderPenetration: renderPenetration,
                      renderConclusion: renderConclusion,
                      renderFairShare: renderFairShare,
                      renderDemand: renderDemand,
                      renderOpportunity: renderOpportunity };
})(window);
