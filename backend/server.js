'use strict';

// Backend von Maschenwerk.
//
// Bewusst OHNE Nutzerverwaltung: die App läuft nur im Heimnetz und hat genau
// einen Nutzer. Das Backend ist schmal: Daten speichern, Export/Import und das
// Update auf Knopfdruck. Alles Rechnen passiert im Browser.

const fs = require('fs');
const path = require('path');
const express = require('express');

const db = require('./db');
const { version: VERSION } = require('./package.json');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

// Update auf Knopfdruck (Muster TrackingDRS): der Dienst darf selbst nichts
// installieren. Er legt nur eine leere Anfrage-Datei ab; eine systemd-.path-Unit
// startet daraufhin als root maschenwerk-selbstupdate. Dessen Ergebnisse liegen
// in UPDATE_STAND (root gehört der Ordner, der Dienst liest nur).
const UPDATE_ANFRAGE = path.join(db.DATA_DIR, 'update');
const UPDATE_STAND = process.env.UPDATE_STAND || '/var/lib/maschenwerk-update';
const UPDATE_EINHEIT = process.env.UPDATE_EINHEIT || '/etc/systemd/system/maschenwerk-update-ausfuehren.path';
const UPDATE_ARTEN = ['pruefen', 'ausfuehren'];

const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, version: VERSION }));

app.get('/api/snapshot', (_req, res) => {
  res.json({ ...db.exportAlles(), version: VERSION, serverTime: new Date().toISOString() });
});

app.get('/api/settings', (_req, res) => res.json(db.getSettings()));
app.put('/api/settings', (req, res) => res.json(db.saveSettings(req.body || {})));

// --- CRUD für alle Payload-Tabellen ---------------------------------------
for (const t of db.TABELLEN) {
  const store = db.stores[t];
  const r = express.Router();
  r.get('/', (_req, res) => res.json(store.list()));
  r.get('/:id', (req, res) => {
    const obj = store.get(req.params.id);
    if (!obj) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(obj);
  });
  r.put('/:id', (req, res) => {
    const body = req.body || {};
    if (body.id !== req.params.id) return res.status(400).json({ error: 'id passt nicht' });
    res.json(store.save(body));
  });
  r.delete('/:id', (req, res) => {
    store.delete(req.params.id);
    res.status(204).end();
  });
  app.use(`/api/${t}`, r);
}

// --- Export / Import -------------------------------------------------------
app.get('/api/export', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="maschenwerk-${stamp}.json"`);
  res.json({ app: 'maschenwerk', version: VERSION, exportiertAm: new Date().toISOString(), daten: db.exportAlles() });
});
app.post('/api/import', (req, res) => {
  const body = req.body || {};
  if (body.app !== 'maschenwerk' || !body.daten) return res.status(400).json({ error: 'Das ist keine Maschenwerk-Sicherung.' });
  db.importAlles(body.daten);
  res.json({ ok: true });
});

// --- Update ----------------------------------------------------------------
function leseJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(UPDATE_STAND, name), 'utf8')); } catch (_) { return null; }
}
function leseProtokoll() {
  try { return fs.readFileSync(path.join(UPDATE_STAND, 'protokoll.txt'), 'utf8').split('\n').slice(-200).join('\n'); } catch (_) { return ''; }
}
function updateStand() {
  const lauf = leseJson('lauf.json');
  const wartet = {};
  for (const a of UPDATE_ARTEN) wartet[a] = fs.existsSync(path.join(UPDATE_ANFRAGE, a));
  return {
    eingerichtet: fs.existsSync(UPDATE_EINHEIT),
    version: VERSION,
    pruefung: leseJson('stand.json'),
    lauf,
    laeuft: !!(lauf && lauf.beginn && !lauf.ende),
    wartet,
    protokoll: leseProtokoll(),
  };
}

app.get('/api/system', (_req, res) => res.json(updateStand()));
app.post('/api/system/update/:art', (req, res) => {
  const art = req.params.art;
  if (!UPDATE_ARTEN.includes(art)) return res.status(400).json({ error: 'Unbekannte Aktion.' });
  const s = updateStand();
  if (!s.eingerichtet) return res.status(409).json({ error: 'Das Update über die Seite geht nur im Container.' });
  if (s.laeuft || s.wartet.ausfuehren) return res.status(409).json({ error: 'Es läuft schon ein Update.' });
  fs.mkdirSync(UPDATE_ANFRAGE, { recursive: true });
  fs.writeFileSync(path.join(UPDATE_ANFRAGE, art), new Date().toISOString());
  res.json(updateStand());
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Serverfehler' });
});

app.listen(PORT, HOST, () => {
  console.log(`Maschenwerk ${VERSION} lauscht auf http://${HOST}:${PORT}`);
});
