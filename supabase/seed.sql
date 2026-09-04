-- supabase/seed.sql
-- Non-sensitive LOCAL fixtures only (Spec §3). Never run against staging/production.
-- Provides two demo users so RLS negative tests and local development have fixtures.
-- Taxonomy/reference seeds live in migration 0011 (they are schema, not fixtures).

-- Demo users (Supabase local-dev pattern; password is a throwaway local credential)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'demo.alice@example.local',
   crypt('local-only-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'demo.bob@example.local',
   crypt('local-only-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
-- profiles rows are auto-created by the on_auth_user_created trigger (0002).

-- Demo dogs (one per user; V1 plan limit is 1 dog)
insert into public.dogs (id, owner_id, name, age_stage, size, breed_label, is_mix, sex, weight_kg)
values
  ('aaaa1111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'Rocky', 'ADULT', 'MEDIUM', 'Mixed breed', true, 'MALE', 18.5),
  ('bbbb2222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   'Luna', 'PUPPY', 'SMALL', 'Unknown', true, 'FEMALE', 6.2)
on conflict (id) do nothing;

-- FREE subscription mirrors + current-month usage ledgers (3/3 allowances)
insert into public.subscriptions (user_id, plan, status, store)
values
  ('11111111-1111-1111-1111-111111111111', 'FREE', 'ACTIVE', null),
  ('22222222-2222-2222-2222-222222222222', 'FREE', 'ACTIVE', null)
on conflict (user_id) do nothing;

insert into public.usage_ledgers (
  user_id, period_start, reset_at, behavior_limit, digestive_limit)
values
  ('11111111-1111-1111-1111-111111111111',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 3, 3),
  ('22222222-2222-2222-2222-222222222222',
   date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 3, 3)
on conflict (user_id, period_start) do nothing;

-- A completed behavior event for Alice/Rocky so diary/result screens have data
insert into public.behavior_captures (
  id, dog_id, user_id, client_request_id, storage_path, duration_ms, has_audio, bytes,
  retention_state, expires_at)
values (
  'cccc3333-3333-3333-3333-333333333333',
  'aaaa1111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'seed-capture-001',
  'users/11111111-1111-1111-1111-111111111111/dogs/aaaa1111-1111-1111-1111-111111111111/behavior/dddd4444-4444-4444-4444-444444444444/eeee5555-eeee-5555-eeee-555555555555.mp4',
  12000, true, 4500000, 'TEMPORARY', now() + interval '24 hours')
on conflict (id) do nothing;

insert into public.behavior_events (
  id, capture_id, dog_id, user_id, status, primary_intent, confidence_band, summary,
  context_bucket, policy_version, taxonomy_version, personal_memory_version, completed_at)
values (
  'dddd4444-4444-4444-4444-444444444444',
  'cccc3333-3333-3333-3333-333333333333',
  'aaaa1111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'COMPLETED', 'PLAY_INTERACTION', 'MEDIUM',
  'Sembra voler giocare / continuare l''interazione.',
  'HOME', 'policy-v0', 'v0', 'none', now())
on conflict (id) do nothing;

insert into public.behavior_feedback (event_id, user_id, value)
values (
  'dddd4444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111', 'YES')
on conflict (event_id, user_id) do nothing;

insert into public.knowledge_scores (dog_id, score, components, version)
values (
  'aaaa1111-1111-1111-1111-111111111111', 0.050,
  '{"eligible_event_volume": 0.05, "temporal_diversity": 0, "context_diversity": 0, "feedback_coverage": 0, "mature_pattern_coverage": 0}',
  'v0')
on conflict do nothing;
