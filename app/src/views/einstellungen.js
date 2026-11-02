(function () {
  'use strict';
  window.MW = window.MW || {};
  MW.views = MW.views || {};
  const { esc, feld } = MW.ui;
  const M = MW.models;

  // Einstellungen: Vorgaben, Datensicherung, Update auf Knopfdruck.

  let pollTimer = null;

  function zeit(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  function updateHtml(s) {
    if (!s.eingerichtet) {
      return `<p class="leise">Version <b>${esc(s.version)}</b>. Das Update auf Knopfdruck gibt es nur im Container.
        Dort geht es auch in der Konsole mit <code>update</code>.</p>`;
    }
    const pr = s.pruefung || {};
    const neu = pr.neu || 0;
    const lauf = s.lauf || {};
    let status;
    if (s.laeuft || s.wartet.ausfuehren) status = '<span class="chip chip--warn">Update läuft …</span>';
    else if (pr.fehler) status = `<span class="chip chip--warn">Prüfung fehlgeschlagen</span>`;
    else if (neu) status = `<span class="chip chip--akz">${neu} Änderung${neu === 1 ? '' : 'en'} verfügbar${pr.verfuegbar && pr.verfuegbar.version ? ' · Version ' + esc(pr.verfuegbar.version) : ''}</span>`;
    else if (pr.zeit) status = '<span class="chip chip--ok">aktuell</span>';
    else status = '<span class="chip chip--grau">noch nicht geprüft</span>';
    return `
      <p>Installiert: <b>Version ${esc(s.version)}</b>${pr.installiert && pr.installiert.stand ? ` (${esc(pr.installiert.stand)})` : ''} · ${status}</p>
      <p class="leise klein">Zuletzt geprüft: ${zeit(pr.zeit)}${lauf.ende ? ` · letztes Update: ${zeit(lauf.ende)} (${lauf.ergebnis === 'ok' ? 'erfolgreich' : 'mit Fehler'})` : ''}</p>
      ${pr.fehler ? `<div class="hinweis hinweis--warn">${esc(pr.fehler)}</div>` : ''}
      ${neu && pr.aenderungen ? `<ul class="klein">${pr.aenderungen.slice(0, 10).map(a => `<li>${esc(a.text)}</li>`).join('')}</ul>` : ''}
      <div class="knopfzeile">
        <button class="btn" data-update="pruefen" ${s.laeuft || s.wartet.pruefen ? 'disabled' : ''}>Nach Update suchen</button>
        <button class="btn btn--pri" data-update="ausfuehren" ${!neu || s.laeuft || s.wartet.ausfuehren ? 'disabled' : ''}>Jetzt aktualisieren</button>
      </div>
      ${s.protokoll ? `<details style="margin-top:10px"><summary class="klein">Protokoll des letzten Updates</summary><pre class="klein" style="white-space:pre-wrap;max-height:260px;overflow:auto">${esc(s.protokoll)}</pre></details>` : ''}
      <p class="leise klein">Vor jedem Update wird automatisch eine Sicherung der Datenbank angelegt.</p>`;
  }

  async function updateLaden(root) {
    clearTimeout(pollTimer);
    const ziel = root.querySelector('#update');
    if (!ziel) return;
    try {
      const s = await MW.api.system();
      if (!document.body.contains(ziel)) return;
      ziel.innerHTML = updateHtml(s);
      // Während ein Update oder eine Prüfung läuft, alle 3 s nachsehen.
      if (s.laeuft || s.wartet.ausfuehren || s.wartet.pruefen) pollTimer = setTimeout(() => updateLaden(root), 3000);
      else if (ziel.dataset.lief === '1') { ziel.dataset.lief = ''; MW.ui.toast('Update fertig — Seite wird neu geladen', 'ok'); setTimeout(() => location.reload(), 1500); }
      if (s.laeuft || s.wartet.ausfuehren) ziel.dataset.lief = '1';
    } catch (e) {
      // Während des Updates startet der Dienst neu — dann einfach weiter warten.
      if (ziel.dataset.lief === '1') pollTimer = setTimeout(() => updateLaden(root), 3000);
      else ziel.innerHTML = `<p class="leise">Update-Stand nicht abrufbar: ${esc(e.message)}</p>`;
    }
  }

  async function exportieren() {
    try {
      const daten = await MW.api.exportieren();
      const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `maschenwerk-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { MW.ui.toast('Export fehlgeschlagen: ' + e.message, 'fehler'); }
  }

  async function importieren(datei) {
    let daten;
    try { daten = JSON.parse(await datei.text()); } catch (_) { MW.ui.toast('Die Datei ist kein gültiges JSON.', 'fehler'); return; }
    if (!daten || daten.app !== 'maschenwerk') { MW.ui.toast('Das ist keine Maschenwerk-Sicherung.', 'fehler'); return; }
    const d = daten.daten || {};
    const zahlen = MW.store.TABELLEN.map(t => `${(d[t] || []).length} ${t}`).join(', ');
    const ok = await MW.ui.bestaetigen('Sicherung einspielen?',
      `Alle jetzigen Daten werden durch die Sicherung vom ${zeit(daten.exportiertAm)} ersetzt (${zahlen}).`, 'Ersetzen');
    if (!ok) return;
    try {
      await MW.api.importieren(daten);
      await MW.store.laden();
      MW.ui.toast('Sicherung eingespielt', 'ok');
    } catch (e) { MW.ui.toast('Import fehlgeschlagen: ' + e.message, 'fehler'); }
  }

  MW.views.einstellungen = {
    bereich: 'einstellungen',
    live: false,
    titel: () => 'Einstellungen',
    render() {
      const s = MW.store.settings();
      return `
        <div class="seiten-kopf"><h1>Einstellungen</h1></div>
        <div class="raster" style="align-items:start">
          <div class="karte">
            <h2>Vorgaben</h2>
            ${feld({ name: 'weiteSocken', label: 'Weite für neue Personen', wert: s.weiteSocken, typ: 'zahl', einheit: '%', hinweis: 'Negative Weite: Socken sitzen enger als der Fuß. Üblich sind −8 bis −12 %.' })}
            <button class="btn btn--pri" data-vorgaben>Speichern</button>
            <h2 style="margin-top:20px">Maschine</h2>
            <table class="tabelle">
              <tr><td>Strickmaschine</td><td>${esc(M.MASCHINE.name)}</td></tr>
              <tr><td>Doppelbett</td><td>${esc(M.MASCHINE.ribber)}</td></tr>
              <tr><td>Nadeln</td><td>je Seite 1–${M.MASCHINE.nadelnJeSeite} (L/R)</td></tr>
            </table>
          </div>
          <div class="karte">
            <h2>Datensicherung</h2>
            <p class="leise klein">Der Container sichert jede Nacht die Datenbank. Zusätzlich kannst du hier alles als Datei herunterladen und wieder einspielen.</p>
            <div class="knopfzeile">
              <button class="btn" data-export>Sicherung herunterladen</button>
              <label class="btn">Sicherung einspielen<input type="file" accept="application/json,.json" data-import hidden></label>
            </div>
          </div>
          <div class="karte">
            <h2>Update</h2>
            <div id="update"><p class="leise">Lade …</p></div>
          </div>
        </div>`;
    },
    nachRender(root) {
      root.querySelector('[data-vorgaben]').addEventListener('click', () => {
        const w = MW.ui.formWerte(root);
        MW.store.settingsSpeichern({ ...MW.store.settings(), weiteSocken: M.zahl(w.weiteSocken) ?? -10 });
        MW.ui.toast('Gespeichert', 'ok');
      });
      root.querySelector('[data-export]').addEventListener('click', exportieren);
      root.querySelector('[data-import]').addEventListener('change', (e) => {
        if (e.target.files[0]) importieren(e.target.files[0]);
        e.target.value = '';
      });
      root.querySelector('#update').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-update]');
        if (!b) return;
        b.disabled = true;
        try {
          await MW.api.updateAnfordern(b.dataset.update);
          if (b.dataset.update === 'ausfuehren') root.querySelector('#update').dataset.lief = '1';
          updateLaden(root);
        } catch (err) { MW.ui.toast(err.message, 'fehler'); b.disabled = false; }
      });
      updateLaden(root);
    },
  };
})();
