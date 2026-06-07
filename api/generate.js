export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { input, exercises } = req.body;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `Du bist ein Trainingsplan-Assistent. Verfügbare Übungen: ${exercises}. Antworte NUR mit einem JSON-Array. Kein Text davor oder danach. Format: [{"exercise":"Name","imageKey":"exakter Dateiname","group":"-","type":"reps","sets":3,"reps":"10","note":""}]`,
      messages: [{ role: 'user', content: input }]
    })
  });

  const data = await response.json();
  const text = data.content[0].text;
  const clean = text.replace(/```json|```/g, '').trim();
  
  res.status(200).json({ plan: JSON.parse(clean) });
}