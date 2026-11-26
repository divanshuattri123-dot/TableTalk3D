import { describe, expect, it } from "vitest";
import { makeCardDraws } from "../network/cardDraws";
import { nextBotAction } from "./bots";
import { PLAYER_COLORS } from "./playerColors";
import { createInitialState, reduceGame } from "./reducer";
import type { GameState } from "./types";

const seatId = (seat: number) => `ai-${seat}`;

function table(count: number, firstSeat = 1): GameState {
  let state = createInitialState("SOAK");
  for (let seat = 1; seat <= count; seat++) {
    state = reduceGame(state, { type: "JOIN", player: { id: seatId(seat), name: `Seat ${seat}`, color: PLAYER_COLORS[seat - 1]! } });
  }
  state = reduceGame(state, { type: "SET_MODE", playerId: seatId(1), mode: "mayor" });
  state = reduceGame(state, { type: "START", playerId: seatId(1), firstPlayerId: seatId(firstSeat) });
  return { ...state, players: state.players.map(player => ({ ...player, bot: true })) };
}

function diceSource(seed: number) {
  let state = seed;
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * bound);
  };
}

describe("Mayor game regression coverage", () => {
  it.each([
    [2, 1, 73],
    [3, 3, 11],
    [4, 2, 54],
    [5, 4, 13],
    [6, 5, 151]
  ])("resolves legal bot actions with %i seats, first seat %i and seed %i", (count, firstSeat, seed) => {
    const pick = diceSource(seed);
    let state = table(count, firstSeat);
    let steps = 0;
    for (; steps < 1200 && state.phase !== "gameOver"; steps++) {
      let action = nextBotAction(state, [1 + pick(6), 1 + pick(6)]);
      const context = `round ${state.mayor?.round}, step ${steps}, phase ${state.phase}, active ${state.activePlayerId}`;
      expect(action, context).toBeDefined();
      if (!action) break;
      if (action.type === "MOVE_RESULT") {
        const playerId = action.playerId;
        const player = state.players.find(candidate => candidate.id === playerId)!;
        action = { ...action, cardDraws: makeCardDraws(state, player, pick) };
      } else if (action.type === "CITY_SPIN") {
        action = { ...action, section: pick(6), prizeRoll: pick(100) };
      }
      const next = reduceGame(state, action);
      expect(next.notice, `${context}, action ${JSON.stringify(action)}`).toBeUndefined();
      expect(next.mayor!.round).toBeGreaterThanOrEqual(state.mayor!.round);
      expect(next.mayor!.treasury).toBeGreaterThanOrEqual(0);
      if (next.phase !== "gameOver") {
        expect(next.players.find(player => player.id === next.mayor?.mayorId)?.bankrupt, context).toBe(false);
        expect(next.players.find(player => player.id === next.activePlayerId)?.bankrupt, context).toBe(false);
      }
      state = next;
    }
    expect(state.mayor!.round > 12 || state.phase === "gameOver").toBe(true);
  });
});
describe("City Hall interactions between seats", () => {
  it("passes the office immediately when the Mayor goes bankrupt from a failed off-turn raid", () => {
    const state = table(3);
    const pennilessMayor: GameState = {
      ...state,
      activePlayerId: seatId(2),
      players: state.players.map(player => player.id === seatId(1) ? { ...player, cash: 0 } : player)
    };
    const after = reduceGame(pennilessMayor, { type: "CITY_AUDIT", playerId: seatId(1), term: 1, targetId: seatId(3) });
    expect(after.players[0]?.bankrupt).toBe(true);
    expect(after.mayor?.mayorId).toBe(seatId(2));
    expect(after.mayor?.term).toBe(2);
    expect(after.mayor?.auditUsed).toBeUndefined();
    expect(after.activePlayerId).toBe(seatId(2));
    expect(after.phase).toBe("awaitingRoll");
    const stale = reduceGame(after, { type: "CITY_AUDIT", playerId: seatId(2), term: 1, targetId: seatId(3) });
    expect(stale.notice).toBeTruthy();
    expect(stale.mayor?.auditUsed).toBeUndefined();
  });

  it("uses a saved Lucky Scratch prize before an audit can bankrupt its winner", () => {
    const state = table(3);
    const targetId = seatId(2), desk = state.mayor!;
    const waiting: GameState = {
      ...state,
      phase: "awaitingEndTurn",
      activePlayerId: targetId,
      players: state.players.map(player => player.id === targetId ? { ...player, cash: 0 } : player),
      mayor: {
        ...desk,
        wheel: { id: 99, playerId: targetId },
        seats: { ...desk.seats, [targetId]: { ...desk.seats[targetId]!, bills: [{ amount: 150, round: 1, dueTurn: 2, status: "deferred" }] } }
      }
    };
    const spun = reduceGame(waiting, { type: "CITY_SPIN", playerId: targetId, wheelId: 99, section: 5, prizeRoll: 99 });
    const audited = reduceGame(spun, { type: "CITY_AUDIT", playerId: seatId(1), term: 1, targetId });
    expect(audited.players.find(player => player.id === targetId)).toMatchObject({ cash: 1825, bankrupt: false });
    expect(audited.activePlayerId).toBe(targetId);
    expect(audited.mayor?.wheelResult?.prize).toBe(2000);
    const replay = reduceGame(audited, { type: "CITY_SCRATCH", playerId: targetId, wheelId: 99 });
    expect(replay.players.find(player => player.id === targetId)?.cash).toBe(1825);
  });
});
