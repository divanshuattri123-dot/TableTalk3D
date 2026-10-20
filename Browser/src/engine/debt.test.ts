import { describe, expect, it } from "vitest";
import { createInitialState, reduceGame } from "./reducer";
import type { GameAction, GameState, Player, PropertyState } from "./types";

const start = (count = 2) => {
  let state = createInitialState("DEBT");
  for (let i = 1; i <= count; i++) state = reduceGame(state, { type: "JOIN", player: { id: `p${i}`, name: `Player ${i}`, color: "#456789" } });
  return reduceGame(state, { type: "START", playerId: "p1", firstPlayerId: "p1" });
};
const player = (s: GameState, id: string, patch: Partial<Player>): GameState => ({ ...s, players: s.players.map(p => p.id === id ? { ...p, ...patch } : p) });
const deed = (s: GameState, id: number, patch: Partial<PropertyState>): GameState => ({ ...s, properties: { ...s.properties, [id]: { ...s.properties[id]!, ...patch } } });
const landTax = (s: GameState) => reduceGame(reduceGame(player(s, "p1", { position: 2 }), { type: "ROLL", playerId: "p1", dice: [1, 1] }), { type: "MOVE_RESULT", playerId: "p1" });
const cash = (s: GameState, id = "p1") => s.players.find(p => p.id === id)!.cash;
const taxDebt = () => landTax(player(deed(start(), 37, { ownerId: "p1" }), "p1", { cash: 100 }));
const trade = (s: GameState, amount: number, properties = [37]) => reduceGame(s, { type: "TRADE_OFFER", playerId: "p1", offerId: "rescue", toPlayerId: "p2", offeredCash: 0, offeredPropertyIds: properties, requestedCash: amount, requestedPropertyIds: [] });

describe("mandatory debt settlement", () => {
  it("pauses negative cash and remembers the creditor and interrupted phase", () => {
    const state = taxDebt();
    expect(cash(state)).toBe(-100); expect(state.phase).toBe("awaitingDebt");
    expect(state.debts).toEqual([{ playerId: "p1", creditorId: "bank", reason: expect.stringContaining("Income Tax") }]);
    expect(state.debtResumePhase).toBe("awaitingEndTurn");
  });
  it("blocks normal play and other players while someone owes money", () => {
    const state = taxDebt();
    const actions: GameAction[] = [
      { type: "END_TURN", playerId: "p1" }, { type: "ROLL", playerId: "p1", dice: [6, 6] },
      { type: "BUILD", playerId: "p1", propertyId: 37, operation: "build" },
      { type: "MORTGAGE", playerId: "p1", propertyId: 37, mortgage: false },
      { type: "MORTGAGE", playerId: "p2", propertyId: 37, mortgage: true },
      { type: "BANKRUPT", playerId: "p2" }, { type: "BUY", playerId: "p1", propertyId: 1 }
    ];
    for (const action of actions) {
      const next = reduceGame(state, action);
      expect(next.phase).toBe("awaitingDebt"); expect(next.players).toEqual(state.players); expect(next.properties).toEqual(state.properties);
    }
  });
  it("resumes only when mortgages fully clear the shortfall", () => {
    const state = reduceGame(taxDebt(), { type: "MORTGAGE", playerId: "p1", propertyId: 37, mortgage: true });
    expect(cash(state)).toBe(75); expect(state.phase).toBe("awaitingEndTurn"); expect(state.debts).toBeUndefined();
    expect(reduceGame(state, { type: "END_TURN", playerId: "p1" }).phase).toBe("awaitingRoll");
  });
  it("lets a negative-balance player offer zero cash and trade a deed for rescue money", () => {
    const offered = trade(taxDebt(), 150);
    expect(offered.phase).toBe("awaitingTradeResponse");
    const accepted = reduceGame(offered, { type: "TRADE_ACCEPT", playerId: "p2", offerId: "rescue" });
    expect(cash(accepted)).toBe(50); expect(accepted.properties[37]?.ownerId).toBe("p2"); expect(accepted.phase).toBe("awaitingEndTurn");
  });
  it("returns a declined rescue to debt settlement rather than normal play", () => {
    const declined = reduceGame(trade(taxDebt(), 150), { type: "TRADE_DECLINE", playerId: "p2", offerId: "rescue" });
    expect(declined.phase).toBe("awaitingDebt"); expect(cash(declined)).toBe(-100);
  });
  it("keeps an insufficient rescue in debt when other assets remain", () => {
    const state = deed(taxDebt(), 39, { ownerId: "p1" });
    const next = reduceGame(trade(state, 50), { type: "TRADE_ACCEPT", playerId: "p2", offerId: "rescue" });
    expect(cash(next)).toBe(-50); expect(next.phase).toBe("awaitingDebt");
  });
  it("pays a rent creditor only actual cash, including later mortgage proceeds", () => {
    let state = deed(deed(player(start(), "p1", { cash: 10 }), 37, { ownerId: "p1" }), 3, { ownerId: "p2", houses: 4 });
    state = reduceGame(reduceGame(state, { type: "ROLL", playerId: "p1", dice: [1, 2] }), { type: "MOVE_RESULT", playerId: "p1" });
    expect(state.phase).toBe("awaitingDebt"); expect(cash(state)).toBe(-310); expect(cash(state, "p2")).toBe(1510);
    state = reduceGame(state, { type: "MORTGAGE", playerId: "p1", propertyId: 37, mortgage: true });
    expect(cash(state)).toBe(-135); expect(cash(state, "p2")).toBe(1685); expect(state.phase).toBe("awaitingDebt");
    state = reduceGame(trade(state, 150), { type: "TRADE_ACCEPT", playerId: "p2", offerId: "rescue" });
    expect(cash(state)).toBe(15); expect(cash(state, "p2")).toBe(1670); expect(state.phase).toBe("awaitingEndTurn");
  });
  it("allows even building sales, then a mortgage, to settle a debt", () => {
    let state = landTax(player(deed(deed(start(), 1, { ownerId: "p1", houses: 1 }), 3, { ownerId: "p1", houses: 1 }), "p1", { cash: 140 }));
    for (const id of [1, 3]) state = reduceGame(state, { type: "BUILD", playerId: "p1", propertyId: id, operation: "sell" });
    expect(cash(state)).toBe(-10); expect(state.phase).toBe("awaitingDebt");
    state = reduceGame(state, { type: "MORTGAGE", playerId: "p1", propertyId: 1, mortgage: true });
    expect(cash(state)).toBe(20); expect(state.phase).toBe("awaitingEndTurn");
  });
  it("handles off-turn Community Chest debtors in order before resuming the roller", () => {
    let state = player(player(deed(deed(start(3), 1, { ownerId: "p2" }), 3, { ownerId: "p3" }), "p2", { cash: 20 }), "p3", { cash: 20 });
    state = reduceGame(reduceGame(state, { type: "ROLL", playerId: "p1", dice: [1, 1] }), { type: "MOVE_RESULT", playerId: "p1", cardDraws: [{ deck: "community", index: 5 }] });
    expect(state.activePlayerId).toBe("p1"); expect(state.debts?.map(d => d.playerId)).toEqual(["p2", "p3"]); expect(cash(state)).toBe(1540);
    state = reduceGame(state, { type: "MORTGAGE", playerId: "p3", propertyId: 3, mortgage: true });
    expect(state.properties[3]?.mortgaged).toBe(false);
    state = reduceGame(state, { type: "MORTGAGE", playerId: "p2", propertyId: 1, mortgage: true });
    expect(state.debts?.[0]?.playerId).toBe("p3"); expect(state.phase).toBe("awaitingDebt");
    state = reduceGame(state, { type: "MORTGAGE", playerId: "p3", propertyId: 3, mortgage: true });
    expect(state.phase).toBe("awaitingEndTurn"); expect(state.activePlayerId).toBe("p1"); expect(cash(state)).toBe(1600);
  });
  it("preserves the third jail roll while its mandatory fine is being raised", () => {
    let state = player(deed(deed(start(), 1, { ownerId: "p1" }), 3, { ownerId: "p1" }), "p1", { cash: 10, inJail: true, jailTurns: 2, position: 10 });
    state = reduceGame(state, { type: "ROLL", playerId: "p1", dice: [1, 2] });
    state = reduceGame(state, { type: "PAY", playerId: "p1", kind: "jailFine" });
    expect(state.phase).toBe("awaitingDebt"); expect(state.debtResumePhase).toBe("awaitingMove"); expect(state.pendingRoll?.total).toBe(3);
    for (const id of [1, 3]) state = reduceGame(state, { type: "MORTGAGE", playerId: "p1", propertyId: id, mortgage: true });
    expect(state.phase).toBe("awaitingMove"); expect(state.pendingRoll?.total).toBe(3); expect(cash(state)).toBe(20);
    state = reduceGame(state, { type: "MOVE_RESULT", playerId: "p1" });
    expect(state.players[0]?.position).toBe(13); expect(cash(state)).toBe(20);
  });
  it("resumes the collector after an off-turn debtor surrenders", () => {
    let state = player(deed(start(3), 1, { ownerId: "p2" }), "p2", { cash: 20 });
    state = reduceGame(reduceGame(state, { type: "ROLL", playerId: "p1", dice: [1, 1] }), { type: "MOVE_RESULT", playerId: "p1", cardDraws: [{ deck: "community", index: 5 }] });
    state = reduceGame(state, { type: "BANKRUPT", playerId: "p2" });
    expect(state.players[1]?.bankrupt).toBe(true); expect(state.properties[1]?.ownerId).toBe("p1");
    expect(state.activePlayerId).toBe("p1"); expect(state.phase).toBe("awaitingEndTurn"); expect(state.debts).toBeUndefined();
  });
  it("eliminates a debtor when an insufficient trade gives away the last asset", () => {
    const next = reduceGame(trade(taxDebt(), 50), { type: "TRADE_ACCEPT", playerId: "p2", offerId: "rescue" });
    expect(cash(next)).toBe(-50); expect(next.players[0]?.bankrupt).toBe(true);
    expect(next.phase).toBe("gameOver"); expect(next.winnerId).toBe("p2");
  });
  it("allows an insolvent debtor to surrender and declares the final survivor", () => {
    const next = reduceGame(taxDebt(), { type: "BANKRUPT", playerId: "p1" });
    expect(next.players[0]?.bankrupt).toBe(true); expect(next.properties[37]?.ownerId).toBeUndefined();
    expect(next.phase).toBe("gameOver"); expect(next.winnerId).toBe("p2"); expect(next.debts).toBeUndefined();
    expect(reduceGame(start(), { type: "BANKRUPT", playerId: "p1" }).players[0]?.bankrupt).toBe(false);
  });
  it("transfers surrendered assets to the real creditor and advances the eliminated turn", () => {
    let state = deed(deed(player(start(3), "p1", { cash: 10 }), 37, { ownerId: "p1" }), 3, { ownerId: "p2", houses: 4 });
    state = reduceGame(reduceGame(state, { type: "ROLL", playerId: "p1", dice: [1, 2] }), { type: "MOVE_RESULT", playerId: "p1" });
    state = reduceGame(state, { type: "BANKRUPT", playerId: "p1" });
    expect(state.properties[37]?.ownerId).toBe("p2"); expect(cash(state, "p2")).toBe(1510);
    expect(state.activePlayerId).toBe("p2"); expect(state.phase).toBe("awaitingRoll");
  });
  it("does not classify an exactly zero cash balance as debt", () => {
    expect(landTax(player(start(), "p1", { cash: 200 })).phase).toBe("awaitingEndTurn");
  });
  it("cannot roll past a negative balance left by an older room version", () => {
    const state = player(deed(start(), 37, { ownerId: "p1" }), "p1", { cash: -10 });
    const before = JSON.stringify(state), action = { type: "ROLL", playerId: "p1", dice: [1, 2] } as const;
    expect(reduceGame(state, action).phase).toBe("awaitingDebt"); expect(JSON.stringify(state)).toBe(before);
    expect(reduceGame(state, action)).toEqual(reduceGame(state, action));
  });
});
