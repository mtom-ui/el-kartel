// Zwölf Profilbilder als Personen-Emojis. Emojis rendern auf Handy und
// Fernseher aus der System-Schrift und sehen damit auf jedem Gerät nach
// etwas aus - anders als handgezeichnete Strichporträts.
//
// Die IDs werden in Supabase gespeichert (players.persona); unbekannte IDs
// aus alten Partien bekommen eine neutrale Silhouette.

export const PERSONAS = [
  { id: "ninja", gender: null, emoji: "🥷", label: "Der Ninja" },
  { id: "zombie", gender: "f", emoji: "🧟‍♀️", label: "Die Untote" },
  { id: "cop", gender: "f", emoji: "👮‍♀️", label: "Die Polizistin" },
  { id: "singer", gender: "f", emoji: "👩‍🎤", label: "Die Sängerin" },
  { id: "farmer", gender: "m", emoji: "👨‍🌾", label: "Der Pflanzer" },
  { id: "cook", gender: "f", emoji: "👩‍🍳", label: "Die Köchin" },
  { id: "villain", gender: "f", emoji: "🦹‍♀️", label: "Die Schurkin" },
  { id: "witch", gender: "f", emoji: "🧙‍♀️", label: "Die Hexe" },
  { id: "elf", gender: "f", emoji: "🧝‍♀️", label: "Die Elfe" },
  { id: "detective", gender: "f", emoji: "🕵️‍♀️", label: "Die Detektivin" },
  { id: "scientist", gender: "f", emoji: "👩‍🔬", label: "Die Chemikerin" },
  { id: "artist", gender: "f", emoji: "👩‍🎨", label: "Die Künstlerin" },
];

export const PERSONAS_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));

/** Noch nicht genutzte Persona, sonst irgendeine - optional passend zum
 * Geschlecht des Bot-Namens ("Señora Iturbe" nicht als Pflanzer). Geschlechts-
 * neutrale Bilder passen immer; sind alle passenden vergeben, geht jedes freie. */
export function pickPersona(usedIds, rng = Math.random, gender = null) {
  const used = new Set(usedIds);
  const fits = (p) => !gender || !p.gender || p.gender === gender;
  const freeFit = PERSONAS.filter((p) => fits(p) && !used.has(p.id));
  const freeAny = PERSONAS.filter((p) => !used.has(p.id));
  const pool = freeFit.length ? freeFit : freeAny.length ? freeAny : PERSONAS;
  return pool[Math.floor(rng() * pool.length)].id;
}

/** Das Porträt als Emoji-Element. Unbekannte IDs bekommen eine neutrale Silhouette. */
export function personaSvg(id, size = 32) {
  const span = document.createElement("span");
  span.className = "persona-emoji";
  span.style.fontSize = `${size}px`;
  span.setAttribute("aria-hidden", "true");
  span.textContent = PERSONAS_BY_ID[id]?.emoji || "👤";
  return span;
}

/** Rundes Avatar-Badge mit Porträt - der Standardfall neben einem Namen. */
export function avatar(id, size = 28, cls = "") {
  const span = document.createElement("span");
  span.className = cls ? `avatar ${cls}` : "avatar";
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.title = PERSONAS_BY_ID[id]?.label || "";
  span.appendChild(personaSvg(id, Math.round(size * 0.62)));
  return span;
}
