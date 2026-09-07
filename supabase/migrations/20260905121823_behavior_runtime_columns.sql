-- 0017_behavior_runtime_columns.sql
-- Runtime columns required by FastAPI worker/API that were previously only
-- modeled in-memory. Keeps schema aligned with BehaviorCaptureRec / BehaviorEventRec.

alter table public.behavior_captures
  add column if not exists content_type text not null default 'video/mp4',
  add column if not exists has_audio boolean not null default true,
  add column if not exists upload_completed boolean not null default false,
  add column if not exists context_bucket text;

comment on column public.behavior_captures.content_type is
  'MIME type validated at init (server-enforced).';
comment on column public.behavior_captures.upload_completed is
  'True after object_exists validation on complete.';

alter table public.behavior_events
  add column if not exists attempt_count integer not null default 0
    check (attempt_count >= 0),
  add column if not exists last_error_code text,
  add column if not exists quota_committed boolean not null default false,
  add column if not exists quota_refunded boolean not null default false,
  add column if not exists observation_json jsonb,
  add column if not exists interpretation_json jsonb;

comment on column public.behavior_events.attempt_count is
  'Worker delivery attempts (spec 22 retries).';
comment on column public.behavior_events.quota_committed is
  'True after public.commit_usage for this event reference.';
comment on column public.behavior_events.quota_refunded is
  'True after public.refund_usage for this event reference.';

-- Persistent transport-level idempotency (X-Idempotency-Key)
create table if not exists internal.api_idempotency (
  scope          text primary key,
  status_code    integer not null default 200,
  response_body  jsonb not null,
  payload_hash   text,
  created_at     timestamptz not null default now()
);

grant all on internal.api_idempotency to service_role;
revoke all on internal.api_idempotency from anon, authenticated;
