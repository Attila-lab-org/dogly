-- Restore the dedicated intelligence audit stores from the serving snapshots.
-- Runtime writes are handled by the backend; this migration repairs history.

insert into internal.behavior_observations (
  event_id,
  schema_version,
  observation_json,
  observer_provider,
  observer_model,
  observer_version,
  media_quality
)
select
  e.id,
  coalesce(e.observation_json ->> 'schema_version', 'observation.v0'),
  e.observation_json,
  coalesce(e.observation_json #>> '{observer_meta,provider}', 'legacy'),
  coalesce(e.observation_json #>> '{observer_meta,model}', 'legacy'),
  e.observation_json #>> '{observer_meta,version}',
  e.observation_json -> 'capture_quality'
from public.behavior_events e
where e.observation_json is not null
on conflict (event_id) do nothing;

insert into internal.behavior_interpretations (
  event_id,
  schema_version,
  interpretation_json,
  reasoner_provider,
  reasoner_model,
  reasoner_version,
  alternatives,
  evidence,
  contradictions
)
select
  e.id,
  coalesce(e.interpretation_json ->> 'schema_version', 'interpretation.v0'),
  e.interpretation_json,
  'legacy',
  'legacy',
  coalesce(e.interpretation_json ->> 'policy_version', e.policy_version),
  coalesce(e.interpretation_json -> 'alternatives', '[]'::jsonb),
  coalesce(e.interpretation_json -> 'evidence', '[]'::jsonb),
  coalesce(e.interpretation_json -> 'contradictions', '[]'::jsonb)
from public.behavior_events e
where e.interpretation_json is not null
on conflict (event_id) do nothing;

insert into internal.digestive_observations (
  fecal_event_id,
  provider,
  model,
  version,
  schema_version,
  observation_json
)
select
  f.id,
  coalesce(f.observation_json #>> '{meta,provider}', 'legacy'),
  coalesce(f.observation_json #>> '{meta,model}', 'legacy'),
  f.observation_json ->> 'normalizer_version',
  coalesce(f.observation_json ->> 'schema_version', 'stool_observation.v0'),
  f.observation_json
from public.fecal_events f
where f.observation_json is not null
on conflict (fecal_event_id) do nothing;

insert into public.digestive_insights (
  dog_id,
  fecal_event_id,
  summary,
  trend_code,
  safety_flags,
  policy_version
)
select
  f.dog_id,
  f.id,
  f.summary,
  f.intelligence_json ->> 'baseline_comparison',
  coalesce(f.safety_flags, '[]'::jsonb),
  f.intelligence_json ->> 'reasoning_version'
from public.fecal_events f
where f.status = 'COMPLETED'
  and f.intelligence_json is not null
  and f.summary is not null
  and not exists (
    select 1
    from public.digestive_insights i
    where i.fecal_event_id = f.id
  );

insert into internal.audit_log (
  actor_type,
  actor_id,
  action,
  entity,
  metadata
)
values (
  'SYSTEM',
  'migration:20260918163500',
  'INTELLIGENCE_AUDIT_BACKFILLED',
  'intelligence_audit',
  jsonb_build_object(
    'behavior_observations', (
      select count(*) from internal.behavior_observations
    ),
    'behavior_interpretations', (
      select count(*) from internal.behavior_interpretations
    ),
    'digestive_observations', (
      select count(*) from internal.digestive_observations
    ),
    'digestive_insights', (
      select count(*) from public.digestive_insights
    )
  )
);
