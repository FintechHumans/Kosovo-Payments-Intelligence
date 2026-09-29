#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate and load the bank's own figures — Layer 2.

    python etl/load_internal.py --check    validate only, write nothing
    python etl/load_internal.py            validate, then load

WHAT THIS REFUSES TO DO.

It will not load a row whose municipality does not match the geography
dimension. A name that does not join produces a row that exists and can never
be counted, which is worse than a missing file: the file is obviously absent,
the orphan row is invisible. So a spelling mismatch is an error and the loader
names every one it found.

It will not read a person. If a file carries a column that looks like a
merchant name, a customer id, an account or a contract, the load stops. The
commercial questions here are about segments, and an aggregate that arrives
with an identifier attached was aggregated too late.

It will not invent a rate. The unit-economics file may be entirely empty and
that is a valid state: the scenario engine then reports volume and stops,
which is the honest answer rather than a gap to paper over.
"""
import csv
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTERNAL = os.path.join(BASE, 'data', 'internal')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import verticals as V  # noqa: E402

# Anything that smells like a person or a single contract. Matched against
# column names, so an export that was not aggregated is caught at the door.
FORBIDDEN = re.compile(
    r'(name|customer|client|owner|account|iban|contract|address|phone|email'
    r'|personal|id_number|nui|tax_id)', re.I)

FILES = {
    'nlb_terminals': {
        'required': ['period', 'municipality', 'status', 'terminal_count'],
        'enums': {'status': {'ACTIVE', 'INACTIVE', 'TOTAL'}},
        'table': 'core.fact_nlb_terminals',
    },
    'nlb_merchants': {
        'required': ['period', 'municipality', 'vertical_id', 'merchant_count'],
        'optional': ['with_deposit', 'with_lending'],
        'enums': {},
        'table': 'core.fact_nlb_merchants',
    },
    'nlb_transactions': {
        'required': ['period', 'municipality', 'vertical_id', 'settlement',
                     'transaction_count', 'transaction_value'],
        'enums': {'settlement': {'ON_US', 'OFF_US', 'ALL'}},
        'table': 'core.fact_nlb_transactions',
    },
    'nlb_unit_economics': {
        'required': ['effective_from', 'scope'],
        'optional': ['mdr_bps', 'interchange_bps', 'scheme_bps',
                     'terminal_cost_month', 'servicing_month', 'note'],
        'enums': {},
        'table': 'core.nlb_unit_economics',
    },
}

PERIOD = re.compile(r'^\d{4}-\d{2}$')


def municipalities():
    """The names a file must match, taken from the built payload."""
    import json
    p = os.path.join(BASE, 'data', 'curated', 'dashboard.json')
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        d = json.load(f)
    return {r['municipality'] for r in d.get('atk_muni_sector_year') or []}


def check_file(name, spec, munis):
    path = os.path.join(INTERNAL, name + '.csv')
    if not os.path.exists(path):
        return {'file': name, 'present': False, 'rows': 0, 'errors': []}
    errors, rows = [], 0
    with open(path, encoding='utf-8-sig', newline='') as f:
        r = csv.DictReader(f)
        cols = r.fieldnames or []

        bad = [c for c in cols if FORBIDDEN.search(c or '')]
        if bad:
            errors.append('columns look person-level and must be aggregated '
                          'away first: %s' % ', '.join(bad))

        missing = [c for c in spec['required'] if c not in cols]
        if missing:
            errors.append('missing columns: %s' % ', '.join(missing))
            return {'file': name, 'present': True, 'rows': 0, 'errors': errors}

        unknown_munis, bad_verticals = set(), set()
        for i, row in enumerate(r, start=2):
            if not any((v or '').strip() for v in row.values()):
                continue
            rows += 1
            if 'period' in row and row['period'] and not PERIOD.match(row['period']):
                errors.append('row %d: period %r is not YYYY-MM'
                              % (i, row['period']))
            m = (row.get('municipality') or '').strip()
            if m and munis and m not in munis:
                unknown_munis.add(m)
            v = (row.get('vertical_id') or '').strip()
            if v and v not in {x['id'] for x in V.VERTICALS}:
                bad_verticals.add(v)
            for col, allowed in spec['enums'].items():
                val = (row.get(col) or '').strip().upper()
                if val and val not in allowed:
                    errors.append('row %d: %s=%r, expected one of %s'
                                  % (i, col, val, ', '.join(sorted(allowed))))
        if unknown_munis:
            errors.append('municipality names that do not match the geography '
                          'dimension, so these rows could never join: %s'
                          % ', '.join(sorted(unknown_munis)))
        if bad_verticals:
            errors.append('unknown vertical ids: %s'
                          % ', '.join(sorted(bad_verticals)))
    return {'file': name, 'present': True, 'rows': rows, 'errors': errors}


def main():
    check_only = '--check' in sys.argv
    munis = municipalities()
    if munis is None:
        print('No dashboard.json — run etl/build.py first so municipality '
              'names can be checked.')
        return 2

    print('checking %s\n' % os.path.relpath(INTERNAL, BASE))
    results = [check_file(n, s, munis) for n, s in FILES.items()]
    total_errors = 0
    for r in results:
        if not r['present']:
            print('  %-22s not supplied' % r['file'])
            continue
        total_errors += len(r['errors'])
        print('  %-22s %d rows%s'
              % (r['file'], r['rows'],
                 '' if not r['errors'] else '  — %d problem(s)' % len(r['errors'])))
        for e in r['errors']:
            print('      ! %s' % e)

    supplied = [r for r in results if r['present']]
    if not supplied:
        print('\nNothing supplied. The market layer stands on its own; this is '
              'a valid state, not a failure.')
        return 0
    if total_errors:
        print('\n%d problem(s). Nothing was loaded.' % total_errors)
        return 1
    print('\nAll supplied files are valid.')
    if check_only:
        print('--check: nothing written.')
        return 0

    url = os.environ.get('SUPABASE_DB_URL')
    if not url:
        print('SUPABASE_DB_URL is not set, so there is nowhere to load to.')
        return 2
    print('Loading is the next step and is deliberately not automatic: '
          'internal data should be loaded by someone who can see the target.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
