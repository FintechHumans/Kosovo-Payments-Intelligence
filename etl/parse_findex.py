# -*- coding: utf-8 -*-
"""Shape the Findex download into a regional benchmark.

One thing this module is careful about: Findex measures PEOPLE, and the rest
of this report measures PAYMENTS. Card ownership and card spending are
different questions, and a country can rank well on one and badly on the
other. The two are never divided into each other here, and the page says which
question each figure answers.
"""
import json
import os

FOCUS_NAME = 'Kosovo'


def load(raw_dir):
    path = os.path.join(raw_dir, 'findex.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)
    if not raw.get('data'):
        return None

    # A survey percentage of exactly 0.0 where the same country reported a
    # substantial figure in an earlier wave is a missing value encoded as a
    # number, not a collapse. Slovenia reports 45.0% credit-card ownership in
    # 2021 and 0.0 in 2024; taking that at face value would rank a euro-area
    # country last on cards. Such points are dropped and counted, because in
    # this project an absent value is never a zero.
    suppressed = []
    for code, rows in raw['data'].items():
        history = {}
        for r in rows:
            history.setdefault(r['country'], []).append(r['value'])
        kept = []
        for r in rows:
            prior = [v for v in history[r['country']] if v > 1.0]
            if r['value'] == 0.0 and prior:
                suppressed.append({'indicator': code, 'country': r['country'],
                                   'year': r['year'],
                                   'prior_max': max(prior)})
                continue
            kept.append(r)
        raw['data'][code] = kept

    # The survey runs in waves, and not every country is in every wave. The
    # benchmark uses the latest wave that covers ALL of them, so no country is
    # compared against another country's different year.
    countries = {r['country'] for rows in raw['data'].values() for r in rows}

    MIN_COUNTRIES = 4

    def latest_usable(rows):
        """Latest wave that includes the focus country and enough peers.

        Two judgements, both about not trading away currency for tidiness.

        The wave is chosen per indicator rather than once for all of them:
        requiring one wave across every indicator would drag the benchmark
        back to whichever indicator is patchiest — here from 2024 to 2017,
        giving up seven years to keep one country in one series.

        And a wave missing a peer is preferred over an older complete one. Five
        countries in 2024 tells a reader more than six in 2017, provided the
        absence is named rather than hidden, which it is.
        """
        by_year = {}
        for r in rows:
            by_year.setdefault(r['year'], set()).add(r['country'])
        ok = [y for y, cs in by_year.items()
              if FOCUS_NAME in cs and len(cs) >= MIN_COUNTRIES]
        return max(ok) if ok else None

    indicators = []
    for code, label in raw['indicators'].items():
        all_rows = raw['data'].get(code, [])
        year = latest_usable(all_rows)
        if not year:
            continue
        rows = [r for r in all_rows if r['year'] == year]
        if not rows:
            continue
        rows.sort(key=lambda r: -r['value'])
        focus = next((r for r in rows if r['country'] == FOCUS_NAME), None)
        present = {r['country'] for r in rows}
        indicators.append({
            'code': code, 'label': label, 'year': year,
            'missing': sorted(countries - present),
            'rows': [{'country': r['country'], 'value': r['value'],
                      'is_focus': r['country'] == FOCUS_NAME} for r in rows],
            'focus_value': focus['value'] if focus else None,
            'focus_rank': (rows.index(focus) + 1) if focus else None,
            'of': len(rows),
            'leader': rows[0]['country'],
            'leader_value': rows[0]['value'],
        })

    # A trend for the focus country, on whichever indicator has the most waves.
    trend_code = max(raw['data'], key=lambda c: len(
        [r for r in raw['data'][c] if r['country'] == FOCUS_NAME]))
    trend = sorted(
        ({'year': r['year'], 'value': r['value']}
         for r in raw['data'][trend_code] if r['country'] == FOCUS_NAME),
        key=lambda r: r['year'])

    if not indicators:
        return None
    return {
        'years': sorted({i['year'] for i in indicators}),
        'countries': sorted(countries),
        'focus': FOCUS_NAME,
        'indicators': indicators,
        'suppressed': suppressed,
        'trend': {'code': trend_code,
                  'label': raw['indicators'].get(trend_code, trend_code),
                  'series': trend},
        'note': 'World Bank Global Findex, the latest wave covering every country '
                'shown. It is a household survey run to one questionnaire in each '
                'country, which is what makes it comparable — national payment '
                'statistics are not, because each central bank publishes on its '
                'own basis.',
        'limitation': 'Findex counts people, not payments. It says who holds a '
                      'card, never what was spent on one, and it runs every three '
                      'years rather than monthly, so it is older than everything '
                      'else in this report. Ownership and usage are different '
                      'questions and are not divided into each other here.',
    }
