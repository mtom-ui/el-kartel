const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Kombi-Chart fürs Marktboard: zwei gruppierte Balken (linke Achse) plus zwei
 * Linien (rechte Achse) über denselben Rundennummern. Für die Marktlage:
 * Balken = produzierte Menge / Marktvolumen, Linie = ø angebotener Preis der
 * Spieler / Marktpreis - je ein Balken und eine Linie teilen sich eine Farbe
 * (per CSS-Klasse statt fixer Hex-Werte, damit beide Farbschemata greifen).
 *
 * `bars`/`lines`: je [{ cls, values }] (genau zwei Einträge). `width` ist nur
 * die Nutzbreite des viewBox-Koordinatensystems - das SVG selbst bekommt
 * width="100%" und preserveAspectRatio="none", füllt also unabhängig von der
 * tatsächlichen Spaltenbreite die volle Breite aus.
 */
export function comboChart(xLabels, bars, lines, { width = 400, height = 84, revealDelay = 0, animate = true } = {}) {
  const svg = svgEl("svg", {
    width: "100%",
    height,
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    class: "combo-chart",
  });
  const n = xLabels.length;
  if (!n) return svg;

  const padTop = 6;
  const padBottom = 14;
  const padSide = 3;
  const innerW = width - padSide * 2;
  const innerH = height - padTop - padBottom;
  const baseline = padTop + innerH;

  const barMax = Math.max(1, ...bars.flatMap((b) => b.values)) * 1.15;
  const lineVals = lines.flatMap((l) => l.values);
  const lineMax = Math.max(1, ...lineVals) * 1.15;

  const groupW = innerW / n;
  const barW = groupW * 0.26;
  const barGap = groupW * 0.1;

  xLabels.forEach((_, i) => {
    const groupX = padSide + i * groupW + groupW * 0.16;
    bars.forEach((b, bi) => {
      const v = b.values[i];
      if (v == null) return;
      const h = Math.max(0, (v / barMax) * innerH);
      const x = groupX + bi * (barW + barGap);
      const rect = svgEl("rect", {
        x: x.toFixed(1),
        y: (baseline - h).toFixed(1),
        width: barW.toFixed(1),
        height: h.toFixed(1),
        rx: 1.2,
        class: `combo-bar ${b.cls}`,
      });
      // Versatz je Runde: die Balken wachsen nicht alle im selben Moment
      // hoch, sondern von links nach rechts nach - dieselbe Kaskade wie beim
      // Aufblättern einer Flughafenanzeige.
      rect.style.transitionDelay = `${revealDelay + i * 35}ms`;
      svg.appendChild(rect);
    });
  });

  const toLineXY = (v, i) => {
    const x = padSide + i * groupW + groupW / 2;
    const y = padTop + innerH - (v / lineMax) * innerH;
    return [x, y];
  };

  for (const l of lines) {
    const pts = l.values.map((v, i) => (v == null ? null : toLineXY(v, i))).filter(Boolean);
    if (pts.length < 2) {
      pts.forEach(([x, y]) => svg.appendChild(svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 2.3, class: `combo-dot ${l.cls}` })));
      continue;
    }
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const path = svgEl("path", { d, class: `combo-line ${l.cls}` });
    // "Zeichnet sich selbst": Linienlänge aus den bekannten Punktkoordinaten
    // errechnet (kein DOM-Zugriff wie getTotalLength() nötig, der erst nach
    // dem Einhängen ins Dokument funktionieren würde), als Dash-Muster über
    // die volle Länge gelegt und per Transition auf 0 zurückgefahren.
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);
    path.style.transitionDelay = `${revealDelay}ms`;
    svg.appendChild(path);
    pts.forEach(([x, y]) => svg.appendChild(svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 2.3, class: `combo-dot ${l.cls}` })));
  }

  xLabels.forEach((label, i) => {
    const x = padSide + i * groupW + groupW / 2;
    const text = svgEl("text", { x: x.toFixed(1), y: height - 2, "text-anchor": "middle", class: "chart-axis-label" });
    text.textContent = label;
    svg.appendChild(text);
  });

  if (!animate) {
    // Kein erneutes Hochwachsen bei jedem Render (z. B. nur weil ein
    // Spieler abgegeben hat) - nur beim tatsächlichen Rundenwechsel, siehe
    // den `animate`-Parameter in renderMarketPanel() in host.js.
    svg.classList.add("is-revealed");
  } else {
    // Wachstum erst anstoßen, nachdem der Ausgangszustand (Balkenhöhe 0,
    // Linie unsichtbar) mindestens einmal gemalt wurde - sonst überspringt
    // der Browser die Transition und der Chart poppt einfach fertig auf.
    // Zwei verschachtelte rAF garantieren diesen einen gemalten
    // Zwischenschritt.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        svg.classList.add("is-revealed");
      });
    });
  }

  return svg;
}
