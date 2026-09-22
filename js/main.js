import { h, mount } from "./dom.js";
import { isConfigured } from "./supabaseClient.js";
import { renderHost } from "./host.js";
import { renderPlayer } from "./player.js";
import { initTheme } from "./theme.js";

// Redundant zum Inline-Script in index.html (das verhindert nur das
// Aufblitzen des falschen Schemas vor dem ersten Paint) - falls das aus
// irgendeinem Grund fehlt oder ein gecachtes altes index.html ausgeliefert
// wird, greift hier trotzdem das richtige Farbschema.
initTheme();

const root = document.getElementById("app");

if (!isConfigured) {
  mount(
    root,
    h("div", { class: "screen screen-setup" }, [
      h("h1", {}, "El Cartel – Einrichtung nötig"),
      h("p", {}, "Supabase ist noch nicht konfiguriert."),
      h("ol", { class: "setup-steps" }, [
        h("li", {}, "Supabase-Projekt erstellen (supabase.com)."),
        h("li", {}, "supabase/schema.sql im SQL Editor ausführen."),
        h("li", {}, "js/config.js mit Project URL + anon key ausfüllen."),
        h("li", {}, "Seite neu laden."),
      ]),
    ]),
  );
} else {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get("game");
  if (gameId) {
    renderPlayer(root, gameId.toUpperCase());
  } else {
    renderHost(root);
  }
}
