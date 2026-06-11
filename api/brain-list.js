// api/brain-list.js
// Liefert alle Chunks aus der Supabase-Tabelle brain_chunks (ohne das Embedding-Vektorfeld,
// das fuer die Visualisierung nicht gebraucht wird und gross ist).
//
// GET /api/brain-list -> { chunks: [{ id, titel, inhalt, tags, quelle }], total }

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/brain_chunks?select=id,titel,inhalt,tags,quelle&order=id.asc&limit=1000', {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'count=exact',
        'Range': '0-999'
      }
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'GET failed: ' + t });
    }
    const chunks = await r.json();
    const range = r.headers.get('content-range');
    const total = range && range.includes('/') ? parseInt(range.split('/')[1], 10) : chunks.length;
    return res.status(200).json({ chunks: chunks, total: total });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
