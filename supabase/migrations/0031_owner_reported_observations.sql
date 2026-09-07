-- 0031_owner_reported_observations.sql
-- Two-step "Raccontami": draft extraction, then explicit owner confirmation.

create table if not exists public.owner_reported_observations (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript text not null,
  facts_json jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'CONFIRMED', 'DISCARDED')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists owner_reported_observations_dog_idx
  on public.owner_reported_observations (dog_id, created_at desc);

alter table public.owner_reported_observations enable row level security;
alter table public.owner_reported_observations force row level security;

create policy owner_reported_observations_select_own
  on public.owner_reported_observations
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.owner_reported_observations to authenticated;
grant all on public.owner_reported_observations to service_role;

comment on table public.owner_reported_observations is
  'Owner statements saved only after explicit confirmation. Every fact retains '
  'OWNER_REPORTED provenance and never becomes a personal pattern automatically.';
