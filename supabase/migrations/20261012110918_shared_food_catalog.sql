-- Shared source data only. Never copy personal lookups, owner edits or feeding history.
create table public.food_catalog_products (
  barcode text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  fetched_at timestamptz not null default now()
);
create table public.food_catalog_pages (
  cache_key text primary key,
  barcodes jsonb not null check (jsonb_typeof(barcodes) = 'array'),
  next_page integer check (next_page > 1),
  fetched_at timestamptz not null default now()
);
alter table public.food_catalog_products enable row level security;
alter table public.food_catalog_products force row level security;
alter table public.food_catalog_pages enable row level security;
alter table public.food_catalog_pages force row level security;
revoke all on public.food_catalog_products, public.food_catalog_pages from public, anon, authenticated;
grant all on public.food_catalog_products, public.food_catalog_pages to service_role;
comment on table public.food_catalog_products is
  'Public Open Pet Food Facts data (ODbL), written by backend only; no owner or dog data.';
comment on table public.food_catalog_pages is
  'Shared source pagination cache. Query keys hashed; no personal lookup identifiers.';
