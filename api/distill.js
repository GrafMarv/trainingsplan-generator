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

  // ---- Modus "plan": aus einem alten Trainingsplan Bloecke und Uebungen herauslesen ----
  if ((req.body || {}).modus === 'plan') {
    try {
      const KEY = process.env.ANTHROPIC_API_KEY;
      if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

      let { text, pdfBase64, uebungen, dateiname } = req.body || {};
      const hatPdf = typeof pdfBase64 === 'string' && pdfBase64.length > 100;
      if (!hatPdf && (typeof text !== 'string' || !text.trim())) {
        return res.status(400).json({ error: 'Weder PDF noch Text uebergeben' });
      }
      text = (typeof text === 'string') ? text.slice(0, 24000) : '';
      const liste = Array.isArray(uebungen) ? uebungen.slice(0, 400) : [];

      const bestand = liste.map(function (id) {
        const teile = String(id).split('_');
        const name = teile[0].replace(/-/g, ' ');
        return id + '  =  ' + name + (teile[1] ? '  [' + teile.slice(1).join(', ') + ']' : '');
      }).join('\n');

      const prompt = [
        'Du bekommst den Text eines alten Trainingsplans aus dem Nachwuchsleistungssport Hockey.',
        'Wandle ihn in ein strukturiertes Format um.',
        '',
        'AUFGABE',
        '1. Erkenne die Bloecke des Plans (z.B. Aufwaermen, Lauf-ABC, Hauptteil, Ausklang).',
        '2. Erkenne je Block die einzelnen Uebungen mit Saetzen, Wiederholungen bzw. Zeit oder Distanz.',
        '3. Ordne jede Uebung einer vorhandenen Uebung aus dem BESTAND zu, wenn es eine passende gibt.',
        '4. Gibt es keine passende, markiere sie als neu und schlage einen Dateischluessel im Schema vor:',
        '   name-mit-bindestrichen_kategorie_subkategorie_merkmal_dynamik',
        '   Kategorien: strength, mobility, sprint, jump, agility, misc',
        '',
        'REGELN',
        '- Ordne nur zu, wenn es wirklich dieselbe Uebung ist. Im Zweifel lieber als neu markieren.',
        '- Gib je Zuordnung an, wie sicher du bist: hoch, mittel oder niedrig.',
        '- metric ist "reps" fuer Wiederholungen, "time" fuer Minuten, "dist" fuer Meter.',
        '- Fehlt eine Angabe, setze einen plausiblen Wert und schreib den Grund in note.',
        '- Uebernimm Hinweise aus dem Original moeglichst woertlich in note.',
        '',
        'BESTAND (Dateischluessel = Name [Merkmale])',
        bestand || '(leer)',
        '',
        hatPdf
          ? 'Der Plan liegt als PDF bei. Lies ihn wie ein Mensch: Uebungsnamen stehen oft als Grafik und nicht als Text. Werte Bilder, Nummerierung, Zeitangaben und Randnotizen mit aus. Wiederholt sich der ganze Plan mehrfach (z.B. \"4 Runden\"), setze das als Saetze.'
          : 'PLANTEXT\n' + text,
        '',
        'Antworte AUSSCHLIESSLICH mit JSON in genau dieser Form, ohne Vor- oder Nachtext:',
        '{',
        '  "name": "Kurzer Name des Plans",',
        '  "blocks": [',
        '    { "type": "warmup" oder "main", "label": "Blockname",',
        '      "slots": [',
        '        { "roh": "so stand es im Original", "imageKey": "vorhandener-schluessel oder null",',
        '          "neu": true/false, "vorschlagKey": "nur wenn neu", "vorschlagName": "nur wenn neu",',
        '          "sicherheit": "hoch|mittel|niedrig",',
        '          "sets": 3, "reps": 8, "metric": "reps", "rest": "60", "note": "" }',
        '      ] }',
        '  ]',
        '}'
      ].join('\n');

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 8000,
          messages: [{
            role: 'user',
            content: hatPdf
              ? [
                  { type: 'document',
                    source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
                  { type: 'text', text: prompt }
                ]
              : prompt
          }]
        })
      });

      const daten = await r.json();
      if (!r.ok) {
        return res.status(500).json({ error: (daten.error && daten.error.message) || 'Analyse fehlgeschlagen' });
      }

      let roh = (daten.content || []).map(function (c) { return c.text || ''; }).join('').trim();
      roh = roh.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();

      let plan;
      try {
        plan = JSON.parse(roh);
      } catch (e) {
        const a = roh.indexOf('{'), b = roh.lastIndexOf('}');
        if (a < 0 || b < 0) return res.status(500).json({ error: 'Antwort war kein JSON', roh: roh.slice(0, 400) });
        plan = JSON.parse(roh.slice(a, b + 1));
      }

      if (dateiname && !plan.name) plan.name = String(dateiname).replace(/\.pdf$/i, '');
      return res.status(200).json({ plan: plan });

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
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
