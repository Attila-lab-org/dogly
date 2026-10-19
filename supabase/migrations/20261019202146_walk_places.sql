alter table public.walks
  add column if not exists park jsonb,
  add column if not exists park_visited boolean not null default false;

alter table public.walks add constraint walks_park_object
  check (park is null or (jsonb_typeof(park) = 'object'
    and park ?& array['id','name','lat','lng']
    and jsonb_typeof(park->'id') = 'string'
    and jsonb_typeof(park->'name') = 'string'
    and jsonb_typeof(park->'lat') = 'number'
    and jsonb_typeof(park->'lng') = 'number'));
-- Existing owner-only RLS and grants continue to protect both columns.
