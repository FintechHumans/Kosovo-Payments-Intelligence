#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the curated layer from official BQK and ATK publications.

Emits, from one set of in-memory tables:
  data/curated/seed.sql   INSERTs against the Supabase schema in ../sql
  app/data.js             the payload the browser reads
so the database and the dashboard cannot drift apart.

Three modelling rules are enforced here rather than left to discipline:

  Stock and flow never share a row. Terminal counts, card counts and ATM counts
  are stocks; transactions and value are flows. They live in separate facts, so
  a stock cannot be summed across months by accident.

  City is not municipality. BQK names seven cities; ATK publishes 38
  municipalities. Both grains exist in dim_geography and any ratio crossing
  them is recorded as an approximation in kpi_build_status.

  Taxpayers are not businesses. ATK publishes registered taxpayers filing in
  the month. The denominator is labelled TAXPAYER throughout.

Idempotent: every period is reparsed on each run, so a restated figure is
corrected rather than frozen.
"""
import json
import hashlib
import os
import sys
import calendar
import datetime
import collections
import statistics

import openpyxl

import mappings as M
import parse_ask
import parse_kba
import levers as LV
from audit_rules import KPI_REGISTRY, derive_kpi_status, PARSER_VERSION

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_ATK = os.path.join(BASE, 'data', 'raw', 'atk')
RAW_BQK = os.path.join(BASE, 'data', 'raw', 'bqk')
RAW_ASK = os.path.join(BASE, 'data', 'raw', 'ask')
# Not data/raw: nothing here was downloaded. The KBA extract was supplied as
# bank totals, so it is committed with the project and carries no file hash.
SUPPLIED = os.path.join(BASE, 'data', 'supplied')
CURATED = os.path.join(BASE, 'data', 'curated')
# The BQK monthly and Table 15 series are ingested through the validated parser
# in the companion BQK repository, which reproduces the published workbooks
# cell for cell. Point KPI_BQK_BLOB at that project's app/_data_blob.js, or drop
# the file into data/raw/bqk/ beside the source workbooks it was built from.
BQK_BLOB = os.environ.get(
    'KPI_BQK_BLOB',
    os.path.join(RAW_BQK, '_data_blob.js'))

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December']
MN = {m: i + 1 for i, m in enumerate(MONTHS)}

T = collections.defaultdict(list)
QUALITY = []
RECON = []
RUN_STARTED = datetime.datetime.now(datetime.timezone.utc)
SV = {}          # source_id -> source_version_id


# --------------------------------------------------------------------- utils
def check(check_type, group, severity, ok, message, table=None, period=None,
          expected=None, actual=None, variance=None, variance_pct=None,
          tolerance=None, source_id=None):
    QUALITY.append(dict(
        check_type=check_type, check_group=group, severity=severity,
        status='passed' if ok else 'failed', message=message,
        table_name=table, reporting_period=period,
        expected_value=None if expected is None else str(expected),
        actual_value=None if actual is None else str(actual),
        variance=variance, variance_percent=variance_pct, tolerance=tolerance,
        source_version_id=SV.get(source_id)))
    return ok


def ym_to_id(y, m):
    return y * 100 + m


def norm_period(p):
    s = str(p)
    if '-' in s:
        a, b = s.split('-')[:2]
        return int(a), int(b)
    a, b = s.split()
    return int(a), MN[b]


def file_meta(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest(), os.path.getsize(path)


# ============================================================ 1. PROVENANCE
def register(source_id, institution, dataset_name, official_title, url, freq,
             notes, path=None, source_table=None, sheet=None, pub=None,
             start=None, end=None, language='sq/en'):
    T['data_sources'].append(dict(
        source_id=source_id, institution=institution, dataset_name=dataset_name,
        official_title=official_title, source_url=url, source_language=language,
        frequency=freq, methodology_notes=notes, is_active=True))
    sha, size = (file_meta(path) if path and os.path.exists(path) else (None, None))
    vid = len(T['source_versions']) + 1
    SV[source_id] = vid
    T['source_versions'].append(dict(
        source_version_id=vid, source_id=source_id,
        original_filename=os.path.basename(path) if path else None,
        source_url=url, source_table=source_table, source_sheet=sheet,
        publication_date=pub, reporting_start_date=start, reporting_end_date=end,
        downloaded_at=RUN_STARTED.isoformat(), file_size=size, sha256_hash=sha,
        parser_version=PARSER_VERSION, supersedes_version_id=None,
        revision_detected=False, is_current=True))
    return vid


def register_sources(atk_years):
    register('BQK_RAPORT_MUJOR', 'BQK', 'Raporti Mujor i Sistemit të Pagesave',
             'Monthly Report on Cash and Non-Cash Payment Instruments',
             'https://bqk-kos.org/statistikat/?lang=en', 'monthly',
             'Terminal stock and transaction flows come from the same publication, so '
             'productivity ratios share a universe. Begins January 2025 and is not '
             'continuous with the annual report series.',
             path=os.path.join(RAW_BQK, 'Payments_Raport_Mujor.xlsx'),
             source_table='Payments_Raport_Mujor',
             sheet='Terminalet për pagesa; Trans. sipas terminaleve; Kartelat bankare; '
                   'Pagesat sipas instrumenteve', start='2025-01-01')
    register('BQK_T15', 'BQK', 'Table 15 — Payment System',
             'Payment System statistical time series, Table 15',
             'https://bqk-kos.org/repository/docs/time_series/', 'monthly',
             'Long-run series. Counts published in thousands and values in EUR millions; '
             'both are scaled on load. No terminal stock exists on this basis.',
             path=os.path.join(RAW_BQK, '15_Payment_System_converted.xlsx'),
             source_table='15_Payment_System', sheet='Sistemi i Pagesave',
             start='2007-03-01')
    register('BQK_CARDS_ANNUAL', 'BQK', 'Use of Bank Cards in Kosovo',
             'Use of Bank Cards in Kosovo — September 2025 edition',
             'https://bqk-kos.org/repository/docs/SistemiIPagesave/'
             'Use%20of%20bank%20cards%20in%20Kosovo.pdf?lang=en', 'annual',
             'City distribution read from charts, not from a published table. Figures 26 '
             'and 27 combine ATM AND POS transactions.',
             path=os.path.join(RAW_BQK, 'bqk_cards.pdf'),
             source_table='Table 2; Figures 2, 4, 26, 27', pub='2025-09-01',
             start='2024-01-01', end='2024-12-31', language='en')
    register('ASK_RETAIL', 'ASK', 'Statistikat afatshkurtra të Tregtisë me Pakicë',
             'Short-term retail trade statistics — turnover index, monthly',
             'https://askdata.rks-gov.net/', 'monthly',
             'Turnover index, 2021 = 100. ASK publishes no aggregate retail total in '
             'this table, so none is constructed; card growth is compared against '
             'each published activity and their unweighted mean.',
             path=os.path.join(RAW_ASK, 'retail_index.json'),
             source_table='tab01.px', language='sq')
    register('ASK_ENTERPRISES', 'ASK', 'Regjistri statistikor i bizneseve',
             'Statistical business register — registered enterprises',
             'https://askdata.rks-gov.net/', 'quarterly',
             'Registered enterprises by municipality and activity section. A better '
             'merchant denominator than ATK taxpayers, which count filers rather '
             'than traders — though registration still does not imply trading or '
             'card acceptance.',
             path=os.path.join(RAW_ASK, 'enterprises_muni.json'),
             source_table='tab05r.px', language='sq')
    register('ASK_CENSUS', 'ASK', 'Regjistrimi i Popullsisë 2024',
             'Population and Housing Census 2024 — first final results',
             LV.POPULATION_SOURCE['url'], 'annual',
             'Population of %s, used to normalise every absolute figure and to '
             'compare with the euro area.' % '{:,}'.format(LV.KOSOVO_POPULATION),
             source_table='Census 2024', language='sq')
    register('ECB_PAYMENTS', 'ECB', 'Payments statistics',
             LV.EURO_AREA['source'], LV.EURO_AREA['url'], 'annual',
             'Euro-area reference for the same half-year. Figures are quoted from '
             'the ECB release as published, never recomputed.',
             source_table=LV.EURO_AREA['period'], language='en')
    # The one source with no file behind it. register() hashes a path when it
    # gets one; here there is none, so sha256 and file_size stay null and the
    # UI reads that as "supplied" rather than printing a hash that never was.
    if os.path.exists(os.path.join(SUPPLIED, 'kba_pos_by_bank.json')):
        register('KBA_POS_BY_BANK', 'KBA', 'Bank reporting — POS transactions',
                 'Shoqata e Bankave të Kosovës — raportimi i bankave për POS',
                 'https://www.bankassoc-kos.com/', 'periodic',
                 'Bank-level POS totals supplied by the project owner as an '
                 'aggregate extract, not downloaded from a publication. It has no '
                 'source file to hash and no period label. It is a fourth POS '
                 'universe: shares and productivity are computed inside it and '
                 'never divided against a BQK total.',
                 source_table='POS TRANSACTIONS')
    for y in atk_years:
        register('ATK_QARKULLIMI_%d' % y, 'ATK', 'Open Data — Qarkullimi %d' % y,
                 'Të dhëna të hapura — Qarkullimi %d' % y,
                 'https://www.atk-ks.org/en/open-data/', 'monthly',
                 'Aggregated turnover and REGISTERED TAXPAYER counts by month, '
                 'municipality, sector and legal form. Taxpayers are not equivalent to '
                 'card-accepting businesses.',
                 path=os.path.join(RAW_ATK, 'Qarkullimi-%d.xlsx' % y),
                 source_table='OD_QarkDataSet',
                 start='%d-01-01' % y, end='%d-12-31' % y)


# ============================================================ 2. DIMENSIONS
GEO, SECTOR_ID, DEF_ID = {}, {}, {}
CHANNEL_ID, CARD_ID, SCHEME_ID = {}, {}, {}


def build_dim_date(periods):
    for (y, m) in sorted(periods):
        T['dim_date'].append(dict(
            date_id=ym_to_id(y, m),
            period_start='%04d-%02d-01' % (y, m),
            period_end='%04d-%02d-%02d' % (y, m, calendar.monthrange(y, m)[1]),
            year=y, quarter=(m - 1) // 3 + 1, month=m,
            year_month='%04d-%02d' % (y, m), month_name=MONTHS[m - 1]))


def build_dim_geography(atk_munis):
    gid = 1
    T['dim_geography'].append(dict(
        geography_id=gid, geography_name='Kosovo', geography_level='NATIONAL',
        municipality_code='XK', region=None, standardized_name='Kosovo',
        bqk_name='Kosovo', atk_name=None, match_method='n/a',
        match_confidence='exact', review_status='accepted'))
    GEO[('NATIONAL', 'Kosovo')] = gid

    for raw in sorted(atk_munis):
        gid += 1
        std = M.standardize(raw)
        T['dim_geography'].append(dict(
            geography_id=gid, geography_name=std, geography_level='MUNICIPALITY',
            municipality_code=None, region=M.REGION.get(raw), standardized_name=std,
            bqk_name=None, atk_name=raw, match_method='exact name after case folding',
            match_confidence='exact', review_status='accepted'))
        GEO[('MUNICIPALITY', std)] = gid

    # BQK cities are a SEPARATE grain, not the same rows as the municipalities.
    for city in M.BQK_CITIES:
        gid += 1
        T['dim_geography'].append(dict(
            geography_id=gid, geography_name=city, geography_level='CITY',
            municipality_code=None, region=None, standardized_name=city,
            bqk_name=city, atk_name=None,
            match_method='city named in the BQK annual report',
            match_confidence='exact' if city in M.BQK_GEO_PAIRING_VERIFIED else 'reviewed',
            review_status='accepted' if city in M.BQK_GEO_PAIRING_VERIFIED else 'needs_review'))
        GEO[('CITY', city)] = gid

    missing = [c for c in M.BQK_CITIES if ('MUNICIPALITY', c) not in GEO]
    check('geography_name_match', 'geography', 'high', not missing,
          'Every BQK city name has a same-named ATK municipality'
          if not missing else 'No ATK municipality for: %s' % missing,
          table='core.dim_geography', expected=0, actual=len(missing))

    check('geography_grain', 'geography', 'high', False,
          'BQK publishes seven CITIES; ATK publishes 38 MUNICIPALITIES. A municipality '
          'contains settlements outside its city, so any ratio combining the two is a '
          'documented approximation, not a like-for-like measure.',
          table='core.dim_geography', expected='same grain',
          actual='CITY vs MUNICIPALITY')

    n_muni = sum(1 for r in T['dim_geography'] if r['geography_level'] == 'MUNICIPALITY')
    check('geography_coverage', 'geography', 'warning', False,
          '%d of %d municipalities have no BQK terminal observation at any grain.'
          % (n_muni - len(M.BQK_CITIES), n_muni),
          table='core.dim_geography', expected=0, actual=n_muni - len(M.BQK_CITIES))


def build_dim_sector(atk_sectors):
    unmapped = []
    for i, raw in enumerate(sorted(atk_sectors), start=1):
        entry = M.SECTOR_ADDRESSABILITY.get(raw)
        if entry is None:
            unmapped.append(raw)
            entry = (raw, 'REVIEW_REQUIRED', 'Not present in the addressability map.')
        disp, cat, note = entry
        T['dim_sector'].append(dict(
            sector_id=i, source_system='ATK', source_sector_code=None,
            source_sector_name=raw, standardized_sector=disp, parent_sector=None,
            addressability_class=cat.upper(), rationale=note,
            confidence='low' if cat.upper() == 'REVIEW_REQUIRED' else 'medium',
            review_status='needs_review' if cat.upper() == 'REVIEW_REQUIRED' else 'accepted',
            mapping_version=M.SECTOR_MAPPING_VERSION,
            effective_from='2019-01-01', effective_to=None))
        SECTOR_ID[raw] = i
    check('sector_mapping', 'sector', 'high', not unmapped,
          'Every ATK sector carries an explicit addressability class'
          if not unmapped else 'Unmapped sectors: %s' % unmapped,
          table='core.dim_sector', expected=0, actual=len(unmapped))
    check('addressability_is_analytical', 'sector', 'warning', False,
          'Addressable turnover is an analytical classification (mapping %s), not an '
          'official ATK measure. Wholesale and retail are one published section, so the '
          'result is reported as a floor and a ceiling.' % M.SECTOR_MAPPING_VERSION,
          table='core.dim_sector')


def build_dim_definitions():
    for i, d in enumerate(M.DEFINITIONS, start=1):
        r = dict(d)
        r['definition_id'] = i
        DEF_ID[d['metric_key']] = i
        T['dim_metric_definition'].append(r)


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


# ================================================================ 3. BQK
def load_bqk_blob():
    s = open(BQK_BLOB, encoding='utf-8').read().strip()
    return json.loads(s[s.index('=') + 1:].rstrip(';'))


def build_bqk(D):
    terms = {r['period']: r for r in D['terminals']}
    tx = {r['period']: r for r in D['terminal_tx']}
    periods = sorted(set(terms) & set(tx), key=lambda p: norm_period(p))
    nat = GEO[('NATIONAL', 'Kosovo')]
    did = DEF_ID['pos_rm_allcards']
    svm = SV['BQK_RAPORT_MUJOR']

    for p in periods:
        y, m = norm_period(p)
        d, t, x = ym_to_id(y, m), terms[p], tx[p]
        T['fact_pos_terminal_stock'].append(dict(
            date_id=d, geography_id=nat, definition_id=did, source_version_id=svm,
            terminal_count=t['total_pos'], eftpos_count=t['eftpos'],
            virtual_pos_count=t['virtual_pos'],
            merchants_physical=t['merchants_physical'],
            merchants_virtual=t['merchants_virtual'],
            observation_type='MONTH_END'))
        T['fact_pos_transactions'].append(dict(
            date_id=d, geography_id=nat, definition_id=did,
            channel_id=CHANNEL_ID['POS'], source_version_id=svm,
            transaction_count=x['pos_card_count'],
            transaction_value=round(x['pos_card_value'], 2)))
        T['fact_atm_stock'].append(dict(
            date_id=d, geography_id=nat, definition_id=did, source_version_id=svm,
            atm_count=t['total_atm'], observation_type='MONTH_END'))
        T['fact_atm_transactions'].append(dict(
            date_id=d, geography_id=nat, definition_id=did, source_version_id=svm,
            withdrawal_count=x['atm_cash_count'],
            withdrawal_value=round(x['atm_cash_value'], 2),
            deposit_count=x['atm_deposit_count'],
            deposit_value=round(x['atm_deposit_value'], 2)))

    # --- Table 15 long series (flows only; no terminal stock exists on this basis)
    idx = collections.defaultdict(dict)
    for r in D['payments']:
        idx[r['indicator']][norm_period(r['period'])] = r
    svt = SV['BQK_T15']
    for key, parts in (('pos_t15_domestic', ('POS Domestic',)),
                       ('pos_t15_allcards', ('POS Domestic', 'POS Foreign Cards in Kosovo'))):
        d2 = DEF_ID[key]
        for (y, m) in sorted(idx['POS Domestic']):
            c = v = None
            for k in parts:
                r = idx[k].get((y, m))
                if not r:
                    continue
                if r.get('count') is not None:
                    c = (c or 0) + r['count'] * 1000
                if r.get('amount') is not None:
                    v = (v or 0) + r['amount'] * 1e6
            if c is None and v is None:
                continue
            T['fact_pos_transactions'].append(dict(
                date_id=ym_to_id(y, m), geography_id=nat, definition_id=d2,
                channel_id=CHANNEL_ID['POS'], source_version_id=svt,
                transaction_count=c, transaction_value=None if v is None else round(v, 2)))

    # --- cards (stock)
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
            T['fact_card_stock'].append(dict(
                date_id=d, card_type_id=CARD_ID[card], scheme_id=SCHEME_ID[scheme],
                definition_id=did, source_version_id=svm, cards_issued=r[col]))

    # --- channels
    pc = {r['period']: r for r in D['payments_count']}
    pv = {r['period']: r for r in D['payments_value']}
    for p, r in sorted(pc.items()):
        y, m = norm_period(p)
        val = pv.get(p, {})
        for ch, col in [('E-commerce', 'ecommerce'), ('Digital Wallet', 'digital_wallet'),
                        ('E-money', 'emoney'), ('Credit Transfer', 'credit_transfer')]:
            T['fact_digital_payments'].append(dict(
                date_id=ym_to_id(y, m), channel_id=CHANNEL_ID[ch], definition_id=did,
                source_version_id=svm, transaction_count=r.get(col),
                transaction_value=val.get(col)))
    for p in periods:
        y, m = norm_period(p)
        x = tx[p]
        for ch, cc, vc in [('POS', 'pos_card_count', 'pos_card_value'),
                           ('ATM Withdrawal', 'atm_cash_count', 'atm_cash_value'),
                           ('ATM Deposit', 'atm_deposit_count', 'atm_deposit_value')]:
            T['fact_digital_payments'].append(dict(
                date_id=ym_to_id(y, m), channel_id=CHANNEL_ID[ch], definition_id=did,
                source_version_id=svm, transaction_count=x[cc],
                transaction_value=round(x[vc], 2)))

    # --- annual city geography
    sva = SV['BQK_CARDS_ANNUAL']
    for city, (pos_pct, atm_pct, tx_cnt, tx_val) in M.BQK_GEO_2024.items():
        T['fact_pos_geo_annual'].append(dict(
            year=2024, geography_id=GEO[('CITY', city)], source_version_id=sva,
            pos_share_pct=pos_pct, atm_share_pct=atm_pct,
            pos_terminals_estimated=round(M.BQK_POS_TOTAL_2024 * pos_pct / 100.0),
            atm_pos_transaction_count=tx_cnt, atm_pos_transaction_value=tx_val,
            extraction_method='pdf_chart_manual',
            pairing_verified=city in M.BQK_GEO_PAIRING_VERIFIED))

    unver = [c for c in M.BQK_GEO_2024 if c not in M.BQK_GEO_PAIRING_VERIFIED]
    check('pdf_chart_pairing', 'provenance', 'high', False,
          'City shares are read from a chart inside the PDF. The legend-to-value pairing '
          'is confirmed only for Prishtinë, whose 50.2%% share of transaction value '
          'matches the report text. Verify %s against Figure 4 before relying on the '
          'ranking.' % ', '.join(sorted(unver)),
          table='core.fact_pos_geo_annual', period='2024',
          expected='verified', actual='%d of %d unverified' % (len(unver), len(M.BQK_GEO_2024)),
          source_id='BQK_CARDS_ANNUAL')

    # --- stock/flow guard
    check('stock_flow_separation', 'model', 'info', True,
          'Terminal, card and ATM stocks are in their own fact tables; transactions and '
          'value are in flow tables. No row mixes the two.',
          table='core.fact_pos_terminal_stock')

    _bqk_audits(D, terms, tx, periods, idx)
    return periods


def _bqk_audits(D, terms, tx, periods, idx):
    # --- cross-source reconciliation, month by month
    gaps = []
    for p in periods:
        y, m = norm_period(p)
        d, f = idx['POS Domestic'].get((y, m)), idx['POS Foreign Cards in Kosovo'].get((y, m))
        if not d or d.get('count') is None:
            continue
        t15 = (d['count'] + (f['count'] if f and f.get('count') is not None else 0)) * 1000
        rm = tx[p]['pos_card_count']
        if not t15:
            continue
        pct = (rm - t15) / t15
        gaps.append(pct)
        RECON.append(dict(
            metric='POS transaction count', definition_a=DEF_ID['pos_rm_allcards'],
            definition_b=DEF_ID['pos_t15_allcards'], reporting_period='%04d-%02d' % (y, m),
            value_a=rm, value_b=t15, abs_difference=rm - t15,
            pct_difference=round(pct * 100, 3),
            classification='METHODOLOGY_DIFFERENCE',
            note='Raport Mujor counts all card payments acquired at Kosovo POS; Table 15 '
                 'splits by card residency. The gap is stable across every overlapping '
                 'month, which is the signature of a definition difference rather than '
                 'an error.'))
    if gaps:
        check('definition_gap', 'reconciliation', 'high', False,
              'Raport Mujor exceeds Table 15 (domestic + foreign) by %.1f%%–%.1f%% in all '
              '%d overlapping months. Classified METHODOLOGY_DIFFERENCE; the universes '
              'are never summed or spliced.'
              % (min(gaps) * 100, max(gaps) * 100, len(gaps)),
              table='core.fact_pos_transactions',
              variance_pct=round(sum(gaps) / len(gaps) * 100, 2), tolerance=2.0)

    # --- annual vs monthly terminal series
    first = periods[0]
    fv = terms[first]['total_pos']
    delta = (fv - M.BQK_POS_TOTAL_2024) / M.BQK_POS_TOTAL_2024
    RECON.append(dict(
        metric='POS terminal stock', definition_a=DEF_ID['pos_rm_allcards'],
        definition_b=DEF_ID['pos_terminals_annual'], reporting_period='2024-12 / 2025-01',
        value_a=fv, value_b=M.BQK_POS_TOTAL_2024, abs_difference=fv - M.BQK_POS_TOTAL_2024,
        pct_difference=round(delta * 100, 2), classification='NOT_COMPARABLE',
        note='A 20% step in one month is not a market movement. The two publications '
             'count different universes and are never joined into one trend.'))
    check('series_discontinuity', 'reconciliation', 'high', False,
          'Annual report records %s terminals at end-2024 against %s in the monthly '
          'series for January 2025 (%+.1f%%). Classified NOT_COMPARABLE.'
          % ('{:,}'.format(M.BQK_POS_TOTAL_2024), '{:,}'.format(int(fv)), delta * 100),
          table='core.fact_pos_terminal_stock', period=first,
          expected=M.BQK_POS_TOTAL_2024, actual=int(fv),
          variance_pct=round(delta * 100, 2), tolerance=2.0)

    # --- card totals must reconcile to their parts
    #
    # The card type split does NOT add up to the headline card total, and it is
    # not supposed to: 'total' counts every valid card, including those with a
    # cash function only. The right denominator is the payment-function count,
    # and against that the split reconciles exactly. Testing it the naive way
    # produces a 5.8% "variance" that is really a definition boundary.
    for r in D['cards'][-1:]:
        parts = r['debit'] + r['credit'] + r['delayed_debit']
        var_pay = parts - r['payment_fn']
        pct_pay = var_pay / r['payment_fn'] * 100 if r['payment_fn'] else 0
        check('total_reconciliation_cards', 'reconciliation', 'high', abs(pct_pay) < 0.01,
              'Debit + credit + delayed debit reconcile exactly to cards with a payment '
              'function (%s).' % '{:,}'.format(int(r['payment_fn']))
              if abs(pct_pay) < 0.01 else
              'Card type detail differs from the payment-function count by %.3f%%' % pct_pay,
              table='core.fact_card_stock', period=r['period'],
              expected=r['payment_fn'], actual=parts, variance=var_pay,
              variance_pct=round(pct_pay, 4), tolerance=0.01)

        cash_only = r['total'] - r['payment_fn']
        RECON.append(dict(
            metric='Card stock — type split vs headline total',
            definition_a=DEF_ID['pos_rm_allcards'], definition_b=None,
            reporting_period=r['period'], value_a=parts, value_b=r['total'],
            abs_difference=parts - r['total'],
            pct_difference=round((parts - r['total']) / r['total'] * 100, 3),
            classification='METHODOLOGY_DIFFERENCE',
            note='The headline card total counts every valid card; the debit/credit split '
                 'covers only cards with a payment function. The %s card difference is '
                 'cards issued with a cash function alone.' % '{:,}'.format(int(cash_only))))

        ctl = r['contactless'] + r['contact']
        pct2 = (ctl - r['total']) / r['total'] * 100
        check('total_reconciliation_contactless', 'reconciliation', 'info',
              abs(pct2) <= 6.0,
              'Contactless + contact account for %.1f%% of the card total; the remainder '
              'is cards with neither interface recorded.' % (ctl / r['total'] * 100),
              table='core.fact_card_stock', period=r['period'],
              expected=r['total'], actual=ctl, variance_pct=round(pct2, 3), tolerance=6.0)

    # --- outliers on the monthly flow
    counts = [tx[p]['pos_card_count'] for p in periods]
    mom = [(counts[i] / counts[i - 1] - 1) for i in range(1, len(counts))]
    if len(mom) > 3:
        mu, sd = statistics.mean(mom), statistics.pstdev(mom)
        out = [(periods[i + 1], v) for i, v in enumerate(mom) if sd and abs(v - mu) > 3 * sd]
        check('outlier_mom', 'outlier', 'warning', not out,
              'No month-on-month POS transaction movement beyond 3 standard deviations'
              if not out else
              'Movements beyond 3 sd flagged for review: %s'
              % ', '.join('%s %+.1f%%' % (p, v * 100) for p, v in out),
              table='core.fact_pos_transactions', actual=len(out))

    neg = [p for p in periods if tx[p]['pos_card_count'] < 0 or tx[p]['pos_card_value'] < 0]
    check('impossible_negative', 'integrity', 'high', not neg,
          'No negative transaction counts or values' if not neg else
          'Negative flows at %s' % neg, table='core.fact_pos_transactions',
          expected=0, actual=len(neg))

    zero = [p for p in periods if not tx[p]['pos_card_count']]
    check('unexpected_zero', 'outlier', 'warning', not zero,
          'No unexpected zero months' if not zero else 'Zero transaction months: %s' % zero,
          table='core.fact_pos_transactions', expected=0, actual=len(zero))

    # --- coverage
    _coverage('POS transactions (Raport Mujor)', DEF_ID['pos_rm_allcards'],
              [norm_period(p) for p in periods])
    _coverage('POS transactions (Table 15 domestic)', DEF_ID['pos_t15_domestic'],
              [k for k, v in idx['POS Domestic'].items() if v.get('count') is not None])


def _coverage(metric, definition_id, periods):
    if not periods:
        return
    ps = sorted(periods)
    first, last = ps[0], ps[-1]
    expected = (last[0] - first[0]) * 12 + (last[1] - first[1]) + 1
    actual = len(set(ps))
    missing = expected - actual
    status = ('CONTINUOUS' if missing == 0 else 'GAPS')
    if actual < 13:
        status = 'INSUFFICIENT_FOR_YOY'
    T['series_coverage'].append(dict(
        metric=metric, definition_id=definition_id,
        first_period='%04d-%02d' % first, last_period='%04d-%02d' % last,
        expected_observations=expected, actual_observations=actual,
        missing_observations=missing,
        coverage_percentage=round(actual / expected * 100, 2),
        continuity_status=status))
    check('series_coverage', 'coverage', 'warning' if missing else 'info', missing == 0,
          '%s: %d of %d months present (%s)' % (metric, actual, expected, status),
          table='audit.series_coverage', expected=expected, actual=actual)


# ================================================================ 4. ATK
def load_atk_year(year):
    path = os.path.join(RAW_ATK, 'Qarkullimi-%d.xlsx' % year)
    if not os.path.exists(path):
        return [], 0
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    out, seen, rejected = [], False, 0
    for r in ws.iter_rows(values_only=True):
        v = r[1] if len(r) > 1 else None
        if not seen:
            if isinstance(v, str) and 'Viti' in v:
                seen = True
            continue
        if not isinstance(v, (int, float)):
            continue
        try:
            y, m = int(v), int(r[2])
            sector = (r[3] or '').strip()
            muni = (r[6] or '').strip()
            status = (r[7] or '').strip() if isinstance(r[7], str) else None
            n = float(r[9] or 0)
            turn = float(r[10] or 0)
        except (TypeError, ValueError, IndexError):
            rejected += 1
            continue
        if not (1 <= m <= 12) or not sector or not muni:
            rejected += 1
            continue
        out.append((y, m, sector, muni, status, n, turn))
    wb.close()
    return out, rejected


def build_atk(years):
    agg = collections.defaultdict(lambda: [0.0, 0.0])
    munis, sectors, periods = set(), set(), set()
    totals = {}
    for y in years:
        rows, rejected = load_atk_year(y)
        yt = 0.0
        for (yy, m, sector, muni, status, n, turn) in rows:
            munis.add(muni)
            sectors.add(sector)
            periods.add((yy, m))
            k = (yy, m, muni, sector)
            agg[k][0] += n
            agg[k][1] += turn
            yt += turn
        totals[y] = yt
        check('source_loaded', 'ingest', 'info', bool(rows),
              'Qarkullimi-%d: %s rows parsed, %d rejected, EUR %s total turnover'
              % (y, '{:,}'.format(len(rows)), rejected, '{:,.0f}'.format(yt)),
              table='raw.atk_turnover', period=str(y), actual=len(rows),
              source_id='ATK_QARKULLIMI_%d' % y)
    return agg, munis, sectors, periods, totals


def emit_atk_facts(agg, totals):
    neg = 0
    recon = collections.defaultdict(float)
    for (y, m, muni, sector), (n, turn) in agg.items():
        if turn < 0:
            neg += 1
        recon[y] += turn
        T['fact_atk_turnover'].append(dict(
            date_id=ym_to_id(y, m),
            geography_id=GEO[('MUNICIPALITY', M.standardize(muni))],
            sector_id=SECTOR_ID[sector],
            source_version_id=SV['ATK_QARKULLIMI_%d' % y],
            turnover=round(turn, 2), entity_count=n,
            entity_type='TAXPAYER', business_status=None))

    check('entity_type_labelling', 'model', 'warning', False,
          'ATK publishes "Numri i Tatimpaguesve" — registered taxpayers filing in the '
          'month, which includes entities that are not card-accepting merchants. Stored '
          'and displayed as TAXPAYER, never as "businesses".',
          table='core.fact_atk_turnover')

    check('negative_turnover', 'integrity', 'warning', neg == 0,
          'No negative turnover cells' if neg == 0 else
          '%d municipality-sector months report negative turnover (credit notes and '
          'corrections). Kept as published and flagged, not clipped.' % neg,
          table='core.fact_atk_turnover', expected=0, actual=neg)

    for y, total in sorted(totals.items()):
        got = recon[y]
        var = got - total
        pct = (var / total * 100) if total else 0
        check('total_reconciliation_atk', 'reconciliation', 'high', abs(pct) < 0.001,
              'Curated municipality-sector rows reconcile to the parsed %d source total '
              'exactly' % y if abs(pct) < 0.001 else
              'Curated total differs from source total for %d by %.4f%%' % (y, pct),
              table='core.fact_atk_turnover', period=str(y),
              expected=round(total, 2), actual=round(got, 2), variance=round(var, 2),
              variance_pct=round(pct, 6), tolerance=0.001)


# ====================================================== 5. DASHBOARD PAYLOAD
def pos_monthly(definition_key):
    did = DEF_ID[definition_key]
    stock = {r['date_id']: r for r in T['fact_pos_terminal_stock']
             if r['definition_id'] == did}
    flow = {}
    for r in T['fact_pos_transactions']:
        if r['definition_id'] == did and r['channel_id'] == CHANNEL_ID['POS']:
            flow[r['date_id']] = r
    ids = sorted(set(stock) | set(flow))
    out, terms = [], []
    for i, d in enumerate(ids):
        s, f = stock.get(d), flow.get(d)
        terms.append(s['terminal_count'] if s else None)
        window = [t for t in terms[max(0, i - 11):i + 1] if t is not None]
        avg12 = sum(window) / len(window) if window else None
        rec = dict(
            year_month='%04d-%02d' % divmod(d, 100),
            terminal_stock=s['terminal_count'] if s else None,
            terminal_avg_12m=avg12,
            merchants=s['merchants_physical'] if s else None,
            tx_count=f['transaction_count'] if f else None,
            tx_value=f['transaction_value'] if f else None)
        rec['tx_per_avg_pos'] = (rec['tx_count'] / avg12) if (avg12 and rec['tx_count']) else None
        rec['tx_per_end_pos'] = (rec['tx_count'] / rec['terminal_stock']) \
            if (rec['terminal_stock'] and rec['tx_count']) else None
        rec['value_per_avg_pos'] = (rec['tx_value'] / avg12) if (avg12 and rec['tx_value']) else None
        rec['avg_ticket'] = (rec['tx_value'] / rec['tx_count']) \
            if (rec['tx_count'] and rec['tx_value']) else None
        out.append(rec)
    for i, r in enumerate(out):
        prev = out[i - 12] if i >= 12 else None
        for name, col in (('pos_yoy', 'terminal_stock'), ('tx_yoy', 'tx_count'),
                          ('value_yoy', 'tx_value')):
            r[name] = None
            if prev and prev.get(col) and r.get(col):
                r[name] = r[col] / prev[col] - 1
    return out


def market_signals(definition_key):
    rows = pos_monthly(definition_key)
    by = {r['year_month']: r for r in rows}
    withtx = [r for r in rows if r['tx_count']]
    if not withtx:
        return None
    last = withtx[-1]['year_month']
    ly, lm = int(last[:4]), int(last[5:7])
    pairs = []
    for m in range(1, lm + 1):
        a, b = by.get('%04d-%02d' % (ly, m)), by.get('%04d-%02d' % (ly - 1, m))
        if a and b and a['tx_count'] and b['tx_count']:
            pairs.append((a, b))
    if not pairs:
        return None

    def s(i, k):
        return sum(p[i][k] for p in pairs if p[i][k])

    def av(i, k):
        v = [p[i][k] for p in pairs if p[i][k]]
        return sum(v) / len(v) if v else None

    txc, txp = s(0, 'tx_count'), s(1, 'tx_count')
    vlc, vlp = s(0, 'tx_value'), s(1, 'tx_value')
    pc, pp = av(0, 'terminal_stock'), av(1, 'terminal_stock')
    out = dict(through=last, months=len(pairs),
               compare_from='%04d-01' % (ly - 1), compare_to='%04d-%02d' % (ly - 1, lm),
               usage_growth=txc / txp - 1 if txp else None,
               value_growth=vlc / vlp - 1 if vlp else None,
               tx_current=txc, tx_prior=txp,
               value_current=vlc, value_prior=vlp,
               ticket_current=vlc / txc if txc else None,
               ticket_prior=vlp / txp if txp else None)
    out['average_ticket_growth'] = (out['ticket_current'] / out['ticket_prior'] - 1) \
        if (out['ticket_current'] and out['ticket_prior']) else None
    if pc and pp:
        out.update(infrastructure_growth=pc / pp - 1,
                   pos_current=pc, pos_prior=pp,
                   productivity_growth=(txc / pc) / (txp / pp) - 1,
                   value_productivity_growth=(vlc / pc) / (vlp / pp) - 1,
                   usage_minus_infra_pp=(txc / txp) - (pc / pp))
    else:
        out.update(infrastructure_growth=None, pos_current=None, pos_prior=None,
                   productivity_growth=None, value_productivity_growth=None,
                   usage_minus_infra_pp=None)
    return out


def sector_rollups(agg):
    """entity_count is a monthly stock and is averaged; turnover is a flow and summed."""
    def acc():
        return dict(turnover=0.0, ent=0.0, months=set())
    sec_year = collections.defaultdict(acc)
    muni_year = collections.defaultdict(acc)
    muni_sec_year = collections.defaultdict(acc)
    nat_month = collections.defaultdict(lambda: [0.0, 0.0])
    sec_month = collections.defaultdict(acc)

    for (y, m, muni, sector), (n, turn) in agg.items():
        std = M.standardize(muni)
        for d, k in ((sec_year, (y, sector)), (muni_year, (y, std)),
                     (muni_sec_year, (y, std, sector)), (sec_month, (y, m, sector))):
            d[k]['turnover'] += turn
            d[k]['ent'] += n
            d[k]['months'].add(m)
        nat_month[(y, m)][0] += n
        nat_month[(y, m)][1] += turn

    def ent(v):
        return round(v['ent'] / max(1, len(v['months'])))

    cat = {r['source_sector_name']: r for r in T['dim_sector']}
    return (
        [dict(year=y, sector=cat[s]['standardized_sector'],
              addressability=cat[s]['addressability_class'],
              taxpayers=ent(v), turnover=round(v['turnover'], 2))
         for (y, s), v in sorted(sec_year.items())],
        [dict(year=y, municipality=mu, taxpayers=ent(v), turnover=round(v['turnover'], 2))
         for (y, mu), v in sorted(muni_year.items())],
        [dict(year=y, municipality=mu, sector=cat[s]['standardized_sector'],
              addressability=cat[s]['addressability_class'],
              taxpayers=ent(v), turnover=round(v['turnover'], 2))
         for (y, mu, s), v in sorted(muni_sec_year.items())],
        [dict(year_month='%04d-%02d' % (y, m), taxpayers=round(v[0]),
              turnover=round(v[1], 2))
         for (y, m), v in sorted(nat_month.items())],
    )


def economic_context(muni_sec_year):
    YEAR = 2024
    by = collections.defaultdict(lambda: dict(tax=0.0, total=0.0, floor=0.0, ceil=0.0))
    for r in muni_sec_year:
        if r['year'] != YEAR:
            continue
        b = by[r['municipality']]
        b['tax'] += r['taxpayers']
        b['total'] += r['turnover']
        if r['addressability'] == 'HIGH':
            b['floor'] += r['turnover']
        if r['addressability'] in ('HIGH', 'REVIEW_REQUIRED'):
            b['ceil'] += r['turnover']

    out = []
    for g in T['fact_pos_geo_annual']:
        city = next(x['standardized_name'] for x in T['dim_geography']
                    if x['geography_id'] == g['geography_id'])
        a = by.get(city)
        pos = g['pos_terminals_estimated']
        rec = dict(city=city, municipality=city, year=YEAR,
                   pos_share_pct=g['pos_share_pct'], pos_terminals=pos,
                   atm_pos_tx_count=g['atm_pos_transaction_count'],
                   atm_pos_tx_value=g['atm_pos_transaction_value'],
                   pairing_verified=g['pairing_verified'],
                   grain_approximation='CITY_TO_MUNICIPALITY',
                   entity_type='TAXPAYER')
        if a:
            rec.update(taxpayers=round(a['tax']), turnover_total=round(a['total'], 2),
                       addressable_floor=round(a['floor'], 2),
                       addressable_ceiling=round(a['ceil'], 2),
                       pos_per_1000_taxpayers=pos / a['tax'] * 1000 if a['tax'] else None,
                       pos_per_eur1m_floor=pos / a['floor'] * 1e6 if a['floor'] else None,
                       pos_per_eur1m_ceiling=pos / a['ceil'] * 1e6 if a['ceil'] else None,
                       turnover_per_pos=a['total'] / pos if pos else None)
        out.append(rec)
    return sorted(out, key=lambda r: -(r['pos_share_pct'] or 0))


def channel_mix_payload():
    chan = {r['channel_id']: r['channel_name'] for r in T['dim_channel']}
    out = collections.defaultdict(dict)
    for r in T['fact_digital_payments']:
        ym = '%04d-%02d' % divmod(r['date_id'], 100)
        out[ym][chan[r['channel_id']]] = dict(count=r['transaction_count'],
                                              value=r['transaction_value'])
    return [dict(year_month=k, channels=v) for k, v in sorted(out.items())]


def cards_payload():
    ct = {r['card_type_id']: r['card_type_name'] for r in T['dim_card_type']}
    sc = {r['scheme_id']: r['scheme_name'] for r in T['dim_scheme']}
    out = collections.defaultdict(dict)
    for r in T['fact_card_stock']:
        ym = '%04d-%02d' % divmod(r['date_id'], 100)
        key = ct[r['card_type_id']] if sc[r['scheme_id']] == 'All schemes' \
            else sc[r['scheme_id']]
        out[ym][key] = r['cards_issued']
    return [dict(year_month=k, **v) for k, v in sorted(out.items())]


# =========================================================== 6. SQL SEED
def lit(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


SEED_ORDER = [
    ('audit.data_sources', 'data_sources'),
    ('audit.source_versions', 'source_versions'),
    ('audit.series_coverage', 'series_coverage'),
    ('audit.kpi_build_status', 'kpi_build_status'),
    ('audit.source_reconciliation', 'source_reconciliation'),
    ('analytics.kpi_registry', 'kpi_registry'),
    ('core.dim_date', 'dim_date'),
    ('core.dim_geography', 'dim_geography'),
    ('core.dim_sector', 'dim_sector'),
    ('core.dim_channel', 'dim_channel'),
    ('core.dim_card_type', 'dim_card_type'),
    ('core.dim_scheme', 'dim_scheme'),
    ('core.dim_metric_definition', 'dim_metric_definition'),
    ('core.fact_pos_terminal_stock', 'fact_pos_terminal_stock'),
    ('core.fact_pos_transactions', 'fact_pos_transactions'),
    ('core.fact_card_stock', 'fact_card_stock'),
    ('core.fact_atm_stock', 'fact_atm_stock'),
    ('core.fact_atm_transactions', 'fact_atm_transactions'),
    ('core.fact_digital_payments', 'fact_digital_payments'),
    ('core.fact_pos_geo_annual', 'fact_pos_geo_annual'),
    ('core.fact_atk_turnover', 'fact_atk_turnover'),
]


def write_seed(path):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('-- Generated by etl/build.py (parser %s). Idempotent.\n'
                '-- Run 001_schema.sql and 002_views.sql first.\n\nbegin;\n\n'
                % PARSER_VERSION)
        for table, _ in reversed(SEED_ORDER):
            f.write('delete from %s;\n' % table)
        f.write('\n')
        for table, key in SEED_ORDER:
            rows = T.get(key) or []
            if not rows:
                continue
            cols = list(rows[0].keys())
            f.write('-- %s (%d rows)\n' % (table, len(rows)))
            for i in range(0, len(rows), 500):
                f.write('insert into %s (%s) values\n' % (table, ', '.join(cols)))
                f.write(',\n'.join('  (' + ', '.join(lit(r.get(c)) for c in cols) + ')'
                                   for r in rows[i:i + 500]))
                f.write(';\n')
            f.write('\n')
        f.write('commit;\n')


# =============================================================== MAIN
def main():
    years = [y for y in range(2019, 2026)
             if os.path.exists(os.path.join(RAW_ATK, 'Qarkullimi-%d.xlsx' % y))]
    print('ATK years: %s   parser %s' % (years, PARSER_VERSION))
    register_sources(years)

    print('Loading ATK ...')
    agg, munis, sectors, atk_periods, totals = build_atk(years)
    print('  %s municipality-sector-months' % '{:,}'.format(len(agg)))

    print('Loading BQK ...')
    D = load_bqk_blob()

    build_dim_geography(munis)
    build_dim_sector(sectors)
    build_dim_definitions()
    build_small_dims()

    bqk_periods = {norm_period(r['period']) for r in D['terminals']}
    bqk_periods |= {norm_period(r['period']) for r in D['payments']}
    build_dim_date(atk_periods | bqk_periods)

    periods = build_bqk(D)
    emit_atk_facts(agg, totals)

    atk_last, bqk_last = max(atk_periods), max(bqk_periods)
    lag = (bqk_last[0] - atk_last[0]) * 12 + (bqk_last[1] - atk_last[1])
    check('period_alignment', 'coverage', 'warning', lag == 0,
          'BQK runs to %04d-%02d while ATK ends %04d-%02d — a %d month lag. Integrated '
          'pages use the latest year both institutions cover, never a BQK month against '
          'an ATK month that does not exist.'
          % (bqk_last + atk_last + (lag,)), table='core.fact_atk_turnover',
          expected='aligned', actual='%d months' % lag)

    sec_year, muni_year, muni_sec_year, nat_month = sector_rollups(agg)
    geo = economic_context(muni_sec_year)

    # ---- ASK, and the operational layer built on top of everything
    retail = parse_ask.retail_index(RAW_ASK)
    ents = parse_ask.enterprises_by_municipality(RAW_ASK)
    ents_m = parse_ask.enterprises_monthly(RAW_ASK)
    cmix = channel_mix_payload()
    cards_p = cards_payload()
    pos_default = pos_monthly('pos_rm_allcards')
    kba = parse_kba.load(SUPPLIED)

    lever = {
        'penetration': LV.penetration(sec_year, pos_monthly('pos_t15_allcards'), retail),
        'sector_momentum': LV.sector_momentum(sec_year, T['dim_sector']),
        'cash': LV.cash_displacement(cmix),
        'card_mix': LV.card_mix(D['payments_count'], D['payments_value']),
        'retail_capture': LV.retail_capture(retail, pos_default),
        'benchmarks': LV.benchmarks(pos_default, cards_p),
        'headroom': LV.acceptance_headroom(geo, ents),
        'emerging': LV.emerging_channels(cmix),
        'bank_position': LV.bank_position(kba),
    }

    # ---- what the KBA extract is, and what it is not
    if kba:
        for c in kba['checks']:
            check('kba_reconcile_' + c['field'], 'reconciliation', 'error',
                  c['difference'] == 0,
                  'KBA %s: the bank columns sum to %s against a published total '
                  'of %s.' % (c['field'], format(c['sum_of_banks'], ','),
                              format(c['published'], ',')),
                  table='core.fact_bank_pos',
                  expected=format(c['published'], ','),
                  actual=format(c['sum_of_banks'], ','))

        check('kba_provenance', 'ingest', 'warning', False,
              'The KBA bank-level extract was supplied as aggregate totals, not '
              'downloaded. It carries no source file, no SHA-256 and no download '
              'date, so it is the one input that cannot be re-derived from a '
              'publication. Every figure built on it says so.',
              table='core.fact_bank_pos',
              expected='hashed publication', actual='supplied aggregate')

        check('kba_period', 'coverage', 'warning', False,
              'The KBA extract carries no period label. Its terminal count falls '
              'between the BQK monthly stock for March and April 2026, and its '
              'transaction count is within 0.2%% of BQK Table 15 domestic for the '
              'twelve months to March 2026, but the value for that window is 6%% '
              'lower. No single BQK window fits all four rows, so no period is '
              'asserted and no KBA figure is placed on a time axis.',
              table='core.fact_bank_pos',
              expected='labelled period', actual='unlabelled')

        check('kba_universe', 'model', 'warning', False,
              'KBA bank reporting is a fourth POS universe alongside the three '
              'BQK series. Shares and productivity are computed inside it — a '
              'KBA numerator over a KBA denominator — and never divided against '
              'a BQK total.', table='core.dim_metric_definition',
              expected='one universe', actual='four universes')

        check('kba_merchants_duplicated', 'model', 'warning', False,
              'Merchants are counted by each acquiring bank, so the %s total is '
              'acquiring relationships rather than distinct merchants: it exceeds '
              'the highest unduplicated BQK monthly merchant count. Terminals do '
              'not have this problem, so terminal-based measures carry the '
              'analysis and merchant-based ones are labelled.'
              % format(kba['total']['merchants'], ','),
              table='core.fact_bank_pos',
              expected='distinct merchants', actual='acquiring relationships')

        if kba['silent']:
            check('kba_silent_banks', 'coverage', 'warning', False,
                  '%s report no POS figure in the extract. That is absent, not '
                  'zero: they are excluded from every share and every average '
                  'rather than entered as nil.' % ' and '.join(kba['silent']),
                  table='core.fact_bank_pos',
                  expected='%d banks' % len(kba['banks'] + kba['silent']),
                  actual='%d reporting' % len(kba['banks']))

    for name, ok, msg in [
        ('ask_retail', retail is not None,
         'ASK retail turnover index loaded (%s activities, to %s)'
         % (len(retail['series']) if retail else 0,
            max(max(s) for s in retail['series'].values()) if retail else '-')),
        ('ask_enterprises', ents is not None,
         'ASK business register loaded (%d municipalities, latest %s)'
         % (len(ents['by_municipality']) if ents else 0,
            ents['latest'] if ents else '-')),
        ('card_mix_surfaced', lever['card_mix'] is not None,
         'Credit/debit card payment split surfaced from BQK instrument table'),
    ]:
        check(name, 'ingest', 'info', ok, msg, table='raw.ask')

    if lever['card_mix']:
        a = lever['card_mix']['first']
        b = lever['card_mix']['latest']
        check('card_mix_trend', 'model', 'warning',
              b['credit_share_count'] >= a['credit_share_count'],
              'Credit-function share of card payments moved from %.1f%% to %.1f%% '
              'of transactions between %s and %s. A falling credit share moves '
              'acquiring margin even while volume grows.'
              % (a['credit_share_count'] * 100, b['credit_share_count'] * 100,
                 a['year_month'], b['year_month']),
              table='core.fact_digital_payments')

    check('instalments_unavailable', 'coverage', 'warning', False,
          'BQK publishes no instalment or buy-now-pay-later series in any reviewed '
          'table. Credit-function card payments are the nearest proxy and are not '
          'the same measure; instalment volume remains internal-only.',
          table='core.fact_digital_payments', expected='published', actual='absent')

    # ---- KPI registry and derived statuses
    T['kpi_registry'] = KPI_REGISTRY
    sig = market_signals('pos_rm_allcards')
    T['kpi_build_status'] = derive_kpi_status(dict(
        monthly_terminal_months=len(periods),
        signal_months=sig['months'] if sig else 0,
        grain_approximation=True,
        geo_pairing_verified=len(M.BQK_GEO_PAIRING_VERIFIED),
        geo_cities=len(M.BQK_GEO_2024),
        kba=lever['bank_position']))
    T['source_reconciliation'] = RECON

    payload = dict(
        meta=dict(generated_at=RUN_STARTED.isoformat(), parser_version=PARSER_VERSION,
                  bqk_latest='%04d-%02d' % bqk_last, atk_latest='%04d-%02d' % atk_last,
                  atk_bqk_lag_months=lag, atk_years=years,
                  shared_year=2024,
                  population=LV.KOSOVO_POPULATION,
                  sector_mapping_version=M.SECTOR_MAPPING_VERSION),
        levers=lever,
        retail_index=retail,
        enterprises=ents,
        enterprises_monthly=ents_m,
        definitions=T['dim_metric_definition'],
        sources=T['data_sources'],
        source_versions=T['source_versions'],
        quality=QUALITY,
        reconciliation=RECON,
        coverage=T['series_coverage'],
        kpi_registry=KPI_REGISTRY,
        kpi_status=T['kpi_build_status'],
        pos_monthly={k: pos_monthly(k) for k in
                     ('pos_rm_allcards', 'pos_t15_domestic', 'pos_t15_allcards')},
        signals={k: market_signals(k) for k in
                 ('pos_rm_allcards', 'pos_t15_domestic', 'pos_t15_allcards')},
        cards=cards_p,
        channel_mix=cmix,
        geo=geo,
        sectors=T['dim_sector'],
        atk_sector_year=sec_year,
        atk_muni_year=muni_year,
        atk_muni_sector_year=muni_sec_year,
        atk_national_month=nat_month,
    )

    os.makedirs(CURATED, exist_ok=True)
    with open(os.path.join(CURATED, 'dashboard.json'), 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'), ensure_ascii=False)
    with open(os.path.join(BASE, 'app', 'data.js'), 'w', encoding='utf-8') as f:
        f.write('window.KPI_DATA=')
        json.dump(payload, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';')
    write_seed(os.path.join(CURATED, 'seed.sql'))

    print('\n%-36s %s' % ('TABLE', 'ROWS'))
    print('-' * 54)
    for _, key in SEED_ORDER:
        print('  %-34s %s' % (key, '{:,}'.format(len(T.get(key) or []))))

    print('\nQUALITY CHECKS')
    print('-' * 100)
    for q in sorted(QUALITY, key=lambda q: (q['status'] == 'passed', q['check_group'])):
        mark = 'ok  ' if q['status'] == 'passed' else q['severity'][:4].upper()
        print('  [%-4s] %-14s %-28s %s'
              % (mark, q['check_group'], q['check_type'], q['message'][:88]))

    print('\nKPI STATUS')
    print('-' * 100)
    for s in T['kpi_build_status']:
        print('  %-9s %-34s %s' % (s['status'], s['kpi_id'], (s['reason'] or '')[:70]))

    if sig:
        print('\nMARKET SIGNAL — %s, %d months like-for-like' % (sig['through'], sig['months']))
        for lab, k in [('Infrastructure', 'infrastructure_growth'),
                       ('Usage', 'usage_growth'),
                       ('Productivity', 'productivity_growth'),
                       ('Value per POS', 'value_productivity_growth'),
                       ('Average ticket', 'average_ticket_growth')]:
            v = sig.get(k)
            print('  %-18s %s' % (lab, '%+7.2f%%' % (v * 100) if v is not None else '  n/a'))

    # ---- the operational read
    cash, cm = lever['cash'], lever['card_mix']
    cap, bm = lever['retail_capture'], lever['benchmarks']
    print('\nTHE ARC — the one series that needs all three institutions')
    print('-' * 78)
    pen = lever['penetration']
    if pen:
        print('  %-6s %16s %14s %12s' % ('YEAR', 'ATK TURNOVER', 'CARD VALUE', 'ON CARD'))
        for s in pen['series']:
            print('  %-6s %16s %14s %11.2f%%'
                  % (s['year'], '{:,.0f}'.format(s['turnover']),
                     '{:,.0f}'.format(s['card_value']), s['penetration'] * 100))
        print('  economy x%.2f (CAGR %+.1f%%), cards x%.2f (CAGR %+.1f%%) over %d years'
              % (pen['economy_multiple'], pen['economy_cagr'] * 100,
                 pen['card_multiple'], pen['card_cagr'] * 100, pen['years']))
        print('  cards grew %.1f times faster; %.1f%% of declared turnover still '
              'settles elsewhere'
              % (pen['card_faster_by'], pen['still_elsewhere'] * 100))
    sm = lever['sector_momentum']
    if sm:
        print('\n  Growth %d-%d: EUR %s added, %.0f%% of it in card-addressable sectors'
              % (sm['from_year'], sm['to_year'], '{:,.0f}'.format(sm['total_added']),
                 (sm['addressable_share_of_growth'] or 0) * 100))

    print('\nOPERATIONAL LEVERS')
    print('-' * 78)
    if cash:
        L = cash['latest']
        print('  Cash pool      EUR %s withdrawn vs EUR %s on cards (%s)'
              % ('{:,.0f}'.format(L['atm_value']), '{:,.0f}'.format(L['pos_value']),
                 L['year_month']))
        print('                 ratio %.2fx, was %.2fx in %s — annualised pool EUR %s'
              % (L['ratio'], cash['first']['ratio'], cash['first']['year_month'],
                 '{:,.0f}'.format(cash['annualised_cash_pool'])))
        print('                 one point of it = EUR %s a year'
              % '{:,.0f}'.format(cash['value_of_one_point']))
    if cm:
        a, b = cm['first'], cm['latest']
        print('  Card mix       credit %.1f%% -> %.1f%% of transactions (%s -> %s)'
              % (a['credit_share_count'] * 100, b['credit_share_count'] * 100,
                 a['year_month'], b['year_month']))
    if cap:
        print('  Retail capture card value %+.1f%% vs retail trade %+.1f%% — '
              'outgrew %d of %d activities'
              % (cap['card_value_yoy'] * 100, cap['retail_mean_yoy'] * 100,
                 cap['outgrown'], cap['of']))
    if bm:
        print('  Position       %s' % bm['reference'])
        for r in bm['levels']:
            if r['index']:
                print('                 %-42s %7.1f vs %7.1f  (%.0f%%)'
                      % (r['measure'], r['kosovo'], r['euro_area'], r['index'] * 100))
        print('                 %-42s %7.0f vs %7.0f  (%.0f%%)'
              % ('Payments per terminal per year',
                 bm['payments_per_terminal_year'],
                 bm['euro_area_payments_per_terminal_year'],
                 bm['productivity_index'] * 100))
    if lever['headroom']:
        hr = [r for r in lever['headroom']['rows'] if r.get('terminals_to_median')]
        if hr:
            print('  Headroom       %s' % ', '.join(
                '%s +%d terminals' % (r['city'], r['terminals_to_median']) for r in hr))

    failed = sum(1 for q in QUALITY if q['status'] == 'failed')
    blocked = sum(1 for s in T['kpi_build_status'] if s['status'] == 'BLOCKED')
    print('\n%d findings open, %d KPIs blocked.' % (failed, blocked))
    return 0


if __name__ == '__main__':
    sys.exit(main())
