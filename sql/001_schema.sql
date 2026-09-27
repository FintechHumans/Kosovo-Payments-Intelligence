-- ============================================================================
-- Kosovo Merchant & Payments Intelligence — Phase 1 schema (v2)
--
-- Five schemas, strictly separated:
--   raw       parsed source records, kept close to the publication
--   core      dimensions and curated facts
--   analytics validated analytical views
--   api       the only surface the browser may read
--   audit     source versions, ETL runs, checks, KPI registry and status
--
-- Three corrections over v1, each a real modelling defect rather than a
-- cosmetic change:
--
--   1. STOCK AND FLOW ARE SEPARATED. v1 carried pos_terminals (a stock) in the
--      same row as transaction_count and transaction_value (flows). That makes
--      it possible to sum a stock across months, which is meaningless. They
--      are now distinct fact tables and can only be combined deliberately.
--
--   2. CITY IS NOT MUNICIPALITY. BQK publishes a POS distribution across seven
--      *cities*; ATK publishes turnover for 38 *municipalities*. The Prishtinë
--      municipality contains settlements outside Prishtinë city, so dividing
--      one by the other mixes grains. dim_geography now records the level, and
--      any KPI crossing levels is marked in audit.kpi_build_status rather than
--      being silently computed.
--
--   3. TAXPAYERS ARE NOT BUSINESSES. ATK publishes "Numri i Tatimpaguesve" —
--      registered taxpayers filing in that month, which includes entities that
--      are not card-accepting businesses. fact_atk_turnover carries an
--      entity_type so the denominator is never mislabelled.
--
-- Money uses numeric, never float.
-- ============================================================================

create schema if not exists raw;
create schema if not exists core;
create schema if not exists analytics;
create schema if not exists api;
create schema if not exists audit;

-- ============================================================================
-- AUDIT — provenance first
-- ============================================================================

create table if not exists audit.data_sources (
    source_id         text primary key,
    -- KBA is the banking association. Unlike the other four it publishes no
    -- file this project downloads; its figures arrive as an aggregate extract,
    -- which is why source_versions below tolerates a null hash.
    institution       text not null check (institution in ('BQK','ATK','ASK','ECB','KBA')),
    dataset_name      text not null,
    official_title    text,
    source_url        text not null,
    source_language   text,
    frequency         text not null check (frequency in ('monthly','quarterly','annual','periodic')),
    methodology_notes text,
    is_active         boolean not null default true
);

-- Every physical file, hashed. A publisher replacing a file at the same URL is
-- detected rather than silently absorbed.
create table if not exists audit.source_versions (
    source_version_id    bigserial primary key,
    source_id            text not null references audit.data_sources(source_id),
    original_filename    text,
    source_url           text,
    source_table         text,
    source_sheet         text,
    publication_date     date,
    reporting_start_date date,
    reporting_end_date   date,
    downloaded_at        timestamptz,
    file_size            bigint,
    sha256_hash          text,
    parser_version       text not null,
    supersedes_version_id bigint references audit.source_versions(source_version_id),
    revision_detected    boolean not null default false,
    is_current           boolean not null default true,
    unique (source_id, sha256_hash, parser_version)
);

create index if not exists ix_sv_current on audit.source_versions (source_id, is_current);

comment on table audit.source_versions is
    'Answers "which exact file produced this KPI?". A new hash for a period '
    'already loaded sets revision_detected and supersedes the previous row; '
    'the old row is retained, never deleted.';

create table if not exists audit.etl_runs (
    run_id            bigserial primary key,
    source_version_id bigint references audit.source_versions(source_version_id),
    started_at        timestamptz not null default now(),
    completed_at      timestamptz,
    status            text not null default 'running'
                      check (status in ('running','succeeded','failed','partial')),
    records_extracted integer default 0,
    records_inserted  integer default 0,
    records_updated   integer default 0,
    records_rejected  integer default 0,
    error_message     text
);

create table if not exists audit.data_quality_checks (
    check_id          bigserial primary key,
    run_id            bigint references audit.etl_runs(run_id) on delete cascade,
    source_version_id bigint references audit.source_versions(source_version_id),
    check_type        text not null,
    check_group       text,
    severity          text not null check (severity in ('info','warning','high')),
    table_name        text,
    reporting_period  text,
    record_reference  text,
    expected_value    text,
    actual_value      text,
    variance          numeric,
    variance_percent  numeric,
    tolerance         numeric,
    status            text not null check (status in ('passed','failed')),
    message           text,
    checked_at        timestamptz not null default now()
);

create index if not exists ix_dq on audit.data_quality_checks (status, severity, check_group);

-- Cross-source reconciliation is its own record, because a difference between
-- two official series is usually methodology rather than error.
create table if not exists audit.source_reconciliation (
    reconciliation_id bigserial primary key,
    metric            text not null,
    definition_a      integer,
    definition_b      integer,
    reporting_period  text,
    value_a           numeric,
    value_b           numeric,
    abs_difference    numeric,
    pct_difference    numeric,
    classification    text not null check (classification in
        ('MATCH','IMMATERIAL_DIFFERENCE','METHODOLOGY_DIFFERENCE','REVISION',
         'NOT_COMPARABLE','UNEXPLAINED')),
    note              text
);

-- Does this series support a year-on-year comparison at all?
create table if not exists audit.series_coverage (
    coverage_id           bigserial primary key,
    metric                text not null,
    definition_id         integer,
    first_period          text,
    last_period           text,
    expected_observations integer,
    actual_observations   integer,
    missing_observations  integer,
    coverage_percentage   numeric,
    continuity_status     text check (continuity_status in
        ('CONTINUOUS','GAPS','BROKEN','INSUFFICIENT_FOR_YOY'))
);

-- Whether a KPI may be shown at all, and why not when it may not.
create table if not exists audit.kpi_build_status (
    kpi_id          text primary key,
    status          text not null check (status in ('PASS','WARNING','FAIL','BLOCKED')),
    reason          text,
    required_input  text,
    last_checked_at timestamptz not null default now()
);

-- ============================================================================
-- RAW
-- ============================================================================

create table if not exists raw.bqk_records (
    raw_id            bigserial primary key,
    source_version_id bigint not null references audit.source_versions(source_version_id),
    run_id            bigint references audit.etl_runs(run_id),
    source_table      text,
    source_sheet      text,
    source_row        integer,
    reporting_date    date not null,
    geography_raw     text,
    metric_raw        text not null,
    dimension_1       text,
    dimension_2       text,
    dimension_3       text,
    raw_value         numeric,
    raw_unit          text,
    loaded_at         timestamptz not null default now()
);

create table if not exists raw.atk_turnover (
    raw_id             bigserial primary key,
    source_version_id  bigint not null references audit.source_versions(source_version_id),
    run_id             bigint references audit.etl_runs(run_id),
    year               integer not null,
    month              integer not null check (month between 1 and 12),
    municipality_raw   text,
    sector_raw         text,
    status_raw         text,
    business_count_raw numeric,
    turnover_raw       numeric,
    loaded_at          timestamptz not null default now()
);

create index if not exists ix_raw_atk on raw.atk_turnover (year, month);

-- ============================================================================
-- CORE — dimensions
-- ============================================================================

create table if not exists core.dim_date (
    date_id      integer primary key,          -- yyyymm
    period_start date not null,
    period_end   date not null,
    year         integer not null,
    quarter      integer not null,
    month        integer not null,
    year_month   text not null unique,
    month_name   text not null
);
-- No stored YTD flag: year-to-date is a property of a query, not of a month.

create table if not exists core.dim_geography (
    geography_id      serial primary key,
    geography_name    text not null,
    geography_level   text not null check (geography_level in
        ('NATIONAL','REGION','MUNICIPALITY','CITY','OTHER')),
    municipality_code text,
    region            text,
    standardized_name text not null,
    bqk_name          text,
    atk_name          text,
    match_method      text,
    match_confidence  text check (match_confidence in ('exact','reviewed','fuzzy','none')),
    review_status     text check (review_status in ('accepted','needs_review','rejected')),
    unique (standardized_name, geography_level)
);

comment on column core.dim_geography.geography_level is
    'CITY and MUNICIPALITY are different grains and are stored as different '
    'rows. A join across them is a documented approximation, never implicit.';

create table if not exists core.dim_sector (
    sector_id           serial primary key,
    source_system       text not null,
    source_sector_code  text,
    source_sector_name  text not null,
    standardized_sector text not null,
    parent_sector       text,
    addressability_class text not null check (addressability_class in
        ('HIGH','MEDIUM','LOW','REVIEW_REQUIRED')),
    rationale           text,
    confidence          text check (confidence in ('high','medium','low')),
    review_status       text check (review_status in ('accepted','needs_review')),
    mapping_version     text not null,
    effective_from      date,
    effective_to        date,
    unique (source_system, source_sector_name, mapping_version)
);

create table if not exists core.dim_channel (
    channel_id    serial primary key,
    channel_name  text not null unique,
    channel_group text
);

create table if not exists core.dim_card_type (
    card_type_id   serial primary key,
    card_type_name text not null unique
);

create table if not exists core.dim_scheme (
    scheme_id   serial primary key,
    scheme_name text not null unique
);

-- The keystone: which universe a POS number actually describes.
create table if not exists core.dim_metric_definition (
    definition_id       serial primary key,
    metric_key          text not null unique,
    metric_name         text not null,
    official_name       text,
    institution         text not null,
    perspective         text check (perspective in ('ISSUING','ACQUIRING','TERMINAL_LOCATION','NA')),
    universe            text not null,
    card_origin         text check (card_origin in ('DOMESTIC','FOREIGN','ALL','NA')),
    terminal_location   text,
    cards_coverage      text,
    transaction_type    text,
    count_or_value      text check (count_or_value in ('count','value','both','stock')),
    stock_or_flow       text check (stock_or_flow in ('stock','flow')),
    geographic_coverage text,
    frequency           text,
    unit                text,
    is_default          boolean not null default false,
    methodology         text,
    limitations         text
);

-- ============================================================================
-- CORE — facts, stock and flow kept apart
-- ============================================================================

-- Bank-level POS, from the KBA extract.
--
-- It breaks two habits the rest of the schema keeps, and both are deliberate.
-- There is no date_id: the extract carries no period label, and inventing one
-- to satisfy a foreign key would be the exact failure this project refuses.
-- And stock and flow do share this row, because the source publishes them as
-- one column set for one unlabelled span; splitting them would imply the two
-- were observed separately, which is not known. Nothing here is ever summed
-- across periods, because there is only one.
create table if not exists core.fact_bank_pos (
    bank_code         text not null,
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_version_id bigint  not null references audit.source_versions(source_version_id),
    transaction_count numeric,
    transaction_value numeric,
    pos_terminals     numeric,
    -- counted per acquiring bank, so this is acquiring relationships and the
    -- column name says which
    merchant_relations numeric,
    reports           boolean not null default true,
    primary key (bank_code, definition_id)
);

create table if not exists core.fact_pos_terminal_stock (
    date_id            integer not null references core.dim_date(date_id),
    geography_id       integer not null references core.dim_geography(geography_id),
    definition_id      integer not null references core.dim_metric_definition(definition_id),
    source_version_id  bigint  not null references audit.source_versions(source_version_id),
    terminal_count     numeric,
    eftpos_count       numeric,
    virtual_pos_count  numeric,
    merchants_physical numeric,
    merchants_virtual  numeric,
    observation_type   text not null check (observation_type in
        ('MONTH_END','YEAR_END','AVERAGE','ESTIMATED','OTHER')),
    primary key (date_id, geography_id, definition_id, observation_type)
);

create table if not exists core.fact_pos_transactions (
    date_id           integer not null references core.dim_date(date_id),
    geography_id      integer not null references core.dim_geography(geography_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    channel_id        integer not null references core.dim_channel(channel_id),
    source_version_id bigint  not null references audit.source_versions(source_version_id),
    transaction_count numeric,
    transaction_value numeric,
    primary key (date_id, geography_id, definition_id, channel_id)
);

create table if not exists core.fact_card_stock (
    date_id           integer not null references core.dim_date(date_id),
    card_type_id      integer not null references core.dim_card_type(card_type_id),
    scheme_id         integer not null references core.dim_scheme(scheme_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_version_id bigint  not null references audit.source_versions(source_version_id),
    cards_issued      numeric,
    primary key (date_id, card_type_id, scheme_id, definition_id)
);

create table if not exists core.fact_atm_stock (
    date_id           integer not null references core.dim_date(date_id),
    geography_id      integer not null references core.dim_geography(geography_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_version_id bigint  not null references audit.source_versions(source_version_id),
    atm_count         numeric,
    observation_type  text not null default 'MONTH_END',
    primary key (date_id, geography_id, definition_id)
);

create table if not exists core.fact_atm_transactions (
    date_id           integer not null references core.dim_date(date_id),
    geography_id      integer not null references core.dim_geography(geography_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_version_id bigint  not null references audit.source_versions(source_version_id),
    withdrawal_count  numeric,
    withdrawal_value  numeric,
    deposit_count     numeric,
    deposit_value     numeric,
    primary key (date_id, geography_id, definition_id)
);

create table if not exists core.fact_digital_payments (
    date_id           integer not null references core.dim_date(date_id),
    channel_id        integer not null references core.dim_channel(channel_id),
    definition_id     integer not null references core.dim_metric_definition(definition_id),
    source_version_id bigint  not null references audit.source_versions(source_version_id),
    transaction_count numeric,
    transaction_value numeric,
    primary key (date_id, channel_id, definition_id)
);

-- Annual, city grain, derived from a share read off a chart. Separate table so
-- its lower confidence and different grain cannot leak into the monthly series.
create table if not exists core.fact_pos_geo_annual (
    year                      integer not null,
    geography_id              integer not null references core.dim_geography(geography_id),
    source_version_id         bigint  not null references audit.source_versions(source_version_id),
    pos_share_pct             numeric,
    atm_share_pct             numeric,
    pos_terminals_estimated   numeric,
    atm_pos_transaction_count numeric,   -- ATM AND POS combined, per the source
    atm_pos_transaction_value numeric,
    extraction_method         text not null default 'pdf_chart_manual',
    pairing_verified          boolean not null default false,
    primary key (year, geography_id)
);

create table if not exists core.fact_atk_turnover (
    date_id           integer not null references core.dim_date(date_id),
    geography_id      integer not null references core.dim_geography(geography_id),
    sector_id         integer not null references core.dim_sector(sector_id),
    source_version_id bigint  not null references audit.source_versions(source_version_id),
    turnover          numeric,
    entity_count      numeric,
    entity_type       text not null check (entity_type in
        ('TAXPAYER','REGISTERED_BUSINESS','ACTIVE_BUSINESS','REPORTING_BUSINESS','OTHER')),
    business_status   text,
    primary key (date_id, geography_id, sector_id, entity_type)
);

create index if not exists ix_atk_geo    on core.fact_atk_turnover (geography_id, date_id);
create index if not exists ix_atk_sector on core.fact_atk_turnover (sector_id, date_id);
create index if not exists ix_pos_tx_def on core.fact_pos_transactions (definition_id, date_id);
create index if not exists ix_pos_st_def on core.fact_pos_terminal_stock (definition_id, date_id);

-- ============================================================================
-- ANALYTICS — one authoritative formula per KPI
-- ============================================================================

create table if not exists analytics.kpi_registry (
    kpi_id                  text primary key,
    display_name            text not null,
    business_definition     text not null,
    sql_formula             text not null,
    numerator               text,
    denominator             text,
    required_definition     text,
    frequency               text,
    aggregation_rule        text,
    valid_comparison_method text,
    source_requirements     text,
    known_limitations       text
);

-- ============================================================================
-- SECURITY
--
-- Only the api schema is reachable from the browser. raw, core and audit are
-- revoked outright; analytics is internal. RLS is enabled everywhere so that
-- no future grant accidentally opens a table, and no write policy exists for
-- any client role — ETL runs server-side under the service role.
-- ============================================================================

do $$
declare t record;
begin
  for t in
    select schemaname, tablename from pg_tables
    where schemaname in ('raw','core','audit','analytics')
  loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end $$;

revoke all on all tables in schema raw       from anon, authenticated;
revoke all on all tables in schema core      from anon, authenticated;
revoke all on all tables in schema audit     from anon, authenticated;
revoke all on all tables in schema analytics from anon, authenticated;
revoke usage on schema raw, core, audit from anon, authenticated;

grant usage on schema api to anon, authenticated;
