-- Cover advice outcome foreign keys flagged by the database performance advisor.

create index advice_outcomes_event_idx
  on public.advice_outcomes (event_id);

create index advice_outcomes_dog_idx
  on public.advice_outcomes (dog_id, created_at desc);
