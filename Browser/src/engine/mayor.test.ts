import { describe, expect, it } from "vitest";
import { getTile } from "./board";
import { cityTax, fortPosition, mayorAuditsLeft, nextAuditFine, projectCityState, rentReliefActive } from "./mayor";
import { makeStartAction } from "../network/startAction";
import { createInitialState, reduceGame } from "./reducer";
import type { GameAction, GameState } from "./types";

const colors = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5", "#ef476f"];
const send = (s: GameState, action: GameAction) => reduceGame(s, action);
function table(count = 3, firstPlayerId = "p1") {
  let state = createInitialState("CTHL");
  for (let i = 0; i < count; i++) state = send(state, { type: "JOIN", player: { id: "p" + (i + 1), name: "Guest " + (i + 1), color: colors[i]! } });
  state = send(state, { type: "SET_MODE", playerId: "p1", mode: "mayor" });
  const order = Array.from({ length: 16 }, (_, index) => index);
  return send(state, {
    type: "START", playerId: "p1", firstPlayerId, deckOrder: { chance: order, community: order },
    setupRolls: [state.players.map(p => ({ playerId: p.id, dice: p.id === firstPlayerId ? [6, 6] : [1, 2] }))]
  });
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

describe("Mayor rules (Classic 40-space + Overpowered Mayor)", () => {
  it("applies marginal tax slabs and caps the total", () => {
    expect([0, 6, 50, 100, 200, 300, 400, 600, 700, 2000].map(rent => cityTax(rent))).toEqual([0, 1, 5, 10, 20, 40, 80, 160, 200, 200]);
  });

  it("uses the Classic 40-space board, shuffled 16-card decks, and off-turn property management", () => {
    let lobby = createInitialState("CL40");
    for (let i = 0; i < 6; i++) lobby = send(lobby, { type: "JOIN", player: { id: "p" + (i + 1), name: "Guest " + (i + 1), color: colors[i]! } });
    lobby = send(lobby, { type: "SET_MODE", playerId: "p1", mode: "mayor", mayorClassic: true });
    expect(lobby.boardSize).toBe(40);
    expect(lobby.bankHouses).toBe(32);
    expect(lobby.bankHotels).toBe(12);
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const started = send(lobby, makeStartAction(lobby, "p1", rng));
    expect(started.decks?.chance).toHaveLength(16);
    expect(started.decks?.community).toHaveLength(16);
    expect(cash(started, started.mayor!.mayorId)).toBe(1600);

    // Off-turn building & mortgaging work just like Classic mode
    const nonActive = started.players.find(p => p.id !== started.activePlayerId)!.id;
    const withBrown: GameState = {
      ...started,
      properties: {
        ...started.properties,
        1: { ownerId: nonActive, houses: 0, mortgaged: false },
        3: { ownerId: nonActive, houses: 0, mortgaged: false }
      }
    };
    const offTurnBuilt = send(withBrown, { type: "BUILD", playerId: nonActive, propertyId: 1, operation: "build" });
    expect(offTurnBuilt.notice).toBeUndefined();
    expect(offTurnBuilt.properties[1]?.houses).toBe(1);
  });

  it("exempts the Mayor from rent tax while issuing immediate bills to rivals", () => {
    const state = table();
    // Mayor p1 collects rent -> 0 tax bill (Mayor Tax Immunity)
    const mayorOwned = { ...state, properties: { ...state.properties, 23: { ownerId: "p1", houses: 3 as const, mortgaged: false } } };
    const p2Turn = end(mayorOwned, "p1");
    const mayorPaid = send(send(patchPlayer(p2Turn, "p2", { position: 16 }), { type: "ROLL", playerId: "p2", dice: [3, 4] }), { type: "MOVE_RESULT", playerId: "p2" });
    expect(mayorPaid.mayor!.seats.p1!.bills).toEqual([]);

    // Rival p2 collects rent -> immediate ₹200 open bill
    const rivalOwned = { ...state, properties: { ...state.properties, 23: { ownerId: "p2", houses: 3 as const, mortgaged: false } } };
    const landed = send(send(patchPlayer(rivalOwned, "p1", { position: 16 }), { type: "ROLL", playerId: "p1", dice: [3, 4] }), { type: "MOVE_RESULT", playerId: "p1" });
    expect(cash(landed, "p2")).toBe(2200);
    expect(landed.mayor!.seats.p2!.bills).toEqual([{ id: 0, round: 1, amount: 200, dueTurn: 2, status: "open" }]);
    const deferredOffTurn = send(landed, { type: "CITY_DEFER_TAX", playerId: "p2", round: 1 });
    expect(deferredOffTurn.mayor!.seats.p2!.bills[0]?.status).toBe("deferred");
    const raided = send(deferredOffTurn, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" });
    expect(cash(raided, "p2")).toBe(1975);
    expect(cash(raided, "p1")).toBe(1600 - 700 + 25); // +₹25 Mayor raid bonus
  });

  it("never auto-pays deferred tax across rounds until self-paid or caught by Mayor", () => {
    let state = end(newRound(withRent(table(2), "p2", 600)));
    state = send(state, { type: "CITY_DEFER_TAX", playerId: "p2", round: 1 });
    expect(cash(state, "p2")).toBe(1500);
    // Advance through 4 full rounds (including 2-player term handovers!) without Mayor auditing
    for (let r = 0; r < 4; r++) state = newRound(state);
    // Deferred ₹160 bill was NEVER auto-deducted or auto-audited! (p2 gained ₹100 stipend in Term 2)
    expect(state.mayor!.seats.p2!.bills).toEqual([{ id: 600, round: 1, amount: 160, dueTurn: 3, status: "deferred" }]);
    expect(cash(state, "p2")).toBe(1600);

    // Player p2 can still choose to pay by themselves at any time without fine
    const selfPaid = send(state, { type: "CITY_PAY_TAX", playerId: "p2", round: 1 });
    expect(cash(selfPaid, "p2")).toBe(1440);
    expect(selfPaid.mayor!.treasury).toBe(400);
    expect(selfPaid.mayor!.seats.p2!.privateTaxPaid).toBe(160);
    expect(projectCityState(selfPaid, "p1")).toEqual(projectCityState(state, "p1"));
    expect(selfPaid.mayor!.seats.p2!.bills).toEqual([]);
  });

  it("doubles audit fines every catch (25 -> 50 -> 100 -> 200) and persists across Mayor changes", () => {
    let state = table(3);
    const giveDeferred = (s: GameState, target: string, amount = 20): GameState => ({
      ...s,
      mayor: {
        ...s.mayor!,
        seats: {
          ...s.mayor!.seats,
          [target]: { ...s.mayor!.seats[target]!, bills: [{ id: s.nextEventId, round: s.mayor!.round, amount, dueTurn: 99, status: "deferred" }] }
        }
      }
    });

    // Term 1 (Mayor = p1): Catch #1 on p2 -> ₹25 fine
    expect(nextAuditFine(state.mayor!.seats.p2)).toBe(25);
    state = send(giveDeferred(state, "p2", 20), { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" });
    expect(cash(state, "p2")).toBe(1500 - 45); // 20 tax + 25 fine
    expect(state.mayor!.seats.p2!.caughtCount).toBe(1);
    expect(nextAuditFine(state.mayor!.seats.p2)).toBe(50);
    expect(mayorAuditsLeft(state.mayor)).toBe(1); // Overpowered Mayor has 2 warrants/term!

    // Term 1 (still Mayor = p1, using 2nd warrant): Catch #2 on p2 -> ₹50 fine
    state = send(giveDeferred(state, "p2", 20), { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" });
    expect(cash(state, "p2")).toBe(1455 - 70); // 20 tax + 50 fine
    expect(state.mayor!.seats.p2!.caughtCount).toBe(2);
    expect(nextAuditFine(state.mayor!.seats.p2)).toBe(100);
    expect(mayorAuditsLeft(state.mayor)).toBe(0);

    // Rotate Mayor twice -> Term 2 (Mayor = p2), then Term 3 (Mayor = p3)!
    state = newRound(newRound(state)); // Round 3, Term 2 (Mayor = p2)
    expect(state.mayor!.mayorId).toBe("p2");
    state = newRound(newRound(state)); // Round 5, Term 3 (Mayor = p3)
    expect(state.mayor!.mayorId).toBe("p3");
    // Fine count MUST NOT reset when Mayor changed!
    expect(state.mayor!.seats.p2!.caughtCount).toBe(2);
    expect(nextAuditFine(state.mayor!.seats.p2)).toBe(100);

    // Term 3 (New Mayor = p3): Catch #3 on p2 -> ₹100 fine!
    const beforeP2 = cash(state, "p2");
    state = send(giveDeferred(state, "p2", 20), { type: "CITY_AUDIT", playerId: "p3", term: 3, targetId: "p2" });
    expect(cash(state, "p2")).toBe(beforeP2 - 120); // 20 tax + 100 fine
    expect(state.mayor!.seats.p2!.caughtCount).toBe(3);
    expect(nextAuditFine(state.mayor!.seats.p2)).toBe(200);

    // Term 3 (Mayor = p3, 2nd warrant): Catch #4 on p2 -> ₹200 fine!
    const beforeFourth = cash(state, "p2");
    state = send(giveDeferred(state, "p2", 20), { type: "CITY_AUDIT", playerId: "p3", term: 3, targetId: "p2" });
    expect(cash(state, "p2")).toBe(beforeFourth - 220); // 20 tax + 200 fine
    expect(state.mayor!.seats.p2!.caughtCount).toBe(4);
    expect(nextAuditFine(state.mayor!.seats.p2)).toBe(400);
  });

  it("tracks two-round terms on a 40-space board, survives an eliminated anchor and skips doubles", () => {
    let state = table(4, "p3");
    expect(state.boardSize).toBe(40);
    expect(state.mayor?.mayorId).toBe("p3");
    expect(cash(state, "p3")).toBe(1600);
    const double = { playerId: "p3", dice: [2, 2] as const, total: 4, doubles: true, grantsExtraRoll: true };
    const again = end({ ...state, lastRoll: double });
    expect(again.activePlayerId).toBe("p3");
    expect(again.mayor!.seats.p3!.turns).toBe(0);
    state = newRound(state);
    expect(state.mayor?.mayorId).toBe("p3");
    state = newRound(state);
    expect(state.mayor?.mayorId).toBe("p4");
    expect(cash(state, "p4")).toBe(1600);
    state = patchPlayer(state, "p3", { cash: -10 });
    state = send({ ...state, phase: "awaitingDebt", debtResumePhase: "awaitingEndTurn",
      debts: [{ playerId: "p3", creditorId: "bank", amount: 10, reason: "tax" }]
    }, { type: "BANKRUPT", playerId: "p3" });
    state = newRound(state);
    expect(state.mayor?.round).toBe(4);
    expect(state.mayor?.mayorId).toBe("p4");
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
  });

  it("charges the Mayor ₹25 for a failed raid and uses both warrants cleanly", () => {
    const state = table();
    const audited1 = send(state, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" });
    expect(cash(audited1, "p1")).toBe(1575);
    expect(cash(audited1, "p2")).toBe(1525);
    expect(mayorAuditsLeft(audited1.mayor)).toBe(1);
    const audited2 = send(audited1, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p3" });
    expect(cash(audited2, "p1")).toBe(1550);
    expect(audited2.mayor?.auditUsed).toBe(true);
    expect(send(audited2, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p2" }).notice).toBeTruthy();
  });

  it("enacts Rent Relief instantly (blue district) and repeals or switches immediately on Council Vote", () => {
    let state = table();
    state = send(state, { type: "CITY_PROPOSE", playerId: "p1", term: 1, policy: "rent-relief", district: "red" });
    expect(state.mayor!.policy?.kind).toBe("rent-relief");
    expect(rentReliefActive(state, getTile(23, 40))).toBe(true);
    expect(rentReliefActive(state, getTile(1, 40))).toBe(false);

    // Council Vote repeals Rent Relief immediately without waiting for next round!
    state = send(state, { type: "CITY_VOTE", playerId: "p2", term: 1 });
    expect(rentReliefActive(state, getTile(23, 40))).toBe(true); // 1/2 votes so far
    state = send(state, { type: "CITY_VOTE", playerId: "p3", term: 1 });
    expect(state.mayor!.policy).toBeUndefined();
    expect(rentReliefActive(state, getTile(23, 40))).toBe(false); // Blue highlight removed immediately!
  });

  it("settles maturing city loans while leaving deferred tax untouched until raided", () => {
    let state = send(withRent(table(), "p2", 300), { type: "CITY_PROPOSE", playerId: "p1", term: 1, policy: "loans" });
    expect(state.mayor!.policy?.kind).toBe("loans"); // Instant!
    state = patchPlayer(end(newRound(state)), "p2", { cash: 100 });
    state = send(state, { type: "CITY_LOAN", playerId: "p2", round: 2 });
    expect(cash(state, "p2")).toBe(300);
    expect(state.mayor!.treasury).toBe(200);
    const wash = send(state, { type: "TRADE_OFFER", playerId: "p2", toPlayerId: "p3", offerId: "wash",
      offeredCash: 200, offeredPropertyIds: [1], requestedCash: 0, requestedPropertyIds: [] });
    expect(wash.notice).toContain("Repay your city loan");
    state = send(state, { type: "CITY_DEFER_TAX", playerId: "p2", round: 1 });
    state = end(end(end(state)));
    state = end(end(end(state)));
    expect(state.mayor!.seats.p2!.loanAmountDue).toBe(225);
    state = patchPlayer(state, "p2", { cash: 15 });
    state = { ...state, properties: { ...state.properties, 39: { ownerId: "p2", houses: 0, mortgaged: false }, 37: { ownerId: "p2", houses: 0, mortgaged: false } } };
    state = end(state);
    expect(state.phase).toBe("awaitingDebt");
    expect(cash(state, "p2")).toBe(-210); // Only ₹225 loan matured; ₹40 deferred tax stayed deferred!
    expect(state.mayor!.seats.p2!.bills[0]?.status).toBe("deferred");
    state = send(send(state, { type: "MORTGAGE", playerId: "p2", propertyId: 39, mortgage: true }), { type: "MORTGAGE", playerId: "p2", propertyId: 37, mortgage: true });
    expect(state.phase).toBe("awaitingEndTurn");
    expect(state.mayor!.treasury).toBe(425);
    expect(end(state).activePlayerId).toBe("p3");
  });

  it("lets the Mayor ride Express free without draining City Funds and resolves destination rent", () => {
    let state = patchPlayer(table(), "p1", { position: 35 });
    state = { ...state, properties: { ...state.properties, 5: { ownerId: "p2", houses: 0, mortgaged: false } } };
    const jailed = patchPlayer(state, "p1", { inJail: true });
    expect(send(jailed, { type: "CITY_EXPRESS", playerId: "p1" }).notice).toBeTruthy();
    state = send(state, { type: "CITY_EXPRESS", playerId: "p1" });
    expect(state.players[0]?.position).toBe(5);
    expect(cash(state, "p1")).toBe(1575); // 1600 stipend - 0 Express - 25 rent
    expect(state.mayor!.treasury).toBe(400); // Mayor ride didn't drain treasury
    expect(cash(state, "p2")).toBe(1525);
    expect(state.phase).toBe("awaitingEndTurn");
  });

  it("offers wheel after property resolution and saves a scratch prize through reload", () => {
    let state = landAtWheel(table());
    const wheelId = state.mayor!.wheel!.id;
    expect(state.properties[23]?.ownerId).toBe("p1");
    const draw = { type: "CITY_SPIN", playerId: "p1", wheelId, section: 5, prizeRoll: 99 } as const;
    const preview = send(state, draw);
    expect(projectCityState(preview, "p1").mayor?.wheel?.prize).toBeUndefined();
    state = JSON.parse(JSON.stringify(preview));
    const scratch = { type: "CITY_SCRATCH", playerId: "p1", wheelId } as const;
    state = send(state, scratch);
    expect(cash(state, "p1")).toBe(3380); // 1600 - 220 + 2000
    state = end(state);
    const p2 = patchPlayer(state, "p2", { position: 16 });
    state = send(send(p2, { type: "ROLL", playerId: "p2", dice: [3, 4] }), { type: "MOVE_RESULT", playerId: "p2" });
    state = send(state, { ...draw, playerId: "p2", wheelId: state.mayor!.wheel!.id });
    expect(state.mayor!.wheel?.prize).toBe(250);
    expect(cash(end(state), "p2")).toBe(1732);
  });

  it("keeps new rent payable after another levy in the same round was deferred", () => {
    let state = table();
    state = { ...state, properties: { ...state.properties, 5: { ownerId: "p3", houses: 0, mortgaged: false } } };
    const payRent = (game: GameState, playerId: string) => send(
      send(patchPlayer(game, playerId, { position: 0 }), { type: "ROLL", playerId, dice: [2, 3] }),
      { type: "MOVE_RESULT", playerId }
    );
    state = payRent(state, "p1");
    state = send(state, { type: "CITY_DEFER_TAX", playerId: "p3", round: 1 });
    state = payRent(end(state), "p2");
    const bills = state.mayor!.seats.p3!.bills;
    expect(bills.map(({ amount, status }) => ({ amount, status }))).toEqual([
      { amount: 2, status: "deferred" }, { amount: 3, status: "open" }
    ]);
    const paid = send(state, { type: "CITY_PAY_TAX", playerId: "p3", round: 1, billId: bills[1]!.id });
    expect(cash(paid, "p3")).toBe(1547);
    expect(paid.mayor!.seats.p3!.bills.map(bill => bill.status)).toEqual(["deferred"]);
    const duplicate = send(paid, { type: "CITY_PAY_TAX", playerId: "p3", round: 1, billId: bills[1]!.id });
    expect(cash(duplicate, "p3")).toBe(1547);
    const audited = send(paid, { type: "CITY_AUDIT", playerId: "p1", term: 1, targetId: "p3" });
    expect(cash(audited, "p3")).toBe(1520);
    expect(audited.mayor!.seats.p3!.bills).toEqual([]);
  });
});
