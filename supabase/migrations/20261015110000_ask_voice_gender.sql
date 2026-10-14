-- Preferred speaking voice for DOGly Live (mapped server-side to OpenAI voices).

alter table public.profiles
  add column if not exists ask_voice_gender text not null default 'FEMALE'
  check (ask_voice_gender in ('FEMALE', 'MALE'));

comment on column public.profiles.ask_voice_gender is
  'Owner preference for DOGly Live voice. FEMALE→marin, MALE→cedar (server mapping).';

grant update (locale, timezone, display_name, ask_voice_gender) on public.profiles to authenticated;
