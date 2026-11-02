import { useCallback, useEffect, useRef } from "react";
import { assetUrl, useAssets } from "../assets";
import type { ViewSettings } from "../assets";
import type { GameState } from "../engine/types";
import {GameAudio} from './gameAudio';

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
  return play;
}
