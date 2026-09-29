/* Where the payload comes from.

   Loaded before data-access.js and before every page script. Its whole job is
   to put a payload on window.KPI_DATA and then get out of the way, so nothing
   downstream has to know or care which source answered.

   TWO SOURCES, ONE SHAPE.

     static    app/data.js, written by the ETL. Always present, always the
               fallback, and the only thing needed to host this on a static
               server with no backend at all.

     supabase  api.derived, one row per payload key, written by
               etl/load_supabase.py. The SQL views beside it serve the
               statistical core; this serves the operational layer that is
               computed in Python and has no natural SQL form.

   WHY BOTH. A cutover that removed the static file would make the report
   depend on a database being awake to say anything at all. It does not need
   to: the numbers are a monthly publication, not live state. Supabase becomes
   the source of truth for what is current; the file stays the guarantee that
   the report renders.

   THE KEY IN THIS FILE IS MEANT TO BE PUBLIC. A Supabase anon key identifies
   the project, it does not grant anything: every table has row-level security,
   only the api schema is granted select, and no insert, update or delete is
   granted to any client role anywhere. A service_role key must never appear
   here, and none does. */
(function (global) {
  'use strict';

  const CONFIG = {
    // Set mode to 'supabase' once etl/load_supabase.py has run. Until then the
    // static payload is authoritative and this file is a no-op.
    mode: 'static',
    url: '',          // e.g. https://<ref>.supabase.co
    anonKey: '',      // publishable anon key — never the service_role key
    timeoutMs: 6000
  };

  global.KPI_SOURCE = { mode: 'static', detail: 'curated payload (data.js)' };

  function fail(why) {
    if (global.console) console.warn('[source] ' + why + ' — using data.js');
    global.KPI_SOURCE = { mode: 'static', detail: 'data.js after fallback',
                          fellBack: true, reason: why };
  }

  // Reassembles the payload from one row per key, which is the shape
  // data-access already expects. A missing key is left to the static payload
  // rather than replaced with an empty object, so a partial load degrades to
  // the last good figures instead of to blanks.
  function merge(rows) {
    const base = global.KPI_DATA || {};
    let n = 0;
    rows.forEach(function (r) {
      if (!r || !r.key || r.payload === null || r.payload === undefined) return;
      base[r.key] = r.payload;
      n++;
    });
    global.KPI_DATA = base;
    return n;
  }

  global.__loadSource = function () {
    if (CONFIG.mode !== 'supabase') return Promise.resolve(global.KPI_SOURCE);
    if (!CONFIG.url || !CONFIG.anonKey) {
      fail('supabase mode is set but url or anonKey is empty');
      return Promise.resolve(global.KPI_SOURCE);
    }
    const ctl = ('AbortController' in global) ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctl) ctl.abort(); },
                             CONFIG.timeoutMs);

    return fetch(CONFIG.url.replace(/\/+$/, '') +
                 '/rest/v1/derived?select=key,payload,parser_version,built_at', {
        headers: { apikey: CONFIG.anonKey,
                   Authorization: 'Bearer ' + CONFIG.anonKey },
        signal: ctl ? ctl.signal : undefined
      })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) throw new Error('no rows');
        const n = merge(rows);
        const built = rows[0] && rows[0].built_at;
        global.KPI_SOURCE = {
          mode: 'supabase', detail: 'api.derived · ' + n + ' keys',
          builtAt: built, parserVersion: rows[0] && rows[0].parser_version
        };
        return global.KPI_SOURCE;
      })
      .catch(function (e) {
        fail(e && e.message ? e.message : String(e));
        return global.KPI_SOURCE;
      })
      .then(function (s) { clearTimeout(timer); return s; });
  };
})(window);
