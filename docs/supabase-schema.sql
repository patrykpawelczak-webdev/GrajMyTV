create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 2 and 24),
  role text not null default 'tester' check (role in ('admin', 'tester', 'player')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rodziniada_solo_results (
  id uuid primary key default gen_random_uuid(),
  challenge_key date not null,
  challenge_number integer not null,
  player_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  nickname text not null check (char_length(trim(nickname)) between 2 and 24),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score >= 0),
  misses integer not null check (misses between 0 and 3),
  revealed jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_key, player_id)
);

create index if not exists rodziniada_solo_results_ranking_idx
  on public.rodziniada_solo_results (challenge_key, score desc, misses asc, submitted_at asc);

alter table public.profiles enable row level security;
alter table public.rodziniada_solo_results enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_select_public_login on public.profiles;
create policy profiles_select_public_login
  on public.profiles
  for select
  to anon
  using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Wyniki sa na razie czytane i zapisywane przez backend GrajMyTV
-- z kluczem serwerowym Supabase. Nie dodajemy publicznych polityk
-- do tabeli wynikow, zeby nikt nie wysylal wynikow bezposrednio z przegladarki.
