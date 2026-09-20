-- Preserve whether an analysis actually owns a quota reservation.
-- Beta quota bypasses must not later call commit_usage/refund_usage for a
-- reservation that was never created.

alter table public.behavior_events
  add column if not exists quota_reserved boolean not null default true;

alter table public.fecal_events
  add column if not exists quota_reserved boolean not null default true;

comment on column public.behavior_events.quota_reserved is
  'True when reserve_usage created a real reservation; false for an explicit beta bypass.';

comment on column public.fecal_events.quota_reserved is
  'True when reserve_usage created a real reservation; false for an explicit beta bypass.';
