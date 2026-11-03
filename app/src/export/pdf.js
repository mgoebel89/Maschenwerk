(function () {
  'use strict';
  window.MW = window.MW || {};
  const M = MW.models;
  const S = MW.socke;

  // PDF-Anleitungen mit jsPDF (vendor/jspdf.inline.js). Grundgerüst wie in der
  // ImkereiApp: ein Dokument mit Cursor `y`, Seitenumbruch automatisch.
  //
  // Helvetica kann nur WinAnsi — Zeichen wie ≈ → − ⚑ würden als Müll gedruckt
  // und werden deshalb vor JEDER Ausgabe ersetzt (rein()).

  const MM = { links: 15, rechts: 15, oben: 16, unten: 16 };
  const PRI = [35, 96, 110], AKZ = [194, 85, 58], GRAU = [95, 102, 112];

  function rein(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/≈\s?/g, 'ca. ').replace(/→/g, '->').replace(/−/g, '-').replace(/⚑/g, '(!)')
      .replace(/⅓/g, '1/3').replace(/⅖/g, '2/5').replace(/[▶◀✓🎉📡☀]/gu, '').replace(/’/g, "'");
  }

  function neuesDokument() {
    const ns = window.jspdf || window.jsPDF;
    const Ctor = (ns && ns.jsPDF) || window.jsPDF;
    if (!Ctor) throw new Error('jsPDF nicht geladen (vendor/jspdf.inline.js fehlt?).');
    const doc = new Ctor({ unit: 'mm', format: 'a4' });
    const breite = doc.internal.pageSize.getWidth(), hoehe = doc.internal.pageSize.getHeight();
    return {
      doc, breite, hoehe, links: MM.links, rechts: breite - MM.rechts, nutzbreite: breite - MM.links - MM.rechts, y: MM.oben,
      platz(mm) {
        if (this.y + mm > hoehe - MM.unten) { doc.addPage(); this.y = MM.oben; return true; }
        return false;
      },
      text(txt, opt = {}) {
        const size = opt.size || 10;
        doc.setFont('helvetica', opt.stil || 'normal');
        doc.setFontSize(size);
        doc.setTextColor(...(opt.farbe || [20, 20, 20]));
        const zh = size * 0.42 + 1.2;
        for (const z of doc.splitTextToSize(rein(txt), opt.breite || this.nutzbreite)) {
          this.platz(zh + 1);
          doc.text(z, opt.x !== undefined ? opt.x : this.links, this.y);
          this.y += zh;
        }
        return this;
      },
      ueberschrift(txt, size = 12.5) {
        this.platz(16);
        this.y += 3;
        this.text(txt, { size, stil: 'bold', farbe: PRI });
        this.y += 1;
      },
      merkmale(paare) {
        const sp = this.nutzbreite / 2;
        const g = paare.filter(p => p && p[1] !== null && p[1] !== undefined && p[1] !== '');
        for (let i = 0; i < g.length; i += 2) {
          this.platz(6);
          for (let s = 0; s < 2 && g[i + s]; s++) {
            const [l, w] = g[i + s];
            const x = this.links + s * sp;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...GRAU);
            doc.text(rein(l) + ':', x, this.y);
            const lb = doc.getTextWidth(rein(l) + ': ');
            doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
            doc.text(doc.splitTextToSize(rein(w), sp - lb - 3)[0] || '', x + lb, this.y);
          }
          this.y += 5;
        }
      },
      tabelle(kopf, zeilen, prozent, opt = {}) {
        const b = prozent.map(p => this.nutzbreite * p / 100);
        const kopfZ = () => {
          this.platz(8);
          doc.setFillColor(227, 239, 241);
          doc.rect(this.links, this.y - 3.8, this.nutzbreite, 5.6, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...PRI);
          let x = this.links + 1;
          kopf.forEach((h, i) => { doc.text(rein(h), x, this.y); x += b[i]; });
          this.y += 5.6;
        };
        kopfZ();
        for (const z of zeilen) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
          const teile = z.map((c, i) => (opt.kaestchen && opt.kaestchen.includes(i)) ? [''] : doc.splitTextToSize(rein(c), b[i] - 2));
          const h = Math.max(...teile.map(t => t.length), 1) * 3.7 + 2.2;
          const neueSeite = this.platz(h);
          if (neueSeite) kopfZ();
          // Trennlinie ÜBER der Zeile, nicht darunter — sonst läuft sie durch die Kästchen der nächsten.
          else if (z !== zeilen[0]) { doc.setDrawColor(220); doc.setLineWidth(0.2); doc.line(this.links, this.y - 4.2, this.rechts, this.y - 4.2); }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
          let x = this.links + 1;
          teile.forEach((t, i) => {
            if (opt.kaestchen && opt.kaestchen.includes(i)) {
              doc.setDrawColor(120); doc.setLineWidth(0.3); doc.rect(x + 1, this.y - 3, 3.4, 3.4);
            } else t.forEach((zz, k) => doc.text(zz, x, this.y + k * 3.7));
            x += b[i];
          });
          this.y += h;
        }
      },
    };
  }

  // Sockenumriss wie in der App (SVG-Pfad, Kurven als Polygon angenähert).
  function skizze(ctx, w, x0, y0, k) {
    const q = (p0, c, p1, n = 8) => Array.from({ length: n }, (_, i) => {
      const t = (i + 1) / n;
      return [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];
    });
    const pts = [[60, 8], [110, 8], [110, 78], ...q([110, 78], [110, 96], [128, 100]), [170, 106],
      ...q([170, 106], [192, 110], [192, 130]), ...q([192, 130], [192, 144], [170, 144]), [84, 144],
      ...q([84, 144], [54, 144], [54, 116]), [54, 78]];
    const d = pts.slice(1).map((p, i) => [(p[0] - pts[i][0]) * k, (p[1] - pts[i][1]) * k]);
    const doc = ctx.doc;
    doc.setDrawColor(...PRI); doc.setFillColor(227, 239, 241); doc.setLineWidth(0.4);
    doc.lines(d, x0 + pts[0][0] * k, y0 + pts[0][1] * k, [1, 1], 'FD', true);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAU);
    const t = (s, x, y, akz) => { doc.setTextColor(...(akz ? AKZ : GRAU)); doc.text(rein(s), x0 + x * k, y0 + y * k); };
    t(`Bündchen ${w.buendchenReihen} R`, 116, 20);
    t(`Schaft ${w.schaftRunden} Rd`, 116, 56);
    t(`Ferse ${w.ferse.reihen} R`, 10, 158, true);
    t(`Fuß ${w.fussRunden} Rd`, 100, 158);
    t(`Spitze ${w.spitze.kurz || w.spitze.reihen + ' R'}`, 196, 112, true);
  }

  function reihenfolge(abschnitt) {
    const r = abschnitt.schritte.filter(s => s.typ === 'reihe');
    const ab = r.filter(s => s.phase === 'ab'), zw = r.filter(s => s.phase === 'zw'), auf = r.filter(s => s.phase === 'auf');
    const nadel = (s) => s.aktion.split(' ')[0];
    const teile = [];
    if (ab.length) teile.push(`Abnahme, Reihe 1-${ab.length} (RC ${S.rc(ab[0].rcVor)}-${S.rc(ab[ab.length - 1].rcVor + 1)}): je Reihe diese Nadel nach E, Faden unterlegen: ${ab.map(nadel).join(', ')}.`);
    if (zw.length) teile.push(`Dann ${zw.length} Reihen gerade über die Restmaschen.`);
    if (auf.length) teile.push(`Zunahme, Reihe ${ab.length + zw.length + 1}-${r.length} (RC ${S.rc(auf[0].rcVor)}-${S.rc(auf[auf.length - 1].rcVor + 1)}): je Reihe diese Nadel aus E zurück nach D: ${auf.map(nadel).join(', ')}.`);
    return teile;
  }

  function ausgeben(ctx, dateiname) {
    const n = ctx.doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      ctx.doc.setPage(i);
      ctx.doc.setFont('helvetica', 'normal'); ctx.doc.setFontSize(8); ctx.doc.setTextColor(140, 140, 140);
      ctx.doc.text(`Seite ${i} von ${n}`, ctx.breite / 2, ctx.hoehe - 8, { align: 'center' });
      ctx.doc.text(rein(`Maschenwerk · ${new Date().toLocaleDateString('de-DE')}`), ctx.rechts, ctx.hoehe - 8, { align: 'right' });
    }
    const blob = ctx.doc.output('blob');
    const url = URL.createObjectURL(blob);
    // Neuer Tab zum Ansehen/Drucken; blockt das Handy (Popup-Sperre, App-Modus),
    // wird stattdessen heruntergeladen.
    const w = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = url; a.download = dateiname;
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function socken(p) {
    try {
      const ctx = neuesDokument();
      const doc = ctx.doc;
      const w = p.anleitung.werte;
      const e = p.eingaben;
      const socken = (p.paare || 1) * 2;

      // Kopf
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...PRI);
      doc.text(rein(p.name), ctx.links, ctx.y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU);
      doc.text(rein(`${M.MASCHINE.name} mit ${M.MASCHINE.ribber} · rund auf dem Doppelbett`), ctx.rechts, ctx.y, { align: 'right' });
      ctx.y += 4;
      doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ctx.links, ctx.y, ctx.rechts, ctx.y);
      ctx.y += 6;

      // Skizze rechts, Werte links
      const yStart = ctx.y;
      skizze(ctx, w, ctx.rechts - 62, yStart - 2, 0.27);
      const gew = w.garnG ? ` · ca. ${M.fmt(w.garnG * 2, 0)} g` : '';
      const zeilen = [
        ['Für', `${p.personName}${e.geschaetzt.length ? ' (teils geschätzte Maße)' : ''}`],
        ['Garn', p.garnName || '-'],
        ['Maschenprobe', `${M.fmt(e.probe.m10)} M / ${M.fmt(e.probe.r10)} ${e.probe.art === 'rund' ? 'Rd' : 'R'} auf 10 cm, MW ${e.probe.maschenweite || '-'}, ${e.probe.art}`],
        ['Maschen', `${w.maschenOben > w.maschen ? w.maschenOben + ' -> ' : ''}${w.maschen} rundherum, ${w.jeBett} je Bett (${M.nadeln(w.jeBett).text})`],
        ['Fußumfang / Weite', `${M.fmt(e.masse.fussUmfang)} cm, ${M.fmt(w.weite)} % -> ${M.fmt(w.umfangZiel)} cm`],
        ['Sockenlänge', `${M.fmt(w.sockenLaengeCm)} cm`],
        ['Schafthöhe', `${M.fmt(e.form.schaftHoeheCm)} cm`],
        ['Ferse', `${(S.FORMEN.find(f => f.wert === w.ferse.form) || {}).label}, ${w.jeBett} -> ${w.ferse.rest} -> ${w.jeBett} M`],
        ['Spitze', w.spitze.art === 'band'
          ? `Bandspitze, ${w.maschen} -> ${w.spitze.restGesamt} M in ${w.spitze.runden} Runden (${w.spitze.abnahmen} Abnahmen)`
          : `${(S.FORMEN.find(f => f.wert === w.spitze.form) || {}).label}, ${w.jeBett} -> ${w.spitze.rest} -> ${w.jeBett} M`],
        ['Reihenzähler', `RC ${S.rc(w.rcGesamt)} je Socke, ${socken} Socken`],
        ['Garn je Paar', `ca. ${M.fmt(w.garnM * 2, 0)} m${gew}`],
      ];
      for (const [l, v] of zeilen) {
        ctx.platz(5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...GRAU);
        doc.text(rein(l) + ':', ctx.links, ctx.y);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
        doc.text(doc.splitTextToSize(rein(v), ctx.nutzbreite - 98)[0], ctx.links + 30, ctx.y);
        ctx.y += 4.8;
      }
      ctx.y = Math.max(ctx.y, yStart + 44) + 2;

      // Ablauf mit Abhakkästchen je Socke
      ctx.ueberschrift('Ablauf');
      const kopf = [...Array.from({ length: socken }, (_, i) => `S${i + 1}`), 'Abschnitt', 'Umfang', 'Reihenzähler', 'Einstellung', 'Anweisung'];
      const breitenS = Array(socken).fill(5);
      const rest = 100 - socken * 5;
      const prozent = [...breitenS, rest * 0.15, rest * 0.09, rest * 0.13, rest * 0.25, rest * 0.38];
      const tz = p.anleitung.abschnitte.map(a => {
        const ein = MW.projekte.einstellung(p, a);
        const einstellung = [ein.mwHaupt && `MW ${ein.mwHaupt}${ein.mwRibber && ein.mwRibber !== ein.mwHaupt ? ' / Ribber ' + ein.mwRibber : ''}`, ein.hauptschlitten, ein.ribber].filter(Boolean).join('; ');
        const anweisung = a.schritte.filter(s => s.typ !== 'reihe' && s.typ !== 'block' && !s.abnahme).map(s => s.text)
          .concat(a.schritte.filter(s => s.typ === 'block' && !a.schritte.some(x => x.abnahme)).map(s => s.text));
        const abn = a.schritte.filter(s => s.abnahme).length;
        if (abn) anweisung.push(`${a.schritte.reduce((n, s) => n + (s.anzahl || 0), 0)} Runden rund, dabei ${abn} Abnahmerunden (je Bett an beiden Rändern 1 Masche) - Reihenzählerstände unten.`);
        if (a.verkuerzt) anweisung.push(`${a.verkuerzt.F} -> ${a.verkuerzt.rest} -> ${a.verkuerzt.F} Maschen, Nadelfolge unten.`);
        return [...Array(socken).fill(''), a.titel, a.umfang, a.rcVon !== a.rcBis ? `${S.rc(a.rcVon)}-${S.rc(a.rcBis)}` : '', einstellung, anweisung.join(' ')];
      });
      ctx.tabelle(kopf, tz, prozent, { kaestchen: Array.from({ length: socken }, (_, i) => i) });

      // Verkürzte Reihen im Detail
      for (const id of ['ferse', 'spitze']) {
        const a = p.anleitung.abschnitte.find(x => x.id === id);
        if (!a.verkuerzt) continue;
        ctx.ueberschrift(`${a.titel}: Nadelfolge der verkürzten Reihen`, 11);
        ctx.text(`Nur Hauptbett, Ribber ruht. Halte-Hebel auf H. Der Schlitten steht zu Beginn rechts.`, { size: 9, farbe: GRAU });
        for (const t of reihenfolge(a)) { ctx.text(t, { size: 9 }); ctx.y += 1; }
      }

      // Wadenabnahme und Bandspitze im Detail
      const abnahmen = [
        ['schaft', 'Schaft mit Wadenabnahme', 'Je Abnahme: je Bett an beiden Rändern 1 Masche auf die Nachbarnadel decken (4 Maschen weniger).'],
        ['spitze', 'Bandspitze', 'Je Abnahme: je Bett links und rechts die 2 äußeren Maschen mit dem Zweifach-Decker 1 Nadel nach innen setzen, freie Randnadeln nach A (4 Maschen weniger). Am Ende die Restmaschen im Maschenstich schließen.'],
      ];
      for (const [id, titel, hinweis] of abnahmen) {
        const a = p.anleitung.abschnitte.find(x => x.id === id);
        if (!a || !a.schritte.some(s => s.abnahme)) continue;
        ctx.ueberschrift(titel, 11);
        let rr = a.rcVon;
        const folge = [];
        for (const s of a.schritte) {
          if (s.abnahme) folge.push(`RC ${S.rc(rr)}: abnehmen`);
          else if (s.typ === 'block') rr = s.rcBis;
        }
        ctx.text(folge.join(' · '), { size: 9 });
        ctx.text(hinweis, { size: 9, farbe: GRAU });
      }

      // Änderungen beim Stricken
      const aend = Object.entries(p.aenderungen || {});
      if (aend.length) {
        ctx.ueberschrift('Änderungen beim Stricken', 11);
        for (const [aid, x] of aend) {
          const a = p.anleitung.abschnitte.find(y => y.id === aid);
          ctx.text(`${a ? a.titel : aid} (seit Socke ${x.socke}): ${[x.mwHaupt && 'MW ' + x.mwHaupt, x.mwRibber && 'Ribber ' + x.mwRibber, x.gewichte, x.notiz].filter(Boolean).join(' · ')}`, { size: 9 });
        }
      }

      ctx.ueberschrift('Spitze schließen: Maschenstich', 11);
      ctx.text(p.anleitung.abschnitte.find(x => x.id === 'schluss').schritte.map(s => s.text).join(' '), { size: 9 });

      if (p.anleitung.warnungen.length) {
        ctx.ueberschrift('Hinweise', 11);
        for (const x of p.anleitung.warnungen) ctx.text('• ' + x, { size: 9, farbe: AKZ });
      }

      ctx.ueberschrift('Notizen', 11);
      if (p.notiz) ctx.text(p.notiz, { size: 9 });
      for (let i = 0; i < 4; i++) {
        ctx.platz(8); ctx.y += 6;
        doc.setDrawColor(190); doc.setLineWidth(0.2); doc.line(ctx.links, ctx.y, ctx.rechts, ctx.y);
      }

      const datei = `${p.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '-') || 'Socken'}.pdf`;
      ausgeben(ctx, datei);
      return ctx;
    } catch (err) {
      console.error(err);
      MW.ui.toast('PDF fehlgeschlagen: ' + err.message, 'fehler');
      return null;
    }
  }

  MW.pdf = { socken, rein };
})();
