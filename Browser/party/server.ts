import { Server, routePartykitRequest } from "partyserver";
import type { Connection } from "partyserver";
import type { ClientMessage, ServerMessage } from "../src/network/protocol";
import { SavedRoom } from "./roomStore";
import {serveUnityChunks} from './chunkedAssets';
import {hasBotDecision,chooseBotAction,botThinkDelay} from './botRunner';
import {randomIndex} from '../src/network/random';
import type {GameState} from '../src/engine/types';

const asClientMessage = (raw: string): ClientMessage | undefined => {
  try {
    const parsed = JSON.parse(raw) as Partial<ClientMessage>;
    if (parsed.type === "sync") return { type: "sync" };
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
  static options = { hibernate: true };
  private room!: SavedRoom;

  async onStart() {
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.room = new SavedRoom(this.ctx.storage, this.name.toUpperCase());
    await this.room.load();
  }

  async onConnect(connection: Connection) {
    this.send(connection, { type: "state", state: this.room.state });
    await this.scheduleBot();
  }

  onClose(connection: Connection) {
    // Complete the close handshake so a reload does not leave a half-open socket.
    connection.close(1000, "Leaving table");
  }

  private async scheduleBot(previous?:GameState){
    if(!this.room.state.players.some(player=>player.bot))return;
    const connected=[...this.getConnections()].some(connection=>connection.readyState===1);
    if(!connected||!hasBotDecision(this.room.state)){await this.ctx.storage.deleteAlarm();return;}
    if(await this.ctx.storage.getAlarm()===null)
      await this.ctx.storage.setAlarm(Date.now()+botThinkDelay(previous,this.room.state,randomIndex(600)));
  }

  async onAlarm(){
    if(![...this.getConnections()].some(connection=>connection.readyState===1))return;
    const previous=this.room.state;
    const state=await this.room.apply(chooseBotAction);
    if(state!==previous)this.broadcast(JSON.stringify({type:'state',state} satisfies ServerMessage));
    if(state.notice){console.error('AI decision rejected',state.notice);return;}
    await this.scheduleBot(previous);
  }

  async onMessage(sender: Connection, message: string | ArrayBuffer) {
    if (message === "ping") { sender.send("pong"); return; }
    if (typeof message !== "string") {
      this.send(sender, { type: "error", message: "Game actions must be JSON." });
      return;
    }
    const incoming = asClientMessage(message);
    if (!incoming) {
      this.send(sender, { type: "error", message: "That action could not be read." });
      return;
    }

    if (incoming.type === "sync") { this.send(sender, { type: "state", state: this.room.state }); return; }
    try {
      const previous=this.room.state;
      const state = await this.room.apply(incoming.action, incoming.id);
      this.broadcast(JSON.stringify({ type: "state", state, ackId: incoming.id } satisfies ServerMessage));
      await this.scheduleBot(previous);
    } catch (error) {
      console.error("Room checkpoint failed", error);
      this.send(sender, { type: "error", message: "Could not save this move yet. Reconnecting to retry safely.", id: incoming.id, retryable: true });
    }
  }

  private send(connection: Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const partyResponse = await routePartykitRequest(request, env);
    if (partyResponse) return partyResponse;

    const path = new URL(request.url).pathname;
    if(path.endsWith('.data.gz')){const chunked=await serveUnityChunks(request,env.ASSETS);if(chunked)return chunked;}
    const asset = await env.ASSETS.fetch(request);
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
