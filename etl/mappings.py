# -*- coding: utf-8 -*-
"""Reference mappings that must be visible and reviewable, not buried in code.

Everything here encodes a judgement someone should be able to disagree with:
which sectors can plausibly take a card payment, how the two institutions spell
the same town, and which BQK series means what. Keeping them in one module is
deliberate — the specification asks for these mappings to be explicit
deliverables (§7, §14, §10), not implementation details.
"""

# ---------------------------------------------------------------------------
# Sector addressability (spec §7 / §10)
#
# 'high'            a card at a physical point of sale is a normal way to pay
# 'medium'          partly consumer-facing; POS exists but is not the main rail
# 'low'             predominantly B2B, payroll or infrastructure; POS marginal
# 'review_required' the published granularity cannot support a judgement
#
# The one that matters is wholesale-and-retail. ATK publishes it as a single
# NACE section worth about 46% of all turnover, mixing B2B wholesale with the
# most card-addressable activity in the economy. No split factor is invented;
# the sector is reported separately and addressable turnover is expressed as a
# floor (excluding it) and a ceiling (including it).
# ---------------------------------------------------------------------------
SECTOR_MAPPING_VERSION = "v1.0"

#   ATK sector name (verbatim) -> (English display name, class, note)
SECTOR_ADDRESSABILITY = {
    "Tregtia me shumice dhe pakice; Riparimi i mjeteve motorike dhe motoeikletave":
        ("Wholesale & Retail Trade; Vehicle Repair", "review_required",
         "Wholesale (B2B, not a POS channel) and retail (the most POS-addressable "
         "activity there is) are one NACE section worth ~46% of all turnover. ATK "
         "publishes no split, so no factor is invented. Reported separately; sets "
         "the ceiling of the addressable range."),
    "Akomodimi dhe sherbimi ushqimor":
        ("Accommodation & Food Service", "high",
         "Hotels, restaurants and cafes — card at point of sale is standard."),
    "Aktivitetet e tjera sherbyese":
        ("Other Service Activities", "high",
         "Personal services: hairdressing, repair, wellness."),
    "Artet, Argetimi dhe rekreacioni":
        ("Arts, Entertainment & Recreation", "high",
         "Consumer-facing leisure and entertainment venues."),
    "Aktivitetet e shendetit te njeriut dhe te punes sociale":
        ("Human Health & Social Work", "medium",
         "Private clinics and pharmacies take cards; public provision does not."),
    "Arsimi":
        ("Education", "medium",
         "Private tuition and course fees; public education is not a POS channel."),
    "Transporti dhe magazinimi":
        ("Transport & Storage", "medium",
         "Passenger transport and courier counters are card-addressable; freight "
         "and warehousing are B2B."),
    "Informimi dhe komunikimi":
        ("Information & Communication", "medium",
         "Telecom retail points take cards; most revenue is billed."),
    "Aktivitetet profesionale, shkencore dhe teknike":
        ("Professional, Scientific & Technical", "medium",
         "Mostly invoiced B2B, with a consumer-facing minority."),
    "Sherbimet administrative dhe mbeshtetese":
        ("Administrative & Support Services", "medium",
         "Mixed; includes car rental and travel agencies, which are POS-facing."),
    "Aktivitetet e patundshmerise":
        ("Real Estate", "low",
         "Transaction values sit far above normal card limits."),
    "Aktivitetet financiare dhe te sigurimit":
        ("Financial & Insurance", "low",
         "Own payment rails; not merchant acquiring."),
    "Industria perpunuese":
        ("Manufacturing", "low", "Manufacturing output is sold B2B."),
    "Ndertimtaria":
        ("Construction", "low", "Contract and invoice based."),
    "Furnizimi me rryme, gaz, avull dhe  ajer te kondicionuar":
        ("Electricity, Gas & Air Conditioning", "low",
         "Utility billing, not point of sale."),
    "Furnizimi me uje; Kanalizimi; Aktivitetet e menaxhimit dhe te trajtimit te mbeturinave":
        ("Water Supply & Waste Management", "low", "Utility billing."),
    "Industria nxjerrese":
        ("Mining & Quarrying", "low", "Extractive, entirely B2B."),
    "Bujqesia;Pylltaria dhe Peshkimi":
        ("Agriculture, Forestry & Fishing", "low",
         "Primary production sold to processors and wholesalers."),
    "Administrimi publik dhe mbrojtja; Sigurimi social i detyrueshem":
        ("Public Administration & Defence", "low",
         "Public administration; fees are not merchant acquiring."),
    "Aktivitetet e trupave dhe organizatave nderkombetare":
        ("International Organisations", "low", "Extraterritorial bodies."),
    "Aktivitetet e ekonomive familjare si punedhenes; Mallrat dhe sherbimet e "
    "padiferencuara, Aktivitetet e ekonomive familjare per perdorim vetanak":
        ("Household Employers", "low", "Households as employers; own-use production."),
    "Mungon aktiviteti":
        ("Activity Not Recorded", "review_required",
         "No economic activity recorded by ATK; cannot be judged."),
    "Person Fizik":
        ("Natural Person (unclassified)", "review_required",
         "A legal form rather than an activity; ATK records no sector for these."),
}

# ---------------------------------------------------------------------------
# Geography (spec §14)
#
# ATK publishes 38 municipalities in Albanian uppercase. BQK names 7 cities in
# title case, and only in the annual PDF. Both spellings are kept side by side
# so that unmatched rows stay visible instead of silently disappearing.
# ---------------------------------------------------------------------------
BQK_CITIES = ["Prishtinë", "Prizren", "Ferizaj", "Gjilan", "Pejë", "Gjakovë", "Mitrovicë"]

REGION = {
    "PRISHTINË": "Prishtinë", "FUSHË KOSOVË": "Prishtinë", "OBILIQ": "Prishtinë",
    "GLLOGOC": "Prishtinë", "LIPJAN": "Prishtinë", "PODUJEVË": "Prishtinë",
    "GRAÇANICË": "Prishtinë", "NOVOBËRDË": "Prishtinë",
    "PRIZREN": "Prizren", "RAHOVEC": "Prizren", "SUHAREKË": "Prizren",
    "MALISHEVË": "Prizren", "DRAGASH": "Prizren", "MAMUSHË": "Prizren",
    "PEJË": "Pejë", "KLINË": "Pejë", "ISTOG": "Pejë", "DEÇAN": "Pejë", "JUNIK": "Pejë",
    "GJAKOVË": "Gjakovë",
    "GJILAN": "Gjilan", "VITI": "Gjilan", "KAMENICË": "Gjilan",
    "KLLOKOT": "Gjilan", "PARTESH": "Gjilan", "RANILLUG": "Gjilan", "NOVO BËRDË": "Gjilan",
    "FERIZAJ": "Ferizaj", "SHTIME": "Ferizaj", "KAÇANIK": "Ferizaj",
    "HANI I ELEZIT": "Ferizaj", "SHTËRPCË": "Ferizaj",
    "MITROVICË": "Mitrovicë", "VUSHTRRI": "Mitrovicë", "SKENDERAJ": "Mitrovicë",
    "MITROVICË VERIORE": "Mitrovicë", "ZVEÇAN": "Mitrovicë",
    "ZUBIN POTOK": "Mitrovicë", "LEPOSAVIQ": "Mitrovicë",
}

# ATK uppercase -> the name the dashboard shows, which is also the BQK spelling
# wherever BQK names the place at all.
def standardize(atk_name):
    n = (atk_name or "").strip()
    fixed = {
        "PRISHTINË": "Prishtinë", "PRIZREN": "Prizren", "FERIZAJ": "Ferizaj",
        "GJILAN": "Gjilan", "PEJË": "Pejë", "GJAKOVË": "Gjakovë",
        "MITROVICË": "Mitrovicë", "MITROVICË VERIORE": "Mitrovicë Veriore",
        "FUSHË KOSOVË": "Fushë Kosovë", "HANI I ELEZIT": "Hani i Elezit",
        "ZUBIN POTOK": "Zubin Potok", "NOVOBËRDË": "Novobërdë",
        "NOVO BËRDË": "Novobërdë",
    }
    if n in fixed:
        return fixed[n]
    return " ".join(w.capitalize() for w in n.split())


# ---------------------------------------------------------------------------
# BQK POS city distribution, end-2024 (spec §14)
#
# Source: "Use of Bank Cards in Kosovo", September 2025 edition, Figures 4, 2,
# 26 and 27. These are CHARTS, not a table: the values were read out of the PDF
# and paired with the legend by position. Prishtinë is safe — the report states
# in prose that the network is most concentrated there, and its 50.2% share of
# transaction value matches the sentence "50 percent of the value ... was
# executed in Prishtina". The remaining six are flagged unverified and raise a
# quality finding until someone confirms them against the rendered figure.
# ---------------------------------------------------------------------------
BQK_GEO_2024 = {
    #  city          pos %   atm %   atm+pos tx count  atm+pos tx value
    "Prishtinë":   (43.17,  31.81,        27_837_071,   2_984_104_989),
    "Prizren":     ( 8.50,   7.24,         4_342_416,     716_610_832),
    "Ferizaj":     ( 9.22,   6.61,         3_794_351,     582_309_590),
    "Gjilan":      ( 4.77,   5.51,         2_932_299,     433_475_109),
    "Pejë":        ( 6.59,   5.20,         3_723_016,     518_985_462),
    "Gjakovë":     ( 3.05,   4.41,         1_664_873,     278_716_954),
    "Mitrovicë":   ( 3.00,   4.41,         3_565_114,     430_363_763),
}
BQK_POS_TOTAL_2024 = 20913          # annual report, Table 2
BQK_GEO_PAIRING_VERIFIED = {"Prishtinë"}

# ---------------------------------------------------------------------------
# Metric definitions (spec §10) — the keystone of the whole model
# ---------------------------------------------------------------------------
DEFINITIONS = [
    dict(metric_key="pos_rm_allcards",
         metric_name="POS Transactions — All Cards at Kosovo POS",
         official_name="Transaksionet sipas terminaleve — pagesa me kartelë në POS",
         institution="BQK",
         perspective="ACQUIRING", card_origin="ALL",
         terminal_location="Kosovo", transaction_type="Card payment at POS",
         frequency="monthly",
         universe="All card payments acquired at POS terminals in Kosovo",
         cards_coverage="All cards, domestic and foreign",
         terminal_coverage="All POS terminals in Kosovo",
         geographic_coverage="Kosovo, national only",
         count_or_value="both", stock_or_flow="flow", unit="count / EUR",
         is_default=True,
         methodology="Raport Mujor, sheet 'Trans. sipas terminaleve'. Paired with the "
                     "POS terminal count from sheet 'Terminalet për pagesa' in the same "
                     "publication, so numerator and denominator share a universe.",
         limitations="Begins January 2025. Runs about 15% above the Table 15 "
                     "domestic-plus-foreign series in every overlapping month."),
    dict(metric_key="pos_t15_domestic",
         metric_name="POS Transactions — Domestic Cards Only",
         official_name="Table 15, POS — domestic",
         institution="BQK",
         perspective="ISSUING", card_origin="DOMESTIC",
         terminal_location="Kosovo", transaction_type="Card payment at POS",
         frequency="monthly",
         universe="Cards issued in Kosovo, used at Kosovo POS",
         cards_coverage="Kosovo-issued cards only; excludes all foreign cards",
         terminal_coverage="POS terminals in Kosovo",
         geographic_coverage="Kosovo, national only",
         count_or_value="both", stock_or_flow="flow", unit="count / EUR",
         is_default=False,
         methodology="Table 15 of the BQK payment system time series. Counts are "
                     "published in thousands and are scaled here.",
         limitations="Counts start January 2018; values start March 2007. No "
                     "compatible terminal count exists before 2025, so productivity "
                     "cannot be computed for the earlier years."),
    dict(metric_key="pos_t15_allcards",
         metric_name="POS Transactions — Domestic plus Foreign Cards",
         official_name="Table 15, POS domestic + POS foreign cards in Kosovo",
         institution="BQK",
         perspective="TERMINAL_LOCATION", card_origin="ALL",
         terminal_location="Kosovo", transaction_type="Card payment at POS",
         frequency="monthly",
         universe="All cards at Kosovo POS, per Table 15",
         cards_coverage="Kosovo-issued plus foreign-issued cards used in Kosovo",
         terminal_coverage="POS terminals in Kosovo",
         geographic_coverage="Kosovo, national only",
         count_or_value="both", stock_or_flow="flow", unit="count / EUR",
         is_default=False,
         methodology="Sum of two Table 15 indicators.",
         limitations="Foreign-card detail starts January 2018. Still about 15% below "
                     "the Raport Mujor series; the gap is definitional and stable."),
    dict(metric_key="pos_terminals_annual",
         metric_name="POS Terminals — Annual Report",
         official_name="Use of Bank Cards in Kosovo, Table 2",
         institution="BQK",
         perspective="NA", card_origin="NA",
         terminal_location="Kosovo", transaction_type=None,
         frequency="annual",
         universe="POS terminals at year end, annual publication",
         cards_coverage="n/a", terminal_coverage="POS plus EFTPOS",
         geographic_coverage="Kosovo, plus 7 named CITIES as shares",
         count_or_value="stock", stock_or_flow="stock", unit="terminals",
         is_default=False,
         methodology="Annual PDF report.",
         limitations="NOT continuous with the monthly series: 20,913 at end-2024 "
                     "against 25,166 in January 2025. Different universes. Never splice."),
    # The fourth POS universe. It is the only one with a bank breakdown and the
    # only one with no period label, which is why nothing built on it is ever
    # placed on a time axis or divided against a BQK total.
    dict(metric_key="pos_kba_bank",
         metric_name="POS Transactions — KBA Bank Reporting",
         official_name="Shoqata e Bankave të Kosovës — POS TRANSACTIONS",
         institution="KBA",
         perspective="ACQUIRING", card_origin="ALL",
         terminal_location="Kosovo", transaction_type="Card payment at POS",
         frequency="periodic",
         universe="POS activity reported by each acquiring bank to the association",
         cards_coverage="Not stated in the extract",
         terminal_coverage="Terminals acquired by each reporting bank",
         geographic_coverage="Kosovo, by bank rather than by place",
         count_or_value="both", stock_or_flow="both", unit="count / EUR / terminals",
         is_default=False,
         methodology="Supplied as an aggregate extract rather than downloaded, so it "
                     "carries no file hash. The bank columns reconcile exactly to the "
                     "published ALL Banks column on all four rows, which is what the "
                     "loader verifies before accepting the file.",
         limitations="No period label: the terminal count falls between the BQK monthly "
                     "stock for March and April 2026, but no single BQK window fits all "
                     "four rows. Matches none of the three BQK series, so shares are "
                     "computed inside it and never against a BQK total. Merchants are "
                     "counted per acquiring bank, so the total is relationships rather "
                     "than distinct merchants. Two banks report nothing."),
]
