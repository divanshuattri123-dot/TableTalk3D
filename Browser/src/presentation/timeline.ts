import type { GameState } from "../engine/types";
import { canCompleteFrame, planPresentation } from "./plan";
import type { PresentationFrame } from "./plan";

interface Batch { target: GameState; frames: PresentationFrame[] }
const restoredCard = (game: GameState): PresentationFrame | undefined => {
  const card = game.card;
  if (!card || card.playerId !== game.activePlayerId || !["awaitingBuy", "awaitingEndTurn", "awaitingDebt", "awaitingTradeResponse", "awaitingAuction", "awaitingUtilityRoll", "awaitingMortgageDecision"].includes(game.phase)) return;
  const event = game.eventLog.find(entry => entry.kind === "card" && entry.deck === card.deck && entry.cardIndex === card.index && entry.playerId === card.playerId);
  // A reload restores the explanation only; the reducer has already applied its effect exactly once.
  return { id: `${game.roomCode}:restored-card:${event?.id ?? game.nextEventId}`, kind: "card", duration: 0, text: card.text, deck: card.deck, playerId: card.playerId };
};
export class PresentationTimeline {
  private planned?: GameState;
  private queue: Batch[] = [];
  private playing?: Batch;
  private frame?: PresentationFrame;
  private shown?: GameState;
  private target?: GameState;
  private visible = true;
  private syncVersion = 0;
  snapshot() { return { shown: this.shown, target: this.target, frame: this.frame, syncVersion: this.syncVersion, visible: this.visible,
    plannedEventId: this.planned?.nextEventId, plannedRoom: this.planned?.roomCode,
    busy: Boolean(this.frame) || Boolean(this.planned && this.shown && this.planned.nextEventId !== this.shown.nextEventId) }; }
  private unreadCard() {
    return [this.frame, ...(this.playing?.frames ?? []), ...this.queue.flatMap(batch => batch.frames)].filter(frame => frame?.kind === "card").at(-1);
  }
  private reset(game: GameState, card?: PresentationFrame) {
    this.queue = []; this.playing = undefined; this.frame = card;
    this.shown = game; this.target = game; this.syncVersion++;
  }
  receive(game: GameState) {
    const previous = this.planned;
    if (previous && game.roomCode === previous.roomCode && game.nextEventId < previous.nextEventId) return;
    this.planned = game;
    if (!previous || previous.roomCode !== game.roomCode || previous.boardSize !== game.boardSize) { this.reset(game, restoredCard(game)); return; }
    const frames = planPresentation(previous, game);
    const sameLiveBid = (frame: PresentationFrame) => frame.kind === "bid" && frame.tileId === game.auction?.propertyId;
    if (game.phase === "awaitingAuction" && this.frame && sameLiveBid(this.frame) && this.playing &&
      frames.length && frames.every(sameLiveBid) && this.playing.frames.every(sameLiveBid) &&
      this.queue.every(batch => batch.frames.every(sameLiveBid))) {
      // The journal preserves every bid; decorative hammer motion must not trail the live price.
      this.queue = []; this.playing = { target: game, frames: [] };
      this.frame = frames.at(-1); this.target = game; return;
    }
    const buffered = this.queue.reduce((n, batch) => n + batch.frames.length, this.playing?.frames.length ?? 0);
    // Unseen history is not a new live move; resume the saved table, not minutes of old animations.
    if (!this.visible || game.nextEventId - previous.nextEventId > 60 || buffered > 48) {
      this.reset(game, frames.filter(frame => frame.kind === "card").at(-1) ?? this.unreadCard()); return;
    }
    const batch = { target: game, frames };
    if (!batch.frames.length && this.queue.length && !this.queue[this.queue.length - 1]!.frames.length) this.queue[this.queue.length - 1] = batch;
    else this.queue.push(batch);
    if (!this.frame) this.advance();
  }
  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    if (this.planned) this.reset(this.planned, this.unreadCard());
  }
  complete(id: string, source: "animation" | "reader") {
    if (canCompleteFrame(this.frame, id, source)) this.advance();
  }
  private advance() {
    while (true) {
      if (!this.playing) this.playing = this.queue.shift();
      if (!this.playing) { this.frame = undefined; return; }
      const frame = this.playing.frames.shift();
      if (frame) { this.frame = frame; this.target = this.playing.target; return; }
      this.shown = this.playing.target; this.playing = undefined;
    }
  }
}

export const presentationBusy = (game: GameState | undefined, view: { busy: boolean; plannedEventId?: number; plannedRoom?: string }) =>
  view.busy || Boolean(game && (view.plannedEventId !== game.nextEventId || view.plannedRoom !== game.roomCode));

export const presentationInteractionBusy = (game: GameState, view: {
  busy: boolean; plannedEventId?: number; plannedRoom?: string; frame?: PresentationFrame;
}) => presentationBusy(game, view) && !(game.phase === "awaitingAuction" &&
  view.plannedEventId === game.nextEventId && view.plannedRoom === game.roomCode &&
  view.frame?.kind === "bid" && view.frame.tileId === game.auction?.propertyId);
