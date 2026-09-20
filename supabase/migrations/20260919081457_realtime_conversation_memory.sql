create table public.realtime_conversation_memories (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_session_id uuid references public.realtime_sessions(id) on delete set null,
  topic text not null check (char_length(topic) between 2 and 180),
  turns_json jsonb not null default '[]'::jsonb,
  last_talked_at timestamptz not null default now(),
  unique (user_id, dog_id)
);

comment on table public.realtime_conversation_memories is
  'Last conversation with one owner and dog, so DOGly can offer to resume.';

alter table public.realtime_conversation_memories enable row level security;
alter table public.realtime_conversation_memories force row level security;

create policy realtime_conversation_memories_own
  on public.realtime_conversation_memories
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.realtime_conversation_memories from anon, authenticated;
grant select on public.realtime_conversation_memories to authenticated;
grant all on public.realtime_conversation_memories to service_role;

create index realtime_conversation_memories_owner_dog_idx
  on public.realtime_conversation_memories(user_id, dog_id, last_talked_at desc);
