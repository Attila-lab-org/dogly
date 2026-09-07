-- 0033_owner_reported_user_fk_index.sql
-- Cover the auth.users FK for account deletion and owner-scoped operations.

create index if not exists owner_reported_observations_user_idx
  on public.owner_reported_observations (user_id, created_at desc);
