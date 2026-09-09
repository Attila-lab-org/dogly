-- Consecutive Storage DELETE failures for expired raw media. After 3 failed
-- retention runs an object is quarantined so the cron skips it instead of
-- retrying silently. service_role only. Already applied in production.

create table if not exists internal.media_retention_quarantine (
  bucket                text not null,
  object_path           text not null,
  source_id             uuid,
  source_table          text,
  consecutive_failures  integer not null default 0
                          check (consecutive_failures >= 0),
  last_error            text,
  quarantined_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (bucket, object_path)
);

comment on table internal.media_retention_quarantine is
  'FIX 1.6: objects whose Storage DELETE failed across retention runs. '
  'quarantined_at set after 3 consecutive failures.';

create index if not exists media_retention_quarantine_open_idx
  on internal.media_retention_quarantine (quarantined_at)
  where quarantined_at is not null;

grant all on internal.media_retention_quarantine to service_role;
revoke all on internal.media_retention_quarantine from anon, authenticated;

alter table internal.media_retention_quarantine enable row level security;
