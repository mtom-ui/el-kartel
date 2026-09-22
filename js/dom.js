/** Kleiner Helfer statt Framework: erzeugt ein DOM-Element aus Tag,
 * Attributen/Properties und Kindern (Elemente oder Strings). */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "class") el.className = value;
    else if (key === "style") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null && value !== false) {
      el.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
  return el;
}

export function mount(root, node) {
  root.replaceChildren(node);
}

/** Ruft `fn` auf und versucht es bei einem Fehler noch ein paar Mal mit
 * wachsender Pause, bevor der Fehler durchgereicht wird. Federt kurze
 * Verbindungsaussetzer ab (WLAN-Wechsel, Funkloch) - genau die Situation,
 * die auf dem Handy viel häufiger vorkommt als auf dem an einem WLAN
 * hängenden Fernseher. */
export async function withRetry(fn, { tries = 3, delayMs = 600 } = {}) {
  let lastError;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw lastError;
}

/** Fehlerbildschirm mit Neu-versuchen-Button - ersetzt das sonst endlose
 * "El Cartel lädt ..." aus index.html, wenn der erste Ladevorgang an einem
 * Netzwerkfehler scheitert. Ohne diesen Bildschirm blieb die Seite bei einem
 * Fehler in einem unbehandelten Promise stecken: kein Fehler sichtbar, keine
 * Möglichkeit, es erneut zu versuchen, außer die Seite von Hand neu zu
 * laden. */
export function renderConnectionError(root, err, onRetry) {
  console.error("El Cartel: Laden fehlgeschlagen", err);
  mount(
    root,
    h("div", { class: "screen screen-error" }, [
      h("h1", {}, "Verbindung unterbrochen"),
      h(
        "p",
        {},
        "Der Server ist gerade nicht erreichbar - meist ein kurzer Netzwerkaussetzer. Prüf WLAN/Mobilfunk und versuch es nochmal.",
      ),
      h("button", { class: "btn btn-primary btn-xl", onclick: onRetry }, "Erneut versuchen"),
    ]),
  );
}

export function fmtEUR(v) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

export function fmtNum(v, digits = 1) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(v);
}
