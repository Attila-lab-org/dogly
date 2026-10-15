-- Giochi: punteggi settimanali per la classifica "Giochi del quartiere".
-- Una riga per partita; week_start = lunedì della settimana (azzera lunedì).
-- Idempotenza lato client: unique (user_id, game, client_request_id).

create table public.game_scores (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  dog_id            uuid not null references public.dogs (id) on delete cascade,
  game              text not null check (game in ('squirrel')),
  score             smallint not null check (score between 0 and 500),
  week_start        date not null,
  client_request_id text not null check (char_length(client_request_id) between 8 and 128),
  created_at        timestamptz not null default now(),
  unique (user_id, game, client_request_id)
);

create index game_scores_leaderboard_idx
  on public.game_scores (game, week_start, score desc);

create index game_scores_user_idx
  on public.game_scores (user_id, game, week_start);

comment on table public.game_scores is
  'Weekly arcade scores. Leaderboard reads best-per-dog per week; avatar only for PUBLIC dog profiles.';

alter table public.game_scores enable row level security;
alter table public.game_scores force row level security;

-- La classifica è leggibile da tutti gli utenti autenticati: espone solo
-- nome del cane + punteggio (mai dati dell'umano; avatar solo se il profilo
-- cane è PUBLIC per dog_profile_visibility).
create policy game_scores_select_authenticated on public.game_scores
  for select to authenticated
  using (true);

create policy game_scores_insert_own on public.game_scores
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where dogs.id = game_scores.dog_id
        and dogs.owner_id = (select auth.uid())
    )
  );
