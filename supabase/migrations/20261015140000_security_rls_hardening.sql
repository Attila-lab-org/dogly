-- Security hardening (audit 2026-10-15):
-- 1) game_scores: no client table privileges (writes/reads via API service role).
--    Drop open SELECT USING (true); keep tight policies if grants are re-added.
-- 2) dog_albums / dog_photos INSERT: require real dog (and album) ownership.

-- ---------------------------------------------------------------------------
-- game_scores
-- ---------------------------------------------------------------------------
revoke all on public.game_scores from public, anon, authenticated;
grant all on public.game_scores to service_role;

drop policy if exists game_scores_select_authenticated on public.game_scores;
create policy game_scores_select_own on public.game_scores
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists game_scores_insert_own on public.game_scores;
create policy game_scores_insert_own on public.game_scores
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = game_scores.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- dog_albums / dog_photos INSERT ownership
-- ---------------------------------------------------------------------------
drop policy if exists dog_albums_insert_own on public.dog_albums;
create policy dog_albums_insert_own on public.dog_albums
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.dogs d
      where d.id = dog_albums.dog_id
        and d.owner_id = (select auth.uid())
    )
  );

drop policy if exists dog_photos_insert_own on public.dog_photos;
create policy dog_photos_insert_own on public.dog_photos
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.dogs d
      where d.id = dog_photos.dog_id
        and d.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.dog_albums a
      where a.id = dog_photos.album_id
        and a.dog_id = dog_photos.dog_id
        and a.owner_id = (select auth.uid())
    )
  );
