(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc, feld, textfeld } = MW.ui;
  const M = MW.models;

  // Maschenproben: gespeichert wird, was gezählt und gemessen wurde; die
  // Werte auf 10 cm rechnet die App. „Rund" heißt auf dem Doppelbett als
  // Schlauch gestrickt — Socken nehmen später bevorzugt eine runde Probe.

  function kennzahl(p) {
    const { m10, r10 } = M.probeAuf10(p);
    return `${M.fmt(m10)} M · ${M.fmt(r10)} ${p.art === 'rund' ? 'Rd' : 'R'} / 10 cm`;
  }

  function chips(p) {
    return [
      p.maschenweite ? `<span class="chip">MW ${esc(p.maschenweite)}</span>` : '',
      `<span class="chip ${p.art === 'rund' ? 'chip--akz' : 'chip--grau'}">${p.art === 'rund' ? 'rund' : 'flach'}</span>`,
      p.gewaschen ? '<span class="chip chip--ok">gewaschen</span>' : '<span class="chip chip--warn">ungewaschen</span>',
    ].join(' ');
  }

  MW.views.proben = {
    bereich: 'proben',
    titel: () => 'Maschenproben',
    render() {
      const garne = MW.store.liste('garne');
      const filter = MW.query().garn || '';
      let proben = MW.store.liste('proben').slice();
      if (filter) proben = proben.filter(p => p.garnId === filter);
      proben.sort((a, b) => M.probeTitel(a, garne).localeCompare(M.probeTitel(b, garne), 'de') || String(b.datum || '').localeCompare(String(a.datum || '')));
      const fg = filter && MW.store.hole('garne', filter);

      const zeile = (p) => {
        const g = garne.find(x => x.id === p.garnId);
        return `
          <a class="eintrag" href="#/proben/${encodeURIComponent(p.id)}">
            <div class="farbpunkt" style="background:${esc((g && g.farbcode) || '#d9d6cf')}"></div>
            <div class="eintrag-text">
              <div class="eintrag-titel">${esc(kennzahl(p))}</div>
              <div class="eintrag-unter">${esc(g ? g.name + (g.farbname ? ' · ' + g.farbname : '') : (p.garnName || 'ohne Garn'))}</div>
              <div style="margin-top:4px">${chips(p)}</div>
            </div>
            <span class="eintrag-pfeil">›</span>
          </a>`;
      };
      return `
        <div class="seiten-kopf"><h1>Maschenproben</h1><a class="btn btn--pri" href="#/proben/neu${filter ? '?garn=' + encodeURIComponent(filter) : ''}">+ Probe</a></div>
        ${fg ? `<p>Nur Proben für <b>${esc(fg.name)}</b> · <a href="#/proben">alle zeigen</a></p>` : ''}
        ${proben.length ? `<div class="liste">${proben.map(zeile).join('')}</div>`
          : MW.ui.leer('Noch keine Maschenproben', 'Strick eine Probe von mindestens 40 Maschen und 60 Reihen, wasch sie und miss sie aus.', '<a class="btn btn--pri" href="#/proben/neu">Erste Probe anlegen</a>')}`;
    },
  };

  // --- Eine Probe anlegen / bearbeiten -----------------------------------
  function ergebnisHtml(p) {
    const { m10, r10 } = M.probeAuf10(p);
    if (!m10 && !r10) return '<div class="ergebnis ergebnis--leer">Das Ergebnis erscheint, sobald du Werte eingibst.</div>';
    const rr = p.art === 'rund' ? 'Runden' : 'Reihen';
    return `
      <div class="ergebnis">
        <div class="ergebnis-klein">Ergibt auf 10 × 10 cm</div>
        <div class="ergebnis-zeile">
          <div class="ergebnis-gross">${M.fmt(m10)} M</div>
          <div class="ergebnis-gross">${M.fmt(r10)} ${p.art === 'rund' ? 'Rd' : 'R'}</div>
        </div>
        <div class="ergebnis-klein">${M.fmt(m10 / 10, 2)} Maschen/cm · ${M.fmt(r10 / 10, 2)} ${rr}/cm${p.art === 'rund' && r10 ? ` · Reihenzähler +${M.fmt(r10 / 10 * 2, 2)} je cm` : ''}</div>
      </div>`;
  }

  function tipp(art) {
    return art === 'rund'
      ? 'Schlauch flach hinlegen. Die Maschen auf <b>einer Lage</b> zählen und deren Breite messen; die <b>Runden</b> zählen (eine Runde = zwei Schlittenfahrten).'
      : 'Mindestens 40 Maschen breit stricken, Markierfaden z. B. bei L20 und R20 einlegen und nur die Mitte messen.';
  }

  function eingabeFelder(p) {
    if (p.eingabe === 'direkt') {
      return `<div class="raster-2">
        ${feld({ name: 'm10', label: 'Maschen auf 10 cm', wert: p.m10, typ: 'zahl', einheit: 'M' })}
        ${feld({ name: 'r10', label: (p.art === 'rund' ? 'Runden' : 'Reihen') + ' auf 10 cm', wert: p.r10, typ: 'zahl', einheit: p.art === 'rund' ? 'Rd' : 'R' })}
      </div>`;
    }
    return `<div class="raster-2">
      ${feld({ name: 'maschen', label: 'Maschen gezählt', wert: p.maschen, typ: 'zahl', einheit: 'M', platzhalter: '40' })}
      ${feld({ name: 'breiteCm', label: 'deren Breite', wert: p.breiteCm, typ: 'zahl', einheit: 'cm', platzhalter: '13,3' })}
      ${feld({ name: 'reihen', label: (p.art === 'rund' ? 'Runden' : 'Reihen') + ' gezählt', wert: p.reihen, typ: 'zahl', einheit: p.art === 'rund' ? 'Rd' : 'R', platzhalter: '60' })}
      ${feld({ name: 'hoeheCm', label: 'deren Höhe', wert: p.hoeheCm, typ: 'zahl', einheit: 'cm', platzhalter: '14,3' })}
    </div>`;
  }

  MW.views.probe = {
    bereich: 'proben',
    live: false,
    titel: ({ id }) => id === 'neu' ? 'Neue Maschenprobe' : 'Maschenprobe',
    render({ id }) {
      const garne = MW.store.liste('garne').slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const vorhanden = id !== 'neu' && MW.store.hole('proben', id);
      if (id !== 'neu' && !vorhanden) return MW.ui.leer('Probe nicht gefunden', '', '<a class="btn" href="#/proben">Zur Liste</a>');
      const p = vorhanden ? { ...vorhanden } : {
        garnId: MW.query().garn || (garne[0] && garne[0].id) || '', garnName: '', maschenweite: '', art: 'rund', gewaschen: true,
        eingabe: 'gemessen', datum: new Date().toISOString().slice(0, 10), notiz: '',
      };
      this._p = p;
      const garnOpt = garne.map(g => `<option value="${esc(g.id)}" ${g.id === p.garnId ? 'selected' : ''}>${esc(g.name + (g.farbname ? ' · ' + g.farbname : ''))}</option>`).join('');
      return `
        <div class="seiten-kopf">
          <a class="zurueck" href="#/proben" aria-label="Zurück">‹</a>
          <h1>${vorhanden ? 'Maschenprobe' : 'Neue Maschenprobe'}</h1>
        </div>
        <div class="raster" style="align-items:start">
          <div class="karte">
            <label class="feld"><span class="feld-label">Garn</span>
              <select name="garnId">${garnOpt}<option value="" ${p.garnId ? '' : 'selected'}>— ohne angelegtes Garn —</option></select>
              ${garne.length ? '' : '<span class="feld-hinweis">Noch keine Garne angelegt — <a href="#/garne?neu=1">Garn anlegen</a></span>'}
            </label>
            <div id="garnName" ${p.garnId ? 'hidden' : ''}>${feld({ name: 'garnName', label: 'Garnbezeichnung', wert: p.garnName })}</div>
            <div class="raster-2">
              ${feld({ name: 'maschenweite', label: 'Maschenweite', wert: p.maschenweite, platzhalter: '5 oder 5•' })}
              ${feld({ name: 'datum', label: 'Gestrickt am', wert: p.datum, typ: 'date' })}
            </div>
            <span class="feld-label">Gestrickt</span>
            ${MW.ui.seg('art', p.art, [{ wert: 'rund', label: 'rund (Doppelbett)' }, { wert: 'flach', label: 'flach' }])}
            <label class="check"><input type="checkbox" name="gewaschen" ${p.gewaschen ? 'checked' : ''}> nach dem Waschen gemessen</label>
            <span class="feld-label">Eingabe</span>
            ${MW.ui.seg('eingabe', p.eingabe, [{ wert: 'gemessen', label: 'gezählt + gemessen' }, { wert: 'direkt', label: 'direkt auf 10 cm' }])}
            <div id="eingabeFelder">${eingabeFelder(p)}</div>
            <div id="ergebnis" style="margin-bottom:12px">${ergebnisHtml(p)}</div>
            ${textfeld({ name: 'notiz', label: 'Notiz', wert: p.notiz })}
          </div>
          <div>
            <div class="hinweis hinweis--pri" id="tipp">${tipp(p.art)}</div>
            <div class="knopfzeile">
              ${vorhanden ? '<button class="btn btn--leise" data-loeschen>Löschen</button>' : ''}
              <a class="btn" href="#/proben">Abbrechen</a>
              <button class="btn btn--pri" data-speichern>Speichern</button>
            </div>
            ${vorhanden ? `<a class="btn btn--voll" style="margin-top:10px" href="#/rechner?probe=${encodeURIComponent(vorhanden.id)}">Mit dieser Probe rechnen</a>` : ''}
          </div>
        </div>`;
    },
    nachRender(root) {
      const p = this._p;
      if (!p) return;
      const uebernehmen = () => {
        const w = MW.ui.formWerte(root);
        Object.assign(p, {
          garnId: w.garnId || null, garnName: w.garnName || '', maschenweite: w.maschenweite, datum: w.datum,
          art: w.art, gewaschen: w.gewaschen, eingabe: w.eingabe, notiz: w.notiz,
        });
        for (const k of ['maschen', 'breiteCm', 'reihen', 'hoeheCm', 'm10', 'r10']) if (k in w) p[k] = M.zahl(w[k]);
      };
      const aktualisieren = () => {
        uebernehmen();
        root.querySelector('#ergebnis').innerHTML = ergebnisHtml(p);
        root.querySelector('#garnName').hidden = !!p.garnId;
      };
      root.addEventListener('input', aktualisieren);
      root.addEventListener('change', aktualisieren);
      MW.ui.segVerdrahten(root, () => {
        uebernehmen();
        root.querySelector('#eingabeFelder').innerHTML = eingabeFelder(p);
        root.querySelector('#tipp').innerHTML = tipp(p.art);
        root.querySelector('#ergebnis').innerHTML = ergebnisHtml(p);
      });
      root.querySelector('[data-speichern]').addEventListener('click', () => {
        uebernehmen();
        const { m10, r10 } = M.probeAuf10(p);
        if (!m10 || !r10) { MW.ui.toast('Bitte Maschen und Reihen vollständig eingeben.', 'fehler'); return; }
        // Die Werte auf 10 cm mitspeichern: spätere Vorlagen lesen sie direkt.
        p.m10 = Math.round(m10 * 100) / 100;
        p.r10 = Math.round(r10 * 100) / 100;
        MW.store.speichern('proben', p);
        MW.ui.toast('Probe gespeichert', 'ok');
        MW.gehe('/proben');
      });
      const del = root.querySelector('[data-loeschen]');
      if (del) del.addEventListener('click', async () => {
        if (await MW.ui.bestaetigen('Probe löschen?', 'Die Maschenprobe wird gelöscht.')) {
          MW.store.loeschen('proben', p.id);
          MW.gehe('/proben');
        }
      });
    },
  };

  MW.proben = { kennzahl };
})();
