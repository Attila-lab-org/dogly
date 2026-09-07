-- 0035_owner_story_ai_cost_domain.sql
-- Meter paid voice transcription independently from behavior/digestive calls.

alter table internal.ai_cost_events
  drop constraint if exists ai_cost_events_domain_check;

alter table internal.ai_cost_events
  add constraint ai_cost_events_domain_check
  check (domain in ('BEHAVIOR', 'DIGESTIVE', 'FOOD_LABEL', 'OWNER_STORY'));
