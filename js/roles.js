// Spezialisierungen, die bei der Anmeldung gewählt werden. Jede Rolle gibt
// genau einen spürbaren, aber nicht überwältigenden Vorteil in einem
// Teilbereich - der Rest des Spiels bleibt unverändert. Die Werte greifen in
// engine.js (siehe ROLE_EFFECTS) direkt in die entsprechende Formel ein.
export const ROLES = [
  {
    id: "koch",
    icon: "flask",
    label: "Koch",
    hint: "+25% Ertrag im Labor (Crystal Meth).",
  },
  {
    id: "botaniker",
    icon: "sprout",
    label: "Botaniker",
    hint: "Felder erholen sich schneller: Plantagenpflege wirkt 50% stärker, Anbau laugt den Boden 20% weniger aus.",
  },
  {
    id: "polizist",
    icon: "shield",
    label: "Korrupter Polizist",
    hint: "8% weniger Betriebskosten, 70% günstigere Bestechungen, 80% weniger Verlust bei Beschlagnahmungen und 40% weniger Zusatzkosten bei Fahndungsdruck.",
  },
  {
    id: "verkaeufer",
    icon: "tag",
    label: "Verkäufer",
    hint: "Mehr Erlös pro Mitglied im Vertrieb: +3,5% statt +2,5% je Kopf, gedeckelt bei 30% statt 25%.",
  },
  {
    id: "schmuggler",
    icon: "truck",
    label: "Schmuggler",
    hint: "Bekommt 30% mehr Gewicht am Markt (bedient Abnehmer zuerst), halbiert Versteckkosten und Meth-Schwund und senkt Schmuggelkosten bis 80%.",
  },
];

export const ROLES_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

// Neutralwerte, falls (aus alten Spielständen o.ä.) keine gültige Rolle
// gesetzt ist - dann verhält sich alles exakt wie vor den Rollen.
// Die Werte sind aus Simulationen kalibriert: gemessen am Endkapital liegen
// alle Rollen zwischen +6% und +18% gegenüber "keine Rolle". Polizist und
// Schmuggler brauchten dafür je einen zweiten Effekt - ihre ursprünglichen
// Boni (Bestechungskosten bzw. Schmuggelkosten) betreffen zu kleine
// Kostenposten, um spürbar zu sein (+1%).
export const ROLE_EFFECTS = {
  koch: { methYieldMult: 1.25 },
  botaniker: { soilCareRecoveryMult: 1.5, fieldSoilDrainMult: 0.8 },
  polizist: { bribeCostMult: 0.3, seizureMult: 0.2, crackdownReliefMult: 0.6, operatingCostMult: 0.92 },
  verkaeufer: { marketBonusPerWorker: 0.035, marketBonusCap: 0.3 },
  schmuggler: {
    buildingDiscountPerWorker: 0.15,
    buildingDiscountCap: 0.8,
    wearReliefMult: 1.35,
    storageCostMult: 0.5,
    spoilageMult: 0.5,
    marketWeightMult: 1.3,
  },
};

export function roleEffect(roleId, key, fallback) {
  return ROLE_EFFECTS[roleId]?.[key] ?? fallback;
}
