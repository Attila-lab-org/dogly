-- Close direct client write paths now owned by the API and enforce upload
-- limits at the storage boundary (defence in depth; request DTOs also validate).

revoke insert, update, delete on public.care_events from authenticated;
grant select on public.care_events to authenticated;

update storage.buckets
set file_size_limit = 100000000,
    allowed_mime_types = array['video/mp4', 'video/quicktime']::text[]
where id = 'behavior-raw';

update storage.buckets
set file_size_limit = 12000000,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id in ('digestive-raw', 'food-labels');
