-- 0028_rls_fk_searchpath_hardening.sql
-- Hardening segnalato da Supabase Advisor, in tre blocchi:
--   1) RLS: riscrittura di auth.uid() in (select auth.uid()) nelle policy
--      esistenti (forma amica dell'ottimizzatore, raccomandata da Supabase).
--      Ricreazione meccanica 1:1 — nomi, ruoli, comandi e semantica invariati.
--   2) Indici mancanti sulle colonne FK indicate dall'advisor prestazioni.
--   3) search_path fisso (= '') sulle funzioni create senza hardening.
-- Nessuna modifica comportamentale; le policy ricreate sono identiche alle
-- originali (migrazioni 0001-0027) salvo la forma del subselect.

-- ---------------------------------------------------------------------------
-- Blocco 1 — RLS: auth.uid() -> (select auth.uid())
-- ---------------------------------------------------------------------------

-- public.profiles (0002)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()));

-- public.user_consents (0002)
drop policy if exists user_consents_select_own on public.user_consents;
create policy user_consents_select_own on public.user_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_consents_insert_own on public.user_consents;
create policy user_consents_insert_own on public.user_consents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_consents_revoke_own on public.user_consents;
create policy user_consents_revoke_own on public.user_consents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- public.dogs (0002)
drop policy if exists dogs_select_own on public.dogs;
create policy dogs_select_own on public.dogs
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists dogs_insert_own on public.dogs;
create policy dogs_insert_own on public.dogs
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists dogs_update_own on public.dogs;
create policy dogs_update_own on public.dogs
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- public.device_installations (0002)
drop policy if exists device_installations_select_own on public.device_installations;
create policy device_installations_select_own on public.device_installations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists device_installations_insert_own on public.device_installations;
create policy device_installations_insert_own on public.device_installations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists device_installations_update_own on public.device_installations;
create policy device_installations_update_own on public.device_installations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists device_installations_delete_own on public.device_installations;
create policy device_installations_delete_own on public.device_installations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- public.behavior_captures (0003)
drop policy if exists behavior_captures_select_own on public.behavior_captures;
create policy behavior_captures_select_own on public.behavior_captures
  for select to authenticated
  using (user_id = (select auth.uid()));

-- public.behavior_events (0003)
drop policy if exists behavior_events_select_own on public.behavior_events;
create policy behavior_events_select_own on public.behavior_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- public.behavior_feedback (0004)
drop policy if exists behavior_feedback_select_own on public.behavior_feedback;
create policy behavior_feedback_select_own on public.behavior_feedback
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists behavior_feedback_insert_own_event on public.behavior_feedback;
create policy behavior_feedback_insert_own_event on public.behavior_feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.behavior_events e
      where e.id = event_id
        and e.user_id = (select auth.uid())
        and e.status = 'COMPLETED'
    )
  );

drop policy if exists behavior_feedback_update_own on public.behavior_feedback;
create policy behavior_feedback_update_own on public.behavior_feedback
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- public.personal_patterns (0004)
drop policy if exists personal_patterns_select_own on public.personal_patterns;
create policy personal_patterns_select_own on public.personal_patterns
  for select to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = (select auth.uid())
    )
  );

-- public.knowledge_scores (0004)
drop policy if exists knowledge_scores_select_own on public.knowledge_scores;
create policy knowledge_scores_select_own on public.knowledge_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = (select auth.uid())
    )
  );

-- public.fecal_events (0005)
drop policy if exists fecal_events_select_own on public.fecal_events;
create policy fecal_events_select_own on public.fecal_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- public.food_products (0005)
drop policy if exists food_products_select_own on public.food_products;
create policy food_products_select_own on public.food_products
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists food_products_insert_own on public.food_products;
create policy food_products_insert_own on public.food_products
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists food_products_update_own on public.food_products;
create policy food_products_update_own on public.food_products
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists food_products_delete_own on public.food_products;
create policy food_products_delete_own on public.food_products
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- public.feeding_periods (0005)
drop policy if exists feeding_periods_select_own on public.feeding_periods;
create policy feeding_periods_select_own on public.feeding_periods
  for select to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = (select auth.uid()))
  );

drop policy if exists feeding_periods_insert_own on public.feeding_periods;
create policy feeding_periods_insert_own on public.feeding_periods
  for insert to authenticated
  with check (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = (select auth.uid()))
  );

drop policy if exists feeding_periods_update_own on public.feeding_periods;
create policy feeding_periods_update_own on public.feeding_periods
  for update to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = (select auth.uid()))
  );

drop policy if exists feeding_periods_delete_own on public.feeding_periods;
create policy feeding_periods_delete_own on public.feeding_periods
  for delete to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = (select auth.uid()))
  );

-- public.digestive_baselines (0005)
drop policy if exists digestive_baselines_select_own on public.digestive_baselines;
create policy digestive_baselines_select_own on public.digestive_baselines
  for select to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = (select auth.uid()))
  );

-- public.digestive_insights (0005)
drop policy if exists digestive_insights_select_own on public.digestive_insights;
create policy digestive_insights_select_own on public.digestive_insights
  for select to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = (select auth.uid()))
  );

-- public.subscriptions (0006)
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- public.usage_ledgers (0006)
drop policy if exists usage_ledgers_select_own on public.usage_ledgers;
create policy usage_ledgers_select_own on public.usage_ledgers
  for select to authenticated
  using (user_id = (select auth.uid()));

-- storage.objects — behavior-raw (0008)
drop policy if exists behavior_raw_select_own on storage.objects;
create policy behavior_raw_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'behavior-raw' and public.storage_object_owner(name) = (select auth.uid()));

drop policy if exists behavior_raw_insert_own on storage.objects;
create policy behavior_raw_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'behavior-raw'
              and public.storage_object_owner(name) = (select auth.uid())
              and public.is_canonical_media_path(name));

drop policy if exists behavior_raw_update_own on storage.objects;
create policy behavior_raw_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'behavior-raw' and public.storage_object_owner(name) = (select auth.uid()))
  with check (bucket_id = 'behavior-raw'
              and public.storage_object_owner(name) = (select auth.uid())
              and public.is_canonical_media_path(name));

drop policy if exists behavior_raw_delete_own on storage.objects;
create policy behavior_raw_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'behavior-raw' and public.storage_object_owner(name) = (select auth.uid()));

-- storage.objects — digestive-raw (0008)
drop policy if exists digestive_raw_select_own on storage.objects;
create policy digestive_raw_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'digestive-raw' and public.storage_object_owner(name) = (select auth.uid()));

drop policy if exists digestive_raw_insert_own on storage.objects;
create policy digestive_raw_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'digestive-raw'
              and public.storage_object_owner(name) = (select auth.uid())
              and public.is_canonical_media_path(name));

drop policy if exists digestive_raw_update_own on storage.objects;
create policy digestive_raw_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'digestive-raw' and public.storage_object_owner(name) = (select auth.uid()))
  with check (bucket_id = 'digestive-raw'
              and public.storage_object_owner(name) = (select auth.uid())
              and public.is_canonical_media_path(name));

drop policy if exists digestive_raw_delete_own on storage.objects;
create policy digestive_raw_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'digestive-raw' and public.storage_object_owner(name) = (select auth.uid()));

-- storage.objects — food-labels (0008)
drop policy if exists food_labels_select_own on storage.objects;
create policy food_labels_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'food-labels' and public.storage_object_owner(name) = (select auth.uid()));

drop policy if exists food_labels_insert_own on storage.objects;
create policy food_labels_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'food-labels'
              and public.storage_object_owner(name) = (select auth.uid())
              and public.is_canonical_media_path(name));

drop policy if exists food_labels_update_own on storage.objects;
create policy food_labels_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'food-labels' and public.storage_object_owner(name) = (select auth.uid()))
  with check (bucket_id = 'food-labels'
              and public.storage_object_owner(name) = (select auth.uid())
              and public.is_canonical_media_path(name));

drop policy if exists food_labels_delete_own on storage.objects;
create policy food_labels_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'food-labels' and public.storage_object_owner(name) = (select auth.uid()));

-- storage.objects — dog-avatars (0008)
drop policy if exists dog_avatars_select_own on storage.objects;
create policy dog_avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'dog-avatars' and public.storage_object_owner(name) = (select auth.uid()));

drop policy if exists dog_avatars_insert_own on storage.objects;
create policy dog_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dog-avatars'
              and public.storage_object_owner(name) = (select auth.uid())
              and (storage.foldername(name))[3] = 'dogs');

drop policy if exists dog_avatars_update_own on storage.objects;
create policy dog_avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'dog-avatars' and public.storage_object_owner(name) = (select auth.uid()))
  with check (bucket_id = 'dog-avatars'
              and public.storage_object_owner(name) = (select auth.uid())
              and (storage.foldername(name))[3] = 'dogs');

drop policy if exists dog_avatars_delete_own on storage.objects;
create policy dog_avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'dog-avatars' and public.storage_object_owner(name) = (select auth.uid()));

-- storage.objects — exports (0008)
drop policy if exists exports_select_own on storage.objects;
create policy exports_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'exports' and public.storage_object_owner(name) = (select auth.uid()));

-- public.dog_profile_visibility (0013)
drop policy if exists dog_profile_visibility_select_own on public.dog_profile_visibility;
create policy dog_profile_visibility_select_own on public.dog_profile_visibility
  for select to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = (select auth.uid())
    )
  );

drop policy if exists dog_profile_visibility_insert_own on public.dog_profile_visibility;
create policy dog_profile_visibility_insert_own on public.dog_profile_visibility
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = (select auth.uid())
    )
  );

drop policy if exists dog_profile_visibility_update_own on public.dog_profile_visibility;
create policy dog_profile_visibility_update_own on public.dog_profile_visibility
  for update to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = (select auth.uid())
    )
  );

-- public.dog_albums (0013)
drop policy if exists dog_albums_select_own on public.dog_albums;
create policy dog_albums_select_own on public.dog_albums
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists dog_albums_insert_own on public.dog_albums;
create policy dog_albums_insert_own on public.dog_albums
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists dog_albums_update_own on public.dog_albums;
create policy dog_albums_update_own on public.dog_albums
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists dog_albums_delete_own on public.dog_albums;
create policy dog_albums_delete_own on public.dog_albums
  for delete to authenticated using (owner_id = (select auth.uid()));

-- public.dog_photos (0013)
drop policy if exists dog_photos_select_own on public.dog_photos;
create policy dog_photos_select_own on public.dog_photos
  for select to authenticated using (owner_id = (select auth.uid()) and deleted_at is null);
drop policy if exists dog_photos_insert_own on public.dog_photos;
create policy dog_photos_insert_own on public.dog_photos
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists dog_photos_update_own on public.dog_photos;
create policy dog_photos_update_own on public.dog_photos
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- storage.objects — dog-gallery (0013)
drop policy if exists dog_gallery_select_own on storage.objects;
create policy dog_gallery_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = (select auth.uid())
  );

drop policy if exists dog_gallery_insert_own on storage.objects;
create policy dog_gallery_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = (select auth.uid())
    and public.is_gallery_path(name)
  );

drop policy if exists dog_gallery_update_own on storage.objects;
create policy dog_gallery_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = (select auth.uid())
  )
  with check (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = (select auth.uid())
  );

drop policy if exists dog_gallery_delete_own on storage.objects;
create policy dog_gallery_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = (select auth.uid())
  );

-- public.care_events (0014)
drop policy if exists care_events_select_own on public.care_events;
create policy care_events_select_own on public.care_events
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = care_events.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

drop policy if exists care_events_insert_own on public.care_events;
create policy care_events_insert_own on public.care_events
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = care_events.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

drop policy if exists care_events_update_own on public.care_events;
create policy care_events_update_own on public.care_events
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = care_events.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

drop policy if exists care_events_delete_own on public.care_events;
create policy care_events_delete_own on public.care_events
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- public.signal_experiments (0015)
drop policy if exists signal_experiments_select_own on public.signal_experiments;
create policy signal_experiments_select_own on public.signal_experiments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = signal_experiments.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

-- public.signal_map_entries (0015)
drop policy if exists signal_map_entries_select_own on public.signal_map_entries;
create policy signal_map_entries_select_own on public.signal_map_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = signal_map_entries.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

-- public.dog_lifestyle_profiles (0023)
drop policy if exists dog_lifestyle_profiles_select_own on public.dog_lifestyle_profiles;
create policy dog_lifestyle_profiles_select_own
  on public.dog_lifestyle_profiles for select to authenticated
  using (user_id = (select auth.uid()));

-- public.advice_outcomes (0023)
drop policy if exists advice_outcomes_select_own on public.advice_outcomes;
create policy advice_outcomes_select_own
  on public.advice_outcomes for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Blocco 2 — Indici mancanti sulle colonne foreign key
-- ---------------------------------------------------------------------------

create index if not exists behavior_feedback_user_idx
  on public.behavior_feedback (user_id);

create index if not exists feeding_periods_food_product_idx
  on public.feeding_periods (food_product_id);

create index if not exists digestive_insights_fecal_event_idx
  on public.digestive_insights (fecal_event_id);

create index if not exists usage_reservations_ledger_idx
  on internal.usage_reservations (ledger_id);

create index if not exists dog_albums_cover_photo_idx
  on public.dog_albums (cover_photo_id);

create index if not exists food_products_dog_idx
  on public.food_products (dog_id);

-- ---------------------------------------------------------------------------
-- Blocco 3 — search_path fisso sulle funzioni
-- ---------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';
alter function public.storage_object_owner(text) set search_path = '';
alter function public.is_canonical_media_path(text) set search_path = '';
alter function public.is_gallery_path(text) set search_path = '';
