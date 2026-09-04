-- 0002_identity_dogs_consents.sql
-- Scope (Spec V1 §11): profiles, consents, dogs, device installations.
-- Acceptance: FKs and ownership constraints.
-- RLS + grants ship with each table (Spec §11.1); policies re-audited in 0009.

-- ---------------------------------------------------------------------------
-- public.profiles — 1:1 account profile (Spec §10.1)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  locale      text,
  timezone    text,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz  -- set when account deletion starts; row purged by deletion job
);

comment on table public.profiles is '1:1 account profile. deleted_at marks deletion in progress (access revocation).';

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid() and deleted_at is null)
  with check (user_id = auth.uid());

-- Mobile may only touch presentation fields; deletion is server-driven (Spec §12 matrix).
grant select on public.profiles to authenticated;
grant update (locale, timezone) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Auto-provision a profile row when a Supabase Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- No client role may invoke the provisioning hook directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- public.user_consents — append/version consent history (Spec §10.1, §23.1)
-- ---------------------------------------------------------------------------
create table public.user_consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  consent_type   text not null check (consent_type in (
                   'SERVICE_TERMS',       -- service privacy/terms acknowledgement
                   'RESEARCH_TRAINING',   -- research/training opt-in, OFF by default
                   'NOTIFICATIONS',       -- notification preference (separate from OS permission)
                   'MEDIA_RETENTION'      -- explicit "keep clip" raw-media retention
                 )),
  policy_version text not null,
  granted        boolean not null,
  granted_at     timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (granted_at is null or granted = true),
  check (revoked_at is null or granted = false or revoked_at is not null)
);

create index user_consents_user_idx on public.user_consents (user_id, consent_type, created_at desc);

comment on table public.user_consents is
  'Append/version consent history. Research/training consent is separate and opt-in (Spec §23.1).';

alter table public.user_consents enable row level security;
alter table public.user_consents force row level security;

create policy user_consents_select_own on public.user_consents
  for select to authenticated
  using (user_id = auth.uid());

create policy user_consents_insert_own on public.user_consents
  for insert to authenticated
  with check (user_id = auth.uid());

-- Users may only revoke (stamp revoked_at); history is otherwise append-only.
create policy user_consents_revoke_own on public.user_consents
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert on public.user_consents to authenticated;
grant update (granted, revoked_at) on public.user_consents to authenticated;
grant all on public.user_consents to service_role;

-- ---------------------------------------------------------------------------
-- public.dogs — dog identity (Spec §10.1). Schema supports multi-dog later (O-09);
-- V1 plan limit (1 dog) is enforced by the API entitlement layer, not the DB.
-- ---------------------------------------------------------------------------
create table public.dogs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  birth_date  date check (birth_date is null or birth_date <= current_date),
  age_stage   text not null default 'UNKNOWN'
              check (age_stage in ('PUPPY', 'ADOLESCENT', 'ADULT', 'SENIOR', 'UNKNOWN')),
  size        text check (size in ('TOY', 'SMALL', 'MEDIUM', 'LARGE', 'GIANT', 'UNKNOWN')),
  breed_label text,          -- free label incl. mix/unknown; breed is only a weak prior (§16.1)
  is_mix      boolean not null default false,
  sex         text check (sex in ('MALE', 'FEMALE', 'UNKNOWN')),
  weight_kg   numeric(5,2) check (weight_kg is null or weight_kg > 0),
  photo_path  text,          -- object path in private bucket dog-avatars
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index dogs_owner_idx on public.dogs (owner_id, created_at desc);

alter table public.dogs enable row level security;
alter table public.dogs force row level security;

create policy dogs_select_own on public.dogs
  for select to authenticated
  using (owner_id = auth.uid());

create policy dogs_insert_own on public.dogs
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy dogs_update_own on public.dogs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- No DELETE for authenticated: dog deletion cascades through account deletion / API flow.
grant select, insert, update on public.dogs to authenticated;
grant all on public.dogs to service_role;

-- ---------------------------------------------------------------------------
-- internal.dog_profile_versions — audit of changes that can influence interpretation
-- (Spec §10.1). Server-only; written by API on PATCH /v1/dogs/{id}.
-- ---------------------------------------------------------------------------
create table internal.dog_profile_versions (
  id             uuid primary key default gen_random_uuid(),
  dog_id         uuid not null references public.dogs (id) on delete cascade,
  snapshot       jsonb not null,
  changed_fields text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create index dog_profile_versions_dog_idx on internal.dog_profile_versions (dog_id, created_at desc);

comment on table internal.dog_profile_versions is
  'Server-only audit snapshots of dog profile changes that may influence interpretation.';

grant all on internal.dog_profile_versions to service_role;
revoke all on internal.dog_profile_versions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.device_installations — push tokens (Spec §10.1). No hardware fingerprinting.
-- ---------------------------------------------------------------------------
create table public.device_installations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  platform    text not null check (platform in ('IOS', 'ANDROID')),
  push_token  text not null,
  app_version text,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, platform, push_token)
);

create index device_installations_user_idx on public.device_installations (user_id, last_seen desc);

alter table public.device_installations enable row level security;
alter table public.device_installations force row level security;

create policy device_installations_select_own on public.device_installations
  for select to authenticated
  using (user_id = auth.uid());

create policy device_installations_insert_own on public.device_installations
  for insert to authenticated
  with check (user_id = auth.uid());

create policy device_installations_update_own on public.device_installations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy device_installations_delete_own on public.device_installations
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.device_installations to authenticated;
grant all on public.device_installations to service_role;
