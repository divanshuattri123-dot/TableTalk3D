import { describe, expect, it } from "vitest";
import { calculateRent, createInitialState, netWorth, reduceGame } from "./reducer";
import type { CardDraw, Dice, GameState, PropertyState } from "./types";
import { classicPosition, colorGroupTiles, getBoard, getTile } from "./board";

const COLORS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5", "#ef476f"];

const started = (names = ["Asha", "Bryn"]): GameState => {
  let state = createInitialState("ABCD");
  names.forEach((name, index) => {
    state = reduceGame(state, {
      type: "JOIN",
      player: { id: `p${index + 1}`, name, color: COLORS[index] as string }
    });
  });
  return reduceGame(state, { type: "START", playerId: "p1", firstPlayerId: "p1" });
};

const rollAndMove = (
  state: GameState,
  playerId: string,
  dice: Dice,
  cardDraws: CardDraw[] = []
) =>
  reduceGame(
    reduceGame(state, { type: "ROLL", playerId, dice }),
    { type: "MOVE_RESULT", playerId, cardDraws }
  );

const setPlayer = (
  state: GameState,
  playerId: string,
  changes: Partial<GameState["players"][number]>
): GameState => ({
  ...state,
  players: state.players.map((player) =>
    player.id === playerId ? { ...player, ...changes } : player
  )
});

const setProperty = (
  state: GameState,
  propertyId: number,
  changes: Partial<PropertyState>
): GameState => ({
  ...state,
  properties: {
    ...state.properties,
    [propertyId]: { ...state.properties[propertyId], ...changes }
  }
});

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

describe("shared pure Monopoly-style reducer", () => {
  it("creates an immutable lobby and starts from a supplied first player", () => {
    const initial = deepFreeze(createInitialState("WXYZ"));
    const action = deepFreeze({
      type: "JOIN" as const,
      player: { id: "p1", name: " Asha ", color: "#e63946" }
    });
    const joined = reduceGame(initial, action);

    expect(initial.players).toHaveLength(0);
    expect(joined.players[0]).toMatchObject({ name: "Asha", cash: 1500, position: 0 });

    const twoPlayers = reduceGame(joined, {
      type: "JOIN",
      player: { id: "p2", name: "Bryn", color: "#457b9d" }
    });
    const startedState = reduceGame(twoPlayers, {
      type: "START",
      playerId: "p1",
      firstPlayerId: "p2"
    });
    expect(startedState.phase).toBe("awaitingRoll");
    expect(startedState.activePlayerId).toBe("p2");
    expect(startedState.bankHouses).toBe(32);
    expect(startedState.bankHotels).toBe(12);
  });

  it("records supplied dice before moving and pays GO exactly once", () => {
    let state = started();
    state = setPlayer(state, "p1", { position: 37 });
    const rolled = reduceGame(state, { type: "ROLL", playerId: "p1", dice: [1, 2] });

    expect(rolled.phase).toBe("awaitingMove");
    expect(rolled.players[0]?.position).toBe(37);
    expect(rolled.pendingRoll?.total).toBe(3);

    const moved = reduceGame(rolled, { type: "MOVE_RESULT", playerId: "p1" });
    expect(moved.players[0]).toMatchObject({ position: 0, cash: 1700 });
    expect(moved.phase).toBe("awaitingEndTurn");
  });

  it("buys an unowned property and charges ordinary and monopoly rent", () => {
    let state = started();
    state = setPlayer(state, "p1", { position: 39 });
    state = rollAndMove(state, "p1", [1, 1]);
    expect(state.phase).toBe("awaitingBuy");
    state = reduceGame(state, { type: "BUY", playerId: "p1", propertyId: 1 });
    expect(state.properties[1]).toMatchObject({ ownerId: "p1", houses: 0 });
    expect(state.players[0]?.cash).toBe(1640);

    let rentState = started();
    rentState = setProperty(rentState, 1, { ownerId: "p2" });
    rentState = setProperty(rentState, 3, { ownerId: "p2" });
    rentState = setPlayer(rentState, "p1", { position: 39 });
    rentState = rollAndMove(rentState, "p1", [1, 1]);
    expect(rentState.players.find((player) => player.id === "p1")?.cash).toBe(1696);
    expect(rentState.players.find((player) => player.id === "p2")?.cash).toBe(1504);
    expect(calculateRent(rentState, 1, 2)).toBe(4);
  });

  it("uses standard railroad, utility, house, hotel, and mortgage rent values", () => {
    let state = started();
    for (const propertyId of [5, 15, 25, 35]) {
      state = setProperty(state, propertyId, { ownerId: "p2" });
    }
    state = setProperty(state, 12, { ownerId: "p2" });
    state = setProperty(state, 28, { ownerId: "p2" });
    state = setProperty(state, 1, { ownerId: "p2", houses: 5 });

    expect(calculateRent(state, 5, 8)).toBe(200);
    expect(calculateRent(state, 12, 8)).toBe(80);
    expect(calculateRent(state, 1, 8)).toBe(250);
    state = setProperty(state, 1, { mortgaged: true });
    expect(calculateRent(state, 1, 8)).toBe(0);
  });

  it("declines a property, completes an ascending auction, and leaves an all-pass property unowned", () => {
    let state = started();
    state = setPlayer(state, "p1", { position: 39 });
    state = rollAndMove(state, "p1", [1, 1]);
    state = reduceGame(state, { type: "DECLINE_BUY", playerId: "p1" });
    expect(state.phase).toBe("awaitingAuction");
    state = reduceGame(state, { type: "AUCTION_BID", playerId: "p2", amount: 30 });
    state = reduceGame(state, { type: "AUCTION_BID", playerId: "p1", pass: true });
    expect(state.phase).toBe("awaitingEndTurn");
    expect(state.properties[1]?.ownerId).toBe("p2");
    expect(state.players.find((player) => player.id === "p2")?.cash).toBe(1470);

    let allPass = started();
    allPass = setPlayer(allPass, "p1", { position: 39 });
    allPass = rollAndMove(allPass, "p1", [1, 1]);
    allPass = reduceGame(allPass, { type: "DECLINE_BUY", playerId: "p1" });
    allPass = reduceGame(allPass, { type: "AUCTION_BID", playerId: "p1", pass: true });
    allPass = reduceGame(allPass, { type: "AUCTION_BID", playerId: "p2", pass: true });
    expect(allPass.phase).toBe("awaitingEndTurn");
    expect(allPass.properties[1]?.ownerId).toBeUndefined();
  });

  it("sends a third consecutive double to Jail without moving", () => {
    let state = started();
    state = { ...state, consecutiveDoubles: 2 };
    const jailed = reduceGame(state, { type: "ROLL", playerId: "p1", dice: [4, 4] });

    expect(jailed.players[0]).toMatchObject({ position: 10, inJail: true });
    expect(jailed.phase).toBe("awaitingEndTurn");
    expect(jailed.pendingRoll).toBeUndefined();
  });

  it("handles jail doubles and the third failed jail roll deterministically", () => {
    let escaped = started();
    escaped = setPlayer(escaped, "p1", { inJail: true, position: 10 });
    escaped = reduceGame(escaped, { type: "ROLL", playerId: "p1", dice: [2, 2] });
    expect(escaped.players[0]).toMatchObject({ inJail: false, jailTurns: 0 });
    expect(escaped.pendingRoll).toMatchObject({ total: 4, grantsExtraRoll: false });

    let thirdFail = started();
    thirdFail = setPlayer(thirdFail, "p1", { inJail: true, position: 10, jailTurns: 2 });
    thirdFail = reduceGame(thirdFail, { type: "ROLL", playerId: "p1", dice: [1, 2] });
    expect(thirdFail.phase).toBe("awaitingJailPayment");
    expect(thirdFail.pendingRoll?.total).toBe(3);
    thirdFail = reduceGame(thirdFail, { type: "PAY", playerId: "p1", kind: "jailFine" });
    expect(thirdFail.phase).toBe("awaitingMove");
    expect(thirdFail.players[0]).toMatchObject({ inJail: false, cash: 1450 });
  });

  it("resolves taxes, Go To Jail, and chained Chance / Community Chest cards", () => {
    let tax = started();
    tax = setPlayer(tax, "p1", { position: 2 });
    tax = rollAndMove(tax, "p1", [1, 1]);
    expect(tax.players[0]?.cash).toBe(1300);

    let jail = started();
    jail = setPlayer(jail, "p1", { position: 28 });
    jail = rollAndMove(jail, "p1", [1, 1]);
    expect(jail.players[0]).toMatchObject({ position: 10, inJail: true });

    let cards = started();
    cards = setPlayer(cards, "p1", { position: 34 });
    cards = rollAndMove(cards, "p1", [1, 1], [
      { deck: "chance", index: 3 },
      { deck: "community", index: 1 }
    ]);
    expect(cards.players[0]).toMatchObject({ position: 33, cash: 1700 });
    expect(cards.card?.text).toContain("Bank error");
  });

  it("enforces even builds, bank inventory, and mortgage rules", () => {
    let state = started();
    state = setProperty(state, 1, { ownerId: "p1" });
    state = setProperty(state, 3, { ownerId: "p1" });

    state = reduceGame(state, { type: "BUILD", playerId: "p1", propertyId: 1, operation: "build" });
    expect(state.properties[1]?.houses).toBe(1);
    expect(state.bankHouses).toBe(31);
    const uneven = reduceGame(state, { type: "BUILD", playerId: "p1", propertyId: 1, operation: "build" });
    expect(uneven.properties[1]?.houses).toBe(1);
    state = reduceGame(state, { type: "BUILD", playerId: "p1", propertyId: 3, operation: "build" });
    expect(state.properties[3]?.houses).toBe(1);

    const blockedMortgage = reduceGame(state, {
      type: "MORTGAGE",
      playerId: "p1",
      propertyId: 1,
      mortgage: true
    });
    expect(blockedMortgage.properties[1]?.mortgaged).toBe(false);

    state = reduceGame(state, { type: "BUILD", playerId: "p1", propertyId: 1, operation: "sell" });
    state = reduceGame(state, { type: "BUILD", playerId: "p1", propertyId: 3, operation: "sell" });
    state = reduceGame(state, { type: "MORTGAGE", playerId: "p1", propertyId: 1, mortgage: true });
    expect(state.properties[1]?.mortgaged).toBe(true);
    expect(state.players[0]?.cash).toBe(1480);
    state = reduceGame(state, { type: "MORTGAGE", playerId: "p1", propertyId: 1, mortgage: false });
    expect(state.properties[1]?.mortgaged).toBe(false);
    expect(state.players[0]?.cash).toBe(1447);
  });

  it("transfers a bankrupt player's assets to a creditor or back to the bank", () => {
    let creditorCase = started();
    creditorCase = setPlayer(creditorCase, "p1", { cash: 10, position: 0 });
    creditorCase = setProperty(creditorCase, 1, { ownerId: "p1" });
    creditorCase = setProperty(creditorCase, 3, { ownerId: "p2", houses: 5 });
    creditorCase = rollAndMove(creditorCase, "p1", [1, 2]);
    expect(creditorCase.players.find((player) => player.id === "p1")?.bankrupt).toBe(true);
    expect(creditorCase.properties[1]?.ownerId).toBe("p2");
    expect(creditorCase.phase).toBe("gameOver");

    let bankCase = started();
    bankCase = setPlayer(bankCase, "p1", { cash: 10, position: 2 });
    bankCase = setProperty(bankCase, 1, { ownerId: "p1" });
    bankCase = rollAndMove(bankCase, "p1", [1, 1]);
    expect(bankCase.players.find((player) => player.id === "p1")?.bankrupt).toBe(true);
    expect(bankCase.properties[1]?.ownerId).toBeUndefined();
    expect(bankCase.properties[1]).toMatchObject({ houses: 0, mortgaged: false });
    expect(netWorth(bankCase, "p1")).toBeLessThan(0);
  });

  it("offers, accepts, and declines atomic trades", () => {
    let state = started();
    state = setProperty(state, 1, { ownerId: "p1" });
    state = setProperty(state, 3, { ownerId: "p2" });
    state = reduceGame(state, {
      type: "TRADE_OFFER",
      playerId: "p1",
      offerId: "swap-1",
      toPlayerId: "p2",
      offeredCash: 50,
      offeredPropertyIds: [1],
      requestedCash: 25,
      requestedPropertyIds: [3]
    });
    expect(state.phase).toBe("awaitingTradeResponse");
    state = reduceGame(state, { type: "TRADE_ACCEPT", playerId: "p2", offerId: "swap-1" });
    expect(state.phase).toBe("awaitingRoll");
    expect(state.properties[1]?.ownerId).toBe("p2");
    expect(state.properties[3]?.ownerId).toBe("p1");
    expect(state.players.find((player) => player.id === "p1")?.cash).toBe(1475);
    expect(state.players.find((player) => player.id === "p2")?.cash).toBe(1525);

    state = reduceGame(state, {
      type: "TRADE_OFFER",
      playerId: "p1",
      offerId: "decline-1",
      toPlayerId: "p2",
      offeredCash: 1,
      offeredPropertyIds: [],
      requestedCash: 0,
      requestedPropertyIds: []
    });
    const declined = reduceGame(state, { type: "TRADE_DECLINE", playerId: "p2", offerId: "decline-1" });
    expect(declined.phase).toBe("awaitingRoll");
    expect(declined.players).toEqual(state.players);
  });

  it("rejects a wrong-turn action without changing the board or balances", () => {
    const state = started();
    const invalid = reduceGame(state, { type: "ROLL", playerId: "p2", dice: [6, 6] });
    expect(invalid.players).toEqual(state.players);
    expect(invalid.properties).toEqual(state.properties);
    expect(invalid.phase).toBe("awaitingRoll");
    expect(invalid.eventLog).toHaveLength(state.eventLog.length + 1);
  });

  it("resumes an existing seat without changing a running game", () => {
    const state = deepFreeze(started());
    const resumed = reduceGame(state, {
      type: "JOIN", player: { id: "p1", name: "Asha", color: COLORS[0] as string }
    });
    expect(resumed).toBe(state);
    expect(resumed.players).toHaveLength(2);
  });

  it("advances past an active bankrupt player in a three-player game", () => {
    let state = started(["Asha", "Bryn", "Cato"]);
    state = setPlayer(state, "p1", { cash: 10, position: 2 });
    state = rollAndMove(state, "p1", [1, 1]);
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.phase).toBe("awaitingRoll");
    expect(state.activePlayerId).toBe("p2");
    expect(state.pendingRoll).toBeUndefined();
    expect(state.consecutiveDoubles).toBe(0);
  });

  it("advances after a jail fine bankrupts the active player", () => {
    let state = started(["Asha", "Bryn", "Cato"]);
    state = setPlayer(state, "p1", { cash: 10, inJail: true, position: 10 });
    state = reduceGame(state, { type: "PAY", playerId: "p1", kind: "jailFine" });
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.phase).toBe("awaitingRoll");
    expect(state.activePlayerId).toBe("p2");
  });

  it("does not return a hotel's houses to the bank twice on bankruptcy", () => {
    let state = started();
    state = setProperty(state, 1, { ownerId: "p1", houses: 5 });
    state = { ...state, bankHouses: 32, bankHotels: 11 };
    state = setPlayer(state, "p1", { cash: -200, position: 2 });
    state = reduceGame(state, { type: "BANKRUPT", playerId: "p1" });
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.bankHouses).toBe(32);
    expect(state.bankHotels).toBe(12);
    expect(state.properties[1]?.houses).toBe(0);
  });

  it.each([[6, 50], [12, 75], [5, 100], [37, 175]])(
    "unmortgages tile %i for its exact principal plus ten percent",
    (propertyId, principal) => {
      let state = setProperty(started(), propertyId, { ownerId: "p1", mortgaged: true });
      state = reduceGame(state, { type: "MORTGAGE", playerId: "p1", propertyId, mortgage: false });
      expect(state.players[0]?.cash).toBe(1500 - principal - Math.ceil(principal / 10));
    }
  );

  it("cannot trade an empty deed away from a group that still has houses", () => {
    let state = setProperty(started(), 1, { ownerId: "p1", houses: 1 });
    state = setProperty(state, 3, { ownerId: "p1" });
    const result = reduceGame(state, {
      type: "TRADE_OFFER", playerId: "p1", offerId: "split-built-set", toPlayerId: "p2",
      offeredCash: 0, offeredPropertyIds: [3], requestedCash: 100, requestedPropertyIds: []
    });
    expect(result.phase).toBe("awaitingRoll");
    expect(result.pendingTrade).toBeUndefined();
    expect(result.properties).toEqual(state.properties);
  });

  describe.each([[3, 40], [4, 48], [5, 56], [6, 64]] as const)("%i-player expanded board (%i tiles)", (count, size) => {
    const game = () => started(Array.from({ length: count }, (_, index) => `Player ${index + 1}`));

    it("locks a contiguous square board with correct corners and complete added color sets", () => {
      const state = game();
      expect(state.boardSize).toBe(size);
      const board = getBoard(state.boardSize);
      expect(board.map((tile) => tile.position)).toEqual(Array.from({ length: size }, (_, i) => i));
      expect([0, size / 4, size / 2, 3 * size / 4].map((p) => getTile(p, state.boardSize).kind))
        .toEqual(["go", "jail", "freeParking", "goToJail"]);
      for (const tile of board) if (tile.kind === "property") expect(colorGroupTiles(tile.group, state.boardSize).length).toBeGreaterThanOrEqual(2);
      expect(state.bankHouses).toBe(32 + (size - 40) * 2);
      expect(state.bankHotels).toBe(12 + (size - 40) / 2);
    });

    it("wraps GO and uses the expanded Jail location", () => {
      let go = setPlayer(game(), "p1", { position: size - 3 });
      go = rollAndMove(go, "p1", [1, 2]);
      expect(go.players[0]).toMatchObject({ position: 0, cash: 1700 });
      let jail = setPlayer(game(), "p1", { position: 3 * size / 4 - 2 });
      jail = rollAndMove(jail, "p1", [1, 1]);
      expect(jail.players[0]).toMatchObject({ position: size / 4, inJail: true, cash: 1500 });
      const stillSameBoard = reduceGame(jail, { type: "END_TURN", playerId: "p1" });
      expect(stillSameBoard.boardSize).toBe(size);
    });

    it("maps card targets, railroads and utility rent to the expanded board", () => {
      let state = setPlayer(game(), "p1", { position: classicPosition(22, size) - 3 });
      state = rollAndMove(state, "p1", [1, 2], [{ deck: "chance", index: 1 }]);
      expect(state.players[0]?.position).toBe(classicPosition(24, size));
      expect(state.pendingPurchase?.propertyId).toBe(classicPosition(24, size));
      let railroad = setPlayer(game(), "p1", { position: classicPosition(22, size) - 3 });
      railroad = rollAndMove(railroad, "p1", [1, 2], [{ deck: "chance", index: 2 }]);
      expect(railroad.players[0]?.position).toBe(classicPosition(25, size));
      let utilities = game();
      for (const tile of [12, 28]) utilities = setProperty(utilities, classicPosition(tile, size), { ownerId: "p2" });
      expect(calculateRent(utilities, classicPosition(12, size), 8)).toBe(80);
    });
  });

  it("builds on added property groups and never shrinks a six-player board after bankruptcy", () => {
    let state = started(["A", "B", "C", "D", "E", "F"]);
    state = setProperty(state, 10, { ownerId: "p1" });
    state = setProperty(state, 11, { ownerId: "p1" });
    state = reduceGame(state, { type: "BUILD", playerId: "p1", propertyId: 10, operation: "build" });
    expect(state.properties[10]?.houses).toBe(1);
    expect(state.bankHouses).toBe(79);
    state = setPlayer(state, "p1", { cash: -500, position: 2 });
    state = rollAndMove(state, "p1", [1, 1]);
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.boardSize).toBe(64);
    expect(state.activePlayerId).toBe("p2");
  });

  it("syncs supplied cosmetic IDs without changing the turn, balances or event clock", () => {
    const state = deepFreeze(started());
    const action = { type: "SET_APPEARANCE" as const, playerId: "p2", tokenId: "sportscar", diceId: "paris" };
    const next = reduceGame(state, action);
    expect(next.players[1]).toMatchObject({ tokenId: "sportscar", diceId: "paris", cash: 1500 });
    expect(next.activePlayerId).toBe(state.activePlayerId);
    expect(next.phase).toBe(state.phase);
    expect(next.properties).toBe(state.properties);
    expect(next.nextEventId).toBe(state.nextEventId);
    expect(reduceGame(state, action)).toEqual(next);
  });
});
