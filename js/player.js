import { h, mount, fmtEUR, fmtNum } from "./dom.js";
import * as store from "./store.js";
import { buildConfidentialForecast, buildRoundContext, capacityFactor, computeFinalScore, computeProduction, simulateYear, priceMemory, COSTS } from "./engine.js";
import { PRODUCTS, FIELD_PRODUCTS, WORK_ROWS, STOCK_COLUMN, qtyDigits } from "./products.js";
import { ROLES, ROLES_BY_ID, roleEffect } from "./roles.js";
import { PERSONAS, personaSvg, pickPersona, avatar } from "./personas.js";
import { icon, iconLabel } from "./icons.js";
import { HIRE_WORKER_COST, BUY_LAND_COST, MAX_HIRE_PER_ROUND, MAX_LAND_PER_ROUND, FINANCE_SCORE_TARGET, CREDIT_LIMIT, CREDIT_INTEREST, CREDIT_STEP } from "./constants.js";
import { renderSettingsMenu } from "./menu.js";
import { renderBreakdownDetails } from "./breakdown.js";

function storageKey(gameId) {
  return `derhof:player:${gameId}`;
}

export async function renderPlayer(root, gameId) {
  const game = await store.getGame(gameId);
  if (!game) {
    mount(
      root,
      h("div", { class: "screen screen-error" }, [
        h("h1", {}, "Spiel nicht gefunden"),
        h("p", {}, `Der Code "${gameId}" existiert nicht (mehr). Frag den Gastgeber nach dem aktuellen QR-Code.`),
      ]),
    );
    return;
  }

  const saved = JSON.parse(localStorage.getItem(storageKey(gameId)) || "null");
  let player = null;
  if (saved) {
    const players = await store.listPlayers(gameId);
    player = players.find((p) => p.id === saved.playerId) || null;
  }

  if (!player) {
    const usedPersonas = (await store.listPlayers(gameId)).map((p) => p.persona).filter(Boolean);
    renderJoin(root, game, usedPersonas);
    return;
  }

  await store.markConnected(player.id, true);
  runController(root, game, player);
}

/** usedPersonas: Profilbilder, die schon jemand am Tisch hat - sie bleiben
 * wählbar, aber die Vorauswahl nimmt bevorzugt ein noch freies. */
function renderJoin(root, game, usedPersonas = []) {
  let name = "";
  let role = null;
  let persona = pickPersona(usedPersonas);
  const input = h("input", {
    class: "name-input",
    placeholder: "Dein Name",
    maxlength: "20",
    oninput: (e) => {
      name = e.target.value;
      onChange();
    },
  });

  const joinBtn = h(
    "button",
    {
      class: "btn btn-primary btn-xl",
      onclick: async () => {
        const trimmed = name.trim();
        if (!trimmed || !role) return;
        const player = await store.joinGame(game.id, trimmed, role, persona);
        localStorage.setItem(storageKey(game.id), JSON.stringify({ playerId: player.id, name: trimmed }));
        runController(root, game, player);
      },
    },
    "Beitreten",
  );

  const personaTiles = PERSONAS.map((p) =>
    h(
      "button",
      {
        type: "button",
        class: "persona-tile",
        "aria-label": p.label,
        title: p.label,
        onclick: () => {
          persona = p.id;
          onChange();
        },
      },
      [personaSvg(p.id, 44)],
    ),
  );

  // Spezialisierungen dürfen mehrfach vergeben sein - zwei Köche am Tisch
  // sind erlaubt, das macht nur den Meth-Markt enger.
  const roleCards = ROLES.map((r) =>
    h(
      "button",
      {
        type: "button",
        class: "role-card",
        onclick: () => {
          role = r.id;
          onChange();
        },
      },
      [
        h("div", { class: "role-card-title" }, [iconLabel(r.icon, r.label, { size: 18 })]),
        h("div", { class: "role-card-hint" }, r.hint),
      ],
    ),
  );

  function onChange() {
    joinBtn.disabled = !name.trim() || !role;
    roleCards.forEach((card, i) => card.classList.toggle("selected", ROLES[i].id === role));
    personaTiles.forEach((tile, i) => tile.classList.toggle("selected", PERSONAS[i].id === persona));
  }

  mount(
    root,
    h("div", { class: "screen screen-join" }, [
      h("div", { class: "screen-toolbar" }, [renderSettingsMenu()]),
      h("h1", {}, [iconLabel("country", "El Cartel", { size: 30 })]),
      h("p", { class: "subtitle" }, `Beitreten zu Spiel ${game.id}`),
      input,
      h("h2", {}, "Dein Profilbild"),
      h("div", { class: "persona-grid" }, personaTiles),
      h("h2", {}, "Wähle deine Spezialisierung"),
      h("div", { class: "role-grid" }, roleCards),
      joinBtn,
    ]),
  );
  onChange();
}

async function runController(root, initialGame, player) {
  // formRound merkt sich, für welche Runde die Entscheidungsmaske zuletzt
  // aufgebaut wurde. Jedes Realtime-Event im Spiel (auch die Abgabe eines
  // ANDEREN Spielers) löst hier ein refresh() aus - ohne diese Sperre würde
  // renderDecisionForm bei jedem solchen Event neu aufgebaut und dabei alle
  // noch nicht abgegebenen Slider-Einstellungen auf die Standardwerte
  // zurücksetzen, während man noch am Entscheiden ist.
  const state = { game: initialGame, resources: null, submitted: false, lastResult: null, formRound: null, playerCount: 1 };

  async function refresh() {
    state.game = await store.getGame(player.game_id);
    if (!state.game) return;
    const allPlayers = await store.listPlayers(player.game_id);
    state.playerCount = allPlayers.length || 1;
    // Kapital steht in der players-Tabelle und ändert sich jede Runde. Ohne
    // diese Zeile bliebe das beim Beitritt geladene player-Objekt für immer
    // auf dem Startwert stehen (10.000 €) - das Handy zeigte also nie den
    // echten Kontostand, auch nicht in der Endwertung.
    const own = allPlayers.find((p) => p.id === player.id);
    if (own) Object.assign(player, own);
    // Alle Ressourcen behalten: der Markt wächst mit dem Ausbaustand aller
    // Organisationen, die Vorschau muss also dieselbe Marktgröße kennen wie
    // die Rundenabrechnung beim Gastgeber.
    state.allResources = await store.listResources(player.game_id);
    state.resources = state.allResources.find((r) => r.player_id === player.id) || null;
    // Marktgedächtnis braucht die Ergebnisse ALLER Organisationen der letzten
    // zwei Runden - dieselben Daten wie beim Gastgeber, also dieselben Preise.
    state.recentResults = state.game.round >= 3 ? await store.listResultsSince(player.game_id, state.game.round - 2) : [];
    if (state.game.status === "PLAYING") {
      const actions = await store.getActionsForRound(player.game_id, state.game.round);
      state.submitted = actions.some((a) => a.player_id === player.id);
      if (state.submitted) {
        state.lastResult = await store.getRoundResult(player.id, state.game.round);
      }
    }
    if (state.game.round > 1) {
      state.prevResult = await store.getRoundResult(player.id, state.game.round - 1);
    }
    render();
  }

  function render() {
    if (state.game.status === "LOBBY") {
      state.formRound = null;
      renderWaitingLobby(root, state);
    } else if (state.game.status === "FINISHED") {
      state.formRound = null;
      renderFinal(root, state, player);
    } else if (state.submitted) {
      state.formRound = null;
      renderWaitingForRound(root, state, player);
    } else if (state.formRound !== state.game.round) {
      // Maske nur einmal pro Runde aufbauen - weitere refresh()-Aufrufe
      // während man noch tippt, lassen die eingegebene Verteilung in Ruhe.
      state.formRound = state.game.round;
      renderDecisionForm(root, state, player, refresh);
    }
  }

  store.subscribeGame(player.game_id, refresh);
  await refresh();
}

function renderWaitingLobby(root, state) {
  mount(
    root,
    h("div", { class: "screen screen-wait" }, [
      h("h1", {}, [iconLabel("check", "Du bist dabei!", { size: 28 })]),
      h("p", {}, "Warte, bis der Gastgeber das Spiel startet …"),
    ]),
  );
}

function renderDecisionForm(root, state, player, refresh) {
  const res = state.resources;
  const ctx = buildRoundContext(
    state.game.seed,
    state.game.round,
    state.playerCount,
    capacityFactor(state.allResources),
    priceMemory(state.recentResults || [], state.game.round),
  );

  const decisions = {
    workers: Object.fromEntries(WORK_ROWS.map((r) => [r.id, 0])),
    irrigation: false,
    vaccinate: false,
    soilCare: false,
    sell: Object.fromEntries(PRODUCTS.map((p) => [p.id, { priceRatio: 1 }])),
    invest: { hireWorkers: 0, buyLand: 0 },
    credit: { borrow: 0, repay: 0 },
  };
  // Bargeld nach Kreditentscheidung - das ist, was Investitionen decken muss.
  const cashAvailable = () => player.cash + decisions.credit.borrow - decisions.credit.repay;

  const refreshers = [];
  const onChange = () => refreshers.forEach((fn) => fn());

  // --- Mitgliederverteilung mit +/- ---------------------------------------
  const remainingEl = h("div", { class: "remaining" });
  const fieldNoteEl = h("div", { class: "worker-cap-note" });

  const usedTotal = () => WORK_ROWS.reduce((s, r) => s + decisions.workers[r.id], 0);
  const usedField = () => FIELD_PRODUCTS.reduce((s, p) => s + decisions.workers[p.id], 0);

  /** Obergrenze je Zeile: freie Mitglieder, bei Feldfrüchten zusätzlich die Anbaufläche. */
  function maxFor(rowId) {
    const free = res.workers - usedTotal() + decisions.workers[rowId];
    const isField = FIELD_PRODUCTS.some((p) => p.id === rowId);
    if (!isField) return free;
    const fieldFree = res.land_ha - usedField() + decisions.workers[rowId];
    return Math.min(free, fieldFree);
  }

  const workerRows = WORK_ROWS.map((row) => {
    const valueEl = h("span", { class: "stepper-value" }, "0");
    const minus = h("button", { class: "stepper-btn", type: "button" }, "−");
    const plus = h("button", { class: "stepper-btn", type: "button" }, "+");

    minus.addEventListener("click", () => {
      if (decisions.workers[row.id] > 0) {
        decisions.workers[row.id]--;
        onChange();
      }
    });
    plus.addEventListener("click", () => {
      if (decisions.workers[row.id] < maxFor(row.id)) {
        decisions.workers[row.id]++;
        onChange();
      }
    });

    refreshers.push(() => {
      const v = decisions.workers[row.id];
      valueEl.textContent = String(v);
      minus.disabled = v <= 0;
      plus.disabled = v >= maxFor(row.id);
    });

    return h("div", { class: "worker-row" }, [
      h("div", { class: "worker-label" }, [h("div", {}, [iconLabel(row.icon, row.label, { size: 17 })]), h("div", { class: "worker-hint" }, row.hint)]),
      h("div", { class: "stepper" }, [minus, valueEl, plus]),
    ]);
  });

  refreshers.push(() => {
    const left = res.workers - usedTotal();
    // Der Hinweis auf den Sold ist die wichtigste unsichtbare Regel des
    // Spiels: nicht eingeteilte Leute kosten nichts, eingeteilte 150 €.
    remainingEl.textContent =
      left === 0
        ? `Alle ${res.workers} Mitglieder eingeteilt · Sold ${fmtEUR(usedTotal() * COSTS.wagePerWorker)}`
        : `Freie Mitglieder: ${left} von ${res.workers} – sie kosten keinen Sold · Sold für eingeteilte: ${fmtEUR(usedTotal() * COSTS.wagePerWorker)}`;
    remainingEl.className = "remaining" + (left === 0 ? " all-used" : "");
    const fieldLeft = res.land_ha - usedField();
    fieldNoteEl.textContent =
      fieldLeft > 0
        ? `Anbaufläche: ${usedField()} von ${res.land_ha} ha bestellt`
        : `Anbaufläche voll belegt (${res.land_ha} ha) – mehr Erntehelfer bringen nichts`;
  });

  // --- Maßnahmen ----------------------------------------------------------
  const bribeCostMult = roleEffect(player.role, "bribeCostMult", 1);
  const vaccinateLabel = h("span", {}, "");
  refreshers.push(() => {
    // Ohne Labor-Mitglieder ist die Bestechung kostenlos UND wirkungslos -
    // "0 €" allein sah aus wie ein Gratis-Vorteil.
    if (decisions.workers.milk === 0) {
      vaccinateLabel.replaceChildren(iconLabel("envelope", "Behörden bestechen – wirkt erst, wenn Mitglieder im Labor arbeiten", { size: 17 }));
      return;
    }
    const cost = Math.round(decisions.workers.milk * COSTS.vaccinationPerWorker * bribeCostMult);
    vaccinateLabel.replaceChildren(iconLabel("envelope", `Behörden bestechen (${fmtEUR(cost)}${bribeCostMult < 1 ? " – Rollenbonus" : ""}) – schützt bei Razzia`, { size: 17 }));
  });

  const measure = (labelNode, key) => {
    const cb = h("input", {
      type: "checkbox",
      onchange: (e) => {
        decisions[key] = e.target.checked;
        onChange();
      },
    });
    return h("label", { class: "measure-row" }, [h("span", {}, labelNode), cb]);
  };

  // --- Investition: mehr Mitglieder / mehr Anbaufläche kaufen -------------
  const investRows = [
    { key: "hireWorkers", label: "Neue Mitglieder anwerben", icon: "members", cost: HIRE_WORKER_COST, max: MAX_HIRE_PER_ROUND, unit: "" },
    { key: "buyLand", label: "Anbaufläche dazukaufen", icon: "land", cost: BUY_LAND_COST, max: MAX_LAND_PER_ROUND, unit: "ha" },
  ].map((row) => {
    const valueEl = h("span", { class: "stepper-value" }, "0");
    const costEl = h("div", { class: "worker-hint" }, "");
    const minus = h("button", { class: "stepper-btn", type: "button" }, "−");
    const plus = h("button", { class: "stepper-btn", type: "button" }, "+");

    const maxAffordable = () => Math.min(row.max, Math.floor(Math.max(0, cashAvailable()) / row.cost));

    minus.addEventListener("click", () => {
      if (decisions.invest[row.key] > 0) {
        decisions.invest[row.key]--;
        onChange();
      }
    });
    plus.addEventListener("click", () => {
      if (decisions.invest[row.key] < maxAffordable()) {
        decisions.invest[row.key]++;
        onChange();
      }
    });

    refreshers.push(() => {
      const v = decisions.invest[row.key];
      valueEl.textContent = String(v);
      minus.disabled = v <= 0;
      plus.disabled = v >= maxAffordable();
      // Statt einer Amortisationsprognose (die von den Mitspielern abhängt)
      // die harte Tatsache: welche Kapazität ihr ab nächster Runde habt.
      const jetzt = row.key === "hireWorkers" ? res.workers : res.land_ha;
      const einheit = row.key === "hireWorkers" ? "Mitglieder" : "ha";
      costEl.textContent =
        v > 0
          ? `${fmtEUR(v * row.cost)} · ab nächster Runde ${jetzt + v} ${einheit} statt ${jetzt}`
          : `${fmtEUR(row.cost)} je ${row.unit || "Mitglied"} · aktuell ${jetzt} ${einheit}`;
    });

    return h("div", { class: "worker-row" }, [
      h("div", { class: "worker-label" }, [h("div", {}, [iconLabel(row.icon, row.label, { size: 17 })]), costEl]),
      h("div", { class: "stepper" }, [minus, valueEl, plus]),
    ]);
  });

  // --- Kredit -------------------------------------------------------------
  const debt = res.debt || 0;
  const creditRows = [
    { key: "borrow", label: "Kredit aufnehmen", icon: "cash", max: () => Math.max(0, CREDIT_LIMIT - debt) },
    { key: "repay", label: "Kredit tilgen", icon: "check", max: () => Math.min(debt, Math.max(0, player.cash + decisions.credit.borrow)) },
  ].map((row) => {
    const valueEl = h("span", { class: "stepper-value" }, "0 €");
    const hintEl = h("div", { class: "worker-hint" }, "");
    const minus = h("button", { class: "stepper-btn", type: "button" }, "−");
    const plus = h("button", { class: "stepper-btn", type: "button" }, "+");
    minus.addEventListener("click", () => {
      if (decisions.credit[row.key] > 0) {
        decisions.credit[row.key] -= CREDIT_STEP;
        onChange();
      }
    });
    plus.addEventListener("click", () => {
      if (decisions.credit[row.key] + CREDIT_STEP <= row.max()) {
        decisions.credit[row.key] += CREDIT_STEP;
        onChange();
      }
    });
    refreshers.push(() => {
      const v = decisions.credit[row.key];
      valueEl.textContent = fmtEUR(v);
      minus.disabled = v <= 0;
      plus.disabled = v + CREDIT_STEP > row.max();
      if (row.key === "borrow") {
        const after = debt + v;
        hintEl.textContent = v > 0
          ? `danach ${fmtEUR(after)} offen · ${fmtEUR(after * CREDIT_INTEREST)} Zinsen ab nächster Runde`
          : `bis ${fmtEUR(CREDIT_LIMIT - debt)} möglich · ${Math.round(CREDIT_INTEREST * 100)} % Zinsen je Runde`;
      } else {
        hintEl.textContent = debt > 0
          ? (v > 0 ? `danach ${fmtEUR(debt - v)} offen` : `${fmtEUR(debt)} offen · kostet ${fmtEUR(debt * CREDIT_INTEREST)} diese Runde`)
          : "kein Kredit offen";
      }
    });
    return h("div", { class: "worker-row" }, [
      h("div", { class: "worker-label" }, [h("div", {}, [iconLabel(row.icon, row.label, { size: 17 })]), hintEl]),
      h("div", { class: "stepper" }, [minus, valueEl, plus]),
    ]);
  });

  // --- Live-Vorschau ------------------------------------------------------
  const previewEl = h("div", { class: "preview" });
  refreshers.push(() => renderPreview(previewEl, res, player, decisions, ctx));

  const forecast = buildConfidentialForecast(state.game.seed, state.game.round, player.id);

  const submitBtn = h(
    "button",
    {
      class: "btn btn-primary btn-xl",
      onclick: async () => {
        submitBtn.disabled = true;
        await store.submitAction(state.game.id, player.id, state.game.round, decisions);
        await refresh();
      },
    },
    [iconLabel("check", "Entscheidungen bestätigen", { size: 22 })],
  );

  mount(
    root,
    h("div", { class: "screen screen-controller" }, [
      h("div", { class: "controller-header" }, [
        h("div", { class: "controller-header-top" }, [
          h("div", { class: "controller-name" }, [
            avatar(player.persona, 34),
            h("div", { class: "controller-name-text" }, [
              h("div", {}, player.name),
              ROLES_BY_ID[player.role]
                ? h("div", { class: "controller-role" }, [iconLabel(ROLES_BY_ID[player.role].icon, ROLES_BY_ID[player.role].label, { size: 14 })])
                : null,
            ]),
          ]),
          h("div", { class: "controller-header-right" }, [
            h("div", { class: "round-chip" }, `Jahr ${state.game.round} / ${state.game.max_rounds}`),
            renderSettingsMenu(),
          ]),
        ]),
      ]),
      h("div", { class: "resource-strip" }, [
        iconLabel("cash", fmtEUR(player.cash), { size: 17 }),
        iconLabel("soil", `${fmtNum(res.soil_quality, 0)}%`, { size: 17 }),
        iconLabel("truck", `${fmtNum(res.machine_condition, 0)}%`, { size: 17 }),
      ]),
      renderFinanceGoal(player, res.debt || 0),
      h("div", { class: "weather-banner" }, [
        // Ohne Trennzeichen: auf schmalen Displays brechen die beiden Angaben
        // ohnehin untereinander um, ein "·" bliebe dann am Zeilenende hängen.
        h("div", { class: "weather-line" }, [
          iconLabel(ctx.weather.icon, ctx.weather.name, { size: 17 }),
          iconLabel(ctx.marketEvent.icon, ctx.marketEvent.name, { size: 17 }),
        ]),
        h("div", { class: "weather-desc" }, ctx.marketEvent.description),
      ]),
      renderResourceTable(res),
      h("h2", {}, "Mitgliederverteilung"),
      fieldNoteEl,
      ...workerRows,
      remainingEl,
      h("h2", {}, "Maßnahmen"),
      measure(iconLabel("droplet", "Bewässerungsanlage (800 €) – schützt die Plantagen bei Dürre", { size: 17 }), "irrigation"),
      measure(vaccinateLabel, "vaccinate"),
      measure(iconLabel("sprout", `Plantagenpflege (${fmtEUR(res.land_ha * COSTS.soilCarePerHa)} für ${fmtNum(res.land_ha, 0)} ha) – Dünger & Fruchtfolge, +6 Boden`, { size: 17 }), "soilCare"),
      renderMarketSellSection(ctx, decisions, state.playerCount, onChange, res, player, refreshers),
      h("h2", {}, [iconLabel("trendUp", "Investieren", { size: 19 })]),
      h("p", { class: "hint" }, "Kauft dauerhaft mehr Mitglieder und Anbaufläche für kommende Runden – begrenzt durch euer Bargeld."),
      ...investRows,
      h("h2", {}, [iconLabel("cash", "Kredit", { size: 19 })]),
      h("p", { class: "hint" }, `Teures Geld für schnelles Wachstum: ${Math.round(CREDIT_INTEREST * 100)} % Zinsen je Runde auf den offenen Betrag, höchstens ${fmtEUR(CREDIT_LIMIT)}. Offene Schulden zählen am Ende gegen euer Vermögen.`),
      ...creditRows,
      h("h2", {}, [iconLabel("chart", "Vorschau", { size: 19 })]),
      h("p", { class: "hint" }, "Gerechnet, als wärt ihr allein am Markt. Was die anderen Organisationen tun, erfahrt ihr erst nach der Auswertung – der tatsächliche Absatz kann also niedriger ausfallen."),
      previewEl,
      h("div", { class: "forecast" }, [iconLabel("envelope", forecast, { size: 16 })]),
      submitBtn,
    ]),
  );

  onChange();
}

/** Vorschau: rechnet die Runde mit den aktuellen Einstellungen durch. Kosten
 * und Zustandswerte stimmen exakt, aber der Absatz geht vom Beste-Fall aus
 * (keine Konkurrenz um den Markttopf) - wer am Ende wie viel bekommt, hängt
 * auch von den Preisen der Mitspieler ab und steht erst nach dem Simulieren fest. */
function renderPreview(container, res, player, decisions, ctx) {
  let out;
  try {
    out = simulateYear(res, { cash: player.cash, role: player.role }, decisions, ctx);
  } catch {
    container.replaceChildren(h("div", { class: "preview-empty" }, "Zu viele Mitglieder eingeteilt."));
    return;
  }
  const b = out.breakdown;

  const rows = PRODUCTS.filter((p) => b.sales[p.id].produced > 0 || b.sales[p.id].available > 0).map((p) => {
    const s = b.sales[p.id];
    return h("div", { class: "preview-row" }, [
      h("span", {}, [iconLabel(p.icon, p.label, { size: 16 })]),
      h("span", {}, `${fmtNum(s.sold, p.priceDigits === 0 ? 1 : 0)} ${p.unit} verkauft`),
      h("span", { class: "preview-money" }, fmtEUR(s.revenue)),
    ]);
  });

  const net = b.netRevenue;
  container.replaceChildren(
    h("div", { class: "preview-box" }, [
      ...(rows.length
        ? rows
        : [h("div", { class: "preview-empty" }, "Noch keine Mitglieder eingeteilt – die Kosten unten sind laufende Fixkosten für Schmuggel und Logistik.")]),
      h("div", { class: "preview-sep" }),
      h("div", { class: "preview-row" }, [h("span", {}, "Erlös"), h("span", {}), h("span", { class: "preview-money" }, fmtEUR(b.grossRevenue))]),
      h("div", { class: "preview-row" }, [
        h("span", {}, "Kosten"),
        h("span", { class: "preview-detail" }, `Sold ${fmtEUR(b.wages)}`),
        h("span", { class: "preview-money neg" }, `−${fmtEUR(b.operatingCosts)}`),
      ]),
      b.interest > 0
        ? h("div", { class: "preview-row" }, [
            h("span", {}, "Zinsen"),
            h("span", { class: "preview-detail" }, `${fmtEUR(res.debt || 0)} Kredit`),
            h("span", { class: "preview-money neg" }, `−${fmtEUR(b.interest)}`),
          ])
        : null,
      b.borrow > 0 || b.repay > 0
        ? h("div", { class: "preview-row" }, [
            h("span", {}, b.borrow > 0 ? "Kredit aufgenommen" : "Kredit getilgt"),
            h("span", { class: "preview-detail" }, `danach ${fmtEUR(b.debtAfter)} offen`),
            h("span", { class: b.borrow > 0 ? "preview-money" : "preview-money neg" }, b.borrow > 0 ? `+${fmtEUR(b.borrow)}` : `−${fmtEUR(b.repay)}`),
          ])
        : null,
      b.stormLossValue > 0
        ? h("div", { class: "preview-row" }, [
            h("span", {}, "Unwetter zerstört Ware"),
            h("span", { class: "preview-detail" }, "unter 2 im Ausbau – fehlt oben schon im Erlös"),
            h("span", { class: "preview-money neg" }, `≈ ${fmtEUR(b.stormLossValue)}`),
          ])
        : null,
      b.investmentCost > 0
        ? h("div", { class: "preview-row" }, [
            h("span", {}, "Investition"),
            h("span", { class: "preview-detail" }, `${b.hireWorkers} Mitglieder, ${b.buyLand} ha`),
            h("span", { class: "preview-money neg" }, `−${fmtEUR(b.investmentCost)}`),
          ])
        : null,
      h("div", { class: `preview-total ${net >= 0 ? "pos" : "neg"}` }, [
        h("span", {}, net >= 0 ? "Gewinn" : "Verlust"),
        h("span", {}, fmtEUR(net)),
      ]),
      h("div", { class: "preview-deltas" }, [
        iconLabel("soil", `${b.soilQualityDelta >= 0 ? "+" : ""}${fmtNum(b.soilQualityDelta, 1)}`, { size: 16 }),
        iconLabel("morale", `${b.satisfactionDelta >= 0 ? "+" : ""}${fmtNum(b.satisfactionDelta, 0)}`, { size: 16 }),
        iconLabel("truck", `${b.machineWearPct > 0 ? "−" : "+"}${fmtNum(Math.abs(b.machineWearPct), 1)}`, { size: 16 }),
      ]),
    ]),
  );
}

/** Fortschrittsbalken zum Kapitalziel der Endwertung - macht sichtbar, wann
 * man beim Vermögens-Anteil (50% des Gesamtscores) die 100% erreicht hat. */
function renderFinanceGoal(player, debt = 0) {
  const net = player.cash - debt;
  const pct = Math.min(100, Math.max(0, (net / FINANCE_SCORE_TARGET) * 100));
  const label = debt > 0 ? `Vermögensziel: ${fmtEUR(net)} (nach ${fmtEUR(debt)} Kredit) / ${fmtEUR(FINANCE_SCORE_TARGET)} (${fmtNum(pct, 0)}%)` : `Vermögensziel: ${fmtEUR(net)} / ${fmtEUR(FINANCE_SCORE_TARGET)} (${fmtNum(pct, 0)}%)`;
  return h("div", { class: "finance-goal" }, [
    h("div", { class: "finance-goal-label" }, [iconLabel("cash", label, { size: 16 })]),
    h("div", { class: "finance-goal-bar" }, [h("div", { class: "finance-goal-fill", style: { width: `${pct}%` } })]),
  ]);
}

/** Verkaufspreise. Bewusst OHNE jede Aussage darüber, wie sich der Preis auf
 * den Absatz auswirkt: was die Mitspieler tun, weiß man beim Entscheiden
 * nicht, und genau diese Unsicherheit ist der Reiz. Angezeigt wird deshalb
 * nur, was man selbst sicher weiß - die eigene Menge und das Marktvolumen.
 * Der Regler verändert ausschließlich den Stückpreis. */
function renderMarketSellSection(ctx, decisions, playerCount, onChange, res, player, refreshers) {
  const rows = PRODUCTS.map((p) => {
    const market = ctx.markets[p.id];
    const priceEl = h("span", { class: "price-value" }, "");
    const pctEl = h("span", { class: "price-pct" }, "100%");
    const amountEl = h("span", { class: "price-amount" }, "");
    const volumeEl = h("span", { class: "price-demand" }, `Marktvolumen ${fmtNum(market.demand, 0)} ${p.unit}`);

    // Eigene Menge = Lager + das, was die eingeteilten Mitglieder erzeugen
    // (abzüglich Koka, das im Labor als Grundstoff draufgeht). Hängt nur an
    // der Mitgliederverteilung, nie am Preis.
    refreshers.push(() => {
      let own = 0;
      try {
        own = computeProduction(res, decisions, ctx, player.role).available[p.id] || 0;
      } catch {
        own = res[STOCK_COLUMN[p.id]] || 0;
      }
      amountEl.textContent = `Deine Menge ${fmtNum(own, qtyDigits(p))} ${p.unit}`;
    });

    const memoryTag = market.memory ? ` · ${market.memory === "over" ? "übersättigt −15 %" : "knapp +15 %"}` : "";
    const update = (ratio) => {
      priceEl.textContent = `${fmtNum(market.price * ratio, p.priceDigits)} €/${p.unit}${memoryTag}`;
    };
    update(1);

    const slider = h("input", {
      type: "range",
      min: "50",
      max: "150",
      step: "5",
      value: "100",
      class: "price-slider",
      oninput: (e) => {
        const pct = Number(e.target.value);
        const ratio = pct / 100;
        decisions.sell[p.id].priceRatio = ratio;
        pctEl.textContent = `${pct}%`;
        update(ratio);
        onChange();
      },
    });

    return h("div", { class: "market-row" }, [
      h("div", { class: "market-row-top" }, [h("div", { class: "market-row-title" }, [iconLabel(p.icon, p.label, { size: 17 })]), priceEl]),
      h("div", { class: "market-row-sub" }, [amountEl, " · ", volumeEl]),
      h("div", { class: "price-control" }, [slider, pctEl]),
    ]);
  });

  return h("div", { class: "market-sell" }, [
    h("h2", {}, [iconLabel("store", "Verkaufspreise", { size: 19 })]),
    h(
      "p",
      { class: "hint" },
      `Jedes Erzeugnis hat pro Runde ein festes Marktvolumen, um das sich ${playerCount === 1 ? "eure Organisation" : `alle ${playerCount} Organisationen`} streiten. Wer günstiger anbietet, bekommt einen größeren Anteil – aber nie den ganzen Topf. Wie viel am Ende wirklich abfließt, hängt von den anderen ab. Was liegenbleibt, wandert ins Versteck: das kostet Geld, Meth verliert zusätzlich an Reinheit.`,
    ),
    ...rows,
  ]);
}

function renderResourceTable(res) {
  const stockRows = PRODUCTS.map((p) => [
    [p.icon, `${p.label} im Versteck`],
    `${fmtNum(res[STOCK_COLUMN[p.id]] || 0, qtyDigits(p))} ${p.unit}`,
  ]);
  const rows = [
    [["land", "Anbaufläche"], `${fmtNum(res.land_ha, 0)} ha`],
    [["members", "Mitglieder"], fmtNum(res.workers, 0)],
    ...stockRows,
    [["truck", "Schmuggelzustand"], `${fmtNum(res.machine_condition, 0)} %`],
    ...(res.debt > 0 ? [[["cash", "Offener Kredit"], fmtEUR(res.debt)]] : []),
  ];
  const hasStock = PRODUCTS.some((p) => (res[STOCK_COLUMN[p.id]] || 0) > 0);
  return h("details", { class: "resource-table-details", open: hasStock }, [
    h("summary", {}, [iconLabel("crate", "Versteck & Ressourcen", { size: 17 })]),
    h(
      "table",
      { class: "resource-table" },
      rows.map(([[iconName, label], value]) => h("tr", {}, [h("td", {}, [iconLabel(iconName, label, { size: 16 })]), h("td", { class: "value" }, value)])),
    ),
  ]);
}

function renderWaitingForRound(root, state, player) {
  const prev = state.prevResult;
  mount(
    root,
    h("div", { class: "screen screen-wait" }, [
      h("h1", {}, [iconLabel("check", "Entscheidungen abgegeben", { size: 28 })]),
      h("p", {}, "Warte auf die anderen Organisationen …"),
      prev
        ? h("div", { class: "prev-summary" }, [
            h("h2", {}, `Ergebnis Jahr ${state.game.round - 1}: ${fmtEUR(prev.breakdown.netRevenue)} Nettoertrag`),
            renderBreakdownDetails(prev.breakdown),
          ])
        : null,
    ]),
  );
}

function renderFinal(root, state, player) {
  const score = computeFinalScore(player.id, player, state.resources);
  mount(
    root,
    h("div", { class: "screen screen-finished" }, [
      h("h1", {}, [iconLabel("flag", "Spiel beendet", { size: 28 })]),
      h("div", { class: "leaderboard-name" }, `${fmtNum(score.total, 0)} Punkte`),
      h("p", {}, score.reportText),
      h("div", { class: "leaderboard-scores" }, [
        h("div", { class: "stat" }, [iconLabel("cash", `Vermögen ${fmtNum(score.financeScore, 0)}%`, { size: 17 })]),
        h("div", { class: "stat" }, [iconLabel("land", `Territorium ${fmtNum(score.sustainabilityScore, 0)}%`, { size: 17 })]),
        h("div", { class: "stat" }, [iconLabel("members", `Organisation ${fmtNum(score.welfareScore, 0)}%`, { size: 17 })]),
      ]),
    ]),
  );
}
