-- 0019_p0_runtime_persistence.sql
-- P0 runtime persistence columns and privacy/retention helpers.

alter table public.fecal_events
  add column if not exists content_type text not null default 'image/jpeg',
  add column if not exists bytes integer not null default 0 check (bytes >= 0),
  add column if not exists upload_completed boolean not null default false,
  add column if not exists observation_json jsonb,
  add column if not exists summary text,
  add column if not exists safety_flags jsonb not null default '[]'::jsonb,
  add column if not exists quota_committed boolean not null default false,
  add column if not exists quota_refunded boolean not null default false;

comment on column public.fecal_events.content_type is
  'MIME type validated at init (server-enforced).';
comment on column public.fecal_events.upload_completed is
  'True after object_exists validation on complete.';
comment on column public.fecal_events.quota_committed is
  'True after public.commit_usage for this event reference.';
comment on column public.fecal_events.quota_refunded is
  'True after public.refund_usage for this event reference.';

alter table public.food_products
  add column if not exists dog_id uuid references public.dogs (id) on delete cascade,
  add column if not exists client_request_id text,
  add column if not exists content_type text,
  add column if not exists bytes integer not null default 0 check (bytes >= 0);

create unique index if not exists food_products_owner_client_request_uidx
  on public.food_products (owner_id, client_request_id)
  where client_request_id is not null;

create or replace function internal.begin_export(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = internal
as $$
declare
  v_job_id uuid;
begin
  select id
    into v_job_id
  from internal.export_jobs
  where user_id = p_user_id
    and status in ('PENDING', 'RUNNING')
  order by requested_at desc
  limit 1;

  if v_job_id is not null then
    return v_job_id;
  end if;

  insert into internal.export_jobs (user_id, status)
  values (p_user_id, 'PENDING')
  returning id into v_job_id;

  return v_job_id;
end;
$$;

create or replace function internal.arm_media_expiry(
  p_source_table text,
  p_source_id uuid,
  p_asset_class text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_expires_at timestamptz;
begin
  v_expires_at := internal.media_expiry_at(p_asset_class);

  if p_source_table = 'behavior_captures' then
    update public.behavior_captures
    set expires_at = v_expires_at
    where id = p_source_id
      and retention_state = 'TEMPORARY';
  elsif p_source_table = 'fecal_events' then
    update public.fecal_events
    set expires_at = v_expires_at
    where id = p_source_id
      and retention_state = 'TEMPORARY';
  elsif p_source_table = 'food_products' then
    update public.food_products
    set label_expires_at = v_expires_at
    where id = p_source_id
      and label_retention_state = 'TEMPORARY';
  else
    raise exception 'UNKNOWN_SOURCE_TABLE: %', p_source_table using errcode = '22023';
  end if;

  return v_expires_at;
end;
$$;

create or replace function internal.collect_user_storage_paths(p_user_id uuid)
returns table(bucket text, object_path text)
language sql
stable
security definer
set search_path = public, internal
as $$
  select 'behavior-raw'::text, c.storage_path
  from public.behavior_captures c
  where c.user_id = p_user_id and c.storage_path is not null
  union all
  select 'digestive-raw'::text, f.image_path
  from public.fecal_events f
  where f.user_id = p_user_id and f.image_path is not null
  union all
  select 'food-labels'::text, p.label_image_path
  from public.food_products p
  where p.owner_id = p_user_id and p.label_image_path is not null
  union all
  select 'dog-gallery'::text, gp.storage_path
  from public.dog_photos gp
  where gp.owner_id = p_user_id and gp.storage_path is not null
  union all
  select 'dog-avatars'::text, d.photo_path
  from public.dogs d
  where d.owner_id = p_user_id and d.photo_path is not null
  union all
  select 'exports'::text, e.storage_path
  from internal.export_jobs e
  where e.user_id = p_user_id and e.storage_path is not null;
$$;

revoke all on function internal.begin_export(uuid) from public, anon, authenticated;
revoke all on function internal.arm_media_expiry(text, uuid, text) from public, anon, authenticated;
revoke all on function internal.collect_user_storage_paths(uuid) from public, anon, authenticated;
grant execute on function internal.begin_export(uuid) to service_role;
grant execute on function internal.arm_media_expiry(text, uuid, text) to service_role;
grant execute on function internal.collect_user_storage_paths(uuid) to service_role;
