# Kosovo Merchant & Payments Intelligence — Phase 1

Public market intelligence on the Kosovo POS and payments market, built only
from Central Bank of Kosovo (BQK) and Tax Administration of Kosovo (ATK) open
data. No internal NLB information, no bank-level data, no taxpayer-level record.

```
BQK / ATK official publications
  └─ data/raw/              downloads, hashed and never modified
       └─ etl/build.py      parse → validate → reconcile → normalise
            ├─ data/curated/seed.sql        Supabase load
            ├─ data/curated/dashboard.json  curated payload
            └─ app/data.js                  same payload, browser-ready
                 └─ app/                    seven-module front end
```

## Running it

```bash
python etl/build.py
python -m http.server 8790 --directory app
```

The build reparses every source on each run. It is idempotent, and it recomputes
rather than appends, so a figure the publisher restates is corrected instead of
frozen at whatever the last build captured.

## Supabase

`sql/001_schema.sql` and `sql/002_views.sql` implement five schemas —
`raw`, `core`, `analytics`, `api`, `audit` — with RLS enabled on every table,
`raw`/`core`/`audit` revoked from client roles, and only `api.*` granted select.
No insert, update or delete is granted to any client role anywhere.

**Not yet applied.** Both Supabase projects on the account report `INACTIVE`
and every connection times out. Once one is resumed:

```bash
psql "$SUPABASE_DB_URL" -f sql/001_schema.sql
psql "$SUPABASE_DB_URL" -f sql/002_views.sql
psql "$SUPABASE_DB_URL" -f data/curated/seed.sql
```

The front end then switches over by editing the `SOURCE` block at the top of
`app/data-access.js`. Every function keeps its name, arguments and return shape,
because `api.*` was written to return exactly the columns the payload carries.

## Three modelling rules the schema enforces

**Stock and flow never share a row.** Terminal, card and ATM counts are stocks;
transactions and value are flows. They live in separate fact tables, so a stock
cannot be summed across months by accident. Productivity joins them
deliberately and reports both variants: `transactions_per_average_pos` uses a
trailing 12-month mean, `transactions_per_end_period_pos` uses the closing
stock, and they are never presented as the same measure.

**City is not municipality.** BQK names seven *cities*; ATK publishes 38
*municipalities*, which contain settlements outside their city. `dim_geography`
stores the level, both grains exist as separate rows, and every ratio crossing
them carries `WARNING` in `audit.kpi_build_status` and says so on the page.

**Taxpayers are not businesses.** ATK publishes "Numri i Tatimpaguesve" —
registered taxpayers filing in the month, including entities that accept no
cards. `fact_atk_turnover.entity_type` records this and the UI never says
"businesses".

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
basis as the terminal count it is divided by.

## Traceability

Every figure answers "where did this come from?". The ⓘ on any KPI opens a
drawer carrying the formula, numerator, denominator, definition, universe,
aggregation rule, valid comparison method, institution, publication, **source
filename, SHA-256 of that exact file, download date and parser version**, plus
the audit status and a link to the official source.

`audit.source_versions` hashes every physical file. A publisher replacing a file
at the same URL is detected and superseded rather than silently absorbed.

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
8. **Period lag** — ATK ends Dec 2025, BQK runs to Jul 2026.
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

## Modules

| | Module | Question |
|---|---|---|
| 01 | Market Overview | What is happening? |
| 02 | Payment Behaviour | How are payments changing? |
| 03 | Geographic Intelligence | Where is infrastructure concentrated? |
| 04 | Economic Opportunity | How does infrastructure compare with activity? |
| 05 | Sector Intelligence | Which parts of the economy drive addressable turnover? |
| 06 | Data Assurance | Can I trust these numbers? |
| 07 | Methodology | How exactly was this calculated? |

**Executive mode** enlarges the key figures, hides the analyst controls and keeps
source access, for presenting without building a separate deck. **Analyst mode**
is the default.

## Design

Palette taken from fintechhumans.com — navy `#1a1f36`, warm ivory `#f5f4f2`,
rule `#e0ddd8`, gold `#b8960c` — with NLB purple `#230078` used as the *data*
accent: chart series, active state, focus. Gold marks structure, purple marks
data, and the two do not compete. Hairline rules rather than shadows carry the
structure. Inter for type, IBM Plex Mono for figures with tabular numerals.

Charts are hand-built SVG: no charting library, no runtime dependency.

## Other methodological choices

- **Growth is like-for-like.** The complete months of the latest year against
  the same calendar months a year earlier. A part-year is never compared with a
  full year, and the rule is implemented in SQL as well as in the ETL.
- **Taxpayer counts are averaged, not summed, when rolling months into years.**
  Summing a monthly stock across twelve months would report twelve times the
  real population.
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

`core` reserves `fact_nlb_*` against the same date, geography, sector and
channel dimensions, so Phase 2 attaches without reshaping Phase 1.

## Sources

- BQK — Raporti Mujor i Sistemit të Pagesave (monthly)
- BQK — Table 15, Payment System time series (monthly, from 2007)
- BQK — *Use of Bank Cards in Kosovo*, September 2025 edition (annual)
- ATK — Open Data, Qarkullimi 2019–2025 and Regjistri i Tatimpaguesve
