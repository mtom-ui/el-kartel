const THEME_KEY = "derhof:theme";

/** Setzt data-theme so früh wie möglich (siehe inline-Script in index.html,
 * das dasselbe schon vor dem ersten Paint macht, um ein Aufblitzen des
 * falschen Farbschemas zu vermeiden). Hier nochmal für Module, die ohne
 * das Inline-Script laufen. */
export function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = theme;
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Wechselt zwischen hell und dunkel und merkt sich die Wahl. Aufgerufen aus
 * dem Zahnrad-Menü (siehe menu.js). */
export function toggleTheme() {
  const next = currentTheme() === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  return next;
}
