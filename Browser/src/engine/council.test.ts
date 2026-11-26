import { describe, expect, it } from "vitest";
import { auctionCredit, cityLoanAvailable, cityLoanReason, councilSpeaker, projectCityState, reserveLevy } from "./mayor";
import { createInitialState, reduceGame } from "./reducer";
import type { GameAction, GameState, PropertyState } from "./types";

const step = (state: GameState, action: GameAction) => reduceGame(state, action);
function table() {
  let state = createInitialState("CITY");
  for (const [id, color] of [["a", "red"], ["b", "blue"], ["c", "green"]] as const) {
    state = step(state, { type: "JOIN", player: { id, color, name: id.toUpperCase() } });
  }
  state = step(state, { type: "SET_MODE", playerId: "a", mode: "mayor" });
  return step(state, { type: "START", playerId: "a", firstPlayerId: "a" });
}
const adjust = (s: GameState, id: string, patch: Partial<GameState["players"][number]>) =>
  ({ ...s, players: s.players.map(p => p.id === id ? { ...p, ...patch } : p) });
const own = (s: GameState, id: string, position: number, houses: PropertyState["houses"] = 0) =>
  ({ ...s, properties: { ...s.properties, [position]: { ownerId: id, houses, mortgaged: false } } });
const cash = (s: GameState, id: string) => s.players.find(p => p.id === id)!.cash;
const propose = (s: GameState, policy: "wealth" | "credit" | "rent-relief" | "permits", district?: "brown" | "red") =>
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

describe("Council rules", () => {
  it("caps a majority cash levy, assesses the Mayor if eligible, and posts once", () => {
    const setup = adjust(adjust(adjust(table(), "a", { cash: 3100 }), "b", { cash: 180 }), "c", { cash: 900 });
    expect(reserveLevy(setup)).toEqual({ playerId: "a", amount: 300 });
    const announced = propose(setup, "wealth");
    expect(cash(announced, "a")).toBe(3100);
    let after = nextRound(announced);
    expect(cash(after, "a")).toBe(2800);
    expect(after.mayor!.treasury).toBe(700);
    expect(after.mayor!.reserveLevyUsed).toBe(true);
    after = nextRound(after);
    expect(after.mayor!.treasury).toBe(700);
    expect(step(after, { type: "CITY_PROPOSE", playerId: "b", term: 2, policy: "wealth" }).notice).toBeTruthy();
    expect(reserveLevy(table())).toBeUndefined();
  });

  it("lets the Speaker call a challenge after the table used theirs, and allows a majority to stop a levy", () => {
    let setup = adjust(adjust(table(), "c", { cash: 3000 }), "b", { cash: 200 });
    setup = { ...setup, mayor: { ...setup.mayor!, voteUsed: true } };
    expect(councilSpeaker(setup)).toBe("b");
    const announced = propose(setup, "wealth");
    expect(step(announced, { type: "CITY_VOTE", playerId: "c", term: 1 }).notice).toBeTruthy();
    const called = step(announced, { type: "CITY_VOTE", playerId: "b", term: 1 });
    expect(called.mayor!.speakerUsedTerm).toBe(1);
    const opposed = step(called, { type: "CITY_VOTE", playerId: "c", term: 1 });
    const after = nextRound(opposed);
    expect(cash(after, "c")).toBe(3000);
    expect(after.mayor!.policy).toBeUndefined();
    expect(after.eventLog.some(event => event.text.includes("rejected Cash Reserve Levy"))).toBe(true);
  });

  it("does not collect from a player who spends below the threshold before activation", () => {
    const setup = adjust(adjust(table(), "a", { cash: 2500 }), "c", { cash: 350 });
    const announced = propose(setup, "wealth");
    const after = nextRound(adjust(announced, "a", { cash: 1950 }));
    expect(cash(after, "a")).toBe(1950);
    expect(after.mayor!.reserveLevyUsed).toBeUndefined();
    expect(after.mayor!.treasury).toBe(400);
  });

  it("backs only qualified bidders and finances the winning shortfall with the correct repayment", () => {
    const setup = own(adjust(table(), "b", { cash: 350 }), "b", 39);
    const active = nextRound(propose(setup, "credit"));
    const auction = openAuction(active, 1);
    expect(auctionCredit(auction.auction!, "b")).toBe(200);
    expect(auctionCredit(auction.auction!, "a")).toBe(0);
    expect(auction.mayor!.treasury).toBe(400);
    expect(cash(auction, "b")).toBe(350);
    const bad = step(auction, { type: "AUCTION_BID", playerId: "b", amount: 551 });
    expect(bad.notice).toBeTruthy();
    const bid = step(auction, { type: "AUCTION_BID", playerId: "b", amount: 500 });
    expect(bid.auction?.highestBidderId).toBe("b");
    expect(cash(bid, "b")).toBe(350);
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

  it("uses the same posted cash for eligibility across private and public snapshots", () => {
    const base = adjust(adjust(table(), "a", { cash: 2500 }), "b", { cash: 390 });
    const seats = { ...base.mayor!.seats, b: { ...base.mayor!.seats.b!,
      bills: [{ round: 0, amount: 20, dueTurn: 2, status: "paid" as const }]
    } };
    const prepared: GameState = { ...base, mayor: { ...base.mayor!, seats } };
    expect(reserveLevy(projectCityState(prepared, "b"))).toEqual(reserveLevy(projectCityState(prepared, "a")));
    const settled = nextRound(propose(prepared, "credit"));
    const opened = openAuction(settled, 1);
    expect(opened.auction?.cityBacking).toBeUndefined();
    expect(opened.mayor!.policy?.used).toBeUndefined();
  });

  it("applies capped relief once per visitor before assessing received rent", () => {
    const setup = own(table(), "b", 23, 3);
    const relief = nextRound(propose(setup, "rent-relief", "red"));
    const land = (s: GameState) => {
      let next = adjust({ ...s, phase: "awaitingRoll", activePlayerId: "a" }, "a", { position: 16 });
      next = step(next, { type: "ROLL", playerId: "a", dice: [3, 4] });
      return step(next, { type: "MOVE_RESULT", playerId: "a" });
    };
    const discounted = land(relief);
    expect(cash(discounted, "a")).toBe(1050);
    expect(discounted.mayor!.seats.b!.rent).toBe(450);
    const charged = land(discounted);
    expect(cash(charged, "a")).toBe(350);
    expect(charged.mayor!.seats.b!.rent).toBe(1150);
  });

  it("pauses construction for a round while allowing sales", () => {
    const setup = own(own(table(), "a", 1, 1), "a", 3, 1);
    const paused = nextRound(propose(setup, "permits", "brown"));
    const build = { type: "BUILD", playerId: "a", propertyId: 1, operation: "build" } as const;
    expect(step(paused, build).notice).toContain("paused building permits");
    expect(step(paused, { ...build, operation: "sell" }).properties[1]?.houses).toBe(0);
    expect(step(nextRound(paused), build).properties[1]?.houses).toBe(2);
  });

  it("keeps contracts private until earned, then grants one bank reward", () => {
    const setup = own(own(table(), "a", 1, 1), "a", 3, 1);
    const choice = { type: "CITY_CONTRACT", playerId: "a", contract: "build" } as const;
    const selected = step(setup, choice);
    expect(projectCityState(selected, "b").mayor!.seats.a!.contract).toBeUndefined();
    expect(projectCityState(selected, "a").mayor!.seats.a!.contract).toBe("build");
    const build = (s: GameState, propertyId: number) => step(s, { type: "BUILD", playerId: "a", propertyId, operation: "build" });
    const paid = build(build(selected, 1), 3);
    expect(cash(paid, "a")).toBe(1550);
    expect(projectCityState(paid, "b").mayor!.seats.a!.contract).toBe("build");
    expect(cash(build(paid, 1), "a")).toBe(1500);
    expect(step(paid, choice).notice).toBeTruthy();
  });

  it("waits for two unmortgaged stations and an actual Express ride for the transit contract", () => {
    const setup = adjust(own(own(table(), "a", 5), "a", 15), "a", { position: 5 });
    const chosen = step(setup, { type: "CITY_CONTRACT", playerId: "a", contract: "transit" });
    expect(chosen.mayor!.seats.a!.contractPaid).toBeUndefined();
    const rode = step(chosen, { type: "CITY_EXPRESS", playerId: "a" });
    expect(rode.mayor!.seats.a!.contractPaid).toBe(true);
    expect(cash(rode, "a")).toBe(1575);
  });

  it("preserves pre-Council saved rooms", () => {
    const live = table();
    const saved = JSON.parse(JSON.stringify({ ...live, mayor: { ...live.mayor!, council: undefined } })) as GameState;
    expect(propose(saved, "credit").notice).toBeTruthy();
    expect(councilSpeaker(saved)).toBeUndefined();
    const transit = step(saved, { type: "CITY_PROPOSE", playerId: "a", term: 1, policy: "transit" });
    expect(nextRound(transit).mayor!.policy?.kind).toBe("transit");
  });

  it("clears a bankrupt Mayor's pending proposal so the incoming Mayor can propose", () => {
    let state = own(propose(table(), "permits", "brown"), "b", 39, 5);
    state = adjust(state, "a", { position: 32, cash: 50 });
    state = step(step(state, { type: "ROLL", playerId: "a", dice: [3, 4] }), { type: "MOVE_RESULT", playerId: "a" });
    expect(state.players[0]!.bankrupt).toBe(true);
    expect(state.mayor!.mayorId).toBe("b");
    expect(state.mayor!.term).toBe(2);
    expect(state.mayor!.proposal).toBeUndefined();
    const next = step(state, { type: "CITY_PROPOSE", playerId: "b", term: 2, policy: "transit" });
    expect(next.notice).toBeUndefined();
    expect(next.mayor!.proposal).toMatchObject({ term: 2, kind: "transit", sponsorId: "b" });
  });

  it("finishes bank repossession auctions within the active round before advancing round policies", () => {
    // Round 1 repossession auctions must not steal Round 2's proposed City-Backed Auction
    let round1 = adjust(end(end(propose(table(), "credit"))), "b", { cash: 350 });
    round1 = {
      ...adjust(round1, "c", { position: 0, cash: 10 }),
      properties: { ...round1.properties, 6: { ownerId: "c", houses: 0, mortgaged: true }, 8: { ownerId: "c", houses: 0, mortgaged: true } }
    };
    round1 = step(step(round1, { type: "ROLL", playerId: "c", dice: [1, 3] }), { type: "MOVE_RESULT", playerId: "c" });
    expect(round1.mayor!.round).toBe(1);
    expect(round1.mayor!.policy).toBeUndefined();
    expect(round1.phase).toBe("awaitingAuction");
    expect(round1.auction?.propertyId).toBe(6);
    expect(round1.auction?.cityBacking).toBeUndefined();
    round1 = step(step(round1, { type: "AUCTION_BID", playerId: "a", pass: true }), { type: "AUCTION_BID", playerId: "b", pass: true });
    expect(round1.mayor!.round).toBe(1);
    expect(round1.auction?.propertyId).toBe(8);
    round1 = step(step(round1, { type: "AUCTION_BID", playerId: "a", pass: true }), { type: "AUCTION_BID", playerId: "b", pass: true });
    expect(round1.mayor!.round).toBe(2);
    expect(round1.activePlayerId).toBe("a");
    expect(round1.phase).toBe("awaitingRoll");
    expect(round1.mayor!.policy?.kind).toBe("credit");
    expect(round1.mayor!.policy?.used).toBeUndefined();

    // Conversely, an active Round 2 City-Backed Auction backs a Round 2 repossession before Round 3 opens
    let round2 = adjust(end(end(nextRound(propose(table(), "credit")))), "b", { cash: 350 });
    round2 = {
      ...adjust(round2, "c", { position: 0, cash: 10 }),
      properties: { ...round2.properties, 6: { ownerId: "c", houses: 0, mortgaged: true } }
    };
    round2 = step(step(round2, { type: "ROLL", playerId: "c", dice: [1, 3] }), { type: "MOVE_RESULT", playerId: "c" });
    expect(round2.mayor!.round).toBe(2);
    expect(round2.auction?.cityBacking).toEqual({ limit: 200, playerIds: ["b"] });
  });

  it("keeps open tax bills open while a maturing city loan is settled in awaitingDebt", () => {
    let state = step(table(), { type: "CITY_PROPOSE", playerId: "a", term: 1, policy: "loans" });
    state = adjust(end(nextRound(state)), "b", { cash: 100 });
    state = step(state, { type: "CITY_LOAN", playerId: "b", round: 2 });
    state = { ...state, mayor: { ...state.mayor!, seats: { ...state.mayor!.seats, b: { ...state.mayor!.seats.b!, rent: 300 } } } };
    state = end(nextRound(state)); // Round 3, b's turn (loan ₹225 due at end of turn, plus open ₹40 Round 2 bill)
    state = adjust(own(state, "b", 39), "b", { cash: 200 });
    state = end(state);
    expect(state.phase).toBe("awaitingDebt");
    expect(cash(state, "b")).toBe(-25);
    expect(state.mayor!.seats.b!.bills).toEqual([{ round: 2, amount: 40, dueTurn: 4, status: "open" }]);
    state = step(state, { type: "MORTGAGE", playerId: "b", propertyId: 39, mortgage: true });
    expect(state.phase).toBe("awaitingEndTurn");
    expect(cash(state, "b")).toBe(175);
    expect(state.mayor!.seats.b!.bills[0]?.status).toBe("open");
    const finished = end(state);
    expect(finished.activePlayerId).toBe("c");
    expect(cash(finished, "b")).toBe(135);
    expect(finished.mayor!.seats.b!.bills[0]?.status).toBe("paid");
  });

  it("uses posted cash for emergency loan eligibility across private and public snapshots", () => {
    let state: GameState = { ...table(), mayor: { ...table().mayor!, seats: { ...table().mayor!.seats, b: { ...table().mayor!.seats.b!, rent: 600 } } } };
    state = step(state, { type: "CITY_PROPOSE", playerId: "a", term: 1, policy: "loans" });
    state = adjust(end(nextRound(state)), "b", { cash: 1080 });
    expect(cityLoanAvailable(state, "b")).toBe(false);
    expect(cityLoanReason(state, "b")).toContain("1,000");
    const prepaid = step(state, { type: "CITY_PAY_TAX", playerId: "b", round: 1 });
    expect(cash(prepaid, "b")).toBe(920);
    expect(cash(projectCityState(prepaid, "a"), "b")).toBe(1080);
    expect(cityLoanAvailable(prepaid, "b")).toBe(false);
    expect(cityLoanAvailable(projectCityState(prepaid, "a"), "b")).toBe(false);
    expect(step(prepaid, { type: "CITY_LOAN", playerId: "b", round: 2 }).notice).toBeTruthy();
  });

  it("allows the proposing Mayor and players up to ₹1,000 to borrow emergency loans and explains ineligible states", () => {
    let state = nextRound(step(table(), { type: "CITY_PROPOSE", playerId: "a", term: 1, policy: "loans" }));
    expect(cityLoanAvailable(state, "a")).toBe(false);
    expect(cityLoanReason(state, "a")).toContain("1,000");
    state = adjust(state, "a", { cash: 950 });
    expect(cityLoanAvailable(state, "a")).toBe(true);
    expect(cityLoanReason(state, "a")).toBeUndefined();
    expect(cityLoanReason(adjust(state, "b", { cash: 800 }), "b")).toContain("your turn");
    const borrowed = step(state, { type: "CITY_LOAN", playerId: "a", round: 2 });
    expect(cash(borrowed, "a")).toBe(1150);
    expect(cityLoanAvailable(borrowed, "a")).toBe(false);
    expect(cityLoanReason(borrowed, "a")).toContain("already used");
  });
});
