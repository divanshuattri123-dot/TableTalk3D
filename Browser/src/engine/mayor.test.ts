import { describe, expect, it } from "vitest";
import { cityTax, fortPosition, projectCityState } from "./mayor";
import { createInitialState, reduceGame } from "./reducer";
import type { GameAction, GameState } from "./types";

const colors = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5", "#ef476f"];
const send = (s: GameState, action: GameAction) => reduceGame(s, action);
function table(count = 3, firstPlayerId = "p1") {
  let state = createInitialState("CTHL");
  for (let i = 0; i < count; i++) state = send(state, { type: "JOIN", player: { id: "p" + (i + 1), name: "Guest " + (i + 1), color: colors[i]! } });
  state = send(state, { type: "SET_MODE", playerId: "p1", mode: "mayor" });
  return send(state, { type: "START", playerId: "p1", firstPlayerId });
}
const cash = (state: GameState, playerId: string) => state.players.find(player => player.id === playerId)!.cash;
const patchPlayer = (state: GameState, id: string, p: Partial<GameState["players"][number]>) =>
  ({ ...state, players: state.players.map(player => player.id === id ? { ...player, ...p } : player) });
const end = (state: GameState, p = state.activePlayerId!) => send({ ...state, phase: "awaitingEndTurn" }, { type: "END_TURN", playerId: p });
const withRent = (state: GameState, id: string, amount: number): GameState =>
  ({ ...state, mayor: { ...state.mayor!, seats: { ...state.mayor!.seats, [id]: { ...state.mayor!.seats[id]!, rent: amount } } } });
const newRound = (state: GameState) => {
  const before = state.mayor!.round;
  for (let i = 0; i < state.players.length && before === state.mayor!.round; i++) state = end(state);
  return state;
};
function landAtWheel(state: GameState, id = state.activePlayerId!) {
  const propertyId = fortPosition(state);
  const rolled = send(patchPlayer(state, id, { position: propertyId - 7 }), { type: "ROLL", playerId: id, dice: [3, 4] });
  return send(send(rolled, { type: "MOVE_RESULT", playerId: id }), { type: "BUY", playerId: id, propertyId });
}

describe("Mayor rules", () => {
  it("applies marginal tax slabs and caps the total", () => {
    expect([0, 6, 50, 100, 200, 300, 400, 600, 700, 2000].map(cityTax)).toEqual([0, 1, 5, 10, 20, 40, 80, 160, 200, 200]);
  });
  it("issues an immediate private bill when rent is collected and allows off-turn deferral", () => {
    const state = table();
    const owned = { ...state, properties: { ...state.properties, 23: { ownerId: "p2", houses: 3 as const, mortgaged: false } } };
    const rolled = send(patchPlayer(owned, "p1", { position: 16 }), { type: "ROLL", playerId: "p1", dice: [3, 4] });
    const landed = send(rolled, { type: "MOVE_RESULT", playerId: "p1" });
    expect(cash(landed, "p2")).toBe(2200);
    expect(landed.mayor!.seats.p2!.rent).toBe(700);
    expect(landed.mayor!.seats.p2!.bills).toEqual([{ round: 1, amount: 200, dueTurn: 2, status: "open" }]);
    const deferredOffTurn = send(landed, { type: "CITY_DEFER_TAX", playerId: "p2", round: 1 });
    expect(deferredOffTurn.mayor!.seats.p2!.bills[0]?.status).toBe("deferred");
    const raided = send(deferredOffTurn, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" });
    expect(cash(raided, "p2")).toBe(1975);
    expect(newRound(landed).mayor!.seats.p2!.bills).toHaveLength(1);
  });
  it("tracks two-round terms, survives an eliminated anchor and skips doubles", () => {
    let state = table(4, "p3");
    expect(state.boardSize).toBe(48);
    expect(state.mayor?.mayorId).toBe("p3");
    const double = { playerId: "p3", dice: [2, 2] as const, total: 4, doubles: true, grantsExtraRoll: true };
    const again = end({ ...state, lastRoll: double });
    expect(again.activePlayerId).toBe("p3");
    expect(again.mayor!.seats.p3!.turns).toBe(0);
    state = newRound(state);
    expect(state.mayor?.mayorId).toBe("p3");
    state = newRound(state);
    expect(state.mayor?.mayorId).toBe("p4");
    state = newRound(patchPlayer(state, "p3", { bankrupt: true }));
    expect(state.mayor?.round).toBe(4);
    expect(state.mayor?.mayorId).toBe("p4");
  });
  it("preserves private payment status and masked balance until posting", () => {
    let state = end(newRound(withRent(table(), "p2", 600)));
    expect(state.activePlayerId).toBe("p2");
    state = send(state, { type: "CITY_PAY_TAX", playerId: "p2", round: 1 });
    expect(cash(state, "p2")).toBe(1340);
    expect(state.mayor?.treasury).toBe(400);
    expect(cash(projectCityState(state, "p1"), "p2")).toBe(1500);
    expect(projectCityState(state, "p1").mayor?.seats.p2?.bills).toEqual([]);
    expect(projectCityState(state, "p2").mayor?.seats.p2?.bills[0]?.status).toBe("paid");
    const rejected = send(state, { type: "CITY_PAY_TAX", playerId: "p2", round: 1 });
    expect(projectCityState(rejected, "p1").notice).toBeUndefined();
    const due = end(end(end(end(state))));
    expect(due.mayor?.treasury).toBe(560);
    expect(due.mayor?.seats.p2?.bills).toEqual([]);
  });
  it("blocks a raid during bidding and restores the correct turn after a rival mortgages", () => {
    const state = end(newRound(withRent(table(), "p2", 600)));
    let owing = send(state, { type: "CITY_DEFER_TAX", playerId: "p2", round: 1 });
    owing = patchPlayer(owing, "p2", { cash: 25 });
    owing = { ...owing, properties: { ...owing.properties, 39: { ownerId: "p2", houses: 0, mortgaged: false } } };
    const audit = { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" } as const;
    expect(send({ ...owing, phase: "awaitingAuction" }, audit).notice).toBeTruthy();
    const raided = send(owing, audit);
    expect(raided.phase).toBe("awaitingDebt");
    expect(cash(raided, "p2")).toBe(-160);
    expect(raided.mayor?.treasury).toBe(425);
    const settled = send(raided, { type: "MORTGAGE", playerId: "p2", propertyId: 39, mortgage: true });
    expect(settled.phase).toBe("awaitingRoll");
    expect(settled.activePlayerId).toBe("p2");
    expect(settled.mayor?.treasury).toBe(585);
    expect(send(settled, audit).notice).toBeTruthy();
  });
  it("automatically audits a deferral in a two-seat match, including off-turn deferrals on the Mayor's final turn", () => {
    let state = end(newRound(withRent(table(2), "p2", 600)));
    state = send(state, { type: "CITY_DEFER_TAX", playerId: "p2", round: 1 });
    expect(cash(state, "p2")).toBe(1500);
    // Seat 2 becomes Mayor at the next boundary, so the outgoing Mayor's
    // remaining warrant is applied at the close of the old term.
    state = end(state);
    expect(state.mayor!.round).toBe(3);
    expect(cash(state, "p2")).toBe(1315);

    // Term 2: p2 is Mayor for rounds 3 and 4. On p2's final turn (round 4), p1 collects rent and defers off-turn.
    state = newRound(state);
    expect(state.mayor!.round).toBe(4);
    expect(state.mayor!.mayorId).toBe("p2");
    state = end(state, "p1");
    state = { ...state, properties: { ...state.properties, 23: { ownerId: "p1", houses: 3 as const, mortgaged: false } } };
    const rolled = send(patchPlayer(state, "p2", { position: 16 }), { type: "ROLL", playerId: "p2", dice: [3, 4] });
    const landed = send(rolled, { type: "MOVE_RESULT", playerId: "p2" });
    const deferred = send(landed, { type: "CITY_DEFER_TAX", playerId: "p1", round: 4 });
    expect(deferred.mayor!.seats.p1!.bills[0]?.status).toBe("deferred");
    const rotated = end(deferred, "p2");
    expect(rotated.mayor!.round).toBe(5);
    expect(rotated.mayor!.mayorId).toBe("p1");
    expect(cash(rotated, "p1")).toBe(2200 - 225);
  });
  it("charges the Mayor for a failed raid and keeps current loans out of an audit", () => {
    const state = table();
    const audited = send(state, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" });
    expect(cash(audited, "p1")).toBe(1475);
    expect(cash(audited, "p2")).toBe(1525);
    expect(audited.mayor?.auditUsed).toBe(true);
    expect(audited.mayor?.treasury).toBe(400);
  });
  it("passes a majority vote at the round boundary with missing voters", () => {
    let state = table();
    state = send(state, { type: "CITY_PROPOSE", playerId: "p1", term: 1, policy: "transit" });
    state = send(state, { type: "CITY_VOTE", playerId: "p2", term: 1 });
    expect(newRound(state).mayor!.policy?.kind).toBe("transit");
    state = send(state, { type: "CITY_VOTE", playerId: "p3", term: 1 });
    expect(newRound(state).mayor!.policy?.kind).toBe("loans");
  });
  it("aggregates loan and tax, rejects loan cash-outs, and resumes once debt is covered", () => {
    let state = send(withRent(table(), "p2", 300), { type: "CITY_PROPOSE", playerId: "p1", term: 1, policy: "loans" });
    state = patchPlayer(end(newRound(state)), "p2", { cash: 100 });
    state = send(state, { type: "CITY_LOAN", playerId: "p2", round: 2 });
    expect(cash(state, "p2")).toBe(300);
    expect(state.mayor!.treasury).toBe(200);
    const wash = send(state, { type: "TRADE_OFFER", playerId: "p2", toPlayerId: "p3", offerId: "wash",
      offeredCash: 200, offeredPropertyIds: [], requestedCash: 0, requestedPropertyIds: [] });
    expect(wash.notice).toContain("Repay your city loan");
    state = send(state, { type: "CITY_DEFER_TAX", playerId: "p2", round: 1 });
    state = end(end(end(state)));
    state = patchPlayer(state, "p2", { cash: 15 });
    state = { ...state, properties: { ...state.properties, 39: { ownerId: "p2", houses: 0, mortgaged: false }, 37: { ownerId: "p2", houses: 0, mortgaged: false } } };
    state = end(state);
    expect(state.phase).toBe("awaitingDebt");
    expect(cash(state, "p2")).toBe(-250);
    expect(state.debts).toHaveLength(1);
    state = send(send(state, { type: "MORTGAGE", playerId: "p2", propertyId: 39, mortgage: true }), { type: "MORTGAGE", playerId: "p2", propertyId: 37, mortgage: true });
    expect(state.phase).toBe("awaitingEndTurn");
    expect(state.mayor!.treasury).toBe(465);
    expect(end(state).activePlayerId).toBe("p3");
  });
  it("wraps Express without GO salary, resolves destination rent and cannot roll again", () => {
    let state = patchPlayer(table(), "p1", { position: 35 });
    state = { ...state, properties: { ...state.properties, 5: { ownerId: "p2", houses: 0, mortgaged: false } } };
    const jailed = patchPlayer(state, "p1", { inJail: true });
    expect(send(jailed, { type: "CITY_EXPRESS", playerId: "p1" }).notice).toBeTruthy();
    state = send(state, { type: "CITY_EXPRESS", playerId: "p1" });
    expect(state.players[0]?.position).toBe(5);
    expect(cash(state, "p1")).toBe(1400);
    expect(cash(state, "p2")).toBe(1525);
    expect(state.phase).toBe("awaitingEndTurn");
    expect(send(state, { type: "ROLL", playerId: "p1", dice: [3, 4] }).notice).toBeTruthy();
  });
  it("offers wheel after property resolution and saves a scratch prize through reload", () => {
    let state = landAtWheel(table());
    const wheelId = state.mayor!.wheel!.id;
    expect(state.properties[23]?.ownerId).toBe("p1");
    const draw = { type: "CITY_SPIN", playerId: "p1", wheelId, section: 5, prizeRoll: 99 } as const;
    const frozen = JSON.stringify(state);
    const preview = send(state, draw);
    expect(JSON.stringify(state)).toBe(frozen);
    expect(send(state, draw)).toEqual(preview);
    expect(projectCityState(preview, "p1").mayor?.wheel?.prize).toBeUndefined();
    expect(projectCityState(preview, "p1").mayor?.jackpotUsed).toBeUndefined();
    state = JSON.parse(JSON.stringify(preview));
    expect(send(state, draw).notice).toBeTruthy();
    const scratch = { type: "CITY_SCRATCH", playerId: "p1", wheelId } as const;
    state = send(state, scratch);
    expect(cash(state, "p1")).toBe(3280);
    expect(cash(send(state, scratch), "p1")).toBe(3280);
    state = end(state);
    const p2 = patchPlayer(state, "p2", { position: 16 });
    state = send(send(p2, { type: "ROLL", playerId: "p2", dice: [3, 4] }), { type: "MOVE_RESULT", playerId: "p2" });
    state = send(state, { ...draw, playerId: "p2", wheelId: state.mayor!.wheel!.id });
    expect(state.mayor!.wheel?.prize).toBe(250);
    expect(cash(end(state), "p2")).toBe(1732);
  });
});
