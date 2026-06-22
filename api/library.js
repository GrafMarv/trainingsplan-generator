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
  if (collection !== 'plans' && collection !== 'blocks') {
    return res.status(400).json({ error: 'collection must be plans or blocks' });
  }
  const table = collection === 'plans' ? 'cb_saved_plans' : 'cb_saved_blocks';

  // Auto-create tables if they don't exist
  async function ensureTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS cb_saved_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS cb_saved_blocks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        type text NOT NULL DEFAULT 'main',
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ sql })
    });
  }

  try {
    await ensureTables();

    const base = SUPABASE_URL + '/rest/v1/' + table;

    if (req.method === 'GET') {
      const url = collection === 'blocks'
        ? base + '?select=id,name,type,data,created_at&order=created_at.desc'
        : base + '?select=id,name,data,created_at&order=created_at.desc';
      const r = await fetch(url, { headers });
      if (!r.ok) return res.status(500).json({ error: await r.text() });
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
      const r = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify(row)
      });
      if (!r.ok) return res.status(500).json({ error: await r.text() });
      const created = await r.json();
      return res.status(200).json({ id: created[0]?.id, ok: true });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await fetch(base + '?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers
      });
      if (!r.ok) return res.status(500).json({ error: await r.text() });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
