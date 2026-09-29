/* Data access layer.

   Pages call these functions and nothing else. No KPI is derived here — the
   formulas live once, in the ETL and in the matching analytics views, and this
   file only selects and shapes.

   Today the source is the curated payload. When a Supabase project is live,
   only the SOURCE block changes; every function keeps its name, arguments and
   return shape, because api.* was written to return these columns:

     const { data } = await supabase.from('overview_monthly')
       .select('*').eq('definition_id', id).order('year_month');
*/
(function (global) {
  'use strict';

  // ------------------------------------------------------------- SOURCE
  /* Fail loudly but not fatally. Throwing here would abort this script while
     it parses, taking every later script with it and leaving the boot overlay
     spinning. Reporting instead lets the shell show a real error state. */
  const DB = global.KPI_DATA;
  if (!DB) {
    const msg = 'data.js did not load — the curated payload is missing or stale.';
    if (global.__bootFail) global.__bootFail(msg);
    if (global.console) console.error(msg);
    global.DataAccess = null;
    return;
  }
  const DEFAULT_DEF = 'pos_rm_allcards';

  function index(list, key) {
    const o = {};
    (list || []).forEach(function (r) { o[r[key]] = r; });
    return o;
  }
  const DEFS = index(DB.definitions, 'metric_key');
  const KPI = index(DB.kpi_registry, 'kpi_id');
  const KPI_STATUS = index(DB.kpi_status, 'kpi_id');
  const SOURCES = index(DB.sources, 'source_id');
  const VERSIONS = {};
  (DB.source_versions || []).forEach(function (v) { VERSIONS[v.source_id] = v; });

  const API = {
    meta: function () { return DB.meta; },

    // ---- definitions -----------------------------------------------------
    // The series selector offers the universes that actually have a monthly
    // series behind them. Testing the payload rather than naming exceptions
    // keeps a new definition — the annual terminal series, the KBA bank
    // extract — out of a control that could not render it.
    getDefinitions: function () {
      return DB.definitions.filter(function (d) {
        return (DB.pos_monthly || {})[d.metric_key];
      });
    },
    getBankPosition: function () { return (DB.levers || {}).bank_position || null; },
    getAcceptanceBase: function () { return (DB.levers || {}).acceptance_base || null; },
    getFormation: function () { return (DB.levers || {}).formation || null; },
    getImportMomentum: function () {
      return (DB.levers || {}).import_momentum || null; },
    getVerticals: function () { return DB.verticals || null; },
    getOpportunity: function () { return (DB.levers || {}).opportunity || null; },
    getCockpit: function () { return DB.cockpit || null; },
    getFreshness: function () { return DB.freshness || null; },
    getIntensityDenominators: function () {
      return (DB.levers || {}).intensity_denominators || null; },
    getAcceptanceFunnel: function () {
      return (DB.levers || {}).acceptance_funnel || null; },
    getConcentration: function () { return (DB.levers || {}).concentration || null; },
    getForeignPulse: function () { return (DB.levers || {}).foreign_pulse || null; },
    getRegional: function () { return DB.regional || null; },
    getAudit: function () { return DB.audit || null; },
    getDecisions: function () { return DB.decisions || null; },
    getGeoOpportunity: function () { return (DB.levers||{}).geo_opportunity || null; },
    getDoganaCoverage: function () { return DB.dogana_coverage || null; },
    getTurnoverCrossCheck: function () {
      return (DB.levers || {}).turnover_cross_check || null; },
    getDefinition: function (key) { return DEFS[key] || DEFS[DEFAULT_DEF]; },
    defaultDefinition: function () { return DEFAULT_DEF; },

    // ---- KPI registry ----------------------------------------------------
    getKpi: function (id) { return KPI[id] || null; },
    getKpiStatus: function (id) { return KPI_STATUS[id] || null; },
    getMethodology: function () {
      return (DB.kpi_registry || []).map(function (k) {
        const s = KPI_STATUS[k.kpi_id] || {};
        return Object.assign({}, k, { status: s.status, reason: s.reason,
                                      required_input: s.required_input });
      });
    },

    /** Everything the source drawer needs for one KPI, resolved to its file. */
    getProvenance: function (kpiId, sourceId, extra) {
      const k = KPI[kpiId] || {};
      const st = KPI_STATUS[kpiId] || {};
      const src = SOURCES[sourceId] || {};
      const ver = VERSIONS[sourceId] || {};
      return Object.assign({
        title: k.display_name || kpiId,
        formula: k.sql_formula,
        numerator: k.numerator,
        denominator: k.denominator,
        definition: k.business_definition,
        aggregation: k.aggregation_rule,
        comparison: k.valid_comparison_method,
        coverage: k.source_requirements,
        limitations: k.known_limitations,
        institution: src.institution,
        publication: src.official_title || src.dataset_name,
        url: src.source_url,
        file: ver.original_filename || ver.source_table,
        version: ver.sha256_hash ? ver.sha256_hash.slice(0, 16) : null,
        downloaded: ver.downloaded_at ? ver.downloaded_at.slice(0, 10) : null,
        parser: ver.parser_version,
        status: st.status,
        statusReason: st.reason
      }, extra || {});
    },

    // ---- 01 overview -----------------------------------------------------
    getPOSMarketTrend: function (defKey) {
      return DB.pos_monthly[defKey || DEFAULT_DEF] || [];
    },
    getExecutiveOverview: function (defKey, yearMonth) {
      const key = defKey || DEFAULT_DEF;
      const rows = DB.pos_monthly[key] || [];
      if (!rows.length) return null;
      let row = null;
      if (yearMonth) {
        row = rows.filter(function (r) { return r.year_month === yearMonth; })[0] || null;
      }
      if (!row) {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (!UI.isNil(rows[i].tx_count)) { row = rows[i]; break; }
        }
      }
      return { definition: DEFS[key], period: row && row.year_month,
               current: row, signal: DB.signals[key] || null };
    },
    getMarketSignals: function (defKey) { return DB.signals[defKey || DEFAULT_DEF] || null; },

    /** Available periods for the command bar, newest first. */
    getPeriods: function (defKey) {
      return (DB.pos_monthly[defKey || DEFAULT_DEF] || [])
        .filter(function (r) { return !UI.isNil(r.tx_count); })
        .map(function (r) { return r.year_month; }).reverse();
    },

    /** Period-vs-period comparison, only where both months exist. */
    compare: function (defKey, aYm, bYm) {
      const rows = DB.pos_monthly[defKey || DEFAULT_DEF] || [];
      const by = index(rows, 'year_month');
      const a = by[aYm], b = by[bYm];
      if (!a || !b) return null;
      function d(k) {
        if (UI.isNil(a[k]) || UI.isNil(b[k]) || !b[k]) return null;
        return a[k] / b[k] - 1;
      }
      return { a: a, b: b, deltas: {
        terminal_stock: d('terminal_stock'), tx_count: d('tx_count'),
        tx_value: d('tx_value'), tx_per_avg_pos: d('tx_per_avg_pos'),
        value_per_avg_pos: d('value_per_avg_pos'), avg_ticket: d('avg_ticket') } };
    },

    // ---- 02 payments -----------------------------------------------------
    getPaymentBehaviour: function () {
      return { channelMix: DB.channel_mix, cards: DB.cards };
    },
    /** Last month in which a given channel actually reports the field. */
    lastMonthWith: function (channel, field) {
      const mix = DB.channel_mix;
      for (let i = mix.length - 1; i >= 0; i--) {
        const c = mix[i].channels[channel];
        if (c && !UI.isNil(c[field])) return mix[i];
      }
      return null;
    },

    // ---- 03 / 04 geography ----------------------------------------------
    getGeographicFootprint: function () { return DB.geo; },
    getEconomicContext: function () {
      return DB.geo.filter(function (g) { return !UI.isNil(g.taxpayers); });
    },

    // ---- 05 sectors ------------------------------------------------------
    getSectorIntelligence: function (opts) {
      const o = opts || {};
      const rows = o.municipality && o.municipality !== 'All'
        ? DB.atk_muni_sector_year.filter(function (r) { return r.municipality === o.municipality; })
        : DB.atk_sector_year;
      return rows.filter(function (r) { return !o.year || r.year === o.year; });
    },
    getMunicipalityTotals: function (year) {
      return DB.atk_muni_year.filter(function (r) { return !year || r.year === year; });
    },
    getSectorDictionary: function () { return DB.sectors; },
    atkYears: function () {
      const s = {};
      DB.atk_sector_year.forEach(function (r) { s[r.year] = 1; });
      return Object.keys(s).map(Number).sort();
    },

    // ---- 06 assurance ----------------------------------------------------
    getDataStatus: function () {
      const q = DB.quality || [];
      const st = DB.kpi_status || [];
      return {
        meta: DB.meta,
        sources: DB.sources,
        versions: DB.source_versions,
        checks: q,
        reconciliation: DB.reconciliation || [],
        coverage: DB.coverage || [],
        kpiStatus: st,
        passed: q.filter(function (c) { return c.status === 'passed'; }).length,
        failed: q.filter(function (c) { return c.status === 'failed'; }).length,
        high: q.filter(function (c) {
          return c.status === 'failed' && c.severity === 'high'; }).length,
        blocked: st.filter(function (s) { return s.status === 'BLOCKED'; }).length,
        warnings: st.filter(function (s) { return s.status === 'WARNING'; }).length
      };
    },

    // ---- operational levers ---------------------------------------------
    /** The spine: card value over declared turnover, all three institutions. */
    getPenetration: function () { return (DB.levers || {}).penetration || null; },

    /** Which parts of the economy grew, and whether a card could settle them. */
    getSectorMomentum: function () { return (DB.levers || {}).sector_momentum || null; },

    /** Where the money still is: ATM withdrawals against card spend. */
    getCashPool: function () { return (DB.levers || {}).cash || null; },

    /** Credit versus debit — the mix that moves margin, not volume. */
    getCardMix: function () { return (DB.levers || {}).card_mix || null; },

    /** Is card value growing faster than retail trade itself? */
    getRetailCapture: function () { return (DB.levers || {}).retail_capture || null; },

    /** Kosovo against the euro area, on the ECB's own reference half-year. */
    getBenchmarks: function () { return (DB.levers || {}).benchmarks || null; },

    /** Where acceptance lags the local economy. */
    getHeadroom: function () { return (DB.levers || {}).headroom || null; },

    /** The small, fast channels. */
    getEmergingChannels: function () { return (DB.levers || {}).emerging || null; },

    getRetailIndex: function () { return DB.retail_index || null; },
    getEnterprises: function () { return DB.enterprises || null; },

    // ---- market pulse ----------------------------------------------------
    /** 3–5 material, validated movements. Facts only. */
    getMarketPulse: function (defKey) {
      const sig = DB.signals[defKey || DEFAULT_DEF];
      if (!sig) return [];
      const out = [];
      function add(v, text, invertGood) {
        if (UI.isNil(v)) return;
        const dir = Math.abs(v) < 0.005 ? 'flat' : (v > 0 ? 'up' : 'down');
        out.push({ dir: dir, text: text, value: UI.signedPct(v),
                   good: invertGood ? v < 0 : v > 0 });
      }
      add(sig.usage_growth, 'POS transaction volume');
      add(sig.infrastructure_growth, 'POS terminal network');
      add(sig.productivity_growth, 'Transactions per terminal');
      add(sig.average_ticket_growth, 'Average ticket size', true);
      add(sig.value_productivity_growth, 'Value processed per terminal');
      return out.slice(0, 5);
    }
  };

  global.DataAccess = API;
})(window);
