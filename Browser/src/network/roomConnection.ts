import type { GameAction, GameState, PlayerInput } from "../engine/types";
import type { ConnectionState, ServerMessage } from "./protocol";

interface Socket {
  readyState: number;
  send(data: string): unknown;
  reconnect(): void;
}
interface Callbacks {
  state(state: GameState): void;
  status(status: ConnectionState): void;
  error(message: string | undefined): void;
}

export class RoomConnection {
  private ready = false;
  private lastHeard: number;
  private lastPing = 0;
  private sequence = 0;
  private pending = new Map<string, { action: GameAction; sentAt: number }>();
  constructor(private socket: Socket, private callbacks: Callbacks, private player: PlayerInput | undefined,
    private clientId: string, private now = Date.now) { this.lastHeard = now(); }

  open() { this.ready = false; this.lastHeard = this.now(); this.callbacks.status("connecting"); }
  disconnected(offline = false) { this.ready = false; this.callbacks.status(offline ? "offline" : "reconnecting"); }
  receive(raw: string) {
    this.lastHeard = this.now();
    if (raw === "pong") return;
    let message: ServerMessage;
    try { message = JSON.parse(raw) as ServerMessage; }
    catch { this.callbacks.error("The room sent an unreadable response. Retrying the connection."); this.retry(); return; }
    if (message.type === "error") {
      this.callbacks.error(message.message);
      if (message.retryable) this.retry();
      else if (message.id) this.pending.delete(message.id);
      return;
    }
    if (message.type !== "state") return;
    if (message.ackId) this.pending.delete(message.ackId);
    this.callbacks.state(message.state);
    this.callbacks.error(undefined);
    if (!this.ready) {
      this.ready = true; this.callbacks.status("connected");
      if (this.player && !message.state.players.some(p => p.id === this.player!.id)) {
        this.pending.set(`${this.clientId}:join`, { action: { type: "JOIN", player: this.player }, sentAt: 0 });
      }
      this.flush();
    }
  }
  sendAction(action: GameAction): boolean {
    if (!this.ready || this.socket.readyState !== 1) {
      this.callbacks.error("Reconnecting to your saved table. Please wait before taking a turn.");
      return false;
    }
    this.pending.set(`${this.clientId}:${++this.sequence}`, { action, sentAt: 0 });
    this.flush();
    return true;
  }
  private flush() {
    if (!this.ready || this.socket.readyState !== 1) return;
    for (const [id, entry] of this.pending) {
      this.socket.send(JSON.stringify({ type: "action", action: entry.action, id }));
      entry.sentAt = this.now();
    }
  }
  retry() { this.disconnected(); this.socket.reconnect(); }
  resume() {
    if (this.socket.readyState !== 1 || this.now() - this.lastHeard > 30_000) this.retry();
    else this.socket.send(JSON.stringify({ type: "sync" }));
  }
  tick() {
    if (this.socket.readyState !== 1) return;
    if (this.now() - this.lastHeard > 45_000) { this.retry(); return; }
    if (this.now() - this.lastPing > 20_000) { this.socket.send("ping"); this.lastPing = this.now(); }
    // Resending the same receipt cannot charge rent or roll the dice twice.
    if (this.ready && [...this.pending.values()].some(p => this.now() - p.sentAt > 12_000)) this.flush();
  }
}
