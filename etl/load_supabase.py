#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Load the curated seed into Supabase.

The seed is about three megabytes, 98% of it ATK turnover, which is far past
what an API call should carry. This connects to Postgres directly and runs the
whole file in one transaction, the way the load is meant to happen.

The connection string is read from the environment and never stored:

    export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
    python etl/load_supabase.py

Find it in the Supabase dashboard under Project Settings, Database, Connection
string, URI. Use the session pooler string for a one-off load like this.

The seed begins with a transaction and deletes every table it is about to
fill, so running it twice leaves the same database as running it once. A
failure part-way rolls back rather than leaving a half-loaded warehouse.

Nothing here writes a credential to disk, and the password is not printed.
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(BASE, 'data', 'curated', 'seed.sql')


def redact(url):
    """A connection string safe to print: everything but the password."""
    return re.sub(r'://([^:]+):[^@]+@', r'://\1:***@', url or '')


DASHBOARD = os.path.join(BASE, 'data', 'curated', 'dashboard.json')

# Keys already served by the SQL views. Writing them twice would create two
# answers to the same question, which is the one thing a warehouse must not do.
SERVED_BY_VIEWS = {'quality', 'reconciliation', 'coverage', 'kpi_status',
                   'kpi_registry', 'definitions', 'sources', 'source_versions'}


def load_derived(conn):
    """Store the computed analytical output for the browser to read.

    Everything the ETL works out in Python and SQL does not: the levers, the
    cockpit, the regional benchmark, the vertical taxonomy. One row per payload
    key, replaced wholesale rather than patched, so the table can never hold a
    mixture of two builds.
    """
    if not os.path.exists(DASHBOARD):
        print('\nno dashboard.json — skipping derived output')
        return
    with open(DASHBOARD, encoding='utf-8') as f:
        payload = json.load(f)
    version = (payload.get('meta') or {}).get('parser_version', 'unknown')

    rows = []
    for key, value in payload.items():
        if key in SERVED_BY_VIEWS:
            continue
        n = len(value) if isinstance(value, (list, dict)) else None
        rows.append((key, json.dumps(value, ensure_ascii=False), version, n))

    with conn.cursor() as cur:
        cur.execute('begin')
        cur.execute('delete from analytics.derived_output')
        cur.executemany(
            'insert into analytics.derived_output '
            '(key, payload, parser_version, row_count) values (%s, %s, %s, %s)',
            rows)
        cur.execute('commit')
    print('\nderived output: %d keys (%s)'
          % (len(rows), ', '.join(sorted(r[0] for r in rows)[:6]) + ' …'))


def main():
    url = os.environ.get('SUPABASE_DB_URL')
    if not url:
        print('SUPABASE_DB_URL is not set.\n')
        print(__doc__.split('    export')[1].split('\n\n')[0].strip())
        return 2
    if not os.path.exists(SEED):
        print('No seed at %s — run etl/build.py first.' % SEED)
        return 2

    try:
        import psycopg2
    except ImportError:
        print('psycopg2 is not installed:  pip install psycopg2-binary')
        return 2

    sql = open(SEED, encoding='utf-8').read()
    print('seed   %s (%s bytes)' % (os.path.relpath(SEED, BASE),
                                    format(len(sql.encode('utf-8')), ',')))
    print('target %s' % redact(url))

    conn = psycopg2.connect(url)
    try:
        # The seed opens its own transaction and commits at the end, so
        # autocommit is on here and the file controls the boundary.
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        load_derived(conn)
        with conn.cursor() as cur:
            cur.execute("""
                select 'core.fact_atk_turnover',      count(*) from core.fact_atk_turnover
                union all select 'core.fact_pos_transactions', count(*) from core.fact_pos_transactions
                union all select 'core.fact_pos_terminal_stock', count(*) from core.fact_pos_terminal_stock
                union all select 'core.dim_date',     count(*) from core.dim_date
                union all select 'core.dim_geography', count(*) from core.dim_geography
                union all select 'api.overview_monthly', count(*) from api.overview_monthly
                order by 1""")
            print('\nloaded:')
            for name, n in cur.fetchall():
                print('  %-32s %s' % (name, format(n, ',')))
    finally:
        conn.close()
    print('\nok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
