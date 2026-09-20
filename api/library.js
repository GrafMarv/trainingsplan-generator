import crypto from 'node:crypto';
// api/library.js
// GET    /api/library?collection=plans          -> { items: [...] }
// GET    /api/library?collection=blocks         -> { items: [...] }
// GET    /api/library?collection=plans&seed=1   -> WHV-Plaene einfuegen
// POST   /api/library?collection=plans          -> body = { name, data } -> { id }
// POST   /api/library?collection=blocks         -> body = { name, type, data } -> { id }
// DELETE /api/library?collection=plans&id=<id>  -> { ok: true }
// DELETE /api/library?collection=blocks&id=<id> -> { ok: true }

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const collection = (req.query.collection || '').toLowerCase();

  // ================= SPIELER-ZUGANG =================
  // collection=auth : Einladung, Passwort setzen, Login, Session  (Trainer + Spieler)
  // collection=me   : Daten des eingeloggten Spielers             (nur Spieler)
  if (collection === 'auth' || collection === 'me' || collection === 'termine') {
    return await zugang(req, res, SUPABASE_URL, headers, collection);
  }

  const erlaubt = ['plans', 'blocks', 'trainingdocs', 'exercises'];
  if (erlaubt.indexOf(collection) === -1) {
    return res.status(400).json({ error: 'collection must be one of ' + erlaubt.join(', ') });
  }
  const table = collection === 'plans' ? 'cb_saved_plans'
    : collection === 'blocks' ? 'cb_saved_blocks'
    : collection === 'trainingdocs' ? 'cb_training_docs'
    : 'cb_exercise_meta';

  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
      method: 'POST', headers,
      body: JSON.stringify({ sql:
        "create table if not exists cb_saved_plans (id uuid primary key default gen_random_uuid(), name text not null, data jsonb not null, created_at timestamptz not null default now()); " +
        "create table if not exists cb_saved_blocks (id uuid primary key default gen_random_uuid(), name text not null, type text not null default 'main', data jsonb not null, created_at timestamptz not null default now()); " +
        "create table if not exists cb_training_docs (id uuid primary key default gen_random_uuid(), name text not null, data jsonb not null, created_at timestamptz not null default now()); " +
        "create table if not exists cb_exercise_meta (ex_id text primary key, name text, kategorie text, image_key text, updated_at timestamptz not null default now()); " +
        "notify pgrst, 'reload schema';"
      })
    });
  } catch(e) {}

  const base = SUPABASE_URL + '/rest/v1/' + table;

  // ---- Uebungs-Aenderungen: ein Datensatz je Uebung, Schluessel ist die Uebungs-ID ----
  if (collection === 'exercises') {
    try {
      if (req.method === 'GET') {
        const r = await fetch(base + '?select=*', { headers });
        const rows = await r.json();
        return res.status(200).json({ items: Array.isArray(rows) ? rows : [] });
      }
      if (req.method === 'POST') {
        const { ex_id, name, kategorie, image_key } = req.body || {};
        if (!ex_id) return res.status(400).json({ error: 'ex_id fehlt' });
        const r = await fetch(base, {
          method: 'POST',
          headers: Object.assign({}, headers, { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
          body: JSON.stringify({
            ex_id: ex_id,
            name: name || null,
            kategorie: kategorie || null,
            image_key: image_key || null,
            updated_at: new Date().toISOString()
          })
        });
        const out = await r.json();
        if (!r.ok) return res.status(500).json({ error: out.message || 'Speichern fehlgeschlagen' });
        return res.status(200).json({ ok: true, item: Array.isArray(out) ? out[0] : out });
      }
      if (req.method === 'DELETE') {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: 'id fehlt' });
        await fetch(base + '?ex_id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers });
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    // SEED: GET /api/library?collection=plans&seed=1
    if (req.method === 'GET' && req.query.seed === '1' && collection === 'plans') {
      function slot(imageKey, sets, reps, metric, note, rest) {
        return { imageKey: imageKey||'', sets: sets||3, reps: reps||10, metric: metric||'reps', intensity:'', rest: rest||'', group:'-', note: note||'' };
      }
      const plans = [
        { name:'WHV | Warm Up: Sprint', data:{ blocks:[
          { type:'warmup', label:'Locker Laufen', slots:[ slot('Locker Laufen',1,7,'time','Mindestens 7 min','') ]},
          { type:'warmup', label:'Dynamisches Stretching', slots:[ slot('Ausfallschritt vorwaerts',3,3,'reps','3 Wdh./Seite',''), slot('Spider-Man Stretch',3,3,'reps','3 Wdh./Seite',''), slot('Skorpion',3,3,'reps','3 Wdh./Seite',''), slot('Inchworm',3,3,'reps','3 Wdh./Seite','') ]},
          { type:'warmup', label:'Schnelle Fuesse', slots:[ slot('Schnelle Fuesse vorwaerts',2,5,'time','maximal, 30sek Pause','30'), slot('Schnelle Fuesse seitlich',2,5,'time','maximal, 30sek Pause','30'), slot('Schnelle Fuesse rueckwaerts',2,5,'time','maximal, 30sek Pause','30'), slot('Schnelle Fuesse einseitig',1,5,'time','1x5sek/Seite, 30sek Pause','30') ]},
          { type:'warmup', label:'Lauf ABC', slots:[ slot('Skippings',2,10,'dist','Je 10m: 90% dann 100%',''), slot('Kniehebelauf',2,10,'dist','Je 10m: 90% dann 100%',''), slot('Anfersen',2,10,'dist','Je 10m: 90% dann 100%',''), slot('Scheerenlauf',2,10,'dist','Je 10m: 90% dann 100%',''), slot('Prellsprunge',2,10,'dist','Je 10m: 90% dann 100%',''), slot('Sprunglauf',2,6,'reps','6 Sprunge/Bein: 90% dann 100%','') ]},
          { type:'main', label:'Antritte & Steigerung', slots:[ slot('10m Sprint',4,10,'dist','4x 10m 100%, 60sek Erholung','60'), slot('40m fliegend Sprint',2,40,'dist','20m Anlauf+20m fliegend, 60sek Erholung','60') ]}
        ]}},
        { name:'WHV | Sprint: Antritt (10m)', data:{ blocks:[
          { type:'warmup', label:'Sprint Warm Up', slots:[ slot('',1,25,'time','Warm Up Sprint Einheit durchfuehren','') ]},
          { type:'main', label:'10m Antritte', slots:[ slot('10m Sprint',8,10,'dist','Rechter Fuss vorne, 100%, 60sek Erholung','60'), slot('',1,5,'time','3-5 min Pause',''), slot('10m Sprint',8,10,'dist','Linker Fuss vorne, 100%, 60sek Erholung','60') ]}
        ]}},
        { name:'WHV | Sprint: Fliegend (20m)', data:{ blocks:[
          { type:'warmup', label:'Sprint Warm Up', slots:[ slot('',1,25,'time','Warm Up Sprint Einheit durchfuehren','') ]},
          { type:'main', label:'20m Fliegend', slots:[ slot('20m fliegend Sprint',5,20,'dist','20m Anlauf+20m Messbereich, 100%, 60sek Erholung','60'), slot('',1,5,'time','3-5 min Pause',''), slot('20m fliegend Sprint',5,20,'dist','20m Anlauf+20m Messbereich, 100%, 60sek Erholung','60') ]}
        ]}},
        { name:'WHV | Sprint: 30 Meter', data:{ blocks:[
          { type:'warmup', label:'Sprint Warm Up', slots:[ slot('',1,25,'time','Warm Up Sprint Einheit durchfuehren','') ]},
          { type:'main', label:'30m Sprint', slots:[ slot('30m Sprint',5,30,'dist','Rechter Fuss vorne, 100%, 60sek Erholung','60'), slot('',1,5,'time','3-5 min Pause',''), slot('30m Sprint',5,30,'dist','Linker Fuss vorne, 100%, 60sek Erholung','60') ]}
        ]}},
        { name:'WHV | Stabi: Ganzkoerper', data:{ blocks:[
          { type:'main', label:'Stabi Ganzkoerper', slots:[ slot('Ausfallschritt vorwaerts',4,45,'time','15sek Pause danach','15'), slot('Standwaage',4,45,'time','l&r, 15sek Pause danach','15'), slot('Liegestuetz',4,99,'reps','maximal, 15sek Pause danach','15'), slot('Glute Bridge',4,45,'time','r&l, 15sek Pause danach','15'), slot('Schwimmer',4,45,'time','langsam, 2min Rundenpause','120') ]}
        ]}},
        { name:'WHV | Bunki Training', data:{ blocks:[
          { type:'main', label:'Bunki Training', slots:[ slot('Bunki Anterior Power Line',2,20,'time','20sek R + 20sek L',''), slot('Bunki Posterior Power Line',2,20,'time','20sek R + 20sek L',''), slot('Bunki Posterior Stabilizing Line',2,20,'time','20sek R + 20sek L',''), slot('Bunki Lateral Stabilizing Line',2,20,'time','20sek R + 20sek L',''), slot('Bunki Medial Stabilizing Line',2,20,'time','20sek R + 20sek L','') ]}
        ]}},
        { name:'WHV | Grundlagenlauf', data:{ blocks:[
          { type:'main', label:'Grundlagenlauf', slots:[ slot('Dauerlauf',1,45,'time','Tempo nach IFT: 16=6:30/km | 17=6:10 | 18=5:50 | 19=5:30 | 20=5:15 | 21=5:00 | 22=4:50 | 22.5=4:45','') ]}
        ]}},
        { name:'WHV | Ausdauer: Intervalle 15/15', data:{ blocks:[
          { type:'warmup', label:'Warm Up', slots:[ slot('Dauerlauf',1,60,'dist','1km locker einlaufen',''), slot('',1,5,'time','5min Mobilisation','') ]},
          { type:'main', label:'Intervalle 15/15', slots:[ slot('15-15 Intervall',3,5,'reps','5x 15sek Lauf/15sek Pause, 2min Satzpause. Distanz nach IFT: 16=63m | 17=67m | 18=71m | 19=75m | 20=79m | 21=83m | 22=87m | 22.5=89m','120') ]}
        ]}},
        { name:'WHV | Mobi: Unterkoerper', data:{ blocks:[
          { type:'warmup', label:'Mobi Unterkoerper', slots:[ slot('Oberschenkel Rueckseite Mobilisation',3,6,'reps','6 Wdh./Seite',''), slot('Huefte oeffnen und schliessen',3,6,'reps','6 Wdh./Seite',''), slot('Knien und Huefte strecken',3,6,'reps','6 Wdh./Seite',''), slot('90 Grad Sitz Vorlage',3,6,'reps','6 Wdh./Seite',''), slot('Wirbel abrollen',3,6,'reps','6 Wdh.','') ]}
        ]}},
        { name:'WHV | Mobi: Sprunggelenk', data:{ blocks:[
          { type:'warmup', label:'Mobi Sprunggelenk', slots:[ slot('Kniesitz',3,6,'reps','6 Wdh./Seite',''), slot('Halbkniesitz',3,6,'reps','6 Wdh./Seite',''), slot('Ausfallschritt seitlich',3,6,'reps','6 Wdh./Seite','') ]}
        ]}},
        { name:'WHV | Stretch Routine', data:{ blocks:[
          { type:'warmup', label:'WHV Stretch Routine', slots:[ slot('Stretch Vorderseite',3,5,'reps','3-5 Wdh./Seite',''), slot('Stretch Huefte',3,5,'reps','3-5 Wdh./Seite',''), slot('Stretch Huefte seitlich',3,5,'reps','3-5 Wdh./Seite',''), slot('Stretch Adduktoren',3,5,'reps','3-5 Wdh./Seite',''), slot('Stretch Rotation',3,5,'reps','3-5 Wdh./Seite',''), slot('Taube',3,5,'reps','3-5 Wdh./Seite',''), slot('Hund',3,5,'reps','3-5 Wdh.',''), slot('Stretch Rueckseite',3,5,'reps','3-5 Wdh./Seite','') ]}
        ]}},
        { name:'WHV | Mobi: Schulter & BWS', data:{ blocks:[
          { type:'warmup', label:'Mobi Schulter & BWS', slots:[ slot('Buchoeffner',3,8,'reps','8 Wdh./Seite, Block zwischen Knie und Wand',''), slot('Prayer Stretch',3,6,'reps','6 Wdh., Ausatmung in Endposition',''), slot('Schulter Aussenrotation',3,8,'reps','8 Wdh./Seite',''), slot('Wall Slides',3,8,'reps','8 Wdh., Ruecken/Schulter/Arme an Wand','') ]}
        ]}}
      ];

      const results = [];
      for (const plan of plans) {
        const r = await fetch(base, { method:'POST', headers, body: JSON.stringify({ name: plan.name, data: plan.data }) });
        if (r.ok) { const c = await r.json(); results.push({ name: plan.name, ok: true, id: c[0]&&c[0].id }); }
        else { const e = await r.text(); results.push({ name: plan.name, ok: false, error: e }); }
      }
      const ok = results.filter(r => r.ok).length;
      return res.status(200).json({ inserted: ok, total: plans.length, results });
    }

    if (req.method === 'GET') {
      const url = collection === 'blocks'
        ? base + '?select=id,name,type,data,created_at&order=created_at.desc'
        : base + '?select=id,name,data,created_at&order=created_at.desc';
      const r = await fetch(url, { headers });
      if (!r.ok) { const txt = await r.text(); return res.status(500).json({ error: 'GET failed: ' + txt }); }
      const rows = await r.json();
      return res.status(200).json({ items: rows });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
      const { name, type, data } = body;
      if (!name || !data) return res.status(400).json({ error: 'name and data required' });
      const row = collection === 'blocks' ? { name, type: type||'main', data } : { name, data };
      const r = await fetch(base, { method:'POST', headers, body: JSON.stringify(row) });
      if (!r.ok) { const txt = await r.text(); return res.status(500).json({ error: 'POST failed: ' + txt }); }
      const created = await r.json();
      return res.status(200).json({ id: created[0]&&created[0].id, ok: true });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await fetch(base + '?id=eq.' + encodeURIComponent(id), { method:'DELETE', headers });
      if (!r.ok) { const txt = await r.text(); return res.status(500).json({ error: 'DELETE failed: ' + txt }); }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

// ======================================================================
//  SPIELER-ZUGANG
//  Portabel gehalten: keine Vercel-spezifischen Aufrufe, nur fetch +
//  node:crypto. Laesst sich spaeter unveraendert auf einen Verbands-
//  Server oder eine Supabase Edge Function umziehen.
// ======================================================================

function zgZufall(n) { return crypto.randomBytes(n || 24).toString('hex'); }
function zgHash(passwort, salt) {
  return crypto.pbkdf2Sync(String(passwort), String(salt), 120000, 32, 'sha256').toString('hex');
}
function zgGleich(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
function zgInStunden(h) { return new Date(Date.now() + h * 3600 * 1000).toISOString(); }
function zgInTagen(t) { return new Date(Date.now() + t * 86400 * 1000).toISOString(); }
function zgAbgelaufen(ts) { return !ts || new Date(ts).getTime() < Date.now(); }

// Tage bis zum Termin, rein auf Datumsebene gerechnet, damit Zeitzonen
// nichts verschieben. Negativ heisst: liegt in der Vergangenheit.
const ANMELDE_FENSTER = 7;
function zgTageBis(datum) {
  const t = String(datum || '').slice(0, 10).split('-');
  if (t.length !== 3) return null;
  const ziel = Date.UTC(+t[0], +t[1] - 1, +t[2]);
  const jetzt = new Date();
  const heute = Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate());
  return Math.round((ziel - heute) / 86400000);
}
function zgAnmeldungOffen(datum) {
  const tage = zgTageBis(datum);
  return tage !== null && tage >= 0 && tage <= ANMELDE_FENSTER;
}
function zgOeffnetAm(datum) {
  const t = String(datum || '').slice(0, 10).split('-');
  if (t.length !== 3) return '';
  const d = new Date(Date.UTC(+t[0], +t[1] - 1, +t[2]) - ANMELDE_FENSTER * 86400000);
  return d.toISOString().slice(0, 10);
}

function zgBenutzername(p) {
  const roh = ((p && p.fn) || '') + '.' + ((p && p.ln) || '');
  return roh.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

function zgBasis(req) {
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
  const proto = (req.headers && req.headers['x-forwarded-proto']) || 'https';
  return host ? proto + '://' + host : '';
}

async function zugang(req, res, SUPABASE_URL, headers, collection) {
  const rest = (pfad) => SUPABASE_URL + '/rest/v1/' + pfad;

  async function hole(pfad) {
    const r = await fetch(rest(pfad), { headers });
    if (!r.ok) return [];
    const j = await r.json().catch(function () { return []; });
    return Array.isArray(j) ? j : [];
  }
  async function schreibe(tabelle, zeile, merge) {
    const h = Object.assign({}, headers, {
      'Prefer': (merge ? 'resolution=merge-duplicates,' : '') + 'return=representation'
    });
    const r = await fetch(rest(tabelle), { method: 'POST', headers: h, body: JSON.stringify(zeile) });
    const j = await r.json().catch(function () { return null; });
    return { ok: r.ok, daten: Array.isArray(j) ? j[0] : j };
  }
  async function aendere(tabelle, filter, zeile) {
    const r = await fetch(rest(tabelle + '?' + filter), {
      method: 'PATCH',
      headers: Object.assign({}, headers, { 'Prefer': 'return=representation' }),
      body: JSON.stringify(zeile)
    });
    const j = await r.json().catch(function () { return null; });
    return { ok: r.ok, daten: Array.isArray(j) ? j[0] : j };
  }
  async function entferne(tabelle, filter) {
    await fetch(rest(tabelle + '?' + filter), { method: 'DELETE', headers });
  }

  // Tabellen anlegen bzw. fehlende Spalten ergaenzen. Laeuft bei jedem Aufruf,
  // ist aber idempotent und damit unkritisch.
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
      method: 'POST', headers,
      body: JSON.stringify({ sql:
        "create table if not exists cb_player_auth (player_id text primary key); " +
        "alter table cb_player_auth add column if not exists username text; " +
        "alter table cb_player_auth add column if not exists pw_hash text; " +
        "alter table cb_player_auth add column if not exists pw_salt text; " +
        "alter table cb_player_auth add column if not exists invite_token text; " +
        "alter table cb_player_auth add column if not exists invite_expires timestamptz; " +
        "alter table cb_player_auth add column if not exists status text default 'neu'; " +
        "alter table cb_player_auth add column if not exists last_login timestamptz; " +
        "alter table cb_player_auth add column if not exists created_at timestamptz default now(); " +
        "create unique index if not exists cb_auth_user_idx on cb_player_auth (lower(username)) where username is not null; " +
        "create index if not exists cb_auth_token_idx on cb_player_auth (invite_token); " +
        "create table if not exists cb_player_session (token text primary key); " +
        "alter table cb_player_session add column if not exists player_id text; " +
        "alter table cb_player_session add column if not exists expires timestamptz; " +
        "alter table cb_player_session add column if not exists created_at timestamptz default now(); " +
        "create table if not exists cb_termine (id uuid primary key default gen_random_uuid()); " +
        "alter table cb_termine add column if not exists team text; " +
        "alter table cb_termine add column if not exists datum date; " +
        "alter table cb_termine add column if not exists zeit text; " +
        "alter table cb_termine add column if not exists titel text; " +
        "alter table cb_termine add column if not exists ort text; " +
        "alter table cb_termine add column if not exists created_at timestamptz default now(); " +
        "create table if not exists cb_anwesenheit (id uuid primary key default gen_random_uuid()); " +
        "alter table cb_anwesenheit add column if not exists termin_id text; " +
        "alter table cb_anwesenheit add column if not exists player_id text; " +
        "alter table cb_anwesenheit add column if not exists status text; " +
        "alter table cb_anwesenheit add column if not exists grund text; " +
        "alter table cb_anwesenheit add column if not exists updated_at timestamptz default now(); " +
        "create index if not exists cb_anw_idx on cb_anwesenheit (termin_id, player_id); " +
        // Die Tabellen koennen aus einer aelteren SQL stammen und Pflichtspalten
        // haben, die wir gar nicht kennen. Alles ausser unseren eigenen Spalten
        // wird optional gemacht, sonst scheitert jedes Insert.
        "do $$ declare r record; begin " +
        "  for r in select table_name, column_name from information_schema.columns " +
        "    where table_schema='public' and table_name in ('cb_anwesenheit','cb_termine') " +
        "      and is_nullable='NO' and column_default is null " +
        "      and column_name not in ('id','termin_id','player_id','status','team','datum') " +
        "  loop execute format('alter table %I alter column %I drop not null', r.table_name, r.column_name); " +
        "  end loop; end $$; " +
        "notify pgrst, 'reload schema';"
      })
    });
  } catch (e) { /* Tabellen existieren bereits */ }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const aktion = String(body.aktion || req.query.aktion || '').toLowerCase();

  // --- Trainerseite absichern, sobald TRAINER_KEY in den Env-Vars gesetzt ist ---
  function trainerOk() {
    const soll = process.env.TRAINER_KEY;
    if (!soll) return true;
    const ist = body.trainerkey || (req.headers && req.headers['x-trainer-key']) || '';
    return zgGleich(ist, soll);
  }

  async function spielerDaten(pid) {
    const rows = await hole('cb_players?id=eq.' + encodeURIComponent(pid) + '&select=data');
    return rows.length ? rows[0].data : null;
  }

  async function sessionPruefen(tok) {
    if (!tok) return null;
    const s = await hole('cb_player_session?token=eq.' + encodeURIComponent(tok) + '&select=*');
    if (!s.length) return null;
    if (zgAbgelaufen(s[0].expires)) { await entferne('cb_player_session', 'token=eq.' + encodeURIComponent(tok)); return null; }
    const a = await hole('cb_player_auth?player_id=eq.' + encodeURIComponent(s[0].player_id) + '&select=*');
    if (!a.length || a[0].status === 'gesperrt') return null;
    return a[0];
  }

  async function sessionAnlegen(pid) {
    const tok = zgZufall(32);
    await schreibe('cb_player_session', { token: tok, player_id: String(pid), expires: zgInTagen(30) });
    return tok;
  }

  try {
    // ================= collection=auth =================
    if (collection === 'auth') {

      // ---- Trainer: Übersicht aller Zugänge ----
      if (aktion === 'liste' || (req.method === 'GET' && !aktion)) {
        if (!trainerOk()) return res.status(401).json({ error: 'Trainer-Schluessel fehlt' });
        const rows = await hole('cb_player_auth?select=player_id,username,status,invite_expires,last_login,pw_hash');
        return res.status(200).json({ items: rows.map(function (r) {
          return {
            player_id: r.player_id,
            username: r.username,
            status: r.status || 'neu',
            invite_expires: r.invite_expires,
            invite_offen: !!(r.invite_expires && !zgAbgelaufen(r.invite_expires)),
            hat_passwort: !!r.pw_hash,
            last_login: r.last_login
          };
        }) });
      }

      // ---- Trainer: Einladungslink erzeugen (48 Stunden gültig) ----
      if (aktion === 'einladen') {
        if (!trainerOk()) return res.status(401).json({ error: 'Trainer-Schluessel fehlt' });
        const pid = String(body.player_id || '');
        if (!pid) return res.status(400).json({ error: 'player_id fehlt' });
        const sp = await spielerDaten(pid);
        if (!sp) return res.status(404).json({ error: 'Spieler nicht gefunden' });

        const vorhanden = await hole('cb_player_auth?player_id=eq.' + encodeURIComponent(pid) + '&select=*');
        let user = String(body.username || (vorhanden[0] && vorhanden[0].username) || zgBenutzername(sp) || '').trim().toLowerCase();
        if (!user) user = 'spieler.' + pid.slice(-4);

        // Benutzername muss eindeutig sein
        const kollision = await hole('cb_player_auth?username=eq.' + encodeURIComponent(user) + '&select=player_id');
        if (kollision.length && kollision[0].player_id !== pid) user = user + '.' + pid.slice(-3);

        const token = zgZufall(24);
        const zeile = {
          player_id: pid,
          username: user,
          invite_token: token,
          invite_expires: zgInStunden(48),
          status: (vorhanden[0] && vorhanden[0].pw_hash) ? (vorhanden[0].status || 'aktiv') : 'eingeladen'
        };
        if (vorhanden.length) await aendere('cb_player_auth', 'player_id=eq.' + encodeURIComponent(pid), zeile);
        else await schreibe('cb_player_auth', zeile);

        return res.status(200).json({
          ok: true,
          username: user,
          token: token,
          laeuft_ab: zeile.invite_expires,
          link: zgBasis(req) + '/spieler.html?einladung=' + token
        });
      }

      // ---- Trainer: Benutzername ändern ----
      if (aktion === 'username') {
        if (!trainerOk()) return res.status(401).json({ error: 'Trainer-Schluessel fehlt' });
        const pid = String(body.player_id || '');
        const user = String(body.username || '').trim().toLowerCase();
        if (!pid || !user) return res.status(400).json({ error: 'player_id und username noetig' });
        const kollision = await hole('cb_player_auth?username=eq.' + encodeURIComponent(user) + '&select=player_id');
        if (kollision.length && kollision[0].player_id !== pid) return res.status(409).json({ error: 'Benutzername ist schon vergeben' });
        const vorhanden = await hole('cb_player_auth?player_id=eq.' + encodeURIComponent(pid) + '&select=player_id');
        if (vorhanden.length) await aendere('cb_player_auth', 'player_id=eq.' + encodeURIComponent(pid), { username: user });
        else await schreibe('cb_player_auth', { player_id: pid, username: user, status: 'neu' });
        return res.status(200).json({ ok: true, username: user });
      }

      // ---- Trainer: sperren / entsperren / Zugang löschen ----
      if (aktion === 'sperren' || aktion === 'entsperren' || aktion === 'loeschen') {
        if (!trainerOk()) return res.status(401).json({ error: 'Trainer-Schluessel fehlt' });
        const pid = String(body.player_id || '');
        if (!pid) return res.status(400).json({ error: 'player_id fehlt' });
        await entferne('cb_player_session', 'player_id=eq.' + encodeURIComponent(pid));
        if (aktion === 'loeschen') {
          await entferne('cb_player_auth', 'player_id=eq.' + encodeURIComponent(pid));
          return res.status(200).json({ ok: true, status: 'geloescht' });
        }
        const neu = aktion === 'sperren' ? 'gesperrt' : 'aktiv';
        await aendere('cb_player_auth', 'player_id=eq.' + encodeURIComponent(pid), { status: neu });
        return res.status(200).json({ ok: true, status: neu });
      }

      // ---- Spieler: Einladungslink prüfen ----
      if (aktion === 'pruefe') {
        const token = String(body.token || '');
        if (!token) return res.status(400).json({ error: 'token fehlt' });
        const rows = await hole('cb_player_auth?invite_token=eq.' + encodeURIComponent(token) + '&select=*');
        if (!rows.length) return res.status(404).json({ error: 'Link ist ungueltig' });
        if (zgAbgelaufen(rows[0].invite_expires)) return res.status(410).json({ error: 'Link ist abgelaufen' });
        if (rows[0].status === 'gesperrt') return res.status(403).json({ error: 'Zugang ist gesperrt' });
        const sp = await spielerDaten(rows[0].player_id);
        return res.status(200).json({
          ok: true,
          username: rows[0].username,
          name: sp ? ((sp.fn || '') + ' ' + (sp.ln || '')).trim() : ''
        });
      }

      // ---- Spieler: Passwort über Einladungslink setzen ----
      if (aktion === 'setzen') {
        const token = String(body.token || '');
        const passwort = String(body.passwort || '');
        if (!token) return res.status(400).json({ error: 'token fehlt' });
        if (passwort.length < 8) return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
        const rows = await hole('cb_player_auth?invite_token=eq.' + encodeURIComponent(token) + '&select=*');
        if (!rows.length) return res.status(404).json({ error: 'Link ist ungueltig' });
        if (zgAbgelaufen(rows[0].invite_expires)) return res.status(410).json({ error: 'Link ist abgelaufen' });
        if (rows[0].status === 'gesperrt') return res.status(403).json({ error: 'Zugang ist gesperrt' });

        const salt = zgZufall(16);
        await aendere('cb_player_auth', 'player_id=eq.' + encodeURIComponent(rows[0].player_id), {
          pw_salt: salt,
          pw_hash: zgHash(passwort, salt),
          invite_token: null,
          invite_expires: null,
          status: 'aktiv',
          last_login: new Date().toISOString()
        });
        await entferne('cb_player_session', 'player_id=eq.' + encodeURIComponent(rows[0].player_id));
        const sess = await sessionAnlegen(rows[0].player_id);
        return res.status(200).json({ ok: true, session: sess, username: rows[0].username });
      }

      // ---- Spieler: Login ----
      if (aktion === 'login') {
        const user = String(body.username || '').trim().toLowerCase();
        const passwort = String(body.passwort || '');
        if (!user || !passwort) return res.status(400).json({ error: 'Benutzername und Passwort noetig' });
        const rows = await hole('cb_player_auth?username=eq.' + encodeURIComponent(user) + '&select=*');
        if (!rows.length || !rows[0].pw_hash) return res.status(401).json({ error: 'Benutzername oder Passwort stimmt nicht' });
        if (rows[0].status === 'gesperrt') return res.status(403).json({ error: 'Zugang ist gesperrt' });
        if (!zgGleich(zgHash(passwort, rows[0].pw_salt), rows[0].pw_hash)) {
          return res.status(401).json({ error: 'Benutzername oder Passwort stimmt nicht' });
        }
        await aendere('cb_player_auth', 'player_id=eq.' + encodeURIComponent(rows[0].player_id), { last_login: new Date().toISOString() });
        const sess = await sessionAnlegen(rows[0].player_id);
        return res.status(200).json({ ok: true, session: sess, username: rows[0].username });
      }

      // ---- Spieler: Passwort ändern (eingeloggt) ----
      if (aktion === 'passwort') {
        const a = await sessionPruefen(body.session);
        if (!a) return res.status(401).json({ error: 'Nicht angemeldet' });
        const alt = String(body.alt || ''), neu = String(body.neu || '');
        if (neu.length < 8) return res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen haben' });
        if (!zgGleich(zgHash(alt, a.pw_salt), a.pw_hash)) return res.status(401).json({ error: 'Altes Passwort stimmt nicht' });
        const salt = zgZufall(16);
        await aendere('cb_player_auth', 'player_id=eq.' + encodeURIComponent(a.player_id), { pw_salt: salt, pw_hash: zgHash(neu, salt) });
        return res.status(200).json({ ok: true });
      }

      if (aktion === 'session') {
        const a = await sessionPruefen(body.session);
        if (!a) return res.status(401).json({ error: 'Nicht angemeldet' });
        const sp = await spielerDaten(a.player_id);
        return res.status(200).json({ ok: true, username: a.username, name: sp ? ((sp.fn || '') + ' ' + (sp.ln || '')).trim() : '' });
      }

      if (aktion === 'logout') {
        if (body.session) await entferne('cb_player_session', 'token=eq.' + encodeURIComponent(String(body.session)));
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unbekannte Aktion: ' + (aktion || '(leer)') });
    }

    // ================= collection=termine (Trainersicht) =================
    if (collection === 'termine') {
      if (!trainerOk()) return res.status(401).json({ error: 'Trainer-Schluessel fehlt' });

      if (aktion === 'liste' || (req.method === 'GET' && !aktion)) {
        const team = String(body.team || req.query.team || '');
        const filter = team ? '&team=eq.' + encodeURIComponent(team) : '';
        const termine = await hole('cb_termine?select=*' + filter + '&order=datum.asc');
        if (!termine.length) return res.status(200).json({ items: [], antworten: [] });
        const ids = termine.map(function (t) { return String(t.id); });
        const antworten = await hole('cb_anwesenheit?termin_id=in.(' + ids.map(encodeURIComponent).join(',') + ')&select=termin_id,player_id,status,grund,updated_at');
        return res.status(200).json({
          antworten: antworten,
          items: termine.map(function (t) {
            const mein = antworten.filter(function (a2) { return String(a2.termin_id) === String(t.id); });
            return Object.assign({}, t, {
              zu: mein.filter(function (a2) { return a2.status === 'zu'; }).length,
              ab: mein.filter(function (a2) { return a2.status === 'ab'; }).length,
              verletzt: mein.filter(function (a2) { return a2.status === 'verletzt'; }).length
            });
          })
        });
      }

      if (aktion === 'anlegen' || aktion === 'aendern') {
        const zeile = {
          team: String(body.team || ''),
          datum: String(body.datum || ''),
          zeit: String(body.zeit || ''),
          titel: String(body.titel || 'Training'),
          ort: String(body.ort || '')
        };
        if (!zeile.team || !zeile.datum) return res.status(400).json({ error: 'Kader und Datum noetig' });
        if (aktion === 'aendern') {
          const id = String(body.id || '');
          if (!id) return res.status(400).json({ error: 'id fehlt' });
          const out = await aendere('cb_termine', 'id=eq.' + encodeURIComponent(id), zeile);
          return res.status(200).json({ ok: true, termin: out.daten });
        }
        const out = await schreibe('cb_termine', zeile);
        if (!out.ok) return res.status(500).json({ error: 'Anlegen fehlgeschlagen' });
        return res.status(200).json({ ok: true, termin: out.daten });
      }

      if (aktion === 'loeschen') {
        const id = String(body.id || '');
        if (!id) return res.status(400).json({ error: 'id fehlt' });
        await entferne('cb_anwesenheit', 'termin_id=eq.' + encodeURIComponent(id));
        await entferne('cb_termine', 'id=eq.' + encodeURIComponent(id));
        return res.status(200).json({ ok: true });
      }

      if (aktion === 'rueckmeldungen') {
        const tid = String(body.termin_id || '');
        if (!tid) return res.status(400).json({ error: 'termin_id fehlt' });
        const rows = await hole('cb_anwesenheit?termin_id=eq.' + encodeURIComponent(tid) + '&select=player_id,status,grund,updated_at');
        return res.status(200).json({ items: rows });
      }

      // Trainer traegt fuer einen Spieler nach
      if (aktion === 'setzen') {
        const tid = String(body.termin_id || ''), pid = String(body.player_id || '');
        const st = String(body.status || '').toLowerCase();
        if (!tid || !pid) return res.status(400).json({ error: 'termin_id und player_id noetig' });
        await entferne('cb_anwesenheit', 'termin_id=eq.' + encodeURIComponent(tid) + '&player_id=eq.' + encodeURIComponent(pid));
        if (st && st !== 'offen') {
            if (['zu', 'ab', 'verletzt'].indexOf(st) === -1) return res.status(400).json({ error: 'Unbekannter Status' });
          const out2 = await schreibe('cb_anwesenheit', {
            termin_id: tid, player_id: pid, status: st,
            grund: 'vom Trainer eingetragen', updated_at: new Date().toISOString()
          });
          if (!out2.ok) {
            return res.status(500).json({
              error: 'Konnte nicht gespeichert werden: ' + ((out2.daten && (out2.daten.message || out2.daten.details)) || 'unbekannt')
            });
          }
        }
        return res.status(200).json({ ok: true, status: st || 'offen' });
      }

      return res.status(400).json({ error: 'Unbekannte Aktion: ' + (aktion || '(leer)') });
    }

    // ================= collection=me =================
    const a = await sessionPruefen(body.session);
    if (!a) return res.status(401).json({ error: 'Nicht angemeldet' });
    const sp = await spielerDaten(a.player_id);
    if (!sp) return res.status(404).json({ error: 'Spielerprofil nicht gefunden' });
    const was = String(body.was || 'profil').toLowerCase();

    if (was === 'profil') {
      // Vergleichsgruppe: gleicher Jahrgang, gleiches Geschlecht, je Spieler sein
      // letzter Test. Es gehen nur die nackten Messwerte raus, keine Namen.
      let gruppe = [];
      const jahr = String(sp.dob || '').slice(0, 4);
      if (jahr) {
        const sex = sp.sex || (String(sp.team || '').charAt(0) === 'W' ? 'w' : 'm');
        const alle = await hole('cb_players?select=data');
        alle.forEach(function (row) {
          const x = row.data;
          if (!x || !x.dob || String(x.dob).slice(0, 4) !== jahr) return;
          const xsex = x.sex || (String(x.team || '').charAt(0) === 'W' ? 'w' : 'm');
          if (xsex !== sex) return;
          const tests = Array.isArray(x.diag) ? x.diag.slice() : [];
          if (!tests.length) return;
          tests.sort(function (a2, b2) { return String(a2.date).localeCompare(String(b2.date)); });
          gruppe.push(tests[tests.length - 1]);
        });
      }
      return res.status(200).json({
        ok: true,
        jahrgang: jahr,
        gruppe: gruppe,
        spieler: {
          id: sp.id,
          name: ((sp.fn || '') + ' ' + (sp.ln || '')).trim(),
          team: sp.team || '',
          halle: sp.halle || '',
          pos: sp.pos || '',
          verein: sp.verein || '',
          sex: sp.sex || '',
          status: sp.status || '',
          diag: Array.isArray(sp.diag) ? sp.diag : [],
          praevention: Array.isArray(sp.praevention) ? sp.praevention : []
        }
      });
    }

    if (was === 'termine') {
      const kader = [sp.team, sp.halle].filter(Boolean);
      if (!kader.length) return res.status(200).json({ ok: true, termine: [] });
      const heute = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
      const filter = 'cb_termine?team=in.(' + kader.map(encodeURIComponent).join(',') + ')'
        + '&datum=gte.' + heute + '&order=datum.asc&select=*';
      const termine = await hole(filter);
      if (!termine.length) return res.status(200).json({ ok: true, termine: [] });
      const antworten = await hole('cb_anwesenheit?player_id=eq.' + encodeURIComponent(a.player_id) + '&select=termin_id,status,grund');
      const karte = {};
      antworten.forEach(function (r) { karte[String(r.termin_id)] = r; });
      return res.status(200).json({ ok: true, termine: termine.map(function (t) {
        const m = karte[String(t.id)];
        return {
          id: t.id, team: t.team, datum: t.datum, zeit: t.zeit || '',
          titel: t.titel || 'Training', ort: t.ort || '',
          antwort: m ? m.status : null, grund: m ? (m.grund || '') : '',
          tage: zgTageBis(t.datum),
          offen: zgAnmeldungOffen(t.datum),
          oeffnet_am: zgOeffnetAm(t.datum)
        };
      }) });
    }

    if (was === 'abstimmen') {
      const tid = String(body.termin_id || '');
      const st = String(body.status || '').toLowerCase();
      if (!tid) return res.status(400).json({ error: 'termin_id fehlt' });
      if (['zu', 'ab', 'verletzt'].indexOf(st) === -1) return res.status(400).json({ error: 'status muss zu, ab oder verletzt sein' });
      const gehoert = await hole('cb_termine?id=eq.' + encodeURIComponent(tid) + '&select=team,datum');
      if (!gehoert.length) return res.status(404).json({ error: 'Termin nicht gefunden' });
      if ([sp.team, sp.halle].indexOf(gehoert[0].team) === -1) return res.status(403).json({ error: 'Termin gehoert nicht zu deinem Kader' });
      const tage = zgTageBis(gehoert[0].datum);
      if (tage !== null && tage > ANMELDE_FENSTER) {
        return res.status(409).json({ error: 'Die Anmeldung oeffnet erst ' + ANMELDE_FENSTER + ' Tage vorher' });
      }
      if (tage !== null && tage < 0) {
        return res.status(409).json({ error: 'Diese Einheit war schon' });
      }
      await entferne('cb_anwesenheit', 'termin_id=eq.' + encodeURIComponent(tid) + '&player_id=eq.' + encodeURIComponent(a.player_id));
      const out = await schreibe('cb_anwesenheit', {
        termin_id: tid, player_id: String(a.player_id), status: st,
        grund: String(body.grund || '').slice(0, 300), updated_at: new Date().toISOString()
      });
      if (!out.ok) {
        return res.status(500).json({
          error: 'Konnte nicht gespeichert werden: ' + ((out.daten && (out.daten.message || out.daten.details)) || 'unbekannt')
        });
      }
      return res.status(200).json({ ok: true, status: st });
    }

    return res.status(400).json({ error: 'Unbekannter Bereich: ' + was });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
