-- Corrections always remain useful to the owner's personal experience.
-- Research/training eligibility is a separate, server-derived consent flag.
alter table public.behavior_feedback
  add column if not exists research_eligible boolean not null default false;

comment on column public.behavior_feedback.research_eligible is
  'True only when a correction was recorded while the latest RESEARCH_TRAINING consent was granted.';

create index if not exists behavior_feedback_research_eligible_idx
  on public.behavior_feedback (updated_at)
  where research_eligible = true;
