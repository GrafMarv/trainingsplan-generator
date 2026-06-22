// api/library.js
// Global shared library for saved plans and blocks.
// No auth - all users share the same pool (internal use only).
//
// GET    /api/library?collection=plans          -> { items: [...] }
// GET    /api/library?collection=blocks         -> { items: [...] }
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

  // Auto-create tables - single statement with schema reload
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ sql:
        "create table if not exists cb_saved_plans (id uuid primary key default gen_random_uuid(), name text not null, data jsonb not null, created_at timestamptz not null default now()); " +
        "create table if not exists cb_saved_blocks (id uuid primary key default gen_random_uuid(), name text not null, type text not null default \'main\', data jsonb not null, created_at timestamptz not null default now()); " +
        "create table if not exists cb_training_docs (id uuid primary key default gen_random_uuid(), name text not null, data jsonb not null, created_at timestamptz not null default now()); " +
        "notify pgrst, \'reload schema\';"
      })
    });
  } catch(e) { /* tables may already exist */ }

  const base = SUPABASE_URL + '/rest/v1/' + table;

  try {
    if (req.method === 'GET') {
      const url = collection === 'blocks'
        ? base + '?select=id,name,type,data,created_at&order=created_at.desc'
        : base + '?select=id,name,data,created_at&order=created_at.desc';
      const r = await fetch(url, { headers });
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: 'GET failed: ' + txt });
      }
      const rows = await r.json();
      return res.status(200).json({ items: rows });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
      const { name, type, data } = body;
      if (!name || !data) return res.status(400).json({ error: 'name and data required' });
      const row = collection === 'blocks'
        ? { name, type: type || 'main', data }
        : { name, data };
      const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(row) });
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: 'POST failed: ' + txt });
      }
      const created = await r.json();
      return res.status(200).json({ id: created[0] && created[0].id, ok: true });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await fetch(base + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers });
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: 'DELETE failed: ' + txt });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
