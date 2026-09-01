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
  if (collection !== 'plans' && collection !== 'blocks' && collection !== 'trainingdocs') {
    return res.status(400).json({ error: 'collection must be plans, blocks, or trainingdocs' });
  }
  const table = collection === 'plans' ? 'cb_saved_plans' : collection === 'blocks' ? 'cb_saved_blocks' : 'cb_training_docs';

  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
      method: 'POST', headers,
      body: JSON.stringify({ sql:
        "create table if not exists cb_saved_plans (id uuid primary key default gen_random_uuid(), name text not null, data jsonb not null, created_at timestamptz not null default now()); " +
        "create table if not exists cb_saved_blocks (id uuid primary key default gen_random_uuid(), name text not null, type text not null default 'main', data jsonb not null, created_at timestamptz not null default now()); " +
        "create table if not exists cb_training_docs (id uuid primary key default gen_random_uuid(), name text not null, data jsonb not null, created_at timestamptz not null default now()); " +
        "notify pgrst, 'reload schema';"
      })
    });
  } catch(e) {}

  const base = SUPABASE_URL + '/rest/v1/' + table;

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
