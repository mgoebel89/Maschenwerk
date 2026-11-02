(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc } = MW.ui;
  const M = MW.models;
  const S = MW.socke;

  // Strickmodus: Vollbild, dunkel, eine Karte nach der anderen.
  //   einstellen  Checkliste vor jedem Abschnitt (Vorlage + Änderungen)
  //   text        Anweisung ohne Reihenzählung (Anschlag, Umhängen, Abnahme …)
  //   block       gerade Strecke: n Runden bzw. Reihen, zählbar per Knopf,
  //               Sensor oder Bluetooth-Taster
  //   reihe       eine verkürzte Reihe mit Nadelbett-Grafik
  // Weiter: großer Knopf, Leertaste/Enter/→/Bild↓ (Bluetooth-Seitenwender).
  // Der Bildschirm bleibt an (Wake Lock, braucht HTTPS).

  let st = null;   // Zustand der offenen Strickansicht

  // ------------------------------------------------------- Ton & Sperre ---
  let audio = null;
  function piep(zweimal) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime;
      for (let i = 0; i < (zweimal ? 2 : 1); i++) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.25, t0 + i * 0.25); g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.25 + 0.18);
        o.start(t0 + i * 0.25); o.stop(t0 + i * 0.25 + 0.2);
      }
    } catch (_) {}
    if (navigator.vibrate) navigator.vibrate(zweimal ? [120, 80, 120] : 120);
  }

  async function sperreHolen() {
    if (!st || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      st.sperre = await navigator.wakeLock.request('screen');
      st.sperre.addEventListener('release', () => { if (st) { st.sperre = null; statusZeichnen(); } });
    } catch (_) { if (st) st.sperre = null; }
    statusZeichnen();
  }

  // ------------------------------------------------------------ Zustand ---
  function projekt() { return MW.store.hole('projekte', st.id); }
  function speichern(p) { MW.store.speichern('projekte', p); }

  function gehe(delta) {
    const p = projekt();
    const k = st.karten;
    const neu = Math.max(0, Math.min(k.length - 1, (p.fortschritt.karte || 0) + delta));
    p.fortschritt = { karte: neu, gezaehlt: 0 };
    speichern(p);
    st.haken = new Set();
    zeichnen();
    window.scrollTo(0, 0);
  }

  function zaehlen(n) {
    const p = projekt();
    const karte = st.karten[p.fortschritt.karte];
    if (!karte || karte.typ !== 'block') return;
    const neu = Math.max(0, Math.min(karte.anzahl, (p.fortschritt.gezaehlt || 0) + n));
    p.fortschritt = { ...p.fortschritt, gezaehlt: neu };
    speichern(p);
    if (neu >= karte.anzahl && n > 0) { piep(true); gehe(+1); return; }
    zeichnen();
  }

  // ----------------------------------------------------------- Bauteile ---
  function bettGrafik(karte, anleitung) {
    const F = anleitung.abschnitte.find(a => a.id === karte.abschnitt).verkuerzt.F;
    const labels = anleitung.bett.labels;
    let haupt = '';
    for (let i = 0; i < F; i++) {
      const k = i === karte.aktiv ? 'z' : i >= karte.lo && i <= karte.hi ? '' : 'e';
      haupt += `<span class="${k}"></span>`;
    }
    const rib = '<span></span>'.repeat(F);
    return `<div class="bett">
      <div class="nadeln">${haupt}</div>
      <div class="bett-lab"><span>${esc(labels[0])}</span><span>Hauptbett</span><span>${esc(labels[F - 1])}</span></div>
      <div class="nadeln nadeln--rib">${rib}</div>
      <div class="bett-lab"><span></span><span>Ribber · ruht</span><span></span></div>
      <div class="legende"><span><i style="background:#5fb3bf"></i>B Arbeit</span><span><i style="background:#f0a48f"></i>E Halten</span><span><i style="background:#fff"></i>jetzt</span></div>
    </div>`;
  }

  function checkliste(p, a, karte) {
    const e = MW.projekte.einstellung(p, a);
    const punkte = [];
    const markiere = (t) => esc(t).replace(/⚑/g, '<span class="flagge" title="Bezeichnung aus der Anleitung prüfen (Einstellungen → Vorlagen)">⚑</span>');
    if (a.rcVon || karte.socke > 1 || a.id === 'anschlag') punkte.push({ k: 'rc', t: `Reihenzähler steht auf <b>${S.rc(a.rcVon)}</b>` });
    if (e.mwHaupt) punkte.push({ k: 'mwHaupt', t: `Maschenweite Hauptbett <b>${esc(e.mwHaupt)}</b>`, g: e.geaendert.mwHaupt });
    if (e.mwRibber) punkte.push({ k: 'mwRibber', t: `Maschenweite Ribber <b>${esc(e.mwRibber)}</b>`, g: e.geaendert.mwRibber });
    if (e.hauptschlitten) punkte.push({ k: 'hs', t: `Hauptschlitten: ${markiere(e.hauptschlitten)}` });
    if (e.ribber) punkte.push({ k: 'rib', t: `Ribber: ${markiere(e.ribber)}` });
    if (e.nadeln) punkte.push({ k: 'nad', t: `Nadeln: ${esc(e.nadeln)}` });
    if (e.gewichte) punkte.push({ k: 'gewichte', t: `Gewichte: ${esc(e.gewichte)}`, g: e.geaendert.gewichte });
    if (e.hinweis) punkte.push({ k: 'hinweis', t: markiere(e.hinweis), g: e.geaendert.hinweis });
    if (e.notiz) punkte.push({ k: 'notiz', t: `Notiz: ${esc(e.notiz)}` });
    return `
      <div class="k-titel">Vor dem Start einstellen</div>
      <div class="k-unter">${esc(e.vorlageName)}</div>
      <div class="chk">${punkte.map(x => `
        <button type="button" class="${st.haken.has(x.k) ? 'ok' : ''} ${x.g ? 'chg' : ''}" data-haken="${x.k}">
          <i>${st.haken.has(x.k) ? '✓' : ''}</i>
          <span>${x.t}${x.g ? `<small>bei Socke ${x.g.socke} geändert${x.g.vorher ? ' (vorher ' + esc(x.g.vorher) + ')' : ''}</small>` : ''}</span>
        </button>`).join('')}</div>`;
  }

  function karteHtml(p, karte) {
    const an = p.anleitung;
    const a = karte.abschnitt && an.abschnitte.find(x => x.id === karte.abschnitt);
    if (karte.typ === 'einstellen') return { kopf: a.titel, inhalt: checkliste(p, a, karte), knopf: 'Alles eingestellt ▶' };
    if (karte.typ === 'text') return { kopf: a.titel, inhalt: `<div class="k-titel">${esc(karte.titel)}</div><div class="k-text">${esc(karte.text).replace(/⚑/g, '<span class="flagge">⚑</span>')}</div>`, knopf: 'Erledigt ▶' };
    if (karte.typ === 'block') {
      const g = p.fortschritt.gezaehlt || 0;
      return {
        kopf: a.titel,
        inhalt: `
          <div class="k-gross"><span>${g}</span><small>von ${karte.anzahl} ${karte.einheit}</small></div>
          <div class="k-rc"><div><small>Reihenzähler</small><b>RC ${S.rc(karte.rcVon)} → ${S.rc(karte.rcBis)}</b></div>
            <div style="text-align:right"><small>jetzt etwa</small><b>RC ${S.rc(karte.rcVon + g * (karte.einheit === 'Runden' ? 2 : 1))}</b></div></div>
          <div class="k-text">${esc(karte.text)}</div>
          <div class="k-zaehl">
            <button type="button" data-zaehl="-1" aria-label="eine weniger">−</button>
            <span>${karte.einheit === 'Runden' ? 'Runde' : 'Reihe'} zählen</span>
            <button type="button" data-zaehl="1" aria-label="eine mehr">+</button>
          </div>`,
        knopf: `Fertig · RC ${S.rc(karte.rcBis)} ▶`,
      };
    }
    if (karte.typ === 'reihe') {
      const phase = karte.phase === 'ab' ? 'Abnahme' : karte.phase === 'auf' ? 'Zunahme' : 'Zwischenreihe';
      return {
        kopf: `${a.titel} · verkürzte Reihen · ${phase}`,
        inhalt: `
          <div class="k-gross"><span>${karte.nr}</span><small>von ${karte.von} Reihen</small></div>
          <div class="k-rc"><div><small>Reihenzähler vor der Reihe</small><b>RC ${S.rc(karte.rcVor)}</b></div>
            <div style="text-align:right"><small>Schlitten steht</small><b class="wort">${karte.seite === 'rechts' ? 'rechts ▶' : '◀ links'}</b></div></div>
          <div class="k-text">${esc(karte.text).replace(/(Nadel )([LR]\d+)/, '$1<b>$2</b>').replace(/ nach (E|D) /, ' nach <b>$1</b> ')}</div>
          ${bettGrafik(karte, an)}`,
        knopf: 'Reihe gestrickt ✓',
      };
    }
    if (karte.typ === 'zwischen') return { kopf: `Socke ${karte.socke} fertig`, inhalt: `<div class="k-titel">🎉 Socke ${karte.socke} ist fertig</div><div class="k-text">${esc(karte.text)}</div>`, knopf: `Socke ${karte.socke + 1} beginnen ▶` };
    return { kopf: 'Fertig', inhalt: `<div class="k-titel">🎉 Fertig!</div><div class="k-text">${esc(karte.text)} Das Projekt wird als fertig markiert.</div>`, knopf: p.status === 'fertig' ? 'Zurück zum Projekt' : 'Projekt abschließen ✓' };
  }

  function statusZeichnen() {
    const el = document.getElementById('strickStatus');
    if (!el || !st) return;
    const sensor = MW.store.settings().sensor.aktiv ? (st.sensorZeit ? '📡 Sensor' : '📡 wartet') : '';
    el.textContent = [sensor, st.sperre ? '☀ bleibt an' : ''].filter(Boolean).join(' · ');
  }

  function zeichnen() {
    const root = st.root;
    const p = projekt();
    if (!p) { MW.gehe('/projekte'); return; }
    const k = st.karten;
    const i = Math.min(p.fortschritt.karte || 0, k.length - 1);
    const karte = k[i];
    const h = karteHtml(p, karte);
    // Fortschrittsbalken: ein Segment je Abschnitt der aktuellen Socke.
    const segmente = p.anleitung.abschnitte.map(a => {
      const erste = k.findIndex(x => x.socke === karte.socke && x.abschnitt === a.id);
      const letzte = k.reduce((m, x, j) => (x.socke === karte.socke && x.abschnitt === a.id ? j : m), -1);
      return `<span class="${i > letzte ? 'd' : i >= erste ? 'c' : ''}" title="${esc(a.titel)}"></span>`;
    }).join('');
    const socken = (p.paare || 1) * 2;
    root.innerHTML = `
      <div class="strick">
        <header class="s-kopf">
          <a class="s-icon" href="#/projekte/${encodeURIComponent(p.id)}" aria-label="Strickmodus verlassen">✕</a>
          <div class="s-titel">${esc(p.name)} · Socke ${karte.socke}/${socken}</div>
          ${karte.abschnitt ? '<button class="s-icon" data-aendern aria-label="Einstellung ändern">✎</button>' : '<span class="s-icon"></span>'}
        </header>
        <div class="s-status" id="strickStatus"></div>
        <div class="s-prog">${segmente}</div>
        <div class="s-phase">${esc(h.kopf)}</div>
        <div class="s-inhalt">${h.inhalt}</div>
        <footer class="s-fuss">
          <button class="s-zurueck" data-gehe="-1" ${i === 0 ? 'disabled' : ''} aria-label="Zurück">‹</button>
          <button class="s-weiter" data-weiter>${h.knopf}</button>
        </footer>
      </div>`;
    statusZeichnen();
  }

  function weiter() {
    const p = projekt();
    const karte = st.karten[p.fortschritt.karte];
    if (karte.typ === 'fertig') {
      if (p.status !== 'fertig') { speichern({ ...p, status: 'fertig', fertigAm: new Date().toISOString() }); MW.ui.toast('Projekt abgeschlossen 🎉', 'ok'); }
      MW.gehe(`/projekte/${p.id}`);
      return;
    }
    gehe(+1);
  }

  // Ebene 2: Änderung beim Stricken festhalten — gilt sofort und für die nächste Socke.
  function aendern() {
    const p = projekt();
    const karte = st.karten[p.fortschritt.karte];
    const a = p.anleitung.abschnitte.find(x => x.id === karte.abschnitt);
    const e = MW.projekte.einstellung(p, a);
    MW.ui.modal({
      titel: `Änderung · ${a.titel}`,
      inhalt: `
        <p class="leise klein">Was du hier einträgst, gilt ab sofort und automatisch für Socke ${karte.socke + 1 <= (p.paare || 1) * 2 ? karte.socke + 1 : 'und spätere Projekte'}.</p>
        <div class="raster-2">
          ${MW.ui.feld({ name: 'mwHaupt', label: 'MW Hauptbett', wert: e.mwHaupt })}
          ${MW.ui.feld({ name: 'mwRibber', label: 'MW Ribber', wert: e.mwRibber })}
        </div>
        ${MW.ui.feld({ name: 'gewichte', label: 'Gewichte', wert: e.gewichte })}
        ${MW.ui.textfeld({ name: 'notiz', label: 'Notiz zu diesem Abschnitt', wert: e.notiz || '' })}`,
      aktionen: [
        { label: 'Abbrechen' },
        {
          label: 'Übernehmen', art: 'pri', klick: (el) => {
            const w = MW.ui.formWerte(el);
            const basis = { mwHaupt: a.mwHaupt, mwRibber: a.mwRibber, gewichte: ((MW.store.settings().einstellungsVorlagen || {})[a.vorlage] || {}).gewichte || '' };
            const alt = (p.aenderungen || {})[a.id] || {};
            const neu = { socke: alt.socke || karte.socke, am: new Date().toISOString() };
            for (const k of ['mwHaupt', 'mwRibber', 'gewichte']) if (w[k] && w[k] !== basis[k]) neu[k] = w[k];
            if (w.notiz) neu.notiz = w.notiz;
            const aenderungen = { ...(p.aenderungen || {}) };
            if (Object.keys(neu).length > 2) aenderungen[a.id] = neu; else delete aenderungen[a.id];
            speichern({ ...p, aenderungen });
            zeichnen();
            MW.ui.toast('Änderung gespeichert', 'ok');
          },
        },
      ],
    });
  }

  // Sensor: Zählerstand des Backends abfragen und die Differenz zählen.
  async function sensorAbfragen() {
    if (!st) return;
    try {
      const z = await MW.api.zaehler();
      if (!st) return;
      if (st.sensorStand === null) st.sensorStand = z.stand;
      const d = z.stand - st.sensorStand;
      st.sensorStand = z.stand;
      if (d > 0) {
        st.sensorZeit = z.zeit;
        const karte = st.karten[projekt().fortschritt.karte];
        if (karte && karte.typ === 'block') zaehlen(d * (karte.proImpuls || 1));
        else piep();   // Aktion steht an: aufmerksam machen, aber nicht weiterblättern
      }
      statusZeichnen();
    } catch (_) {}
    if (st) st.timer = setTimeout(sensorAbfragen, 1500);
  }

  function aufraeumen() {
    if (!st) return;
    clearTimeout(st.timer);
    if (st.sperre) { try { st.sperre.release(); } catch (_) {} }
    document.removeEventListener('keydown', st.taste);
    document.removeEventListener('visibilitychange', st.sichtbar);
    document.body.classList.remove('strickmodus');
    st = null;
  }

  MW.views.stricken = {
    bereich: 'projekte',
    live: false,
    titel: ({ id }) => (MW.store.hole('projekte', id) || {}).name || 'Stricken',
    render({ id }) {
      const p = MW.store.hole('projekte', id);
      if (!p) return MW.ui.leer('Projekt nicht gefunden', '', '<a class="btn" href="#/projekte">Zur Liste</a>');
      return '<div id="strickRoot"></div>';
    },
    nachRender(root, { id }) {
      aufraeumen();
      const p = MW.store.hole('projekte', id);
      if (!p) return;
      p.fortschritt = p.fortschritt || { karte: 0, gezaehlt: 0 };
      st = { id, root: root.querySelector('#strickRoot'), karten: S.karten(p.anleitung, p.paare || 1), haken: new Set(), sensorStand: null, sensorZeit: null, sperre: null, timer: null };
      document.body.classList.add('strickmodus');

      st.root.addEventListener('click', (e) => {
        if (audio === null) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }   // Ton erst nach einer Berührung erlaubt
        const h = e.target.closest('[data-haken]');
        if (h) { const k = h.dataset.haken; if (st.haken.has(k)) st.haken.delete(k); else st.haken.add(k); zeichnen(); return; }
        if (e.target.closest('[data-weiter]')) return weiter();
        const g = e.target.closest('[data-gehe]');
        if (g) return gehe(+g.dataset.gehe);
        const z = e.target.closest('[data-zaehl]');
        if (z) return zaehlen(+z.dataset.zaehl);
        if (e.target.closest('[data-aendern]')) return aendern();
      });
      // Bluetooth-Seitenwender senden meist Pfeil- oder Bildtasten.
      st.taste = (e) => {
        if (document.querySelector('.modal-wrap') || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
        if ([' ', 'Enter', 'ArrowRight', 'PageDown', 'ArrowDown'].includes(e.key)) { e.preventDefault(); weiter(); }
        else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); gehe(-1); }
      };
      document.addEventListener('keydown', st.taste);
      st.sichtbar = () => { if (document.visibilityState === 'visible') sperreHolen(); };
      document.addEventListener('visibilitychange', st.sichtbar);
      window.addEventListener('hashchange', aufraeumen, { once: true });

      zeichnen();
      sperreHolen();
      if (MW.store.settings().sensor.aktiv) sensorAbfragen();
    },
  };
})();
