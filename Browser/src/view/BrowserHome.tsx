import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useViewSettings } from "../assets";
import type { ViewSettings } from "../assets";
import { CITIES } from "../engine/cities";
import type { CityId } from "../engine/cities";
import { worldInfo } from "../engine/worlds";
import type { WorldId } from "../engine/worlds";
import { GROUP_COLORS } from "./palette";
import { usePublisher } from "../publisher/PublisherShell";

const DEED_STRIP_COLORS = [
  GROUP_COLORS.brown,
  GROUP_COLORS.lightBlue,
  GROUP_COLORS.pink,
  GROUP_COLORS.orange,
  GROUP_COLORS.red,
  GROUP_COLORS.yellow,
  GROUP_COLORS.green,
  GROUP_COLORS.darkBlue
];

function displayAssetName(label: string) {
  const trimmed = label.trim();
  return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : label;
}

export interface BrowserHomeProps {
  name: string;
  color: string;
  roomCode: string;
  inviteCode?: string;
  onName: (name: string) => void;
  onRoomCode: (code: string) => void;
  colorPicker: ReactNode;
  joinReady: boolean;
  roomStatus?: string;
  roomStatusTone?: "ready" | "warn" | "neutral";
  error?: ReactNode;
  resumeCode?: string;
  onResume?: () => void;
  onCreate: () => void;
  onJoin: () => void;
  world: WorldId;
  city: CityId;
  tokenLabel: string;
  diceLabel: string;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onOpenMaps: () => void;
  onOpenStudio: (category: "token" | "dice") => void;
}

export default function BrowserHome({
  name,
  color,
  roomCode,
  inviteCode,
  onName,
  onRoomCode,
  colorPicker,
  joinReady,
  roomStatus,
  roomStatusTone = "neutral",
  error,
  resumeCode,
  onResume,
  onCreate,
  onJoin,
  world,
  city,
  tokenLabel,
  diceLabel,
  menuOpen,
  onOpenMenu,
  onOpenMaps,
  onOpenStudio
}: BrowserHomeProps) {
  const base = import.meta.env.BASE_URL;
  const cityEntry = CITIES.find(entry => entry.id === city) ?? CITIES[0];
  const worldEntry = worldInfo(world);
  const formattedToken = displayAssetName(tokenLabel);
  const formattedDice = displayAssetName(diceLabel);
  const trimmedName = name.trim();
  const hasInvite = Boolean(inviteCode && roomCode === inviteCode);
  const effectiveStatus = roomStatus
    ? (!trimmedName && joinReady ? `${roomStatus} Enter your name above to join.` : roomStatus)
    : undefined;

  return (
    <main className="browser-home" style={{ "--seat-color": color } as CSSProperties}>
      <div className="bh-panorama-shell">
        <div className="bh-city-stage">
          <picture className="bh-city-picture">
            <source media="(max-width: 900px)" srcSet={`${base}art/browser-home-city-960.webp`} type="image/webp" />
            <img
              className="bh-city-img"
              src={`${base}art/browser-home-city.webp`}
              alt="TableTalk3D 3D city board with skyscrapers, avenues, and coloured property spaces"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <div className="bh-city-scrim" aria-hidden="true" />

          <header className="bh-topbar">
            <div className="bh-brand-block">
              <h1 className="bh-title">
                TABLE TALK <span className="bh-title-badge">3D</span>
              </h1>
              <p className="bh-subtitle">2–6 players · Live 3D property trading</p>
            </div>
            <nav className="bh-top-actions" aria-label="Table setup and menu">
              <button
                type="button"
                className="bh-top-btn bh-map-pill"
                onClick={onOpenMaps}
                aria-label={`Map: ${cityEntry.name}, ${worldEntry.name}. Choose map`}
              >
                <span className="bh-map-dot" aria-hidden="true">◇</span>
                <span className="bh-map-full">{cityEntry.name} · {worldEntry.name}</span>
                <span className="bh-map-compact">Maps</span>
              </button>
              <button
                type="button"
                className="bh-top-btn bh-menu-btn"
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                onClick={onOpenMenu}
              >
                <span aria-hidden="true">☰</span>
                <span>Menu</span>
              </button>
            </nav>
          </header>
        </div>

        <section className="bh-seat-mat" aria-labelledby="bh-seat-heading">
          <div className="bh-deed-crown" aria-hidden="true">
            {DEED_STRIP_COLORS.map(swatch => (
              <span key={swatch} style={{ background: swatch }} />
            ))}
          </div>

          <div className="bh-seat-inner">
            <div className="bh-seat-header">
              <div>
                <span className="bh-deed-kicker">PLAYER DEED · SEAT CARD</span>
                <h2 id="bh-seat-heading" className="bh-seat-heading">YOUR PLACE AT THE TABLE</h2>
              </div>
              <span className="bh-token-coaster" aria-hidden="true">
                <i style={{ background: color }} />
                <img src={`${base}art/menu-car.webp`} alt="" />
              </span>
            </div>

            {resumeCode && onResume && (
              <div className="bh-return-ticket">
                <div className="bh-return-copy">
                  <span className="bh-return-kicker">SAVED SEAT</span>
                  <strong className="bh-tabular">{resumeCode}</strong>
                </div>
                <button type="button" className="bh-return-btn" onClick={onResume}>
                  Return to {resumeCode} <span aria-hidden="true">↗</span>
                </button>
              </div>
            )}

            <div className="bh-identity-group">
              <label className="bh-field-label" htmlFor="player-name">Your table name</label>
              <input
                id="player-name"
                className="bh-text-input"
                value={name}
                maxLength={24}
                onChange={event => onName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!trimmedName) return;
                    if (roomCode.length === 4 && joinReady) onJoin();
                    else if (!roomCode) onCreate();
                  }
                }}
                placeholder="Enter a nickname"
                autoComplete="nickname"
              />

              <div className="bh-color-row">
                {colorPicker}
              </div>

              <div className="bh-kit-row" role="group" aria-label="Piece and dice">
                <button
                  type="button"
                  className="bh-kit-btn"
                  onClick={() => onOpenStudio("token")}
                  aria-label={`Token: ${formattedToken}. Change token`}
                >
                  <span className="bh-kit-swatch" style={{ background: color }} aria-hidden="true" />
                  <span className="bh-kit-text">
                    <small>Piece</small>
                    <b>{formattedToken}</b>
                  </span>
                </button>
                <button
                  type="button"
                  className="bh-kit-btn"
                  onClick={() => onOpenStudio("dice")}
                  aria-label={`Dice: ${formattedDice}. Change dice`}
                >
                  <span className="bh-kit-icon" aria-hidden="true">⚄</span>
                  <span className="bh-kit-text">
                    <small>Dice</small>
                    <b>{formattedDice}</b>
                  </span>
                </button>
              </div>
            </div>

            <div className="bh-actions-stack">
              <button
                type="button"
                className="bh-create-btn"
                disabled={!trimmedName}
                onClick={onCreate}
              >
                <span>Create a table</span>
                <span aria-hidden="true">→</span>
              </button>

              <form
                className={`bh-join-box${hasInvite ? " is-invite" : ""}`}
                onSubmit={event => {
                  event.preventDefault();
                  if (trimmedName && joinReady) onJoin();
                }}
              >
                <div className="bh-join-head">
                  <label className="bh-field-label" htmlFor="room-code">Join with a code</label>
                  {hasInvite && <span className="bh-invite-badge">Invite prefilled</span>}
                </div>
                <div className="bh-join-controls">
                  <input
                    id="room-code"
                    className="bh-text-input bh-code-input bh-tabular"
                    value={roomCode}
                    maxLength={4}
                    onChange={event => onRoomCode(event.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                    placeholder="ABCD"
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="characters"
                    aria-describedby={effectiveStatus ? "bh-room-status" : undefined}
                  />
                  <button
                    type="submit"
                    className="bh-join-btn"
                    disabled={!trimmedName || !joinReady}
                  >
                    Join
                  </button>
                </div>
                {effectiveStatus && (
                  <p id="bh-room-status" className={`bh-room-status tone-${roomStatusTone}`} role="status" aria-live="polite">
                    {effectiveStatus}
                  </p>
                )}
              </form>
            </div>

            {error && <p className="bh-inline-error" role="status">{error}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

export interface BrowserMenuDialogProps {
  world: WorldId;
  city: CityId;
  tokenLabel: string;
  diceLabel: string;
  onClose: () => void;
  onSwitchDialog?: () => void;
  onOpenMaps: () => void;
  onOpenStudio: (category: "token" | "dice") => void;
}

export function BrowserMenuDialog(props: BrowserMenuDialogProps) {
  const { settings, update } = useViewSettings();
  return <BrowserMenuPanel {...props} settings={settings} onUpdate={update} />;
}

export function BrowserMenuPanel({
  settings,
  onUpdate,
  world,
  city,
  tokenLabel,
  diceLabel,
  onClose,
  onSwitchDialog = onClose,
  onOpenMaps,
  onOpenStudio
}: BrowserMenuDialogProps & {
  settings: ViewSettings;
  onUpdate: (patch: Partial<ViewSettings>) => void;
}) {
  const publisher = usePublisher();
  const dialogRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const cityEntry = CITIES.find(entry => entry.id === city) ?? CITIES[0];
  const worldEntry = worldInfo(world);
  const guestLabel = publisher.guest?.name?.trim() || "Local nickname";

  useEffect(() => { closeBtnRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="browser-menu-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="browser-menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="browser-menu-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="bh-deed-crown" aria-hidden="true">
          {DEED_STRIP_COLORS.map(swatch => (
            <span key={swatch} style={{ background: swatch }} />
          ))}
        </div>

        <div className="browser-menu-body">
          <header className="browser-menu-header">
            <h2 id="browser-menu-title">TABLE MENU</h2>
            <button
              ref={closeBtnRef}
              type="button"
              className="browser-menu-close"
              aria-label="Close table menu"
              onClick={onClose}
            >
              ×
            </button>
          </header>

          <fieldset className="browser-menu-settings">
            <legend>Display &amp; audio</legend>
            <label>
              <span>Board view</span>
              <select
                value={settings.view}
                onChange={event => onUpdate({ view: event.target.value as ViewSettings["view"] })}
              >
                <option value="3d">3D city</option>
                <option value="2d">2D board</option>
              </select>
            </label>
            <label>
              <span>Graphics</span>
              <select
                value={settings.quality}
                onChange={event => onUpdate({ quality: event.target.value as ViewSettings["quality"] })}
              >
                <option value="auto">Automatic</option>
                <option value="low">Battery saver</option>
                <option value="high">High detail</option>
              </select>
            </label>
            <label className="browser-menu-check">
              <input
                type="checkbox"
                checked={settings.sound}
                onChange={event => onUpdate({ sound: event.target.checked })}
              />
              <span>Game sounds</span>
            </label>
            <label>
              <span>Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.volume}
                onChange={event => onUpdate({ volume: Number(event.target.value) })}
              />
            </label>
          </fieldset>

          <nav className="browser-menu-links" aria-label="Customization and account">
            <button type="button" onClick={onOpenMaps}>
              <span>Maps &amp; editions</span>
              <small>{cityEntry.name} · {worldEntry.name}</small>
            </button>
            <button type="button" onClick={() => onOpenStudio("token")}>
              <span>Change token</span>
              <small>{displayAssetName(tokenLabel)}</small>
            </button>
            <button type="button" onClick={() => onOpenStudio("dice")}>
              <span>Change dice</span>
              <small>{displayAssetName(diceLabel)}</small>
            </button>
            <button type="button" onClick={() => { publisher.openAccount(); onSwitchDialog(); }}>
              <span>Guest profile</span>
              <small>{guestLabel}</small>
            </button>
            <button type="button" onClick={() => { publisher.openStore(); onSwitchDialog(); }}>
              <span>Store</span>
              <small>Cosmetics preview</small>
            </button>
            <button type="button" onClick={() => { publisher.openPrivacy(); onSwitchDialog(); }}>
              <span>Privacy &amp; support</span>
              <small>Policy &amp; bug reports</small>
            </button>
          </nav>

          <p className="browser-menu-note">
            Your view and sound preferences apply only on this browser.
          </p>
        </div>
      </section>
    </div>
  );
}
