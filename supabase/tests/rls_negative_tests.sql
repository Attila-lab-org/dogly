-- supabase/tests/rls_negative_tests.sql
-- RLS negative tests: cross-user denial on every domain (Spec §24.1, §26.1 DB/RLS layer).
--
-- HOW TO RUN (local Supabase):
--   supabase start
--   supabase db reset            # applies migrations + seed.sql fixtures
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_negative_tests.sql
-- (SUPABASE_DB_URL is printed by `supabase status -o env`, typically
--  postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--
-- The script aborts with a raised exception on the FIRST failed assertion
-- (ON_ERROR_STOP=1 => non-zero exit code for CI).
--
-- Technique: SET ROLE <client role> + SET request.jwt.claims makes auth.uid() return the
-- fixture user, exactly like a PostgREST request with that user's JWT.

-- Assert helper in the session temp schema (created as superuser before switching role).
create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'RLS TEST FAILED: %', p_msg;
  end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- Fixture ids (see supabase/seed.sql)
-- Alice: 11111111-1111-1111-1111-111111111111  (dog Rocky, 1 COMPLETED behavior event)
-- Bob:   22222222-2222-2222-2222-222222222222  (dog Luna, no events)

-- =========================================================================
-- A. Internal schema is inaccessible to client roles (privilege-level fence)
-- =========================================================================
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.audit_log', 'SELECT'),
  'authenticated has no SELECT on internal.audit_log');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.behavior_observations', 'SELECT'),
  'authenticated has no SELECT on internal.behavior_observations');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.behavior_interpretations', 'SELECT'),
  'authenticated has no SELECT on internal.behavior_interpretations');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.usage_reservations', 'SELECT'),
  'authenticated has no SELECT on internal.usage_reservations');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.ai_cost_events', 'SELECT'),
  'authenticated has no SELECT on internal.ai_cost_events');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'internal.deletion_jobs', 'SELECT'),
  'authenticated has no SELECT on internal.deletion_jobs');
select pg_temp.assert(
  not has_table_privilege('anon', 'internal.analysis_jobs', 'SELECT'),
  'anon has no SELECT on internal.analysis_jobs');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.usage_ledgers', 'INSERT'),
  'authenticated cannot INSERT usage_ledgers (quota service only)');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.subscriptions', 'INSERT'),
  'authenticated cannot INSERT subscriptions (webhook/service only)');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.behavior_events', 'INSERT'),
  'authenticated cannot INSERT behavior_events (worker/API only)');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.personal_patterns', 'UPDATE'),
  'authenticated cannot UPDATE personal_patterns (anti-feedback-loop firewall)');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.knowledge_scores', 'INSERT'),
  'authenticated cannot INSERT knowledge_scores (server-computed)');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.signal_experiments', 'INSERT'),
  'authenticated cannot INSERT signal_experiments directly (API only)');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.signal_map_entries', 'UPDATE'),
  'authenticated cannot UPDATE signal_map_entries (deterministic aggregate)');
select pg_temp.assert(
  not has_table_privilege('anon', 'public.dogs', 'SELECT'),
  'anon has no SELECT on public.dogs');
select pg_temp.assert(
  not has_table_privilege('anon', 'public.care_events', 'SELECT'),
  'anon has no SELECT on care_events');

-- Quota RPCs must not be callable by client roles
select pg_temp.assert(
  not has_function_privilege('authenticated',
    'public.reserve_usage(uuid,text,text,integer)', 'EXECUTE'),
  'authenticated cannot EXECUTE reserve_usage');
select pg_temp.assert(
  not has_function_privilege('anon',
    'public.commit_usage(text)', 'EXECUTE'),
  'anon cannot EXECUTE commit_usage');

-- =========================================================================
-- B. Cross-user denial as authenticated Bob against Alice's data
-- =========================================================================
set role authenticated;
set request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- B1. Reads: Bob sees ZERO of Alice's rows on every user-facing table
select pg_temp.assert(
  (select count(*) = 0 from public.profiles
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT profiles returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.dogs
    where owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT dogs returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.behavior_events
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT behavior_events returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.behavior_captures
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT behavior_captures returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.behavior_feedback
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT behavior_feedback returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.personal_patterns p
    join public.dogs d on d.id = p.dog_id
    where d.owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT personal_patterns returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.knowledge_scores k
    join public.dogs d on d.id = k.dog_id
    where d.owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT knowledge_scores returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.fecal_events
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT fecal_events returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.food_products
    where owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT food_products returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.usage_ledgers
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT usage_ledgers returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.subscriptions
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT subscriptions returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.care_events
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT care_events returns nothing');

-- B2. Writes: Bob cannot create/update rows owned by Alice
--     (WITH CHECK violations raise; we assert via savepoint-free try blocks)
do $$
begin
  begin
    insert into public.dogs (id, owner_id, name)
    values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Evil');
    raise exception 'RLS TEST FAILED: cross-user INSERT dogs succeeded';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-user INSERT dogs denied';
  end;
end $$;

do $$
begin
  begin
    insert into public.care_events (
      dog_id, user_id, event_type, title, scheduled_at, timezone
    )
    values (
      'aaaa1111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      'VET_VISIT',
      'Cross-user visit',
      now() + interval '1 day',
      'Europe/Rome'
    );
    raise exception 'RLS TEST FAILED: care event on another user''s dog succeeded';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-user INSERT care_events denied';
  end;
end $$;

do $$
begin
  begin
    update public.profiles set locale = 'xx'
    where user_id = '11111111-1111-1111-1111-111111111111';
    if found then
      raise exception 'RLS TEST FAILED: cross-user UPDATE profiles affected rows';
    end if;
    raise notice 'PASS: cross-user UPDATE profiles affected 0 rows';
  end;
end $$;

do $$
begin
  begin
    -- Bob cannot leave feedback on Alice's event (ownership subquery in WITH CHECK)
    insert into public.behavior_feedback (event_id, user_id, value)
    values ('dddd4444-4444-4444-4444-444444444444',
            '22222222-2222-2222-2222-222222222222', 'NO');
    raise exception 'RLS TEST FAILED: feedback on another user''s event succeeded';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: feedback on another user''s event denied';
  end;
end $$;

do $$
begin
  begin
    update public.personal_patterns set state = 'ARCHIVED'
    where dog_id = 'aaaa1111-1111-1111-1111-111111111111';
    raise exception 'RLS TEST FAILED: client UPDATE personal_patterns succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS: client UPDATE personal_patterns denied (firewall holds)';
  end;
end $$;

reset role;
reset request.jwt.claims;

-- =========================================================================
-- C. Anon role: sees nothing at all
-- =========================================================================
-- Fail closed at the privilege level (0001 revokes schema/table access for anon), so a
-- bare SELECT raises insufficient_privilege; if a future grant lets the read through,
-- RLS must still return zero rows. Both outcomes are acceptable "see nothing" evidence.
set role anon;
set request.jwt.claims to '{"role":"anon"}';

do $$
declare
  v_count bigint;
begin
  begin
    select count(*) into v_count from public.dogs;
    if v_count <> 0 then
      raise exception 'RLS TEST FAILED: anon saw % dogs rows', v_count;
    end if;
    raise notice 'PASS: anon SELECT dogs returns nothing (RLS)';
  exception when insufficient_privilege then
    raise notice 'PASS: anon SELECT dogs denied (no privilege, fail closed)';
  end;
  begin
    select count(*) into v_count from public.behavior_events;
    if v_count <> 0 then
      raise exception 'RLS TEST FAILED: anon saw % behavior_events rows', v_count;
    end if;
    raise notice 'PASS: anon SELECT behavior_events returns nothing (RLS)';
  exception when insufficient_privilege then
    raise notice 'PASS: anon SELECT behavior_events denied (no privilege, fail closed)';
  end;
  begin
    select count(*) into v_count from public.usage_ledgers;
    if v_count <> 0 then
      raise exception 'RLS TEST FAILED: anon saw % usage_ledgers rows', v_count;
    end if;
    raise notice 'PASS: anon SELECT usage_ledgers returns nothing (RLS)';
  exception when insufficient_privilege then
    raise notice 'PASS: anon SELECT usage_ledgers denied (no privilege, fail closed)';
  end;
end $$;

reset role;
reset request.jwt.claims;

-- =========================================================================
-- D. Storage object policies fail closed on cross-user paths
-- =========================================================================
set role authenticated;
set request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
begin
  begin
    -- Bob tries to plant an object under Alice's uid prefix in behavior-raw
    insert into storage.objects (bucket_id, name, owner_id)
    values ('behavior-raw',
            'users/11111111-1111-1111-1111-111111111111/dogs/aaaa1111-1111-1111-1111-111111111111/behavior/dddd4444-4444-4444-4444-444444444444/eeee5555-eeee-5555-eeee-555555555555.mp4',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'RLS TEST FAILED: cross-user storage insert succeeded';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-user storage insert denied (fail closed)';
  end;
end $$;

do $$
begin
  begin
    -- Bob tries a malformed path under HIS uid but outside the canonical shape
    insert into storage.objects (bucket_id, name, owner_id)
    values ('behavior-raw',
            'users/22222222-2222-2222-2222-222222222222/anything.mp4',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'RLS TEST FAILED: non-canonical storage path insert succeeded';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: non-canonical storage path insert denied';
  end;
end $$;

reset role;
reset request.jwt.claims;

-- =========================================================================
-- E. Gallery + visibility: owner-only (Dogly UX V1 / migration 0013)
-- =========================================================================
set role authenticated;
set request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.assert(
  (select count(*) = 0 from public.dog_albums
    where owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT dog_albums returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.dog_photos
    where owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT dog_photos returns nothing');
select pg_temp.assert(
  (select count(*) = 0 from public.dog_profile_visibility v
    join public.dogs d on d.id = v.dog_id
    where d.owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross-user SELECT dog_profile_visibility returns nothing');

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('dog-gallery',
            'users/11111111-1111-1111-1111-111111111111/dogs/aaaa1111-1111-1111-1111-111111111111/gallery/bbbb2222-2222-2222-2222-222222222222/cccc3333-cccc-3333-cccc-333333333333.jpg',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'RLS TEST FAILED: cross-user dog-gallery insert succeeded';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-user dog-gallery insert denied (fail closed)';
  end;
end $$;

reset role;
reset request.jwt.claims;

select 'ALL RLS NEGATIVE TESTS PASSED' as result;
