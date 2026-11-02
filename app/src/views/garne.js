(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc, feld, textfeld } = MW.ui;
  const M = MW.models;

  // Garne: nur Stammdaten (kein Vorrat). Lauflänge und Gewicht braucht später
  // die Garnbedarfsrechnung, die Farbe macht die Listen übersichtlich.

  function lauflaengeText(g) {
    const m = M.zahl(g.lauflaengeM), gr = M.zahl(g.gewichtG);
    return m && gr ? `${M.fmt(m, 0)} m / ${M.fmt(gr, 0)} g` : 'Lauflänge fehlt';
  }

  function bearbeiten(garn) {
    const neu = !garn;
    const g = garn ? { ...garn } : { name: '', hersteller: '', farbname: '', farbcode: '#6c8f96', zusammensetzung: '', lauflaengeM: '', gewichtG: 100, knaeuelG: 100, notiz: '' };
    MW.ui.modal({
      titel: neu ? 'Neues Garn' : `${g.name} bearbeiten`,
      inhalt: `
        ${feld({ name: 'name', label: 'Bezeichnung', wert: g.name, pflicht: true, platzhalter: 'z. B. Opal Uni 4-fach' })}
        <div class="raster-2">
          ${feld({ name: 'hersteller', label: 'Hersteller', wert: g.hersteller })}
          ${feld({ name: 'zusammensetzung', label: 'Zusammensetzung', wert: g.zusammensetzung, platzhalter: '75 % Wolle, 25 % Polyamid' })}
          ${feld({ name: 'farbname', label: 'Farbe', wert: g.farbname, platzhalter: 'Petrol' })}
          <label class="feld"><span class="feld-label">Farbton</span>
            <span class="feld-eingabe"><input type="color" name="farbcode" value="${esc(g.farbcode || '#6c8f96')}"></span></label>
          ${feld({ name: 'lauflaengeM', label: 'Lauflänge', wert: g.lauflaengeM, typ: 'zahl', einheit: 'm', platzhalter: '420' })}
          ${feld({ name: 'gewichtG', label: 'auf Gewicht', wert: g.gewichtG, typ: 'zahl', einheit: 'g', platzhalter: '100' })}
          ${feld({ name: 'knaeuelG', label: 'Knäuelgröße', wert: g.knaeuelG, typ: 'zahl', einheit: 'g', hinweis: 'für die Knäuelzahl im Garnbedarf' })}
        </div>
        ${textfeld({ name: 'notiz', label: 'Notiz', wert: g.notiz })}`,
      aktionen: [
        ...(neu ? [] : [{ label: 'Löschen', art: 'leise', klick: () => { loeschen(garn); } }]),
        { label: 'Abbrechen' },
        {
          label: 'Speichern', art: 'pri',
          klick: (el) => {
            const w = MW.ui.formWerte(el);
            if (!w.name) { MW.ui.toast('Bitte eine Bezeichnung eingeben.', 'fehler'); return false; }
            Object.assign(g, {
              name: w.name, hersteller: w.hersteller, zusammensetzung: w.zusammensetzung,
              farbname: w.farbname, farbcode: w.farbcode, notiz: w.notiz,
              lauflaengeM: M.zahl(w.lauflaengeM), gewichtG: M.zahl(w.gewichtG), knaeuelG: M.zahl(w.knaeuelG),
            });
            MW.store.speichern('garne', g);
          },
        },
      ],
    });
  }

  async function loeschen(g) {
    const proben = MW.store.liste('proben').filter(p => p.garnId === g.id);
    const text = proben.length
      ? `Zu diesem Garn gibt es ${proben.length} Maschenprobe(n). Sie bleiben erhalten, verlieren aber die Zuordnung.`
      : 'Das Garn wird gelöscht.';
    if (await MW.ui.bestaetigen(`${g.name} löschen?`, text)) {
      for (const p of proben) MW.store.speichern('proben', { ...p, garnId: null, garnName: g.name });
      MW.store.loeschen('garne', g.id);
      MW.ui.toast(`${g.name} gelöscht`);
    }
  }

  MW.views.garne = {
    bereich: 'garne',
    titel: () => 'Garne',
    render() {
      const garne = MW.store.liste('garne').slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const proben = MW.store.liste('proben');
      const zeile = (g) => {
        const n = proben.filter(p => p.garnId === g.id).length;
        return `
          <div class="eintrag" data-garn="${esc(g.id)}">
            <div class="farbpunkt" style="background:${esc(g.farbcode || '#ccc')}"></div>
            <div class="eintrag-text">
              <div class="eintrag-titel">${esc(g.name)}${g.farbname ? ' · ' + esc(g.farbname) : ''}</div>
              <div class="eintrag-unter">${esc([g.hersteller, lauflaengeText(g), g.zusammensetzung].filter(Boolean).join(' · '))}</div>
            </div>
            <a class="chip ${n ? '' : 'chip--grau'}" href="#/proben?garn=${encodeURIComponent(g.id)}" data-stop>${n} Probe${n === 1 ? '' : 'n'}</a>
            <span class="eintrag-pfeil">›</span>
          </div>`;
      };
      return `
        <div class="seiten-kopf"><h1>Garne</h1><button class="btn btn--pri" data-neu>+ Garn</button></div>
        ${garne.length ? `<div class="liste">${garne.map(zeile).join('')}</div>`
          : MW.ui.leer('Noch keine Garne', 'Lege die Garne an, mit denen du strickst. Maschenproben hängen dann am Garn.', '<button class="btn btn--pri" data-neu>Erstes Garn anlegen</button>')}`;
    },
    nachRender(root) {
      root.querySelectorAll('[data-neu]').forEach(b => b.addEventListener('click', () => bearbeiten()));
      root.querySelectorAll('[data-garn]').forEach(el => el.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop]')) return;
        bearbeiten(MW.store.hole('garne', el.dataset.garn));
      }));
      if (MW.query().neu) { history.replaceState(null, '', '#/garne'); bearbeiten(); }
    },
  };

  MW.garne = { bearbeiten, lauflaengeText };
})();
