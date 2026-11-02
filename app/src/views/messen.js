(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc } = MW.ui;
  const M = MW.models;

  // Messmaske: ein Maß nach dem anderen. Die Zeichnung bleibt oben stehen,
  // die Linie des aktiven Maßes leuchtet. Gespeichert wird beim Tippen
  // (kurz verzögert), damit nichts verloren geht, wenn das Handy ausgeht.

  let aktiv = null;
  let timer = null;
  let ausstehend = null;   // getippter, noch nicht gespeicherter Wert des aktiven Maßes

  // Genitiv: „Lenas", aber „Klaus’".
  const genitiv = (n) => /[sxzß]$/i.test(n) ? n + '’' : n + 's';

  function inhalt(p) {
    const gemessen = new Set(M.FUSSMASSE.filter(m => M.zahl(p.fuss && p.fuss[m.key]) !== null).map(m => m.key));
    const idx = M.FUSSMASSE.findIndex(m => m.key === aktiv);
    const m = M.FUSSMASSE[idx];
    const wert = p.fuss && p.fuss[m.key];
    const schaetzung = M.schaetzeFussmasse(p.schuhgroesse)[m.key];
    const warn = M.plausibilitaet(m.key, wert, p.schuhgroesse);
    const naechstes = M.FUSSMASSE[idx + 1];

    const kacheln = M.FUSSMASSE.map(x => {
      const f = M.fussmass(p, x.key);
      return `<button type="button" class="mass-kachel ${x.key === aktiv ? 'an' : ''} ${f.geschaetzt ? 'geschaetzt' : ''}" data-mass="${x.key}">
        <small>${esc(x.label)}</small><b>${f.wert === null ? '–' : (f.geschaetzt ? '≈ ' : '') + M.fmt(f.wert) + ' cm'}</b></button>`;
    }).join('');

    return `
      <div class="mess-layout">
        <div class="mess-bild">${MW.fuss.svg({ aktiv, gemessen })}</div>
        <div>
          <div class="mass-aktiv">
            <label class="feld">
              <span class="feld-label">${idx + 1}/${M.FUSSMASSE.length} · ${esc(m.label)}</span>
              <span class="feld-eingabe">
                <input type="text" inputmode="decimal" id="massWert" value="${esc(M.zahl(wert) === null ? '' : String(M.zahl(wert)).replace('.', ','))}"
                  placeholder="${schaetzung ? '≈ ' + esc(M.fmt(schaetzung)) + ' geschätzt' : 'cm'}" autocomplete="off">
                <span class="feld-einheit">cm</span>
              </span>
            </label>
            <div class="mass-hinweis">${esc(m.hinweis)}</div>
            <div class="mass-warn" id="massWarn" ${warn ? '' : 'hidden'}>⚠ ${esc(warn || '')}</div>
          </div>
          <div class="knopfzeile">
            ${idx > 0 ? `<button class="btn" data-schritt="-1">‹ Zurück</button>` : ''}
            ${naechstes ? `<button class="btn btn--pri" data-schritt="1">Weiter: ${esc(naechstes.kurz)} ›</button>`
              : `<a class="btn btn--pri" href="#/personen/${encodeURIComponent(p.id)}">Fertig ✓</a>`}
          </div>
          <div class="mass-liste">${kacheln}</div>
          <p class="leise klein" style="margin-top:12px">Leer lassen, was du nicht messen kannst — dann wird aus der Schuhgröße geschätzt (kursiv mit ≈). Tippe auf eine Linie in der Zeichnung, um direkt zu diesem Maß zu springen.</p>
        </div>
      </div>`;
  }

  // Liest NICHT aus dem DOM: beim Navigieren ist die Seite schon neu gezeichnet,
  // wenn dieser Aufruf kommt.
  function speichernJetzt(p) {
    clearTimeout(timer);
    timer = null;
    if (ausstehend === null) return;
    const w = M.zahl(ausstehend);
    ausstehend = null;
    p.fuss = p.fuss || {};
    const vorher = M.zahl(p.fuss[aktiv]);
    if (w === null) delete p.fuss[aktiv]; else p.fuss[aktiv] = w;
    if (vorher !== w) MW.store.speichern('personen', p);
  }

  function zeichnen(root, p, fokus) {
    root.querySelector('#messInhalt').innerHTML = inhalt(p);
    const input = root.querySelector('#massWert');
    input.addEventListener('input', () => {
      const warn = M.plausibilitaet(aktiv, input.value, p.schuhgroesse);
      const el = root.querySelector('#massWarn');
      el.hidden = !warn;
      el.textContent = warn ? '⚠ ' + warn : '';
      ausstehend = input.value;
      clearTimeout(timer);
      timer = setTimeout(() => speichernJetzt(p), 600);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); wechseln(root, p, +1); }
    });
    if (fokus) input.focus();
  }

  function wechseln(root, p, schritt, key) {
    speichernJetzt(p);
    const idx = M.FUSSMASSE.findIndex(m => m.key === aktiv);
    if (key) aktiv = key;
    else {
      const neu = M.FUSSMASSE[idx + schritt];
      if (!neu) { MW.gehe(`/personen/${p.id}`); return; }
      aktiv = neu.key;
    }
    zeichnen(root, p, true);
  }

  MW.views.messen = {
    bereich: 'personen',
    live: false,
    titel: () => 'Füße messen',
    render({ id }) {
      const p = MW.store.hole('personen', id);
      if (!p) return MW.ui.leer('Person nicht gefunden', '', '<a class="btn" href="#/personen">Zur Liste</a>');
      const offen = M.FUSSMASSE.find(m => M.zahl(p.fuss && p.fuss[m.key]) === null);
      aktiv = (MW.query().mass) || (offen ? offen.key : M.FUSSMASSE[0].key);
      ausstehend = null;
      return `
        <div class="seiten-kopf">
          <a class="zurueck" href="#/personen/${encodeURIComponent(p.id)}" aria-label="Zurück">‹</a>
          <h1>${esc(genitiv(p.name))} Füße messen</h1>
        </div>
        <div id="messInhalt"></div>`;
    },
    nachRender(root, { id }) {
      const p = MW.store.hole('personen', id);
      if (!p) return;
      zeichnen(root, p, window.matchMedia('(min-width: 900px)').matches);
      root.addEventListener('click', (e) => {
        const ziel = e.target.closest('[data-mass]');
        if (ziel) return wechseln(root, p, 0, ziel.dataset.mass);
        const s = e.target.closest('[data-schritt]');
        if (s) return wechseln(root, p, +s.dataset.schritt);
        if (e.target.closest('a[href]')) speichernJetzt(p);
      });
      // Beim Verlassen der Seite (Zurück-Pfeil, Navigation) nichts verlieren.
      window.addEventListener('hashchange', () => speichernJetzt(p), { once: true });
    },
  };
})();
