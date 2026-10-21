import type { Tile } from "../engine/types";

export type BoardSymbol = "go" | "jail" | "parking" | "police" | "chance" | "chest" | "train" | "bulb" | "water" | "tax";
export const printedBoardLabel = (tile: Tile) => tile.kind === "jail" ? "JAIL / VISITING" : (tile.boardLabel ?? tile.name).toUpperCase();
export function boardSymbol(tile: Tile): BoardSymbol | undefined {
  switch (tile.kind) {
    case "go": return "go";
    case "jail": return "jail";
    case "freeParking": return "parking";
    case "goToJail": return "police";
    case "chance": return "chance";
    case "community": return "chest";
    case "railroad": return "train";
    case "utility": return /power|electric/i.test(tile.name) ? "bulb" : "water";
    case "tax": return "tax";
    default: return undefined;
  }
}
