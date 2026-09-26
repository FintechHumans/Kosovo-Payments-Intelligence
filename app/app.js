/* Kosovo Merchant & Payments Intelligence — Phase 1 front end.

   Reads only through DataAccess. No KPI is derived here; the numbers arrive
   already computed from the curated layer, and this file formats and arranges
   them. Signal sentences are assembled from measured values at render time —
   nothing about the market narrative is written into the source. */
(function () {
  'use strict';

  const DA = window.DataAccess;
  const C = window.Charts;
  const $ = function (s, r) { return (r || document).querySelector(s); };

  const state = {
    page: 'overview',
    definition: DA.defaultDefinition(),
    atkYear: null,
    municipality: 'All',
    sectorFilter: 'all'
  };

  // ---------------------------------------------------------------- format
  const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function n0(v) { return v === null || v === undefined ? '—' : nf0.format(v); }
  function eur(v) { return v === null || v === undefined ? '—' : '€' + C.fmtShort(v); }
  function eur2(v) { return v === null || v === undefined ? '—' : '€' + nf2.format(v); }
  function pct(v, d) {
    if (v === null || v === undefined) return '—';
    return (v * 100).toFixed(d === undefined ? 1 : d) + '%';
  }
  function signed(v, d) {
    if (v === null || v === undefined) return '—';
    const s = (v * 100).toFixed(d === undefined ? 1 : d);
    return (v > 0 ? '+' : '') + s + '%';
  }
  function monthLabel(ym) {
    if (!ym) return '—';
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return M[parseInt(ym.slice(5), 10) - 1] + ' ' + ym.slice(0, 4);
  }
  function deltaEl(v, invert) {
    const cls = v === null || v === undefined ? 'flat'
              : Math.abs(v) < 0.0005 ? 'flat'
              : ((v > 0) !== !!invert ? 'up' : 'down');
    return '<span class="delta ' + cls + '">' + signed(v) + '</span>';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mount(host, node) {
    host.innerHTML = '';
    host.appendChild(node);
  }

  // =====================================================================
  // PAGE 1 — Executive market overview
  // =====================================================================
  function renderOverview() {
    const ov = DA.getExecutiveOverview(state.definition);
    const trend = DA.getPOSMarketTrend(state.definition);
    const sig = ov && ov.signal;
    const host = $('#page-overview');
    if (!ov) { host.innerHTML = '<p>No data for this universe.</p>'; return; }

    const cur = ov.latestWithTransactions || ov.current;
    const hasTerminals = cur.pos_terminals !== null && cur.pos_terminals !== undefined;

    const kpis = [
      ['Reporting period', monthLabel(cur.year_month), '', 'sm'],
      ['POS terminals', hasTerminals ? n0(cur.pos_terminals) : '—',
        hasTerminals ? deltaEl(cur.pos_yoy) + ' YoY' : 'not published for this universe'],
      ['Merchants', cur.merchants ? n0(cur.merchants) : '—', 'physical, accepting cards'],
      ['POS transactions', n0(cur.tx_count), deltaEl(cur.tx_yoy) + ' YoY'],
      ['POS value', eur(cur.tx_value), deltaEl(cur.value_yoy) + ' YoY'],
      ['Transactions per POS', cur.tx_per_pos ? nf0.format(cur.tx_per_pos) : '—',
        cur.tx_per_pos ? 'monthly, on 12-mo avg terminals' : 'needs a matching terminal count'],
      ['Value per POS', cur.value_per_pos ? eur(cur.value_per_pos) : '—', 'monthly'],
      ['Average ticket', cur.avg_ticket ? eur2(cur.avg_ticket) : '—', 'value ÷ count']
    ];

    let html = '<div class="sec"><div class="kpis">' + kpis.map(function (k) {
      return '<div class="kpi"><div class="lab">' + esc(k[0]) + '</div>' +
             '<div class="val' + (k[3] ? ' ' + k[3] : '') + '">' + k[1] + '</div>' +
             '<div class="foot">' + (k[2] || '') + '</div></div>';
    }).join('') + '</div></div>';

    // ---- signal panel, assembled from measured values
    if (sig) {
      const pp = sig.usage_minus_infra_pp * 100;
      const leader = pp > 0 ? 'usage' : 'infrastructure';
      const rows = [
        ['Infrastructure growth — terminals', sig.infrastructure_growth, C.colors.ACCENT2, false],
        ['Usage growth — transactions', sig.usage_growth, C.colors.ACCENT, false],
        ['Productivity — transactions per POS', sig.productivity_growth, C.colors.POS, false],
        ['Value per POS', sig.value_productivity_growth, C.colors.NEG, false],
        ['Average ticket', sig.average_ticket_growth, C.colors.NEG, false]
      ];
      const maxAbs = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[1] || 0); })) || 1;
      html += '<div class="sec"><div class="signal">' +
        '<h3>Market signals</h3>' +
        '<div class="win">' + esc(sig.months) + ' complete months to ' + monthLabel(sig.through) +
        ', against the same months of ' + sig.compare_from.slice(0, 4) +
        ' · ' + esc(ov.definition.metric_name) + '</div>' +
        '<div class="lines">' + rows.map(function (r) {
          const w = Math.abs(r[1] || 0) / maxAbs * 100;
          const col = (r[1] || 0) >= 0 ? r[2] : C.colors.NEG;
          return '<div class="sigline"><span class="l">' + esc(r[0]) + '</span>' +
                 '<span class="track"><span class="fill" style="width:' + w.toFixed(1) +
                 '%;background:' + col + '"></span></span>' +
                 '<span class="v">' + signed(r[1]) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="verdict"><span class="obs">Observation.</span> POS ' + leader +
        ' grew faster over this window: transactions ' + signed(sig.usage_growth) +
        ' against terminals ' + signed(sig.infrastructure_growth) + ', a gap of ' +
        Math.abs(pp).toFixed(1) + ' percentage points. Transactions per terminal ' +
        (sig.productivity_growth >= 0 ? 'rose ' : 'fell ') + pct(Math.abs(sig.productivity_growth)) +
        ', while the average ticket ' + (sig.average_ticket_growth >= 0 ? 'rose ' : 'fell ') +
        pct(Math.abs(sig.average_ticket_growth)) + ' to ' + eur2(sig.ticket_current) + '.</div>' +
        '<div class="hypo"><b>Possible interpretation — not established by this data.</b><br>' +
        'More transactions per terminal at a smaller average value is consistent with cards ' +
        'displacing cash on everyday purchases. The published statistics do not record what ' +
        'was bought or how it would otherwise have been paid, so this remains a hypothesis.</div>' +
        '</div></div>';
    }

    host.innerHTML = html;

    // ---- charts
    const grid = document.createElement('div');
    grid.className = 'grid2 sec';
    host.appendChild(grid);

    function card(title, note, node, legend) {
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML = '<div class="card-h"><h3>' + esc(title) + '</h3>' +
                    (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</div>' +
                    (legend ? '<div class="legend">' + legend + '</div>' : '') +
                    '<div class="card-b"></div>';
      $('.card-b', d).appendChild(node);
      grid.appendChild(d);
    }

    const hasTerm = trend.some(function (r) { return r.pos_terminals; });
    if (hasTerm) {
      card('POS infrastructure', 'terminals',
           C.line(trend, { series: [{ key: 'pos_terminals', color: C.colors.ACCENT2, fill: true }],
                           labelEvery: 4, yFmt: C.fmtShort }));
    }
    card('POS usage', 'transactions / month',
         C.line(trend, { series: [{ key: 'tx_count', color: C.colors.ACCENT, fill: true }],
                         labelEvery: trend.length > 40 ? 12 : 4 }));
    card('POS transaction value', 'EUR / month',
         C.line(trend, { series: [{ key: 'tx_value', color: C.colors.ACCENT, fill: true }],
                         labelEvery: trend.length > 40 ? 12 : 4,
                         yFmt: function (v) { return '€' + C.fmtShort(v); } }));
    if (hasTerm) {
      card('Productivity — transactions per POS', 'monthly, 12-mo average terminals',
           C.line(trend, { series: [{ key: 'tx_per_pos', color: C.colors.POS, fill: true }],
                           labelEvery: 4, yFmt: function (v) { return nf0.format(v); } }));
      card('Average ticket', 'EUR per transaction',
           C.line(trend, { series: [{ key: 'avg_ticket', color: C.colors.NEG, fill: true }],
                           labelEvery: 4, yFmt: function (v) { return '€' + nf1.format(v); } }));
      if (sig) {
        card('Infrastructure vs usage', 'YoY, like-for-like months',
             C.bars([
               { label: 'Terminals', value: sig.infrastructure_growth, color: C.colors.ACCENT2 },
               { label: 'Transactions', value: sig.usage_growth, color: C.colors.ACCENT },
               { label: 'Value', value: sig.value_growth, color: C.colors.ACCENT2 },
               { label: 'Tx per POS', value: sig.productivity_growth, color: C.colors.POS },
               { label: 'Avg ticket', value: sig.average_ticket_growth, color: C.colors.NEG }
             ], { h: 220 }));
      }
    } else {
      const d = document.createElement('div');
      d.className = 'notice';
      d.innerHTML = '<h4>No terminal count on this basis</h4><p>' +
        esc(DA.getDefinition(state.definition).limitations) + '</p>';
      host.insertBefore(d, grid);
    }
  }

  // =====================================================================
  // PAGE 2 — Payment behaviour
  // =====================================================================
  function renderBehaviour() {
    const b = DA.getPaymentBehaviour();
    const host = $('#page-behaviour');
    const mix = b.channelMix;
    const last = mix[mix.length - 1];

    // The two publications inside this page end on different months, so each
    // chart is pinned to the last month its own source actually covers rather
    // than being forced onto a shared axis.
    function lastMonthWith(channel, field) {
      for (let i = mix.length - 1; i >= 0; i--) {
        const c = mix[i].channels[channel];
        if (c && c[field] !== null && c[field] !== undefined) return mix[i];
      }
      return null;
    }
    const countRow = lastMonthWith('E-commerce', 'count') || last;
    const lastWithValue = lastMonthWith('E-commerce', 'value');

    let html = '<div class="notice acc"><h4>Three different latest periods on this page</h4>' +
      '<p>Terminal channels (POS, ATM) run to ' + monthLabel(last.year_month) +
      '. The instrument breakdown that carries e-commerce and digital wallet ends earlier: ' +
      'counts to ' + monthLabel(countRow.year_month) + ' and values only to ' +
      monthLabel(lastWithValue ? lastWithValue.year_month : null) +
      '. Each chart is pinned to the last month its own source covers, and says so, rather ' +
      'than being forced onto a common axis.</p></div>';

    // channel mix — counts, latest month that has them
    const chOrder = ['POS', 'ATM Withdrawal', 'ATM Deposit', 'E-commerce', 'Digital Wallet',
                     'E-money', 'Credit Transfer'];
    function mixAt(row, field) {
      return chOrder.map(function (c) {
        const v = row.channels[c];
        return { label: c, value: (v && v[field]) || 0 };
      }).filter(function (i) { return i.value > 0; })
        .sort(function (a, b2) { return b2.value - a.value; });
    }

    host.innerHTML = html;
    const grid = document.createElement('div');
    grid.className = 'grid2 sec';
    host.appendChild(grid);

    function card(title, note, node) {
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML = '<div class="card-h"><h3>' + esc(title) + '</h3>' +
                    '<span class="note">' + esc(note) + '</span></div><div class="card-b"></div>';
      $('.card-b', d).appendChild(node);
      grid.appendChild(d);
      return d;
    }

    card('Transaction count by channel', 'all instruments · ' + monthLabel(countRow.year_month),
         C.hbars(mixAt(countRow, 'count'), { fmt: C.fmtShort }));
    if (lastWithValue) {
      card('Transaction value by channel', 'all instruments · ' + monthLabel(lastWithValue.year_month),
           C.hbars(mixAt(lastWithValue, 'value'),
                   { fmt: function (v) { return '€' + C.fmtShort(v); } }));
    }
    card('Terminal channels by value', 'POS and ATM only · ' + monthLabel(last.year_month),
         C.hbars(['POS', 'ATM Withdrawal', 'ATM Deposit'].map(function (c) {
           const v = last.channels[c];
           return { label: c, value: (v && v.value) || 0,
                    color: c === 'POS' ? C.colors.ACCENT : C.colors.NEG };
         }).filter(function (i) { return i.value > 0; }),
         { fmt: function (v) { return '€' + C.fmtShort(v); } }));

    // POS vs ATM over time
    const series = mix.filter(function (m) { return m.channels['POS']; }).map(function (m) {
      return {
        year_month: m.year_month,
        pos: m.channels['POS'] ? m.channels['POS'].count : null,
        atm: m.channels['ATM Withdrawal'] ? m.channels['ATM Withdrawal'].count : null
      };
    });
    card('POS vs ATM withdrawals', 'transactions / month',
         C.line(series, { series: [{ key: 'pos', color: C.colors.ACCENT, fill: true },
                                   { key: 'atm', color: C.colors.NEG, fill: false }],
                          labelEvery: 4 }));
    grid.lastChild.insertAdjacentHTML('afterbegin',
      '<div class="legend" style="padding-top:8px">' +
      '<span><i style="background:' + C.colors.ACCENT + '"></i>POS payments</span>' +
      '<span><i style="background:' + C.colors.NEG + '"></i>ATM withdrawals</span></div>');

    // cards composition
    const cards = b.cards;
    const lc = cards[cards.length - 1];
    card('Card stock composition', monthLabel(lc.period),
         C.hbars([
           { label: 'Contactless', value: lc.contactless },
           { label: 'Contact only', value: lc.contact },
           { label: 'Debit', value: lc.debit },
           { label: 'Credit', value: lc.credit },
           { label: 'Visa', value: lc.visa },
           { label: 'Mastercard', value: lc.mastercard }
         ], { fmt: C.fmtShort }));

    const contactlessSeries = cards.map(function (r) {
      return { year_month: r.period, share: r.total ? r.contactless / r.total : null };
    });
    card('Contactless share of cards issued', 'share of total stock',
         C.line(contactlessSeries, {
           series: [{ key: 'share', color: C.colors.POS, fill: true }],
           labelEvery: 4, yFmt: function (v) { return (v * 100).toFixed(0) + '%'; }
         }));

    host.insertAdjacentHTML('beforeend',
      '<div class="notice"><h4>Transaction value bands are not published</h4>' +
      '<p>The brief asks for €0–20 / €21–50 / €51–100 / €101–200 / &gt;€200 splits. BQK does ' +
      'not publish card transactions by value band in any source reviewed, and the ' +
      'specification forbids inventing bands that do not exist. The average ticket on ' +
      'Page 1 is the closest supported measure.</p></div>');
  }

  // =====================================================================
  // PAGE 3 — Geographic footprint
  // =====================================================================
  function renderGeography() {
    const geo = DA.getMunicipalityIntelligence();
    const host = $('#page-geography');
    const unver = geo.filter(function (g) { return !g.verified; }).length;

    let html = '<div class="notice stop"><h4>Read this page with its limits in view</h4>' +
      '<p>BQK names only seven cities, only once a year, and only as percentages inside a chart ' +
      'in the annual report. Terminal counts below are <strong>estimated</strong> as that share ' +
      'of the national total (20,913 at end-2024). ' + unver + ' of the seven have a ' +
      'legend-to-value pairing that has not been confirmed against the rendered figure.</p>' +
      '<p>The transaction columns combine <strong>ATM and POS</strong> — that is how the source ' +
      'publishes them. They are not POS activity, and no POS productivity measure is computed ' +
      'from them.</p></div>';

    const covered = geo.reduce(function (a, g) { return a + (g.pos_share_pct || 0); }, 0);
    html += '<div class="sec"><div class="kpis">' +
      '<div class="kpi"><div class="lab">Cities published</div><div class="val">7</div>' +
      '<div class="foot">of 38 municipalities</div></div>' +
      '<div class="kpi"><div class="lab">Network covered</div><div class="val">' + nf1.format(covered) + '%</div>' +
      '<div class="foot">remainder unattributed</div></div>' +
      '<div class="kpi"><div class="lab">Reference year</div><div class="val sm">2024</div>' +
      '<div class="foot">annual report</div></div>' +
      '<div class="kpi"><div class="lab">Prishtinë share</div><div class="val">' +
      nf1.format(geo[0].pos_share_pct) + '%</div><div class="foot">of the POS network</div></div>' +
      '</div></div>';

    html += '<div class="grid2 sec"><div class="card">' +
      '<div class="card-h"><h3>POS network share by city</h3><span class="note">2024, estimated</span></div>' +
      '<div class="card-b" id="geo-chart"></div></div>' +
      '<div class="card"><div class="card-h"><h3>ATM + POS transactions by city</h3>' +
      '<span class="note">combined, 2024</span></div>' +
      '<div class="card-b" id="geo-tx"></div></div></div>';

    html += '<div class="sec"><div class="card"><div class="card-h"><h3>City detail</h3>' +
      '<span class="note">BQK annual report × ATK turnover</span></div>' +
      '<div class="tbl-wrap"><table><thead><tr>' +
      '<th>City</th><th class="n">POS share</th><th class="n">POS terminals (est.)</th>' +
      '<th class="n">Businesses</th><th class="n">Turnover 2024</th>' +
      '<th class="n">POS / 1,000 businesses</th><th>Pairing</th></tr></thead><tbody>' +
      geo.map(function (g) {
        return '<tr><td class="strong">' + esc(g.municipality) + '</td>' +
          '<td class="n">' + nf2.format(g.pos_share_pct) + '%</td>' +
          '<td class="n">' + n0(g.pos_terminals) + '</td>' +
          '<td class="n">' + n0(g.businesses) + '</td>' +
          '<td class="n">' + eur(g.turnover_total) + '</td>' +
          '<td class="n">' + (g.pos_per_1000_businesses ? nf1.format(g.pos_per_1000_businesses) : '—') + '</td>' +
          '<td>' + (g.verified ? '<span class="pill high">Verified</span>'
                               : '<span class="pill review_required">Unverified</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    host.innerHTML = html;
    mount($('#geo-chart'), C.hbars(geo.map(function (g) {
      return { label: g.municipality, value: g.pos_share_pct };
    }), { fmt: function (v) { return nf1.format(v) + '%'; } }));
    mount($('#geo-tx'), C.hbars(geo.slice().sort(function (a, b) {
      return b.atm_pos_tx_count - a.atm_pos_tx_count;
    }).map(function (g) {
      return { label: g.municipality, value: g.atm_pos_tx_count, color: C.colors.NEG };
    }), { fmt: C.fmtShort }));
  }

  // =====================================================================
  // PAGE 4 — Economic & merchant opportunity
  // =====================================================================
  function renderOpportunity() {
    const geo = DA.getMunicipalityIntelligence().filter(function (g) { return g.businesses; });
    const host = $('#page-opportunity');

    let html = '<div class="notice"><h4>Addressable turnover is a range, not a number</h4>' +
      '<p>ATK reports wholesale and retail as one sector worth about 46% of all turnover. ' +
      'Wholesale is not a card channel; retail is the most card-addressable activity there is. ' +
      'No split is published, so none is invented. The <em>floor</em> counts only ' +
      'unambiguously card-facing sectors; the <em>ceiling</em> adds the combined trade sector.</p>' +
      '</div>';

    html += '<div class="sec"><div class="card">' +
      '<div class="card-h"><h3>Opportunity matrix</h3>' +
      '<span class="note">7 shared cities · 2024 · bubble = businesses</span></div>' +
      '<div class="card-b" id="opp-chart"></div></div>' +
      '<div class="quad-legend">' +
      '<div class="qbox"><div class="t">Established</div><div class="d">High addressable turnover, high POS intensity.</div></div>' +
      '<div class="qbox"><div class="t">Potential infrastructure gap</div><div class="d">High turnover, lower POS intensity than peers.</div></div>' +
      '<div class="qbox"><div class="t">Higher infrastructure concentration</div><div class="d">Lower turnover, high POS intensity.</div></div>' +
      '<div class="qbox"><div class="t">Developing</div><div class="d">Lower on both measures.</div></div>' +
      '</div></div>';

    html += '<div class="sec"><div class="card"><div class="card-h">' +
      '<h3>POS intensity against economic activity</h3>' +
      '<span class="note">2024 · estimated terminals</span></div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>City</th>' +
      '<th class="n">POS (est.)</th><th class="n">Businesses</th>' +
      '<th class="n">Addressable floor</th><th class="n">Addressable ceiling</th>' +
      '<th class="n">POS / €1m (ceiling)</th><th class="n">Turnover / POS</th></tr></thead><tbody>' +
      geo.map(function (g) {
        return '<tr><td class="strong">' + esc(g.municipality) + '</td>' +
          '<td class="n">' + n0(g.pos_terminals) + '</td>' +
          '<td class="n">' + n0(g.businesses) + '</td>' +
          '<td class="n">' + eur(g.addressable_floor) + '</td>' +
          '<td class="n">' + eur(g.addressable_ceiling) + '</td>' +
          '<td class="n">' + (g.pos_per_eur1m_ceiling ? nf1.format(g.pos_per_eur1m_ceiling) : '—') + '</td>' +
          '<td class="n">' + eur(g.turnover_per_pos) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    html += '<div class="notice stop"><h4>Descriptive only</h4>' +
      '<p>These quadrants describe where infrastructure and economic activity sit relative to ' +
      'each other among seven cities in one year. They are not sales targets, and public data ' +
      'alone cannot establish that a low ratio represents an opportunity rather than a ' +
      'difference in how business is conducted locally.</p></div>';

    host.innerHTML = html;
    mount($('#opp-chart'), C.bubbles(geo.map(function (g) {
      return {
        label: g.municipality,
        x: g.addressable_ceiling,
        y: g.pos_per_eur1m_ceiling || 0,
        r: g.businesses
      };
    }), {
      h: 400,
      xLabel: 'Addressable turnover, ceiling (EUR)',
      yLabel: 'POS per €1m addressable',
      xFmt: function (v) { return '€' + C.fmtShort(v); },
      yFmt: function (v) { return nf1.format(v); }
    }));
  }

  // =====================================================================
  // PAGE 5 — Sector intelligence
  // =====================================================================
  function renderSectors() {
    const years = DA.atkYears();
    const year = state.atkYear || years[years.length - 1];
    const muni = state.municipality;
    const rows = muni === 'All'
      ? DA.getSectorIntelligence({ year: year })
      : DA.getSectorIntelligence({ year: year, municipality: muni });
    const prev = muni === 'All'
      ? DA.getSectorIntelligence({ year: year - 1 })
      : DA.getSectorIntelligence({ year: year - 1, municipality: muni });
    const prevBy = {};
    prev.forEach(function (r) { prevBy[r.sector] = r; });

    const total = rows.reduce(function (a, r) { return a + r.turnover; }, 0);
    const byCat = {};
    rows.forEach(function (r) {
      byCat[r.addressability] = (byCat[r.addressability] || 0) + r.turnover;
    });

    const host = $('#page-sectors');
    let html = '<div class="sec"><div class="kpis">' +
      '<div class="kpi"><div class="lab">Scope</div><div class="val sm">' + esc(muni) + '</div>' +
      '<div class="foot">' + year + ' · ATK</div></div>' +
      '<div class="kpi"><div class="lab">Total turnover</div><div class="val">' + eur(total) + '</div>' +
      '<div class="foot">declared, all sectors</div></div>' +
      '<div class="kpi"><div class="lab">Addressable floor</div><div class="val">' +
      eur(byCat['high'] || 0) + '</div><div class="foot">' +
      pct((byCat['high'] || 0) / total) + ' of turnover</div></div>' +
      '<div class="kpi"><div class="lab">Addressable ceiling</div><div class="val">' +
      eur((byCat['high'] || 0) + (byCat['review_required'] || 0)) + '</div><div class="foot">' +
      pct(((byCat['high'] || 0) + (byCat['review_required'] || 0)) / total) + ' of turnover</div></div>' +
      '</div></div>';

    html += '<div class="grid2 sec">' +
      '<div class="card"><div class="card-h"><h3>Turnover by sector</h3>' +
      '<span class="note">' + year + '</span></div><div class="card-b" id="sec-chart"></div></div>' +
      '<div class="card"><div class="card-h"><h3>Turnover by addressability</h3>' +
      '<span class="note">' + year + '</span></div><div class="card-b" id="sec-cat"></div></div>' +
      '</div>';

    const sorted = rows.slice().sort(function (a, b) { return b.turnover - a.turnover; });
    html += '<div class="sec"><div class="card"><div class="card-h"><h3>Sector detail</h3>' +
      '<span class="note">' + esc(muni) + ' · ' + year + '</span></div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>Sector</th><th>Addressability</th>' +
      '<th class="n">Turnover</th><th class="n">Share</th><th class="n">Businesses</th>' +
      '<th class="n">Turnover / business</th><th class="n">YoY</th></tr></thead><tbody>' +
      sorted.map(function (r) {
        const p = prevBy[r.sector];
        const yoy = p && p.turnover ? r.turnover / p.turnover - 1 : null;
        return '<tr><td class="strong">' + esc(r.sector) + '</td>' +
          '<td><span class="pill ' + r.addressability + '">' +
          esc(r.addressability.replace('_', ' ')) + '</span></td>' +
          '<td class="n">' + eur(r.turnover) + '</td>' +
          '<td class="n">' + pct(r.turnover / total) + '</td>' +
          '<td class="n">' + n0(r.businesses) + '</td>' +
          '<td class="n">' + eur(r.businesses ? r.turnover / r.businesses : null) + '</td>' +
          '<td class="n">' + (yoy === null ? '—' : deltaEl(yoy)) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    host.innerHTML = html;
    mount($('#sec-chart'), C.hbars(sorted.slice(0, 10).map(function (r) {
      return { label: r.sector.length > 30 ? r.sector.slice(0, 29) + '…' : r.sector,
               value: r.turnover,
               color: r.addressability === 'high' ? C.colors.POS
                    : r.addressability === 'review_required' ? C.colors.NEG : C.colors.ACCENT };
    }), { fmt: function (v) { return '€' + C.fmtShort(v); }, pad: { t: 6, r: 86, b: 6, l: 190 } }));

    mount($('#sec-cat'), C.hbars(
      ['high', 'medium', 'low', 'review_required'].filter(function (k) { return byCat[k]; })
        .map(function (k) {
          return { label: k.replace('_', ' '), value: byCat[k],
                   color: k === 'high' ? C.colors.POS
                        : k === 'review_required' ? C.colors.NEG : C.colors.ACCENT };
        }),
      { fmt: function (v) { return '€' + C.fmtShort(v); }, pad: { t: 6, r: 86, b: 6, l: 150 } }));
  }

  // =====================================================================
  // PAGE 6 — Data status & method
  // =====================================================================
  function renderStatus() {
    const st = DA.getDataStatus();
    const host = $('#page-status');
    const defs = DA.getDefinitions();

    let html = '<div class="sec"><div class="kpis">' +
      '<div class="kpi"><div class="lab">BQK latest</div><div class="val sm">' +
      monthLabel(st.meta.bqk_latest) + '</div><div class="foot">payment statistics</div></div>' +
      '<div class="kpi"><div class="lab">ATK latest</div><div class="val sm">' +
      monthLabel(st.meta.atk_latest) + '</div><div class="foot">' +
      st.meta.atk_bqk_lag_months + ' months behind BQK</div></div>' +
      '<div class="kpi"><div class="lab">Checks passed</div><div class="val">' +
      st.passed + ' / ' + (st.passed + st.failed) + '</div><div class="foot">' +
      st.high + ' high severity open</div></div>' +
      '<div class="kpi"><div class="lab">Built</div><div class="val sm">' +
      esc(st.meta.generated_at.slice(0, 10)) + '</div><div class="foot">from source workbooks</div></div>' +
      '</div></div>';

    html += '<div class="sec"><div class="card"><div class="card-h"><h3>Definition dictionary</h3>' +
      '<span class="note">three POS universes</span></div><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Series</th><th>Universe</th><th>Cards covered</th><th>Limitations</th></tr></thead><tbody>' +
      defs.map(function (d) {
        return '<tr><td class="strong">' + esc(d.metric_name) +
          (d.is_default ? ' <span class="pill acc">Default</span>' : '') + '</td>' +
          '<td>' + esc(d.universe) + '</td><td>' + esc(d.cards_coverage) + '</td>' +
          '<td>' + esc(d.limitations) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    html += '<div class="sec"><div class="card"><div class="card-h"><h3>Quality findings</h3>' +
      '<span class="note">from the latest build</span></div><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Check</th><th>Severity</th><th>Finding</th></tr></thead><tbody>' +
      st.checks.slice().sort(function (a, b) {
        const rank = { high: 0, warning: 1, info: 2 };
        return (a.status === 'failed' ? 0 : 1) - (b.status === 'failed' ? 0 : 1) ||
               rank[a.severity] - rank[b.severity];
      }).map(function (c) {
        const cls = c.status === 'passed' ? 'high' : c.severity === 'high' ? 'review_required' : 'medium';
        return '<tr><td>' + esc(c.check_type.replace(/_/g, ' ')) + '</td>' +
          '<td><span class="pill ' + cls + '">' +
          (c.status === 'passed' ? 'passed' : esc(c.severity)) + '</span></td>' +
          '<td>' + esc(c.message) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    html += '<div class="sec"><div class="card"><div class="card-h"><h3>Sources</h3>' +
      '<span class="note">every figure traces here</span></div><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Institution</th><th>Dataset</th><th>Table / sheet</th><th>Coverage</th><th>Freq</th>' +
      '</tr></thead><tbody>' +
      st.sources.map(function (s) {
        return '<tr><td class="strong">' + esc(s.institution) + '</td>' +
          '<td><a href="' + esc(s.source_url) + '" target="_blank" rel="noopener">' +
          esc(s.dataset_name) + '</a></td>' +
          '<td>' + esc(s.source_table || '—') + '</td>' +
          '<td class="n">' + esc((s.reporting_start_date || '').slice(0, 7) || '—') + ' → ' +
          esc((s.reporting_end_date || '').slice(0, 7) || 'current') + '</td>' +
          '<td>' + esc(s.frequency) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    html += '<div class="sec"><div class="notice stop"><h4>What Phase 1 cannot answer</h4>' +
      '<p>No public source splits POS terminals, cards, merchants or transactions by bank. ' +
      'NLB market share, the Fair Share Index, transaction leakage and on-us versus off-us ' +
      'activity are therefore out of reach here — not omitted by choice.</p>' +
      '<p>Merchant-level performance, MDR, interchange, scheme fees and terminal economics ' +
      'appear in no public source at all. POS productivity by municipality is blocked by the ' +
      'ATM+POS combination. Terminal history before 2025 exists only on an incompatible basis. ' +
      'These belong to Phase 2, with internal data.</p></div></div>';

    host.innerHTML = html;
  }

  // =====================================================================
  // shell
  // =====================================================================
  const PAGES = {
    overview: renderOverview,
    behaviour: renderBehaviour,
    geography: renderGeography,
    opportunity: renderOpportunity,
    sectors: renderSectors,
    status: renderStatus
  };

  function show(page) {
    state.page = page;
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) {
      p.classList.toggle('active', p.id === 'page-' + page);
    });
    Array.prototype.forEach.call(document.querySelectorAll('nav.pages button'), function (b) {
      b.setAttribute('aria-selected', String(b.dataset.page === page));
    });
    // filters that only apply to some pages
    $('#f-universe').closest('.field').style.display =
      (page === 'overview' || page === 'behaviour') ? '' : 'none';
    $('#f-year').closest('.field').style.display = (page === 'sectors') ? '' : 'none';
    $('#f-muni').closest('.field').style.display = (page === 'sectors') ? '' : 'none';
    $('#universe-banner').style.display =
      (page === 'overview' || page === 'behaviour') ? '' : 'none';
    PAGES[page]();
  }

  function syncUniverseBanner() {
    const d = DA.getDefinition(state.definition);
    $('#universe-text').textContent = d.universe + '. ' + d.cards_coverage + '.';
  }

  function init() {
    const meta = DA.meta();
    const st = DA.getDataStatus();

    // universe selector
    const us = $('#f-universe');
    DA.getDefinitions().filter(function (d) {
      return d.metric_key.indexOf('pos_') === 0 && d.metric_key !== 'pos_terminals_annual';
    }).forEach(function (d) {
      const o = document.createElement('option');
      o.value = d.metric_key;
      o.textContent = d.metric_name;
      us.appendChild(o);
    });
    us.value = state.definition;
    us.addEventListener('change', function () {
      state.definition = us.value;
      syncUniverseBanner();
      PAGES[state.page]();
    });

    // ATK year
    const ys = $('#f-year');
    const years = DA.atkYears();
    years.slice().reverse().forEach(function (y) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      ys.appendChild(o);
    });
    state.atkYear = years[years.length - 1];
    ys.value = state.atkYear;
    ys.addEventListener('change', function () {
      state.atkYear = parseInt(ys.value, 10);
      if (state.page === 'sectors') renderSectors();
    });

    // municipality
    const ms = $('#f-muni');
    const munis = DA.getMunicipalityTotals(state.atkYear)
      .map(function (r) { return r.municipality; }).sort();
    ['All'].concat(munis).forEach(function (m) {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      ms.appendChild(o);
    });
    ms.value = 'All';
    ms.addEventListener('change', function () {
      state.municipality = ms.value;
      if (state.page === 'sectors') renderSectors();
    });

    // status chip
    $('#status-text').textContent = 'BQK ' + monthLabel(meta.bqk_latest) +
      ' · ATK ' + monthLabel(meta.atk_latest) + ' · ' + st.passed + '/' +
      (st.passed + st.failed) + ' checks';
    if (st.failed) $('#status-dot').classList.add('warn');
    $('#status-chip').addEventListener('click', function () { show('status'); });

    Array.prototype.forEach.call(document.querySelectorAll('nav.pages button'), function (b) {
      b.addEventListener('click', function () { show(b.dataset.page); });
    });

    syncUniverseBanner();
    show('overview');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
