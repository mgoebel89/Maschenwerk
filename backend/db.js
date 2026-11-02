'use strict';

// Datenhaltung von Maschenwerk.
//
// Muster wie ImkereiApp: jede Entität liegt als EIN JSON-Payload in einer
// schmalen Tabelle (id, payload, last_modified). Neue Felder brauchen so keine
// Migration, und Export/Import funktioniert generisch über alle Tabellen.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/var/lib/maschenwerk';
const DB_PATH = path.join(DATA_DIR, 'data.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Reihenfolge = Reihenfolge im Export. `projekte` und `vorlagen` sind für
// Stufe B schon angelegt, damit ein Export aus Stufe A später vollständig
// wieder eingelesen werden kann.
const TABELLEN = ['personen', 'garne', 'proben', 'projekte', 'vorlagen'];

db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
for (const t of TABELLEN) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${t} (
      id            TEXT PRIMARY KEY,
      payload       TEXT NOT NULL,
      last_modified TEXT NOT NULL
    );
  `);
}

function nowIso() { return new Date().toISOString(); }

function makePayloadStore(table) {
  return {
    list() { return db.prepare(`SELECT payload FROM ${table}`).all().map(r => JSON.parse(r.payload)); },
    get(id) {
      const r = db.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id);
      return r ? JSON.parse(r.payload) : null;
    },
    save(obj) {
      if (!obj || !obj.id) throw new Error(`${table}.id fehlt`);
      obj.lastModifiedAt = nowIso();
      db.prepare(`
        INSERT INTO ${table} (id, payload, last_modified) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, last_modified = excluded.last_modified
      `).run(obj.id, JSON.stringify(obj), obj.lastModifiedAt);
      return obj;
    },
    delete(id) { db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id); },
  };
}

const stores = {};
for (const t of TABELLEN) stores[t] = makePayloadStore(t);

function getSettings() {
  const r = db.prepare("SELECT value FROM settings WHERE key = 'settings'").get();
  return r ? JSON.parse(r.value) : null;
}
function saveSettings(s) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('settings', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(s));
  return s;
}

function exportAlles() {
  const daten = { settings: getSettings() };
  for (const t of TABELLEN) daten[t] = stores[t].list();
  return daten;
}

// Ersetzt ALLE Daten durch den Inhalt eines Exports — in einer Transaktion,
// damit ein kaputter Import nichts halb überschreibt.
const importAlles = db.transaction((daten) => {
  for (const t of TABELLEN) {
    if (!Array.isArray(daten[t])) continue;
    db.prepare(`DELETE FROM ${t}`).run();
    for (const obj of daten[t]) {
      if (!obj || !obj.id) continue;
      db.prepare(`INSERT INTO ${t} (id, payload, last_modified) VALUES (?, ?, ?)`)
        .run(obj.id, JSON.stringify(obj), obj.lastModifiedAt || nowIso());
    }
  }
  if (daten.settings) saveSettings(daten.settings);
});

module.exports = { DATA_DIR, TABELLEN, stores, getSettings, saveSettings, exportAlles, importAlles };
