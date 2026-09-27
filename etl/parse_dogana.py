# -*- coding: utf-8 -*-
"""Parse the Kosovo Customs open-data import files into vertical monthly series.

Customs publishes one row per month, country of origin and ten-digit tariff
code, with value, quantity and the duties charged. That is far finer than the
report needs, so it is aggregated here to month x merchant vertical and the
detail is left in the file.

WHAT AN IMPORT IS AND IS NOT. An import is a supply-side signal. It says goods
entered the country, not that anyone bought them, and it carries no retail
margin, so it is never equated with consumer sales. Its use here is direction
and relative momentum between verticals, which is the question it can answer.

Coverage is reported rather than assumed: the share of value that no rule
classified is returned alongside the series, so a vertical total can be read
against how much of the file it left behind.
"""
import os

try:
    import openpyxl
except ImportError:  # pragma: no cover
    openpyxl = None

import verticals as V


SHEET_FOR = {'IMPORT': 'IMPORT', 'EXPORT': 'EXPORT'}


def _rows(path, sheet):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    name = sheet if sheet in wb.sheetnames else wb.sheetnames[0]
    ws = wb[name]
    head = None
    for r in ws.iter_rows(min_row=1, values_only=True):
        if head is None:
            head = [str(c or '').strip().lower() for c in r]
            continue
        yield r
    wb.close()


def _num(v):
    if v is None:
        return 0.0
    try:
        return float(str(v).replace(',', '').strip() or 0)
    except (TypeError, ValueError):
        return 0.0


def parse_file(path, direction='IMPORT'):
    """-> {'months': {...}, 'by_vertical': {...}, 'coverage': {...}}

    Column order is taken positionally because the publisher's header row is
    in Albanian and has changed spelling between years:
      0 VITI  1 MUAJI  2 Regjimi  3 Origjina  4 Kodi Tarifor
      5 Sasia  6 Vlera Mallrave  7 Netweight  8 Doganë  9 Akcizë  10 TVSH
    """
    if openpyxl is None or not os.path.exists(path):
        return None

    series = {}          # vertical -> {'YYYY-MM': value}
    origins = {}         # vertical -> {country: value}
    total = 0.0
    classified = 0.0
    by_how = {'heading': 0.0, 'chapter': 0.0, 'ambiguous': 0.0, 'unmapped': 0.0}
    months = set()

    for r in _rows(path, SHEET_FOR.get(direction, 'IMPORT')):
        if not r or r[0] is None:
            continue
        try:
            y, m = int(r[0]), int(r[1])
        except (TypeError, ValueError):
            continue
        if not (1 <= m <= 12):
            continue
        val = _num(r[6])
        if val <= 0:
            continue
        total += val
        months.add('%04d-%02d' % (y, m))

        vid, how = V.classify(r[4])
        by_how[how] = by_how.get(how, 0.0) + val
        if vid is None:
            continue
        classified += val
        ym = '%04d-%02d' % (y, m)
        series.setdefault(vid, {})
        series[vid][ym] = series[vid].get(ym, 0.0) + val
        if r[3]:
            origins.setdefault(vid, {})
            c = str(r[3]).strip()
            origins[vid][c] = origins[vid].get(c, 0.0) + val

    if not series:
        return None

    consumer = sum(v for vid, mm in series.items()
                   if V.is_consumer_facing(vid) for v in mm.values())

    return {
        'direction': direction,
        'months': sorted(months),
        'series': {k: {m: round(v, 2) for m, v in sorted(mm.items())}
                   for k, mm in series.items()},
        'top_origins': {k: sorted(o.items(), key=lambda kv: -kv[1])[:5]
                        for k, o in origins.items()},
        'coverage': {
            'total_value': round(total, 2),
            'classified_value': round(classified, 2),
            'classified_share': (classified / total) if total else None,
            'consumer_facing_value': round(consumer, 2),
            'consumer_facing_share': (consumer / total) if total else None,
            'by_rule': {k: round(v, 2) for k, v in by_how.items()},
        },
        'mapping_version': V.VERTICAL_MAPPING_VERSION,
    }


def like_for_like(cur, prior):
    """Compare two parsed files over the months they both cover.

    The current-year file stops partway through the year and the prior-year
    file is complete, so a straight total would compare eight months with
    twelve. Only the shared calendar months are counted on both sides.
    """
    if not cur or not prior:
        return None
    cur_m = {m[5:] for m in cur['months']}
    pri_m = {m[5:] for m in prior['months']}
    shared = sorted(cur_m & pri_m)
    if not shared:
        return None

    def total(parsed, vid):
        return sum(v for m, v in parsed['series'].get(vid, {}).items()
                   if m[5:] in shared)

    rows = []
    for vid in sorted(set(cur['series']) | set(prior['series'])):
        if not V.is_consumer_facing(vid):
            continue
        a, b = total(prior, vid), total(cur, vid)
        if not a:
            continue
        rows.append({
            'vertical': vid,
            'name': V.VERTICAL_NAME.get(vid, vid),
            'prior': round(a, 2), 'current': round(b, 2),
            'yoy': b / a - 1.0,
            'delta': round(b - a, 2),
            'top_origins': cur['top_origins'].get(vid, [])[:3],
        })
    if not rows:
        return None
    rows.sort(key=lambda r: -r['current'])
    for r in rows:
        r['bulk_dominated'] = r['vertical'] in V.BULK_DOMINATED

    tot_a = sum(r['prior'] for r in rows)
    tot_b = sum(r['current'] for r in rows)
    # The headline excludes bulk-dominated verticals. Fuel alone swings the
    # all-in figure by several points, and it moves with the oil price as much
    # as with anything a merchant sells, so carrying it in the headline would
    # put a commodity market in a sentence about consumer demand. Both totals
    # are returned; the page shows the retail one and names the other.
    ret = [r for r in rows if not r['bulk_dominated']]
    ret_a = sum(r['prior'] for r in ret)
    ret_b = sum(r['current'] for r in ret)
    bulk = [r['name'] for r in rows if r['bulk_dominated']]

    return {
        'months': shared,
        'window': '%s–%s' % (shared[0], shared[-1]),
        'prior_year': sorted(prior['months'])[0][:4],
        'current_year': sorted(cur['months'])[0][:4],
        'rows': rows,
        'total_prior': round(tot_a, 2),
        'total_current': round(tot_b, 2),
        'total_yoy': (tot_b / tot_a - 1.0) if tot_a else None,
        'retail_prior': round(ret_a, 2),
        'retail_current': round(ret_b, 2),
        'retail_yoy': (ret_b / ret_a - 1.0) if ret_a else None,
        'bulk_excluded': bulk,
        'note': 'Consumer-facing import value, compared over the %d calendar months '
                'both years cover. The headline excludes %s, whose import value is '
                'bulk cargo priced on a world market rather than merchant stock. '
                'Imports are a supply-side signal throughout: goods entered the '
                'country, which is not the same as goods sold, and no retail margin '
                'is implied.'
                % (len(shared), ' and '.join(bulk) if bulk else 'nothing'),
    }
