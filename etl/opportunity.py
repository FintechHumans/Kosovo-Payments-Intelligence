# -*- coding: utf-8 -*-
"""The merchant opportunity engine.

It scores merchant verticals on the evidence that actually exists for each one,
and its most important output is not the score. It is the coverage: how many of
the six signals a vertical could be judged on were available at all.

WHY MOST VERTICALS SCORE ON TWO SIGNALS, NOT SIX.

The sources do not discriminate between retail verticals the way a commercial
question needs them to:

  ATK publishes NACE sections. Grocery, fashion, electronics, automotive and
  construction retail all sit inside one wholesale-and-retail section worth
  about half of all declared turnover. ATK can size that section; it cannot
  size any vertical inside it, and this module refuses to apportion the
  section by a guess. Only hospitality and healthcare have a section to
  themselves.

  ASK publishes a retail index, which discriminates but carries no level: it
  supplies momentum and never size.

  Customs publishes value by tariff code, which maps to verticals cleanly, but
  an import is not a sale.

So a typical vertical is judged on import momentum and consumer momentum, and
the score says 2/6. That is the honest answer, and a score built from two
signals is labelled as one rather than dressed up as six.

WEIGHTS ARE DATA, NOT CODE. They are declared here, published in the payload,
and renormalised over whichever signals a vertical actually has. A vertical
with fewer than MIN_SIGNALS is not scored at all.
"""

# Visible, reviewable, and carried into the payload so the UI can show them.
DEFAULT_WEIGHTS = {
    'market_size':      0.25,
    'market_growth':    0.20,
    'merchant_base':    0.15,
    'import_momentum':  0.15,
    'acceptance_gap':   0.15,
    'business_formation': 0.10,
}

SIGNAL_LABEL = {
    'market_size': 'Market size',
    'market_growth': 'Consumer momentum',
    'merchant_base': 'Fiscalised merchant base',
    'import_momentum': 'Import momentum',
    'acceptance_gap': 'Acceptance gap',
    'business_formation': 'Business formation',
}

SIGNAL_SOURCE = {
    'market_size': 'ATK',
    'market_growth': 'ASK',
    'merchant_base': 'ATK',
    'import_momentum': 'DOGANA',
    'acceptance_gap': 'BQK',
    'business_formation': 'ASK',
}

# Below this, a vertical is reported as DATA INSUFFICIENT rather than scored.
MIN_SIGNALS = 2

# Management-safe classifications. These describe evidence, not instructions:
# nothing here says to target, buy or sell.
def classify(score, coverage, total_signals):
    if coverage < MIN_SIGNALS:
        return 'DATA INSUFFICIENT'
    if coverage <= 2:
        # Two signals can show a direction worth looking into; they cannot
        # establish an opportunity, however high the arithmetic runs.
        return 'INVESTIGATE' if score >= 55 else 'LOW EVIDENCE'
    if score >= 70:
        return 'HIGH EVIDENCE OPPORTUNITY'
    if score >= 55:
        return 'INVESTIGATE'
    if score >= 40:
        return 'DEVELOPING'
    return 'MATURE' if score >= 25 else 'LOW EVIDENCE'


def _rescale(values):
    """Map a set of raw signal values onto 0-100 by their own spread.

    Relative, deliberately: these are incomparable units — a growth rate, a
    euro total, an index — and the only defensible common ground is where each
    vertical sits against the others on that same signal.
    """
    vals = [v for v in values.values() if v is not None]
    if not vals:
        return {}
    lo, hi = min(vals), max(vals)
    if hi == lo:
        return {k: 50.0 for k, v in values.items() if v is not None}
    return {k: (v - lo) / (hi - lo) * 100.0
            for k, v in values.items() if v is not None}


# A relative signal needs a population to be relative to. ATK gives an
# exclusive section to two verticals out of seventeen; rescaling two
# observations puts one at 0 and the other at 100 and calls it a ranking. Such
# a signal is carried as a stated fact on the row and kept out of the score.
MIN_VERTICALS_PER_SIGNAL = 4


def build(import_momentum, retail_index, verticals, ask_retail_vertical,
          atk_sector_year=None, atk_section_vertical=None, weights=None):
    """-> the scored table, or None when customs data is absent.

    import_momentum comes from parse_dogana.like_for_like.
    retail_index is the ASK short-term retail series.
    """
    if not import_momentum:
        return None
    W = dict(weights or DEFAULT_WEIGHTS)

    # ---- signal 1: import momentum, from customs
    imp = {r['vertical']: r['yoy'] for r in import_momentum['rows']}
    imp_size = {r['vertical']: r['current'] for r in import_momentum['rows']}

    # ---- signal 2: consumer momentum, from the ASK retail index
    growth = {}
    if retail_index:
        for activity, series in (retail_index.get('series') or {}).items():
            vid = ask_retail_vertical(activity)
            if not vid or len(series) < 13:
                continue
            months = sorted(series)
            cur, prior = months[-1], None
            # same calendar month a year earlier, never an adjacent month
            want = '%04d-%s' % (int(cur[:4]) - 1, cur[5:])
            if want in series:
                prior = want
            if prior and series[prior]:
                growth[vid] = series[cur] / series[prior] - 1.0

    # Signals the sources cannot supply per vertical. Named here so the payload
    # can say exactly what is missing and why, rather than leaving a blank.
    unavailable = {
        'market_size': 'ATK publishes one wholesale-and-retail section covering '
                       'most consumer verticals at once. It sizes the section, '
                       'not the vertical, and the section is not apportioned.',
        'merchant_base': 'No public source counts card-accepting merchants by '
                         'merchant vertical.',
        'acceptance_gap': 'POS terminals are published nationally and by city, '
                          'never by merchant vertical.',
        'business_formation': 'The business register is published by NACE '
                              'section, which does not resolve to a vertical.',
    }

    # ---- ATK, where a vertical owns its whole NACE section
    atk_size, atk_year = {}, None
    if atk_sector_year and atk_section_vertical:
        years = sorted({r.get('year') for r in atk_sector_year if r.get('year')})
        atk_year = years[-1] if years else None
        for r in atk_sector_year:
            if r.get('year') != atk_year:
                continue
            vid, kind = atk_section_vertical(r.get('sector'))
            if vid and kind == 'exclusive':
                atk_size[vid] = atk_size.get(vid, 0.0) + (r.get('turnover') or 0)

    scaled_imp = _rescale(imp)
    scaled_growth = _rescale(growth)
    # Too few verticals to rank against each other; reported, never scored.
    size_scorable = len(atk_size) >= MIN_VERTICALS_PER_SIGNAL
    scaled_size = _rescale(atk_size) if size_scorable else {}

    rows = []
    for v in verticals:
        vid = v['id']
        if vid == 'not_consumer':
            continue
        signals, present = {}, []
        if vid in scaled_imp:
            signals['import_momentum'] = scaled_imp[vid]
            present.append('import_momentum')
        if vid in scaled_growth:
            signals['market_growth'] = scaled_growth[vid]
            present.append('market_growth')
        if vid in scaled_size:
            signals['market_size'] = scaled_size[vid]
            present.append('market_size')

        cov = len(present)
        # A score built on fewer signals than the minimum is not reported at
        # all. Printing a number beside "DATA INSUFFICIENT" invites the number
        # to be read and the label to be ignored.
        if cov >= MIN_SIGNALS:
            wsum = sum(W[k] for k in present)
            score = sum(signals[k] * W[k] for k in present) / wsum
        else:
            score = None

        rows.append({
            'vertical': vid,
            'name': v['name'],
            'addressability': v['addressability'],
            'rationale': v['rationale'],
            'score': round(score, 1) if score is not None else None,
            'coverage': cov,
            'of_signals': len(W),
            'signals_present': present,
            'classification': classify(score or 0, cov, len(W)),
            'import_yoy': imp.get(vid),
            'import_value': imp_size.get(vid),
            'consumer_yoy': growth.get(vid),
            # Stated where ATK gives the vertical a section of its own. Not
            # folded into the score while too few verticals have one to rank.
            'atk_turnover': atk_size.get(vid),
            'atk_turnover_scored': bool(vid in scaled_size),
            # weights actually used, after renormalising over what exists
            'weights_applied': ({k: round(W[k] / sum(W[x] for x in present), 3)
                                 for k in present} if present else {}),
        })

    rows.sort(key=lambda r: (-(r['score'] or -1), r['name']))
    scored = [r for r in rows if r['score'] is not None]
    return {
        'rows': rows,
        'weights': W,
        'signal_labels': SIGNAL_LABEL,
        'signal_sources': SIGNAL_SOURCE,
        'unavailable': unavailable,
        'max_coverage': max([r['coverage'] for r in rows] or [0]),
        'scored': len(scored),
        'of': len(rows),
        'window': import_momentum.get('window'),
        'atk_year': atk_year,
        'atk_exclusive_verticals': sorted(atk_size),
        'atk_size_scored': size_scorable,
        'min_signals': MIN_SIGNALS,
        'note': 'Scores are relative: each signal places a vertical against the '
                'others on that same signal, because a growth rate and a euro '
                'total have no common unit. Coverage is reported beside every '
                'score — most verticals carry two of six signals, because no '
                'public source sizes a merchant vertical, counts its merchants '
                'or places terminals within it.',
    }
