import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/types";
import { planPresentation } from "./plan";
import type { PresentationFrame } from "./plan";

interface Batch { target: GameState; frames: PresentationFrame[] }
export function usePresentation(game: GameState | undefined, externalMotion: boolean) {
  const planned = useRef<GameState | undefined>(undefined), queue = useRef<Batch[]>([]), playing = useRef<Batch | undefined>(undefined);
  const active = useRef<PresentationFrame | undefined>(undefined);
  const [shown, setShown] = useState<GameState>();
  const [frame, setFrame] = useState<PresentationFrame>();
  const [target, setTarget] = useState<GameState>();
  const advance = useCallback(() => {
    while (true) {
      if (!playing.current) playing.current = queue.current.shift();
      const batch = playing.current;
      if (!batch) { active.current = undefined; setFrame(undefined); return; }
      const next = batch.frames.shift();
      if (next) { active.current = next; setTarget(batch.target); setFrame(next); return; }
      setShown(batch.target); playing.current = undefined;
    }
  }, []);
  const complete = useCallback((id: string) => { if (active.current?.id === id) advance(); }, [advance]);
  useEffect(() => {
    if (!game) return;
    const previous = planned.current;
    if (previous && game.roomCode === previous.roomCode && game.nextEventId < previous.nextEventId) return;
    planned.current = game;
    if (!previous || previous.roomCode !== game.roomCode || previous.boardSize !== game.boardSize) {
      queue.current = []; playing.current = undefined; active.current = undefined;
      setShown(game); setTarget(game); setFrame(undefined); return;
    }
    const frames = planPresentation(previous, game);
    queue.current.push({ target: game, frames });
    if (!active.current) advance();
  }, [game, advance]);
  useEffect(() => {
    if (!frame) return;
    // A lost WebGL callback must not strand a room. Normal progression uses Unity's actual completion.
    const timer = window.setTimeout(() => complete(frame.id), frame.duration + (externalMotion ? 8000 : 50));
    return () => window.clearTimeout(timer);
  }, [frame, externalMotion, complete]);
  return { shown: shown ?? game, target: target ?? game, frame, busy: Boolean(frame) || Boolean(game && shown && game.nextEventId !== shown.nextEventId), complete };
}
