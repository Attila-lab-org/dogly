-- Personal patterns are recurrences of intent + context + observable signals,
-- not merely counts of the same intent.

create table if not exists internal.behavior_pattern_signatures (
  event_id uuid primary key references public.behavior_events (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  pattern_key text not null,
  intent_code text not null,
  context_bucket text not null,
  signal_signature jsonb not null,
  owner_context_signature jsonb not null default '[]',
  created_at timestamptz not null default now()
);

comment on table internal.behavior_pattern_signatures is
  'Event-level deterministic signatures used to derive personal recurrences. '
  'One signature is evidence, not yet a personal pattern.';

alter table internal.behavior_pattern_signatures enable row level security;
alter table internal.behavior_pattern_signatures force row level security;
revoke all on internal.behavior_pattern_signatures from anon, authenticated;
grant all on internal.behavior_pattern_signatures to service_role;

create index if not exists behavior_pattern_signatures_key_idx
  on internal.behavior_pattern_signatures (dog_id, pattern_key, created_at);

alter table public.personal_patterns
  add column if not exists pattern_key text,
  add column if not exists intent_code text,
  add column if not exists context_bucket text,
  add column if not exists signal_signature jsonb,
  add column if not exists owner_context_signature jsonb;

create unique index if not exists personal_patterns_dog_pattern_key_uidx
  on public.personal_patterns (dog_id, pattern_key)
  where pattern_key is not null;
