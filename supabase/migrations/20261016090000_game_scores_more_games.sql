-- Giochi: estende i game id ammessi ai tre mini-giochi.
-- Forward-only: la migrazione 20261015120000 resta immutata.

alter table public.game_scores
  drop constraint game_scores_game_check;

alter table public.game_scores
  add constraint game_scores_game_check
  check (game in ('squirrel', 'agility', 'sniff'));
