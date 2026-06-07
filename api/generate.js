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
Antworte NUR mit einem JSON-Array. Kein Text davor oder danach.
Format: [{"exercise":"Name","imageKey":"exakter_dateiname_ohne_png","group":"A","type":"reps","sets":3,"reps":"10","intensity":"","rest":"","note":""}]

FELDER:
- exercise: Übungsname (leserlich, z.B. "Pull-up")
- imageKey: exakter Dateiname ohne .png aus der Übungsliste
- group: Supersetgruppe "A","B","C" usw. Einzelübungen = "-"
- type: "reps" oder "time"
- sets: Anzahl Sätze als Zahl
- reps: Wiederholungen oder Sekunden als Text (z.B. "8", "8-10", "30")
- intensity: NUR wenn im Input angegeben! RPE (z.B. "RPE 8") oder Prozent (z.B. "80%"). Sonst leer "".
- rest: NUR wenn im Input angegeben! Pause in Sekunden als Text (z.B. "90 Sek."). Sonst leer "".
- note: kurze Hinweise, sonst ""

WICHTIG für group:
- Supersets: gleiche Gruppe vergeben (A1+A2, B1+B2)
- Erste Supersetgruppe = "A", zweite = "B", dritte = "C"
- Einzelübungen = "-"
- Jede Übung im Superset bekommt dieselbe Gruppe!`,
        messages: [{ role: 'user', content: input }]
      })
    });
    const data = await response.json();
    console.log('API Response:', JSON.stringify(data));
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