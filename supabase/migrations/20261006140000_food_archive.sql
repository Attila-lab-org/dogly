alter table public.food_products add column if not exists archived_at timestamptz;
create index if not exists food_products_active_idx on public.food_products(owner_id, dog_id, created_at desc) where archived_at is null;
