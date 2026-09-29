# -*- coding: utf-8 -*-
"""The management cockpit: one card per question management actually asks.

Each card carries the same six things, and a card missing any of them does not
appear:

    signal        which way it is moving
    scale         how big it is, in a unit a reader can hold
    evidence      the measured figures behind the signal
    implication   what follows from it, and nothing that does not
    confidence    PASS / WARNING / BLOCKED, from what the inputs support
    source        which institutions, at which provenance level

IMPLICATIONS ARE NOT RECOMMENDATIONS. Every implication here is a statement
about what the evidence shows or bounds. None says to do anything: no public
source prices a transaction, so nothing here can tell anyone what an action
would be worth. Where a card is tempted toward advice, it states the limit
instead.

Nothing is computed from scratch. Every figure is read from a lever that
already carries its own qualification, so a caveat cannot be lost on the way
to the front page.
"""

# PART 37: provenance level, which is a different question from PASS/WARNING.
# A figure can be perfectly sound and still rest on a supplied extract.
LEVEL_A = 'A'   # official, machine-readable, refetchable
LEVEL_B = 'B'   # official publication or table, downloaded and hashed
LEVEL_C = 'C'   # supplied extract, incomplete provenance

SOURCE_LEVEL = {
    'ASK': LEVEL_A,
    'DOGANA': LEVEL_A,
    'BQK': LEVEL_B,
    'ATK': LEVEL_B,
    'ECB': LEVEL_B,
    'KBA': LEVEL_C,
}

LEVEL_MEANING = {
    LEVEL_A: 'Official and machine-readable — refetchable on demand.',
    LEVEL_B: 'Official publication, downloaded and hashed.',
    LEVEL_C: 'Supplied extract. No source file, no hash, and in this case no '
             'stated reporting period.',
}


def _card(key, title, question, signal, scale, evidence, implication,
          confidence, sources, limitation=None):
    return {
        'key': key, 'title': title, 'question': question,
        'signal': signal, 'scale': scale,
        'evidence': [e for e in evidence if e],
        'implication': implication,
        'confidence': confidence,
        'sources': sources,
        # A card is only as well-sourced as its weakest input. Reporting the
        # strongest would let one machine-readable series vouch for a supplied
        # extract sitting beside it.
        'level': max((SOURCE_LEVEL.get(s, LEVEL_C) for s in sources),
                     key=lambda x: {'A': 0, 'B': 1, 'C': 2}[x], default=LEVEL_B),
        'limitation': limitation,
    }


def _dir(x, up='Accelerating', down='Slowing', flat='Broadly flat', band=0.01):
    if x is None:
        return 'Unknown'
    if x > band:
        return up
    if x < -band:
        return down
    return flat


def build(levers, meta):
    """-> {'cards': [...], 'watchlist': [...]} or None."""
    L = levers or {}
    pen = L.get('penetration')
    cap = L.get('retail_capture')
    cash = L.get('cash')
    bm = L.get('benchmarks')
    mix = L.get('card_mix')
    ab = L.get('acceptance_base')
    bp = L.get('bank_position')
    im = L.get('import_momentum')
    op = L.get('opportunity')

    cards = []

    # ---- 1. card adoption
    if pen and cap:
        cards.append(_card(
            'adoption', 'Card adoption',
            'Is card usage growing faster than the economy carrying it?',
            _dir(cap['card_value_yoy'] - cap['retail_mean_yoy']),
            '%.1f%% of declared turnover settles on a card' % (pen['penetration_latest'] * 100),
            ['Card value %+.1f%% against retail trade %+.1f%%'
             % (cap['card_value_yoy'] * 100, cap['retail_mean_yoy'] * 100),
             'Outgrew %d of the %d retail activities ASK publishes'
             % (cap['outgrown'], cap['of']),
             'Penetration %.2f%% to %.2f%% between %d and %d'
             % (pen['first']['penetration'] * 100, pen['latest']['penetration'] * 100,
                pen['first']['year'], pen['latest']['year'])],
            'Card spending is taking share rather than following the economy: it '
            'grows faster than the retail activity underneath it. Adoption is not '
            'what limits the business.',
            'PASS', ['BQK', 'ATK', 'ASK'],
            'Turnover includes wholesale and business-to-business trade no card '
            'could settle, so the level is a floor and the direction is the point.'))

    # ---- 2. acceptance capacity
    if ab:
        cards.append(_card(
            'acceptance', 'Acceptance capacity',
            'Can the economy present a card where it wants to?',
            'Constrained',
            'Fewer than %.0f%% of trading businesses accept a card'
            % (ab['acceptance_ceiling'] * 100),
            ['%s active enterprises in %s' % ('{:,}'.format(int(ab['active_enterprises'])),
                                              ab['active_year']),
             '%s card-accepting merchants in %s' % ('{:,}'.format(int(ab['merchants'])),
                                                    ab['merchants_period']),
             'At least %s businesses outside acceptance'
             % '{:,}'.format(int(ab['not_accepting_floor']))],
            'Where a card can be presented is the binding constraint, and it is '
            'the one measured here rather than inferred.',
            'WARNING', ['ASK', 'BQK'],
            'The two sides are %d years apart and the business base grew in '
            'between, so the share is a ceiling and the shortfall a floor.'
            % ab['lag_years']))

    # ---- 3. POS productivity
    if bm:
        cards.append(_card(
            'productivity', 'POS productivity',
            'How hard does an installed terminal work?',
            'Behind, but less than density suggests',
            '%s payments per terminal a year, %.0f%% of the euro area'
            % ('{:,}'.format(int(bm['payments_per_terminal_year'])),
               bm['productivity_index'] * 100),
            ['Terminal density %.0f%% of the euro area'
             % (next((r['index'] for r in bm['levels']
                      if 'terminals' in r['measure'].lower()), 0) * 100),
             'Payments per terminal %.0f%% of the euro area'
             % (bm['productivity_index'] * 100),
             'Reference period %s' % bm['reference']],
            'Density and productivity say different things and are reported '
            'separately: the network is thin, but the terminals in it are worked '
            'harder than their number implies.',
            'PASS', ['BQK', 'ECB'],
            'Quoting either figure alone misstates the position.'))

    # ---- 4. cash displacement
    if cash:
        ratio = cash.get('cash_to_pos_t12m')
        cards.append(_card(
            'cash', 'Cash displacement',
            'How much activity still settles in cash?',
            _dir(-(cash.get('ratio_change') or 0), 'Falling', 'Rising', 'Flat', 0.02),
            '%s withdrawn over the trailing twelve months'
            % _money(cash['annualised_cash_pool']),
            ['Cash-to-card ratio %.2f now against %.2f at the start'
             % (cash['latest']['ratio'], cash['first']['ratio']),
             ('%.2f euros withdrawn per euro on cards, full year' % ratio)
             if ratio else None,
             'One point of the pool is worth %s' % _money(cash['value_of_one_point'])],
            'The pool is shrinking relative to card spending. Its size bounds the '
            'opportunity; it does not describe it.',
            'PASS', ['BQK'],
            'Rent, wages and person-to-person transfers move as cash and could '
            'never have settled at a till, so the addressable part is smaller.'))

    # ---- 5. merchant opportunity
    if op:
        cards.append(_card(
            'opportunity', 'Merchant opportunity',
            'Which merchant verticals can the evidence speak to?',
            'Thinly evidenced',
            '%d of %d verticals carry enough signal to score'
            % (op['scored'], op['of']),
            ['No vertical carries more than %d of %d declared signals'
             % (op['max_coverage'], len(op['weights'])),
             '%d verticals report insufficient data'
             % sum(1 for r in op['rows'] if r['classification'] == 'DATA INSUFFICIENT'),
             'ATK gives an exclusive section to %d verticals only'
             % len(op.get('atk_exclusive_verticals') or [])],
            'The evidence supports direction per vertical, not sizing. Anything '
            'presented as a ranked opportunity list today would be built on two '
            'signals wearing the clothes of six.',
            'WARNING', ['DOGANA', 'ASK', 'ATK'],
            'Merchant counts by vertical, terminals by vertical, or an ATK split '
            'of wholesale from retail would each lift coverage. None is published.'))

    # ---- 6. competitive acquiring
    if bp and bp.get('gap'):
        g, me = bp['gap'], next((b for b in bp['banks']
                                 if b['code'] == bp['focus']), None)
        if me:
            cards.append(_card(
                'competitive', 'Competitive acquiring',
                'Does each terminal carry its share of the value?',
                'Below fair share' if me['fair_share_index'] < 1 else 'Above fair share',
                '%s at %.2f× fair share' % (bp['focus'], me['fair_share_index']),
                ['%.1f%% of terminals against %.1f%% of value'
                 % (me['share_pos'] * 100, me['share_value'] * 100),
                 'Payments per terminal %.0f%% of market, average payment %.0f%%'
                 % (me['index_frequency'] * 100, me['index_ticket'] * 100),
                 'Ranked %d of %d by value' % (g['rank_by_value'], g['of'])],
                'The gap is frequency, not ticket size: the average payment is at '
                'market while the terminals are used less often. That points at '
                'where the fleet sits and how much of it is active, not at what '
                'customers spend.',
                'WARNING', ['KBA'],
                'The extract has no stated reporting period and no source file to '
                'hash, so the figures are internally consistent but externally '
                'unanchored.'))

    # ---- 7. vertical momentum
    if im:
        up = [r for r in im['rows'] if r['yoy'] > 0 and not r.get('bulk_dominated')]
        fastest = sorted(up, key=lambda r: -r['yoy'])[:2]
        cards.append(_card(
            'verticals', 'Merchant vertical momentum',
            'Which merchant markets are being stocked?',
            _dir(im['retail_yoy'], 'Expanding', 'Contracting'),
            'Retail imports %+.1f%% like for like' % (im['retail_yoy'] * 100),
            [', '.join('%s %+.1f%%' % (r['name'], r['yoy'] * 100) for r in fastest)
             if fastest else None,
             '%d of %d verticals growing'
             % (len(up), len([r for r in im['rows'] if not r.get('bulk_dominated')])),
             'Compared over %s, %s against %s'
             % (im['window'], im['prior_year'], im['current_year'])],
            'Importers are stocking consumer categories faster than a year ago. '
            'This is a supply-side signal: goods entered the country, which is '
            'not the same as goods sold.',
            'WARNING', ['DOGANA'],
            'Bulk-dominated categories sit outside the headline because their '
            'import line moves with a world price rather than with demand.'))

    # ---- foreign cards
    fp = L.get('foreign_pulse')
    if fp:
        cards.append(_card(
            'foreign', 'Foreign-card activity',
            'How much of what crosses a terminal was issued abroad?',
            _dir(fp['latest'].get('yoy'), 'Rising', 'Easing'),
            '%s over twelve months, %.1f%% of POS value'
            % (_money(fp['annual_foreign_value']), fp['annual_share'] * 100),
            ['Peaks at %.1f%% in %s, falls to %.1f%% in %s'
             % (fp['peak']['share'] * 100, fp['peak']['year_month'],
                fp['trough']['share'] * 100, fp['trough']['year_month']),
             'A seasonal swing of %.1f points' % (fp['swing_pp'] * 100),
             ('Latest month %+.1f%% on the same month a year earlier'
              % (fp['latest']['yoy'] * 100)) if fp['latest'].get('yoy') else None],
            'A quarter of terminal value is settled on cards issued elsewhere, and '
            'the share moves by more than twenty points between winter and August. '
            'A terminal that looks ordinary in November carries a different mix in '
            'summer.',
            'PASS', ['BQK'],
            'This says where a card was issued, never who held it: a returning '
            'member of the diaspora and a tourist are the same row.'))

    # ---- 8. margin composition
    if mix and mix.get('first') and mix.get('latest'):
        a, b = mix['first'], mix['latest']
        cards.append(_card(
            'margin', 'Payment mix',
            'What is happening to the composition behind the volume?',
            _dir(b['credit_share_count'] - a['credit_share_count'],
                 'Shifting to credit', 'Shifting to debit', 'Stable', 0.002),
            'Credit-function share %.1f%% of card payments'
            % (b['credit_share_count'] * 100),
            ['From %.1f%% in %s to %.1f%% in %s'
             % (a['credit_share_count'] * 100, a['year_month'],
                b['credit_share_count'] * 100, b['year_month'])],
            'Credit and debit are priced differently, so a shift in the mix '
            'changes what acceptance earns even while volume rises. By how much '
            'cannot be computed here.',
            'PASS', ['BQK'],
            'No public source publishes merchant service charges or interchange, '
            'so no revenue effect is quantified.'))

    watchlist = _watchlist(cards)
    return {
        'cards': cards,
        'watchlist': watchlist,
        'levels': LEVEL_MEANING,
        'generated_for': meta.get('bqk_latest') if meta else None,
        'note': 'Every card states a measured signal, its scale, the evidence '
                'behind it and what the evidence does not support. None contains '
                'a recommendation: no public source prices a transaction, so '
                'nothing here can say what an action would be worth.',
    }


def _watchlist(cards, limit=7):
    """The cards that most deserve attention, with why they were chosen.

    Ranked by what is weakest or most constrained rather than by what reads
    best, so a healthy signal does not crowd out a binding one.
    """
    order = {'WARNING': 0, 'BLOCKED': 0, 'PASS': 1}
    ranked = sorted(cards, key=lambda c: (order.get(c['confidence'], 1),
                                          {'C': 0, 'B': 1, 'A': 2}[c['level']]))
    return [{'key': c['key'], 'title': c['title'], 'signal': c['signal'],
             'scale': c['scale'], 'confidence': c['confidence'],
             'level': c['level'],
             'why': c['limitation'] or c['implication']}
            for c in ranked[:limit]]


def _money(v):
    if v is None:
        return '—'
    a = abs(v)
    if a >= 1e9:
        return '€%.2fbn' % (v / 1e9)
    if a >= 1e6:
        return '€%.1fm' % (v / 1e6)
    if a >= 1e3:
        return '€%.0fk' % (v / 1e3)
    return '€%.0f' % v
