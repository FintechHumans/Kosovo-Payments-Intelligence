# Kosovo Merchant & Payments Intelligence — Phase 1

Public market intelligence on the Kosovo POS and payments market, built only
from official open data: the Central Bank of Kosovo (BQK), the Tax
Administration (ATK), the Kosovo Agency of Statistics (ASK) and the European
Central Bank (ECB). No internal NLB information, no bank-level data, no
taxpayer-level record.

**Live:** https://fintechhumans.github.io/Kosovo-Payments-Intelligence/

## Two surfaces, deliberately separated

The report opens on a **summary**: one page, read top to bottom, with nothing to
operate — no rail, no filters, no source drawers. Five findings, each a sentence
and a picture, then a conclusion. Every qualification is written into the
sentence rather than hidden behind a control.

Behind a single link at the end sits the **analyst tool**: eleven pages, period
and series selectors, provenance on every figure. That is the separation — the
summary is for reading, the tool is for working. A reader who only wants the
finding never has to operate anything; an analyst who wants to check it has
everything.

## The spine

One series needs all three domestic institutions at once, and it is what the
report is built around: **how much of the declared economy actually settles on a
card.**

| Year | ATK turnover | BQK card value | Penetration |
|---|---:|---:|---:|
| 2019 | €12.38bn | €366.7m | 2.96% |
| 2025 | €23.97bn | €1.38bn | **5.75%** |

The economy grew 1.94×, card spending 3.76× — 24.7% a year against 11.6%. And
94.3% of declared turnover still settles somewhere other than a card.

Turnover includes wholesale and business-to-business trade no card could ever
settle, so the level is a floor rather than an estimate of the reachable
market. The direction is what the figure is for.

**The conclusion the report reaches:** demand is not the constraint. Nobody
needs persuading to use a card. What limits the business is where a card can be
presented, and what each payment is worth.

## What the evidence supports

| Finding | Measured |
|---|---|
| Cards are taking share, not riding growth | Card value +23.1% against retail trade +12.5%; outgrew 7 of the 8 retail activities ASK publishes |
| The pool that has not moved | €6.08bn a year still leaves ATMs; each point off the cash-to-card ratio is worth €60.8m |
| Acceptance, not appetite, is the limit | 24.0% of euro-area terminal density; 14.1% of card payments per inhabitant |
| Terminals already placed work harder than density suggests | 2,091 payments per terminal per year against 3,563 in the euro area — 58.7%, not 24% |
| Each payment is worth a little less | Credit-function share of card payments falling; mix changes what acceptance earns even when volume rises |
| Where coverage lags | Median 2.45 terminals per €1m of municipal turnover; the shortfall list is computed against that median |

No revenue or profit figure appears anywhere. Merchant charges, interchange and
terminal-level activity are published by no one. Everything here sizes the
opportunity; pricing it needs internal data.

## Running it

Source files are not committed — `data/raw/` is ignored, because the
publications belong to their institutions. Fetch them first:

- **ATK** — `Qarkullimi-2019…2025.xlsx` from
  [atk-ks.org/en/open-data](https://www.atk-ks.org/en/open-data/) into `data/raw/atk/`
- **BQK** — the monthly payment workbook, the Table 15 series and the annual
  *Use of Bank Cards in Kosovo* PDF into `data/raw/bqk/`
- **ASK** — fetched automatically over the PxWeb API:

```bash
python etl/fetch_ask.py
```

That pulls three tables as json-stat2: the monthly retail trade index
(`tab01.px`), enterprises by municipality (`tab05r.px`) and enterprises by month
(`tab02m.px`). ECB euro-area reference figures are constants in
`etl/levers.py`, taken from *Payments statistics: first half of 2025* and cited
with their period on every comparison.

The BQK monthly and Table 15 series are read through the validated parser in the
companion BQK repository, which reproduces the published workbooks cell for
cell. Put its `_data_blob.js` in `data/raw/bqk/`, or point at it directly:

```bash
export KPI_BQK_BLOB=/path/to/bqk/app/_data_blob.js
```

Then:

```bash
python etl/build.py
```

```bash
python -m http.server 8790 --directory app
```

The build reparses every source on each run. It is idempotent, and it recomputes
rather than appends, so a figure the publisher restates is corrected instead of
frozen at whatever the last build captured.

## How it fits together

```
BQK · ATK · ASK · ECB
  └─ data/raw/              downloads, hashed and never modified
       └─ etl/build.py      parse → validate → reconcile → normalise
            ├─ etl/levers.py       the operational measures
            ├─ etl/audit_rules.py  PASS / WARNING / BLOCKED per KPI
            ├─ data/curated/seed.sql        Supabase load
            ├─ data/curated/dashboard.json  curated payload
            └─ app/data.js                  same payload, browser-ready
                 ├─ app/summary.js   the report you read
                 └─ app/app.js       the tool you operate
```

`etl/levers.py` is where the operational reading lives: `penetration`,
`cash_displacement`, `retail_capture`, `card_mix`, `benchmarks`,
`acceptance_headroom`, `sector_momentum`, `emerging_channels`. Each returns the
series the front end draws plus the note that qualifies it, so a caveat cannot
drift away from the number it belongs to.

Charts are hand-built SVG in `app/charts.js`: no charting library, no runtime
dependency, nothing to load from a CDN.

## The analyst tool

| | Page | Question |
|---|---|---|
| 01 | Where the money is | What is the opportunity, and which way is it moving? |
| 02 | Penetration | How much of the economy actually settles on a card? |
| 03 | Cash & capture | How much spending is still cash, and are cards taking it? |
| 04 | Mix & margin | What is happening to the composition behind the volume? |
| 05 | Coverage | Where does acceptance lag the economy around it? |
| 06 | Position | Where does Kosovo sit against the euro area? |
| 07 | What this means | The evidence, in order, and what it adds up to. |
| 08 | POS network | How large is the network, how hard does it work, and where is it? |
| 09 | Payment behaviour | How are people paying? |
| 10 | Data quality | Can I trust these numbers? |
| 11 | Methodology | How exactly was this calculated? |

Pages 01–07 are the argument in order; 08–11 are reference. **Simple** is the
default detail level and hides the series selector and period comparison;
**Advanced** exposes them.

## Three modelling rules the schema enforces

**Stock and flow never share a row.** Terminal, card and ATM counts are stocks;
transactions and value are flows. They live in separate fact tables, so a stock
cannot be summed across months by accident. Productivity joins them
deliberately and reports both variants: `transactions_per_average_pos` uses a
trailing 12-month mean, `transactions_per_end_period_pos` uses the closing
stock, and they are never presented as the same measure.

**City is not municipality.** BQK names seven *cities*; ATK and ASK publish 38
*municipalities*, which contain settlements outside their city. `dim_geography`
stores the level, both grains exist as separate rows, and every ratio crossing
them carries `WARNING` in `audit.kpi_build_status` and says so on the page.

**Taxpayers are not businesses.** ATK publishes "Numri i Tatimpaguesve" —
registered taxpayers filing in the month, including entities that accept no
cards. `fact_atk_turnover.entity_type` records this and the UI never says
"businesses". ASK's registered-enterprise count is a different population again
and is labelled as such: a business that has registered is not necessarily
trading, and not every trading business accepts cards.

## The three POS universes

BQK publishes three numbers that can all be called "POS transactions in 2025".
They differ by up to 43%.

| Series | 2025 | Perspective | Cards |
|---|---:|---|---|
| Table 15 — POS Domestic | 43.5m | Issuing | Kosovo-issued only |
| Table 15 — domestic + foreign | 53.7m | Terminal location | All |
| Raport Mujor — pos_card | 62.1m | Acquiring | All |

`core.dim_metric_definition` carries one row per universe and every POS fact
references it. The active universe is printed in the command bar and repeated
in every tooltip and source drawer; a bare "POS Transactions" label never
appears.

Raport Mujor is the default because it is the only series measured on the same
basis as the terminal count it is divided by. The penetration spine uses the
Table 15 domestic-plus-foreign series instead, because that one is measured at
terminal location — the same place the turnover is declared.

## Traceability

Every figure answers "where did this come from?". The ⓘ on any KPI opens a
drawer carrying the formula, numerator, denominator, definition, universe,
aggregation rule, valid comparison method, institution, publication, **source
filename, SHA-256 of that exact file, download date and parser version**, plus
the audit status and a link to the official source.

`audit.source_versions` hashes every physical file. A publisher replacing a file
at the same URL is detected and superseded rather than silently absorbed.

`etl/audit_rules.py` holds one registry entry per KPI and derives its status
from what the inputs actually support, rather than from a hand-maintained list.
Of the fifteen registered KPIs the current build reports eight `PASS`, four
`WARNING` and three `BLOCKED`, each with the specific input that would clear it.

## Findings the build raises

Nine controls fail by design. None can be corrected here and none is smoothed:

1. **Terminal series discontinuity** — 20,913 at end-2024 in the annual report
   against 25,166 in January 2025 monthly. Classified `NOT_COMPARABLE`; there is
   no terminal history before 2025.
2. **Definition gap** — Raport Mujor runs 12–18% above Table 15 in all 19
   overlapping months. Classified `METHODOLOGY_DIFFERENCE`.
3. **PDF chart pairing** — city shares are read from Figure 4; only Prishtinë's
   legend pairing is confirmed, and the other six are flagged in the UI.
4. **Geographic data is ATM + POS combined** — so POS productivity by geography
   is `BLOCKED`, not approximated.
5. **Grain mismatch** — city numerator, municipality denominator.
6. **Coverage** — 31 of 38 municipalities have no BQK terminal observation.
7. **Entity type** — taxpayers, not merchants.
8. **Period lag** — ATK ends Dec 2025, BQK runs to Jul 2026; the penetration
   spine is therefore annual and stops at the last complete ATK year.
9. **Addressability is analytical**, not an ATK measure.

One control was corrected during the build rather than reported: the card type
split appears to miss the headline total by 5.8%, but debit + credit + delayed
debit reconciles *exactly* to cards with a payment function. The difference is
cards issued with a cash function alone, and the test now says so.

## Addressable turnover is a range

ATK publishes sector only at NACE section level. "Tregtia me shumicë dhe
pakicë" is one section worth ~46% of turnover, merging wholesale B2B with
retail. No split is published, so none is invented: the floor counts only
unambiguously card-facing sectors (~3.6% of the economy), the ceiling adds the
combined trade section (~50%). The mapping lives in `etl/mappings.py`, is stored
in `core.dim_sector` with a rationale and a version, and is shown in full under
Methodology.

ASK's retail trade table has the same shape of problem from the other side: it
publishes eight NACE retail activities and **no total**. None is constructed.
Card growth is compared against each activity and against their unweighted
mean, and the page says which it is using.

## Supabase

`sql/001_schema.sql` and `sql/002_views.sql` implement five schemas —
`raw`, `core`, `analytics`, `api`, `audit` — with RLS enabled on every table,
`raw`/`core`/`audit` revoked from client roles, and only `api.*` granted select.
No insert, update or delete is granted to any client role anywhere.

**Not yet applied.** Both Supabase projects on the account report `INACTIVE`
and every connection times out. The dashboard does not depend on it: `app/data.js`
carries the whole curated payload and the site is fully static, with no key of
any kind in front-end code. Once a project is resumed:

```bash
psql "$SUPABASE_DB_URL" -f sql/001_schema.sql
```

```bash
psql "$SUPABASE_DB_URL" -f sql/002_views.sql
```

```bash
psql "$SUPABASE_DB_URL" -f data/curated/seed.sql
```

The front end then switches over by editing the `SOURCE` block at the top of
`app/data-access.js`. Every function keeps its name, arguments and return shape,
because `api.*` was written to return exactly the columns the payload carries.

## Design

Palette taken from fintechhumans.com — navy `#1a1f36`, warm ivory `#f5f4f2`,
rule `#e0ddd8`, gold `#b8960c` — with NLB purple `#230078` used as the *data*
accent: chart series, active state, focus. Gold marks structure, purple marks
data, and the two do not compete. Hairline rules rather than shadows carry the
structure. Inter for type, IBM Plex Mono for figures with tabular numerals.

A boot handler is installed before any other script, so a file that throws while
parsing still produces a readable failure rather than a loading screen that
never clears, with a 15-second watchdog behind it.

## Other methodological choices

- **Growth is like-for-like.** The complete months of the latest year against
  the same calendar months a year earlier. A part-year is never compared with a
  full year, and the rule is implemented in SQL as well as in the ETL.
- **Taxpayer counts are averaged, not summed, when rolling months into years.**
  Summing a monthly stock across twelve months would report twelve times the
  real population.
- **Euro-area comparisons are half-year against half-year.** The ECB reference
  is H1 2025 and Kosovo is measured on the same months, never a full year
  against a half.
- **Productivity and density are reported separately.** Kosovo has 24% of
  euro-area terminal density but 59% of euro-area payments per terminal.
  Quoting either alone misstates the position.
- **The narrative is computed.** The hero signal and market pulse derive from
  the selected period; nothing about the market story is written into the
  source.
- **Observation and interpretation are separated.** Measured relationships are
  stated plainly; any causal reading is labelled a hypothesis.
- **NULL is never zero.** Missing data renders as a stated reason.

## What Phase 1 cannot answer

No public source splits POS terminals, cards, merchants or transactions by bank,
so NLB market share, the Fair Share Index, transaction leakage and on-us versus
off-us activity are out of reach. Merchant-level performance, MDR, interchange,
scheme fees and terminal economics appear in no public source at all.

BQK publishes no instalment-plan table in any reviewed source, so instalment
credit cannot be sized. Credit-function payment share is the nearest available
proxy and is not the same thing; it is labelled as a proxy wherever it appears.

`core` reserves `fact_nlb_*` against the same date, geography, sector and
channel dimensions, so Phase 2 attaches without reshaping Phase 1.

## Sources

- BQK — Raporti Mujor i Sistemit të Pagesave (monthly, to July 2026)
- BQK — Table 15, Payment System time series (monthly, from 2007)
- BQK — *Use of Bank Cards in Kosovo*, September 2025 edition (annual)
- ATK — Open Data, Qarkullimi 2019–2025 and Regjistri i Tatimpaguesve
- ASK — Short-term retail trade statistics, monthly index, 2021 = 100
- ASK — Statistical business register, quarterly and monthly indicators
- ASK — Population and Housing Census 2024, first final results (1,586,659)
- ECB — *Payments statistics: first half of 2025*
