-- Retention cleanup clears object paths after deletion. The original schema
-- declared these columns NOT NULL, which made internal.mark_media_deleted()
-- fail after successfully removing the storage object.

alter table public.behavior_captures
  alter column storage_path drop not null;

alter table public.fecal_events
  alter column image_path drop not null;
