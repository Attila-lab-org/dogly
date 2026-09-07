-- Replay/audit anchors for the knowledge and deterministic advice decision.

alter table public.behavior_events
  add column knowledge_version text,
  add column knowledge_card_ids text[] not null default '{}'::text[],
  add column advice_code text,
  add column advice_json jsonb;

alter table public.behavior_events
  add constraint behavior_events_advice_code_format
  check (advice_code is null or advice_code ~ '^ADVICE_[A-Z0-9_]+$');

comment on column public.behavior_events.knowledge_card_ids is
  'Bounded scientific card IDs used for this interpretation; no full papers.';
comment on column public.behavior_events.advice_json is
  'Deterministic closed-catalog AdviceItem selected after interpretation.';
