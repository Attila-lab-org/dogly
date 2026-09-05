-- 0020_explicit_client_grants.sql
-- Supabase's postgres default privileges grant broad table access to client
-- roles. Revoke that baseline first, then rebuild the intentional V1 matrix.

revoke all on all tables in schema public from anon, authenticated;

-- Identity and dog profile.
grant select on public.profiles to authenticated;
grant update (locale, timezone) on public.profiles to authenticated;
grant select, insert on public.user_consents to authenticated;
grant update (granted, revoked_at) on public.user_consents to authenticated;
grant select, insert, update on public.dogs to authenticated;
grant select, insert, update, delete on public.device_installations to authenticated;

-- Behavioral intelligence: derived data remains server-write-only.
grant select on public.behavior_captures to authenticated;
grant select on public.behavior_events to authenticated;
grant select, insert on public.behavior_feedback to authenticated;
grant update (value, correction_label, corrected_context)
  on public.behavior_feedback to authenticated;
grant select on public.personal_patterns to authenticated;
grant select on public.knowledge_scores to authenticated;

-- Digestive and nutrition.
grant select on public.fecal_events to authenticated;
grant select, insert, update, delete on public.food_products to authenticated;
grant select, insert, update, delete on public.feeding_periods to authenticated;
grant select on public.digestive_baselines to authenticated;
grant select on public.digestive_insights to authenticated;

-- Billing is readable by the owner but writable only by server roles.
grant select on public.subscriptions to authenticated;
grant select on public.usage_ledgers to authenticated;

-- Reference data.
grant select on public.ref_intents to authenticated;
grant select on public.ref_context_buckets to authenticated;
grant select on public.ref_status_values to authenticated;

-- Gallery and care.
grant select, insert, update on public.dog_profile_visibility to authenticated;
grant select, insert, update, delete on public.dog_albums to authenticated;
grant select, insert, update on public.dog_photos to authenticated;
grant select, insert, update, delete on public.care_events to authenticated;

-- Signals are server-computed in the postponed V1 surface.
grant select on public.signal_experiments to authenticated;
grant select on public.signal_map_entries to authenticated;

-- Reassert server access after rebuilding the client matrix.
grant all on all tables in schema public to service_role;
