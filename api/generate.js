// api/generate.js — mit Supabase semantischer Suche

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { input } = req.body;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    // Übungsliste laden
    let exercises = [];
    let exercisesWithImage = [];
    try {
      const exResp = await fetch(
        'https://raw.githubusercontent.com/GrafMarv/trainingsplan-generator/main/exercises.json?t=' + Date.now(),
        { headers: { 'Accept': 'application/json' } }
      );
      const exData = await exResp.json();
      exercises = exData.exercises.map(e => e.id);
      exercisesWithImage = exData.exercises.filter(e => e.hasImage).map(e => e.id);
    } catch(e) {
      exercises = [];
      exercisesWithImage = [];
    }

    // Semantische Suche via Supabase (wenn verfügbar)
    let brainContext = '';
    if (SUPABASE_URL && SUPABASE_KEY && OPENAI_KEY) {
      try {
        // 1. Input embedden
        const embedResp = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: input.slice(0, 2000)
          })
        });

        if (embedResp.ok) {
          const embedData = await embedResp.json();
          const queryEmbedding = embedData.data[0].embedding;

          // 2. Semantisch ähnlichste Chunks aus Supabase holen
          const matchResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query_embedding: queryEmbedding,
              match_count: 6
            })
          });

          if (matchResp.ok) {
            const matchData = await matchResp.json();
            if (matchData && matchData.length > 0) {
              brainContext = matchData.map(c =>
                `[${c.titel}]\n${c.inhalt}`
              ).join('\n\n---\n\n');
            }
          }
        }
      } catch(e) {
        // Fallback zu keyword-basiert wenn Supabase nicht erreichbar
        brainContext = '';
      }
    }

    // Fallback: keyword-basierte Suche aus knowledge.json
    if (!brainContext) {
      try {
        const knResp = await fetch(
          'https://raw.githubusercontent.com/GrafMarv/trainingsplan-generator/main/knowledge.json?t=' + Date.now()
        );
        const knData = await knResp.json();
        const inputLower = input.toLowerCase();
        const keywords = inputLower.split(/\s+/).filter(w => w.length > 3);
        
        const scored = knData.chunks.map(chunk => {
          const text = (chunk.titel + ' ' + chunk.inhalt + ' ' + (chunk.tags||[]).join(' ')).toLowerCase();
          const score = keywords.filter(k => text.includes(k)).length;
          return { ...chunk, score };
        }).filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);

        if (scored.length > 0) {
          brainContext = scored.map(c => `[${c.titel}]\n${c.inhalt}`).join('\n\n---\n\n');
        }
      } catch(e) {}
    }

    const systemPrompt = `Du bist ein Trainingsplan-Assistent für Feldhockey-Athletiktraining.

WISSENSPRIORITÄT (bei Konflikten zwischen Quellen):
1. Coaching-Philosophie des Trainers (eigene Chunks) — höchste Priorität
2. INSCYD / Sebastian Weber — metabolische Präzision (VLamax, MLSS, Energiesystemanteile)
3. HIIT Science / Buchheit & Laursen — Feldhockey-spezifische Belastungssteuerung, RSA
4. DOSB / Stefan Adler — Warm-Up Struktur, Bewegungsebenen, Pädagogik
5. NSCA — allgemeine Trainingswissenschaft, Grundlagen

KONTEXTREGELN:
- Bei Feldhockey: Quellen 2–4 bevorzugen
- Laktat = immer Endprodukt der Glykolyse, kein Abfallprodukt (INSCYD-Frame)
- Warm-Up: 5-A-Modell (Abholen→Aufwecken→Aufwärmen→Aktivieren→Anbahnen), 15–20 min
- Dynamisches Dehnen bevorzugen, statisches Dehnen nur im Abholen
- VLamax: für Spielsportarten höher erwünscht (Sprint), MLSS-Stabilität trotzdem relevant

${brainContext ? `COACHING BRAIN — RELEVANTE WISSENSBASIS:\n${brainContext}\n` : ''}

ÜBUNGSDATENBANK:
${exercises.join(', ')}

ÜBUNGEN MIT GRAFIK (bevorzuge wenn gleichwertig):
${exercisesWithImage.join(', ')}

ENTSCHEIDE ZUERST den Ausgabetyp:
- EINZELEINHEIT (eine Trainingseinheit): Standardfall -> FORMAT A (JSON-Array).
- MAKROZYKLUS (Mehrwochen-Planung: mehrere Wochen, Saison/Saisonvorbereitung, Periodisierung, Makro-/Mesozyklus, Aufbau ueber X Wochen) -> FORMAT B (JSON-Objekt mit "kind":"macro").

=== FORMAT A — EINZELEINHEIT (JSON-Array) ===
Analysiere die Eingabe und erkenne automatisch ob Warm-up, Hauptblock und/oder Cool-down beschrieben werden.
- "Warm-up", "Aufwärmen" → eigener Warm-up Block
- "Cool-down", "Abwärmen" → eigener Cool-down Block  
- Alles andere → Hauptblock
- Nichts erwähnt → alles Hauptblock

Antworte NUR mit dem JSON (Array bei Format A, Objekt bei Format B). Kein Text davor oder danach.
Format:
[
  {
    "type": "main",
    "label": "Hauptblock",
    "exercises": [
      {
        "exercise": "lesbarer Name",
        "imageKey": "exakter_id_aus_übungsdatenbank",
        "group": "-",
        "type": "reps",
        "sets": 3,
        "reps": "10",
        "intensity": null,
        "rest": null,
        "note": null
      }
    ]
  }
]

imageKey MUSS exakt einem ID aus der Übungsdatenbank entsprechen.
Supersets: gleiche Gruppe A, B, C. Einzelübungen = "-".
intensity: "RPE 8" oder "80%" — nur wenn angegeben, sonst null.
rest: "90 Sek." — nur wenn angegeben, sonst null.

=== FORMAT B — MAKROZYKLUS (JSON-Objekt) ===
{
  "kind": "macro",
  "title": "kurzer Titel des Plans",
  "intro": "1-2 Saetze: Ziel, Methode (z.B. Step Loading 3:1), Peak-Zeitpunkt",
  "weeks": [
    { "week": 1, "phase": "Allg. Vorbereitung", "focus": "Aerobe Basis, Anatomische Anpassung", "load": "60%", "sessions": "3x", "deload": false, "details": "konkrete Belastungsvorgaben, Schluesseluebungen, metabolische Ziele dieser Woche (1-2 Saetze)" }
  ],
  "note": "kurzer Hinweis, z.B. Taper-Logik vor dem Wettkampf"
}
Regeln FORMAT B:
- Eine Zeile pro Woche, fortlaufend nummeriert (week: 1,2,3,...).
- phase: Periodisierungsphase (Allg./Spez. Vorbereitung, Vorwettkampf, Wettkampf, Taper, Uebergang).
- focus: konkrete Schwerpunkte der Woche (Biomotorik, metabolisch).
- load: relative Last in % (Orientierung am Step-Loading-Muster, z.B. 60/70/80/Entlastung).
- sessions: geplante Einheiten pro Woche (z.B. "3x").
- deload: true bei Entlastungs-/Regenerationswochen (typisch jede 3.-4. Woche) und in der Taper-Woche.
- details: pro Woche 1-2 Saetze mit konkreten Belastungsvorgaben, Schluesseluebungen und metabolischen Zielen. Dieses Feld wird in der Tabelle NICHT angezeigt, dient aber als Kontext fuer die spaetere Generierung der Einzeleinheit. Immer ausfuellen.
- Nutze das Periodisierungs-Wissen aus der Wissensbasis (Step Loading 3:1/4:1, Peaking 40-60%, Mikrozyklus-Frequenzen, Jahresplan-Typen).`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: 'user', content: input }]
      })
    });

    const data = await response.json();
    if (!data.content || !data.content[0]) {
      return res.status(500).json({ error: JSON.stringify(data) });
    }
    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    res.status(200).json({ plan: JSON.parse(clean) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
