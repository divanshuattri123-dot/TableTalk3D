import { getBoard, isPurchasableTile } from "../engine/board";
import type { GameState } from "../engine/types";
import { GROUP_COLORS } from "../view/palette";
import { decisionPlayerId } from "../engine/reducer";

export const unitySnapshot = (game: GameState) => ({
  roomCode: game.roomCode, boardSize: game.boardSize, eventId: game.nextEventId,
  phase: game.phase, activePlayerId: decisionPlayerId(game) ?? "", players: game.players, currencySymbol: "₹",
  dice: game.lastRoll?.dice ?? [],
  tiles: getBoard(game.boardSize).map(tile => ({
    id: tile.position, name: tile.name, boardLabel: tile.boardLabel ?? tile.name,
    region: tile.region ?? "", detail: tile.detail ?? "", kind: tile.kind,
    price: isPurchasableTile(tile) ? tile.price : 0,
    color: tile.kind === "property" ? GROUP_COLORS[tile.group] : "#e5b94d",
    houses: game.properties[tile.position]?.houses ?? 0,
    ownerId: game.properties[tile.position]?.ownerId ?? "",
    mortgaged: game.properties[tile.position]?.mortgaged ?? false
  }))
});
