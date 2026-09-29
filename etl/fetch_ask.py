#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Download the ASK series the operational report needs, from the ASKDATA PxWeb API.

Three tables, each answering a question the BQK data alone cannot:

  retail_index      Is card spending growing faster than retail trade itself?
                    A turnover index (2021=100), so it carries no euro level —
                    but the comparison of growth rates is exactly what matters:
                    cards outpacing retail means cards are taking share from
                    cash, not merely riding the same economy.

  enterprises       How many real enterprises operate in each municipality and
                    activity. ATK counts registered TAXPAYERS, which includes
                    entities that accept no cards; this is the better merchant
                    denominator.

  population        The denominator that makes every absolute figure mean
                    something, and the basis for comparison with the euro area.

Raw responses are written to data/raw/ask/ and never edited.
"""
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE_DIR, 'data', 'raw', 'ask')
API = 'https://askdata.rks-gov.net/api/v1/sq/ASKdata'

# ASK serves a certificate chain Python does not complete; the payload is
# public statistics and is checked on parse instead.
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

TABLES = {
    'retail_index': ['Short-term statistics', 'Short-term Retail Trade Statistics',
                     'Statistikat Afatshkurtëra të Tregtisë me Pakicë mujore', 'tab01.px'],
    'enterprises_muni': ['Statistical business register', 'Quarterly indicators', 'tab05r.px'],
    'enterprises_month': ['Statistical business register', 'Monthly indicators', 'tab02m.px'],

    # Active enterprises, the denominator the report has been missing. The
    # register counts businesses that have registered; this counts businesses
    # that are trading, which is the population a card could be presented to.
    # It is the same underlying ARBK register, but published as statistics and
    # therefore usable — ARBK's own portal forbids reuse of its pages.
    'enterprises_active': ['Structural business statistics', 'asn01.px'],

    # Size distribution, monthly and current. A business with one to nine
    # people is a different acceptance proposition from one with fifty, and
    # the report has so far treated every business alike.
    'enterprises_size': ['Statistical business register', 'Monthly indicators',
                         'tab05m.px'],

    # Closures, by municipality. The register has only ever been read here from
    # the arrivals side; this is the other one, and a place where acceptance is
    # worth winning is a place where businesses survive.
    'enterprises_closed': ['Statistical business register', 'Quarterly indicators',
                           'tab11r.px'],

    # Visitors and overnight stays by month. Foreign card value at Kosovo POS
    # peaks every summer; this is the series that says whether the people
    # carrying those cards are arriving as visitors.
    'tourism_month': ['Tourism and hotels', 'Treguesit mujorë', 'tab01.px'],

    # Household final consumption: what people actually spend, which is far
    # closer to what a card at a till could settle than all declared business
    # turnover is. PART 24 of the brief asks for this denominator by name.
    'household_consumption': ['National and government accounts', 'National accounts',
                              'Annual national accounts', 'gdp13.px'],

    # Turnover by economic section, from the statistics agency rather than the
    # tax administration. Two institutions measuring the same quantity by
    # different methods is worth having: where they agree the figure is firmer,
    # and where they diverge the report can say so instead of picking one.
    'turnover_structure': ['Structural business statistics', 'asn06.px'],
}


def url_for(path):
    return API + '/' + '/'.join(urllib.parse.quote(p) for p in path)


def call(path, payload=None):
    u = url_for(path)
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(
        u, data=data,
        headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90, context=CTX) as r:
        return json.loads(r.read().decode('utf-8'))


def fetch(name, path):
    meta = call(path)
    vars_ = meta.get('variables', [])
    print('\n%s  — %s' % (name, meta.get('title', '')[:88]))
    for v in vars_:
        vals = v.get('valueTexts', v.get('values', []))
        print('   %-22s %4d values   e.g. %s' % (v['text'][:22], len(vals),
                                                 ', '.join(map(str, vals[:3]))))
    # ask for everything; these tables are small enough
    query = [{'code': v['code'],
              'selection': {'filter': 'all', 'values': ['*']}} for v in vars_]
    data = call(path, {'query': query, 'response': {'format': 'json-stat2'}})
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump({'meta': meta, 'data': data}, f, ensure_ascii=False)
    n = len(data.get('value', []))
    print('   -> saved %s.json  (%s observations)' % (name, '{:,}'.format(n)))
    return data


def main():
    want = sys.argv[1:] or list(TABLES)
    for name in want:
        if name not in TABLES:
            print('unknown table %r' % name)
            continue
        try:
            fetch(name, TABLES[name])
        except Exception as e:
            print('   !! %s failed: %s' % (name, e))
    return 0


if __name__ == '__main__':
    sys.exit(main())
