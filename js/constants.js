export const STARTING_RESOURCES = {
  land_ha: 15,
  workers: 20,
  grain_tons: 0,
  stock_rapeseed: 0,
  stock_potato: 0,
  milk_liters: 0,
  energy: 100,
  soil_quality: 100,
  satisfaction: 100,
  machine_condition: 100,
  debt: 0,
};

export const STARTING_CASH = 10000;
export const MAX_ROUNDS = 10;

// Geld kauft dauerhaft mehr Kapazität: Personal und Anbaufläche. Kosten
// steigen bewusst nicht mit der aktuellen Größe (bleibt einfach kalkulierbar),
// sind aber pro Runde gedeckelt, damit man sich nicht in einer einzigen
// Runde beliebig groß kauft.
export const HIRE_WORKER_COST = 900; // € je zusätzlichem Mitglied, dauerhaft
export const BUY_LAND_COST = 1600; // € je zusätzlichem Hektar, dauerhaft
export const MAX_HIRE_PER_ROUND = 10;
export const MAX_LAND_PER_ROUND = 10;

// Vermögen, ab dem die Endwertung beim Kapital-Anteil 100% zeigt. Bewusst als
// langfristiges Fernziel gesetzt (auf Wunsch von 65.000 € angehoben) - selbst
// sehr gutes Spiel (Ø ~53.000 € laut Simulation) erreicht es nicht spielend,
// sondern bleibt bei ca. 40%. 100% sind damit ein seltener, eindeutiger Erfolg.
export const FINANCE_SCORE_TARGET = 125000;

// Kredit: teures Geld für schnelles Wachstum. 8% je Runde auf den offenen
// Betrag - 20.000 € kosten 1.600 € pro Runde. Wer damit nicht mehr als das
// verdient, hätte es lassen sollen. Offene Schulden werden in der Endwertung
// vom Vermögen abgezogen.
export const CREDIT_LIMIT = 20000;
export const CREDIT_INTEREST = 0.08;
export const CREDIT_STEP = 1000;

// Marktgedächtnis: zwei Runden hintereinander überversorgt -> Grundpreis in der
// dritten um 15% gedrückt; zwei Runden knapp -> 15% höher.
export const SATURATION_OVER = 1.15; // Angebot/Topf, ab dem "überversorgt" gilt
export const SATURATION_SCARCE = 0.7; // Angebot/Topf, unter dem "knapp" gilt
export const SATURATION_PRICE_SHIFT = 0.15;
