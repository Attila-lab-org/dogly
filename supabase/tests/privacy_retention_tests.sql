-- supabase/tests/privacy_retention_tests.sql
-- Privacy/retention integration tests (Spec §23, migration 0012 acceptance:
-- "Deletion integration test"; also §31.2 P0 blocker: "Account deletion/export path
-- missing or non-functional" and "Raw media ... uncontrolled perpetual retention").
--
-- HOW TO RUN (local Supabase):
--   supabase start && supabase db reset
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/privacy_retention_tests.sql
--
-- Internal functions are service_role-only; the access-revocation check switches to
-- the authenticated role to prove RLS blocks a deleted account.

set role service_role;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'PRIVACY TEST FAILED: %', p_msg;
  end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- Fixtures from seed.sql:
--   Alice 11111111-... (dog Rocky, capture cccc3333-..., TEMPORARY, expires +24h)
--   Bob   22222222-... (no events)

-- =========================================================================
-- 1. Retention TTL machinery (Spec §23.2)
-- =========================================================================
select pg_temp.assert(
  internal.media_expiry_at('BEHAVIOR_RAW') between now() + interval '23 hours'
                                               and now() + interval '25 hours',
  'media_expiry_at uses configured BEHAVIOR_RAW TTL (24h beta default)');

-- Alice's fresh capture is TEMPORARY but not yet expired: NOT due for deletion.
select pg_temp.assert(
  not exists (select 1 from internal.media_due_for_deletion
              where source_id = 'cccc3333-3333-3333-3333-333333333333'),
  'unexpired TEMPORARY capture is not due for deletion');

-- Force expiry: now the object must appear in the due-for-deletion view.
update public.behavior_captures
set expires_at = now() - interval '1 hour'
where id = 'cccc3333-3333-3333-3333-333333333333';

select pg_temp.assert(
  exists (select 1 from internal.media_due_for_deletion
          where bucket = 'behavior-raw'
            and source_id = 'cccc3333-3333-3333-3333-333333333333'),
  'expired TEMPORARY capture is due for deletion');

-- =========================================================================
-- 2. Explicit "keep clip" consent wins over TTL (Spec §23.1/§23.2)
-- =========================================================================
select internal.mark_media_kept('behavior_captures',
  'cccc3333-3333-3333-3333-333333333333', false);

select pg_temp.assert(
  (select retention_state = 'USER_KEPT' and expires_at is null
   from public.behavior_captures where id = 'cccc3333-3333-3333-3333-333333333333'),
  'mark_media_kept sets USER_KEPT and clears expiry');

select pg_temp.assert(
  not exists (select 1 from internal.media_due_for_deletion
              where source_id = 'cccc3333-3333-3333-3333-333333333333'),
  'USER_KEPT media is never due for deletion (consent wins over TTL)');

-- =========================================================================
-- 3. mark_media_deleted purges the path and stamps DELETED
-- =========================================================================
update public.behavior_captures
set retention_state = 'TEMPORARY', expires_at = now() - interval '1 hour'
where id = 'cccc3333-3333-3333-3333-333333333333';

select internal.mark_media_deleted('behavior_captures',
  'cccc3333-3333-3333-3333-333333333333');

select pg_temp.assert(
  (select retention_state = 'DELETED' and storage_path is null
   from public.behavior_captures where id = 'cccc3333-3333-3333-3333-333333333333'),
  'mark_media_deleted stamps DELETED and nulls storage_path');

select pg_temp.assert(
  not exists (select 1 from internal.media_due_for_deletion
              where source_id = 'cccc3333-3333-3333-3333-333333333333'),
  'DELETED media no longer due for deletion');

-- Restore seed state for repeatability (db reset re-seeds anyway).
update public.behavior_captures
set retention_state = 'TEMPORARY',
    storage_path = 'users/11111111-1111-1111-1111-111111111111/dogs/aaaa1111-1111-1111-1111-111111111111/behavior/dddd4444-4444-4444-4444-444444444444/eeee5555-eeee-5555-eeee-555555555555.mp4',
    expires_at = now() + interval '24 hours'
where id = 'cccc3333-3333-3333-3333-333333333333';

-- =========================================================================
-- 4. Account deletion: immediate access revocation + auditable async purge
--    (Spec §23.2/§23.3)
-- =========================================================================
do $$
declare
  v_job uuid;
begin
  v_job := internal.begin_account_deletion('22222222-2222-2222-2222-222222222222');

  perform pg_temp.assert(v_job is not null, 'begin_account_deletion returns job id');

  perform pg_temp.assert(
    (select deleted_at is not null from public.profiles
     where user_id = '22222222-2222-2222-2222-222222222222'),
    'access revoked immediately (profiles.deleted_at stamped)');

  perform pg_temp.assert(
    exists (select 1 from internal.deletion_jobs
            where id = v_job and scope = 'ACCOUNT' and status = 'PENDING'),
    'async purge job enqueued (ACCOUNT, PENDING)');

  perform pg_temp.assert(
    exists (select 1 from internal.audit_log
            where action = 'ACCOUNT_DELETE_REQUESTED'
              and actor_id = '22222222-2222-2222-2222-222222222222'),
    'deletion request is audited (no raw content in audit metadata)');

  -- Retryable, idempotent completion (Spec §23.3: deletion job must be retryable).
  perform internal.complete_deletion_job(v_job, jsonb_build_object('db_rows', 'purged'));
  perform pg_temp.assert(
    (select status = 'COMPLETED' and completed_at is not null
     from internal.deletion_jobs where id = v_job),
    'deletion job completes with evidence');

  perform internal.complete_deletion_job(v_job, '{}');  -- duplicate delivery: no-op
  perform pg_temp.assert(
    (select status = 'COMPLETED' and evidence = jsonb_build_object('db_rows', 'purged')
     from internal.deletion_jobs where id = v_job),
    'duplicate completion is a no-op (idempotent, evidence preserved)');

  -- Keep the job id for later assertions in this session.
  perform set_config('test.bob_deletion_job', v_job::text, true);
end $$;

-- =========================================================================
-- 5. A deleted account cannot act through the Data API (RLS fail closed)
-- =========================================================================
reset role;
set role authenticated;
set request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_rows integer;
begin
  update public.profiles set locale = 'it'
  where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;
  perform pg_temp.assert(v_rows = 0,
    'deleted account cannot update own profile (RLS blocks deleted_at rows)');
end $$;

reset role;
reset request.jwt.claims;

-- =========================================================================
-- 6. Client roles cannot touch privacy/retention internals (privilege fence)
-- =========================================================================
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.export_jobs', 'SELECT'),
  'authenticated has no SELECT on internal.export_jobs');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.retention_policies', 'SELECT'),
  'authenticated has no SELECT on internal.retention_policies');
select pg_temp.assert(
  not has_function_privilege('authenticated',
    'internal.begin_account_deletion(uuid)', 'EXECUTE'),
  'authenticated cannot EXECUTE begin_account_deletion');
select pg_temp.assert(
  not has_function_privilege('anon',
    'internal.mark_media_deleted(text, uuid)', 'EXECUTE'),
  'anon cannot EXECUTE mark_media_deleted');

select 'ALL PRIVACY/RETENTION TESTS PASSED' as result;
