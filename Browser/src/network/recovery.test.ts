import { describe, expect, it, vi } from "vitest";
import { CHECKPOINT_KEY, SavedRoom } from "../../party/roomStore";
import { createInitialState } from "../engine/reducer";
import type { GameAction, GameState } from "../engine/types";
import { RoomConnection } from "./roomConnection";
import { readSeat, writeSeat } from "./seats";

const player = { id: "p1", name: "QA Asha", color: "red" };
const other = { id: "p2", name: "QA Bryn", color: "blue" };
const action = (type: "END_TURN" | "MOVE_RESULT" | "BUY", payload = {}) => ({ type, playerId: "p1", ...payload }) as GameAction;
function memoryStorage() {
  const values = new Map<string, unknown>();
  return { get: async <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
    put: vi.fn(async <T>(key: string, value: T) => { values.set(key, structuredClone(value)); }) };
}
async function startedRoom() {
  const storage = memoryStorage(), room = new SavedRoom(storage, "TEST");
  await room.load();
  await room.apply({ type: "JOIN", player }, "join-a");
  await room.apply({ type: "JOIN", player: other }, "join-b");
  await room.apply({ type: "START", playerId: "p1", firstPlayerId: "p1" }, "start");
  return { storage, room };
}
async function buyFirst(room: SavedRoom) {
  await room.apply({ type: "ROLL", playerId: "p1", dice: [1, 2] }, "roll");
  await room.apply(action("MOVE_RESULT"), "move");
  await room.apply(action("BUY", { propertyId: 3 }), "buy");
}

describe("durable room checkpoints", () => {
  it("restores cash, deeds, turn, board and journal after losing every in-memory object", async () => {
    const { storage, room } = await startedRoom(); await buyFirst(room);
    const saved = structuredClone(room.state), restarted = new SavedRoom(storage, "TEST");
    expect(restarted.state.phase).toBe("lobby");
    await restarted.load(); expect(restarted.state).toEqual(saved);
    expect(restarted.state.properties[3]?.ownerId).toBe("p1");
    await restarted.apply(action("END_TURN"), "end");
    expect(restarted.state.activePlayerId).toBe("p2");
  });
  it("does not repeat a roll or sale when a lost acknowledgement is retried after restart", async () => {
    const { storage, room } = await startedRoom(); await buyFirst(room);
    const saved = structuredClone(room.state), restarted = new SavedRoom(storage, "TEST"); await restarted.load();
    await restarted.apply({ type: "ROLL", playerId: "p1", dice: [1, 2] }, "roll");
    await restarted.apply(action("BUY", { propertyId: 3 }), "buy");
    expect(restarted.state).toEqual(saved);
  });
  it("has no one-hour expiry on a saved in-progress match", async () => {
    const { storage, room } = await startedRoom(); await buyFirst(room); const saved = structuredClone(room.state);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
      const restarted = new SavedRoom(storage, "TEST"); await restarted.load(); expect(restarted.state).toEqual(saved);
      await restarted.apply(action("END_TURN"), "two-hours-later"); expect(restarted.state.activePlayerId).toBe("p2");
    } finally { vi.useRealTimers(); }
  });
  it("never confirms or remembers a failed write, and the same action can safely retry", async () => {
    const { storage, room } = await startedRoom(); const before = structuredClone(room.state);
    storage.put.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(room.apply({ type: "ROLL", playerId: "p1", dice: [1, 2] }, "roll")).rejects.toThrow("storage unavailable");
    expect(room.state).toEqual(before);
    await room.apply({ type: "ROLL", playerId: "p1", dice: [1, 2] }, "roll");
    expect(room.state.phase).toBe("awaitingMove");
  });
  it("commits simultaneous joins sequentially without overwriting the first player", async () => {
    const room = new SavedRoom(memoryStorage(), "TEST"); await room.load();
    await Promise.all([room.apply({ type: "JOIN", player }, "a"), room.apply({ type: "JOIN", player: other }, "b")]);
    expect(room.state.players.map(p => p.id)).toEqual(["p1", "p2"]);
  });
  it("does not expose uncommitted state during an outstanding storage write", async () => {
    const { storage, room } = await startedRoom(); const before = room.state;
    let finish!: () => void;
    storage.put.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const applying = room.apply({ type: "ROLL", playerId: "p1", dice: [2, 3] }, "slow");
    await Promise.resolve(); expect(room.state).toBe(before); finish(); await applying;
    expect(room.state.phase).toBe("awaitingMove");
  });
  it("supports older clients without action receipts", async () => {
    const { storage, room } = await startedRoom();
    await room.apply({ type: "ROLL", playerId: "p1", dice: [2, 3] });
    const restarted = new SavedRoom(storage, "TEST"); await restarted.load();
    expect(restarted.state.pendingRoll?.dice).toEqual([2, 3]);
  });
  it("fails visibly on an unsupported save instead of erasing it", async () => {
    const storage = memoryStorage(); await storage.put(CHECKPOINT_KEY, { version: 2, state: createInitialState("TEST") });
    const room = new SavedRoom(storage, "TEST"); await expect(room.load()).rejects.toThrow("Unsupported room save");
    expect(storage.put).toHaveBeenCalledTimes(1);
  });
  it.each(["awaitingMove", "awaitingAuction", "awaitingTradeResponse", "awaitingDebt", "gameOver"] as const)("restores the complete %s phase without flattening its pending fields", async phase => {
    const storage = memoryStorage();
    const state = { ...createInitialState("TEST"), phase, players: [player, other], pendingRoll: { dice: [3, 4], playerId: "p1", total: 7 },
      auction: { currentBid: 150, highestBidderId: "p2" }, pendingTrade: { id: "offer-1" }, debts: [{ playerId: "p1", creditorId: "bank" }] };
    await storage.put(CHECKPOINT_KEY, { version: 1, state, receipts: ["a"] });
    const room = new SavedRoom(storage, "TEST"); await room.load(); expect(room.state).toEqual(state);
  });
});

function channel() {
  let now = 100_000;
  const socket = { readyState: 1, send: vi.fn(), reconnect: vi.fn() };
  const callbacks = { state: vi.fn(), status: vi.fn(), error: vi.fn() };
  const link = new RoomConnection(socket, callbacks, player, "client", () => now);
  const state = { ...createInitialState("TEST"), players: [{ ...player, cash: 1440 }] } as GameState;
  const snapshot = (ackId?: string) => link.receive(JSON.stringify({ type: "state", state, ackId }));
  return { socket, callbacks, link, snapshot, state, advance: (ms: number) => { now += ms; } };
}
describe("automatic room recovery", () => {
  it("ignores a rapid duplicate tap until the first action is acknowledged", () => {
    const c = channel(); c.link.open(); c.snapshot();
    expect(c.link.sendAction(action("END_TURN"))).toBe(true);
    expect(c.link.sendAction(action("END_TURN"))).toBe(false);
    expect(c.socket.send).toHaveBeenCalledTimes(1);
    c.snapshot("client:1");
    expect(c.link.sendAction(action("END_TURN"))).toBe(true);
    expect(JSON.parse(c.socket.send.mock.lastCall![0]).id).toBe("client:2");
  });
  it("waits for a canonical snapshot before enabling a returning seat", () => {
    const { link, callbacks, snapshot, socket } = channel(); link.open();
    expect(link.sendAction(action("END_TURN"))).toBe(false);
    snapshot(); expect(callbacks.status).toHaveBeenLastCalledWith("connected");
    expect(link.sendAction(action("END_TURN"))).toBe(true);
    expect(socket.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "action", action: action("END_TURN"), id: "client:1" }));
  });
  it("keeps the last rendered state and replays an unacknowledged move with the same ID", () => {
    const { link, snapshot, socket, callbacks, state } = channel(); link.open(); snapshot();
    link.sendAction(action("END_TURN")); const first = socket.send.mock.lastCall?.[0];
    link.disconnected(); link.open(); snapshot();
    expect(socket.send).toHaveBeenLastCalledWith(first); expect(callbacks.state).toHaveBeenLastCalledWith(state);
  });
  it("never replays an acknowledged move", () => {
    const { link, snapshot, socket } = channel(); link.open(); snapshot(); link.sendAction(action("END_TURN"));
    snapshot("client:1"); socket.send.mockClear(); link.disconnected(); link.open(); snapshot();
    expect(socket.send).not.toHaveBeenCalled();
  });
  it("does not queue new off-line game commands", () => {
    const { link, snapshot, socket } = channel(); link.open(); snapshot(); link.disconnected(true); socket.readyState = 3;
    expect(link.sendAction(action("END_TURN"))).toBe(false); expect(socket.send).not.toHaveBeenCalled();
  });
  it("adds a missing seat once without changing a returning player's name or cash", () => {
    const c = channel(); c.link.open(); c.link.receive(JSON.stringify({ type: "state", state: createInitialState("TEST") }));
    expect(JSON.parse(c.socket.send.mock.lastCall![0])).toEqual({ type: "action", action: { type: "JOIN", player }, id: "client:join" });
    c.socket.send.mockClear(); c.snapshot("client:join"); c.link.disconnected(); c.link.open(); c.snapshot();
    expect(c.socket.send).not.toHaveBeenCalled();
  });
  it("detects a silent dead connection and reconnects", () => {
    const c = channel(); c.link.open(); c.snapshot(); c.advance(46_000); c.link.tick();
    expect(c.socket.reconnect).toHaveBeenCalledOnce(); expect(c.callbacks.status).toHaveBeenLastCalledWith("reconnecting");
  });
  it("accepts heartbeat responses without touching game progress", () => {
    const c = channel(); c.link.open(); c.snapshot(); c.advance(21_000); c.link.tick();
    expect(c.socket.send).toHaveBeenLastCalledWith("ping"); c.link.receive("pong"); c.advance(21_000); c.link.tick();
    expect(c.socket.reconnect).not.toHaveBeenCalled(); expect(c.callbacks.state).toHaveBeenCalledTimes(1);
  });
  it("resyncs on a quick mobile resume and reconnects after a long sleep", () => {
    const c = channel(); c.link.open(); c.snapshot(); c.link.resume();
    expect(c.socket.send).toHaveBeenLastCalledWith('{"type":"sync"}'); c.advance(31_000); c.link.resume();
    expect(c.socket.reconnect).toHaveBeenCalledOnce();
  });
  it("reopens an offline connection immediately even if its stale socket still claims to be open", () => {
    const c = channel(); c.link.open(); c.snapshot(); c.link.disconnected(true);
    c.link.resume(); expect(c.socket.reconnect).toHaveBeenCalledOnce();
    expect(c.callbacks.status).toHaveBeenLastCalledWith("reconnecting");
  });
  it("recovers an unacknowledged action after an hour-long phone sleep", () => {
    const c = channel(); c.link.open(); c.snapshot(); c.link.sendAction(action("END_TURN"));
    const first = c.socket.send.mock.lastCall?.[0]; c.advance(60 * 60 * 1000); c.link.resume();
    expect(c.socket.reconnect).toHaveBeenCalledOnce(); c.link.open(); c.snapshot(); expect(c.socket.send).toHaveBeenLastCalledWith(first);
  });
  it("retries unacknowledged actions without generating a new receipt", () => {
    const c = channel(); c.link.open(); c.snapshot(); c.link.sendAction(action("END_TURN"));
    const first = c.socket.send.mock.lastCall?.[0]; c.advance(13_000); c.link.tick();
    expect(c.socket.send).toHaveBeenLastCalledWith(first);
  });
  it("retains a failed-to-save move for retry after the connection returns", () => {
    const c = channel(); c.link.open(); c.snapshot(); c.link.sendAction(action("END_TURN")); const first = c.socket.send.mock.lastCall?.[0];
    c.link.receive(JSON.stringify({ type: "error", message: "Save failed", id: "client:1", retryable: true }));
    expect(c.socket.reconnect).toHaveBeenCalledOnce(); c.link.open(); c.snapshot();
    expect(c.socket.send).toHaveBeenLastCalledWith(first);
  });
});

describe("seat recovery across browser restarts", () => {
  const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
  it("returns to the same player after tab storage has disappeared", () => {
    const tab = storage(), disk = storage(), seat = { roomCode: "TEST", player };
    writeSeat(seat, [tab, disk]); expect(readSeat("TEST", [storage(), disk])).toEqual(seat);
  });
  it("preserves independent seats in more than one room", () => {
    const disk = storage(); writeSeat({ roomCode: "AAAA", player }, [disk]); writeSeat({ roomCode: "BBBB", player: other }, [disk]);
    expect(readSeat("AAAA", [disk])?.player.id).toBe("p1"); expect(readSeat("BBBB", [disk])?.player.id).toBe("p2");
  });
  it("migrates the old tab-only seat", () => {
    const tab = storage(); tab.setItem("table-talk-seat", JSON.stringify({ roomCode: "TEST", player }));
    expect(readSeat("TEST", [tab])?.player.id).toBe("p1"); expect(readSeat("NOPE", [tab])).toBeUndefined();
  });
  it("keeps working if one storage provider is blocked", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }, disk = storage();
    writeSeat({ roomCode: "TEST", player }, [broken, disk]); expect(readSeat("TEST", [broken, disk])?.player.id).toBe("p1");
  });
});
