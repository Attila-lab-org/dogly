-- Rate limiting per-utente (audit sicurezza 2026-09-07): fixed window su
-- finestre da N secondi, una riga per (user_id, bucket, window_start).
-- Scritta SOLO dal backend (connection role service/postgres): anon e
-- authenticated restano fuori, come per le altre tabelle internal.

create table if not exists internal.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

create index if not exists rate_limits_window_idx
  on internal.rate_limits (window_start);

grant all on internal.rate_limits to service_role;
revoke all on internal.rate_limits from anon, authenticated;
