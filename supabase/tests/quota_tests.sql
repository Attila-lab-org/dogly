-- supabase/tests/quota_tests.sql
-- Serial functional tests for reserve_usage / commit_usage / refund_usage (Spec §7.3, §22).
-- Parallel/race coverage lives in quota_concurrency.sh (true concurrent connections).
--
-- HOW TO RUN (local Supabase):
--   supabase start && supabase db reset
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/quota_tests.sql
--
create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'QUOTA TEST FAILED: %', p_msg;
  end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- Dedicated fixture user so the test is independent of seed data and repeatable
-- after `supabase db reset`.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-9999-9999-999999999999',
  'authenticated', 'authenticated', 'quota.test@example.local',
  crypt('local-only-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- Fixture creation needs postgres access to auth.users. The quota operations
-- themselves run as service_role, matching production.
set role service_role;

-- Fresh FREE ledger: limit 3 behavior / 3 digestive for the current period
delete from public.usage_ledgers where user_id = '99999999-9999-9999-9999-999999999999';
delete from internal.usage_reservations where user_id = '99999999-9999-9999-9999-999999999999';

-- ---------------------------------------------------------------------------
-- 1. Reserve consumes allowance; 4th reservation on a FREE (3/month) plan is denied
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-1')->>'granted')::boolean),
  'reserve #1 granted');
select pg_temp.assert(
  (select (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-2')->>'granted')::boolean),
  'reserve #2 granted');
select pg_temp.assert(
  (select (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-3')->>'granted')::boolean),
  'reserve #3 granted (limit reached)');
select pg_temp.assert(
  (select not (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-4')->>'granted')::boolean),
  'reserve #4 denied (allowance exhausted)');
select pg_temp.assert(
  (select public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-4b')->>'reason' = 'QUOTA_EXHAUSTED'),
  'denial reason is QUOTA_EXHAUSTED (stable error taxonomy §22.1)');
select pg_temp.assert(
  (select behavior_reserved = 3 and behavior_used = 0 from public.usage_ledgers
    where user_id = '99999999-9999-9999-9999-999999999999'),
  'ledger shows reserved=3, used=0');

-- ---------------------------------------------------------------------------
-- 2. Idempotent re-init: same reference returns the same reservation, no double count
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-1')->>'reason') = 'ALREADY_RESERVED'),
  'repeated reserve with same reference returns ALREADY_RESERVED');
select pg_temp.assert(
  (select behavior_reserved = 3 from public.usage_ledgers
    where user_id = '99999999-9999-9999-9999-999999999999'),
  'idempotent re-init did not double-count');

-- ---------------------------------------------------------------------------
-- 3. commit_usage moves reserved -> used; duplicate commit is a no-op
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select (public.commit_usage('qt-res-1')->>'committed')::boolean),
  'commit qt-res-1 committed');
select pg_temp.assert(
  (select behavior_reserved = 2 and behavior_used = 1 from public.usage_ledgers
    where user_id = '99999999-9999-9999-9999-999999999999'),
  'after commit: reserved=2, used=1');
select pg_temp.assert(
  (select not (public.commit_usage('qt-res-1')->>'committed')::boolean),
  'duplicate commit is a no-op (duplicate queue delivery safe)');
select pg_temp.assert(
  (select behavior_reserved = 2 and behavior_used = 1 from public.usage_ledgers
    where user_id = '99999999-9999-9999-9999-999999999999'),
  'duplicate commit did not move counters');

-- ---------------------------------------------------------------------------
-- 4. refund_usage releases reserved units; duplicate refund is a no-op;
--    refund after commit is a no-op (committed units are final)
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select (public.refund_usage('qt-res-2', 'QUALITY_REJECTED')->>'refunded')::boolean),
  'refund qt-res-2 (quality rejection) refunded');
select pg_temp.assert(
  (select behavior_reserved = 1 and behavior_used = 1 from public.usage_ledgers
    where user_id = '99999999-9999-9999-9999-999999999999'),
  'after refund: reserved=1, used=1');
select pg_temp.assert(
  (select not (public.refund_usage('qt-res-2', 'QUALITY_REJECTED')->>'refunded')::boolean),
  'duplicate refund is a no-op (idempotent)');
select pg_temp.assert(
  (select not (public.refund_usage('qt-res-1', 'TECHNICAL_FAILURE')->>'refunded')::boolean),
  'refund of a COMMITTED reservation is a no-op (delivered analysis consumes)');
select pg_temp.assert(
  (select behavior_reserved = 1 and behavior_used = 1 from public.usage_ledgers
    where user_id = '99999999-9999-9999-9999-999999999999'),
  'counters unchanged after illegal refunds');

-- ---------------------------------------------------------------------------
-- 5. Freed allowance is usable again (refund genuinely releases quota)
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-5')->>'granted')::boolean),
  'reserve after refund granted again');
select pg_temp.assert(
  (select not (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'BEHAVIOR', 'qt-res-6')->>'granted')::boolean),
  'next reserve denied again (1 used + 2 reserved = 3)');

-- ---------------------------------------------------------------------------
-- 6. Cancellation releases the reservation (RELEASED state)
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select (public.refund_usage('qt-res-3', 'CANCELLED')->>'refunded')::boolean),
  'cancelled reservation released');
select pg_temp.assert(
  (select state = 'RELEASED' from internal.usage_reservations
    where reference_id = 'qt-res-3'),
  'cancelled reservation state is RELEASED');

-- ---------------------------------------------------------------------------
-- 7. Digestive domain has an independent allowance
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select (public.reserve_usage('99999999-9999-9999-9999-999999999999',
      'DIGESTIVE', 'qt-dig-1')->>'granted')::boolean),
  'digestive reserve unaffected by behavior exhaustion');
select pg_temp.assert(
  (select digestive_reserved = 1 and behavior_used + behavior_reserved <= 3
   from public.usage_ledgers
   where user_id = '99999999-9999-9999-9999-999999999999'),
  'digestive and behavior counters are independent');

-- ---------------------------------------------------------------------------
-- 8. Invalid inputs raise stable errors
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.reserve_usage('99999999-9999-9999-9999-999999999999',
                                 'FOOD_LABEL', 'qt-bad-1');
    raise exception 'QUOTA TEST FAILED: invalid domain accepted';
  exception when invalid_parameter_value then
    raise notice 'PASS: invalid domain rejected';
  end;
end $$;

reset role;
select 'ALL QUOTA TESTS PASSED' as result;
