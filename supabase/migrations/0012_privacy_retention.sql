-- 0012_privacy_retention.sql
-- Scope (Spec V1 §11): retention metadata/functions, export/delete support.
-- Acceptance: deletion integration test.
--
-- Spec §23.2 retention architecture:
--   * behavior raw video   — short TTL after COMPLETED unless explicit keep/research consent
--   * digestive raw photo  — short TTL unless product/consent requires visual history
--   * food label image     — delete after verified extraction unless user keeps it
--   * account export       — private artifact with expiry
--   * account deletion     — immediate access revocation + async purge with evidence
-- Retention durations are CONFIG values (open decision O-05), stored in
-- internal.retention_policies and read by the backend/worker — never hard-coded in app code.

-- ---------------------------------------------------------------------------
-- Retention metadata columns (added here per migration scope; tables stay owned by
-- their original migrations — this is additive metadata, not a schema redesign).
-- ---------------------------------------------------------------------------
alter table public.fecal_events
  add column retention_state text not null default 'TEMPORARY'
    check (retention_state in
      ('TEMPORARY', 'USER_KEPT', 'RESEARCH_OPT_IN', 'DELETE_PENDING', 'DELETED')),
  add column expires_at timestamptz;

alter table public.food_products
  add column label_retention_state text not null default 'TEMPORARY'
    check (label_retention_state in
      ('TEMPORARY', 'USER_KEPT', 'RESEARCH_OPT_IN', 'DELETE_PENDING', 'DELETED')),
  add column label_expires_at timestamptz;

create index fecal_events_retention_idx
  on public.fecal_events (expires_at)
  where retention_state in ('TEMPORARY', 'DELETE_PENDING');

create index food_products_label_retention_idx
  on public.food_products (label_expires_at)
  where label_retention_state in ('TEMPORARY', 'DELETE_PENDING')
    and label_image_path is not null;

-- ---------------------------------------------------------------------------
-- internal.retention_policies — configurable TTL per asset class (Spec §23.2, O-05)
-- ---------------------------------------------------------------------------
create table internal.retention_policies (
  asset_class      text primary key
                   check (asset_class in
                     ('BEHAVIOR_RAW', 'DIGESTIVE_RAW', 'FOOD_LABEL', 'EXPORT')),
  ttl              interval not null,          -- applied at terminal completion / creation
  config_version   text not null default 'v0',
  notes            text,
  updated_at       timestamptz not null default now()
);

comment on table internal.retention_policies is
  'Configurable raw-media/export TTLs (open decision O-05). Defaults are beta values; '
  'final durations decided before public V1.';

insert into internal.retention_policies (asset_class, ttl, notes) values
  ('BEHAVIOR_RAW',  interval '24 hours', 'Beta default: delete raw video 24h after completed analysis unless USER_KEPT / RESEARCH_OPT_IN.'),
  ('DIGESTIVE_RAW', interval '24 hours', 'Beta default: short TTL; keep only if product/consent requires visual history.'),
  ('FOOD_LABEL',    interval '1 hour',   'Delete label image after verified extraction unless the user keeps it.'),
  ('EXPORT',        interval '7 days',   'Generated export artifact expiry; user-controlled download window.');

grant all on internal.retention_policies to service_role;
revoke all on internal.retention_policies from anon, authenticated;

-- ---------------------------------------------------------------------------
-- internal.export_jobs — account export workflow (Spec §23.3)
-- Export includes profile, dogs, behavior results/feedback/patterns, digestive events,
-- food/feeding periods, consent history and subscription metadata.
-- ---------------------------------------------------------------------------
create table internal.export_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'PENDING'
               check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED')),
  storage_path text,                  -- object path in private bucket exports
  expires_at   timestamptz,           -- artifact expiry (from retention_policies.EXPORT)
  last_error   text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table internal.export_jobs is
  'User data export workflow. Artifact is a private, expiring object in bucket exports.';

create index export_jobs_user_idx on internal.export_jobs (user_id, requested_at desc);
create index export_jobs_status_idx on internal.export_jobs (status, requested_at);

grant all on internal.export_jobs to service_role;
revoke all on internal.export_jobs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention helper functions (server-only, service_role)
-- ---------------------------------------------------------------------------

-- Assign the expiry timestamp for a capture/event media object according to the
-- configured TTL. Called by the worker at terminal completion (Spec §8.2:
-- "schedule/mark media retention cleanup after terminal completion").
create or replace function internal.media_expiry_at(p_asset_class text)
returns timestamptz
language sql
stable
security definer
set search_path = internal
as $$
  select now() + coalesce(
    (select ttl from internal.retention_policies where asset_class = p_asset_class),
    interval '24 hours');
$$;

-- Media due for deletion: TEMPORARY/DELETE_PENDING objects past expiry.
-- One row per storage object to delete; the retention worker turns each row into a
-- deletion_jobs (MEDIA scope) entry and then marks the source row DELETED.
create or replace view internal.media_due_for_deletion as
  select 'behavior-raw'::text as bucket,
         c.storage_path       as object_path,
         c.id                 as source_id,
         'behavior_captures'::text as source_table,
         c.user_id
  from public.behavior_captures c
  where c.retention_state in ('TEMPORARY', 'DELETE_PENDING')
    and c.expires_at is not null
    and c.expires_at < now()
    and c.storage_path is not null
  union all
  select 'digestive-raw', f.image_path, f.id, 'fecal_events', f.user_id
  from public.fecal_events f
  where f.retention_state in ('TEMPORARY', 'DELETE_PENDING')
    and f.expires_at is not null
    and f.expires_at < now()
    and f.image_path is not null
  union all
  select 'food-labels', p.label_image_path, p.id, 'food_products', p.owner_id
  from public.food_products p
  where p.label_retention_state in ('TEMPORARY', 'DELETE_PENDING')
    and p.label_expires_at is not null
    and p.label_expires_at < now()
    and p.label_image_path is not null
  union all
  select 'exports', e.storage_path, e.id, 'export_jobs', e.user_id
  from internal.export_jobs e
  where e.status = 'COMPLETED'
    and e.expires_at is not null
    and e.expires_at < now()
    and e.storage_path is not null;

comment on view internal.media_due_for_deletion is
  'All raw-media/export objects past their TTL. USER_KEPT and RESEARCH_OPT_IN are never '
  'listed: explicit consent wins over default TTL (Spec §23.2).';

-- Mark a source row's media as deleted after the storage object was purged.
create or replace function internal.mark_media_deleted(
  p_source_table text,
  p_source_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public, internal
as $$
begin
  if p_source_table = 'behavior_captures' then
    update public.behavior_captures
    set retention_state = 'DELETED', storage_path = null
    where id = p_source_id;
  elsif p_source_table = 'fecal_events' then
    update public.fecal_events
    set retention_state = 'DELETED', image_path = null
    where id = p_source_id;
  elsif p_source_table = 'food_products' then
    update public.food_products
    set label_retention_state = 'DELETED', label_image_path = null
    where id = p_source_id;
  elsif p_source_table = 'export_jobs' then
    update internal.export_jobs
    set status = 'EXPIRED', storage_path = null
    where id = p_source_id;
  else
    raise exception 'UNKNOWN_SOURCE_TABLE: %', p_source_table using errcode = '22023';
  end if;
end;
$$;

-- Explicit "keep clip" (Spec §23.1/§23.2): user consent moves media out of the TTL path.
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
begin
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
  elsif p_source_table = 'food_products' then
    update public.food_products
    set label_retention_state = case when p_research_opt_in
                                     then 'RESEARCH_OPT_IN' else 'USER_KEPT' end,
        label_expires_at = null
    where id = p_source_id;
  else
    raise exception 'UNKNOWN_SOURCE_TABLE: %', p_source_table using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion support (Spec §23.2/§23.3):
-- immediate access revocation + asynchronous purge with completion state.
-- ---------------------------------------------------------------------------

-- Step 1 (called by API on POST /v1/privacy/delete-account): revoke access NOW and
-- enqueue the async purge. The profiles.deleted_at stamp blocks profile updates via RLS;
-- the backend additionally rejects API work for deleted accounts.
create or replace function internal.begin_account_deletion(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_job_id uuid;
begin
  update public.profiles
  set deleted_at = now()
  where user_id = p_user_id
    and deleted_at is null;

  insert into internal.deletion_jobs (user_id, scope, status)
  values (p_user_id, 'ACCOUNT', 'PENDING')
  returning id into v_job_id;

  insert into internal.audit_log (actor_type, actor_id, action, entity, entity_id, metadata)
  values ('USER', p_user_id::text, 'ACCOUNT_DELETE_REQUESTED', 'profiles',
          p_user_id::text, jsonb_build_object('deletion_job_id', v_job_id));

  return v_job_id;
end;
$$;

-- Step 2 evidence: record purge progress/completion without retaining deleted content.
create or replace function internal.complete_deletion_job(
  p_job_id   uuid,
  p_evidence jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = internal
as $$
begin
  update internal.deletion_jobs
  set status = 'COMPLETED',
      evidence = coalesce(p_evidence, '{}'),
      completed_at = now()
  where id = p_job_id
    and status in ('PENDING', 'RUNNING', 'FAILED');   -- retryable, idempotent completion
end;
$$;

-- All privacy/retention functions and views are server-only.
revoke all on function internal.media_expiry_at(text) from public, anon, authenticated;
revoke all on function internal.mark_media_deleted(text, uuid) from public, anon, authenticated;
revoke all on function internal.mark_media_kept(text, uuid, boolean) from public, anon, authenticated;
revoke all on function internal.begin_account_deletion(uuid) from public, anon, authenticated;
revoke all on function internal.complete_deletion_job(uuid, jsonb) from public, anon, authenticated;
grant execute on function internal.media_expiry_at(text) to service_role;
grant execute on function internal.mark_media_deleted(text, uuid) to service_role;
grant execute on function internal.mark_media_kept(text, uuid, boolean) to service_role;
grant execute on function internal.begin_account_deletion(uuid) to service_role;
grant execute on function internal.complete_deletion_job(uuid, jsonb) to service_role;
