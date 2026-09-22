import { h, mount, fmtEUR, fmtNum, withRetry, renderConnectionError } from "./dom.js";
import * as store from "./store.js";
import { buildRoundContext, capacityFactor, computeProduction, allocateMarket, finalizeRound, computeFinalScore, priceMemory } from "./engine.js";
import { FINANCE_SCORE_TARGET } from "./constants.js";
import { PRODUCTS, STOCK_COLUMN, qtyDigits } from "./products.js";
import { ROLES_BY_ID, roleEffect } from "./roles.js";
import { icon, iconLabel } from "./icons.js";
import { renderSettingsMenu } from "./menu.js";
import { renderBreakdownDetails } from "./breakdown.js";
import { BOT_LEVELS, BOT_LEVELS_BY_ID, isBot, pickBotName, pickBotRole, decideForBot, botThinkDelay } from "./bots.js";
import { makeRng } from "./rng.js";
import { avatar, pickPersona } from "./personas.js";
import { comboChart } from "./charts.js";
import { flapIn, flapInAll } from "./anim.js";

const HOST_KEY = "derhof:host:gameId";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Der "Auflösungs-Moment": vier kurze Stationen, während im Hintergrund
 * bereits gerechnet und gespeichert wird (siehe onSimulate). Reine Deko ohne
 * eigene Zufallslogik - der Reiz kommt daraus, dass alle am Tisch wissen,
 * dass JETZT alle geheimen Entscheidungen gleichzeitig aufeinandertreffen,
 * nicht aus echten Zwischenständen. */
const RESOLUTION_STEPS = [
  { icon: "sprout", label: "Ernte", note: "Die Ernte wird eingefahren …" },
  { icon: "store", label: "Marktverteilung", note: "Der Markt verteilt sich auf alle Organisationen …" },
  { icon: "siren", label: "Razzien", note: "Behörden und Rivalen ziehen ihre Bilanz …" },
  { icon: "chart", label: "Jahresbilanz", note: "Kapital, Boden und Zustand werden festgeschrieben …" },
];
const RESOLUTION_STEP_MS = 750; // 4 Stationen x 750ms = 3s gesamt

/** subscribeGame() hört auf fünf Tabellen gleichzeitig, und eine einzige
 * Rundenauswertung schreibt pro Spieler in drei davon (cash, resources,
 * round_results) plus einmal games - bei 6 Organisationen sind das über 20
 * einzelne Realtime-Events für EIN "Runde simulieren". Ohne Debounce löst
 * jedes einzelne einen kompletten Remount aus (siehe dom.js mount() =
 * root.replaceChildren()) und reißt dabei jede Kartenanimation bei t=0 ab,
 * bevor sie überhaupt sichtbar wird - genau der "mega buggy"-Zwischenstand.
 * Leading+Trailing: eine einzelne, isolierte Änderung (ein Spieler gibt ab)
 * rendert weiterhin sofort; eine Salve wie die Rundenauswertung löst genau
 * zwei Renders aus (den ersten sofort, den letzten nach Ende der Salve) statt
 * zwanzig. */
function debounce(fn, wait) {
  let timer = null;
  let pendingTrailing = false;
  return (...args) => {
    if (timer === null) {
      fn(...args);
    } else {
      pendingTrailing = true;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (pendingTrailing) {
        pendingTrailing = false;
        fn(...args);
      }
    }, wait);
  };
}

export function renderHost(root) {
  const savedGameId = localStorage.getItem(HOST_KEY);
  if (savedGameId) {
    resumeGame(root, savedGameId);
  } else {
    renderStart(root);
  }
}

function renderStart(root) {
  mount(
    root,
    h("div", { class: "screen screen-start" }, [
      // Zahnrad oben rechts wie in der Lobby - stand hier vorher als letztes
      // Element unter dem Button.
      h("div", { class: "screen-toolbar" }, [renderSettingsMenu()]),
      h("h1", {}, [iconLabel("country", "El Cartel", { size: 32 })]),
      h("p", { class: "subtitle" }, "Rundenbasierte Drogenkartell-Wirtschaftssimulation – TV-Ansicht"),
      h("button", { class: "btn btn-primary btn-xl", onclick: () => onCreateGame(root) }, "Neues Spiel erstellen"),
    ]),
  );
}

async function onCreateGame(root) {
  const game = await store.createGame();
  localStorage.setItem(HOST_KEY, game.id);
  await resumeGame(root, game.id);
}

async function resumeGame(root, gameId) {
  let game;
  try {
    game = await withRetry(() => store.getGame(gameId));
  } catch (err) {
    // Netzwerkfehler beim ersten Laden - ohne diesen Fang blieb die Seite
    // beim "El Cartel lädt ..." aus index.html hängen.
    renderConnectionError(root, err, () => resumeGame(root, gameId));
    return;
  }
  if (!game) {
    localStorage.removeItem(HOST_KEY);
    renderStart(root);
    return;
  }

  const state = {
    game,
    players: [],
    resources: [],
    actions: [],
    allResults: [],
    pendingResults: null,
    // true während der Auflösungs-Sequenz (siehe onSimulate/renderResolution).
    // Der Bildschirm dafür wird EINMALIG direkt gemountet, nicht über den
    // normalen render()-Dispatcher - der überspringt while resolving jeden
    // Aufruf, sonst würde ein Realtime-Ereignis mittendrin die Animation neu
    // aufsetzen und die Sequenz von vorn beginnen lassen.
    resolving: false,
    // "playerId:round" für Bots, deren Entscheidung schon unterwegs ist -
    // jedes Realtime-Ereignis ruft refresh() auf, ohne diese Sperre würde
    // derselbe Bot mehrfach angestoßen.
    botPending: new Set(),
    // Verhindert, dass zwei überlappende refresh()-Aufrufe (z. B. ein
    // Realtime-Ereignis während ein vorheriges refresh() noch awaited) beide
    // gleichzeitig onSimulate() anstoßen, bevor state.resolving synchron auf
    // true springt. Wird beim nächsten "Weiter" wieder scharf gestellt.
    autoSimTriggered: false,
  };
  // Wie in player.js: nur beim allerersten Laden einen Fehlerbildschirm
  // zeigen, danach lieber der zuletzt gerenderte Stand stehen lassen als bei
  // einem kurzen Netzwerkaussetzer mittendrin die laufende Partie zu stören.
  let loaded = false;

  async function refresh() {
    try {
      state.game = await store.getGame(gameId);
      if (!state.game) return;
      state.players = await store.listPlayers(gameId);
      state.resources = await store.listResources(gameId);
      if (state.game.status === "PLAYING") {
        state.actions = await store.getActionsForRound(gameId, state.game.round);
      }
      if (state.game.status !== "LOBBY") {
        state.allResults = await store.listAllRoundResults(gameId);
      }
      render();
      loaded = true;
      if (state.game.status === "PLAYING" && !state.pendingResults && !state.resolving) {
        runBots();
        // Alle haben abgegeben: sofort auswerten, ohne auf den Host-Klick zu
        // warten - das Regelwerk sieht ohnehin vor, dass alle simultan abgeben,
        // der Klick war nur ein zusätzlicher manueller Schritt danach.
        const allSubmitted = state.players.length > 0 && state.actions.length >= state.players.length;
        if (allSubmitted && !state.autoSimTriggered) {
          state.autoSimTriggered = true;
          onSimulate();
        }
      }
    } catch (err) {
      console.error("El Cartel: Aktualisierung fehlgeschlagen", err);
      if (!loaded) renderConnectionError(root, err, refresh);
    }
  }

  /** Der Fernseher entscheidet für alle KI-Gegner, die diese Runde noch
   * nicht abgegeben haben - nach einer kurzen, je Bot festen Bedenkzeit. */
  function runBots() {
    const round = state.game.round;
    for (const bot of state.players.filter(isBot)) {
      const key = `${bot.id}:${round}`;
      if (state.botPending.has(key)) continue;
      if (state.actions.some((a) => a.player_id === bot.id)) continue;
      state.botPending.add(key);
      setTimeout(async () => {
        try {
          // Frische Daten holen: zwischen Planung und Abgabe kann ein
          // Neustart oder Rundenwechsel passiert sein.
          const game = await store.getGame(gameId);
          if (!game || game.status !== "PLAYING" || game.round !== round) return;
          const players = await store.listPlayers(gameId);
          const resources = await store.listResources(gameId);
          const res = resources.find((r) => r.player_id === bot.id);
          const me = players.find((p) => p.id === bot.id);
          if (!res || !me) return;
          const recent = round >= 3 ? await store.listResultsSince(gameId, round - 2) : [];
          const ctx = buildRoundContext(game.seed, round, players.length, capacityFactor(resources), priceMemory(recent, round));
          const decisions = decideForBot(me, res, ctx, players.length, round, game.seed);
          await store.submitAction(gameId, bot.id, round, decisions);
        } finally {
          state.botPending.delete(key);
        }
      }, botThinkDelay(bot, round, state.game.seed));
    }
  }

  function render() {
    // Die Auflösungs-Sequenz mountet sich selbst (siehe onSimulate) und lebt
    // bewusst außerhalb dieses Dispatchers - ein Realtime-Ereignis mittendrin
    // (z. B. durch applyRoundResults, das während der Sequenz im Hintergrund
    // läuft) darf sie nicht neu aufsetzen.
    if (state.resolving) return;
    if (state.pendingResults) {
      renderRoundResults(root, state, onContinue);
    } else if (state.game.status === "LOBBY") {
      renderLobby(root, state, onStart, onRestart, onAddBot, onRemovePlayer);
    } else if (state.game.status === "PLAYING") {
      renderPlaying(root, state, onSimulate, onRestart);
    } else {
      renderFinished(root, state, onNewGame);
    }
  }

  async function onStart() {
    await store.startGame(gameId);
  }

  async function onAddBot(level) {
    const rng = makeRng((Date.now() ^ state.game.seed) >>> 0);
    const { name, gender } = pickBotName(state.players.map((p) => p.name), rng);
    const role = pickBotRole(state.players.map((p) => p.role).filter(Boolean), rng);
    const persona = pickPersona(state.players.map((p) => p.persona).filter(Boolean), rng, gender);
    await store.addBot(gameId, name, role, level, persona);
  }

  async function onRemovePlayer(playerId) {
    await store.removePlayer(playerId);
  }

  async function onSimulate() {
    const ctx = buildRoundContext(
      state.game.seed,
      state.game.round,
      state.players.length,
      capacityFactor(state.resources),
      priceMemory(state.allResults, state.game.round),
    );

    // Phase 1: jede Organisation produziert unabhängig von den anderen.
    const byPlayer = {};
    const entries = [];
    for (const player of state.players) {
      const res = resourcesFor(state, player.id);
      const action = state.actions.find((a) => a.player_id === player.id);
      if (!res || !action) continue;
      const production = computeProduction(res, action.payload, ctx, player.role);
      byPlayer[player.id] = { res, action, production };
      entries.push({
        playerId: player.id,
        available: production.available,
        sell: action.payload.sell || {},
        weightMult: roleEffect(player.role, "marketWeightMult", 1),
      });
    }

    // Phase 2: alle Organisationen konkurrieren gemeinsam um denselben Markttopf.
    const soldByPlayer = allocateMarket(ctx, entries);

    // Phase 3: Erlös/Kosten/neue Werte je Organisation mit dem zugeteilten Absatz.
    const resultsByPlayer = {};
    for (const player of state.players) {
      const entry = byPlayer[player.id];
      if (!entry) continue;
      resultsByPlayer[player.id] = finalizeRound(
        entry.res,
        player,
        entry.action.payload,
        ctx,
        entry.production,
        soldByPlayer[player.id],
        player.role,
      );
    }

    // Ergebnis steht rechnerisch schon fest - gezeigt wird es trotzdem erst
    // nach der Auflösungs-Sequenz. Das Schreiben in die Datenbank läuft dabei
    // im Hintergrund parallel zur Animation, nicht danach: die Mitspieler
    // warten so nicht zusätzlich zur Sequenz noch auf den Netzwerk-Roundtrip.
    state.resolving = true;
    const round = state.game.round;
    const { screen, stepEls, connectorEls, note } = renderResolutionScreen(round);
    mount(root, screen);

    const dbWrite = store.applyRoundResults(state.game, resultsByPlayer, ctx.weather, ctx.marketEvent);
    for (let i = 0; i < RESOLUTION_STEPS.length; i++) {
      stepEls.forEach((el, si) => {
        el.classList.toggle("is-active", si === i);
        el.classList.toggle("is-done", si < i);
      });
      connectorEls.forEach((el, ci) => el.classList.toggle("is-done", ci < i));
      note.textContent = RESOLUTION_STEPS[i].note;
      // Reflow erzwingen, damit die Fade-Animation bei jeder Station neu
      // anspringt statt nach der ersten Station stehen zu bleiben.
      note.style.animation = "none";
      void note.offsetWidth;
      note.style.animation = "";
      await sleep(RESOLUTION_STEP_MS);
    }
    stepEls.forEach((el) => el.classList.add("is-done"));
    connectorEls.forEach((el) => el.classList.add("is-done"));
    await dbWrite;

    state.resolving = false;
    // `round` (oben eingefangen), nicht state.game.round: das Schreiben hat
    // die Runde in der Datenbank inzwischen weitergezählt, und ein
    // Realtime-Refresh während der Sequenz (render() dabei stumm, siehe
    // oben) kann state.game längst aktualisiert haben.
    state.pendingResults = { round, ctx, resultsByPlayer };
    render();
  }

  function onContinue() {
    state.pendingResults = null;
    state.autoSimTriggered = false;
    render();
    // Während der Ergebnisanzeige waren die Bots pausiert; die neue Runde
    // steht in der Datenbank längst - jetzt dürfen sie planen.
    if (state.game.status === "PLAYING") runBots();
  }

  function onNewGame() {
    unsubscribe();
    localStorage.removeItem(HOST_KEY);
    renderStart(root);
  }

  async function onRestart() {
    if (!confirm("Spiel wirklich beenden und neu starten? Alle Fortschritte in dieser Partie gehen verloren.")) return;
    unsubscribe();
    await store.deleteGame(gameId);
    localStorage.removeItem(HOST_KEY);
    renderStart(root);
  }

  const unsubscribe = store.subscribeGame(gameId, debounce(refresh, 220));
  await refresh();
}

function resourcesFor(state, playerId) {
  return state.resources.find((r) => r.player_id === playerId);
}

/** Kapitalstufe 0-4 je Organisation für den Farbtupfer auf der Karte: die
 * ärmste bekommt 0, die reichste 4. Stammte aus map.js, wo dieselbe Skala
 * früher auch die Territorien einfärbte - seit die Landkarte raus ist, war
 * das die einzige noch genutzte Funktion dieser Datei. */
function cashTiers(players) {
  const values = players.map((p) => p.cash || 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const tiers = new Map();
  for (const p of players) {
    tiers.set(p.id, max - min < 1 ? 2 : Math.round((((p.cash || 0) - min) / (max - min)) * 4));
  }
  return tiers;
}

function joinUrl(gameId) {
  const url = new URL(window.location.href);
  url.search = `?game=${gameId}`;
  return url.toString();
}

function qrImg(url) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
  return h("img", { class: "qr", src, alt: "QR-Code zum Beitreten", width: "260", height: "260" });
}

function renderLobby(root, state, onStart, onRestart, onAddBot, onRemovePlayer) {
  const url = joinUrl(state.game.id);
  const humans = state.players.filter((p) => !isBot(p)).length;
  const bots = state.players.length - humans;

  const playerRow = (p) => {
    const bot = isBot(p);
    const role = ROLES_BY_ID[p.role];
    return h("li", { class: bot ? "player-item is-bot" : "player-item" }, [
      avatar(p.persona, 30),
      h("span", { class: "player-item-name" }, p.name),
      role ? h("span", { class: "player-item-role", title: role.label }, [icon(role.icon, { size: 14 })]) : null,
      bot ? h("span", { class: "bot-chip" }, [iconLabel("cpu", BOT_LEVELS_BY_ID[p.bot_level]?.label || "KI", { size: 13 })]) : null,
      bot
        ? h(
            "button",
            { class: "player-remove", "aria-label": `${p.name} entfernen`, title: "Entfernen", onclick: () => onRemovePlayer(p.id) },
            [icon("close", { size: 14 })],
          )
        : null,
    ]);
  };

  mount(
    root,
    h("div", { class: "screen screen-lobby" }, [
      h("div", { class: "screen-toolbar" }, [renderSettingsMenu({ onRestart })]),
      h("h1", {}, [iconLabel("country", "El Cartel – Lobby", { size: 32 })]),
      h("div", { class: "lobby-grid" }, [
        h("div", { class: "lobby-join" }, [
          h("div", { class: "game-code" }, state.game.id),
          qrImg(url),
          h("div", { class: "join-url" }, url),
          h("p", { class: "hint" }, "Handy-Kamera auf den QR-Code halten oder die URL eingeben."),
        ]),
        h("div", { class: "lobby-players" }, [
          h("h2", {}, `Spieler (${state.players.length})`),
          state.players.length
            ? h("ul", { class: "player-list" }, state.players.map(playerRow))
            : h("p", { class: "hint" }, "Noch niemand da."),
          h("div", { class: "bot-add" }, [
            h("div", { class: "bot-add-head" }, [iconLabel("cpu", "KI-Gegner hinzufügen", { size: 16 })]),
            h(
              "div",
              { class: "bot-add-row" },
              BOT_LEVELS.map((l) =>
                h("button", { class: "bot-add-btn", title: l.hint, onclick: () => onAddBot(l.id) }, [
                  icon("plus", { size: 14 }),
                  h("span", {}, l.label),
                ]),
              ),
            ),
            h("p", { class: "hint bot-add-hint" }, "Mischen erlaubt – auch allein gegen die KI oder zu zweit mit drei Gegnern."),
          ]),
        ]),
      ]),
      h(
        "button",
        {
          class: "btn btn-primary btn-xl",
          disabled: state.players.length < 1,
          onclick: onStart,
        },
        "Spiel starten ▶",
      ),
      humans === 0 && bots > 0
        ? h("p", { class: "hint" }, "Nur KI-Gegner – du schaust zu. Für eine eigene Organisation mit dem Handy beitreten.")
        : state.players.length < 2
          ? h("p", { class: "hint" }, "Tipp: mit mindestens 2 Organisationen macht es mehr Spaß – Mitspieler oder KI.")
          : null,
    ]),
  );
}

/** Der "Auflösungs-Moment" zwischen Abgabe und Ergebnis: eine Kette aus vier
 * Stationen, die nacheinander aufleuchten, während im Hintergrund (siehe
 * onSimulate) bereits gerechnet und gespeichert wird. Gibt der Sekunde, in
 * der alle geheimen Entscheidungen gleichzeitig aufeinandertreffen, einen
 * sichtbaren Moment - genau der Punkt, auf dem das Spielprinzip beruht.
 *
 * Gibt die Elemente einzeln zurück (nicht nur den fertigen Screen), damit
 * onSimulate sie per Klassenwechsel weiterschalten kann, ohne zwischendurch
 * neu zu mounten - ein Remount würde jede laufende CSS-Animation abbrechen. */
function renderResolutionScreen(round) {
  const stepEls = [];
  const connectorEls = [];
  const children = [];
  RESOLUTION_STEPS.forEach((s, i) => {
    const stepEl = h("div", { class: "resolve-step" }, [
      h("div", { class: "resolve-step-icon" }, [icon(s.icon, { size: 22 })]),
      h("div", { class: "resolve-step-label" }, s.label),
    ]);
    stepEls.push(stepEl);
    children.push(stepEl);
    if (i < RESOLUTION_STEPS.length - 1) {
      const connectorEl = h("div", { class: "resolve-connector" });
      connectorEls.push(connectorEl);
      children.push(connectorEl);
    }
  });
  const note = h("p", { class: "resolve-note" }, RESOLUTION_STEPS[0].note);
  const screen = h("div", { class: "screen screen-resolve" }, [
    h("div", { class: "resolve-round" }, `Jahr ${round} wird ausgewertet`),
    h("div", { class: "resolve-steps" }, children),
    note,
  ]);
  return { screen, stepEls, connectorEls, note };
}

/** Aktualisiert nur "wer hat schon abgegeben" im bereits gemounteten
 * Dashboard, ohne die Karten/Panels neu zu erzeugen - siehe den Kommentar in
 * renderPlaying(). Gibt false zurück, wenn (noch) nichts zum Patchen da ist
 * oder sich die Spielerliste seit dem letzten vollen Mount geändert hat
 * (Beitritt/Verlassen mitten in der Runde) - dann muss renderPlaying()
 * komplett neu aufbauen. */
function patchPlayingDash(root, state, onSimulate) {
  const dash = root.querySelector(".screen-dash");
  if (!dash) return false;
  const rows = dash.querySelectorAll(".org-row[data-player-id]");
  if (rows.length !== state.players.length) return false;

  const submittedIds = new Set(state.actions.map((a) => a.player_id));
  for (const p of state.players) {
    const row = dash.querySelector(`.org-row[data-player-id="${p.id}"]`);
    if (!row) return false;
    const submitted = submittedIds.has(p.id);
    row.classList.toggle("is-ready", submitted);
    const stateEl = row.querySelector(".org-state");
    if (stateEl) {
      stateEl.classList.toggle("is-done", submitted);
      stateEl.replaceChildren(icon(submitted ? "check" : "dash", { size: 15 }));
    }
  }

  const total = state.players.length;
  const submittedCount = state.actions.length;
  const progressText = dash.querySelector(".dash-progress-text");
  if (progressText) progressText.textContent = `${submittedCount} / ${total} Organisationen haben bestätigt`;
  const progressBar = dash.querySelector(".dash-progress .bar-fill");
  if (progressBar) progressBar.style.width = `${total ? (submittedCount / total) * 100 : 0}%`;

  const allIn = total > 0 && submittedCount >= total;
  const footer = dash.querySelector(".dash-foot");
  const trailing = footer?.lastElementChild;
  if (footer && trailing) {
    const replacement = allIn
      ? h("button", { class: "btn btn-primary", onclick: onSimulate }, [iconLabel("film", "Runde simulieren", { size: 20 })])
      : h("div", { class: "dash-waiting" }, "Warte auf die Mitspieler …");
    footer.replaceChild(replacement, trailing);
  }

  return true;
}

// TV-Dashboard: alles auf einem Bildschirm, ohne Scrollen. Links die
// Organisationen, in der Mitte das Land mit seinen Territorien, rechts
// Marktlage und Lage. Die Karte schrumpft mit dem verfügbaren Platz, die
// Spalten haben feste Breiten - so bleibt das Bild auf jedem Fernseher gleich.
function renderPlaying(root, state, onSimulate, onRestart) {
  const ctx = buildRoundContext(
    state.game.seed,
    state.game.round,
    state.players.length,
    capacityFactor(state.resources),
    priceMemory(state.allResults, state.game.round),
  );
  const submitted = state.actions.length;
  const total = state.players.length;
  const allIn = total > 0 && submitted >= total;
  const tiers = cashTiers(state.players);
  // Nur beim tatsächlichen Rundenwechsel (oder dem allerersten Aufbau) sollen
  // Kontostand und Charts "einlaufen" - nicht bei jedem Render, das ein
  // Realtime-Ereignis wie "Spieler X hat abgegeben" auslöst. state._dashRound
  // ist reine Render-Buchhaltung, kein Spielzustand.
  const isFreshRound = state._dashRound !== state.game.round;
  state._dashRound = state.game.round;

  // Ein Spieler, der nur abgibt, ändert nichts an Karten/Charts/Kontoständen -
  // nur daran, wer schon bestätigt hat. Ein voller Remount (mount() =
  // replaceChildren()) würde dafür trotzdem JEDE Organisationskarte neu
  // erzeugen und ihre fadeInUp-Animation erneut abspielen - das "Ruckeln",
  // das bei jeder Abgabe zu sehen war. Also: bei gleicher Runde erst versuchen,
  // nur die betroffenen Stellen im bestehenden DOM zu aktualisieren, und nur
  // beim echten Rundenwechsel (oder falls der Patch mangels Vorlage scheitert)
  // komplett neu aufbauen.
  if (!isFreshRound && patchPlayingDash(root, state, onSimulate)) return;

  mount(
    root,
    h("div", { class: "screen-dash" }, [
      h("header", { class: "dash-head" }, [
        h("div", { class: "dash-title" }, [
          iconLabel("country", "El Cartel", { size: 19 }),
          h("span", { class: "dash-code" }, state.game.id),
        ]),
        h("div", { class: "dash-round" }, [
          h("span", { class: "dash-round-label" }, "Jahr"),
          h("span", { class: "dash-round-value" }, String(state.game.round)),
          h("span", { class: "dash-round-total" }, `von ${state.game.max_rounds}`),
        ]),
        h("div", { class: "topbar-actions" }, [renderSettingsMenu({ onRestart })]),
      ]),

      h("div", { class: "dash-body" }, [
        h("section", { class: "dash-col dash-col-left" }, [
          h("h2", { class: "panel-head" }, `Organisationen (${total})`),
          h(
            "div",
            // Zwei Spalten statt einer einzigen Liste: dieselbe Karte in
            // voller Größe passt bei 8 Organisationen in 4 statt 8 Zeilen -
            // die frühere "dichte" Sonderausführung mit kleinerer Schrift und
            // ausgeblendeten Zeilen brauchte es dafür nicht mehr.
            { class: "org-list" },
            state.players.map((p) => renderOrgRow(state, p, tiers)),
          ),
        ]),

        h("section", { class: "dash-col dash-col-right" }, [renderSituationPanel(state, ctx), renderMarketPanel(state, ctx, isFreshRound)]),
      ]),

      h("footer", { class: "dash-foot" }, [
        h("div", { class: "dash-progress" }, [
          h("div", { class: "dash-progress-text" }, `${submitted} / ${total} Organisationen haben bestätigt`),
          h("div", { class: "bar-track is-slim" }, [
            h("div", { class: "bar-fill is-cash", style: { width: `${total ? (submitted / total) * 100 : 0}%` } }),
          ]),
        ]),
        allIn
          ? h("button", { class: "btn btn-primary", onclick: onSimulate }, [iconLabel("film", "Runde simulieren", { size: 20 })])
          : h("div", { class: "dash-waiting" }, "Warte auf die Mitspieler …"),
      ]),
    ]),
  );
  if (isFreshRound) flapInAll(root);
}

/** Eine Organisation als kompakte Zeile: Kapital groß, Zustandswerte als
 * schmale Balken, Versteck nur wenn etwas drin liegt. Der Farbtupfer links
 * entspricht der Einfärbung des eigenen Territoriums auf der Karte. */
function renderOrgRow(state, p, tiers) {
  const res = resourcesFor(state, p.id);
  const submitted = state.actions.some((a) => a.player_id === p.id);
  const role = ROLES_BY_ID[p.role];
  if (!res) return h("div", { class: "org-row", "data-player-id": p.id }, [h("div", { class: "org-name" }, p.name)]);

  const goalPct = Math.max(0, Math.min(100, (p.cash / FINANCE_SCORE_TARGET) * 100));
  const stock = PRODUCTS.map((prod) => [prod, res[STOCK_COLUMN[prod.id]] || 0]).filter(([, amount]) => amount > 0);

  return h("div", { class: submitted ? "org-row is-ready" : "org-row", "data-player-id": p.id }, [
    h("div", { class: "org-row-head" }, [
      h("span", { class: `org-swatch is-t${tiers.get(p.id) ?? 2}` }),
      avatar(p.persona, 24, "org-avatar"),
      h("span", { class: "org-name" }, p.name),
      isBot(p)
        ? h("span", { class: "org-bot", title: `KI · ${BOT_LEVELS_BY_ID[p.bot_level]?.label || ""}` }, [icon("cpu", { size: 13 })])
        : null,
      role ? h("span", { class: "org-role", title: role.label }, [icon(role.icon, { size: 15 })]) : null,
      h("span", { class: submitted ? "org-state is-done" : "org-state" }, [icon(submitted ? "check" : "dash", { size: 15 })]),
    ]),
    h("div", { class: "org-capacity" }, [
      iconLabel("members", `${fmtNum(res.workers, 0)} Mitglieder`, { size: 13 }),
      iconLabel("land", `${fmtNum(res.land_ha, 0)} ha`, { size: 13 }),
      res.debt > 0 ? h("span", { class: "org-debt" }, [iconLabel("cash", `${fmtEUR(res.debt)} Kredit`, { size: 13 })]) : null,
    ]),
    h("div", { class: "org-cash-row" }, [
      h("span", { class: "org-cash-value flap-num" }, fmtEUR(p.cash)),
      h("span", { class: "org-goal" }, `${fmtNum(goalPct, 0)}% Ziel`),
    ]),
    h("div", { class: "bar-track is-slim" }, [h("div", { class: "bar-fill is-cash", style: { width: `${goalPct}%` } })]),
    h("div", { class: "org-mini-bars" }, [
      miniBar("soil", res.soil_quality),
      miniBar("morale", res.satisfaction),
      miniBar("truck", res.machine_condition),
    ]),
    stock.length
      ? h(
          "div",
          { class: "org-stock" },
          stock.map(([prod, amount]) =>
            h("span", { class: "stock-item has-stock" }, [
              iconLabel(prod.icon, `${fmtNum(amount, qtyDigits(prod))} ${prod.unit}`, { size: 14 }),
            ]),
          ),
        )
      : null,
  ]);
}

/** Zustandswert als Balken: Icon, Balken, Zahl - ohne Textbeschriftung, weil
 * auf dem Fernseher die Icons schneller gelesen werden als Wörter. Nur zwei
 * Zustände statt drei ("gut" vs. "kritisch" unter 40%): mit drei Stufen war
 * die dritte, unauffällige Farbe (für den weitaus häufigsten Fall "gut") auf
 * dunklem Grund fast deckungsgleich mit dem leeren Balken - Icon und Balken
 * verschwanden praktisch. Die Ton-Klasse sitzt jetzt am ganzen Element, färbt
 * also Icon UND Zahl mit ein, nicht nur den Füllbalken. */
function miniBar(iconName, value) {
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct >= 40 ? "ok" : "low";
  return h("div", { class: `mini-bar is-${tone}` }, [
    icon(iconName, { size: 16 }),
    h("div", { class: "bar-track is-micro" }, [h("div", { class: `bar-fill is-${tone}`, style: { width: `${pct}%` } })]),
    h("span", { class: "mini-bar-value" }, fmtNum(value, 0)),
  ]);
}

/** Je Erzeugnis und vergangener Runde: die von allen Organisationen
 * zusammen tatsächlich erzeugte Menge und ihr im Schnitt angebotener Preis -
 * aus den gespeicherten Rundenergebnissen, nicht aus der laufenden (noch
 * geheimen) Runde. */
function actualsForRound(state, round) {
  const rows = state.allResults.filter((x) => x.round === round);
  const out = {};
  for (const p of PRODUCTS) {
    const sales = rows.map((r) => r.breakdown?.sales?.[p.id]).filter(Boolean);
    if (!sales.length) {
      out[p.id] = null;
      continue;
    }
    out[p.id] = {
      produced: sales.reduce((s, x) => s + (x.produced || 0), 0),
      avgPrice: sales.reduce((s, x) => s + (x.price || 0), 0) / sales.length,
    };
  }
  return out;
}

/** Marktlage als Kombi-Chart je Erzeugnis: zwei Balken (produzierte Menge /
 * Marktvolumen) plus zwei Linien (ø angebotener Preis der Organisationen /
 * Marktpreis) über die letzten Runden. Die laufende Runde liefert nur
 * Marktvolumen/-preis (bereits bekannt) - erzeugte Menge und Preis der
 * Organisationen gibt es erst nach der Auswertung, daher lässt der Chart
 * diesen einen Punkt für die beiden offen. */
function renderMarketPanel(state, ctx, animate) {
  const round = state.game.round;
  // Vor der ersten Auswertung gibt es schlicht nichts zu zeigen - ein Chart
  // mit einem einzigen, halb leeren Balken sähe nur nach Fehler aus. Erst ab
  // Jahr 2 gibt es einen ersten abgeschlossenen Datenpunkt.
  const hasHistory = round > 1;
  const rounds = [];
  for (let r = Math.max(1, round - 5); r <= round; r++) rounds.push(r);
  const contexts = rounds.map((r) => (r === round ? ctx : buildRoundContext(state.game.seed, r, state.players.length)));
  const actuals = rounds.map((r) => (r === round ? null : actualsForRound(state, r)));
  const xLabels = rounds.map(String);

  return h("div", { class: "panel panel-market" }, [
    h("h2", { class: "panel-head" }, [iconLabel("store", "Marktlage", { size: 17 })]),
    h("div", { class: "market-chart-legend" }, [
      h("span", { class: "market-chart-legend-item" }, [h("span", { class: "legend-swatch chart-a" }), "Organisationen: Menge · Preis"]),
      h("span", { class: "market-chart-legend-item" }, [h("span", { class: "legend-swatch chart-b" }), "Markt: Volumen · Preis"]),
    ]),
    h(
      "div",
      // 2x2 statt einer schmalen Liste: jedes Chart bekommt dadurch die
      // doppelte Höhe UND eine vernünftige Breite statt über die volle
      // Panelbreite gequetscht zu werden - erst so liest sich Balken/Linie
      // überhaupt als Kurve statt als Klotz.
      { class: "market-chart-grid" },
      PRODUCTS.map((p, tileIndex) => {
        const m = ctx.markets[p.id];
        const head = h("div", { class: "market-chart-head" }, [
          h("span", { class: "market-chart-name" }, [iconLabel(p.icon, p.label, { size: 15 })]),
          h("span", { class: m.memory ? `market-chart-price is-${m.memory}` : "market-chart-price" }, [
            `${fmtNum(m.price, p.priceDigits)} €/${p.unit}`,
            m.memory ? h("span", { class: "memory-tag" }, m.memory === "over" ? "übersättigt" : "knapp") : null,
          ]),
          h("span", { class: "market-chart-vol" }, `${fmtNum(m.demand, 0)} ${p.unit}`),
        ]);

        if (!hasHistory) {
          return h("div", { class: "market-chart-row" }, [
            head,
            h("div", { class: "market-chart-empty" }, "Noch keine Daten – nach dem ersten Jahr steht hier der Verlauf."),
          ]);
        }

        const produced = actuals.map((a) => a?.[p.id]?.produced ?? null);
        const avgPrice = actuals.map((a) => a?.[p.id]?.avgPrice ?? null);
        const volume = contexts.map((c) => c.markets[p.id].demand);
        const marketPrice = contexts.map((c) => c.markets[p.id].price);
        return h("div", { class: "market-chart-row" }, [
          head,
          h("div", { class: "market-chart-svg" }, [
            comboChart(
              xLabels,
              [
                { cls: "chart-a", values: produced },
                { cls: "chart-b", values: volume },
              ],
              [
                { cls: "chart-a", values: avgPrice },
                { cls: "chart-b", values: marketPrice },
              ],
              { height: 116, revealDelay: tileIndex * 90, animate },
            ),
          ]),
        ]);
      }),
    ),
    h("p", { class: "panel-note" }, "Festes Volumen je Runde – wer günstiger anbietet, bekommt den größeren Anteil."),
  ]);
}

/** Aktuelle Lage: Wetter und Marktereignis, jeweils mit eigenem Hilfstext -
 * beide erklären, warum sich die Zahlen gerade so bewegen, wie sie es tun. */
function renderSituationPanel(state, ctx) {
  return h("div", { class: "panel" }, [
    h("h2", { class: "panel-head" }, [iconLabel("alert", "Lage", { size: 17 })]),
    h("div", { class: "situation-grid" }, [
      h("div", { class: "situation-card" }, [
        h("div", { class: "chip" }, [iconLabel(ctx.weather.icon, ctx.weather.name, { size: 16 })]),
        h("p", { class: "situation-desc" }, ctx.weather.description),
      ]),
      h("div", { class: "situation-card is-event" }, [
        h("div", { class: "chip is-event" }, [iconLabel(ctx.marketEvent.icon, ctx.marketEvent.name, { size: 16 })]),
        h("p", { class: "situation-desc" }, ctx.marketEvent.description),
      ]),
    ]),
  ]);
}

function openDetailModal(playerName, breakdown) {
  const overlay = h(
    "div",
    {
      class: "help-overlay",
      onclick: (e) => {
        if (e.target === overlay) close();
      },
    },
    [
      h("div", { class: "help-modal" }, [
        h("div", { class: "help-modal-header" }, [
          h("h2", {}, [iconLabel("search", `Rechenweg – ${playerName}`, { size: 19 })]),
          h("button", { class: "help-close", "aria-label": "Schließen", onclick: () => close() }, [icon("close", { size: 20 })]),
        ]),
        h("div", { class: "help-modal-body" }, [renderBreakdownDetails(breakdown)]),
      ]),
    ],
  );
  function close() {
    overlay.remove();
  }
  document.body.appendChild(overlay);
}

function stat(iconName, text) {
  const label = iconLabel(iconName, text, { size: 17 });
  // Nur der Textknoten bekommt die Flap-Klasse, nicht der ganze ic-label-
  // Wrapper - sonst würde flapIn() beim Einrasten via textContent auch das
  // Icon-SVG mit überschreiben.
  if (label.lastChild) label.lastChild.classList?.add("flap-num");
  return h("div", { class: "stat" }, [label]);
}

/** Eine Kachel je Kategorie (die vier Erzeugnisse + eine Gesamt-Kachel),
 * jede ein eigenes kleines Leaderboard. Ersetzt die frühere Riesentabelle -
 * die zwang zum Scrollen und beantwortete nicht die eigentlich interessante
 * Frage nach der Runde: "Wer war bei Mohn vorn?" */
function renderRoundResults(root, state, onContinue) {
  const { round, ctx, resultsByPlayer } = state.pendingResults;

  const productTiles = PRODUCTS.map((p) => {
    const rows = state.players
      .map((player) => ({ player, s: resultsByPlayer[player.id]?.breakdown?.sales?.[p.id] }))
      .filter((row) => row.s)
      .sort((a, b) => b.s.revenue - a.s.revenue);
    const market = ctx.markets[p.id];
    return h("div", { class: "result-tile" }, [
      h("div", { class: "result-tile-head" }, [
        iconLabel(p.icon, p.label, { size: 18 }),
        h("span", { class: "result-tile-sub flap-num" }, `${fmtNum(market.price, p.priceDigits)} €/${p.unit} · ${fmtNum(market.demand, 0)} ${p.unit} Markt`),
      ]),
      h(
        "div",
        { class: "result-tile-list" },
        rows.map((row, i) => renderProductRow(i, row, p)),
      ),
    ]);
  });

  const totalRows = state.players
    .map((player) => ({ player, r: resultsByPlayer[player.id] }))
    .filter((row) => row.r)
    .sort((a, b) => b.r.breakdown.netRevenue - a.r.breakdown.netRevenue);

  const totalTile = h("div", { class: "result-tile is-total" }, [
    h("div", { class: "result-tile-head" }, [iconLabel("trophy", "Gesamt", { size: 18 })]),
    h(
      "div",
      { class: "result-tile-list" },
      totalRows.map(({ player, r }, i) =>
        h("div", { class: "result-row" }, [
          h("div", { class: rankClass(i) }, `#${i + 1}`),
          h("div", { class: "result-row-main" }, [
            h("div", { class: "result-row-top" }, [
              h("span", { class: "result-row-name" }, [avatar(player.persona, 20, "result-avatar"), h("span", {}, player.name)]),
              h(
                "span",
                { class: r.breakdown.netRevenue >= 0 ? "result-row-revenue flap-num" : "result-row-revenue neg flap-num" },
                fmtEUR(r.breakdown.netRevenue),
              ),
            ]),
            h("div", { class: "result-row-stats" }, [
              stat("cash", `${fmtEUR(r.cash)} Kapital`),
              stat("trendUp", `${fmtEUR(r.breakdown.grossRevenue)} Umsatz`),
              stat("trendDown", `${fmtEUR(r.breakdown.operatingCosts)} Kosten`),
              h("button", { class: "detail-btn", onclick: () => openDetailModal(player.name, r.breakdown) }, [iconLabel("search", "Details", { size: 14 })]),
            ]),
          ]),
        ]),
      ),
    ),
  ]);

  mount(
    root,
    h("div", { class: "screen screen-results" }, [
      h("h1", {}, `Jahr ${round} ausgewertet`),
      h("div", { class: "event-banner" }, [
        iconLabel(ctx.weather.icon, ctx.weather.name, { size: 19 }),
        h("span", { class: "sep" }, "·"),
        iconLabel(ctx.marketEvent.icon, ctx.marketEvent.name, { size: 19 }),
      ]),
      h("div", { class: "results-grid" }, [...productTiles, totalTile]),
      h("button", { class: "btn btn-primary btn-xl", onclick: onContinue }, "Weiter ▶"),
    ]),
  );
  // Erst nach dem Einhängen animieren - die Elemente existieren im DOM bereits
  // mit dem Zielwert als Text (siehe die "flap-num"-Spans oben), flapInAll()
  // überschreibt ihn nur kurz mit Zufallsziffern, bevor er wieder einrastet.
  // Alle Tabellen gleichzeitig (kein Versatz), damit das wie EIN gemeinsamer
  // Auflösungs-Moment wirkt statt wie nacheinander abklappernde Kacheln.
  flapInAll(root);
}

/** #1/#2/#3 heben sich farblich ab (wie das Podium beim Abschlussbericht),
 * der Rest bleibt unauffällig - sonst konkurriert jede Kachel visuell mit
 * sich selbst statt die Rangfolge auf einen Blick zu zeigen. */
function rankClass(i) {
  return i === 0 ? "result-row-rank is-first" : "result-row-rank";
}

function renderProductRow(i, { player, s }, p) {
  const digits = qtyDigits(p);
  const untouched = s.produced === 0 && s.sold === 0 && s.leftover === 0;
  return h("div", { class: untouched ? "result-row is-empty" : "result-row" }, [
    h("div", { class: rankClass(i) }, `#${i + 1}`),
    h("div", { class: "result-row-main" }, [
      h("div", { class: "result-row-top" }, [
        h("span", { class: "result-row-name" }, [avatar(player.persona, 20, "result-avatar"), h("span", {}, player.name)]),
        h("span", { class: "result-row-revenue flap-num" }, fmtEUR(s.revenue)),
      ]),
      h("div", { class: "result-row-stats" }, [
        stat("trendUp", `${fmtNum(s.produced, digits)} ${p.unit} erzeugt`),
        stat("store", `${fmtNum(s.sold, digits)} ${p.unit} abgesetzt`),
        stat("crate", `${fmtNum(s.leftover, digits)} ${p.unit} Lager`),
      ]),
    ]),
  ]);
}

function renderFinished(root, state, onNewGame) {
  const scores = state.players
    .map((p) => {
      const res = resourcesFor(state, p.id);
      if (!res) return null;
      return computeFinalScore(p.id, p, res);
    })
    .filter(Boolean)
    .sort((a, b) => b.total - a.total);

  mount(
    root,
    h("div", { class: "screen screen-finished" }, [
      h("h1", {}, [iconLabel("trophy", "Abschlussbericht", { size: 30 })]),
      h(
        "div",
        { class: "leaderboard" },
        scores.map((s, i) => {
          const player = state.players.find((p) => p.id === s.playerId);
          return h("div", { class: "leaderboard-entry" }, [
            h("div", { class: "rank" }, `#${i + 1}`),
            avatar(player.persona, 44, "leaderboard-avatar"),
            h("div", { class: "leaderboard-main" }, [
              h("div", { class: "leaderboard-name" }, `${player.name} — ${fmtNum(s.total, 0)} Punkte`),
              h("div", { class: "leaderboard-report" }, s.reportText),
              h("div", { class: "leaderboard-scores" }, [
                stat("cash", `Vermögen ${fmtNum(s.financeScore, 0)}%`),
                stat("land", `Territorium ${fmtNum(s.sustainabilityScore, 0)}%`),
                stat("members", `Organisation ${fmtNum(s.welfareScore, 0)}%`),
              ]),
            ]),
          ]);
        }),
      ),
      h("button", { class: "btn btn-primary btn-xl", onclick: onNewGame }, "Neues Spiel"),
    ]),
  );
}
