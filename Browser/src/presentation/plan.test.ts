import { describe, expect, it } from "vitest";
import { createInitialState, reduceGame } from "../engine/reducer";
import { canCompleteFrame, planPresentation, routeBetween, shouldSendMove } from "./plan";
import { COMMUNITY_CARDS } from "../engine/board";
import type { GameState } from "../engine/types";

const start = () => [
  { type: "JOIN", player: { id: "a", name: "Asha", color: "#00f" } },
  { type: "JOIN", player: { id: "b", name: "Bryn", color: "#f00" } },
  { type: "START", playerId: "a", firstPlayerId: "a" }
].reduce((s, a) => reduceGame(s, a as Parameters<typeof reduceGame>[1]), createInitialState("TEST"));
const at = (state: GameState, position: number) => ({ ...state, players: state.players.map(p => p.id === "a" ? { ...p, position } : p) });

describe("pure presentation planning", () => {
  it("uses Classic card IDs and shows the chained back-three / Community sequence",()=>{
    const state={...at(start(),29),mode:"classic" as const,decks:{chance:[9,...Array.from({length:16},(_,i)=>i).filter(i=>i!==9)],community:Array.from({length:16},(_,i)=>i)}};
    const rolled=reduceGame(state,{type:"ROLL",playerId:"a",dice:[3,4]}),landed=reduceGame(rolled,{type:"MOVE_RESULT",playerId:"a"});
    const frames=planPresentation(rolled,landed);expect(frames.filter(f=>f.kind==="card").map(f=>f.text)).toEqual(["Go back three spaces.","Advance to GO. Collect ₹200."]);
    expect(frames.find(f=>f.backwards)?.route).toEqual([35,34,33]);
  });
  it("animates utility dice without inventing movement, doubles or another rent charge",()=>{
    const state={...start(),mode:"classic" as const,decks:{chance:Array.from({length:16},(_,i)=>i),community:Array.from({length:16},(_,i)=>i)}};
    state.properties[12]!.ownerId="b";
    const rolled=reduceGame(state,{type:"ROLL",playerId:"a",dice:[6,6]}),landed=reduceGame(rolled,{type:"MOVE_RESULT",playerId:"a"}),paid=reduceGame(landed,{type:"ROLL",playerId:"a",dice:[5,5]});
    const frames=planPresentation(landed,paid);expect(frames.map(f=>f.kind)).toEqual(["dice","money"]);expect(frames[0]?.text).toContain("for utility rent");expect(frames[0]?.text).not.toContain("DOUBLES");expect(paid.lastRoll?.dice).toEqual([6,6]);
  });
  it.each(COMMUNITY_CARDS.map((card, index) => ({ ...card, index })))("preserves the full Community Chest effect for card $index", ({ index, text }) => {
    const rolled = reduceGame(start(), { type: "ROLL", playerId: "a", dice: [1, 1] });
    const next = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index }] });
    const frame = planPresentation(rolled, next).find(frame => frame.kind === "card");
    expect(frame).toMatchObject({ deck: "community", text });
    expect(canCompleteFrame(frame, frame!.id, "animation")).toBe(false);
    expect(canCompleteFrame(frame, frame!.id, "reader")).toBe(true);
    expect(canCompleteFrame(frame, "stale-card", "reader")).toBe(false);
  });
  it("does not replay a match on load, echo or stale snapshot", () => {
    const state = start();
    expect(planPresentation(undefined, state)).toEqual([]);
    expect(planPresentation(state, structuredClone(state))).toEqual([]);
    expect(planPresentation(state, createInitialState("TEST"))).toEqual([]);
  });
  it("waits for the dice presentation before allowing MOVE_RESULT", () => {
    const state = start(), rolled = reduceGame(state, { type: "ROLL", playerId: "a", dice: [3, 4] });
    expect(planPresentation(state, rolled).map(f => f.kind)).toEqual(["dice"]);
    expect(shouldSendMove(rolled, "a", true)).toBe(false);
    expect(shouldSendMove(rolled, "b", false)).toBe(false);
    expect(shouldSendMove(rolled, "a", false)).toBe(true);
    expect(shouldSendMove(rolled, "a", false, false)).toBe(false);
  });
  it("walks to a property before revealing the purchase controls", () => {
    const rolled = reduceGame(start(), { type: "ROLL", playerId: "a", dice: [1, 2] });
    const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a" });
    expect(planPresentation(rolled, landed)[0]?.route).toEqual([1, 2, 3]);
    expect(landed.phase).toBe("awaitingBuy");
  });
  it("shows the card before its backwards-three route, not 37 spaces", () => {
    const rolled = reduceGame(at(start(), 29), { type: "ROLL", playerId: "a", dice: [3, 4] });
    const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "chance", index: 3 }, { deck: "community", index: 1 }] });
    expect(routeBetween(36, 33, 40, true)).toEqual([35, 34, 33]);
    const frames = planPresentation(rolled, landed);
    expect(frames.map(f => f.kind)).toEqual(["move", "card", "move", "card", "money"]);
    expect(frames[2]).toMatchObject({ route: [35, 34, 33], backwards: true });
  });
  it("walks to Go To Jail then transfers directly to the jail corner", () => {
    const rolled = reduceGame(at(start(), 23), { type: "ROLL", playerId: "a", dice: [3, 4] });
    const landed = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a" });
    const frames = planPresentation(rolled, landed);
    expect(frames.map(f => f.kind)).toEqual(["move", "jail"]);
    expect(frames[0]?.route).toHaveLength(7);
    expect(frames[1]?.route).toEqual([10]);
  });
  it("three doubles show the dice and direct jail, without walking around GO", () => {
    const state = { ...at(start(), 38), consecutiveDoubles: 2 };
    const next = reduceGame(state, { type: "ROLL", playerId: "a", dice: [6, 6] });
    expect(planPresentation(state, next).map(f => f.kind)).toEqual(["dice", "jail"]);
  });
  it("includes the sold result with the real winner, never a fake auction timer", () => {
    let state = reduceGame(start(), { type: "ROLL", playerId: "a", dice: [1, 2] });
    state = reduceGame(state, { type: "MOVE_RESULT", playerId: "a" });
    state = reduceGame(state, { type: "DECLINE_BUY", playerId: "a" });
    const bid = reduceGame(state, { type: "AUCTION_BID", playerId: "b", amount: 25 });
    expect(planPresentation(state, bid)[0]?.kind).toBe("bid");
    const sold = reduceGame(bid, { type: "AUCTION_BID", playerId: "a", pass: true });
    expect(planPresentation(bid, sold).find(f => f.kind === "sold")).toMatchObject({ playerId: "b", tileId: 3 });
    const nextAuction = { ...sold, phase: "awaitingAuction" as const, auction: { ...bid.auction!, propertyId: 1, currentBid: 0, highestBidderId: undefined } };
    expect(planPresentation(bid, nextAuction).find(f => f.kind === "sold")?.auction).toEqual(bid.auction);
  });
  it.each([40, 48, 56, 64])("wraps a route on a %i-space board", size => {
    expect(routeBetween(size - 2, 2, size)).toEqual([size - 1, 0, 1, 2]);
  });
  it("does not mutate either canonical snapshot", () => {
    const state = start(), next = reduceGame(state, { type: "ROLL", playerId: "a", dice: [1, 2] });
    const before = JSON.stringify([state, next]); planPresentation(state, next);
    expect(JSON.stringify([state, next])).toBe(before);
  });
  it("does not replay old dice when offering a trade before a doubles extra roll", () => {
    let state = reduceGame(start(), { type: "ROLL", playerId: "a", dice: [1, 1] });
    state = reduceGame(state, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index: 1 }] });
    state = reduceGame(state, { type: "END_TURN", playerId: "a" });
    expect(state.phase).toBe("awaitingRoll"); expect(state.lastRoll).toBeDefined();
    const offered = reduceGame(state, { type: "TRADE_OFFER", playerId: "a", offerId: "t", toPlayerId: "b", offeredCash: 10, offeredPropertyIds: [], requestedCash: 0, requestedPropertyIds: [] });
    expect(offered.phase).toBe("awaitingTradeResponse");
    expect(planPresentation(state, offered).some(f => f.kind === "dice")).toBe(false);
    const declined = reduceGame(offered, { type: "TRADE_DECLINE", playerId: "b", offerId: "t" });
    expect(planPresentation(offered, declined).map(f => f.kind)).toEqual(["trade"]);
    const rolled = reduceGame(declined, { type: "ROLL", playerId: "a", dice: [1, 1] });
    expect(planPresentation(declined, rolled).filter(f => f.kind === "dice")).toHaveLength(1);
  });
  it("does not animate stale dice when a pre-roll trade is accepted", () => {
    const state = { ...start(), lastRoll: { playerId: "a", dice: [3, 4] as const, total: 7, doubles: false, grantsExtraRoll: false } };
    const offered = reduceGame(state, { type: "TRADE_OFFER", playerId: "a", offerId: "t", toPlayerId: "b", offeredCash: 10, offeredPropertyIds: [], requestedCash: 0, requestedPropertyIds: [] });
    const accepted = reduceGame(offered, { type: "TRADE_ACCEPT", playerId: "b", offerId: "t" });
    expect([...planPresentation(state, offered), ...planPresentation(offered, accepted)].some(f => f.kind === "dice")).toBe(false);
    expect(accepted.players[0]?.cash).toBe(1490);
  });
  it("uses journal IDs when two friends choose the same display name", () => {
    const initial = start();
    const sameName = { ...initial, activePlayerId: "b", players: initial.players.map(p => ({ ...p, name: "Friend" })) };
    const rolled = reduceGame(sameName, { type: "ROLL", playerId: "b", dice: [1, 2] });
    const next = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "b" });
    expect(planPresentation(rolled, next)[0]).toMatchObject({ kind: "move", playerId: "b", tileId: 3 });
  });
  it("keeps the community deck when identical card text exists in both decks", () => {
    const rolled = reduceGame(start(), { type: "ROLL", playerId: "a", dice: [1, 1] });
    const next = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "a", cardDraws: [{ deck: "community", index: 0 }] });
    expect(planPresentation(rolled, next).find(f => f.kind === "card")).toMatchObject({ deck: "community" });
  });
});
