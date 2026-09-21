-- ============================================================
--  Coaching Brain - Datenbankschema
--  Postgres (Supabase). Stand: 21.09.2026
--
--  Diese Datei baut eine leere Datenbank vollstaendig auf.
--  Sie ist idempotent: mehrfaches Ausfuehren schadet nicht.
--
--  Reihenfolge beim Umzug:
--    1. Diese Datei einmal ausfuehren
--    2. Daten aus der alten Instanz einspielen (siehe unten)
--    3. SUPABASE_URL und SUPABASE_SERVICE_KEY in den Env-Vars setzen
-- ============================================================


-- ------------------------------------------------------------
--  0. Hilfsfunktion exec_sql
--
--  Der Anwendungscode legt fehlende Tabellen und Spalten beim
--  Start selbst an und ruft dafuer diese Funktion ueber die
--  REST-Schnittstelle auf (/rest/v1/rpc/exec_sql).
--  OHNE SIE funktioniert dieser Selbstaufbau nicht.
--
--  ACHTUNG: Die Funktion fuehrt beliebiges SQL mit den Rechten
--  ihres Besitzers aus. Erreichbar ist sie nur mit dem
--  Service Key, der ausschliesslich serverseitig liegen darf.
--  Wer den Schluessel hat, hat die ganze Datenbank.
-- ------------------------------------------------------------
create or replace function exec_sql(sql text)
returns void
language plpgsql
security definer
as $$
begin
  execute sql;
end;
$$;

-- Die Rollen anon und authenticated gibt es nur bei Supabase. Auf einem
-- gewoehnlichen Postgres wird ihnen nichts entzogen, was es nicht gibt.
revoke all on function exec_sql(text) from public;
do $rev$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function exec_sql(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function exec_sql(text) from authenticated;
  end if;
end $rev$;


-- ------------------------------------------------------------
--  1. Spieler
--
--  Ein Datensatz je Spieler. Das gesamte Profil liegt als JSON
--  in "data" - es gibt bewusst kein festes Spaltenschema, damit
--  neue Felder ohne Migration dazukommen koennen.
--
--  Felder in data (Stand heute):
--    id, fn, ln, dob, sex, pos, club, verein, team, halle,
--    status, hgt, wgt, phv, masse[], notes,
--    diag[]        - Leistungsdiagnostik, je Eintrag date + s10,
--                    s30, cr, cl, mr, ml, sw, ift
--    praevention[] - Screening, je Eintrag datum + ktw_r, ktw_l,
--                    toe, n9090_r/_l, ob_r/_l, mtp_r/_l,
--                    fersen_r/_l, couch_r/_l, aslr_r/_l
--    verletzungen[], empfehlung{}
--
--  ENTHAELT GESUNDHEITSDATEN MINDERJAEHRIGER (Art. 9 DSGVO).
-- ------------------------------------------------------------
create table if not exists cb_players (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);

create index if not exists cb_players_updated_idx on cb_players (updated_at desc);


-- ------------------------------------------------------------
--  2. Spielerzugang
--
--  Benutzername und Passwort je Spieler. Passwoerter liegen als
--  PBKDF2-SHA256 mit 120.000 Runden und eigenem Salt, niemals im
--  Klartext. invite_token ist der Einladungslink, er laeuft nach
--  48 Stunden ab.
--
--  status: 'neu' | 'eingeladen' | 'aktiv' | 'gesperrt'
-- ------------------------------------------------------------
create table if not exists cb_player_auth (
  player_id       text primary key,
  username        text,
  pw_hash         text,
  pw_salt         text,
  invite_token    text,
  invite_expires  timestamptz,
  status          text        not null default 'neu',
  last_login      timestamptz,
  created_at      timestamptz not null default now()
);

-- Benutzername eindeutig, Gross- und Kleinschreibung egal
create unique index if not exists cb_auth_user_idx
  on cb_player_auth (lower(username)) where username is not null;

create index if not exists cb_auth_token_idx on cb_player_auth (invite_token);


-- ------------------------------------------------------------
--  3. Anmeldungen
--
--  Eine Zeile je aktiver Anmeldung, 30 Tage gueltig. Abgelaufene
--  Zeilen werden beim naechsten Zugriff entfernt; ein regelmaessiges
--  Aufraeumen waere trotzdem sinnvoll (siehe ganz unten).
-- ------------------------------------------------------------
create table if not exists cb_player_session (
  token       text primary key,
  player_id   text        not null,
  expires     timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists cb_session_player_idx on cb_player_session (player_id);
create index if not exists cb_session_expires_idx on cb_player_session (expires);


-- ------------------------------------------------------------
--  4. Trainings
--
--  Ein Training ist der Kalendereintrag: wann und wo trainiert
--  wird. Der Trainingsinhalt (die "Einheit") haengt nicht daran.
--
--  team: W13 W14 W16 M13 M14 M16 (Feld), WP W15 MP M15 (Halle)
--
--  Hinweis fuer den Umzug: die heutige Tabelle traegt zusaetzlich
--  die Altspalten uhrzeit, erstellt_am und plan_id aus einer
--  frueheren Fassung. Sie werden nicht mehr beschrieben und
--  fehlen hier bewusst.
-- ------------------------------------------------------------
create table if not exists cb_termine (
  id          uuid primary key default gen_random_uuid(),
  team        text        not null,
  datum       date        not null,
  zeit        text,
  titel       text,
  ort         text,
  created_at  timestamptz not null default now()
);

create index if not exists cb_termine_team_idx on cb_termine (team, datum);


-- ------------------------------------------------------------
--  5. Rueckmeldungen
--
--  Wer hat zu welchem Training zu- oder abgesagt. Die Anmeldung
--  oeffnet sieben Tage vorher und schliesst nach dem Termin.
--
--  status: 'zu' | 'ab' | 'verletzt'
--  grund:  freiwilliger Text des Spielers, oder der Vermerk
--          'vom Trainer eingetragen' beim Nachtragen
--
--  'verletzt' ist eine Gesundheitsangabe (Art. 9 DSGVO).
-- ------------------------------------------------------------
create table if not exists cb_anwesenheit (
  id          uuid primary key default gen_random_uuid(),
  termin_id   text not null,
  player_id   text not null,
  status      text not null,
  grund       text,
  updated_at  timestamptz not null default now()
);

create index if not exists cb_anw_idx on cb_anwesenheit (termin_id, player_id);


-- ------------------------------------------------------------
--  6. Trainingsplaene und Bausteine
--
--  data enthaelt blocks[] mit slots[]; ein Slot traegt imageKey,
--  sets, reps, metric (reps | time | distance), intensity, rest,
--  group (Supersatz: '-' oder A bis F) und note.
-- ------------------------------------------------------------
create table if not exists cb_saved_plans (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);

create table if not exists cb_saved_blocks (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  type        text        not null default 'main',
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);

-- Hochgeladene Trainingsdokumente (PDF-Ablage)
create table if not exists cb_training_docs (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);


-- ------------------------------------------------------------
--  7. Uebungen
--
--  Nur die Abweichungen vom Dateinamen. Der Schluessel ex_id ist
--  der Dateiname des Bildes ohne Endung und bleibt unveraendert,
--  damit gespeicherte Plaene ihre Uebungen wiederfinden. Name und
--  Kategorie sind reine Anzeige und jederzeit aenderbar.
-- ------------------------------------------------------------
create table if not exists cb_exercise_meta (
  ex_id       text primary key,
  name        text,
  kategorie   text,
  image_key   text,
  updated_at  timestamptz not null default now()
);


-- ------------------------------------------------------------
--  8. Wissensbasis (optional)
--
--  Nur noetig, wenn die KI-Funktionen mitgenommen werden.
--  brain_chunks braucht die Erweiterung pgvector.
--  Die Planerzeugung per KI (api/generate.js) wird nicht genutzt
--  und soll beim Umzug entfallen.
-- ------------------------------------------------------------
create table if not exists cb_knowledge (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz default now()
);

-- pgvector steht nicht auf jedem Postgres zur Verfuegung. Fehlt es, wird
-- dieser Teil uebersprungen statt den Rest des Skripts abzubrechen.
do $vec$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create extension if not exists vector;
    execute $ddl$
      create table if not exists brain_chunks (
        id            text primary key,
        titel         text not null,
        inhalt        text not null,
        tags          text[],
        quelle        text,
        cluster_id    integer,
        cluster_label text,
        embedding     vector(1536)
      )$ddl$;
    execute 'create index if not exists brain_chunks_emb_idx'
      || ' on brain_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 10)';
  else
    raise notice 'pgvector ist nicht verfuegbar - brain_chunks wurde uebersprungen. '
      'Ohne diese Tabelle fallen nur die KI-Funktionen aus.';
  end if;
end $vec$;


-- ------------------------------------------------------------
--  9. PostgREST die Aenderungen mitteilen
-- ------------------------------------------------------------
notify pgrst, 'reload schema';


-- ============================================================
--  ANHANG
-- ============================================================
--
--  Daten aus der alten Instanz uebernehmen
--  ---------------------------------------
--  Nur die Nutzdaten, nicht das Schema:
--
--    pg_dump --data-only --no-owner \
--      -t cb_players -t cb_player_auth -t cb_termine \
--      -t cb_anwesenheit -t cb_saved_plans -t cb_saved_blocks \
--      -t cb_exercise_meta -t cb_training_docs -t cb_knowledge \
--      "<alte Verbindung>" > daten.sql
--
--  cb_player_session wird bewusst nicht uebernommen: die Spieler
--  melden sich nach dem Umzug einmal neu an.
--
--
--  Noch nicht eingerichtet, vor dem Echtbetrieb zu tun
--  ---------------------------------------------------
--  * Row Level Security. Heute darf der Service Key alles, eine
--    zweite Verteidigungslinie gibt es nicht.
--  * Naechtliches Backup der cb_-Tabellen.
--  * Aufraeumen abgelaufener Anmeldungen, etwa taeglich:
--      delete from cb_player_session where expires < now();
--  * Fremdschluessel: cb_anwesenheit.termin_id und player_id sind
--    heute text ohne Bezug auf cb_termine bzw. cb_players. Sauberer
--    waere uuid mit on delete cascade - das setzt aber voraus, dass
--    die Anwendung entsprechend angepasst wird.
--  * Loeschkonzept fuer Spieler, die den Kader verlassen.
