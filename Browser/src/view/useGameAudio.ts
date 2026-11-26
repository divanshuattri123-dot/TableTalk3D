import { useCallback, useEffect, useRef } from "react";
import { assetUrl, useAssets } from "../assets";
import type { ViewSettings } from "../assets";
import type { GameEvent, GameState } from "../engine/types";
import {GameAudio} from './gameAudio';

const SOUND_MATCHERS: ReadonlyArray<readonly [string, (text: string) => boolean]> = [
  ["jail", (text) => text.includes("went to jail")],
  ["buy", (text) => text.includes("bought") || (text.includes("won") && !text.includes("wins"))],
  ["accept", (text) => text.includes("accepted the trade")],
  ["trade", (text) => text.includes("offered a trade")],
  ["auction", (text) => text.includes("bid ₹")],
  ["roll", (text) => text.includes("rolled")],
  ["income", (text) => text.includes("collected") || text.includes("received")]
];

export function soundForEvents(events: readonly GameEvent[], phase?: GameState["phase"]): string | undefined {
  if (!events.length) return undefined;
  if (phase === "gameOver") return "winner";
  const texts = events.map((event) => event.text.toLowerCase());
  for (const [key, matches] of SOUND_MATCHERS) {
    if (texts.some(matches)) return key;
  }
  return undefined;
}

export function useGameAudio(game: GameState | undefined, settings: ViewSettings) {
  const { catalog, byId } = useAssets();
  const controller=useRef<GameAudio | null>(null);
  if(!controller.current)controller.current=new GameAudio(src=>new Audio(src),!document.hidden);
  const audio=controller.current;
  const lastEvent = useRef(0);
  useEffect(() => {
    const unlock=()=>audio.unlock(),visibility=()=>audio.setVisible(!document.hidden);
    window.addEventListener("pointerdown",unlock);document.addEventListener("visibilitychange",visibility);
    visibility();
    return()=>{window.removeEventListener("pointerdown",unlock);document.removeEventListener("visibilitychange",visibility);audio.dispose();};
  }, [audio]);
  const music=byId.get(settings.musicId??'');
  useEffect(()=>audio.configure({enabled:settings.sound,volume:settings.volume,music:music?assetUrl(music.src):undefined}),[audio,settings.sound,settings.volume,music?.src]);
  const play = useCallback((key: string) => {
    const asset = byId.get(catalog?.featured.sounds[key] ?? "");
    if(asset)audio.play(assetUrl(asset.src));
  }, [audio,catalog,byId]);
  useEffect(() => {
    const newest = game?.eventLog[0];
    if (!newest || newest.id === lastEvent.current) return;
    const prevId = lastEvent.current;
    lastEvent.current = newest.id;
    if (prevId === 0 || newest.id < prevId) return;
    const fresh = game.eventLog.filter((entry) => entry.id > prevId);
    const key = soundForEvents(fresh, game.phase);
    if (key) play(key);
  }, [game?.eventLog, game?.phase, play]);
  return play;
}
