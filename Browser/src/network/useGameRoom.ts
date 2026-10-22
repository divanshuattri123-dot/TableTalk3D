import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import type { GameAction, GameState, PlayerInput } from "../engine/types";
import type { ConnectionState } from "./protocol";
import { RoomConnection } from "./roomConnection";
import { roomAddress } from "./address";

export interface Session { roomCode: string; player: PlayerInput }

export function useGameRoom(session: Session | undefined, previewRoomCode = "") {
  const roomCode = session?.roomCode ?? previewRoomCode;
  const linkRef = useRef<RoomConnection | null>(null);
  const [game, setGame] = useState<GameState>();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!roomCode) return;
    setGame(undefined); setError(undefined); setConnection("connecting");
    const socket = new PartySocket({ ...roomAddress(import.meta.env.VITE_PARTYKIT_HOST, window.location, import.meta.env.DEV), room: roomCode, party: "main",
      maxRetries: Infinity, minReconnectionDelay: 750, maxReconnectionDelay: 8_000,
      connectionTimeout: 10_000, maxEnqueuedMessages: 0 });
    const clientId = globalThis.crypto?.randomUUID?.() ?? `seat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const link = new RoomConnection(socket, { state: setGame, status: setConnection, error: setError }, session?.player, clientId);
    linkRef.current = link;
    const open = () => link.open(), close = () => link.disconnected(!navigator.onLine);
    const message = (event: MessageEvent) => link.receive(String(event.data));
    const resume = () => { if (document.visibilityState === "visible" && navigator.onLine) link.resume(); };
    const offline = () => link.disconnected(true);
    socket.addEventListener("open", open); socket.addEventListener("close", close);
    socket.addEventListener("message", message); socket.addEventListener("error", close);
    window.addEventListener("online", resume); window.addEventListener("offline", offline);
    window.addEventListener("pageshow", resume); document.addEventListener("visibilitychange", resume);
    const heartbeat = window.setInterval(() => { if (document.visibilityState === "visible") link.tick(); }, 5_000);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("online", resume); window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", resume);
      socket.removeEventListener("open", open); socket.removeEventListener("close", close);
      socket.removeEventListener("message", message); socket.removeEventListener("error", close);
      socket.close(1000, "Leaving game"); linkRef.current = null;
    };
  }, [session?.player.color, session?.player.id, session?.player.name, roomCode]);
  const sendAction = useCallback((action: GameAction) => linkRef.current?.sendAction(action) ?? false, []);
  const reconnect = useCallback(() => linkRef.current?.retry(), []);
  return { game: game?.roomCode === roomCode ? game : undefined, connection, error, sendAction, reconnect };
}
