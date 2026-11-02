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
          <div class="karte" id="vorlagen">
            <h2>Einstellungs-Vorlagen</h2>
            <p class="leise klein">Diese Texte erscheinen im Strickmodus in der Checkliste vor jedem Abschnitt. Mit ⚑ markierte Stellen sind Platzhalter — hier die genauen Hebelnamen aus den Anleitungen von KH-588 und KR-586 eintragen. Änderungen gelten sofort, auch für laufende Projekte.</p>
            ${Object.entries(s.einstellungsVorlagen || {}).map(([k, v]) => `
              <details class="vorlage" data-vorlage="${esc(k)}">
                <summary><b>${esc(v.name)}</b>${/⚑/.test(Object.values(v).join(' ')) ? ' <span class="flagge">⚑</span>' : ''}</summary>
                ${feld({ name: `${k}.name`, label: 'Name', wert: v.name })}
                ${feld({ name: `${k}.hauptschlitten`, label: 'Hauptschlitten', wert: v.hauptschlitten })}
                ${feld({ name: `${k}.ribber`, label: 'Ribber', wert: v.ribber })}
                ${feld({ name: `${k}.gewichte`, label: 'Gewichte', wert: v.gewichte })}
                ${feld({ name: `${k}.hinweis`, label: 'Hinweis', wert: v.hinweis })}
              </details>`).join('')}
            <button class="btn btn--pri" data-vorlagen style="margin-top:10px">Vorlagen speichern</button>
            <h2 style="margin-top:20px">Verkürzte Reihen</h2>
            <p class="leise klein">So formuliert die Anleitung Ferse und Spitze. Gilt für neu angelegte Projekte.</p>
            ${MW.ui.auswahl({ name: 'abnahme', label: 'Abnahme: Nadel nach E bringen auf der …', wert: s.verkuerzt.abnahme, optionen: [{ wert: 'schlitten', label: 'Seite des Schlittens' }, { wert: 'gegenueber', label: 'Seite gegenüber dem Schlitten' }] })}
            ${MW.ui.auswahl({ name: 'zunahme', label: 'Zunahme: Nadel aus E zurückholen auf der …', wert: s.verkuerzt.zunahme, optionen: [{ wert: 'gegenueber', label: 'Seite gegenüber dem Schlitten' }, { wert: 'schlitten', label: 'Seite des Schlittens' }] })}
            <button class="btn" data-verkuerzt>Speichern</button>
          </div>
          <div class="karte">
            <h2>Rundenzähler (Sensor)</h2>
            <label class="check"><input type="checkbox" name="sensorAktiv" ${s.sensor.aktiv ? 'checked' : ''}> Im Strickmodus auf Sensor-Impulse hören</label>
            <p class="leise klein">Ein Sensor am Bettende meldet je Runde einen Impuls an diese Adresse. Der Strickmodus zählt damit gerade Strecken automatisch mit und hält vor jeder Aktion an.</p>
            <pre class="code">POST ${esc(location.origin)}/api/zaehler</pre>
            <details><summary class="klein">Beispiel für Home Assistant</summary>
<pre class="code">rest_command:
  maschenwerk_runde:
    url: "${esc(location.origin)}/api/zaehler"
    method: POST
    verify_ssl: false

automation:
  - alias: Strickmaschine Runde
    trigger:
      - platform: state
        entity_id: binary_sensor.strickmaschine_kontakt
        to: "on"
    action:
      - service: rest_command.maschenwerk_runde</pre></details>
            <div class="knopfzeile">
              <button class="btn" data-sensor>Speichern</button>
              <button class="btn" data-impuls>Testimpuls senden</button>
            </div>
            <p class="leise klein" id="impulsStand"></p>
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
      root.querySelector('[data-vorlagen]').addEventListener('click', () => {
        const s = MW.store.settings();
        const vorlagen = JSON.parse(JSON.stringify(s.einstellungsVorlagen));
        root.querySelectorAll('[data-vorlage] input[name]').forEach(el => {
          const [k, feldName] = el.name.split('.');
          if (vorlagen[k]) vorlagen[k][feldName] = el.value.trim();
        });
        MW.store.settingsSpeichern({ ...s, einstellungsVorlagen: vorlagen });
        MW.ui.toast('Vorlagen gespeichert', 'ok');
      });
      root.querySelector('[data-verkuerzt]').addEventListener('click', () => {
        const s = MW.store.settings();
        MW.store.settingsSpeichern({ ...s, verkuerzt: { abnahme: root.querySelector('[name=abnahme]').value, zunahme: root.querySelector('[name=zunahme]').value } });
        MW.ui.toast('Gespeichert', 'ok');
      });
      root.querySelector('[data-sensor]').addEventListener('click', () => {
        const s = MW.store.settings();
        MW.store.settingsSpeichern({ ...s, sensor: { ...s.sensor, aktiv: root.querySelector('[name=sensorAktiv]').checked } });
        MW.ui.toast('Gespeichert', 'ok');
      });
      root.querySelector('[data-impuls]').addEventListener('click', async () => {
        try {
          const z = await MW.api.zaehlerImpuls();
          root.querySelector('#impulsStand').textContent = `Impuls angekommen — Zählerstand ${z.stand}.`;
        } catch (e) { MW.ui.toast(e.message, 'fehler'); }
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
