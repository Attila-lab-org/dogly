-- Preserve the catalog image separately from the private label upload.
-- Catalog candidates are public provider URLs; label_image_path remains private
-- owner media and is never overwritten by catalog confirmation.
alter table public.food_products
  add column if not exists catalog_image_url text;
