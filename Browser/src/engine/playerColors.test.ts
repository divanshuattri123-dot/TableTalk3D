import { describe, expect, it } from "vitest";
import { createInitialState, reduceGame } from "./reducer";
import { isPlayerColorTaken, PLAYER_COLORS, playerColorKey } from "./playerColors";

const join = (state: ReturnType<typeof createInitialState>, id: string, color: string) =>
  reduceGame(state, { type: "JOIN", player: { id, name: id, color } });
const lobby = () => join(join(createInitialState("HUES"), "a", PLAYER_COLORS[0]!), "b", PLAYER_COLORS[1]!);

describe("mandatory unique player colours", () => {
  it("normalizes hex case, whitespace and short notation without browser APIs", () => {
    expect(playerColorKey(" #AbC ")).toBe("#aabbcc");
    expect(playerColorKey(" #ED6266 ")).toBe(PLAYER_COLORS[0]);
  });
  it("rejects the second simultaneous join requesting the same colour without taking a seat", () => {
    const first = join(createInitialState("HUES"), "a", "#abc");
    const second = join(first, "b", "#AABBCC");
    expect(first.players).toHaveLength(1);
    expect(second.players).toEqual(first.players);
    expect(second.notice).toMatch(/colour.*taken/);
    expect(second.boardSize).toBe(40);
  });
  it("allows the rejected player to retry with a free colour", () => {
    const duplicate = join(join(createInitialState("HUES"), "a", PLAYER_COLORS[0]!), "b", PLAYER_COLORS[0]!);
    const retried = join(duplicate, "b", PLAYER_COLORS[1]!);
    expect(retried.players).toHaveLength(2);
    expect(retried.players[1]?.color).toBe(PLAYER_COLORS[1]);
    expect(retried.notice).toBeUndefined();
  });
  it("keeps a returning player's existing seat and colour idempotent", () => {
    const state = lobby();
    expect(join(state, "a", PLAYER_COLORS[1]!)).toBe(state);
  });
  it("seats six distinct colours and excludes only the current player from the picker", () => {
    let state = createInitialState("HUES");
    PLAYER_COLORS.forEach((color, i) => { state = join(state, String(i), color); });
    expect(state.players).toHaveLength(6);
    expect(state.boardSize).toBe(64);
    expect(PLAYER_COLORS.every(color => isPlayerColorTaken(state.players, color))).toBe(true);
    expect(isPlayerColorTaken(state.players, PLAYER_COLORS[0]!, "0")).toBe(false);
  });
  it("allows a lobby colour change only when no other player owns that colour", () => {
    const state = lobby();
    const rejected = reduceGame(state, { type: "SET_APPEARANCE", playerId: "b", color: PLAYER_COLORS[0] });
    expect(rejected.players).toEqual(state.players);
    const changed = reduceGame(state, { type: "SET_APPEARANCE", playerId: "b", color: PLAYER_COLORS[2] });
    expect(changed.players[1]?.color).toBe(PLAYER_COLORS[2]);
    expect(isPlayerColorTaken(changed.players, PLAYER_COLORS[1]!)).toBe(false);
  });
  it("blocks a legacy duplicate-colour lobby until one player changes their colour", () => {
    const state = lobby();
    const legacy = { ...state, players: state.players.map(player => ({ ...player, color: PLAYER_COLORS[0]! })) };
    const action = { type: "START" as const, playerId: "a", firstPlayerId: "a" };
    const rejected = reduceGame(legacy, action);
    expect(rejected.phase).toBe("lobby");
    const fixed = reduceGame(rejected, { type: "SET_APPEARANCE", playerId: "b", color: PLAYER_COLORS[1] });
    expect(fixed.notice).toBeUndefined();
    expect(reduceGame(fixed, action).phase).toBe("awaitingRoll");
  });
  it("locks colours after starting while still allowing token and dice cosmetics", () => {
    const state = reduceGame(lobby(), { type: "START", playerId: "a", firstPlayerId: "a" });
    expect(reduceGame(state, { type: "SET_APPEARANCE", playerId: "a", color: PLAYER_COLORS[2] }).players).toEqual(state.players);
    expect(reduceGame(state, { type: "SET_APPEARANCE", playerId: "a", tokenId: "new-token" }).players[0]?.tokenId).toBe("new-token");
  });
});
