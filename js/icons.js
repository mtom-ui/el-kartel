// Eigenes Strich-Icon-Set statt Emojis.
//
// Alle Icons teilen sich dasselbe Raster (24x24), dieselbe Linienstärke und
// erben die Farbe vom Text (currentColor). Dadurch wirken sie wie ein Set und
// nicht wie zusammengesuchte Bildzeichen - genau der Unterschied, den Emojis
// nicht liefern können, weil jede Plattform sie anders zeichnet.
//
// Ein Icon ist eine Liste von Formen:
//   "M..."            -> Pfad
//   [cx, cy, r]       -> Kreis (nur Kontur)
//   [cx, cy, r, true] -> gefüllter Punkt

const NS = "http://www.w3.org/2000/svg";

const ICONS = {
  // --- Erzeugnisse ---------------------------------------------------------
  coca: ["M12 21C6.5 17 5 10 12 3c7 7 5.5 14 0 18z", "M12 21V7"],
  // Sechs Blütenblätter statt vier: mit vier las sich das Zeichen wie ein
  // Kleeblatt, erst ab sechs wird eindeutig eine Blüte daraus.
  poppy: [
    [12, 6.8, 2.4],
    [16.5, 9.4, 2.4],
    [16.5, 14.6, 2.4],
    [12, 17.2, 2.4],
    [7.5, 14.6, 2.4],
    [7.5, 9.4, 2.4],
    [12, 12, 1.9],
  ],
  cannabis: [
    "M12 21c-2.5-5-2.5-11 0-17 2.5 6 2.5 12 0 17z",
    "M12 20C8 17 5.5 12 5 7c4 2 6.5 7 7 13z",
    "M12 20c4-3 6.5-8 7-13-4 2-6.5 7-7 13z",
    "M12 20.5C8.5 19.5 5 17 3 13.5c4 0 7.5 2.5 9 7z",
    "M12 20.5c3.5-1 7-3.5 9-7-4 0-7.5 2.5-9 7z",
  ],
  crystal: ["M12 2.5 19.5 9l-4 12.5h-7L4.5 9z", "M4.5 9h15", "M8.5 21.5 12 9l3.5 12.5"],

  // --- Rollen --------------------------------------------------------------
  flask: ["M10 3v6.5L5.2 18.4A2 2 0 0 0 7 21.4h10a2 2 0 0 0 1.8-3L14 9.5V3", "M9 3h6", "M7.6 15.5h8.8"],
  sprout: ["M12 21v-8", "M12 13c0-3-2.2-5-5-5 0 3 2.2 5 5 5z", "M12 13c0-3 2.2-5 5-5 0 3-2.2 5-5 5z", "M5.5 21h13"],
  shield: ["M12 2.8 20 6v6.2c0 4.7-3.4 7.6-8 9-4.6-1.4-8-4.3-8-9V6z", "M9 11.8l2.2 2.2 4-4"],
  tag: ["M20.6 11.6 12.4 3.4a2 2 0 0 0-1.4-.6H4.8a2 2 0 0 0-2 2V11a2 2 0 0 0 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l6.2-6.2a2 2 0 0 0 0-2.8z", [7.6, 7.6, 1.2, true]],
  truck: [
    "M2.6 7.6a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1V16H2.6z",
    "M14 10.6h3.6a1 1 0 0 1 .8.4l2.3 3a1 1 0 0 1 .2.6V16H14z",
    [6.6, 18, 2],
    [17.4, 18, 2],
  ],

  // --- Kennzahlen ----------------------------------------------------------
  cash: ["M2.8 6.5h18.4a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z", [12, 12, 2.6], "M5.6 9.6v4.8", "M18.4 9.6v4.8"],
  soil: ["M3 15.6h18", "M3 19.6h18", "M12 11.6V5.4", "M12 8.2c-2.2 0-3.6-1.5-3.6-3.4C10.6 4.8 12 6.2 12 8.2z", "M12 8.2c2.2 0 3.6-1.5 3.6-3.4C13.4 4.8 12 6.2 12 8.2z"],
  morale: ["M2.5 12.5h4l2-4.6 3.2 9.2 2.8-6.1 1.5 1.5h5.5"],
  members: [[9, 8, 3], "M3 20v-1.2C3 16.1 5.7 14 9 14s6 2.1 6 4.8V20", [17.2, 8.6, 2.2], "M16.8 14.3c2.5.6 4.2 2.4 4.2 4.5V20"],
  land: ["M2.5 16.5 8 8.5h13.5l-5.5 8z", "M6.6 16.5 11 10", "M11 16.5 15.4 10"],
  gear: [[12, 12, 3.2], "M12 3.4v2.3", "M12 18.3v2.3", "M3.4 12h2.3", "M18.3 12h2.3", "M5.9 5.9l1.6 1.6", "M16.5 16.5l1.6 1.6", "M18.1 5.9l-1.6 1.6", "M7.5 16.5l-1.6 1.6"],
  briefcase: ["M3.5 8.5h17a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z", "M9 8.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2.5", "M2.5 13.5h19"],
  crate: ["M3.5 7.5 12 4l8.5 3.5v9L12 20l-8.5-3.5z", "M3.5 7.5 12 11l8.5-3.5", "M12 11v9"],

  // --- Oberfläche ----------------------------------------------------------
  chart: ["M3.5 20.5h17", "M7 20.5V13", "M12 20.5V6.5", "M17 20.5V10"],
  store: ["M3 8.5 4.6 4.5h14.8L21 8.5z", "M4.6 8.5V20h14.8V8.5", "M10 20v-5h4v5"],
  trendUp: ["M3.5 16.5 9.5 10.5l3.5 3.5 7.5-7.5", "M15.5 6.5h5v5"],
  trendDown: ["M3.5 7.5 9.5 13.5l3.5-3.5 7.5 7.5", "M15.5 17.5h5v-5"],
  help: [[12, 12, 9], "M9.4 9.4a2.7 2.7 0 0 1 5.3.8c0 1.8-2.7 2.2-2.7 4", [12, 17.4, 0.9, true]],
  restart: ["M20.5 12a8.5 8.5 0 1 1-2.7-6.2", "M20.5 3.8V9.4h-5.6"],
  sun: [[12, 12, 4.2], "M12 3v2.2", "M12 18.8V21", "M3 12h2.2", "M18.8 12H21", "M5.6 5.6l1.6 1.6", "M16.8 16.8l1.6 1.6", "M18.4 5.6l-1.6 1.6", "M7.2 16.8l-1.6 1.6"],
  moon: ["M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z"],
  droplet: ["M12 3.4c3.2 3.7 6 7.1 6 10.1a6 6 0 0 1-12 0c0-3 2.8-6.4 6-10.1z"],
  envelope: ["M3.5 6.5h17v11h-17z", "M3.7 7 12 13.4 20.3 7"],
  search: [[11, 11, 6.6], "M15.8 15.8 20.5 20.5"],
  check: ["M4.6 12.4 9.6 17.4 19.4 6.6"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  plus: ["M12 5v14", "M5 12h14"],
  // Chip mit Pins - steht für KI-Gegner.
  cpu: [
    "M7 7h10v10H7z",
    "M10 10h4v4h-4z",
    "M9.5 3.5V7", "M14.5 3.5V7", "M9.5 17v3.5", "M14.5 17v3.5",
    "M3.5 9.5H7", "M3.5 14.5H7", "M17 9.5h3.5", "M17 14.5h3.5",
  ],
  dash: ["M6 12h12"],
  flag: ["M6 21V4", "M6 4.6h11l-2.2 3.4L17 11.6H6z"],
  trophy: ["M8 4h8v5.2a4 4 0 0 1-8 0z", "M8 6H5.6a2.4 2.4 0 0 0 2.6 2.6", "M16 6h2.4a2.4 2.4 0 0 1-2.6 2.6", "M12 13.2v3", "M9.4 19.6h5.2l-.6-3.4h-4z", "M8 19.6h8"],
  note: ["M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z", "M14.6 3.6v4.2h4.2", "M8.5 13h7", "M8.5 16.5h4.5"],
  film: ["M3.5 5.5h17v13h-17z", "M8 5.5v13", "M16 5.5v13", "M3.5 12h17"],

  // --- Wetter & Ereignisse -------------------------------------------------
  cloud: ["M6.8 18.5h10.6a4.2 4.2 0 0 0 .2-8.4 6 6 0 0 0-11.2-1.3A4.3 4.3 0 0 0 6.8 18.5z"],
  rain: ["M6.8 15.5h10.6a4.2 4.2 0 0 0 .2-8.4A6 6 0 0 0 6.4 5.8 4.3 4.3 0 0 0 6.8 15.5z", "M8.6 18v2.6", "M12 18.4v3", "M15.4 18v2.6"],
  storm: ["M6.8 14.8h10.6a4.2 4.2 0 0 0 .2-8.4A6 6 0 0 0 6.4 5.1 4.3 4.3 0 0 0 6.8 14.8z", "M13 17.2 9.8 21.4h3.4l-1.4 3"],
  eye: ["M1.9 12S5.6 5.6 12 5.6 22.1 12 22.1 12 18.4 18.4 12 18.4 1.9 12 1.9 12z", [12, 12, 3]],
  // Parierstangen quer zum Griff - ohne sie las sich das Zeichen nur als "X".
  swords: [
    "M4.4 4.4 14 14",
    "M19.6 4.4 10 14",
    "M12.9 16.4l3.4 3.4",
    "M11.1 16.4l-3.4 3.4",
    "M14.6 15.2l2.6 2.6",
    "M9.4 15.2l-2.6 2.6",
  ],
  road: ["M8.2 3 6.2 21", "M15.8 3l2 18", "M12 4.4v3.2", "M12 10.4v3.2", "M12 16.4v3.2"],
  ship: ["M3.6 17.5h16.8l-2 3.6H5.6z", "M12 4.4v13.1", "M12.9 6.6 17.2 13h-4.3z", "M11.1 9.4 7.6 13h3.5z"],
  barrier: ["M3 9.6h18v4H3z", "M7.4 9.6 5.4 13.6", "M12.2 9.6l-2 4", "M17 9.6l-2 4", "M4.6 13.6V20.4", "M19.4 13.6V20.4"],
  siren: ["M7 17.4a5 5 0 0 1 10 0z", "M5 17.4h14", "M12 4.6v3", "M7.4 6.6 9 8.6", "M16.6 6.6 15 8.6"],
  alert: ["M12 4 21.4 20.4H2.6z", "M12 10.2v4.4", [12, 17.6, 0.9, true]],
  steady: [[12, 12, 8.6], "M7.6 12h8.8"],
  // Umriss Brasiliens, aus denselben Geodaten wie die Karte abgeleitet.
  country: ["M8.62,1.50L9.15,1.59L9.15,3.10L9.60,3.64L11.11,3.28L11.11,2.92L12.80,3.10L13.60,1.94L14.40,3.37L14.31,4.17L17.07,5.06L17.25,5.68L19.65,5.86L21.08,7.02L21.97,7.11L22.32,8.17L22.14,9.15L20.10,11.47L20.01,13.87L19.03,16.18L18.50,16.72L17.16,16.72L15.83,17.43L15.03,18.32L15.03,19.74L12.44,22.50L12.62,21.88L10.31,20.63L12.36,18.85L12.36,18.41L11.82,18.14L12.00,17.25L11.38,17.25L11.20,16.36L10.13,16.27L10.31,14.05L9.86,13.16L8.89,13.07L8.80,11.73L6.66,11.02L6.22,9.60L3.55,10.31L3.46,9.60L2.12,9.42L1.68,8.44L2.30,7.02L3.81,6.66L4.08,4.79L3.72,3.99L4.26,3.99L3.90,3.37L5.24,3.10L5.77,3.90L6.31,3.81L7.28,3.10L6.57,2.03L7.55,2.30L8.62,1.59Z"],
};

/** Ein Icon als SVG-Element. Größe in px, Farbe kommt vom Text. */
export function icon(name, { size = 18, cls = "" } = {}) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", cls ? `ic ${cls}` : "ic");

  for (const shape of ICONS[name] || ICONS.steady) {
    if (Array.isArray(shape)) {
      const [cx, cy, r, filled] = shape;
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", String(r));
      if (filled) {
        c.setAttribute("fill", "currentColor");
        c.setAttribute("stroke", "none");
      }
      svg.appendChild(c);
    } else {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", shape);
      svg.appendChild(p);
    }
  }
  return svg;
}

/** Icon + Text als eine Einheit - der Standardfall in der Oberfläche. */
export function iconLabel(name, text, { size = 18, cls = "" } = {}) {
  const span = document.createElement("span");
  span.className = cls ? `ic-label ${cls}` : "ic-label";
  span.appendChild(icon(name, { size }));
  if (text !== undefined && text !== null && text !== "") {
    const t = document.createElement("span");
    t.textContent = String(text);
    span.appendChild(t);
  }
  return span;
}
