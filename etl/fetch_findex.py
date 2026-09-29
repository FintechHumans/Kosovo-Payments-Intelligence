#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regional benchmark: World Bank Global Findex, Kosovo against its neighbours.

The euro-area comparison elsewhere in this report uses ECB payment statistics,
which have no Western Balkans equivalent — each central bank publishes its own
figures on its own basis, and putting six of those side by side would compare
six different definitions.

Findex is the one source that measures the same thing the same way in every
country: a household survey run to a common questionnaire. That makes it
comparable in a way national payment statistics are not.

What it costs: it is a survey of people, not a count of transactions, and it
runs every three years rather than monthly. So it answers who holds a card,
never what was spent on one, and the answer is years older than everything
else here. Both limits are carried into the payload and shown on the page.

    python etl/fetch_findex.py
"""
import json
import os
import ssl
import sys
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE_DIR, 'data', 'raw', 'findex')

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

API = 'https://api.worldbank.org/v2'

# Kosovo plus the neighbours the brief names. Slovenia is in the euro area and
# is kept because it shows where the region's most advanced market sits.
COUNTRIES = ['XKX', 'ALB', 'MKD', 'MNE', 'SRB', 'SVN']
FOCUS = 'XKX'

INDICATORS = {
    'FX.OWN.TOTL.ZS': 'Has an account',
    'fin2.t.d':       'Owns a debit card',
    'fin10':          'Owns a credit card',
}


def get(url, tries=4, timeout=90):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(4)


def main():
    os.makedirs(OUT, exist_ok=True)
    payload = {'countries': COUNTRIES, 'focus': FOCUS,
               'indicators': INDICATORS, 'data': {}}
    for code, label in INDICATORS.items():
        # The fin* series live in the Findex database (source 28) and are not
        # served from the default one; the WDI-style code is.
        src = '&source=28' if code.startswith('fin') else ''
        url = ('%s/country/%s/indicator/%s?format=json&per_page=300&date=2011:2024%s'
               % (API, ';'.join(COUNTRIES), code, src))
        print('  %s  %s' % (code, label))
        try:
            d = get(url)
        except Exception as e:
            print('    !! failed: %s' % e)
            continue
        if not isinstance(d, list) or len(d) < 2 or not d[1]:
            print('    !! no data returned for %s' % code)
            continue
        rows = [r for r in d[1] if r.get('value') is not None]
        payload['data'][code] = [
            {'country': r['country']['value'],
             # source 28 leaves countryiso3code empty and puts the code on
             # the country object instead
             'iso3': r.get('countryiso3code') or (r.get('country') or {}).get('id'),
             'year': r['date'],
             'value': float(r['value'])}
            for r in rows]
        years = sorted({r['date'] for r in rows})
        print('    %d observations, %d countries, years %s'
              % (len(rows), len({r['country']['value'] for r in rows}),
                 ', '.join(years)))

    with open(os.path.join(OUT, 'findex.json'), 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False)
    print('  -> wrote data/raw/findex/findex.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
