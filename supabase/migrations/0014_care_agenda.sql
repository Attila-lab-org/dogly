-- 0014_care_agenda.sql
-- Owner-scoped health appointments and reminder scheduling.

create table public.care_events (
  id                      uuid primary key default gen_random_uuid(),
  dog_id                  uuid not null references public.dogs (id) on delete cascade,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  event_type              text not null check (event_type in (
                            'VACCINE',
                            'VET_VISIT',
                            'PARASITE_TREATMENT',
                            'EXAM',
                            'THERAPY',
                            'OTHER'
                          )),
  title                   text not null check (char_length(title) between 1 and 120),
  scheduled_at            timestamptz not null,
  all_day                 boolean not null default false,
  timezone                text not null default 'Europe/Rome',
  location                text check (location is null or char_length(location) <= 160),
  notes                   text check (notes is null or char_length(notes) <= 1000),
  reminder_enabled        boolean not null default true,
  reminder_minutes_before integer not null default 1440
                          check (reminder_minutes_before between 0 and 525600),
  status                  text not null default 'SCHEDULED'
                          check (status in ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  completed_at            timestamptz,
  reminder_sent_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (
    (status = 'COMPLETED' and completed_at is not null)
    or (status <> 'COMPLETED' and completed_at is null)
  )
);

create index care_events_dog_schedule_idx
  on public.care_events (dog_id, scheduled_at, id);

create index care_events_user_schedule_idx
  on public.care_events (user_id, scheduled_at, id);

create index care_events_pending_reminder_idx
  on public.care_events (scheduled_at)
  where status = 'SCHEDULED'
    and reminder_enabled = true
    and reminder_sent_at is null;

comment on table public.care_events is
  'Dog care agenda. Reminders default to one day before and remain owner-controlled.';

create trigger trg_care_events_updated_at
  before update on public.care_events
  for each row execute function public.set_updated_at();

alter table public.care_events enable row level security;
alter table public.care_events force row level security;

create policy care_events_select_own on public.care_events
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.dogs
      where dogs.id = care_events.dog_id
        and dogs.owner_id = auth.uid()
    )
  );

create policy care_events_insert_own on public.care_events
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.dogs
      where dogs.id = care_events.dog_id
        and dogs.owner_id = auth.uid()
    )
  );

create policy care_events_update_own on public.care_events
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.dogs
      where dogs.id = care_events.dog_id
        and dogs.owner_id = auth.uid()
    )
  );

create policy care_events_delete_own on public.care_events
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.care_events to authenticated;
grant all on public.care_events to service_role;
