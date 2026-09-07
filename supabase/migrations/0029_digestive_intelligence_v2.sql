-- 0029_digestive_intelligence_v2.sql
-- Backward-compatible consumer reasoning result. Raw vision observation stays
-- separate so deterministic safety and future model changes remain auditable.

alter table public.fecal_events
  add column if not exists intelligence_json jsonb;

comment on column public.fecal_events.intelligence_json is
  'Digestive Intelligence consumer result: baseline comparison, deterministic '
  'triage, relevant context and next step. Never a diagnosis.';
