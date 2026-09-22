import { h, fmtEUR, fmtNum } from "./dom.js";
import { PRODUCTS, qtyDigits } from "./products.js";
import { iconLabel } from "./icons.js";

/** Gemeinsame Rechenweg-Anzeige für ein Rundenergebnis - wird auf dem Handy
 * und im TV-Detailfenster verwendet, damit beide dieselben Zahlen zeigen. */
export function renderBreakdownDetails(b) {
  const row = (label, value) => h("div", { class: "bd-row" }, [h("span", {}, label), h("span", { class: "bd-value" }, value)]);
  const section = (iconName, title, rows) =>
    h("div", { class: "bd-section" }, [h("h4", {}, [iconLabel(iconName, title, { size: 17 })]), ...rows.filter(Boolean)]);

  const produktionRows = PRODUCTS.map((p) => {
    const s = b.sales?.[p.id];
    if (!s || (s.produced === 0 && s.available === 0)) return null;
    const digits = qtyDigits(p);
    return row(iconLabel(p.icon, `${p.label} geerntet`, { size: 15 }), `${fmtNum(s.produced, digits)} ${p.unit}`);
  });

  const verkaufRows = PRODUCTS.map((p) => {
    const s = b.sales?.[p.id];
    if (!s || s.available === 0) return null;
    const digits = qtyDigits(p);
    return row(
      iconLabel(p.icon, `${p.label} verkauft`, { size: 15 }),
      `${fmtNum(s.sold, digits)} ${p.unit} à ${fmtNum(s.price, p.priceDigits)} € (Marktvolumen ${fmtNum(s.demand, 0)} ${p.unit})`,
    );
  });

  const lagerRows = PRODUCTS.map((p) => {
    const s = b.sales?.[p.id];
    if (!s || s.leftover <= 0.01) return null;
    const digits = qtyDigits(p);
    return row(iconLabel(p.icon, `${p.label} ins Versteck`, { size: 15 }), `${fmtNum(s.leftover, digits)} ${p.unit}`);
  });

  const sections = [
    section("cannabis", "Erzeugung", [
      row("Erntehelfer", `${b.fieldWorkers} von ${b.landCapacity} ha Anbaufläche`),
      row("Bodenfaktor · Wetter", `${fmtNum(b.soilFactorPct, 0)}% · ${fmtNum(b.weatherYieldMultPct, 0)}%`),
      ...produktionRows,
      b.feedNeeded > 0 ? row("Grundstoff fürs Labor", `${fmtNum(b.feedNeeded, 1)} t Koka (gedeckt: ${fmtNum(b.feedUsed, 1)} t)`) : null,
    ]),
    section("store", "Verkauf & Erlös", [
      ...verkaufRows,
      b.marketWorkerBonusPct > 0 ? row("Vertriebs-Bonus", `+${fmtNum(b.marketWorkerBonusPct, 1)}%`) : null,
      row("= Bruttoerlös", fmtEUR(b.grossRevenue)),
    ]),
    section("cash", "Betriebskosten", [
      row(`Sold (${b.totalAssigned} Mitglieder)`, fmtEUR(b.wages)),
      b.irrigationCost ? row("Bewässerung", fmtEUR(b.irrigationCost)) : null,
      b.vaccinationCost ? row("Bestechung", fmtEUR(b.vaccinationCost)) : null,
      b.soilCareCost ? row("Plantagenpflege", fmtEUR(b.soilCareCost)) : null,
      row(
        "Schmuggel",
        `${fmtEUR(b.machineryCost)} (Ausbau −${fmtNum(b.buildingDiscountPct, 0)}%, Zustand +${fmtNum(b.machineConditionPenaltyPct, 0)}%${b.dieselMultiplier > 1 ? ", Fahndungsdruck ×" + b.dieselMultiplier : ""})`,
      ),
      b.storageCost ? row("Versteckkosten", fmtEUR(b.storageCost)) : null,
      b.milkSpoiled > 0.5 ? row("Meth-Schwund", `${fmtNum(b.milkSpoiled, 0)} g`) : null,
      b.interest > 0 ? row("Zinsen", `${fmtEUR(b.interest)} (${Math.round((b.interest / Math.max(1, b.debtAfter - (b.borrow || 0) + (b.repay || 0))) * 100)} % auf Kredit)`) : null,
      row("= Betriebskosten", fmtEUR(b.operatingCosts)),
    ]),
    section("trendUp", "Ergebnis", [
      row("Bruttoerlös − Kosten", fmtEUR(b.grossRevenue - b.operatingCosts)),
      b.bribeBonus ? row("+ Bonus (korrupte Beamte)", fmtEUR(b.bribeBonus)) : null,
      b.investmentCost ? row(`− Investition (${b.hireWorkers} Mitgl., ${b.buyLand} ha)`, `−${fmtEUR(b.investmentCost)}`) : null,
      b.seizure ? row("− Beschlagnahmt (Spitzel)", `−${fmtEUR(b.seizure)}`) : null,
      b.warPenalty ? row("− Überfälle (Bandenkrieg)", `−${fmtEUR(b.warPenalty)}`) : null,
      b.stormLossValue > 0 ? row("− Unwetter (Lager ungesichert)", `−${fmtEUR(b.stormLossValue)}`) : null,
      b.borrow > 0 ? row("+ Kredit aufgenommen", fmtEUR(b.borrow)) : null,
      b.repay > 0 ? row("− Kredit getilgt", `−${fmtEUR(b.repay)}`) : null,
      row("= Nettoertrag", fmtEUR(b.netRevenue)),
    ]),
    lagerRows.some(Boolean) ? section("crate", "Ins Versteck gegangen", lagerRows) : null,
    section("soil", "Veränderungen", [
      row("Boden", `${b.soilQualityDelta >= 0 ? "+" : ""}${fmtNum(b.soilQualityDelta, 1)}%`),
      row("Moral", `${b.satisfactionDelta >= 0 ? "+" : ""}${fmtNum(b.satisfactionDelta, 1)}%`),
      b.debtAfter > 0 ? row("Offener Kredit", fmtEUR(b.debtAfter)) : null,
      // Negativer Verschleiß heißt: der Ausbau hat mehr repariert als kaputt
      // ging. Als "−1,8% Verschleiß" war das nicht als Verbesserung lesbar.
      b.machineWearPct >= 0
        ? row("Schmuggelverschleiß", `−${fmtNum(b.machineWearPct, 1)}%${b.warExtraWear ? " (davon Bandenkrieg −" + b.warExtraWear + "%)" : ""}`)
        : row("Schmuggel instand gesetzt", `+${fmtNum(-b.machineWearPct, 1)}%`),
    ]),
  ].filter(Boolean);

  if (b.notes && b.notes.length) {
    sections.push(section("note", "Hinweise", b.notes.map((n) => h("div", { class: "bd-note" }, n))));
  }

  return h("div", { class: "breakdown" }, sections);
}
