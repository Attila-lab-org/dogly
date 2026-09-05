-- 0013_dog_gallery_visibility.sql
-- Dogly UX V1: private photo albums + opt-in dog profile visibility.
-- Separate from AI raw media (behavior-raw / digestive-raw): gallery assets
-- persist until the owner deletes them. Default visibility is PRIVATE.

-- ---------------------------------------------------------------------------
-- public.dog_profile_visibility — opt-in public profile (private by default)
-- ---------------------------------------------------------------------------
create table public.dog_profile_visibility (
  dog_id              uuid primary key references public.dogs (id) on delete cascade,
  visibility          text not null default 'PRIVATE'
                      check (visibility in ('PRIVATE', 'PUBLIC')),
  consent_version     text,                 -- required when PUBLIC
  consented_at        timestamptz,
  revoked_at          timestamptz,
  public_slug         text unique,          -- sanitized handle; never a storage URL
  whitelist_fields    text[] not null default '{name,breed_label,age_stage,size}',
  updated_at          timestamptz not null default now(),
  check (
    (visibility = 'PRIVATE')
    or (visibility = 'PUBLIC' and consent_version is not null and consented_at is not null)
  )
);

comment on table public.dog_profile_visibility is
  'Owner opt-in public profile. Private by default; PUBLIC requires versioned consent.';

alter table public.dog_profile_visibility enable row level security;
alter table public.dog_profile_visibility force row level security;

create policy dog_profile_visibility_select_own on public.dog_profile_visibility
  for select to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = auth.uid()
    )
  );

create policy dog_profile_visibility_insert_own on public.dog_profile_visibility
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = auth.uid()
    )
  );

create policy dog_profile_visibility_update_own on public.dog_profile_visibility
  for update to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = auth.uid()
    )
  );

grant select, insert, update on public.dog_profile_visibility to authenticated;
grant all on public.dog_profile_visibility to service_role;

-- ---------------------------------------------------------------------------
-- public.dog_albums / public.dog_photos — private gallery (owner-only)
-- ---------------------------------------------------------------------------
create table public.dog_albums (
  id                   uuid primary key default gen_random_uuid(),
  dog_id               uuid not null references public.dogs (id) on delete cascade,
  owner_id             uuid not null references auth.users (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 80),
  cover_photo_id       uuid,                 -- FK added after dog_photos exists
  default_visibility   text not null default 'PRIVATE'
                       check (default_visibility in ('PRIVATE', 'PUBLISHED')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index dog_albums_dog_idx on public.dog_albums (dog_id, created_at desc);
create index dog_albums_owner_idx on public.dog_albums (owner_id);

create table public.dog_photos (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references public.dog_albums (id) on delete cascade,
  dog_id        uuid not null references public.dogs (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  storage_path  text not null,               -- dog-gallery private bucket path
  caption       text check (caption is null or char_length(caption) <= 280),
  visibility    text not null default 'PRIVATE'
                check (visibility in ('PRIVATE', 'PUBLISHED')),
  taken_at      timestamptz,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index dog_photos_album_idx on public.dog_photos (album_id, created_at desc)
  where deleted_at is null;
create index dog_photos_dog_idx on public.dog_photos (dog_id, created_at desc)
  where deleted_at is null;
create index dog_photos_owner_idx on public.dog_photos (owner_id);

alter table public.dog_albums
  add constraint dog_albums_cover_fk
  foreign key (cover_photo_id) references public.dog_photos (id)
  on delete set null;

comment on table public.dog_albums is
  'User-curated albums. Private by default; never auto-populated from AI raw media.';
comment on table public.dog_photos is
  'Gallery photos in private bucket dog-gallery. Persist until owner deletes.';

alter table public.dog_albums enable row level security;
alter table public.dog_albums force row level security;
alter table public.dog_photos enable row level security;
alter table public.dog_photos force row level security;

create policy dog_albums_select_own on public.dog_albums
  for select to authenticated using (owner_id = auth.uid());
create policy dog_albums_insert_own on public.dog_albums
  for insert to authenticated with check (owner_id = auth.uid());
create policy dog_albums_update_own on public.dog_albums
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy dog_albums_delete_own on public.dog_albums
  for delete to authenticated using (owner_id = auth.uid());

create policy dog_photos_select_own on public.dog_photos
  for select to authenticated using (owner_id = auth.uid() and deleted_at is null);
create policy dog_photos_insert_own on public.dog_photos
  for insert to authenticated with check (owner_id = auth.uid());
create policy dog_photos_update_own on public.dog_photos
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Soft-delete via update; hard delete reserved for service_role purge jobs.
grant select, insert, update, delete on public.dog_albums to authenticated;
grant select, insert, update on public.dog_photos to authenticated;
grant all on public.dog_albums, public.dog_photos to service_role;

-- ---------------------------------------------------------------------------
-- storage: private bucket dog-gallery
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('dog-gallery', 'dog-gallery', false)
on conflict (id) do update set public = excluded.public;

-- Path shape: users/{uid}/dogs/{dog_id}/gallery/{album_id}/{uuid}.{ext}
create or replace function public.is_gallery_path(object_name text)
returns boolean
language sql
immutable
as $$
  select (storage.foldername(object_name))[1] = 'users'
     and nullif((storage.foldername(object_name))[2], '') is not null
     and (storage.foldername(object_name))[3] = 'dogs'
     and nullif((storage.foldername(object_name))[4], '') is not null
     and (storage.foldername(object_name))[5] = 'gallery'
     and nullif((storage.foldername(object_name))[6], '') is not null
     and cardinality(storage.foldername(object_name)) = 6;
$$;

create policy dog_gallery_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = auth.uid()
  );

create policy dog_gallery_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = auth.uid()
    and public.is_gallery_path(name)
  );

create policy dog_gallery_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = auth.uid()
  )
  with check (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = auth.uid()
  );

create policy dog_gallery_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dog-gallery'
    and public.storage_object_owner(name) = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Consent type for public profile (append-only history)
-- ---------------------------------------------------------------------------
alter table public.user_consents
  drop constraint if exists user_consents_consent_type_check;

alter table public.user_consents
  add constraint user_consents_consent_type_check
  check (consent_type in (
    'SERVICE_TERMS',
    'RESEARCH_TRAINING',
    'NOTIFICATIONS',
    'MEDIA_RETENTION',
    'PUBLIC_PROFILE'
  ));
