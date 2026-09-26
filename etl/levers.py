# -*- coding: utf-8 -*-
"""The operational layer: where the money is, which way it is moving, where the
headroom sits.

Public data cannot compute a bank's profit — merchant service charges,
interchange, scheme and processing costs and terminal-level activity are all
internal. What it can do is size the pools, show the mix shifts that move
margin, and point at the places where acceptance lags the local economy. Every
figure here is arithmetic over published series, and every one carries the
qualification that belongs to it.
"""

# ---------------------------------------------------------------------------
# Euro-area reference, ECB Payments statistics, first half of 2025.
# https://www.ecb.europa.eu/press/stats/paysec/html/ecb.pis2025h1~36edd636c8.en.html
# Kept as explicit constants rather than scraped, because they are stated in
# prose in the release and change twice a year.
# ---------------------------------------------------------------------------
EURO_AREA = {
    'period': 'H1 2025',
    'population': 352_000_000,
    'card_payments_h1': 44_000_000_000,
    'card_payments_per_capita_h1': 125.0,
    'average_card_payment_eur': 38.0,
    'cards_per_capita': 2.5,
    'pos_terminals': 24_700_000,
    'contactless_share_of_non_remote': 0.83,
    'growth_card_volume_yoy': 0.096,
    'growth_card_value_yoy': 0.087,
    'growth_pos_terminals_yoy': 0.240,
    'growth_cards_yoy': 0.122,
    'source': 'ECB, Payments statistics: first half of 2025',
    'url': 'https://www.ecb.europa.eu/press/stats/paysec/html/'
           'ecb.pis2025h1~36edd636c8.en.html'
}

# Kosovo Agency of Statistics, Population and Housing Census 2024, final results.
KOSOVO_POPULATION = 1_586_659
POPULATION_SOURCE = {
    'institution': 'ASK',
    'title': 'Population and Housing Census 2024 — first final results',
    'value': KOSOVO_POPULATION,
    'url': 'https://ask.rks-gov.net/'
}


def _sum(rows, key):
    return sum(r[key] for r in rows if r.get(key))


def cash_displacement(channel_mix):
    """The pool still being withdrawn as cash, and which way the ratio moves.

    ATM withdrawals are not all POS-addressable — rent, wages and person-to-
    person transfers pass through cash too. The series is reported as the
    upper bound of the pool, not as a forecast of what cards can capture.
    """
    series = []
    for m in channel_mix:
        pos = (m['channels'].get('POS') or {}).get('value')
        atm = (m['channels'].get('ATM Withdrawal') or {}).get('value')
        posc = (m['channels'].get('POS') or {}).get('count')
        atmc = (m['channels'].get('ATM Withdrawal') or {}).get('count')
        if not pos or not atm:
            continue
        series.append({
            'year_month': m['year_month'],
            'pos_value': pos, 'atm_value': atm,
            'ratio': atm / pos,
            'card_share_of_the_two': pos / (pos + atm),
            'avg_withdrawal': (atm / atmc) if atmc else None,
            'avg_card_payment': (pos / posc) if posc else None})
    if not series:
        return None
    first, last = series[0], series[-1]
    return {
        'series': series,
        'latest': last,
        'first': first,
        'annualised_cash_pool': last['atm_value'] * 12,
        'value_of_one_point': last['atm_value'] * 12 * 0.01,
        'ratio_change': last['ratio'] - first['ratio'],
        'note': 'ATM withdrawals bound the cash pool from above: not every euro '
                'withdrawn could have been spent at a point of sale.'}


def card_mix(payments_count, payments_value):
    """Credit versus debit — the mix that moves margin, not volume."""
    pc = {r['period']: r for r in payments_count}
    pv = {r['period']: r for r in payments_value}
    out = []
    for p in sorted(pc):
        c = pc[p]
        tot_n = sum(c.get(k) or 0 for k in ('card_debit', 'card_credit', 'card_delayed'))
        if not tot_n:
            continue
        row = {'year_month': p,
               'debit_count': c.get('card_debit'),
               'credit_count': c.get('card_credit'),
               'delayed_count': c.get('card_delayed'),
               'credit_share_count': (c.get('card_credit') or 0) / tot_n}
        v = pv.get(p)
        if v:
            tot_v = sum(v.get(k) or 0 for k in ('card_debit', 'card_credit', 'card_delayed'))
            if tot_v:
                row.update(debit_value=v.get('card_debit'),
                           credit_value=v.get('card_credit'),
                           credit_share_value=(v.get('card_credit') or 0) / tot_v)
        out.append(row)
    if not out:
        return None
    withv = [r for r in out if r.get('credit_share_value') is not None]
    return {'series': out, 'first': out[0], 'latest': out[-1],
            'first_with_value': withv[0] if withv else None,
            'latest_with_value': withv[-1] if withv else None,
            'note': 'Card function as published by BQK. Instalment plans are not '
                    'published by BQK in any reviewed table; credit-function '
                    'payments are the nearest available proxy and are not the '
                    'same thing.'}


def retail_capture(retail, pos_monthly, months=7):
    """Is card value growing faster than retail trade itself?

    Compares like calendar months year on year. ASK publishes no retail total,
    so each activity is compared separately and the unweighted mean is reported
    as such.
    """
    if not retail:
        return None
    rm = {r['year_month']: r for r in pos_monthly}
    latest = max((k for k in rm if rm[k].get('tx_value')), default=None)
    if not latest:
        return None
    ly, lm = int(latest[:4]), int(latest[5:7])

    def yoy(series):
        vals = []
        for m in range(1, lm + 1):
            a, b = '%04d-%02d' % (ly, m), '%04d-%02d' % (ly - 1, m)
            if series.get(a) and series.get(b):
                vals.append(series[a] / series[b] - 1)
        return (sum(vals) / len(vals)) if vals else None

    acts = []
    for name, s in retail['series'].items():
        g = yoy(s)
        if g is not None:
            acts.append({'activity': name, 'yoy': g})
    card = yoy({k: v['tx_value'] for k, v in rm.items() if v.get('tx_value')})
    if card is None or not acts:
        return None
    mean = sum(a['yoy'] for a in acts) / len(acts)
    return {'through': latest, 'months': lm,
            'card_value_yoy': card,
            'retail_activities': sorted(acts, key=lambda a: -a['yoy']),
            'retail_mean_yoy': mean,
            'gap_pp': card - mean,
            'outgrown': sum(1 for a in acts if a['yoy'] < card),
            'of': len(acts),
            'note': 'Retail turnover is an index (2021 = 100); the comparison is '
                    'of growth rates, not levels. ASK publishes no aggregate, so '
                    'the mean across activities is unweighted.'}


def benchmarks(pos_monthly, cards, population=KOSOVO_POPULATION):
    """Kosovo against the euro area, on the ECB's own reference half-year."""
    rm = {r['year_month']: r for r in pos_monthly}
    cd = {r['year_month']: r for r in cards}

    def half(year):
        ms = ['%04d-%02d' % (year, m) for m in range(1, 7)]
        c = sum(rm[m]['tx_count'] for m in ms if rm.get(m) and rm[m].get('tx_count'))
        v = sum(rm[m]['tx_value'] for m in ms if rm.get(m) and rm[m].get('tx_value'))
        term = [rm[m]['terminal_stock'] for m in ms
                if rm.get(m) and rm[m].get('terminal_stock')]
        return c, v, (term[-1] if term else None)

    c25, v25, t25 = half(2025)
    c26, v26, t26 = half(2026)
    if not c25:
        return None
    ea = EURO_AREA
    cards25 = cd.get('2025-06') or cd.get(max(cd)) or {}
    cards26 = cd.get('2026-06') or cd.get(max(cd)) or {}

    def ratio(x, y):
        return (x / y) if (x and y) else None

    rows = [
        {'measure': 'Card payments per inhabitant, half-year',
         'kosovo': c25 / population, 'euro_area': ea['card_payments_per_capita_h1'],
         'unit': 'payments'},
        {'measure': 'POS terminals per 1,000 inhabitants',
         'kosovo': (t25 / population * 1000) if t25 else None,
         'euro_area': ea['pos_terminals'] / ea['population'] * 1000,
         'unit': 'terminals'},
        {'measure': 'Payment cards per inhabitant',
         'kosovo': ratio(cards25.get('All cards'), population),
         'euro_area': ea['cards_per_capita'], 'unit': 'cards'},
        {'measure': 'Average value per card payment',
         'kosovo': v25 / c25, 'euro_area': ea['average_card_payment_eur'],
         'unit': 'EUR'},
    ]
    for r in rows:
        r['index'] = ratio(r['kosovo'], r['euro_area'])

    # Productivity is the one that surprises, so it is computed explicitly.
    xk_per_terminal = (c25 * 2 / t25) if t25 else None
    ea_per_terminal = ea['card_payments_h1'] * 2 / ea['pos_terminals']

    growth = [
        {'measure': 'Card payment volume', 'kosovo': ratio(c26, c25) and c26 / c25 - 1,
         'euro_area': ea['growth_card_volume_yoy']},
        {'measure': 'Card payment value', 'kosovo': ratio(v26, v25) and v26 / v25 - 1,
         'euro_area': ea['growth_card_value_yoy']},
        {'measure': 'POS terminals', 'kosovo': ratio(t26, t25) and t26 / t25 - 1,
         'euro_area': ea['growth_pos_terminals_yoy']},
        {'measure': 'Cards in circulation',
         'kosovo': ratio(cards26.get('All cards'), cards25.get('All cards'))
                   and cards26['All cards'] / cards25['All cards'] - 1,
         'euro_area': ea['growth_cards_yoy']},
    ]
    for g in growth:
        g['multiple'] = ratio(g['kosovo'], g['euro_area'])

    return {'reference': ea['period'], 'population': population,
            'levels': rows, 'growth': growth,
            'payments_per_terminal_year': xk_per_terminal,
            'euro_area_payments_per_terminal_year': ea_per_terminal,
            'productivity_index': ratio(xk_per_terminal, ea_per_terminal),
            'source': ea['source'], 'url': ea['url'],
            'note': 'Kosovo figures are the same half-year the ECB reports, so the '
                    'comparison is like for like. Euro-area figures are quoted from '
                    'the ECB release, not recomputed.'}


def acceptance_headroom(geo, enterprises):
    """Where acceptance lags the local economy.

    Uses ASK registered enterprises where available — a better merchant
    denominator than ATK taxpayers, which count filers rather than traders.
    Terminal counts remain BQK city estimates, so the ratio stays indicative.
    """
    if not geo:
        return None
    ent = (enterprises or {}).get('by_municipality', {})
    rows = []
    for g in geo:
        e = ent.get(g['city'])
        rows.append({
            'city': g['city'],
            'pos_terminals': g.get('pos_terminals'),
            'taxpayers': g.get('taxpayers'),
            'enterprises': e['total'] if e else None,
            'addressable_ceiling': g.get('addressable_ceiling'),
            'pos_per_1000_enterprises': (g['pos_terminals'] / e['total'] * 1000)
                                        if (e and e['total']) else None,
            'pos_per_eur1m_ceiling': g.get('pos_per_eur1m_ceiling')})
    dens = [r['pos_per_eur1m_ceiling'] for r in rows if r['pos_per_eur1m_ceiling']]
    if not dens:
        return {'rows': rows}
    dens.sort()
    median = dens[len(dens) // 2]
    for r in rows:
        d = r['pos_per_eur1m_ceiling']
        if d and d < median and r['addressable_ceiling']:
            r['below_median_pct'] = (median - d) / median
            r['terminals_to_median'] = round(
                r['addressable_ceiling'] / 1e6 * (median - d))
    return {'rows': sorted(rows, key=lambda r: -(r['pos_per_eur1m_ceiling'] or 0)),
            'median_density': median,
            'note': 'Terminal counts are BQK city estimates and the turnover is the '
                    'same-named ATK municipality, so density is indicative. It shows '
                    'where acceptance sits relative to peers, not a target.'}


def penetration(atk_sector_year, pos_monthly_t15, retail):
    """The spine of the report: how much of the economy settles on a card.

    This is the one series that needs all three institutions. ATK gives the
    declared economy, BQK gives what moved across card rails, ASK gives the
    retail base those cards are competing for. None of them publishes the
    ratio; it only exists when they are put together.

    ATK turnover is ALL declared business turnover — wholesale, B2B and
    government contracting included — so the ratio is a floor on card
    penetration of addressable spending, not a retail share. What matters is
    the direction and the speed, both of which are unambiguous.
    """
    econ = {}
    for r in atk_sector_year:
        econ[r['year']] = econ.get(r['year'], 0.0) + r['turnover']
    if not econ:
        return None

    card_n, card_v = {}, {}
    for r in pos_monthly_t15:
        y = int(r['year_month'][:4])
        if r.get('tx_count'):
            card_n[y] = card_n.get(y, 0.0) + r['tx_count']
        if r.get('tx_value'):
            card_v[y] = card_v.get(y, 0.0) + r['tx_value']

    retail_year = {}
    if retail:
        for s in retail.get('series', {}).values():
            per = {}
            for ym, v in s.items():
                per.setdefault(int(ym[:4]), []).append(v)
            for y, vs in per.items():
                if len(vs) >= 12:
                    retail_year.setdefault(y, []).append(sum(vs) / len(vs))
        retail_year = {y: sum(v) / len(v) for y, v in retail_year.items() if v}

    years = sorted(y for y in econ if y in card_v and econ[y])
    if len(years) < 2:
        return None

    base = years[0]
    series = []
    for y in years:
        series.append({
            'year': y,
            'turnover': econ[y],
            'card_count': card_n.get(y),
            'card_value': card_v.get(y),
            'penetration': card_v[y] / econ[y],
            'turnover_index': econ[y] / econ[base] * 100,
            'card_index': (card_v[y] / card_v[base] * 100) if card_v.get(base) else None,
            'retail_index': retail_year.get(y)})

    first, last = series[0], series[-1]
    n = last['year'] - first['year']
    econ_mult = last['turnover'] / first['turnover']
    card_mult = last['card_value'] / first['card_value']
    return {
        'series': series,
        'first': first, 'latest': last, 'years': n,
        'economy_multiple': econ_mult,
        'card_multiple': card_mult,
        'card_faster_by': card_mult / econ_mult,
        'economy_cagr': econ_mult ** (1.0 / n) - 1,
        'card_cagr': card_mult ** (1.0 / n) - 1,
        'penetration_first': first['penetration'],
        'penetration_latest': last['penetration'],
        'still_elsewhere': 1 - last['penetration'],
        'note': 'Card value from BQK Table 15 (domestic plus foreign cards at Kosovo '
                'POS) over ATK declared business turnover. ATK turnover includes '
                'wholesale and B2B activity that no card could settle, so this is a '
                'floor on penetration of addressable spending — the trend is the point, '
                'not the level.'}


def sector_momentum(atk_sector_year, sectors, first_year=None, last_year=None):
    """Which parts of the economy grew, and whether a card could settle them."""
    by = {}
    for r in atk_sector_year:
        by.setdefault(r['sector'], {})[r['year']] = r
    years = sorted({r['year'] for r in atk_sector_year})
    if len(years) < 2:
        return None
    a = first_year or years[0]
    z = last_year or years[-1]
    cls = {s['standardized_sector']: s['addressability_class'] for s in sectors}
    rows = []
    for name, yv in by.items():
        if a in yv and z in yv and yv[a]['turnover'] > 0:
            rows.append({
                'sector': name,
                'first': yv[a]['turnover'], 'latest': yv[z]['turnover'],
                'growth': yv[z]['turnover'] / yv[a]['turnover'] - 1,
                'added': yv[z]['turnover'] - yv[a]['turnover'],
                'addressability': cls.get(name, 'REVIEW_REQUIRED'),
                'taxpayers': yv[z].get('taxpayers')})
    total_added = sum(r['added'] for r in rows if r['added'] > 0)
    for r in rows:
        r['share_of_growth'] = (r['added'] / total_added) if total_added else None
    addressable_added = sum(r['added'] for r in rows
                            if r['addressability'] in ('HIGH', 'REVIEW_REQUIRED')
                            and r['added'] > 0)
    return {'from_year': a, 'to_year': z,
            'rows': sorted(rows, key=lambda r: -r['added']),
            'total_added': total_added,
            'addressable_added': addressable_added,
            'addressable_share_of_growth': (addressable_added / total_added)
                                           if total_added else None}


def emerging_channels(channel_mix):
    """The small, fast channels: e-commerce and the digital wallet."""
    out = {}
    for name in ('E-commerce', 'Digital Wallet', 'E-money'):
        pts = [(m['year_month'], (m['channels'].get(name) or {}).get('count'))
               for m in channel_mix]
        pts = [(k, v) for k, v in pts if v]
        if len(pts) < 13:
            continue
        cur, prior = pts[-1], pts[-13]
        out[name] = {'series': [{'year_month': k, 'count': v} for k, v in pts],
                     'latest': cur[1], 'latest_period': cur[0],
                     'prior': prior[1], 'prior_period': prior[0],
                     'yoy': cur[1] / prior[1] - 1 if prior[1] else None}
    pos = [(m['year_month'], (m['channels'].get('POS') or {}).get('count'))
           for m in channel_mix]
    pos = [(k, v) for k, v in pos if v]
    if pos:
        out['_pos_scale'] = {'latest': pos[-1][1], 'latest_period': pos[-1][0]}
    return out or None
