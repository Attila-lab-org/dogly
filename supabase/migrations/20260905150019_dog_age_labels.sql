-- Align the persisted dog age value with the public API/mobile contract.
-- The app may send an exact Italian age label when no birth date is known.

alter table public.dogs
  drop constraint if exists dogs_age_stage_check;

alter table public.dogs
  add constraint dogs_age_stage_check
  check (
    age_stage in ('PUPPY', 'ADOLESCENT', 'ADULT', 'SENIOR', 'UNKNOWN')
    or age_stage ~ '^(Meno di 1 anno|[0-9]+ anno|[0-9]+ anni)$'
  );
