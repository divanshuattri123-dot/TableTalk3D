import { describe, expect, it } from "vitest";
import { makeStartAction } from "../network/startAction";
import { nextBotAction } from "./bots";
import { jailCardIndex } from "./classicCards";
import { getTile } from "./board";
import { cityLoanBalance, cityTax, newTerm, nextAuditMiss, permitPauseActive, recordRent } from "./mayor";
import { createInitialState, reduceGame } from "./reducer";
import type { GameAction, GameState } from "./types";

const order = Array.from({ length: 16 }, (_, index) => index);
function table() {
  let state = createInitialState("CITY");
  for (const [id, color] of [["p1", "red"], ["p2", "blue"], ["p3", "green"]] as const) {
    state = reduceGame(state, { type: "JOIN", player: { id, name: id, color } });
  }
  state = reduceGame(state, { type: "SET_MODE", playerId: "p1", mode: "mayor", mayorClassic: true });
  return apply(state, {
    type: "START", playerId: "p1", firstPlayerId: "p1",
    setupRolls: [[{ playerId: "p1", dice: [6, 6] }, { playerId: "p2", dice: [1, 2] }, { playerId: "p3", dice: [3, 4] }]],
    deckOrder: { chance: order, community: order }
  });
}

function apply(state: GameState, action: GameAction) {
  const next = reduceGame(state, action);
  expect(next.notice, JSON.stringify(action)).toBeUndefined();
  return next;
}

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe("City Hall on the Classic table", () => {
  it("taxes rent at 50%, 60%, and 70% across the three bands without a ₹200 cap", () => {
    expect([0, 50, 100, 150, 200, 300, 500].map(rent => cityTax(rent, true))).toEqual([0, 25, 50, 80, 110, 180, 320]);
    let state = table();
    for (const rent of [100, 100, 300]) state = recordRent(state, "p2", rent);
    expect(state.mayor!.seats.p2!.bills.map(bill => bill.amount)).toEqual([320]);
    expect(recordRent(state, "p1", 500).mayor!.seats.p1!.bills).toEqual([]);
  });

  it("carries both audit fine ladders across terms and catches ignored overdue bills", () => {
    let state = table();
    const audit = (targetId: string) => {
      state = apply(state, { type: "CITY_AUDIT", playerId: "p1", term: state.mayor!.term, targetId });
    };
    for (const fee of [25, 25, 50]) {
      const before = state.players[0]!.cash;
      audit("p2");
      expect(state.players[0]!.cash).toBe(before - fee);
    }
    state = { ...state, mayor: newTerm(newTerm(state.mayor!, "p3"), "p1") };
    expect(nextAuditMiss(state.mayor!.seats.p1).fine).toBe(100);
    const feeStart = state.players[0]!.cash;
    audit("p3");
    expect(state.players[0]!.cash).toBe(feeStart - 100);
    state.mayor!.seats.p2!.turns = 1;
    for (const fine of [25, 50, 100]) {
      state.mayor!.seats.p2!.bills = [{ round: 1, amount: 50, dueTurn: 1, status: "open" }];
      const before = state.players[1]!.cash;
      audit("p2");
      expect(state.players[1]!.cash).toBe(before - 50 - fine);
    }
    expect(state.mayor!.seats.p2!.caughtCount).toBe(3);
    expect(nextAuditMiss(state.mayor!.seats.p1).fine).toBe(200);
  });

  it("resets a short miss streak after a correct audit without forgiving earlier penalties", () => {
    let state = table();
    const audit = (targetId: string) => {
      state = apply(state, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId });
    };
    audit("p2");
    audit("p3");
    state.mayor!.seats.p3!.bills = [{ round: 1, amount: 30, dueTurn: 2, status: "deferred" }];
    audit("p3");
    expect(state.mayor!.seats.p1!.auditMissStreak).toBeUndefined();
    expect(nextAuditMiss(state.mayor!.seats.p1).fine).toBe(25);
  });
  it("posts claimable utility rent to the city loan and resumes play after paying it down", () => {
    let state = table();
    state.players[0]!.position = 9;
    state.properties[12]!.ownerId = "p2";
    state.mayor!.seats.p2 = { ...state.mayor!.seats.p2!, loanDue: 2, loanStatus: "seized", loanAmountDue: 30 };
    state = apply(state, { type: "ROLL", playerId: "p1", dice: [1, 2] });
    state = apply(state, { type: "MOVE_RESULT", playerId: "p1" });
    expect(state.phase).toBe("awaitingUtilityRoll");
    state = apply(state, { type: "ROLL", playerId: "p1", dice: [5, 5] });
    expect(state.rentClaim).toMatchObject({ payerId: "p1", ownerId: "p2", amount: 40 });
    expect(state.mayor!.treasury).toBe(400);
    state = apply(state, { type: "CLAIM_RENT", playerId: "p2", claimId: state.rentClaim!.id });
    expect(state.mayor!.treasury).toBe(430);
    expect(cityLoanBalance(state, "p2")).toBe(0);
    expect(state.players[1]!.cash).toBe(1510);
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    expect(state.mayor!.seats.p1!.turns).toBe(1);
  });

  it("uses Classic debt settlement while a city fine is outstanding and prevents double charging", () => {
    let state = table();
    state.phase = "awaitingEndTurn";
    state.activePlayerId = "p2";
    state.players[1]!.cash = 2;
    state.properties[39]!.ownerId = "p2";
    state.mayor!.seats.p2!.bills = [{ round: 1, amount: 30, dueTurn: 1, status: "deferred" }];
    state = apply(state, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" });
    expect(state.phase).toBe("awaitingDebt");
    expect(state.debts).toMatchObject([{ playerId: "p2", amount: 53, city: true }]);
    expect(state.mayor!.treasury).toBe(402);
    state = apply(state, { type: "MORTGAGE", playerId: "p2", propertyId: 39, mortgage: true });
    expect(state.phase).toBe("awaitingEndTurn");
    expect(state.mayor!.treasury).toBe(455);
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.activePlayerId).toBe("p3");
    expect(state.mayor!.treasury).toBe(455);
  });

  it("lets the Mayor lock three upgrade sites without changing the other Classic properties", () => {
    let state = table();
    for (const id of [1, 3, 6, 8, 9]) state.properties[id]!.ownerId = "p2";
    state = apply(state, { type: "CITY_LOCK_PERMITS", playerId: "p1", term: 1, propertyIds: [1, 3, 6] });
    const locked = reduceGame(state, { type: "BUILD", playerId: "p2", propertyId: 1, operation: "build" });
    expect(locked.notice).toContain("City Hall paused building permits");
    state = apply(state, { type: "BUILD", playerId: "p2", propertyId: 8, operation: "build" });
    expect(state.properties[8]!.houses).toBe(1);
    expect(state.bankHouses).toBe(31);
    expect([1, 3, 6, 8].map(id => permitPauseActive(state, getTile(id)))).toEqual([true, true, true, false]);
    const rotated = { ...state, mayor: newTerm(state.mayor!, "p2") };
    expect(permitPauseActive(rotated, getTile(1))).toBe(false);
  });

  it("pays for an Express ride to the next station and gives the owner a normal rent claim", () => {
    let state = table();
    state.players[0]!.position = 35;
    state.properties[5]!.ownerId = "p2";
    state = apply(state, { type: "CITY_EXPRESS", playerId: "p1" });
    expect(state.players[0]).toMatchObject({ position: 5, cash: 1525 });
    expect(state.rentClaim).toMatchObject({ payerId: "p1", propertyId: 5, ownerId: "p2", amount: 25 });
    expect(state.phase).toBe("awaitingEndTurn");
  });

  it("returns Classic release cards separately from the Fort wheel reward", () => {
    let state = table();
    state.phase = "awaitingEndTurn";
    state.mayor!.wheel = { id: 100, playerId: "p1" };
    const player = state.players[0]!;
    player.getOutOfJailCards = 1;
    player.jailCardDecks = ["chance"];
    state.decks!.chance = order.filter(index => index !== jailCardIndex("chance"));
    state = apply(state, { type: "CITY_SPIN", playerId: "p1", wheelId: 100, section: 3 });
    expect(state.players[0]!.getOutOfJailCards).toBe(2);
    state.phase = "awaitingRoll";
    state.players[0]!.inJail = true;
    state = apply(state, { type: "PAY", playerId: "p1", kind: "jailCard" });
    expect(state.players[0]!.jailCardDecks).toEqual(["chance"]);
    expect(state.decks!.chance).toHaveLength(15);
    state.players[0]!.inJail = true;
    state = apply(state, { type: "PAY", playerId: "p1", kind: "jailCard", deck: "chance" });
    expect(state.decks!.chance.at(-1)).toBe(jailCardIndex("chance"));
  });

  it("holds a Classic seizure auction and returns the actual building refund", () => {
    let state = table();
    state.properties[1] = { ownerId: "p2", houses: 1, buildingCosts: [51], mortgaged: false };
    state.mayor!.seats.p2 = { ...state.mayor!.seats.p2!, loanDue: 2, loanStatus: "seized", loanAmountDue: 60 };
    state = apply(state, { type: "CITY_AUCTION_SEIZED", playerId: "p1", term: 1, propertyId: 1 });
    expect(reduceGame(state, { type: "AUCTION_BID", playerId: "p3", amount: 9 }).notice).toBeTruthy();
    state = apply(state, { type: "AUCTION_BID", playerId: "p3", amount: 50 });
    state = apply(state, { type: "AUCTION_BID", playerId: "p1", pass: true });
    state = apply(state, { type: "AUCTION_BID", playerId: "p2", pass: true });
    expect(state.properties[1]).toEqual({ ownerId: "p3", houses: 0, mortgaged: false });
    expect(state.phase).toBe("awaitingRoll");
    expect(state.mayor!.treasury).toBe(460);
    expect(state.players[1]!.cash).toBe(1515.5);
  });

  it("lets each owner liquidate their own deeds and buildings after a seizure splits the district", () => {
    let state = table();
    state.properties[37] = { ownerId: "p2", houses: 4, buildingCosts: [200, 200, 200, 200], mortgaged: false };
    state.properties[39] = { ownerId: "p3", houses: 0, mortgaged: false };
    state.phase = "awaitingDebt";
    state.debtResumePhase = "awaitingEndTurn";
    state.debts = [{ playerId: "p3", creditorId: "p2", reason: "rent", amount: 16 }];
    state.players[2]!.cash = -16;
    state = apply(state, { type: "MORTGAGE", playerId: "p3", propertyId: 39, mortgage: true });
    expect(state.phase).toBe("awaitingEndTurn");
    expect(state.players[2]!.cash).toBe(184);
    state = apply(state, { type: "BUILD", playerId: "p2", propertyId: 37, operation: "sell" });
    expect(state.properties[37]!.houses).toBe(3);
    expect(state.properties[39]).toMatchObject({ ownerId: "p3", mortgaged: true });
  });

  it("resumes the original turn after a scarcity auction interrupts a City Hall auction", () => {
    let state = table();
    state.phase = "awaitingEndTurn";
    state.activePlayerId = "p2";
    state.bankHouses = 1;
    for (const id of [1, 3]) state.properties[id]!.ownerId = "p1";
    for (const id of [6, 8, 9]) state.properties[id]!.ownerId = "p3";
    state.properties[39]!.ownerId = "p2";
    state.mayor!.seats.p2 = { ...state.mayor!.seats.p2!, loanDue: 2, loanStatus: "seized", loanAmountDue: 60 };
    state = apply(state, { type: "CITY_AUCTION_SEIZED", playerId: "p1", term: 1, propertyId: 39 });
    state = apply(state, { type: "BUILD", playerId: "p1", propertyId: 1, operation: "build" });
    expect(state.auction?.kind).toBe("house");
    state = apply(state, { type: "AUCTION_BID", playerId: "p1", amount: 11 });
    state = apply(state, { type: "AUCTION_BID", playerId: "p3", pass: true });
    expect(state.auction?.propertyId).toBe(39);
    for (const id of ["p1", "p2", "p3"]) state = apply(state, { type: "AUCTION_BID", playerId: id, pass: true });
    expect(state.phase).toBe("awaitingEndTurn");
    expect(state.activePlayerId).toBe("p2");
    expect(state.properties[1]!.buildingCosts).toEqual([11]);
  });

  it("keeps the city-backed winning bid reserved until the Classic auction closes", () => {
    let state = table();
    state.mayor!.policy = { kind: "credit", sponsorId: "p1" };
    state.players[1]!.cash = 50;
    state = apply(state, { type: "ROLL", playerId: "p1", dice: [1, 2] });
    state = apply(state, { type: "MOVE_RESULT", playerId: "p1" });
    state = apply(state, { type: "DECLINE_BUY", playerId: "p1" });
    state = apply(state, { type: "AUCTION_BID", playerId: "p2", amount: 110 });
    expect(state.auction?.highestBidderId).toBe("p2");
    state = apply(state, { type: "AUCTION_BID", playerId: "p1", pass: true });
    state = apply(state, { type: "AUCTION_BID", playerId: "p3", pass: true });
    expect(state.properties[3]!.ownerId).toBe("p2");
    expect(state.players[1]!.cash).toBe(0);
    expect(cityLoanBalance(state, "p2")).toBe(68);
  });

  it("has Pro move on after a no-bid seizure while allowing the Mayor to open another auction", () => {
    let state = table();
    state.players[0]!.bot = true;
    state.players[0]!.botLevel = "pro";
    state.properties[1]!.ownerId = "p2";
    state.properties[3]!.ownerId = "p2";
    state.mayor!.seats.p2 = { ...state.mayor!.seats.p2!, loanDue: 2, loanStatus: "seized", loanAmountDue: 100 };
    const action = nextBotAction(state);
    expect(action?.type).toBe("CITY_AUCTION_SEIZED");
    state = apply(state, action!);
    for (const id of ["p1", "p2", "p3"]) state = apply(state, { type: "AUCTION_BID", playerId: id, pass: true });
    expect(nextBotAction(state)?.type).not.toBe("CITY_AUCTION_SEIZED");
    state.players[0]!.bot = undefined;
    state = apply(state, { type: "CITY_AUCTION_SEIZED", playerId: "p1", term: 1, propertyId: 3 });
    expect(state.phase).toBe("awaitingAuction");
  });

  it("lets Pro claim rent before discretionary City Hall actions", () => {
    let state = table();
    state.players[1]!.bot = true;
    state.players[1]!.botLevel = "pro";
    state.properties[3]!.ownerId = "p2";
    state = apply(state, { type: "ROLL", playerId: "p1", dice: [1, 2] });
    state = apply(state, { type: "MOVE_RESULT", playerId: "p1" });
    expect(nextBotAction(state)).toEqual({ type: "CLAIM_RENT", playerId: "p2", claimId: state.rentClaim!.id });
  });

  it.each([[2, 170], [4, 711], [6, 1987]])("keeps Pro and standard AI games moving with %i seats", (count, seed) => {
    const random = seeded(seed), pick = (bound: number) => Math.floor(random() * bound);
    let state = createInitialState("PROS");
    state = apply(state, { type: "JOIN", player: { id: "host", name: "Host", color: "red" } });
    state = apply(state, { type: "SET_MODE", playerId: "host", mode: "mayor", mayorClassic: true });
    for (let i = 1; i < count; i++) state = apply(state, { type: "ADD_BOT", playerId: "host", level: i === 1 ? "pro" : undefined });
    state = apply(state, makeStartAction(state, "host", random));
    state.players[0]!.bot = true;
    for (let i = 0; i < 1500 && state.phase !== "gameOver"; i++) {
      let action = nextBotAction(state, [1 + pick(6), 1 + pick(6)]);
      expect(action, "step " + i + ", " + state.phase).toBeDefined();
      if (!action) break;
      if (action.type === "CITY_SPIN") action = { ...action, section: pick(6), prizeRoll: pick(100) };
      state = apply(state, action);
      expect(state.mayor!.treasury).toBeGreaterThanOrEqual(0);
    }
    expect(state.mayor!.round > 15 || state.phase === "gameOver").toBe(true);
  }, 20000);
});
