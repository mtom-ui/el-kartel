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

export function fmtEUR(v) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

export function fmtNum(v, digits = 1) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(v);
}
