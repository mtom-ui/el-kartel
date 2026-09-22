// "Split-Flap"-Ziffernanimation wie bei Flughafen-/Bahnhofsanzeigen: Ziffern
// blättern kurz durch zufällige Werte, bevor sie sich von links nach rechts
// auf den Zielwert einpendeln (Kaskade statt aller Ziffern auf einen Schlag).
// Nicht-Ziffern (€, Punkt, Komma, Minus, Leerzeichen, Buchstaben) bleiben die
// ganze Zeit über fix stehen, sonst sähe "2.795 €" wie zerhackter
// Buchstabensalat statt wie eine Anzeigetafel aus.
const DIGIT_CHARS = "0123456789";

function scrambleExcept(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += /[0-9]/.test(text[i]) ? DIGIT_CHARS[(Math.random() * 10) | 0] : text[i];
  }
  return out;
}

/**
 * Animiert `el.textContent` auf `finalText` zu. `duration`/`delay` in ms.
 * Die ersten 50% der Laufzeit sind das Kaskadenfenster, in dem die Ziffern
 * von links nach rechts gestaffelt zu laufen anfangen; jede einzelne Ziffer
 * blättert danach für die zweite Hälfte der Laufzeit, bevor sie einrastet -
 * die letzte Ziffer landet damit exakt bei `duration`.
 */
export function flapIn(el, finalText, { duration = 650, delay = 0 } = {}) {
  const text = String(finalText);
  const len = Math.max(1, text.length);
  const cascadeWindow = duration * 0.5;
  const spinDuration = duration * 0.5;
  let start = null;

  // Sofort, synchron verwürfeln - sonst zeigt der allererste gemalte Frame
  // (bevor requestAnimationFrame überhaupt einmal gelaufen ist) noch kurz
  // die fertige Zahl, und der ganze Überraschungseffekt wäre im Eimer.
  el.textContent = scrambleExcept(text);

  function step(now) {
    if (start === null) start = now + delay;
    const t = now - start;
    if (t < 0) {
      el.textContent = scrambleExcept(text);
      requestAnimationFrame(step);
      return;
    }
    if (t >= duration) {
      el.textContent = text;
      return;
    }
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (!/[0-9]/.test(ch)) {
        out += ch;
        continue;
      }
      const charStart = (i / len) * cascadeWindow;
      out += t - charStart >= spinDuration ? ch : DIGIT_CHARS[(Math.random() * 10) | 0];
    }
    el.textContent = out;
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Alle `.flap-num`-Elemente unterhalb von `root` einsammeln und GLEICHZEITIG
 * starten (kein Index-Versatz) - jede Zahl hat durch die Links-nach-rechts-
 * Kaskade in flapIn() ohnehin schon ihre eigene kleine Bewegung, und wenn alle
 * Werte im selben Moment lostrudeln und auch im selben Moment einrasten,
 * entsteht der eine gemeinsame "Auflösungs-Moment" - mit gestaffeltem Start
 * wirkten die Tabellen zuvor nacheinander statt gemeinsam fertig. */
export function flapInAll(root, { stagger = 0, duration = 650 } = {}) {
  const els = root.querySelectorAll(".flap-num");
  els.forEach((el, i) => flapIn(el, el.textContent, { duration, delay: i * stagger }));
}
