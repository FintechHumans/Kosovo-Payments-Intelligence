/* ===========================================================================
   Data access layer (spec §26)

   Every page calls these functions and nothing else. No component reaches
   past this file for a number, and no KPI is re-derived here — the formulas
   live once, in the ETL and in the matching analytics views.

   Today the source is the curated payload the ETL emits. When a Supabase
   project is live, only the SOURCE block below changes: each function keeps
   its name, arguments and return shape, because the analytics views were
   written to return exactly these columns.

       const { data } = await supabase
         .from('vw_pos_market_monthly')
         .select('*')
         .eq('definition_id', definitionId);

   =========================================================================== */
(function (global) {
  'use strict';

  // ---- SOURCE ------------------------------------------------------------
  const DB = global.KPI_DATA;
  if (!DB) throw new Error('data.js did not load');

  const DEFAULT_DEF = 'pos_rm_allcards';

  // ---- helpers -----------------------------------------------------------
  function byKey(list, key) {
    const out = {};
    list.forEach(function (r) { out[r[key]] = r; });
    return out;
  }

  function latestOf(rows, field) {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][field] !== null && rows[i][field] !== undefined) return rows[i];
    }
    return null;
  }

  // ---- public API --------------------------------------------------------
  const API = {

    meta: function () { return DB.meta; },

    /* Every POS universe BQK publishes, so the UI can name the active one. */
    getDefinitions: function () { return DB.definitions; },

    getDefinition: function (key) {
      return DB.definitions.filter(function (d) { return d.metric_key === key; })[0];
    },

    defaultDefinition: function () { return DEFAULT_DEF; },

    /* Page 1 — headline KPIs for the selected universe and period. */
    getExecutiveOverview: function (defKey, yearMonth) {
      const key = defKey || DEFAULT_DEF;
      const rows = DB.pos_monthly[key] || [];
      if (!rows.length) return null;
      const idx = yearMonth
        ? rows.findIndex(function (r) { return r.year_month === yearMonth; })
        : rows.length - 1;
      const cur = rows[idx < 0 ? rows.length - 1 : idx];
      const withTx = latestOf(rows.slice(0, (idx < 0 ? rows.length : idx + 1)), 'tx_count');
      return {
        definition: API.getDefinition(key),
        period: cur.year_month,
        current: cur,
        latestWithTransactions: withTx,
        signal: DB.signals[key] || null
      };
    },

    /* Page 1 — the full monthly series behind the charts. */
    getPOSMarketTrend: function (defKey) {
      return DB.pos_monthly[defKey || DEFAULT_DEF] || [];
    },

    /* Page 1 — computed, never hard-coded (spec §11). */
    getMarketSignals: function (defKey) {
      return DB.signals[defKey || DEFAULT_DEF] || null;
    },

    /* Page 2 — channel mix with shares, plus card stock composition. */
    getPaymentBehaviour: function () {
      return {
        channelMix: DB.channel_mix,
        cards: DB.cards
      };
    },

    /* Page 3 / 4 — the seven cities BQK names, for the one shared year. */
    getMunicipalityIntelligence: function () { return DB.geo; },

    /* Page 4 / 5 — ATK economic activity. */
    getSectorIntelligence: function (opts) {
      const o = opts || {};
      if (o.municipality) {
        return DB.atk_muni_sector_year.filter(function (r) {
          return r.municipality === o.municipality && (!o.year || r.year === o.year);
        });
      }
      return DB.atk_sector_year.filter(function (r) {
        return !o.year || r.year === o.year;
      });
    },

    getMunicipalityTotals: function (year) {
      return DB.atk_muni_year.filter(function (r) { return !year || r.year === year; });
    },

    getNationalTurnoverMonthly: function () { return DB.atk_national_month; },

    getSectorDictionary: function () { return DB.sectors; },

    atkYears: function () {
      const ys = {};
      DB.atk_sector_year.forEach(function (r) { ys[r.year] = 1; });
      return Object.keys(ys).map(Number).sort();
    },

    /* Page 6 — provenance and quality, for the management-facing panel. */
    getDataStatus: function () {
      const q = DB.quality || [];
      return {
        meta: DB.meta,
        sources: DB.sources,
        checks: q,
        passed: q.filter(function (c) { return c.status === 'passed'; }).length,
        failed: q.filter(function (c) { return c.status === 'failed'; }).length,
        high: q.filter(function (c) {
          return c.status === 'failed' && c.severity === 'high';
        }).length
      };
    }
  };

  global.DataAccess = API;
})(window);
