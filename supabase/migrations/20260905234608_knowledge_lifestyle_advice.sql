-- Dogly Knowledge + Advice V2: owner-scoped progressive profile and
-- append-only personal advice outcomes. Scientific knowledge remains bundled,
-- versioned application data rather than user-writable database content.

create table public.dog_lifestyle_profiles (
  dog_id             uuid primary key references public.dogs (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  routine_json       jsonb not null default '{}'::jsonb,
  preferences_json   jsonb not null default '{}'::jsonb,
  provenance_json    jsonb not null default '{}'::jsonb,
  last_confirmed_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index dog_lifestyle_profiles_user_idx
  on public.dog_lifestyle_profiles (user_id, updated_at desc);

alter table public.dog_lifestyle_profiles enable row level security;
alter table public.dog_lifestyle_profiles force row level security;

create policy dog_lifestyle_profiles_select_own
  on public.dog_lifestyle_profiles for select to authenticated
  using (user_id = auth.uid());

create trigger trg_dog_lifestyle_profiles_updated_at
  before update on public.dog_lifestyle_profiles
  for each row execute function public.set_updated_at();

grant select on public.dog_lifestyle_profiles to authenticated;
grant all on public.dog_lifestyle_profiles to service_role;

create table public.advice_outcomes (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.behavior_events (id) on delete cascade,
  dog_id       uuid not null references public.dogs (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  advice_code  text not null check (advice_code ~ '^ADVICE_[A-Z0-9_]+$'),
  outcome      text not null check (
                 outcome in ('HELPED', 'DID_NOT_HELP', 'UNKNOWN', 'NOT_TRIED')
               ),
  created_at   timestamptz not null default now()
);

create index advice_outcomes_user_event_idx
  on public.advice_outcomes (user_id, event_id, created_at desc);

alter table public.advice_outcomes enable row level security;
alter table public.advice_outcomes force row level security;

create policy advice_outcomes_select_own
  on public.advice_outcomes for select to authenticated
  using (user_id = auth.uid());

grant select on public.advice_outcomes to authenticated;
grant all on public.advice_outcomes to service_role;
