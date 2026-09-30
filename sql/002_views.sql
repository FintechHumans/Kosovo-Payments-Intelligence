-- ============================================================================
-- Analytics and API layers
--
-- analytics.*  internal: one authoritative formula per KPI, never exposed
-- api.*        the only surface the browser reads
--
-- The api views deliberately do NOT set security_invoker. A view without it
-- executes with the privileges of its owner, which is how the browser can read
-- curated results while core and audit stay revoked from anon. That is the
-- intended model here: expose a narrow, read-only projection rather than
-- granting the client access to the underlying tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- POS market, monthly. Stock and flow live in different tables and are joined
-- here on purpose, with both productivity variants returned and named
-- distinctly — a count over an average stock is not the same measure as a
-- count over an end-period stock, and the brief requires the difference to be
-- visible rather than implied.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_pos_market_monthly as
with flow as (
    select f.date_id, f.definition_id,
           sum(f.transaction_count) as transaction_count,
           sum(f.transaction_value) as transaction_value
    from core.fact_pos_transactions f
    join core.dim_geography g on g.geography_id = f.geography_id
    where g.geography_level = 'NATIONAL'
    group by f.date_id, f.definition_id
),
stock as (
    select s.date_id, s.definition_id,
           s.terminal_count, s.merchants_physical
    from core.fact_pos_terminal_stock s
    join core.dim_geography g on g.geography_id = s.geography_id
    where g.geography_level = 'NATIONAL'
      and s.observation_type = 'MONTH_END'
),
joined as (
    select d.date_id, d.year_month, d.year, d.month,
           coalesce(f.definition_id, s.definition_id) as definition_id,
           f.transaction_count, f.transaction_value,
           s.terminal_count, s.merchants_physical
    from core.dim_date d
    left join flow  f on f.date_id = d.date_id
    left join stock s on s.date_id = d.date_id and s.definition_id = f.definition_id
    where f.definition_id is not null or s.definition_id is not null
),
withavg as (
    select j.*,
           avg(j.terminal_count) over (
               partition by j.definition_id order by j.date_id
               rows between 11 preceding and current row) as terminal_avg_12m
    from joined j
)
select w.year_month, w.year, w.month, w.definition_id,
       md.metric_name as definition_name, md.universe, md.is_default,
       w.terminal_count          as terminal_stock_month_end,
       w.terminal_avg_12m        as terminal_stock_avg_12m,
       w.merchants_physical,
       w.transaction_count,
       w.transaction_value,
       case when w.terminal_avg_12m > 0
            then w.transaction_count / w.terminal_avg_12m end  as transactions_per_average_pos,
       case when w.terminal_count > 0
            then w.transaction_count / w.terminal_count end    as transactions_per_end_period_pos,
       case when w.terminal_avg_12m > 0
            then w.transaction_value / w.terminal_avg_12m end  as value_per_average_pos,
       case when w.transaction_count > 0
            then w.transaction_value / w.transaction_count end as average_ticket,
       -- Year on year is matched on the CALENDAR month, not on a row offset.
       -- lag(x, 12) counts twelve rows back, which is only twelve months back
       -- while the series has no gaps: a single missing month silently shifts
       -- every comparison after it onto the wrong month. The rest of this
       -- project matches like for like explicitly, and so does this.
       case when p.terminal_count > 0
            then w.terminal_count / p.terminal_count - 1 end       as pos_yoy,
       case when p.transaction_count > 0
            then w.transaction_count / p.transaction_count - 1 end as tx_yoy,
       case when p.transaction_value > 0
            then w.transaction_value / p.transaction_value - 1 end as value_yoy
from withavg w
join core.dim_metric_definition md on md.definition_id = w.definition_id
left join withavg p on p.definition_id = w.definition_id
                   and p.year  = w.year - 1
                   and p.month = w.month;

-- ----------------------------------------------------------------------------
-- Market signals. Compares the complete months of the latest year against the
-- SAME calendar months a year earlier. A part-year is never compared with a
-- full year — the window is built from the months that exist on both sides.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_market_signals as
with m as (
    select definition_id, definition_name, universe, is_default, year, month,
           terminal_stock_month_end, transaction_count, transaction_value
    from analytics.vw_pos_market_monthly
),
last_period as (
    select definition_id, max(year) as y
    from m where transaction_count is not null
    group by definition_id
),
last_month as (
    select l.definition_id, l.y as year, max(m.month) as through_month
    from last_period l join m on m.definition_id = l.definition_id and m.year = l.y
    where m.transaction_count is not null
    group by l.definition_id, l.y
),
paired as (
    select lm.definition_id, lm.year, lm.through_month,
           cur.month,
           cur.transaction_count as tx_cur, prv.transaction_count as tx_prv,
           cur.transaction_value as vl_cur, prv.transaction_value as vl_prv,
           cur.terminal_stock_month_end as pos_cur,
           prv.terminal_stock_month_end as pos_prv
    from last_month lm
    join m cur on cur.definition_id = lm.definition_id
              and cur.year = lm.year and cur.month <= lm.through_month
    join m prv on prv.definition_id = lm.definition_id
              and prv.year = lm.year - 1 and prv.month = cur.month
    where cur.transaction_count is not null and prv.transaction_count is not null
),
agg as (
    select definition_id, year, through_month,
           count(*)      as months_matched,
           sum(tx_cur)   as tx_cur, sum(tx_prv)   as tx_prv,
           sum(vl_cur)   as vl_cur, sum(vl_prv)   as vl_prv,
           avg(pos_cur)  as pos_cur, avg(pos_prv) as pos_prv
    from paired group by definition_id, year, through_month
)
select a.definition_id, md.metric_name as definition_name, md.universe, md.is_default,
       a.year, a.through_month, a.months_matched,
       a.pos_cur / nullif(a.pos_prv, 0) - 1 as infrastructure_growth,
       a.tx_cur  / nullif(a.tx_prv, 0)  - 1 as usage_growth,
       a.vl_cur  / nullif(a.vl_prv, 0)  - 1 as value_growth,
       (a.tx_cur / nullif(a.pos_cur, 0)) / nullif(a.tx_prv / nullif(a.pos_prv, 0), 0) - 1
                                            as productivity_growth,
       (a.vl_cur / nullif(a.pos_cur, 0)) / nullif(a.vl_prv / nullif(a.pos_prv, 0), 0) - 1
                                            as value_productivity_growth,
       (a.vl_cur / nullif(a.tx_cur, 0)) / nullif(a.vl_prv / nullif(a.tx_prv, 0), 0) - 1
                                            as average_ticket_growth,
       (a.tx_cur / nullif(a.tx_prv, 0)) - (a.pos_cur / nullif(a.pos_prv, 0))
                                            as usage_minus_infra_pp,
       a.vl_cur / nullif(a.tx_cur, 0) as ticket_current,
       a.vl_prv / nullif(a.tx_prv, 0) as ticket_prior
from agg a
join core.dim_metric_definition md on md.definition_id = a.definition_id;

-- ----------------------------------------------------------------------------
create or replace view analytics.vw_payment_channel_mix as
select d.year_month, c.channel_name, c.channel_group,
       f.transaction_count, f.transaction_value,
       f.transaction_count / nullif(sum(f.transaction_count)
            over (partition by d.year_month), 0) as count_share,
       f.transaction_value / nullif(sum(f.transaction_value)
            over (partition by d.year_month), 0) as value_share
from core.fact_digital_payments f
join core.dim_date d    on d.date_id = f.date_id
join core.dim_channel c on c.channel_id = f.channel_id;

-- ----------------------------------------------------------------------------
-- Sector intelligence. entity_count is a monthly stock, so a yearly figure is
-- its average across the months present, never a sum.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_sector_intelligence as
select d.year,
       g.standardized_name as geography,
       g.geography_level,
       s.standardized_sector as sector,
       s.addressability_class,
       f.entity_type,
       sum(f.turnover)                            as turnover,
       avg(f.entity_count)                        as entity_count,
       count(distinct d.month)                    as months_covered,
       sum(f.turnover) / nullif(avg(f.entity_count), 0) as turnover_per_entity
from core.fact_atk_turnover f
join core.dim_date d      on d.date_id = f.date_id
join core.dim_geography g on g.geography_id = f.geography_id
join core.dim_sector s    on s.sector_id = f.sector_id
group by d.year, g.standardized_name, g.geography_level,
         s.standardized_sector, s.addressability_class, f.entity_type;

-- ----------------------------------------------------------------------------
-- Geographic footprint. City grain only, exactly as BQK publishes it. The
-- transaction columns are ATM AND POS combined and are named so. No POS
-- productivity is derived here — the numerator would be the wrong universe.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_geo_footprint as
select g.standardized_name as city,
       ga.year,
       ga.pos_share_pct,
       ga.pos_terminals_estimated,
       ga.atm_pos_transaction_count,
       ga.atm_pos_transaction_value,
       ga.extraction_method,
       ga.pairing_verified
from core.fact_pos_geo_annual ga
join core.dim_geography g on g.geography_id = ga.geography_id
where g.geography_level = 'CITY';

-- ----------------------------------------------------------------------------
-- Economic context. Joins BQK city data to ATK municipality data, which is a
-- GRAIN APPROXIMATION: a municipality contains settlements outside its city.
-- The view returns the flag so the UI states it, and audit.kpi_build_status
-- carries WARNING for every ratio built from it.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_economic_context as
with atk as (
    select d.year, f.geography_id,
           sum(f.turnover) as turnover_total,
           avg(f.entity_count) filter (where true) as entity_count,
           sum(f.turnover) filter (where s.addressability_class = 'HIGH') as addressable_floor,
           sum(f.turnover) filter (where s.addressability_class in ('HIGH','REVIEW_REQUIRED'))
               as addressable_ceiling
    from core.fact_atk_turnover f
    join core.dim_date d   on d.date_id = f.date_id
    join core.dim_sector s on s.sector_id = f.sector_id
    where f.entity_type = 'TAXPAYER'
    group by d.year, f.geography_id
)
select gc.standardized_name        as city,
       gm.standardized_name        as municipality,
       ga.year,
       ga.pos_terminals_estimated,
       ga.pairing_verified,
       a.entity_count,
       a.turnover_total,
       a.addressable_floor,
       a.addressable_ceiling,
       'TAXPAYER'::text            as entity_type,
       'CITY_TO_MUNICIPALITY'::text as grain_approximation,
       ga.pos_terminals_estimated / nullif(a.entity_count, 0) * 1000
            as pos_per_1000_taxpayers,
       ga.pos_terminals_estimated / nullif(a.addressable_ceiling, 0) * 1e6
            as pos_per_eur1m_addressable_ceiling,
       ga.pos_terminals_estimated / nullif(a.addressable_floor, 0) * 1e6
            as pos_per_eur1m_addressable_floor,
       a.turnover_total / nullif(ga.pos_terminals_estimated, 0) as turnover_per_pos
from core.fact_pos_geo_annual ga
join core.dim_geography gc on gc.geography_id = ga.geography_id
join core.dim_geography gm on gm.standardized_name = gc.standardized_name
                          and gm.geography_level = 'MUNICIPALITY'
left join atk a on a.geography_id = gm.geography_id and a.year = ga.year;

-- ============================================================================
-- API — the browser surface
-- ============================================================================

create or replace view api.overview_monthly as
select year_month, year, month, definition_id, definition_name, universe, is_default,
       terminal_stock_month_end, terminal_stock_avg_12m, merchants_physical,
       transaction_count, transaction_value,
       transactions_per_average_pos, transactions_per_end_period_pos,
       value_per_average_pos, average_ticket, pos_yoy, tx_yoy, value_yoy
from analytics.vw_pos_market_monthly;

create or replace view api.market_signals as
select * from analytics.vw_market_signals;

create or replace view api.payment_behaviour as
select * from analytics.vw_payment_channel_mix;

create or replace view api.geo_summary as
select * from analytics.vw_geo_footprint;

create or replace view api.economic_context as
select * from analytics.vw_economic_context;

create or replace view api.sector_summary as
select * from analytics.vw_sector_intelligence;

create or replace view api.methodology as
select k.kpi_id, k.display_name, k.business_definition, k.sql_formula,
       k.numerator, k.denominator, k.required_definition, k.frequency,
       k.aggregation_rule, k.valid_comparison_method, k.source_requirements,
       k.known_limitations, s.status, s.reason
from analytics.kpi_registry k
left join audit.kpi_build_status s on s.kpi_id = k.kpi_id;

create or replace view api.definitions as
select definition_id, metric_key, metric_name, official_name, institution,
       perspective, universe, card_origin, cards_coverage, count_or_value,
       stock_or_flow, geographic_coverage, frequency, unit, is_default,
       methodology, limitations
from core.dim_metric_definition;

create or replace view api.data_status as
select s.institution, s.dataset_name, s.official_title, s.source_url, s.frequency,
       v.original_filename, v.source_table, v.publication_date,
       v.reporting_start_date, v.reporting_end_date, v.downloaded_at,
       v.file_size, v.sha256_hash, v.parser_version, v.revision_detected,
       r.completed_at as last_run, r.status as last_run_status
from audit.data_sources s
join audit.source_versions v on v.source_id = s.source_id and v.is_current
left join lateral (
    select * from audit.etl_runs e
    where e.source_version_id = v.source_version_id
    order by e.started_at desc limit 1) r on true
where s.is_active;

create or replace view api.quality_findings as
select check_type, check_group, severity, table_name, reporting_period,
       expected_value, actual_value, variance, variance_percent, status, message
from audit.data_quality_checks
where run_id = (select max(run_id) from audit.etl_runs where status <> 'running');

create or replace view api.reconciliation as
select * from audit.source_reconciliation;

create or replace view api.series_coverage as
select * from audit.series_coverage;

create or replace view api.kpi_status as
select * from audit.kpi_build_status;

grant select on all tables in schema api to anon, authenticated;

-- ----------------------------------------------------------------------------
-- The browser surface.
--
-- PostgREST serves only the schemas the platform lists, and on Supabase that
-- is public and graphql_public. The api schema above is correct, granted and
-- populated, and every HTTP request for it returns 404 — right data behind a
-- door the server was never told to open. So the browser reads one view in
-- the schema PostgREST already serves.
--
-- The isolation is unchanged, because it never came from the schema name:
-- row-level security stays on the base table, the view is read-only, and
-- select is the only privilege any client role holds anywhere. The api schema
-- remains for SQL and BI clients, which connect directly.
-- ----------------------------------------------------------------------------
create or replace view public.kpi_derived as
select key, payload, parser_version, row_count, built_at
from analytics.derived_output;

revoke all on public.kpi_derived from anon, authenticated;
grant select on public.kpi_derived to anon, authenticated;

-- Read-only is enforced by granting select and nothing else; no insert, update
-- or delete is granted to any client role anywhere in the database.
