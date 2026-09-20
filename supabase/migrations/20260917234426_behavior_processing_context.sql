-- Event-scoped OWNER_REPORTED answers collected while a video is analyzed.
-- Distinct from post-result context refinement. Never becomes observation evidence.

create table if not exists public.behavior_processing_context_answers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.behavior_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  answer_id text,
  skipped boolean not null default false,
  question_version text not null default 'processing-questions/v1',
  source text not null default 'OWNER_REPORTED'
    check (source = 'OWNER_REPORTED'),
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint behavior_processing_context_one_answer
    unique (event_id, question_id, user_id),
  constraint behavior_processing_context_skip_or_answer
    check ((skipped and answer_id is null) or (not skipped and answer_id is not null))
);

create index if not exists behavior_processing_context_event_idx
  on public.behavior_processing_context_answers (event_id, created_at);

alter table public.behavior_processing_context_answers enable row level security;
alter table public.behavior_processing_context_answers force row level security;

create policy behavior_processing_context_select_own
  on public.behavior_processing_context_answers
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.behavior_processing_context_answers to authenticated;
grant all on public.behavior_processing_context_answers to service_role;

comment on table public.behavior_processing_context_answers is
  'Owner-reported processing companion answers. Event-scoped, not personal memory.';
