// api/brain-add.js
// Nimmt vom Nutzer bestaetigte Wissens-Chunks entgegen, erstellt OpenAI-Embeddings
// und schreibt sie in die Supabase-Tabelle brain_chunks (gleiche Tabelle/Format wie
// die initiale Befuellung in api/setup-brain.js).
//
// POST { chunks: [{ titel, inhalt, tags, quelle, id? }] }
// -> { ok: true, count, ids }

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Umlaute/Akzente entfernen
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (req.method === 'GET') {
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Env vars fehlen (Supabase)' });
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/brain_chunks?select=id,titel,quelle&order=id.desc&limit=10', {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'count=exact',
          'Range': '0-9'
        }
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'GET failed: ' + t });
      }
      const rows = await r.json();
      const range = r.headers.get('content-range'); // z.B. "0-9/123"
      const total = range && range.includes('/') ? range.split('/')[1] : null;
      return res.status(200).json({ total: total, latest: rows });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
      return res.status(500).json({ error: 'Env vars fehlen (Supabase/OpenAI)' });
    }

    let { chunks } = req.body || {};
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return res.status(400).json({ error: 'Keine Chunks uebergeben' });
    }
    chunks = chunks.filter(function (c) { return c && c.titel && c.inhalt; }).slice(0, 20);
    if (chunks.length === 0) {
      return res.status(400).json({ error: 'Keine gueltigen Chunks (titel/inhalt fehlen)' });
    }

    // Embeddings batchen
    const texts = chunks.map(function (c) {
      return (c.titel + '\n' + c.inhalt).slice(0, 8000);
    });

    const embedResp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts })
    });

    if (!embedResp.ok) {
      const err = await embedResp.text();
      return res.status(500).json({ error: 'OpenAI Fehler: ' + err });
    }
    const embedData = await embedResp.json();

    const usedIds = {};
    const rows = chunks.map(function (c, i) {
      let id = c.id ? slugify(c.id) : (slugify(c.titel) || 'chunk');
      let base = id, n = 1;
      while (usedIds[id]) { id = base + '_' + (++n); }
      usedIds[id] = true;
      return {
        id: id,
        titel: String(c.titel).slice(0, 200),
        inhalt: String(c.inhalt).slice(0, 2000),
        tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        quelle: c.quelle ? String(c.quelle).slice(0, 200) : '',
        embedding: embedData.data[i].embedding
      };
    });

    const insertResp = await fetch(SUPABASE_URL + '/rest/v1/brain_chunks', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    });

    if (!insertResp.ok) {
      const err = await insertResp.text();
      return res.status(500).json({ error: 'Supabase Insert Fehler: ' + err });
    }

    return res.status(200).json({ ok: true, count: rows.length, ids: rows.map(function (r) { return r.id; }) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
