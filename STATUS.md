# STATUS — WHV Athletik

> Lebendes Dokument, wird bei jeder Aenderung mitgepflegt.
> In einem neuen Chat genuegt: **"Lies STATUS.md im Repo."**
> Achtung: Repo ist oeffentlich. Keine Schluessel, keine Spielerdaten hier hinein.

Stand: 04.09.2026

---

## 1. Wofuer

Athletik-Werkzeug fuer den Westdeutschen Hockey-Verband. Sechs Landestrainer,
davon zwei Athletiktrainer, die die eigentliche Arbeit im System machen.
Ziel: einsatzbereit zur Hallensaison im November 2026.

**Kader Feld:** U13, U14, U16, je maennlich und weiblich. Eine Einheit pro Woche,
U13/U14 montags, U16 mittwochs. Zwei Turniere im Jahr.
**Kader Halle:** P-Kader und U15, je maennlich und weiblich, parallel zum Feldkader.

**Jahrgaenge:** U13 = 2013, U14 = 2012, U16 = 2010/2011.
Zuordnung automatisch aus Geburtsdatum und Geschlecht, ueberschreibbar (Hochziehen).
Der Hallenkader ist eine zusaetzliche Zuordnung, keine Verschiebung.

---

## 2. Technik

| | |
|---|---|
| Repo | GrafMarv/trainingsplan-generator (oeffentlich) |
| Live | trainingsplan-generator.vercel.app |
| Hosting | Vercel Hobby, Auto-Deploy von main |
| Datenbank | Supabase Postgres + pgvector, EU/Paris |
| KI | Claude fuer Generierung, OpenAI text-embedding-3-small |
| Aufbau | Vanilla-JS-SPA in einer Datei, rund 414.000 Zeichen |
| Functions | 12 von 12 belegt, harte Grenze auf Hobby |

**Functions:** brain, brain-add, distill, exercises, explain, generate, knowledge,
library, players, rename, setup-brain, upload.

**Vercel-Umgebungsvariablen:** GITHUB_TOKEN (fine-grained, Contents Read+Write,
laeuft Juli 2027), SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY.

---

## 3. Regeln beim Arbeiten am Code

Diese Punkte haben schon mehrfach Zeit gekostet:

1. **Inline-JS strikt ASCII.** Umlaute in Skriptbloecken zerlegen die Seite.
   Loesung: Unicode-Escapes im JavaScript, Entities im HTML. Vor jedem Push pruefen.
2. **Immer frisches index.html holen**, SHA in derselben Ausfuehrung besorgen.
   Getrennte Schritte fuehren zu 409-Konflikten und Ueberschreibungen.
3. **Ein Push, dann testen.** Nie mehrere Aenderungen stapeln.
4. **Nach jedem Push pruefen:** Syntax aller Skriptbloecke, und ob jedes onclick eine
   Gegenstelle hat. Fehlender Code ist kein Syntaxfehler und faellt sonst erst im
   Betrieb auf.
5. **Element-IDs nicht entfernen, ohne die Registrierung mitzunehmen.** Ein fehlendes
   Element im Startblock hat einmal alle 29 Klick-Handler lahmgelegt. Jetzt abgesichert
   ueber die Hilfsfunktion onId.
6. **Dateischluessel von Uebungen sind stabil.** Sie sind die Referenz aus gespeicherten
   Plaenen. Name und Kategorie sind reine Anzeige und liegen in cb_exercise_meta.

---

## 4. Aufbau der Oberflaeche

Durchgehend heller Look, Verbandsgruen, gemeinsame Seitenleiste
(Startseite, Spieler, Diagnostik, Einheiten) aus einer Quelle: whvSide().

| Bereich | Zustand |
|---|---|
| Startseite | Banner, Kader Feld und Halle als Raster mit Spielerzahlen, drei Bereichskarten |
| Mannschaft | Banner mit naechster Einheit, Statuszahlen, Reiter Spieler/Trainings/Anwesenheit |
| Spieler | Banner, Grunddaten, Reiter Diagnostik/Verletzungen/Einheiten/Notizen |
| Diagnostik | Import, Teamuebersicht, Delta-Indikatoren |
| Einheiten | Startseite mit drei Optionen, Plan-Bibliothek, Uebungsbibliothek |
| Spieler verschieben | Zwei Kader nebeneinander, Ziehen oder Pfeil |
| Generator | hell, sonst unveraendert |
| Wissen, Dokumentation | noch im alten dunklen Look, ohne Seitenleiste |

**Im Spielerprofil:** Status (fit, angeschlagen, verletzt, Pause), Grunddaten mit
Geburtsquartal, Groesse, Gewicht, Verein, Kaderwechsel direkt umstellbar,
Staerkenprofil, Verlaufskurven, Einordnung mit Kurzfazit, Verletzungserfassung
mit Koerpergrafik, empfohlene Einheit.

**Staerkenprofil:** sechs Achsen. Antritt (10m), Max Speed (30m), Explosivkraft
(Standweitsprung), Ausdauer (vIFT), Richtungswechsel (505, Mittel aus rechts und links),
Rumpfrotation (MB-Wurf, Mittel aus beiden). Skala relativ zu Jahrgang und Geschlecht,
50 ist der Schnitt, ab drei Vergleichsspielern. Angezeigt wird der Abstand in der
echten Einheit, bewusst keine Punktzahl.

---

## 5. Datenmodell Spieler

    id, fn, ln, dob, sex, pos, club (immer WHV), verein (Heimatverein),
    team (Feldkader), halle (Hallenkader, optional), status, hgt, wgt, phv,
    notes, diag[], verletzungen[], empfehlung{}

    diag:         date, s10, s30, cr, cl, mr, ml, sw, ift
    verletzungen: id, datum, name, kontakt, regionen[], gewebe[], diagnose, notiz
    empfehlung:   name, planId, datum, quelle (manuell oder auto)

**Supabase-Tabellen:** cb_players, cb_knowledge, brain_chunks, cb_quiz_scores,
cb_quiz_state, cb_survey_responses, cb_saved_plans, cb_saved_blocks,
cb_training_docs, cb_exercise_meta.

---

## 6. Offen

**Vor November noetig**

- Anwesenheiten. Letzte fehlende Grundfunktion. Braucht Tabelle, oeffentliche
  Rueckmeldeseite fuer Spieler, Trainerdarstellung. Blockiert durch das Function-Limit.
- Zugangsgate. Die Seite ist offen erreichbar, dahinter liegen Namen, Geburtsdaten
  und Testwerte Minderjaehriger.
- DSGVO mit dem WHV klaeren. Wer ist Verantwortlicher? Entscheidet, auf welchen
  Account Supabase und Vercel gehoeren.
- Vercel Pro. Hobby ist nicht fuer organisatorische Nutzung lizenziert, dazu
  60-Sekunden-Timeout. Erst nach der Kontofrage buchen.

**Technisch**

- Function-Konsolidierung (Catch-all-Router). Ein Versuch scheiterte, Ursache nie
  geklaert, Wissen und Speichern fielen aus. Vor dem naechsten Anlauf diagnostizieren.
- Speicherfehler sichtbar machen. plUpsert verschluckt jeden Fehler stumm.
- Testdaten entfernen, sobald durchgetestet. Link unten auf der Startseite.
- Wissen und Dokumentation auf den hellen Look umstellen.

**Inhaltlich**

- Plan-Bibliothek fuellen. Macht Marvin selbst, Uebungsauswahl ist Fachentscheidung.
- PHV-Feld. Unklar, was hineingehoert. Kachel existiert, ohne Eingabe.
- Datei-Upload fuer Arztdiagnosen. Braucht einen Storage-Bucket in Supabase.
- Fehlende Uebungen: Bremsen und Cutting, Landetechnik, Steigerungslauf, Wicket Run,
  15/15-Intervalle, Shuttle Run, Hueftabduktion. Agility hat keine einzige Grafik.
- Doppelte Eintraege: Flying Sprint zweimal (max-speed und maximalgeschwindigkeit),
  A Skip zweimal (sprint und misc).

---

## 7. Uebungsbestand

149 PNG im Ordner exercises/, 267 Eintraege in exercises.json, also 118 ohne Grafik.
Namensschema: name_kategorie_subkategorie_merkmal_dynamik_seite

Kategorien: strength 159, mobility 48, jump 21, sprint 18, misc 11, agility 9.

---

## 8. Wie Marvin arbeitet

Kein lokales Tooling, keine IDE. Alle Aenderungen laufen ueber Python-Skripte gegen
die GitHub-API. Getestet wird im Browser, Rueckmeldung per Screenshot. Bevorzugt
fertige Loesungen statt Rueckfragen, und ehrliche Einschaetzungen statt Zustimmung.
Bei wiederholten Fehlversuchen lieber zurueck auf einen bekannten Stand als
weiter debuggen.
