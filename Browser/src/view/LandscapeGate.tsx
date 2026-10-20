import { useEffect, useState } from "react";
import { enterGameFullscreen, phoneNeedsLandscape } from "./fullscreen";

const needsRotation = () => phoneNeedsLandscape(window.innerWidth, window.innerHeight, window.matchMedia("(pointer: coarse)").matches);

export default function LandscapeGate({ onLeave }: { onLeave: () => void }) {
  const [portrait, setPortrait] = useState(needsRotation);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const update = () => setPortrait(needsRotation());
    const pointer = window.matchMedia("(pointer: coarse)");
    window.addEventListener("resize", update); window.addEventListener("orientationchange", update); pointer.addEventListener("change", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); pointer.removeEventListener("change", update); };
  }, []);
  if (!portrait) return null;
  return <section className="landscape-gate" role="dialog" aria-modal="true" aria-labelledby="rotate-title">
    <div className="rotate-phone" aria-hidden="true"><span>↻</span><i /></div>
    <p className="eyebrow">YOUR TABLE IS READY</p><h1 id="rotate-title">Turn your phone sideways</h1>
    <p>Play in horizontal full screen for a larger board, clearer prices and touch controls.</p>
    <button type="button" className="event-primary" onClick={async () => { const entered = await enterGameFullscreen(); setNotice(entered ? "If the screen has not rotated, turn your phone sideways. Check your phone’s rotation lock." : "This browser does not allow automatic full screen here. Turn your phone sideways; the game will still fill the browser."); }}>Enter landscape full screen</button>
    <p className="rotation-note" role="status">{notice || "If your browser cannot rotate automatically, rotate the phone yourself and turn off portrait lock."}</p>
    <button type="button" className="rotation-back" onClick={onLeave}>Back to the lobby</button>
  </section>;
}
