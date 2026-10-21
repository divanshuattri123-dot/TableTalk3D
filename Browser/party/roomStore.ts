import { createInitialState, reduceGame } from "../src/engine/reducer";
import type { GameAction, GameState } from "../src/engine/types";

export const CHECKPOINT_KEY = "table-talk-checkpoint-v1";
interface Checkpoint { version: 1; state: GameState; receipts: string[] }
export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export class SavedRoom {
  private checkpoint: Checkpoint;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private storage: RoomStorage, roomCode: string) {
    this.checkpoint = { version: 1, state: createInitialState(roomCode), receipts: [] };
  }
  get state() { return this.checkpoint.state; }
  async load() {
    const saved = await this.storage.get<Checkpoint>(CHECKPOINT_KEY);
    if (saved) {
      // An incompatible save must fail visibly, never silently become a fresh lobby.
      if (saved.version !== 1 || saved.state.roomCode !== this.state.roomCode) throw new Error("Unsupported room save.");
      this.checkpoint = saved;
    }
  }
  apply(action: GameAction, id?: string): Promise<GameState> {
    const result = this.tail.then(async () => {
      if (id && this.checkpoint.receipts.includes(id)) return this.state;
      const state = reduceGame(this.state, action);
      if (state === this.state && !id) return state;
      const next: Checkpoint = { version: 1, state, receipts: id ? [...this.checkpoint.receipts, id].slice(-512) : this.checkpoint.receipts };
      // State and its receipt commit together before anyone sees the move as confirmed.
      await this.storage.put(CHECKPOINT_KEY, next);
      this.checkpoint = next;
      return state;
    });
    // Serialize even in tests/non-DO hosts; a failed save must not poison later retries.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
