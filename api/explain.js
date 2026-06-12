// api/explain.js
// Erklaert einem Trainer in zugaenglicher Fachsprache, welche Wissens-Chunks die
// Generierung eines Trainingsplans/einer Einheit beeinflusst haben und warum.
//
// POST { chunks: [{titel,inhalt,tags,quelle}], context: {type, title, intro, input} }
// -> { explanation: string }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

    let { chunks, context } = req.body || {};
    chunks = Array.isArray(chunks) ? chunks.slice(0, 8) : [];
    context = context || {};

    if (chunks.length === 0) {
      return res.status(200).json({ explanation: 'Fuer diese Generierung wurden keine Wissens-Chunks aus der Datenbank herangezogen (z.B. weil die semantische Suche keine passenden Treffer gefunden hat).' });
    }

    const chunkBlock = chunks.map(function (c, i) {
      const tags = Array.isArray(c.tags) ? c.tags.join(', ') : '';
      return '['+(i+1)+'] "'+(c.titel||'')+'" (Quelle: '+(c.quelle||'unbekannt')+', Tags: '+tags+')\n'+(c.inhalt||'').slice(0,400);
    }).join('\n\n');

    let planDesc = '';
    if (context.type === 'macro') {
      planDesc = 'Es handelt sich um einen Mehrwochen-Plan (Makro-/Mesozyklus) mit dem Titel "'+(context.title||'')+'". Ziel/Methode laut Intro: '+(context.intro||'')+'.';
    } else {
      planDesc = 'Es handelt sich um eine einzelne Trainingseinheit mit dem Titel/Schwerpunkt "'+(context.title||'')+'"'+(context.intro?(' ('+context.intro+')'):'')+'.';
    }
    if (context.input) planDesc += '\nUrspruengliche Anfrage des Trainers: "'+String(context.input).slice(0,400)+'"';

    const system = `Du erklaerst einem erfahrenen Feldhockey-Athletiktrainer (DOSB-Athletiktrainer-Ausbildung), wie die KI-Generierung seines Trainingsplans zustande gekommen ist.

Du bekommst: (1) eine Beschreibung des generierten Plans, (2) die Wissens-Chunks aus seiner Coaching-Wissensbasis, die bei der Generierung als Kontext herangezogen wurden (per semantischer Suche ausgewaehlt, weil sie zur Anfrage passten).

AUFGABE:
Schreibe eine kurze, verstaendliche aber fachlich praezise Erklaerung (3-5 kurze Absaetze, KEINE Ueberschriften, KEINE Aufzaehlungszeichen, KEINE Quellenliste am Ende - die wird separat angezeigt) dazu:
- Welche der Wissensbausteine [1]-[${chunks.length}] vermutlich welche konkrete Entscheidung im Plan beeinflusst haben (z.B. Periodisierungsstruktur, Belastungssteuerung, Uebungsauswahl, Warm-Up-Aufbau, Deload-Platzierung) - referenziere dabei den jeweiligen Chunk-Titel in Anfuehrungszeichen, nicht die Nummer.
- Warum diese Wahl aus trainingswissenschaftlicher Sicht sinnvoll ist (kurze fachliche Begruendung, Fachbegriffe sind ok, aber kurz eingeordnet).
- Falls mehrere Chunks sich ergaenzen oder ein Konflikt aufgeloest wurde, erwaehne das.

Ton: kollegial, auf Augenhoehe mit einem Fach-Trainer, keine Floskeln wie "Ich habe mich entschieden" (du erklaerst die KI-Generierung, nicht deine eigene Meinung). Schreibe auf Deutsch, ASCII ist nicht erforderlich.`;

    const userMsg = planDesc + '\n\nVERWENDETE WISSENS-CHUNKS:\n\n' + chunkBlock;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 900,
        system: system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Claude API Fehler: ' + err });
    }

    const data = await response.json();
    const text = (data.content || []).map(function (b) { return b.text || ''; }).join('').trim();

    return res.status(200).json({ explanation: text || 'Keine Erklaerung erhalten.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
