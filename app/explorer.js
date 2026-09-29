/* Municipality × sector explorer.

   The question a salesperson actually has is narrow: where do I go, and what
   do I sell into when I get there. This answers both from one grid — 38
   municipalities by 23 sectors of declared turnover and taxpayer counts — and
   refuses to answer a third question it cannot.

   WHAT IT WILL NOT SHOW. There is no sector-level acceptance anywhere in
   Kosovo: no publisher counts terminals or card-accepting merchants inside a
   sector. So the grid carries economic weight, not a penetration gap, and a
   cell never implies one. Acceptance appears only at municipality level, only
   for the seven cities BQK publishes, and is labelled where it does.

   Every column says what kind of thing it is. Turnover and taxpayers are
   reported by the tax administration. Addressability is this project's own
   classification. Terminal counts are read off a chart in an annual PDF. Those
   are three different levels of confidence and the table does not blur them. */
(function (global) {
  'use strict';

  const DA = global.DataAccess, U = global.UI;
  const $ = function (s, r) { return (r || document).querySelector(s); };

  const ADDR = {
    HIGH: { label: 'Card-facing', tone: 'pos',
            hint: 'Sells to consumers across a counter.' },
    MEDIUM: { label: 'Mixed', tone: 'mid',
              hint: 'Part consumer, part business-to-business.' },
    LOW: { label: 'Not card-facing', tone: 'low',
           hint: 'Settles between businesses or by transfer.' },
    REVIEW_REQUIRED: { label: 'Unsplit', tone: 'warn',
                       hint: 'Wholesale and retail are one published section; ' +
                             'no source splits them.' }
  };

  let ROWS = null, GEO = null, STATE = { municipality: '', sector: '' };

  function addrBadge(a) {
    const m = ADDR[a] || { label: a, tone: 'low', hint: '' };
    return '<span class="ex-addr ex-' + m.tone + '" title="' + U.esc(m.hint) +
      '">' + U.esc(m.label) + '</span>';
  }

  function profile(name) {
    const g = (GEO && GEO.municipalities || []).filter(function (m) {
      return m.municipality === name; })[0];
    if (!g) return '';
    const flagged = g.declared_not_transacted;
    return '<div class="ex-profile' + (flagged ? ' ex-flagged' : '') + '">' +
      '<div class="ex-p-row">' +
        '<div><span class="k">Declared turnover</span><span class="v">' +
          U.money(g.turnover) + '</span></div>' +
        '<div><span class="k">Taxpayers</span><span class="v">' +
          U.exact(g.taxpayers) + '</span></div>' +
        '<div><span class="k">Per taxpayer</span><span class="v">' +
          U.money(g.turnover_per_taxpayer) + '</span></div>' +
        '<div><span class="k">Terminals</span><span class="v">' +
          (g.pos_terminals ? U.exact(g.pos_terminals) :
            '<em>not published</em>') + '</span></div>' +
        '<div><span class="k">Archetype</span><span class="v">' +
          U.esc(g.archetype) + '</span></div>' +
      '</div>' +
      (flagged
        ? '<p class="ex-warn"><strong>Declared, not transacted.</strong> This ' +
          'municipality books ' + g.concentration_ratio.toFixed(1) + ' times the ' +
          'national median turnover per taxpayer. That is trade registered to an ' +
          'office here rather than carried out here, so its size should not be ' +
          'read as local commercial opportunity.</p>'
        : '<p class="ex-note">' + U.esc(g.archetype_reason || '') + '</p>') +
      '</div>';
  }

  function table(rows, groupBy) {
    const total = rows.reduce(function (a, r) { return a + (r.turnover || 0); }, 0);
    return '<div class="card"><div class="tbl-wrap"><table><thead><tr>' +
      '<th>' + (groupBy === 'sector' ? 'Sector' : 'Municipality') + '</th>' +
      '<th class="n">Turnover</th><th class="n">Share</th>' +
      '<th class="n">Taxpayers</th><th class="n">Per taxpayer</th>' +
      '<th>Card addressability</th></tr></thead><tbody>' +
      rows.map(function (r) {
        const per = r.taxpayers ? r.turnover / r.taxpayers : null;
        return '<tr><td class="strong">' +
          U.esc(groupBy === 'sector' ? r.sector : r.municipality) + '</td>' +
          '<td class="n">' + U.money(r.turnover) + '</td>' +
          '<td class="n">' + (total ? U.pct(r.turnover / total, 1) : '—') + '</td>' +
          '<td class="n">' + (r.taxpayers ? U.exact(r.taxpayers) : '—') + '</td>' +
          '<td class="n">' + (per ? U.money(per) : '—') + '</td>' +
          '<td>' + addrBadge(r.addressability) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function paint(host) {
    const out = $('#ex-out', host);
    if (!out) return;
    const m = STATE.municipality, s = STATE.sector;
    let rows, groupBy, caption;

    if (m && !s) {
      rows = ROWS.filter(function (r) { return r.municipality === m; });
      groupBy = 'sector';
      caption = 'Sectors in ' + m + ', by declared turnover';
    } else if (s && !m) {
      rows = ROWS.filter(function (r) { return r.sector === s; });
      groupBy = 'municipality';
      caption = s + ', by municipality';
    } else if (m && s) {
      rows = ROWS.filter(function (r) {
        return r.municipality === m && r.sector === s; });
      groupBy = 'sector';
      caption = s + ' in ' + m;
    } else {
      const agg = {};
      ROWS.forEach(function (r) {
        const a = agg[r.sector] || (agg[r.sector] = {
          sector: r.sector, turnover: 0, taxpayers: 0,
          addressability: r.addressability });
        a.turnover += r.turnover || 0;
        a.taxpayers += r.taxpayers || 0;
      });
      rows = Object.keys(agg).map(function (k) { return agg[k]; });
      groupBy = 'sector';
      caption = 'All municipalities, by sector';
    }
    rows.sort(function (a, b) { return (b.turnover || 0) - (a.turnover || 0); });

    out.innerHTML =
      (m ? profile(m) : '') +
      '<div class="sec-head" style="margin-top:var(--s4)"><h2>' +
        U.esc(caption) + '</h2><span class="sub">' + rows.length +
        ' rows · declared turnover, tax administration</span></div>' +
      (rows.length ? table(rows, groupBy)
                   : '<p class="note">No rows for that combination.</p>');
  }

  function render(host) {
    const all = DA.getMuniSectorYear();
    GEO = DA.getGeoOpportunity();
    if (!all || !all.length) {
      host.innerHTML = U.emptyState('Not available',
        'The municipality by sector grid is not in this payload.');
      return;
    }
    const year = Math.max.apply(null, all.map(function (r) { return r.year; }));
    ROWS = all.filter(function (r) { return r.year === year; });

    // A Set is not array-like, so slice.call on one yields nothing. Collect
    // the distinct values explicitly instead.
    const distinct = function (key) {
      const seen = {}, out = [];
      ROWS.forEach(function (r) {
        const v = r[key];
        if (v && !seen[v]) { seen[v] = 1; out.push(v); }
      });
      return out.sort(function (a, b) { return a.localeCompare(b); });
    };
    const munis = distinct('municipality');
    const sects = distinct('sector');

    let h = '<header class="page-head"><h1>Where to play</h1>' +
      '<p class="q">Which sectors hold the turnover in a municipality, and which ' +
      'municipalities hold a sector. ' + year + ' declared turnover.</p></header>';

    h += '<section class="ex-controls">' +
      '<label class="ex-sel"><span>Municipality</span><select id="ex-m">' +
      '<option value="">All municipalities</option>' +
      munis.map(function (x) {
        return '<option value="' + U.esc(x) + '">' + U.esc(x) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="ex-sel"><span>Sector</span><select id="ex-s">' +
      '<option value="">All sectors</option>' +
      sects.map(function (x) {
        return '<option value="' + U.esc(x) + '">' + U.esc(x) + '</option>';
      }).join('') + '</select></label>' +
      '<button class="btn btn-quiet" id="ex-reset">Reset</button>' +
      '</section>';

    h += '<div id="ex-out"></div>';

    h += '<section class="sec" style="margin-top:var(--s6)">' +
      '<div class="card"><div class="card-b" style="padding-top:20px">' +
      '<h3 style="font-size:15px;font-weight:600;margin-bottom:8px">' +
      'What this grid does not contain</h3>' +
      '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.7;max-width:64ch">' +
      'There is no acceptance figure by sector, here or anywhere: no publisher ' +
      'counts terminals or card-accepting merchants inside a sector. So a large ' +
      'cell means a large economy, never an unserved one, and the two must not be ' +
      'read as the same thing.</p>' +
      '<p style="font-size:12px;color:var(--ink-3);line-height:1.6;max-width:64ch;' +
      'margin-top:12px"><strong>Turnover and taxpayers</strong> are reported by the ' +
      'tax administration. <strong>Card addressability</strong> is this project’s ' +
      'own classification, not an official measure — and the largest class, ' +
      '“unsplit”, exists because wholesale and retail are published as one ' +
      'section. <strong>Terminal counts</strong>, where shown, are read off a ' +
      'chart in an annual report and exist for seven cities only.</p>' +
      '</div></div></section>';

    host.innerHTML = h;
    paint(host);

    $('#ex-m', host).addEventListener('change', function (e) {
      STATE.municipality = e.target.value; paint(host); });
    $('#ex-s', host).addEventListener('change', function (e) {
      STATE.sector = e.target.value; paint(host); });
    $('#ex-reset', host).addEventListener('click', function () {
      STATE = { municipality: '', sector: '' };
      $('#ex-m', host).value = ''; $('#ex-s', host).value = '';
      paint(host);
    });
    U.observeReveals(host);
  }

  global.Explorer = { render: render };
})(window);
