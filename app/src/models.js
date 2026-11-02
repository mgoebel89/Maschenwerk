(function () {
  'use strict';
  window.MW = window.MW || {};

  // Fachlogik ohne Oberfläche: Maße, Schätzungen, Maschenprobe, Rechnen.
  // Alles hier ist reine Funktion und lässt sich im Browser-Konsolenfenster
  // direkt ausprobieren (MW.models.verteilen(54, 90, 120, true)).

  const SCHEMA_VERSION = 1;

  // Brother KH-588: 200 Nadeln, links und rechts der Mitte je 1–100. Eine
  // Nadel 0 gibt es nicht, die Mitte liegt zwischen L1 und R1.
  const MASCHINE = { name: 'Brother KH-588', ribber: 'Brother KR-586', nadelnJeSeite: 100 };

  // Reihenfolge = Reihenfolge in der Messmaske.
  const FUSSMASSE = [
    { key: 'fussLaenge', label: 'Fußlänge', kurz: 'Länge',
      hinweis: 'Im Stehen, Ferse an die Wand. Bis zum längsten Zeh messen; ein Buch an der Zehenspitze hilft.' },
    { key: 'fussUmfang', label: 'Fußumfang am Ballen', kurz: 'Ballen',
      hinweis: 'Breiteste Stelle über den Ballen. Maßband anliegend, aber nicht ziehen. Am besten im Stehen.' },
    { key: 'ristUmfang', label: 'Ristumfang', kurz: 'Rist',
      hinweis: 'Über den höchsten Punkt des Spanns rund um den Fuß.' },
    { key: 'fersenUmfang', label: 'Fersenumfang diagonal', kurz: 'Ferse',
      hinweis: 'Von der Fersenspitze schräg über den Spann. Davon hängt ab, ob die Socke über die Ferse geht.' },
    { key: 'knoechelUmfang', label: 'Knöchelumfang', kurz: 'Knöchel',
      hinweis: 'Direkt über dem Knöchel, an der schmalsten Stelle.' },
    { key: 'schaftHoehe', label: 'Schafthöhe', kurz: 'Schaft',
      hinweis: 'Vom Boden bis dort, wo das Bündchen enden soll.' },
    { key: 'wadenUmfang', label: 'Wadenumfang', kurz: 'Wade',
      hinweis: 'In der Höhe, wo das Bündchen endet. Nur für lange Socken nötig.' },
  ];

  // ---------------------------------------------------------------- Zahlen ---
  function zahl(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.').replace('−', '-'));
    return isFinite(n) ? n : null;
  }
  function fmt(n, stellen = 1) {
    if (n === null || n === undefined || !isFinite(n)) return '–';
    const s = (Math.round(n * 10 ** stellen) / 10 ** stellen).toFixed(stellen);
    return s.replace(/\.0+$/, '').replace('.', ',').replace(/^-/, '−');
  }
  const halb = (n) => Math.round(n * 2) / 2;

  // ------------------------------------------------------------- Schätzung ---
  // Daumenregeln, wenn ein Maß nicht gemessen ist. Die Fußlänge folgt gut aus
  // der EU-Größe (1 Stich = 2/3 cm Schuhlänge, Fuß ≈ 1,5 cm kürzer); alle
  // Umfänge sind nur typische Werte und werden in der App als „geschätzt"
  // gekennzeichnet.
  function schaetzeFussmasse(schuhgroesse) {
    const gr = zahl(schuhgroesse);
    if (!gr || gr < 16 || gr > 50) return {};
    const laenge = gr * 2 / 3 - 1.5;
    // Kinderfüße sind im Verhältnis breiter: Faktor 0,98 bis Gr. 30, 0,92 ab Gr. 38.
    const f = gr <= 30 ? 0.98 : gr >= 38 ? 0.92 : 0.98 - (gr - 30) * 0.0075;
    const umfang = laenge * f;
    const knoechel = umfang * 0.95;
    return {
      fussLaenge: halb(laenge),
      fussUmfang: halb(umfang),
      ristUmfang: halb(umfang * 1.04),
      fersenUmfang: halb(umfang * 1.36),
      knoechelUmfang: halb(knoechel),
      schaftHoehe: gr < 25 ? 8 : gr <= 34 ? 11 : 15,
      wadenUmfang: halb(knoechel * 1.5),
    };
  }

  // Gemessener Wert, sonst Schätzung. `geschaetzt` sagt, welches von beiden.
  function fussmass(person, key) {
    const gemessen = zahl(person && person.fuss && person.fuss[key]);
    if (gemessen !== null) return { wert: gemessen, geschaetzt: false };
    const s = schaetzeFussmasse(person && person.schuhgroesse)[key];
    return s ? { wert: s, geschaetzt: true } : { wert: null, geschaetzt: false };
  }

  function anzahlGemessen(person) {
    return FUSSMASSE.filter(m => zahl(person && person.fuss && person.fuss[m.key]) !== null).length;
  }

  // Warnt bei Werten, die weit von der Schuhgröße abweichen — meist ein
  // Tippfehler oder falsch angelegtes Maßband.
  function plausibilitaet(key, wert, schuhgroesse) {
    const w = zahl(wert);
    const s = schaetzeFussmasse(schuhgroesse)[key];
    if (w === null || !s) return null;
    const grenze = key === 'fussLaenge' ? 0.1 : key === 'schaftHoehe' ? 0.6 : 0.2;
    if (Math.abs(w - s) / s <= grenze) return null;
    return `Ungewöhnlich für Gr. ${fmt(zahl(schuhgroesse))} (typisch etwa ${fmt(s)} cm). Bitte nachmessen.`;
  }

  // -------------------------------------------------------- Maschenprobe ---
  // Eine Probe speichert, was gezählt und gemessen wurde; die Werte auf 10 cm
  // werden daraus gerechnet. Alternativ direkt eingegeben (eingabe = 'direkt').
  function probeAuf10(p) {
    if (!p) return { m10: null, r10: null };
    if (p.eingabe === 'direkt') return { m10: zahl(p.m10), r10: zahl(p.r10) };
    const m = zahl(p.maschen), b = zahl(p.breiteCm), r = zahl(p.reihen), h = zahl(p.hoeheCm);
    return {
      m10: m && b ? m / b * 10 : null,
      r10: r && h ? r / h * 10 : null,
    };
  }

  function probeTitel(p, garne) {
    const g = (garne || []).find(x => x.id === p.garnId);
    return (g ? g.name : (p.garnName || 'Ohne Garn')) + (p.maschenweite ? ` · MW ${p.maschenweite}` : '');
  }

  // ------------------------------------------------------------- Rechnen ---
  function maschenFuer(cm, m10) {
    const c = zahl(cm), m = zahl(m10);
    return c && m ? c * m / 10 : null;
  }
  function reihenFuer(cm, r10) {
    const c = zahl(cm), r = zahl(r10);
    return c && r ? c * r / 10 : null;
  }
  // Auf das nächste Vielfache runden (Bündchenrapport, gerade Zahl, …).
  function rundeAuf(n, vielfaches) {
    if (n === null) return null;
    const v = Math.max(1, Math.round(zahl(vielfaches) || 1));
    return Math.max(v, Math.round(n / v) * v);
  }

  // Maschen mittig auf dem Bett: 64 → L32–R32, 63 → L32–R31.
  function nadeln(maschen) {
    const n = Math.round(zahl(maschen) || 0);
    if (n <= 0) return null;
    const links = Math.ceil(n / 2), rechts = Math.floor(n / 2);
    const text = rechts > 0 ? `L${links} – R${rechts}` : `L${links} – L1`;
    return { links, rechts, text, zuViel: links > MASCHINE.nadelnJeSeite };
  }

  // Zu- oder Abnahmen gleichmäßig auf eine Strecke verteilen.
  // beidseitig: an beiden Rändern gleichzeitig (Ärmel) — ein Ereignis = 2 Maschen.
  function verteilen(von, bis, reihen, beidseitig) {
    const a = Math.round(zahl(von) || 0), b = Math.round(zahl(bis) || 0), r = Math.round(zahl(reihen) || 0);
    const diff = Math.abs(b - a);
    if (!diff || !r) return null;
    const art = b > a ? 'Zunahme' : 'Abnahme';
    const jeEreignis = beidseitig ? 2 : 1;
    if (diff % jeEreignis) {
      return { fehler: `${diff} Maschen lassen sich nicht gleich auf beide Seiten verteilen. Wähle eine gerade Differenz.` };
    }
    const ereignisse = diff / jeEreignis;
    if (ereignisse > r) {
      return { fehler: `${ereignisse} ${art}n passen nicht in ${r} Reihen.` };
    }
    const basis = Math.floor(r / ereignisse);
    const rest = r - basis * ereignisse;          // so viele Abstände sind 1 Reihe länger
    const schritte = [];
    if (rest) schritte.push({ anzahl: rest, alle: basis + 1 });
    schritte.push({ anzahl: ereignisse - rest, alle: basis });
    const wo = beidseitig ? ' je Seite 1 Masche' : ' 1 Masche';
    const text = schritte.map(s => `${s.anzahl} × alle ${s.alle} Reihen`).join(', dann ');
    // Einfachere Variante: fester Rhythmus, Rest gerade.
    const einfach = `${ereignisse} × alle ${basis} Reihen, danach ${r - ereignisse * basis} Reihen gerade`;
    return { art, diff, ereignisse, schritte, text: `${text}${wo} ${art === 'Zunahme' ? 'zunehmen' : 'abnehmen'}`, einfach: rest ? einfach : null };
  }

  // --------------------------------------------------------------- Farben ---
  const PERSONEN_FARBEN = ['#c2553a', '#23606e', '#7a5c99', '#2f7d4f', '#a46a00', '#3d6fb6', '#b0466e', '#5f6670'];

  MW.models = {
    SCHEMA_VERSION, MASCHINE, FUSSMASSE, PERSONEN_FARBEN,
    zahl, fmt,
    schaetzeFussmasse, fussmass, anzahlGemessen, plausibilitaet,
    probeAuf10, probeTitel,
    maschenFuer, reihenFuer, rundeAuf, nadeln, verteilen,
  };
})();
