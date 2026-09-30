# -*- coding: utf-8 -*-
"""Where money moves through machines, against where the economy is declared.

THE ONE RATIO THIS SOURCE ALLOWS.

BQK publishes city transaction figures for ATM and POS *combined*, which is why
POS productivity by geography is BLOCKED elsewhere in this report. But the
combined figure still answers a question of its own: how much money moves
through banking machines in a place, relative to the turnover that place
declares.

That ratio needs no separation of ATM from POS. It compares total measured
money movement against declared economic activity, and a city well above the
others is one where the rails carry more than its books show.

WHAT IT CANNOT SAY. It cannot attribute the excess. A high ratio may be heavy
cash withdrawal, a terminal estate serving a wider catchment, cross-border
activity, or an economy that under-declares. The measure identifies where to
look; it does not explain what is found, and nothing here pretends otherwise.

THE DENOMINATOR CARRIES ITS OWN FLAW. Declared turnover is booked where a
business is registered, not where it trades — the same effect that puts
Graçanicë second in the country. A city hosting national head offices has an
inflated denominator and therefore an understated ratio. Prishtinë is the case
in point, and it is named rather than quietly ranked last.
"""

# A city whose machine throughput approaches or exceeds its declared turnover
# is doing something the declared economy does not describe.
HIGH_RATIO = 1.00
ELEVATED_RATIO = 0.65


def build(geo, geo_opportunity=None):
    if not geo:
        return None
    flagged = set()
    concentration = {}
    for m in ((geo_opportunity or {}).get('municipalities') or []):
        concentration[m['municipality']] = m.get('concentration_ratio')
        if m.get('declared_not_transacted'):
            flagged.add(m['municipality'])

    rows = []
    for r in geo:
        turnover = r.get('turnover_total') or 0
        value = r.get('atm_pos_tx_value') or 0
        terminals = r.get('pos_terminals') or 0
        if not (turnover and value):
            continue
        rows.append({
            'city': r['city'],
            'atm_pos_value': value,
            'turnover': turnover,
            'ratio': value / turnover,
            'value_per_terminal': (value / terminals) if terminals else None,
            'pos_share_pct': r.get('pos_share_pct'),
            'terminals': terminals,
            'year': r.get('year'),
            # An inflated denominator understates the ratio, so the flag travels
            # with the row rather than living in a footnote.
            'denominator_inflated': r['city'] in flagged,
            'concentration_ratio': concentration.get(r['city']),
        })
    if len(rows) < 3:
        return None
    rows.sort(key=lambda r: -r['ratio'])

    for r in rows:
        r['band'] = ('EXCEEDS' if r['ratio'] >= HIGH_RATIO
                     else 'ELEVATED' if r['ratio'] >= ELEVATED_RATIO
                     else 'ORDINARY')

    top = rows[0]
    med = sorted(r['ratio'] for r in rows)[len(rows) // 2]
    vpt = [r['value_per_terminal'] for r in rows if r['value_per_terminal']]
    vpt_med = sorted(vpt)[len(vpt) // 2] if vpt else None

    return {
        'rows': rows,
        'year': rows[0]['year'],
        'median_ratio': med,
        'median_value_per_terminal': vpt_med,
        'leader': top,
        'leader_multiple': (top['ratio'] / med) if med else None,
        'exceeds': [r['city'] for r in rows if r['band'] == 'EXCEEDS'],
        'note': 'Value through ATMs and POS terminals combined, against declared '
                'business turnover, for the seven cities BQK publishes. The '
                'numerator cannot be split between cash and card — that is why '
                'POS productivity by geography is blocked elsewhere — so this '
                'measures total money movement, not card usage.',
        'reading': (
            '%s moves %s through machines against %s of declared turnover: a '
            'ratio of %.0f%%, %.1f times the median of the seven, on the '
            'smallest terminal share of any of them. Something there is carried '
            'by the rails that the declared economy does not show. The measure '
            'says where to look and cannot say what will be found — heavy cash '
            'withdrawal, a catchment wider than the city, cross-border traffic '
            'and under-declared trade would all read the same way.'
            % (top['city'], _money(top['atm_pos_value']), _money(top['turnover']),
               top['ratio'] * 100, (top['ratio'] / med) if med else 0)),
        'caveat': 'Declared turnover is booked where a business is registered, '
                  'not where it trades, so a city hosting head offices has an '
                  'inflated denominator and an understated ratio. Rows carrying '
                  'that distortion are marked.',
    }


def _money(v):
    if v is None:
        return '—'
    a = abs(v)
    if a >= 1e9:
        return '€%.2fbn' % (v / 1e9)
    if a >= 1e6:
        return '€%.0fm' % (v / 1e6)
    return '€%.0fk' % (v / 1e3)
