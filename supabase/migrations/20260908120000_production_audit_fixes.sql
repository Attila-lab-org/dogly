-- Production audit fixes: research column grants, media-keep consent,
-- webhook recency, consent CHECK, food-label orphans, pattern uniqueness.

-- ---------------------------------------------------------------------------
-- behavior_feedback: clients must not set research_eligible
-- ---------------------------------------------------------------------------
revoke insert on public.behavior_feedback from authenticated;
grant insert (
  event_id, user_id, value, correction_label, corrected_context,
  created_at, updated_at
) on public.behavior_feedback to authenticated;

create or replace function public.behavior_feedback_force_research_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.correction_label is null then
    new.research_eligible := false;
  else
    new.research_eligible := coalesce((
      select granted
      from public.user_consents
      where user_id = new.user_id
        and consent_type = 'RESEARCH_TRAINING'
      order by created_at desc, id desc
      limit 1
    ), false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_behavior_feedback_research_eligible on public.behavior_feedback;
create trigger trg_behavior_feedback_research_eligible
  before insert or update on public.behavior_feedback
  for each row
  execute function public.behavior_feedback_force_research_eligible();

revoke all on function public.behavior_feedback_force_research_eligible() from public, anon, authenticated;
grant execute on function public.behavior_feedback_force_research_eligible() to service_role;

-- ---------------------------------------------------------------------------
-- mark_media_kept requires the owner's latest MEDIA_RETENTION consent
-- ---------------------------------------------------------------------------
create or replace function internal.mark_media_kept(
  p_source_table text,
  p_source_id    uuid,
  p_research_opt_in boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_owner uuid;
  v_granted boolean;
begin
  if p_source_table = 'behavior_captures' then
    select user_id into v_owner from public.behavior_captures where id = p_source_id;
  elsif p_source_table = 'fecal_events' then
    select user_id into v_owner from public.fecal_events where id = p_source_id;
  elsif p_source_table = 'food_products' then
    select owner_id into v_owner from public.food_products where id = p_source_id;
  else
    raise exception 'UNKNOWN_SOURCE_TABLE: %', p_source_table using errcode = '22023';
  end if;

  if v_owner is null then
    return;
  end if;

  select granted into v_granted
  from public.user_consents
  where user_id = v_owner
    and consent_type = 'MEDIA_RETENTION'
  order by created_at desc, id desc
  limit 1;

  if coalesce(v_granted, false) is not true then
    raise exception 'MEDIA_KEEP_REQUIRES_CONSENT' using errcode = '42501';
  end if;

  if p_source_table = 'behavior_captures' then
    update public.behavior_captures
    set retention_state = case when p_research_opt_in
                               then 'RESEARCH_OPT_IN' else 'USER_KEPT' end,
        expires_at = null
    where id = p_source_id;
  elsif p_source_table = 'fecal_events' then
    update public.fecal_events
    set retention_state = case when p_research_opt_in
                               then 'RESEARCH_OPT_IN' else 'USER_KEPT' end,
        expires_at = null
    where id = p_source_id;
  else
    update public.food_products
    set label_retention_state = case when p_research_opt_in
                                     then 'RESEARCH_OPT_IN' else 'USER_KEPT' end,
        label_expires_at = null
    where id = p_source_id;
  end if;
end;
$$;

revoke all on function internal.mark_media_kept(text, uuid, boolean) from public, anon, authenticated;
grant execute on function internal.mark_media_kept(text, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Consent CHECK: revoked_at only valid when granted is false
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.user_consents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%revoked_at is not null%'
  loop
    execute format('alter table public.user_consents drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.user_consents
  drop constraint if exists user_consents_revoked_matches_grant;
alter table public.user_consents
  add constraint user_consents_revoked_matches_grant
  check (revoked_at is null or granted = false);

-- ---------------------------------------------------------------------------
-- RevenueCat webhook recency
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists last_webhook_event_at timestamptz;

-- ---------------------------------------------------------------------------
-- Personal Engine: one canonical pattern title per dog
-- ---------------------------------------------------------------------------
create unique index if not exists personal_patterns_dog_title_idx
  on public.personal_patterns (dog_id, title);

-- ---------------------------------------------------------------------------
-- Orphan cleanup must include food-labels and exports
-- ---------------------------------------------------------------------------
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
        select 1 from public.behavior_captures c where c.storage_path = o.name
      )
    )
    or
    (
      o.bucket_id = 'digestive-raw'
      and not exists (
        select 1 from public.fecal_events f where f.image_path = o.name
      )
    )
    or
    (
      o.bucket_id = 'food-labels'
      and not exists (
        select 1 from public.food_products p where p.label_image_path = o.name
      )
    )
    or
    (
      o.bucket_id = 'exports'
      and not exists (
        select 1 from internal.export_jobs e where e.storage_path = o.name
      )
    )
  );

comment on view internal.storage_orphans_due_for_deletion is
  'Storage objects older than two hours with no active database reference.';

grant select on internal.storage_orphans_due_for_deletion to service_role;
revoke all on internal.storage_orphans_due_for_deletion from anon, authenticated;
