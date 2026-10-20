import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getBoard, getTile, isPurchasableTile, isStreetTile } from "../engine/board";
import type { GameAction, GameState } from "../engine/types";
import { formatRupees } from "../engine/currency";
import { useAssets, useViewSettings } from "../assets";
import type { GameAsset } from "../assets";
import type { AssetUse } from "./AssetStudio";
import { GROUP_COLORS } from "./palette";
import { useGameAudio } from "./useGameAudio";
import type { PresentationFrame } from "../presentation/plan";

const ThreeBoard = lazy(() => import("./ThreeBoard"));
const UnityBoard = lazy(() => import("./UnityBoard"));
const AssetStudio = lazy(() => import("./AssetStudio"));
const money = formatRupees;

export default function BoardStage({ game, shown, target, frame, onComplete, onReady, onPlayable, localId, sendAction, render2D }: {
  game: GameState; localId: string; sendAction: (action: GameAction) => void;
  shown: GameState; target: GameState; frame?: PresentationFrame; onComplete: (id: string) => void; onReady: (ready: boolean) => void;
  onPlayable: (ready: boolean) => void;
  render2D: (onSelect: (position: number) => void) => ReactNode;
}) {
  const { settings, update } = useViewSettings();
  const { catalog, byId, error, reload } = useAssets();
  const [studio, setStudio] = useState<string>();
  const [preferences, setPreferences] = useState(false);
  const [help, setHelp] = useState(false);
  const [tile, setTile] = useState<number>();
  const local = game.players.find((player) => player.id === localId);
  const current = game.players.find((player) => player.id === game.activePlayerId);
  const location = getTile(game.pendingPurchase?.propertyId ?? current?.position ?? 0, game.boardSize);
  const locationOwner = game.players.find((player) => player.id === game.properties[location.position]?.ownerId);
  const instruction = game.phase === "lobby" ? "Invite your friends, then start" : game.phase === "awaitingRoll" ? "Roll the dice" : game.phase === "awaitingBuy" ? "Buy this property or auction it" : game.phase === "awaitingAuction" ? "Open auction · bid or pass" : game.phase === "awaitingTradeResponse" ? "A trade is waiting for an answer" : game.phase === "awaitingMove" ? "Dice rolling…" : game.phase === "gameOver" ? "Game complete" : "Manage your deeds, then end your turn";
  useGameAudio(game, settings);
  const unityReady = useCallback((ready: boolean) => { onReady(ready); onPlayable(ready); }, [onReady, onPlayable]);
  useEffect(() => { const unity = settings.view === "3d" && settings.renderer === "unity"; if (!unity) onReady(false); onPlayable(!unity); }, [settings.view, settings.renderer, onReady, onPlayable]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setTile(undefined); setHelp(false); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const choose = (asset: GameAsset, use: AssetUse) => {
    if (use === "token" || use === "dice") {
      if (local) sendAction({ type: "SET_APPEARANCE", playerId: local.id, [use === "token" ? "tokenId" : "diceId"]: asset.id });
    } else if (use === "city") update({ cityId: asset.id, renderer: "collection" });
    else if (use === "art") update({ tableArtId: asset.id });
    else update({ musicId: asset.id });
    setStudio(undefined);
  };
  return <section className="board-stage" aria-label="Interactive table">
    <div className="play-turn-banner" style={{ "--turn-color": current?.color ?? "#77c5a1" } as CSSProperties}><span className="play-turn-dot" /><div><b>{current ? `${current.name}${current.id === localId ? " (you)" : ""}’s turn` : `Room ${game.roomCode}`}</b><span>{instruction}</span></div><strong>{game.boardSize}<small>SPACES</small></strong></div>
    <div className="table-toolbar">
      <div className="view-switch" aria-label="Board view"><button type="button" aria-pressed={settings.view === "3d"} onClick={() => update({ view: "3d" })}>3D table</button><button type="button" aria-pressed={settings.view === "2d"} onClick={() => update({ view: "2d" })}>2D</button></div>
      <button type="button" className="collection-button" onClick={() => setStudio("token")}>◇ Collection</button>
      <button type="button" aria-expanded={preferences} onClick={() => setPreferences((open) => !open)}>Settings</button>
      <button type="button" className="help-button" onClick={() => setHelp(true)} aria-label="How to play">?</button>
    </div>
    {preferences && <div className="table-preferences">
      <label>3D renderer<select value={settings.renderer} onChange={(event) => update({ renderer: event.target.value as "unity" | "collection" })}><option value="unity">Unity · cinematic city</option><option value="collection">Collection · custom scenery</option></select></label>
      <label>Graphics<select value={settings.quality} onChange={(event) => update({ quality: event.target.value as typeof settings.quality })}><option value="auto">Automatic</option><option value="low">Battery saver</option><option value="high">High detail</option></select></label>
      <label>Lighting<select value={settings.theme} onChange={(event) => update({ theme: event.target.value as typeof settings.theme })}><option value="day">Daylight</option><option value="night">After dark</option></select></label>
      <label>Camera<select value={settings.camera} onChange={(event) => update({ camera: event.target.value as typeof settings.camera })}><option value="top">Play camera · readable</option><option value="perspective">3D angle · orbit</option></select></label>
      <label className="check-setting"><input type="checkbox" checked={settings.sound} onChange={(event) => update({ sound: event.target.checked })} />Game sounds</label>
      <label>Volume<input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(event) => update({ volume: Number(event.target.value) })} /></label>
      <button type="button" onClick={() => setStudio("music")}>Choose music</button>
      {settings.musicId && <button type="button" onClick={() => update({ musicId: undefined })}>Stop music</button>}
      <button type="button" onClick={() => { update({ cityId: undefined, tableArtId: undefined, renderer: "unity" }); }}>Reset scenery</button>
      <p>View, scenery and audio are personal. Your token and dice are shared with the whole room.</p>
    </div>}
    {error && <p className="asset-notice">{error} <button type="button" onClick={reload}>Retry collection</button></p>}
    {settings.view === "3d" ? <Suspense fallback={<div className="scene-loading"><span className="pulse-token" /><b>Building your 3D table…</b><small>The rules and room are ready.</small></div>}>
      {settings.renderer === "unity" ? <UnityBoard game={shown} target={target} frame={frame} onSelect={setTile} onComplete={onComplete} onReady={unityReady} onFallback={() => update({ view: "2d" })} /> : <ThreeBoard game={shown} settings={settings} onSelect={setTile} onFallback={() => update({ view: "2d" })} onCamera={() => update({ camera: settings.camera === "top" ? "perspective" : "top" })} />}
    </Suspense> : render2D(setTile)}
    <div className="landing-ribbon"><div><small>{game.phase === "lobby" ? "Tap any space to inspect it" : `${current?.name ?? "Player"} is at`}</small><b>{location.name}</b><span>{location.region && `${location.region} · `}{isPurchasableTile(location) ? `${money(location.price)} · ${locationOwner ? `Owned by ${locationOwner.name}` : "Unowned deed"}` : location.kind === "tax" ? `Pay ${money(location.amount)}` : location.kind === "go" ? "Collect ₹200 when passing GO" : instruction}</span></div><button type="button" onClick={() => setTile(location.position)}>Full details ↗</button></div>
    <div className="table-caption"><label className="tile-jump"><span className="sr-only">Inspect any board tile</span><select aria-label="Inspect any board tile" value="" onChange={(event) => { if (event.target.value) setTile(Number(event.target.value)); }}><option value="">Explore every property ↗</option>{getBoard(game.boardSize).map((entry) => <option value={entry.position} key={entry.position}>{entry.position + 1}. {entry.name}{entry.region ? ` — ${entry.region}` : ""}</option>)}</select></label></div>
    <div className="my-piece-strip"><span>Your setup</span><button type="button" onClick={() => setStudio("token")}>{byId.get(local?.tokenId ?? catalog?.featured.tokens[0] ?? "")?.label ?? "Choose a 3D piece"} ↗</button><button type="button" onClick={() => setStudio("dice")}>Change dice ↗</button><button type="button" onClick={() => setStudio("scenery")}>Change city ↗</button></div>
    {studio && <Suspense fallback={<div className="asset-notice">Opening your collection…</div>}><AssetStudio initialCategory={studio} color={local?.color} selectedId={studio === "dice" ? local?.diceId : studio === "token" ? local?.tokenId : undefined} onClose={() => setStudio(undefined)} onChoose={choose} /></Suspense>}
    {tile !== undefined && <TileInspector game={game} position={tile} onClose={() => setTile(undefined)} />}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}>
      <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button" type="button" onClick={() => setHelp(false)} aria-label="Close rules">×</button>
        <p className="eyebrow">A quick guide</p><h2 id="rules-title">Own the neighbourhood.</h2>
        <ol>
          <li>Everyone starts with ₹1,500. Roll two dice, move and collect ₹200 each time you pass GO.</li>
          <li>Buy an unowned deed, or send it to an auction. Everyone can bid or pass — the last bidder wins.</li>
          <li>Own a full colour set to double its base rent. Build evenly across the set: four houses, then a hotel.</li>
          <li>On your turn, trade cash and unimproved deeds, mortgage for cash, or sell buildings at half cost.</li>
          <li>Doubles earn another roll; three consecutive doubles send you to Jail. Pay ₹50, use a card or try for doubles.</li>
          <li>Rent, tax and cards resolve automatically. Cash may go negative after a bill; mortgage or sell improvements on your turn to recover. Negative net worth means bankruptcy. Last player standing wins.</li>
        </ol>
        <p>2–3 players: 40 spaces · 4: 48 · 5: 56 · 6: 64. The map locks when the game starts. Keep your tab open on your turn; reload to reclaim your seat if the connection closes.</p>
        <button className="primary-button" type="button" onClick={() => setHelp(false)}>Got it. Let’s play.</button>
      </section>
    </div>}
  </section>;
}

function TileInspector({ game, position, onClose }: { game: GameState; position: number; onClose: () => void }) {
  const tile = getTile(position, game.boardSize), property = game.properties[position];
  const owner = game.players.find((player) => player.id === property?.ownerId);
  const stripe = isStreetTile(tile) ? GROUP_COLORS[tile.group] : "#eab960";
  return <div className="modal-backdrop" onClick={onClose}><section className="tile-inspector" style={{ "--deed-color": stripe } as CSSProperties} role="dialog" aria-modal="true" aria-labelledby="deed-title" onClick={(event) => event.stopPropagation()}>
    <button className="icon-button" type="button" onClick={onClose} aria-label="Close property details">×</button><p className="eyebrow">Space {position + 1} / {game.boardSize} · {tile.region ?? tile.kind}</p><h2 id="deed-title">{tile.name}</h2>
    {tile.region && <p className="deed-region">{tile.region}</p>}
    {tile.detail && <p className="deed-detail">{tile.detail}</p>}
    {isPurchasableTile(tile) ? <><div className="deed-summary"><span>Bank price<b>{money(tile.price)}</b></span><span>Mortgage<b>{money(tile.mortgageValue)}</b></span></div><p className="ownership-note">{owner ? `Owned by ${owner.name}${property?.mortgaged ? " · mortgaged (no rent)" : property?.houses === 5 ? " · hotel" : property?.houses ? ` · ${property.houses} houses` : ""}` : "Available from the bank"}</p>
      {isStreetTile(tile) && <><dl className="rent-table">{["Base rent", "1 house", "2 houses", "3 houses", "4 houses", "Hotel"].map((label, index) => <div key={label}><dt>{label}</dt><dd>{money(tile.rent[index]!)}</dd></div>)}</dl><p>Full colour set with no buildings: {money(tile.rent[0] * 2)} rent. Build cost: {money(tile.houseCost)} each, evenly across the group.</p></>}
      {tile.kind === "railroad" && <p>Rent with 1 / 2 / 3 / 4 railroads: ₹25 / ₹50 / ₹100 / ₹200.</p>}
      {tile.kind === "utility" && <p>Rent is 4× the dice total. Own both utilities for 10× the dice total.</p>}
      <small>Unmortgage for {money(tile.mortgageValue + Math.ceil(tile.mortgageValue / 10))}. Built groups must sell all improvements before mortgaging or trading a deed.</small></> : <p>{tile.kind === "tax" ? `Pay ${money(tile.amount)} to the bank.` : tile.kind === "go" ? "Collect ₹200 when you pass or land on GO." : tile.kind === "jail" ? "Just visiting unless a card, three doubles, or Go To Jail sent you here." : tile.kind === "goToJail" ? "Go straight to Jail. Do not collect ₹200." : tile.kind === "freeParking" ? "A free stop. No tax jackpot — the bank keeps the taxes." : "Draw a card. Money, movement, repairs and jail-release cards can change your plans."}</p>}
    <button className="secondary-button full-width" type="button" onClick={onClose}>Back to the table</button>
  </section></div>;
}
