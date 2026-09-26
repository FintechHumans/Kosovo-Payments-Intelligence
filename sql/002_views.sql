-- ============================================================================
-- Analytical views — the only surface the dashboard reads (spec §8, §9, §26)
--
-- Every core business KPI has exactly one authoritative formula, and it lives
-- here. The frontend does presentation arithmetic only (formatting, deltas
-- between two already-computed rows) and never re-derives a KPI.
--
-- Views are created with security_invoker = on so that the caller's RLS
-- applies rather than the view owner's, and are granted select to anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- POS market, monthly, per definition.
--
-- Grouping by definition_id is what stops two POS universes being averaged
-- together. Productivity uses the trailing-12-month AVERAGE terminal count,
-- not the end-period stock, because a count divided by a stock that grew 23%
-- during the period overstates the denominator (spec §5).
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_pos_market_monthly
with (security_invoker = on) as
with base as (
    select d.year_month,
           d.date_id,
           d.year,
           d.month,
           f.definition_id,
           md.metric_name          as definition_name,
           md.universe,
           md.is_default,
           f.pos_terminals,
           f.merchants_physical,
           f.transaction_count,
           f.transaction_value
    from core.fact_bqk_pos f
    join core.dim_date d               on d.date_id = f.date_id
    join core.dim_metric_definition md on md.definition_id = f.definition_id
    join core.dim_geography g          on g.geography_id = f.geography_id
    where g.standardized_name = 'Kosovo'
),
withavg as (
    select b.*,
           -- average terminals over the trailing 12 months of the same series
           avg(b.pos_terminals) over (
               partition by b.definition_id
               order by b.date_id
               rows between 11 preceding and current row
           ) as pos_terminals_avg12
    from base b
)
select w.year_month,
       w.year,
       w.month,
       w.definition_id,
       w.definition_name,
       w.universe,
       w.is_default,
       w.pos_terminals,
       w.pos_terminals_avg12,
       w.merchants_physical,
       w.transaction_count,
       w.transaction_value,
       case when w.pos_terminals_avg12 > 0
            then w.transaction_count / w.pos_terminals_avg12 end          as transactions_per_pos,
       case when w.pos_terminals_avg12 > 0
            then w.transaction_value / w.pos_terminals_avg12 end          as value_per_pos,
       case when w.transaction_count > 0
            then w.transaction_value / w.transaction_count end            as average_ticket,
       -- year-on-year, same calendar month, same definition
       case when lag(w.pos_terminals, 12) over sw > 0
            then w.pos_terminals / lag(w.pos_terminals, 12) over sw - 1 end    as pos_yoy,
       case when lag(w.transaction_count, 12) over sw > 0
            then w.transaction_count / lag(w.transaction_count, 12) over sw - 1 end as tx_yoy,
       case when lag(w.transaction_value, 12) over sw > 0
            then w.transaction_value / lag(w.transaction_value, 12) over sw - 1 end as value_yoy
from withavg w
window sw as (partition by w.definition_id order by w.date_id)
order by w.definition_id, w.year_month;

-- ----------------------------------------------------------------------------
-- Payment channel mix — counts and values with their shares.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_payment_channel_mix
with (security_invoker = on) as
select d.year_month,
       c.channel_name,
       c.channel_group,
       md.universe,
       f.transaction_count,
       f.transaction_value,
       case when sum(f.transaction_count) over (partition by d.year_month) > 0
            then f.transaction_count
                 / sum(f.transaction_count) over (partition by d.year_month) end as count_share,
       case when sum(f.transaction_value) over (partition by d.year_month) > 0
            then f.transaction_value
                 / sum(f.transaction_value) over (partition by d.year_month) end as value_share
from core.fact_bqk_digital_payments f
join core.dim_date d               on d.date_id = f.date_id
join core.dim_channel c            on c.channel_id = f.channel_id
join core.dim_metric_definition md on md.definition_id = f.definition_id
order by d.year_month, c.channel_name;

-- ----------------------------------------------------------------------------
-- Sector intelligence — ATK only, full 38 municipalities and 23 sectors.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_sector_intelligence
with (security_invoker = on) as
select d.year,
       d.year_month,
       g.standardized_name as municipality,
       s.standardized_sector as sector,
       s.addressability_category,
       sum(f.turnover)       as turnover,
       sum(f.business_count) as business_count,
       case when sum(f.business_count) > 0
            then sum(f.turnover) / sum(f.business_count) end as turnover_per_business
from core.fact_atk_turnover f
join core.dim_date d      on d.date_id = f.date_id
join core.dim_geography g on g.geography_id = f.geography_id
join core.dim_sector s    on s.sector_id = f.sector_id
group by d.year, d.year_month, g.standardized_name, s.standardized_sector,
         s.addressability_category
order by d.year_month, turnover desc;

-- ----------------------------------------------------------------------------
-- Geographic POS intensity.
--
-- Only the seven cities BQK names, only for years the annual report covers,
-- and POS counts are ESTIMATED from a share read off a chart. Addressable
-- turnover is returned as a floor/ceiling pair rather than a single number,
-- because ATK reports wholesale and retail as one section (spec §7, §10).
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_geographic_pos_intensity
with (security_invoker = on) as
with atk_year as (
    select d.year,
           f.geography_id,
           sum(f.turnover)       as turnover_total,
           sum(f.business_count) as business_count,
           sum(f.turnover) filter (
               where s.addressability_category = 'high')  as turnover_high,
           sum(f.turnover) filter (
               where s.addressability_category in ('high','review_required')) as turnover_high_ceiling
    from core.fact_atk_turnover f
    join core.dim_date d   on d.date_id = f.date_id
    join core.dim_sector s on s.sector_id = f.sector_id
    group by d.year, f.geography_id
)
select g.standardized_name              as municipality,
       ga.year,
       ga.pos_share_pct,
       ga.pos_terminals_estimated,
       ga.atm_pos_transaction_count,
       ga.atm_pos_transaction_value,
       ga.extraction_method,
       a.business_count,
       a.turnover_total,
       a.turnover_high                  as addressable_turnover_floor,
       a.turnover_high_ceiling          as addressable_turnover_ceiling,
       case when a.business_count > 0
            then ga.pos_terminals_estimated / a.business_count * 1000 end as pos_per_1000_businesses,
       case when a.turnover_high > 0
            then ga.pos_terminals_estimated / a.turnover_high * 1e6 end   as pos_per_eur1m_addressable_floor,
       case when a.turnover_high_ceiling > 0
            then ga.pos_terminals_estimated / a.turnover_high_ceiling * 1e6 end as pos_per_eur1m_addressable_ceiling,
       case when ga.pos_terminals_estimated > 0
            then a.turnover_total / ga.pos_terminals_estimated end        as turnover_per_pos,
       case when a.business_count > 0
            then a.turnover_total / a.business_count end                  as turnover_per_business
from core.fact_bqk_geo_annual ga
join core.dim_geography g on g.geography_id = ga.geography_id
left join atk_year a      on a.geography_id = ga.geography_id
                         and a.year = ga.year
order by ga.year desc, ga.pos_share_pct desc;

-- ----------------------------------------------------------------------------
-- Market signals — facts only, never interpretation (spec §11, §21).
--
-- Compares the latest N complete months against the same months a year
-- earlier, so a part-year never distorts a growth rate.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_market_signals
with (security_invoker = on) as
with d as (
    select definition_id, definition_name, universe, is_default,
           year, month, pos_terminals, transaction_count, transaction_value
    from analytics.vw_pos_market_monthly
),
latest as (
    select definition_id, max(year) as year, max(month) filter (
               where year = (select max(year) from d d2 where d2.definition_id = d.definition_id)
           ) as month
    from d group by definition_id
),
window_months as (
    select l.definition_id, l.year, l.month,
           generate_series(1, l.month) as m
    from latest l
),
agg as (
    select w.definition_id,
           w.year,
           w.month                                     as through_month,
           sum(cur.transaction_count)                  as tx_cur,
           sum(prv.transaction_count)                  as tx_prv,
           sum(cur.transaction_value)                  as val_cur,
           sum(prv.transaction_value)                  as val_prv,
           avg(cur.pos_terminals)                      as pos_cur,
           avg(prv.pos_terminals)                      as pos_prv,
           count(prv.transaction_count)                as months_matched
    from window_months w
    join d cur on cur.definition_id = w.definition_id
              and cur.year = w.year and cur.month = w.m
    left join d prv on prv.definition_id = w.definition_id
              and prv.year = w.year - 1 and prv.month = w.m
    group by w.definition_id, w.year, w.month
)
select a.definition_id,
       dd.definition_name,
       dd.universe,
       dd.is_default,
       a.year,
       a.through_month,
       a.months_matched,
       a.pos_cur / nullif(a.pos_prv, 0) - 1 as infrastructure_growth,
       a.tx_cur  / nullif(a.tx_prv, 0)  - 1 as usage_growth,
       a.val_cur / nullif(a.val_prv, 0) - 1 as value_growth,
       (a.tx_cur / nullif(a.pos_cur, 0))
         / nullif(a.tx_prv / nullif(a.pos_prv, 0), 0) - 1 as productivity_growth,
       (a.val_cur / nullif(a.pos_cur, 0))
         / nullif(a.val_prv / nullif(a.pos_prv, 0), 0) - 1 as value_productivity_growth,
       (a.val_cur / nullif(a.tx_cur, 0))
         / nullif(a.val_prv / nullif(a.tx_prv, 0), 0) - 1  as average_ticket_growth,
       (a.tx_cur / nullif(a.tx_prv, 0)) - (a.pos_cur / nullif(a.pos_prv, 0)) as usage_minus_infra_pp
from agg a
join (select distinct definition_id, definition_name, universe, is_default
      from d) dd on dd.definition_id = a.definition_id;

-- ----------------------------------------------------------------------------
-- Data status, for the management-facing panel (spec §28).
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_data_status
with (security_invoker = on) as
select s.institution,
       s.dataset_name,
       s.source_url,
       s.source_table,
       s.publication_date,
       s.reporting_start_date,
       s.reporting_end_date,
       s.frequency,
       s.methodology_notes,
       r.completed_at                as last_refresh,
       r.status                      as last_run_status,
       (select count(*) from audit.data_quality_checks q
         where q.source_id = s.source_id and q.status = 'passed')  as checks_passed,
       (select count(*) from audit.data_quality_checks q
         where q.source_id = s.source_id and q.status = 'failed')  as checks_failed
from audit.data_sources s
left join lateral (
    select * from audit.etl_runs e
    where e.source_id = s.source_id
    order by e.started_at desc limit 1
) r on true
where s.is_active;

-- ----------------------------------------------------------------------------
-- Definition dictionary, exposed so the UI can show the active universe.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_metric_definitions
with (security_invoker = on) as
select definition_id, metric_key, metric_name, official_name, institution,
       universe, cards_coverage, terminal_coverage, geographic_coverage,
       count_or_value, stock_or_flow, unit, is_default, methodology, limitations
from core.dim_metric_definition
order by is_default desc, metric_name;

-- ----------------------------------------------------------------------------
-- Quality findings the dashboard surfaces as badges.
-- ----------------------------------------------------------------------------
create or replace view analytics.vw_quality_findings
with (security_invoker = on) as
select q.check_type, q.severity, q.table_name, q.reporting_period,
       q.expected_value, q.actual_value, q.status, q.message, q.checked_at,
       s.institution, s.dataset_name
from audit.data_quality_checks q
left join audit.data_sources s on s.source_id = q.source_id
where q.run_id = (select max(run_id) from audit.etl_runs where status <> 'running')
order by case q.severity when 'high' then 1 when 'warning' then 2 else 3 end;

-- ============================================================================
-- Read-only grants. The browser can select from analytics and nothing else;
-- no insert, update or delete is granted anywhere, to any client role.
-- ============================================================================
grant select on analytics.vw_pos_market_monthly       to anon, authenticated;
grant select on analytics.vw_payment_channel_mix      to anon, authenticated;
grant select on analytics.vw_sector_intelligence      to anon, authenticated;
grant select on analytics.vw_geographic_pos_intensity to anon, authenticated;
grant select on analytics.vw_market_signals           to anon, authenticated;
grant select on analytics.vw_data_status              to anon, authenticated;
grant select on analytics.vw_metric_definitions       to anon, authenticated;
grant select on analytics.vw_quality_findings         to anon, authenticated;

-- security_invoker views still need the underlying select right for the caller,
-- so grant it narrowly on the curated layer only — raw and audit stay closed
-- except for the two audit tables the status and quality views read.
grant usage  on schema core to anon, authenticated;
grant select on core.dim_date, core.dim_geography, core.dim_sector,
                core.dim_channel, core.dim_card_type, core.dim_scheme,
                core.dim_metric_definition,
                core.fact_bqk_pos, core.fact_bqk_atm, core.fact_bqk_cards,
                core.fact_bqk_digital_payments, core.fact_bqk_geo_annual,
                core.fact_atk_turnover
             to anon, authenticated;
grant usage  on schema audit to anon, authenticated;
grant select on audit.data_sources, audit.etl_runs, audit.data_quality_checks
             to anon, authenticated;

-- Matching permissive read policies, so RLS admits select and still denies
-- every write path.
do $$
declare t text;
begin
  foreach t in array array[
    'core.dim_date','core.dim_geography','core.dim_sector','core.dim_channel',
    'core.dim_card_type','core.dim_scheme','core.dim_metric_definition',
    'core.fact_bqk_pos','core.fact_bqk_atm','core.fact_bqk_cards',
    'core.fact_bqk_digital_payments','core.fact_bqk_geo_annual',
    'core.fact_atk_turnover','audit.data_sources','audit.etl_runs',
    'audit.data_quality_checks']
  loop
    execute format(
      'drop policy if exists p_read on %s; create policy p_read on %s for select to anon, authenticated using (true);',
      t, t);
  end loop;
end $$;
