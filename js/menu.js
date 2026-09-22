import { h } from "./dom.js";
import { icon, iconLabel } from "./icons.js";
import { openHelpModal } from "./help.js";
import { currentTheme, toggleTheme } from "./theme.js";

/** Sammelt alles, was nicht zum Spiel selbst gehört (Neustart, Farbschema,
 * Anleitung), hinter einem Zahnrad. Auf dem Fernseher wie auf dem Handy
 * bleibt so nur ein einziges kleines Symbol sichtbar.
 *
 * onRestart weglassen, wenn es (noch) kein laufendes Spiel zum Neustarten
 * gibt - der Eintrag entfällt dann. */
export function renderSettingsMenu({ onRestart } = {}) {
  let pop = null;

  const btn = h(
    "button",
    {
      class: "gear-btn",
      "aria-label": "Optionen",
      "aria-haspopup": "true",
      onclick: (e) => {
        e.stopPropagation();
        pop ? close() : open();
      },
    },
    [icon("gear", { size: 18 })],
  );

  const wrap = h("div", { class: "gear-menu" }, [btn]);

  function item(children, onclick) {
    return h(
      "button",
      {
        class: "gear-item",
        onclick: (e) => {
          e.stopPropagation();
          close();
          onclick();
        },
      },
      children,
    );
  }

  function open() {
    const themeLabel = () =>
      currentTheme() === "light" ? iconLabel("moon", "Dunkel", { size: 16 }) : iconLabel("sun", "Hell", { size: 16 });

    pop = h("div", { class: "gear-pop", onclick: (e) => e.stopPropagation() }, [
      onRestart ? item([iconLabel("restart", "Neustart", { size: 16 })], onRestart) : null,
      item([themeLabel()], () => toggleTheme()),
      item([iconLabel("help", "Anleitung", { size: 16 })], () => openHelpModal()),
    ]);
    wrap.appendChild(pop);
    btn.classList.add("is-open");
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (!pop) return;
    pop.remove();
    pop = null;
    btn.classList.remove("is-open");
    document.removeEventListener("click", close);
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  return wrap;
}
