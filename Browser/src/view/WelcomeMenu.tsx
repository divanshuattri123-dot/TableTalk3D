import { useEffect } from "react";
import { useViewSettings } from "../assets";
import type { ViewSettings } from "../assets";

type MenuActions = { onCustomize: (category: "token" | "dice") => void; onClose: () => void };

export default function WelcomeMenu(actions: MenuActions) {
  const { settings, update } = useViewSettings();
  return <WelcomeMenuPanel {...actions} settings={settings} onUpdate={update} />;
}

export function WelcomeMenuPanel({ settings, onUpdate, onCustomize, onClose }: MenuActions & {
  settings: ViewSettings; onUpdate: (patch: Partial<ViewSettings>) => void;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return <div className="welcome-menu-backdrop" onClick={onClose}>
    <section className="welcome-menu" role="dialog" aria-modal="true" aria-labelledby="welcome-menu-title" onClick={event => event.stopPropagation()}>
      <header><h2 id="welcome-menu-title">Game menu</h2><button type="button" autoFocus aria-label="Close game menu" onClick={onClose}>×</button></header>
      <fieldset className="welcome-menu-settings"><legend>Settings</legend>
        <label>Board view<select value={settings.view} onChange={event => onUpdate({ view: event.target.value as ViewSettings["view"] })}><option value="3d">3D city</option><option value="2d">2D board</option></select></label>
        <label>Graphics<select value={settings.quality} onChange={event => onUpdate({ quality: event.target.value as ViewSettings["quality"] })}><option value="auto">Automatic</option><option value="low">Battery saver</option><option value="high">High detail</option></select></label>
        <label className="welcome-sound-setting"><input type="checkbox" checked={settings.sound} onChange={event => onUpdate({ sound: event.target.checked })} />Game sounds</label>
        <label>Volume<input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={event => onUpdate({ volume: Number(event.target.value) })} /></label>
      </fieldset>
      <div className="welcome-menu-appearance"><button type="button" onClick={() => onCustomize("token")}>Change token</button><button type="button" onClick={() => onCustomize("dice")}>Change dice</button></div>
      <p>Your settings apply when you enter a table. They do not change anyone else’s view.</p>
    </section>
  </div>;
}
