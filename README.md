# Kosovo Merchant & Payments Intelligence

A decision engine for the Kosovo payments market, built from official open data
— the Central Bank (BQK), the Tax Administration (ATK), the Statistics Agency
(ASK), Kosovo Customs, the ECB and the World Bank — plus one supplied extract
of Kosovo Banking Association reporting, which is labelled as such wherever it
appears.

**Live:** https://fintechhumans.github.io/Kosovo-Payments-Intelligence/

Twenty-one sources across six institutions. Thirty-one open findings. Sixty-seven
audited items, none failing.

---

## The question it answers

Can someone open this and, in a minute, know where the payments opportunity is
and what to do about it? The tool opens on five decisions, each with one number,
one basis, one action and a stated confidence.

| | | Figure | Confidence |
|---|---|---|---|
| 01 | **Attack** — Ferizaj | 392 terminals below median | MEDIUM |
| 02 | **Target** — three verticals | 3 to investigate | LOW |
| 03 | **Capture** — market-wide volume | €22.5m a year | MEDIUM |
| 04 | **Optimise** — acceptance, not issuance | under 29% accept | MEDIUM |
| 05 | **Monetise** — activate the installed fleet | €45.7m | LOW |

The comparison none of them makes alone is the headline: **closing the largest
placement gap in the entire market is worth about half of what one bank's own
installed terminals would carry at market frequency.** Building is worth less
than activating, and activating needs no new hardware.

Decision 02 is marked LOW deliberately. The sector ranking rests on import and
consumer momentum, which say a market is growing — not that its merchants lack
acceptance. Presenting it as a target list would be a fabrication.

## Where the arithmetic stops

Every figure stops at **payment volume**. Merchant discount rate, interchange,
scheme fees, terminal and servicing costs are published by nobody, so the
scenario engine carries three levers through the same chain and then waits:
none of those five inputs is pre-filled, and every dependent row reads
"awaiting input" until it is not.

A plausible-looking default becomes the answer within a day of anyone seeing
it. Empty is the honest state.

---

## Three layers

```
LAYER 1  Market opportunity     LOADED     21 sources, six institutions
LAYER 2  The bank's position    AWAITING   tables built, empty by design
LAYER 3  Unit economics         AWAITING   rates the bank supplies
```

Layers 2 and 3 exist in `core` — `fact_nlb_terminals`, `fact_nlb_merchants`,
`fact_nlb_transactions`, `dim_mcc`, `nlb_unit_economics` — with row-level
security on and no grant to any client role. They are empty, and that is the
point: the grain, keys and vocabulary are fixed now, so internal data arrives
into a shape that already joins.

`data/internal/` holds the file contract; `etl/load_internal.py --check`
validates against it and refuses any file carrying a person-level column, or a
municipality name that would never join. Nothing in this project is
customer-level, and nothing should become so: the commercial questions are
about segments.

---

## What the evidence supports

| Finding | Measured |
|---|---|
| Cards are taking share, not riding growth | Card value +23.1% against retail trade +12.5%; outgrew 7 of 8 published activities |
| Most of the economy cannot present a card | 48,317 active enterprises in 2023 against 14,049 accepting merchants in July 2026 — fewer than 29% |
| A quarter of terminal value is issued abroad | €428m over twelve months, 27.6% of POS value, swinging 23 points between November and August |
| The cash pool, correctly annualised | €5.09bn over the trailing twelve months; each point moved onto cards is worth €50.9m |
| Thin network, harder-worked terminals | 24% of euro-area terminal density but 59% of euro-area payments per terminal |
| Fleet size is not fleet yield | The focus bank holds 14.9% of terminals and 11.0% of value — a Fair Share Index of 0.74× |
| Against what people actually spend | Card value is 11.82% of household consumption, against 4.96% of declared turnover |
| Kosovo among its neighbours | 5th of 6 on account ownership at 64.2% and on debit cards at 55.6% |

No revenue or profit figure appears anywhere.

## Two anomalies the data would have hidden

**Graçanicë declares, it does not transact.** 791 taxpayers booking €2.15bn —
9.8 times the national median per taxpayer, in a municipality of about ten
thousand people. Ranking municipalities on declared turnover puts it second in
Kosovo and sends a sales team to the wrong place. Three municipalities show the
pattern; all three are flagged rather than ranked.

**Mitrovicë moves more through machines than it declares.** €430m of ATM and
POS value against €407m of turnover — 106%, on the smallest terminal share of
the seven published cities. Its turnover per taxpayer sits at the median, so
this is not a denominator artefact. The combined series cannot attribute the
excess: heavy cash withdrawal, a wider catchment, cross-border traffic and
under-declared trade all read the same way. It marks where to look.

---

## Running it

Source files are not committed. Fetch them first:

- **ATK** — `Qarkullimi-2019…2025.xlsx` from
  [atk-ks.org/en/open-data](https://www.atk-ks.org/en/open-data/) into `data/raw/atk/`
- **BQK** — the monthly payment workbook, the Table 15 series and the annual
  *Use of Bank Cards in Kosovo* PDF into `data/raw/bqk/`

```bash
python etl/fetch_ask.py        # seven ASK tables over the PxWeb API
python etl/fetch_dogana.py     # customs import files, downloaded and pre-aggregated
python etl/fetch_findex.py     # World Bank regional benchmark
python etl/build.py
```

```bash
python -m http.server 8790 --directory app
```

Reading the ATK workbooks is the slow part; a full build takes several minutes.

## How it fits together

```
BQK · ATK · ASK · DOGANA · ECB · WORLD BANK        KBA (supplied)
  └─ data/raw/           downloads, hashed          └─ data/supplied/
       └─ etl/build.py   parse → validate → reconcile → normalise
            ├─ levers.py           the operational measures
            ├─ opportunity.py      merchant verticals, scored on what exists
            ├─ opportunity_geo.py  municipalities, with the registry effect caught
            ├─ cash_geography.py   money through machines against declared economy
            ├─ scenario.py         the measured side of the scenario engine
            ├─ decisions.py        the five, derived rather than asserted
            ├─ cockpit.py          eight signals with their limits attached
            ├─ audit_report.py     the audit, generated from the payload it rates
            ├─ data/curated/seed.sql        Supabase load
            └─ app/data.js                  browser-ready payload
                 ├─ app/summary.js   the report you read
                 └─ app/app.js       the tool you operate
```

## The tool

Seventeen pages in five groups, labelled by the question each answers.

| Group | Pages |
|---|---|
| **Decide** | Five decisions · Scenario engine · Decision cockpit |
| **Where and who** | Where to play · Coverage · Merchant opportunity · Product demand |
| **The market** | Card intensity · Cash & capture · Mix & margin · Position · Fair share |
| **Reference** | POS network · Payment behaviour |
| **Assurance** | Audit report · Data quality · Methodology |

---

## Five modelling rules the schema enforces

**Stock and flow never share a row.** Terminals, cards and ATMs are stocks;
transactions and value are flows. Productivity joins them deliberately and
reports both variants — trailing-average and end-period — never as one measure.

**A flow is never read as a level.** ASK's municipality tables count
enterprises registered or closed *in* a quarter. Reading one quarter as a
business count once produced 9,584 terminals per 1,000 enterprises.

**An annual figure is a trailing twelve months.** Annualising whichever month
happens to be last overstated the seasonal cash pool by 19.4%.

**City is not municipality.** BQK names seven cities; ATK and ASK publish 38
municipalities. Every ratio crossing them carries a WARNING.

**Taxpayers are not businesses, and registered is not trading.** Only ASK's
structural statistics count businesses actually trading, and that is the series
the acceptance figure uses.

## Four POS universes

| Series | 2025 | Perspective |
|---|---:|---|
| Table 15 — POS Domestic | 43.5m | Issuing |
| Table 15 — domestic + foreign | 53.7m | Terminal location |
| Raport Mujor — pos_card | 62.1m | Acquiring |
| KBA bank reporting | *unlabelled period* | Acquiring, by bank |

`core.dim_metric_definition` carries one row per universe and every POS fact
references it. The series selector offers only universes with a monthly series
behind them, tested against the payload rather than kept as a list of
exceptions.

## The audit

`etl/audit_report.py` generates it from the same payload the report renders, so
a figure cannot move without its rating moving with it.

Five things are rated separately because five can independently be wrong:
sources, measures, mappings, **conclusions** and management insights. A
conclusion can carry a warning while every source beneath it passes — and
collapsing the five into one score would hide exactly that.

Current: 38 PASS, 23 WARNING, 6 BLOCKED, none failing. Every blocked item names
the input that would clear it.

## Why some sources are not used

**ARBK** is the business registrar and the register behind every enterprise
figure here originates with it. Its portal states that automated collection,
copying and reuse of its pages are prohibited, and the third-party mirrors are
scrapes of that same source carrying owner names. ASK republishes the register
as official statistics, and that is the route taken.

**Dogana** is used, and the earlier assessment that it publishes nothing
reusable was wrong: it files import and export workbooks under its own "Open
Data" heading at ten-digit tariff detail, currently to August 2026.

## Other methodological choices

- **Growth is like-for-like**, complete months against the same calendar months
  a year earlier — in SQL as well as in the ETL. The monthly view once used
  `lag(x, 12)`, which counts twelve rows rather than twelve months and silently
  shifts every comparison after a gap.
- **A published total row is used, never rebuilt.** Some ASK tables carry one
  and some do not, so each axis is decided by looking.
- **Euro-area comparisons are half-year against half-year.**
- **Productivity and density are reported separately.**
- **Imports are a supply-side signal.** Goods entered the country; nobody has
  bought them. Bulk-dominated categories sit outside the headline because their
  import line moves with a world price.
- **NULL is never zero.** Two banks reporting nothing are excluded rather than
  averaged in at nil, and a survey percentage of exactly 0.0 after 45% in an
  earlier wave is treated as a missing value, not a collapse.

## What this still cannot answer

Transaction leakage and on-us versus off-us remain out of reach until Layer 2
arrives. No public source sizes a merchant vertical, counts its merchants or
places terminals within one, so sector-level acceptance does not exist and is
not estimated. No source places a merchant vertical in a municipality. ATK
publishes no open fiscalisation dataset, so the acceptance funnel shows that
rung as blocked rather than omitting it.

The KBA extract carries no reporting period, so everything built on it is
internally consistent and externally unanchored.

## Sources

- BQK — Raporti Mujor (monthly, to July 2026), Table 15 (from 2007), *Use of Bank Cards in Kosovo*
- ATK — Open Data, Qarkullimi 2019–2025 and Regjistri i Tatimpaguesve
- ASK — retail trade index, statistical business register, structural business
  statistics, national accounts, tourism, Census 2024
- Dogana e Kosovës — Open DATA Import and Export, ten-digit tariff code
- ECB — *Payments statistics: first half of 2025*
- World Bank — Global Findex, regional benchmark
- KBA — bank reporting on POS transactions, supplied as an aggregate extract
