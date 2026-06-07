export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, mediaType } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 100,
        system: `Du bist ein Experte für Trainingswissenschaft. Analysiere die Übungsgrafik und gib NUR den Dateinamen zurück. Format: übungsname_kategorie. Kategorien: strength_upper_push_dyn_bi, strength_upper_push_dyn_uni, strength_upper_pull_dyn_bi, strength_upper_pull_dyn_uni, strength_upper_core_dyn_bi, strength_upper_core_sta_bi, strength_upper_core_sta_uni, strength_lower_push_dyn_bi, strength_lower_push_dyn_uni, strength_lower_push_sta_bi, strength_lower_push_sta_uni, strength_lower_pull_dyn_bi, strength_lower_pull_dyn_uni, strength_lower_pull_sta_bi, strength_lower_pull_sta_uni, strength_lower_adduction_sta_uni, jump_vertical_jump, jump_horizontal_jump, sprint_acceleration_dyn, mobility_full_body_dyn, mobility_lower_sta, mobility_upper_sta, misc. Übungsnamen: kleinbuchstaben mit bindestrichen. Nur den Dateinamen, nichts sonst.`,
        messages: [{
          role: 'user',
          content: [{
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 }
          }, {
            type: 'text',
            text: 'Wie heißt diese Übung?'
          }]
        }]
      })
    });

    const data = await response.json();
    const name = data.content?.[0]?.text?.trim().replace(/\.png$/i, '').toLowerCase();

    if (!name) return res.status(500).json({ error: JSON.stringify(data) });

    res.status(200).json({ name });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}