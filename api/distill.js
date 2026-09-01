// api/distill.js
// Extrahiert aus einem hochgeladenen Dokumenttext (z.B. PDF einer Studie) strukturierte
// Wissens-Chunks im Format der Coaching-Brain-Wissensbasis (knowledge.json / brain_chunks).
//
// POST { text: string, quelle?: string, existing?: [{titel, tags}] }
// -> { chunks: [{ titel, inhalt, tags, quelle }] }
//
// Wenn "existing" mitgeschickt wird (z.B. beim "Mehr finden"-Button), wird Claude
// angewiesen, KEINE Themen zu wiederholen, die in "existing" bereits vorkommen,
// sondern zusaetzliche/andere trainingsrelevante Aspekte zu finden.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

    let { text, quelle, existing } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Kein Text uebergeben' });
    }
    text = text.slice(0, 30000);
    quelle = (typeof quelle === 'string' && quelle.trim()) ? quelle.trim() : 'Hochgeladenes Dokument';
    existing = Array.isArray(existing) ? existing : [];

    let existingBlock = '';
    if (existing.length) {
      const lines = existing.map(function (c) {
        const tags = Array.isArray(c.tags) ? c.tags.join(', ') : '';
        return '- ' + (c.titel || '') + (tags ? ' [Tags: ' + tags + ']' : '');
      }).join('\n');
      existingBlock = '\n\nBEREITS VORGESCHLAGENE CHUNKS (nicht wiederholen, finde ZUSAETZLICHE bzw. ANDERE trainingsrelevante Aspekte aus dem Text, die hier noch fehlen):\n' + lines;
    }

    const system = `Du extrahierst aus einem Dokument (Studie, Buchkapitel, Artikel) trainingsrelevante Implikationen
fuer einen Feldhockey-Athletik-Coach und formulierst sie als kurze, eigenstaendige Wissens-Chunks
fuer eine semantische Wissensbasis (RAG).

FORMAT - Antworte NUR mit einem JSON-Array, kein Text davor oder danach, keine Markdown-Codebloecke:
[
  {
    "titel": "Kurzer praegnanter Titel (5-8 Worte)",
    "inhalt": "3-6 Saetze: konkrete, umsetzbare Praxisinformation fuer Coaching (Methode, Dosierung, Zielgruppe, Begruendung). Kein abstraktes Studien-Geschwafel, sondern was ein Coach DAMIT TUN kann.",
    "tags": ["3-6 thematische Schlagworte, z.B. Kraft, Ausdauer, Sprint, Energie, Warm-Up, Recovery, plus spezifischere Begriffe"],
    "quelle": "${quelle}"
  }
]

REGELN:
- Pro Chunk EIN abgeschlossener, eigenstaendiger Gedanke - er muss auch ohne den Rest des Dokuments verstaendlich sein.
- Nur trainingswissenschaftlich/praktisch relevante Inhalte extrahieren, keine Studien-Meta-Infos (Stichprobengroesse, Limitationen) als eigene Chunks, ausser sie aendern direkt die Praxisempfehlung.
- 3-8 Chunks bei einem neuen Dokument. Wenn bereits Chunks vorgeschlagen wurden (siehe unten), gib NUR neue, bisher nicht abgedeckte Chunks zurueck (1-5 Stueck) - oder ein leeres Array [], falls der Text wirklich nichts Neues mehr hergibt.
- "quelle" immer exakt "${quelle}" verwenden.
- Tags auf Deutsch, klein geschrieben, konsistent mit: Kraft, Ausdauer, Sprint, Energie, Warm-Up, Recovery (plus passende Zusatztags).${existingBlock}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        system: system,
        messages: [
          { role: 'user', content: 'DOKUMENTTEXT:\n\n' + text }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Claude API Fehler: ' + err });
    }

    const data = await response.json();
    let raw = (data.content || []).map(function (b) { return b.text || ''; }).join('');
    raw = raw.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    let chunks;
    try {
      chunks = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ error: 'Antwort konnte nicht als JSON gelesen werden', raw: raw.slice(0, 1000) });
    }
    if (!Array.isArray(chunks)) chunks = [];

    chunks = chunks.filter(function (c) { return c && c.titel && c.inhalt; }).map(function (c) {
      return {
        titel: String(c.titel).slice(0, 200),
        inhalt: String(c.inhalt).slice(0, 2000),
        tags: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 8) : [],
        quelle: c.quelle ? String(c.quelle).slice(0, 200) : quelle
      };
    });

    return res.status(200).json({ chunks: chunks });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
