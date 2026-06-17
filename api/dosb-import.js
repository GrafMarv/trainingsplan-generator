export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const SECRET = process.env.SETUP_SECRET;

  if (req.method !== 'POST') return res.status(405).end();
  if (SECRET && req.headers['x-setup-secret'] !== SECRET) return res.status(403).json({error:'forbidden'});

  const chunks = [
  {
    "titel": "DOSB Belastungsstruktur: Volumen und Lastfaktoren",
    "inhalt": "Belastung = Volumen x 3 Lastfaktoren. Periodisierungsindikator = Volumen x Gewicht x Einheit. Lastfaktor 1: Prozent der maximalen Intensitat. Lastfaktor 2: Prozent der maximalen Geschwindigkeit (Tempo/Intention). Volumen = Satze x Wiederholungen (Prozent der Ausbelastung) x Serien. Relevant: zeitlicher Umfang, Einheiten pro Woche, Regenerationszeit bis zum gleichen Reiz.",
    "tags": [
      "belastung",
      "volumen",
      "periodisierung",
      "lastfaktoren",
      "intensitat",
      "methodik"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Cardiac Output Methode (GA1 / Grundlagenausdauer / Dauermethode)",
    "inhalt": "Ziel: Grundlagenausdauer. Anpassungen: exzentrische Hypertrophie des linken Herzens, verbesserte Kapillarisierung und AVDO2, erhoehte Mitochondriendichte, gesteigerte aerobe Enzyme, Parasympathikus-Stimulation, verbesserte autonome Recovery. Intensitat: RPE 4-7, HR 100-150 (GA1), 60-70% VO2max, 70% Vanae. Keine Bewegungspause. Volumen: 1 Satz x 30-90 Min. Frequenz: taeglich. Regeneration: 24 Std. Varianten: kontinuierlich oder Kreistraining. Eignet sich als restorative Methode.",
    "tags": [
      "grundlagenausdauer",
      "ga1",
      "cardiac-output",
      "aerob",
      "dauermethode",
      "regeneration"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "STO Methode (Tempo-Methode / Oxidative Methode / Slow-Twitch Hypertrophie)",
    "inhalt": "Ziel: Ansteuerung langsam zuckender Muskelfasern durch konstante Spannung und langsames Tempo. Lokale ischaemische Anpassung, Steigerung der CSA (Muskelquerschnitt). Intensitat: RPE 7-8, 40-70% 1RM, Tempo 2-3|0|2-3|0 (4-6s). Pause: 30-40s. Volumen: 3-5 Satze x 8-10 Wdh (40-60s). Zeitumfang: 12-34 Min. Frequenz: 2x/Woche. Regeneration: 24-48 Std.",
    "tags": [
      "sto",
      "slow-twitch",
      "hypertrophie",
      "tempo-methode",
      "muskelquerschnitt",
      "oxidativ"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "HICT Methode (Hoch-Intensives-Kontinuierliches-Training)",
    "inhalt": "Ziel: Rekrutierung schnellzuckender Muskelfasern, Entwicklung Typ IIa Fasern, Steigerung O2-Nutzung. Gute Regenerationsmethode fuer FT-Athleten. Intensitat: RPE 7-8, 20-30 RPM, unterhalb anaerober Schwelle. Pause: 5-10 Min aktiv. Volumen: 1-3 Satze x 5-20 Min. Zeitumfang: 15-80 Min. Frequenz: 1-2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "hict",
      "kontinuierlich",
      "schnellzuckend",
      "typ-iia",
      "ft-athleten"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Oxidativer Sprint / Hill Sprint Methode",
    "inhalt": "Ziel: Rekrutierung schnellzuckender Muskelfasern, Typ IIa Entwicklung, Herzfrequenzerholung stimulieren. Bei defizitaerer Erholungszeit individueller als strikt vorgegebene Intervalle. Intensitat: RPE 5-6, ueber 90% Vmax, unterhalb anaerober Schwelle. Pause: HR 100-120, individuelle aerobe Schwelle. Volumen: 1 Satz (20-60 Min) x 5-7 Sek pro Sprint. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "hill-sprint",
      "oxidativer-sprint",
      "vmax",
      "schnelligkeit",
      "herzfrequenzerholung"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Aerobic Balistic Methode (Leichte Plyometrische Zirkel)",
    "inhalt": "Ziel: Rekrutierung schnellzuckender Muskelfasern, Typ IIa Entwicklung, Herzfrequenzerholung stimulieren. Intensitat: RPE 5-6, unterhalb anaerob, moderate Intensitat. Pause: 10-30s / 5-10 Min aktiv. Volumen: 5-10 Min (ca. 8-30 Satze) x 8-10 Wdh x 1-3 Serien. Zeitumfang: 5-50 Min. Frequenz: 2-3x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "aerobic-balistic",
      "plyometrie",
      "schnellzuckend",
      "zirkeltraining",
      "herzfrequenzerholung"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "FTO Methode (Explosive Repeat)",
    "inhalt": "Ziel: Rekrutierung schnellzuckender Muskelfasern, Typ IIa Entwicklung, Erholungsfahigkeit der FT-Fasern. ST-Fasern steigern die Rate der Laktatoxidation (LDH-Aktivitat). Intensitat: RPE 5-8, unterhalb anaerob, ueber 90% Pmax. Pause: 25-52s / 8-10 Min aktiv. Volumen: 8-10 Satze x 5-14 Sek x 2-6 Serien. Zeitumfang: 24-110 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "fto",
      "explosive-repeat",
      "laktatoxidation",
      "ldh",
      "ft-fasern",
      "power"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Schwellen-Methode (Extensive Intervalle / Schwellenmethode)",
    "inhalt": "Ziel: Anheben der anaeroben Schwelle. Klassische Variante: 95-105% Schwellengeschwindigkeit (Zone 2), aktive Pausen 3+ Min bei 60-70% Schwellengeschwindigkeit. Moderne Schwellenmethode: 10 Schlaege unterhalb anaerober Schwelle, trainiert MCT-1 Laktataufnahme-Transporter. Intensitat: RPE 5-7, HR anaerob-10 bis anaerob, 80-85% vVO2max. Pause: 2-3 Min aktiv bei 70% vVO2max. Volumen: 2-5 Satze x 3-10 Min. Zeitumfang: 14-50 Min. Frequenz: 3-4x/Woche. Regeneration: 2-3 Tage. Variante 1: kontinuierlich (5x8, 4x10, 3x12, 3x15, 2x20). Variante 2: extensive Intervalle. Variante 3: aerobe Intervalle.",
    "tags": [
      "schwellenmethode",
      "anaerobe-schwelle",
      "mct-1",
      "laktat",
      "zone2",
      "extensive-intervalle"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Aerobe Intervalle (Kurze Extensive Intervalle / Schwellenmethode Variante 3)",
    "inhalt": "Dritte Variante der Schwellenmethode. Ziel: Laktat als Energiequelle nutzen, MCT-1 Laktataufnahme-Transporter entwickeln, anaerobe Schwelle anheben. Intensitat: unterhalb anaerober Schwelle, 85-90% V anaerobe Schwelle. Pause: 1:1 Arbeit:Erholung, 1:1 bis 2:1 Serienpause. Volumen: 1-3 Serien x 20-60s pro Intervall, 10-20 Min. Zeitumfang: 10-80 Min. Frequenz: 1-2x/Woche. Regeneration: 1-2 Tage.",
    "tags": [
      "aerobe-intervalle",
      "kurze-extensive-intervalle",
      "mct-1",
      "schwellenmethode",
      "laktat"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Schwellen-Intervalle (Extensive Intervalle Aerobe Power)",
    "inhalt": "Ziel: Aerobe Enzyme SDH (Succinatdehydrogenase) shuttelt H+ in die Elektronentransportkette. Steigerung der Pufferkapazitat. Anheben der anaeroben Schwelle. Intensitat: 80-90% VO2max, ca. anaerobe Schwelle. Pause: 1 Min. Volumen: 5-8 Satze x 2 Min. Zeitumfang: 15-24 Min. Frequenz: 2-3x/Woche. Regeneration: 1-2 Tage.",
    "tags": [
      "schwellen-intervalle",
      "sdh",
      "pufferkapazitat",
      "aerobe-power",
      "vo2max"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "HRIT Methode (Aerobe Power / Kurze HIT)",
    "inhalt": "Ziel: Rekrutierung schnellzuckender Muskelfasern, Steigerung Leistungskapazitat, Herzfrequenzerholung stimulieren. Bei defizitaerer Erholungszeit individueller als strikt vorgegebene Intervalle. Intensitat: RPE 7-8, unterhalb anaerob. Pause: HR 130-140 oder aerobe Schwelle. Volumen: 15-20 Satze x 10-12 Sek. Zeitumfang: so lange es dauert. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "hrit",
      "aerobe-power",
      "schnellzuckend",
      "herzfrequenzerholung",
      "kurze-hit"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Cardiac Power Methode (4x4 / Lange HIT)",
    "inhalt": "Ziel: Steigerung Ausdauerleistungsfahigkeit des Myocardiums, Kontraktilitaet des Herzens und Mitochondriendichte, VO2max. Achtung: cardiale Voraussetzungen beachten. Intensitat: RPE 9-10, 95% HRmax, 90-100% vVO2max. Pause: 3-4 Min. Volumen: 4-6 Satze x 4-8 Min. Zeitumfang: 25-70 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage. Entspricht dem klassischen norwegischen 4x4-Protokoll (Helgerud).",
    "tags": [
      "cardiac-power",
      "4x4",
      "vo2max",
      "hiit",
      "lange-hit",
      "myocard",
      "helgerud"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "HIIT Methode (Kurze HIT / 15/15 Intervalle)",
    "inhalt": "Ziel: Verbesserung der VO2max mit reduzierten laktaziden Reizen. Achtung: cardiale Voraussetzungen beachten. Intensitat: RPE 9-10, 95% HRmax, 100-120% vVO2max. Pause: 10-30s (1:2 bis 1:1) bei 70% VO2max. Volumen: 3 Satze x 10-12 Min mit 10-30s Intervallen. Zeitumfang: 20-30 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage. Entspricht dem 15/15-Intervall-Format bei Nutzung von vIFT als Intensitaetssteuerung.",
    "tags": [
      "hiit",
      "kurze-hit",
      "vo2max",
      "intervall",
      "15/15",
      "vift",
      "laktazid"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Repeated Sprint Methode (Short Shuttle)",
    "inhalt": "Ziel: Steigerung Laktattransporter MCT-1, Steigerung der Schnelligkeit. Achtung: cardiale Voraussetzungen beachten. Intensitat: RPE 9-10, 120-160% vVO2max. Pause: unter 20 Sek, Serienpause 6 Min. Volumen: 2-3 Satze x 4-10 Sek x 2-3 Serien. Zeitumfang: 8-13 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "repeated-sprint",
      "short-shuttle",
      "mct-1",
      "schnelligkeit",
      "rsa"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Sprint Interval Methode (Set Sprint Endurance)",
    "inhalt": "Ziel: Steigerung Laktattransporter MCT-4, hoch-laktazide Belastung. Achtung: cardiale Voraussetzungen beachten. Intensitat: RPE 9-10, ueber 160% vVO2max. Pause: 2 Min. Volumen: 6-10 Satze x ueber 20s pro Sprint. Zeitumfang: 8-22 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "sprint-interval",
      "mct-4",
      "laktazid",
      "sprint-endurance",
      "supramaximal"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Lactic Power Methode",
    "inhalt": "Ziel: Steigerung der glykolytischen Enzyme (PFK). Intensitat: RPE 7-9, unter 90% Pmax jede Wdh. Pause: 1-3 Min / 8-15 Min aktive Pause. Volumen: 3 Satze x 20-40 Sek x 2-4 Serien. Zeitumfang: 15-55 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "lactic-power",
      "pfk",
      "glykolytisch",
      "intensives-intervall",
      "anaerob"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Lactic Capacity Methode",
    "inhalt": "Ziel: Steigerung der Pufferkapazitat des Muskels, Vergroesserung der lokalen Glykogenspeicher. Intensitat: RPE 9-10, mindestens 100% vVO2max. Pause: ueber 2 Min / 3-5 Min Pause. Volumen: 3-6 Satze x 45-120 Sek x 1-3 Serien. Zeitumfang: 15-100 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "lactic-capacity",
      "pufferkapazitat",
      "glykogen",
      "intensives-intervall",
      "anaerob"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  },
  {
    "titel": "Lactic Explosiv Methode",
    "inhalt": "Ziel: Aufrechterhaltung der Explosivkraftleistung im sauren Milieu, Steigerung der Pufferkapazitat des Muskels, Steigerung der glykolytischen Enzyme (PFK). Intensitat: RPE 7-9, Pmax jede Wdh. Pause: 10-30 Sek / 6-8 Min aktive Pause. Volumen: 3-6 Satze x 12-40 Sek x 1-3 Serien. Zeitumfang: 5-41 Min. Frequenz: 2x/Woche. Regeneration: 2-3 Tage.",
    "tags": [
      "lactic-explosiv",
      "explosivkraft",
      "saures-milieu",
      "pufferkapazitat",
      "pfk",
      "anaerob"
    ],
    "quelle": "DOSB Trainingsmethoden 2016, Stefan Adler, Trainerakademie Koeln"
  }
];

  const results = [];
  for (const chunk of chunks) {
    try {
      const embResp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: chunk.titel + ' ' + chunk.inhalt })
      });
      const embData = await embResp.json();
      const embedding = embData.data?.[0]?.embedding;
      if (!embedding) { results.push({ titel: chunk.titel, error: 'embedding failed' }); continue; }

      const id = chunk.titel.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48) + '_dosb';
      const row = { id, titel: chunk.titel, inhalt: chunk.inhalt, tags: chunk.tags, quelle: chunk.quelle, embedding };
      const upsResp = await fetch(SUPABASE_URL + '/rest/v1/brain_chunks', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(row)
      });
      if (upsResp.ok || upsResp.status === 201 || upsResp.status === 200) {
        results.push({ titel: chunk.titel, ok: true });
      } else {
        const err = await upsResp.text();
        results.push({ titel: chunk.titel, error: err.slice(0,100) });
      }
    } catch(e) {
      results.push({ titel: chunk.titel, error: e.message });
    }
  }
  const ok = results.filter(r => r.ok).length;
  res.json({ inserted: ok, total: chunks.length, results });
}
