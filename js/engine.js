import { makeRng, pick, roundRng } from "./rng.js";
import {
  STARTING_CASH,
  STARTING_RESOURCES,
  HIRE_WORKER_COST,
  BUY_LAND_COST,
  MAX_HIRE_PER_ROUND,
  MAX_LAND_PER_ROUND,
  FINANCE_SCORE_TARGET,
  CREDIT_LIMIT,
  CREDIT_INTEREST,
  SATURATION_OVER,
  SATURATION_SCARCE,
  SATURATION_PRICE_SHIFT,
} from "./constants.js";
import { PRODUCTS, PRODUCTS_BY_ID, FIELD_PRODUCTS, STOCK_COLUMN } from "./products.js";
import { roleEffect } from "./roles.js";

// ---------------------------------------------------------------------------
// Wetter & Marktereignisse
// ---------------------------------------------------------------------------

// Jede Wetterlage außer "normal" verlangt eine andere Antwort - vorher
// musste man nur bei Dürre reagieren, alles andere war Kulisse:
//   Dürre        -> Bewässerung, sonst -35% Ernte
//   Dauerregen   -> Plantagenpflege, sonst schwemmt der Boden aus (-4 extra)
//   Unwetter     -> mind. 2 im Ausbau, sonst gehen 20% des Feld-Vorrats verloren
//   Kälteeinbruch-> Umverteilen: Mohn/Cannabis -30%, Koka -10%, Labor unberührt
export const WEATHER_POOL = [
  {
    id: "normal",
    icon: "cloud",
    name: "Normales Wetter",
    description: "Durchschnittliches Jahr, keine besonderen Ausschläge.",
    yieldMultiplierNoIrrigation: 1,
    yieldMultiplierIrrigation: 1,
    energyMultiplier: 1,
  },
  {
    id: "rain",
    icon: "rain",
    name: "Dauerregen",
    description: "Die Felder tragen 10% mehr – aber der Boden schwemmt aus: ohne Plantagenpflege verliert er zusätzlich 4 Punkte.",
    yieldMultiplierNoIrrigation: 1.1,
    yieldMultiplierIrrigation: 1.05,
    energyMultiplier: 0.95,
    soilDrainWithoutCare: 4,
  },
  {
    id: "drought",
    icon: "sun",
    name: "Dürresommer",
    description: "Ohne Bewässerung sinken die Ernten um 35%, der Boden leidet zusätzlich.",
    yieldMultiplierNoIrrigation: 0.65,
    yieldMultiplierIrrigation: 0.95,
    energyMultiplier: 1.5,
  },
  {
    id: "storm",
    icon: "storm",
    name: "Unwetter",
    description: "Sturm drückt die Ernte um 15% und reißt Lager auf: ohne mindestens 2 Mitglieder im Ausbau gehen 20% des Feld-Vorrats verloren, Transporte kosten ein Drittel mehr.",
    yieldMultiplierNoIrrigation: 0.85,
    yieldMultiplierIrrigation: 0.85,
    energyMultiplier: 1.1,
    storageLossWithoutBuilding: 0.2,
    machineryCostMult: 1.3,
    extraWear: 3,
  },
  {
    id: "frost",
    icon: "frost",
    name: "Kälteeinbruch",
    description: "Frost trifft die empfindlichen Kulturen: Mohn und Cannabis −30%, Koka −10%. Das Labor läuft normal – wer umverteilt, kommt glimpflich davon.",
    yieldMultiplierNoIrrigation: 1,
    yieldMultiplierIrrigation: 1,
    energyMultiplier: 1.2,
    productYield: { wheat: 0.9, rapeseed: 0.7, potato: 0.7 },
  },
];

// priceMult / demandMult / yieldMult greifen je Produkt-ID; alles, was nicht
// genannt ist, bleibt bei 1. So kann ein Ereignis gezielt einen einzelnen
// Markt treffen, statt immer alle gleichzeitig.
export const MARKET_POOL = [
  {
    id: "stable",
    icon: "steady",
    name: "Ruhige Straße",
    description: "Keine besonderen Ausschläge bei Preisen oder Nachfrage.",
    operatingCostMultiplier: 1,
  },
  {
    id: "wheat_boom",
    icon: "trendUp",
    name: "Koka-Boom",
    description: "Koka ist auf der Straße knapp: +20% Preis und deutlich mehr Abnahme.",
    operatingCostMultiplier: 1,
    priceMult: { wheat: 1.2 },
    demandMult: { wheat: 1.3 },
  },
  {
    id: "biodiesel",
    icon: "poppy",
    name: "Heroin-Nachfrage steigt",
    description: "Abnehmer reißen sich um Mohn zur Heroin-Produktion: +35% Preis, +30% Abnahme.",
    operatingCostMultiplier: 1,
    priceMult: { rapeseed: 1.35 },
    demandMult: { rapeseed: 1.3 },
  },
  {
    id: "potato_blight",
    icon: "alert",
    name: "Schimmelbefall in den Plantagen",
    description: "Pilzbefall vernichtet 40% der Cannabis-Ernte – der Preis zieht dafür an.",
    operatingCostMultiplier: 1,
    yieldMult: { potato: 0.6 },
    priceMult: { potato: 1.4 },
  },
  {
    id: "diesel_crisis",
    icon: "siren",
    name: "Fahndungsdruck steigt",
    description: "Mehr Kontrollen verdoppeln die Betriebskosten (Bestechung, Umwege) – überall weniger absetzbar.",
    operatingCostMultiplier: 2,
    demandMult: { wheat: 0.8, rapeseed: 0.8, potato: 0.8, milk: 0.8 },
  },
  {
    id: "subsidy",
    icon: "envelope",
    name: "Korrupte Beamte",
    description: "Günstigere Bestechungsgelder. Wer diese Runde tatsächlich Behörden besticht, bekommt zusätzlich einen Bar-Bonus.",
    operatingCostMultiplier: 0.9,
    bribeBonus: 2000,
  },
  {
    id: "epidemic",
    icon: "shield",
    name: "Laborrazzien",
    description:
      "Erhöhter Fahndungsdruck auf Labore; ungeschützte Labore (ohne Bestechung) verlieren 30% Ertrag. Razzien drücken den Meth-Absatz.",
    operatingCostMultiplier: 1,
    priceMult: { milk: 0.8 },
    demandMult: { milk: 0.6 },
  },
  {
    id: "export_boom",
    icon: "ship",
    name: "Exportboom",
    description: "Starke Nachfrage aus dem Ausland – alle Märkte nehmen deutlich mehr ab.",
    operatingCostMultiplier: 1,
    priceMult: { wheat: 1.05, rapeseed: 1.05, potato: 1.05, milk: 1.05 },
    demandMult: { wheat: 1.35, rapeseed: 1.35, potato: 1.35, milk: 1.3 },
  },
  {
    id: "trade_restriction",
    icon: "barrier",
    name: "Grenzkontrollen verschärft",
    description: "Neue Kontrollen erschweren den Schmuggel – überall deutlich weniger absetzbar, und die Abnehmer drücken die Preise.",
    operatingCostMultiplier: 1,
    priceMult: { wheat: 0.9, rapeseed: 0.9, potato: 0.9, milk: 0.9 },
    demandMult: { wheat: 0.65, rapeseed: 0.65, potato: 0.65, milk: 0.65 },
  },
  {
    id: "informant",
    icon: "eye",
    name: "Spitzel im Versteck",
    description:
      "Ein Verräter verpfeift euch an die Polizei: 6% eures Bargelds werden beschlagnahmt. Ein korrupter Polizist in der Crew schützt einen Großteil davon.",
    operatingCostMultiplier: 1,
    cashSeizurePct: 0.06,
  },
  {
    id: "task_force",
    icon: "siren",
    name: "Sonderkommission",
    description: "Eine Ermittlungsgruppe durchkämmt die Stadt: 60% höhere Betriebskosten, überall weniger Absatz und schlechtere Preise.",
    operatingCostMultiplier: 1.6,
    priceMult: { wheat: 0.92, rapeseed: 0.92, potato: 0.92, milk: 0.92 },
    demandMult: { wheat: 0.75, rapeseed: 0.75, potato: 0.75, milk: 0.75 },
  },
  {
    id: "cartel_war",
    icon: "swords",
    name: "Bandenkrieg mit Rivalen",
    description:
      "Ein rivalisierendes Kartell greift eure Transportwege an. Ohne mindestens 2 Mitglieder im Schmuggel kostet euch das 1.500 € und beschädigt den Fuhrpark.",
    operatingCostMultiplier: 1,
    warRisk: true,
    warCashPenalty: 1500,
  },
  {
    id: "new_route",
    icon: "road",
    name: "Neue Schmuggelroute eröffnet",
    // Reine Nachfrage-Boni sind wirkungslos für alle, die ohnehin unter ihrem
    // Marktanteil produzieren (gemessen: +192 €). Deshalb wirkt die Route
    // zusätzlich auf die Preise - das greift immer und macht sie zum stärksten
    // positiven Ereignis (+1.632 €), spiegelbildlich zu den harten Negativen.
    description: "Eine frisch erschlossene Route bringt bessere Abnehmer: höhere Preise, deutlich mehr Absatz und stark gesenkte Betriebskosten.",
    operatingCostMultiplier: 0.6,
    priceMult: { wheat: 1.12, rapeseed: 1.12, potato: 1.12, milk: 1.12 },
    demandMult: { wheat: 1.3, rapeseed: 1.3, potato: 1.3, milk: 1.3 },
  },
];

function mult(map, id) {
  return (map && map[id]) || 1;
}

function seededDemand(gameSeed, round, product) {
  const [min, max] = product.demandRange;
  const rng = roundRng(gameSeed, round, `demand:${product.id}`);
  return min + rng() * (max - min);
}

// Mit mehr Organisationen wächst der gemeinsame Markttopf (sublinear, n^0.6),
// weil eine reine Vervielfachung mit n das Spiel ab sechs Spielern
// mathematisch unspielbar gemacht hat. Alle Organisationen konkurrieren um
// denselben Topf (siehe allocateMarket) statt je eine eigene Garantiemenge
// zu bekommen.
function poolScale(playerCount) {
  return Math.pow(Math.max(1, playerCount), 0.6);
}

// Wie stark der Markt mitwächst, wenn die Organisationen ausbauen. 0,5 heißt:
// verdoppeln alle ihre Kapazität, wächst der Markt nur um 50%.
export const MARKET_GROWTH_SHARE = 0.5;

/**
 * Der Absatzmarkt wächst mit dem durchschnittlichen Ausbaustand ALLER
 * Organisationen - aber nur halb so schnell wie diese wachsen.
 *
 * Grund: ohne das war "Geld in Kapazität stecken" ein reines Verlustgeschäft
 * (simuliert: wer nichts investiert, hatte am Ende 35.218 €, wer moderat
 * investiert nur 16.049 €), weil der Markttopf fix war und jede zusätzliche
 * Produktion unverkäuflich blieb. Mit der Kopplung lohnt sich Ausbau
 * (+18% statt +11% gegenüber Nichtstun), ohne dass der Markt locker wird:
 * Baut niemand aus, bleibt er exakt so eng wie zuvor, und wer schneller
 * wächst als der Markt, produziert weiter an der Nachfrage vorbei.
 */
export function capacityFactor(resourcesList) {
  if (!resourcesList || !resourcesList.length) return 1;
  const avg =
    resourcesList.reduce(
      (s, r) =>
        s +
        ((r.workers || STARTING_RESOURCES.workers) / STARTING_RESOURCES.workers) * 0.5 +
        ((r.land_ha || STARTING_RESOURCES.land_ha) / STARTING_RESOURCES.land_ha) * 0.5,
      0,
    ) / resourcesList.length;
  return 1 + MARKET_GROWTH_SHARE * (clamp(avg, 1, 3) - 1);
}

/**
 * Marktgedächtnis: Aus den gespeicherten Rundenergebnissen der letzten zwei
 * Runden wird je Erzeugnis abgeleitet, ob der Markt zweimal hintereinander
 * überversorgt (-15% Grundpreis) oder knapp (+15%) war. Der Fernseher und
 * alle Handys lesen dieselben Ergebnisse, kommen also auf dieselben Preise.
 *
 * results: Zeilen aus round_results (mit .round und .breakdown), beliebige
 * Runden - es zählen nur round-1 und round-2.
 */
export function priceMemory(results, round) {
  const memory = {};
  if (round < 3) return memory;
  const ratioFor = (r) => {
    const rows = results.filter((x) => x.round === r && x.breakdown?.sales);
    if (!rows.length) return null;
    const out = {};
    for (const p of PRODUCTS) {
      const pool = rows[0].breakdown.sales[p.id]?.demand || 0;
      // Koka, das im Labor verschwindet, zählt als Angebot mit - sonst wäre
      // der Koka-Markt dauerhaft "knapp", nur weil alle ihr Labor füttern.
      const offered = rows.reduce(
        (s, x) => s + (x.breakdown.sales[p.id]?.available || 0) + (p.id === "wheat" ? x.breakdown.feedUsed || 0 : 0),
        0,
      );
      out[p.id] = pool > 0 ? offered / pool : null;
    }
    return out;
  };
  const a = ratioFor(round - 1);
  const b = ratioFor(round - 2);
  if (!a || !b) return memory;
  for (const p of PRODUCTS) {
    const ra = a[p.id];
    const rb = b[p.id];
    if (ra == null || rb == null) continue;
    if (ra >= SATURATION_OVER && rb >= SATURATION_OVER) memory[p.id] = { mult: 1 - SATURATION_PRICE_SHIFT, state: "over" };
    else if (ra <= SATURATION_SCARCE && rb <= SATURATION_SCARCE) memory[p.id] = { mult: 1 + SATURATION_PRICE_SHIFT, state: "scarce" };
  }
  return memory;
}

export function buildRoundContext(gameSeed, round, playerCount = 1, marketGrowth = 1, memory = {}) {
  const weather = pick(roundRng(gameSeed, round, "weather"), WEATHER_POOL);
  const marketEvent = pick(roundRng(gameSeed, round, "market"), MARKET_POOL);
  const scale = poolScale(playerCount) * (marketGrowth || 1);

  const markets = {};
  for (const p of PRODUCTS) {
    const mem = memory[p.id];
    const price = p.basePrice * mult(marketEvent.priceMult, p.id) * (mem ? mem.mult : 1);
    markets[p.id] = {
      price: p.priceDigits === 0 ? Math.round(price) : +price.toFixed(3),
      demand: Math.round(seededDemand(gameSeed, round, p) * mult(marketEvent.demandMult, p.id) * scale),
      yieldMult: mult(marketEvent.yieldMult, p.id),
      memory: mem ? mem.state : null,
    };
  }

  return { round, weather, marketEvent, markets };
}

/** Vertrauliche Prognose fürs Handy - Flavour-Text aus dem Kontext der
 * nächsten Runde, konsistent aber nie sicher. */
export function buildConfidentialForecast(gameSeed, currentRound, playerId) {
  const next = buildRoundContext(gameSeed, currentRound + 1);
  const rng = makeRng((gameSeed ^ (hashPlayer(playerId) + currentRound)) >>> 0);
  const opener = rng() > 0.5 ? "Dein Dealer erwartet" : "In der Szene wird gemunkelt";
  const ev = next.marketEvent;
  if (ev.id === "stable") return `${opener} ein ruhiges Jahr ${currentRound + 1} ohne große Ausschläge.`;
  return `${opener} für Jahr ${currentRound + 1}: ${ev.name}.`;
}

function hashPlayer(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// ---------------------------------------------------------------------------
// Kernsimulation
// ---------------------------------------------------------------------------

const FEED_TONS_PER_LIVESTOCK_WORKER = 0.35; // Koka-Verbrauch des Labors (in Tonnen)
const WAGE_PER_WORKER = 150; // nur für eingeteilte Mitglieder
const VACCINATION_COST_PER_LIVESTOCK_WORKER = 120;
const GRAIN_STORAGE_COST_PER_TON = 4;
const MILK_SPOILAGE_RATE = 0.3;
// Plantagenpflege kostet je Hektar statt pauschal. Vorher war sie ein
// No-Brainer: 1.200 € hielten den Boden dauerhaft auf 100%, egal wie groß das
// Gebiet war - wer expandierte, bekam die Pflege effektiv geschenkt. Bei 15 ha
// (Startgröße) kostet sie unverändert 1.200 €, wächst aber mit dem Gebiet mit.
const SOIL_CARE_COST_PER_HA = 80;
const SOIL_CARE_RECOVERY = 6; // Bodenverbesserung durch Plantagenpflege
const IRRIGATION_COST = 800;

// Die Erzeugnisse haben unterschiedliche Anzeige-Einheiten (t/kg/g); für die
// Lagerkosten (€ je Tonne) werden Mengen erst auf Tonnen normalisiert.
const TONS_PER_UNIT = { t: 1, kg: 0.001, g: 0.000001 };

export const COSTS = {
  wagePerWorker: WAGE_PER_WORKER,
  vaccinationPerWorker: VACCINATION_COST_PER_LIVESTOCK_WORKER,
  soilCarePerHa: SOIL_CARE_COST_PER_HA,
  soilCareRecovery: SOIL_CARE_RECOVERY,
  irrigation: IRRIGATION_COST,
  storagePerTon: GRAIN_STORAGE_COST_PER_TON,
  milkSpoilageRate: MILK_SPOILAGE_RATE,
  feedPerLivestockWorker: FEED_TONS_PER_LIVESTOCK_WORKER,
};

function stockOf(resources, productId) {
  return resources[STOCK_COLUMN[productId]] || 0;
}

function workersFor(decisions, id) {
  return Math.max(0, Math.round((decisions.workers || {})[id] || 0));
}

/**
 * Phase 1: Produktion + Futterverbrauch einer einzelnen Organisation - hängt
 * nicht von den anderen Mitspielern ab (im Gegensatz zum Verkauf, siehe
 * allocateMarket unten).
 *
 * decisions.workers: { wheat, rapeseed, potato, milk, building, market }
 * decisions.irrigation / vaccinate / soilCare: Maßnahmen
 */
export function computeProduction(resources, decisions, ctx, role) {
  const notes = [];

  const fieldWorkers = FIELD_PRODUCTS.reduce((s, p) => s + workersFor(decisions, p.id), 0);
  const livestockWorkers = workersFor(decisions, "milk");
  const buildingWorkers = workersFor(decisions, "building");
  const marketWorkers = workersFor(decisions, "market");
  const totalAssigned = fieldWorkers + livestockWorkers + buildingWorkers + marketWorkers;

  if (totalAssigned > resources.workers) {
    throw new Error(
      `Zugewiesene Mitglieder (${totalAssigned}) übersteigen verfügbare Mitglieder (${resources.workers}).`,
    );
  }

  const soilFactor = clamp(resources.soil_quality / 100, 0.4, 1.3);
  const weatherYieldMult = decisions.irrigation
    ? ctx.weather.yieldMultiplierIrrigation
    : ctx.weather.yieldMultiplierNoIrrigation;

  // Anbaufläche begrenzt die produktiven Erntehelfer. Die Fläche lässt gar
  // nicht mehr zu, aber die Engine rechnet es sicherheitshalber selbst nach.
  const landCapacity = resources.land_ha;
  const fieldEfficiency = fieldWorkers > landCapacity ? landCapacity / fieldWorkers : 1;
  if (fieldWorkers > landCapacity) {
    notes.push(`Nur ${landCapacity} ha Anbaufläche für ${fieldWorkers} Erntehelfer – Ertrag je Kopf sinkt.`);
  }

  const epidemic = ctx.marketEvent.id === "epidemic";
  const vaccinated = !!decisions.vaccinate;
  const epidemicFactor = epidemic && !vaccinated ? 0.7 : 1;

  // --- Produktion ---------------------------------------------------------
  const produced = {};
  for (const p of PRODUCTS) {
    const workers = workersFor(decisions, p.id);
    const market = ctx.markets[p.id];
    let amount = workers * p.yieldPerWorker * market.yieldMult;
    if (p.group === "field") amount *= soilFactor * weatherYieldMult * fieldEfficiency * ((ctx.weather.productYield || {})[p.id] || 1);
    if (p.group === "livestock") {
      amount *= epidemicFactor;
      if (role === "koch") amount *= roleEffect("koch", "methYieldMult", 1);
    }
    produced[p.id] = round2(amount);
  }
  // --- Grundstoff: Labor verbraucht Koka ----------------------------------
  const feedNeeded = round2(livestockWorkers * FEED_TONS_PER_LIVESTOCK_WORKER);
  const wheatAvailable = round2(stockOf(resources, "wheat") + produced.wheat);
  const fedFromWheat = Math.min(feedNeeded, wheatAvailable);
  let feedShortage = false;
  let livestockLoss = 0;
  if (fedFromWheat < feedNeeded - 0.001) {
    feedShortage = true;
    livestockLoss = round2(Math.min(1, (feedNeeded - fedFromWheat) / Math.max(feedNeeded, 1)));
    produced.milk = round2(produced.milk * (1 - livestockLoss));
    notes.push("Grundstoffmangel: Ein Teil der Meth-Produktion musste unter Wert abgegeben werden.");
  }

  // Was am Ende tatsächlich zum Verkauf steht (Lager + Ernte, Weizen abzüglich Futter).
  const available = {};
  for (const p of PRODUCTS) {
    let amt = round2(stockOf(resources, p.id) + produced[p.id]);
    if (p.id === "wheat") amt = round2(amt - fedFromWheat);
    available[p.id] = Math.max(0, amt);
  }

  // Unwetter reißt Lager und Ernte auf: ohne mindestens 2 Mitglieder im
  // Ausbau ist ein Teil der Feld-Ware weg, bevor sie überhaupt zum Verkauf
  // steht. Meth liegt im Labor, das bleibt heil. Sitzt hier (nicht erst nach
  // dem Verkauf), damit auch die Handy-Vorschau den Verlust zeigt.
  const stormLossRate = ctx.weather.storageLossWithoutBuilding && buildingWorkers < 2 ? ctx.weather.storageLossWithoutBuilding : 0;
  const stormLost = {};
  for (const p of FIELD_PRODUCTS) {
    stormLost[p.id] = round2(available[p.id] * stormLossRate);
    available[p.id] = round2(available[p.id] - stormLost[p.id]);
  }
  if (stormLossRate > 0 && Object.values(stormLost).some((x) => x > 0)) {
    notes.push(`Unwetter: Ohne mindestens 2 Mitglieder im Ausbau wurden ${Math.round(stormLossRate * 100)}% der Feld-Ware zerstört.`);
  }

  return {
    notes,
    fieldWorkers,
    livestockWorkers,
    buildingWorkers,
    marketWorkers,
    totalAssigned,
    landCapacity,
    soilFactor,
    weatherYieldMult,
    epidemic,
    vaccinated,
    produced,
    available,
    feedNeeded,
    fedFromWheat,
    feedShortage,
    livestockLoss,
    stormLost,
  };
}

// Wie stark ein niedrigerer Preis den Marktanteil erhöht. Höher = Unterbieten
// wirkt stärker. 2,5 ist aus Simulationen gewählt: Unterbieten bringt spürbar
// mehr Absatz, aber nie den ganzen Topf.
export const PRICE_SHARE_EXPONENT = 2.5;

/**
 * Phase 2: Löst den Verkauf für ALLE Organisationen gemeinsam auf. Jedes
 * Produkt hat pro Runde einen festen, gemeinsamen Markttopf
 * (ctx.markets[id].demand) - alle Organisationen konkurrieren darum.
 *
 * Der Topf wird nach Gewicht verteilt: Menge × Preisattraktivität. Wer
 * günstiger anbietet, bekommt einen deutlich größeren Anteil - aber nie
 * alles. Wer zu viel produziert, bleibt trotzdem auf Ware sitzen.
 *
 * Vorher galt "günstigster zuerst, vollständig bedient". Das war
 * spieltheoretisch kaputt: 15% unter Marktpreis anzubieten hat den kompletten
 * Topf abgeräumt und alle anderen leer ausgehen lassen (simuliert: Abweichler
 * 29.427 € vs. 2.652 € für den Rest, also Faktor 11). Damit war der Preisregler
 * keine Entscheidung mehr, sondern ein Pflichtzug. Mit der Gewichtung liegt der
 * Faktor bei 0,9 - Unterbieten um des Unterbietens willen lohnt nicht mehr,
 * situatives Unterbieten (volles Versteck, enger Markt) dagegen schon.
 *
 * entries: [{ playerId, available: {produktId: menge}, sell: {produktId: {priceRatio}} }]
 * → { [playerId]: { [produktId]: verkaufte Menge } }
 */
export function allocateMarket(ctx, entries) {
  const soldByPlayer = {};
  for (const e of entries) soldByPlayer[e.playerId] = {};

  for (const p of PRODUCTS) {
    let remaining = ctx.markets[p.id].demand;
    const bids = entries
      .map((e) => {
        const qty = e.available[p.id] || 0;
        const ratio = clamp(e.sell?.[p.id]?.priceRatio ?? 1, 0.5, 1.5);
        // weightMult: Rollenbonus (Schmuggler bedient Abnehmer zuerst).
        const weight = qty * Math.pow(1.6 - ratio, PRICE_SHARE_EXPONENT) * (e.weightMult || 1);
        return { playerId: e.playerId, qty, weight, got: 0 };
      })
      .filter((b) => b.qty > 0.0001);

    // Mehrere Durchgänge, damit der Topf nicht bei jemandem verfällt, der
    // weniger anbietet als sein rechnerischer Anteil.
    let active = bids.slice();
    for (let pass = 0; pass < 6 && remaining > 0.0001 && active.length; pass++) {
      const weightSum = active.reduce((s, b) => s + b.weight, 0);
      if (weightSum <= 0) break;
      let used = 0;
      for (const b of active) {
        const share = (b.weight / weightSum) * remaining;
        const give = Math.min(share, b.qty - b.got);
        b.got += give;
        used += give;
      }
      remaining -= used;
      active = active.filter((b) => b.got < b.qty - 0.0001);
      if (used < 0.0001) break;
    }

    for (const e of entries) soldByPlayer[e.playerId][p.id] = 0;
    for (const b of bids) soldByPlayer[b.playerId][p.id] = round2(b.got);
  }

  return soldByPlayer;
}

/**
 * Phase 3: Schließt die Runde für eine Organisation ab (Erlös, Kosten, neue
 * Werte) - braucht die Ergebnisse von computeProduction() und
 * allocateMarket().
 */
export function finalizeRound(resources, player, decisions, ctx, production, sold, role) {
  const notes = [...production.notes];
  const {
    fieldWorkers,
    livestockWorkers,
    buildingWorkers,
    marketWorkers,
    totalAssigned,
    landCapacity,
    soilFactor,
    weatherYieldMult,
    epidemic,
    vaccinated,
    produced,
    available,
    feedNeeded,
    fedFromWheat,
    feedShortage,
    livestockLoss,
  } = production;

  // --- Verkauf (Ergebnis aus allocateMarket) ------------------------------
  const sales = {};
  let grossBeforeBonus = 0;

  for (const p of PRODUCTS) {
    const market = ctx.markets[p.id];
    const priceRatio = clamp(decisions.sell?.[p.id]?.priceRatio ?? 1, 0.5, 1.5);
    const price = p.priceDigits === 0 ? Math.round(market.price * priceRatio) : +(market.price * priceRatio).toFixed(3);
    const soldQty = round2(sold?.[p.id] ?? 0);
    const revenue = round2(soldQty * price);
    const leftover = round2(available[p.id] - soldQty);

    sales[p.id] = { price, priceRatio, demand: market.demand, produced: produced[p.id], available: available[p.id], sold: soldQty, revenue, leftover };
    grossBeforeBonus += revenue;

    if (leftover > 0.01) {
      notes.push(
        `${p.short}: ${fmt(soldQty, p)} von ${fmt(available[p.id], p)} ${p.unit} an den Markt verkauft – ${fmt(leftover, p)} ${p.unit} bleiben im Versteck (Konkurrenz war günstiger oder der Markt war zu klein).`,
      );
    }
  }

  // Verhandlungsgeschick: 2,5%/Mitglied, gedeckelt bei 25% (Verkäufer: mehr).
  const marketBonusPerWorker = roleEffect(role, "marketBonusPerWorker", 0.025);
  const marketBonusCap = roleEffect(role, "marketBonusCap", 0.25);
  const marketWorkerBonus = 1 + Math.min(marketBonusCap, marketWorkers * marketBonusPerWorker);
  const grossRevenue = round2(grossBeforeBonus * marketWorkerBonus);

  // --- Kosten -------------------------------------------------------------
  const wages = totalAssigned * WAGE_PER_WORKER;
  const irrigationCost = decisions.irrigation ? IRRIGATION_COST : 0;
  const bribeCostMult = roleEffect(role, "bribeCostMult", 1);
  const vaccinationCost = vaccinated ? round2(livestockWorkers * VACCINATION_COST_PER_LIVESTOCK_WORKER * bribeCostMult) : 0;
  const soilCareCost = decisions.soilCare ? round2(resources.land_ha * SOIL_CARE_COST_PER_HA) : 0;
  // Korrupte Polizisten federn Fahndungsdruck ab: nur der Aufschlag über 1
  // wird gemildert, Rabatte (z. B. neue Route) bleiben voll erhalten.
  const rawDieselMultiplier = ctx.marketEvent.operatingCostMultiplier;
  const crackdownRelief = roleEffect(role, "crackdownReliefMult", 1);
  const dieselMultiplier =
    rawDieselMultiplier > 1 ? round2(1 + (rawDieselMultiplier - 1) * crackdownRelief) : rawDieselMultiplier;

  // Schmuggler senken die Schmuggelkosten stärker (bis 80% statt 60%).
  const buildingDiscountPerWorker = roleEffect(role, "buildingDiscountPerWorker", 0.1);
  const buildingDiscountCap = roleEffect(role, "buildingDiscountCap", 0.6);
  const buildingDiscount = Math.min(buildingDiscountCap, buildingWorkers * buildingDiscountPerWorker);
  const conditionPenalty = (100 - resources.machine_condition) / 200;
  const weatherCostMult = ctx.weather.machineryCostMult || 1;
  const machineryCost = round2(
    (300 + fieldWorkers * 25) * dieselMultiplier * weatherCostMult * (1 - buildingDiscount) * (1 + conditionPenalty),
  );

  // Versteckkosten nur für lagerfähige Ernte; Meth verliert stattdessen an
  // Reinheit. Schmuggler halbieren beides - sie bewegen Ware, statt sie liegen
  // zu lassen.
  const storedTons = FIELD_PRODUCTS.reduce((s, p) => s + sales[p.id].leftover * TONS_PER_UNIT[p.unit], 0);
  const storageCost = round2(storedTons * GRAIN_STORAGE_COST_PER_TON * roleEffect(role, "storageCostMult", 1));
  const spoilageRate = MILK_SPOILAGE_RATE * roleEffect(role, "spoilageMult", 1);
  const milkSpoiled = round2(sales.milk.leftover * spoilageRate);
  if (milkSpoiled > 0.5) {
    notes.push(`${Math.round(milkSpoiled)} g Meth haben im Versteck an Reinheit verloren (${Math.round(spoilageRate * 100)}% pro Jahr).`);
  }

  // Kredit: Zinsen auf den offenen Stand VOR dieser Runde; neue Aufnahme
  // und Tilgung wirken erst ab jetzt.
  const debtBefore = resources.debt || 0;
  const interest = round2(debtBefore * CREDIT_INTEREST);
  const borrow = clamp(Math.round((decisions.credit?.borrow || 0) / 1000) * 1000, 0, Math.max(0, CREDIT_LIMIT - debtBefore));
  const repay = clamp(Math.round((decisions.credit?.repay || 0) / 1000) * 1000, 0, debtBefore);
  const debtAfter = round2(debtBefore + borrow - repay);
  if (borrow > 0) notes.push(`${borrow.toLocaleString("de-DE")} € Kredit aufgenommen (${Math.round(CREDIT_INTEREST * 100)}% Zinsen je Runde).`);
  if (repay > 0) notes.push(`${repay.toLocaleString("de-DE")} € Kredit getilgt.`);

  const operatingCosts = round2(
    (wages + irrigationCost + vaccinationCost + soilCareCost + machineryCost + storageCost) *
      roleEffect(role, "operatingCostMult", 1) +
      interest,
  );
  const netRevenue = round2(grossRevenue - operatingCosts);

  // --- Investition: Geld kauft dauerhaft mehr Kapazität -------------------
  const hireWorkers = clamp(Math.round(decisions.invest?.hireWorkers || 0), 0, MAX_HIRE_PER_ROUND);
  const buyLand = clamp(Math.round(decisions.invest?.buyLand || 0), 0, MAX_LAND_PER_ROUND);
  const investmentCost = round2(hireWorkers * HIRE_WORKER_COST + buyLand * BUY_LAND_COST);
  if (hireWorkers > 0) notes.push(`${hireWorkers} neue Mitglieder angeworben (+${hireWorkers}).`);
  if (buyLand > 0) notes.push(`${buyLand} ha neue Anbaufläche erschlossen (+${buyLand} ha).`);

  // --- Zustandswerte ------------------------------------------------------
  // Ein Ausbau-Mitglied wartet den Schmuggel spürbar (−1,5%/Runde, Schmuggler
  // noch stärker) - schon 1-2 Mitglieder reichen bei einer normal großen
  // Feldcrew, um den laufenden Verschleiß auszugleichen statt ihn nur zu bremsen.
  const wearReliefMult = roleEffect(role, "wearReliefMult", 1);
  let machineWearPct = round2(clamp(1 + fieldWorkers * 0.15 - buildingWorkers * 1.5 * wearReliefMult + (ctx.weather.extraWear || 0), -4, 10));
  let warExtraWear = 0;
  let warPenalty = 0;
  if (ctx.marketEvent.warRisk && buildingWorkers < 2) {
    warExtraWear = 8;
    warPenalty = ctx.marketEvent.warCashPenalty || 0;
    machineWearPct = round2(machineWearPct + warExtraWear);
    notes.push(
      `Bandenkrieg: Ohne mindestens 2 Mitglieder im Schmuggel wurden Transporte überfallen – ${warPenalty.toLocaleString("de-DE")} € Verlust und +8% Verschleiß.`,
    );
  }
  const machineCondition = clamp(resources.machine_condition - machineWearPct, 0, 100);

  // Jede Feldfrucht zehrt unterschiedlich stark; maßgeblich ist der
  // gewichtete Schnitt über die eingesetzten Feldarbeiter. Botaniker schonen
  // den Boden zusätzlich.
  let cropDrain = 0;
  if (fieldWorkers > 0) {
    cropDrain = FIELD_PRODUCTS.reduce((s, p) => s + workersFor(decisions, p.id) * p.soilDrain, 0) / fieldWorkers;
  }
  cropDrain *= roleEffect(role, "fieldSoilDrainMult", 1);
  const soilCareRecovery = SOIL_CARE_RECOVERY * roleEffect(role, "soilCareRecoveryMult", 1);
  const rainDrain = !decisions.soilCare && ctx.weather.soilDrainWithoutCare ? ctx.weather.soilDrainWithoutCare : 0;
  if (rainDrain > 0 && fieldWorkers > 0) notes.push(`Dauerregen ohne Plantagenpflege: der Boden schwemmt aus (−${rainDrain} Punkte extra).`);
  const soilQualityDelta = clamp(
    round2(
      -cropDrain +
        (decisions.soilCare ? soilCareRecovery : 0) -
        (!decisions.irrigation && ctx.weather.id === "drought" ? 2 : 0) -
        rainDrain,
    ),
    -10,
    10,
  );
  const soilQuality = clamp(resources.soil_quality + soilQualityDelta, 0, 100);

  // Moral: entspannte Crew, keine Krisen.
  let satisfactionDelta = totalAssigned <= 15 ? 2 : 0;
  if (feedShortage) satisfactionDelta -= 12;
  // Razzien treffen nur, wer ein Labor betreibt - ohne Labor gibt es nichts zu durchsuchen.
  if (epidemic && !vaccinated && livestockWorkers > 0) satisfactionDelta -= 10;
  if (decisions.soilCare) satisfactionDelta += 1;
  satisfactionDelta = clamp(satisfactionDelta, -20, 20);
  const satisfaction = clamp(resources.satisfaction + satisfactionDelta, 0, 100);

  // Korrupte Beamte zahlen sich nur aus, wenn diese Runde tatsächlich
  // bestochen wurde - reine Glücksache reicht nicht mehr.
  let bribeBonus = 0;
  if (ctx.marketEvent.bribeBonus && vaccinated && livestockWorkers > 0) {
    bribeBonus = ctx.marketEvent.bribeBonus;
    notes.push(`Korrupte Beamte: ${bribeBonus.toLocaleString("de-DE")} € Bonus für eure Bestechungszahlungen.`);
  }

  // Spitzel verpfeift euch - ein korrupter Polizist schirmt einen Großteil ab.
  let seizure = 0;
  if (ctx.marketEvent.cashSeizurePct) {
    const seizureMult = roleEffect(role, "seizureMult", 1);
    seizure = round2(Math.max(0, player.cash) * ctx.marketEvent.cashSeizurePct * seizureMult);
    if (seizure > 0) {
      notes.push(
        `Spitzel: ${seizure.toLocaleString("de-DE")} € Bargeld beschlagnahmt${role === "polizist" ? " (durch euren Kontakt bei der Polizei stark reduziert)" : ""}.`,
      );
    }
  }

  const energyUsed = round2((totalAssigned * 1.2 + buildingWorkers * 2) * ctx.weather.energyMultiplier);
  // Unwetter-Verlust (siehe computeProduction) - hier nur noch in Euro
  // bewertet, zum Marktpreis, damit der Rechenweg die Größe zeigt.
  const stormLoss = production.stormLost || {};
  const stormLossValue = round2(FIELD_PRODUCTS.reduce((s, p) => s + (stormLoss[p.id] || 0) * ctx.markets[p.id].price, 0));

  const cash = round2(player.cash + netRevenue + bribeBonus - investmentCost - seizure - warPenalty + borrow - repay);

  const newResources = {
    player_id: resources.player_id,
    land_ha: resources.land_ha + buyLand,
    workers: resources.workers + hireWorkers,
    grain_tons: round2(sales.wheat.leftover),
    stock_rapeseed: round2(sales.rapeseed.leftover),
    stock_potato: round2(sales.potato.leftover),
    milk_liters: round2(sales.milk.leftover * (1 - spoilageRate)),
    energy: clamp(resources.energy - energyUsed + 100, 0, 500),
    soil_quality: soilQuality,
    satisfaction,
    machine_condition: machineCondition,
    debt: debtAfter,
  };

  const breakdown = {
    workers: {
      wheat: workersFor(decisions, "wheat"),
      rapeseed: workersFor(decisions, "rapeseed"),
      potato: workersFor(decisions, "potato"),
      milk: livestockWorkers,
      building: buildingWorkers,
      market: marketWorkers,
    },
    totalAssigned,
    fieldWorkers,
    landCapacity,
    soilFactorPct: round2(soilFactor * 100),
    weatherYieldMultPct: round2(weatherYieldMult * 100),
    sales,
    feedNeeded,
    feedUsed: round2(fedFromWheat),
    feedShortage,
    livestockLoss,
    marketWorkerBonusPct: round2((marketWorkerBonus - 1) * 100),
    grossRevenue,
    wages,
    irrigationCost,
    vaccinationCost,
    soilCareCost,
    machineryCost,
    buildingDiscountPct: round2(buildingDiscount * 100),
    machineConditionPenaltyPct: round2(conditionPenalty * 100),
    dieselMultiplier,
    storageCost,
    milkSpoiled,
    operatingCosts,
    netRevenue: round2(netRevenue + bribeBonus - investmentCost - seizure - warPenalty),
    bribeBonus,
    hireWorkers,
    buyLand,
    investmentCost,
    seizure,
    warExtraWear,
    warPenalty,
    interest,
    borrow,
    repay,
    debtAfter,
    stormLoss,
    stormLossValue,
    energyUsed,
    machineWearPct,
    soilQualityDelta,
    satisfactionDelta,
    notes,
  };

  return { resources: newResources, cash, breakdown };
}

/** Bequemlichkeits-Wrapper für Einzelspieler-Kontexte (z. B. die
 * Live-Vorschau aufs Handy): tut so, als wäre man allein am Markt und
 * bekäme den ganzen Markttopf ohne Konkurrenz - das Beste-Fall-Szenario.
 * Für die echte Mehrspieler-Rundenabrechnung siehe computeProduction() +
 * allocateMarket() + finalizeRound() (so macht es host.js). */
export function simulateYear(resources, player, decisions, ctx) {
  const role = player?.role;
  const production = computeProduction(resources, decisions, ctx, role);
  const solo = allocateMarket(ctx, [
    {
      playerId: "solo",
      available: production.available,
      sell: decisions.sell || {},
      weightMult: roleEffect(role, "marketWeightMult", 1),
    },
  ]);
  return finalizeRound(resources, player, decisions, ctx, production, solo.solo, role);
}

function fmt(v, product) {
  return product.unit === "g" ? Math.round(v) : round2(v);
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function round2(v) {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Endwertung
// ---------------------------------------------------------------------------

// Geld zählt jetzt am stärksten (50%) - bei FINANCE_SCORE_TARGET € Vermögen
// ist der Kapital-Anteil sichtbar bei exakt 100%.
export function computeFinalScore(playerId, player, resources) {
  const netWorth = player.cash - (resources.debt || 0);
  const financeScore = clamp((netWorth / FINANCE_SCORE_TARGET) * 100, 0, 100);
  const sustainabilityScore = resources.soil_quality;
  const welfareScore = clamp((resources.satisfaction + resources.machine_condition) / 2, 0, 100);

  const total = round2(financeScore * 0.5 + sustainabilityScore * 0.25 + welfareScore * 0.25);

  const profitable = netWorth >= STARTING_CASH;
  const sustainable = resources.soil_quality >= 60;
  let reportText;
  if (profitable && sustainable) {
    reportText =
      "Du hast ein profitables und zugleich stabiles Kartell aufgebaut. Territorium und Kasse sind im Gleichgewicht.";
  } else if (profitable && !sustainable) {
    reportText =
      "Du hast ein hochprofitables, aber stark ausgebeutetes Drogen-Imperium aufgebaut. Deine Erträge sind führend, jedoch leiden die Plantagen unter der intensiven Nutzung.";
  } else if (!profitable && sustainable) {
    reportText =
      "Deine Plantagen sind vorbildlich gepflegt, aber das Kartell ist wirtschaftlich angeschlagen. Nachhaltigkeit hat sich noch nicht ausgezahlt.";
  } else {
    reportText =
      "Ein schwieriges Jahrzehnt: weder Kasse noch Territorium konnten stabilisiert werden. Zeit für einen Neuanfang.";
  }

  return { playerId, financeScore, sustainabilityScore, welfareScore, total, reportText, netWorth };
}
