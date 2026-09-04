-- 0009_rls_grants.sql
-- Scope (Spec V1 §11): RLS + grants for every public table.
-- Acceptance: supabase test db / RLS suite.
--
-- RLS policies and grants ship in the same migration as each table (Spec §11.1).
-- This migration is the defense-in-depth audit layer: it re-asserts, idempotently,
-- that (1) RLS is enabled AND forced on every public user table, (2) the grants matrix
-- of Spec §12 holds, (3) the internal schema remains inaccessible to client roles.
-- It must stay consistent with the per-table migrations; any divergence is a bug.

-- ---------------------------------------------------------------------------
-- 1. RLS enabled + forced on every public user table
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.profiles             force row level security;
alter table public.user_consents        enable row level security;
alter table public.user_consents        force row level security;
alter table public.dogs                 enable row level security;
alter table public.dogs                 force row level security;
alter table public.device_installations enable row level security;
alter table public.device_installations force row level security;
alter table public.behavior_captures    enable row level security;
alter table public.behavior_captures    force row level security;
alter table public.behavior_events      enable row level security;
alter table public.behavior_events      force row level security;
alter table public.behavior_feedback    enable row level security;
alter table public.behavior_feedback    force row level security;
alter table public.personal_patterns    enable row level security;
alter table public.personal_patterns    force row level security;
alter table public.knowledge_scores     enable row level security;
alter table public.knowledge_scores     force row level security;
alter table public.fecal_events         enable row level security;
alter table public.fecal_events         force row level security;
alter table public.food_products        enable row level security;
alter table public.food_products        force row level security;
alter table public.feeding_periods      enable row level security;
alter table public.feeding_periods      force row level security;
alter table public.digestive_baselines  enable row level security;
alter table public.digestive_baselines  force row level security;
alter table public.digestive_insights   enable row level security;
alter table public.digestive_insights   force row level security;
alter table public.subscriptions        enable row level security;
alter table public.subscriptions        force row level security;
alter table public.usage_ledgers        enable row level security;
alter table public.usage_ledgers        force row level security;

-- ---------------------------------------------------------------------------
-- 2. Schema-level grants
-- ---------------------------------------------------------------------------
revoke all on schema public from anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

revoke all on schema internal from public, anon, authenticated;
grant usage on schema internal to service_role;

-- ---------------------------------------------------------------------------
-- 3. Grants matrix (Spec §12). Re-asserted idempotently.
--    Mobile read = SELECT to authenticated; mobile write = listed privileges;
--    anything not granted is denied.
-- ---------------------------------------------------------------------------

-- profiles: own read; limited-field write
grant select on public.profiles to authenticated;
grant update (locale, timezone) on public.profiles to authenticated;

-- user_consents: own read; grant consent; revoke only
grant select, insert on public.user_consents to authenticated;
grant update (granted, revoked_at) on public.user_consents to authenticated;

-- dogs: own read; create/update own (deletion via account-deletion flow)
grant select, insert, update on public.dogs to authenticated;

-- device_installations: own CRUD (token registration/rotation/removal)
grant select, insert, update, delete on public.device_installations to authenticated;

-- behavior_captures / behavior_events: own read; NO direct insert/update
grant select on public.behavior_captures to authenticated;
grant select on public.behavior_events to authenticated;

-- behavior_feedback: own read; write own event feedback (API preferred)
grant select, insert on public.behavior_feedback to authenticated;
grant update (value, correction_label, corrected_context) on public.behavior_feedback
  to authenticated;

-- personal_patterns / knowledge_scores: own read; writes only by Personal Engine
grant select on public.personal_patterns to authenticated;
grant select on public.knowledge_scores to authenticated;

-- fecal_events: own read; capture metadata via API, derived fields via worker
grant select on public.fecal_events to authenticated;

-- food_products / feeding_periods: own CRUD (user-verified data)
grant select, insert, update, delete on public.food_products to authenticated;
grant select, insert, update, delete on public.feeding_periods to authenticated;

-- digestive_baselines / digestive_insights: own read; server-computed
grant select on public.digestive_baselines to authenticated;
grant select on public.digestive_insights to authenticated;

-- subscriptions / usage_ledgers: own summary read; NO client writes
grant select on public.subscriptions to authenticated;
grant select on public.usage_ledgers to authenticated;

-- anon: nothing on user data (re-assert; default is no privileges, but be explicit)
revoke all on all tables in schema public from anon;

-- service_role: full access to everything (RLS-bypassing backend/worker identity)
grant all on all tables in schema public to service_role;
grant all on all tables in schema internal to service_role;
grant all on all sequences in schema internal to service_role;

-- internal fence: no object in internal may ever be reachable by client roles
revoke all on all tables in schema internal from anon, authenticated;
revoke all on all routines in schema internal from anon, authenticated;
revoke all on all sequences in schema internal from anon, authenticated;

-- Future objects inherit the same fences by default.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema internal revoke all on tables from public;
alter default privileges in schema internal grant all on tables to service_role;
alter default privileges in schema internal grant all on sequences to service_role;
alter default privileges in schema internal revoke all on routines from public;
