import { supabase } from "./supabaseClient.js";
import { STARTING_RESOURCES, STARTING_CASH, MAX_ROUNDS } from "./constants.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I

export function genGameCode(len = 5) {
  let code = "";
  for (let i = 0; i < len; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function must(res) {
  if (res.error) throw res.error;
  return res.data;
}

export async function createGame() {
  const id = genGameCode();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const row = must(
    await supabase.from("games").insert({ id, seed, status: "LOBBY", round: 0, max_rounds: MAX_ROUNDS }).select().single(),
  );
  return row;
}

/** maybeSingle() statt single(): ein nicht (mehr) existierendes Spiel ist hier
 * ein normaler Fall - der Gastgeber hat neu gestartet, oder im localStorage
 * steht noch ein alter Code. single() lässt PostgREST darauf mit HTTP 406
 * (PGRST116) antworten, was in der Konsole bei jedem Aufruf als Fehler
 * auftaucht, obwohl nichts kaputt ist. maybeSingle() liefert schlicht null. */
export async function getGame(gameId) {
  const res = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
  if (res.error) return null;
  return res.data;
}

/** Löscht ein Spiel komplett (Spieler/Ressourcen/Aktionen/Ergebnisse per
 * ON DELETE CASCADE). Für den "Neustart"-Button des Gastgebers. */
export async function deleteGame(gameId) {
  await supabase.from("games").delete().eq("id", gameId);
}

export async function listPlayers(gameId) {
  return must(await supabase.from("players").select("*").eq("game_id", gameId).order("created_at"));
}

export async function listResources(gameId) {
  const players = await listPlayers(gameId);
  if (players.length === 0) return [];
  const ids = players.map((p) => p.id);
  return must(await supabase.from("player_resources").select("*").in("player_id", ids));
}

export async function joinGame(gameId, name, role, persona) {
  const player = must(
    await supabase
      .from("players")
      .insert({ game_id: gameId, name, cash: STARTING_CASH, role, persona, connected: true })
      .select()
      .single(),
  );
  await supabase.from("player_resources").insert({ player_id: player.id, ...STARTING_RESOURCES });
  return player;
}

/** KI-Gegner: eine normale Spieler-Zeile mit bot_level; der Gastgeber
 * entscheidet jede Runde für ihn (siehe bots.js / host.js). */
export async function addBot(gameId, name, role, level, persona) {
  const player = must(
    await supabase
      .from("players")
      .insert({ game_id: gameId, name, cash: STARTING_CASH, role, bot_level: level, persona, connected: true })
      .select()
      .single(),
  );
  await supabase.from("player_resources").insert({ player_id: player.id, ...STARTING_RESOURCES });
  return player;
}

export async function removePlayer(playerId) {
  await supabase.from("players").delete().eq("id", playerId);
}

export async function markConnected(playerId, connected) {
  await supabase.from("players").update({ connected }).eq("id", playerId);
}

export async function startGame(gameId) {
  await supabase.from("games").update({ status: "PLAYING", round: 1 }).eq("id", gameId);
}

export async function submitAction(gameId, playerId, round, decisions) {
  await supabase
    .from("actions")
    .upsert(
      { game_id: gameId, player_id: playerId, round, action_type: "round_decision", payload: decisions },
      { onConflict: "player_id,round" },
    );
}

export async function getActionsForRound(gameId, round) {
  return must(await supabase.from("actions").select("*").eq("game_id", gameId).eq("round", round));
}

export async function getRoundResult(playerId, round) {
  const res = await supabase.from("round_results").select("*").eq("player_id", playerId).eq("round", round).maybeSingle();
  if (res.error) return null;
  return res.data;
}

export async function listRoundResults(gameId, round) {
  return must(await supabase.from("round_results").select("*").eq("game_id", gameId).eq("round", round));
}

/** Ergebnisse aller Organisationen ab einer Runde - das Handy braucht die
 * letzten zwei für das Marktgedächtnis (siehe engine.priceMemory). */
export async function listResultsSince(gameId, fromRound) {
  return must(await supabase.from("round_results").select("*").eq("game_id", gameId).gte("round", fromRound).order("round"));
}

/** Alle bisherigen Rundenergebnisse eines Spiels (für Trendlinien/Marktboard),
 * aufsteigend nach Runde sortiert. */
export async function listAllRoundResults(gameId) {
  return must(await supabase.from("round_results").select("*").eq("game_id", gameId).order("round"));
}

/** Host schreibt die berechneten Ergebnisse einer Runde für alle Spieler
 * zurück und stellt danach entweder die nächste Runde oder FINISHED ein. */
export async function applyRoundResults(game, resultsByPlayer, weather, marketEvent) {
  for (const [playerId, r] of Object.entries(resultsByPlayer)) {
    await supabase.from("players").update({ cash: r.cash }).eq("id", playerId);
    await supabase.from("player_resources").update(r.resources).eq("player_id", playerId);
    await supabase.from("round_results").upsert(
      {
        game_id: game.id,
        player_id: playerId,
        round: game.round,
        // cashAfter wird mit in die JSONB-Breakdown gepackt statt eine eigene
        // Spalte anzulegen - so bleibt die Trendlinien-Anzeige ohne
        // Schema-Migration nachrüstbar.
        breakdown: { ...r.breakdown, cashAfter: r.cash },
        weather,
        market_event: marketEvent,
      },
      { onConflict: "player_id,round" },
    );
  }
  const nextRound = game.round + 1;
  const finished = nextRound > game.max_rounds;
  await supabase
    .from("games")
    .update(finished ? { status: "FINISHED" } : { round: nextRound })
    .eq("id", game.id);
}

export function subscribeGame(gameId, onChange) {
  const channel = supabase
    .channel(`game:${gameId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "player_resources" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "actions", filter: `game_id=eq.${gameId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "round_results", filter: `game_id=eq.${gameId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
