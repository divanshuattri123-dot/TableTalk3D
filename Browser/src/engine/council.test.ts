import { describe, expect, it } from "vitest";
import { auctionCredit, councilSpeaker, projectCityState, reserveLevy } from "./mayor";
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
});
