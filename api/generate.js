export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { input, exercises } = req.body;
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
        system: `Du bist ein Trainingsplan-Assistent. Verfügbare Übungen: ${exercises}.

Analysiere die Eingabe und erkenne automatisch ob Warm-up, Hauptblock und/oder Cool-down beschrieben werden.
- Wenn "Warm-up", "Aufwärmen" oder ähnliches erwähnt wird → eigener Warm-up Block
- Wenn "Cool-down", "Abwärmen", "Dehnen am Ende" oder ähnliches erwähnt wird → eigener Cool-down Block
- Alles andere → Hauptblock
- Wenn nichts explizit erwähnt wird → alles ist Hauptblock

Antworte NUR mit einem JSON-Array von Blöcken. Kein Text davor oder danach.
Format:
[
  {
    "type": "warmup",
    "label": "Warm-up",
    "exercises": [...]
  },
  {
    "type": "main", 
    "label": "Hauptblock",
    "exercises": [...]
  },
  {
    "type": "cooldown",
    "label": "Cool-down", 
    "exercises": [...]
  }
]

Nur Blöcke einschließen die auch wirklich in der Eingabe vorkommen!

Jede Übung hat folgende Felder:
- exercise: lesbarer Übungsname z.B. "Pull-up"
- imageKey: exakter Dateiname ohne .png aus der Übungsliste
- group: Supersetgruppe "A","B","C" oder "-" für Einzelübungen
- type: "reps" oder "time"
- sets: Anzahl Sätze als Zahl
- reps: Wiederholungen als Text
- intensity: RPE z.B. "RPE 8" oder Prozent z.B. "80%" – nur wenn angegeben, sonst null
- rest: Pause z.B. "90 Sek." – nur wenn angegeben, sonst null
- note: Hinweis oder null

Supersets: gleiche Gruppe vergeben. Erste Gruppe = "A", zweite = "B" usw. Einzelübungen = "-".`,
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
