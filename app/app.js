/* Kosovo Merchant & Payments Intelligence.

   Four modules to explore, two for assurance. Simple is the default view;
   Advanced reveals the alternative BQK series, the second productivity
   variant, period comparison and the deeper methodology tables.

   Nothing here derives a KPI — the numbers arrive computed, and this file
   arranges, formats and qualifies them. Narrative sentences are assembled from
   measured values at render time, so the story changes when the data does.

   Qualifications are never dropped to save space. A figure that rests on an
   approximation carries a compact marker beside it; the full explanation is one
   click away rather than a paragraph in the way. */
(function () {
  'use strict';

  const DA = window.DataAccess, C = window.Charts, U = window.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  const PAGES = [
    { id: 'home',     n: '01', nav: 'Where the money is', title: 'Where the money is',
      q: 'What is the opportunity, and which way is it moving?',
      group: 'primary', filters: ['period', 'universe'] },
    { id: 'penetration', n: '02', nav: 'Penetration',    title: 'Penetration',
      q: 'How much of the economy actually settles on a card?',
      group: 'primary', filters: [] },
    { id: 'pool',     n: '03', nav: 'Cash & capture',     title: 'Cash and capture',
      q: 'How much spending is still cash, and are cards taking it?',
      group: 'primary', filters: [] },
    { id: 'mix',      n: '04', nav: 'Mix & margin',       title: 'Mix and margin',
      q: 'What is happening to the composition behind the volume?',
      group: 'primary', filters: [] },
    { id: 'coverage', n: '05', nav: 'Coverage',           title: 'Coverage',
      q: 'Where does acceptance lag the economy around it?',
      group: 'primary', filters: ['year', 'muni'] },
    { id: 'position', n: '06', nav: 'Position',           title: 'Position',
      q: 'Where does Kosovo sit against the euro area?',
      group: 'primary', filters: [] },
    { id: 'demand',   n: '07', nav: 'Product demand',    title: 'Product demand',
      q: 'Which merchant markets are being stocked, and which are thinning?',
      group: 'primary', filters: [] },
    { id: 'fairshare', n: '08', nav: 'Fair share',        title: 'Fair share',
      q: 'Who holds the terminals, and who carries the value?',
      group: 'primary', filters: [] },
    { id: 'conclusion', n: '09', nav: 'What this means', title: 'What this means',
      q: 'The evidence, in order, and what it adds up to.',
      group: 'primary', filters: [] },
    { id: 'network',  n: '10', nav: 'POS network',        title: 'The POS network',
      q: 'How large is the network, how hard does it work, and where is it?',
      group: 'secondary', filters: ['period', 'universe'] },
    { id: 'payments', n: '11', nav: 'Payment behaviour',  title: 'Payment behaviour',
      q: 'How are people paying?', group: 'secondary', filters: ['period'] },
    { id: 'quality',  n: '12', nav: 'Data quality',       title: 'Data quality',
      q: 'Can I trust these numbers?', group: 'secondary', filters: [] },
    { id: 'method',   n: '13', nav: 'Methodology',        title: 'Methodology',
      q: 'How exactly was this calculated?', group: 'secondary', filters: [] }
  ];
  const PAGE = {};
  PAGES.forEach(function (p) { PAGE[p.id] = p; });

  const state = {
    page: 'home', definition: null, period: null, comparePeriod: null,
    compareOn: false, year: null, municipality: 'All', advanced: false
  };

  // =====================================================================
  // small shared pieces
  // =====================================================================
  function card(title, note, opts) {
    const o = opts || {};
    const d = document.createElement('div');
    d.className = 'card' + (o.cls ? ' ' + o.cls : '');
    d.innerHTML = '<div class="card-h"><h3>' + U.esc(title) + '</h3>' +
      (o.src ? '<button class="src adv" aria-label="Source and methodology">ⓘ</button>' : '') +
      (note ? '<span class="note">' + U.esc(note) + '</span>' : '') + '</div>' +
      (o.legend ? '<div class="legend">' + o.legend + '</div>' : '') +
      '<div class="card-b"></div>';
    if (o.src) $('.src', d).addEventListener('click', o.src);
    return d;
  }

  function put(host, node) { host.appendChild(node); return $('.card-b', node); }

  /** A compact marker beside a figure. Never a paragraph. */
  function caveat(text, kpiId, kind) {
    return '<button class="caveat' + (kind ? ' ' + kind : '') + '" data-caveat="' +
      U.esc(kpiId || '') + '">' + U.esc(text) + '</button>';
  }

  function wireCaveats(host, sourceId) {
    $$('.caveat', host).forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.dataset.caveat;
        if (id) U.sourceDrawer(DA.getProvenance(id, sourceId || 'BQK_RAPORT_MUJOR', {}));
      });
    });
  }

  function wireKpis(host, ctx) {
    $$('.kpi', host).forEach(function (el) {
      const id = el.dataset.kpi, btn = $('.src', el);
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
    wireCaveats(host, ctx.sourceId);
  }

  function statusBadge(kpiId) {
    const s = DA.getKpiStatus(kpiId);
    return s && s.status !== 'PASS' ? s.status : null;
  }

  function defRows(def, period) {
    return [['Period', U.monthLabel(period)], ['Series', def.metric_name],
            ['Universe', def.universe], ['Source', def.institution]];
  }

  function sourceIdFor(defKey) {
    return defKey === 'pos_rm_allcards' ? 'BQK_RAPORT_MUJOR' : 'BQK_T15';
  }

  function head(p) {
    return '<header class="page-head"><h1>' + U.esc(p.title) + '</h1>' +
      '<p class="q">' + U.esc(p.q) + '</p></header>';
  }

  function section(title, sub) {
    return '<section class="sec"><div class="sec-head"><h2>' + U.esc(title) + '</h2>' +
      (sub ? '<span class="sub">' + U.esc(sub) + '</span>' : '') + '</div>';
  }

  function disclosure(summary, bodyHtml) {
    return '<details class="more"><summary>' + U.esc(summary) + '</summary>' +
      '<div class="body">' + bodyHtml + '</div></details>';
  }

  // =====================================================================
  // 01 — HOME
  // =====================================================================
  function renderHome() {
    const host = $('#page-home');
    const def = DA.getDefinition(state.definition);
    const ov = DA.getExecutiveOverview(state.definition, state.period);
    const sig = ov && ov.signal;
    if (!ov || !ov.current) {
      host.innerHTML = U.emptyState('No data', 'This series has no observations.');
      return;
    }
    const cur = ov.current;
    const srcId = sourceIdFor(state.definition);
    const lead = sig && sig.usage_minus_infra_pp > 0;

    const cash = DA.getCashPool();
    const cmix = DA.getCardMix();
    const cap = DA.getRetailCapture();
    const bm = DA.getBenchmarks();
    const hr = DA.getHeadroom();

    let h = '';

    // ---- lead with the thesis: the shift is real, and most of it is still ahead
    const pen = DA.getPenetration();
    if (pen || cash) {
      const L = cash && cash.latest;
      h += '<section class="home-hero">' +
        '<span class="label">Kosovo payments · ' +
        (pen ? pen.first.year + '–' + pen.latest.year : U.monthLabel(L.year_month)) +
        '</span>' +
        '<h1>' + (pen
          ? 'Cards are winning — and ' + U.pct(pen.still_elsewhere, 0) +
            ' of the economy is still up for it'
          : U.money(cash.annualised_cash_pool) + ' a year is still withdrawn as cash') +
        '</h1>';

      if (pen) {
        h += '<p class="lede">The declared economy grew <strong>' +
          pen.economy_multiple.toFixed(2) + '×</strong> in ' + pen.years +
          ' years. Card value grew <strong>' + pen.card_multiple.toFixed(2) +
          '×</strong>. Penetration doubled from ' + U.pct(pen.penetration_first, 2) +
          ' to <strong>' + U.pct(pen.penetration_latest, 2) + '</strong> of turnover' +
          (cash ? ', yet <strong>' + U.money(cash.annualised_cash_pool) +
                  '</strong> a year still leaves ATMs' : '') +
          '. Demand is compounding on its own; what limits it is where a card can be ' +
          'used and what each payment earns.</p>';
      }

      h += '<div class="home-figs">' +
        (pen ? fig(U.pct(pen.penetration_latest, 2), 'of declared turnover on card, ' +
                   pen.latest.year, true) : '') +
        (pen ? fig('+' + (pen.card_cagr * 100).toFixed(0) + '% / +' +
                   (pen.economy_cagr * 100).toFixed(0) + '%', 'card value against economy, a year') : '') +
        (cash ? fig(U.money(cash.value_of_one_point), 'a year per point moved from cash') : '') +
        (bm ? fig(U.pct(bm.levels[1].index, 0), 'of euro-area terminal density') : '') +
        '</div>' +
        '<div class="home-meta"><span>ATK · BQK · ASK · ECB</span>' +
        '<span>·</span><span>Latest ' + U.monthLabel(cur.year_month) + '</span>' +
        '<span>·</span><button id="home-src">How this is measured</button></div>' +
        '</section>';
    }

    // ---- the levers, each sized
    h += '<div class="paths">' +
      path('02', 'Penetration',
        pen ? U.pct(pen.penetration_first, 2) + ' of turnover settled on card in ' +
              pen.first.year + '; ' + U.pct(pen.penetration_latest, 2) + ' in ' +
              pen.latest.year + '. The one series that needs all three institutions.'
            : 'How much of the economy settles on a card.', 'penetration') +
      path('03', 'Cash & capture',
        cash ? 'A ' + U.money(cash.annualised_cash_pool) + ' pool, and cards are ' +
               'outgrowing retail trade by ' + (cap ? U.pp(cap.gap_pp) : 'a wide margin') + '.'
             : 'How much spending is still settled in cash.', 'pool') +
      path('04', 'Mix & margin',
        cmix ? 'Credit share has moved ' +
               U.pp(cmix.latest.credit_share_count - cmix.first.credit_share_count) +
               ' — composition shifts margin even when volume grows.'
             : 'Credit against debit, contactless, and the emerging channels.', 'mix') +
      path('05', 'Coverage',
        hr && hr.rows.filter(function (r) { return r.terminals_to_median; }).length
          ? 'Three cities sit below peer density; the shortfall is about ' +
            hr.rows.reduce(function (a, r) { return a + (r.terminals_to_median || 0); }, 0) +
            ' terminals.'
          : 'Where acceptance sits against the local economy.', 'coverage') +
      path('06', 'Position',
        bm ? 'Kosovo runs at ' + U.pct(bm.levels[0].index, 0) + ' of euro-area usage per ' +
             'person and is growing several times faster.'
           : 'Kosovo against the euro area.', 'position') +
      path('07', 'What this means',
        'The evidence in order, and the conclusion it supports.', 'conclusion') +
      '</div>';

    // ---- what public data cannot price
    h += '<div class="notice" style="border-left-color:var(--purple)">' +
      '<h5>What this sizes, and what it does not</h5>' +
      '<p>Everything here measures the <strong>opportunity</strong>: how large each pool ' +
      'is, which way it is moving, and where acceptance lags the economy. It does not ' +
      'price it. Merchant service charges, interchange, scheme and processing fees and ' +
      'terminal-level activity are not published by anyone, so no revenue or profit ' +
      'figure appears in this report. Those require internal data.</p></div>';

    // ---- essential KPIs only
    h += '<div class="kpis">' +
      U.kpiTile({ id: 'pos_transaction_count', label: 'Transactions', value: cur.tx_count,
        display: U.compact(cur.tx_count), exact: U.exact(cur.tx_count), source: true,
        foot: U.deltaSpan(cur.tx_yoy) + ' year on year' }) +
      U.kpiTile({ id: 'pos_transaction_value', label: 'Value', value: cur.tx_value,
        display: U.money(cur.tx_value), exact: U.exactMoney(cur.tx_value), source: true,
        foot: U.deltaSpan(cur.value_yoy) + ' year on year' }) +
      U.kpiTile({ id: 'pos_terminals', label: 'POS terminals', value: cur.terminal_stock,
        display: U.compact(cur.terminal_stock), exact: U.exact(cur.terminal_stock),
        source: true, unavailable: 'Not published for this series',
        foot: U.isNil(cur.terminal_stock) ? '' : U.deltaSpan(cur.pos_yoy) + ' year on year' }) +
      U.kpiTile({ id: 'average_ticket', label: 'Average payment', value: cur.avg_ticket,
        display: cur.avg_ticket ? '€' + cur.avg_ticket.toFixed(2) : null,
        exact: U.exactMoney(cur.avg_ticket), source: true, foot: 'value ÷ transactions' }) +
      '</div>';

    // ---- pulse
    const pulse = DA.getMarketPulse(state.definition);
    if (pulse.length) {
      h += '<div class="pulse"><div class="pulse-h">' +
        '<span class="label label-gold">What moved</span>' +
        '<span style="font-size:11.5px;color:var(--ink-3)">' + sig.months +
        ' months, against the same months a year earlier</span></div>' +
        pulse.map(function (p) {
          return '<div class="pulse-item ' + p.dir + '"><span class="arrow">' +
            (p.dir === 'up' ? '↑' : p.dir === 'down' ? '↓' : '→') + '</span>' +
            '<span class="txt">' + U.esc(p.text) + '</span>' +
            '<span class="val">' + U.esc(p.value) + '</span></div>';
        }).join('') + '</div>';
    }

    host.innerHTML = h;

    $$('.path', host).forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.go); });
    });
    $('#home-src', host).addEventListener('click', function () {
      U.sourceDrawer(DA.getProvenance('transactions_per_average_pos', srcId, {
        title: 'How the market signal is measured',
        period: sig ? sig.months + ' months to ' + U.monthLabel(sig.through) : null,
        comparison: 'The complete months of the latest year against the same calendar ' +
                    'months a year earlier. A part-year is never compared with a full year.',
        universe: def.universe }));
    });
    wireKpis(host, { sourceId: srcId, period: cur.year_month, universe: def.universe,
                     rows: defRows(def, cur.year_month) });
    countUpBand(host);
  }

  function fig(v, k, lead) {
    if (!v) return '';
    return '<div class="home-fig' + (lead ? ' lead' : '') + '"><div class="v">' + U.esc(v) +
      '</div><div class="k">' + U.esc(k) + '</div></div>';
  }
  function path(n, title, body, go) {
    return '<button class="path" data-go="' + go + '"><span class="n">' + n + '</span>' +
      '<h3>' + U.esc(title) + '</h3><p>' + U.esc(body) + '</p>' +
      '<span class="go">Open →</span></button>';
  }
  function countUpBand(host) {
    $$('.kpi .v', host).forEach(function (v) {
      const m = v.textContent.match(/^€?(-?[\d.]+)(bn|m|K)?$/);
      if (!m) return;
      const pre = v.textContent.charAt(0) === '€' ? '€' : '', suf = m[2] || '';
      const dec = (m[1].split('.')[1] || '').length;
      U.countUp(v, parseFloat(m[1]), function (x) { return pre + x.toFixed(dec) + suf; });
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
      const tot = ORDER.reduce(function (a, k) {
        const x = row.channels[k]; return a + ((x && x[field]) || 0); }, 0);
      return ORDER.map(function (c) {
        const v = row.channels[c];
        return { label: c, value: (v && v[field]) || 0,
          color: c === 'POS' ? C.colors.purple
               : c.indexOf('ATM') === 0 ? C.colors.neg : C.colors.purpleSoft,
          tip: function () {
            return { name: c,
              value: field === 'value' ? U.exactMoney((v && v[field]) || 0)
                                       : U.exact((v && v[field]) || 0),
              rows: [['Period', U.monthLabel(row.year_month)],
                     ['Share', U.pct(((v && v[field]) || 0) / tot)],
                     ['Measure', field === 'value' ? 'Value (EUR)' : 'Count'],
                     ['Source', 'BQK Raport Mujor']] };
          } };
      }).filter(function (i) { return i.value > 0; })
        .sort(function (x, y) { return y.value - x.value; });
    }

    const p = PAGE.payments;
    let h = head(p);

    h += '<div class="grid2" id="pb-mix"></div>';

    h += section('Frequency is not value',
      'POS carries the most payments; cash still carries the most money.') +
      '<div class="grid2" id="pb-freq"></div></section>';

    h += section('The card estate', 'What the market carries in its wallets.') +
      '<div class="grid2" id="pb-cards"></div></section>';

    h += disclosure('Why these charts end on different months',
      '<p>Three BQK publications feed this page and they do not end together. Terminal ' +
      'channels run to <strong>' + U.monthLabel(last.year_month) + '</strong>. The instrument ' +
      'breakdown carrying e-commerce and digital wallet ends earlier — counts to <strong>' +
      U.monthLabel(countRow.year_month) + '</strong>, values to <strong>' +
      U.monthLabel(valueRow ? valueRow.year_month : null) + '</strong>.</p>' +
      '<p>Each chart is pinned to the last month its own source actually covers and says so ' +
      'in its header. None is extended forward to make the page look tidier.</p>') +
      '<div class="adv">' + disclosure('Transaction value bands are not available',
      '<p>A €0–20 / €21–50 / €51–100 / €101–200 / &gt;€200 split is not published by BQK in ' +
      'any source reviewed, so it is absent rather than estimated. Average payment on the ' +
      'overview is the closest supported measure.</p>') + '</div>';

    host.innerHTML = h;

    const mixHost = $('#pb-mix', host);
    put(mixHost, card('Payments by channel', 'count · ' + U.monthLabel(countRow.year_month)))
      .appendChild(C.hbars(series(countRow, 'count'), { fmt: C.short }));
    const vb = put(mixHost, card('Value by channel',
      valueRow ? 'EUR · ' + U.monthLabel(valueRow.year_month) : 'not yet published'));
    if (valueRow) vb.appendChild(C.hbars(series(valueRow, 'value'),
      { fmt: function (v) { return '€' + C.short(v); } }));
    else vb.innerHTML = U.emptyState('Not publicly available',
      'The instrument value series has not been published for a month this recent.');

    const freq = $('#pb-freq', host);
    const s2 = mix.filter(function (m) { return m.channels['POS']; }).map(function (m) {
      return { year_month: m.year_month,
        pos: m.channels['POS'] ? m.channels['POS'].count : null,
        atm: m.channels['ATM Withdrawal'] ? m.channels['ATM Withdrawal'].count : null };
    });
    put(freq, card('POS against ATM withdrawals', 'transactions per month', {
      legend: '<span><i style="background:' + C.colors.purple + '"></i>POS payments</span>' +
              '<span><i style="background:' + C.colors.neg + '"></i>ATM withdrawals</span>' }))
      .appendChild(C.line(s2, {
        series: [{ key: 'pos', color: C.colors.purple, fill: true },
                 { key: 'atm', color: C.colors.neg }],
        labelEvery: 4, hover: function (r) {
          return { name: U.monthLabel(r.year_month), value: U.exact(r.pos) + ' POS',
            delta: U.exact(r.atm) + ' ATM withdrawals',
            rows: [['Measure', 'Transaction count'], ['Source', 'BQK Raport Mujor']] }; } }));

    const vrow = mix.slice().reverse().filter(function (m) {
      return m.channels['POS'] && !U.isNil(m.channels['POS'].value); })[0] || last;
    put(freq, card('Where the money moves', 'EUR · ' + U.monthLabel(vrow.year_month)))
      .appendChild(C.hbars(['POS', 'ATM Withdrawal', 'ATM Deposit'].map(function (c) {
        const v = vrow.channels[c];
        return { label: c, value: (v && v.value) || 0,
          color: c === 'POS' ? C.colors.purple : C.colors.neg };
      }).filter(function (i) { return i.value > 0; }),
      { fmt: function (v) { return '€' + C.short(v); } }));

    const cards = b.cards, lc = cards[cards.length - 1];
    const ch = $('#pb-cards', host);
    put(ch, card('Card composition', U.monthLabel(lc.year_month), {
      src: function () { U.sourceDrawer(DA.getProvenance('cards_issued', 'BQK_RAPORT_MUJOR', {})); } }))
      .appendChild(C.hbars([
        { label: 'Contactless', value: lc['Contactless'] },
        { label: 'Contact only', value: lc['Contact'] },
        { label: 'Debit', value: lc['Debit'] },
        { label: 'Credit', value: lc['Credit'] },
        { label: 'Visa', value: lc['Visa'] },
        { label: 'Mastercard', value: lc['Mastercard'] }
      ], { fmt: C.short }));

    put(ch, card('Contactless adoption', 'share of all valid cards'))
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
  // 03 — POS NETWORK  (trend + geography)
  // =====================================================================
  function renderNetwork() {
    const host = $('#page-network');
    const def = DA.getDefinition(state.definition);
    const ov = DA.getExecutiveOverview(state.definition, state.period);
    const trend = DA.getPOSMarketTrend(state.definition);
    const geo = DA.getGeographicFootprint();
    const sig = ov && ov.signal;
    const cur = ov && ov.current;
    const srcId = sourceIdFor(state.definition);
    const hasStock = cur && !U.isNil(cur.terminal_stock);
    const p = PAGE.network;

    let h = head(p);

    h += '<div class="kpis">' +
      U.kpiTile({ id: 'pos_terminals', label: 'POS terminals', value: cur.terminal_stock,
        display: U.compact(cur.terminal_stock), exact: U.exact(cur.terminal_stock),
        source: true, unavailable: 'Not published for this series',
        foot: hasStock ? U.deltaSpan(cur.pos_yoy) + ' year on year' : '' }) +
      U.kpiTile({ label: 'Merchants', value: cur.merchants, display: U.compact(cur.merchants),
        exact: U.exact(cur.merchants), foot: 'accepting cards, physical' }) +
      U.kpiTile({ id: 'transactions_per_average_pos', label: 'Payments per terminal',
        value: cur.tx_per_avg_pos,
        display: cur.tx_per_avg_pos ? U.G.format(Math.round(cur.tx_per_avg_pos)) : null,
        exact: cur.tx_per_avg_pos ? U.G2.format(cur.tx_per_avg_pos) : null, source: true,
        unavailable: 'Needs a matching terminal series',
        foot: 'per month, on the 12-month average network' }) +
      U.kpiTile({ id: 'value_per_average_pos', label: 'Value per terminal',
        value: cur.value_per_avg_pos, display: U.money(cur.value_per_avg_pos),
        exact: U.exactMoney(cur.value_per_avg_pos), source: true,
        unavailable: 'Needs a matching terminal series', foot: 'per month' }) +
      '</div>';

    // advanced-only: the second productivity variant, kept out of the simple view
    h += '<div class="adv kpis" style="margin-top:-8px">' +
      U.kpiTile({ id: 'transactions_per_end_period_pos', label: 'Payments per terminal (closing)',
        value: cur.tx_per_end_pos,
        display: cur.tx_per_end_pos ? U.G.format(Math.round(cur.tx_per_end_pos)) : null,
        exact: cur.tx_per_end_pos ? U.G2.format(cur.tx_per_end_pos) : null, source: true,
        badge: statusBadge('transactions_per_end_period_pos'),
        unavailable: 'Needs a matching terminal series',
        foot: 'closing stock — understates while the network grows' }) +
      '</div>';

    h += section('How the network has grown', 'Stock at month end, and the activity it carries.') +
      '<div class="grid2" id="nw-trend"></div></section>';

    if (hasStock) {
      h += section('Productivity', 'Payments per terminal, and the ticket behind them.') +
        '<div class="grid2" id="nw-prod"></div></section>';
    }

    // ---- geography, with its qualification attached rather than prefaced
    h += section('Where the network is',
      'The only geography BQK publishes: seven cities, once a year.') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
      caveat('Estimated from an annual chart', 'pos_per_1000_taxpayers', 'est') +
      caveat('6 of 7 city pairings unverified', 'pos_per_1000_taxpayers') +
      '</div>' +
      '<div class="grid2" id="nw-geo"></div>' +
      disclosure('What the city figures can and cannot show',
        '<p>BQK names seven cities, annually, as percentages inside a chart in the annual ' +
        'report. Terminal counts here are <strong>estimated</strong> as that share of the ' +
        '2024 national total of 20,913. The legend-to-value pairing is confirmed only for ' +
        'Prishtinë, whose 50.2% share of transaction value matches the report text; the ' +
        'other six are flagged until someone checks them against Figure 4.</p>' +
        '<p>The transaction figures published by city combine <strong>ATM and POS</strong>. ' +
        'They are labelled that way and no POS-only productivity is derived from them — ' +
        'that measure is blocked, not approximated.</p>') +
      '</section>';

    host.innerHTML = h;
    wireKpis(host, { sourceId: srcId, period: cur.year_month, universe: def.universe,
                     rows: defRows(def, cur.year_month) });

    const tr = $('#nw-trend', host);
    if (hasStock) {
      put(tr, card('Terminals', 'month end · ' + U.monthLabel(trend[0].year_month) + ' → ' +
        U.monthLabel(cur.year_month), {
        src: function () { U.sourceDrawer(DA.getProvenance('pos_terminals', srcId,
          { universe: def.universe })); } }))
        .appendChild(C.line(trend, {
          series: [{ key: 'terminal_stock', color: C.colors.purpleSoft, fill: true }],
          labelEvery: 4, hover: function (r) {
            return { name: 'POS terminals', value: U.exact(r.terminal_stock),
              delta: r.pos_yoy ? U.signedPct(r.pos_yoy) + ' YoY' : null,
              rows: defRows(def, r.year_month) }; } }));
    } else {
      tr.innerHTML = U.emptyState('Terminal series not available for this BQK series',
        def.limitations || '');
    }

    put(tr, card('Transactions', 'per month', {
      src: function () { U.sourceDrawer(DA.getProvenance('pos_transaction_count', srcId,
        { universe: def.universe })); } }))
      .appendChild(C.line(trend, {
        series: [{ key: 'tx_count', color: C.colors.purple, fill: true }],
        labelEvery: trend.length > 40 ? 12 : 4, hover: function (r) {
          return { name: 'POS transactions', value: U.exact(r.tx_count),
            delta: r.tx_yoy ? U.signedPct(r.tx_yoy) + ' YoY' : null,
            rows: defRows(def, r.year_month) }; } }));

    if (hasStock) {
      const pr = $('#nw-prod', host);
      put(pr, card('Payments per terminal', '12-month average network', {
        src: function () { U.sourceDrawer(DA.getProvenance('transactions_per_average_pos',
          srcId, { universe: def.universe })); } }))
        .appendChild(C.line(trend, {
          series: [{ key: 'tx_per_avg_pos', color: C.colors.pos, fill: true }],
          labelEvery: 4, yFmt: function (v) { return U.G.format(Math.round(v)); },
          hover: function (r) {
            return { name: 'Payments per terminal',
              value: r.tx_per_avg_pos ? U.G2.format(r.tx_per_avg_pos) : 'Not available',
              rows: defRows(def, r.year_month)
                .concat([['Denominator', '12-month average stock']]) }; } }));
      put(pr, card('Average payment', 'EUR per transaction', {
        src: function () { U.sourceDrawer(DA.getProvenance('average_ticket', srcId,
          { universe: def.universe })); } }))
        .appendChild(C.line(trend, {
          series: [{ key: 'avg_ticket', color: C.colors.neg, fill: true }],
          labelEvery: 4, yFmt: function (v) { return '€' + v.toFixed(1); },
          hover: function (r) {
            return { name: 'Average payment', value: U.exactMoney(r.avg_ticket),
              rows: defRows(def, r.year_month) }; } }));

      if (sig && !U.isNil(sig.infrastructure_growth)) {
        const adv = document.createElement('div');
        adv.className = 'adv';
        adv.style.marginTop = '12px';
        pr.parentNode.parentNode.appendChild(adv);
        const gc = card('Growth decomposition', U.monthRange(
          sig.compare_from.slice(0, 4) + '-01', sig.through) + ' vs prior year');
        adv.appendChild(gc);
        $('.card-b', gc).appendChild(C.bars([
          { label: 'Terminals', value: sig.infrastructure_growth, color: C.colors.purpleSoft },
          { label: 'Transactions', value: sig.usage_growth, color: C.colors.purple },
          { label: 'Value', value: sig.value_growth, color: C.colors.purpleSoft },
          { label: 'Per terminal', value: sig.productivity_growth, color: C.colors.pos },
          { label: 'Ticket', value: sig.average_ticket_growth, color: C.colors.neg }
        ], { h: 230 }));
      }
    }

    // compare mode
    if (state.compareOn && state.comparePeriod && cur) {
      const cmp = DA.compare(state.definition, cur.year_month, state.comparePeriod);
      const wrap = document.createElement('section');
      wrap.className = 'sec adv';
      wrap.innerHTML = '<div class="sec-head"><h2>' + U.monthLabel(cur.year_month) +
        ' against ' + U.monthLabel(state.comparePeriod) + '</h2></div>';
      host.appendChild(wrap);
      if (cmp) {
        const cc = card('Period comparison', 'same series both sides');
        wrap.appendChild(cc);
        $('.card-b', cc).appendChild(C.dumbbell([
          { label: 'POS terminals', a: cmp.b.terminal_stock, b: cmp.a.terminal_stock },
          { label: 'Transactions', a: cmp.b.tx_count, b: cmp.a.tx_count },
          { label: 'Value (EUR)', a: cmp.b.tx_value, b: cmp.a.tx_value },
          { label: 'Per terminal', a: cmp.b.tx_per_avg_pos, b: cmp.a.tx_per_avg_pos },
          { label: 'Average payment', a: cmp.b.avg_ticket, b: cmp.a.avg_ticket }
        ], { fmt: C.short }));
      } else {
        wrap.innerHTML += U.emptyState('Not comparable',
          'One of the selected months has no observation on this series.');
      }
    }

    // geography
    const gh = $('#nw-geo', host);
    put(gh, card('Share of the network', '2024 · estimated'))
      .appendChild(C.hbars(geo.map(function (g) {
        return { label: g.city, value: g.pos_share_pct, tip: function () {
          return { name: g.city, value: g.pos_share_pct.toFixed(2) + '%',
            delta: U.exact(g.pos_terminals) + ' terminals (estimated)',
            rows: [['Grain', 'City'], ['Year', '2024'],
                   ['Method', 'Share × national total'],
                   ['Pairing', g.pairing_verified ? 'Verified' : 'Unverified'],
                   ['Source', 'BQK annual report, Figure 4']] }; } };
      }), { fmt: function (v) { return v.toFixed(1) + '%'; } }));

    const gt = put(gh, card('ATM + POS transactions', 'combined · 2024'));
    gt.appendChild(C.hbars(geo.slice().sort(function (a, b) {
      return b.atm_pos_tx_count - a.atm_pos_tx_count; }).map(function (g) {
      return { label: g.city, value: g.atm_pos_tx_count, color: C.colors.neg,
        tip: function () {
          return { name: g.city, value: U.exact(g.atm_pos_tx_count),
            delta: U.exactMoney(g.atm_pos_tx_value),
            rows: [['Measure', 'ATM AND POS combined'], ['Year', '2024'],
                   ['Source', 'BQK annual report, Figures 26–27']] }; } };
    }), { fmt: C.short }));

    U.observeReveals(host);
  }

  // =====================================================================
  // 05 — DATA QUALITY
  // =====================================================================
  function renderQuality() {
    const host = $('#page-quality');
    const st = DA.getDataStatus();
    const groups = {};
    st.checks.forEach(function (c) { (groups[c.check_group] = groups[c.check_group] || []).push(c); });
    const p = PAGE.quality;

    let h = head(p);

    h += '<div class="kpis">' +
      U.kpiTile({ label: 'Controls passed', value: st.passed,
        display: st.passed + ' / ' + (st.passed + st.failed), foot: 'automated checks' }) +
      U.kpiTile({ label: 'Open findings', value: st.failed, display: String(st.failed),
        foot: st.high + ' high severity' }) +
      U.kpiTile({ label: 'Measures blocked', value: st.blocked, display: String(st.blocked),
        foot: st.warnings + ' carry a warning' }) +
      U.kpiTile({ label: 'Latest data', value: st.meta.bqk_latest,
        display: U.monthLabel(st.meta.bqk_latest), small: true,
        foot: 'ATK ' + U.monthLabel(st.meta.atk_latest) + ', ' +
              st.meta.atk_bqk_lag_months + ' months behind' }) +
      '</div>';

    h += '<div class="empty" style="text-align:left;border-style:solid;background:var(--surface)">' +
      '<div class="t">Findings are reported, not smoothed</div>' +
      '<div class="d" style="max-width:none">Every control below that fails describes a ' +
      'property of the official source, not a defect we introduced. None is corrected ' +
      'silently, and the measures they affect are marked wherever they appear.</div></div>';

    h += section('What each measure is allowed to show', 'Derived from what the inputs support') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Measure</th>' +
      '<th>Status</th><th>Reason</th><th class="adv">Required to lift</th></tr></thead><tbody>' +
      st.kpiStatus.slice().sort(function (a, b) {
        const r = { BLOCKED: 0, FAIL: 1, WARNING: 2, PASS: 3 };
        return r[a.status] - r[b.status];
      }).map(function (s) {
        return '<tr><td class="strong">' + U.esc(s.kpi_id.replace(/_/g, ' ')) + '</td>' +
          '<td><span class="badge ' + s.status + '">' + s.status + '</span></td>' +
          '<td>' + U.esc(s.reason) + '</td>' +
          '<td class="adv" style="color:var(--ink-3)">' + U.esc(s.required_input || '—') +
          '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    h += section('Controls', 'Grouped by what they test');
    Object.keys(groups).sort().forEach(function (g) {
      const rows = groups[g];
      const bad = rows.filter(function (r) { return r.status === 'failed'; }).length;
      h += '<details class="more"' + (bad ? ' open' : '') + '><summary>' +
        U.esc(g) + ' — ' + (rows.length - bad) + ' of ' + rows.length + ' passed' +
        '</summary><div class="body" style="padding:0"><div class="tbl-wrap"><table>' +
        '<thead><tr><th>Check</th><th>Severity</th><th>Finding</th>' +
        '<th class="n adv">Variance</th></tr></thead><tbody>' +
        rows.map(function (c) {
          const cls = c.status === 'passed' ? 'PASS' : c.severity === 'high' ? 'FAIL' : 'WARNING';
          return '<tr><td>' + U.esc(c.check_type.replace(/_/g, ' ')) + '</td>' +
            '<td><span class="badge ' + cls + '">' +
            (c.status === 'passed' ? 'pass' : U.esc(c.severity)) + '</span></td>' +
            '<td>' + U.esc(c.message) + '</td>' +
            '<td class="n adv">' + (U.isNil(c.variance_percent) ? '—' :
              c.variance_percent.toFixed(2) + '%') + '</td></tr>';
        }).join('') + '</tbody></table></div></div></details>';
    });
    h += '</section>';

    // reconciliation — where the ~15% cross-series difference lives
    if (st.reconciliation.length) {
      const byCls = {};
      st.reconciliation.forEach(function (r) {
        (byCls[r.classification] = byCls[r.classification] || []).push(r); });
      h += section('Cross-source reconciliation',
        'Where two official series describe a similar measure') +
        '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Measure</th>' +
        '<th>Classification</th><th class="n">Observations</th>' +
        '<th class="n">Mean difference</th><th>What it means</th></tr></thead><tbody>' +
        Object.keys(byCls).map(function (k) {
          const rs = byCls[k];
          const mean = rs.reduce(function (a, r) { return a + (r.pct_difference || 0); }, 0) / rs.length;
          return '<tr><td class="strong">' + U.esc(rs[0].metric) + '</td>' +
            '<td><span class="badge ' + (k === 'MATCH' ? 'PASS' :
              k === 'NOT_COMPARABLE' ? 'BLOCKED' : 'WARNING') + '">' +
            U.esc(k.replace(/_/g, ' ')) + '</span></td>' +
            '<td class="n">' + rs.length + '</td>' +
            '<td class="n">' + mean.toFixed(2) + '%</td>' +
            '<td>' + U.esc(rs[0].note) + '</td></tr>';
        }).join('') + '</tbody></table></div></div></section>';
    }

    h += '<div class="adv">' + section('Historical coverage',
      'Whether a year-on-year comparison is possible at all') +
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
      }).join('') + '</tbody></table></div></div></section>' +

      section('Source files', 'Which exact file produced each figure') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Institution</th>' +
      '<th>Dataset</th><th>File</th><th class="n">Size</th><th>SHA-256</th>' +
      '</tr></thead><tbody>' + st.versions.map(function (v) {
        const s = st.sources.filter(function (x) { return x.source_id === v.source_id; })[0] || {};
        return '<tr><td class="strong">' + U.esc(s.institution) + '</td>' +
          '<td><a href="' + U.esc(s.source_url) + '" target="_blank" rel="noopener">' +
          U.esc(s.dataset_name) + '</a></td>' +
          '<td style="font-family:var(--mono);font-size:11px">' +
          U.esc(v.original_filename || v.source_table || '—') + '</td>' +
          '<td class="n">' + (v.file_size ? Math.round(v.file_size / 1024) + ' KB' : '—') + '</td>' +
          '<td style="font-family:var(--mono);font-size:10.5px;color:var(--ink-3)">' +
          U.esc(v.sha256_hash ? v.sha256_hash.slice(0, 16) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section></div>';

    host.innerHTML = h;
  }

  // =====================================================================
  // 06 — METHODOLOGY
  // =====================================================================
  function renderMethod() {
    const host = $('#page-method');
    const kpis = DA.getMethodology();
    const defs = DA.getDefinitions();
    const meta = DA.meta();
    const p = PAGE.method;

    let h = head(p);

    h += section('The three BQK series',
      'They differ by up to 43%, and are never combined') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Series</th>' +
      '<th class="adv">Perspective</th><th class="adv">Card origin</th><th>Covers</th>' +
      '<th>Limitations</th></tr></thead><tbody>' + defs.map(function (d) {
        return '<tr><td class="strong">' + U.esc(d.metric_name) +
          (d.is_default ? ' <span class="badge purple">Default</span>' : '') + '</td>' +
          '<td class="adv">' + U.esc(d.perspective) + '</td>' +
          '<td class="adv">' + U.esc(d.card_origin) + '</td>' +
          '<td>' + U.esc(d.universe) + '</td>' +
          '<td>' + U.esc(d.limitations) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    h += section('Every measure and its formula', 'Click a row for full provenance') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Measure</th>' +
      '<th>Status</th><th>Formula</th><th class="adv">Aggregation</th>' +
      '<th class="adv">Valid comparison</th></tr></thead><tbody>' +
      kpis.map(function (k) {
        return '<tr class="clickable" data-kpi="' + U.esc(k.kpi_id) + '">' +
          '<td class="strong">' + U.esc(k.display_name) + '</td>' +
          '<td><span class="badge ' + (k.status || 'PASS') + '">' +
          U.esc(k.status || 'PASS') + '</span></td>' +
          '<td style="font-family:var(--mono);font-size:11px">' + U.esc(k.sql_formula) + '</td>' +
          '<td class="adv">' + U.esc(k.aggregation_rule) + '</td>' +
          '<td class="adv">' + U.esc(k.valid_comparison_method) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    h += section('Sector classification',
      'Mapping ' + meta.sector_mapping_version + ' — analytical, not an ATK measure') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Sector</th>' +
      '<th>Class</th><th>Reasoning</th><th class="adv">Review</th></tr></thead><tbody>' +
      DA.getSectorDictionary().slice().sort(function (a, b) {
        const r = { HIGH: 0, MEDIUM: 1, REVIEW_REQUIRED: 2, LOW: 3 };
        return r[a.addressability_class] - r[b.addressability_class];
      }).map(function (s) {
        return '<tr><td class="strong">' + U.esc(s.standardized_sector) + '</td>' +
          '<td><span class="badge ' + s.addressability_class + '">' +
          U.esc(s.addressability_class.replace(/_/g, ' ')) + '</span></td>' +
          '<td>' + U.esc(s.rationale) + '</td>' +
          '<td class="adv" style="color:var(--ink-3)">' + U.esc(s.review_status) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section>';

    h += section('What this cannot answer', '') +
      '<div class="card"><div class="card-b" style="padding-top:20px">' +
      '<p style="font-size:13.5px;color:var(--ink-2);max-width:88ch;line-height:1.65">' +
      'No BQK, ATK or ASK publication splits POS terminals, cards, merchants or ' +
      'transactions by bank. The bank layer on the Fair share page comes from a KBA ' +
      'extract supplied to this project rather than downloaded, which is why it carries ' +
      'no file hash and no period label, and why nothing built on it is divided against ' +
      'a BQK total. Transaction leakage and on-us versus off-us activity stay out of ' +
      'reach: no source separates them. Merchant service charges, interchange, scheme ' +
      'fees and terminal economics appear in no public source at all, so nothing here ' +
      'prices a transaction.</p>' +
      '<p style="font-size:13.5px;color:var(--ink-2);max-width:88ch;line-height:1.65;' +
      'margin-top:14px">The data model reserves those tables against the same date, ' +
      'geography, sector and channel dimensions, so they can be added later without ' +
      'reshaping anything here.</p>' +
      '</div></div></section>';

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
  const OPS = window.OpsPages || {};
  const RENDER = {
    home: renderHome,
    penetration: function () { OPS.renderPenetration($('#page-penetration'), state); },
    conclusion: function () { OPS.renderConclusion($('#page-conclusion'), state); },
    pool: function () { OPS.renderPool($('#page-pool'), state); },
    mix: function () { OPS.renderMix($('#page-mix'), state); },
    coverage: function () { OPS.renderCoverage($('#page-coverage'), state); },
    position: function () { OPS.renderPosition($('#page-position'), state); },
    fairshare: function () { OPS.renderFairShare($('#page-fairshare'), state); },
    demand: function () { OPS.renderDemand($('#page-demand'), state); },
    network: renderNetwork,
    payments: renderPayments,
    quality: renderQuality,
    method: renderMethod
  };

  function show(id) {
    if (!PAGE[id]) return;
    state.page = id;
    $$('.page').forEach(function (s) { s.classList.toggle('active', s.id === 'page-' + id); });
    $$('.rail-nav button').forEach(function (b) {
      if (b.dataset.page === id) {
        b.setAttribute('aria-current', 'page');
        // On narrow screens the rail scrolls horizontally; keep the active
        // item in view rather than leaving it off the edge.
        if (b.scrollIntoView && window.innerWidth <= 900) {
          b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        }
      } else {
        b.removeAttribute('aria-current');
      }
    });
    syncFilters();
    RENDER[id]();
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /** Only the filters the current page actually uses are shown. */
  function syncFilters() {
    const f = PAGE[state.page].filters;
    [['period', '#f-period-wrap'], ['universe', '#f-universe-wrap'],
     ['year', '#f-year-wrap'], ['muni', '#f-muni-wrap']].forEach(function (pair) {
      $(pair[1]).style.display = f.indexOf(pair[0]) >= 0 ? '' : 'none';
    });
    $('#btn-compare').style.display = state.page === 'network' ? '' : 'none';
    $('#toolbar').style.display = f.length || state.page === 'network' ? '' : 'none';
  }

  function fillSelect(el, items, value) {
    el.innerHTML = items.map(function (i) {
      return '<option value="' + U.esc(i.value) + '"' +
        (String(i.value) === String(value) ? ' selected' : '') + '>' +
        U.esc(i.label) + '</option>';
    }).join('');
  }

  function setView(advanced) {
    state.advanced = advanced;
    document.body.classList.toggle('simple', !advanced);
    $('#btn-simple').setAttribute('aria-pressed', String(!advanced));
    $('#btn-advanced').setAttribute('aria-pressed', String(advanced));
    if (!advanced) {
      state.compareOn = false;
      $('#btn-compare').setAttribute('aria-pressed', 'false');
      if (state.definition !== DA.defaultDefinition()) {
        state.definition = DA.defaultDefinition();
        $('#f-universe').value = state.definition;
        state.period = DA.getPeriods(state.definition)[0];
        fillSelect($('#f-period'), DA.getPeriods(state.definition).map(function (p) {
          return { value: p, label: U.monthLabel(p) }; }), state.period);
      }
    }
    RENDER[state.page]();
  }

  function init() {
    if (!DA) throw new Error('Data layer unavailable — the payload did not load.');
    state.definition = DA.defaultDefinition();
    state.period = DA.getPeriods(state.definition)[0];
    state.comparePeriod = DA.getPeriods(state.definition)[12] ||
                          DA.getPeriods(state.definition)[1];
    state.year = DA.atkYears().slice(-1)[0];

    // nav
    PAGES.forEach(function (p) {
      const host = $(p.group === 'primary' ? '#nav-primary' : '#nav-secondary');
      const b = document.createElement('button');
      b.dataset.page = p.id;
      b.innerHTML = '<span class="i">' + p.n + '</span><span>' + U.esc(p.nav) + '</span>';
      b.addEventListener('click', function () { show(p.id); });
      host.appendChild(b);
      const s = document.createElement('section');
      s.className = 'page';
      s.id = 'page-' + p.id;
      $('#canvas').appendChild(s);
    });
    $('#brand').addEventListener('click', function () { show('home'); });

    // filters
    fillSelect($('#f-period'), DA.getPeriods(state.definition).map(function (p) {
      return { value: p, label: U.monthLabel(p) }; }), state.period);
    $('#f-period').addEventListener('change', function (e) {
      state.period = e.target.value; RENDER[state.page]();
    });

    fillSelect($('#f-universe'), DA.getDefinitions().map(function (d) {
      return { value: d.metric_key, label: d.metric_name.replace('POS Transactions — ', '') };
    }), state.definition);
    $('#f-universe').addEventListener('change', function (e) {
      state.definition = e.target.value;
      state.period = DA.getPeriods(state.definition)[0];
      state.comparePeriod = DA.getPeriods(state.definition)[12] ||
                            DA.getPeriods(state.definition)[1];
      fillSelect($('#f-period'), DA.getPeriods(state.definition).map(function (p) {
        return { value: p, label: U.monthLabel(p) }; }), state.period);
      RENDER[state.page]();
    });

    fillSelect($('#f-year'), DA.atkYears().slice().reverse().map(function (y) {
      return { value: y, label: String(y) }; }), state.year);
    $('#f-year').addEventListener('change', function (e) {
      state.year = parseInt(e.target.value, 10);
      fillSelect($('#f-muni'), muniItems(), state.municipality);
      RENDER[state.page]();
    });

    fillSelect($('#f-muni'), muniItems(), state.municipality);
    $('#f-muni').addEventListener('change', function (e) {
      state.municipality = e.target.value; RENDER[state.page]();
    });

    $('#btn-compare').addEventListener('click', function () {
      state.compareOn = !state.compareOn;
      $('#btn-compare').setAttribute('aria-pressed', String(state.compareOn));
      RENDER[state.page]();
    });
    $('#btn-simple').addEventListener('click', function () { setView(false); });
    $('#btn-advanced').addEventListener('click', function () { setView(true); });

    // status
    const st = DA.getDataStatus();
    $('#status-text').textContent = st.failed
      ? st.failed + ' finding' + (st.failed === 1 ? '' : 's') + ' · ' + st.blocked + ' blocked'
      : 'All controls passed';
    if (st.failed) $('#status-dot').classList.add('warn');
    $('#status').addEventListener('click', function () { show('quality'); });

    const start = (location.hash || '').replace('#', '');
    // The summary is the default. The tool is one link away, and the hash
    // remembers which you were in.
    const sumSection = document.createElement('section');
    sumSection.className = 'page active sum';
    sumSection.id = 'page-summary';
    $('#canvas').insertBefore(sumSection, $('#canvas').firstChild);
    if (window.Summary) window.Summary.render(sumSection);

    // On a phone the rail is a horizontal row several screens wide. The CSS
    // draws a fade at whichever edge still has sections behind it; this is
    // what tells it which edge that is. Measured rather than assumed, so a
    // rail that happens to fit shows no fade at all.
    const rail = $('.rail');
    function markRail() {
      const max = rail.scrollWidth - rail.clientWidth;
      rail.dataset.x = max <= 2 ? 'none'
        : rail.scrollLeft <= 1 ? 'start'
        : rail.scrollLeft >= max - 1 ? 'end' : 'middle';
    }
    rail.addEventListener('scroll', markRail, { passive: true });
    window.addEventListener('resize', markRail);

    function enterTool(page) {
      document.body.classList.remove('summary');
      document.body.classList.add('tool');
      sumSection.classList.remove('active');
      show(page || 'home');
      markRail();  // the rail is display:none in summary mode, so it measures 0 there
    }
    function enterSummary() {
      document.body.classList.add('summary');
      document.body.classList.remove('tool');
      $$('.page').forEach(function (p) { p.classList.remove('active'); });
      sumSection.classList.add('active');
      history.replaceState(null, '', '#summary');
      window.scrollTo({ top: 0 });
    }
    window.__enterTool = enterTool;
    window.__enterSummary = enterSummary;
    $('#back-summary').addEventListener('click', enterSummary);

    window.__gotoPage = show;
    if (start && start !== 'summary' && PAGE[start]) enterTool(start);
    else enterSummary();
    setTimeout(function () { $('.boot').classList.add('gone'); }, 100);
  }

  function muniItems() {
    return [{ value: 'All', label: 'All of Kosovo' }].concat(
      DA.getMunicipalityTotals(state.year).map(function (r) {
        return { value: r.municipality, label: r.municipality };
      }).sort(function (a, b) { return a.label.localeCompare(b.label); }));
  }

  document.addEventListener('DOMContentLoaded', function () {
    try { init(); }
    catch (err) {
      if (window.console) console.error('init failed', err);
      if (window.__bootFail) window.__bootFail(err && (err.message || err));
    }
  });
})();
