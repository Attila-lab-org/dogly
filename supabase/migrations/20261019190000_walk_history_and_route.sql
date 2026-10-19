create table if not exists public.walks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0 and duration_seconds <= 86400),
  distance_meters numeric(10,2) not null default 0 check (distance_meters >= 0 and distance_meters <= 100000),
  steps_estimate integer not null default 0 check (steps_estimate >= 0 and steps_estimate <= 200000),
  route_points jsonb not null default '[]'::jsonb check (jsonb_typeof(route_points) = 'array'),
  status text not null default 'COMPLETED' check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now()
);

create index if not exists walks_user_started_idx on public.walks (user_id, started_at desc);
create index if not exists walks_dog_started_idx on public.walks (dog_id, started_at desc);

alter table public.walks enable row level security;
alter table public.walks force row level security;

drop policy if exists walks_select_own on public.walks;
create policy walks_select_own on public.walks
  for select to authenticated using (user_id = auth.uid());

drop policy if exists walks_insert_own on public.walks;
create policy walks_insert_own on public.walks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.dogs
      where public.dogs.id = walks.dog_id
        and public.dogs.owner_id = auth.uid()
    )
  );

grant select, insert on public.walks to authenticated;
grant all on public.walks to service_role;
