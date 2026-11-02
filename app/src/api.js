(function () {
  'use strict';
  window.MW = window.MW || {};

  // Dünne Hülle um die REST-Schnittstelle des Backends (backend/server.js).

  async function jsonFetch(pfad, opts = {}) {
    const res = await fetch(pfad, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error || ''; } catch (_) {}
      throw new Error(msg || `Server antwortet mit ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function crud(tabelle) {
    return {
      put: (obj) => jsonFetch(`/api/${tabelle}/${encodeURIComponent(obj.id)}`, { method: 'PUT', body: obj }),
      del: (id) => jsonFetch(`/api/${tabelle}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    };
  }

  MW.api = {
    health: () => jsonFetch('/api/health'),
    snapshot: () => jsonFetch('/api/snapshot'),
    putSettings: (s) => jsonFetch('/api/settings', { method: 'PUT', body: s }),
    tabelle: crud,
    exportieren: () => jsonFetch('/api/export'),
    importieren: (daten) => jsonFetch('/api/import', { method: 'POST', body: daten }),
    zaehler: () => jsonFetch('/api/zaehler'),
    zaehlerImpuls: () => jsonFetch('/api/zaehler', { method: 'POST', body: { anzahl: 1 } }),
    system: () => jsonFetch('/api/system'),
    updateAnfordern: (art) => jsonFetch(`/api/system/update/${art}`, { method: 'POST', body: {} }),
  };
})();
