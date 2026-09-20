-- Owner presentation name on the existing 1:1 account profile.
-- Completes identity without inventing a second profile table.

alter table public.profiles
  add column if not exists display_name text
  check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 80
  );

comment on column public.profiles.display_name is
  'Owner presentation name. Optional identity fact for UI and AI context; not legal identity.';

grant update (locale, timezone, display_name) on public.profiles to authenticated;
