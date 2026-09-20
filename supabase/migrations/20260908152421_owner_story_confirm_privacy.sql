-- Confirmed owner stories retain only reviewed facts. The raw transcript is
-- intentionally erased after confirmation, so the column must be nullable.

alter table public.owner_reported_observations
  alter column transcript drop not null;
