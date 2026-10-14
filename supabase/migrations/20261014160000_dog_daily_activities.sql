-- Timed daily routine for a dog (mock "La giornata di {name}").
-- Distinct from dog_lifestyle_profiles (static habit answers).

create table public.dog_daily_activities (
  id                  uuid primary key default gen_random_uuid(),
  dog_id              uuid not null references public.dogs (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 80),
  activity_kind       text not null check (activity_kind in (
                        'WALK', 'MEAL', 'PLAY', 'REST', 'TRAINING', 'MEDS', 'OTHER'
                      )),
  local_time_minutes  smallint not null check (local_time_minutes between 0 and 1439),
  duration_minutes    smallint check (
                        duration_minutes is null
                        or duration_minutes between 1 and 480
                      ),
  weekday_mask        smallint not null default 127
                        check (weekday_mask between 1 and 127),
  notes               text check (notes is null or char_length(notes) <= 240),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index dog_daily_activities_dog_time_idx
  on public.dog_daily_activities (dog_id, active, local_time_minutes, id);

create index dog_daily_activities_user_idx
  on public.dog_daily_activities (user_id, dog_id);

comment on table public.dog_daily_activities is
  'Owner-planned daily activities (walk, meal, rest). weekday_mask bit0=Mon … bit6=Sun.';

create trigger trg_dog_daily_activities_updated_at
  before update on public.dog_daily_activities
  for each row execute function public.set_updated_at();

alter table public.dog_daily_activities enable row level security;
alter table public.dog_daily_activities force row level security;

create policy dog_daily_activities_select_own on public.dog_daily_activities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = dog_daily_activities.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

create policy dog_daily_activities_insert_own on public.dog_daily_activities
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = dog_daily_activities.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

create policy dog_daily_activities_update_own on public.dog_daily_activities
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = dog_daily_activities.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = dog_daily_activities.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

create policy dog_daily_activities_delete_own on public.dog_daily_activities
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = dog_daily_activities.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.dog_daily_activities to authenticated;
