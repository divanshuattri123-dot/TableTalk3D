import { describe, expect, it, vi } from "vitest";
import { cityText } from "./engine/board";
import { nextBotAction } from "./engine/bots";
import { createInitialState, reduceGame } from "./engine/reducer";
import type { GameAction, GameState, Player, PropertyState } from "./engine/types";
import { RoomConnection } from "./network/roomConnection";
import { planPresentation } from "./presentation/plan";
import { soundForEvents } from "./view/useGameAudio";
import { exitGameFullscreen } from "./view/fullscreen";

const withPlayer = (s: GameState, id: string, patch: Partial<Player>): GameState => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p))
});
const withDeed = (s: GameState, id: number, patch: Partial<PropertyState>): GameState => ({
  ...s,
  properties: { ...s.properties, [id]: { ...s.properties[id]!, ...patch } }
});

function startMayor(count = 3, withBotMayor = false) {
  let s = createInitialState("BUGS");
  for (let i = 1; i <= count; i++) {
    s = reduceGame(s, {
      type: "JOIN",
      player: { id: `p${i}`, name: `Player ${i}`, color: ["red", "blue", "green", "orange"][i - 1]! }
    });
  }
  s = reduceGame(s, { type: "SET_MODE", playerId: "p1", mode: "mayor" });
  const order = Array.from({ length: 16 }, (_, i) => i);
  const setupRolls = [
    s.players.map((p, idx) => ({
      playerId: p.id,
      dice: (idx === 0 ? [6, 6] : [1, 2]) as readonly [number, number]
    }))
  ];
  s = reduceGame(s, {
    type: "START",
    playerId: "p1",
    firstPlayerId: "p1",
    setupRolls,
    deckOrder: { chance: order, community: order }
  });
  if (withBotMayor) {
    s = withPlayer(s, "p1", { bot: true });
  }
  return s;
}

describe("bug hunt regressions", () => {
  it("does not duplicate money across multiple creditors or overpay on payEach debt settlement in Mayor mode", () => {
    // Classic Chance index 14 is Elected chairperson: Pay every other player ₹50.
    let s = startMayor(3);
    s = { ...s, decks: { ...s.decks!, chance: [14, ...s.decks!.chance.filter((i) => i !== 14)] } };
    // Position 4 + roll 3 = 7 (Chance). p1 has ₹20 cash and two ₹100 deeds (mortgage ₹50 each).
    s = withPlayer(s, "p1", { position: 4, cash: 20 });
    s = withDeed(withDeed(s, 6, { ownerId: "p1" }), 8, { ownerId: "p1" });
    const p2Start = s.players.find((p) => p.id === "p2")!.cash;
    const p3Start = s.players.find((p) => p.id === "p3")!.cash;

    s = reduceGame(s, { type: "ROLL", playerId: "p1", dice: [1, 2] });
    s = reduceGame(s, { type: "MOVE_RESULT", playerId: "p1" });
    expect(s.phase).toBe("awaitingDebt");
    expect(s.players.find((p) => p.id === "p1")!.cash).toBe(-80);
    // Immediate cash ₹20 paid p2; p1 still owes ₹30 to p2 and ₹50 to p3.
    expect(s.players.find((p) => p.id === "p2")!.cash).toBe(p2Start + 20);
    expect(s.players.find((p) => p.id === "p3")!.cash).toBe(p3Start);

    // First mortgage raises ₹50: ₹30 finishes paying p2, remaining ₹20 goes to p3.
    s = reduceGame(s, { type: "MORTGAGE", playerId: "p1", propertyId: 6, mortgage: true });
    expect(s.players.find((p) => p.id === "p1")!.cash).toBe(-30);
    expect(s.players.find((p) => p.id === "p2")!.cash).toBe(p2Start + 50);
    expect(s.players.find((p) => p.id === "p3")!.cash).toBe(p3Start + 20);

    // Second mortgage raises ₹50: ₹30 finishes paying p3, leaving p1 with ₹20 cash.
    s = reduceGame(s, { type: "MORTGAGE", playerId: "p1", propertyId: 8, mortgage: true });
    expect(s.phase).toBe("awaitingEndTurn");
    expect(s.debts).toBeUndefined();
    expect(s.players.find((p) => p.id === "p1")!.cash).toBe(20);
    expect(s.players.find((p) => p.id === "p2")!.cash).toBe(p2Start + 50);
    expect(s.players.find((p) => p.id === "p3")!.cash).toBe(p3Start + 50);
  });

  it("stops charging a player who goes bankrupt mid-loop on a payEach card", () => {
    let s = startMayor(3);
    s = { ...s, decks: { ...s.decks!, chance: [14, ...s.decks!.chance.filter((i) => i !== 14)] } };
    // p1 has only ₹20 cash and zero properties -> bankrupt immediately on paying p2.
    s = withPlayer(s, "p1", { position: 4, cash: 20 });
    const p3Start = s.players.find((p) => p.id === "p3")!.cash;

    s = reduceGame(s, { type: "ROLL", playerId: "p1", dice: [1, 2] });
    s = reduceGame(s, { type: "MOVE_RESULT", playerId: "p1" });

    const p1 = s.players.find((p) => p.id === "p1")!;
    expect(p1.bankrupt).toBe(true);
    // p1 should NOT be charged a phantom ₹50 to p3 after going bankrupt.
    expect(p1.cash).toBe(-30);
    expect(s.players.find((p) => p.id === "p3")!.cash).toBe(p3Start);
    expect(s.eventLog.some((e) => e.text.includes("to Player 3"))).toBe(false);
  });

  it("keeps handleTradeCounter pendingTrade clean of raw action keys and clones property arrays", () => {
    let s = startMayor(2);
    s = withDeed(withDeed(s, 1, { ownerId: "p1" }), 3, { ownerId: "p2" });
    s = reduceGame(s, {
      type: "TRADE_OFFER",
      playerId: "p1",
      offerId: "offer-1",
      toPlayerId: "p2",
      offeredCash: 10,
      offeredPropertyIds: [1],
      requestedCash: 0,
      requestedPropertyIds: [3]
    });
    const offeredProps = [3];
    const requestedProps = [1];
    const counterAction: Extract<GameAction, { type: "TRADE_COUNTER" }> = {
      type: "TRADE_COUNTER",
      playerId: "p2",
      previousOfferId: "offer-1",
      offerId: "offer-2",
      offeredCash: 0,
      offeredPropertyIds: offeredProps,
      requestedCash: 25,
      requestedPropertyIds: requestedProps
    };
    const next = reduceGame(s, counterAction);
    expect(next.notice).toBeUndefined();
    expect(next.pendingTrade).toBeDefined();
    expect("type" in (next.pendingTrade as unknown as Record<string, unknown>)).toBe(false);
    expect("previousOfferId" in (next.pendingTrade as unknown as Record<string, unknown>)).toBe(false);
    expect("playerId" in (next.pendingTrade as unknown as Record<string, unknown>)).toBe(false);
    offeredProps.push(99);
    requestedProps.push(88);
    expect(next.pendingTrade!.offeredPropertyIds).toEqual([3]);
    expect(next.pendingTrade!.requestedPropertyIds).toEqual([1]);
  });

  it("does not send failed JOIN actions from spectators opening an already-started room", () => {
    const socket = { readyState: 1, send: vi.fn(), reconnect: vi.fn() };
    const callbacks = { state: vi.fn(), status: vi.fn(), error: vi.fn() };
    const outsider = { id: "spectator", name: "Outsider", color: "purple" };
    const link = new RoomConnection(socket, callbacks, outsider, "spec-client");
    const liveMatch = startMayor(2);
    expect(liveMatch.phase).toBe("awaitingRoll");

    link.open();
    link.receive(JSON.stringify({ type: "state", state: liveMatch }));

    expect(socket.send).not.toHaveBeenCalled();
    expect(callbacks.status).toHaveBeenLastCalledWith("connected");
  });

  it("does not waste a broke AI Mayor's executive decree on Rent Relief for an unowned street", () => {
    let s = startMayor(2, true);
    // p1 (bot Mayor) already used their loan and has ₹0 cash on GO; tiles 5..9 are all unowned (rent 0).
    s = withPlayer(s, "p1", { cash: 0, position: 0 });
    s = {
      ...s,
      mayor: {
        ...s.mayor!,
        seats: { ...s.mayor!.seats, p1: { ...s.mayor!.seats.p1!, borrowed: true } }
      }
    };
    const action = nextBotAction(s, [1, 2]);
    expect(action?.type).not.toBe("CITY_PROPOSE");
  });

  it("parses comma-formatted rupee amounts >= ₹1,000 in presentation money frames", () => {
    const prev = startMayor(2);
    const next: GameState = {
      ...prev,
      nextEventId: prev.nextEventId + 1,
      eventLog: [
        { id: prev.nextEventId, kind: "money", text: "Player 1 received ₹1,500." },
        ...prev.eventLog
      ]
    };
    const frames = planPresentation(prev, next);
    const moneyFrame = frames.find((f) => f.kind === "money");
    expect(moneyFrame?.amount).toBe(1500);
  });

  it("picks up sound cues from earlier events in a multi-event reducer turn", () => {
    const events = [
      { id: 12, kind: "civic" as const, text: "Player 1 reached the Golconda Fort wheel." },
      { id: 11, kind: "money" as const, text: "Player 1 passed GO and collected ₹200." },
      { id: 10, kind: "turn" as const, text: "Player 1 moved to Golconda Fort." }
    ];
    expect(soundForEvents(events, "awaitingEndTurn")).toBe("income");

    const jailWithAdvance = [
      { id: 22, kind: "turn" as const, text: "Player 2's turn." },
      { id: 21, kind: "turn" as const, text: "Player 1 went to Jail (three consecutive doubles)." }
    ];
    expect(soundForEvents(jailWithAdvance, "awaitingRoll")).toBe("jail");
  });

  it("does not crash cityText when translation list is empty", () => {
    expect(() => cityText("Player 1 moved to GO.", "unknown-city" as unknown as "tokyo", 40)).not.toThrow();
    expect(cityText("Player 1 moved to GO.", "unknown-city" as unknown as "tokyo", 40)).toBe("Player 1 moved to GO.");
  });

  it("tolerates exitGameFullscreen rejections without throwing unhandled errors", async () => {
    const originalDoc = globalThis.document;
    const originalScreen = globalThis.screen;
    try {
      Object.defineProperty(globalThis, "screen", { configurable: true, value: { orientation: {} } });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
          fullscreenElement: {},
          exitFullscreen: vi.fn().mockRejectedValue(new Error("Document not active"))
        }
      });
      await expect(exitGameFullscreen()).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDoc });
      Object.defineProperty(globalThis, "screen", { configurable: true, value: originalScreen });
    }
  });
});
