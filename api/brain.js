// api/brain.js
// Merged from brain-cluster.js + brain-list.js to stay within Vercel Hobby 12-function limit.
// GET  /api/brain         -> brain-list (all chunks without embeddings)
// POST /api/brain?k=8     -> brain-cluster (k-means clustering)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // ---- brain-list ----
    );
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
  } else if (req.method === 'POST') {
    // ---- brain-cluster ----
    );
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase env vars missing' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  let k = parseInt((req.query && req.query.k) || '8', 10);
  if (!k || k < 2) k = 8;
  if (k > 20) k = 20;

  try {
    // Spalten cluster_id/cluster_label sicherstellen
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          sql: "alter table brain_chunks add column if not exists cluster_id integer; alter table brain_chunks add column if not exists cluster_label text; notify pgrst, 'reload schema';"
        })
      });
    } catch (e) { /* ggf. existieren die Spalten schon */ }

    // Alle Chunks inkl. Embedding laden
    const r = await fetch(SUPABASE_URL + '/rest/v1/brain_chunks?select=id,titel,tags,embedding&limit=1000', {
      headers: headers
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'GET failed: ' + t });
    }
    const rows = await r.json();
    if (!rows.length) return res.status(400).json({ error: 'Keine Chunks vorhanden' });

    const vectors = rows.map(function (row) {
      let emb = row.embedding;
      if (typeof emb === 'string') emb = JSON.parse(emb);
      return emb;
    });

    const assign = kmeans(vectors, k, 15);
    const usedK = Math.min(k, rows.length);

    // Pro Cluster Beispiel-Titel sammeln
    const clusterTitles = Array.from({ length: usedK }, function () { return []; });
    rows.forEach(function (row, i) {
      if (clusterTitles[assign[i]].length < 8) clusterTitles[assign[i]].push(row.titel);
    });

    // Claude: kurze Cluster-Namen vergeben
    let labels = clusterTitles.map(function (_, i) { return 'Cluster ' + (i + 1); });
    if (ANTHROPIC_KEY) {
      try {
        const promptLines = clusterTitles.map(function (titles, i) {
          return 'Cluster ' + i + ':\n- ' + titles.join('\n- ');
        }).join('\n\n');
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-opus-4-5',
            max_tokens: 600,
            system: 'Du bekommst Gruppen von Titeln aus einer Trainingswissenschafts-Wissensbasis (Feldhockey-Athletiktraining). Vergib pro Gruppe einen kurzen, praegnanten deutschen Themennamen (2-4 Worte, z.B. "Sprint & Schnelligkeit", "Periodisierung & Planung"). Antworte NUR mit einem JSON-Objekt {"0":"Name","1":"Name",...}, kein Text davor/danach.',
            messages: [{ role: 'user', content: promptLines }]
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          let raw = (data.content || []).map(function (b) { return b.text || ''; }).join('').trim();
          if (raw.startsWith('```')) raw = raw.replace(/^```(json)?/, '').replace(/```$/, '').trim();
          const parsed = JSON.parse(raw);
          labels = labels.map(function (def, i) { return parsed[String(i)] || def; });
        }
      } catch (e) { /* Fallback-Labels bleiben */ }
    }

    // cluster_id + cluster_label in Batches zurueckschreiben
    const batchSize = 20;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await Promise.all(batch.map(function (row, j) {
        const idx = i + j;
        return fetch(SUPABASE_URL + '/rest/v1/brain_chunks?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify({ cluster_id: assign[idx], cluster_label: labels[assign[idx]] })
        });
      }));
    }

    const counts = new Array(usedK).fill(0);
    assign.forEach(function (a) { counts[a]++; });
    const clusters = labels.map(function (label, i) {
      return { id: i, label: label, count: counts[i], sample_titles: clusterTitles[i] };
    });

    return res.status(200).json({ ok: true, k: usedK, total: rows.length, clusters: clusters });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
