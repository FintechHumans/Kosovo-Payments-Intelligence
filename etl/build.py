#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the curated layer from official BQK and ATK publications.

Runs the pipeline the specification asks for — download, parse, validate,
normalise, load — and emits two things from the same curated tables:

  data/curated/*.json   the payload the dashboard reads
  data/curated/seed.sql INSERTs against the Supabase schema in ../sql

Both come from one set of in-memory tables, so the dashboard and the database
cannot drift apart. When a Supabase project is live, seed.sql loads it and the
dashboard's data layer switches from the JSON files to the analytics views
without any other change.

Idempotent: rerunning over the same publications rewrites the same rows. Every
figure is recomputed from source on each run rather than appended, so a
restated period is corrected rather than frozen.
"""
import json
import hashlib
import os
import sys
import calendar
import datetime
import collections

import openpyxl

import mappings as M

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_ATK = os.path.join(BASE, 'data', 'raw', 'atk')
CURATED = os.path.join(BASE, 'data', 'curated')
BQK_BLOB = r"C:\Users\TechStore\Desktop\Cloude projects\BQK\app\_data_blob.js"

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December']
MN = {m: i + 1 for i, m in enumerate(MONTHS)}

# in-memory curated tables
T = collections.defaultdict(list)
QUALITY = []
RUN_STARTED = datetime.datetime.now(datetime.timezone.utc)


def check(check_type, severity, ok, message, table=None, reporting_period=None,
          expected=None, actual=None, source_id=None):
    QUALITY.append(dict(check_type=check_type, severity=severity,
                        status='passed' if ok else 'failed', message=message,
                        table_name=table, reporting_period=reporting_period,
                        expected_value=None if expected is None else str(expected),
                        actual_value=None if actual is None else str(actual),
                        source_id=source_id))
    return ok


def ym_to_id(y, m):
    return y * 100 + m


def norm_period(p):
    """'2026 July' or '2026-07' -> (year, month)."""
    s = str(p)
    if '-' in s:
        a, b = s.split('-')[:2]
        return int(a), int(b)
    a, b = s.split()
    return int(a), MN[b]


# ===========================================================================
# 1. SOURCES
# ===========================================================================
def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:32]


def register_sources(atk_years):
    now = RUN_STARTED.isoformat()
    T['data_sources'].append(dict(
        source_id='BQK_RAPORT_MUJOR', institution='BQK',
        dataset_name='Raporti Mujor i Sistemit të Pagesave',
        source_url='https://bqk-kos.org/statistikat/?lang=en',
        source_table='Terminalet për pagesa; Trans. sipas terminaleve; Kartelat bankare; '
                     'Pagesat sipas instrumenteve; Llogaritë e klientëve',
        publication_date=None, reporting_start_date='2025-01-01',
        reporting_end_date=None, frequency='monthly', file_type='XLSX',
        downloaded_at=now, source_hash=None,
        methodology_notes=(
            'Parsed from the official monthly workbook. Terminal counts and POS '
            'transaction counts come from the same publication, so productivity '
            'ratios share a universe. Series begins January 2025 and is NOT '
            'continuous with the annual report series.'),
        is_active=True))
    T['data_sources'].append(dict(
        source_id='BQK_T15', institution='BQK',
        dataset_name='Table 15 — Payment System',
        source_url='https://bqk-kos.org/repository/docs/time_series/',
        source_table='15_Payment_System',
        publication_date=None, reporting_start_date='2007-03-01',
        reporting_end_date=None, frequency='monthly', file_type='XLS',
        downloaded_at=now, source_hash=None,
        methodology_notes=('Long-run payment system series. Counts published in '
                           'thousands and scaled on load. No terminal count exists '
                           'on this basis, so productivity is not computed for it.'),
        is_active=True))
    T['data_sources'].append(dict(
        source_id='BQK_CARDS_ANNUAL', institution='BQK',
        dataset_name='Use of Bank Cards in Kosovo (September 2025 edition)',
        source_url='https://bqk-kos.org/repository/docs/SistemiIPagesave/'
                   'Use%20of%20bank%20cards%20in%20Kosovo.pdf?lang=en',
        source_table='Table 2; Figures 2, 4, 26, 27',
        publication_date='2025-09-01', reporting_start_date='2024-01-01',
        reporting_end_date='2024-12-31', frequency='annual', file_type='PDF',
        downloaded_at=now, source_hash=None,
        methodology_notes=('City distribution read from charts inside the PDF, not '
                           'from a published table. Figures 26 and 27 combine ATM '
                           'AND POS transactions and are labelled as such.'),
        is_active=True))
    for y in atk_years:
        path = os.path.join(RAW_ATK, 'Qarkullimi-%d.xlsx' % y)
        T['data_sources'].append(dict(
            source_id='ATK_QARKULLIMI_%d' % y, institution='ATK',
            dataset_name='Open Data — Qarkullimi %d' % y,
            source_url='https://www.atk-ks.org/en/open-data/',
            source_table='OD_QarkDataSet',
            publication_date=None,
            reporting_start_date='%d-01-01' % y, reporting_end_date='%d-12-31' % y,
            frequency='monthly', file_type='XLSX',
            downloaded_at=now, source_hash=file_hash(path),
            methodology_notes=('Aggregated turnover and taxpayer counts by month, '
                               'municipality, sector and legal form. No taxpayer-level '
                               'record is present or used.'),
            is_active=True))


# ===========================================================================
# 2. DIMENSIONS
# ===========================================================================
def build_dim_date(periods):
    for (y, m) in sorted(periods):
        T['dim_date'].append(dict(
            date_id=ym_to_id(y, m),
            period_date='%04d-%02d-01' % (y, m),
            year=y, quarter=(m - 1) // 3 + 1, month=m,
            year_month='%04d-%02d' % (y, m), month_name=MONTHS[m - 1]))


GEO_ID = {}


def build_dim_geography(atk_munis):
    rows = []
    rows.append(dict(geography_id=1, municipality_code='XK',
                     standardized_name='Kosovo', atk_name=None, bqk_name='Kosovo',
                     region=None, match_status='matched'))
    GEO_ID['Kosovo'] = 1
    gid = 2
    for raw in sorted(atk_munis):
        std = M.standardize(raw)
        is_bqk = std in M.BQK_CITIES
        rows.append(dict(geography_id=gid, municipality_code=None,
                         standardized_name=std, atk_name=raw,
                         bqk_name=std if is_bqk else None,
                         region=M.REGION.get(raw),
                         match_status='matched' if is_bqk else 'atk_only'))
        GEO_ID[std] = gid
        gid += 1
    T['dim_geography'] = rows

    missing = [c for c in M.BQK_CITIES if c not in GEO_ID]
    check('geography_mapping', 'high', not missing,
          'All 7 BQK cities resolve against the ATK municipality list'
          if not missing else 'BQK cities not found in ATK list: %s' % missing,
          table='core.dim_geography', expected=0, actual=len(missing))
    unmatched = sum(1 for r in rows if r['match_status'] == 'atk_only')
    check('geography_coverage', 'warning', False,
          '%d of %d municipalities have no BQK terminal data; BQK names only 7 cities'
          % (unmatched, len(rows) - 1),
          table='core.dim_geography', expected='0 unmatched', actual=unmatched)


SECTOR_ID = {}


def build_dim_sector(atk_sectors):
    rows = []
    unmapped = []
    for i, raw in enumerate(sorted(atk_sectors), start=1):
        entry = M.SECTOR_ADDRESSABILITY.get(raw)
        if entry is None:
            unmapped.append(raw)
            entry = (raw, 'review_required', 'Not present in the addressability map.')
        disp, cat, note = entry
        rows.append(dict(sector_id=i, source_sector_name=raw,
                         standardized_sector=disp, parent_sector=None,
                         addressability_category=cat, addressability_notes=note))
        SECTOR_ID[raw] = i
    T['dim_sector'] = rows
    check('sector_mapping', 'high', not unmapped,
          'Every ATK sector has an explicit addressability class'
          if not unmapped else 'Sectors missing from the map: %s' % unmapped,
          table='core.dim_sector', expected=0, actual=len(unmapped))


DEF_ID = {}


def build_dim_definitions():
    for i, d in enumerate(M.DEFINITIONS, start=1):
        r = dict(d)
        r['definition_id'] = i
        DEF_ID[d['metric_key']] = i
        T['dim_metric_definition'].append(r)


CHANNEL_ID, CARD_ID, SCHEME_ID = {}, {}, {}


def build_small_dims():
    for i, (name, grp) in enumerate([
            ('POS', 'Card'), ('ATM Withdrawal', 'Cash'), ('ATM Deposit', 'Cash'),
            ('E-commerce', 'Card'), ('Digital Wallet', 'Card'),
            ('E-money', 'Other'), ('Credit Transfer', 'Transfer')], start=1):
        T['dim_channel'].append(dict(channel_id=i, channel_name=name, channel_group=grp))
        CHANNEL_ID[name] = i
    for i, name in enumerate(['All cards', 'Debit', 'Credit', 'Delayed debit',
                              'Contactless', 'Contact'], start=1):
        T['dim_card_type'].append(dict(card_type_id=i, card_type_name=name))
        CARD_ID[name] = i
    for i, name in enumerate(['All schemes', 'Visa', 'Mastercard', 'Other'], start=1):
        T['dim_scheme'].append(dict(scheme_id=i, scheme_name=name))
        SCHEME_ID[name] = i


# ===========================================================================
# 3. BQK FACTS
# ===========================================================================
def load_bqk_blob():
    s = open(BQK_BLOB, encoding='utf-8').read().strip()
    return json.loads(s[s.index('=') + 1:].rstrip(';'))


def build_bqk(D):
    terms = {r['period']: r for r in D['terminals']}
    tx = {r['period']: r for r in D['terminal_tx']}
    periods = sorted(set(terms) & set(tx))

    # --- default universe: Raport Mujor, terminals and transactions together
    did = DEF_ID['pos_rm_allcards']
    for p in periods:
        y, m = norm_period(p)
        t, x = terms[p], tx[p]
        T['fact_bqk_pos'].append(dict(
            date_id=ym_to_id(y, m), definition_id=did, geography_id=1,
            source_id='BQK_RAPORT_MUJOR',
            pos_terminals=t['total_pos'], eftpos=t['eftpos'],
            virtual_pos=t['virtual_pos'],
            merchants_physical=t['merchants_physical'],
            merchants_virtual=t['merchants_virtual'],
            transaction_count=x['pos_card_count'],
            transaction_value=round(x['pos_card_value'], 2)))
        T['fact_bqk_atm'].append(dict(
            date_id=ym_to_id(y, m), definition_id=did, source_id='BQK_RAPORT_MUJOR',
            atm_count=t['total_atm'],
            withdrawal_count=x['atm_cash_count'],
            withdrawal_value=round(x['atm_cash_value'], 2),
            deposit_count=x['atm_deposit_count'],
            deposit_value=round(x['atm_deposit_value'], 2)))

    # --- T15 long series (counts published in thousands)
    idx = collections.defaultdict(dict)
    for r in D['payments']:
        y, m = norm_period(r['period'])
        idx[r['indicator']][(y, m)] = r
    dom, frn = idx['POS Domestic'], idx['POS Foreign Cards in Kosovo']
    for key, keys in (('pos_t15_domestic', ('POS Domestic',)),
                      ('pos_t15_allcards', ('POS Domestic', 'POS Foreign Cards in Kosovo'))):
        did2 = DEF_ID[key]
        for (y, m) in sorted(dom):
            c = v = None
            for k in keys:
                r = idx[k].get((y, m))
                if r is None:
                    continue
                if r.get('count') is not None:
                    c = (c or 0) + r['count'] * 1000
                if r.get('amount') is not None:
                    v = (v or 0) + r['amount'] * 1e6
            if c is None and v is None:
                continue
            T['fact_bqk_pos'].append(dict(
                date_id=ym_to_id(y, m), definition_id=did2, geography_id=1,
                source_id='BQK_T15', pos_terminals=None, eftpos=None,
                virtual_pos=None, merchants_physical=None, merchants_virtual=None,
                transaction_count=c, transaction_value=None if v is None else round(v, 2)))

    # --- cards
    for r in D['cards']:
        y, m = norm_period(r['period'])
        d = ym_to_id(y, m)
        for card, scheme, col in [
                ('All cards', 'All schemes', 'total'), ('Debit', 'All schemes', 'debit'),
                ('Credit', 'All schemes', 'credit'),
                ('Delayed debit', 'All schemes', 'delayed_debit'),
                ('Contactless', 'All schemes', 'contactless'),
                ('Contact', 'All schemes', 'contact'),
                ('All cards', 'Visa', 'visa'), ('All cards', 'Mastercard', 'mastercard')]:
            T['fact_bqk_cards'].append(dict(
                date_id=d, card_type_id=CARD_ID[card], scheme_id=SCHEME_ID[scheme],
                definition_id=DEF_ID['pos_rm_allcards'], source_id='BQK_RAPORT_MUJOR',
                cards_issued=r[col], transaction_count=None, transaction_value=None))

    # --- channel mix
    pc = {r['period']: r for r in D['payments_count']}
    pv = {r['period']: r for r in D['payments_value']}
    for p, r in sorted(pc.items()):
        y, m = norm_period(p)
        val = pv.get(p, {})
        for ch, col in [('E-commerce', 'ecommerce'), ('Digital Wallet', 'digital_wallet'),
                        ('E-money', 'emoney'), ('Credit Transfer', 'credit_transfer')]:
            T['fact_bqk_digital_payments'].append(dict(
                date_id=ym_to_id(y, m), channel_id=CHANNEL_ID[ch],
                definition_id=DEF_ID['pos_rm_allcards'], source_id='BQK_RAPORT_MUJOR',
                transaction_count=r.get(col),
                transaction_value=val.get(col)))
    for p in periods:      # POS and ATM as channels, from the terminal sheet
        y, m = norm_period(p)
        x = tx[p]
        for ch, cc, vc in [('POS', 'pos_card_count', 'pos_card_value'),
                           ('ATM Withdrawal', 'atm_cash_count', 'atm_cash_value'),
                           ('ATM Deposit', 'atm_deposit_count', 'atm_deposit_value')]:
            T['fact_bqk_digital_payments'].append(dict(
                date_id=ym_to_id(y, m), channel_id=CHANNEL_ID[ch],
                definition_id=DEF_ID['pos_rm_allcards'], source_id='BQK_RAPORT_MUJOR',
                transaction_count=x[cc], transaction_value=round(x[vc], 2)))

    # --- annual geography, 7 cities, from the PDF charts
    unver = []
    for city, (pos_pct, atm_pct, tx_cnt, tx_val) in M.BQK_GEO_2024.items():
        gid = GEO_ID.get(city)
        if gid is None:
            continue
        if city not in M.BQK_GEO_PAIRING_VERIFIED:
            unver.append(city)
        T['fact_bqk_geo_annual'].append(dict(
            year=2024, geography_id=gid, source_id='BQK_CARDS_ANNUAL',
            pos_share_pct=pos_pct, atm_share_pct=atm_pct,
            pos_terminals_estimated=round(M.BQK_POS_TOTAL_2024 * pos_pct / 100.0),
            atm_pos_transaction_count=tx_cnt, atm_pos_transaction_value=tx_val,
            extraction_method='pdf_chart_manual'))

    check('pdf_chart_pairing', 'high', False,
          'City shares are read from a PDF chart; the legend-to-value pairing is '
          'confirmed only for Prishtinë. Verify %s against Figure 4 before relying '
          'on the ranking.' % ', '.join(sorted(unver)),
          table='core.fact_bqk_geo_annual', reporting_period='2024',
          expected='verified pairing', actual='%d cities unverified' % len(unver),
          source_id='BQK_CARDS_ANNUAL')

    share_sum = sum(v[0] for v in M.BQK_GEO_2024.values())
    check('geo_share_total', 'info', share_sum < 100,
          'The 7 named cities hold %.2f%% of the POS network; the remaining %.2f%% '
          'is spread across municipalities BQK does not name.' % (share_sum, 100 - share_sum),
          table='core.fact_bqk_geo_annual', reporting_period='2024',
          expected='<100', actual=round(share_sum, 2), source_id='BQK_CARDS_ANNUAL')

    # --- the discontinuity that must never be spliced
    first = min(periods)
    first_val = terms[first]['total_pos']
    check('series_discontinuity', 'high', False,
          'Annual report records %s POS terminals at end-2024 while the monthly '
          'series opens at %s in %s — a 20%% step in one month. Different universes; '
          'the two series are never joined.'
          % ('{:,}'.format(M.BQK_POS_TOTAL_2024), '{:,}'.format(int(first_val)), first),
          table='core.fact_bqk_pos', reporting_period=first,
          expected=M.BQK_POS_TOTAL_2024, actual=int(first_val))

    # --- the 15% definitional gap between the two POS universes
    gaps = []
    for p in periods:
        y, m = norm_period(p)
        d, f = dom.get((y, m)), frn.get((y, m))
        if not d or d.get('count') is None:
            continue
        t15 = (d['count'] + (f['count'] if f and f.get('count') is not None else 0)) * 1000
        rm = tx[p]['pos_card_count']
        if t15:
            gaps.append((rm - t15) / t15)
    if gaps:
        lo, hi = min(gaps) * 100, max(gaps) * 100
        check('definition_gap', 'high', False,
              'Raport Mujor exceeds Table 15 (domestic + foreign) by %.1f%%–%.1f%% in '
              'every one of the %d overlapping months. The gap is definitional, not an '
              'error; the two universes are never summed or spliced.' % (lo, hi, len(gaps)),
              table='core.fact_bqk_pos', expected='same universe',
              actual='%.1f%% mean gap' % (sum(gaps) / len(gaps) * 100))

    # --- monotonic sanity on a stock series
    bad = [p for a, p in zip(periods, periods[1:])
           if terms[p]['total_pos'] < terms[a]['total_pos'] * 0.9]
    check('impossible_movement', 'high', not bad,
          'No month-on-month fall greater than 10% in the POS terminal stock'
          if not bad else 'Implausible drop in POS terminals at %s' % bad,
          table='core.fact_bqk_pos', expected=0, actual=len(bad))

    # --- missing months
    allm = sorted(ym_to_id(*norm_period(p)) for p in periods)
    gaps2 = []
    for a, b in zip(allm, allm[1:]):
        ay, am = divmod(a, 100)
        expected = ay * 100 + am + 1 if am < 12 else (ay + 1) * 100 + 1
        if b != expected:
            gaps2.append(expected)
    check('missing_months', 'warning', not gaps2,
          'Monthly BQK series is complete with no gaps'
          if not gaps2 else 'Missing months: %s' % gaps2,
          table='core.fact_bqk_pos', expected=0, actual=len(gaps2))

    return periods


# ===========================================================================
# 4. ATK FACTS
# ===========================================================================
def load_atk_year(year):
    path = os.path.join(RAW_ATK, 'Qarkullimi-%d.xlsx' % year)
    if not os.path.exists(path):
        return []
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    out, seen_header, rejected = [], False, 0
    for r in ws.iter_rows(values_only=True):
        v = r[1] if len(r) > 1 else None
        if not seen_header:
            if isinstance(v, str) and 'Viti' in v:
                seen_header = True
            continue
        if not isinstance(v, (int, float)):
            continue
        try:
            y, m = int(v), int(r[2])
            sector = (r[3] or '').strip()
            muni = (r[6] or '').strip()
            n = float(r[9] or 0)
            turn = float(r[10] or 0)
        except (TypeError, ValueError, IndexError):
            rejected += 1
            continue
        if not (1 <= m <= 12) or not sector or not muni:
            rejected += 1
            continue
        out.append((y, m, sector, muni, n, turn))
    wb.close()
    if rejected:
        check('row_rejected', 'info', True,
              '%d malformed rows skipped in Qarkullimi-%d' % (rejected, year),
              table='raw.atk_turnover', reporting_period=str(year),
              actual=rejected, source_id='ATK_QARKULLIMI_%d' % year)
    return out


def build_atk(years):
    agg = collections.defaultdict(lambda: [0.0, 0.0])
    munis, sectors, periods = set(), set(), set()
    per_year = {}
    for y in years:
        rows = load_atk_year(y)
        per_year[y] = len(rows)
        for (yy, m, sector, muni, n, turn) in rows:
            munis.add(muni)
            sectors.add(sector)
            periods.add((yy, m))
            k = (yy, m, muni, sector)
            agg[k][0] += n
            agg[k][1] += turn
        check('source_loaded', 'info', bool(rows),
              'Qarkullimi-%d: %s rows parsed' % (y, '{:,}'.format(len(rows))),
              table='raw.atk_turnover', reporting_period=str(y),
              actual=len(rows), source_id='ATK_QARKULLIMI_%d' % y)
    return agg, munis, sectors, periods, per_year


def emit_atk_facts(agg):
    neg = 0
    for (y, m, muni, sector, ), _ in []:
        pass
    for (y, m, muni, sector), (n, turn) in agg.items():
        if turn < 0:
            neg += 1
        T['fact_atk_turnover'].append(dict(
            date_id=ym_to_id(y, m), geography_id=GEO_ID[M.standardize(muni)],
            sector_id=SECTOR_ID[sector], source_id='ATK_QARKULLIMI_%d' % y,
            business_count=n, turnover=round(turn, 2)))
    check('negative_turnover', 'warning', neg == 0,
          'No negative turnover cells' if neg == 0
          else '%d municipality-sector months report negative turnover (credit notes '
               'and corrections); kept as published, not clipped' % neg,
          table='core.fact_atk_turnover', expected=0, actual=neg)


# ===========================================================================
# 5. ANALYTICAL AGGREGATES for the dashboard payload
# ===========================================================================
def pos_monthly(definition_key):
    did = DEF_ID[definition_key]
    rows = sorted((r for r in T['fact_bqk_pos'] if r['definition_id'] == did),
                  key=lambda r: r['date_id'])
    out = []
    terms = [r['pos_terminals'] for r in rows]
    for i, r in enumerate(rows):
        window = [t for t in terms[max(0, i - 11):i + 1] if t is not None]
        avg12 = sum(window) / len(window) if window else None
        prev = rows[i - 12] if i >= 12 else None
        rec = dict(
            year_month='%04d-%02d' % divmod(r['date_id'], 100),
            pos_terminals=r['pos_terminals'],
            merchants=r['merchants_physical'],
            tx_count=r['transaction_count'],
            tx_value=r['transaction_value'],
            tx_per_pos=(r['transaction_count'] / avg12) if (avg12 and r['transaction_count']) else None,
            value_per_pos=(r['transaction_value'] / avg12) if (avg12 and r['transaction_value']) else None,
            avg_ticket=(r['transaction_value'] / r['transaction_count'])
                       if (r['transaction_count'] and r['transaction_value']) else None,
        )
        for name, col in (('pos_yoy', 'pos_terminals'), ('tx_yoy', 'transaction_count'),
                          ('value_yoy', 'transaction_value')):
            rec[name] = None
            if prev and prev.get(col) and r.get(col):
                rec[name] = r[col] / prev[col] - 1
        out.append(rec)
    return out


def market_signals(definition_key):
    """Like-for-like: the complete months of the latest year against the same
    months a year earlier. A part-year never distorts the comparison."""
    rows = pos_monthly(definition_key)
    byym = {r['year_month']: r for r in rows}
    if not rows:
        return None
    last = rows[-1]['year_month']
    ly, lm = int(last[:4]), int(last[5:7])
    cur = [byym.get('%04d-%02d' % (ly, m)) for m in range(1, lm + 1)]
    prv = [byym.get('%04d-%02d' % (ly - 1, m)) for m in range(1, lm + 1)]
    pairs = [(a, b) for a, b in zip(cur, prv)
             if a and b and a['tx_count'] and b['tx_count']]
    if not pairs:
        return None

    def s(side, key):
        return sum(p[side][key] for p in pairs)

    def a(side, key):
        vals = [p[side][key] for p in pairs if p[side][key]]
        return sum(vals) / len(vals) if vals else None

    tx_c, tx_p = s(0, 'tx_count'), s(1, 'tx_count')
    vl_c, vl_p = s(0, 'tx_value'), s(1, 'tx_value')
    pos_c, pos_p = a(0, 'pos_terminals'), a(1, 'pos_terminals')
    if not (pos_c and pos_p):
        return None
    return dict(
        through=last, months=len(pairs),
        compare_from='%04d-01' % (ly - 1), compare_to='%04d-%02d' % (ly - 1, lm),
        infrastructure_growth=pos_c / pos_p - 1,
        usage_growth=tx_c / tx_p - 1,
        value_growth=vl_c / vl_p - 1,
        productivity_growth=(tx_c / pos_c) / (tx_p / pos_p) - 1,
        value_productivity_growth=(vl_c / pos_c) / (vl_p / pos_p) - 1,
        average_ticket_growth=(vl_c / tx_c) / (vl_p / tx_p) - 1,
        usage_minus_infra_pp=(tx_c / tx_p) - (pos_c / pos_p),
        tx_current=tx_c, tx_prior=tx_p,
        pos_current=pos_c, pos_prior=pos_p,
        ticket_current=vl_c / tx_c, ticket_prior=vl_p / tx_p)


def sector_rollups(agg):
    """Roll monthly ATK rows up to years.

    Turnover is a flow and is summed. The taxpayer count is a STOCK — the
    number of businesses active in that month — so summing it across twelve
    months would report twelve times the real population and deflate every
    per-business ratio by the same factor. It is averaged over the months
    actually present instead.
    """
    def acc():
        return dict(turnover=0.0, bus=0.0, months=set())

    sec_year = collections.defaultdict(acc)
    muni_year = collections.defaultdict(acc)
    muni_sec_year = collections.defaultdict(acc)
    nat_month = collections.defaultdict(lambda: [0.0, 0.0])

    for (y, m, muni, sector), (n, turn) in agg.items():
        std = M.standardize(muni)
        for d, k in ((sec_year, (y, sector)), (muni_year, (y, std)),
                     (muni_sec_year, (y, std, sector))):
            d[k]['turnover'] += turn
            d[k]['bus'] += n
            d[k]['months'].add(m)
        nat_month[(y, m)][0] += n
        nat_month[(y, m)][1] += turn

    def bus(v):
        return round(v['bus'] / max(1, len(v['months'])))

    cat = {r['source_sector_name']: r for r in T['dim_sector']}
    return (
        [dict(year=y, sector=cat[s]['standardized_sector'],
              addressability=cat[s]['addressability_category'],
              businesses=bus(v), turnover=round(v['turnover'], 2))
         for (y, s), v in sorted(sec_year.items())],
        [dict(year=y, municipality=mu, businesses=bus(v), turnover=round(v['turnover'], 2))
         for (y, mu), v in sorted(muni_year.items())],
        [dict(year=y, municipality=mu, sector=cat[s]['standardized_sector'],
              addressability=cat[s]['addressability_category'],
              businesses=bus(v), turnover=round(v['turnover'], 2))
         for (y, mu, s), v in sorted(muni_sec_year.items())],
        [dict(year_month='%04d-%02d' % (y, m), businesses=round(v[0]),
              turnover=round(v[1], 2))
         for (y, m), v in sorted(nat_month.items())],
    )


def geo_intensity(muni_sec_year):
    """The 7 shared cities only, for the one year both sides cover."""
    YEAR = 2024
    by_muni = collections.defaultdict(lambda: dict(businesses=0.0, total=0.0,
                                                   floor=0.0, ceiling=0.0))
    for r in muni_sec_year:
        if r['year'] != YEAR:
            continue
        b = by_muni[r['municipality']]
        b['businesses'] += r['businesses']
        b['total'] += r['turnover']
        if r['addressability'] == 'high':
            b['floor'] += r['turnover']
        if r['addressability'] in ('high', 'review_required'):
            b['ceiling'] += r['turnover']

    out = []
    for g in T['fact_bqk_geo_annual']:
        name = next(x['standardized_name'] for x in T['dim_geography']
                    if x['geography_id'] == g['geography_id'])
        a = by_muni.get(name)
        pos = g['pos_terminals_estimated']
        rec = dict(municipality=name, year=YEAR, pos_share_pct=g['pos_share_pct'],
                   pos_terminals=pos,
                   atm_pos_tx_count=g['atm_pos_transaction_count'],
                   atm_pos_tx_value=g['atm_pos_transaction_value'],
                   verified=name in M.BQK_GEO_PAIRING_VERIFIED)
        if a:
            rec.update(businesses=round(a['businesses']),
                       turnover_total=round(a['total'], 2),
                       addressable_floor=round(a['floor'], 2),
                       addressable_ceiling=round(a['ceiling'], 2),
                       pos_per_1000_businesses=pos / a['businesses'] * 1000 if a['businesses'] else None,
                       pos_per_eur1m_floor=pos / a['floor'] * 1e6 if a['floor'] else None,
                       pos_per_eur1m_ceiling=pos / a['ceiling'] * 1e6 if a['ceiling'] else None,
                       turnover_per_pos=a['total'] / pos if pos else None)
        out.append(rec)
    return sorted(out, key=lambda r: -(r['pos_share_pct'] or 0))


# ===========================================================================
# 6. SQL SEED
# ===========================================================================
def sql_literal(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


SEED_ORDER = [
    ('audit.data_sources', 'data_sources'),
    ('core.dim_date', 'dim_date'),
    ('core.dim_geography', 'dim_geography'),
    ('core.dim_sector', 'dim_sector'),
    ('core.dim_channel', 'dim_channel'),
    ('core.dim_card_type', 'dim_card_type'),
    ('core.dim_scheme', 'dim_scheme'),
    ('core.dim_metric_definition', 'dim_metric_definition'),
    ('core.fact_bqk_pos', 'fact_bqk_pos'),
    ('core.fact_bqk_atm', 'fact_bqk_atm'),
    ('core.fact_bqk_cards', 'fact_bqk_cards'),
    ('core.fact_bqk_digital_payments', 'fact_bqk_digital_payments'),
    ('core.fact_bqk_geo_annual', 'fact_bqk_geo_annual'),
    ('core.fact_atk_turnover', 'fact_atk_turnover'),
]


def write_seed(path):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('-- Generated by etl/build.py. Idempotent: truncate then reload.\n')
        f.write('-- Run 001_schema.sql and 002_views.sql first.\n\nbegin;\n\n')
        for table, key in reversed(SEED_ORDER):
            f.write('delete from %s;\n' % table)
        f.write('\n')
        for table, key in SEED_ORDER:
            rows = T.get(key) or []
            if not rows:
                continue
            cols = list(rows[0].keys())
            f.write('-- %s (%d rows)\n' % (table, len(rows)))
            for i in range(0, len(rows), 500):
                chunk = rows[i:i + 500]
                f.write('insert into %s (%s) values\n' % (table, ', '.join(cols)))
                f.write(',\n'.join(
                    '  (' + ', '.join(sql_literal(r.get(c)) for c in cols) + ')'
                    for r in chunk))
                f.write(';\n')
            f.write('\n')
        f.write('commit;\n')


# ===========================================================================
# MAIN
# ===========================================================================
def main():
    years = [y for y in range(2019, 2026)
             if os.path.exists(os.path.join(RAW_ATK, 'Qarkullimi-%d.xlsx' % y))]
    print('ATK years found: %s' % years)
    register_sources(years)

    print('Loading ATK ...')
    agg, munis, sectors, atk_periods, per_year = build_atk(years)
    print('  %s municipality-sector-months' % '{:,}'.format(len(agg)))

    print('Loading BQK ...')
    D = load_bqk_blob()

    build_dim_geography(munis)
    build_dim_sector(sectors)
    build_dim_definitions()
    build_small_dims()

    bqk_periods = set()
    for r in D['terminals']:
        bqk_periods.add(norm_period(r['period']))
    for r in D['payments']:
        bqk_periods.add(norm_period(r['period']))
    build_dim_date(atk_periods | bqk_periods)

    periods = build_bqk(D)
    emit_atk_facts(agg)

    # period alignment between the two institutions
    atk_last = max(atk_periods)
    bqk_last = max(bqk_periods)
    lag = (bqk_last[0] - atk_last[0]) * 12 + (bqk_last[1] - atk_last[1])
    check('period_alignment', 'warning', lag == 0,
          'BQK runs to %04d-%02d while ATK ends %04d-%02d — integrated pages lag by '
          '%d months. Never compare a BQK month with an ATK month that does not exist.'
          % (bqk_last[0], bqk_last[1], atk_last[0], atk_last[1], lag),
          table='core.fact_atk_turnover',
          expected='aligned', actual='%d month lag' % lag)

    # ---- dashboard payload
    sec_year, muni_year, muni_sec_year, nat_month = sector_rollups(agg)
    payload = dict(
        meta=dict(
            generated_at=RUN_STARTED.isoformat(),
            bqk_latest='%04d-%02d' % bqk_last,
            atk_latest='%04d-%02d' % atk_last,
            atk_bqk_lag_months=lag,
            atk_years=years,
        ),
        definitions=T['dim_metric_definition'],
        sources=T['data_sources'],
        quality=QUALITY,
        pos_monthly={k: pos_monthly(k) for k in
                     ('pos_rm_allcards', 'pos_t15_domestic', 'pos_t15_allcards')},
        signals={k: market_signals(k) for k in
                 ('pos_rm_allcards', 'pos_t15_domestic', 'pos_t15_allcards')},
        cards=[r for r in D['cards']],
        channel_mix=channel_mix_payload(),
        geo=geo_intensity(muni_sec_year),
        sectors=T['dim_sector'],
        atk_sector_year=sec_year,
        atk_muni_year=muni_year,
        atk_muni_sector_year=muni_sec_year,
        atk_national_month=nat_month,
    )

    os.makedirs(CURATED, exist_ok=True)
    out_json = os.path.join(CURATED, 'dashboard.json')
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'), ensure_ascii=False)
    with open(os.path.join(BASE, 'app', 'data.js'), 'w', encoding='utf-8') as f:
        f.write('window.KPI_DATA=')
        json.dump(payload, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';')

    seed = os.path.join(CURATED, 'seed.sql')
    write_seed(seed)

    # ---- report
    print('\n%-34s %s' % ('TABLE', 'ROWS'))
    print('-' * 52)
    for _, key in SEED_ORDER:
        print('  %-32s %s' % (key, '{:,}'.format(len(T.get(key) or []))))

    print('\nQUALITY CHECKS')
    print('-' * 78)
    for q in QUALITY:
        mark = 'ok  ' if q['status'] == 'passed' else q['severity'][:4].upper()
        print('  [%-4s] %-22s %s' % (mark, q['check_type'], q['message'][:100]))

    sig = payload['signals']['pos_rm_allcards']
    if sig:
        print('\nMARKET SIGNAL — %s, %d months vs same months prior year'
              % (sig['through'], sig['months']))
        for lab, key in [('Infrastructure growth', 'infrastructure_growth'),
                         ('Usage growth', 'usage_growth'),
                         ('Productivity growth', 'productivity_growth'),
                         ('Value per POS growth', 'value_productivity_growth'),
                         ('Average ticket growth', 'average_ticket_growth')]:
            print('  %-24s %+7.2f%%' % (lab, sig[key] * 100))

    print('\nWrote %s (%.1f MB)' % (out_json, os.path.getsize(out_json) / 1e6))
    print('Wrote %s (%.1f MB)' % (seed, os.path.getsize(seed) / 1e6))
    failed = sum(1 for q in QUALITY if q['status'] == 'failed')
    print('\n%d quality findings open (by design — these are source properties, '
          'not defects we can fix).' % failed)
    return 0


def channel_mix_payload():
    chan = {r['channel_id']: r['channel_name'] for r in T['dim_channel']}
    out = collections.defaultdict(dict)
    for r in T['fact_bqk_digital_payments']:
        ym = '%04d-%02d' % divmod(r['date_id'], 100)
        out[ym][chan[r['channel_id']]] = dict(count=r['transaction_count'],
                                              value=r['transaction_value'])
    return [dict(year_month=k, channels=v) for k, v in sorted(out.items())]


if __name__ == '__main__':
    sys.exit(main())
