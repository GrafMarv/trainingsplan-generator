// api/setup-brain.js
// Einmalig aufrufen: GET /api/setup-brain?secret=dhb2026
// Legt Supabase Tabelle an, embedded alle 99 Chunks mit OpenAI, lädt hoch

export default async function handler(req, res) {
  // Einfacher Schutz damit nicht jeder den Endpoint aufrufen kann
  if (req.query.secret !== 'dhb2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
    return res.status(500).json({ 
      error: 'Missing env vars',
      missing: {
        SUPABASE_URL: !SUPABASE_URL,
        SUPABASE_SERVICE_KEY: !SUPABASE_KEY,
        OPENAI_API_KEY: !OPENAI_KEY
      }
    });
  }

  const log = [];

  try {
    // Schritt 1: Tabelle anlegen via Supabase SQL API
    log.push('Step 1: Creating table...');

    const createSQL = `
      create extension if not exists vector;
      drop table if exists brain_chunks;
      create table brain_chunks (
        id text primary key,
        titel text not null,
        inhalt text not null,
        tags text[],
        quelle text,
        embedding vector(1536)
      );
      create index on brain_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 10);
    `;

    const sqlResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql: createSQL })
    });
    log.push(`Table API status: ${sqlResp.status}`);

    // Schritt 2: Chunks laden
    log.push('Step 2: Loading chunks from GitHub...');
    const knowledgeResp = await fetch(
      'https://raw.githubusercontent.com/GrafMarv/trainingsplan-generator/main/knowledge.json?t=' + Date.now()
    );
    const knowledgeData = await knowledgeResp.json();
    const chunks = knowledgeData.chunks;
    log.push(`Loaded ${chunks.length} chunks`);

    // Schritt 3: Alle Chunks auf einmal embedden (batch) — spart API calls
    log.push('Step 3: Creating embeddings...');
    const texts = chunks.map(c => `${c.titel}\n${c.inhalt}`.slice(0, 8000));

    const embedResp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts
      })
    });

    if (!embedResp.ok) {
      const err = await embedResp.text();
      return res.status(500).json({ error: `OpenAI error: ${err}`, log });
    }

    const embedData = await embedResp.json();
    log.push(`Got ${embedData.data.length} embeddings`);

    // Schritt 4: Alle Chunks in Supabase einfügen
    log.push('Step 4: Uploading to Supabase...');

    const rows = chunks.map((chunk, i) => ({
      id: chunk.id,
      titel: chunk.titel,
      inhalt: chunk.inhalt,
      tags: chunk.tags || [],
      quelle: chunk.quelle || '',
      embedding: embedData.data[i].embedding
    }));

    // In Batches von 20 hochladen
    const batchSize = 20;
    let uploaded = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/brain_chunks`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal,resolution=merge-duplicates'
        },
        body: JSON.stringify(batch)
      });

      if (insertResp.ok || insertResp.status === 201) {
        uploaded += batch.length;
        log.push(`Batch ${Math.floor(i/batchSize)+1}: ${batch.length} chunks uploaded`);
      } else {
        const err = await insertResp.text();
        log.push(`Batch ${Math.floor(i/batchSize)+1} ERROR: ${err.slice(0, 200)}`);
      }
    }

    log.push(`Done! ${uploaded}/${chunks.length} chunks in Supabase`);
    return res.status(200).json({ success: true, uploaded, total: chunks.length, log });

  } catch (e) {
    return res.status(500).json({ error: e.message, log });
  }
}
