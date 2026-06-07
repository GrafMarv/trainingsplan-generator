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
        max_tokens: 1000,
        system: `Du bist ein Trainingsplan-Assistent. Verfügbare Übungen: ${exercises}.
Antworte NUR mit einem JSON-Array. Kein Text davor oder danach.
Format: [{"exercise":"Name","imageKey":"exakter_dateiname_ohne_png","group":"A","type":"reps","sets":3,"reps":"10","note":""}]
WICHTIG für group:
- Wenn Übungen als Superset zusammen trainiert werden: gleiche Gruppe vergeben (A1+A2, B1+B2 etc.)
- Erste Supersetgruppe = "A", zweite = "B", dritte = "C" usw.
- Einzelübungen ohne Superset = "-"
- Jede Übung im Superset bekommt dieselbe Gruppe!`,
        messages: [{ role: 'user', content: input }]
      })
    });
    const data = await response.json();
    console.log('API Response: