(function () {
  'use strict';

  // Einstieg: Navigation, Hash-Router, Start.
  // Jede Ansicht ist ein Objekt in MW.views mit render(params) → HTML und
  // optional nachRender(root, params). `live: false` heißt: bei Datenänderungen
  // NICHT neu zeichnen — für Ansichten mit Eingabefeldern, sonst springt beim
  // Tippen der Cursor weg.

  const I = {
    start: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    personen: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    socke: '<path d="M9 3h7v8.5l2.8 3.2a3.3 3.3 0 0 1-4.6 4.7L8.4 14A4 4 0 0 1 9 12.5z"/><path d="M9 6.5h7"/>',
    garne: '<circle cx="12" cy="12" r="8.5"/><path d="M5.5 7c4.5 2 8.5 6.5 9.5 13M10 3.8c3.5 3 6.3 8 6.5 13.6M3.7 13.5c4.4-.4 8.6 1.8 11 6"/>',
    proben: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
    rechner: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h1.5M14 11h1.5M8.5 14.5h1.5M14 14.5h1.5M8.5 18h1.5M14 18h1.5"/>',
    einstellungen: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;
  MW.icon = icon;

  const NAV = [
    { pfad: '/', label: 'Start', icon: 'start', bereich: 'start' },
    { pfad: '/projekte', label: 'Projekte', icon: 'socke', bereich: 'projekte' },
    { pfad: '/personen', label: 'Personen', icon: 'personen', bereich: 'personen' },
    { pfad: '/proben', label: 'Proben', langLabel: 'Maschenproben', icon: 'proben', bereich: 'proben' },
    { pfad: '/garne', label: 'Garne', icon: 'garne', bereich: 'garne', nurSeite: true },
    { pfad: '/rechner', label: 'Rechner', langLabel: 'Schnellrechner', icon: 'rechner', bereich: 'rechner' },
    { pfad: '/einstellungen', label: 'Einstellungen', icon: 'einstellungen', bereich: 'einstellungen', nurSeite: true },
  ];

  // Muster → Ansicht. Reihenfolge zählt (das erste passende gewinnt).
  const ROUTEN = [
    ['/', 'start'],
    ['/projekte', 'projekte'],
    ['/projekte/neu', 'projektNeu'],
    ['/projekte/:id', 'projekt'],
    ['/stricken/:id', 'stricken'],
    ['/personen', 'personen'],
    ['/personen/:id/messen', 'messen'],
    ['/personen/:id', 'person'],
    ['/messblatt/:id', 'messblatt'],
    ['/messblatt', 'messblatt'],
    ['/garne', 'garne'],
    ['/proben', 'proben'],
    ['/proben/:id', 'probe'],
    ['/rechner', 'rechner'],
    ['/einstellungen', 'einstellungen'],
  ];

  function aufloesen(pfad) {
    const teile = pfad.split('/').filter(Boolean);
    for (const [muster, view] of ROUTEN) {
      const m = muster.split('/').filter(Boolean);
      if (m.length !== teile.length) continue;
      const params = {};
      if (m.every((t, i) => t.startsWith(':') ? (params[t.slice(1)] = decodeURIComponent(teile[i]), true) : t === teile[i])) {
        return { view, params };
      }
    }
    return { view: 'start', params: {} };
  }

  function aktuellerPfad() {
    const h = location.hash.replace(/^#/, '');
    return (h.split('?')[0] || '/');
  }
  function query() {
    const q = location.hash.split('?')[1] || '';
    return Object.fromEntries(new URLSearchParams(q));
  }
  MW.query = query;
  MW.gehe = (pfad) => { location.hash = '#' + pfad; };

  function navZeichnen(bereich) {
    document.getElementById('navSeite').innerHTML = NAV.map(n =>
      `<a href="#${n.pfad}" class="${n.bereich === bereich ? 'an' : ''}">${icon(n.icon)}<span>${n.langLabel || n.label}</span></a>`).join('');
    document.getElementById('navUnten').innerHTML = NAV.filter(n => !n.nurSeite).map(n =>
      `<a href="#${n.pfad}" class="${n.bereich === bereich ? 'an' : ''}">${icon(n.icon)}<span>${n.label}</span></a>`).join('');
    document.getElementById('kopfEinstellungen').innerHTML = icon('einstellungen');
    const v = MW.store.version();
    document.getElementById('versionSeite').textContent = v ? `Version ${v}` : '';
  }

  let aktuell = null;
  function zeichnen(scrollHalten) {
    const app = document.getElementById('app');
    const { view, params } = aufloesen(aktuellerPfad());
    const v = MW.views[view];
    aktuell = v;
    const y = window.scrollY;
    // Jede Ansicht bekommt einen FRISCHEN Container. Hängt sie Listener an
    // `root`, verschwinden die mit dem nächsten Zeichnen — sonst stapeln sie
    // sich auf #app und jeder Klick zählt mehrfach.
    const root = document.createElement('div');
    try {
      root.innerHTML = v.render(params);
      app.replaceChildren(root);
      if (v.nachRender) v.nachRender(root, params);
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="karte"><h2>Da ist etwas schiefgegangen</h2><p class="leise">${MW.ui.esc(e.message)}</p></div>`;
    }
    navZeichnen(v.bereich || view);
    document.getElementById('kopfTitel').textContent = (v.titel && v.titel(params)) || 'Maschenwerk';
    document.title = ((v.titel && v.titel(params)) ? v.titel(params) + ' · ' : '') + 'Maschenwerk';
    window.scrollTo(0, scrollHalten ? y : 0);
  }

  MW.store.beiAenderung(() => { if (aktuell && aktuell.live !== false) zeichnen(true); });
  window.addEventListener('hashchange', () => zeichnen(false));

  // Wer das Handy aus der Tasche holt, soll Änderungen vom PC sehen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && MW.store.bereit() && (!aktuell || aktuell.live !== false)) {
      MW.store.laden().catch(() => {});
    }
  });

  async function start() {
    navZeichnen('start');
    try {
      await MW.store.laden();
    } catch (e) {
      document.getElementById('app').innerHTML = `
        <div class="karte" style="margin-top:20px">
          <h2>Server nicht erreichbar</h2>
          <p class="leise">Maschenwerk konnte seine Daten nicht laden (${MW.ui.esc(e.message)}).
          Läuft der Container? Im Container hilft <code>systemctl status maschenwerk</code>.</p>
          <button class="btn btn--pri" onclick="location.reload()">Erneut versuchen</button>
        </div>`;
      return;
    }
    zeichnen(false);
  }

  start();
})();
