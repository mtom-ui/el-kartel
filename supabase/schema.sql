-- "Der Hof" - Datenbankschema
--
-- Einfach 1:1 in Supabase einfügen und ausführen:
-- Dashboard -> SQL Editor -> New query -> diesen Inhalt einfügen -> Run.
-- Keine CLI, kein Deno, kein Node nötig.
--
-- Sicherheitshinweis: Die Row-Level-Security-Policies unten sind bewusst
-- offen (jeder mit dem anon key darf lesen/schreiben). Das passt zu einem
-- lokalen Party-Spiel unter Freunden, ist aber KEIN Schutz gegen jemanden,
-- der technisch versiert genug ist, direkt gegen die Supabase-REST-API zu
-- schreiben. Für einen öffentlichen/kompetitiven Einsatz müsste die
-- Rundenberechnung serverseitig (Edge Function oder Postgres-Funktion mit
-- SECURITY DEFINER) erzwungen werden statt vom Host-Browser.

create extension if not exists pgcrypto;

create table if not exists games (
  id text primary key,
  status text not null default 'LOBBY' check (status in ('LOBBY', 'PLAYING', 'FINISHED')),
  round int not null default 0,
  max_rounds int not null default 10,
  season text,
  seed bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  name text not null,
  cash numeric not null default 10000,
  reputation numeric not null default 50, -- nicht mehr verwendet (Respekt-Mechanik entfernt), bleibt zur Vermeidung eines Migrations-Risikos bestehen
  role text,
  bot_level text, -- 'easy' | 'medium' | 'hard'; null = Mensch
  persona text,   -- Profilbild-ID (siehe js/personas.js)
  connected boolean not null default true,
  created_at timestamptz not null default now()
);

alter table players add column if not exists role text;
alter table players add column if not exists bot_level text;
alter table players add column if not exists persona text;

create table if not exists player_resources (
  player_id uuid primary key references players(id) on delete cascade,
  land_ha numeric not null default 15,
  workers int not null default 20,
  grain_tons numeric not null default 0,   -- Weizen
  stock_rapeseed numeric not null default 0,
  stock_potato numeric not null default 0,
  milk_liters numeric not null default 0,
  energy numeric not null default 100,
  soil_quality numeric not null default 100,
  satisfaction numeric not null default 100,
  machine_condition numeric not null default 100,
  debt numeric not null default 0
);

-- Migration für ein bereits bestehendes Projekt (schadet nicht, wenn die
-- Spalten schon existieren):
alter table player_resources add column if not exists stock_rapeseed numeric not null default 0;
alter table player_resources add column if not exists stock_potato numeric not null default 0;
alter table player_resources add column if not exists debt numeric not null default 0;

create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  building_type text not null,
  level int not null default 1,
  condition numeric not null default 100
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  round int not null,
  action_type text not null default 'round_decision',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (player_id, round)
);

create table if not exists round_results (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null,
  breakdown jsonb not null,
  weather jsonb not null,
  market_event jsonb not null,
  created_at timestamptz not null default now(),
  unique (player_id, round)
);

-- Row Level Security -----------------------------------------------------

alter table games enable row level security;
alter table players enable row level security;
alter table player_resources enable row level security;
alter table buildings enable row level security;
alter table actions enable row level security;
alter table round_results enable row level security;

drop policy if exists "allow all games" on games;
create policy "allow all games" on games for all to anon, authenticated using (true) with check (true);

drop policy if exists "allow all players" on players;
create policy "allow all players" on players for all to anon, authenticated using (true) with check (true);

drop policy if exists "allow all player_resources" on player_resources;
create policy "allow all player_resources" on player_resources for all to anon, authenticated using (true) with check (true);

drop policy if exists "allow all buildings" on buildings;
create policy "allow all buildings" on buildings for all to anon, authenticated using (true) with check (true);

drop policy if exists "allow all actions" on actions;
create policy "allow all actions" on actions for all to anon, authenticated using (true) with check (true);

drop policy if exists "allow all round_results" on round_results;
create policy "allow all round_results" on round_results for all to anon, authenticated using (true) with check (true);

-- Realtime -----------------------------------------------------------------
-- Damit TV und Handys Änderungen live sehen (Spieler-Beitritt, Rundenwechsel,
-- Ergebnisse), müssen die Tabellen der Realtime-Publikation hinzugefügt
-- werden. Falls die Publikation schon existiert (Standard bei neuen
-- Supabase-Projekten), einfach so ausführen:

alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table player_resources;
alter publication supabase_realtime add table actions;
alter publication supabase_realtime add table round_results;
