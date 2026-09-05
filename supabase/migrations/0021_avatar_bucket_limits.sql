-- Enforce avatar constraints at the storage boundary instead of trusting
-- client-reported file metadata (Android content:// URIs may not expose size).
update storage.buckets
set file_size_limit = 8000000,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'dog-avatars';
