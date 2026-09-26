# Kosovo Merchant & Payments Intelligence — Phase 1

Public market intelligence on the Kosovo POS and payments market, built only
from Central Bank of Kosovo (BQK) and Tax Administration of Kosovo (ATK) open
data. No internal NLB information, no bank-level data, no taxpayer-level record.

```
BQK / ATK official sources
   └─ data/raw/                raw downloads, never modified
        └─ etl/build.py        parse → validate → normalise
             ├─ data/curated/seed.sql       Supabase load
             ├─ data/curated/dashboard.json curated payload
             └─ app/data.js                 same payload, browser-ready
                  └─ app/                   React-free dashboard
```

## Running it

```bash
python etl/build.py
```

Reparses every source and rewrites the curated layer. It is idempotent —
rerunning over the same publications produces the same rows — and it recomputes
every period rather than appending, so a figure the publisher restates is
corrected instead of frozen.

Serve `app/` over HTTP (it needs `fetch`-free static files only):

```bash
python -m http.server 8790 --directory app
```

## Supabase

`sql/001_schema.sql` and `sql/002_views.sql` implement the four-schema model the
brief specifies — `raw`, `core`, `analytics`, `audit` — with RLS enabled on every
table, read-only grants to `anon`, and no write path exposed to the browser.

**This has not been applied yet.** Both Supabase projects on the account report
`INACTIVE` and every connection times out, so the schema could not be created.
Once a project is resumed:

```bash
psql "$SUPABASE_DB_URL" -f sql/001_schema.sql
psql "$SUPABASE_DB_URL" -f sql/002_views.sql
psql "$SUPABASE_DB_URL" -f data/curated/seed.sql
```

The dashboard then switches over by editing the SOURCE block at the top of
`app/data-access.js` only. Every function keeps its name, arguments and return
shape, because the analytics views were written to return exactly the columns
the payload already carries.

## The three POS universes

BQK publishes three numbers that can all be called "POS transactions in 2025".
They differ by up to 43%, and mixing them produces a meaningless trend.

| Series | 2025 | Covers |
|---|---:|---|
| Table 15 — POS Domestic | 43.5m | Kosovo-issued cards only |
| Table 15 — domestic + foreign | 53.7m | adds foreign cards used in Kosovo |
| Raport Mujor — pos_card | 62.1m | all cards acquired at Kosovo POS |

`core.dim_metric_definition` carries one row per universe and every POS fact
references it, so two universes cannot be summed by accident. The dashboard
prints the active universe next to the filters and never shows a bare
"POS Transactions" label.

The Raport Mujor series is the default because it is the only one measured on
the same basis as the terminal count it is divided by.

## Known source properties, not defects

Six findings are raised by the build and surfaced in the dashboard. None can be
corrected here, and none is silently smoothed:

1. **Terminal series discontinuity** — the annual report records 20,913
   terminals at end-2024 while the monthly series opens at 25,166 in January
   2025. A 20% step in one month is not a market movement; the universes differ.
   The two series are never joined, so there is no terminal history before 2025.
2. **Definition gap** — Raport Mujor runs 12–18% above Table 15 in all 19
   overlapping months. Definitional, stable, never reconciled by arithmetic.
3. **Geographic data is ATM + POS combined** — the annual report's city
   transaction figures cover both terminal types. They are labelled as such and
   no POS productivity is computed by geography.
4. **City POS shares come from a PDF chart** — seven cities, annual,
   percentages read off Figure 4. The legend-to-value pairing is confirmed only
   for Prishtinë; the other six are flagged unverified in the dashboard.
5. **31 of 38 municipalities have no BQK terminal data** — about 22% of the
   network is unattributed.
6. **ATK ends December 2025, BQK runs to July 2026** — integrated pages lag by
   seven months, and no BQK month is ever compared against an ATK month that
   does not exist.

## Addressable turnover is a range

ATK publishes sector only at NACE section level. "Tregtia me shumicë dhe pakicë"
is one section worth ~46% of all turnover and merges wholesale B2B, which is not
a card channel, with retail, which is the most card-addressable activity there
is. No split is published.

The brief forbids inventing a percentage, so none is invented. Addressable
turnover is reported as a floor (unambiguously card-facing sectors only, ~3.6%
of the economy) and a ceiling (adding the combined trade sector, ~50%). The
classification lives in `etl/mappings.py`, is stored in `core.dim_sector`, and
is shown with its reasoning in the dashboard.

## Methodological choices worth knowing

- **Productivity uses average terminals, not the end-period stock.** Dividing a
  full period's transactions by a stock that grew 23% during it overstates the
  denominator.
- **Growth is like-for-like.** The latest complete months are compared against
  the same calendar months a year earlier, so a part-year never distorts a rate.
- **Taxpayer counts are averaged, not summed, when rolling months into years.**
  The count is a monthly stock; summing twelve months would report twelve times
  the real business population and deflate every per-business ratio.
- **The market narrative is computed, never written down.** `vw_market_signals`
  and the signal panel derive infrastructure, usage, productivity, value and
  ticket growth from the selected period, and the sentence is assembled from
  those values at render time.
- **Observation and interpretation are separated.** Measured relationships are
  stated plainly; any causal reading is labelled a hypothesis.

## What Phase 1 cannot answer

No public source splits POS terminals, cards, merchants or transactions by bank,
so NLB market share, the Fair Share Index, transaction leakage and on-us versus
off-us activity are out of reach — absent by necessity, not by choice.
Merchant-level performance, MDR, interchange, scheme fees and terminal economics
appear in no public source at all.

`core` is laid out so Phase 2 attaches `fact_nlb_*` tables to the same date,
geography, sector and channel dimensions without reshaping anything here.

## Sources

- BQK — Raporti Mujor i Sistemit të Pagesave (monthly)
- BQK — Table 15, Payment System time series (monthly, from 2007)
- BQK — *Use of Bank Cards in Kosovo*, September 2025 edition (annual)
- ATK — Open Data, Qarkullimi 2019–2025 and Regjistri i Tatimpaguesve
