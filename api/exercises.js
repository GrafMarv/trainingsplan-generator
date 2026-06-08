export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://api.github.com/repos/GrafMarv/trainingsplan-generator/contents/exercises',
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    );
    const files = await response.json();
    const exercises = files
      .filter(f => f.name.endsWith('.png') && f.name.includes('_') && !f.name.startsWith('ChatGPT') && !f.name.startsWith('placeholder'))
      .map(f => f.name.replace('.png', '').toLowerCase());
    res.status(200).json({ exercises });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
