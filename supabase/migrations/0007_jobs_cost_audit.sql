-- 0007_jobs_cost_audit.sql
-- Scope (Spec V1 §11): analysis jobs, cost events, audit, deletion jobs.
-- Acceptance: internal schema inaccessible to anon/authenticated.
--
-- All tables live in `internal`: no privileges for anon/authenticated, service_role only.
-- 0009_rls_grants.sql re-asserts this fence globally.

-- ---------------------------------------------------------------------------
-- internal.analysis_jobs — async task/queue work tracking (Spec §10.4, §22)
-- ---------------------------------------------------------------------------
create table internal.analysis_jobs (
  id              uuid primary key default gen_random_uuid(),
  job_type        text not null check (job_type in (
                    'BEHAVIOR_ANALYSIS', 'DIGESTIVE_ANALYSIS', 'FOOD_LABEL_OCR',
                    'EXPORT', 'ACCOUNT_DELETION', 'MEDIA_RETENTION_CLEANUP',
                    'KNOWLEDGE_SCORE_RECOMPUTE', 'PATTERN_UPDATE')),
  domain          text check (domain in ('BEHAVIOR', 'DIGESTIVE', 'FOOD_LABEL')),
  event_id        uuid,               -- behavior event / fecal event / food product id
  status          text not null default 'PENDING'
                  check (status in ('PENDING', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED')),
  attempt_count   integer not null default 0 check (attempt_count >= 0),
  last_error_code text,               -- stable error taxonomy code (Spec §22.1)
  queue_name      text,
  task_id         text,               -- task/queue id from the async queue adapter (IDs only, Spec §22)
  scheduled_at    timestamptz not null default now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table internal.analysis_jobs is
  'Async job tracking. Payloads are IDs only: no raw media bytes, no secrets (Spec §22). '
  'Terminal completed state is a no-op on duplicate queue delivery.';

create index analysis_jobs_status_idx on internal.analysis_jobs (status, scheduled_at);
create index analysis_jobs_event_idx on internal.analysis_jobs (event_id);

-- ---------------------------------------------------------------------------
-- internal.ai_cost_events — provider cost telemetry (Spec §10.4, §25.1)
-- Every paid call is traceable to event/user cohort.
-- ---------------------------------------------------------------------------
create table internal.ai_cost_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid,                 -- behavior/digestive event reference
  dog_id        uuid,
  user_id       uuid,
  domain        text not null check (domain in ('BEHAVIOR', 'DIGESTIVE', 'FOOD_LABEL')),
  operation     text not null,        -- OBSERVE / INTERPRET / VISION_OCR / ...
  provider      text not null,
  model         text not null,
  model_version text,
  input_tokens  integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  media_bytes   bigint check (media_bytes is null or media_bytes >= 0),
  media_seconds numeric(8,2) check (media_seconds is null or media_seconds >= 0),
  cost_usd      numeric(12,6) check (cost_usd is null or cost_usd >= 0),
  latency_ms    integer check (latency_ms is null or latency_ms >= 0),
  retry_count   integer not null default 0 check (retry_count >= 0),
  outcome       text check (outcome in
                  ('COMPLETED', 'QUALITY_REJECTED', 'TECHNICAL_FAILED', 'ABSTAINED')),
  created_at    timestamptz not null default now()
);

comment on table internal.ai_cost_events is
  'Per-call provider telemetry: model/version stored per call (Spec §14.2), enabling '
  'cost per completed event, P95 event cost and provider mix dashboards (§25.3).';

create index ai_cost_events_event_idx on internal.ai_cost_events (event_id);
create index ai_cost_events_user_time_idx on internal.ai_cost_events (user_id, created_at desc);
create index ai_cost_events_provider_idx on internal.ai_cost_events (provider, model, created_at desc);

-- ---------------------------------------------------------------------------
-- internal.audit_log — security/ops audit (Spec §10.4, §24.1)
-- No raw media, no full prompts, no secrets (correlation-safe metadata only).
-- ---------------------------------------------------------------------------
create table internal.audit_log (
  id         bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('USER', 'SERVICE', 'SYSTEM', 'WEBHOOK')),
  actor_id   text,                    -- uuid or service identity; text to cover all actors
  action     text not null,           -- e.g. DOG_UPDATED, QUOTA_REFUNDED, ACCOUNT_DELETE_REQUESTED
  entity     text not null,
  entity_id  text,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table internal.audit_log is
  'Append-only audit. Correlation IDs and structural metadata only: never raw media, '
  'prompts, auth material or secrets (Spec §24.1 sensitive logging control).';

create index audit_log_entity_idx on internal.audit_log (entity, entity_id, created_at desc);
create index audit_log_actor_idx on internal.audit_log (actor_type, actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- internal.deletion_jobs — account/media deletion workflow + completion evidence
-- (Spec §10.4, §23.3). Retryable and auditable without retaining deleted raw content.
-- ---------------------------------------------------------------------------
create table internal.deletion_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete set null,
  scope        text not null check (scope in ('ACCOUNT', 'MEDIA', 'PROVIDER_ARTIFACTS')),
  target_path  text,                  -- storage object path for MEDIA scope
  status       text not null default 'PENDING'
               check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error   text,
  evidence     jsonb not null default '{}',  -- completion evidence (counts, not content)
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table internal.deletion_jobs is
  'Deletion workflow: immediate access revocation + asynchronous purge with completion '
  'state (Spec §23.2). Evidence records counts/paths, never deleted content.';

create index deletion_jobs_status_idx on internal.deletion_jobs (status, requested_at);
create index deletion_jobs_user_idx on internal.deletion_jobs (user_id);

-- ---------------------------------------------------------------------------
-- Fence: service_role full access; anon/authenticated nothing (acceptance criterion).
-- ---------------------------------------------------------------------------
grant all on internal.analysis_jobs to service_role;
grant all on internal.ai_cost_events to service_role;
grant all on internal.audit_log to service_role;
grant all on internal.deletion_jobs to service_role;
grant usage, select on all sequences in schema internal to service_role;

revoke all on internal.analysis_jobs from anon, authenticated;
revoke all on internal.ai_cost_events from anon, authenticated;
revoke all on internal.audit_log from anon, authenticated;
revoke all on internal.deletion_jobs from anon, authenticated;
revoke all on all sequences in schema internal from anon, authenticated;
