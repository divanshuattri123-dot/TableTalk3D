import type { GameState } from "./types";

// Older Mayor rooms with a Classic starting contest already use the 40-space decks.
export function usesClassicRules(state: Pick<GameState, "mode" | "mayorClassic" | "decks" | "setupRolls">) {
  return state.mode === "classic" || usesCityDecrees(state);
}
export function usesCityDecrees(state: Pick<GameState, "mode" | "mayorClassic" | "decks" | "setupRolls">) {
  return state.mode === "mayor" && (state.mayorClassic === true || Boolean(state.decks && state.setupRolls?.length));
}
