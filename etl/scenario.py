# -*- coding: utf-8 -*-
"""Base quantities for the scenario engine — the market side, and nothing else.

THE LINE THIS MODULE DOES NOT CROSS.

Everything here is measured: market volume, average payment, payments per
terminal, the bank's own position. Nothing here is priced. Merchant discount
rate, interchange, scheme and processing cost, terminal cost and servicing are
published by nobody, and a plausible-looking default for any of them would
quietly become the answer. So they are absent from this file entirely, and the
front end asks for them as inputs that start empty.

The consequence is deliberate: until a rate is supplied, the engine reports
volume and stops. A volume figure that is real is worth more than a
contribution figure that is invented, and the difference is the whole point of
the exercise.

WHAT A SCENARIO CAN MOVE.

Three levers, because three are what the data supports:

    capture     a share of market payment value the bank does not hold today
    deploy      terminals added, at market productivity
    activate    existing terminals raised from their own frequency to market

They are reported separately rather than summed. Capture and deploy overlap —
a terminal deployed is one way share is captured — and adding them would count
the same euro twice.
"""


def _last_n(rows, n, key):
    vals = [r for r in rows if r.get(key)]
    return vals[-n:] if len(vals) >= n else vals


def build(pos_monthly, benchmarks, bank_position, geo_opportunity):
    """-> the measured quantities a scenario multiplies, with their periods."""
    if not pos_monthly:
        return None
    months = _last_n(pos_monthly, 12, 'tx_value')
    if len(months) < 12:
        return None

    market_value = sum(m['tx_value'] for m in months)
    market_count = sum(m.get('tx_count') or 0 for m in months)
    ticket = (market_value / market_count) if market_count else None
    terminals = next((m.get('terminal_stock') for m in reversed(months)
                      if m.get('terminal_stock')), None)
    per_terminal = ((benchmarks or {}).get('payments_per_terminal_year')
                    or (market_count / terminals if terminals else None))

    base = {
        'window': [months[0]['year_month'], months[-1]['year_month']],
        'market_value_12m': market_value,
        'market_count_12m': market_count,
        'average_payment': ticket,
        'terminals': terminals,
        'payments_per_terminal_year': per_terminal,
        # what one terminal carries in a year at market frequency
        'value_per_terminal_year': (per_terminal * ticket)
                                   if (per_terminal and ticket) else None,
    }

    # Terminals per merchant, so a deployment scenario can carry servicing
    # cost. Measured rather than assumed: a merchant may run several terminals,
    # and costing one per terminal would overstate servicing.
    mkt = (bank_position or {}).get('market') or {}
    if mkt.get('terminals_per_merchant'):
        base['terminals_per_merchant'] = mkt['terminals_per_merchant']

    # The bank's own position, where the extract allows it.
    if bank_position and bank_position.get('gap'):
        me = next((b for b in bank_position['banks']
                   if b['code'] == bank_position['focus']), None)
        if me:
            g = bank_position['gap']
            base['bank'] = {
                'code': bank_position['focus'],
                'share_of_value': me['share_value'],
                'share_of_terminals': me['share_pos'],
                'terminals': me['pos_terminals'],
                'fair_share_index': me['fair_share_index'],
                'tx_per_terminal': me['tx_per_terminal'],
                'average_payment': me['avg_ticket'],
                # activation: the bank's own terminals at market frequency,
                # holding its own average payment where it is
                'activation_value': g['value_shortfall'],
                'activation_transactions': g['transaction_shortfall'],
                'period_confirmed': False,
                'note': 'Bank figures come from the supplied KBA extract, which '
                        'carries no reporting period. They are internally '
                        'consistent and externally unanchored.',
            }

    # The largest measured placement gap, as a ready-made deployment scenario.
    if geo_opportunity:
        gaps = [m for m in geo_opportunity['municipalities']
                if m.get('terminals_to_median')]
        gaps.sort(key=lambda m: -m['terminals_to_median'])
        if gaps:
            base['placement_gap'] = {
                'municipality': gaps[0]['municipality'],
                'terminals': gaps[0]['terminals_to_median'],
                'others': sum(m['terminals_to_median'] for m in gaps[1:]),
                'measured_cities': len(geo_opportunity['measured']),
                'of_municipalities': len(geo_opportunity['municipalities']),
            }

    # Named for the UI so the chain can be labelled without the front end
    # having to know which side of the line each step sits on.
    base['chain'] = [
        {'step': 'Market payment volume', 'kind': 'measured',
         'source': 'BQK, twelve months'},
        {'step': 'Share captured', 'kind': 'assumption',
         'source': 'Set by the scenario'},
        {'step': 'Captured payment volume', 'kind': 'derived',
         'source': 'Market volume x share'},
        {'step': 'Merchant discount rate', 'kind': 'input',
         'source': 'Supplied by the bank — published by nobody'},
        {'step': 'Interchange paid', 'kind': 'input',
         'source': 'Supplied by the bank — published by nobody'},
        {'step': 'Scheme and processing', 'kind': 'input',
         'source': 'Supplied by the bank — published by nobody'},
        {'step': 'Terminal cost', 'kind': 'input',
         'source': 'Supplied by the bank — published by nobody'},
        {'step': 'Servicing cost', 'kind': 'input',
         'source': 'Supplied by the bank — published by nobody'},
        {'step': 'Contribution', 'kind': 'derived',
         'source': 'Only once every input above is supplied'},
    ]
    base['note'] = (
        'Every quantity here is measured over %s to %s. Nothing is priced: '
        'merchant charges, interchange, scheme fees, terminal and servicing '
        'costs are published by no one, so the engine reports volume until '
        'those are supplied as inputs. No default is offered for any of them, '
        'because a plausible default would quietly become the answer.'
        % (base['window'][0], base['window'][1]))
    return base
