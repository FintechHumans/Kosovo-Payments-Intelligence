#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Download the Kosovo Customs open-data import files and pre-aggregate them.

Customs publishes these under its own "Open Data" heading, one workbook per
year, at ten-digit tariff-code detail. The current-year file runs further than
anything else this project holds — to August 2026, a month beyond BQK.

The workbooks are large (about 160,000 rows each) and take most of a minute to
read, so this step aggregates them once to month x merchant vertical and writes
a small cache the build reads. The workbooks themselves stay in data/raw and
out of git; the cache is what the build depends on.

    python etl/fetch_dogana.py            # current and prior year
    python etl/fetch_dogana.py 2024 2025  # named years
"""
import hashlib
import json
import os
import ssl
import sys
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE_DIR, 'data', 'raw', 'dogana')
CACHE = os.path.join(OUT, '_parsed.json')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parse_dogana  # noqa: E402

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

ROOT = 'https://dogana.rks-gov.net/SharedFolder/DocumentFiles/'

# The publisher's own filenames, which are not consistent between years.
FILES = {
    2026: ('Open_DATA_Import%20Janar-Gusht-2026.xlsx', 'import_2026_jan_aug.xlsx'),
    2025: ('Open_DATA_Import%20Janar-Dhjetor%202025.xlsx', 'import_2025.xlsx'),
    2024: ('Open_DATA_Import%20Janar-Dhjetor-2024.xlsx', 'import_2024.xlsx'),
    2023: ('Open_DATA_Import%20Janar-Dhjetor%202023.xlsx', 'import_2023.xlsx'),
}

DEFAULT_YEARS = [2025, 2026]


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def download(year):
    if year not in FILES:
        print('  no published file recorded for %d' % year)
        return None
    remote, local = FILES[year]
    path = os.path.join(OUT, local)
    if os.path.exists(path):
        print('  %d already downloaded (%s bytes)'
              % (year, format(os.path.getsize(path), ',')))
        return path
    os.makedirs(OUT, exist_ok=True)
    url = ROOT + remote
    print('  downloading %d ...' % year)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=600, context=CTX) as r:
        data = r.read()
    with open(path, 'wb') as f:
        f.write(data)
    print('  saved %s (%s bytes)' % (local, format(len(data), ',')))
    return path


def main():
    years = [int(a) for a in sys.argv[1:]] or DEFAULT_YEARS
    years.sort()
    parsed, meta = {}, {}
    for y in years:
        path = download(y)
        if not path:
            continue
        print('  parsing %d ...' % y)
        p = parse_dogana.parse_file(path, 'IMPORT')
        if not p:
            print('  !! %d produced no rows' % y)
            continue
        parsed[str(y)] = p
        meta[str(y)] = {
            'filename': os.path.basename(path),
            'url': ROOT + FILES[y][0],
            'sha256': sha256(path),
            'file_size': os.path.getsize(path),
            'months': p['months'],
        }
        c = p['coverage']
        print('    %s rows of value, %.1f%% classified, %.1f%% consumer-facing'
              % (format(int(c['total_value']), ','),
                 c['classified_share'] * 100, c['consumer_facing_share'] * 100))

    if len(parsed) < 2:
        print('  need two years for a like-for-like comparison')
    ys = sorted(parsed)
    lfl = (parse_dogana.like_for_like(parsed[ys[-1]], parsed[ys[-2]])
           if len(ys) >= 2 else None)

    with open(CACHE, 'w', encoding='utf-8') as f:
        json.dump({'years': parsed, 'sources': meta, 'like_for_like': lfl},
                  f, ensure_ascii=False)
    print('  -> wrote %s' % os.path.relpath(CACHE, BASE_DIR))
    if lfl:
        print('  like-for-like %s: retail imports %+.1f%%'
              % (lfl['window'], (lfl['retail_yoy'] or 0) * 100))
    return 0


if __name__ == '__main__':
    sys.exit(main())
