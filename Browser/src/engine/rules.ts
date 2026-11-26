import type { GameState } from "./types";

// Started Mayor saves without this flag keep their original board and card history.
export function usesClassicRules(state: Pick<GameState, "mode" | "mayorClassic">) {
  return state.mode === "classic" || state.mode === "mayor" && state.mayorClassic === true;
}
