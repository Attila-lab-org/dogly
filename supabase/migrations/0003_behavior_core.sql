-- 0003_behavior_core.sql
-- Scope (Spec V1 §11): captures, events, observations, interpretations.
-- Acceptance: unique client_request_id; required indexes.
--
-- Canonical event statuses are text + CHECK (never Postgres ENUM, Spec §11.1) using the
-- values of Spec §33.1. AI taxonomy fields stay plain text; valid codes are maintained in
-- the versioned reference tables seeded by 0011_seed_taxonomy_policy.sql.

-- ---------------------------------------------------------------------------
-- public.behavior_captures — upload reservation + media metadata (Spec §10.2)
-- ---------------------------------------------------------------------------
create table public.behavior_captures (
  id                uuid primary key default gen_random_uuid(),
  dog_id            uuid not null references public.dogs (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  client_request_id text not null,          -- idempotency: repeated init returns same capture
  storage_path      text,                   -- server-generated path in bucket behavior-raw
  duration_ms       integer check (duration_ms is null or duration_ms between 0 and 20000),
  has_audio         boolean,
  bytes             bigint check (bytes is null or bytes >= 0),
  retention_state   text not null default 'TEMPORARY'
                    check (retention_state in
                      ('TEMPORARY', 'USER_KEPT', 'RESEARCH_OPT_IN', 'DELETE_PENDING', 'DELETED')),
  expires_at        timestamptz,            -- raw media TTL (Spec §23.2); null until policy assigns
  created_at        timestamptz not null default now(),
  unique (user_id, client_request_id)
);

comment on table public.behavior_captures is
  'One row per capture reservation. Hard cap 20s video (Spec §13). Raw media is TTL-bound.';

create index behavior_captures_user_idx on public.behavior_captures (user_id, created_at desc);
create index behavior_captures_dog_idx on public.behavior_captures (dog_id, created_at desc);

alter table public.behavior_captures enable row level security;
alter table public.behavior_captures force row level security;

-- Mobile read: own. Writes happen exclusively through the API (init/complete endpoints).
create policy behavior_captures_select_own on public.behavior_captures
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.behavior_captures to authenticated;
grant all on public.behavior_captures to service_role;

-- ---------------------------------------------------------------------------
-- public.behavior_events — canonical analysis event (Spec §10.2, §7.2)
-- ---------------------------------------------------------------------------
create table public.behavior_events (
  id                     uuid primary key default gen_random_uuid(),
  capture_id             uuid not null unique references public.behavior_captures (id) on delete cascade,
  dog_id                 uuid not null references public.dogs (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,
  status                 text not null default 'DRAFT'
                         check (status in (
                           'DRAFT', 'UPLOADING', 'QUEUED', 'OBSERVING', 'INTERPRETING',
                           'COMPLETED', 'REJECTED_QUALITY', 'FAILED_RETRYABLE',
                           'FAILED_TERMINAL', 'CANCELLED')),
  primary_intent         text,        -- closed taxonomy code (Spec §16.2); null if INSUFFICIENT
  confidence_band        text check (confidence_band in ('LOW', 'MEDIUM', 'HIGH')),
  summary                text,        -- consumer-safe, probabilistic wording (§16.1)
  context_bucket         text,        -- V0 context bucket (Spec §33.7); validated server-side
  policy_version         text,
  taxonomy_version       text,
  personal_memory_version text,
  created_at             timestamptz not null default now(),
  completed_at           timestamptz
);

comment on table public.behavior_events is
  'Behavioral analysis state machine (Spec §7.2). AI-derived fields written by worker only.';

-- Required indexes: owner/dog timeline (cursor pagination), status for worker scans.
create index behavior_events_user_timeline_idx on public.behavior_events (user_id, created_at desc);
create index behavior_events_dog_timeline_idx on public.behavior_events (dog_id, created_at desc);
create index behavior_events_status_idx on public.behavior_events (status)
  where status in ('QUEUED', 'OBSERVING', 'INTERPRETING', 'FAILED_RETRYABLE');

alter table public.behavior_events enable row level security;
alter table public.behavior_events force row level security;

-- Spec §12 matrix: mobile read own; NO direct insert/update (worker/API only).
create policy behavior_events_select_own on public.behavior_events
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.behavior_events to authenticated;
grant all on public.behavior_events to service_role;

-- ---------------------------------------------------------------------------
-- internal.behavior_observations — observer output (evidence only, Spec §17.1)
-- ---------------------------------------------------------------------------
create table internal.behavior_observations (
  event_id          uuid primary key references public.behavior_events (id) on delete cascade,
  schema_version    text not null,          -- ObservationContract version (e.g. 'v0')
  observation_json  jsonb not null,         -- objective facts only; no final intent
  observer_provider text not null,
  observer_model    text not null,
  observer_version  text,
  media_quality     jsonb,                  -- quality band + warnings
  token_usage       jsonb,                  -- input/output tokens as reported by provider
  latency_ms        integer check (latency_ms is null or latency_ms >= 0),
  created_at        timestamptz not null default now()
);

comment on table internal.behavior_observations is
  'Observer output: objective structured facts. Evidence only — never final intent (§17.1).';

grant all on internal.behavior_observations to service_role;
revoke all on internal.behavior_observations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- internal.behavior_interpretations — reasoner output (hypothesis only, Spec §17.1)
-- ---------------------------------------------------------------------------
create table internal.behavior_interpretations (
  event_id            uuid primary key references public.behavior_events (id) on delete cascade,
  schema_version      text not null,        -- InterpretationContract version (e.g. 'v0')
  interpretation_json jsonb not null,
  reasoner_provider   text not null,
  reasoner_model      text not null,
  reasoner_version    text,
  alternatives        jsonb not null default '[]',   -- 0–2 alternative intent codes + rationale
  evidence            jsonb not null default '[]',   -- typed by source: observation/context/pattern
  contradictions      jsonb not null default '[]',
  token_usage         jsonb,
  latency_ms          integer check (latency_ms is null or latency_ms >= 0),
  created_at          timestamptz not null default now()
);

comment on table internal.behavior_interpretations is
  'Reasoner output: model prediction / alternatives. Hypothesis only — zero authority over '
  'personal patterns (anti-feedback-loop firewall, Spec §17).';

grant all on internal.behavior_interpretations to service_role;
revoke all on internal.behavior_interpretations from anon, authenticated;
