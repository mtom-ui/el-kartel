// KI-Gegner in vier Stärken.
//
// Ein Bot ist eine ganz normale Organisation (players-Zeile mit bot_level),
// nur dass der Fernseher jede Runde für ihn entscheidet. Er sieht dabei exakt
// das, was ein Mensch auf dem Handy auch sieht: eigene Ressourcen, Wetter,
// Ereignis, Marktvolumen - nicht die Entscheidungen der anderen. Alles
// Zufällige wird aus Spiel-Seed, Runde und Spieler-ID abgeleitet, damit ein
// Neuladen des TVs dieselbe Entscheidung reproduziert.
//
// Die vier Stufen unterscheiden sich in dem, was sie "verstanden" haben:
//   leicht      - verteilt nach festem Schema, ignoriert den Markt, verkauft
//                 immer zum Marktpreis, vergisst Reaktionen, investiert nie.
//                 Überbaut das Labor (der klassische Anfängerfehler).
//   mittel      - richtet die Produktion grob am eigenen Marktanteil aus,
//                 passt Preise vorsichtig an, reagiert auf Ereignisse,
//                 investiert moderat, wenn die Kapazität ausgereizt ist.
//   schwer      - die Strategie aus dem Balancing ("meister"): exakte
//                 Marktanteils-Planung, situative Preise, alle Reaktionen,
//                 nutzt die eigene Rolle aus, investiert gezielt und früh.
//   sehr schwer - wie schwer, aber ohne das kleine Zufallsrauschen bei der
//                 Marktanteils-Planung (rechnet exakt), zielt noch stärker
//                 über den fairen Anteil hinaus, bepreist feiner gestuft und
//                 knapper an der Kante, und investiert mit kleinerem
//                 Kassenpuffer schneller in mehr Kapazität.

import { PRODUCTS, FIELD_PRODUCTS, STOCK_COLUMN } from "./products.js";
import { ROLES } from "./roles.js";
import { COSTS } from "./engine.js";
import { HIRE_WORKER_COST, BUY_LAND_COST, MAX_HIRE_PER_ROUND, MAX_LAND_PER_ROUND, CREDIT_LIMIT, CREDIT_STEP } from "./constants.js";
import { roundRng } from "./rng.js";

export const BOT_LEVELS = [
  { id: "easy", label: "Leicht", hint: "Spielt nach Schema, übersieht den Markt." },
  { id: "medium", label: "Mittel", hint: "Plant am Marktanteil entlang, reagiert auf Ereignisse." },
  { id: "hard", label: "Schwer", hint: "Rechnet genau, bepreist situativ, investiert gezielt." },
  { id: "very_hard", label: "Sehr schwer", hint: "Wie Schwer, aber ohne Rauschen, schärfere Preise, investiert früher und mehr." },
];

export const BOT_LEVELS_BY_ID = Object.fromEntries(BOT_LEVELS.map((l) => [l.id, l]));

// Erfundene Organisationen - keine realen Namen oder Kartelle.
const BOT_NAMES = [
  { name: "Doña Consuelo", gender: "f" },
  { name: "Don Emilio", gender: "m" },
  { name: "Los Cuervos", gender: null },
  { name: "Hermanos Ruiz", gender: "m" },
  { name: "La Viuda", gender: "f" },
  { name: "El Profesor", gender: "m" },
  { name: "Familie Ortega", gender: null },
  { name: "El Tiburón", gender: "m" },
  { name: "Clan Salazar", gender: null },
  { name: "Señora Iturbe", gender: "f" },
  { name: "El Silencio", gender: "m" },
  { name: "Los Vega", gender: null },
];

export function isBot(player) {
  return !!player?.bot_level;
}

/** Freier Name aus dem Pool (mit Geschlecht fürs passende Profilbild),
 * sonst nummeriert. */
export function pickBotName(existingNames, rng) {
  const taken = new Set(existingNames);
  const free = BOT_NAMES.filter((n) => !taken.has(n.name));
  if (free.length) return free[Math.floor(rng() * free.length)];
  let i = 1;
  while (taken.has(`Organisation ${i}`)) i++;
  return { name: `Organisation ${i}`, gender: null };
}

/** Noch nicht vergebene Rolle, sonst irgendeine. */
export function pickBotRole(takenRoles, rng) {
  const taken = new Set(takenRoles);
  const free = ROLES.filter((r) => !taken.has(r.id));
  const pool = free.length ? free : ROLES;
  return pool[Math.floor(rng() * pool.length)].id;
}

// ---------------------------------------------------------------------------

const PROFILES = {
  easy: {
    marketAware: false,
    labCap: 2,
    priceMode: "flat",
    irrigationChance: 0.3,
    bribeOn: ["epidemic"],
    soilCareBelow: 55,
    warDefense: false,
    invest: "none",
    marketWorkers: 3,
    buildingWorkers: 2,
  },
  medium: {
    marketAware: true,
    shareNoise: 0.2,
    targetMult: 1.0,
    // Traut dem Labor nicht ganz und baut es kleiner, als der Markt hergibt -
    // ein typischer Mittelweg, der solide Erträge bringt, aber Potenzial
    // liegen lässt.
    labFactor: 0.65,
    priceMode: "mild",
    irrigationChance: 1,
    bribeOn: ["epidemic", "subsidy"],
    soilCareBelow: 85,
    warDefense: true,
    invest: "moderate",
    // Fester Vertriebs-Posten, unabhängig davon, ob sich das gerade rechnet.
    marketMode: "fixed",
    marketWorkers: 3,
    buildingWorkers: 2,
  },
  hard: {
    marketAware: true,
    shareNoise: 0.05,
    // Über dem fairen Anteil, aber nur so weit, wie es Mitspieler gibt, denen
    // man Anteil abnehmen kann: der Markt wird nach Menge gewichtet, allein
    // am Markt wäre Mehrausstoß dagegen reiner Verderb. Siehe targetFor().
    targetMult: null,
    priceMode: "adaptive",
    irrigationChance: 1,
    bribeOn: ["epidemic", "subsidy"],
    soilCareBelow: 88,
    warDefense: true,
    labFactor: 1,
    invest: "smart",
    marketMode: "surplus",
    marketWorkers: 0,
    buildingWorkers: 2,
  },
  very_hard: {
    marketAware: true,
    // Kein Rauschen mehr auf der Marktanteils-Planung - anders als "schwer"
    // rechnet dieser Bot jede Runde exakt denselben Plan, ohne die kleine
    // Unschärfe, die dort noch für Menschlichkeit sorgt.
    shareNoise: 0,
    targetMult: null,
    // Stärkerer Aufschlag auf den fairen Anteil als "schwer" (0.3) - siehe
    // targetBonus-Auswertung weiter unten.
    targetBonus: 0.45,
    priceMode: "sharp",
    irrigationChance: 1,
    bribeOn: ["epidemic", "subsidy"],
    soilCareBelow: 92,
    warDefense: true,
    labFactor: 1,
    invest: "smart",
    // Kleinerer Kassenpuffer, mehr Zukauf pro Runde als "schwer" (6000/3).
    investBuffer: 4000,
    investPerRound: 4,
    marketMode: "surplus",
    marketWorkers: 0,
    buildingWorkers: 2,
  },
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function emptyWorkers() {
  return { wheat: 0, rapeseed: 0, potato: 0, milk: 0, building: 0, market: 0 };
}

/**
 * Entscheidung eines Bots für die aktuelle Runde. Liefert genau die Struktur,
 * die auch das Handy abschickt.
 */
export function decideForBot(player, res, ctx, playerCount, round, gameSeed) {
  const level = PROFILES[player.bot_level] ? player.bot_level : "medium";
  const P = PROFILES[level];
  const rng = roundRng(gameSeed, round, `bot:${player.id}`);
  const role = player.role;
  const share = 1 / Math.max(1, playerCount);

  const workers = emptyWorkers();
  let free = res.workers;
  let landFree = res.land_ha;

  // --- Reaktionen auf Wetter & Ereignis -----------------------------------
  const irrigation = ctx.weather.id === "drought" && rng() < P.irrigationChance;
  const vaccinateWanted = P.bribeOn.includes(ctx.marketEvent.id) || (role === "polizist" && level !== "easy");
  // Dauerregen: ohne Pflege schwemmt der Boden aus - Mittel/Schwer reagieren.
  const rainCare = ctx.weather.soilDrainWithoutCare && P.marketAware;
  const soilCare =
    rainCare || res.soil_quality < P.soilCareBelow || (role === "botaniker" && (level === "hard" || level === "very_hard") && res.soil_quality < 95);

  // --- Ausbau (Schmuggel) ---------------------------------------------------
  // Zwei Leute halten den Fuhrpark und senken die Schmuggelkosten; beim
  // Bandenkrieg sind zwei außerdem die Schwelle, ab der Überfälle ausbleiben.
  // Unwetter sichert man wie den Bandenkrieg: zwei Leute im Ausbau.
  const needsGuard = (P.warDefense && ctx.marketEvent.id === "cartel_war") || (P.marketAware && ctx.weather.storageLossWithoutBuilding);
  const wantBuilding = needsGuard ? Math.max(2, P.buildingWorkers) : P.buildingWorkers;
  workers.building = Math.min(wantBuilding, free);
  free -= workers.building;

  // --- Produktion ----------------------------------------------------------
  const soilFactor = clamp(res.soil_quality / 100, 0.4, 1.3);
  const weatherMult = irrigation ? ctx.weather.yieldMultiplierIrrigation : ctx.weather.yieldMultiplierNoIrrigation;
  const methYield = 225 * (role === "koch" ? 1.25 : 1) * (ctx.marketEvent.id === "epidemic" && !vaccinateWanted ? 0.7 : 1);
  const feedPerLab = COSTS.feedPerLivestockWorker;
  const kokaPerWorker = 0.5 * soilFactor * weatherMult * (ctx.markets.wheat.yieldMult || 1);
  // Kälteeinbruch u. ä. treffen einzelne Kulturen - der marktbewusste Bot
  // rechnet das je Erzeugnis ein und verschiebt Leute automatisch.
  const perWorkerOf = (p) => p.yieldPerWorker * soilFactor * weatherMult * (ctx.markets[p.id].yieldMult || 1) * ((ctx.weather.productYield || {})[p.id] || 1);

  if (!P.marketAware) {
    // Leicht: festes Schema, Markt spielt keine Rolle. Vertrieb kommt fest
    // vor der Produktion - so wie Anfänger die Liste von oben nach unten
    // ausfüllen.
    workers.market = Math.min(P.marketWorkers, free);
    free -= workers.market;
    // Nur die Hälfte der Leute geht aufs Feld - der Rest bleibt teils
    // ungenutzt, so wie Anfänger die Fläche selten voll ausreizen.
    const field = Math.min(landFree, Math.round(res.workers * 0.5));
    workers.wheat = Math.round(field * 0.55);
    workers.rapeseed = Math.round(field * 0.2);
    workers.potato = Math.max(0, field - workers.wheat - workers.rapeseed);
    free -= field;
    landFree -= field;
    const feedAvail = (res.grain_tons || 0) + workers.wheat * kokaPerWorker;
    workers.milk = clamp(Math.floor(feedAvail / feedPerLab), 0, Math.min(P.labCap, free));
    free -= workers.milk;
  } else {
    // Mittel/Schwer: am eigenen Anteil des Marktvolumens entlang planen.
    // Reihenfolge nach Wert je Kopf: erst das Labor (bester Ertrag je
    // Mitglied), dann Koka als dessen Grundstoff, dann die Felder nach
    // Marktwert. Vertrieb bekommt nur, was danach noch übrig ist.
    const noise = () => 1 + (rng() * 2 - 1) * P.shareNoise;
    const mult = P.targetMult ?? 1 + (P.targetBonus ?? 0.3) * (1 - share);
    const target = share * mult;

    if (P.marketMode === "fixed") {
      workers.market = Math.min(P.marketWorkers, free);
      free -= workers.market;
    }

    // Labor - so groß, wie Marktanteil UND Fläche für den Grundstoff tragen.
    let methPlan = Math.round((Math.max(0, ctx.markets.milk.demand * target * noise() - (res.milk_liters || 0)) / methYield) * (P.labFactor ?? 1));
    const feedStock = res.grain_tons || 0;
    const kokaCap = Math.floor((feedStock + landFree * kokaPerWorker) / feedPerLab);
    methPlan = clamp(methPlan, 0, Math.min(kokaCap, free));

    const feedWorkers = Math.ceil(Math.max(0, methPlan * feedPerLab - feedStock) / Math.max(0.01, kokaPerWorker));
    const plan = {};
    for (const p of FIELD_PRODUCTS) {
      const stock = res[STOCK_COLUMN[p.id]] || 0;
      const need = Math.max(0, ctx.markets[p.id].demand * target * noise() - stock);
      plan[p.id] = Math.ceil(need / Math.max(0.01, perWorkerOf(p)));
    }

    // Labor + Grundstoff zuerst festnageln.
    workers.milk = methPlan;
    free -= methPlan;
    workers.wheat = Math.min(feedWorkers, free, landFree);
    free -= workers.wheat;
    landFree -= workers.wheat;

    // Restliche Felder nach Marktwert je Kopf.
    const order = [...FIELD_PRODUCTS].sort((a, b) => ctx.markets[b.id].price * perWorkerOf(b) - ctx.markets[a.id].price * perWorkerOf(a));
    for (const p of order) {
      const already = workers[p.id];
      const take = clamp(plan[p.id] - already, 0, Math.min(free, landFree));
      workers[p.id] += take;
      free -= take;
      landFree -= take;
    }

    // Vertrieb aus dem Überschuss: +2,5% (Verkäufer 3,5%) je Kopf auf den
    // Bruttoerlös - lohnt nur, solange das mehr bringt als der Sold.
    const grossEstimate = PRODUCTS.reduce((s, p) => {
      const perWorker = p.group === "field" ? perWorkerOf(p) : methYield;
      return s + (workers[p.id] * perWorker + (res[STOCK_COLUMN[p.id]] || 0)) * ctx.markets[p.id].price;
    }, 0);
    const bonusPerWorker = role === "verkaeufer" ? 0.035 : 0.025;
    const marketCap = role === "verkaeufer" ? 9 : 10;
    if (P.marketMode === "surplus" && grossEstimate * bonusPerWorker > COSTS.wagePerWorker * 1.3) {
      workers.market = Math.min(marketCap, free);
      free -= workers.market;
    }
  }

  // --- Preise --------------------------------------------------------------
  // Grundpreis 100%. Nur wer mehr anbietet, als der eigene Anteil hergibt,
  // geht runter (mehr Gewicht am Markt); wer deutlich drunter liegt, darf
  // sich etwas Marge gönnen. Für Erzeugnisse ohne eigenes Angebot ist der
  // Preis egal.
  const sell = {};
  for (const p of PRODUCTS) {
    let ratio = 1;
    if (P.priceMode !== "flat") {
      const stock = res[STOCK_COLUMN[p.id]] || 0;
      const perWorker = p.group === "field" ? perWorkerOf(p) : methYield;
      const est = workers[p.id] * perWorker + stock;
      const pool = ctx.markets[p.id].demand * share;
      const pressure = pool > 0 ? est / pool : 0;
      if (est > 0) {
        if (P.priceMode === "mild") {
          ratio = pressure > 1.3 ? 0.9 : pressure < 0.5 ? 1.1 : 1;
        } else if (P.priceMode === "sharp") {
          // Feiner gestufter als "adaptive" (schwer) und geht näher an die
          // Kante: reagiert schon bei geringerer Über-/Unterdeckung und
          // räumt das Versteck konsequenter leer.
          ratio = pressure > 1.5 ? 0.8 : pressure > 1.15 ? 0.9 : pressure < 0.35 ? 1.15 : pressure < 0.6 ? 1.05 : 1;
          if (stock > 0 && pressure > 1) ratio = Math.min(ratio, 0.85);
        } else {
          ratio = pressure > 1.3 ? 0.9 : pressure < 0.5 ? 1.1 : 1;
          // Volles Versteck bei knappem Markt: lieber leeren als lagern.
          if (stock > 0 && pressure > 1) ratio = Math.min(ratio, 0.9);
        }
      }
    }
    sell[p.id] = { priceRatio: ratio };
  }

  // --- Investition ---------------------------------------------------------
  // Nur wenn die Kapazität wirklich bindet, und nur früh genug, dass sich der
  // Kauf in den verbleibenden Runden noch amortisiert.
  const invest = { hireWorkers: 0, buyLand: 0 };
  const credit = { borrow: 0, repay: 0 };
  const debt = res.debt || 0;
  const firstInvestRound = P.invest === "smart" ? 1 : 3;
  const lastInvestRound = P.invest === "smart" ? 6 : 6;
  if (P.invest !== "none" && round >= firstInvestRound && round <= lastInvestRound) {
    const buffer = P.investBuffer ?? (P.invest === "smart" ? 6000 : 14000);
    const perRound = P.investPerRound ?? (P.invest === "smart" ? 3 : 1);
    let spend = Math.max(0, player.cash - buffer);
    const landBound = landFree <= 0;
    const peopleBound = free <= 0;
    // Kredit: nur Schwer, nur früh, und nur für das, was die Kapazität gerade
    // wirklich bremst. Geliehen wird exakt die Lücke zwischen Wunsch und
    // Kasse - kein Geld auf Vorrat, das nur Zinsen frisst.
    if (P.invest === "smart" && round <= 3 && debt < CREDIT_LIMIT) {
      const wish = (landBound ? perRound * BUY_LAND_COST : 0) + (peopleBound ? perRound * HIRE_WORKER_COST : 0);
      const gap = wish - spend;
      if (gap > 0) {
        credit.borrow = Math.min(CREDIT_LIMIT - debt, Math.ceil(gap / CREDIT_STEP) * CREDIT_STEP);
        spend += credit.borrow;
      }
    }
    if (landBound) {
      const n = Math.min(perRound, MAX_LAND_PER_ROUND, Math.floor(spend / BUY_LAND_COST));
      invest.buyLand = n;
      spend -= n * BUY_LAND_COST;
    }
    if (peopleBound) {
      invest.hireWorkers = Math.min(perRound, MAX_HIRE_PER_ROUND, Math.floor(spend / HIRE_WORKER_COST));
    }
  }
  // Tilgen, sobald Luft in der Kasse ist - ab Runde 5 in jedem Fall, was geht.
  if (debt > 0 && credit.borrow === 0 && (round >= 5 || player.cash > debt + 15000)) {
    credit.repay = Math.min(debt, Math.floor(Math.max(0, player.cash - 8000) / CREDIT_STEP) * CREDIT_STEP);
  }

  const vaccinate = vaccinateWanted && workers.milk > 0;

  return { workers, irrigation, vaccinate, soilCare, sell, invest, credit };
}

/** Kleine "Bedenkzeit" in Millisekunden, damit Bots nicht im selben Moment
 * bestätigen, in dem die Runde beginnt. Deterministisch je Bot und Runde. */
export function botThinkDelay(player, round, gameSeed) {
  const rng = roundRng(gameSeed, round, `delay:${player.id}`);
  return 1500 + Math.floor(rng() * 3500);
}
