#!/usr/bin/env bash
# supabase/tests/quota_concurrency.sh
# Parallel quota race test (Spec §7.3, §22 "Quota race", §24.1 "Quota bypass/parallel abuse").
#
# Fires N concurrent reserve_usage() calls from separate connections against the SAME
# user with behavior_limit=3, then asserts EXACTLY 3 reservations were granted and the
# ledger counters never exceeded the limit. The atomicity comes from the FOR UPDATE row
# lock on the user's usage_ledgers row inside reserve_usage().
#
# HOW TO RUN (local Supabase):
#   supabase start && supabase db reset
#   export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
#   bash supabase/tests/quota_concurrency.sh
set -euo pipefail

DB_URL="${SUPABASE_DB_URL:?set SUPABASE_DB_URL (see supabase status -o env)}"
TEST_USER="88888888-8888-8888-8888-888888888888"
N_PARALLEL="${N_PARALLEL:-10}"

echo "== Preparing fixture user $TEST_USER (FREE plan, behavior_limit=3) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '$TEST_USER',
  'authenticated', 'authenticated', 'quota.race@example.local',
  crypt('local-only-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
delete from internal.usage_reservations where user_id = '$TEST_USER';
delete from public.usage_ledgers where user_id = '$TEST_USER';
SQL

echo "== Firing $N_PARALLEL concurrent reserve_usage() calls =="
TMPDIR_RESULTS="$(mktemp -d)"
for i in $(seq 1 "$N_PARALLEL"); do
  psql "$DB_URL" -X -q -t -A \
    -c "set role service_role; select (public.reserve_usage('$TEST_USER', 'BEHAVIOR', 'race-$i')->>'granted')::boolean;" \
    > "$TMPDIR_RESULTS/res_$i.out" 2> "$TMPDIR_RESULTS/res_$i.err" &
done
wait

GRANTED="$(grep -l '^t$' "$TMPDIR_RESULTS"/res_*.out 2>/dev/null | wc -l | tr -d ' ' || true)"
DENIED="$(grep -l '^f$' "$TMPDIR_RESULTS"/res_*.out 2>/dev/null | wc -l | tr -d ' ' || true)"
echo "granted=$GRANTED denied=$DENIED (expected granted=3, denied=$((N_PARALLEL - 3)))"

LEDGER="$(psql "$DB_URL" -X -q -t -A -c \
  "select behavior_used, behavior_reserved, behavior_limit from public.usage_ledgers where user_id = '$TEST_USER';")"
echo "ledger: used|reserved|limit = $LEDGER"

RES_COUNT="$(psql "$DB_URL" -X -q -t -A -c \
  "select count(*) from internal.usage_reservations where user_id = '$TEST_USER' and state = 'RESERVED';")"
echo "reservation rows in RESERVED state: $RES_COUNT"

FAIL=0
[ "$GRANTED" = "3" ] || { echo "FAIL: expected exactly 3 granted, got $GRANTED"; FAIL=1; }
[ "$RES_COUNT" = "3" ] || { echo "FAIL: expected exactly 3 RESERVED rows, got $RES_COUNT"; FAIL=1; }
USED="$(echo "$LEDGER" | cut -d'|' -f1)"
RESERVED="$(echo "$LEDGER" | cut -d'|' -f2)"
if [ "$((USED + RESERVED))" -gt 3 ]; then
  echo "FAIL: used+reserved exceeded limit ($USED + $RESERVED > 3)"; FAIL=1
fi

rm -rf "$TMPDIR_RESULTS"
if [ "$FAIL" -ne 0 ]; then
  echo "QUOTA CONCURRENCY TEST FAILED"
  exit 1
fi
echo "QUOTA CONCURRENCY TEST PASSED: parallel requests could not exceed allowance"
