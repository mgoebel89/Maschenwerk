(function () {
  'use strict';
  window.MW = window.MW || {};

  // Seitenansicht eines Fußes mit einer Messlinie je Fußmaß. Gebraucht in der
  // Messmaske (Linie des aktiven Feldes leuchtet) und auf dem Messblatt.
  // Jede Linie gibt es zweimal: sichtbar (.linie) und als breite, unsichtbare
  // Tippfläche (.treffer), damit man sie am Handy auch trifft.

  const FORM = 'M50 10 L50 120 Q40 150 42 168 Q46 182 62 182 L220 182 Q240 182 240 170 Q240 158 222 154 L150 132 Q115 120 98 100 L95 10 Z';

  const LINIEN = {
    fussLaenge:     { form: '<path d="M42 198 L240 198 M42 192 L42 204 M240 192 L240 204"/>', text: [118, 214, 'Fußlänge'] },
    fussUmfang:     { form: '<ellipse cx="185" cy="162" rx="8" ry="20"/>', text: [198, 140, 'Ballen'] },
    ristUmfang:     { form: '<ellipse cx="130" cy="153" rx="7" ry="29"/>', text: [128, 116, 'Rist'] },
    fersenUmfang:   { form: '<ellipse cx="82" cy="143" rx="47" ry="7" transform="rotate(-43 82 143)"/>', text: [2, 150, 'Ferse'] },
    knoechelUmfang: { form: '<ellipse cx="73" cy="85" rx="23" ry="6"/>', text: [104, 90, 'Knöchel'] },
    schaftHoehe:    { form: '<path d="M24 182 L24 25 M18 182 L30 182 M18 25 L30 25"/>', text: [2, 105, 'Schaft'] },
    wadenUmfang:    { form: '<ellipse cx="72" cy="25" rx="23" ry="6"/>', text: [104, 30, 'Wade'] },
  };

  function svg({ aktiv, gemessen } = {}) {
    const g = gemessen || new Set();
    const teile = Object.entries(LINIEN).map(([key, l]) => {
      const klasse = key === aktiv ? 'an' : g.has(key) ? 'gemessen' : '';
      const form = l.form.replace(/^<(\w+)/, `<$1 class="linie ${klasse}" data-mass="${key}"`);
      const treffer = l.form.replace(/^<(\w+)/, `<$1 class="treffer" data-mass="${key}"`);
      const [x, y, t] = l.text;
      return `${form}${treffer}<text x="${x}" y="${y}" class="${key === aktiv ? 'an' : ''}">${t}</text>`;
    }).join('');
    return `
      <svg class="fuss-svg" viewBox="0 0 262 220" role="img" aria-label="Fußzeichnung mit Messlinien">
        <path d="${FORM}" fill="#f3efe9" stroke="#8a8f96" stroke-width="2"/>
        ${teile}
      </svg>`;
  }

  MW.fuss = { svg };
})();
