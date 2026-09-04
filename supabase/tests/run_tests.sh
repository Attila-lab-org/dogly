#!/usr/bin/env bash
# supabase/tests/run_tests.sh — full local DB test suite (Spec §26.1 DB/RLS layer,
# CI step "Supabase: start local → migration reset → RLS/SQL tests", §28.1).
#
# Usage:
#   supabase start
#   export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
#   bash supabase/tests/run_tests.sh
set -euo pipefail

DB_URL="${SUPABASE_DB_URL:?set SUPABASE_DB_URL (see supabase status -o env)}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== 1/5 Fresh migration reset (reproducibility from empty local Supabase, §11.1) =="
supabase db reset

echo "== 2/5 RLS negative tests (cross-user denial on every domain) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$HERE/rls_negative_tests.sql"

echo "== 3/5 Quota functional tests (reserve/commit/refund, idempotency) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$HERE/quota_tests.sql"

echo "== 4/5 Privacy/retention integration tests (deletion workflow, TTL) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$HERE/privacy_retention_tests.sql"

echo "== 5/5 Quota concurrency test (parallel reserve race) =="
SUPABASE_DB_URL="$DB_URL" bash "$HERE/quota_concurrency.sh"

echo "ALL DB TESTS PASSED"
