-- Prevent concurrent devices from creating multiple special Story albums for
-- the same dog. Ordinary albums may still share titles.

create unique index if not exists dog_albums_single_story_idx
  on public.dog_albums (dog_id)
  where lower(btrim(title)) = 'storie';
