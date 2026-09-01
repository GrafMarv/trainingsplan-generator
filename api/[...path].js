// api/[...path].js
// Catch-all router. Vercel zaehlt nur Dateien unter /api als Serverless Function.
// Die eigentlichen Handler liegen daher unter /lib und werden hier verteilt.
// Aufrufe bleiben unveraendert: /api/players, /api/generate, /api/library?... usw.

import h_brain_add from '../lib/brain-add.js';
import h_brain from '../lib/brain.js';
import h_distill from '../lib/distill.js';
import h_exercises from '../lib/exercises.js';
import h_explain from '../lib/explain.js';
import h_generate from '../lib/generate.js';
import h_knowledge from '../lib/knowledge.js';
import h_library from '../lib/library.js';
import h_players from '../lib/players.js';
import h_rename from '../lib/rename.js';
import h_setup_brain from '../lib/setup-brain.js';
import h_upload from '../lib/upload.js';

const ROUTES = {
  'brain-add': h_brain_add,
  'brain': h_brain,
  'distill': h_distill,
  'exercises': h_exercises,
  'explain': h_explain,
  'generate': h_generate,
  'knowledge': h_knowledge,
  'library': h_library,
  'players': h_players,
  'rename': h_rename,
  'setup-brain': h_setup_brain,
  'upload': h_upload,
};

export default async function handler(req, res) {
  const seg = req.query.path;
  const name = Array.isArray(seg) ? seg[0] : seg;
  const fn = ROUTES[name];
  if (!fn) {
    return res.status(404).json({
      error: 'Unbekannter Endpoint: ' + String(name),
      verfuegbar: Object.keys(ROUTES)
    });
  }
  return fn(req, res);
}
