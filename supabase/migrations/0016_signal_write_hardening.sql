-- 0016_signal_write_hardening.sql
-- Defense in depth: Signals mutations are API/service-role only.
-- RLS already has no write policies; explicit privilege revocation prevents
-- accidental future policy changes from exposing direct client mutations.

revoke insert, update, delete, truncate, references, trigger
  on public.signal_experiments
  from authenticated, anon;

revoke insert, update, delete, truncate, references, trigger
  on public.signal_map_entries
  from authenticated, anon;

grant select on public.signal_experiments to authenticated;
grant select on public.signal_map_entries to authenticated;
