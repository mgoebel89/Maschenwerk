(function () {
  'use strict';
  window.MW = window.MW || {};

  // Bausteine der Oberfläche: Escaping, Toast, Modal, Formularfelder.

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function toast(text, art) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.className = 'toast' + (art ? ' toast--' + art : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, art === 'fehler' ? 6000 : 2500);
  }

  // Modal: am Handy Vollbild, am PC zentriert. `inhalt` ist HTML, `nachRender`
  // bekommt das Modal-Element zum Verdrahten. Rückgabe: { el, schliessen }.
  function modal({ titel, inhalt, aktionen = [], nachRender, breit }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal${breit ? ' modal--breit' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titel)}">
        <header class="modal-kopf">
          <button class="icon-btn" data-schliessen aria-label="Schließen">✕</button>
          <h2>${esc(titel)}</h2>
        </header>
        <div class="modal-inhalt">${inhalt}</div>
        <footer class="modal-fuss">
          ${aktionen.map((a, i) => `<button class="btn ${a.art ? 'btn--' + a.art : ''}" data-aktion="${i}">${esc(a.label)}</button>`).join('')}
        </footer>
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('modal-offen');
    const el = wrap.querySelector('.modal');
    function schliessen() {
      wrap.remove();
      if (!document.querySelector('.modal-wrap')) document.body.classList.remove('modal-offen');
      document.removeEventListener('keydown', taste);
    }
    function taste(e) { if (e.key === 'Escape') schliessen(); }
    document.addEventListener('keydown', taste);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-schliessen]')) return schliessen();
      const b = e.target.closest('[data-aktion]');
      if (b) {
        const a = aktionen[+b.dataset.aktion];
        if (a && a.klick) { if (a.klick(el) !== false) schliessen(); } else schliessen();
      }
    });
    if (nachRender) nachRender(el);
    const erstes = el.querySelector('input:not([type=hidden]), select, textarea');
    if (erstes && window.matchMedia('(min-width: 900px)').matches) erstes.focus();
    return { el, schliessen };
  }

  function bestaetigen(titel, text, ja = 'Löschen') {
    return new Promise((resolve) => {
      modal({
        titel,
        inhalt: `<p>${esc(text)}</p>`,
        aktionen: [
          { label: 'Abbrechen', klick: () => resolve(false) },
          { label: ja, art: 'gefahr', klick: () => resolve(true) },
        ],
      });
    });
  }

  // --- Formularfelder ---------------------------------------------------
  // Zahlen als Textfeld mit inputmode=decimal: so gibt es am Handy die
  // Zifferntastatur UND das Komma wird akzeptiert (type=number lehnt es teils ab).
  function feld({ name, label, wert, typ = 'text', einheit, hinweis, platzhalter, pflicht, klasse = '', attrs = '' }) {
    let v = wert === null || wert === undefined ? '' : wert;
    if (typ === 'zahl') { const z = MW.models.zahl(wert); v = z === null ? '' : String(z).replace('.', ','); }
    const inputTyp = typ === 'zahl' ? 'text" inputmode="decimal' : typ;
    return `
      <label class="feld ${klasse}">
        <span class="feld-label">${esc(label)}${pflicht ? ' *' : ''}</span>
        <span class="feld-eingabe">
          <input type="${inputTyp}" name="${esc(name)}" value="${esc(v)}" ${platzhalter ? `placeholder="${esc(platzhalter)}"` : ''} ${pflicht ? 'required' : ''} ${attrs}>
          ${einheit ? `<span class="feld-einheit">${esc(einheit)}</span>` : ''}
        </span>
        ${hinweis ? `<span class="feld-hinweis">${esc(hinweis)}</span>` : ''}
      </label>`;
  }

  function textfeld({ name, label, wert }) {
    return `
      <label class="feld">
        <span class="feld-label">${esc(label)}</span>
        <textarea name="${esc(name)}" rows="3">${esc(wert || '')}</textarea>
      </label>`;
  }

  function auswahl({ name, label, wert, optionen }) {
    return `
      <label class="feld">
        <span class="feld-label">${esc(label)}</span>
        <select name="${esc(name)}">
          ${optionen.map(o => `<option value="${esc(o.wert)}" ${String(o.wert) === String(wert) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
      </label>`;
  }

  // Segmentschalter: <div class="seg" data-name="art"> mit Buttons data-wert.
  function seg(name, wert, optionen) {
    return `<div class="seg" data-seg="${esc(name)}">${optionen.map(o =>
      `<button type="button" data-wert="${esc(o.wert)}" class="${String(o.wert) === String(wert) ? 'an' : ''}">${esc(o.label)}</button>`).join('')}</div>`;
  }
  // Verdrahtet alle Segmentschalter in `root`; ruft bei Wechsel `beiWechsel(name, wert)`.
  function segVerdrahten(root, beiWechsel) {
    root.querySelectorAll('[data-seg]').forEach(s => {
      s.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-wert]');
        if (!b) return;
        s.querySelectorAll('button').forEach(x => x.classList.toggle('an', x === b));
        beiWechsel(s.dataset.seg, b.dataset.wert);
      });
    });
  }
  function segWert(root, name) {
    const b = root.querySelector(`[data-seg="${name}"] button.an`);
    return b ? b.dataset.wert : null;
  }

  // Liest alle benannten Felder eines Containers als Objekt (Rohtext).
  function formWerte(root) {
    const o = {};
    root.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    root.querySelectorAll('[data-seg]').forEach(s => { o[s.dataset.seg] = segWert(root, s.dataset.seg); });
    return o;
  }

  function leer(titel, text, knopf) {
    return `<div class="leer"><div class="leer-titel">${esc(titel)}</div><p>${esc(text)}</p>${knopf || ''}</div>`;
  }

  function initialen(name) {
    return String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  MW.ui = { esc, toast, modal, bestaetigen, feld, textfeld, auswahl, seg, segVerdrahten, segWert, formWerte, leer, initialen };
})();
