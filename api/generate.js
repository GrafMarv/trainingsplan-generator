// api/generate.js — mit Supabase semantischer Suche

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { input, voice_sort, image_base64, image_media_type } = req.body;

    // Voice sort OR image analysis mode
    if (voice_sort) {
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      const system = 'Du bist ein Assistent fuer Athletiktraining. Teile den folgenden Trainingsinhalt in die passenden Bloecke auf: Warm-up, Sprunge, Sprints, Schnellkraft, Kraft, Ausdauer, Cooldown. Antworte NUR mit einem JSON-Objekt ohne Markdown. Schuessel exakt: Warm-up, Sprunge, Sprints, Schnellkraft, Kraft, Ausdauer, Cooldown. Wert ist praegnanter Text oder leerer String.';
      
      // Build message content - text or image+text
      let userContent;
      if (image_base64) {
        userContent = [
          { type: 'image', source: { type: 'base64', media_type: image_media_type || 'image/jpeg', data: image_base64 } },
          { type: 'text', text: String(input) }
        ];
      } else {
        userContent = String(input);
      }

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, system, messages: [{ role: 'user', content: userContent }] })
      });
      const d = await resp.json();
      const plan = (d.content || []).map(c => c.text || '').join('');
      return res.status(200).json({ plan });
    }

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
    let usedChunks = [];
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
              usedChunks = matchData.map(c => ({
                titel: c.titel || '',
                quelle: c.quelle || '',
                tags: c.tags || [],
                inhalt: (c.inhalt || '').slice(0, 400)
              }));
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
          usedChunks = scored.map(c => ({
            titel: c.titel || '',
            quelle: c.quelle || '',
            tags: c.tags || [],
            inhalt: (c.inhalt || '').slice(0, 400)
          }));
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

WICHTIG — Erkenne den Einheitstyp automatisch:
- Ausdauer/Intervall-Einheit (Keywords: Intervall, HIIT, 15/15, vIFT, GA1, Schwelle, Dauerlauf, Laufen, Sprint-Methode, Cardiac Output, Ausdauer) → Hauptblock als "interval" oder "continuous" Block (KEIN exercises-Array!)
- Kraft/Beweglichkeit/Technik → Hauptblock als "main" Block mit exercises-Array

Antworte NUR mit dem JSON. Kein Text davor oder danach.

FORMAT A — Kraft-Einheit (exercises-Array):
[
  {
    "type": "main",
    "label": "Hauptblock",
    "exercises": [
      {
        "exercise": "lesbarer Name",
        "imageKey": "exakter_id_aus_uebungsdatenbank",
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

FORMAT A — Intervall-Ausdauer-Einheit (type "interval", KEIN exercises-Array):
[
  {
    "type": "warmup",
    "label": "Warm-up",
    "exercises": [{"exercise": "Einlaufen", "imageKey": "", "group": "-", "type": "time", "sets": 1, "reps": "10", "intensity": null, "rest": null, "note": null}]
  },
  {
    "type": "interval",
    "label": "Hauptblock – HIIT 15/15",
    "method": "HIIT / 15-15 Intervalle (DOSB: Kurze HIT)",
    "intensity": "vIFT 22.5 km/h → 94 m pro Intervall | RPE 9-10 | 95% HRmax",
    "structure": "3 Serien x 12 Intervalle x 15 s Arbeit / 15 s aktiv",
    "pause": "3 Min aktive Serienpause (lockeres Traben)",
    "duration": "ca. 22 Min",
    "note": "Kurzer praxisnaher Hinweis fuer den Athleten, max. 1 Satz, keine Fachbegriffe. Z.B.: 'Tempo halten bis zur letzten Serie.' oder 'Distanz nicht mehr schaffbar = Serie beenden.'"
  }
]

FORMAT A — Dauermethode (type "continuous", KEIN exercises-Array):
[
  {
    "type": "continuous",
    "label": "Hauptblock – Grundlagenausdauer",
    "method": "Cardiac Output / GA1 (Dauermethode)",
    "intensity": "RPE 4-7 | HR 100-150 | 60-70% VO2max | 70% Vanae",
    "structure": "1 Satz kontinuierlich",
    "pause": "keine Pause",
    "duration": "45 Min",
    "note": "Gleichmaessiges Tempo, zyklische Bewegung, Parasympathikus-Aktivierung"
  }
]

imageKey MUSS exakt einem ID aus der Übungsdatenbank entsprechen (nur bei exercises-Blöcken).
Supersets: gleiche Gruppe A, B, C. Einzelübungen = "-".
intensity: "RPE 8" oder "80%" — nur wenn angegeben, sonst null.
rest: "90 Sek." — nur wenn angegeben, sonst null.
Bei Ausdauer-Blöcken: berechne die Distanz aus vIFT wenn angegeben (Distanz = vIFT km/h x 15/3600 x 1000 = vIFT x 4.167 Meter). Nutze DOSB-Methoden-Terminologie.
Schreibe alle Felder des Ausdauer-Blocks kurz und direkt fuer den Athleten: keine Fachbegriffe, keine Erklaerungen, keine Klammern mit wissenschaftlichen Abkuerzungen. note: max. 1 kurzer Satz, praktischer Hinweis (z.B. "Tempo konstant halten." oder "Serie abbrechen wenn Distanz nicht mehr schaffbar.").

15/15-INTERVALL STARTVOLUMEN UND PROGRESSION:
Startpunkt nach Altersgruppe/Erfahrung (wenn nicht angegeben: konservativ ansetzen):
- U13/U14 oder Einsteiger HIIT: 2 Serien x 4 Intervalle (= 2 Min Netto)
- U16 oder mittleres Niveau: 3 Serien x 4 Intervalle (= 3 Min Netto)
- U18/Erwachsene oder erfahren: 3 Serien x 8-10 Intervalle (= 6-7.5 Min Netto)
Progression: erst Serien erhoehen (2→3), dann Intervalle pro Serie steigern (4→6→8→10→12→15).
Wochenprogression: Netto-Laufzeit pro Woche maximal 10-20% erhoehen.
Distanz bleibt immer konstant bei individuellem vIFT-Wert — NIE die Distanz erhoehen.
Abbruchkriterium fuer eine Serie: Zieldistanz nicht mehr haltbar → Serie sofort beenden.
Wenn kein vIFT angegeben: structure ohne Distanzangabe, nur Serien x Intervalle x Zeitstruktur.

=== FORMAT B — MAKROZYKLUS (JSON-Objekt) ===
{
  "kind": "macro",
  "title": "kurzer Titel des Plans",
  "intro": "1-2 Saetze: Ziel, Einheiten pro Woche und Typen, Methode, Peak-Zeitpunkt",
  "geruest_strikt": true,
  "uebungsgeruest": [
    { "exercise": "Back Squat", "imageKey": "back-squat_strength_lower_squat_dyn_bi", "group": "Unterkoerper", "supersatz": "", "schema": "4x5" }
  ],
  "ausdauer_geruest": "15/15 @ vIFT 21 km/h, U16",
  "weeks": [
    {
      "week": 1,
      "phase": "Allg. Vorbereitung",
      "deload": false,
      "sessions": [
        { "type": "kraft", "label": "Kraft", "load": "60%", "details": "3x10 Squat/RDL/Push @ RPE 6, Fokus Technik" },
        { "type": "ausdauer", "label": "Ausdauer", "load": "60%", "details": "15/15 2x4 @ vIFT 21 km/h = 87m, 3 Min Serienpause" }
      ]
    }
  ],
  "note": "kurzer Hinweis z.B. Taper-Logik"
}

Regeln FORMAT B:
- weeks: eine Woche pro Objekt, fortlaufend nummeriert (week: 1,2,3,...).
- sessions: Array mit einer Zeile pro Einheit dieser Woche. Typen: "kraft", "ausdauer", "mobility", "technik", "regeneration". Jede Session hat type, label, load (%), details.
- type bestimmt spaeter welches Format generiert wird: "kraft" → Format A mit exercises, "ausdauer" → Format A mit interval/continuous Block.
- details: 1-2 Saetze mit konkreten Belastungsvorgaben fuer diese Einheit dieser Woche. Progressiv ueber Wochen steigern. Immer ausfuellen.
- load: relative Last dieser Einheit in % als Orientierung (60/70/80/Entlastung).
- deload: true bei Entlastungswochen (typisch jede 3.-4. Woche).
- phase: Periodisierungsphase der Woche (Allg./Spez. Vorbereitung, Vorwettkampf, Wettkampf, Taper, Uebergang).
- uebungsgeruest: Kern-Uebungen fuer Kraft-Einheiten (4-8 Uebungen), konstant ueber alle Wochen. Nur wenn Plan Kraft-Einheiten enthaelt.
- ausdauer_geruest: kurze Beschreibung der Ausdauer-Methode und Parameter (vIFT, Altersgruppe), konstant ueber Plan. Nur wenn Plan Ausdauer-Einheiten enthaelt.
- geruest_strikt: true wenn Kraft-Grundstruktur konstant bleiben soll.
- Nutze Periodisierungs-Wissen aus der Wissensbasis (Step Loading 3:1/4:1, Peaking, Mikrozyklus-Frequenzen).
- Bei Ausdauer: Wochenprogression maximal 10-20% der Netto-Laufzeit. Startvolumen nach Altersgruppe (U14: 2x4, U16: 3x4, U18: 3x8).
- Bei kombinierten Plaenen (Kraft + Ausdauer): beide Modalitaeten progressiv und aufeinander abgestimmt planen.`;

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
    res.status(200).json({ plan: JSON.parse(clean), usedChunks: usedChunks });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
