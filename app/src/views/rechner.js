(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc, feld } = MW.ui;
  const M = MW.models;

  // Schnellrechner für unterwegs: aus einer Maschenprobe Maschen, Nadeln und
  // Reihen ausrechnen und Zu-/Abnahmen verteilen. Rechnet live beim Tippen.

  const RAPPORTE = [
    { wert: 1, label: 'nicht runden' },
    { wert: 2, label: 'gerade Zahl' },
    { wert: 3, label: 'Vielfaches von 3 (2:1)' },
    { wert: 4, label: 'Vielfaches von 4 (2:2)' },
  ];

  function berechnen(root) {
    const w = MW.ui.formWerte(root);
    const m10 = M.zahl(w.m10), r10 = M.zahl(w.r10);
    const rund = w.art === 'rund';
    const aus = (sel, html) => { root.querySelector(sel).innerHTML = html; };
    const leer = '<div class="ergebnis ergebnis--leer">Erst Maschenprobe und Maß eingeben.</div>';

    // 1. Breite → Maschen
    const breite = M.zahl(w.breite);
    const weite = M.zahl(w.weite) || 0;
    const exakt = M.maschenFuer(breite === null ? null : breite * (1 + weite / 100), m10);
    if (exakt) {
      // Rund muss die Zahl zusätzlich gerade sein (beide Betten gleich): kgV mit 2.
      const rapport = rund && +w.rapport % 2 ? +w.rapport * 2 : +w.rapport;
      const n = M.rundeAuf(exakt, rapport);
      let nadelText, zuViel;
      if (rund) {
        const je = M.nadeln(n / 2);
        nadelText = `${n / 2} je Bett: <b>${je.text}</b> auf Hauptbett und Ribber`;
        zuViel = je.zuViel || n / 2 > 200;
      } else {
        const na = M.nadeln(n);
        nadelText = `<b>${na.text}</b>`;
        zuViel = na.zuViel;
      }
      aus('#erg1', `<div class="ergebnis">
        <div class="ergebnis-klein">${M.fmt(breite)} cm${weite ? ` ${weite > 0 ? '+' : '−'} ${M.fmt(Math.abs(weite))} % = ${M.fmt(breite * (1 + weite / 100))} cm` : ''} × ${M.fmt(m10 / 10, 2)} M/cm = ${M.fmt(exakt, 1)}</div>
        <div class="ergebnis-gross">${n} Maschen${rund ? ' rundherum' : ''}</div>
        <div class="ergebnis-klein">${nadelText}</div>
      </div>${zuViel ? '<div class="hinweis hinweis--warn" style="margin-top:8px">Das passt nicht aufs Bett: die KH-588 hat 100 Nadeln je Seite.</div>' : ''}
      ${rund && +w.rapport % 2 ? '<p class="leise klein">Rund wird auf eine gerade Zahl gerundet, damit beide Betten gleich viele Maschen haben.</p>' : ''}`);
    } else aus('#erg1', leer);

    // 2. Länge → Reihen
    const laenge = M.zahl(w.laenge);
    const reihen = M.reihenFuer(laenge, r10);
    if (reihen) {
      const r = Math.round(reihen);
      aus('#erg2', `<div class="ergebnis">
        <div class="ergebnis-klein">${M.fmt(laenge)} cm × ${M.fmt(r10 / 10, 2)} ${rund ? 'Rd' : 'R'}/cm = ${M.fmt(reihen, 1)}</div>
        <div class="ergebnis-gross">${r} ${rund ? 'Runden' : 'Reihen'}</div>
        <div class="ergebnis-klein">Reihenzähler +${rund ? r * 2 : r}${rund ? ' (eine Runde = zwei Schlittenfahrten)' : ''}</div>
      </div>`);
    } else aus('#erg2', leer);

    // 3. Umgekehrt: Maschen / Reihen → cm
    const nm = M.zahl(w.rueckMaschen), nr = M.zahl(w.rueckReihen);
    const teile = [];
    if (nm && m10) teile.push(`<div class="ergebnis-gross">${M.fmt(nm / m10 * 10)} cm</div><div class="ergebnis-klein">breit bei ${M.fmt(nm, 0)} Maschen</div>`);
    if (nr && r10) teile.push(`<div class="ergebnis-gross">${M.fmt(nr / r10 * 10)} cm</div><div class="ergebnis-klein">hoch bei ${M.fmt(nr, 0)} ${rund ? 'Runden' : 'Reihen'}</div>`);
    aus('#erg3', teile.length ? `<div class="ergebnis"><div class="ergebnis-zeile">${teile.map(t => `<div>${t}</div>`).join('')}</div></div>` : leer.replace('Maß', 'Maschen oder Reihen'));

    // 4. Verteilen
    const v = M.verteilen(w.von, w.bis, w.ueber, w.beidseitig);
    if (!v) aus('#erg4', '<div class="ergebnis ergebnis--leer">Von, bis und über wie viele Reihen eingeben.</div>');
    else if (v.fehler) aus('#erg4', `<div class="hinweis hinweis--warn">${esc(v.fehler)}</div>`);
    else aus('#erg4', `<div class="ergebnis">
        <div class="ergebnis-klein">${v.diff} Maschen ${v.art === 'Zunahme' ? 'mehr' : 'weniger'} = ${v.ereignisse} ${v.art}${v.ereignisse === 1 ? '' : 'n'}${w.beidseitig ? ' je Seite' : ''}</div>
        <div style="font-size:19px;font-weight:800;margin:4px 0">${esc(v.text)}</div>
        ${v.einfach ? `<div class="ergebnis-klein">oder einfacher: ${esc(v.einfach)}</div>` : ''}
      </div>`);
  }

  MW.views.rechner = {
    bereich: 'rechner',
    live: false,
    titel: () => 'Schnellrechner',
    render() {
      const garne = MW.store.liste('garne');
      const proben = MW.store.liste('proben');
      const gewaehlt = MW.store.hole('proben', MW.query().probe || '') || proben[0] || null;
      const werte = gewaehlt ? M.probeAuf10(gewaehlt) : { m10: '', r10: '' };
      const opt = proben.map(p => `<option value="${esc(p.id)}" ${gewaehlt && p.id === gewaehlt.id ? 'selected' : ''}>${esc(M.probeTitel(p, garne))} · ${esc(MW.proben.kennzahl(p))}</option>`).join('');
      const art = gewaehlt ? gewaehlt.art || 'flach' : 'rund';
      return `
        <div class="seiten-kopf"><h1>Schnellrechner</h1></div>
        <div class="karte">
          <h2>Maschenprobe</h2>
          <label class="feld"><span class="feld-label">Gespeicherte Probe</span>
            <select name="probe" data-probe>${opt}<option value="" ${gewaehlt ? '' : 'selected'}>— eigene Werte eingeben —</option></select>
          </label>
          <div class="raster-2">
            ${feld({ name: 'm10', label: 'Maschen auf 10 cm', wert: werte.m10 && Math.round(werte.m10 * 100) / 100, typ: 'zahl', einheit: 'M' })}
            ${feld({ name: 'r10', label: 'Reihen bzw. Runden auf 10 cm', wert: werte.r10 && Math.round(werte.r10 * 100) / 100, typ: 'zahl', einheit: 'R' })}
          </div>
          ${MW.ui.seg('art', art, [{ wert: 'rund', label: 'rund (Doppelbett)' }, { wert: 'flach', label: 'flach' }])}
        </div>

        <div class="raster" style="margin-top:12px">
          <div class="karte">
            <h2>Breite → Maschen</h2>
            <div class="raster-2">
              ${feld({ name: 'breite', label: 'Breite / Umfang', typ: 'zahl', einheit: 'cm' })}
              ${feld({ name: 'weite', label: 'Weite', typ: 'zahl', einheit: '%', wert: 0, hinweis: 'z. B. −10 bei Socken' })}
            </div>
            ${MW.ui.auswahl({ name: 'rapport', label: 'Runden auf', wert: 2, optionen: RAPPORTE })}
            <div id="erg1"></div>
          </div>
          <div class="karte">
            <h2>Länge → Reihen</h2>
            ${feld({ name: 'laenge', label: 'Länge', typ: 'zahl', einheit: 'cm' })}
            <div id="erg2"></div>
          </div>
          <div class="karte">
            <h2>Maschen / Reihen → cm</h2>
            <div class="raster-2">
              ${feld({ name: 'rueckMaschen', label: 'Maschen', typ: 'zahl' })}
              ${feld({ name: 'rueckReihen', label: 'Reihen / Runden', typ: 'zahl' })}
            </div>
            <div id="erg3"></div>
          </div>
          <div class="karte">
            <h2>Zu- und Abnahmen verteilen</h2>
            <div class="raster-2">
              ${feld({ name: 'von', label: 'von Maschen', typ: 'zahl', platzhalter: '54' })}
              ${feld({ name: 'bis', label: 'auf Maschen', typ: 'zahl', platzhalter: '90' })}
            </div>
            ${feld({ name: 'ueber', label: 'über Reihen', typ: 'zahl', platzhalter: '120' })}
            <label class="check"><input type="checkbox" name="beidseitig" checked> an beiden Rändern gleichzeitig</label>
            <div id="erg4"></div>
          </div>
        </div>`;
    },
    nachRender(root) {
      const neu = () => berechnen(root);
      root.addEventListener('input', neu);
      root.addEventListener('change', (e) => {
        if (e.target.matches('[data-probe]')) {
          const p = MW.store.hole('proben', e.target.value);
          if (p) {
            const { m10, r10 } = M.probeAuf10(p);
            root.querySelector('[name=m10]').value = String(Math.round(m10 * 100) / 100).replace('.', ',');
            root.querySelector('[name=r10]').value = String(Math.round(r10 * 100) / 100).replace('.', ',');
            root.querySelectorAll('[data-seg="art"] button').forEach(b => b.classList.toggle('an', b.dataset.wert === (p.art || 'flach')));
          }
        }
        neu();
      });
      MW.ui.segVerdrahten(root, neu);
      neu();
    },
  };
})();
