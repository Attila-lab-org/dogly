-- 0010_indexes_triggers.sql
-- Scope (Spec V1 §11): updated_at, timeline indexes, status/owner indexes.
-- Acceptance: EXPLAIN on core queries.
--
-- Core read paths (Spec §27): diary cursor timeline per user, per-dog history,
-- worker scans by status, quota lookup per user/period. No unbounded history query.

-- ---------------------------------------------------------------------------
-- updated_at triggers (helper function created in 0001)
-- ---------------------------------------------------------------------------
create trigger trg_dogs_updated_at
  before update on public.dogs
  for each row execute function public.set_updated_at();

create trigger trg_device_installations_updated_at
  before update on public.device_installations
  for each row execute function public.set_updated_at();

create trigger trg_behavior_feedback_updated_at
  before update on public.behavior_feedback
  for each row execute function public.set_updated_at();

create trigger trg_personal_patterns_updated_at
  before update on public.personal_patterns
  for each row execute function public.set_updated_at();

create trigger trg_food_products_updated_at
  before update on public.food_products
  for each row execute function public.set_updated_at();

create trigger trg_feeding_periods_updated_at
  before update on public.feeding_periods
  for each row execute function public.set_updated_at();

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger trg_usage_ledgers_updated_at
  before update on public.usage_ledgers
  for each row execute function public.set_updated_at();

create trigger trg_usage_reservations_updated_at
  before update on internal.usage_reservations
  for each row execute function public.set_updated_at();

create trigger trg_analysis_jobs_updated_at
  before update on internal.analysis_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Timeline / cursor pagination indexes
-- (most (user_id, created_at) indexes were created with their tables; here we add the
--  composite cursors and remaining access paths)
-- ---------------------------------------------------------------------------

-- Diary: unified cursor timeline across both domains filters by user + created_at, id as tiebreak
create index if not exists behavior_events_diary_cursor_idx
  on public.behavior_events (user_id, created_at desc, id desc);

create index if not exists fecal_events_diary_cursor_idx
  on public.fecal_events (user_id, created_at desc, id desc);

-- Completed events only feed knowledge score / patterns / insights
create index if not exists behavior_events_completed_dog_idx
  on public.behavior_events (dog_id, created_at desc)
  where status = 'COMPLETED';

create index if not exists fecal_events_completed_dog_idx
  on public.fecal_events (dog_id, created_at desc)
  where status = 'COMPLETED';

-- Retention cleanup scans (media TTL expiry)
create index if not exists behavior_captures_retention_idx
  on public.behavior_captures (expires_at)
  where retention_state in ('TEMPORARY', 'DELETE_PENDING');

-- Digestive event -> active feeding period join
create index if not exists fecal_events_feeding_period_idx
  on public.fecal_events (feeding_period_id)
  where feeding_period_id is not null;

-- Quota path: current ledger per user
create index if not exists usage_ledgers_current_idx
  on public.usage_ledgers (user_id, period_start desc);

-- Reservations by state (worker refund/commit sweeps)
create index if not exists usage_reservations_state_idx
  on internal.usage_reservations (state, created_at);

-- Worker job polling: pending/retrying jobs by schedule
create index if not exists analysis_jobs_pending_idx
  on internal.analysis_jobs (scheduled_at)
  where status in ('PENDING', 'RETRYING');

-- Cost dashboards: per-event totals, provider mix over time
create index if not exists ai_cost_events_domain_time_idx
  on internal.ai_cost_events (domain, created_at desc);

-- ---------------------------------------------------------------------------
-- Acceptance probe queries (for manual EXPLAIN in local Supabase):
--   explain analyze select * from public.behavior_events
--     where user_id = $1 and created_at < $2 order by created_at desc, id desc limit 20;
--   explain analyze select * from public.behavior_captures
--     where retention_state = 'TEMPORARY' and expires_at < now();
--   explain analyze select * from internal.analysis_jobs
--     where status = 'PENDING' order by scheduled_at limit 50;
-- Expected: index scans on the indexes above, no sequential scans on large tables.
-- ---------------------------------------------------------------------------
