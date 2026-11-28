import { usesClassicRules } from "../engine/rules";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getBoard, getTile, isPurchasableTile, isStreetTile } from "../engine/board";
import type { GameAction, GameState } from "../engine/types";
import { formatRupees } from "../engine/currency";
import { permitPauseActive, rentReliefActive, RENT_RELIEF_PERCENT } from "../engine/mayor";
import { decisionPlayerId } from "../engine/reducer";
import { useAssets, useViewSettings } from "../assets";
import type { GameAsset } from "../assets";
import type { AssetUse } from "./AssetStudio";
import { GROUP_COLORS } from "./palette";
import { useGameAudio } from "./useGameAudio";
import type { PresentationFrame } from "../presentation/plan";
import type { TablePanel } from "./GameMenu";

const ThreeBoard = lazy(() => import("./ThreeBoard"));
const UnityBoard = lazy(() => import("./UnityBoard"));
const AssetStudio = lazy(() => import("./AssetStudio"));
const money = formatRupees;

export default function BoardStage({ game, shown, target, frame, syncVersion, onComplete, onReady, onPlayable, localId, sendAction, render2D, panel, onPanelChange, onLeave, diceEnabled, onThrow, onWheel }: {
  game: GameState; localId: string; sendAction: (action: GameAction) => void;
  shown: GameState; target: GameState; frame?: PresentationFrame; syncVersion: number; onComplete: (id: string) => void; onReady: (ready: boolean) => void;
  onPlayable: (ready: boolean) => void;
  render2D: (onSelect: (position: number) => void) => ReactNode;
  panel?: TablePanel; onPanelChange: (panel: TablePanel | undefined) => void; onLeave: () => void;
  diceEnabled:boolean; onThrow:()=>void; onWheel?: () => void;
}) {
  const { settings, update } = useViewSettings();
  const { error, reload } = useAssets();
  const studio = panel === "pieces" ? "token" : panel === "dice" || panel === "music" ? panel : undefined;
  const [rendererAttempt,setRendererAttempt]=useState(0);
  const preferences = panel === "settings", help = panel === "help", prices = panel === "prices";
  const setPreferences = (open: boolean) => onPanelChange(open ? "settings" : undefined);
  const closeHelp = () => onPanelChange(undefined);
  const setPrices = (open: boolean) => onPanelChange(open ? "prices" : undefined);
  const [tile, setTile] = useState<number>();
  const local = game.players.find((player) => player.id === localId);
  const current = game.players.find((player) => player.id === decisionPlayerId(game));
  const location = getTile(game.pendingPurchase?.propertyId ?? current?.position ?? 0, game.boardSize, game.city);
  const locationOwner = game.players.find((player) => player.id === game.properties[location.position]?.ownerId);
  const instruction = game.phase === "awaitingDebt" ? "Settle the negative balance before play continues" : game.phase === "awaitingUtilityRoll" ? "Roll fresh dice for utility rent · no movement" : game.phase === "awaitingMortgageDecision" ? (game.rulesEdition === "hasbro-2025" ? "Keep or redeem received mortgages" : "Choose interest or redemption for received mortgages") : game.phase === "lobby" ? "Invite your friends, then start" : game.phase === "awaitingRoll" ? "Roll the dice" : game.phase === "awaitingBuy" ? "Buy this property or auction it" : game.phase === "awaitingAuction" ? "Open auction · bid or pass" : game.phase === "awaitingTradeResponse" ? "A trade is waiting for an answer" : game.phase === "awaitingMove" ? "Dice rolling…" : game.phase === "gameOver" ? "Game complete" : "Manage your deeds, then end your turn";
  useGameAudio(game, settings);
  const unityReady = useCallback((ready: boolean) => { onReady(ready); onPlayable(ready); }, [onReady, onPlayable]);
  useEffect(() => { const unity = settings.view === "3d" && settings.renderer === "unity"; if (!unity) onReady(false); onPlayable(!unity); }, [settings.view, settings.renderer, onReady, onPlayable]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setTile(undefined); onPanelChange(panel === "leave" ? "settings" : undefined); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onPanelChange, panel]);
  const choose = (asset: GameAsset, use: AssetUse) => {
    if (use === "token" || use === "dice") {
      if (local) sendAction({ type: "SET_APPEARANCE", playerId: local.id, [use === "token" ? "tokenId" : "diceId"]: asset.id });
    } else if (use === "city") update({ cityId: asset.id, renderer: "collection" });
    else if (use === "art") update({ tableArtId: asset.id });
    else update({ musicId: asset.id });
    onPanelChange(undefined);
  };
  return <section className="board-stage" aria-label="Interactive table">
    <div className="play-turn-banner" style={{ "--turn-color": current?.color ?? "#77c5a1" } as CSSProperties}><span className="play-turn-dot" /><div><b>{game.winnerId ? `${game.players.find(player => player.id === game.winnerId)?.name ?? "The last player"} wins!` : current ? `${current.name}${current.id === localId ? " (you)" : ""}${game.debts?.length ? " · debt settlement" : "’s turn"}` : `Room ${game.roomCode}`}</b><span>{current?.bot&&['awaitingRoll','awaitingBuy','awaitingEndTurn'].includes(game.phase)?'Considering the next move…':instruction}</span></div><strong>{game.boardSize}<small>SPACES</small></strong></div>
    <div className="table-toolbar" aria-label="Table tools">
      <button type="button" aria-expanded={preferences} onClick={() => setPreferences(!preferences)} aria-label="Game settings">⚙ <span>Settings</span></button>
    </div>
    {preferences && <div className="preferences-surface" onClick={() => setPreferences(false)}><section className="table-preferences" role="dialog" aria-label="Game settings" onClick={event => event.stopPropagation()}>
      <div className="preferences-title"><b>Your table</b><button type="button" autoFocus onClick={() => setPreferences(false)} aria-label="Close settings">×</button></div>
      <label>Board view<select value={settings.view} onChange={(event) => update({ view: event.target.value as "3d" | "2d" })}><option value="3d">3D city</option><option value="2d">2D board</option></select></label>
      <label>Scenery<select value={settings.renderer} onChange={(event) => update({ renderer: event.target.value as "unity" | "collection" })}><option value="unity">Cinematic city & park</option><option value="collection">Custom collection scenery</option></select></label>
      <label>Graphics<select value={settings.quality} onChange={(event) => update({ quality: event.target.value as typeof settings.quality })}><option value="auto">Automatic</option><option value="low">Battery saver</option><option value="high">High detail</option></select></label>
      <label>Lighting<select value={settings.theme} onChange={(event) => update({ theme: event.target.value as typeof settings.theme })}><option value="day">Daylight</option><option value="night">After dark</option></select></label>
      <label>Camera<select value={settings.camera} onChange={(event) => update({ camera: event.target.value as typeof settings.camera })}><option value="top">Play camera · readable</option><option value="perspective">Cinematic angle</option></select></label>
      <label className="check-setting"><input type="checkbox" checked={settings.sound} onChange={(event) => update({ sound: event.target.checked })} />Game sounds</label>
      <label>Volume<input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(event) => update({ volume: Number(event.target.value) })} /></label>
      <button type="button" onClick={() => onPanelChange("music")}>Choose music</button>
      <button className="mobile-preference-option" type="button" onClick={() => onPanelChange("dice")}>Change dice</button>
      {settings.musicId && <button type="button" onClick={() => update({ musicId: undefined })}>Stop music</button>}
      <button type="button" onClick={() => { update({ cityId: undefined, tableArtId: undefined, renderer: "unity", camera: "top" }); }}>Restore city scenery</button>
      <button type="button" onClick={() => setPrices(true)}>Property guide</button>
      <details className="settings-log">
        <summary>Event log</summary>
        <div className="event-log">
          {game.eventLog.length === 0 ? <p>No moves yet.</p> :
            <ol>{game.eventLog.slice(0, 10).map(event => <li className={event.kind} key={event.id}>{event.text}</li>)}</ol>}
        </div>
      </details>
      <button className="leave-match-button" type="button" onClick={() => onPanelChange("leave")}>Leave match</button>
    </section></div>}
    {error && <p className="asset-notice">{error} <button type="button" onClick={reload}>Retry collection</button></p>}
    {settings.view === "3d" ? <Suspense fallback={<div className="scene-loading"><span className="pulse-token" /><b>Building your 3D table…</b><small>The rules and room are ready.</small></div>}>
      {settings.renderer === "unity" ? <UnityBoard mode={game.mode} onWheel={onWheel} diceEnabled={diceEnabled&&tile===undefined&&!panel&&!studio} diceId={local?.diceId} onThrow={onThrow} key={rendererAttempt} game={shown} target={target} settings={settings} frame={frame} syncVersion={syncVersion} onSelect={setTile} onComplete={onComplete} onReady={unityReady} onLite3D={() => update({ renderer: "collection" })} onFallback={() => update({ view: "2d" })} onRetry={()=>setRendererAttempt(n=>n+1)} /> : <ThreeBoard mayorWheel={game.mode === "mayor"} onWheel={onWheel} game={shown} settings={settings} onSelect={setTile} onFallback={() => update({ view: "2d" })} />}
    </Suspense> : render2D(setTile)}
    <div className="landing-ribbon"><div><small>{game.phase === "lobby" ? "Tap any space to inspect it" : `${current?.name ?? "Player"} is at`}</small><b>{location.name}</b><span>{location.region && `${location.region} · `}{isPurchasableTile(location) ? `${money(location.price)} · ${locationOwner ? `Owned by ${locationOwner.name}` : "Unowned deed"}` : location.kind === "tax" ? `Pay ${money(location.amount)}` : location.kind === "go" ? "Collect ₹200 when passing GO" : instruction}</span></div><button type="button" onClick={() => setTile(location.position)}>Full details ↗</button></div>
    <div className="table-caption"><label className="tile-jump"><span className="sr-only">Inspect any board tile</span><select aria-label="Inspect any board tile" value="" onChange={(event) => { if (event.target.value) setTile(Number(event.target.value)); }}><option value="">Explore every property ↗</option>{getBoard(game.boardSize, game.city).map((entry) => <option value={entry.position} key={entry.position}>{entry.position + 1}. {entry.name}{entry.region ? ` — ${entry.region}` : ""}</option>)}</select></label></div>
    {studio && <Suspense fallback={<div className="asset-notice">Opening your collection…</div>}><AssetStudio initialCategory={studio} color={local?.color} selectedId={studio === "dice" ? local?.diceId : studio === "token" ? local?.tokenId : undefined} onClose={() => onPanelChange(undefined)} onChoose={choose} /></Suspense>}
    {tile !== undefined && <TileInspector game={game} position={tile} onClose={() => setTile(undefined)} />}
    {prices && <div className="modal-backdrop" onClick={() => setPrices(false)}><section className="price-reader" role="dialog" aria-modal="true" aria-labelledby="prices-title" onClick={event => event.stopPropagation()}>
      <header><div><p className="eyebrow">Indian property guide</p><h2 id="prices-title">Property prices</h2></div><button type="button" autoFocus aria-label="Close property prices" onClick={() => setPrices(false)}>×</button></header>
      <p>Bank prices in rupees. Tap a place for its full rent and building costs.</p>
      <div className="price-reader-list">{getBoard(game.boardSize, game.city).filter(isPurchasableTile).map(entry => <button type="button" key={entry.position} style={{ "--deed-color": isStreetTile(entry) ? GROUP_COLORS[entry.group] : "#778c73" } as CSSProperties} onClick={() => { setPrices(false); setTile(entry.position); }}><span><b>{entry.name}</b><small>{entry.region}</small></span><strong>{money(entry.price)}</strong></button>)}</div>
    </section></div>}
    {panel === "leave" && <div className="modal-backdrop" onClick={() => setPreferences(true)}>
      <section className="leave-match-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-match-title" aria-describedby="leave-match-description" onClick={event => event.stopPropagation()}>
        <h2 id="leave-match-title">Leave match?</h2>
        <p id="leave-match-description">Return to the main menu. Your seat stays saved in room {game.roomCode} so you can rejoin.</p>
        <div>
          <button className="event-secondary" type="button" autoFocus onClick={() => setPreferences(true)}>Stay in match</button>
          <button className="leave-match-confirm" type="button" onClick={onLeave}>Leave match</button>
        </div>
      </section>
    </div>}
    {help && <div className="modal-backdrop" onClick={closeHelp}>
      <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button" type="button" onClick={closeHelp} aria-label="Close rules">×</button>
        <p className="eyebrow">A quick guide</p><h2 id="rules-title">Own the neighbourhood.</h2>
        <ol>
          <li>Tap or click a space to inspect its deed. Open Settings for the property guide and event log.</li>
          <li>Everyone starts with ₹1,500. Roll two dice, move and collect ₹200 each time you pass GO.</li>
          <li>Buy an unowned deed, or send it to an auction. Everyone can bid or pass — the last bidder wins.</li>
          <li>Own a full colour set to double its base rent. Build evenly across the set: four houses, then a hotel.</li>
          <li>{usesClassicRules(game) ? `Manage property even off-turn at a stable decision. Trade cash, unimproved deeds and release cards, or make a counter-offer. Leading bids are reserved. ${game.rulesEdition === "hasbro-2025" ? "Received mortgages can stay mortgaged at no immediate cost; redemption costs principal + 10%." : "Received mortgages require immediate interest or redemption."}` : "On your turn, trade cash and unimproved deeds, mortgage for cash, or sell buildings at half cost."}</li>
          <li>Doubles earn another roll; three consecutive doubles send you to Jail. Pay ₹50, use a card or try for doubles.</li>
          <li>{game.rulesEdition === "hasbro-2025" ? "Owners must press Claim rent before the next movement roll. Unclaimed rent expires. Tax and card payments resolve automatically." : "Rent, tax and cards resolve automatically."} Negative cash pauses normal play until you sell buildings, mortgage, trade, or declare bankruptcy. {usesClassicRules(game) ? "Classic requires you to raise available liquidation funds before surrender. Cards draw from shuffled 16-card decks, with held release cards removed until used." : "Negative net worth eliminates you automatically."} Last player standing wins.</li>
        </ol>
        <p>{usesClassicRules(game) ? `Classic: 40 spaces for 2–6 players, highest-roll starting contest, ₹10 opening auctions, 32 houses / 12 hotels, scarcity bidding and fresh utility-rent dice. Indian names and rupees. ${game.rulesEdition === "hasbro-2025" ? "Hasbro G0009 (2025) rent and mortgage rules." : "Traditional edition with automatic rent."}` : "Expanding India: 2–3 players: 40 spaces · 4: 48 · 5: 56 · 6: 64. The map locks at start."} Confirmed moves are saved automatically. If the connection drops, keep the table open — it reconnects to your seat. You can also reopen this room link in the same browser.</p>
        <button className="primary-button" type="button" onClick={closeHelp}>Got it. Let’s play.</button>
      </section>
    </div>}
  </section>;
}

function TileInspector({ game, position, onClose }: { game: GameState; position: number; onClose: () => void }) {
  const tile = getTile(position, game.boardSize, game.city), property = game.properties[position];
  const owner = game.players.find((player) => player.id === property?.ownerId);
  const stripe = isStreetTile(tile) ? GROUP_COLORS[tile.group] : "#eab960";
  return <div className="modal-backdrop" onClick={onClose}><section className="tile-inspector" style={{ "--deed-color": stripe } as CSSProperties} role="dialog" aria-modal="true" aria-labelledby="deed-title" onClick={(event) => event.stopPropagation()}>
    <button className="icon-button" type="button" onClick={onClose} aria-label="Close property details">×</button><p className="eyebrow">Space {position + 1} / {game.boardSize} · {tile.region ?? tile.kind}</p><h2 id="deed-title">{tile.name}</h2>
    {tile.region && <p className="deed-region">{tile.region}</p>}
    {tile.detail && <p className="deed-detail">{tile.detail}</p>}
    {isPurchasableTile(tile) ? <><div className="deed-summary"><span>Bank price<b>{money(tile.price)}</b></span><span>Mortgage<b>{money(tile.mortgageValue)}</b></span></div><p className="ownership-note">{owner ? `Owned by ${owner.name}${property?.mortgaged ? " · mortgaged (no rent)" : property?.houses === 5 ? " · hotel" : property?.houses ? ` · ${property.houses} houses` : ""}` : "Available from the bank"}{permitPauseActive(game, tile) ? " · Permit Pause active" : ""}{rentReliefActive(game, tile) ? ` · Rent Relief active (${RENT_RELIEF_PERCENT}% off rent)` : ""}</p>
      {isStreetTile(tile) && <><dl className="rent-table">{["Base rent", "1 house", "2 houses", "3 houses", "4 houses", "Hotel"].map((label, index) => <div key={label}><dt>{label}</dt><dd>{money(tile.rent[index]!)}</dd></div>)}</dl><p>Full colour set with no buildings: {money(tile.rent[0] * 2)} rent. Build cost: {money(tile.houseCost)} each, evenly across the group.</p></>}
      {tile.kind === "railroad" && <p>Rent with 1 / 2 / 3 / 4 railroads: ₹25 / ₹50 / ₹100 / ₹200.</p>}
      {tile.kind === "utility" && <p>Rent is 4× the dice total. Own both utilities for 10× the dice total.</p>}
      <small>Unmortgage for {money(tile.mortgageValue + Math.ceil(tile.mortgageValue / 10))}. Built groups must sell all improvements before mortgaging or trading a deed.</small></> : <p>{tile.kind === "tax" ? `Pay ${money(tile.amount)} to the bank.` : tile.kind === "go" ? "Collect ₹200 when you pass or land on GO." : tile.kind === "jail" ? "Just visiting unless a card, three doubles, or Go To Jail sent you here." : tile.kind === "goToJail" ? "Go straight to Jail. Do not collect ₹200." : tile.kind === "freeParking" ? "A free stop. No tax jackpot — the bank keeps the taxes." : "Draw a card. Money, movement, repairs and jail-release cards can change your plans."}</p>}
    <button className="secondary-button full-width" type="button" onClick={onClose}>Back to the table</button>
  </section></div>;
}
