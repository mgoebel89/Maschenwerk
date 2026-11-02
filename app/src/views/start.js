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
      const laufend = MW.store.liste('projekte').filter(p => p.status !== 'fertig')
        .sort((a, b) => String(b.lastModifiedAt || '').localeCompare(String(a.lastModifiedAt || '')));
      const zuletzt = personen.slice().sort((a, b) => String(b.lastModifiedAt || '').localeCompare(String(a.lastModifiedAt || ''))).slice(0, 4);
      const k = (pfad, icon, titel, text) => `<a class="kachel" href="#${pfad}">${MW.icon(icon)}<b>${titel}</b><span>${text}</span></a>`;

      return `
        ${laufend.length ? `<div class="abschnitt" style="margin-top:0">Auf der Nadel</div>
          <div class="liste">${laufend.map(p => MW.projekte.eintrag(p).replace(`href="#/projekte/${encodeURIComponent(p.id)}"`, `href="#/stricken/${encodeURIComponent(p.id)}"`)).join('')}</div>
          <p class="leise klein">Antippen springt direkt in den Strickmodus, genau dorthin, wo du aufgehört hast.</p>` : ''}

        <div class="abschnitt" ${laufend.length ? '' : 'style="margin-top:0"'}>Schnell starten</div>
        <div class="kacheln">
          ${k('/projekte/neu', 'socke', 'Neue Socken', 'aus Maßen und Maschenprobe')}
          ${k('/personen?neu=1', 'personen', 'Neue Person', 'Name, Schuhgröße, dann messen')}
          ${k('/proben/neu', 'proben', 'Maschenprobe', 'Probe messen und umrechnen')}
          ${k('/rechner', 'rechner', 'Schnellrechner', 'cm ↔ Maschen, Reihen, verteilen')}
          ${k('/garne', 'garne', 'Garne', 'Lauflänge, Farbe, Gewicht')}
        </div>

        <div class="abschnitt">Zuletzt bearbeitet</div>
        ${zuletzt.length ? `<div class="liste">${zuletzt.map(MW.views.personen.eintrag).join('')}</div>`
          : MW.ui.leer('Noch niemand angelegt', 'Leg die erste Person an, für die du strickst.', '<a class="btn btn--pri" href="#/personen?neu=1">Person anlegen</a>')}

        <div class="abschnitt">Bestand</div>
        <div class="karte">
          <table class="tabelle">
            <tr><td>Projekte</td><td class="zahl"><b>${MW.store.liste('projekte').length}</b></td></tr>
            <tr><td>Personen</td><td class="zahl"><b>${personen.length}</b></td></tr>
            <tr><td>Garne</td><td class="zahl"><b>${garne.length}</b></td></tr>
            <tr><td>Maschenproben</td><td class="zahl"><b>${proben.length}</b></td></tr>
          </table>
        </div>
        <p class="leise klein" style="margin-top:14px">${esc(MW.models.MASCHINE.name)} mit ${esc(MW.models.MASCHINE.ribber)}</p>`;
    },
  };
})();
