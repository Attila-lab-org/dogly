create table public.realtime_sessions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ENDED', 'EXPIRED')),
  modality text not null default 'VOICE'
    check (modality in ('VOICE', 'TEXT')),
  model text not null,
  context_snapshot_version text not null default 'personal-dog-context/v1',
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table public.realtime_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.realtime_sessions(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  user_transcript text not null check (char_length(user_transcript) between 1 and 4000),
  assistant_text text not null,
  concern_frame jsonb not null default '{}'::jsonb,
  decision_json jsonb not null default '{}'::jsonb,
  question text,
  terminal_state text not null
    check (terminal_state in (
      'ANSWERED', 'ABSTAINED', 'SAFETY_INTERRUPT',
      'BEHAVIOR_VIDEO_HANDOFF', 'MEMORY_CONFIRMATION_REQUIRED'
    )),
  safety_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, ordinal)
);

create table public.memory_proposals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.realtime_sessions(id) on delete cascade,
  source_turn_id uuid not null references public.realtime_turns(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('ROUTINE', 'PREFERENCE', 'DIET', 'HEALTH', 'GENERAL')),
  statement text not null check (char_length(statement) between 2 and 280),
  provenance text not null default 'OWNER_REPORTED'
    check (provenance = 'OWNER_REPORTED'),
  status text not null default 'PROPOSED'
    check (status in ('PROPOSED', 'CONFIRMED', 'REJECTED', 'EXPIRED')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table internal.realtime_context_receipts (
  turn_id uuid primary key references public.realtime_turns(id) on delete cascade,
  context_version text not null,
  source_refs jsonb not null default '[]'::jsonb,
  retrieval_audit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table internal.realtime_tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.realtime_sessions(id) on delete cascade,
  turn_id uuid references public.realtime_turns(id) on delete cascade,
  tool_name text not null,
  arguments_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  latency_ms integer,
  created_at timestamptz not null default now()
);

comment on table public.realtime_sessions is
  'Short-lived DOGly conversation sessions scoped to one owner and dog.';
comment on table public.realtime_turns is
  'Auditable turn decisions. Transcript is temporary session context, not durable dog memory.';
comment on table public.memory_proposals is
  'Owner-reported facts proposed during conversation; never durable until explicit confirmation.';
comment on table internal.realtime_context_receipts is
  'Exact source references used for each generated conversational answer.';

alter table public.realtime_sessions enable row level security;
alter table public.realtime_sessions force row level security;
alter table public.realtime_turns enable row level security;
alter table public.realtime_turns force row level security;
alter table public.memory_proposals enable row level security;
alter table public.memory_proposals force row level security;
alter table internal.realtime_context_receipts enable row level security;
alter table internal.realtime_context_receipts force row level security;
alter table internal.realtime_tool_calls enable row level security;
alter table internal.realtime_tool_calls force row level security;

create policy realtime_sessions_own on public.realtime_sessions
  for all to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = (select auth.uid())
    )
  );
create policy realtime_turns_own on public.realtime_turns
  for select to authenticated using (user_id = (select auth.uid()));
create policy memory_proposals_own on public.memory_proposals
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on internal.realtime_context_receipts from anon, authenticated;
revoke all on internal.realtime_tool_calls from anon, authenticated;
grant select, insert, update on public.realtime_sessions to authenticated;
grant select on public.realtime_turns, public.memory_proposals to authenticated;
grant all on public.realtime_sessions, public.realtime_turns, public.memory_proposals to service_role;
grant all on internal.realtime_context_receipts, internal.realtime_tool_calls to service_role;

create index realtime_sessions_owner_dog_idx
  on public.realtime_sessions(user_id, dog_id, started_at desc);
create index realtime_turns_session_idx
  on public.realtime_turns(session_id, ordinal);
create index memory_proposals_session_idx
  on public.memory_proposals(session_id, status, created_at);
create index realtime_tool_calls_session_idx
  on internal.realtime_tool_calls(session_id, created_at);
