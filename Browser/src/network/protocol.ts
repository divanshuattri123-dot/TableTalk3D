import type { GameAction, GameState } from "../engine/types";

export type ClientMessage = { type: "action"; action: GameAction; id?: string } | { type: "sync" };
export type ServerMessage = { type: "state"; state: GameState; ackId?: string }
  | { type: "error"; message: string; id?: string; retryable?: boolean };
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";
