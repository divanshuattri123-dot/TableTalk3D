import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/types";
import { presentationBusy, PresentationTimeline } from "./timeline";

export function usePresentation(game: GameState | undefined, externalMotion: boolean) {
  const timeline = useRef(new PresentationTimeline());
  const [view, setView] = useState(() => timeline.current.snapshot());
  const refresh = useCallback(() => setView(timeline.current.snapshot()), []);
  const complete = useCallback((id: string) => { timeline.current.complete(id, "animation"); refresh(); }, [refresh]);
  const acknowledgeCard = useCallback((id: string) => { timeline.current.complete(id, "reader"); refresh(); }, [refresh]);
  useEffect(() => {
    if (game) { timeline.current.receive(game); refresh(); }
  }, [game, refresh]);
  useEffect(() => {
    const visibility = () => { timeline.current.setVisible(document.visibilityState === "visible"); refresh(); };
    document.addEventListener("visibilitychange", visibility); visibility();
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [refresh]);
  useEffect(() => {
    const frame = view.frame;
    if (!frame || frame.kind === "card") return;
    // A lost WebGL callback must not strand a room. Normal progression uses Unity's actual completion.
    const timer = window.setTimeout(() => complete(frame.id), frame.duration + (externalMotion ? 8000 : 50));
    return () => window.clearTimeout(timer);
  }, [view.frame, externalMotion, complete]);
  return { ...view, busy: presentationBusy(game, view), shown: view.shown ?? game, target: view.target ?? game, complete, acknowledgeCard };
}
