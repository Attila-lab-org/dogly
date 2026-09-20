-- Intelligence V3: owner-confirmed weight history, external food lookup
-- audit, and server-only knowledge import receipts. No pgvector.

alter table public.food_products
  add column if not exists barcode text,
  add column if not exists external_source text,
  add column if not exists external_code text;

create table if not exists public.dog_weight_events (
  id                    uuid primary key default gen_random_uuid(),
  dog_id                uuid not null references public.dogs (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  weight_kg             numeric(6,2) not null check (weight_kg > 0 and weight_kg < 200),
  body_condition_score  smallint check (body_condition_score between 1 and 9),
  source                text not null default 'OWNER'
                        check (source in ('OWNER', 'VET', 'SCALE')),
  recorded_at           timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create index if not exists dog_weight_events_dog_idx
  on public.dog_weight_events (dog_id, recorded_at desc);

alter table public.dog_weight_events enable row level security;
alter table public.dog_weight_events force row level security;

create policy dog_weight_events_select_own
  on public.dog_weight_events for select to authenticated
  using (user_id = auth.uid());

grant select on public.dog_weight_events to authenticated;
grant all on public.dog_weight_events to service_role;

create table if not exists public.external_food_lookups (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  dog_id             uuid not null references public.dogs (id) on delete cascade,
  barcode            text not null,
  provider           text not null default 'open_pet_food_facts',
  provider_code      text,
  raw_payload        jsonb not null default '{}'::jsonb,
  status             text not null
                     check (status in ('CANDIDATE', 'CONFIRMED', 'DISCARDED')),
  food_product_id    uuid references public.food_products (id) on delete set null,
  client_request_id  text not null,
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  unique (user_id, client_request_id)
);

create index if not exists external_food_lookups_user_idx
  on public.external_food_lookups (user_id, created_at desc);

alter table public.external_food_lookups enable row level security;
alter table public.external_food_lookups force row level security;

create policy external_food_lookups_select_own
  on public.external_food_lookups for select to authenticated
  using (user_id = auth.uid());

grant select on public.external_food_lookups to authenticated;
grant all on public.external_food_lookups to service_role;

create table if not exists internal.knowledge_claim_imports (
  id                uuid primary key default gen_random_uuid(),
  registry_version  text not null,
  claim_id          text not null,
  checksum          text not null,
  source_ids        jsonb not null default '[]'::jsonb,
  imported_at       timestamptz not null default now()
);

create table if not exists internal.knowledge_eval_runs (
  id          uuid primary key default gen_random_uuid(),
  suite       text not null,
  passed      boolean not null,
  metrics     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table internal.knowledge_claim_imports enable row level security;
alter table internal.knowledge_eval_runs enable row level security;
alter table internal.knowledge_claim_imports force row level security;
alter table internal.knowledge_eval_runs force row level security;

grant all on internal.knowledge_claim_imports to service_role;
grant all on internal.knowledge_eval_runs to service_role;

comment on table public.dog_weight_events is
  'Owner-confirmed weight/BCS monitoring facts. Not a clinical diagnosis.';
comment on table public.external_food_lookups is
  'Open Pet Food Facts candidates. Only CONFIRMED rows may become food_products.';
comment on table internal.knowledge_claim_imports is
  'Audit receipts for bundled Intelligence V3 claims. Retrieval stays in-repo.';
