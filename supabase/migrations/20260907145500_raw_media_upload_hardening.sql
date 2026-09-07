-- Raw AI media is accepted only through server-issued signed upload tokens.
-- Abandoned uploads get a short initial TTL; terminal processing replaces it
-- with the normal retention-policy TTL.

drop policy if exists behavior_raw_select_own on storage.objects;
drop policy if exists behavior_raw_insert_own on storage.objects;
drop policy if exists behavior_raw_update_own on storage.objects;
drop policy if exists behavior_raw_delete_own on storage.objects;
drop policy if exists digestive_raw_select_own on storage.objects;
drop policy if exists digestive_raw_insert_own on storage.objects;
drop policy if exists digestive_raw_update_own on storage.objects;
drop policy if exists digestive_raw_delete_own on storage.objects;

alter table public.behavior_captures
  alter column expires_at set default (now() + interval '2 hours');
alter table public.fecal_events
  alter column expires_at set default (now() + interval '2 hours');

update public.behavior_captures
set expires_at = created_at + interval '2 hours'
where retention_state = 'TEMPORARY'
  and expires_at is null;

update public.fecal_events
set expires_at = created_at + interval '2 hours'
where retention_state = 'TEMPORARY'
  and expires_at is null;

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/quicktime',
  'video/webm'
]::text[]
where id = 'behavior-raw';

create or replace view internal.storage_orphans_due_for_deletion as
select
  o.bucket_id::text as bucket,
  o.name::text as object_path,
  o.id as source_id,
  'orphan_object'::text as source_table,
  null::uuid as user_id
from storage.objects o
where o.created_at < now() - interval '2 hours'
  and (
    (
      o.bucket_id = 'dog-avatars'
      and not exists (
        select 1 from public.dogs d where d.photo_path = o.name
      )
    )
    or
    (
      o.bucket_id = 'dog-gallery'
      and not exists (
        select 1
        from public.dog_photos p
        where p.storage_path = o.name and p.deleted_at is null
      )
    )
    or
    (
      o.bucket_id = 'behavior-raw'
      and not exists (
        select 1
        from public.behavior_captures c
        where c.storage_path = o.name
      )
    )
    or
    (
      o.bucket_id = 'digestive-raw'
      and not exists (
        select 1
        from public.fecal_events f
        where f.image_path = o.name
      )
    )
  );

comment on view internal.storage_orphans_due_for_deletion is
  'Storage objects older than two hours with no active database reference.';

grant select on internal.storage_orphans_due_for_deletion to service_role;
revoke all on internal.storage_orphans_due_for_deletion from anon, authenticated;
