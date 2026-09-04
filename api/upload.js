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

    const url = `https://api.github.com/repos/GrafMarv/trainingsplan-generator/contents/exercises/${filename}`;
    const ghHeaders = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'coaching-brain'
    };

    // Beim Ersetzen verlangt GitHub die aktuelle SHA der Datei.
    let sha = null;
    const vorhanden = await fetch(url + '?ref=main', { headers: ghHeaders });
    if (vorhanden.ok) {
      const info = await vorhanden.json();
      sha = info.sha || null;
    }

    const nutzlast = {
      message: sha ? `bild ersetzt: ${filename}` : `neue uebung: ${filename}`,
      content: imageBase64,
      branch: 'main'
    };
    if (sha) nutzlast.sha = sha;

    const response = await fetch(url, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(nutzlast)
    });

    if (!response.ok) {
      let text = '';
      try { const err = await response.json(); text = err.message || JSON.stringify(err); }
      catch (e) { text = await response.text(); }
      return res.status(500).json({ error: 'GitHub ' + response.status + ': ' + text, ersetzt: !!sha });
    }

    const result = await response.json();
    res.status(200).json({ success: true, commit: result.commit.sha.slice(0, 12) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
