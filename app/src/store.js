(function () {
  'use strict';
  window.MW = window.MW || {};

  // Cache im Browser; das Backend ist die Wahrheit. Schreiben geht sofort in
  // den Cache (die Oberfläche wartet nicht aufs Netz) und parallel ans Backend.
  // Schlägt das fehl, wird der Snapshot neu geladen, damit nichts Falsches stehen bleibt.

  const TABELLEN = ['personen', 'garne', 'proben', 'projekte', 'vorlagen'];
  const cache = { settings: null, version: '', ready: false };
  for (const t of TABELLEN) cache[t] = [];

  const listeners = [];
  function notify() { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } }

  function neueId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function defaultSettings() {
    return {
      schemaVersion: MW.models.SCHEMA_VERSION,
      weiteSocken: -10,      // negative Weite in %, Vorgabe für neue Personen
    };
  }

  async function laden() {
    const snap = await MW.api.snapshot();
    for (const t of TABELLEN) cache[t] = Array.isArray(snap[t]) ? snap[t] : [];
    cache.settings = { ...defaultSettings(), ...(snap.settings || {}) };
    cache.version = snap.version || '';
    cache.ready = true;
    notify();
  }

  function fehler(e) {
    console.error(e);
    MW.ui.toast('Speichern fehlgeschlagen: ' + e.message, 'fehler');
    laden().catch(() => {});
  }

  function liste(t) { return cache[t]; }
  function hole(t, id) { return cache[t].find(x => x.id === id) || null; }

  function speichern(t, obj) {
    if (!obj.id) { obj.id = neueId(); obj.angelegtAm = new Date().toISOString(); }
    const i = cache[t].findIndex(x => x.id === obj.id);
    if (i >= 0) cache[t][i] = obj; else cache[t].push(obj);
    notify();
    MW.api.tabelle(t).put(obj).catch(fehler);
    return obj;
  }

  function loeschen(t, id) {
    cache[t] = cache[t].filter(x => x.id !== id);
    notify();
    MW.api.tabelle(t).del(id).catch(fehler);
  }

  function settings() { return cache.settings || defaultSettings(); }
  function settingsSpeichern(s) {
    cache.settings = s;
    notify();
    MW.api.putSettings(s).catch(fehler);
  }

  MW.store = {
    TABELLEN, laden, liste, hole, speichern, loeschen, settings, settingsSpeichern, neueId,
    version: () => cache.version,
    bereit: () => cache.ready,
    beiAenderung: (fn) => listeners.push(fn),
  };
})();
