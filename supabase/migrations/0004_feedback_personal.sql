-- 0004_feedback_personal.sql
-- Scope (Spec V1 §11): feedback, patterns, links, knowledge score.
-- Acceptance: no model output can update pattern via client role.
--
-- Anti-feedback-loop firewall (Spec §17): a generative prediction NEVER writes personal
-- patterns. Pattern updates go through the deterministic Personal Intelligence service
-- (service_role). Client roles get read-only access to patterns and scores.

-- ---------------------------------------------------------------------------
-- public.behavior_feedback — owner feedback, one per event (Spec §10.2, §6.1)
-- ---------------------------------------------------------------------------
create table public.behavior_feedback (
  event_id          uuid not null references public.behavior_events (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  value             text not null check (value in ('YES', 'NO', 'UNKNOWN')),
  correction_label  text,            -- optional owner correction; a label, NOT ground truth
  corrected_context jsonb,           -- optional structured context correction
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.behavior_feedback is
  'Three-way owner feedback (yes/no/unknown). Useful label, not ground truth (Spec §17.1).';

alter table public.behavior_feedback enable row level security;
alter table public.behavior_feedback force row level security;

create policy behavior_feedback_select_own on public.behavior_feedback
  for select to authenticated
  using (user_id = auth.uid());

-- Feedback is accepted only for an event owned by the caller and already completed
-- (API preferred path; direct write still cannot touch another user's event).
create policy behavior_feedback_insert_own_event on public.behavior_feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.behavior_events e
      where e.id = event_id
        and e.user_id = auth.uid()
        and e.status = 'COMPLETED'
    )
  );

create policy behavior_feedback_update_own on public.behavior_feedback
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert on public.behavior_feedback to authenticated;
grant update (value, correction_label, corrected_context) on public.behavior_feedback
  to authenticated;
grant all on public.behavior_feedback to service_role;

-- ---------------------------------------------------------------------------
-- internal.behavior_outcomes — independent observed outcomes (Spec §10.2, §17.1)
-- "What happened next" when captured/entered: independent supporting/contradicting
-- evidence for the Personal Engine. Server-only.
-- ---------------------------------------------------------------------------
create table internal.behavior_outcomes (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.behavior_events (id) on delete cascade,
  source       text not null check (source in ('OWNER_ENTRY', 'FOLLOW_UP_CAPTURE', 'EXPERT')),
  outcome_code text not null,         -- e.g. what actually happened next; coded, not prose
  payload      jsonb not null default '{}',
  observed_at  timestamptz not null default now()
);

comment on table internal.behavior_outcomes is
  'Independent observed outcomes per event (Spec §17.1). Server-only evidence source.';

create index behavior_outcomes_event_idx on internal.behavior_outcomes (event_id, observed_at desc);

grant all on internal.behavior_outcomes to service_role;
revoke all on internal.behavior_outcomes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.personal_patterns — derived aggregate from governed evidence (Spec §10.2, §17.2)
-- ---------------------------------------------------------------------------
create table public.personal_patterns (
  id               uuid primary key default gen_random_uuid(),
  dog_id           uuid not null references public.dogs (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  state            text not null default 'CANDIDATE'
                   check (state in (
                     'CANDIDATE', 'PRELIMINARY', 'ESTABLISHED', 'STRONG',
                     'CONTESTED', 'DORMANT', 'ARCHIVED')),
  support_count    integer not null default 0 check (support_count >= 0),
  confirm_count    integer not null default 0 check (confirm_count >= 0),
  contradict_count integer not null default 0 check (contradict_count >= 0),
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  reliability_band text check (reliability_band in ('LOW', 'MEDIUM', 'HIGH')),
  version          integer not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.personal_patterns is
  'Derived aggregate from events (Spec §17.1). Only the Personal Engine (service_role) '
  'may create/update rows; user review (contest/archive) flows through the API.';

create index personal_patterns_dog_idx on public.personal_patterns (dog_id, state);

alter table public.personal_patterns enable row level security;
alter table public.personal_patterns force row level security;

-- Mobile read: own dog's patterns. No insert/update/delete for client roles —
-- this is the DB-level half of the anti-feedback-loop firewall.
create policy personal_patterns_select_own on public.personal_patterns
  for select to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = auth.uid()
    )
  );

grant select on public.personal_patterns to authenticated;
grant all on public.personal_patterns to service_role;

-- ---------------------------------------------------------------------------
-- internal.pattern_event_links — which events support/contradict a pattern
-- ---------------------------------------------------------------------------
create table internal.pattern_event_links (
  pattern_id uuid not null references public.personal_patterns (id) on delete cascade,
  event_id   uuid not null references public.behavior_events (id) on delete cascade,
  relation   text not null check (relation in ('SUPPORT', 'CONTRADICT')),
  similarity numeric(5,4) check (similarity is null or similarity between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (pattern_id, event_id)
);

comment on table internal.pattern_event_links is
  'Evidence links between events and patterns. Server-only (Personal Engine).';

create index pattern_event_links_event_idx on internal.pattern_event_links (event_id);

grant all on internal.pattern_event_links to service_role;
revoke all on internal.pattern_event_links from anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.knowledge_scores — versioned product score (Spec §10.2, §18)
-- Append-only history: version + components stored so the score can be recomputed.
-- ---------------------------------------------------------------------------
create table public.knowledge_scores (
  id            uuid primary key default gen_random_uuid(),
  dog_id        uuid not null references public.dogs (id) on delete cascade,
  score         numeric(4,3) not null check (score between 0 and 1),
  components    jsonb not null,   -- per-component normalized values of the V0 formula
  version       text not null,    -- score formula version (e.g. 'v0')
  calculated_at timestamptz not null default now()
);

comment on table public.knowledge_scores is
  'Knowledge Score history: richness/diversity of usable data, NOT AI accuracy (Spec §18). '
  'Events rejected for quality or technical failure do not count.';

create index knowledge_scores_dog_idx on public.knowledge_scores (dog_id, calculated_at desc);

alter table public.knowledge_scores enable row level security;
alter table public.knowledge_scores force row level security;

create policy knowledge_scores_select_own on public.knowledge_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and d.owner_id = auth.uid()
    )
  );

-- Read-only for clients: score is computed by the server-side scoring service.
grant select on public.knowledge_scores to authenticated;
grant all on public.knowledge_scores to service_role;
