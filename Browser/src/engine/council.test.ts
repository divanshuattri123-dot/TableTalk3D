import { describe, expect, it } from "vitest";
import { getTile } from "./board";
import { auctionCredit, canChallengeCityProject, cityLoanAvailable, cityLoanReason, councilSpeaker, projectCityState, rentReliefActive, reserveLevy } from "./mayor";
import { createInitialState, reduceGame } from "./reducer";
import type { GameAction, GameState, PropertyState } from "./types";

const step = (state: GameState, action: GameAction) => reduceGame(state, action);
function table() {
  let state = createInitialState("CITY");
  for (const [id, color] of [["a", "red"], ["b", "blue"], ["c", "green"]] as const) {
    state = step(state, { type: "JOIN", player: { id, color, name: id.toUpperCase() } });
  }
  state = step(state, { type: "SET_MODE", playerId: "a", mode: "mayor" });
  const order = Array.from({ length: 16 }, (_, index) => index);
  return step(state, {
    type: "START", playerId: "a", firstPlayerId: "a", deckOrder: { chance: order, community: order },
    setupRolls: [state.players.map(p => ({ playerId: p.id, dice: p.id === "a" ? [6, 6] : [1, 2] }))]
  });
}
const adjust = (s: GameState, id: string, patch: Partial<GameState["players"][number]>) =>
  ({ ...s, players: s.players.map(p => p.id === id ? { ...p, ...patch } : p) });
const own = (s: GameState, id: string, position: number, houses: PropertyState["houses"] = 0) =>
  ({ ...s, properties: { ...s.properties, [position]: { ownerId: id, houses, mortgaged: false } } });
const cash = (s: GameState, id: string) => s.players.find(p => p.id === id)!.cash;
const propose = (s: GameState, policy: "wealth" | "credit" | "rent-relief" | "permits" | "loans" | "transit", district?: "brown" | "red") =>
  step(s, { type: "CITY_PROPOSE", playerId: "a", term: 1, policy, district });
const end = (s: GameState) => step({ ...s, phase: "awaitingEndTurn" }, { type: "END_TURN", playerId: s.activePlayerId! });
const nextRound = (s: GameState) => {
  const round = s.mayor!.round;
  for (let index = 0; index < s.players.length && s.mayor!.round === round; index++) s = end(s);
  return s;
};
const openAuction = (s: GameState, propertyId: number) =>
  step({ ...s, phase: "awaitingBuy", pendingPurchase: { propertyId, playerId: s.activePlayerId! } },
    { type: "DECLINE_BUY", playerId: s.activePlayerId! });

describe("Council rules (Instant Mayor Decrees & Live Council Voting)", () => {
  it("collects Cash Reserve Levy instantly when enacted and posts once per match", () => {
    const setup = adjust(adjust(adjust(table(), "a", { cash: 3100 }), "b", { cash: 180 }), "c", { cash: 900 });
    expect(reserveLevy(setup)).toEqual({ playerId: "a", amount: 300 });
    const enacted = propose(setup, "wealth");
    expect(cash(enacted, "a")).toBe(2800);
    expect(enacted.mayor!.treasury).toBe(700);
    expect(enacted.mayor!.reserveLevyUsed).toBe(true);
    const after = nextRound(nextRound(enacted));
    expect(after.mayor!.treasury).toBe(700);
    expect(step(after, { type: "CITY_PROPOSE", playerId: "b", term: 2, policy: "wealth" }).notice).toBeTruthy();
    expect(reserveLevy(table())).toBeUndefined();
  });

  it("opens a live Council Vote on every Mayor decree and repeals or switches immediately on majority", () => {
    let state = propose(table(), "permits", "brown");
    expect(councilSpeaker(state)).toBe("b");
    expect(state.mayor!.policy?.kind).toBe("permits");
    expect(canChallengeCityProject(state, "b")).toBe(true);
    expect(canChallengeCityProject(state, "c")).toBe(true);
    expect(canChallengeCityProject(state, "a")).toBe(false);

    const firstVote = step(state, { type: "CITY_VOTE", playerId: "b", term: 1 });
    expect(firstVote.mayor!.speakerUsedTerm).toBe(1);
    expect(firstVote.mayor!.policy?.kind).toBe("permits");
    const secondVote = step(firstVote, { type: "CITY_VOTE", playerId: "c", term: 1 });
    expect(secondVote.mayor!.policy).toBeUndefined();
    expect(secondVote.mayor!.proposal).toBeUndefined();

    // Switching Emergency Loans <-> Transit Day works immediately too
    let round3 = nextRound(nextRound(secondVote));
    expect(round3.mayor!.mayorId).toBe("b");
    round3 = step(round3, { type: "CITY_PROPOSE", playerId: "b", term: 2, policy: "transit" });
    expect(round3.mayor!.policy?.kind).toBe("transit");
    round3 = step(step(round3, { type: "CITY_VOTE", playerId: "a", term: 2 }), { type: "CITY_VOTE", playerId: "c", term: 2 });
    expect(round3.mayor!.policy?.kind).toBe("loans");
  });

  it("supports 1v1 Council Veto in a two-player match for ₹150 to City Funds", () => {
    let duel = createInitialState("DUEL");
    duel = step(duel, { type: "JOIN", player: { id: "a", color: "red", name: "A" } });
    duel = step(duel, { type: "JOIN", player: { id: "b", color: "blue", name: "B" } });
    duel = step(duel, { type: "SET_MODE", playerId: "a", mode: "mayor" });
    const order = Array.from({ length: 16 }, (_, index) => index);
    duel = step(duel, { type: "START", playerId: "a", firstPlayerId: "a",
      deckOrder: { chance: order, community: order }, setupRolls: [[{ playerId: "a", dice: [6, 6] }, { playerId: "b", dice: [1, 2] }]] });
    duel = step(duel, { type: "CITY_PROPOSE", playerId: "a", term: 1, policy: "rent-relief", district: "red" });
    expect(rentReliefActive(duel, getTile(23, 40))).toBe(true);
    expect(canChallengeCityProject(duel, "b")).toBe(true);
    const vetoed = step(duel, { type: "CITY_VOTE", playerId: "b", term: 1 });
    expect(rentReliefActive(vetoed, getTile(23, 40))).toBe(false);
    expect(cash(vetoed, "b")).toBe(1350);
    expect(vetoed.mayor!.treasury).toBe(550);
  });

  it("backs qualified bidders immediately when City-Backed Auction is enacted", () => {
    const setup = own(adjust(table(), "b", { cash: 350 }), "b", 39);
    const active = propose(setup, "credit"); // Instant!
    const auction = openAuction(active, 1);
    expect(auctionCredit(auction.auction!, "b")).toBe(200);
    expect(auctionCredit(auction.auction!, "a")).toBe(0);
    expect(auction.mayor!.treasury).toBe(400);
    const bad = step(auction, { type: "AUCTION_BID", playerId: "b", amount: 551 });
    expect(bad.notice).toBeTruthy();
    const bid = step(auction, { type: "AUCTION_BID", playerId: "b", amount: 500 });
    const passed = step(bid, { type: "AUCTION_BID", playerId: "a", pass: true });
    const won = step(passed, { type: "AUCTION_BID", playerId: "c", pass: true });
    expect(won.properties[1]!.ownerId).toBe("b");
    expect(cash(won, "b")).toBe(0);
    expect(won.mayor!.seats.b!.loanAmountDue).toBe(169);
    expect(won.mayor!.treasury).toBe(250);
    expect(openAuction(won, 3).auction?.cityBacking).toBeUndefined();
    const due = end(end(end(end(end(won)))));
    expect(due.phase).toBe("awaitingDebt");
    expect(cash(due, "b")).toBe(-169);
  });

  it("applies Rent Relief instantly, keeps the district blue, and discounts 90 percent without a cap", () => {
    const setup = own(table(), "b", 23, 3);
    const relief = propose(setup, "rent-relief", "red");
    expect(rentReliefActive(relief, getTile(23, 40))).toBe(true);
    const land = (s: GameState) => {
      let next = adjust({ ...s, phase: "awaitingRoll", activePlayerId: "a" }, "a", { position: 16 });
      next = step(next, { type: "ROLL", playerId: "a", dice: [3, 4] });
      return step(next, { type: "MOVE_RESULT", playerId: "a" });
    };
    const discounted = land(relief);
    expect(cash(discounted, "a")).toBe(1600 - 70); // ₹700 rent less ₹630 relief.
    expect(discounted.mayor!.seats.b!.rent).toBe(70);
  });

  it("pauses rival construction instantly under Permit Pause while letting the overpowered Mayor build", () => {
    let setup = own(own(table(), "b", 1, 1), "b", 3, 1);
    setup = own(own(setup, "a", 6, 1), "a", 8, 1);
    setup = own(setup, "a", 9, 1);
    const pausedBrown = propose(setup, "permits", "brown");
    // Rival b is blocked immediately in brown!
    expect(step(pausedBrown, { type: "BUILD", playerId: "b", propertyId: 1, operation: "build" }).notice).toContain("paused building permits");
    // Rival b can still sell buildings
    expect(step(pausedBrown, { type: "BUILD", playerId: "b", propertyId: 1, operation: "sell" }).properties[1]?.houses).toBe(0);

    // If Mayor a pauses their own district, Mayor a is exempt and can still build!
    let mayorDistrict = own(own(table(), "a", 1, 1), "a", 3, 1);
    mayorDistrict = propose(mayorDistrict, "permits", "brown");
    expect(step(mayorDistrict, { type: "BUILD", playerId: "a", propertyId: 1, operation: "build" }).properties[1]?.houses).toBe(2);
  });

  it("keeps contracts private until earned, then grants one bank reward", () => {
    const setup = own(own(table(), "a", 1, 1), "a", 3, 1);
    const choice = { type: "CITY_CONTRACT", playerId: "a", contract: "build" } as const;
    const selected = step(setup, choice);
    expect(projectCityState(selected, "b").mayor!.seats.a!.contract).toBeUndefined();
    expect(projectCityState(selected, "a").mayor!.seats.a!.contract).toBe("build");
    const build = (s: GameState, propertyId: number) => step(s, { type: "BUILD", playerId: "a", propertyId, operation: "build" });
    const paid = build(build(selected, 1), 3);
    expect(cash(paid, "a")).toBe(1650); // 1600 - 100 + 150
    expect(projectCityState(paid, "b").mayor!.seats.a!.contract).toBe("build");
  });

  it("waits for two unmortgaged stations and an actual Express ride for the transit contract", () => {
    const setup = adjust(own(own(table(), "a", 5), "a", 15), "a", { position: 5 });
    const chosen = step(setup, { type: "CITY_CONTRACT", playerId: "a", contract: "transit" });
    expect(chosen.mayor!.seats.a!.contractPaid).toBeUndefined();
    const rode = step(chosen, { type: "CITY_EXPRESS", playerId: "a" });
    expect(rode.mayor!.seats.a!.contractPaid).toBe(true);
    expect(cash(rode, "a")).toBe(1750); // 1600 + 0 free Mayor Express + 150 contract
  });

  it("preserves pre-Council saved rooms", () => {
    const live = table();
    const saved = JSON.parse(JSON.stringify({ ...live, mayor: { ...live.mayor!, council: undefined } })) as GameState;
    expect(propose(saved, "credit").notice).toBeTruthy();
    expect(councilSpeaker(saved)).toBeUndefined();
    const transit = step(saved, { type: "CITY_PROPOSE", playerId: "a", term: 1, policy: "transit" });
    expect(transit.mayor!.policy?.kind).toBe("transit");
  });

  it("clears a bankrupt Mayor's active decree and proposal so the incoming Mayor can enact theirs", () => {
    let state = own(propose(table(), "permits", "brown"), "b", 39, 5);
    state = adjust(state, "a", { position: 32, cash: 50 });
    state = step(step(state, { type: "ROLL", playerId: "a", dice: [3, 4] }), { type: "MOVE_RESULT", playerId: "a" });
    expect(state.phase).toBe("awaitingDebt");
    state = step(state, { type: "BANKRUPT", playerId: "a" });
    expect(state.players[0]!.bankrupt).toBe(true);
    expect(state.mayor!.mayorId).toBe("b");
    expect(state.mayor!.term).toBe(2);
    expect(state.mayor!.policy).toBeUndefined();
    expect(state.mayor!.proposal).toBeUndefined();
    const next = step(state, { type: "CITY_PROPOSE", playerId: "b", term: 2, policy: "transit" });
    expect(next.notice).toBeUndefined();
    expect(next.mayor!.policy?.kind).toBe("transit");
  });

  it("allows Emergency Loans instantly for the Mayor at any cash and for rivals up to ₹1,000", () => {
    let state = propose(table(), "loans");
    // Instant in Round 1! Overpowered Mayor a has ₹1,600 and can STILL borrow immediately!
    expect(cityLoanAvailable(state, "a")).toBe(true);
    expect(cityLoanReason(state, "a")).toBeUndefined();
    const mayorBorrowed = step(state, { type: "CITY_LOAN", playerId: "a", round: 1 });
    expect(cash(mayorBorrowed, "a")).toBe(1800);
    expect(cityLoanAvailable(mayorBorrowed, "a")).toBe(false);
    expect(cityLoanReason(mayorBorrowed, "a")).toContain("already used");

    // Rival b on their turn: capped at ₹1,000
    let rivalTurn = end(mayorBorrowed);
    expect(cityLoanAvailable(rivalTurn, "b")).toBe(false);
    expect(cityLoanReason(rivalTurn, "b")).toContain("1,000");
    rivalTurn = adjust(rivalTurn, "b", { cash: 950 });
    expect(cityLoanAvailable(rivalTurn, "b")).toBe(true);
    const rivalBorrowed = step(rivalTurn, { type: "CITY_LOAN", playerId: "b", round: 1 });
    expect(cash(rivalBorrowed, "b")).toBe(1150);
  });
});
