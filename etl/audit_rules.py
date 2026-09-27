# -*- coding: utf-8 -*-
"""KPI registry and the build-status rules that decide what may be shown.

Kept apart from the pipeline so the definitions can be reviewed on their own.
A KPI's status is not a label someone types — it is derived from whether the
inputs it needs actually exist at a compatible grain and period.
"""

PARSER_VERSION = "2.0.0"

# ---------------------------------------------------------------------------
# One authoritative formula per KPI. Where two variants of the same idea exist
# they get separate ids and separate names, because "transactions per POS" over
# an average stock is a different measure from the same count over an
# end-period stock.
# ---------------------------------------------------------------------------
KPI_REGISTRY = [
    dict(kpi_id="pos_terminals",
         display_name="POS terminals",
         business_definition="Card-accepting terminals in Kosovo at month end.",
         sql_formula="fact_pos_terminal_stock.terminal_count where observation_type='MONTH_END'",
         numerator="terminal_count", denominator=None,
         required_definition="pos_rm_allcards", frequency="monthly",
         aggregation_rule="STOCK — never summed across periods; averaged when a period figure is needed",
         valid_comparison_method="Same calendar month, year on year",
         source_requirements="BQK Raport Mujor, sheet 'Terminalet për pagesa'",
         known_limitations="Series begins January 2025 and is not continuous with the annual report series."),

    dict(kpi_id="pos_transaction_count",
         display_name="POS transaction count",
         business_definition="Card payments executed at POS terminals during the period.",
         sql_formula="sum(fact_pos_transactions.transaction_count)",
         numerator="transaction_count", denominator=None,
         required_definition="any POS definition", frequency="monthly",
         aggregation_rule="FLOW — summed across periods",
         valid_comparison_method="Equal month windows only",
         source_requirements="BQK Raport Mujor or Table 15, per selected definition",
         known_limitations="Three incompatible universes exist; the active one is always named."),

    dict(kpi_id="pos_transaction_value",
         display_name="POS transaction value",
         business_definition="Value of card payments at POS terminals during the period.",
         sql_formula="sum(fact_pos_transactions.transaction_value)",
         numerator="transaction_value", denominator=None,
         required_definition="any POS definition", frequency="monthly",
         aggregation_rule="FLOW — summed across periods",
         valid_comparison_method="Equal month windows only",
         source_requirements="BQK Raport Mujor or Table 15",
         known_limitations="Table 15 values are published in EUR millions and scaled on load."),

    dict(kpi_id="transactions_per_average_pos",
         display_name="Transactions per average POS",
         business_definition="Terminal productivity measured against the average terminal "
                             "stock over the period, so growth in the network does not "
                             "distort the denominator.",
         sql_formula="transaction_count / avg(terminal_count) over the same months",
         numerator="POS transaction count (flow)",
         denominator="Average POS terminal stock (stock, 12-month trailing mean)",
         required_definition="pos_rm_allcards", frequency="monthly",
         aggregation_rule="Flow over averaged stock",
         valid_comparison_method="Equal month windows only",
         source_requirements="Both sides from the same publication",
         known_limitations="Requires a monthly terminal series; unavailable before 2025."),

    dict(kpi_id="transactions_per_end_period_pos",
         display_name="Transactions per end-period POS",
         business_definition="The same count divided by the closing terminal stock. "
                             "Reported separately because it is not the same measure.",
         sql_formula="transaction_count / terminal_count at period end",
         numerator="POS transaction count (flow)",
         denominator="POS terminal stock at period end (stock)",
         required_definition="pos_rm_allcards", frequency="monthly",
         aggregation_rule="Flow over closing stock",
         valid_comparison_method="Equal month windows only",
         source_requirements="Both sides from the same publication",
         known_limitations="Understates productivity while the network is growing."),

    dict(kpi_id="value_per_average_pos",
         display_name="Value per average POS",
         business_definition="Value processed per terminal over the period.",
         sql_formula="transaction_value / avg(terminal_count)",
         numerator="POS transaction value", denominator="Average POS terminal stock",
         required_definition="pos_rm_allcards", frequency="monthly",
         aggregation_rule="Flow over averaged stock",
         valid_comparison_method="Equal month windows only",
         source_requirements="Both sides from the same publication",
         known_limitations="Moves with ticket size as well as with usage."),

    dict(kpi_id="average_ticket",
         display_name="Average ticket",
         business_definition="Average value of one card payment at a POS terminal.",
         sql_formula="transaction_value / transaction_count",
         numerator="POS transaction value", denominator="POS transaction count",
         required_definition="same definition on both sides", frequency="monthly",
         aggregation_rule="Ratio of two flows from one universe",
         valid_comparison_method="Any period, provided both sides share a definition",
         source_requirements="One publication for both numerator and denominator",
         known_limitations="None material."),

    dict(kpi_id="cards_issued",
         display_name="Cards issued",
         business_definition="Valid payment cards in issue at month end.",
         sql_formula="fact_card_stock.cards_issued",
         numerator="cards_issued", denominator=None,
         required_definition="pos_rm_allcards", frequency="monthly",
         aggregation_rule="STOCK — never summed",
         valid_comparison_method="Same month, year on year",
         source_requirements="BQK Raport Mujor, sheet 'Kartelat bankare'",
         known_limitations="Scheme split covers Visa and Mastercard only."),

    dict(kpi_id="pos_per_1000_taxpayers",
         display_name="POS per 1,000 registered taxpayers",
         business_definition="Terminal density against the registered taxpayer "
                             "population. Taxpayers are NOT the same population as "
                             "card-accepting businesses.",
         sql_formula="pos_terminals_estimated / entity_count * 1000",
         numerator="Estimated POS terminals, CITY grain, annual",
         denominator="ATK registered taxpayers, MUNICIPALITY grain, monthly average",
         required_definition="pos_terminals_annual", frequency="annual",
         aggregation_rule="Stock over stock",
         valid_comparison_method="Not comparable across years — one reference year only",
         source_requirements="BQK annual report + ATK Qarkullimi",
         known_limitations="Numerator is city grain and estimated from a chart; "
                           "denominator is municipality grain and counts taxpayers, "
                           "not merchants. A documented approximation."),

    dict(kpi_id="pos_per_eur1m_addressable",
         display_name="POS per €1m addressable turnover",
         business_definition="Terminal density against turnover in sectors where a "
                             "card at a point of sale is a plausible payment method.",
         sql_formula="pos_terminals_estimated / addressable_turnover * 1e6",
         numerator="Estimated POS terminals, CITY grain, annual",
         denominator="Addressable turnover, MUNICIPALITY grain, analytical classification",
         required_definition="pos_terminals_annual", frequency="annual",
         aggregation_rule="Stock over flow — reported as a floor/ceiling range",
         valid_comparison_method="Within one year only",
         source_requirements="BQK annual report + ATK Qarkullimi + sector mapping",
         known_limitations="Addressable turnover is an analytical classification, not an "
                           "ATK measure. Wholesale and retail are one published sector, so "
                           "the result is a range, not a point."),

    dict(kpi_id="turnover_per_taxpayer",
         display_name="Turnover per registered taxpayer",
         business_definition="Declared turnover divided by the registered taxpayer count.",
         sql_formula="sum(turnover) / avg(entity_count)",
         numerator="ATK turnover (flow)", denominator="ATK taxpayers (stock, averaged)",
         required_definition=None, frequency="annual",
         aggregation_rule="Flow over averaged stock",
         valid_comparison_method="Year on year, same geography",
         source_requirements="ATK Qarkullimi",
         known_limitations="Taxpayers include entities with no turnover in the period."),

    dict(kpi_id="addressable_turnover",
         display_name="Addressable turnover",
         business_definition="Turnover in sectors classified as plausibly card-addressable. "
                             "An analytical classification, not an official ATK metric.",
         sql_formula="sum(turnover) where addressability_class in (...)",
         numerator="ATK turnover", denominator=None,
         required_definition=None, frequency="annual",
         aggregation_rule="Sum of a flow within a classified subset",
         valid_comparison_method="Year on year, same mapping version",
         source_requirements="ATK Qarkullimi + sector mapping v1",
         known_limitations="Reported as floor and ceiling because wholesale and retail "
                           "are published as one section."),

    dict(kpi_id="bank_pos_share",
         display_name="POS share by bank",
         business_definition="Each acquiring bank's share of POS terminals, transactions "
                             "and value within the KBA reporting universe.",
         sql_formula="fact_bank_pos.<measure> / sum(fact_bank_pos.<measure>)",
         numerator="bank measure", denominator="KBA reporting total",
         required_definition="pos_kba_bank", frequency="periodic",
         aggregation_rule="Share within a single unlabelled period; never summed or trended",
         valid_comparison_method="Between banks in the same extract only",
         source_requirements="KBA bank reporting, supplied as an aggregate extract",
         known_limitations="Supplied rather than downloaded, so there is no file hash. "
                           "The extract carries no period label. Two banks report nothing "
                           "and are excluded rather than counted as zero."),

    dict(kpi_id="fair_share_index",
         display_name="Fair Share Index",
         business_definition="A bank's share of POS value divided by its share of POS "
                             "terminals. Above 1 means each terminal carries more value "
                             "than the market average, below 1 means less.",
         sql_formula="(value / total_value) / (terminals / total_terminals)",
         numerator="share of value", denominator="share of terminals",
         required_definition="pos_kba_bank", frequency="periodic",
         aggregation_rule="Ratio of two shares within one extract",
         valid_comparison_method="Between banks in the same extract only",
         source_requirements="KBA bank reporting",
         known_limitations="Identical to value per terminal indexed to the market, and "
                           "factors exactly into transactions per terminal times average "
                           "payment. Both factors are reported so the reason for a gap is "
                           "visible. Says nothing about revenue: pricing is not published."),

    dict(kpi_id="bank_pos_productivity",
         display_name="Transactions per terminal by bank",
         business_definition="Card payments per POS terminal, for each acquiring bank.",
         sql_formula="fact_bank_pos.transaction_count / fact_bank_pos.pos_terminals",
         numerator="transaction_count", denominator="pos_terminals",
         required_definition="pos_kba_bank", frequency="periodic",
         aggregation_rule="Ratio within one bank and one extract",
         valid_comparison_method="Between banks in the same extract only",
         source_requirements="KBA bank reporting",
         known_limitations="Not comparable with the BQK per-terminal figures elsewhere in "
                           "this report: those count a different transaction universe over "
                           "a known period, this one an unlabelled span."),
]


def derive_kpi_status(ctx):
    """Decide PASS / WARNING / BLOCKED from what the pipeline actually found.

    ctx carries the facts the rules need: whether a monthly terminal series
    exists, whether the city↔municipality join was used, whether the chart
    pairing was verified, and so on.
    """
    S = []

    def add(kpi, status, reason, required=None):
        S.append(dict(kpi_id=kpi, status=status, reason=reason, required_input=required))

    monthly_terminals = ctx.get('monthly_terminal_months', 0)
    yoy_ok = ctx.get('signal_months', 0) > 0

    add("pos_terminals",
        "PASS" if monthly_terminals >= 13 else "WARNING",
        "Monthly stock available for %d months; a same-month comparison needs 13."
        % monthly_terminals)

    add("pos_transaction_count", "PASS",
        "Three universes are published and kept separate; the active one is named on every figure.")
    add("pos_transaction_value", "PASS",
        "Published on the same basis as the count within each definition.")

    add("transactions_per_average_pos",
        "PASS" if (monthly_terminals >= 12 and yoy_ok) else "WARNING",
        "Numerator and denominator come from the same publication and the same universe."
        if monthly_terminals >= 12 else
        "Fewer than 12 monthly stock observations; the average is over a short window.")

    add("transactions_per_end_period_pos", "WARNING",
        "Valid but understates productivity while the network grows; reported alongside "
        "the average-stock variant rather than in place of it.")

    add("value_per_average_pos", "PASS" if yoy_ok else "WARNING",
        "Same basis on both sides.")
    add("average_ticket", "PASS",
        "Both sides come from one universe, so the ratio is internally consistent.")
    add("cards_issued", "PASS", "Published monthly as a stock; never summed.")

    # The geography-crossing ratios
    grain = ctx.get('grain_approximation', True)
    verified = ctx.get('geo_pairing_verified', 0)
    total_cities = ctx.get('geo_cities', 0)
    geo_reason = ("Numerator is CITY grain and estimated from a PDF chart (%d of %d "
                  "legend pairings verified); denominator is MUNICIPALITY grain. "
                  "Usable as an approximation, stated on the page."
                  % (verified, total_cities))
    add("pos_per_1000_taxpayers", "WARNING" if grain else "PASS", geo_reason,
        required="BQK POS terminals at municipality grain")
    add("pos_per_eur1m_addressable", "WARNING" if grain else "PASS",
        geo_reason + " Denominator is additionally an analytical classification reported "
        "as a range.",
        required="BQK POS terminals at municipality grain; ATK wholesale/retail split")

    add("turnover_per_taxpayer", "PASS",
        "Both sides from ATK at municipality grain; the denominator is labelled as "
        "taxpayers rather than businesses.")
    add("addressable_turnover", "WARNING",
        "Analytical classification, not an ATK measure. Wholesale and retail are one "
        "published sector, so only a floor and a ceiling are defensible.",
        required="ATK split of wholesale from retail")

    # Anything depending on pure POS activity by geography cannot be built.
    add("geographic_pos_productivity", "BLOCKED",
        "BQK publishes city transaction figures for ATM and POS combined. A POS-only "
        "productivity measure cannot be derived from them.",
        required="POS-only transaction counts by geography")
    add("pos_terminal_history_pre_2025", "BLOCKED",
        "The annual and monthly terminal series measure different universes (20,913 at "
        "end-2024 against 25,166 in January 2025). They are not spliced.",
        required="A monthly terminal series on the annual report's basis")
    add("transaction_value_bands", "BLOCKED",
        "BQK does not publish card transactions by value band in any reviewed source.",
        required="Published value-band table")

    # ---- the KBA bank layer, present only when the extract was loaded
    kba = ctx.get('kba')
    if kba:
        recon = 'reconciles exactly to its own published total' if kba.get('reconciles') \
                else 'DOES NOT reconcile to its own published total'
        silent = kba.get('silent') or []
        add("bank_pos_share", "WARNING",
            "The extract %s, so the shares are internally sound. It is marked WARNING "
            "for provenance rather than arithmetic: it was supplied as an aggregate "
            "rather than downloaded, so it carries no file hash%s."
            % (recon,
               ', and %s report nothing and are excluded' % ' and '.join(silent)
               if silent else ''),
            required="A hashable KBA publication with a stated period")
        add("fair_share_index", "WARNING",
            "Numerator and denominator both come from the KBA extract, so the index is "
            "internally consistent. It inherits the extract's missing period label, and "
            "it measures value per terminal, not revenue — no public source prices a "
            "transaction.",
            required="A stated reporting period; merchant pricing for any revenue read")
        add("bank_pos_productivity", "WARNING",
            "Valid within the extract. It must not be read against the BQK per-terminal "
            "figures elsewhere in this report, which count a different universe over a "
            "known period.",
            required="A stated reporting period")

    return S
