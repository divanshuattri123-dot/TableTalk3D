export type TablePanel = "settings" | "help" | "prices" | "pieces" | "dice" | "music" | "leave";

export default function GameMenu({ roomCode, copied, fullscreen, showFullscreen = true, onPanel, onCopy, onFullscreen, onPrivacy }: {
  roomCode: string; copied: boolean; fullscreen: boolean; showFullscreen?: boolean;
  onPanel: (panel: TablePanel) => void;
  onCopy: () => void; onFullscreen: () => void; onPrivacy:()=>void;
}) {
  return <div className="mobile-game-menu">
    <p className="menu-room">Room <strong>{roomCode}</strong><span>Your confirmed moves stay saved.</span></p>
    <div className="game-menu-actions">
      <button type="button" onClick={() => onPanel("settings")}>Settings</button>
      <button type="button" onClick={() => onPanel("pieces")}>Select pieces</button>
      <button type="button" onClick={() => onPanel("help")}>Rules &amp; help</button>
      <button type="button" onClick={onPrivacy}>Privacy &amp; support</button>
      {showFullscreen && <button type="button" onClick={onFullscreen}>{fullscreen ? "Exit full screen" : "Enter full screen"}</button>}
      <button type="button" onClick={onCopy}>{copied ? "Link copied" : "Copy room link"}</button>
      <button type="button" onClick={() => onPanel("leave")}>Back to main menu</button>
    </div>
  </div>;
}
