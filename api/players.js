// api/players.js
// CRUD for Spielerprofile, stored in Supabase table cb_players.
// The Supabase Service Key stays server-side and is never exposed to the browser.
//
// GET    /api/players          -> { players: [...] }
// POST   /api/players          -> body = single player object OR { players: [...] } (bulk upsert)
// DELETE /api/players?id=<id>  -> deletes one player by id

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const base = SUPABASE_URL + '/rest/v1/cb_players';
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(base + '?select=data&order=updated_at.desc', { headers: headers });
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'GET failed: ' + t });
      }
      const rows = await r.json();
      const players = rows.map(function (row) { return row.data; });
      return res.status(200).json({ players: players });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      let list;
      if (body && Array.isArray(body.players)) list = body.players;
      else if (body && body.id) list = [body];
      else return res.status(400).json({ error: 'No player(s) provided' });

      const payload = list.map(function (p) {
        return { id: String(p.id), data: p, updated_at: new Date().toISOString() };
      });

      const r = await fetch(base, {
        method: 'POST',
        headers: Object.assign({}, headers, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'Upsert failed: ' + t });
      }
      return res.status(200).json({ ok: true, count: payload.length });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) ? req.query.id : null;
      if (!id) return res.status(400).json({ error: 'No id provided' });
      const r = await fetch(base + '?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: headers
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'Delete failed: ' + t });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
