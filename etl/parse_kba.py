# -*- coding: utf-8 -*-
"""Load the KBA bank-level POS extract and prove it against its own total.

This is the only input in the project that was not downloaded from a publisher
and hashed. It was supplied by the project owner as an aggregate extract, so
there is no file to version and no SHA-256 to cite. That difference is carried
through to the UI rather than hidden: the source drawer says supplied, not
downloaded, and the period is reported as unconfirmed because the extract
carries no period label.

Nothing here derives a measure. It loads, checks that the bank columns sum to
the published 'ALL Banks' column, and refuses the file if they do not.
"""
import json
import os

SUPPLIED = None  # set by the caller


class ReconciliationError(Exception):
    pass


FIELDS = ('tx_count', 'tx_value_thousand_eur', 'pos_terminals', 'merchants')


def load(supplied_dir):
    """-> the extract, with the bank rows proven against the published total.

    Banks that report nothing keep None. A blank cell in the source is absent,
    not zero, and a bank that reports nothing must not drag a market average
    down as if it ran a network of size zero.
    """
    path = os.path.join(supplied_dir, 'kba_pos_by_bank.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)

    banks, silent = [], []
    for b in raw['banks']:
        if b.get('tx_count') is None and b.get('pos_terminals') is None:
            silent.append(b['code'])
            continue
        banks.append(b)

    # The extract publishes its own total. If our reading of the columns does
    # not reproduce it exactly, our reading is wrong and the file is refused.
    total = raw['published_total']
    checks = []
    for f_ in FIELDS:
        got = sum(b[f_] for b in banks if b.get(f_) is not None)
        want = total[f_]
        checks.append({'field': f_, 'sum_of_banks': got, 'published': want,
                       'difference': got - want})
        if got != want:
            raise ReconciliationError(
                'KBA %s: banks sum to %s, published total is %s (%+d)'
                % (f_, format(got, ','), format(want, ','), got - want))

    mult = raw['source'].get('amount_multiplier', 1000)
    for b in banks:
        b['tx_value'] = float(b['tx_value_thousand_eur']) * mult
    total = dict(total)
    total['tx_value'] = float(total['tx_value_thousand_eur']) * mult

    return {'source': raw['source'],
            'universe': raw['universe'],
            'banks': banks,
            'silent': silent,
            'total': total,
            'checks': checks,
            'notes': raw['notes']}
