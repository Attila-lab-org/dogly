-- Behavioral Knowledge Score V2.
-- It measures behavioral evidence richness; digestive events are intentionally excluded.

with usable as (
  select
    e.dog_id,
    e.id,
    e.created_at,
    e.observation_json,
    c.context_bucket,
    c.has_audio
  from public.behavior_events e
  join public.behavior_captures c on c.id = e.capture_id
  where e.status = 'COMPLETED'
    and e.primary_intent is not null
    and e.primary_intent not in ('AMBIGUOUS', 'INSUFFICIENT')
    and e.observation_json is not null
),
event_stats as (
  select
    d.id as dog_id,
    count(u.id)::int as usable_events,
    count(distinct u.context_bucket) filter (
      where u.context_bucket is not null and u.context_bucket <> 'UNKNOWN'
    )::int as context_count,
    count(distinct u.created_at::date)::int as active_days,
    coalesce(avg(
      case
        when u.observation_json #>> '{capture_quality,overall_quality}' = 'good'
          and (
            not u.has_audio
            or u.observation_json #>> '{capture_quality,audio_quality}' = 'good'
          ) then 1.0
        when u.observation_json #>> '{capture_quality,overall_quality}' = 'good'
          then 0.75
        when u.id is not null then 0.5
        else 0
      end
    ) filter (where u.id is not null), 0)::float as modality_quality
  from public.dogs d
  left join usable u on u.dog_id = d.id
  group by d.id
),
feedback_stats as (
  select
    d.id as dog_id,
    count(f.event_id) filter (where f.value in ('YES', 'NO'))::int
      as decisive_feedback
  from public.dogs d
  left join usable u on u.dog_id = d.id
  left join public.behavior_feedback f on f.event_id = u.id
  group by d.id
),
pattern_stats as (
  select
    d.id as dog_id,
    coalesce(sum(p.support_count), 0)::int as support,
    coalesce(sum(p.contradict_count), 0)::int as contradictions
  from public.dogs d
  left join public.personal_patterns p on p.dog_id = d.id
  group by d.id
),
components as (
  select
    e.dog_id,
    least(e.usable_events / 20.0, 1.0) * 0.25 as usable_volume,
    least(e.context_count / 6.0, 1.0) * 0.20 as context_diversity,
    least(e.active_days / 12.0, 1.0) * 0.15 as temporal_diversity,
    e.modality_quality * 0.15 as modality_quality,
    (
      case
        when p.support = 0 then 0
        else greatest(p.support - p.contradictions, 0)::float / p.support
      end
      * least(p.support / 8.0, 1.0)
      * 0.15
    ) as pattern_consistency,
    least(f.decisive_feedback / 10.0, 1.0) * 0.10 as owner_validation
  from event_stats e
  join feedback_stats f using (dog_id)
  join pattern_stats p using (dog_id)
)
insert into public.knowledge_scores (dog_id, score, components, version)
select
  dog_id,
  round(least(
    usable_volume
    + context_diversity
    + temporal_diversity
    + modality_quality
    + pattern_consistency
    + owner_validation,
    1.0
  )::numeric, 3),
  jsonb_build_object(
    'usable_volume', round(usable_volume::numeric, 3),
    'context_diversity', round(context_diversity::numeric, 3),
    'temporal_diversity', round(temporal_diversity::numeric, 3),
    'modality_quality', round(modality_quality::numeric, 3),
    'pattern_consistency', round(pattern_consistency::numeric, 3),
    'owner_validation', round(owner_validation::numeric, 3)
  ),
  'behavior-knowledge/v2'
from components;

insert into internal.audit_log (
  actor_type,
  actor_id,
  action,
  entity,
  metadata
)
values (
  'SYSTEM',
  'migration:20260918164500',
  'BEHAVIOR_KNOWLEDGE_SCORE_V2_RECALCULATED',
  'knowledge_scores',
  jsonb_build_object(
    'dogs', (
      select count(distinct dog_id)
      from public.knowledge_scores
      where version = 'behavior-knowledge/v2'
    )
  )
);
