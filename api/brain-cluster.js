// api/brain-cluster.js
// Berechnet "echte" semantische Cluster ueber k-Means auf den vorhandenen OpenAI-Embeddings
// in brain_chunks. Vergibt pro Cluster per Claude einen kurzen Namen und schreibt
// cluster_id + cluster_label in neue Spalten von brain_chunks zurueck.
//
// Diese Cluster sind unabhaengig von der Keyword-basierten 3D-Visualisierung (8 feste
// Themen-Cluster) - sie laufen "hintenrum" als Datengrundlage fuer spaetere Nutzung
// (z.B. bessere Visualisierung, Suche, Wissens-Uebersicht).
//
// POST /api/brain-cluster?k=8 -> { ok:true, k, clusters: [{ id, label, count, sample_titles }] }

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

function kmeans(vectors, k, iterations) {
  const n = vectors.length;
  k = Math.min(k, n);
  const dim = vectors[0].length;

  // k-means++-artige Initialisierung: erste Centroid zufaellig, weitere bevorzugt weit weg
  const centroids = [];
  centroids.push(vectors[Math.floor(Math.random() * n)].slice());
  while (centroids.length < k) {
    const dists = vectors.map(function (v) {
      let best = Infinity;
      for (const c of centroids) { const d = dist2(v, c); if (d < best) best = d; }
      return best;
    });
    const sum = dists.reduce(function (a, b) { return a + b; }, 0);
    let r = Math.random() * sum, acc = 0, pick = 0;
    for (let i = 0; i < n; i++) { acc += dists[i]; if (acc >= r) { pick = i; break; } }
    centroids.push(vectors[pick].slice());
  }

  let assign = new Array(n).fill(0);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(vectors[i], centroids[c]);
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
    }
    const sums = Array.from({ length: k }, function () { return new Array(dim).fill(0); });
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      counts[assign[i]]++;
      const v = vectors[i], s = sums[assign[i]];
      for (let d = 0; d < dim; d++) s[d] += v[d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue; // leere Cluster behalten alten Centroid
      for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c];
    }
  }
  return assign;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
}
