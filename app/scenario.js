/* The scenario engine.

   Three levers the data supports, each carried through the same chain, and a
   hard line halfway down it. Above the line everything is measured or follows
   from an assumption the user set. Below it nothing can be computed until the
   bank supplies a rate, because merchant charges, interchange, scheme fees and
   terminal costs are published by nobody.

   No default is offered for any of those. A plausible-looking default becomes
   the answer within a day of anyone seeing it, and then the tool is guessing
   with a straight face. Empty is the honest state, and the chain says so at
   every step that depends on one.

   The three levers are never summed. Capturing share and deploying terminals
   overlap — a terminal deployed is one way share is won — so adding them
   counts the same euro twice. They run side by side instead. */
(function (global) {
  'use strict';

  const DA = global.DataAccess, U = global.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  const STORE = 'kpi.scenario.v1';

  // Every one of these is a bank input. None has a default, and none is
  // guessed from a market average.
  const INPUTS = [
    { key: 'mdr', label: 'Merchant discount rate', unit: 'bps on value',
      hint: 'What the merchant is charged, in basis points.' },
    { key: 'interchange', label: 'Interchange paid', unit: 'bps on value',
      hint: 'Paid away to the issuer.' },
    { key: 'scheme', label: 'Scheme and processing', unit: 'bps on value',
      hint: 'Card scheme, switch and processing.' },
    { key: 'terminal', label: 'Terminal cost', unit: '€ per terminal, a month',
      hint: 'Hardware, maintenance and connectivity.' },
    { key: 'servicing', label: 'Merchant servicing', unit: '€ per merchant, a month',
      hint: 'Onboarding, support and account servicing.' }
  ];

  const ASSUMPTIONS = { capture: 0.5, deploy: 0, activate: 1 };

  function read() {
    let saved = {};
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORE);
      if (raw) saved = JSON.parse(raw) || {};
    } catch (e) { saved = {}; }
    return saved;
  }
  function write(state) {
    try {
      if (global.localStorage)
        global.localStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) { /* private window, blocked storage — the page still works */ }
  }

  function money(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return '€' + (v / 1e9).toFixed(2) + 'bn';
    if (a >= 1e6) return '€' + (v / 1e6).toFixed(2) + 'm';
    if (a >= 1e3) return '€' + Math.round(v / 1e3) + 'k';
    return '€' + Math.round(v);
  }

  let STATE = null, BASE = null;

  function scenarios() {
    const b = BASE, s = STATE;
    const out = [];
    out.push({
      key: 'capture', title: 'Capture share',
      assumption: '+' + s.capture + ' pp of market payment value',
      volume: b.market_value_12m * (s.capture / 100),
      terminals: 0, merchants: 0,
      basis: money(b.market_value_12m) + ' of market volume over ' +
             b.window[0] + ' to ' + b.window[1] + ', times ' + s.capture + '%.',
      confidence: 'The market volume is measured. Whether this share can be won ' +
                  'is the assumption, and it is yours.'
    });
    out.push({
      key: 'deploy', title: 'Deploy terminals',
      assumption: U.exact(s.deploy) + ' terminals at market productivity',
      volume: s.deploy * b.value_per_terminal_year,
      terminals: s.deploy,
      // A merchant may run several terminals, so servicing is costed per
      // merchant at the measured market ratio rather than per terminal.
      merchants: b.terminals_per_merchant
        ? Math.round(s.deploy / b.terminals_per_merchant) : 0,
      basis: U.exact(s.deploy) + ' × ' +
             U.exact(Math.round(b.payments_per_terminal_year)) +
             ' payments a year × €' + b.average_payment.toFixed(2) + '.',
      confidence: 'A new terminal is assumed to perform at the market average. ' +
                  'A terminal placed where acceptance is thin may do less.'
    });
    if (b.bank) {
      out.push({
        key: 'activate', title: 'Activate existing terminals',
        assumption: s.activate
          ? b.bank.code + '’s ' + U.exact(b.bank.terminals) +
            ' terminals raised to market frequency'
          : 'not applied',
        volume: s.activate ? b.bank.activation_value : 0,
        terminals: 0, merchants: 0,
        basis: b.bank.code + ' runs ' +
               U.exact(Math.round(b.bank.tx_per_terminal)) +
               ' payments per terminal against a market ' +
               U.exact(Math.round(b.payments_per_terminal_year)) +
               ', holding its own average payment.',
        confidence: 'The bank figures come from a supplied extract with no ' +
                    'stated reporting period.'
      });
    }
    return out;
  }

  function economics(volume, terminals, merchants) {
    const v = STATE.inputs, missing = [];
    INPUTS.forEach(function (i) {
      const n = parseFloat(v[i.key]);
      if (!(n >= 0) || v[i.key] === '' || v[i.key] === undefined) missing.push(i.label);
    });
    const num = function (k) { const n = parseFloat(v[k]); return (n >= 0) ? n : null; };
    const mdr = num('mdr'), ic = num('interchange'), sc = num('scheme');
    const tc = num('terminal'), sv = num('servicing');

    const gross = (mdr !== null) ? volume * mdr / 10000 : null;
    const net = (mdr !== null && ic !== null && sc !== null)
      ? volume * (mdr - ic - sc) / 10000 : null;
    const termCost = (tc !== null) ? terminals * tc * 12 : null;
    const svcCost = (sv !== null) ? (merchants || 0) * sv * 12 : null;
    const contribution = (net !== null && termCost !== null && svcCost !== null)
      ? net - termCost - svcCost : null;
    return { gross: gross, net: net, termCost: termCost, svcCost: svcCost,
             contribution: contribution, missing: missing,
             marginBps: (mdr !== null && ic !== null && sc !== null)
               ? (mdr - ic - sc) : null };
  }

  function row(label, value, kind, note) {
    return '<tr class="sc-' + kind + '"><td>' + U.esc(label) +
      (note ? '<span class="sc-note">' + U.esc(note) + '</span>' : '') +
      '</td><td class="n">' +
      (value === null ? '<span class="sc-await">awaiting input</span>' : value) +
      '</td></tr>';
  }

  function scenarioCard(s) {
    const e = economics(s.volume, s.terminals, s.merchants);
    return '<article class="sc-card">' +
      '<header><h3>' + U.esc(s.title) + '</h3>' +
      '<p class="sc-assume">' + U.esc(s.assumption) + '</p></header>' +
      '<div class="sc-vol"><span class="v">' + money(s.volume) + '</span>' +
      '<span class="k">incremental annual payment volume</span></div>' +
      '<table class="sc-chain"><tbody>' +
        row('Payment volume', money(s.volume), 'derived') +
        row('Acquiring revenue', e.gross === null ? null : money(e.gross),
            'input', 'merchant discount rate') +
        row('Less interchange and scheme', e.net === null ? null : money(e.net),
            'input', 'net of both') +
        (s.terminals
          ? row('Less terminal cost', e.termCost === null ? null :
                '−' + money(e.termCost), 'input',
                U.exact(s.terminals) + ' terminals, a year')
          : '') +
        (s.merchants
          ? row('Less merchant servicing', e.svcCost === null ? null :
                '−' + money(e.svcCost), 'input',
                U.exact(s.merchants) + ' merchants at the market ratio of ' +
                (BASE.terminals_per_merchant || 0).toFixed(2) +
                ' terminals each')
          : '') +
        row('Contribution', e.contribution === null ? null :
            money(e.contribution), 'result') +
      '</tbody></table>' +
      '<p class="sc-basis">' + U.esc(s.basis) + '</p>' +
      '<p class="sc-conf">' + U.esc(s.confidence) + '</p>' +
      (e.missing.length
        ? '<p class="sc-missing">Contribution needs ' + e.missing.length +
          ' more input' + (e.missing.length > 1 ? 's' : '') + ': ' +
          U.esc(e.missing.join(', ')) + '.</p>'
        : '<p class="sc-ok">Net margin ' + e.marginBps.toFixed(0) +
          ' bps on captured volume.</p>') +
      '</article>';
  }

  function paint(host) {
    const grid = $('#sc-grid', host);
    if (grid) grid.innerHTML = scenarios().map(scenarioCard).join('');
  }

  function render(host) {
    BASE = DA.getScenario();
    if (!BASE) {
      host.innerHTML = U.emptyState('Not available',
        'The scenario engine needs the monthly POS series; none is loaded.');
      return;
    }
    const saved = read();
    STATE = {
      capture: saved.capture !== undefined ? saved.capture : ASSUMPTIONS.capture,
      deploy: saved.deploy !== undefined ? saved.deploy
                                         : ((BASE.placement_gap || {}).terminals || 0),
      activate: saved.activate !== undefined ? saved.activate : ASSUMPTIONS.activate,
      inputs: saved.inputs || {}
    };

    let h = '<header class="page-head"><h1>Scenario engine</h1>' +
      '<p class="q">What a change in share, placement or activation would be ' +
      'worth — and where the arithmetic stops without your own economics.' +
      '</p></header>';

    h += '<section class="sc-controls"><div class="sc-block">' +
      '<span class="label">Assumptions</span>' +
      '<div class="sc-fields">' +
      '<label class="sc-field"><span>Share captured</span>' +
      '<input type="range" id="sc-capture" min="0" max="5" step="0.1" value="' +
        STATE.capture + '"><output id="sc-capture-o">' + STATE.capture +
        ' pp</output></label>' +
      '<label class="sc-field"><span>Terminals deployed</span>' +
      '<input type="number" id="sc-deploy" min="0" step="10" value="' +
        STATE.deploy + '"></label>' +
      (BASE.bank ? '<label class="sc-field sc-check"><span>Activate existing fleet' +
        '</span><input type="checkbox" id="sc-activate"' +
        (STATE.activate ? ' checked' : '') + '></label>' : '') +
      '</div>' +
      (BASE.placement_gap ? '<p class="sc-hint">The terminal figure starts at ' +
        U.exact(BASE.placement_gap.terminals) + ', the measured gap in ' +
        U.esc(BASE.placement_gap.municipality) + '.</p>' : '') +
      '</div>' +

      '<div class="sc-block sc-inputs-block">' +
      '<span class="label">Your economics</span>' +
      '<p class="sc-hint">None of these is published by anyone, so none is ' +
      'pre-filled. Until they are supplied the engine reports volume and stops ' +
      '— which is the honest answer, not a limitation to work around.</p>' +
      '<div class="sc-fields">' +
      INPUTS.map(function (i) {
        return '<label class="sc-field"><span>' + U.esc(i.label) +
          '<em>' + U.esc(i.unit) + '</em></span>' +
          '<input type="number" min="0" step="any" data-input="' + i.key +
          '" placeholder="—" value="' +
          (STATE.inputs[i.key] !== undefined ? STATE.inputs[i.key] : '') +
          '" title="' + U.esc(i.hint) + '"></label>';
      }).join('') +
      '</div></div></section>';

    h += '<div class="sc-grid" id="sc-grid"></div>';

    // The three layers, so the reason the chain stops is architecture rather
    // than an oversight the reader has to infer.
    const layers = DA.getLayers();
    if (layers) {
      h += '<section class="sec" style="margin-top:var(--s6)">' +
        '<div class="sec-head"><h2>Three layers</h2><span class="sub">' +
        'Market opportunity, the bank’s position, the economics</span></div>' +
        '<div class="sc-layers">' +
        layers.map(function (l) {
          return '<div class="sc-layer sc-l-' + l.status.toLowerCase() + '">' +
            '<div class="sc-l-head"><span class="sc-l-n">' + l.n + '</span>' +
            '<h3>' + U.esc(l.name) + '</h3>' +
            '<span class="sc-l-status">' + U.esc(l.status) + '</span></div>' +
            '<p class="sc-l-detail">' + U.esc(l.detail) + '</p>' +
            '<p class="sc-l-note">' + U.esc(l.note) + '</p></div>';
        }).join('') + '</div>' +
        '<p class="note" style="margin-top:10px">The file contract for layers ' +
        'two and three is in <code>data/internal/</code>, and ' +
        '<code>etl/load_internal.py --check</code> validates against it. It ' +
        'refuses any file carrying a person-level column, because these ' +
        'questions are about segments and a segment answer never needs a person ' +
        'in the row.</p></section>';
    }

    h += '<section class="sec" style="margin-top:var(--s6)">' +
      '<div class="sec-head"><h2>The chain</h2><span class="sub">What is ' +
      'measured, what you assumed, and what only you can supply</span></div>' +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>Step</th><th>Kind</th><th>Where it comes from</th></tr></thead><tbody>' +
      BASE.chain.map(function (c) {
        return '<tr><td class="strong">' + U.esc(c.step) + '</td>' +
          '<td><span class="sc-kind sc-k-' + c.kind + '">' + U.esc(c.kind) +
          '</span></td><td style="font-size:12.5px;color:var(--ink-2)">' +
          U.esc(c.source) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<p class="note" style="margin-top:10px">' + U.esc(BASE.note) + '</p>' +
      '</section>';

    host.innerHTML = h;
    paint(host);

    const save = function () { write(STATE); paint(host); };
    const cap = $('#sc-capture', host);
    if (cap) cap.addEventListener('input', function (e) {
      STATE.capture = parseFloat(e.target.value);
      $('#sc-capture-o', host).textContent = STATE.capture + ' pp';
      save();
    });
    const dep = $('#sc-deploy', host);
    if (dep) dep.addEventListener('input', function (e) {
      STATE.deploy = Math.max(0, parseInt(e.target.value, 10) || 0); save();
    });
    const act = $('#sc-activate', host);
    if (act) act.addEventListener('change', function (e) {
      STATE.activate = e.target.checked ? 1 : 0; save();
    });
    $$('[data-input]', host).forEach(function (el) {
      el.addEventListener('input', function (e) {
        STATE.inputs[e.target.getAttribute('data-input')] = e.target.value;
        save();
      });
    });

    U.observeReveals(host);
  }

  global.ScenarioEngine = { render: render };
})(window);
