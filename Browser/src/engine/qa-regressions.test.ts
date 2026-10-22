import { describe, expect, it } from "vitest";
import { createInitialState, reduceGame } from "./reducer";
import type { GameState } from "./types";
import { classicPosition, railroadPositions } from "./board";

const start = (count = 3) => {
  let s = createInitialState("QAQA");
  for (let i = 1; i <= count; i++) s = reduceGame(s, { type: "JOIN", player: { id: `p${i}`, name: `Friend ${i}`, color: ["red", "blue", "green"][i - 1]! } });
  return reduceGame(s, { type: "START", playerId: "p1", firstPlayerId: "p1" });
};
const cash = (s: GameState, id: string) => s.players.find(p => p.id === id)!.cash;
const debtor = (): GameState => ({ ...start(), phase: "awaitingDebt", debtResumePhase: "awaitingEndTurn", debts: [{ playerId: "p1", creditorId: "p2", reason: "rent" }],
  players: start().players.map(p => p.id === "p1" ? { ...p, cash: -700, getOutOfJailCards: 1 } : p) });

describe("tester-found settlement regressions", () => {
  it("liquidates buildings at half cost and returns their stock before creditor transfer", () => {
    const s = debtor();
    s.properties[1] = { ownerId: "p1", houses: 5, mortgaged: false };
    s.properties[3] = { ownerId: "p1", houses: 4, mortgaged: false };
    s.bankHouses = 28; s.bankHotels = 11;
    const next = reduceGame(s, { type: "BANKRUPT", playerId: "p1" });
    expect(next.properties[1]).toMatchObject({ ownerId: "p2", houses: 0 });
    expect(next.properties[3]).toMatchObject({ ownerId: "p2", houses: 0 });
    expect(next.bankHouses).toBe(32); expect(next.bankHotels).toBe(12);
    expect(cash(next, "p2")).toBe(1725);
    expect(next.players[1]?.getOutOfJailCards).toBe(1);
    expect(next.players[0]?.getOutOfJailCards).toBe(0);
    expect(JSON.stringify(s)).not.toContain('"bankrupt":true');
  });
  it("auctions bank-repossessed deeds in order and then resumes the next turn", () => {
    const s = debtor(); s.debts![0]!.creditorId = "bank";
    s.properties[1] = { ownerId: "p1", houses: 0, mortgaged: true };
    s.properties[3] = { ownerId: "p1", houses: 0, mortgaged: false };
    let next = reduceGame(s, { type: "BANKRUPT", playerId: "p1" });
    expect(next.phase).toBe("awaitingAuction"); expect(next.auction?.propertyId).toBe(1);
    expect(next.auction?.eligiblePlayerIds).toEqual(["p2", "p3"]);
    next = reduceGame(next, { type: "AUCTION_BID", playerId: "p2", amount: 20 });
    next = reduceGame(next, { type: "AUCTION_BID", playerId: "p3", pass: true });
    expect(next.properties[1]).toEqual({ ownerId: "p2", houses: 0, mortgaged: false });
    expect(next.auction?.propertyId).toBe(3);
    next = reduceGame(next, { type: "AUCTION_BID", playerId: "p2", pass: true });
    next = reduceGame(next, { type: "AUCTION_BID", playerId: "p3", pass: true });
    expect(next.properties[3]?.ownerId).toBeUndefined();
    expect(next.phase).toBe("awaitingRoll"); expect(next.activePlayerId).toBe("p2");
    expect(cash(next, "p2")).toBe(1480);
  });
  it("can liquidate an entire hotel district when the bank has no replacement houses", () => {
    const s = debtor(); s.players[0]!.cash = -100;
    s.properties[1] = { ownerId: "p1", houses: 5, mortgaged: false };
    s.properties[3] = { ownerId: "p1", houses: 5, mortgaged: false };
    s.bankHouses = 0; s.bankHotels = 10;
    const next = reduceGame(s, { type: "BUILD", playerId: "p1", propertyId: 1, operation: "sellGroup" });
    expect(next.properties[1]?.houses).toBe(0); expect(next.properties[3]?.houses).toBe(0);
    expect(next.bankHouses).toBe(0); expect(next.bankHotels).toBe(12);
    expect(cash(next, "p1")).toBe(150); expect(cash(next, "p2")).toBe(1600);
    expect(next.phase).toBe("awaitingEndTurn");
  });
  it("charges double railroad rent for the nearest-railroad Chance card", () => {
    const s = start(); s.players[0]!.position = 0; s.properties[15]!.ownerId = "p2";
    const rolled = reduceGame(s, { type: "ROLL", playerId: "p1", dice: [3, 4] });
    const next = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "p1", cardDraws: [{ deck: "chance", index: 2 }] });
    expect(cash(next, "p1")).toBe(1450); expect(cash(next, "p2")).toBe(1550);
    expect(next.players[0]?.position).toBe(15);
  });
  it.each([40, 48, 56, 64] as const)("applies card rent correctly on a %i-space board, but never on a mortgaged station", size => {
    let s = { ...start(), boardSize: size, properties: createInitialState("QAQA", size).properties };
    for (const id of railroadPositions(size)) s.properties[id]!.ownerId = "p2";
    const move = (s: GameState) => reduceGame(reduceGame(s, { type: "ROLL", playerId: "p1", dice: [3, 4] }), { type: "MOVE_RESULT", playerId: "p1", cardDraws: [{ deck: "chance", index: 2 }] });
    expect(cash(move(s), "p1")).toBe(1100);
    s.properties[classicPosition(15, size)]!.mortgaged = true;
    expect(cash(move(s), "p1")).toBe(1500);
  });
  it("does not auction returned assets after the final opponent is eliminated", () => {
    const s = debtor(); s.players.pop(); s.debts![0]!.creditorId = "bank";
    s.properties[1]!.ownerId = "p1";
    const next = reduceGame(s, { type: "BANKRUPT", playerId: "p1" });
    expect(next.phase).toBe("gameOver"); expect(next.winnerId).toBe("p2");
    expect(next.auction).toBeUndefined(); expect(next.bankAuctionQueue).toBeUndefined();
  });
  it("preserves the roller's unfinished turn through an off-turn estate auction", () => {
    const s = start(); s.phase = "awaitingDebt"; s.debtResumePhase = "awaitingEndTurn";
    s.debts = [{ playerId: "p2", creditorId: "bank", reason: "a bank fee" }]; s.players[1]!.cash = -80;
    s.properties[1]!.ownerId = "p2";
    let next = reduceGame(s, { type: "BANKRUPT", playerId: "p2" });
    expect(next.auction?.propertyId).toBe(1); expect(next.activePlayerId).toBe("p1");
    for (const id of ["p1", "p3"]) next = reduceGame(next, { type: "AUCTION_BID", playerId: id, pass: true });
    expect(next.phase).toBe("awaitingEndTurn"); expect(next.activePlayerId).toBe("p1");
  });
  it("rejects district liquidation by another player or when no buildings remain", () => {
    const s = start(); s.properties[1]!.ownerId = s.properties[3]!.ownerId = "p1";
    const noBuildings = reduceGame(s, { type: "BUILD", playerId: "p1", propertyId: 1, operation: "sellGroup" });
    expect(noBuildings.properties).toEqual(s.properties); expect(cash(noBuildings, "p1")).toBe(1500);
    s.properties[1]!.houses = 1;
    const wrongPlayer = reduceGame(s, { type: "BUILD", playerId: "p2", propertyId: 1, operation: "sellGroup" });
    expect(wrongPlayer.properties).toEqual(s.properties); expect(cash(wrongPlayer, "p2")).toBe(1500);
  });
});
