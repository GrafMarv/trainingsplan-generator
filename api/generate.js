export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { input } = req.body;

    // Übungsliste direkt von GitHub holen - immer aktuell
    let exercises = [];
    try {
      const exResp = await fetch(
        'https://api.github.com/repos/GrafMarv/trainingsplan-generator/contents/exercises',
        { headers: { 'Accept': 'application/vnd.github.v3+json' } }
      );
      const files = await exResp.json();
      exercises = files
        .filter(f => f.name.endsWith('.png') && f.name.includes('_') && !f.name.startsWith('ChatGPT') && !f.name.startsWith('placeholder'))
        .map(f => f.name.replace('.png', '').toLowerCase());
    } catch(e) {
      exercises = req.body.exercises ? req.body.exercises.split(', ') : [];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        system: `Du bist ein Trainingsplan-Assistent. Verfügbare Übungen: ${exercises.join(', ')}.

Analysiere die Eingabe und erkenne automatisch ob Warm-up, Hauptblock und/oder Cool-down beschrieben werden.
- Wenn "Warm-up", "Aufwärmen" oder ähnliches erwähnt wird → eigener Warm-up Block
- Wenn "Cool-down", "Abwärmen", "Dehnen am Ende" oder ähnliches erwähnt wird → eigener Cool-down Block
- Alles andere → Hauptblock
- Wenn nichts explizit erwähnt wird → alles ist Hauptblock

Antworte NUR mit einem JSON-Array von Blöcken. Kein Text davor oder danach.
Format:
[
  {
    "type": "main",
    "label": "Hauptblock",
    "exercises": [
      {
        "exercise": "lesbarer Name",
        "imageKey": "exakter_dateiname_ohne_png",
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

Nur Blöcke einschließen die in der Eingabe vorkommen!
imageKey muss exakt einem der verfügbaren Übungsnamen entsprechen.
Supersets: gleiche Gruppe vergeben A, B, C. Einzelübungen = "-".
intensity: RPE z.B. "RPE 8" oder "80%" – nur wenn angegeben, sonst null.
rest: Pause z.B. "90 Sek." – nur wenn angegeben, sonst null.`,
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
