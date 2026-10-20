import { useCallback, useEffect, useRef } from "react";
import { assetUrl, useAssets } from "../assets";
import type { ViewSettings } from "../assets";
import type { GameState } from "../engine/types";

export function useGameAudio(game: GameState | undefined, settings: ViewSettings) {
  const { catalog, byId } = useAssets();
  const music = useRef<HTMLAudioElement | null>(null);
  const sounds = useRef<HTMLAudioElement[]>([]);
  const lastEvent = useRef(0);
  const unlocked = useRef(false);
  useEffect(() => {
    const unlock = () => { unlocked.current = true; if (music.current) void music.current.play().catch(() => {}); };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  const play = useCallback((key: string) => {
    const asset = byId.get(catalog?.featured.sounds[key] ?? "");
    if (!asset || !settings.sound || !unlocked.current || document.hidden) return;
    const audio = new Audio(assetUrl(asset.src)); audio.volume = settings.volume;
    sounds.current = sounds.current.filter((sound) => !sound.paused);
    if (sounds.current.length >= 3) sounds.current.shift()?.pause();
    sounds.current.push(audio); void audio.play().catch(() => {});
  }, [catalog, byId, settings.sound, settings.volume]);
  useEffect(() => {
    const asset = byId.get(settings.musicId ?? "");
    if (!asset) return;
    const audio = new Audio(assetUrl(asset.src)); audio.loop = true; audio.volume = settings.volume * .4;
    music.current = audio;
    if (unlocked.current) void audio.play().catch(() => {});
    return () => { audio.pause(); music.current = null; };
  }, [settings.musicId, byId]);
  useEffect(() => { if (music.current) music.current.volume = settings.volume * .4; }, [settings.volume]);
  useEffect(() => {
    const event = game?.eventLog[0];
    if (!event || event.id === lastEvent.current) return;
    const initial = lastEvent.current === 0; lastEvent.current = event.id;
    if (initial) return;
    const text = event.text.toLowerCase();
    if (game?.phase === "gameOver") play("winner");
    else if (text.includes("rolled")) play("roll");
    else if (text.includes("bought") || text.includes("won") && !text.includes("wins")) play("buy");
    else if (text.includes("accepted the trade")) play("accept");
    else if (text.includes("offered a trade")) play("trade");
    else if (text.includes("bid ₹")) play("auction");
    else if (text.includes("went to jail")) play("jail");
    else if (text.includes("collected") || text.includes("received")) play("income");
  }, [game?.eventLog, play]);
  useEffect(() => () => { music.current?.pause(); sounds.current.forEach((audio) => audio.pause()); }, []);
  return play;
}
