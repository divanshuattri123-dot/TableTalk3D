import { cardAt, classicPosition, getBoard, railroadPositions } from "../engine/board";
import type { GameState } from "../engine/types";

export type MotionKind = "turn" | "dice" | "move" | "card" | "jail" | "release" | "money" | "purchase" | "bid" | "sold" | "build" | "mortgage" | "trade" | "bankrupt" | "winner";
export interface PresentationFrame {
  id: string; kind: MotionKind; duration: number; text: string;
  playerId?: string; tileId?: number; route?: number[]; dice?: number[];
  deck?: string; amount?: number; recipientId?: string; backwards?: boolean;
  diceId?: string;
}

export const routeBetween = (from: number, to: number, size: number, backwards = false): number[] => {
  const direction = backwards ? -1 : 1, count = backwards ? (from - to + size) % size : (to - from + size) % size;
  return Array.from({ length: count }, (_, i) => (from + direction * (i + 1) + size) % size);
};

// Event IDs are the reducer's ordered journal, not wall-clock time. Echoes add no frames.
export function planPresentation(previous: GameState | undefined, next: GameState): PresentationFrame[] {
  if (!previous || previous.roomCode !== next.roomCode || previous.boardSize !== next.boardSize || next.nextEventId <= previous.nextEventId) return [];
  const events = next.eventLog.filter(e => e.id >= previous.nextEventId).reverse();
  const frames: PresentationFrame[] = [];
  const add = (kind: MotionKind, text: string, duration: number, data: Partial<PresentationFrame> = {}) =>
    frames.push({ id: `${next.roomCode}:${next.nextEventId}:${frames.length}`, kind, text, duration, ...data });
  const board = getBoard(next.boardSize), active = next.players.find(p => p.id === previous.activePlayerId);
  const positions = new Map(previous.players.map(p => [p.id, p.position]));
  const destinations = new Map<string, number>();
  if (previous.phase === "awaitingMove" && previous.pendingRoll) {
    const roll = previous.pendingRoll;
    destinations.set(roll.playerId, ((positions.get(roll.playerId) ?? 0) + roll.total) % next.boardSize);
  }
  let backwards = false;
  if (previous.phase === "awaitingRoll" && next.phase !== "awaitingRoll" && next.lastRoll && !next.notice) {
    add("dice", `${active?.name ?? "Player"} rolled ${next.lastRoll.dice.join(" + ")}${next.lastRoll.doubles ? " · DOUBLES!" : ""}`, 1450,
      { playerId: next.lastRoll.playerId, dice: [...next.lastRoll.dice], diceId: active?.diceId });
  }
  for (const event of events) {
    if (event.kind === "error") continue;
    const player = next.players.find(p => event.playerId ? p.id === event.playerId : event.text.startsWith(`${p.name} `));
    const playerId = player?.id;
    const hint = event.position ?? (player && destinations.get(player.id));
    const moved = player && board.find(t => (hint === undefined || t.position === hint) && event.text === `${player.name} moved to ${t.name}.`);
    if (moved && player) {
      const from = positions.get(player.id) ?? player.position;
      const route = routeBetween(from, moved.position, next.boardSize, backwards);
      if (route.length) add("move", event.text, route.length * 170 + 550, { playerId, tileId: moved.position, route, backwards });
      positions.set(player.id, moved.position); backwards = false; continue;
    }
    if (event.kind === "card") {
      const text = event.text.slice(event.text.indexOf(" drew: ") + 7);
      const entry = event.deck && event.cardIndex !== undefined ? { deck: event.deck, card: cardAt(event.deck, event.cardIndex) } : (["chance", "community"] as const).flatMap(deck => Array.from({ length: 8 }, (_, index) => ({ deck, card: cardAt(deck, index) }))).find(c => c.card?.text === text);
      backwards = entry?.card?.effect.kind === "moveRelative" && entry.card.effect.spaces < 0;
      const effect = entry?.card?.effect, position = positions.get(playerId ?? "") ?? 0;
      if (playerId && effect) {
        if (effect.kind === "moveTo") destinations.set(playerId, classicPosition(effect.position, next.boardSize));
        if (effect.kind === "moveRelative") destinations.set(playerId, (position + effect.spaces + next.boardSize) % next.boardSize);
        if (effect.kind === "nearestRailroad") destinations.set(playerId, railroadPositions(next.boardSize).find(p => p > position) ?? railroadPositions(next.boardSize)[0]!);
      }
      add("card", text, 2900, { playerId, deck: entry?.deck }); continue;
    }
    if (event.text.includes(" went to Jail (") && player) {
      add("jail", event.text, 1900, { playerId, tileId: next.boardSize / 4, route: [next.boardSize / 4] });
      positions.set(player.id, next.boardSize / 4); continue;
    }
    if (event.text.includes("left Jail") || event.text.includes("leave Jail") || event.text.includes("used a Get Out of Jail")) {
      add("release", event.text, 1400, { playerId }); continue;
    }
    if (event.text.includes(" bid ₹") || event.text.includes("passed the auction")) {
      add("bid", event.text, 500, { playerId, tileId: next.auction?.propertyId ?? previous.auction?.propertyId }); continue;
    }
    if (event.text.includes(" bought ") || (previous.auction && event.text.includes(" won "))) {
      const tileId = previous.pendingPurchase?.propertyId ?? previous.auction?.propertyId;
      add(previous.auction ? "sold" : "purchase", event.text, 1800, { playerId, tileId }); continue;
    }
    if (event.text.includes("improved ") || event.text.includes("sold one improvement")) {
      add("build", event.text, 1300, { playerId, tileId: board.find(t => previous.properties[t.position]?.houses !== next.properties[t.position]?.houses)?.position }); continue;
    }
    if (event.text.includes("mortgaged ")) {
      add("mortgage", event.text, 1400, { playerId, tileId: board.find(t => previous.properties[t.position]?.mortgaged !== next.properties[t.position]?.mortgaged)?.position }); continue;
    }
    if (event.text.includes("accepted the trade") || event.text.includes("declined the trade")) { add("trade", event.text, 1500, { playerId }); continue; }
    if (event.text.includes("bankrupt")) { add("bankrupt", event.text, 2200, { playerId }); continue; }
    if (event.kind === "money") {
      const amount = event.amount ?? Number(event.text.match(/[₹$](\d+)/)?.[1] ?? 0);
      const recipient = next.players.find(p => event.text.includes(` to ${p.name} `) || event.text.endsWith(` to ${p.name}.`));
      add("money", event.text, 1500, { playerId, amount, recipientId: event.recipientId ?? recipient?.id, tileId: player ? positions.get(player.id) : undefined });
    }
  }
  if (next.winnerId && next.winnerId !== previous.winnerId) add("winner", `${next.players.find(p => p.id === next.winnerId)?.name ?? "Player"} wins the city!`, 2800, { playerId: next.winnerId });
  else if (previous.activePlayerId !== next.activePlayerId && next.activePlayerId) {
    const current = next.players.find(p => p.id === next.activePlayerId);
    add("turn", `${current?.name ?? "Player"}’s turn`, 1150, { playerId: current?.id });
  }
  return frames;
}

export const shouldSendMove = (game: GameState, localId: string, presenting: boolean) =>
  !presenting && game.phase === "awaitingMove" && game.pendingRoll?.playerId === localId;
