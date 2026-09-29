# -*- coding: utf-8 -*-
"""Where to attack: municipalities ranked on what the data can actually carry.

THE TRAP THIS MODULE EXISTS TO AVOID.

Ranking municipalities by declared turnover sends a sales team to the wrong
place. Graçanicë declares EUR 2.15bn from 791 taxpayers — 9.8 times the
national median per taxpayer, in a municipality of about ten thousand people.
That is turnover DECLARED there, not turnover TRANSACTED there: large
distributors register an office and book national trade against it. Three
municipalities show the pattern, and all three are flagged rather than ranked
on a number that describes a registry rather than a high street.

WHAT CAN AND CANNOT BE MEASURED.

Economic activity and the business base exist for all 38 municipalities.
Terminals exist for 7 cities only, read from a chart in an annual PDF. So a
penetration gap — the thing a targeting decision actually needs — can be
computed for 7 municipalities covering about two thirds of turnover, and for
the other 31 it cannot. Those are marked UNMEASURED rather than given a score
built from the half of the inputs that happen to exist.

Every field carries what kind of thing it is: FACT where a publisher states
it, PROXY where it stands in for something else, ESTIMATE where it was
derived. Nothing here is a model output presented as a statistic.
"""

FACT, PROXY, ESTIMATE = 'FACT', 'PROXY', 'ESTIMATE'

# Above this multiple of the national median turnover per taxpayer, a
# municipality's declared turnover is treated as a registry artefact rather
# than local trade. Chosen to sit clear of ordinary variation: the flagged
# municipalities run 2.6 to 9.8 times median, the rest below 2.2.
CONCENTRATION_FLAG = 2.5
MIN_TAXPAYERS = 50


def _median(xs):
    s = sorted(xs)
    if not s:
        return None
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def build(muni_sector, geo, formation=None, year=None):
    """-> municipalities with their opportunity, and what each figure is."""
    if not muni_sector:
        return None
    years = sorted({r['year'] for r in muni_sector})
    year = year or years[-1]
    rows = [r for r in muni_sector if r['year'] == year]
    if not rows:
        return None

    agg = {}
    for r in rows:
        m = agg.setdefault(r['municipality'], {
            'municipality': r['municipality'], 'turnover': 0.0,
            'taxpayers': 0.0, 'addressable': 0.0, 'sectors': []})
        m['turnover'] += r['turnover'] or 0
        m['taxpayers'] += r['taxpayers'] or 0
        # The ceiling: unambiguously card-facing sectors plus the combined
        # wholesale-and-retail section, which no source splits.
        if r['addressability'] in ('HIGH', 'REVIEW_REQUIRED'):
            m['addressable'] += r['turnover'] or 0
        m['sectors'].append({'sector': r['sector'], 'turnover': r['turnover'],
                             'taxpayers': r['taxpayers'],
                             'addressability': r['addressability']})

    national_turnover = sum(m['turnover'] for m in agg.values())
    per = [m['turnover'] / m['taxpayers'] for m in agg.values()
           if m['taxpayers'] >= MIN_TAXPAYERS]
    median_per = _median(per) or 0

    # terminals, where BQK publishes them
    terminals = {g['city']: g.get('pos_terminals') for g in (geo or [])
                 if g.get('pos_terminals')}
    net_formation = {}
    for r in ((formation or {}).get('rows') or []):
        net_formation[r['municipality']] = r

    out = []
    for m in agg.values():
        tp = m['taxpayers']
        m['turnover_per_taxpayer'] = (m['turnover'] / tp) if tp else None
        m['concentration_ratio'] = ((m['turnover_per_taxpayer'] / median_per)
                                    if (median_per and m['turnover_per_taxpayer'])
                                    else None)
        m['declared_not_transacted'] = bool(
            m['concentration_ratio'] and tp >= MIN_TAXPAYERS
            and m['concentration_ratio'] >= CONCENTRATION_FLAG)
        m['share_of_turnover'] = (m['turnover'] / national_turnover
                                  if national_turnover else None)
        m['pos_terminals'] = terminals.get(m['municipality'])
        m['pos_per_eur1m_addressable'] = (
            m['pos_terminals'] / m['addressable'] * 1e6
            if (m['pos_terminals'] and m['addressable']) else None)
        f = net_formation.get(m['municipality'])
        m['net_formation'] = f['net'] if f else None
        m['closure_rate'] = f['churn'] if f else None
        m['sectors'].sort(key=lambda s: -(s['turnover'] or 0))
        m['top_sectors'] = m['sectors'][:5]
        del m['sectors']
        out.append(m)

    # Density is comparable only among the municipalities that have a terminal
    # count at all, so the median is taken over those and no one else.
    measured = [m for m in out if m['pos_per_eur1m_addressable']]
    median_density = _median([m['pos_per_eur1m_addressable'] for m in measured])
    median_addressable = _median([m['addressable'] for m in measured]) or 0

    for m in out:
        if not m['pos_per_eur1m_addressable']:
            m['archetype'] = 'UNMEASURED'
            m['archetype_reason'] = (
                'BQK publishes terminal counts for seven cities only, so the '
                'penetration gap cannot be computed here. Economic scale is '
                'known; the gap is not.')
            m['density_vs_median'] = None
            continue
        big = m['addressable'] >= median_addressable
        thin = m['pos_per_eur1m_addressable'] < median_density
        m['density_vs_median'] = (m['pos_per_eur1m_addressable'] / median_density
                                  if median_density else None)
        m['archetype'] = ('ATTACK' if (big and thin) else
                          'DEFEND' if (big and not thin) else
                          'BUILD' if thin else 'OPTIMISE')
        m['archetype_reason'] = (
            '%s addressable turnover, %s terminal density than the median of the '
            'measured cities.'
            % ('Above-median' if big else 'Below-median',
               'thinner' if thin else 'denser'))
        m['terminals_to_median'] = (
            round((median_density - m['pos_per_eur1m_addressable'])
                  * m['addressable'] / 1e6)
            if thin else 0)

    out.sort(key=lambda m: -(m['addressable'] or 0))
    flagged = [m['municipality'] for m in out if m['declared_not_transacted']]
    measured_share = (sum(m['turnover'] for m in measured) / national_turnover
                      if national_turnover else None)

    return {
        'year': year,
        'municipalities': out,
        'national_turnover': national_turnover,
        'median_turnover_per_taxpayer': median_per,
        'median_density': median_density,
        'measured': [m['municipality'] for m in measured],
        'measured_share_of_turnover': measured_share,
        'unmeasured_count': len(out) - len(measured),
        'flagged': flagged,
        'field_confidence': {
            'turnover': FACT, 'taxpayers': FACT, 'net_formation': FACT,
            'addressable': ESTIMATE, 'pos_terminals': PROXY,
            'pos_per_eur1m_addressable': ESTIMATE, 'archetype': ESTIMATE,
        },
        'note': 'Terminal counts cover %d of %d municipalities, about %.0f%% of '
                'declared turnover, and are read from a chart in an annual PDF. '
                'The remaining %d are ranked on economic scale with the '
                'penetration gap marked unmeasured rather than estimated.'
                % (len(measured), len(out), (measured_share or 0) * 100,
                   len(out) - len(measured)),
        'flag_note': '%s declare turnover far above what their taxpayer base '
                     'suggests — %s times the national median per taxpayer. That '
                     'is turnover booked at a registered office rather than '
                     'transacted on a high street, so they are flagged and not '
                     'ranked on it.'
                     % (' and '.join(flagged) or 'No municipalities',
                        ', '.join('%.1f' % m['concentration_ratio']
                                  for m in out if m['declared_not_transacted'])),
    }
