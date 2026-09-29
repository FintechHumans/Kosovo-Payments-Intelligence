# Layer 2 — the bank's own position

Four files. Fill any of them and the corresponding part of the report stops
saying "market only" and starts showing a gap. Fill none and nothing breaks:
the market layer stands on its own, which is why it was built first.

Nothing in this directory is committed except these templates. Add
`data/internal/*.csv` to `.gitignore` before putting real data here — it is
already there.

## The rule that shapes every file

**No person appears in any of them.** Every row is an aggregate by period,
place and merchant vertical. There is no customer, no merchant name, no
account number, no contract and no identifier of any kind, and none should be
added. The commercial questions this report asks are about segments, and a
segment answer never needs a person in the row.

If an export arrives with a merchant name or a customer id in it, aggregate it
before it lands here rather than loading it and hiding the column.

## Shared conventions

| Column | Meaning |
|---|---|
| `period` | `YYYY-MM`. A month, always complete. |
| `municipality` | Exactly as ASK and ATK spell it — `Prishtinë`, `Ferizaj`, `Graçanicë`. The loader rejects a name it cannot match rather than guessing. |
| `vertical_id` | One of the seventeen ids in `etl/verticals.py`, or blank for "not classified". |

Money is euro. Counts are whole numbers. An unknown value is **empty**, never
`0` — a zero says "none", and the difference decides whether a figure is a
denominator.

---

## 1. `nlb_terminals.csv` — a stock

One row per month, municipality and status.

```
period,municipality,status,terminal_count
2026-07,Ferizaj,ACTIVE,214
2026-07,Ferizaj,INACTIVE,38
```

`status` is `ACTIVE`, `INACTIVE` or `TOTAL`. The split is the point: an
inactive terminal costs what an active one costs and earns nothing, and the
report cannot see that distinction from any public source.

**Never summed across months.** A terminal present in June and July is one
terminal.

## 2. `nlb_merchants.csv` — a stock

One row per month, municipality and vertical.

```
period,municipality,vertical_id,merchant_count,with_deposit,with_lending
2026-07,Ferizaj,grocery_food,84,61,12
```

`with_deposit` and `with_lending` are **counts of merchants**, not customers
and not balances. They answer whether acquiring travels with the rest of the
relationship, which is a segment question.

## 3. `nlb_transactions.csv` — a flow

One row per month, municipality, vertical and settlement.

```
period,municipality,vertical_id,settlement,transaction_count,transaction_value
2026-07,Ferizaj,grocery_food,ON_US,18422,412883.55
2026-07,Ferizaj,grocery_food,OFF_US,9110,244019.10
```

`settlement` is `ON_US`, `OFF_US` or `ALL`. On-us and off-us do not earn the
same, so they are never summed into one row by the loader. Supply `ALL` only
if the split genuinely does not exist.

## 4. `nlb_unit_economics.csv` — rates, not results

```
effective_from,scope,mdr_bps,interchange_bps,scheme_bps,terminal_cost_month,servicing_month,note
2026-01-01,DEFAULT,,,,,,supply the rates
```

Basis points on value for the first three, euro per month for the last two.
`scope` is `DEFAULT`, or a vertical id where a rate differs by segment.

**No default is seeded anywhere in this project.** A plausible-looking
placeholder becomes the answer within a day of anyone seeing it, so the
scenario engine reports volume and stops until these are real.

---

## What each file unlocks

| File | What the report can then say |
|---|---|
| terminals | Active share of the fleet, and the cost of the inactive part |
| merchants | Share of merchants by vertical, and whether acquiring travels with deposits or lending |
| transactions | The bank's own productivity and ticket against the market, by place and vertical — replacing the KBA extract that has no period |
| unit economics | Volume becomes contribution, everywhere the scenario engine currently stops |

## Loading

```bash
python etl/load_internal.py --check
```

Validates shape, names and totals without writing anything. Then:

```bash
python etl/load_internal.py
```

Needs `SUPABASE_DB_URL`. Both refuse a file whose municipality names do not
match the dimension, rather than loading rows that will never join.
