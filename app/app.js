/* Kosovo Merchant & Payments Intelligence — application.

   Seven modules, each answering one question. Nothing here derives a KPI: the
   numbers arrive already computed and this file arranges, formats and explains
   them. Narrative sentences are assembled from measured values at render time,
   so the story changes when the data does. */
(function () {
  'use strict';

  const DA = window.DataAccess, C = window.Charts, U = window.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  const PAGES = [
    ['overview',    '01', 'Overview',   'Market Overview',        'What is happening?'],
    ['payments',    '02', 'Payments',   'Payment Behaviour',      'How are payments changing?'],
    ['geography',   '03', 'Geography',  'Geographic Intelligence', 'Where is payment infrastructure concentrated?'],
    ['opportunity', '04', 'Economy',    'Economic Opportunity',   'How does POS infrastructure compare with economic activity?'],
    ['sectors',     '05', 'Sectors',    'Sector Intelligence',    'Which parts of the economy drive addressable turnover?'],
    ['assurance',   '06', 'Assurance',  'Data Assurance',         'Can I trust these numbers?'],
    ['methodology', '07', 'Method',     'Methodology',            'How exactly was this calculated?']
  ];

  /* Resolved in init(), not here: reading from DataAccess at module scope would
     throw during parsing if the payload were missing, before any handler could
     show a useful error. */
  const state = {
    page: 'overview',
    definition: null,
    period: null,
    comparePeriod: null,
    compareOn: false,
    year: null,
    municipality: 'All',
    exec: false
  };

  // =====================================================================
  // shared pieces
  // =====================================================================
  function card(title, note, opts) {
    const o = opts || {};
    const d = document.createElement('div');
    d.className = 'card' + (o.cls ? ' ' + o.cls : '');
    d.innerHTML = '<div class="card-h"><h4>' + U.esc(title) + '</h4>' +
      (o.src ? '<button class="src analyst-only" aria-label="Source and methodology">ⓘ</button>' : '') +
      (note ? '<span class="note">' + U.esc(note) + '</span>' : '') + '</div>' +
      (o.legend ? '<div class="legend">' + o.legend + '</div>' : '') +
      '<div class="card-b"></div>';
    if (o.src) $('.src', d).addEventListener('click', o.src);
    return d;
  }

  function put(host, node) { $('.card-b', node) && host.appendChild(node); return node; }

  function defTipRows(def, period) {
    return [['Period', U.monthLabel(period)],
            ['Definition', def.metric_name],
            ['Universe', def.universe],
            ['Source', def.institution]];
  }

  /** Attach the ⓘ drawer + exact-value tooltips after a page renders. */
  function wireKpis(host, ctx) {
    $$('.kpi', host).forEach(function (el) {
      const id = el.dataset.kpi;
      const btn = $('.src', el);
      if (btn && id) {
        btn.addEventListener('click', function () {
          U.sourceDrawer(DA.getProvenance(id, ctx.sourceId, {
            period: ctx.period, universe: ctx.universe }));
        });
      }
      const v = $('.v', el);
      if (v && v.dataset.exact) {
        U.bindTip(v, function () {
          return { name: $('.label', el).textContent, value: v.dataset.exact,
                   rows: ctx.rows || [] };
        });
      }
    });
  }

  // =====================================================================
  // 01 — MARKET OVERVIEW
  // =====================================================================
  function renderOverview() {
    const host = $('#page-overview');
    const def = DA.getDefinition(state.definition);
    const ov = DA.getExecutiveOverview(state.definition, state.period);
    const trend = DA.getPOSMarketTrend(state.definition);
    const sig = ov && ov.signal;
    if (!ov || !ov.current) { host.innerHTML = U.emptyState('No data', 'This universe has no observations.'); return; }
    const cur = ov.current;
    const hasStock = !U.isNil(cur.terminal_stock);
    const sourceId = state.definition === 'pos_rm_allcards' ? 'BQK_RAPORT_MUJOR' : 'BQK_T15';

    let h = U.pageHead('01 — Market Overview', 'What is happening?',
      'Infrastructure, usage, value and productivity across the Kosovo POS market, on a single stated definition.');

    // ---- hero signal, built from measured values
    if (sig && !U.isNil(sig.infrastructure_growth)) {
      const lead = sig.usage_minus_infra_pp > 0;
      h += '<section class="hero-signal reveal">' +
        '<span class="label eyebrow">Hero signal · ' +
        U.monthRange(String(parseInt(sig.through.slice(0,4),10)) + '-01', sig.through) +
        ' vs ' + U.monthRange(sig.compare_from, sig.compare_to) + '</span>' +
        '<h2>' + (lead ? 'Usage is outpacing infrastructure'
                       : 'Infrastructure is outpacing usage') + '</h2>' +
        '<div class="hero-cmp">' +
          heroFig(U.signedPct(sig.usage_growth), 'transaction growth') +
          heroFig(U.signedPct(sig.infrastructure_growth), 'terminal network growth') +
          heroFig(U.pp(sig.usage_minus_infra_pp), 'gap', true) +
          heroFig(U.signedPct(sig.productivity_growth), 'transactions per terminal', true) +
        '</div>' +
        '<div class="hero-foot"><span>' + U.esc(def.metric_name) + '</span>' +
        '<span>·</span><span>' + sig.months + ' like-for-like months</span>' +
        '<span>·</span><button data-src="signal">Source &amp; methodology</button></div>' +
        '</section>';
    }

    // ---- market pulse
    const pulse = DA.getMarketPulse(state.definition);
    if (pulse.length) {
      h += '<section class="pulse reveal"><div class="pulse-h">' +
        '<span class="label label-gold">Market pulse</span>' +
        '<span style="font-size:11.5px;color:var(--ink-3)">material validated movements</span>' +
        '</div><div class="pulse-list">' +
        pulse.map(function (p) {
          const arrow = p.dir === 'up' ? '↑' : p.dir === 'down' ? '↓' : '→';
          return '<div class="pulse-item ' + p.dir + '"><span class="arrow">' + arrow + '</span>' +
            '<span class="txt">' + U.esc(p.text) + '</span>' +
            '<span class="val">' + U.esc(p.value) + '</span></div>';
        }).join('') + '</div></section>';
    }

    // ---- KPI band
    const tiles = [
      U.kpiTile({ id: 'pos_terminals', label: 'POS terminals',
        value: cur.terminal_stock, display: U.compact(cur.terminal_stock),
        exact: U.exact(cur.terminal_stock), source: true,
        unavailable: 'Not published on this basis',
        foot: hasStock ? U.deltaSpan(cur.pos_yoy) + ' YoY'
                       : 'no terminal series for this universe' }),
      U.kpiTile({ id: 'pos_transaction_count', label: 'POS transactions',
        value: cur.tx_count, display: U.compact(cur.tx_count),
        exact: U.exact(cur.tx_count), source: true,
        foot: U.deltaSpan(cur.tx_yoy) + ' YoY' }),
      U.kpiTile({ id: 'pos_transaction_value', label: 'POS value',
        value: cur.tx_value, display: U.money(cur.tx_value),
        exact: U.exactMoney(cur.tx_value), source: true,
        foot: U.deltaSpan(cur.value_yoy) + ' YoY' }),
      U.kpiTile({ id: 'transactions_per_average_pos', label: 'Tx / average POS',
        value: cur.tx_per_avg_pos,
        display: cur.tx_per_avg_pos ? U.G.format(Math.round(cur.tx_per_avg_pos)) : null,
        exact: cur.tx_per_avg_pos ? U.G2.format(cur.tx_per_avg_pos) : null, source: true,
        badge: statusBadge('transactions_per_average_pos'),
        unavailable: 'Needs a matching terminal series',
        foot: '12-month average stock' }),
      U.kpiTile({ id: 'transactions_per_end_period_pos', label: 'Tx / end-period POS',
        value: cur.tx_per_end_pos,
        display: cur.tx_per_end_pos ? U.G.format(Math.round(cur.tx_per_end_pos)) : null,
        exact: cur.tx_per_end_pos ? U.G2.format(cur.tx_per_end_pos) : null, source: true,
        badge: statusBadge('transactions_per_end_period_pos'),
        unavailable: 'Needs a matching terminal series',
        foot: 'closing stock' }),
      U.kpiTile({ id: 'value_per_average_pos', label: 'Value / average POS',
        value: cur.value_per_avg_pos, display: U.money(cur.value_per_avg_pos),
        exact: U.exactMoney(cur.value_per_avg_pos), source: true,
        unavailable: 'Needs a matching terminal series', foot: 'per month' }),
      U.kpiTile({ id: 'average_ticket', label: 'Average ticket',
        value: cur.avg_ticket, display: cur.avg_ticket ? '€' + cur.avg_ticket.toFixed(2) : null,
        exact: U.exactMoney(cur.avg_ticket), source: true, foot: 'value ÷ count' }),
      U.kpiTile({ label: 'Reporting period', value: cur.year_month,
        display: U.monthLabel(cur.year_month), small: true,
        foot: U.esc(def.institution) })
    ];
    h += '<div class="kpi-band reveal">' + tiles.join('') + '</div>';

    // ---- compare mode
    if (state.compareOn && state.comparePeriod) {
      const cmp = DA.compare(state.definition, cur.year_month, state.comparePeriod);
      if (cmp) {
        h += '<section class="story reveal"><div class="story-head">' +
          '<span class="n">Compare</span><h3>' + U.monthLabel(cmp.a.year_month) +
          ' against ' + U.monthLabel(cmp.b.year_month) + '</h3></div>' +
          '<div class="card"><div class="card-b" id="cmp-chart"></div></div></section>';
      } else {
        h += '<section class="story reveal">' + U.emptyState('Not comparable',
          'One of the selected months has no observation on this definition.') + '</section>';
      }
    }

    // ---- scroll story
    h += storySection('01', 'Infrastructure', 'How many terminals the market operates.', 'st-infra');
    h += storySection('02', 'Usage', 'How much activity those terminals carry.', 'st-usage');
    h += storySection('03', 'Value', 'What the activity is worth.', 'st-value');
    h += storySection('04', 'Productivity', 'Activity per terminal, and the ticket behind it.', 'st-prod');

    host.innerHTML = h;

    const btn = $('[data-src="signal"]', host);
    if (btn) btn.addEventListener('click', function () {
      U.sourceDrawer(DA.getProvenance('transactions_per_average_pos', sourceId, {
        title: 'Market signal',
        period: sig ? sig.months + ' months to ' + U.monthLabel(sig.through) : null,
        comparison: 'Complete months of the latest year against the same calendar months ' +
                    'of the prior year. A part-year is never compared with a full year.',
        universe: def.universe }));
    });

    wireKpis(host, { sourceId: sourceId, period: cur.year_month, universe: def.universe,
                     rows: defTipRows(def, cur.year_month) });

    // charts
    const hoverFor = function (label, fmt, key) {
      return function (r) {
        return { name: label, value: fmt(r[key]) || 'Not available',
                 delta: r[key + '_yoy'] ? U.signedPct(r[key + '_yoy']) + ' YoY' : null,
                 rows: defTipRows(def, r.year_month) };
      };
    };

    if (hasStock) {
      put($('#st-infra', host), card('POS terminal stock', 'month end', {
        src: function () { U.sourceDrawer(DA.getProvenance('pos_terminals', sourceId,
          { universe: def.universe })); } }));
      $('#st-infra .card-b', host).appendChild(C.line(trend, {
        series: [{ key: 'terminal_stock', color: C.colors.purpleSoft, fill: true }],
        labelEvery: 4, hover: function (r) {
          return { name: 'POS terminals', value: U.exact(r.terminal_stock),
                   delta: r.pos_yoy ? U.signedPct(r.pos_yoy) + ' YoY' : null,
                   rows: defTipRows(def, r.year_month) };
        } }));
      put($('#st-infra', host), card('Merchants accepting cards', 'physical, month end', {}));
      $('#st-infra .card:last-child .card-b', host).appendChild(C.line(trend, {
        series: [{ key: 'merchants', color: C.colors.gold, fill: true }],
        labelEvery: 4, hover: function (r) {
          return { name: 'Merchants', value: U.exact(r.merchants),
                   rows: defTipRows(def, r.year_month) }; } }));
    } else {
      $('#st-infra', host).innerHTML += U.emptyState('Terminal series not available',
        def.limitations || 'This universe publishes no compatible terminal count.');
    }

    put($('#st-usage', host), card('POS transactions', 'per month', {
      src: function () { U.sourceDrawer(DA.getProvenance('pos_transaction_count', sourceId,
        { universe: def.universe })); } }));
    $('#st-usage .card-b', host).appendChild(C.line(trend, {
      series: [{ key: 'tx_count', color: C.colors.purple, fill: true }],
      labelEvery: trend.length > 40 ? 12 : 4, hover: hoverFor('POS transactions', U.exact, 'tx_count') }));

    put($('#st-value', host), card('POS transaction value', 'per month', {
      src: function () { U.sourceDrawer(DA.getProvenance('pos_transaction_value', sourceId,
        { universe: def.universe })); } }));
    $('#st-value .card-b', host).appendChild(C.line(trend, {
      series: [{ key: 'tx_value', color: C.colors.purple, fill: true }],
      labelEvery: trend.length > 40 ? 12 : 4,
      yFmt: function (v) { return '€' + C.short(v); },
      hover: function (r) {
        return { name: 'POS value', value: U.exactMoney(r.tx_value),
                 delta: r.value_yoy ? U.signedPct(r.value_yoy) + ' YoY' : null,
                 rows: defTipRows(def, r.year_month) }; } }));

    if (hasStock) {
      put($('#st-prod', host), card('Transactions per average POS', '12-month average stock', {
        src: function () { U.sourceDrawer(DA.getProvenance('transactions_per_average_pos',
          sourceId, { universe: def.universe })); } }));
      $('#st-prod .card-b', host).appendChild(C.line(trend, {
        series: [{ key: 'tx_per_avg_pos', color: C.colors.pos, fill: true }],
        labelEvery: 4, yFmt: function (v) { return U.G.format(Math.round(v)); },
        hover: function (r) {
          return { name: 'Transactions per average POS',
                   value: r.tx_per_avg_pos ? U.G2.format(r.tx_per_avg_pos) : 'Not available',
                   rows: defTipRows(def, r.year_month).concat([['Denominator', '12-month average stock']]) };
        } }));
      put($('#st-prod', host), card('Average ticket', 'EUR per transaction', {
        src: function () { U.sourceDrawer(DA.getProvenance('average_ticket', sourceId,
          { universe: def.universe })); } }));
      $('#st-prod .card:last-child .card-b', host).appendChild(C.line(trend, {
        series: [{ key: 'avg_ticket', color: C.colors.neg, fill: true }],
        labelEvery: 4, yFmt: function (v) { return '€' + v.toFixed(1); },
        hover: function (r) {
          return { name: 'Average ticket', value: U.exactMoney(r.avg_ticket),
                   rows: defTipRows(def, r.year_month) }; } }));
      if (sig && !U.isNil(sig.infrastructure_growth)) {
        put($('#st-prod', host), card('Growth decomposition', 'YoY, like-for-like months', {}));
        $('#st-prod .card:last-child .card-b', host).appendChild(C.bars([
          { label: 'Terminals', value: sig.infrastructure_growth, color: C.colors.purpleSoft },
          { label: 'Transactions', value: sig.usage_growth, color: C.colors.purple },
          { label: 'Value', value: sig.value_growth, color: C.colors.purpleSoft },
          { label: 'Tx / POS', value: sig.productivity_growth, color: C.colors.pos },
          { label: 'Ticket', value: sig.average_ticket_growth, color: C.colors.neg }
        ], { h: 230 }));
      }
    }

    if (state.compareOn && state.comparePeriod) {
      const cmp = DA.compare(state.definition, cur.year_month, state.comparePeriod);
      const el = $('#cmp-chart', host);
      if (cmp && el) {
        el.appendChild(C.dumbbell([
          { label: 'POS terminals', a: cmp.b.terminal_stock, b: cmp.a.terminal_stock },
          { label: 'Transactions', a: cmp.b.tx_count, b: cmp.a.tx_count },
          { label: 'Value (EUR)', a: cmp.b.tx_value, b: cmp.a.tx_value },
          { label: 'Tx / average POS', a: cmp.b.tx_per_avg_pos, b: cmp.a.tx_per_avg_pos },
          { label: 'Average ticket', a: cmp.b.avg_ticket, b: cmp.a.avg_ticket }
        ], { fmt: C.short }));
      }
    }

    U.observeReveals(host);
    animateBand(host);
  }

  function heroFig(v, k, accent) {
    if (!v) return '';
    return '<div class="hero-fig' + (accent ? ' accent' : '') + '">' +
      '<div class="v">' + U.esc(v) + '</div><div class="k">' + U.esc(k) + '</div></div>';
  }
  function storySection(n, title, sub, id) {
    return '<section class="story reveal"><div class="story-head"><span class="n">' + n +
      '</span><h3>' + U.esc(title) + '</h3><span class="sub">' + U.esc(sub) + '</span></div>' +
      '<div class="grid2" id="' + id + '"></div></section>';
  }
  function statusBadge(kpiId) {
    const s = DA.getKpiStatus(kpiId);
    return s && s.status !== 'PASS' ? s.status : null;
  }
  function animateBand(host) {
    $$('.kpi .v', host).forEach(function (v) {
      const txt = v.textContent;
      const m = txt.match(/^€?(-?[\d.]+)(bn|m|K)?$/);
      if (!m) return;
      const target = parseFloat(m[1]);
      const pre = txt.startsWith('€') ? '€' : '', suf = m[2] || '';
      const dec = (m[1].split('.')[1] || '').length;
      U.countUp(v, target, function (x) { return pre + x.toFixed(dec) + suf; });
    });
  }

  // =====================================================================
  // 02 — PAYMENT BEHAVIOUR
  // =====================================================================
  function renderPayments() {
    const host = $('#page-payments');
    const b = DA.getPaymentBehaviour();
    const mix = b.channelMix, last = mix[mix.length - 1];
    const countRow = DA.lastMonthWith('E-commerce', 'count') || last;
    const valueRow = DA.lastMonthWith('E-commerce', 'value');
    const ORDER = ['POS', 'ATM Withdrawal', 'ATM Deposit', 'E-commerce',
                   'Digital Wallet', 'E-money', 'Credit Transfer'];

    function series(row, field) {
      return ORDER.map(function (c) {
        const v = row.channels[c];
        return { label: c, value: (v && v[field]) || 0,
                 color: c === 'POS' ? C.colors.purple
                      : c.indexOf('ATM') === 0 ? C.colors.neg : C.colors.purpleSoft,
                 tip: function () {
                   const tot = ORDER.reduce(function (a, k) {
                     const x = row.channels[k]; return a + ((x && x[field]) || 0); }, 0);
                   return { name: c, value: field === 'value'
                              ? U.exactMoney((v && v[field]) || 0)
                              : U.exact((v && v[field]) || 0),
                            rows: [['Period', U.monthLabel(row.year_month)],
                                   ['Share', U.pct(((v && v[field]) || 0) / tot)],
                                   ['Measure', field === 'value' ? 'Value (EUR)' : 'Count'],
                                   ['Source', 'BQK Raport Mujor']] };
                 } };
      }).filter(function (i) { return i.value > 0; })
        .sort(function (x, y) { return y.value - x.value; });
    }

    let h = U.pageHead('02 — Payment Behaviour', 'How are payments changing?',
      'Channel mix, card composition and the shift between cash and card at the point of sale.');

    h += '<div class="notice data"><h5>Three publication periods on this page</h5>' +
      '<p>Terminal channels run to <strong>' + U.monthLabel(last.year_month) +
      '</strong>. The instrument breakdown that carries e-commerce and digital wallet ends ' +
      'earlier — counts to <strong>' + U.monthLabel(countRow.year_month) +
      '</strong>, values to <strong>' + U.monthLabel(valueRow ? valueRow.year_month : null) +
      '</strong>. Each chart is pinned to the last month its own source covers and says so. ' +
      'None is padded forward.</p></div>';

    h += '<div class="grid2" id="pb-top"></div>' +
         '<section class="story"><div class="story-head"><span class="n">01</span>' +
         '<h3>Frequency against value</h3><span class="sub">Where payments happen is not ' +
         'where the money is.</span></div><div class="grid2" id="pb-mid"></div></section>' +
         '<section class="story"><div class="story-head"><span class="n">02</span>' +
         '<h3>Card estate</h3><span class="sub">What the market is carrying in its wallets.' +
         '</span></div><div class="grid2" id="pb-cards"></div></section>';

    h += '<div class="notice stop analyst-only" style="margin-top:24px">' +
      '<h5>Transaction value bands — BLOCKED</h5>' +
      '<p>The €0–20 / €21–50 / €51–100 / €101–200 / &gt;€200 split is not published by BQK in ' +
      'any reviewed source, and inventing bands would misrepresent the data. Average ticket on ' +
      'the Overview is the closest supported measure.</p></div>';

    host.innerHTML = h;

    const top = $('#pb-top', host);
    top.appendChild(put(top, card('Transaction count by channel',
      'all instruments · ' + U.monthLabel(countRow.year_month), {})) &&
      $('#pb-top .card:last-child .card-b', host).appendChild(
        C.hbars(series(countRow, 'count'), { fmt: C.short })) && document.createComment(''));
    put(top, card('Transaction value by channel',
      valueRow ? 'all instruments · ' + U.monthLabel(valueRow.year_month) : 'unavailable', {}));
    const vb = $('#pb-top .card:last-child .card-b', host);
    if (valueRow) vb.appendChild(C.hbars(series(valueRow, 'value'),
      { fmt: function (v) { return '€' + C.short(v); } }));
    else vb.innerHTML = U.emptyState('Not publicly available',
      'The instrument value series has not been published for a month this recent.');

    const mid = $('#pb-mid', host);
    put(mid, card('POS against ATM withdrawals', 'transactions per month', {
      legend: '<span><i style="background:' + C.colors.purple + '"></i>POS payments</span>' +
              '<span><i style="background:' + C.colors.neg + '"></i>ATM withdrawals</span>' }));
    const s2 = mix.filter(function (m) { return m.channels['POS']; }).map(function (m) {
      return { year_month: m.year_month,
               pos: m.channels['POS'] ? m.channels['POS'].count : null,
               atm: m.channels['ATM Withdrawal'] ? m.channels['ATM Withdrawal'].count : null };
    });
    $('#pb-mid .card:last-child .card-b', host).appendChild(C.line(s2, {
      series: [{ key: 'pos', color: C.colors.purple, fill: true },
               { key: 'atm', color: C.colors.neg }],
      labelEvery: 4, hover: function (r) {
        return { name: U.monthLabel(r.year_month), value: U.exact(r.pos) + ' POS',
                 delta: U.exact(r.atm) + ' ATM withdrawals',
                 rows: [['Measure', 'Transaction count'], ['Source', 'BQK Raport Mujor']] }; } }));

    put(mid, card('Cash still carries the value', 'latest month with both measures', {}));
    const vrow = mix.slice().reverse().find(function (m) {
      return m.channels['POS'] && !U.isNil(m.channels['POS'].value); }) || last;
    $('#pb-mid .card:last-child .card-b', host).appendChild(C.hbars(
      ['POS', 'ATM Withdrawal', 'ATM Deposit'].map(function (c) {
        const v = vrow.channels[c];
        return { label: c, value: (v && v.value) || 0,
                 color: c === 'POS' ? C.colors.purple : C.colors.neg };
      }).filter(function (i) { return i.value > 0; }),
      { fmt: function (v) { return '€' + C.short(v); } }));

    // cards
    const cards = b.cards, lc = cards[cards.length - 1];
    const cs = $('#pb-cards', host);
    put(cs, card('Card stock composition', U.monthLabel(lc.year_month), {
      src: function () { U.sourceDrawer(DA.getProvenance('cards_issued', 'BQK_RAPORT_MUJOR', {})); } }));
    $('#pb-cards .card:last-child .card-b', host).appendChild(C.hbars([
      { label: 'Contactless', value: lc['Contactless'] },
      { label: 'Contact only', value: lc['Contact'] },
      { label: 'Debit', value: lc['Debit'] },
      { label: 'Credit', value: lc['Credit'] },
      { label: 'Visa', value: lc['Visa'] },
      { label: 'Mastercard', value: lc['Mastercard'] }
    ], { fmt: C.short }));

    put(cs, card('Contactless share of the card estate', 'share of all valid cards', {}));
    const cl = cards.map(function (r) {
      return { year_month: r.year_month,
               share: r['All cards'] ? r['Contactless'] / r['All cards'] : null }; });
    $('#pb-cards .card:last-child .card-b', host).appendChild(C.line(cl, {
      series: [{ key: 'share', color: C.colors.pos, fill: true }], labelEvery: 4,
      yFmt: function (v) { return (v * 100).toFixed(0) + '%'; },
      hover: function (r) {
        return { name: 'Contactless share', value: U.pct(r.share, 2),
                 rows: [['Period', U.monthLabel(r.year_month)],
                        ['Source', 'BQK Raport Mujor']] }; } }));
  }

  // =====================================================================
  // 03 — GEOGRAPHY
  // =====================================================================
  function renderGeography() {
    const host = $('#page-geography');
    const geo = DA.getGeographicFootprint();
    const unver = geo.filter(function (g) { return !g.pairing_verified; }).length;
    const covered = geo.reduce(function (a, g) { return a + (g.pos_share_pct || 0); }, 0);

    let h = U.pageHead('03 — Geographic Intelligence',
      'Where is payment infrastructure concentrated?',
      'The only geography BQK publishes: seven cities, once a year, as shares of the national network.');

    h += '<div class="notice stop"><h5>Read at the grain the source publishes</h5>' +
      '<p>BQK names <strong>seven cities</strong>, annually, as percentages inside a chart in the ' +
      'annual report. Terminal counts below are <strong>estimated</strong> from that share of the ' +
      '2024 national total. ' + unver + ' of the seven have a legend-to-value pairing that has ' +
      'not been confirmed against the rendered figure.</p>' +
      '<p>The transaction columns combine <strong>ATM and POS</strong> — that is how the source ' +
      'publishes them. A POS-only productivity measure by geography is <strong>BLOCKED</strong>: ' +
      'it cannot be derived from a combined figure.</p></div>';

    h += '<div class="kpi-band">' +
      U.kpiTile({ label: 'Cities published', value: geo.length, display: String(geo.length),
        foot: 'of 38 municipalities' }) +
      U.kpiTile({ label: 'Network covered', value: covered, display: covered.toFixed(1) + '%',
        foot: 'remainder unattributed' }) +
      U.kpiTile({ label: 'Reference year', value: 2024, display: '2024', small: true,
        foot: 'annual publication' }) +
      U.kpiTile({ label: 'Grain', value: 'CITY', display: 'City', small: true,
        foot: 'not municipality' }) +
      '</div>';

    h += '<div class="grid2"><div class="card"><div class="card-h">' +
      '<h4>POS network share by city</h4><span class="note">2024 · estimated</span></div>' +
      '<div class="card-b" id="geo-share"></div></div>' +
      '<div class="card"><div class="card-h"><h4>ATM + POS transactions by city</h4>' +
      '<span class="note">combined · 2024</span></div>' +
      '<div class="card-b" id="geo-tx"></div></div></div>';

    h += '<section class="story"><div class="story-head"><span class="n">01</span>' +
      '<h3>City detail</h3><span class="sub">Estimated terminals against the ATK economy of ' +
      'the same-named municipality.</span></div>' +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>City</th>' +
      '<th class="n">POS share</th><th class="n">POS terminals (est.)</th>' +
      '<th class="n">ATM+POS transactions</th><th class="n">ATM+POS value</th>' +
      '<th>Pairing</th></tr></thead><tbody>' +
      geo.map(function (g) {
        return '<tr><td class="strong">' + U.esc(g.city) + '</td>' +
          '<td class="n">' + g.pos_share_pct.toFixed(2) + '%</td>' +
          '<td class="n">' + U.exact(g.pos_terminals) + '</td>' +
          '<td class="n">' + U.compact(g.atm_pos_tx_count) + '</td>' +
          '<td class="n">' + U.money(g.atm_pos_tx_value) + '</td>' +
          '<td><span class="badge ' + (g.pairing_verified ? 'PASS' : 'REVIEW_REQUIRED') + '">' +
          (g.pairing_verified ? 'Verified' : 'Unverified') + '</span></td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    host.innerHTML = h;

    $('#geo-share', host).appendChild(C.hbars(geo.map(function (g) {
      return { label: g.city, value: g.pos_share_pct, tip: function () {
        return { name: g.city, value: g.pos_share_pct.toFixed(2) + '%',
                 delta: U.exact(g.pos_terminals) + ' terminals (estimated)',
                 rows: [['Grain', 'City'], ['Year', '2024'],
                        ['Method', 'Share × national total'],
                        ['Pairing', g.pairing_verified ? 'Verified' : 'Unverified'],
                        ['Source', 'BQK annual report, Figure 4']] }; } };
    }), { fmt: function (v) { return v.toFixed(1) + '%'; } }));

    $('#geo-tx', host).appendChild(C.hbars(geo.slice().sort(function (a, b) {
      return b.atm_pos_tx_count - a.atm_pos_tx_count;
    }).map(function (g) {
      return { label: g.city, value: g.atm_pos_tx_count, color: C.colors.neg,
        tip: function () {
          return { name: g.city, value: U.exact(g.atm_pos_tx_count),
                   delta: U.exactMoney(g.atm_pos_tx_value),
                   rows: [['Measure', 'ATM AND POS combined'], ['Year', '2024'],
                          ['Source', 'BQK annual report, Figures 26–27']] }; } };
    }), { fmt: C.short }));
  }

  // =====================================================================
  // 04 — ECONOMIC OPPORTUNITY
  // =====================================================================
  function renderOpportunity() {
    const host = $('#page-opportunity');
    const geo = DA.getEconomicContext();
    const st = DA.getKpiStatus('pos_per_eur1m_addressable');

    let h = U.pageHead('04 — Economic Opportunity',
      'How does POS infrastructure compare with economic activity?',
      'BQK terminal estimates against ATK declared turnover, at the only year and grain both cover.');

    h += '<div class="notice"><h5>Two stated approximations</h5>' +
      '<p><strong>Grain.</strong> The numerator is a BQK <em>city</em>; the denominator is the ' +
      'same-named ATK <em>municipality</em>, which contains settlements outside the city. The ' +
      'ratio is indicative, not like-for-like.</p>' +
      '<p><strong>Denominator.</strong> ATK publishes registered <em>taxpayers</em>, not ' +
      'card-accepting merchants, and reports wholesale together with retail. Addressable ' +
      'turnover is therefore an analytical classification shown as a floor and a ceiling, ' +
      'never a single number.</p></div>';

    if (!geo.length) {
      host.innerHTML = h + U.emptyState('Not comparable at this level',
        'No year is covered by both institutions at a compatible grain.');
      return;
    }

    h += '<div class="grid2"><div class="card"><div class="card-h">' +
      '<h4>Turnover × POS intensity</h4>' +
      '<button class="src analyst-only" id="opp-src" aria-label="Source and methodology">ⓘ</button>' +
      '<span class="note">2024 · bubble = taxpayers</span></div>' +
      '<div class="card-b" id="opp-matrix"></div></div>' +
      '<div class="card"><div class="card-h"><h4>Quadrants</h4>' +
      '<span class="note">median crosshairs</span></div><div class="card-b">' +
      quad('Established', 'High addressable turnover, high POS intensity.') +
      quad('Potential infrastructure gap', 'High turnover, lower POS intensity than peers.') +
      quad('Higher infrastructure concentration', 'Lower turnover, high POS intensity.') +
      quad('Developing', 'Lower on both measures.') +
      '<p style="font-size:12px;color:var(--ink-3);margin-top:16px;line-height:1.5">' +
      'Descriptive only. Public data cannot establish that a low ratio is an opportunity ' +
      'rather than a difference in how business is conducted locally.</p>' +
      '</div></div></div>';

    h += '<section class="story"><div class="story-head"><span class="n">01</span>' +
      '<h3>City detail</h3><span class="sub">Click a row to focus it in the matrix.</span></div>' +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>City</th>' +
      '<th class="n">POS (est.)</th><th class="n">Taxpayers</th>' +
      '<th class="n">Turnover</th><th class="n">Addressable floor</th>' +
      '<th class="n">Addressable ceiling</th><th class="n">POS / €1m (ceiling)</th>' +
      '<th class="n">POS / 1,000 taxpayers</th></tr></thead><tbody id="opp-rows">' +
      geo.map(function (g) {
        return '<tr class="clickable" data-city="' + U.esc(g.city) + '">' +
          '<td class="strong">' + U.esc(g.city) + '</td>' +
          '<td class="n">' + U.exact(g.pos_terminals) + '</td>' +
          '<td class="n">' + U.exact(g.taxpayers) + '</td>' +
          '<td class="n">' + U.money(g.turnover_total) + '</td>' +
          '<td class="n">' + U.money(g.addressable_floor) + '</td>' +
          '<td class="n">' + U.money(g.addressable_ceiling) + '</td>' +
          '<td class="n">' + (g.pos_per_eur1m_ceiling ? g.pos_per_eur1m_ceiling.toFixed(1) : '—') + '</td>' +
          '<td class="n">' + (g.pos_per_1000_taxpayers ? g.pos_per_1000_taxpayers.toFixed(1) : '—') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div></div></section>';

    host.innerHTML = h;

    let selected = null;
    function drawMatrix() {
      const el = $('#opp-matrix', host);
      el.innerHTML = '';
      el.appendChild(C.bubbles(geo.map(function (g) {
        return { label: g.city, x: g.addressable_ceiling, y: g.pos_per_eur1m_ceiling || 0,
                 r: g.taxpayers, selected: g.city === selected,
                 tip: function () {
                   return { name: g.city, value: (g.pos_per_eur1m_ceiling || 0).toFixed(2) + ' POS / €1m',
                     delta: U.money(g.addressable_ceiling) + ' addressable (ceiling)',
                     rows: [['Terminals', U.exact(g.pos_terminals) + ' (estimated)'],
                            ['Taxpayers', U.exact(g.taxpayers)],
                            ['Floor', U.money(g.addressable_floor)],
                            ['Grain', 'City ÷ municipality'],
                            ['Year', '2024']] };
                 } };
      }), { xLabel: 'Addressable turnover, ceiling (EUR)', yLabel: 'POS per €1m addressable',
            xFmt: function (v) { return '€' + C.short(v); },
            yFmt: function (v) { return v.toFixed(1); },
            onClick: function (it) { selected = selected === it.label ? null : it.label; sync(); } }));
    }
    function sync() {
      drawMatrix();
      $$('#opp-rows tr', host).forEach(function (tr) {
        tr.classList.toggle('sel', tr.dataset.city === selected);
      });
    }
    $$('#opp-rows tr', host).forEach(function (tr) {
      tr.addEventListener('click', function () {
        selected = selected === tr.dataset.city ? null : tr.dataset.city; sync();
      });
    });
    sync();

    $('#opp-src', host).addEventListener('click', function () {
      U.sourceDrawer(DA.getProvenance('pos_per_eur1m_addressable', 'BQK_CARDS_ANNUAL', {
        period: '2024', coverage: 'Seven BQK cities against same-named ATK municipalities' }));
    });
  }
  function quad(t, d) {
    return '<div style="border-top:1px solid var(--rule);padding:11px 0">' +
      '<div style="font-size:12.5px;font-weight:600">' + U.esc(t) + '</div>' +
      '<div style="font-size:11.5px;color:var(--ink-3);line-height:1.45">' + U.esc(d) + '</div></div>';
  }

  // =====================================================================
  // 05 — SECTOR INTELLIGENCE
  // =====================================================================
  function renderSectors() {
    const host = $('#page-sectors');
    const years = DA.atkYears();
    const year = state.year || years[years.length - 1];
    const muni = state.municipality;
    const rows = DA.getSectorIntelligence({ year: year, municipality: muni });
    const prev = DA.getSectorIntelligence({ year: year - 1, municipality: muni });
    const prevBy = {};
    prev.forEach(function (r) { prevBy[r.sector] = r; });
    const total = rows.reduce(function (a, r) { return a + r.turnover; }, 0);
    const byCls = {};
    rows.forEach(function (r) { byCls[r.addressability] = (byCls[r.addressability] || 0) + r.turnover; });
    const floor = byCls['HIGH'] || 0;
    const ceiling = floor + (byCls['REVIEW_REQUIRED'] || 0);

    let h = U.pageHead('05 — Sector Intelligence',
      'Which parts of the economy drive addressable turnover?',
      'ATK declared turnover by sector and municipality, with the addressability classification stated.');

    h += '<div class="kpi-band">' +
      U.kpiTile({ label: 'Scope', value: muni, display: muni, small: true,
        foot: year + ' · ATK' }) +
      U.kpiTile({ label: 'Declared turnover', value: total, display: U.money(total),
        exact: U.exactMoney(total), foot: 'all sectors' }) +
      U.kpiTile({ id: 'addressable_turnover', label: 'Addressable floor', value: floor,
        display: U.money(floor), exact: U.exactMoney(floor), source: true,
        badge: statusBadge('addressable_turnover'),
        foot: U.pct(floor / total) + ' of turnover' }) +
      U.kpiTile({ id: 'addressable_turnover', label: 'Addressable ceiling', value: ceiling,
        display: U.money(ceiling), exact: U.exactMoney(ceiling),
        foot: U.pct(ceiling / total) + ' of turnover' }) +
      U.kpiTile({ label: 'Sectors', value: rows.length, display: String(rows.length),
        foot: 'NACE sections' }) +
      '</div>';

    h += '<div class="grid2"><div class="card"><div class="card-h">' +
      '<h4>Turnover by sector</h4><span class="note">' + year + ' · top 10</span></div>' +
      '<div class="card-b" id="sec-bars"></div></div>' +
      '<div class="card"><div class="card-h"><h4>By addressability class</h4>' +
      '<span class="note">' + year + '</span></div><div class="card-b" id="sec-cls"></div></div></div>';

    const sorted = rows.slice().sort(function (a, b) { return b.turnover - a.turnover; });
    h += '<section class="story"><div class="story-head"><span class="n">01</span>' +
      '<h3>Sector detail</h3><span class="sub">Taxpayers, not merchants — ATK counts ' +
      'registered filers.</span></div><div class="card"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Sector</th><th>Addressability</th><th class="n">Turnover</th><th class="n">Share</th>' +
      '<th class="n">Taxpayers</th><th class="n">Turnover / taxpayer</th><th class="n">YoY</th>' +
      '</tr></thead><tbody>' + sorted.map(function (r) {
        const p = prevBy[r.sector];
        const yoy = p && p.turnover ? r.turnover / p.turnover - 1 : null;
        return '<tr><td class="strong">' + U.esc(r.sector) + '</td>' +
          '<td><span class="badge ' + r.addressability + '">' +
          U.esc(r.addressability.replace(/_/g, ' ')) + '</span></td>' +
          '<td class="n">' + U.money(r.turnover) + '</td>' +
          '<td class="n">' + U.pct(r.turnover / total) + '</td>' +
          '<td class="n">' + U.exact(r.taxpayers) + '</td>' +
          '<td class="n">' + U.money(r.taxpayers ? r.turnover / r.taxpayers : null) + '</td>' +
          '<td class="n">' + (yoy === null ? '—' : U.deltaSpan(yoy)) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    host.innerHTML = h;
    wireKpis(host, { sourceId: 'ATK_QARKULLIMI_' + year, period: String(year),
                     rows: [['Year', String(year)], ['Scope', muni],
                            ['Entity', 'Registered taxpayers'], ['Source', 'ATK Open Data']] });

    const colorOf = function (cls) {
      return cls === 'HIGH' ? C.colors.pos
           : cls === 'REVIEW_REQUIRED' ? C.colors.neg
           : cls === 'MEDIUM' ? C.colors.gold : C.colors.purpleSoft;
    };
    $('#sec-bars', host).appendChild(C.hbars(sorted.slice(0, 10).map(function (r) {
      return { label: r.sector.length > 30 ? r.sector.slice(0, 29) + '…' : r.sector,
               value: r.turnover, color: colorOf(r.addressability),
               tip: function () {
                 const p = prevBy[r.sector];
                 return { name: r.sector, value: U.exactMoney(r.turnover),
                   delta: p && p.turnover ? U.signedPct(r.turnover / p.turnover - 1) + ' YoY' : null,
                   rows: [['Share', U.pct(r.turnover / total)],
                          ['Taxpayers', U.exact(r.taxpayers)],
                          ['Addressability', r.addressability.replace(/_/g, ' ')],
                          ['Year', String(year)], ['Source', 'ATK Qarkullimi']] }; } };
    }), { fmt: function (v) { return '€' + C.short(v); }, pad: { t: 6, r: 92, b: 6, l: 196 } }));

    $('#sec-cls', host).appendChild(C.hbars(
      ['HIGH', 'MEDIUM', 'LOW', 'REVIEW_REQUIRED'].filter(function (k) { return byCls[k]; })
        .map(function (k) {
          return { label: k.replace(/_/g, ' '), value: byCls[k], color: colorOf(k),
            tip: function () {
              return { name: k.replace(/_/g, ' '), value: U.exactMoney(byCls[k]),
                rows: [['Share', U.pct(byCls[k] / total)], ['Year', String(year)],
                       ['Mapping', DA.meta().sector_mapping_version]] }; } };
        }), { fmt: function (v) { return '€' + C.short(v); }, pad: { t: 6, r: 92, b: 6, l: 168 } }));
  }

  // =====================================================================
  // 06 — DATA ASSURANCE
  // =====================================================================
  function renderAssurance() {
    const host = $('#page-assurance');
    const st = DA.getDataStatus();
    const groups = {};
    st.checks.forEach(function (c) {
      (groups[c.check_group] = groups[c.check_group] || []).push(c);
    });

    let h = U.pageHead('06 — Data Assurance', 'Can I trust these numbers?',
      'Every control the pipeline runs, and every finding it raised. Source properties are ' +
      'reported, never smoothed.');

    h += '<div class="kpi-band">' +
      U.kpiTile({ label: 'Controls passed', value: st.passed,
        display: st.passed + ' / ' + (st.passed + st.failed), foot: 'automated checks' }) +
      U.kpiTile({ label: 'High severity', value: st.high, display: String(st.high),
        foot: 'open findings' }) +
      U.kpiTile({ label: 'KPIs blocked', value: st.blocked, display: String(st.blocked),
        foot: st.warnings + ' with warnings' }) +
      U.kpiTile({ label: 'BQK latest', value: st.meta.bqk_latest,
        display: U.monthLabel(st.meta.bqk_latest), small: true, foot: 'payment statistics' }) +
      U.kpiTile({ label: 'ATK latest', value: st.meta.atk_latest,
        display: U.monthLabel(st.meta.atk_latest), small: true,
        foot: st.meta.atk_bqk_lag_months + ' months behind' }) +
      U.kpiTile({ label: 'Built', value: st.meta.generated_at,
        display: st.meta.generated_at.slice(0, 10), small: true,
        foot: 'parser ' + st.meta.parser_version }) +
      '</div>';

    // KPI status
    h += section('01', 'KPI build status', 'Whether each measure may be shown, and why not.') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>KPI</th><th>Status</th>' +
      '<th>Reason</th><th>Required to lift</th></tr></thead><tbody>' +
      st.kpiStatus.slice().sort(function (a, b) {
        const r = { BLOCKED: 0, FAIL: 1, WARNING: 2, PASS: 3 };
        return r[a.status] - r[b.status];
      }).map(function (s) {
        return '<tr><td class="strong">' + U.esc(s.kpi_id.replace(/_/g, ' ')) + '</td>' +
          '<td><span class="badge ' + s.status + '">' + s.status + '</span></td>' +
          '<td>' + U.esc(s.reason) + '</td>' +
          '<td style="color:var(--ink-3)">' + U.esc(s.required_input || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    // checks by group
    h += section('02', 'Controls', 'Grouped by what they test.');
    Object.keys(groups).sort().forEach(function (g) {
      const rows = groups[g];
      const bad = rows.filter(function (r) { return r.status === 'failed'; }).length;
      h += '<div class="card" style="margin-bottom:12px"><div class="card-h">' +
        '<h4>' + U.esc(g) + '</h4><span class="note">' + (rows.length - bad) + ' / ' +
        rows.length + ' passed</span></div><div class="tbl-wrap"><table><thead><tr>' +
        '<th>Check</th><th>Severity</th><th>Finding</th><th class="n">Variance</th>' +
        '</tr></thead><tbody>' + rows.map(function (c) {
          const cls = c.status === 'passed' ? 'PASS'
                    : c.severity === 'high' ? 'FAIL' : 'WARNING';
          return '<tr><td>' + U.esc(c.check_type.replace(/_/g, ' ')) + '</td>' +
            '<td><span class="badge ' + cls + '">' +
            (c.status === 'passed' ? 'pass' : U.esc(c.severity)) + '</span></td>' +
            '<td>' + U.esc(c.message) + '</td>' +
            '<td class="n">' + (U.isNil(c.variance_percent) ? '—' :
              c.variance_percent.toFixed(2) + '%') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    });
    h += '</section>';

    // reconciliation
    if (st.reconciliation.length) {
      const byCls = {};
      st.reconciliation.forEach(function (r) {
        (byCls[r.classification] = byCls[r.classification] || []).push(r);
      });
      h += section('03', 'Cross-source reconciliation',
        'Where two official series describe a similar measure.') +
        '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Metric</th>' +
        '<th>Classification</th><th class="n">Observations</th><th class="n">Mean difference</th>' +
        '<th>Note</th></tr></thead><tbody>' +
        Object.keys(byCls).map(function (k) {
          const rows = byCls[k];
          const mean = rows.reduce(function (a, r) { return a + (r.pct_difference || 0); }, 0) / rows.length;
          return '<tr><td class="strong">' + U.esc(rows[0].metric) + '</td>' +
            '<td><span class="badge ' + (k === 'MATCH' ? 'PASS' :
              k === 'NOT_COMPARABLE' ? 'BLOCKED' : 'WARNING') + '">' +
            U.esc(k.replace(/_/g, ' ')) + '</span></td>' +
            '<td class="n">' + rows.length + '</td>' +
            '<td class="n">' + mean.toFixed(2) + '%</td>' +
            '<td>' + U.esc(rows[0].note) + '</td></tr>';
        }).join('') + '</tbody></table></div></div></section>';
    }

    // coverage
    h += section('04', 'Historical coverage', 'Whether a year-on-year comparison is possible.') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Series</th>' +
      '<th class="n">First</th><th class="n">Last</th><th class="n">Observed</th>' +
      '<th class="n">Missing</th><th>Continuity</th></tr></thead><tbody>' +
      st.coverage.map(function (c) {
        return '<tr><td class="strong">' + U.esc(c.metric) + '</td>' +
          '<td class="n">' + U.esc(c.first_period) + '</td>' +
          '<td class="n">' + U.esc(c.last_period) + '</td>' +
          '<td class="n">' + c.actual_observations + '</td>' +
          '<td class="n">' + c.missing_observations + '</td>' +
          '<td><span class="badge ' + (c.continuity_status === 'CONTINUOUS' ? 'PASS' : 'WARNING') +
          '">' + U.esc(c.continuity_status.replace(/_/g, ' ')) + '</span></td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    // sources + versions
    h += section('05', 'Sources and file versions',
      'Which exact file produced each figure.') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Institution</th>' +
      '<th>Dataset</th><th>File</th><th class="n">Size</th><th>SHA-256</th><th>Parser</th>' +
      '</tr></thead><tbody>' + st.versions.map(function (v) {
        const s = st.sources.filter(function (x) { return x.source_id === v.source_id; })[0] || {};
        return '<tr><td class="strong">' + U.esc(s.institution) + '</td>' +
          '<td><a href="' + U.esc(s.source_url) + '" target="_blank" rel="noopener">' +
          U.esc(s.dataset_name) + '</a></td>' +
          '<td style="font-family:var(--mono);font-size:11px">' +
          U.esc(v.original_filename || v.source_table || '—') + '</td>' +
          '<td class="n">' + (v.file_size ? Math.round(v.file_size / 1024) + ' KB' : '—') + '</td>' +
          '<td style="font-family:var(--mono);font-size:10.5px;color:var(--ink-3)">' +
          U.esc(v.sha256_hash ? v.sha256_hash.slice(0, 16) : '—') + '</td>' +
          '<td style="font-family:var(--mono);font-size:11px">' + U.esc(v.parser_version) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    host.innerHTML = h;
  }
  function section(n, title, sub) {
    return '<section class="story"><div class="story-head"><span class="n">' + n + '</span>' +
      '<h3>' + U.esc(title) + '</h3><span class="sub">' + U.esc(sub) + '</span></div>';
  }

  // =====================================================================
  // 07 — METHODOLOGY
  // =====================================================================
  function renderMethodology() {
    const host = $('#page-methodology');
    const kpis = DA.getMethodology();
    const defs = DA.getDefinitions();
    const meta = DA.meta();

    let h = U.pageHead('07 — Methodology', 'How exactly was this calculated?',
      'One authoritative formula per measure, with the universe, the aggregation rule and the ' +
      'comparison it supports.');

    h += section('01', 'Definition dictionary',
      'Three BQK series describe "POS transactions" and differ by up to 43%.') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Series</th>' +
      '<th>Perspective</th><th>Card origin</th><th>Universe</th><th>Limitations</th>' +
      '</tr></thead><tbody>' + defs.map(function (d) {
        return '<tr><td class="strong">' + U.esc(d.metric_name) +
          (d.is_default ? ' <span class="badge purple">Default</span>' : '') + '</td>' +
          '<td>' + U.esc(d.perspective) + '</td><td>' + U.esc(d.card_origin) + '</td>' +
          '<td>' + U.esc(d.universe) + '</td><td>' + U.esc(d.limitations) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    h += section('02', 'KPI registry', 'Click any measure for its full provenance.') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>KPI</th><th>Status</th>' +
      '<th>Formula</th><th>Aggregation</th><th>Valid comparison</th></tr></thead><tbody>' +
      kpis.map(function (k) {
        return '<tr class="clickable" data-kpi="' + U.esc(k.kpi_id) + '">' +
          '<td class="strong">' + U.esc(k.display_name) + '</td>' +
          '<td><span class="badge ' + (k.status || 'PASS') + '">' + U.esc(k.status || 'PASS') +
          '</span></td>' +
          '<td style="font-family:var(--mono);font-size:11px">' + U.esc(k.sql_formula) + '</td>' +
          '<td>' + U.esc(k.aggregation_rule) + '</td>' +
          '<td>' + U.esc(k.valid_comparison_method) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    h += section('03', 'Sector addressability', 'Mapping ' + U.esc(meta.sector_mapping_version) +
      ' — an analytical classification, not an ATK measure.') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Sector</th><th>Class</th>' +
      '<th>Rationale</th><th>Review</th></tr></thead><tbody>' +
      DA.getSectorDictionary().slice().sort(function (a, b) {
        const r = { HIGH: 0, MEDIUM: 1, REVIEW_REQUIRED: 2, LOW: 3 };
        return r[a.addressability_class] - r[b.addressability_class];
      }).map(function (s) {
        return '<tr><td class="strong">' + U.esc(s.standardized_sector) + '</td>' +
          '<td><span class="badge ' + s.addressability_class + '">' +
          U.esc(s.addressability_class.replace(/_/g, ' ')) + '</span></td>' +
          '<td>' + U.esc(s.rationale) + '</td>' +
          '<td style="color:var(--ink-3)">' + U.esc(s.review_status) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    h += '<div class="notice stop"><h5>What Phase 1 cannot answer</h5>' +
      '<p>No public source splits POS terminals, cards, merchants or transactions by bank. ' +
      'NLB market share, the Fair Share Index, transaction leakage and on-us versus off-us ' +
      'activity are out of reach — absent by necessity, not by choice. Merchant-level ' +
      'performance, MDR, interchange, scheme fees and terminal economics appear in no public ' +
      'source at all.</p>' +
      '<p>The data model reserves <code>fact_nlb_*</code> against the same date, geography, ' +
      'sector and channel dimensions, so Phase 2 attaches without reshaping Phase 1.</p></div>';

    host.innerHTML = h;
    $$('tr[data-kpi]', host).forEach(function (tr) {
      tr.addEventListener('click', function () {
        U.sourceDrawer(DA.getProvenance(tr.dataset.kpi, 'BQK_RAPORT_MUJOR', {}));
      });
    });
  }

  // =====================================================================
  // shell
  // =====================================================================
  const RENDER = {
    overview: renderOverview, payments: renderPayments, geography: renderGeography,
    opportunity: renderOpportunity, sectors: renderSectors,
    assurance: renderAssurance, methodology: renderMethodology
  };

  function show(page) {
    state.page = page;
    $$('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + page); });
    $$('.rail-nav button').forEach(function (b) {
      if (b.dataset.page === page) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    syncCommand();
    RENDER[page]();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function syncCommand() {
    const def = DA.getDefinition(state.definition);
    const onPos = ['overview', 'payments'].indexOf(state.page) >= 0;
    const onAtk = ['sectors', 'opportunity'].indexOf(state.page) >= 0;
    $('#crumb-period').closest('.crumb').style.display = onPos ? '' : 'none';
    $('#crumb-def').closest('.crumb').style.display = onPos ? '' : 'none';
    $('#crumb-year').closest('.crumb').style.display = onAtk ? '' : 'none';
    $('#crumb-muni').closest('.crumb').style.display = onAtk ? '' : 'none';
    $('#btn-compare').style.display = state.page === 'overview' ? '' : 'none';
    $('#crumb-period').textContent = U.monthLabel(state.period || DA.getPeriods(state.definition)[0]);
    $('#crumb-def').textContent = def.metric_name.replace('POS Transactions — ', '');
    $('#crumb-year').textContent = state.year || DA.atkYears().slice(-1)[0];
    $('#crumb-muni').textContent = state.municipality;
  }

  /** A crumb opens a small chooser rendered in the drawer. */
  function chooser(title, items, current, onPick) {
    U.openDrawer('<span class="label label-gold">Filter</span><h3>' + U.esc(title) + '</h3>' +
      '<div style="margin-top:24px;display:grid;gap:1px;background:var(--rule)">' +
      items.map(function (it) {
        const sel = String(it.value) === String(current);
        return '<button class="pick" data-v="' + U.esc(it.value) + '" style="text-align:left;' +
          'background:' + (sel ? 'var(--purple-wash)' : 'var(--surface)') + ';border:0;' +
          'padding:12px 14px;cursor:pointer;font-size:13px;color:var(--ink);' +
          'font-weight:' + (sel ? '600' : '400') + '">' + U.esc(it.label) +
          (it.note ? '<div style="font-size:11.5px;color:var(--ink-3);margin-top:3px;' +
            'font-weight:400">' + U.esc(it.note) + '</div>' : '') + '</button>';
      }).join('') + '</div>');
    $$('.pick').forEach(function (b) {
      b.addEventListener('click', function () { U.closeDrawer(); onPick(b.dataset.v); });
    });
  }

  function init() {
    if (!DA) throw new Error('Data layer unavailable — the payload did not load.');
    state.definition = DA.defaultDefinition();
    const meta = DA.meta();
    const st = DA.getDataStatus();

    // rail
    const nav = $('.rail-nav');
    PAGES.forEach(function (p) {
      const b = document.createElement('button');
      b.dataset.page = p[0];
      b.innerHTML = '<span class="n">' + p[1] + '</span><span class="t">' + p[2] + '</span>';
      b.addEventListener('click', function () { show(p[0]); });
      nav.appendChild(b);
    });

    // page shells
    const main = $('.canvas');
    PAGES.forEach(function (p) {
      const s = document.createElement('section');
      s.className = 'page';
      s.id = 'page-' + p[0];
      main.appendChild(s);
    });

    state.period = DA.getPeriods(state.definition)[0];
    state.comparePeriod = DA.getPeriods(state.definition)[12] || DA.getPeriods(state.definition)[1];
    state.year = DA.atkYears().slice(-1)[0];

    $('#crumb-period').closest('.crumb').addEventListener('click', function () {
      chooser('Reporting period', DA.getPeriods(state.definition).map(function (p) {
        return { value: p, label: U.monthLabel(p) }; }), state.period, function (v) {
        state.period = v; RENDER[state.page](); syncCommand(); });
    });
    $('#crumb-def').closest('.crumb').addEventListener('click', function () {
      chooser('POS transaction universe', DA.getDefinitions().map(function (d) {
        return { value: d.metric_key, label: d.metric_name, note: d.universe }; }),
        state.definition, function (v) {
          state.definition = v;
          state.period = DA.getPeriods(v)[0];
          state.comparePeriod = DA.getPeriods(v)[12] || DA.getPeriods(v)[1];
          RENDER[state.page](); syncCommand();
        });
    });
    $('#crumb-year').closest('.crumb').addEventListener('click', function () {
      chooser('Year', DA.atkYears().slice().reverse().map(function (y) {
        return { value: y, label: String(y) }; }), state.year, function (v) {
        state.year = parseInt(v, 10); RENDER[state.page](); syncCommand(); });
    });
    $('#crumb-muni').closest('.crumb').addEventListener('click', function () {
      const list = [{ value: 'All', label: 'All of Kosovo' }].concat(
        DA.getMunicipalityTotals(state.year).map(function (r) {
          return { value: r.municipality, label: r.municipality }; })
          .sort(function (a, b) { return a.label.localeCompare(b.label); }));
      chooser('Municipality', list, state.municipality, function (v) {
        state.municipality = v; RENDER[state.page](); syncCommand(); });
    });

    $('#btn-compare').addEventListener('click', function () {
      state.compareOn = !state.compareOn;
      $('#btn-compare').setAttribute('aria-pressed', String(state.compareOn));
      if (state.compareOn) {
        chooser('Compare against', DA.getPeriods(state.definition)
          .filter(function (p) { return p !== state.period; })
          .map(function (p) { return { value: p, label: U.monthLabel(p) }; }),
          state.comparePeriod, function (v) {
            state.comparePeriod = v; RENDER[state.page]();
          });
      }
      RENDER[state.page]();
    });

    $('#btn-exec').addEventListener('click', function () {
      state.exec = !state.exec;
      document.body.classList.toggle('exec', state.exec);
      $('#btn-exec').setAttribute('aria-pressed', String(state.exec));
      $('#btn-exec').textContent = state.exec ? 'Analyst' : 'Executive';
      RENDER[state.page]();
    });

    $('#btn-reset').addEventListener('click', function () {
      state.definition = DA.defaultDefinition();
      state.period = DA.getPeriods(state.definition)[0];
      state.compareOn = false;
      state.year = DA.atkYears().slice(-1)[0];
      state.municipality = 'All';
      $('#btn-compare').setAttribute('aria-pressed', 'false');
      RENDER[state.page](); syncCommand();
    });

    $('#status').addEventListener('click', function () { show('assurance'); });
    $('#status-text').textContent = st.failed
      ? st.failed + ' finding' + (st.failed === 1 ? '' : 's') + ' · ' + st.blocked + ' blocked'
      : 'All controls passed';
    if (st.failed) $('#status-dot').classList.add('warn');

    $('#meta-line').textContent = 'BQK ' + U.monthLabel(meta.bqk_latest) +
      ' · ATK ' + U.monthLabel(meta.atk_latest);

    show('overview');
    setTimeout(function () { $('.boot').classList.add('gone'); }, 120);
  }

  /* The boot overlay covers the page until init() dismisses it. If anything
     throws on the way there, the viewer would be left staring at a loading
     screen for good — so a failure replaces it with a state that says what
     went wrong and how to recover, rather than hanging. */
  document.addEventListener('DOMContentLoaded', function () {
    try {
      init();
    } catch (err) {
      if (window.console) console.error('init failed', err);
      if (window.__bootFail) window.__bootFail(err && (err.message || err));
    }
  });
})();
