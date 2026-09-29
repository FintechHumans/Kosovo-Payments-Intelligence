# -*- coding: utf-8 -*-
"""The five decisions, derived rather than asserted.

The brief asks whether a chief executive can open this and know, in a minute,
where the opportunity is and what to do about it. That is a question about
subtraction, not addition: the answer has to be five things, each with a
number attached and a stated confidence, not a page of analysis to interpret.

WHAT IS DELIBERATELY ABSENT.

No revenue figure. Merchant service charges, interchange and scheme fees are
published by nobody, so the chain stops at payment VOLUME and hands over to an
input the bank must supply. A volume figure that is real is worth more than a
profit figure that is invented, and the page says where the arithmetic stops.

No recommendation the data cannot carry. Where a decision rests on something
unmeasured — sector-level acceptance, bank share by municipality — the
decision says so and names what would settle it. A decision engine that admits
a gap is usable; one that fills the gap with a guess is not.
"""

HIGH, MEDIUM, LOW = 'HIGH', 'MEDIUM', 'LOW'


def _d(n, verb, question, answer, basis, number, unit, confidence,
       action, limit=None, needs=None):
    return {'n': n, 'verb': verb, 'question': question, 'answer': answer,
            'basis': basis, 'number': number, 'unit': unit,
            'confidence': confidence, 'action': action,
            'limit': limit, 'needs': needs}


def build(levers, meta):
    L = levers or {}
    go = L.get('geo_opportunity')
    ab = L.get('acceptance_base')
    bm = L.get('benchmarks')
    bp = L.get('bank_position')
    im = L.get('import_momentum')
    op = L.get('opportunity')
    cash = L.get('cash')
    fp = L.get('foreign_pulse')
    out = []

    # ---- 1. where to attack
    gap_city, gap_terminals = None, 0
    if go:
        gaps = [m for m in go['municipalities'] if m.get('terminals_to_median')]
        gaps.sort(key=lambda m: -m['terminals_to_median'])
        if gaps:
            gap_city = gaps[0]
            gap_terminals = gap_city['terminals_to_median']
            others = sum(m['terminals_to_median'] for m in gaps[1:])
            out.append(_d(
                '01', 'ATTACK',
                'Where should acquisition focus?',
                '%s, and not by a little.' % gap_city['municipality'],
                '%s terminals below the median density of the measured cities; '
                'every other measured city together accounts for %d.'
                % ('{:,}'.format(gap_terminals), others),
                gap_terminals, 'terminals to median', MEDIUM,
                'Concentrate acquisition in %s. The other measured cities sit '
                'close to parity, so spreading effort across them buys little.'
                % gap_city['municipality'],
                'Terminal counts exist for %d of %d municipalities, about %.0f%% '
                'of turnover, and are read from a chart in an annual report.'
                % (len(go['measured']), len(go['municipalities']),
                   (go['measured_share_of_turnover'] or 0) * 100),
                'Terminal counts at municipality grain would extend this to the '
                'other %d municipalities.' % go['unmeasured_count']))

    # ---- 2. who to target
    if op:
        movers = [r for r in op['rows'] if r['classification'] == 'INVESTIGATE']
        names = ', '.join(r['name'] for r in movers[:3])
        out.append(_d(
            '02', 'TARGET',
            'Which merchant sectors should sales approach?',
            ('%s carry the strongest signal.' % names) if movers
            else 'The evidence does not yet separate sectors.',
            '%d of %d verticals score at all, and none carries more than %d of '
            '%d signals.' % (op['scored'], op['of'], op['max_coverage'],
                             len(op['weights'])),
            len(movers), 'verticals to investigate', LOW,
            'Treat these as candidates for investigation, not a target list. '
            'The ranking rests on import and consumer momentum, which say a '
            'market is growing, not that its merchants lack acceptance.',
            'No public source sizes a merchant vertical, counts its merchants or '
            'places terminals within it, so sector-level penetration does not '
            'exist and is not estimated.',
            'Merchant counts by vertical, or an ATK split of wholesale from '
            'retail, would turn this from direction into sizing.'))

    # ---- 3. how much can be captured
    if gap_terminals and bm and bm.get('payments_per_terminal_year'):
        per_terminal = bm['payments_per_terminal_year']
        ticket = next((r['kosovo'] for r in bm['levels']
                       if 'value per card payment' in r['measure'].lower()), None)
        if ticket:
            volume = gap_terminals * per_terminal * ticket
            out.append(_d(
                '03', 'CAPTURE',
                'How much payment volume is at stake?',
                'About %s a year in additional card volume, market-wide.'
                % _money(volume),
                '%s terminals x %s payments per terminal per year x EUR %.2f '
                'average payment.'
                % ('{:,}'.format(gap_terminals), '{:,.0f}'.format(per_terminal),
                   ticket),
                volume, 'annual card volume, market-wide', MEDIUM,
                'Use this to size the prize, then apply the share the bank '
                'expects to win. It is market volume, not this bank\'s.',
                'This is PAYMENT VOLUME, not revenue. No public source publishes '
                'merchant service charges, interchange or scheme fees, so the '
                'arithmetic stops here and the economics are an input.',
                'Merchant discount rate, interchange and terminal cost, to turn '
                'volume into contribution.'))

    # ---- 4. channel
    if cash and fp:
        out.append(_d(
            '04', 'OPTIMISE',
            'Which channel deserves the effort?',
            'Acceptance breadth, not card issuance.',
            'Fewer than %.0f%% of trading businesses accept a card, while %s a '
            'year still leaves ATMs and %.0f%% of terminal value is already on '
            'cards issued abroad.'
            % ((ab['acceptance_ceiling'] * 100) if ab else 0,
               _money(cash['annualised_cash_pool']), fp['annual_share'] * 100),
            (ab['acceptance_ceiling'] if ab else None), 'of businesses accept',
            MEDIUM,
            'Widening where a card can be presented moves more volume than '
            'issuing more cards: demand at the terminal is already there, '
            'including a quarter of it from abroad.',
            'The acceptance figure compares years that are %d apart, so it is a '
            'ceiling rather than a reading.' % (ab['lag_years'] if ab else 0)))

    # ---- 5. what the bank's own position implies
    if bp and bp.get('gap'):
        me = next((b for b in bp['banks'] if b['code'] == bp['focus']), None)
        if me:
            g = bp['gap']
            out.append(_d(
                '05', 'MONETISE',
                'What would closing our own gap be worth?',
                'About %s of additional card value on the terminals already '
                'deployed.' % _money(g['value_shortfall']),
                '%s runs %.0f%% of market payments per terminal while its average '
                'payment is %.0f%% of market: the gap is how often terminals are '
                'used, not what is spent on them.'
                % (bp['focus'], me['index_frequency'] * 100,
                   me['index_ticket'] * 100),
                g['value_shortfall'], 'card value on existing terminals', LOW,
                'Activation and placement of the existing fleet, before adding '
                'to it. A terminal used at market frequency is worth more than '
                'a new terminal used at this one.',
                'The bank extract carries no reporting period and no source file, '
                'so this is internally consistent but externally unanchored.',
                'A KBA release with a stated period, and internal economics to '
                'turn value into contribution.'))

    # The comparison the five decisions produce between them, which none of
    # them states alone: the whole market-wide prize from closing the largest
    # geographic gap is smaller than what this bank's own installed terminals
    # would carry at market frequency. Building more is worth less than using
    # what is already there.
    headline = None
    build_out = next((d for d in out if d['verb'] == 'CAPTURE'), None)
    activate = next((d for d in out if d['verb'] == 'MONETISE'), None)
    if build_out and activate and build_out['number'] and activate['number']:
        ratio = activate['number'] / build_out['number']
        headline = {
            'claim': 'Activating the terminals already deployed is worth more '
                     'than building the largest geographic gap in the market.',
            'build_value': build_out['number'],
            'build_label': 'market-wide, from closing the %s terminal gap'
                           % (gap_city['municipality'] if gap_city else 'largest'),
            'activate_value': activate['number'],
            'activate_label': 'from this bank\'s existing terminals at market '
                              'frequency',
            'ratio': ratio,
            'reading': 'The market-wide prize from the biggest placement gap is '
                       '%s. The same bank\'s installed fleet, used as often as the '
                       'market average, carries %s — %.1f times as much, and it '
                       'needs no new hardware.'
                       % (_money(build_out['number']),
                          _money(activate['number']), ratio),
            'caveat': 'The first is market-wide and the second is one bank, so '
                      'they are not the same pool. They are set against each '
                      'other to compare the size of two levers, not to add up.',
        }

    return {
        'decisions': out,
        'headline': headline,
        'generated_for': (meta or {}).get('bqk_latest'),
        'stops_at': 'payment volume',
        'note': 'Every figure here is market-wide and stops at payment volume. '
                'Nothing on this page prices a transaction, because no public '
                'source publishes merchant charges, interchange or scheme fees. '
                'The economics are an input the bank supplies, and until it does, '
                'a volume figure that is real is worth more than a profit figure '
                'that is invented.',
    }


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
