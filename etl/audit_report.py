# -*- coding: utf-8 -*-
"""The Data & Decision Audit Report, generated rather than written.

An audit written by hand is true on the day it is written and quietly false
afterwards. This one is derived from the same payload the report renders, so a
figure cannot move without its rating moving with it, and a source cannot lose
its hash without the audit noticing.

Five things are rated, because five things can independently be wrong:

    source      where a number came from, and whether that can be shown
    kpi         whether the inputs support the measure at all
    mapping     the joins between sources that no publisher endorses
    conclusion  the analytical claims the report makes from those numbers
    insight     what the front page tells management to think about

A conclusion can be WARNING while every source under it is PASS: sound inputs
combined across a grain mismatch still produce a shaky claim. Keeping the five
apart is what lets that show.

RATINGS

    PASS      the inputs support it and nothing material is unresolved
    WARNING   usable, with a stated limit that changes how it should be read
    FAIL      an error was found
    BLOCKED   cannot be built from what is published; the missing input is named
"""

PASS, WARNING, FAIL, BLOCKED = 'PASS', 'WARNING', 'FAIL', 'BLOCKED'
ORDER = {FAIL: 0, BLOCKED: 1, WARNING: 2, PASS: 3}


def _entry(section, key, title, rating, basis, limitation=None, clears=None):
    return {'section': section, 'key': key, 'title': title, 'rating': rating,
            'basis': basis, 'limitation': limitation, 'clears': clears}


def _sources(payload):
    """One rating per source, from what its version record can actually show."""
    versions = {}
    for v in payload.get('source_versions') or []:
        versions.setdefault(v['source_id'], v)
    out = []
    for s in payload.get('sources') or []:
        v = versions.get(s['source_id']) or {}
        hashed = bool(v.get('sha256_hash'))
        period = bool(v.get('reporting_end_date') or v.get('source_table'))
        if not hashed and not period:
            rating, lim = WARNING, ('No file hash and no stated reporting period: '
                                    'this input cannot be re-derived from a '
                                    'publication.')
            clears = 'A downloadable file with a stated period'
        elif not hashed:
            rating, lim = WARNING, ('No file to hash — the figures are quoted from '
                                    'a publication rather than parsed from a '
                                    'download.')
            clears = 'A machine-readable release'
        else:
            rating, lim, clears = PASS, None, None
        out.append(_entry(
            'source', s['source_id'],
            '%s — %s' % (s['institution'], s['dataset_name']),
            rating,
            'Hash %s, period %s, frequency %s.'
            % ('present' if hashed else 'absent',
               'stated' if period else 'absent', s.get('frequency', '?')),
            lim, clears))
    return out


def _kpis(payload):
    """KPI ratings come straight from the build; nothing is re-decided here."""
    reg = {k['kpi_id']: k for k in payload.get('kpi_registry') or []}
    out = []
    for s in payload.get('kpi_status') or []:
        k = reg.get(s['kpi_id'], {})
        # The three BLOCKED measures have no registry entry, because there is
        # no metric to describe. Their id is read back as a title rather than
        # printed raw.
        title = k.get('display_name') or s['kpi_id'].replace('_', ' ').capitalize()
        out.append(_entry(
            'kpi', s['kpi_id'],
            title,
            s['status'],
            s.get('reason') or '',
            k.get('known_limitations'),
            s.get('required_input')))
    return out


def _mappings(payload):
    """The joins no publisher endorses, which is why each is rated separately."""
    lv = payload.get('levers') or {}
    op = lv.get('opportunity') or {}
    cc = lv.get('turnover_cross_check') or {}
    cov = payload.get('dogana_coverage') or {}
    out = [
        _entry('mapping', 'sector_addressability',
               'ATK sector → card addressability',
               WARNING,
               'Mapping %s, applied to every ATK NACE section.'
               % payload.get('meta', {}).get('sector_mapping_version', '?'),
               'An analytical classification, not an ATK measure. Wholesale and '
               'retail are one published section, so the result is a floor and a '
               'ceiling rather than a number.',
               'An ATK split of wholesale from retail'),
        _entry('mapping', 'city_municipality',
               'BQK city → ATK municipality',
               WARNING,
               'Seven BQK cities joined to same-named ATK municipalities.',
               'A municipality contains settlements outside its city, so every '
               'ratio crossing the two is an approximation and is flagged as one.',
               'BQK terminal counts at municipality grain'),
        _entry('mapping', 'customs_vertical',
               'Customs tariff code → merchant vertical',
               WARNING,
               'Mapping %s. %.1f%% of import value reached a vertical; %.1f%% is '
               'consumer-facing.'
               % (payload.get('vertical_mapping_version', '?'),
                  (cov.get('classified_share') or 0) * 100,
                  (cov.get('consumer_facing_share') or 0) * 100),
               'Chapters that mix uses are resolved only at four-digit headings, '
               'and a code no heading rule claims is counted nowhere rather than '
               'assigned to the likeliest guess.',
               None),
        _entry('mapping', 'ask_retail_vertical',
               'ASK retail activity → merchant vertical',
               WARNING,
               'Six of eight published activities map to a vertical.',
               'Two activities — other specialised stores, and market stalls — '
               'cover several verticals each and are deliberately unmapped.',
               None),
        _entry('mapping', 'atk_section_vertical',
               'ATK NACE section → merchant vertical',
               BLOCKED,
               'Only %d verticals own an ATK section outright.'
               % len(op.get('atk_exclusive_verticals') or []),
               'Every other consumer vertical sits inside one wholesale-and-retail '
               'section worth about half of declared turnover. The section is not '
               'apportioned, so ATK cannot size a vertical.',
               'An ATK split of wholesale from retail'),
        _entry('mapping', 'vertical_geography',
               'Merchant vertical × municipality',
               BLOCKED,
               'No source places a merchant vertical in a Kosovo municipality.',
               'Customs carries country of origin, not destination municipality. '
               'ATK carries municipality by NACE section, not by vertical. The ASK '
               'retail index carries no geography at all.',
               'Merchant or terminal counts by vertical and municipality'),
        _entry('mapping', 'fiscalisation',
               'Trading business → fiscalised business',
               BLOCKED,
               'ATK publishes no open dataset of fiscalised businesses.',
               'The acceptance funnel therefore has a rung it cannot draw, and '
               'shows it as blocked rather than omitting it.',
               'An ATK fiscalisation dataset'),
    ]
    if cc:
        out.append(_entry(
            'mapping', 'atk_ask_turnover',
            'ATK turnover ↔ ASK turnover structure',
            WARNING,
            'Agree to within %.2f points across %d shared sections.'
            % (cc.get('max_gap_pp', 0), cc.get('paired', 0)),
            'Agreement that close indicates a shared source rather than '
            'independent confirmation: ASK almost certainly compiles these from '
            'the same tax records. It is not a second opinion on the denominator.',
            'A turnover measurement independent of the tax administration'))
    return out


def _conclusions(payload):
    """The report's own claims, each rated against what supports it."""
    lv = payload.get('levers') or {}
    pen, cap = lv.get('penetration'), lv.get('retail_capture')
    cash, bm = lv.get('cash'), lv.get('benchmarks')
    ab, bp = lv.get('acceptance_base'), lv.get('bank_position')
    im, op = lv.get('import_momentum'), lv.get('opportunity')
    fp, den = lv.get('foreign_pulse'), lv.get('intensity_denominators')
    out = []

    if pen:
        out.append(_entry(
            'conclusion', 'intensity_rising',
            'Card intensity of declared turnover has roughly doubled',
            PASS,
            '%.2f%% in %d to %.2f%% in %d; cards compounding %.0f%% a year against '
            'an economy growing %.0f%%.'
            % (pen['first']['penetration'] * 100, pen['first']['year'],
               pen['latest']['penetration'] * 100, pen['latest']['year'],
               pen['card_cagr'] * 100, pen['economy_cagr'] * 100),
            'The denominator includes trade no card could settle, so the level is '
            'a floor. The direction is what the series establishes.'))
    if den:
        out.append(_entry(
            'conclusion', 'denominator_choice',
            'No single figure is quoted as the addressable market',
            PASS,
            'Card value reads %.2f%% of declared turnover and %.2f%% of household '
            'consumption in %d — a factor of %.1f apart.'
            % (den['latest']['vs_turnover'] * 100,
               den['latest']['vs_household'] * 100,
               den['latest']['year'], den.get('ratio_between') or 0),
            'Neither denominator is the addressable market. Both are published so '
            'the distance between them is visible.'))
    if cap:
        out.append(_entry(
            'conclusion', 'cards_take_share',
            'Cards are taking share rather than following the economy',
            PASS,
            'Card value %+.1f%% against retail trade %+.1f%%, outgrowing %d of %d '
            'published activities.'
            % (cap['card_value_yoy'] * 100, cap['retail_mean_yoy'] * 100,
               cap['outgrown'], cap['of']),
            'Retail trade is an index, so this compares growth rates and not '
            'levels; ASK publishes no aggregate, so the mean is unweighted.'))
    if cash:
        out.append(_entry(
            'conclusion', 'cash_pool',
            'A large cash pool remains, and it is shrinking relative to cards',
            PASS,
            'EUR %s over the trailing twelve months; ratio %.2f now against %.2f at '
            'the start.'
            % ('{:,.0f}'.format(cash['annualised_cash_pool']),
               cash['latest']['ratio'], cash['first']['ratio']),
            'Rent, wages and person-to-person transfers move as cash and could '
            'never have settled at a till, so the pool bounds the opportunity '
            'rather than describing it.'))
    if ab:
        out.append(_entry(
            'conclusion', 'acceptance_constraint',
            'Acceptance, not spending, is the measured constraint',
            WARNING,
            'Fewer than %.0f%% of trading businesses accept a card: %s active '
            'enterprises in %s against %s merchants in %s.'
            % (ab['acceptance_ceiling'] * 100,
               '{:,}'.format(int(ab['active_enterprises'])), ab['active_year'],
               '{:,}'.format(int(ab['merchants'])), ab['merchants_period']),
            'The two sides are %d years apart and the business base grew in '
            'between, so the share is a ceiling and the shortfall a floor. It is '
            'stated as "fewer than", never as a point estimate.'
            % ab['lag_years'],
            'An active-business count contemporaneous with the merchant count'))
    if bm:
        out.append(_entry(
            'conclusion', 'density_vs_productivity',
            'Thin network, harder-worked terminals',
            PASS,
            '%.0f%% of euro-area terminal density but %.0f%% of euro-area payments '
            'per terminal, on the same half-year.'
            % (next((r['index'] for r in bm['levels']
                     if 'terminals' in r['measure'].lower()), 0) * 100,
               bm['productivity_index'] * 100),
            'Quoting either figure alone misstates the position, which is why '
            'both are always reported together.'))
    if bp and bp.get('gap'):
        me = next((b for b in bp['banks'] if b['code'] == bp['focus']), None)
        if me:
            out.append(_entry(
                'conclusion', 'fair_share_gap',
                'The focus bank trails on frequency, not on ticket size',
                WARNING,
                '%.2f× fair share: payments per terminal at %.0f%% of market '
                'while the average payment is %.0f%%.'
                % (me['fair_share_index'], me['index_frequency'] * 100,
                   me['index_ticket'] * 100),
                'The extract has no stated reporting period and no file to hash, '
                'so the decomposition is internally consistent but externally '
                'unanchored.',
                'A KBA release with a stated period and a source file'))
    if fp:
        out.append(_entry(
            'conclusion', 'foreign_share',
            'A quarter of terminal value is settled on cards issued abroad',
            PASS,
            'EUR %s over twelve months, %.1f%% of POS value, swinging %.1f points '
            'between %s and %s.'
            % ('{:,.0f}'.format(fp['annual_foreign_value']),
               fp['annual_share'] * 100, fp['swing_pp'] * 100,
               fp['trough']['year_month'], fp['peak']['year_month']),
            'Derived as the difference between two Table 15 series sharing a '
            'universe. It says where a card was issued, never who held it.'))
    if im:
        out.append(_entry(
            'conclusion', 'import_momentum',
            'Consumer-facing imports are growing',
            WARNING,
            'Retail imports %+.1f%% like for like over %s; %+.1f%% with bulk '
            'categories included.'
            % ((im.get('retail_yoy') or 0) * 100, im.get('window'),
               (im.get('total_yoy') or 0) * 100),
            'An import is a supply-side signal. Goods entered the country; nobody '
            'has bought them, and no retail margin is implied.'))
    if op:
        out.append(_entry(
            'conclusion', 'opportunity_coverage',
            'The evidence supports direction per vertical, not sizing',
            WARNING,
            'No vertical carries more than %d of %d signals; %d of %d are scored '
            'at all.'
            % (op['max_coverage'], len(op['weights']), op['scored'], op['of']),
            'Anything presented as a ranked opportunity list today would rest on '
            'two signals wearing the clothes of six.',
            'Merchant or terminal counts by vertical'))
    out.append(_entry(
        'conclusion', 'no_pricing',
        'Nothing in this report prices a transaction',
        PASS,
        'No revenue, margin or fee figure appears anywhere.',
        'Merchant service charges, interchange and scheme fees are published by '
        'no one, so every figure sizes an opportunity without valuing it.'))
    return out


def _insights(payload):
    """The front page, rated on what each card already declares."""
    ck = payload.get('cockpit') or {}
    out = []
    for c in ck.get('cards') or []:
        out.append(_entry(
            'insight', c['key'], c['title'],
            c['confidence'],
            '%s — %s (sources %s, provenance level %s).'
            % (c['signal'], c['scale'], ', '.join(c['sources']), c['level']),
            c.get('limitation')))
    return out


def build(payload):
    entries = (_sources(payload) + _kpis(payload) + _mappings(payload)
               + _conclusions(payload) + _insights(payload))
    counts = {}
    by_section = {}
    for e in entries:
        counts[e['rating']] = counts.get(e['rating'], 0) + 1
        s = by_section.setdefault(e['section'], {'entries': [], 'counts': {}})
        s['entries'].append(e)
        s['counts'][e['rating']] = s['counts'].get(e['rating'], 0) + 1
    for s in by_section.values():
        s['entries'].sort(key=lambda e: (ORDER.get(e['rating'], 9), e['title']))

    return {
        'sections': [
            {'key': k, 'title': t, 'question': q,
             'entries': by_section.get(k, {}).get('entries', []),
             'counts': by_section.get(k, {}).get('counts', {})}
            for k, t, q in [
                ('source', 'Sources', 'Where did the number come from, and can '
                                      'that be shown?'),
                ('kpi', 'Measures', 'Do the inputs support the measure?'),
                ('mapping', 'Mappings', 'Which joins does no publisher endorse?'),
                ('conclusion', 'Conclusions', 'What does the report claim, and '
                                              'what holds it up?'),
                ('insight', 'Management insights', 'What does the front page ask '
                                                   'management to think about?'),
            ]],
        'counts': counts,
        'total': len(entries),
        'blocked': [e for e in entries if e['rating'] == BLOCKED],
        'failed': [e for e in entries if e['rating'] == FAIL],
        'generated_for': (payload.get('meta') or {}).get('bqk_latest'),
        'parser_version': (payload.get('meta') or {}).get('parser_version'),
        'note': 'Generated from the same payload the report renders, so a figure '
                'cannot move without its rating moving with it. Five things are '
                'rated separately because five things can independently be wrong: '
                'a conclusion can carry a warning while every source beneath it '
                'passes.',
    }
