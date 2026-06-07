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

Jede Übung hat folgende Felder:
- exercise: lesbarer Übungsname z.B. "Pull-up"
- imageKey: exakter Dateiname ohne .png aus der Übungsliste
- group: Supersetgruppe "A","B","C" oder "-" für Einzelübungen
- type: "reps" oder "time"
- sets: Anzahl Sätze als Zahl
- reps: Wiederholungen als Text
- intensity: Intensitätsvorgabe als Text. Wenn RPE im Input steht z.B. "RPE 8". Wenn Prozent im Input steht z.B. "80%". Wenn nichts angegeben dann null.
- rest: Pause als Text z.B. "90 Sek.". Wenn keine Pause angegeben dann null.
- note: Hinweis als Text oder null.

Supersets: gleiche Gruppe vergeben. Erste Gruppe = "A", zweite = "B" usw.
Einzelübungen = "-".

Beispiel Output:
[{"exercise":"Pull-up","imageKey":"pull-up_strength_upper_pull_dyn_bi","group":"A","type":"reps","sets":4,"reps":"8","intensity":"RPE 8","rest":"90 Sek.","note":null}]`,
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