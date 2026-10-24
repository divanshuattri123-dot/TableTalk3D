export type TablePanel = "settings" | "help" | "prices";

export default function GameMenu({ roomCode, copied, fullscreen, onPanel, onPlayers, onHistory, onCopy, onFullscreen, onLeave }: {
  roomCode: string; copied: boolean; fullscreen: boolean;
  onPanel: (panel: TablePanel) => void; onPlayers: () => void; onHistory: () => void;
  onCopy: () => void; onFullscreen: () => void; onLeave: () => void;
}) {
  return <div className="mobile-game-menu">
    <p className="menu-room">Room <strong>{roomCode}</strong><span>Your confirmed moves stay saved.</span></p>
    <div className="game-menu-actions">
      <button type="button" onClick={() => onPanel("settings")}>Settings</button>
      <button type="button" onClick={onPlayers}>Players &amp; deeds</button>
      <button type="button" onClick={() => onPanel("prices")}>Property guide</button>
      <button type="button" onClick={onHistory}>Game history</button>
      <button type="button" onClick={() => onPanel("help")}>Rules &amp; help</button>
      <button type="button" onClick={onFullscreen}>{fullscreen ? "Exit full screen" : "Enter full screen"}</button>
      <button type="button" onClick={onCopy}>{copied ? "Link copied" : "Copy room link"}</button>
      <button type="button" onClick={onLeave}>Back to lobby</button>
    </div>
  </div>;
}
