import { Server, routePartykitRequest } from "partyserver";
import type { Connection } from "partyserver";
import { createInitialState, reduceGame } from "../src/engine/reducer";
import type { GameAction, GameState } from "../src/engine/types";

type ClientMessage = { type: "action"; action: GameAction };
type ServerMessage = { type: "state"; state: GameState } | { type: "error"; message: string };

const asClientMessage = (raw: string): ClientMessage | undefined => {
  try {
    const parsed = JSON.parse(raw) as Partial<ClientMessage>;
    if (parsed.type !== "action" || !parsed.action || typeof parsed.action !== "object") {
      return undefined;
    }
    return parsed as ClientMessage;
  } catch {
    return undefined;
  }
};

interface Env { Main: DurableObjectNamespace<GameRoom>; ASSETS: Fetcher }

export class GameRoom extends Server<Env> {
  static options = { hibernate: false };
  state = createInitialState();

  onStart() {
    this.state = createInitialState(this.name.toUpperCase());
  }

  onConnect(connection: Connection) {
    this.send(connection, { type: "state", state: this.state });
  }

  onClose(connection: Connection) {
    // Complete the close handshake so a reload does not leave a half-open socket.
    connection.close(1000, "Leaving table");
  }

  onMessage(sender: Connection, message: string | ArrayBuffer) {
    if (typeof message !== "string") {
      this.send(sender, { type: "error", message: "Game actions must be JSON." });
      return;
    }
    const incoming = asClientMessage(message);
    if (!incoming) {
      this.send(sender, { type: "error", message: "That action could not be read." });
      return;
    }

    // The reducer is shared with the client, so it is the sole game-rule gate.
    // This room holds only the canonical in-memory state and fans it out.
    this.state = reduceGame(this.state, incoming.action);
    this.broadcast(JSON.stringify({ type: "state", state: this.state } satisfies ServerMessage));
  }

  private send(connection: Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const partyResponse = await routePartykitRequest(request, env);
    if (partyResponse) return partyResponse;

    const asset = await env.ASSETS.fetch(request);
    const path = new URL(request.url).pathname;
    const unityContentType = path.endsWith(".wasm.gz") ? "application/wasm"
      : path.endsWith(".framework.js.gz") ? "application/javascript"
      : path.endsWith(".data.gz") ? "application/gzip" : undefined;
    if (!unityContentType || asset.status !== 200 || asset.headers.get("Content-Type")?.includes("text/html")) return asset;

    // Unity's files are already gzip-compressed, so preserve those bytes and label them for the browser.
    const headers = new Headers(asset.headers);
    headers.set("Content-Encoding", "gzip");
    headers.set("Content-Type", unityContentType);
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers, encodeBody: "manual" });
  }
} satisfies ExportedHandler<Env>;
