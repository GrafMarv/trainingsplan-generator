// api/players.js
// CRUD for Spielerprofile, stored in Supabase table cb_players.
// The Supabase Service Key stays server-side and is never exposed to the browser.
//
// GET    /api/players          -> { players: [...] }
// POST   /api/players          -> body = single player object OR { players: [...] } (bulk upsert)
// DELETE /api/players?id=<id>  -> deletes one player by id

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  // Anmeldepflicht. Sie greift nur, wenn ANMELDEPFLICHT gesetzt ist UND
  // mindestens ein Trainerzugang mit Vollzugriff aktiv ist. Ohne einen
  // solchen Zugang bleibt die Tuer offen, damit sich niemand aussperrt.
  {
    const an = String(process.env.ANMELDEPFLICHT || '').toLowerCase();
    const pflicht = an === '1' || an === 'true' || an === 'ja' || an === 'on';
    if (pflicht) {
      const h2 = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      };
      const lese = async function (pfad) {
        const r = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: h2 });
        if (!r.ok) return [];
        const j = await r.json().catch(function () { return []; });
        return Array.isArray(j) ? j : [];
      };
      const voll = await lese('cb_trainer?rolle=eq.voll&status=eq.aktiv&select=id&limit=1');
      if (voll.length) {
        const tok = (req.headers && req.headers['x-trainer-session']) || '';
        let ich = null;
        if (tok) {
          const se = await lese('cb_trainer_session?token=eq.' + encodeURIComponent(String(tok)) + '&select=*');
          if (se.length && se[0].expires && new Date(se[0].expires).getTime() > Date.now()) {
            const t = await lese('cb_trainer?id=eq.' + encodeURIComponent(se[0].trainer_id) + '&select=*');
            if (t.length && t[0].status !== 'gesperrt') ich = t[0];
          }
        }
        if (!ich) return res.status(401).json({ error: 'Bitte anmelden' });
        if (req.method !== 'GET' && ich.rolle !== 'voll') {
          return res.status(403).json({ error: 'Dein Zugang darf nur ansehen, nicht aendern' });
        }
      }
    }
  }

  const base = SUPABASE_URL + '/rest/v1/cb_players';
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(base + '?select=data&order=updated_at.desc', { headers: headers });
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'GET failed: ' + t });
      }
      const rows = await r.json();
      const players = rows.map(function (row) { return row.data; });
      return res.status(200).json({ players: players });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      let list;
      if (body && Array.isArray(body.players)) list = body.players;
      else if (body && body.id) list = [body];
      else return res.status(400).json({ error: 'No player(s) provided' });

      const payload = list.map(function (p) {
        return { id: String(p.id), data: p, updated_at: new Date().toISOString() };
      });

      const r = await fetch(base, {
        method: 'POST',
        headers: Object.assign({}, headers, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'Upsert failed: ' + t });
      }
      return res.status(200).json({ ok: true, count: payload.length });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) ? req.query.id : null;
      if (!id) return res.status(400).json({ error: 'No id provided' });
      const r = await fetch(base + '?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: headers
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: 'Delete failed: ' + t });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
