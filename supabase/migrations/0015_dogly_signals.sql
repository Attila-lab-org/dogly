-- 0015_dogly_signals.sql
-- Dogly Signals: personal sound-reaction map for one dog.
-- Stores observable reactions, never universal translations or command claims.

create table public.signal_experiments (
  id                  uuid primary key default gen_random_uuid(),
  dog_id              uuid not null references public.dogs (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  client_request_id   text not null check (char_length(client_request_id) between 8 and 128),
  category            text not null check (category in (
                        'PLAY',
                        'ATTENTION',
                        'CURIOSITY',
                        'CONTACT'
                      )),
  sound_key           text not null check (char_length(sound_key) between 1 and 80),
  status              text not null default 'COMPLETED'
                      check (status in ('PLANNED', 'COMPLETED', 'DISCARDED')),
  observed_behaviors  text[] not null default '{}'
                      check (cardinality(observed_behaviors) between 1 and 5),
  reaction_latency_ms integer check (
                        reaction_latency_ms is null
                        or reaction_latency_ms between 0 and 10000
                      ),
  result_summary      text not null check (char_length(result_summary) between 1 and 180),
  owner_feedback      text check (owner_feedback in ('YES', 'NO', 'UNKNOWN')),
  created_at          timestamptz not null default now(),
  check (
    observed_behaviors <@ array[
      'HEAD_TURN',
      'EAR_RAISE',
      'APPROACH',
      'PLAY_READY',
      'STILL_ATTENTIVE',
      'NO_VISIBLE_RESPONSE'
    ]::text[]
  ),
  unique (user_id, client_request_id)
);

create table public.signal_map_entries (
  dog_id            uuid not null references public.dogs (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  category          text not null check (category in (
                      'PLAY',
                      'ATTENTION',
                      'CURIOSITY',
                      'CONTACT'
                    )),
  state             text not null default 'DISCOVERING'
                    check (state in ('DISCOVERING', 'LEARNING', 'RECURRING')),
  attempt_count     integer not null default 0 check (attempt_count >= 0),
  confirm_count     integer not null default 0 check (confirm_count >= 0),
  contradict_count  integer not null default 0 check (contradict_count >= 0),
  unknown_count     integer not null default 0 check (unknown_count >= 0),
  last_summary      text check (last_summary is null or char_length(last_summary) <= 180),
  updated_at        timestamptz not null default now(),
  primary key (dog_id, category),
  check (confirm_count + contradict_count + unknown_count <= attempt_count)
);

comment on table public.signal_experiments is
  'Dogly Signals attempts. Stores observable reactions to safe sound categories, not translations.';
comment on table public.signal_map_entries is
  'Per-dog deterministic sound reaction map derived from signal_experiments and owner feedback.';

create index signal_experiments_dog_created_idx
  on public.signal_experiments (dog_id, created_at desc, id);

create index signal_experiments_user_created_idx
  on public.signal_experiments (user_id, created_at desc, id);

create index signal_map_entries_user_dog_idx
  on public.signal_map_entries (user_id, dog_id);

create trigger trg_signal_map_entries_updated_at
  before update on public.signal_map_entries
  for each row execute function public.set_updated_at();

alter table public.signal_experiments enable row level security;
alter table public.signal_experiments force row level security;
alter table public.signal_map_entries enable row level security;
alter table public.signal_map_entries force row level security;

create policy signal_experiments_select_own on public.signal_experiments
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.dogs
      where dogs.id = signal_experiments.dog_id
        and dogs.owner_id = auth.uid()
    )
  );

create policy signal_map_entries_select_own on public.signal_map_entries
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.dogs
      where dogs.id = signal_map_entries.dog_id
        and dogs.owner_id = auth.uid()
    )
  );

grant select on public.signal_experiments to authenticated;
grant select on public.signal_map_entries to authenticated;
grant all on public.signal_experiments to service_role;
grant all on public.signal_map_entries to service_role;
