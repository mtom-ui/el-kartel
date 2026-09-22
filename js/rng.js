// Deterministische Zufallszahlen: TV-Bildschirm, alle Handys und die
// Supabase Edge Function berechnen so unabhängig voneinander exakt dasselbe
// Wetter-/Marktereignis für einen gegebenen Game-Seed + Runde - ohne dass
// das Ergebnis vorher übertragen werden muss.

export function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function roundRng(gameSeed, round, salt = "") {
  return makeRng((gameSeed ^ hashStringToInt(`round:${round}:${salt}`)) >>> 0);
}
