// api/knowledge.js
// CRUD fuer die Wissens-Sektion (Dokumente, Konzepte, Studien), gespeichert in Supabase Tabelle cb_knowledge.
// Der Supabase Service Key bleibt serverseitig.
//
// GET    /api/knowledge          -> { entries: [...] }
// POST   /api/knowledge          -> body = einzelner Eintrag ODER { entries: [...] } (bulk upsert)
// DELETE /api/knowledge?id=<id>  -> loescht einen Eintrag per id

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const base = SUPABASE_URL + '/rest/v1/cb_knowledge';
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  // Tabelle bei Bedarf anlegen (idempotent, kleine Vorab-Anfrage)
  async function ensureTable() {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          sql: 'create table if not exists cb_knowledge (id text primary key, data jsonb not null, updated_at timestamptz default now());'
        })
      });
    } catch (e) {
      // Wenn exec_sql nicht existiert oder fehlschlaegt, lassen wir die eigentliche
      // Anfrage trotzdem laufen - der Fehler wird dann dort sichtbar.
    }
  }

  try {
    if (req.method === 'GET') {
      let r = await fetch(base + '?select=data&order=updated_at.desc', { headers: headers });
      if (!r.ok) {
        await ensureTable();
        r = await fetch(base + '?select=data&order=updated_at.desc', { headers: headers });
      }
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'GET failed: ' + t });
      }
      const rows = await r.json();
      const entries = rows.map(function (row) { return row.data; });
      return res.status(200).json({ entries: entries });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      let list;
      if (body && Array.isArray(body.entries)) list = body.entries;
      else if (body && body.id != null) list = [body];
      else return res.status(400).json({ error: 'No entry/entries provided' });

      const payload = list.map(function (e) {
        return { id: String(e.id), data: e, updated_at: new Date().toISOString() };
      });

      let r = await fetch(base, {
        method: 'POST',
        headers: Object.assign({}, headers, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        await ensureTable();
        r = await fetch(base, {
          method: 'POST',
          headers: Object.assign({}, headers, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify(payload)
        });
      }
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
