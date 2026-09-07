-- 0036_owner_story_draft_expiry.sql
-- Unconfirmed extracted text is temporary; confirmed facts remain persistent.

alter table public.owner_reported_observations
  add column if not exists draft_expires_at timestamptz
  not null default (now() + interval '24 hours');

create index if not exists owner_reported_observations_draft_expiry_idx
  on public.owner_reported_observations (draft_expires_at)
  where status = 'DRAFT';
