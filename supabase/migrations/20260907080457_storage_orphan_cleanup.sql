create or replace view internal.storage_orphans_due_for_deletion as
select
  o.bucket_id::text as bucket,
  o.name::text as object_path,
  o.id as source_id,
  'orphan_object'::text as source_table,
  null::uuid as user_id
from storage.objects o
where o.created_at < now() - interval '1 hour'
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
  );

comment on view internal.storage_orphans_due_for_deletion is
  'Avatar and gallery objects older than one hour that have no active database reference.';

grant select on internal.storage_orphans_due_for_deletion to service_role;
revoke all on internal.storage_orphans_due_for_deletion from anon, authenticated;
