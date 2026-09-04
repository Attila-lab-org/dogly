-- 0005_digestive_core.sql
-- Scope (Spec V1 §11): fecal, food, feeding, baseline, insight.
-- Acceptance: food verification fields nullable until confirmed.
--
-- Digestive/Nutrition is a separate intelligence domain (Spec §19): it shares identity,
-- timeline, subscription and governance infrastructure but never contaminates behavioral
-- interpretation automatically.

-- ---------------------------------------------------------------------------
-- public.fecal_events — stool photo event (Spec §10.3, §19.1)
-- ---------------------------------------------------------------------------
create table public.fecal_events (
  id                        uuid primary key default gen_random_uuid(),
  dog_id                    uuid not null references public.dogs (id) on delete cascade,
  user_id                   uuid not null references auth.users (id) on delete cascade,
  client_request_id         text,             -- idempotency for init (Spec §22)
  image_path                text,             -- object path in private bucket digestive-raw
  image_quality             text check (image_quality in ('SUFFICIENT', 'INSUFFICIENT')),
  fecal_score_estimate      smallint check (fecal_score_estimate is null
                              or fecal_score_estimate between 1 and 7),
  consistency               text check (consistency in
                              ('HARD', 'FORMED', 'SOFT', 'UNFORMED', 'WATERY', 'UNKNOWN')),
  shape                     text,             -- observable descriptors, free text
  color                     text,             -- normalized broad category + uncertainty
  mucus_candidate           text check (mucus_candidate in
                              ('NONE', 'POSSIBLE', 'CLEAR', 'UNKNOWN')),
  blood_candidate           text check (blood_candidate in
                              ('NONE', 'POSSIBLE', 'CLEAR', 'UNKNOWN')),
  melena_candidate          text check (melena_candidate in
                              ('NONE', 'POSSIBLE', 'CLEAR', 'UNKNOWN')),
  foreign_material_candidate text check (foreign_material_candidate in
                              ('NONE', 'POSSIBLE', 'CLEAR', 'UNKNOWN')),
  confidence_band           text check (confidence_band in ('LOW', 'MEDIUM', 'HIGH')),
  status                    text not null default 'DRAFT'
                            check (status in (
                              'DRAFT', 'UPLOADING', 'QUEUED', 'OBSERVING', 'INTERPRETING',
                              'COMPLETED', 'REJECTED_QUALITY', 'FAILED_RETRYABLE',
                              'FAILED_TERMINAL', 'CANCELLED')),
  feeding_period_id         uuid,             -- active FeedingPeriod at event time (§19.2);
                                              -- FK added below after feeding_periods exists
  created_at                timestamptz not null default now(),
  completed_at              timestamptz,
  unique (user_id, client_request_id)
);

comment on table public.fecal_events is
  'Stool observation event. Candidate flags are candidates only — a vision model failing '
  'to see an anomaly never proves absence (Spec §19.3). fecal_score_estimate is an '
  'estimate (1–7), not a lab measurement.';

create index fecal_events_dog_timeline_idx on public.fecal_events (dog_id, created_at desc);
create index fecal_events_user_timeline_idx on public.fecal_events (user_id, created_at desc);

alter table public.fecal_events enable row level security;
alter table public.fecal_events force row level security;

-- Spec §12 matrix: mobile read own; capture metadata written via API only,
-- derived fields written by the worker.
create policy fecal_events_select_own on public.fecal_events
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.fecal_events to authenticated;
grant all on public.fecal_events to service_role;

-- ---------------------------------------------------------------------------
-- public.food_products — label extraction, verified by the user (Spec §10.3, §20)
-- Verification fields stay NULL until the user confirms (migration acceptance).
-- ---------------------------------------------------------------------------
create table public.food_products (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users (id) on delete cascade,
  brand                 text,
  name                  text,
  ingredients_raw       text,          -- exact OCR / user-verified string
  guaranteed_analysis   jsonb,         -- crude_protein_min, crude_fat_min, crude_fiber_max,
                                       -- moisture_max (percent, nullable, as printed §20.2)
  calories              text,          -- value + unit/basis as printed on the label
  feeding_directions    text,          -- raw text + optional structured quantity
  extraction_confidence jsonb,         -- per-field confidence; low-confidence requires verify
  label_image_path      text,          -- object path in private bucket food-labels (short TTL)
  verified_at           timestamptz,   -- NULL until user confirms on the verification screen
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.food_products is
  'Food label data. Only user-verified fields (verified_at NOT NULL) feed longitudinal '
  'nutrition correlations (Spec §20.1).';

create index food_products_owner_idx on public.food_products (owner_id, created_at desc);

alter table public.food_products enable row level security;
alter table public.food_products force row level security;

create policy food_products_select_own on public.food_products
  for select to authenticated
  using (owner_id = auth.uid());

create policy food_products_insert_own on public.food_products
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy food_products_update_own on public.food_products
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy food_products_delete_own on public.food_products
  for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.food_products to authenticated;
grant all on public.food_products to service_role;

-- ---------------------------------------------------------------------------
-- public.feeding_periods — active food / transitions (Spec §10.3, §20.1)
-- Changing quantity versions the period rather than rewriting history.
-- ---------------------------------------------------------------------------
create table public.feeding_periods (
  id               uuid primary key default gen_random_uuid(),
  dog_id           uuid not null references public.dogs (id) on delete cascade,
  food_product_id  uuid not null references public.food_products (id) on delete restrict,
  start_at         timestamptz not null default now(),
  end_at           timestamptz,
  quantity_per_day text,
  treats_notes     text,
  transition_notes text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);

comment on table public.feeding_periods is
  'Feeding history. At most one open period per dog (partial unique index below).';

create index feeding_periods_dog_idx on public.feeding_periods (dog_id, start_at desc);
-- Invariant: one active (open-ended) feeding period per dog.
create unique index feeding_periods_one_open_per_dog
  on public.feeding_periods (dog_id) where end_at is null;

-- Now that feeding_periods exists, complete the fecal_events FK (active food at event time).
alter table public.fecal_events
  add constraint fecal_events_feeding_period_fk
  foreign key (feeding_period_id) references public.feeding_periods (id) on delete set null;

alter table public.feeding_periods enable row level security;
alter table public.feeding_periods force row level security;

create policy feeding_periods_select_own on public.feeding_periods
  for select to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = auth.uid())
  );

create policy feeding_periods_insert_own on public.feeding_periods
  for insert to authenticated
  with check (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = auth.uid())
  );

create policy feeding_periods_update_own on public.feeding_periods
  for update to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = auth.uid())
  );

create policy feeding_periods_delete_own on public.feeding_periods
  for delete to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = auth.uid())
  );

grant select, insert, update, delete on public.feeding_periods to authenticated;
grant all on public.feeding_periods to service_role;

-- ---------------------------------------------------------------------------
-- internal.digestive_observations — digestive vision output (Spec §10.3, §19.1)
-- ---------------------------------------------------------------------------
create table internal.digestive_observations (
  fecal_event_id   uuid primary key references public.fecal_events (id) on delete cascade,
  provider         text not null,
  model            text not null,
  version          text,
  schema_version   text not null,       -- Stool ObservationContract version
  observation_json jsonb not null,
  token_usage      jsonb,
  latency_ms       integer check (latency_ms is null or latency_ms >= 0),
  created_at       timestamptz not null default now()
);

comment on table internal.digestive_observations is
  'Digestive vision output. Observation is separate from the safety/rule layer (§19.3).';

grant all on internal.digestive_observations to service_role;
revoke all on internal.digestive_observations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.digestive_baselines — compare Rocky to Rocky (Spec §10.3, §19.2)
-- ---------------------------------------------------------------------------
create table public.digestive_baselines (
  id               uuid primary key default gen_random_uuid(),
  dog_id           uuid not null references public.dogs (id) on delete cascade,
  rolling_score    numeric(4,2) check (rolling_score is null
                     or rolling_score between 1 and 7),
  frequency_stats  jsonb,               -- events/week, distribution over time
  variability      numeric(6,3),
  data_sufficiency text not null default 'INSUFFICIENT'
                   check (data_sufficiency in ('INSUFFICIENT', 'PARTIAL', 'SUFFICIENT')),
  version          text not null,       -- baseline algorithm version
  calculated_at    timestamptz not null default now()
);

comment on table public.digestive_baselines is
  'Longitudinal digestive baseline per dog. Temporal association only — never automatic '
  'causality claims (Spec §19.2).';

create index digestive_baselines_dog_idx on public.digestive_baselines (dog_id, calculated_at desc);

alter table public.digestive_baselines enable row level security;
alter table public.digestive_baselines force row level security;

create policy digestive_baselines_select_own on public.digestive_baselines
  for select to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = auth.uid())
  );

grant select on public.digestive_baselines to authenticated;
grant all on public.digestive_baselines to service_role;

-- ---------------------------------------------------------------------------
-- public.digestive_insights — per-event / trend insight with safety flags (Spec §10.3)
-- ---------------------------------------------------------------------------
create table public.digestive_insights (
  id             uuid primary key default gen_random_uuid(),
  dog_id         uuid not null references public.dogs (id) on delete cascade,
  fecal_event_id uuid references public.fecal_events (id) on delete set null,
  summary        text not null,
  trend_code     text,                -- e.g. STABLE / IMPROVING / WORSENING / CHANGE_POINT
  safety_flags   jsonb not null default '[]',  -- consumed by deterministic copy layer (§19.3)
  policy_version text,
  created_at     timestamptz not null default now()
);

comment on table public.digestive_insights is
  'Digestive insight. Generated text may summarize but can NEVER downgrade a deterministic '
  'safety flag (Spec §19.3).';

create index digestive_insights_dog_idx on public.digestive_insights (dog_id, created_at desc);

alter table public.digestive_insights enable row level security;
alter table public.digestive_insights force row level security;

create policy digestive_insights_select_own on public.digestive_insights
  for select to authenticated
  using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and d.owner_id = auth.uid())
  );

grant select on public.digestive_insights to authenticated;
grant all on public.digestive_insights to service_role;
