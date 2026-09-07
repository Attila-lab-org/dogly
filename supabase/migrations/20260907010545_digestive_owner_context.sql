-- 0030_digestive_owner_context.sql
-- Sparse, event-scoped answers to at most one high-value follow-up question.

alter table public.fecal_events
  add column if not exists owner_context_json jsonb not null default '{}'::jsonb;

comment on column public.fecal_events.owner_context_json is
  'User-confirmed event context such as vomiting, reduced activity or unusual food. '
  'Never populated by the vision model.';
