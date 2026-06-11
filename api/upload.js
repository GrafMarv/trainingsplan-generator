export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { filename, imageBase64 } = req.body;
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ error: 'GitHub Token fehlt' });

    // Validierung: nur einfache Bilddateinamen, keine Pfade oder Sonderzeichen
    if (typeof filename !== 'string' || !/^[a-z0-9._-]+\.(png|jpg|jpeg|webp)$/i.test(filename) || filename.includes('..')) {
      return res.status(400).json({ error: 'Ungueltiger Dateiname' });
    }
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      return res.status(400).json({ error: 'Kein Bildinhalt' });
    }

    const response = await fetch(
      `https://api.github.com/repos/GrafMarv/trainingsplan-generator/contents/exercises/${filename}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `neue übung: ${filename}`,
          content: imageBase64
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.message });
    }

    const result = await response.json();
    res.status(200).json({ success: true, commit: result.commit.sha.slice(0, 12) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
