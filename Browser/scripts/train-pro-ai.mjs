import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { rolldown } from "rolldown";

const profiles = {
  control: null,
  trained: "trained",
  balanced: { openingReserve: 70, developedReserve: 110, riskWeight: 0.90, developmentWeight: 1, denialWeight: 0.85 },
  expansion: { openingReserve: 45, developedReserve: 95, riskWeight: 0.72, developmentWeight: 1.15, denialWeight: 0.90 },
  landlord: { openingReserve: 65, developedReserve: 105, riskWeight: 0.84, developmentWeight: 1.38, denialWeight: 0.74 },
  fortress: { openingReserve: 90, developedReserve: 170, riskWeight: 1.24, developmentWeight: 0.9, denialWeight: 1.12 },
  denial: { openingReserve: 60, developedReserve: 120, riskWeight: 0.92, developmentWeight: 1.12, denialWeight: 1.40 },
  fast: { openingReserve: 30, developedReserve: 80, riskWeight: 0.70, developmentWeight: 1.32, denialWeight: 1.02 },
  finance: { openingReserve: 45, developedReserve: 95, riskWeight: 0.72, developmentWeight: 1.15, denialWeight: 0.90, financeBuilds: true },
  developer: { openingReserve: 30, developedReserve: 95, riskWeight: 0.82, developmentWeight: 1.5, denialWeight: 0.9, financeBuilds: true },
  mayorFinances: { openingReserve: 50, developedReserve: 115, riskWeight: 0.81, developmentWeight: 1.32, denialWeight: 1.05, financeBuilds: true, taxReserveWeight: 0.8 },
  adaptive: { openingReserve: 35, developedReserve: 140, riskWeight: 1.05, developmentWeight: 1.32, denialWeight: 1.03, financeBuilds: true, taxReserveWeight: 0.45 },
  mayorInvestment: { openingReserve: 35, developedReserve: 140, riskWeight: 1.05, developmentWeight: 1.32, denialWeight: 1.03, financeBuilds: true, investmentOnly: true, reserveBlend: 0 },
  mayorGrowth: { openingReserve: 40, developedReserve: 110, riskWeight: 0.88, developmentWeight: 1.5, denialWeight: 1.03, financeBuilds: true, investmentOnly: true, reserveBlend: 0.6, taxReserveWeight: 0.45 },
  mayorBuilder: { openingReserve: 45, developedReserve: 100, riskWeight: 0.76, developmentWeight: 1.32, denialWeight: 1.03, financeBuilds: true, investmentOnly: true, reserveBlend: 1 }
};

function random(seed) {
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 2 ** 32;
  };
}

async function simulate({ source, jobs }) {
  const { nextBotAction, reduceGame, createInitialState, makeStartAction, PLAYER_COLORS, TRAINED_MAYOR_PRO, TRAINED_PRO } = await import(source);
  return jobs.map(({ profile, mode, seed, seats, challenger }) => {
    const strategy = profiles[profile] === "trained" ? (mode === "mayor" ? TRAINED_MAYOR_PRO : TRAINED_PRO) : profiles[profile];
    const ids = Array.from({ length: seats }, (_, i) => "ai-" + (i + 1));
    let state = createInitialState("PRO");
    for (const [i, id] of ids.entries()) {
      state = reduceGame(state, { type: "JOIN", player: { id, name: "Seat " + (i + 1), color: PLAYER_COLORS[i] } });
    }
    state = reduceGame(state, { type: "SET_MODE", playerId: ids[0], mode,
      ...(mode === "mayor" ? { mayorClassic: true } : { rulesEdition: "hasbro-2025" }) });
    state = reduceGame(state, makeStartAction(state, ids[0], random(seed ^ 0x7b7b95cb)));
    if (state.notice) throw new Error(state.notice);
    state = { ...state, players: state.players.map(player => ({ ...player, bot: true, botLevel: "pro" })) };
    const drawBySeat = new Map(ids.map((id, i) => [id, random(seed ^ Math.imul(i + 1, 0x9e3779b1))]));
    const wheel = random(seed ^ 0x239395bf);
    const select = player => player.id === ids[challenger] ? strategy ?? undefined : undefined;
    let steps = 0;
    try {
      for (; steps < 2200 && state.phase !== "gameOver"; steps++) {
        let action = nextBotAction(state, [1, 2], select);
        if (!action) throw new Error("No decision in " + state.phase);
        if (action.type === "ROLL") {
          const draw = drawBySeat.get(action.playerId);
          action = { ...action, dice: [1 + Math.floor(draw() * 6), 1 + Math.floor(draw() * 6)] };
        } else if (action.type === "CITY_SPIN") {
          action = { ...action, section: Math.floor(wheel() * 6), prizeRoll: Math.floor(wheel() * 100) };
        } else if (action.type === "MOVE_RESULT") {
          action = { ...action, rollId: state.pendingRoll?.id };
        }
        const next = reduceGame(state, action);
        if (next.notice || next === state) throw new Error(next.notice ?? "Decision had no effect: " + JSON.stringify(action));
        state = next;
      }
      return { profile, mode, seats, seed, challenger, steps,
        result: state.winnerId === ids[challenger] ? "win" : state.winnerId ? "loss" : "unfinished" };
    } catch (error) {
      return { profile, mode, seats, seed, challenger, steps, result: "error", message: error.message };
    }
  });
}

async function buildEntry() {
  const engine = resolve("src/engine").replaceAll("\\", "/");
  const network = resolve("src/network").replaceAll("\\", "/");
  const bundle = await rolldown({ input: "pro-simulation", platform: "node", plugins: [{
    name: "simulation-entry",
    resolveId(id) { if (id === "pro-simulation") return "\0pro-simulation"; },
    load(id) {
      if (id !== "\0pro-simulation") return;
      return 'export { nextBotAction } from ' + JSON.stringify(engine + "/bots.ts") + ';\n' +
        'export { createInitialState, reduceGame } from ' + JSON.stringify(engine + "/reducer.ts") + ';\n' +
        'export { PLAYER_COLORS } from ' + JSON.stringify(engine + "/playerColors.ts") + ';\n' +
        'export { TRAINED_MAYOR_PRO, TRAINED_PRO } from ' + JSON.stringify(engine + "/proStrategy.ts") + ';\n' +
        'export { makeStartAction } from ' + JSON.stringify(network + "/startAction.ts") + ';';
    }
  }] });
  try {
    const { output } = await bundle.generate({ format: "es" });
    return "data:text/javascript;base64," + Buffer.from(output[0].code).toString("base64");
  } finally {
    await bundle.close();
  }
}

async function main() {
  const cohort = process.argv[2] ?? "train";
  const gamesPerProfile = Number(process.argv[3] ?? 48);
  const names = (process.argv[4] ?? (["holdout","final","mayorFinal","mayorBridge"].includes(cohort) ? "control,trained" : "control,balanced,expansion,landlord,fortress,denial,fast")).split(",");
  if (!["train", "tune2", "holdout", "final", "mayorTune", "mayorFinal", "mayorBridge"].includes(cohort) || !Number.isSafeInteger(gamesPerProfile) || gamesPerProfile < 8 ||
      gamesPerProfile % 8 || names.some(name => !Object.hasOwn(profiles, name))) {
    throw new Error("Usage: node scripts/train-pro-ai.mjs [train|tune2|holdout|final|mayorTune|mayorFinal|mayorBridge] [games per profile, a multiple of 8] [comma-separated profiles]");
  }
  const jobs = [];
  const seatCounts = [2, 2, 3, 4, 5, 6];
  for (let i = 0; i < gamesPerProfile / 2; i++) {
    const mode = cohort.startsWith("mayor") || i % 2 ? "mayor" : "classic";
    const seats = seatCounts[Math.floor(i / 2) % seatCounts.length];
    const seed = { train: 13217, tune2: 6283429, holdout: 1536011, final: 13678513, mayorTune: 8175249, mayorFinal: 27123489, mayorBridge: 62415037 }[cohort] + i * 7547;
    const a = Math.floor(i / 8) % seats;
    for (const challenger of [a, (a + 1) % seats]) {
      for (const profile of names) jobs.push({ profile, mode, seats, seed, challenger });
    }
  }
  const source = await buildEntry();
  const workers = Math.min(Number(process.env.PRO_WORKERS) || 4, availableParallelism(), jobs.length);
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: workers }, (_, i) => new Promise((ok, fail) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { source, jobs: jobs.filter((_, j) => j % workers === i) }
    });
    worker.once("message", ok);
    worker.once("error", fail);
    worker.once("exit", code => { if (code !== 0) fail(new Error("Training worker exited with code " + code)); });
  }))).then(groups => groups.flat());
  const key = game => game.mode + ":" + game.seats + ":" + game.seed + ":" + game.challenger;
  const controls = new Map(results.filter(game => game.profile === "control").map(game => [key(game), game.result]));
  for (const profile of names) {
    for (const label of ["all", "classic", "mayor", "duel"]) {
      const games = results.filter(game => game.profile === profile &&
        (label === "all" || label === game.mode || label === "duel" && game.seats === 2));
      if (!games.length) continue;
      const count = result => games.filter(game => game.result === result).length;
      const seatBaseline = games.reduce((sum, game) => sum + 1 / game.seats, 0);
      process.stdout.write(JSON.stringify({ cohort, profile, mode: label, games: games.length, won: count("win"),
        lost: count("loss"), unfinished: count("unfinished"), errors: count("error"), seatBaseline,
        ...(profile !== "control" && controls.size ? {
          pickedUpWins: games.filter(game => game.result === "win" && controls.get(key(game)) === "loss").length,
          droppedWins: games.filter(game => game.result === "loss" && controls.get(key(game)) === "win").length
        } : {}),
        actions: games.reduce((sum, game) => sum + game.steps, 0) }) + "\n");
    }
  }
  const errors = results.filter(game => game.result === "error");
  if (errors.length) {
    process.stderr.write(JSON.stringify(errors.slice(0, 12)) + "\n");
    process.exitCode = 1;
  }
  process.stdout.write(JSON.stringify({ durationSeconds: Math.round((performance.now() - started) / 1000), workers }) + "\n");
}

if (isMainThread) await main();
else parentPort.postMessage(await simulate(workerData));