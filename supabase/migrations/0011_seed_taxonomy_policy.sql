-- 0011_seed_taxonomy_policy.sql
-- Scope (Spec V1 §11): versioned intent/context/reference values only.
-- Acceptance: no scientific claims hard-coded into DB prose.
--
-- Spec §3.1: all status values and taxonomies live in versioned reference tables and are
-- mirrored to mobile through the API. These tables contain CODES + versions only; all
-- consumer-facing copy is owned by the backend copy layer (deterministic templates), so
-- no scientific/behavioral claim is ever hard-coded into the database.

-- ---------------------------------------------------------------------------
-- public.ref_intents — closed behavioral intent taxonomy (Spec §16.2), versioned
-- ---------------------------------------------------------------------------
create table public.ref_intents (
  code             text not null,
  taxonomy_version text not null,
  sort_order       integer not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (code, taxonomy_version)
);

comment on table public.ref_intents is
  'Closed intent taxonomy codes (Spec §16.2), versioned. Codes only — no scientific prose. '
  'Old versions stay readable so historical events remain interpretable.';

insert into public.ref_intents (code, taxonomy_version, sort_order) values
  ('PLAY_INTERACTION',     'v0', 10),
  ('ATTENTION_REQUEST',    'v0', 20),
  ('OUTSIDE_REQUEST',      'v0', 30),
  ('ALERT_VIGILANCE',      'v0', 40),
  ('DISCOMFORT_AVOIDANCE', 'v0', 50),
  ('FEAR_INSECURITY',      'v0', 60),
  ('HIGH_AROUSAL',         'v0', 70),
  ('FRUSTRATION',          'v0', 80),
  ('RELAX_REST',           'v0', 90),
  ('RESOURCE_TENSION',     'v0', 100),
  ('AMBIGUOUS',            'v0', 110),
  ('INSUFFICIENT',         'v0', 120);

-- ---------------------------------------------------------------------------
-- public.ref_context_buckets — V0 context buckets (Spec §33.7), versioned
-- ---------------------------------------------------------------------------
create table public.ref_context_buckets (
  code             text not null,
  taxonomy_version text not null,
  sort_order       integer not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (code, taxonomy_version)
);

comment on table public.ref_context_buckets is
  'Context bucket codes (Spec §33.7), versioned. Codes only.';

insert into public.ref_context_buckets (code, taxonomy_version, sort_order) values
  ('HOME',       'v0', 10),
  ('OUTDOORS',   'v0', 20),
  ('WALK',       'v0', 30),
  ('PLAY',       'v0', 40),
  ('FEEDING',    'v0', 50),
  ('DOOR_EXIT',  'v0', 60),
  ('REST',       'v0', 70),
  ('STRANGER',   'v0', 80),
  ('OTHER_DOG',  'v0', 90),
  ('VEHICLE',    'v0', 100),
  ('HANDLING',   'v0', 110),
  ('UNKNOWN',    'v0', 120);

-- ---------------------------------------------------------------------------
-- public.ref_status_values — canonical status/policy value registry (Spec §33)
-- Single registry mirrored to mobile through the API; the authoritative enforcement
-- stays in the per-column CHECK constraints (text + CHECK, never ENUM, §11.1).
-- ---------------------------------------------------------------------------
create table public.ref_status_values (
  domain           text not null,   -- e.g. BEHAVIOR_EVENT_STATUS, PATTERN_STATE, ...
  code             text not null,
  taxonomy_version text not null,
  sort_order       integer not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (domain, code, taxonomy_version)
);

comment on table public.ref_status_values is
  'Canonical status/policy value registry (Spec §33), versioned. Mirror for API/mobile; '
  'DB enforcement remains the column CHECK constraints.';

insert into public.ref_status_values (domain, code, taxonomy_version, sort_order) values
  -- §33.1 behavior event status (also used by digestive events)
  ('EVENT_STATUS', 'DRAFT',            'v0', 10),
  ('EVENT_STATUS', 'UPLOADING',        'v0', 20),
  ('EVENT_STATUS', 'QUEUED',           'v0', 30),
  ('EVENT_STATUS', 'OBSERVING',        'v0', 40),
  ('EVENT_STATUS', 'INTERPRETING',     'v0', 50),
  ('EVENT_STATUS', 'COMPLETED',        'v0', 60),
  ('EVENT_STATUS', 'REJECTED_QUALITY', 'v0', 70),
  ('EVENT_STATUS', 'FAILED_RETRYABLE', 'v0', 80),
  ('EVENT_STATUS', 'FAILED_TERMINAL',  'v0', 90),
  ('EVENT_STATUS', 'CANCELLED',        'v0', 100),
  -- §33.2 feedback values
  ('FEEDBACK_VALUE', 'YES',     'v0', 10),
  ('FEEDBACK_VALUE', 'NO',      'v0', 20),
  ('FEEDBACK_VALUE', 'UNKNOWN', 'v0', 30),
  -- §33.3 pattern states
  ('PATTERN_STATE', 'CANDIDATE',   'v0', 10),
  ('PATTERN_STATE', 'PRELIMINARY', 'v0', 20),
  ('PATTERN_STATE', 'ESTABLISHED', 'v0', 30),
  ('PATTERN_STATE', 'STRONG',      'v0', 40),
  ('PATTERN_STATE', 'CONTESTED',   'v0', 50),
  ('PATTERN_STATE', 'DORMANT',     'v0', 60),
  ('PATTERN_STATE', 'ARCHIVED',    'v0', 70),
  -- §33.4 confidence bands
  ('CONFIDENCE_BAND', 'LOW',    'v0', 10),
  ('CONFIDENCE_BAND', 'MEDIUM', 'v0', 20),
  ('CONFIDENCE_BAND', 'HIGH',   'v0', 30),
  -- §33.5 retention states
  ('RETENTION_STATE', 'TEMPORARY',        'v0', 10),
  ('RETENTION_STATE', 'USER_KEPT',        'v0', 20),
  ('RETENTION_STATE', 'RESEARCH_OPT_IN',  'v0', 30),
  ('RETENTION_STATE', 'DELETE_PENDING',   'v0', 40),
  ('RETENTION_STATE', 'DELETED',          'v0', 50),
  -- §33.6 analysis domains
  ('ANALYSIS_DOMAIN', 'BEHAVIOR',   'v0', 10),
  ('ANALYSIS_DOMAIN', 'DIGESTIVE',  'v0', 20),
  ('ANALYSIS_DOMAIN', 'FOOD_LABEL', 'v0', 30);

-- ---------------------------------------------------------------------------
-- Reference tables are world-readable by signed-in users (they power pickers/labels
-- through the API), but writable only by migrations/service role.
-- ---------------------------------------------------------------------------
alter table public.ref_intents enable row level security;
alter table public.ref_intents force row level security;
create policy ref_intents_read on public.ref_intents
  for select to authenticated using (true);

alter table public.ref_context_buckets enable row level security;
alter table public.ref_context_buckets force row level security;
create policy ref_context_buckets_read on public.ref_context_buckets
  for select to authenticated using (true);

alter table public.ref_status_values enable row level security;
alter table public.ref_status_values force row level security;
create policy ref_status_values_read on public.ref_status_values
  for select to authenticated using (true);

grant select on public.ref_intents to authenticated;
grant select on public.ref_context_buckets to authenticated;
grant select on public.ref_status_values to authenticated;
grant all on public.ref_intents to service_role;
grant all on public.ref_context_buckets to service_role;
grant all on public.ref_status_values to service_role;
