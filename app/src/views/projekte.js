(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc, feld } = MW.ui;
  const M = MW.models;
  const S = MW.socke;

  // Projekte: Liste, Assistent für neue Socken, Projektseite.
  // Ein Projekt friert Maße, Probe und die berechnete Anleitung ein; der
  // Fortschritt ist der Index in MW.socke.karten(anleitung).

  // ------------------------------------------------------------ Helfer ---
  function karten(p) { return S.karten(p.anleitung, p.paare || 1); }

  function fortschritt(p) {
    const k = karten(p);
    const i = Math.min((p.fortschritt && p.fortschritt.karte) || 0, k.length - 1);
    const karte = k[i];
    const a = karte && p.anleitung.abschnitte.find(x => x.id === karte.abschnitt);
    return {
      index: i, gesamt: k.length, karte, abschnitt: a,
      prozent: p.status === 'fertig' ? 100 : Math.round(i / Math.max(1, k.length - 1) * 100),
      socke: karte ? karte.socke : 1, socken: (p.paare || 1) * 2,
    };
  }

  // Wirksame Einstellung eines Abschnitts: Anleitung + Vorlage (live aus den
  // Settings, damit nachgetragene Hebelnamen sofort gelten) + Änderungen im Projekt.
  function einstellung(p, abschnitt) {
    const v = (MW.store.settings().einstellungsVorlagen || {})[abschnitt.vorlage] || {};
    const aend = (p.aenderungen || {})[abschnitt.id] || {};
    const e = {
      vorlageName: v.name || abschnitt.vorlage,
      mwHaupt: abschnitt.mwHaupt, mwRibber: abschnitt.mwRibber, nadeln: abschnitt.nadeln,
      hauptschlitten: v.hauptschlitten || '', ribber: v.ribber || '', gewichte: v.gewichte || '', hinweis: v.hinweis || '',
      geaendert: {},
    };
    for (const k of ['mwHaupt', 'mwRibber', 'gewichte', 'hinweis']) {
      if (aend[k]) { e.geaendert[k] = { vorher: e[k], socke: aend.socke }; e[k] = aend[k]; }
    }
    if (aend.notiz) e.notiz = aend.notiz;
    return e;
  }

  function sockeSvg(w, klein) {
    const t = (x, y, s, akz) => `<text x="${x}" y="${y}" font-size="10" fill="${akz ? '#c2553a' : '#5f6670'}" ${akz ? 'font-weight="700"' : ''}>${esc(s)}</text>`;
    return `<svg viewBox="0 0 250 160" width="100%" ${klein ? 'style="max-height:150px"' : 'style="max-height:210px"'} fill="none" role="img" aria-label="Sockenskizze">
      <path d="M60 8 h50 v70 q0 18 18 22 l42 6 q22 4 22 24 q0 14 -22 14 h-86 q-30 0 -30 -28 v-38 z" fill="#e3eff1" stroke="#23606e" stroke-width="2"/>
      <line x1="60" y1="24" x2="110" y2="24" stroke="#23606e" stroke-dasharray="3 3"/>
      ${t(116, 20, `Bündchen ${w.buendchenReihen} R`)}
      ${t(116, 56, `Schaft ${w.schaftRunden} Rd`)}
      ${t(4, 150, `Ferse ${w.ferse.reihen} R`, true)}
      ${t(96, 154, `Fuß ${w.fussRunden} Rd`)}
      ${t(196, 112, `Spitze ${w.spitze.kurz || w.spitze.reihen + ' R'}`, true)}
      ${t(4, 12, `${w.maschen} M`)}
    </svg>`;
  }

  function eintrag(p) {
    const f = fortschritt(p);
    const fertig = p.status === 'fertig';
    return `
      <a class="eintrag" href="#/projekte/${encodeURIComponent(p.id)}">
        <div class="avatar" style="background:${esc(p.personFarbe || '#23606e')}">🧦</div>
        <div class="eintrag-text">
          <div class="eintrag-titel">${esc(p.name)}</div>
          <div class="eintrag-unter">${fertig ? 'fertig' + (p.fertigAm ? ' am ' + new Date(p.fertigAm).toLocaleDateString('de-DE') : '')
            : `Socke ${f.socke}/${f.socken} · ${esc(f.abschnitt ? f.abschnitt.titel : '')}`}</div>
          <div class="balken"><span style="width:${f.prozent}%"></span></div>
        </div>
        ${fertig ? '<span class="chip chip--ok">✓</span>' : `<span class="chip chip--akz">${f.prozent} %</span>`}
        <span class="eintrag-pfeil">›</span>
      </a>`;
  }

  // ------------------------------------------------------------- Liste ---
  MW.views.projekte = {
    bereich: 'projekte',
    titel: () => 'Projekte',
    render() {
      const alle = MW.store.liste('projekte').slice().sort((a, b) => String(b.lastModifiedAt || '').localeCompare(String(a.lastModifiedAt || '')));
      const laufend = alle.filter(p => p.status !== 'fertig'), fertig = alle.filter(p => p.status === 'fertig');
      return `
        <div class="seiten-kopf"><h1>Projekte</h1><a class="btn btn--pri" href="#/projekte/neu">+ Socken</a></div>
        ${alle.length ? '' : MW.ui.leer('Noch keine Projekte', 'Leg Socken für eine Person an — Maschen und Reihen rechnet die App aus deren Maßen und deiner Maschenprobe.', '<a class="btn btn--pri" href="#/projekte/neu">Erste Socken anlegen</a>')}
        ${laufend.length ? `<div class="abschnitt">Auf der Nadel</div><div class="liste">${laufend.map(eintrag).join('')}</div>` : ''}
        ${fertig.length ? `<div class="abschnitt">Fertig</div><div class="liste">${fertig.map(eintrag).join('')}</div>` : ''}`;
    },
  };

  // --------------------------------------------------------- Assistent ---
  function eingabenAus(person, probe, garn, form) {
    const masse = {};
    const geschaetzt = [];
    // Nur warnen, wenn ein geschätztes Maß auch in die Rechnung eingeht.
    const genutzt = ['fussLaenge', 'fussUmfang', ...(form.wadenabnahme ? ['wadenUmfang'] : [])];
    for (const m of M.FUSSMASSE) {
      const f = M.fussmass(person, m.key);
      masse[m.key] = f.wert;
      if (f.geschaetzt && f.wert !== null && genutzt.includes(m.key)) geschaetzt.push(m.label);
    }
    const { m10, r10 } = M.probeAuf10(probe);
    return {
      masse, geschaetzt,
      probe: { m10, r10, maschenweite: probe.maschenweite || '', art: probe.art || 'flach' },
      form,
      garn: garn ? { lauflaengeM: garn.lauflaengeM, gewichtG: garn.gewichtG, knaeuelG: garn.knaeuelG } : null,
      methode: { ...MW.store.settings().verkuerzt },
    };
  }

  function ergebnisHtml(e, ergebnis, fehler) {
    if (fehler) return `<div class="hinweis hinweis--warn">${esc(fehler)}</div>`;
    const w = ergebnis.werte;
    const knaeuel = e.garn && M.zahl(e.garn.knaeuelG) && w.garnG ? Math.ceil(w.garnG * 2 / M.zahl(e.garn.knaeuelG)) : null;
    return `
      ${sockeSvg(w)}
      <table class="tabelle">
        <tr><td>Maschen rundherum</td><td class="zahl"><b>${w.maschenOben > w.maschen ? `${w.maschenOben} → ` : ''}${w.maschen}</b></td></tr>
        <tr><td>Je Bett</td><td class="zahl"><b>${w.jeBett}</b> · ${esc(M.nadeln(w.jeBett).text)}</td></tr>
        <tr><td>Bündchen</td><td class="zahl">${w.buendchenReihen} Reihen</td></tr>
        <tr><td>Schaft</td><td class="zahl">${w.schaftRunden} Runden · ${M.fmt(w.schaftCm)} cm</td></tr>
        <tr><td>Ferse</td><td class="zahl">${w.ferse.reihen} Reihen · ${w.jeBett} → ${w.ferse.rest} → ${w.jeBett}</td></tr>
        <tr><td>Fuß</td><td class="zahl">${w.fussRunden} Runden · ${M.fmt(w.fussCm)} cm</td></tr>
        <tr><td>Spitze</td><td class="zahl">${w.spitze.art === 'band' ? `Bandspitze · ${w.spitze.runden} Runden · ${w.maschen} → ${w.spitze.restGesamt}` : `${w.spitze.reihen} Reihen · ${w.jeBett} → ${w.spitze.rest} → ${w.jeBett}`}</td></tr>
        <tr><td>Reihenzähler je Socke</td><td class="zahl"><b>RC ${S.rc(w.rcGesamt)}</b></td></tr>
        <tr><td>Garn je Paar (Schätzung)</td><td class="zahl">≈ ${M.fmt(w.garnM * 2, 0)} m${w.garnG ? ` · ${M.fmt(w.garnG * 2, 0)} g` : ''}${knaeuel ? ` · ${knaeuel} Knäuel` : ''}</td></tr>
      </table>
      ${e.geschaetzt.length ? `<div class="hinweis hinweis--warn" style="margin-top:10px">Geschätzt statt gemessen: ${esc(e.geschaetzt.join(', '))}.</div>` : ''}
      ${e.probe.art !== 'rund' ? '<div class="hinweis hinweis--warn" style="margin-top:10px">Die Probe ist flach gestrickt. Rund auf dem Doppelbett kann die Reihenzahl abweichen.</div>' : ''}
      ${ergebnis.warnungen.map(x => `<div class="hinweis hinweis--warn" style="margin-top:10px">${esc(x)}</div>`).join('')}`;
  }

  MW.views.projektNeu = {
    bereich: 'projekte',
    live: false,
    titel: () => 'Neue Socken',
    render() {
      const personen = MW.store.liste('personen').slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const proben = MW.store.liste('proben').slice().sort((a, b) => (b.art === 'rund') - (a.art === 'rund') || String(b.datum || '').localeCompare(String(a.datum || '')));
      const garne = MW.store.liste('garne');
      if (!personen.length || !proben.length) {
        return `<div class="seiten-kopf"><a class="zurueck" href="#/projekte">‹</a><h1>Neue Socken</h1></div>
          ${MW.ui.leer('Dafür fehlt noch etwas', `Für Socken brauchst du ${!personen.length ? 'eine Person mit Maßen' : ''}${!personen.length && !proben.length ? ' und ' : ''}${!proben.length ? 'eine Maschenprobe' : ''}.`,
            `${!personen.length ? '<a class="btn btn--pri" href="#/personen?neu=1">Person anlegen</a> ' : ''}${!proben.length ? '<a class="btn btn--pri" href="#/proben/neu">Maschenprobe anlegen</a>' : ''}`)}`;
      }
      const person = MW.store.hole('personen', MW.query().person) || personen[0];
      const probe = proben[0];
      this._zustand = { personId: person.id, probeId: probe.id, form: S.vorschlag(person, probe) };
      const f = this._zustand.form;
      const opt = (liste, wert) => liste.map(o => `<option value="${esc(o.wert)}" ${o.wert === wert ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      return `
        <div class="seiten-kopf"><a class="zurueck" href="#/projekte" aria-label="Zurück">‹</a><h1>Neue Socken</h1></div>
        <div class="raster" style="align-items:start">
          <div class="karte">
            <div class="abschnitt" style="margin-top:0">1 · Für wen</div>
            <label class="feld"><span class="feld-label">Person</span>
              <select name="personId">${personen.map(x => `<option value="${esc(x.id)}" ${x.id === person.id ? 'selected' : ''}>${esc(x.name)}${x.schuhgroesse ? ' · Gr. ' + esc(M.fmt(M.zahl(x.schuhgroesse))) : ''}</option>`).join('')}</select></label>
            ${feld({ name: 'name', label: 'Projektname', wert: `Socken für ${person.name}` })}
            <div class="abschnitt">2 · Maschenprobe</div>
            <label class="feld"><span class="feld-label">Probe</span>
              <select name="probeId">${proben.map(x => `<option value="${esc(x.id)}" ${x.id === probe.id ? 'selected' : ''}>${esc(M.probeTitel(x, garne))} · ${esc(MW.proben.kennzahl(x))}${x.art === 'rund' ? ' · rund' : ' · flach'}</option>`).join('')}</select></label>
            <div class="abschnitt">3 · Form</div>
            <div class="raster-2">
              ${MW.ui.auswahl({ name: 'buendchen', label: 'Bündchen', wert: f.buendchen, optionen: S.BUENDCHEN })}
              ${feld({ name: 'buendchenCm', label: 'Bündchenhöhe', wert: f.buendchenCm, typ: 'zahl', einheit: 'cm' })}
              ${feld({ name: 'mwBuendchen', label: 'MW Bündchen', wert: f.mwBuendchen })}
              ${feld({ name: 'weite', label: 'Weite', wert: f.weite, typ: 'zahl', einheit: '%' })}
              ${feld({ name: 'schaftHoeheCm', label: 'Schafthöhe', wert: f.schaftHoeheCm, typ: 'zahl', einheit: 'cm', hinweis: 'Boden bis Bündchenende' })}
              ${feld({ name: 'sockenLaengeCm', label: 'Sockenlänge', wert: f.sockenLaengeCm, typ: 'zahl', einheit: 'cm', hinweis: 'Fußlänge − 0,5 cm' })}
              <label class="feld"><span class="feld-label">Ferse</span><select name="ferse">${opt(S.FERSEN, f.ferse)}</select></label>
              <label class="feld"><span class="feld-label">Spitze</span><select name="spitze">${opt(S.SPITZEN, f.spitze)}</select></label>
            </div>
            <label class="check"><input type="checkbox" name="wadenabnahme"> Wadenabnahme (oben weiter, zum Knöchel hin abnehmen)</label>
            <label class="feld"><span class="feld-label">Anzahl</span>
              <select name="paare"><option value="1">1 Paar</option><option value="2">2 Paar</option></select></label>
          </div>
          <div>
            <div class="karte">
              <div class="abschnitt" style="margin-top:0">4 · Ergebnis</div>
              <div id="ergebnis"></div>
            </div>
            <div class="knopfzeile">
              <a class="btn" href="#/projekte">Abbrechen</a>
              <button class="btn btn--pri" data-anlegen>Projekt anlegen</button>
            </div>
          </div>
        </div>`;
    },
    nachRender(root) {
      const z = this._zustand;
      if (!z) return;
      let letztes = null;
      const rechnen = () => {
        const w = MW.ui.formWerte(root);
        const person = MW.store.hole('personen', w.personId);
        const probe = MW.store.hole('proben', w.probeId);
        const garn = probe && probe.garnId ? MW.store.hole('garne', probe.garnId) : null;
        z.form = {
          buendchen: w.buendchen, buendchenCm: M.zahl(w.buendchenCm), mwBuendchen: w.mwBuendchen, weite: M.zahl(w.weite),
          schaftHoeheCm: M.zahl(w.schaftHoeheCm), sockenLaengeCm: M.zahl(w.sockenLaengeCm),
          ferse: w.ferse, spitze: w.spitze, wadenabnahme: w.wadenabnahme,
        };
        const e = eingabenAus(person, probe, garn, z.form);
        let ergebnis = null, fehler = null;
        try { ergebnis = S.berechne(e); } catch (err) { fehler = err.message; }
        root.querySelector('#ergebnis').innerHTML = ergebnisHtml(e, ergebnis, fehler);
        letztes = { w, person, probe, garn, e, ergebnis };
      };
      root.addEventListener('input', rechnen);
      root.addEventListener('change', (ev) => {
        // Neue Person: deren Maße und Vorlieben ins Formular übernehmen.
        if (ev.target.name === 'personId' || ev.target.name === 'probeId') {
          const person = MW.store.hole('personen', root.querySelector('[name=personId]').value);
          const probe = MW.store.hole('proben', root.querySelector('[name=probeId]').value);
          const v = S.vorschlag(person, probe);
          const setze = (n, wert) => { const el = root.querySelector(`[name=${n}]`); if (el) el.value = wert === null || wert === undefined ? '' : String(wert).replace('.', ','); };
          if (ev.target.name === 'personId') {
            setze('schaftHoeheCm', v.schaftHoeheCm); setze('sockenLaengeCm', v.sockenLaengeCm); setze('weite', v.weite);
            setze('name', `Socken für ${person.name}`);
          } else setze('mwBuendchen', v.mwBuendchen);
        }
        rechnen();
      });
      root.querySelector('[data-anlegen]').addEventListener('click', () => {
        rechnen();
        if (!letztes || !letztes.ergebnis) { MW.ui.toast('Die Berechnung ist noch nicht vollständig.', 'fehler'); return; }
        const { w, person, probe, garn, e, ergebnis } = letztes;
        const p = MW.store.speichern('projekte', {
          typ: 'socke', name: w.name || `Socken für ${person.name}`,
          personId: person.id, personName: person.name, personFarbe: person.farbe,
          probeId: probe.id, garnId: garn ? garn.id : null, garnName: garn ? garn.name + (garn.farbname ? ' · ' + garn.farbname : '') : (probe.garnName || ''),
          eingaben: e, anleitung: ergebnis, paare: +w.paare || 1,
          status: 'laeuft', fortschritt: { karte: 0, gezaehlt: 0 }, aenderungen: {}, notiz: '',
        });
        MW.ui.toast('Projekt angelegt', 'ok');
        MW.gehe(`/projekte/${p.id}`);
      });
      rechnen();
    },
  };

  // ------------------------------------------------------- Projektseite ---
  function bearbeiten(p) {
    MW.ui.modal({
      titel: 'Projekt bearbeiten',
      inhalt: `${feld({ name: 'name', label: 'Name', wert: p.name })}${MW.ui.textfeld({ name: 'notiz', label: 'Notiz', wert: p.notiz })}
        <p class="leise klein">Maße und Maschenprobe sind im Projekt eingefroren. Für andere Werte ein neues Projekt anlegen.</p>`,
      aktionen: [
        { label: 'Löschen', art: 'leise', klick: () => { loeschen(p); } },
        { label: 'Abbrechen' },
        { label: 'Speichern', art: 'pri', klick: (el) => { const w = MW.ui.formWerte(el); MW.store.speichern('projekte', { ...p, name: w.name || p.name, notiz: w.notiz }); } },
      ],
    });
  }
  async function loeschen(p) {
    if (await MW.ui.bestaetigen(`${p.name} löschen?`, 'Das Projekt mit Anleitung und Fortschritt wird gelöscht.')) {
      MW.store.loeschen('projekte', p.id);
      MW.gehe('/projekte');
    }
  }
  async function zuruecksetzen(p) {
    if (await MW.ui.bestaetigen('Von vorn beginnen?', 'Der Fortschritt wird auf den Anfang von Socke 1 gesetzt. Änderungen an den Einstellungen bleiben.', 'Zurücksetzen')) {
      MW.store.speichern('projekte', { ...p, status: 'laeuft', fertigAm: null, fortschritt: { karte: 0, gezaehlt: 0 } });
    }
  }

  MW.views.projekt = {
    bereich: 'projekte',
    titel: ({ id }) => (MW.store.hole('projekte', id) || {}).name || 'Projekt',
    render({ id }) {
      const p = MW.store.hole('projekte', id);
      if (!p) return MW.ui.leer('Projekt nicht gefunden', '', '<a class="btn" href="#/projekte">Zur Liste</a>');
      const f = fortschritt(p);
      const w = p.anleitung.werte;
      const k = karten(p);
      const zeilen = p.anleitung.abschnitte.map(a => {
        const letzte = k.reduce((m, x, i) => (x.socke === f.socke && x.abschnitt === a.id ? i : m), -1);
        const erste = k.findIndex(x => x.socke === f.socke && x.abschnitt === a.id);
        const st = p.status === 'fertig' || f.index > letzte ? 'fertig' : f.index >= erste ? 'jetzt' : 'offen';
        const e = einstellung(p, a);
        const mw = [e.mwHaupt && `MW ${e.mwHaupt}`, e.mwRibber && e.mwRibber !== e.mwHaupt ? `Ribber ${e.mwRibber}` : ''].filter(Boolean).join(' · ');
        return `<div class="eintrag ${st === 'jetzt' ? 'eintrag--jetzt' : ''}">
          <div class="eintrag-text">
            <div class="eintrag-titel">${esc(a.titel)} <span class="leise" style="font-weight:400">· ${esc(a.umfang)}</span></div>
            <div class="eintrag-unter">${a.rcVon !== a.rcBis ? `RC ${S.rc(a.rcVon)} → ${S.rc(a.rcBis)} · ` : ''}${esc(mw)}${Object.keys(e.geaendert).length ? ' · <b>geändert</b>' : ''}</div>
          </div>
          <span class="chip ${st === 'fertig' ? 'chip--ok' : st === 'jetzt' ? 'chip--akz' : 'chip--grau'}">${st === 'fertig' ? '✓' : st === 'jetzt' ? 'jetzt' : 'offen'}</span>
        </div>`;
      }).join('');
      const masse = M.FUSSMASSE.map(m => `<tr><td>${esc(m.label)}</td><td class="zahl ${p.eingaben.geschaetzt.includes(m.label) ? 'geschaetzt' : ''}">${p.eingaben.masse[m.key] === null ? '–' : (p.eingaben.geschaetzt.includes(m.label) ? '≈ ' : '') + M.fmt(p.eingaben.masse[m.key]) + ' cm'}</td></tr>`).join('');
      const aenderungen = Object.entries(p.aenderungen || {}).map(([aid, x]) => {
        const a = p.anleitung.abschnitte.find(y => y.id === aid);
        return `<li><b>${esc(a ? a.titel : aid)}</b> (bei Socke ${x.socke}): ${esc([x.mwHaupt && 'MW ' + x.mwHaupt, x.mwRibber && 'Ribber ' + x.mwRibber, x.gewichte, x.hinweis, x.notiz].filter(Boolean).join(' · '))}</li>`;
      }).join('');
      return `
        <div class="seiten-kopf">
          <a class="zurueck" href="#/projekte" aria-label="Zurück">‹</a>
          <h1>${esc(p.name)}</h1>
          <button class="btn" data-bearbeiten>Bearbeiten</button>
        </div>
        <div class="karte">
          <div class="row-zwischen">
            <div><b>${p.status === 'fertig' ? 'Fertig' : `Socke ${f.socke} von ${f.socken}`}</b> <span class="leise">· ${esc(f.abschnitt && p.status !== 'fertig' ? f.abschnitt.titel : '')}</span></div>
            <span class="chip ${p.status === 'fertig' ? 'chip--ok' : 'chip--akz'}">${f.prozent} %</span>
          </div>
          <div class="balken balken--gross"><span style="width:${f.prozent}%"></span></div>
          <div class="knopfzeile">
            <a class="btn btn--pri" href="#/stricken/${encodeURIComponent(p.id)}">${p.status === 'fertig' ? 'Anleitung ansehen' : f.index ? '▶ Weiterstricken' : '▶ Stricken'}</a>
            <button class="btn" data-pdf>PDF</button>
            ${f.index || p.status === 'fertig' ? '<button class="btn btn--leise" data-reset>Von vorn</button>' : ''}
          </div>
        </div>
        <div class="raster" style="margin-top:12px;align-items:start">
          <div>
            <div class="abschnitt" style="margin-top:0">Ablauf · Socke ${f.socke}</div>
            <div class="liste">${zeilen}</div>
          </div>
          <div class="karte">
            ${sockeSvg(w, true)}
            <table class="tabelle">
              <tr><td>Für</td><td class="zahl"><a href="#/personen/${encodeURIComponent(p.personId)}">${esc(p.personName)}</a></td></tr>
              <tr><td>Garn</td><td class="zahl">${esc(p.garnName || '–')}</td></tr>
              <tr><td>Maschenprobe</td><td class="zahl">${M.fmt(p.eingaben.probe.m10)} M · ${M.fmt(p.eingaben.probe.r10)} R · MW ${esc(p.eingaben.probe.maschenweite || '–')} · ${p.eingaben.probe.art}</td></tr>
              <tr><td>Maschen</td><td class="zahl"><b>${w.maschen}</b>, ${w.jeBett} je Bett</td></tr>
              <tr><td>Weite</td><td class="zahl">${M.fmt(w.weite)} %</td></tr>
              <tr><td>Garn je Paar</td><td class="zahl">≈ ${M.fmt(w.garnM * 2, 0)} m${w.garnG ? ' · ' + M.fmt(w.garnG * 2, 0) + ' g' : ''}</td></tr>
            </table>
            <details style="margin-top:10px"><summary class="klein">Eingefrorene Maße</summary><table class="tabelle">${masse}</table></details>
            ${aenderungen ? `<h2 style="margin-top:14px">Änderungen beim Stricken</h2><ul class="klein">${aenderungen}</ul>` : ''}
            ${p.notiz ? `<h2 style="margin-top:14px">Notiz</h2><p style="white-space:pre-wrap">${esc(p.notiz)}</p>` : ''}
          </div>
        </div>`;
    },
    nachRender(root, { id }) {
      const p = MW.store.hole('projekte', id);
      if (!p) return;
      root.querySelector('[data-bearbeiten]').addEventListener('click', () => bearbeiten(MW.store.hole('projekte', id)));
      root.querySelector('[data-pdf]').addEventListener('click', () => MW.pdf.socken(MW.store.hole('projekte', id)));
      const r = root.querySelector('[data-reset]');
      if (r) r.addEventListener('click', () => zuruecksetzen(MW.store.hole('projekte', id)));
    },
  };

  MW.projekte = { karten, fortschritt, einstellung, sockeSvg, eintrag };
})();
