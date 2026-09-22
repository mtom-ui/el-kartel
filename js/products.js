// Die vier Erzeugnisse. Jedes hat einen eigenen Markt (Preis + Nachfrage),
// ein eigenes Ertragsprofil und eine eigene Wirkung auf den Boden.
//
// Preise orientieren sich grob an realen Schwarzmarkt-Größenordnungen (rohes
// Pflanzenmaterial ist billig pro Kilo, verarbeiteter Stoff sehr teuer) -
// yieldPerWorker ist entsprechend so skaliert, dass der Erlös je Mitglied bei
// Marktpreis für alle vier dicht beieinander liegt (650-900 €), damit kein
// Erzeugnis einfach nur "das bessere Geld" ist. Die Erzeugnisse
// unterscheiden sich stattdessen darin, WIE sie sich verhalten: Mohn ist
// wenig Menge zu hohem Kilopreis (guter Absatz auch bei engem Markt), Koka
// ist die größte Erntemenge zu sehr niedrigem Kilopreis (braucht einen
// großen Markt) und Cannabis zehrt am stärksten am Boden.

export const PRODUCTS = [
  {
    id: "wheat",
    label: "Koka",
    icon: "coca",
    short: "Koka",
    unit: "t",
    group: "field",
    yieldPerWorker: 0.5,
    basePrice: 1300,
    demandRange: [3.4, 5.1],
    soilDrain: 3,
    priceDigits: 0,
    hint: "Allrounder: solide Menge, großer Markt, schont den Boden am meisten. Wird außerdem im Labor zu Crystal Meth weiterverarbeitet.",
  },
  {
    id: "rapeseed",
    label: "Mohn",
    icon: "poppy",
    short: "Mohn",
    unit: "kg",
    group: "field",
    yieldPerWorker: 3.5,
    basePrice: 220,
    demandRange: [20, 34],
    soilDrain: 5,
    priceDigits: 0,
    hint: "Wenig Menge, hoher Preis je Kilo – gut, wenn der Markt eng ist. Zehrt spürbar am Boden.",
  },
  {
    id: "potato",
    label: "Cannabis",
    icon: "cannabis",
    short: "Cannabis",
    unit: "kg",
    group: "field",
    yieldPerWorker: 9,
    basePrice: 90,
    demandRange: [55, 92],
    soilDrain: 6,
    priceDigits: 0,
    hint: "Ordentliche Erntemenge zu vergleichsweise niedrigem Kilopreis – braucht einen aufnahmefähigen Markt und laugt den Boden am stärksten aus.",
  },
  {
    id: "milk",
    label: "Crystal Meth",
    icon: "crystal",
    short: "Meth",
    unit: "g",
    group: "livestock",
    // 6 €/g statt 4 €/g: bei 4 € war die Veredelung ein Verlustgeschäft. Ein
    // Laborkopf braucht 0,35 t Koka, also zusätzlich 0,7 Erntehelfer - die
    // Kette brachte 379 € je eingesetztem Mitglied, rohes Koka dagegen 500 €.
    // Mit 6 €/g liegt das Labor bei 644 € und ist damit die stärkste, aber
    // auch riskanteste Sparte (Grundstoffbedarf, 30% Schwund, Razzien).
    yieldPerWorker: 225,
    basePrice: 6,
    demandRange: [765, 1275],
    soilDrain: 0,
    priceDigits: 2,
    hint: "Eigenes Labor, eigener Markt, aber: jedes Labor verbraucht Koka als Grundstoff, und unverkaufter Stoff verliert im Versteck an Reinheit.",
  },
];

/** Nachkommastellen für Mengenangaben: Gramm werden ganzzahlig angezeigt
 * (629 g statt 628,96 g), Tonnen und Kilo mit einer Stelle. */
export const QTY_DIGITS = { t: 1, kg: 1, g: 0 };
export function qtyDigits(product) {
  return QTY_DIGITS[product.unit] ?? 1;
}

export const PRODUCTS_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const FIELD_PRODUCTS = PRODUCTS.filter((p) => p.group === "field");

// Bereiche, die nichts produzieren, aber Kosten/Erlöse beeinflussen.
export const SUPPORT_AREAS = [
  {
    id: "building",
    label: "Ausbau",
    icon: "gear",
    hint: "Senkt die Schmuggelkosten (bis 60%) und hält den Schmuggel in Schuss.",
  },
  {
    id: "market",
    label: "Vertrieb",
    icon: "briefcase",
    hint: "+2,5% Erlös je Mitglied, gedeckelt bei 25%.",
  },
];

/** Alle Zeilen der Mitgliederverteilung in Anzeigereihenfolge. */
export const WORK_ROWS = [
  ...PRODUCTS.map((p) => ({ id: p.id, label: p.label, icon: p.icon, hint: p.hint, group: p.group })),
  ...SUPPORT_AREAS.map((a) => ({ id: a.id, label: a.label, icon: a.icon, hint: a.hint, group: "support" })),
];

/** Versteck-Spalte je Produkt in player_resources. */
export const STOCK_COLUMN = {
  wheat: "grain_tons",
  rapeseed: "stock_rapeseed",
  potato: "stock_potato",
  milk: "milk_liters",
};
