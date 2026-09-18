create table if not exists public.digestive_feedback (
  event_id uuid not null references public.fecal_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value text not null check (value in ('YES', 'NO', 'UNKNOWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.digestive_feedback is
  'Owner confirmation of the digestive result. A calibration label, never clinical ground truth.';

alter table public.digestive_feedback enable row level security;
alter table public.digestive_feedback force row level security;

create policy digestive_feedback_select_own
  on public.digestive_feedback for select to authenticated
  using (user_id = (select auth.uid()));

create policy digestive_feedback_insert_own_event
  on public.digestive_feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.fecal_events e
      where e.id = event_id
        and e.user_id = (select auth.uid())
        and e.status = 'COMPLETED'
    )
  );

create policy digestive_feedback_update_own
  on public.digestive_feedback for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.digestive_feedback to authenticated;
grant all on public.digestive_feedback to service_role;

create index if not exists digestive_feedback_user_idx
  on public.digestive_feedback(user_id);
