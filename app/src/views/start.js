(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc } = MW.ui;

  MW.views.start = {
    bereich: 'start',
    render() {
      const personen = MW.store.liste('personen');
      const proben = MW.store.liste('proben');
      const garne = MW.store.liste('garne');
      const zuletzt = personen.slice().sort((a, b) => String(b.lastModifiedAt || '').localeCompare(String(a.lastModifiedAt || ''))).slice(0, 4);
      const k = (pfad, icon, titel, text) => `<a class="kachel" href="#${pfad}">${MW.icon(icon)}<b>${titel}</b><span>${text}</span></a>`;

      return `
        <div class="seiten-kopf"><h1>Hallo!</h1></div>
        <div class="kacheln">
          ${k('/personen?neu=1', 'personen', 'Neue Person', 'Name, Schuhgröße, dann messen')}
          ${k('/proben/neu', 'proben', 'Maschenprobe', 'Probe messen und umrechnen')}
          ${k('/rechner', 'rechner', 'Schnellrechner', 'cm ↔ Maschen, Reihen, verteilen')}
          ${k('/garne?neu=1', 'garne', 'Neues Garn', 'Lauflänge, Farbe, Gewicht')}
        </div>

        <div class="abschnitt">Auf der Nadel</div>
        <div class="hinweis hinweis--pri">Projekte und der Strickmodus kommen in <b>Stufe B</b>. Bis dahin kannst du schon Personen vermessen und Maschenproben anlegen — beides übernimmt die Sockenvorlage später direkt.</div>

        <div class="abschnitt">Zuletzt bearbeitet</div>
        ${zuletzt.length ? `<div class="liste">${zuletzt.map(MW.views.personen.eintrag).join('')}</div>`
          : MW.ui.leer('Noch niemand angelegt', 'Leg die erste Person an, für die du strickst.', '<a class="btn btn--pri" href="#/personen?neu=1">Person anlegen</a>')}

        <div class="abschnitt">Bestand</div>
        <div class="karte">
          <table class="tabelle">
            <tr><td>Personen</td><td class="zahl"><b>${personen.length}</b></td></tr>
            <tr><td>Garne</td><td class="zahl"><b>${garne.length}</b></td></tr>
            <tr><td>Maschenproben</td><td class="zahl"><b>${proben.length}</b></td></tr>
          </table>
        </div>
        <p class="leise klein" style="margin-top:14px">${esc(MW.models.MASCHINE.name)} mit ${esc(MW.models.MASCHINE.ribber)}</p>`;
    },
  };
})();
