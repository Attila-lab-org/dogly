-- Supabase default privileges can grant client writes on newly created tables.
-- Reassert the API/service boundary explicitly and forward-only.

revoke all on public.dog_lifestyle_profiles from anon, authenticated;
revoke all on public.advice_outcomes from anon, authenticated;

grant select on public.dog_lifestyle_profiles to authenticated;
grant select on public.advice_outcomes to authenticated;

grant all on public.dog_lifestyle_profiles to service_role;
grant all on public.advice_outcomes to service_role;
