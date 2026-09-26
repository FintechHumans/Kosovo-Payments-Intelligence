# -*- coding: utf-8 -*-
"""Parse the ASK json-stat2 downloads into flat series.

ASK publishes through PxWeb, which returns json-stat2: a flat value array plus
dimension indexes. Nothing here interprets the numbers — it only flattens them
and keeps the published labels, so the curated layer can join on period and
municipality.

One thing worth stating: the retail table carries no aggregate row. ASK
publishes eight NACE retail activities and no total, so no total is invented
here. The report compares card growth against each activity and against their
unweighted mean, and says which it is using.
"""
import json
import os

RAW = None  # set by the caller


# ASK labels the retail activities in Albanian and at full NACE length. The
# report is written in English and the names appear on a chart axis, so each
# carries a short English rendering. The published name is kept alongside it.
RETAIL_EN = [
    ('dyqane jo te specializuara',        'Non-specialised stores'),
    ('dyqane jo të specializuara',       'Non-specialised stores'),
    ('produkteve ushqimore',              'Food, drink & tobacco'),
    ('karburantit',                       'Automotive fuel'),
    ('informatike',                       'Computing & communications'),
    ('pajisjeve të tjera shtëpiake',    'Household equipment'),
    ('kulturore',                         'Culture & recreation'),
    ('mallrave të tjerë',               'Other specialised stores'),
    ('postes apo internetit',             'Mail order & internet'),
    ('postes apo internetit'.replace('e', 'ë'), 'Mail order & internet'),
    ('tezga',                             'Stalls & markets'),
]


def english_retail(name):
    """Short English label for an ASK retail activity; falls back to the original."""
    low = (name or '').lower()
    for needle, en in RETAIL_EN:
        if needle.lower() in low:
            return en
    return name


def _labels(ds, dim):
    cat = ds['dimension'][dim]['category']
    idx, lab = cat['index'], cat.get('label', {})
    out = [None] * len(idx)
    for k, i in idx.items():
        out[i] = lab.get(k, k)
    return out


def _load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def retail_index(raw_dir):
    """-> {'activities': [...], 'series': {activity: {'YYYY-MM': index}}}"""
    path = os.path.join(raw_dir, 'retail_index.json')
    if not os.path.exists(path):
        return None
    ds = _load(path)['data']
    dims, size, vals = ds['id'], ds['size'], ds['value']
    acts, times = _labels(ds, dims[0]), _labels(ds, dims[1])
    series = {}
    for ai, a in enumerate(acts):
        s = {}
        for ti, t in enumerate(times):
            if 'M' not in t:
                continue
            v = vals[ai * size[1] + ti]
            if v is not None:
                s[t.replace('M', '-')] = round(float(v), 2)
        if s:
            series[a] = s
    return {'activities': acts,
            'labels': {a: english_retail(a) for a in acts},
            'series': series,
            'note': 'Index, 2021 = 100. ASK publishes no aggregate retail total '
                    'in this table, so none is constructed.'}


def enterprises_by_municipality(raw_dir):
    """Registered enterprises by municipality, activity section and quarter.

    -> {'quarters': [...], 'latest': quarter,
        'by_municipality': {muni: {'total': n, 'sections': {section: n}}}}
    """
    path = os.path.join(raw_dir, 'enterprises_muni.json')
    if not os.path.exists(path):
        return None
    ds = _load(path)['data']
    dims, size, vals = ds['id'], ds['size'], ds['value']
    muni = _labels(ds, dims[0])
    quarters = _labels(ds, dims[1])
    sections = _labels(ds, dims[2])

    def at(mi, qi, si):
        return vals[(mi * size[1] + qi) * size[2] + si]

    def qkey(q):
        # 'TM4 2023' -> (2023, 4)
        try:
            a, b = q.split()
            return (int(b), int(a.replace('TM', '')))
        except Exception:
            return (0, 0)

    order = sorted(range(len(quarters)), key=lambda i: qkey(quarters[i]))
    latest_i = order[-1]

    by_muni = {}
    for mi, m in enumerate(muni):
        secs, total = {}, 0.0
        for si, s in enumerate(sections):
            v = at(mi, latest_i, si)
            if v is None:
                continue
            v = float(v)
            secs[s] = v
            total += v
        by_muni[m] = {'total': round(total), 'sections': secs}

    return {'quarters': [quarters[i] for i in order],
            'latest': quarters[latest_i],
            'sections': sections,
            'by_municipality': by_muni,
            'note': 'Registered enterprises, ASK statistical business register. '
                    'A business that has registered is not necessarily trading, '
                    'and not every trading business accepts cards.'}


def enterprises_monthly(raw_dir):
    """Total registered enterprises by month, for a trend line."""
    path = os.path.join(raw_dir, 'enterprises_month.json')
    if not os.path.exists(path):
        return None
    ds = _load(path)['data']
    dims, size, vals = ds['id'], ds['size'], ds['value']
    sections = _labels(ds, dims[0])
    periods = _labels(ds, dims[1])
    cats = _labels(ds, dims[2])

    def at(si, pi, ci):
        return vals[(si * size[1] + pi) * size[2] + ci]

    # the 'Gjithsej' row on both the section and size axes
    def find(lst, *words):
        for i, x in enumerate(lst):
            low = (x or '').strip().lower()
            if any(low.startswith(w) for w in words):
                return i
        return 0

    si = find(sections, 'gjithsej', 'total')
    ci = find(cats, 'gjithsej', 'total')

    out = {}
    for pi, p in enumerate(periods):
        # labels look like '2026M07 : Biznes individual'
        if 'M' not in p:
            continue
        ym = p.split(':')[0].strip().replace('M', '-')
        v = at(si, pi, ci)
        if v is None:
            continue
        out[ym] = out.get(ym, 0) + float(v)
    return {'series': {k: round(v) for k, v in sorted(out.items())},
            'note': 'New and re-registered enterprises per month, all activity '
                    'sections and size classes, individual plus non-individual.'}
