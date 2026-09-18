-- Cover ownership/context foreign keys used by intelligence reads and avoid
-- per-row auth.uid() re-evaluation in owner-facing RLS policies.

create index if not exists digestive_observation_cache_dog_idx
  on internal.digestive_observation_cache (dog_id);

create index if not exists digestive_observation_cache_source_event_idx
  on internal.digestive_observation_cache (source_event_id);

create index if not exists behavior_processing_context_user_idx
  on public.behavior_processing_context_answers (user_id);

create index if not exists dog_weight_events_user_idx
  on public.dog_weight_events (user_id);

create index if not exists external_food_lookups_dog_idx
  on public.external_food_lookups (dog_id);

create index if not exists external_food_lookups_food_product_idx
  on public.external_food_lookups (food_product_id);

drop policy if exists behavior_processing_context_select_own
  on public.behavior_processing_context_answers;
create policy behavior_processing_context_select_own
  on public.behavior_processing_context_answers
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists dog_weight_events_select_own
  on public.dog_weight_events;
create policy dog_weight_events_select_own
  on public.dog_weight_events
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists external_food_lookups_select_own
  on public.external_food_lookups;
create policy external_food_lookups_select_own
  on public.external_food_lookups
  for select to authenticated
  using (user_id = (select auth.uid()));
