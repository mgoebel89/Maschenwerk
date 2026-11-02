(function () {
  'use strict';
  window.MW = window.MW || {};
  const M = MW.models;

  // Sockenvorlage: rund auf dem Doppelbett (Schlauch).
  //
  // Aus Maßen, Maschenprobe und Form entsteht eine komplette Anleitung:
  // Abschnitte mit Maschineneinstellung und darin die Schritte, die der
  // Strickmodus einzeln zeigt — gerade Strecken als Block, verkürzte Reihen
  // Reihe für Reihe. Die fertige Anleitung wird im Projekt gespeichert
  // (eingefroren); spätere Änderungen an Formeln ändern laufende Projekte nicht.
  //
  // Zählweise des Reihenzählers (RC): jede Schlittenfahrt +1.
  //   Rippe auf dem Doppelbett: 1 Reihe = 1 Fahrt
  //   rund (Schlauch):          1 Runde = 2 Fahrten (Hauptbett hin, Ribber zurück)
  //   verkürzte Reihen:         1 Reihe = 1 Fahrt, nur Hauptbett

  const BUENDCHEN = [
    { wert: '2:2', label: 'Rippe 2:2 (Doppelbett)', rapport: 4, vorlage: 'rippe' },
    { wert: '2:1', label: 'Rippe 2:1 (Doppelbett)', rapport: 3, vorlage: 'rippe' },
    { wert: '1:1', label: 'Rippe 1:1 (Doppelbett)', rapport: 2, vorlage: 'rippe' },
    { wert: 'mock', label: 'Mock-Rib einbettig', rapport: 2, vorlage: 'mock' },
  ];

  // Fersen- und Spitzenformen. `rest`: Anteil der Maschen, der in der Mitte
  // stehen bleibt; `zwischen`: gerade Reihen über die Restmaschen zwischen
  // Ab- und Aufbau (gibt eine etwas tiefere, rundere Ferse).
  const FORMEN = [
    { wert: 'bumerang', label: 'Bumerang (verkürzte Reihen bis ⅓)', rest: 1 / 3, zwischen: 0 },
    { wert: 'bumerang-tief', label: 'Bumerang tief (+ 2 Zwischenreihen)', rest: 1 / 3, zwischen: 2 },
    { wert: 'bumerang-breit', label: 'Bumerang breit (bis ⅖, flacher)', rest: 0.4, zwischen: 0 },
  ];

  // Einstellungs-Vorlagen (Ebene 3). Liegen in den Settings und sind dort
  // bearbeitbar — die Hebelnamen von KH-588/KR-586 stehen hier nur als
  // Platzhalter (⚑) und werden aus der Bedienungsanleitung übernommen.
  const VORLAGEN = {
    rippe: { name: 'Bündchen Rippe (Doppelbett)', hauptschlitten: 'Halte-Hebel auf N', ribber: 'Ribberschloss: strickt mit ⚑', gewichte: 'Kammgewicht', hinweis: '' },
    mock: { name: 'Mock-Rib einbettig', hauptschlitten: 'Halte-Hebel auf N', ribber: 'Ribber außer Arbeit ⚑', gewichte: 'Kammgewicht', hinweis: '' },
    rund: { name: 'Rundstricken', hauptschlitten: 'Halte-Hebel auf N, Rundstrick-Einstellung ⚑', ribber: 'Ribberschloss auf Rundstricken ⚑', gewichte: 'Kammgewicht', hinweis: '1 Runde = 2 Schlittenfahrten' },
    verkuerzt: { name: 'Verkürzte Reihen, Ribber ruht', hauptschlitten: 'Halte-Hebel auf H', ribber: 'Ribber strickt nicht ⚑', gewichte: 'kleine Gewichte unter die Mitte, regelmäßig nachhängen', hinweis: '' },
  };

  // Wie die verkürzten Reihen gestrickt werden — einstellbar, weil die
  // Anleitungen dazu unterschiedlich sind.
  const VERKUERZT_STANDARD = { abnahme: 'schlitten', zunahme: 'gegenueber' };

  const kgv2 = (r) => (r % 2 ? r * 2 : r);
  const gegen = (s) => (s === 'rechts' ? 'links' : 'rechts');
  const rc = (n) => String(Math.max(0, Math.round(n))).padStart(3, '0');

  // Nadelnamen eines Bettes mit n Maschen, mittig: L16 … L1, R1 … R16.
  function bettLabels(n) {
    const l = Math.ceil(n / 2), r = Math.floor(n / 2);
    const a = [];
    for (let i = l; i >= 1; i--) a.push('L' + i);
    for (let i = 1; i <= r; i++) a.push('R' + i);
    return a;
  }

  // Maschenweite „5•" um n Stufen lockerer/fester: nur die Zahl wird verschoben.
  function mwVerschieben(mw, n) {
    const m = String(mw || '').match(/^(\d+)(.*)$/);
    if (!m) return mw || '';
    return Math.max(0, +m[1] + n) + m[2];
  }

  // Vorschlag für das Formular aus Person und Probe.
  function vorschlag(person, probe) {
    const fl = M.fussmass(person, 'fussLaenge').wert;
    const sh = M.fussmass(person, 'schaftHoehe').wert;
    return {
      buendchen: '2:2',
      buendchenCm: 3,
      mwBuendchen: mwVerschieben(probe && probe.maschenweite, -2),
      schaftHoeheCm: sh || 15,
      sockenLaengeCm: fl ? Math.round((fl - 0.5) * 2) / 2 : null,
      weite: M.zahl(person && person.weite) ?? -10,
      ferse: 'bumerang',
      spitze: 'bumerang',
      wadenabnahme: false,
    };
  }

  // Verkürzte Reihen (Ferse oder Spitze) über die Maschen des Hauptbetts.
  // Liefert die Einzelreihen mit Nadelzustand für die Grafik.
  function verkuerzt({ F, form, labels, rcStart, seiteStart, mpc, rpc, methode, name }) {
    const f = FORMEN.find(x => x.wert === form) || FORMEN[0];
    let rest = Math.round(F * f.rest);
    if ((F - rest) % 2) rest += 1;                 // beidseitig gleich viele halten
    rest = Math.max(2, Math.min(F - 2, rest));
    const ab = F - rest;
    const zw = f.zwischen;
    const tiefe = (ab + zw / 2) / rpc;
    const reihen = [];
    let lo = 0, hi = F - 1, seite = seiteStart, nr = 0, r = rcStart;
    const richtung = (s) => (s === 'rechts' ? 'nach links' : 'nach rechts');

    for (let i = 0; i < ab; i++) {
      const aktSeite = methode.abnahme === 'schlitten' ? seite : gegen(seite);
      const idx = aktSeite === 'rechts' ? hi : lo;
      reihen.push({ typ: 'reihe', phase: 'ab', nr: ++nr, von: 2 * ab + zw, seite, rcVor: r, lo, hi, aktiv: idx,
        aktion: `${labels[idx]} nach E`,
        text: `Nadel ${labels[idx]} nach E schieben, Faden unter die Nadel legen, 1 Reihe ${richtung(seite)} stricken.` });
      if (aktSeite === 'rechts') hi--; else lo++;
      seite = gegen(seite); r++;
    }
    for (let i = 0; i < zw; i++) {
      reihen.push({ typ: 'reihe', phase: 'zw', nr: ++nr, von: 2 * ab + zw, seite, rcVor: r, lo, hi, aktiv: null,
        aktion: 'gerade', text: `1 Reihe ${richtung(seite)} über die ${rest} Maschen in der Mitte stricken.` });
      seite = gegen(seite); r++;
    }
    for (let i = 0; i < ab; i++) {
      const aktSeite = methode.zunahme === 'gegenueber' ? gegen(seite) : seite;
      const idx = aktSeite === 'rechts' ? hi + 1 : lo - 1;
      reihen.push({ typ: 'reihe', phase: 'auf', nr: ++nr, von: 2 * ab + zw, seite, rcVor: r, lo, hi, aktiv: idx,
        aktion: `${labels[idx]} zurück nach D`,
        text: `Nadel ${labels[idx]} aus E zurück nach D schieben, 1 Reihe ${richtung(seite)} stricken.` });
      if (aktSeite === 'rechts') hi++; else lo--;
      seite = gegen(seite); r++;
    }
    // Maschen für den Garnbedarf: Summe der gestrickten Maschen aller Reihen.
    const maschen = reihen.reduce((s, x) => s + (x.hi - x.lo + 1) + (x.phase === 'auf' ? 1 : 0), 0);
    return { name, F, rest, ab, zw, tiefe, reihen, rcEnde: r, seiteEnde: seite, maschen, form: f };
  }

  // Hauptfunktion. `e` = { masse, weite, probe:{m10,r10,maschenweite}, form, garn, methode }
  function berechne(e) {
    const warnungen = [];
    const mpc = M.zahl(e.probe.m10) / 10, rpc = M.zahl(e.probe.r10) / 10;
    const f = e.form;
    const b = BUENDCHEN.find(x => x.wert === f.buendchen) || BUENDCHEN[0];
    const rapport = kgv2(b.rapport);
    const weite = M.zahl(f.weite) ?? -10;
    const methode = { ...VERKUERZT_STANDARD, ...(e.methode || {}) };
    const U = M.zahl(e.masse.fussUmfang), L = M.zahl(f.sockenLaengeCm) || M.zahl(e.masse.fussLaenge);
    if (!mpc || !rpc || !U || !L) throw new Error('Es fehlen Maschenprobe, Fußumfang oder Fußlänge.');

    const umfangZiel = U * (1 + weite / 100);
    const M0 = M.rundeAuf(umfangZiel * mpc, rapport);
    const jeBett = M0 / 2;
    const labels = bettLabels(jeBett);
    if (jeBett > 100) warnungen.push('Mehr als 100 Maschen je Bett passen nicht auf die Hälfte des Nadelbetts.');

    // Wadenabnahme: oben mehr Maschen, gleichmäßig auf den Schaft verteilt.
    // Eine Abnahmerunde nimmt je Bett an beiden Rändern 1 Masche ab = 4 Maschen.
    let Moben = M0;
    const wade = M.zahl(e.masse.wadenUmfang);
    if (f.wadenabnahme && wade) {
      Moben = M.rundeAuf(wade * (1 + weite / 100) * mpc, rapport);
      while ((Moben - M0) % 4) Moben -= rapport;
      if (Moben <= M0) { Moben = M0; warnungen.push('Die Wade ist nicht weiter als der Fuß — keine Wadenabnahme nötig.'); }
    }

    // Bündchen: gerade Reihenzahl, damit der Schlitten danach wieder rechts steht.
    const buendchenCm = M.zahl(f.buendchenCm) || 3;
    let bReihen = Math.max(2, Math.round(buendchenCm * rpc * (b.wert === 'mock' ? 2 : 1)));
    if (bReihen % 2) bReihen++;

    const ferseProbe = verkuerzt({ F: jeBett, form: f.ferse, labels, rcStart: 0, seiteStart: 'rechts', mpc, rpc, methode, name: 'Ferse' });
    const spitzeProbe = verkuerzt({ F: jeBett, form: f.spitze, labels, rcStart: 0, seiteStart: 'rechts', mpc, rpc, methode, name: 'Spitze' });

    const schaftHoehe = M.zahl(f.schaftHoeheCm) || 15;
    const schaftCm = schaftHoehe - buendchenCm - ferseProbe.tiefe;
    if (schaftCm < 1) warnungen.push('Der Schaft ist sehr kurz: Bündchen und Ferse brauchen schon fast die ganze Schafthöhe.');
    const schaftRunden = Math.max(0, Math.round(Math.max(0, schaftCm) * rpc));
    const fussCm = L - ferseProbe.tiefe - spitzeProbe.tiefe;
    if (fussCm < 1) warnungen.push('Der Fuß ist kürzer als Ferse und Spitze zusammen — Maße prüfen.');
    const fussRunden = Math.max(0, Math.round(Math.max(0, fussCm) * rpc));

    // --- Abschnitte -------------------------------------------------------
    const abschnitte = [];
    let r = 0;
    const mw = e.probe.maschenweite || '';
    const nadelnOben = M.nadeln(Moben / 2).text;

    abschnitte.push({
      id: 'anschlag', titel: 'Anschlag', vorlage: b.vorlage, mwHaupt: f.mwBuendchen || mw, mwRibber: b.wert === 'mock' ? '' : (f.mwBuendchen || mw),
      nadeln: `${Moben / 2} je Bett: ${nadelnOben}${b.wert === 'mock' ? ' (Hauptbett)' : `, Anordnung ${b.wert}`}`,
      rcVon: 0, rcBis: 0, umfang: `${Moben} M`,
      schritte: [{ typ: 'text', titel: 'Anschlagen', text: b.wert === 'mock'
        ? `${Moben} Maschen für Mock-Rib anschlagen (${nadelnOben}), jede 2. Nadel außer Arbeit, mit Hilfsgarn beginnen. Reihenzähler auf 000.`
        : `Hauptbett und Ribber auf Rippe ${b.wert} anordnen, je Bett ${nadelnOben}. Mit Hilfsgarn anschlagen, dann mit dem Sockengarn weiter. Reihenzähler auf 000. ⚑ Anschlagfolge aus der KR-586-Anleitung.` }],
    });
    abschnitte.push({
      id: 'buendchen', titel: 'Bündchen', vorlage: b.vorlage, mwHaupt: f.mwBuendchen || mw, mwRibber: b.wert === 'mock' ? '' : (f.mwBuendchen || mw),
      nadeln: b.wert === 'mock' ? 'jede 2. Nadel' : `Rippe ${b.wert}`, rcVon: r, rcBis: r + bReihen, umfang: `${bReihen} R`,
      schritte: [{ typ: 'block', einheit: 'Reihen', anzahl: bReihen, proImpuls: 2, rcVon: r, rcBis: r + bReihen,
        text: b.wert === 'mock' ? `${bReihen} Reihen Mock-Rib stricken, danach den Saum hochhängen.` : `${bReihen} Reihen Rippe ${b.wert} stricken.` }],
    });
    r += bReihen;
    abschnitte.push({
      id: 'umhaengen', titel: 'Übergang zum Schlauch', vorlage: 'rund', mwHaupt: mw, mwRibber: mw, nadeln: `alle ${Moben / 2} Nadeln je Bett in B`,
      rcVon: r, rcBis: r, umfang: '–',
      schritte: [{ typ: 'text', titel: 'Umhängen', text: `Maschen so umhängen, dass auf Hauptbett und Ribber jede Nadel von ${nadelnOben} eine Masche trägt. Dann auf Rundstricken umstellen. ⚑ Genaue Schritte aus der KR-586-Anleitung.` }],
    });

    // Schaft, ggf. mit Wadenabnahme
    const schaftSchritte = [];
    if (Moben > M0 && schaftRunden) {
      const v = M.verteilen(Moben, M0, schaftRunden, 4);
      if (v && !v.fehler) {
        let maschen = Moben, rr = r;
        for (const s of v.schritte) {
          for (let k = 0; k < s.anzahl; k++) {
            maschen -= 4;
            schaftSchritte.push({ typ: 'text', titel: 'Abnahmerunde', abnahme: true,
              text: `Je Bett an beiden Rändern 1 Masche abnehmen (Randmasche auf die Nachbarnadel decken). Danach ${maschen} Maschen, ${maschen / 2} je Bett: ${M.nadeln(maschen / 2).text}.` });
            schaftSchritte.push({ typ: 'block', einheit: 'Runden', anzahl: s.alle, proImpuls: 1, rcVon: rr, rcBis: rr + s.alle * 2, text: `${s.alle} Runden rund stricken.` });
            rr += s.alle * 2;
          }
        }
      } else {
        warnungen.push((v && v.fehler) || 'Die Wadenabnahme passt nicht in den Schaft.');
      }
    }
    if (!schaftSchritte.length && schaftRunden) {
      schaftSchritte.push({ typ: 'block', einheit: 'Runden', anzahl: schaftRunden, proImpuls: 1, rcVon: r, rcBis: r + schaftRunden * 2, text: `${schaftRunden} Runden rund stricken.` });
    }
    abschnitte.push({ id: 'schaft', titel: 'Schaft', vorlage: 'rund', mwHaupt: mw, mwRibber: mw, nadeln: Moben > M0 ? `${Moben} → ${M0} M` : `${jeBett} je Bett: ${labels[0]} – ${labels[labels.length - 1]}`,
      rcVon: r, rcBis: r + schaftRunden * 2, umfang: `${schaftRunden} Rd`, schritte: schaftSchritte });
    r += schaftRunden * 2;

    const ferse = verkuerzt({ F: jeBett, form: f.ferse, labels, rcStart: r, seiteStart: 'rechts', mpc, rpc, methode, name: 'Ferse' });
    abschnitte.push({ id: 'ferse', titel: 'Ferse', vorlage: 'verkuerzt', mwHaupt: mw, mwRibber: '', nadeln: `Hauptbett ${labels[0]} – ${labels[labels.length - 1]}, Ribber ruht`,
      rcVon: r, rcBis: ferse.rcEnde, umfang: `${ferse.reihen.length} R`, verkuerzt: { F: jeBett, rest: ferse.rest, ab: ferse.ab, zw: ferse.zw },
      schritte: [
        { typ: 'text', titel: 'Ferse vorbereiten', text: `Ribber stillsetzen, Halte-Hebel auf H. Die Ferse wird nur auf dem Hauptbett gestrickt: verkürzte Reihen von ${jeBett} bis auf ${ferse.rest} Maschen und wieder zurück. Der Schlitten steht rechts.` },
        ...ferse.reihen,
        { typ: 'text', titel: 'Ferse fertig', text: 'Halte-Hebel zurück auf N, Ribber wieder auf Rundstricken. Alle Nadeln beider Betten in Arbeit.' },
      ] });
    r = ferse.rcEnde;

    abschnitte.push({ id: 'fuss', titel: 'Fuß', vorlage: 'rund', mwHaupt: mw, mwRibber: mw, nadeln: `${jeBett} je Bett`,
      rcVon: r, rcBis: r + fussRunden * 2, umfang: `${fussRunden} Rd`,
      schritte: [{ typ: 'block', einheit: 'Runden', anzahl: fussRunden, proImpuls: 1, rcVon: r, rcBis: r + fussRunden * 2, text: `${fussRunden} Runden rund stricken.` }] });
    r += fussRunden * 2;

    const spitze = verkuerzt({ F: jeBett, form: f.spitze, labels, rcStart: r, seiteStart: 'rechts', mpc, rpc, methode, name: 'Spitze' });
    abschnitte.push({ id: 'spitze', titel: 'Spitze', vorlage: 'verkuerzt', mwHaupt: mw, mwRibber: '', nadeln: `Hauptbett ${labels[0]} – ${labels[labels.length - 1]}, Ribber ruht`,
      rcVon: r, rcBis: spitze.rcEnde, umfang: `${spitze.reihen.length} R`, verkuerzt: { F: jeBett, rest: spitze.rest, ab: spitze.ab, zw: spitze.zw },
      schritte: [
        { typ: 'text', titel: 'Spitze vorbereiten', text: `Wie bei der Ferse: Ribber stillsetzen, Halte-Hebel auf H, verkürzte Reihen von ${jeBett} bis auf ${spitze.rest} Maschen und zurück.` },
        ...spitze.reihen,
      ] });
    r = spitze.rcEnde;

    abschnitte.push({ id: 'schluss', titel: 'Abnehmen und Maschenstich', vorlage: 'rund', mwHaupt: mw, mwRibber: mw, nadeln: `${jeBett} je Bett`,
      rcVon: r, rcBis: r, umfang: '–',
      schritte: [
        { typ: 'text', titel: 'Hilfsgarn', text: 'Halte-Hebel auf N. 6–8 Runden mit Hilfsgarn rund stricken und die Socke von der Maschine nehmen.' },
        { typ: 'text', titel: 'Maschenstich', text: `Die ${jeBett} offenen Maschen der Oberseite gegen die ${jeBett} der Sohle legen. Mit der Wollnadel: vorne wie zum Rechtsstricken einstechen und abgleiten lassen, die nächste vordere wie zum Linksstricken einstechen; hinten wie zum Linksstricken einstechen und abgleiten lassen, die nächste hintere wie zum Rechtsstricken einstechen. Hilfsgarn nach und nach ausziehen.` },
      ] });

    // --- Garnbedarf (Schätzung) ------------------------------------------
    // Fadenlänge je Masche ≈ 2,3 × (Maschenbreite + Maschenhöhe); für
    // Sockengarn 4-fach Gr. 39 ergibt das rund 200 m je Socke.
    const maschenGesamt = Moben * bReihen * (b.wert === 'mock' ? 0.5 : 1)
      + ((Moben + M0) / 2) * schaftRunden
      + ferse.maschen + M0 * fussRunden + spitze.maschen;
    const proMasche = 2.3 * (1 / mpc + 1 / rpc);
    const garnM = maschenGesamt * proMasche / 100;
    const lauf = M.zahl(e.garn && e.garn.lauflaengeM), gew = M.zahl(e.garn && e.garn.gewichtG);
    const garnG = lauf && gew ? garnM / lauf * gew : null;

    return {
      version: 1,
      werte: {
        maschen: M0, jeBett, maschenOben: Moben, umfangZiel, mpc, rpc, weite,
        buendchen: b.wert, buendchenReihen: bReihen, buendchenCm,
        schaftRunden, schaftCm, fussRunden, fussCm, sockenLaengeCm: L,
        ferse: { rest: ferse.rest, ab: ferse.ab, zw: ferse.zw, tiefe: ferse.tiefe, reihen: ferse.reihen.length, form: f.ferse },
        spitze: { rest: spitze.rest, ab: spitze.ab, zw: spitze.zw, tiefe: spitze.tiefe, reihen: spitze.reihen.length, form: f.spitze },
        rcGesamt: r, garnM, garnG,
      },
      bett: { labels },
      abschnitte,
      warnungen,
    };
  }

  // Alle Schritte eines Paars in Strickreihenfolge: vor jedem Abschnitt eine
  // Checkliste, nach Socke 1 ein Zwischenschritt. Der Strickmodus blättert
  // durch genau diese Liste; der Fortschritt ist der Index darin.
  function karten(anleitung, paare = 1) {
    const liste = [];
    const socken = Math.max(1, paare) * 2;
    for (let s = 1; s <= socken; s++) {
      for (const a of anleitung.abschnitte) {
        liste.push({ typ: 'einstellen', socke: s, abschnitt: a.id });
        a.schritte.forEach((x, i) => liste.push({ ...x, socke: s, abschnitt: a.id, schrittIndex: i }));
      }
      liste.push(s < socken
        ? { typ: 'zwischen', socke: s, text: `Socke ${s} ist fertig. Reihenzähler auf 000 stellen und Socke ${s + 1} beginnen.` }
        : { typ: 'fertig', socke: s, text: 'Alle Socken sind fertig.' });
    }
    return liste;
  }

  MW.socke = { BUENDCHEN, FORMEN, VORLAGEN, VERKUERZT_STANDARD, bettLabels, mwVerschieben, vorschlag, berechne, karten, rc };
})();
