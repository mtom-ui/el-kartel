import { h } from "./dom.js";
import { icon, iconLabel } from "./icons.js";
import { ROLES } from "./roles.js";
import { COSTS } from "./engine.js";
import { HIRE_WORKER_COST, BUY_LAND_COST, FINANCE_SCORE_TARGET, CREDIT_LIMIT, CREDIT_INTEREST } from "./constants.js";

const SECTIONS = [
  {
    icon: "flag",
    title: "Ziel",
    body: "10 Jahre lang euer Kartell führen. Am Ende zählt eine Gesamtwertung, bei der Vermögen mit 50% am stärksten wiegt, Territorium (Boden) und Organisation (Moral + Schmuggel) mit je 25%.",
  },
  {
    icon: "members",
    title: "Rolle bei der Anmeldung",
    body: `Jede Organisation wählt beim Beitreten eine Spezialisierung mit einem festen Vorteil: ${ROLES.map((r) => `${r.label} (${r.hint})`).join(" · ")}`,
  },
  {
    icon: "restart",
    title: "Rundenablauf",
    body: "Jede Runde (= 1 Jahr) verteilt ihr geheim eure Mitglieder auf dem Handy, bestätigt, und sobald alle fertig sind, zeigt der TV die Auswertung: Ernte, Erlös, Boden- und Zustandsänderung.",
  },
  {
    icon: "cannabis",
    title: "Anbau",
    body: "Erzeugt Koka, Mohn oder Cannabis. Wichtig: Nur so viele Erntehelfer wie Hektar Anbaufläche arbeiten voll produktiv – mehr Leute aufs Feld zu stellen als Fläche da ist, verschwendet Arbeitskraft. Mehr Fläche lässt sich unter „Investieren“ dazukaufen.",
  },
  {
    icon: "crystal",
    title: "Labor",
    body: "Erzeugt Crystal Meth, braucht aber Koka als Grundstoff (350 kg pro Labor-Mitglied). Fehlt Nachschub, müsst ihr Ware zwangsweise unter Wert abgeben – das Labor nur betreiben, wenn genug Koka angebaut wird.",
  },
  {
    icon: "gear",
    title: "Ausbau & Schmuggel",
    body: "Senkt eure Schmuggelkosten (bis zu 60% weniger, Schmuggler-Rolle bis 80%) und hält den Schmuggel (euren Fuhrpark) in Schuss. Zahlt sich besonders aus, wenn der Fahndungsdruck steigt – und fließt in die Endwertung (Organisation) ein.",
  },
  {
    icon: "briefcase",
    title: "Vertrieb",
    body: "Jedes Mitglied im Vertrieb verhandelt bessere Preise: +2,5% Erlös, gedeckelt bei 25% (Verkäufer-Rolle: +4%, gedeckelt bei 35%).",
  },
  {
    icon: "trendUp",
    title: "Investieren – Geld kauft Kapazität",
    body: `Mit Bargeld kauft ihr dauerhaft mehr Mitglieder (${HIRE_WORKER_COST} € je Kopf) und mehr Anbaufläche (${BUY_LAND_COST} € je Hektar) – begrenzt durch euer verfügbares Bargeld und ein Limit pro Runde. Mehr Kapazität bedeutet mehr mögliche Ernte und Erlös in den Folgejahren, kostet aber sofort Bargeld.`,
  },
  {
    icon: "cloud",
    title: "Wetter",
    body: "Jede Wetterlage verlangt etwas anderes. Dürre: Bewässerung, sonst −35 % Ernte. Dauerregen: Plantagenpflege, sonst schwemmt der Boden zusätzlich aus. Unwetter: mindestens 2 Mitglieder im Ausbau, sonst gehen 20 % des Feld-Vorrats verloren und Transporte werden teurer. Kälteeinbruch: Mohn und Cannabis −30 %, Koka −10 %, das Labor läuft normal – wer umverteilt, verliert wenig.",
  },
  {
    icon: "droplet",
    title: "Maßnahmen",
    body: `Bewässerung (800 €) schützt die Plantagen vor Dürre-Ausfällen. Behörden bestechen (120 € je Labor-Mitglied, Polizist-Rolle: 70% günstiger) schützt bei Laborrazzien vor 30% Ertragsverlust. Plantagenpflege (${COSTS.soilCarePerHa} € je Hektar, bei 15 ha also 1.200 €) gleicht mit Dünger und Fruchtfolge den Raubbau aus – ohne sie fällt eure Bodenqualität über die Jahre auf die Hälfte und halbiert damit auch den Ertrag. Je größer euer Gebiet, desto teurer wird die Pflege.`,
  },
  {
    icon: "store",
    title: "Markt & Verkauf",
    body: "Jeder Stoff (Koka, Mohn, Cannabis, Meth) hat pro Runde ein knapp bemessenes Marktvolumen, um das ALLE Organisationen konkurrieren. Ihr legt je Stoff euren Verkaufspreis fest: 50–150% des Marktpreises. Der Markt wird nach Menge und Preis aufgeteilt: Wer günstiger anbietet, bekommt einen deutlich größeren Anteil – aber nie den ganzen Topf. Billig anzubieten heißt also mehr Absatz bei weniger Marge, teuer anzubieten mehr Marge bei weniger Absatz. Pauschal zu unterbieten lohnt nicht; es lohnt genau dann, wenn euer Versteck voll ist oder ihr mehr produziert habt, als euer Anteil hergibt.",
  },
  {
    icon: "trendUp",
    title: "Der Markt wächst mit euch",
    body: "Bauen die Organisationen Personal und Fläche aus, wachsen auch die Absatzkanäle – aber nur halb so schnell wie eure Kapazität. Investitionen zahlen sich also aus, ohne dass der Markt je locker wird: Baut niemand aus, bleibt er so eng wie am Anfang, und wer schneller wächst als der Markt, produziert an der Nachfrage vorbei.",
  },
  {
    icon: "chart",
    title: "Der Markt hat ein Gedächtnis",
    body: "Wird ein Erzeugnis zwei Runden hintereinander überversorgt (Angebot aller Organisationen mehr als 15 % über dem Volumen), fällt sein Grundpreis in der dritten Runde um 15 %. Bleibt es zwei Runden knapp (unter 70 % des Volumens), steigt er um 15 %. Steht auf dem Fernseher und im Verkaufsbereich – wer die Herde sieht, weicht aus.",
  },
  {
    icon: "cash",
    title: "Kredit",
    body: `Bis ${CREDIT_LIMIT.toLocaleString("de-DE")} € leihen, ${Math.round(CREDIT_INTEREST * 100)} % Zinsen je Runde auf den offenen Betrag. Früh aufgenommen und in Fläche und Leute gesteckt kann das den Ausbau um Jahre vorziehen – 20.000 € kosten aber 1.600 € pro Runde. Was am Ende offen ist, wird vom Vermögen abgezogen.`,
  },
  {
    icon: "crate",
    title: "Versteck kostet Geld",
    body: "Nicht verkaufte Ware kostet 4 € pro Tonne Versteckkosten, und 30% des eingelagerten Meths verlieren jedes Jahr an Reinheit. Bunkern lohnt sich also nur, wenn ihr auf bessere Preise spekuliert – sonst lieber günstiger verkaufen.",
  },
  {
    icon: "members",
    title: "Sold & Organisationsgröße",
    body: "Ihr zahlt 150 € nur für Mitglieder, die ihr auch einteilt – nicht eingeteilte Leute kosten nichts. In einem engen Markt kann es sich also lohnen, die Organisation bewusst kleiner zu fahren, statt Ware zu produzieren, die keiner abnimmt.",
  },
  {
    icon: "alert",
    title: "Ereignisse, auf die ihr reagieren müsst",
    body: "Exportboom, Koka-Boom und neue Schmuggelrouten erhöhen Absatz oder senken Kosten. Fahndungsdruck, Sonderkommissionen, Grenzkontrollen und Laborrazzien senken den Absatz oder erhöhen Kosten. Spitzel im Versteck beschlagnahmen einen Teil eures Bargelds (Polizist-Rolle schützt stark davor). Bandenkrieg beschädigt euren Fuhrpark, wenn ihr nicht mindestens 2 Mitglieder im Schmuggel habt. Korrupte Beamte zahlen nur einen Bonus aus, wenn ihr diese Runde tatsächlich besticht.",
  },
  {
    icon: "chart",
    title: "Eure Kennzahlen",
    body: "Boden: sinkt bei intensivem Anbau, steigt mit Plantagenpflege – bestimmt euren Ernteertrag. Moral und Schmuggelzustand fließen in die Endwertung ein.",
  },
  {
    icon: "trophy",
    title: "Endwertung",
    body: `Gewichtet: 50% Vermögen, 25% Territorium (Boden), 25% Organisation (Moral + Schmuggel). Beim Vermögen sind 100% bei ${FINANCE_SCORE_TARGET.toLocaleString("de-DE")} € Kapital erreicht – der Fortschritt dahin steht während des Spiels immer auf eurem Handy.`,
  },
];

export function openHelpModal() {
  const overlay = h("div", { class: "help-overlay", onclick: (e) => { if (e.target === overlay) close(); } }, [
    h("div", { class: "help-modal" }, [
      h("div", { class: "help-modal-header" }, [
        h("h2", {}, [iconLabel("country", "Wie spielt man El Cartel?", { size: 22 })]),
        h("button", { class: "help-close", "aria-label": "Schließen", onclick: () => close() }, [icon("close", { size: 20 })]),
      ]),
      h(
        "div",
        { class: "help-modal-body" },
        SECTIONS.map((s) => h("div", { class: "help-section" }, [h("h3", {}, [iconLabel(s.icon, s.title, { size: 18 })]), h("p", {}, s.body)])),
      ),
    ]),
  ]);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
  return close;
}
