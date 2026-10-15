-- Giochi: aggiunge 'match' (Bau Match) ai game id ammessi.
-- Forward-only: le migrazioni precedenti restano immutate.

alter table public.game_scores
  drop constraint game_scores_game_check;

alter table public.game_scores
  add constraint game_scores_game_check
  check (game in ('squirrel', 'agility', 'sniff', 'match'));
