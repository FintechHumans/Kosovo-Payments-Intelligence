-- ============================================================================
-- Kosovo Merchant & Payments Intelligence — Phase 1 schema
--
-- Four schemas, strictly separated (spec §22):
--   raw       parsed source rows, kept close to the publication
--   core      dimensions and curated facts
--   analytics the only surface the dashboard may read
--   audit     lineage, ETL runs, quality checks
--
-- The keystone is core.dim_metric_definition. BQK publishes three different
-- numbers that can all be called "POS transactions", differing by up to 43%.
-- Every POS fact row carries a definition_id, and the analytical views group
-- by it, so summing two universes together is structurally impossible rather
-- than merely discouraged.
--
-- Public statistical data only. No bank-level, merchant-level or taxpayer-level
-- record is modelled here; those belong to Phase 2 (see §30).
-- ============================================================================

create schema if not exists raw;
create schema if not exists core;
create schema if not exists analytics;
create schema if not exists audit;

-- ============================================================================
-- AUDIT — lineage first, because everything else references it
-- ============================================================================

create table if not exists audit.data_sources (
    source_id            text primary key,
    institution          text        not null check (institution in ('BQK','ATK')),
    dataset_name         text        not null,
    source_url           text        not null,
    source_table         text,
    publication_date     date,
    reporting_start_date date,
    reporting_end_date   date,
    frequency            text        not null check (frequency in ('monthly','quarterly','annual')),
    file_type            text        not null,
    downloaded_at        timestamptz,
    source_hash          text,
    methodology_notes    text,
    is_active            boolean     not null default true
);

comment on table audit.data_sources is
    'One row per official publication actually ingested. source_hash lets a '
    'reload detect that the publisher silently replaced a file at the same URL.';

create table if not exists audit.etl_runs (
    run_id             bigserial primary key,
    source_id          text references audit.data_sources(source_id),
    started_at         timestamptz not null default now(),
    completed_at       timestamptz,
    status             text        not null default 'running'
                       check (status in ('running','succeeded','failed','partial')),
    records_extracted  integer default 0,
    records_inserted   integer default 0,
    records_updated    integer default 0,
    records_rejected   integer default 0,
    error_message      text
);

create index if not exists ix_etl_runs_source on audit.etl_runs (source_id, started_at desc);

create table if not exists audit.data_quality_checks (
    check_id         bigserial primary key,
    run_id           bigint references audit.etl_runs(run_id) on delete cascade,
    source_id        text   references audit.data_sources(source_id),
    check_type       text   not null,
    severity         text   not null check (severity in ('info','warning','high')),
    table_name       text,
    reporting_period text,
    record_reference text,
    expected_value   text,
    actual_value     text,
    status           text   not null check (status in ('passed','failed')),
    message          text,
    checked_at       timestamptz not null default now()
);

create index if not exists ix_dq_status on audit.data_quality_checks (status, severity);
create index if not exists ix_dq_run    on audit.data_quality_checks (run_id);

-- ============================================================================
-- RAW — never overwritten by cleaning
-- ============================================================================

create table if not exists raw.bqk_data (
    raw_id         bigserial primary key,
    source_id      text not null references audit.data_sources(source_id),
    run_id         bigint references audit.etl_runs(run_id),
    source_table   text,
    source_sheet   text,
    source_row     integer,
    reporting_date date not null,
    metric_name    text not null,
    dimension_1    text,
    dimension_2    text,
    dimension_3    text,
    raw_value      numeric,
    raw_unit       text,
    loaded_at      timestamptz not null default now()
);

create index if not exists ix_raw_bqk_metric on raw.bqk_data (metric_name, reporting_date);

create table if not exists raw.atk_turnover (
    raw_id              bigserial primary key,
    source_id           text not null references audit.data_sources(source_id),
    run_id              bigint references audit.etl_runs(run_id),
    year                integer not null,
    month               integer not null check (month between 1 and 12),
    municipality_raw    text,
    sector_raw          text,
    business_status_raw text,
    business_count_raw  numeric,
    turnover_raw        numeric,
    loaded_at           timestamptz not null default now()
);

create index if not exists ix_raw_atk_period on raw.atk_turnover (year, month);

-- ============================================================================
-- CORE — dimensions
-- ============================================================================

create table if not exists core.dim_date (
    date_id    integer primary key,           -- yyyymm
    period_date date    not null,             -- first day of month
    year       integer not null,
    quarter    integer not null,
    month      integer not null,
    year_month text    not null unique,       -- 'YYYY-MM'
    month_name text    not null
);

create table if not exists core.dim_geography (
    geography_id       serial primary key,
    municipality_code  text unique,
    standardized_name  text not null unique,
    atk_name           text,
    bqk_name           text,
    region             text,
    match_status       text not null
        check (match_status in ('matched','atk_only','bqk_only','unmatched'))
);

comment on column core.dim_geography.match_status is
    'ATK publishes 38 municipalities monthly; BQK names only 7 cities, annually. '
    'Rows that exist on one side only are kept and flagged, never dropped.';

create table if not exists core.dim_sector (
    sector_id              serial primary key,
    source_sector_name     text not null unique,
    standardized_sector    text not null,
    parent_sector          text,
    addressability_category text not null
        check (addressability_category in ('high','medium','low','review_required')),
    addressability_notes   text
);

comment on column core.dim_sector.addressability_category is
    'review_required is used where the published granularity cannot support a '
    'judgement — notably wholesale and retail, which ATK reports as one section '
    'worth ~46% of turnover. No invented split factor is applied (spec §7).';

create table if not exists core.dim_channel (
    channel_id serial primary key,
    channel_name text not null unique,
    channel_group text
);

create table if not exists core.dim_card_type (
    card_type_id serial primary key,
    card_type_name text not null unique
);

create table if not exists core.dim_scheme (
    scheme_id serial primary key,
    scheme_name text not null unique
);

-- The keystone.
create table if not exists core.dim_metric_definition (
    definition_id       serial primary key,
    metric_key          text not null unique,
    metric_name         text not null,
    official_name       text,
    institution         text not null,
    universe            text not null,
    cards_coverage      text,
    terminal_coverage   text,
    geographic_coverage text,
    count_or_value      text check (count_or_value in ('count','value','both','stock')),
    stock_or_flow       text check (stock_or_flow in ('stock','flow')),
    unit                text,
    is_default          boolean not null default false,
    methodology         text,
    limitations         text
);

comment on table core.dim_metric_definition is
    'Distinguishes the incompatible BQK series. The monthly Raport Mujor POS '
    'terminal count (25,166 in Jan 2025) and the annual report count (20,913 at '
    'end-2024) are different universes and must never be spliced into one trend.';

-- ============================================================================
-- CORE — facts
-- ============================================================================

create table if not exists core.fact_bqk_pos (
    date_id           integer not null references core.dim_date(date_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_id         text    not null references audit.data_sources(source_id),
    -- national rows carry the 'Kosovo' sentinel geography, so the key needs no
    -- coalesce() (which a primary key cannot contain anyway)
    geography_id      integer not null references core.dim_geography(geography_id),
    pos_terminals     numeric,
    eftpos            numeric,
    virtual_pos       numeric,
    merchants_physical numeric,
    merchants_virtual numeric,
    transaction_count numeric,
    transaction_value numeric,
    loaded_at         timestamptz not null default now(),
    primary key (date_id, definition_id, geography_id)
);

create index if not exists ix_pos_def on core.fact_bqk_pos (definition_id, date_id);

create table if not exists core.fact_bqk_atm (
    date_id          integer not null references core.dim_date(date_id),
    definition_id    integer not null references core.dim_metric_definition(definition_id),
    source_id        text    not null references audit.data_sources(source_id),
    atm_count        numeric,
    withdrawal_count numeric,
    withdrawal_value numeric,
    deposit_count    numeric,
    deposit_value    numeric,
    primary key (date_id, definition_id)
);

create table if not exists core.fact_bqk_cards (
    date_id           integer not null references core.dim_date(date_id),
    card_type_id      integer not null references core.dim_card_type(card_type_id),
    -- an 'All schemes' sentinel row keeps this key expression-free
    scheme_id         integer not null references core.dim_scheme(scheme_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_id         text    not null references audit.data_sources(source_id),
    cards_issued      numeric,
    transaction_count numeric,
    transaction_value numeric,
    primary key (date_id, card_type_id, scheme_id, definition_id)
);

create table if not exists core.fact_bqk_digital_payments (
    date_id           integer not null references core.dim_date(date_id),
    channel_id        integer not null references core.dim_channel(channel_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_id         text    not null references audit.data_sources(source_id),
    transaction_count numeric,
    transaction_value numeric,
    primary key (date_id, channel_id, definition_id)
);

-- Annual, 7 cities, read off a chart in the annual PDF. Deliberately a separate
-- table from fact_bqk_pos: different grain, different universe, different
-- confidence. The transaction columns are ATM and POS COMBINED — the source
-- does not separate them, so the column names say so.
create table if not exists core.fact_bqk_geo_annual (
    year                     integer not null,
    geography_id             integer not null references core.dim_geography(geography_id),
    source_id                text    not null references audit.data_sources(source_id),
    pos_share_pct            numeric,
    atm_share_pct            numeric,
    pos_terminals_estimated  numeric,
    atm_pos_transaction_count numeric,
    atm_pos_transaction_value numeric,
    extraction_method        text not null default 'pdf_chart_manual',
    primary key (year, geography_id)
);

create table if not exists core.fact_atk_turnover (
    date_id        integer not null references core.dim_date(date_id),
    geography_id   integer not null references core.dim_geography(geography_id),
    sector_id      integer not null references core.dim_sector(sector_id),
    source_id      text    not null references audit.data_sources(source_id),
    business_count numeric,
    turnover       numeric,
    primary key (date_id, geography_id, sector_id)
);

create index if not exists ix_atk_geo    on core.fact_atk_turnover (geography_id, date_id);
create index if not exists ix_atk_sector on core.fact_atk_turnover (sector_id, date_id);

-- ============================================================================
-- ROW LEVEL SECURITY (spec §21)
--
-- Everything is RLS-enabled with no permissive policy, which denies the
-- anon and authenticated roles by default. Read access is granted only on the
-- analytics views below, and only for select. Raw and audit tables are never
-- reachable from the browser; ETL runs with the service role, server-side.
-- ============================================================================

alter table raw.bqk_data                enable row level security;
alter table raw.atk_turnover            enable row level security;
alter table audit.data_sources          enable row level security;
alter table audit.etl_runs              enable row level security;
alter table audit.data_quality_checks   enable row level security;
alter table core.dim_date               enable row level security;
alter table core.dim_geography          enable row level security;
alter table core.dim_sector             enable row level security;
alter table core.dim_channel            enable row level security;
alter table core.dim_card_type          enable row level security;
alter table core.dim_scheme             enable row level security;
alter table core.dim_metric_definition  enable row level security;
alter table core.fact_bqk_pos           enable row level security;
alter table core.fact_bqk_atm           enable row level security;
alter table core.fact_bqk_cards         enable row level security;
alter table core.fact_bqk_digital_payments enable row level security;
alter table core.fact_bqk_geo_annual    enable row level security;
alter table core.fact_atk_turnover      enable row level security;

revoke all on all tables in schema raw   from anon, authenticated;
revoke all on all tables in schema core  from anon, authenticated;
revoke all on all tables in schema audit from anon, authenticated;

-- The dashboard reads analytics only, and only select. Grants for the views
-- themselves are issued in 002_views.sql once the views exist.
grant usage on schema analytics to anon, authenticated;
