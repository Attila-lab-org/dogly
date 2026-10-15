-- Gallery media references are server-generated. Authenticated clients may
-- read their own rows, but must not rewrite references that the service signs.
-- The API uses service_role for gallery writes and remains the single place
-- that validates dog, album and storage ownership.
revoke insert, update, delete on public.dog_photos from authenticated;
grant select on public.dog_photos to authenticated;

drop policy if exists dog_photos_insert_own on public.dog_photos;
drop policy if exists dog_photos_update_own on public.dog_photos;

-- Keep Live sessions short-lived even if the browser disappears without
-- calling the close endpoint. Provider transport shutdown still requires the
-- client/provider lifecycle hook, but application turns expire server-side.
alter table public.realtime_sessions
  alter column expires_at set default (now() + interval '15 minutes');
