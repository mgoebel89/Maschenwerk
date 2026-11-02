(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc, feld, textfeld } = MW.ui;
  const M = MW.models;

  function eintrag(p) {
    const n = M.anzahlGemessen(p);
    const gesamt = M.FUSSMASSE.length;
    return `
      <a class="eintrag" href="#/personen/${encodeURIComponent(p.id)}">
        <div class="avatar" style="background:${esc(p.farbe || M.PERSONEN_FARBEN[0])}">${esc(MW.ui.initialen(p.name))}</div>
        <div class="eintrag-text">
          <div class="eintrag-titel">${esc(p.name)}</div>
          <div class="eintrag-unter">${p.schuhgroesse ? 'Gr. ' + esc(M.fmt(M.zahl(p.schuhgroesse))) : 'ohne Schuhgröße'} · Weite ${esc(M.fmt(M.zahl(p.weite)))} %</div>
        </div>
        <span class="chip ${n === 0 ? 'chip--grau' : n < 3 ? 'chip--warn' : 'chip--ok'}">${n}/${gesamt} gemessen</span>
        <span class="eintrag-pfeil">›</span>
      </a>`;
  }

  // Anlegen und Bearbeiten im selben Modal. Nach dem Anlegen geht es direkt
  // in die Messmaske — das ist fast immer der nächste Schritt.
  function bearbeiten(person) {
    const neu = !person;
    const p = person ? { ...person } : {
      name: '', schuhgroesse: '', weite: MW.store.settings().weiteSocken, notiz: '', fuss: {},
      farbe: M.PERSONEN_FARBEN[MW.store.liste('personen').length % M.PERSONEN_FARBEN.length],
    };
    MW.ui.modal({
      titel: neu ? 'Neue Person' : `${p.name} bearbeiten`,
      inhalt: `
        ${feld({ name: 'name', label: 'Name', wert: p.name, pflicht: true, platzhalter: 'z. B. Lena' })}
        <div class="raster-2">
          ${feld({ name: 'schuhgroesse', label: 'Schuhgröße (EU)', wert: p.schuhgroesse, typ: 'zahl', platzhalter: '39' })}
          ${feld({ name: 'weite', label: 'Weite der Socken', wert: p.weite, typ: 'zahl', einheit: '%', hinweis: 'negativ = enger als der Fuß' })}
        </div>
        <label class="feld"><span class="feld-label">Farbe</span>
          <span class="feld-eingabe"><input type="color" name="farbe" value="${esc(p.farbe)}"></span></label>
        ${textfeld({ name: 'notiz', label: 'Notiz', wert: p.notiz })}
        <p class="leise klein">Die Schuhgröße dient nur zum Schätzen fehlender Maße. Gerechnet wird mit dem, was du misst.</p>`,
      aktionen: [
        ...(neu ? [] : [{ label: 'Löschen', art: 'leise', klick: () => { loeschen(person); } }]),
        { label: 'Abbrechen' },
        {
          label: neu ? 'Anlegen und messen' : 'Speichern', art: 'pri',
          klick: (el) => {
            const w = MW.ui.formWerte(el);
            if (!w.name) { MW.ui.toast('Bitte einen Namen eingeben.', 'fehler'); return false; }
            Object.assign(p, {
              name: w.name, schuhgroesse: M.zahl(w.schuhgroesse), weite: M.zahl(w.weite) ?? -10,
              farbe: w.farbe, notiz: w.notiz,
            });
            const gespeichert = MW.store.speichern('personen', p);
            if (neu) MW.gehe(`/personen/${gespeichert.id}/messen`);
          },
        },
      ],
    });
  }

  async function loeschen(p) {
    if (await MW.ui.bestaetigen(`${p.name} löschen?`, 'Die Person und alle ihre Maße werden gelöscht.')) {
      MW.store.loeschen('personen', p.id);
      MW.gehe('/personen');
      MW.ui.toast(`${p.name} gelöscht`);
    }
  }

  MW.views.personen = {
    bereich: 'personen',
    titel: () => 'Personen',
    eintrag,
    render() {
      const liste = MW.store.liste('personen').slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
      return `
        <div class="seiten-kopf"><h1>Personen</h1><button class="btn btn--pri" data-neu>+ Person</button></div>
        ${liste.length ? `<div class="liste">${liste.map(eintrag).join('')}</div>`
          : MW.ui.leer('Noch niemand angelegt', 'Für jede Person, für die du strickst, speicherst du einmal die Maße.', '<button class="btn btn--pri" data-neu>Erste Person anlegen</button>')}
        <div class="knopfzeile"><a class="btn" href="#/messblatt">Leeres Messblatt drucken</a></div>`;
    },
    nachRender(root) {
      root.querySelectorAll('[data-neu]').forEach(b => b.addEventListener('click', () => bearbeiten()));
      if (MW.query().neu) { history.replaceState(null, '', '#/personen'); bearbeiten(); }
    },
  };

  MW.views.person = {
    bereich: 'personen',
    titel: (p) => (MW.store.hole('personen', p.id) || {}).name || 'Person',
    render({ id }) {
      const p = MW.store.hole('personen', id);
      if (!p) return MW.ui.leer('Person nicht gefunden', 'Vielleicht wurde sie gelöscht.', '<a class="btn" href="#/personen">Zur Liste</a>');
      const zeilen = M.FUSSMASSE.map(m => {
        const f = M.fussmass(p, m.key);
        const warn = !f.geschaetzt ? M.plausibilitaet(m.key, f.wert, p.schuhgroesse) : null;
        return `<tr>
          <td>${esc(m.label)}${warn ? ` <span class="chip chip--warn" title="${esc(warn)}">prüfen</span>` : ''}</td>
          <td class="zahl ${f.geschaetzt ? 'geschaetzt' : ''}">${f.wert === null ? '–' : (f.geschaetzt ? '≈ ' : '') + M.fmt(f.wert) + ' cm'}</td>
        </tr>`;
      }).join('');
      const n = M.anzahlGemessen(p);
      return `
        <div class="seiten-kopf">
          <a class="zurueck" href="#/personen" aria-label="Zurück">‹</a>
          <div class="avatar avatar--gross" style="background:${esc(p.farbe)}">${esc(MW.ui.initialen(p.name))}</div>
          <h1>${esc(p.name)}</h1>
          <button class="btn" data-bearbeiten>Bearbeiten</button>
        </div>
        <div class="raster">
          <div class="karte">
            <h2>Füße</h2>
            <p class="leise klein">${p.schuhgroesse ? 'Schuhgröße ' + esc(M.fmt(M.zahl(p.schuhgroesse))) : 'Keine Schuhgröße'} · Weite ${esc(M.fmt(M.zahl(p.weite)))} % · ${n} von ${M.FUSSMASSE.length} gemessen</p>
            <table class="tabelle">${zeilen}</table>
            <p class="leise klein">Werte mit ≈ sind aus der Schuhgröße geschätzt.</p>
            <div class="knopfzeile">
              <a class="btn btn--pri" href="#/personen/${encodeURIComponent(p.id)}/messen">Füße messen</a>
              <a class="btn" href="#/messblatt/${encodeURIComponent(p.id)}">Messblatt</a>
            </div>
          </div>
          <div class="karte">
            <h2>Körper</h2>
            <p class="leise">Körpermaße für Pullover kommen mit der Pullovervorlage in Stufe C.</p>
            <h2 style="margin-top:18px">Projekte</h2>
            ${(() => {
              const pr = MW.store.liste('projekte').filter(x => x.personId === p.id);
              return pr.length ? `<div class="liste">${pr.map(MW.projekte.eintrag).join('')}</div>` : `<p class="leise">Noch keine Socken für ${esc(p.name)}.</p>`;
            })()}
            <a class="btn btn--pri" style="margin-top:10px" href="#/projekte/neu?person=${encodeURIComponent(p.id)}">🧦 Socken für ${esc(p.name)} anlegen</a>
            ${p.notiz ? `<h2 style="margin-top:18px">Notiz</h2><p style="white-space:pre-wrap">${esc(p.notiz)}</p>` : ''}
          </div>
        </div>`;
    },
    nachRender(root, { id }) {
      const b = root.querySelector('[data-bearbeiten]');
      if (b) b.addEventListener('click', () => bearbeiten(MW.store.hole('personen', id)));
    },
  };

  // Messblatt zum Ausdrucken: dieselbe Zeichnung wie in der Messmaske, mit
  // leeren Feldern. Für Leute, die man selten sieht.
  MW.views.messblatt = {
    bereich: 'personen',
    titel: () => 'Messblatt',
    render({ id }) {
      const p = id ? MW.store.hole('personen', id) : null;
      const zeilen = M.FUSSMASSE.map(m => {
        const w = p && M.zahl(p.fuss && p.fuss[m.key]);
        return `<tr><td><b>${esc(m.label)}</b><small>${esc(m.hinweis)}</small></td><td class="wert">${w ? esc(M.fmt(w)) + ' cm' : ''}&nbsp;</td></tr>`;
      }).join('');
      return `
        <div class="seiten-kopf kein-druck">
          <a class="zurueck" href="#${p ? '/personen/' + encodeURIComponent(p.id) : '/personen'}" aria-label="Zurück">‹</a>
          <h1>Messblatt</h1>
          <button class="btn btn--pri" onclick="window.print()">Drucken</button>
        </div>
        <div class="karte messblatt">
          <h2>Fußmaße${p ? ' · ' + esc(p.name) : ''}</h2>
          <p class="leise klein">Name: ${p ? esc(p.name) : '______________________'} &nbsp; Schuhgröße: ${p && p.schuhgroesse ? esc(M.fmt(M.zahl(p.schuhgroesse))) : '______'} &nbsp; Datum: ____________</p>
          ${MW.fuss.svg({})}
          <table class="messblatt-tabelle">${zeilen}</table>
          <p class="leise klein" style="margin-top:12px">Alle Maße in cm. Maßband anliegend, aber nicht ziehen. Beide Füße messen und den größeren Wert nehmen.</p>
        </div>`;
    },
  };

  MW.personen = { bearbeiten };
})();
