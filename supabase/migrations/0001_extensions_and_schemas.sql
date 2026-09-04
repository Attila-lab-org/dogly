-- 0001_extensions_and_schemas.sql
-- Scope (Spec V1 §11): pgcrypto; internal schema; optional vector extension behind feature need.
-- Acceptance: fresh local reset succeeds.
--
-- Notes:
-- * The optional pgvector extension is intentionally NOT enabled (Spec §17.4: do not force
--   pgvector into the critical path before pattern discovery is enabled by evaluation).
-- * `internal` schema is hard-fenced here; per-table revokes/grants are re-asserted in the
--   migration that creates each table and globally re-audited in 0009_rls_grants.sql.

-- Supabase keeps extensions in the dedicated `extensions` schema (present on local stack).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Supabase exposes the extensions schema to API roles (functions default EXECUTE to
-- PUBLIC); without USAGE on the schema, client roles cannot resolve e.g. crypt().
grant usage on schema extensions to anon, authenticated, service_role;

-- Internal schema: jobs, cost telemetry, audit, model governance, provider payloads.
create schema if not exists internal;

comment on schema internal is
  'Server-only schema. Never exposed through the Supabase Data API. '
  'anon/authenticated have no privileges; service_role (backend/worker) only.';

-- Fail closed: no access for client roles, now and by default for future objects.
revoke all on schema internal from public;
revoke all on schema internal from anon;
revoke all on schema internal from authenticated;

-- Backend (service role JWT) and worker use service_role; RLS is bypassed by that role in
-- Supabase, but privileges are still required, so grant them explicitly.
grant usage on schema internal to service_role;
grant all on all tables in schema internal to service_role;
grant all on all sequences in schema internal to service_role;
alter default privileges in schema internal grant all on tables to service_role;
alter default privileges in schema internal grant all on sequences to service_role;

-- Public schema hardening baseline: anon gets nothing by default; per-table grants are
-- shipped in the same migration as each table (Spec §11.1).
revoke all on schema public from anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Shared helper: canonical updated_at maintenance (triggers attached in 0010).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper: stamps updated_at on row update. Attached by 0010_indexes_triggers.sql.';
