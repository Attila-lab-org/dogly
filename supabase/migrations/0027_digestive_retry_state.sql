-- Persist digestive worker retry state so transient failures terminate.

alter table public.fecal_events
  add column attempt_count integer not null default 0
    check (attempt_count >= 0),
  add column last_error_code text;

comment on column public.fecal_events.attempt_count is
  'Persisted digestive worker attempts; capped by the worker retry policy.';
