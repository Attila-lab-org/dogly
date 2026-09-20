-- Keep the model hypothesis separate from the governed decision and consumer copy.

alter table internal.behavior_interpretations
  add column if not exists governed_interpretation_json jsonb,
  add column if not exists decision_trace jsonb,
  add column if not exists decision_policy_version text,
  add column if not exists consumer_json jsonb;

comment on column internal.behavior_interpretations.interpretation_json is
  'Raw validated reasoner hypothesis before deterministic decision governance.';
comment on column internal.behavior_interpretations.governed_interpretation_json is
  'Final InterpretationContract after safety, grounding and Decision Policy.';
comment on column internal.behavior_interpretations.decision_trace is
  'Auditable support, contradiction, exclusion and confidence-ceiling trace.';
comment on column internal.behavior_interpretations.consumer_json is
  'Owner-facing projection produced after the governed decision.';

update internal.behavior_interpretations i
set governed_interpretation_json = e.interpretation_json,
    decision_trace = e.interpretation_json -> 'decision_audit',
    decision_policy_version = e.interpretation_json #>> '{decision_audit,policy_version}',
    consumer_json = e.interpretation_json -> 'consumer'
from public.behavior_events e
where e.id = i.event_id
  and i.governed_interpretation_json is null;
