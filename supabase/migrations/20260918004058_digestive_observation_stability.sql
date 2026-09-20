-- Digestive observation fingerprint, owner/dog-scoped reuse, and
-- learning eligibility for personal baseline snapshots.

alter table public.fecal_events
  add column if not exists image_sha256 text,
  add column if not exists learning_eligible boolean;

comment on column public.fecal_events.image_sha256 is
  'SHA-256 of the uploaded stool image bytes. Used for owner/dog-scoped reuse.';
comment on column public.fecal_events.learning_eligible is
  'When false, the event may be shown but must not update personal digestive normal.';

create index if not exists fecal_events_image_sha256_idx
  on public.fecal_events (user_id, dog_id, image_sha256);

create table if not exists internal.digestive_observation_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  image_sha256 text not null,
  observer_provider text not null,
  observer_model text not null,
  observer_prompt_version text not null,
  schema_version text not null,
  normalizer_version text not null,
  observation_json jsonb not null,
  source_event_id uuid not null references public.fecal_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint digestive_observation_cache_identity
    unique (
      user_id,
      dog_id,
      image_sha256,
      observer_provider,
      observer_model,
      observer_prompt_version,
      schema_version,
      normalizer_version
    )
);

alter table internal.digestive_observation_cache enable row level security;
alter table internal.digestive_observation_cache force row level security;

revoke all on table internal.digestive_observation_cache from public, anon, authenticated;
grant all on table internal.digestive_observation_cache to service_role;

comment on table internal.digestive_observation_cache is
  'Owner/dog-scoped digestive observation reuse. Never shared across accounts.';
