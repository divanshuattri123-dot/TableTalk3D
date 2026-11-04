import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getBoard,
  colorGroupTiles,
  getPurchasableTile,
  getTile,
  isPurchasableTile,
  isStreetTile
} from "./engine/board";
import type {
  BoardSize,
  CardDeck,
  GameAction,
  GameState,
  Player,
  Tile,
  PropertyState
} from "./engine/types";
import type { CSSProperties } from "react";
import { canTradeProperty, decisionPlayerId, netWorth } from "./engine/reducer";
import { formatRupees } from "./engine/currency";
import { canClassicManage, classicBuildingGroupLocked, classicLiquidationValue, classicSpendableCash } from "./engine/classic";
import { makeStartAction } from "./network/startAction";
import {makeCardDraws} from "./network/cardDraws";
import BotLobbyControls from "./view/BotLobbyControls";
import TapDice from './view/TapDice';
import {rollDice} from './network/random';
import { isPlayerColorTaken, playerColorKey } from "./engine/playerColors";
import { usePresentation } from "./presentation/usePresentation";
import { presentationInteractionBusy } from "./presentation/timeline";
import { shouldSendMove } from "./presentation/plan";
import EventStage, { PlayerPortrait } from "./view/EventStage";
import { GROUP_COLORS, PLAYER_COLORS } from "./view/palette";
import { useAssets, useViewSettings } from "./assets";
import type { GameAsset } from "./assets";
import type { AssetUse } from "./view/AssetStudio";
import BoardStage from "./view/BoardStage";
import GameMenu from "./view/GameMenu";
import type { TablePanel } from "./view/GameMenu";
import WelcomeMenu from "./view/WelcomeMenu";
import MobileWelcome from "./view/MobileWelcome";
import MobileLobby from "./view/MobileLobby";
import CityPicker from './view/CityPicker';
import MapPicker from './view/MapPicker';
import {isWorldId} from './engine/worlds';
import type {WorldId} from './engine/worlds';
import {isCityId} from './engine/cities';
import type {CityId} from './engine/cities';
import {usePublisher} from './publisher/PublisherShell';
import {STORE_PRODUCTS} from './publisher/catalog';
import {playerId as randomId} from './compat';
import useMobileInterface from "./view/useMobileInterface";
import { nativeMobileShell, roomShareUrl } from "./platform";
import { enterGameFullscreen, exitGameFullscreen, fullscreenActive, releaseGameOrientation } from "./view/fullscreen";
import LandscapeGate from "./view/LandscapeGate";
import { useGameRoom } from "./network/useGameRoom";
import type { Session } from "./network/useGameRoom";
import { readSeat, writeSeat } from "./network/seats";
const AssetStudio = lazy(() => import("./view/AssetStudio"));
const ModelPreview = lazy(() => import("./view/ModelPreview"));

const seatStores = (): Storage[] => {
  const stores: Storage[] = [];
  try { stores.push(window.sessionStorage); } catch { /* Storage can be blocked. */ }
  try { stores.push(window.localStorage); } catch { /* No account is required to play. */ }
  return stores;
};
const savedSession = (roomCode = roomFromUrl()) => readSeat(roomCode, seatStores());

const COLORS = PLAYER_COLORS;
const TOKEN_SHAPES = ["●", "▲", "◆", "★", "✦", "✚"];

const roomFromUrl = (): string => {
  const value = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
  return /^[A-Z]{4}$/.test(value) ? value : "";
};

const randomCode = (): string => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
};

const formatMoney = formatRupees;

const phaseLabel = (phase: GameState["phase"]): string =>
  ({
    lobby: "Waiting room",
    awaitingRoll: "Choose your roll",
    awaitingMove: "Dice are moving",
    awaitingBuy: "Property decision",
    awaitingJailPayment: "Jail decision",
    awaitingUtilityRoll: "Roll to determine utility rent",
    awaitingMortgageDecision: "Received mortgage decision",
    awaitingDebt: "Debt settlement required",
    awaitingAuction: "Open auction",
    awaitingTradeResponse: "Trade pending",
    awaitingEndTurn: "Turn complete",
    gameOver: "Game complete"
  })[phase];

const dice=rollDice;
const packagedApp=import.meta.env.VITE_PACKAGED_APP==='true';
function savedMapChoice():{world:WorldId;city:CityId} {
  try{const choice=JSON.parse(localStorage.getItem('table-talk-map-choice')??'{}');return{world:isWorldId(choice.world)?choice.world:'theme000',city:isCityId(choice.city)?choice.city:'india'};}catch{return{world:'theme000',city:'india'};}
}

const tileGridPosition = (position: number, size: BoardSize): CSSProperties => {
  const side = size / 4, grid = side + 1, offset = position % side;
  if (position < side) return { gridColumn: grid - offset, gridRow: grid };
  if (position < side * 2) return { gridColumn: 1, gridRow: grid - offset };
  if (position < side * 3) return { gridColumn: 1 + offset, gridRow: 1 };
  return { gridColumn: grid, gridRow: 1 + offset };
};

const propertyLabel = (property: PropertyState): string => {
  if (property.mortgaged) return "Mortgaged";
  if (property.houses === 5) return "Hotel";
  if (property.houses > 0) return `${property.houses} house${property.houses === 1 ? "" : "s"}`;
  return "";
};

function TokenColorPicker({ color, players = [], localId, onChoose }: { color: string; players?: readonly Player[]; localId?: string; onChoose: (color: string) => void }) {
  return <fieldset className="color-picker"><legend>Choose a token colour</legend><div>{COLORS.map(swatch => {
    const owner = players.find(player => player.id !== localId && playerColorKey(player.color) === swatch);
    return <button key={swatch} className={`color-choice ${playerColorKey(color) === swatch ? "chosen" : ""}`} style={{ "--swatch": swatch } as CSSProperties} onClick={() => onChoose(swatch)} type="button" disabled={Boolean(owner)} aria-pressed={playerColorKey(color) === swatch} aria-label={owner ? `${swatch} taken by ${owner.name}` : `Use ${swatch} token`} title={owner ? `Taken by ${owner.name}` : "Available colour"} />;
  })}</div></fieldset>;
}

function App() {
  const publisher=usePublisher();
  const equippedToken=STORE_PRODUCTS.find(p=>p.id===publisher.wallet.equipped)?.assetId;
  const [name, setName] = useState(() => { try { return String(JSON.parse(localStorage.getItem('table-talk-profile') ?? '{}').name ?? '').slice(0,24); } catch { return ''; } });
  const [roomInput, setRoomInput] = useState(()=>packagedApp?'':roomFromUrl());
  const [color, setColor] = useState(() => { try { return playerColorKey(JSON.parse(localStorage.getItem('table-talk-profile') ?? '{}').color ?? '') || COLORS[0]; } catch { return COLORS[0]; } });
  const [session, setSession] = useState<Session | undefined>(()=>packagedApp?undefined:savedSession());
  const [mapChoice,setMapChoice]=useState(savedMapChoice),[mapsOpen,setMapsOpen]=useState(false);
  const chooseMap=(patch:Partial<typeof mapChoice>)=>setMapChoice(previous=>{const next={...previous,...patch};try{localStorage.setItem('table-talk-map-choice',JSON.stringify(next));}catch{}return next;});
  const previewCode = /^[A-Z]{4}$/.test(roomInput) ? roomInput : "";
  const preview = useGameRoom(undefined, session ? "" : previewCode);
  const returningId = savedSession(previewCode)?.player.id;
  const taken = isPlayerColorTaken(preview.game?.players ?? [], color, returningId);
  const returning = preview.game?.players.some(player => player.id === returningId);
  const joinReady = preview.game && !taken && (returning || preview.game.phase === "lobby" && preview.game.players.length < 6);
  const { catalog, byId, error, reload } = useAssets();
  const { update } = useViewSettings();
  const mobile = useMobileInterface();
  const [welcomeMenu, setWelcomeMenu] = useState(false);
  const [tokenId, setTokenId] = useState<string|undefined>(equippedToken);
  useEffect(()=>setTokenId(equippedToken),[equippedToken]);
  const [diceId, setDiceId] = useState<string>();
  const [studio, setStudio] = useState<string>();
  const [recentRoom,setRecentRoom]=useState(()=>{try{return localStorage.getItem('table-talk-recent-room')??'';}catch{return '';}});
  useEffect(() => { if (session) { writeSeat(session, seatStores()); setRecentRoom(session.roomCode); try { localStorage.setItem('table-talk-recent-room',session.roomCode); } catch { /* The existing per-room seat is still usable. */ } } }, [session]);
  const token = byId.get(tokenId ?? catalog?.featured.tokens[0] ?? "");
  const die = byId.get(diceId ?? catalog?.featured.dice[0] ?? "");
  const saveProfile = () => { try { localStorage.setItem('table-talk-profile',JSON.stringify({name:name.trim().slice(0,24),color})); } catch { /* A player can still join with blocked storage. */ } };
  const chooseAsset = (asset: GameAsset, use: AssetUse) => {
    if (use === "token") setTokenId(asset.id);
    else if (use === "dice") setDiceId(asset.id);
    else if (use === "city") update({ cityId: asset.id });
    else if (use === "art") update({ tableArtId: asset.id });
    else update({ musicId: asset.id });
    setStudio(undefined);
  };

  const begin = (roomCode: string) => {
    const normalized = roomCode.trim().toUpperCase();
    if (!name.trim() || !/^[A-Z]{4}$/.test(normalized)) return;
    saveProfile();
    setRecentRoom(normalized);
    try{localStorage.setItem('table-talk-recent-room',normalized);}catch{/* The open seat still works without persistent storage. */}
    setWelcomeMenu(false);
    void enterGameFullscreen();
    const nextSession: Session = {
      roomCode: normalized,
      player: { id: savedSession(normalized)?.player.id ?? randomId(), name: name.trim().slice(0, 24), color, tokenId: token?.id, diceId: die?.id }
    };
    window.history.replaceState({}, "", `${window.location.pathname}?room=${normalized}`);
    writeSeat(nextSession, seatStores());
    setSession(nextSession);
  };

  if (session) {
    return <GameRoom session={session} preferredMap={mapChoice} onChooseColor={nextColor => {
      const nextSession = { ...session, player: { ...session.player, color: nextColor } };
      writeSeat(nextSession, seatStores());
      setColor(nextColor); setSession(nextSession);
    }} onLeave={() => {
      setName(session.player.name);
      setRoomInput('');
      window.history.replaceState({},'',window.location.pathname);
      setSession(undefined);
    }} />;
  }

  if (mobile || import.meta.env.VITE_PACKAGED_APP === 'true') return <>
    <MobileWelcome name={name} color={color} roomCode={roomInput} onName={setName} onRoomCode={setRoomInput} resumeCode={recentRoom && savedSession(recentRoom) ? recentRoom : undefined} onResume={()=>begin(recentRoom)}
      colorPicker={<TokenColorPicker color={color} players={preview.game?.players} localId={returningId} onChoose={setColor}/>}
      joinReady={Boolean(joinReady)} roomStatus={previewCode ? !preview.game ? preview.error || (preview.connection === 'offline' ? 'Could not check this room. Try again when online.' : 'Checking available seats…') : !returning && preview.game.phase !== 'lobby' ? 'This game has already started.' : !returning && preview.game.players.length >= 6 ? 'This room is full.' : taken ? 'That colour is taken. Choose another colour.' : `${preview.game.players.length} / 6 players · Your colour is available.` : undefined}
      error={error && <>{error} <button type="button" onClick={reload}>Retry</button></>} onCreate={()=>begin(randomCode())} onJoin={()=>begin(roomInput)} onMenu={()=>setWelcomeMenu(true)} onMaps={()=>setMapsOpen(true)} onSaveProfile={saveProfile}/>
    {mapsOpen&&<MapPicker world={mapChoice.world} city={mapChoice.city} onWorld={world=>chooseMap({world})} onCity={city=>chooseMap({city})} onClose={()=>setMapsOpen(false)}/>}
    {welcomeMenu && <WelcomeMenu onCustomize={category=>{setWelcomeMenu(false);setStudio(category);}} onClose={()=>setWelcomeMenu(false)}/>}
    {studio && <Suspense fallback={<p className="asset-notice">Opening collection…</p>}><AssetStudio initialCategory={studio} selectedId={studio==='dice'?die?.id:token?.id} color={color} onClose={()=>setStudio(undefined)} onChoose={chooseAsset}/></Suspense>}
  </>;

  return (
    <main className={`welcome-shell${import.meta.env.VITE_PACKAGED_APP === "true" ? " packaged-welcome" : ""}`}>
<header className="welcome-nav"><span className="wordmark">TABLE <i>TALK</i><sup>3D</sup></span><span className="welcome-status"><i className="live-dot" /> Free multiplayer</span><button className="publisher-link" type="button" onClick={publisher.openStore}>Store</button><button className="publisher-link" type="button" onClick={publisher.openAccount}>Guest profile</button>{(mobile || import.meta.env.VITE_PACKAGED_APP === "true") && <button className="mobile-menu-trigger" type="button" aria-label="Open game menu" aria-haspopup="dialog" aria-expanded={welcomeMenu} onClick={() => setWelcomeMenu(true)}><span aria-hidden="true">☰</span> Menu</button>}</header>
      <div className="welcome-layout">
      {!mobile && <section className="welcome-showcase" aria-label="Your 3D game piece">
        <p className="eyebrow">Big deals. Your people. One table.</p>
        <h2>The city is<br />up for <em>grabs.</em></h2>
        <p>Pick your piece. Call your friends.<br />Build a little empire together.</p>
        {import.meta.env.VITE_PACKAGED_APP !== "true" && <Suspense fallback={<div className="showcase-loading">Opening the 3D collection…</div>}><ModelPreview asset={token} color={color} className="hero-model" /></Suspense>}
        <div className="showcase-footer"><span>YOUR 3D PIECE</span><button type="button" onClick={() => setStudio("token")}>Explore {catalog?.counts.model.toLocaleString() ?? "1,044"} models ↗</button></div>
        <div className="board-scale"><span>More friends.<br /><b>Bigger neighbourhood.</b></span><div>{[["2–3",40],["4",48],["5",56],["6",64]].map(([count, size]) => <span key={count}><b>{size}</b><small>{count} players</small></span>)}</div></div>
      </section>}
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">Your next game night starts here</p>
        <h1 id="welcome-title">Take a seat.</h1>
        <p className="welcome-copy">
          Make a room, share four letters, and let the negotiations begin. 2–6 friends. Any phone or PC.
        </p>
        <label className="field-label" htmlFor="player-name">Your table name</label>
        <input
          id="player-name"
          className="text-input"
          value={name}
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          placeholder="What should we call you?"
          autoComplete="nickname"
        />
        <TokenColorPicker color={color} players={preview.game?.players} localId={returningId} onChoose={setColor} />
        {previewCode && <p className="colour-room-status" role="status">{!preview.game ? preview.error || (preview.connection === "offline" ? "Could not check this table. Reload to try again." : "Checking available colours…") : !returning && preview.game.phase !== "lobby" ? "This game has already started." : !returning && preview.game.players.length >= 6 ? "This table is full." : taken ? "That colour is taken. Choose an available colour to join." : `${preview.game.players.length} / 6 seats · A different colour for every player.`}</p>}
        {!mobile && <div className="appearance-picker"><button type="button" onClick={() => setStudio("token")}><span>YOUR PIECE</span><b>{token?.label ?? "Sports car"}</b><i>Change ↗</i></button><button type="button" onClick={() => setStudio("dice")}><span>YOUR DICE</span><b>{die?.label ?? "Paris dice"}</b><i>Change ↗</i></button></div>}
        <div className="welcome-actions">
          <button className="primary-button" disabled={!name.trim()} onClick={() => begin(randomCode())} type="button">
            Create a table <span>↗</span>
          </button>
          <div className="join-box">
            <label className="field-label" htmlFor="room-code">Join with a code</label>
            <div className="join-row">
              <input
                id="room-code"
                className="text-input room-input"
                value={roomInput}
                maxLength={4}
                onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
                placeholder="ABCD"
                spellCheck={false}
              />
              <button className="secondary-button" disabled={!name.trim() || !joinReady} onClick={() => begin(roomInput)} type="button">
                Join
              </button>
            </div>
          </div>
        </div>
        {error && <p className="inline-error">{error} <button type="button" onClick={reload}>Retry</button></p>}
        <p className="welcome-note">{import.meta.env.VITE_PACKAGED_APP === "true" ? "Your city is ready. Internet connects your friends." : "No install. No sign-up. Just a link."}<br />Saved rooms · Automatic reconnect · Touch-friendly 3D</p>
      </section>
      </div>
      {!mobile && <footer className="welcome-bottom"><span>A property trading game for your own crew.</span><button type="button" onClick={() => setStudio("all")}>Browse all {catalog ? catalog.assets.length.toLocaleString() : "6,430"} assets ↗</button></footer>}
      {welcomeMenu && <WelcomeMenu onCustomize={category => { setWelcomeMenu(false); setStudio(category); }} onClose={() => setWelcomeMenu(false)} />}
      {studio && <Suspense fallback={<p className="asset-notice">Opening collection…</p>}><AssetStudio initialCategory={studio} selectedId={studio === "dice" ? die?.id : token?.id} color={color} onClose={() => setStudio(undefined)} onChoose={chooseAsset} /></Suspense>}
    </main>
  );
}

function GameRoom({ session, onLeave, onChooseColor,preferredMap }: { session: Session; onLeave: () => void; onChooseColor: (color: string) => void;preferredMap:{world:WorldId;city:CityId} }) {
  const publisher=usePublisher();
  const mobile = useMobileInterface();
  const [lobbyStudio,setLobbyStudio] = useState<"token" | "dice">();
  const { game, connection, error, sendAction, reconnect } = useGameRoom(session);
  const [copied, setCopied] = useState(false);
  const [unityReady, setUnityReady] = useState(false);
  const [diceToolsOpen,setDiceToolsOpen]=useState(false);
  const [drawer, setDrawer] = useState<"menu" | "players" | "log">();
  const [tablePanel, setTablePanel] = useState<TablePanel>();
  const [fullscreen, setFullscreen] = useState(fullscreenActive);
  const [screenNotice, setScreenNotice] = useState("");
  const [sceneUsable, setSceneUsable] = useState(false);
  const motion = usePresentation(game, unityReady);
  const sentMove = useRef("");
  const mapConfigured=useRef(false);
  const initialMapRequests=useRef({world:false,city:false});
  useEffect(()=>{
    if(mapConfigured.current||!game||game.phase!=='lobby'||game.players[0]?.id!==session.player.id||game.mode===undefined||connection!=='connected')return;
    if(game.world===undefined){if(!initialMapRequests.current.world)initialMapRequests.current.world=sendAction({type:'SET_WORLD',playerId:session.player.id,world:preferredMap.world});return;}
    if(game.city===undefined){if(!initialMapRequests.current.city)initialMapRequests.current.city=sendAction({type:'SET_CITY',playerId:session.player.id,city:preferredMap.city});return;}
    mapConfigured.current=true;
  },[game,connection,preferredMap,session.player.id,sendAction]);

  useEffect(() => {
    document.body.classList.add("in-game");
    const sync = () => setFullscreen(fullscreenActive());
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawer(undefined); };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    window.addEventListener("keydown", escape);
    return () => { releaseGameOrientation(); document.body.classList.remove("in-game"); document.removeEventListener("fullscreenchange", sync); document.removeEventListener("webkitfullscreenchange", sync); window.removeEventListener("keydown", escape); };
  }, []);

  const toggleFullscreen = async () => {
    if (fullscreenActive()) { await exitGameFullscreen(); return; }
    if (!await enterGameFullscreen()) {
      setScreenNotice("Full screen is unavailable here. The game will keep filling this window.");
      window.setTimeout(() => setScreenNotice(""), 4500);
    }
  };

  const me = game?.players.find((player) => player.id === session.player.id);
  const moveKey = game?.phase === "awaitingMove" && game.pendingRoll && me && game.pendingRoll.playerId === me.id
    ? `${game.nextEventId}-${game.pendingRoll.dice.join("-")}` : "";

  useEffect(() => {
    if (!game || !me || !sceneUsable || !moveKey || sentMove.current === moveKey || !shouldSendMove(game, me.id, motion.busy, motion.visible)) return;
    if (connection === "connected" && sendAction({ type: "MOVE_RESULT", playerId: me.id, cardDraws: makeCardDraws(game, me) })) sentMove.current = moveKey;
  }, [game, me, moveKey, motion.busy, motion.visible, sceneUsable, sendAction, connection]);

  const copyRoomLink = async () => {
    const link = roomShareUrl(session.roomCode, window.location.href);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (!game || !me && game.phase === "lobby" && !game.notice) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="pulse-token" style={{ background: session.player.color }} />
          <p className="eyebrow">Room {session.roomCode}</p>
          <h1>Opening the table…</h1>
          <p>{connection === "offline" ? "You are offline. Your saved table will reconnect when the internet returns." : "Connecting to your saved seat. This will retry automatically."}</p>
          {error && <p className="inline-error">{error}</p>}
          <button className="secondary-button" onClick={reconnect} type="button">Try reconnecting now</button>
          <button className="secondary-button" onClick={onLeave} type="button">Back</button>
        </div>
      </main>
    );
  }

  if (!me && game.phase === "lobby") return <main className="loading-shell"><section className="loading-card"><p className="eyebrow">Room {session.roomCode}</p><h1>Choose an available colour</h1><p role="status">{game.notice ?? "Each player needs a different token colour."}</p><TokenColorPicker color={session.player.color} players={game.players} onChoose={onChooseColor} /><button className="secondary-button" onClick={onLeave} type="button">Back</button></section></main>;

  const current = game.players.find((player) => player.id === decisionPlayerId(game));
  const isCurrent = connection === "connected" && me?.id === decisionPlayerId(game) && !me?.bankrupt && !motion.busy && sceneUsable;
  const isHost = game.players[0]?.id === me?.id;
  const mobileLobby = mobile && game.phase === 'lobby';
  const shareText = copied ? "Link copied" : "Copy room link";

  return (
    <main className={`game-page immersive-game${mobileLobby ? ' mobile-lobby-mode' : ''}`} data-phase={game.phase}>
      <header className="game-header">
        {mobileLobby && <button className="mobile-lobby-back menu-round-back" type="button" aria-label="Back to main menu" onClick={onLeave}>‹</button>}
        <button className="wordmark" type="button" onClick={onLeave} aria-label="Leave this table">
          TABLE <i>TALK</i>
        </button>
        <div className="room-ticket" aria-label={`Room code ${session.roomCode}`}>
          <span>ROOM</span><strong>{session.roomCode}</strong>
          <button type="button" onClick={copyRoomLink}>{shareText}</button>
        </div>
        <div className={`connection-pill ${connection}`}><span />{connection}</div>
        <nav className="hud-navigation desktop-hud-navigation" aria-label="Game menu">
          <button type="button" onClick={() => setDrawer("players")} aria-label="Players and deeds" aria-haspopup="dialog">♙ <span>Players</span></button>
          <button type="button" onClick={() => setDrawer("log")} aria-label="Event log" aria-haspopup="dialog">≡ <span>Log</span></button>
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"} title={fullscreen ? "Exit full screen" : "Enter full screen"}>⛶</button>
        </nav>
        <button className="mobile-menu-trigger" type="button" aria-label="Open game menu" aria-haspopup="dialog" aria-expanded={drawer === "menu"} onClick={() => { setTablePanel(undefined); setDrawer("menu"); }}><span aria-hidden="true">☰</span> Menu</button>
      </header>

      {error && <p className="global-error">{error}</p>}
      {connection !== "connected" && <div className="connection-recovery" role="status"><strong>{connection === "offline" ? "You’re offline" : "Reconnecting to your table…"}</strong><span>Confirmed moves are saved. Keep this room open.</span><button type="button" onClick={reconnect}>Retry now</button></div>}
      {game.notice && <p className="global-error" role="status">{game.notice}</p>}
      {screenNotice && <p className="fullscreen-notice" role="status">{screenNotice}</p>}
      {game.rentClaim && game.rentClaim.ownerId === me?.id && !me?.bankrupt && <div className="rent-claim" role="status"><span><b>{getTile(game.rentClaim.propertyId, game.boardSize, game.city).name}</b><small>Claim before the next movement roll</small></span><button type="button" disabled={connection !== "connected" || motion.busy || !sceneUsable || ["awaitingTradeResponse", "awaitingDebt", "awaitingMortgageDecision"].includes(game.phase)} onClick={() => sendAction({ type: "CLAIM_RENT", playerId: me!.id, claimId: game.rentClaim!.id })}>Claim {formatMoney(game.rentClaim.amount)}</button></div>}

      <section className="game-layout">
        {mobileLobby ? <MobileLobby game={game} localId={session.player.id} isHost={isHost} sendAction={sendAction} onCopy={copyRoomLink} copied={copied} colorPicker={<TokenColorPicker color={me?.color ?? session.player.color} players={game.players} localId={session.player.id} onChoose={color=>sendAction({type:'SET_APPEARANCE',playerId:session.player.id,color})}/>}/> : <BoardStage diceEnabled={isCurrent&&game.phase==="awaitingRoll"&&!diceToolsOpen&&!drawer&&!tablePanel} onThrow={()=>{if(isCurrent&&me&&game.phase==="awaitingRoll")sendAction({type:"ROLL",playerId:me.id,dice:dice()});}} panel={tablePanel} onPanelChange={setTablePanel} game={game} shown={motion.shown ?? game} target={motion.target ?? game} frame={motion.frame} syncVersion={motion.syncVersion} onComplete={motion.complete} onReady={setUnityReady} onPlayable={setSceneUsable} localId={session.player.id} sendAction={sendAction} render2D={(onSelect) => <Board game={motion.shown ?? game} current={current} onSelect={onSelect} />} />}
        {game.phase !== "lobby" && <div className="live-seats" aria-label="Live player balances">{game.players.map(player => <button type="button" key={player.id} className={`${player.id === decisionPlayerId(game) ? "seat-active" : ""} ${player.bankrupt ? "seat-out" : ""}`} style={{ "--player-color": player.color } as CSSProperties} onClick={() => setDrawer("players")}><PlayerPortrait player={player} /><span><b>{player.name}{player.id === session.player.id ? " · you" : ""}</b><strong>{player.bankrupt ? "Out" : formatMoney(player.cash)}</strong>{player.inJail && <small>In jail</small>}</span></button>)}</div>}
        {!mobileLobby && <aside className="side-rail" aria-label="Game controls and status">
          {game.phase === "lobby" ? (
            <Lobby game={game} localId={session.player.id} isHost={isHost} sendAction={sendAction} />
          ) : (
            <>
              {me ? (
                <Controls nativeDice={unityReady} onToolsOpen={setDiceToolsOpen} game={game} local={me} isCurrent={isCurrent} available={connection === "connected" && !motion.busy && sceneUsable} presenting={motion.busy} sendAction={sendAction} />
              ) : (
                <p className="spectator-note">Spectating only — this table had already started before you arrived.</p>
              )}
            </>
          )}
        </aside>}
      </section>

{drawer && !(mobileLobby && drawer === "menu") && <div className="hud-drawer-backdrop" onClick={() => setDrawer(undefined)}><section className={`hud-drawer${drawer === "menu" ? " game-menu-drawer" : ""}`} role="dialog" aria-modal="true" aria-labelledby="hud-drawer-title" onClick={event => event.stopPropagation()}><header><h2 id="hud-drawer-title">{drawer === "menu" ? "Game menu" : drawer === "players" ? "At the table" : "Table chatter"}</h2><button type="button" autoFocus onClick={() => setDrawer(undefined)} aria-label="Close panel">×</button></header>{drawer === "menu" ? <GameMenu roomCode={session.roomCode} copied={copied} fullscreen={fullscreen} showFullscreen={!nativeMobileShell()} onPanel={panel => { setDrawer(undefined); setTablePanel(panel); }} onPlayers={() => setDrawer("players")} onHistory={() => setDrawer("log")} onCopy={copyRoomLink} onFullscreen={toggleFullscreen} onLeave={onLeave} onPrivacy={publisher.openPrivacy} /> : drawer === "players" ? <PlayerRoster game={game} localId={session.player.id} /> : <EventLog game={game} />}</section></div>}

      <EventStage game={game} frame={motion.frame} busy={connection !== "connected" || presentationInteractionBusy(game, motion) || !sceneUsable} localId={session.player.id} sendAction={sendAction} onCardRead={motion.acknowledgeCard} counterTools={me && game.pendingTrade ? () => <TradeComposer key={game.pendingTrade!.id} game={game} local={me} sendAction={sendAction} counterTrade={game.pendingTrade!} /> : undefined} financeTools={me && <ClassicFinanceMenu game={game} local={me} available={connection === "connected" && !motion.busy && sceneUsable} sendAction={sendAction} />} />
      <LandscapeGate onLeave={onLeave} />
      {mobileLobby && drawer === 'menu' && <WelcomeMenu onClose={()=>setDrawer(undefined)} onCustomize={category=>{setDrawer(undefined);setLobbyStudio(category);}}/>}
      {mobileLobby && lobbyStudio && <Suspense fallback={<p className="asset-notice">Opening collection…</p>}><AssetStudio initialCategory={lobbyStudio} selectedId={lobbyStudio==='token'?me?.tokenId:me?.diceId} color={me?.color ?? session.player.color} onClose={()=>setLobbyStudio(undefined)} onChoose={(asset,use)=>{sendAction({type:'SET_APPEARANCE',playerId:session.player.id,...(use==='dice'?{diceId:asset.id}:{tokenId:asset.id})});setLobbyStudio(undefined);}}/></Suspense>}
    </main>
  );
}

function Lobby({
  game,
  localId,
  isHost,
  sendAction
}: {
  game: GameState;
  localId: string;
  isHost: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [maps,setMaps]=useState(false);
  useEffect(() => {
    if (import.meta.env.VITE_PACKAGED_APP === "true" && isHost && game.mode === undefined)
      sendAction({ type: "SET_MODE", playerId: localId, mode: "classic", rulesEdition: "hasbro-2025" });
  }, [game.mode, isHost, localId, sendAction]);
  const start = () => {
    sendAction(makeStartAction(game, localId));
  };
  const local = game.players.find(player => player.id === localId);
  const duplicateColours = game.players.some(player => isPlayerColorTaken(game.players, player.color, player.id));
  return (
    <section className="lobby-panel">
      <p className="eyebrow">Seats at the table</p>
      <h2>{game.players.length} / 6 players</h2>
      <button type="button" className="lobby-world-trigger" onClick={()=>setMaps(true)}>Choose 3D map</button>
      {maps&&<MapPicker world={game.world} city={game.city} disabled={!isHost} onWorld={world=>sendAction({type:'SET_WORLD',playerId:localId,world})} onCity={city=>sendAction({type:'SET_CITY',playerId:localId,city})} onClose={()=>setMaps(false)}/>}
      <CityPicker value={game.city} disabled={!isHost} onSelect={city=>sendAction({type:'SET_CITY',playerId:localId,city})}/>
      <label className="field-label">Rules mode<select className="text-input" aria-label="Rules mode" value={game.rulesEdition === "hasbro-2025" ? "classic-2025" : game.mode ?? "expanding"} disabled={!isHost} onChange={e => sendAction({ type: "SET_MODE", playerId: localId, mode: e.target.value === "expanding" ? "expanding" : "classic", rulesEdition: e.target.value === "classic-2025" ? "hasbro-2025" : undefined })}><option value="classic-2025">Classic · Hasbro 2025 · claim rent</option><option value="expanding">Expanding India · larger with friends</option><option value="classic">Classic traditional · automatic rent</option></select></label>
      <div className="map-size-note"><b>{game.boardSize} spaces</b><span>{game.mode === "classic" ? "Classic India" : "Expanding India"}</span><small>{game.mode === "classic" ? "40 spaces for 2–6 players. Shuffled 16-card decks, starting dice contest and off-turn finances." : "4 players → 48 · 5 → 56 · 6 → 64. Locks at start."}</small></div>
      <BotLobbyControls game={game} localId={localId} sendAction={sendAction}/><PlayerRoster game={game} localId={localId} />
      {local && <details className="lobby-colours"><summary>Your token colour</summary><TokenColorPicker color={local.color} players={game.players} localId={localId} onChoose={color => sendAction({ type: "SET_APPEARANCE", playerId: localId, color })} /></details>}
      {duplicateColours && <p className="inline-error" role="status">Every player needs a different colour. Open “Your token colour” to choose a free one.</p>}
      {isHost ? (
        <button className="primary-button full-width" disabled={game.players.length < 2 || duplicateColours} onClick={start} type="button">
          {game.players.length < 2 ? "Add AI or invite a friend" : "Start the game"}
        </button>
      ) : (
        <p className="spectator-note">The room creator starts after everyone has joined.</p>
      )}
    </section>
  );
}

function Board({ game, current, onSelect }: { game: GameState; current?: Player; onSelect: (id: number) => void }) {
  const lastRoll = game.lastRoll;
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLElement>(null);
  const fit = () => { setZoom(1); viewport.current?.scrollTo({ left: 0, top: 0 }); };
  return (
    <><nav className="flat-camera-tools" aria-label="2D board camera"><button type="button" onClick={fit} aria-label="Fit 2D board">⌂</button><button type="button" onClick={() => setZoom(value => Math.min(4, value + 1))} disabled={zoom === 4} aria-label="Zoom into 2D board">＋</button><button type="button" onClick={() => setZoom(value => Math.max(1, value - 1))} disabled={zoom === 1} aria-label="Zoom out of 2D board">−</button></nav>
    <section ref={viewport} className={`board-wrap ${zoom > 1 ? "is-zoomed" : ""}`} style={{ "--flat-zoom": zoom } as CSSProperties} aria-label="Property game board">
      <div className="board" style={{ gridTemplateColumns: `repeat(${game.boardSize / 4 + 1}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${game.boardSize / 4 + 1}, minmax(0, 1fr))` }}>
        {getBoard(game.boardSize, game.city).map((tile) => {
          const players = game.players.filter((player) => !player.bankrupt && player.position === tile.position);
          const stripe = isStreetTile(tile) ? GROUP_COLORS[tile.group] : undefined;
          const property = isPurchasableTile(tile) ? game.properties[tile.position] : undefined;
          const owner = game.players.find((player) => player.id === property?.ownerId);
          const sideLength = game.boardSize / 4;
          const side = tile.position < sideLength ? "bottom" : tile.position < sideLength * 2 ? "left" : tile.position < sideLength * 3 ? "top" : "right";
          const tileStyle = { ...tileGridPosition(tile.position, game.boardSize), "--tile-color": stripe, "--owner-color": owner?.color } as CSSProperties;
          return (
            <article
              className={`board-tile ${tile.kind} ${property?.ownerId ? "owned" : ""}`}
              data-side={side}
              key={tile.position}
              style={tileStyle}
              title={[tile.name, tile.region, tile.detail].filter(Boolean).join(" · ")}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${tile.name}${tile.region ? `, ${tile.region}` : ""}${tile.detail ? `, ${tile.detail}` : ""}`}
              onClick={() => onSelect(tile.position)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(tile.position); } }}
            >
              {stripe && <span className="property-strip" />}
              <span className="tile-copy">
                <span className="tile-name">{tile.boardLabel ?? tile.name}</span>
                {tile.region && <small className="tile-region">{tile.region.split(" · ")[0]}</small>}
              </span>
              {isPurchasableTile(tile) && <span className="tile-price">{formatMoney(tile.price)}</span>}
              {tile.kind === "chance" && <span className="tile-icon">?</span>}
              {tile.kind === "community" && <span className="tile-icon">✦</span>}
              {tile.kind === "tax" && <span className="tile-icon">₹</span>}
              {tile.kind === "goToJail" && <span className="tile-icon">⇢</span>}
              {property && propertyLabel(property) && <span className="improvement-mark">{propertyLabel(property)}</span>}
              {owner && <span className="owner-marker" title={`Owned by ${owner.name}`} />}
              <span className="token-stack">
                {players.map((player) => (
                  <i key={player.id} className="token" style={{ "--token": player.color } as CSSProperties} title={player.name}>
                    {TOKEN_SHAPES[game.players.findIndex((candidate) => candidate.id === player.id)]}
                  </i>
                ))}
              </span>
            </article>
          );
        })}
        <div className="board-centre" style={{ gridColumn: `2 / ${game.boardSize / 4 + 1}`, gridRow: `2 / ${game.boardSize / 4 + 1}` }}>
          <p className="eyebrow">Table Talk · India edition</p>
          <h2>{game.roomCode}</h2>
          <div className="board-seal"><span>✦</span><b>THE GREAT INDIAN<br />PROPERTY TOUR</b><span>✦</span></div>
          <div className="centre-turn">
            <span style={{ background: current?.color ?? "#777" }} />
            <b>{current ? `${current.name}'s turn` : "Waiting to start"}</b>
            <small>{phaseLabel(game.phase)}</small>
          </div>
          <div className={`dice-display ${game.phase === "awaitingMove" ? "rolling" : ""}`}>
            <Die value={lastRoll?.dice[0] ?? 0} />
            <Die value={lastRoll?.dice[1] ?? 0} />
          </div>
        </div>
      </div>
    </section></>
  );
}

function Die({ value }: { value: number }) {
  return <span className="die" aria-label={value ? `Die shows ${value}` : "No die roll yet"}>{value || "–"}</span>;
}

function TurnStatus({ game, current }: { game: GameState; current?: Player }) {
  return (
    <section className="turn-status">
      <div className="turn-ledger"><span style={{ background: current?.color ?? "#777" }} /><p>At the table now</p></div>
      <h2>{current ? current.name : "No player yet"}</h2>
      <p>{phaseLabel(game.phase)}</p>
      {game.phase === "gameOver" && (
        <strong className="winner-line">{game.players.find((player) => player.id === game.winnerId)?.name ?? "No one"} wins the table.</strong>
      )}
    </section>
  );
}

function PlayerRoster({ game, localId }: { game: GameState; localId: string }) {
  const { byId, catalog } = useAssets();
  return (
    <section className="player-roster" aria-label="Players">
      {game.players.map((player) => {
        const properties = getBoard(game.boardSize, game.city).filter(
          (tile) => isPurchasableTile(tile) && game.properties[tile.position]?.ownerId === player.id
        );
        return (
          <div className={`player-row ${player.id === decisionPlayerId(game) ? "active" : ""} ${player.bankrupt ? "bankrupt" : ""}`} key={player.id}>
            <PlayerPortrait player={player} />
            <div><b>{player.name}{player.id === localId ? " (you)" : ""}</b><small>{properties.length} deed{properties.length === 1 ? "" : "s"}{player.inJail ? " · in Jail" : ""}</small><small>{byId.get(player.tokenId ?? catalog?.featured.tokens[game.players.indexOf(player) % (catalog?.featured.tokens.length || 1)] ?? "")?.label ?? "Token"} · {getTile(player.position, game.boardSize, game.city).name}</small>
              {properties.length > 0 && <details className="roster-deeds"><summary>View deeds</summary><ul>{properties.map((tile) => <li key={tile.position}>{tile.name}{propertyLabel(game.properties[tile.position]!) ? ` · ${propertyLabel(game.properties[tile.position]!)}` : ""}</li>)}</ul></details>}
            </div>
            <strong>{player.bankrupt ? "Out" : formatMoney(player.cash)}</strong>
          </div>
        );
      })}
    </section>
  );
}

function Controls({
  nativeDice,
  onToolsOpen,
  game,
  local,
  isCurrent,
  available,
  presenting,
  sendAction
}: {
  nativeDice:boolean;
  onToolsOpen:(open:boolean)=>void;
  game: GameState;
  local: Player;
  isCurrent: boolean;
  available: boolean;
  presenting: boolean;
  sendAction: (action: GameAction) => void;
}) {
  const [showBuild, setShowBuild] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  useEffect(()=>{onToolsOpen(showBuild||showTrade);return()=>onToolsOpen(false);},[showBuild,showTrade,onToolsOpen]);
  const [confirmBankruptcy, setConfirmBankruptcy] = useState(false);
  const debt = game.debts?.[0], settling = debt?.playerId === local.id;
  const normalTurn = game.phase === "awaitingRoll" || game.phase === "awaitingEndTurn" || game.phase === "awaitingDebt" || game.phase === "awaitingJailPayment";
  const managing = available && !local.bankrupt && (game.mode === "classic" ? canClassicManage(game, local.id) : normalTurn && isCurrent);
  const canSurrender = game.mode !== "classic" || classicLiquidationValue(game, local.id) < 0;
  useEffect(() => {
    if (settling && game.phase === "awaitingDebt") { setShowBuild(true); setShowTrade(false); }
    if (!debt) { setShowBuild(false); setShowTrade(false); setConfirmBankruptcy(false); }
  }, [game.phase, debt?.playerId, local.id]);
  const ownProperties = useMemo(
    () => getBoard(game.boardSize, game.city).filter((tile) => isPurchasableTile(tile) && game.properties[tile.position]?.ownerId === local.id),
    [game.properties, game.boardSize, local.id]
  );

  return (
    <section className="controls-panel" style={{ "--seat-color": local.color } as CSSProperties}>
      {presenting && <p className="animation-wait" role="status">Playing the table event…</p>}
      <div className="hand-heading"><b>{settling ? "Debt must be settled" : isCurrent ? "Your turn" : game.phase === "awaitingAuction" ? "Auction open" : game.pendingTrade?.toPlayerId === local.id ? "Trade offer for you" : "Watching the table"}</b><span>{local.name} · {formatMoney(local.cash)}</span></div>
      <p className="eyebrow">Your hand</p>
      <div className="cash-line"><span>Cash</span><strong>{formatMoney(local.cash)}</strong></div>
      <p className="net-worth-line">Portfolio net worth <b>{formatMoney(netWorth(game, local.id))}</b> · Bank: {game.bankHouses} houses / {game.bankHotels} hotels</p>
      {settling && <p className="debt-warning" role="alert"><b>Raise {formatMoney(-local.cash)} to continue.</b> Owed to {debt.creditorId === "bank" ? "the bank" : game.players.find(player => player.id === debt.creditorId)?.name} {debt.reason}. Sell buildings, mortgage or trade. Normal play is paused.</p>}
      {local.getOutOfJailCards > 0 && <p className="jail-card">{local.getOutOfJailCards} jail-release card</p>}

      {game.phase === "awaitingRoll" && isCurrent && (
        <div className="action-cluster">
          {local.inJail && (
            <div className="jail-options">
              <button className="secondary-button" type="button" onClick={() => sendAction({ type: "PAY", playerId: local.id, kind: "jailFine" })}>Pay ₹50</button>
              <button className="secondary-button" type="button" disabled={local.getOutOfJailCards === 0} onClick={() => sendAction({ type: "PAY", playerId: local.id, kind: "jailCard" })}>Use jail card</button>
            </div>
          )}
          {nativeDice?<p className="native-dice-note">Tap the dice on the board</p>:<TapDice disabled={showTrade||showBuild} onThrow={()=>sendAction({type:'ROLL',playerId:local.id,dice:dice()})}/>}
        </div>
      )}

      {game.phase === "awaitingMove" && isCurrent && <p className="waiting-note">Your token is moving…</p>}

      {game.phase === "awaitingJailPayment" && isCurrent && (
        <div className="decision-panel"><b>Third failed jail roll</b><p>Pay ₹50, then move the dice already rolled.</p><button className="primary-button" type="button" onClick={() => sendAction({ type: "PAY", playerId: local.id, kind: "jailFine" })}>Pay and move</button></div>
      )}

      {managing && (
        <div className="utility-actions">
          <button className="secondary-button" type="button" onClick={() => { setShowBuild((value) => !value); setShowTrade(false); }}>{settling ? "Sell / mortgage" : "Build / mortgage"}</button>
          <button className="secondary-button" type="button" onClick={() => { setShowTrade((value) => !value); setShowBuild(false); }}>Trade</button>
          {game.phase === "awaitingEndTurn" && isCurrent && <button className="primary-button" type="button" disabled={showTrade || showBuild} onClick={() => sendAction({ type: "END_TURN", playerId: local.id })}>{game.lastRoll?.grantsExtraRoll && !local.inJail ? "Continue turn" : "End turn"}</button>}
          {settling && game.phase === "awaitingDebt" && <button className="bankrupt-button" disabled={!canSurrender} title={!canSurrender ? "Available building sales and mortgages can still clear your debt." : undefined} type="button" onClick={() => setConfirmBankruptcy(true)}>Declare bankruptcy</button>}
        </div>
      )}

      {confirmBankruptcy && settling && isCurrent && createPortal(<div className="bankruptcy-backdrop" onClick={() => setConfirmBankruptcy(false)}><div className="bankruptcy-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm bankruptcy" onClick={event => event.stopPropagation()}><p>Leave the match and give your assets to the creditor?</p><button type="button" onClick={() => sendAction({ type: "BANKRUPT", playerId: local.id })}>Yes, declare bankruptcy</button><button type="button" autoFocus onClick={() => setConfirmBankruptcy(false)}>Keep raising money</button></div></div>, document.body)}

      {settling && !canSurrender && <p className="waiting-note">Your available building-sale and mortgage proceeds can cover this debt. Raise those funds first, or arrange a rescue trade.</p>}
      {(showBuild || showTrade) && managing && <div className="tool-sheet"><header><b>{showBuild ? "Manage your property" : "Make a trade"}</b><button type="button" onClick={() => { setShowBuild(false); setShowTrade(false); }} aria-label="Close property tools">×</button></header>{showBuild ? <PropertyTools game={game} player={local} properties={ownProperties} sendAction={sendAction} /> : <TradeComposer game={game} local={local} sendAction={sendAction} />}</div>}
    </section>
  );
}

function ClassicFinanceMenu({game,local,available,sendAction}:{game:GameState;local:Player;available:boolean;sendAction:(action:GameAction)=>void}) {
  const [tool,setTool]=useState<"build"|"trade">();
  useEffect(()=>{if(!tool)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setTool(undefined);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[tool]);
  if(game.mode!=="classic" || !available || !canClassicManage(game,local.id))return null;
  const properties=getBoard(game.boardSize, game.city).filter(t=>isPurchasableTile(t) && game.properties[t.position]!.ownerId===local.id);
  return <div className="classic-finance-menu"><button className="event-secondary" type="button" onClick={()=>setTool("build")}>Manage deeds</button><button className="event-secondary" type="button" onClick={()=>setTool("trade")}>Propose trade</button>{tool && createPortal(<div className="finance-backdrop" onClick={()=>setTool(undefined)}><section className="finance-sheet" role="dialog" aria-modal="true" aria-label={tool==="build"?"Manage deeds during a decision":"Propose a trade during a decision"} onClick={e=>e.stopPropagation()}><header><h2>{tool==="build"?"Your property desk":"Make a deal"}</h2><button autoFocus type="button" aria-label="Close finance desk" onClick={()=>setTool(undefined)}>×</button></header>{tool==="build"?<PropertyTools game={game} player={local} properties={properties} sendAction={sendAction}/>:<TradeComposer game={game} local={local} sendAction={sendAction}/>}</section></div>,document.body)}</div>;
}

function PropertyTools({
  game,
  player,
  properties,
  sendAction
}: {
  game: GameState;
  player: Player;
  properties: readonly Tile[];
  sendAction: (action: GameAction) => void;
}) {
  return (
    <div className="property-tools">
      <p className="eyebrow">Your deeds</p>
      {properties.length === 0 && <p className="waiting-note">{game.phase === "awaitingDebt" ? "No deeds to mortgage. Try a rescue trade or declare bankruptcy." : "Buy a property to manage it here."}</p>}
      {properties.map((tile) => {
        if (!isPurchasableTile(tile)) return null;
        const property = game.properties[tile.position] as PropertyState;
        const district = tile.kind === "property" ? colorGroupTiles(tile.group, game.boardSize) : [];
        const classic = game.mode === "classic", cash = classic ? classicSpendableCash(game, player.id) : player.cash;
        const liquidation = district.reduce((sum, member) => {const deed=game.properties[member.position]!;return sum+(classic && deed.buildingCosts ? deed.buildingCosts.reduce((n,c)=>n+c,0)/2 : Math.floor(deed.houses*member.houseCost/2));}, 0);
        const levels = district.map(member => game.properties[member.position]!.houses);
        const clearSet = district.every(member => game.properties[member.position]?.ownerId === player.id && !game.properties[member.position]?.mortgaged);
        const locked = classic && classicBuildingGroupLocked(game,tile.position,player.id);
        const canBuild = !locked && game.auction?.kind !== "house" && game.auction?.kind !== "hotel" && tile.kind === "property" && clearSet && game.phase !== "awaitingDebt" && property.houses < 5 && property.houses === Math.min(...levels) && cash >= tile.houseCost && (property.houses === 4 ? game.bankHotels > 0 : game.bankHouses > 0);
        const canSell = !locked && clearSet && property.houses > 0 && property.houses === Math.max(...levels) && (property.houses < 5 || game.bankHouses >= 4);
        const canMortgage = !locked && (property.mortgaged ? game.phase !== "awaitingDebt" && cash >= tile.mortgageValue + Math.ceil(tile.mortgageValue / 10) : !levels.some(level => level > 0));
        const buildReason=tile.kind!=="property"?"":locked?"This district is reserved by an active auction.":game.auction?.kind==="house"||game.auction?.kind==="hotel"?"Finish the building auction first.":!district.every(member=>game.properties[member.position]?.ownerId===player.id)?"Own every deed in this colour set to build.":!clearSet?"Unmortgage the whole colour set first.":game.phase==="awaitingDebt"?"Settle the debt before buying buildings.":property.houses>=5?"Hotel complete.":property.houses!==Math.min(...levels)?"Build evenly: improve the less developed deeds first.":cash<tile.houseCost?"You need more available cash to build.":property.houses===4&&game.bankHotels===0?"The bank has no hotels left.":property.houses<4&&game.bankHouses===0?"The bank has no houses left.":"";
        const refund = tile.kind === "property" ? classic && property.buildingCosts?.length ? property.buildingCosts[property.buildingCosts.length-1]!/2 : Math.floor(tile.houseCost/2) : 0;
        return (
          <div className="deed-row" key={tile.position}>
            <div><b>{tile.name}</b><small>{propertyLabel(property) || "Unimproved"}</small>{tile.kind==="property"&&<small className="deed-rule-note" id={`deed-build-${tile.position}`}>{buildReason||`${property.houses===4?"Hotel":"House"} costs ${formatMoney(tile.houseCost)}`}</small>}</div>
            <div className="deed-actions">
              {tile.kind === "property" && <><button type="button" disabled={!canBuild} title={buildReason||"Build evenly on a complete colour set."} aria-describedby={`deed-build-${tile.position}`} aria-label={`Build on ${tile.name}`} onClick={() => sendAction({ type: "BUILD", playerId: player.id, propertyId: tile.position, operation: "build" })}>{property.houses===4?"Hotel":"House"} {formatMoney(tile.houseCost)}</button><button type="button" disabled={!canSell} title={property.houses === 5 && game.bankHouses < 4 ? "No replacement houses: use Sell district buildings instead." : "Sell evenly from the most developed properties."} aria-label={`Sell a building on ${tile.name}`} onClick={() => sendAction({ type: "BUILD", playerId: player.id, propertyId: tile.position, operation: "sell" })}>Sell {formatMoney(refund)}</button></>}
              {tile.kind === "property" && !locked && property.houses === 5 && game.bankHouses < 4 && <button type="button" aria-label={`Sell all buildings in ${tile.group} district`} onClick={() => sendAction({ type: "BUILD", playerId: player.id, propertyId: tile.position, operation: "sellGroup" })}>Sell district buildings {formatMoney(liquidation)}</button>}
              <button type="button" disabled={!canMortgage} title="Sell every building in the district before mortgaging. Repaying a mortgage includes 10% interest." aria-label={`${property.mortgaged ? "Unmortgage" : "Mortgage"} ${tile.name}`} onClick={() => sendAction({ type: "MORTGAGE", playerId: player.id, propertyId: tile.position, mortgage: !property.mortgaged })}>{property.mortgaged ? "Unmortgage" : `Mortgage ${formatMoney(tile.mortgageValue)}`}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TradeResponse({
  game,
  local,
  trade,
  sendAction
}: {
  game: GameState;
  local: Player;
  trade: NonNullable<GameState["pendingTrade"]>;
  sendAction: (action: GameAction) => void;
}) {
  const from = game.players.find((player) => player.id === trade.fromPlayerId);
  if (trade.toPlayerId !== local.id) return <p className="waiting-note">Waiting for {game.players.find((player) => player.id === trade.toPlayerId)?.name} to answer a trade.</p>;
  return (
    <div className="trade-response">
      <p className="eyebrow">Trade from {from?.name}</p>
      <p>You receive {formatMoney(trade.offeredCash)}{trade.offeredPropertyIds.length ? ` + ${trade.offeredPropertyIds.map((id) => getTile(id, game.boardSize, game.city).name).join(", ")}` : ""}.</p>
      <p>You give {formatMoney(trade.requestedCash)}{trade.requestedPropertyIds.length ? ` + ${trade.requestedPropertyIds.map((id) => getTile(id, game.boardSize, game.city).name).join(", ")}` : ""}.</p>
      <div><button className="primary-button" type="button" onClick={() => sendAction({ type: "TRADE_ACCEPT", playerId: local.id, offerId: trade.id })}>Accept</button><button className="secondary-button" type="button" onClick={() => sendAction({ type: "TRADE_DECLINE", playerId: local.id, offerId: trade.id })}>Decline</button></div>
    </div>
  );
}

function TradeComposer({ game, local, sendAction, counterTrade }: { game: GameState; local: Player; sendAction: (action: GameAction) => void; counterTrade?: NonNullable<GameState['pendingTrade']> }) {
  const otherPlayers = game.players.filter((player) => player.id !== local.id && !player.bankrupt);
  const [toPlayerId, setToPlayerId] = useState(counterTrade?.fromPlayerId ?? otherPlayers[0]?.id ?? "");
  const [offeredCash, setOfferedCash] = useState(String(counterTrade?.requestedCash ?? 0));
  const [requestedCash, setRequestedCash] = useState(String(counterTrade?.offeredCash ?? 0));
  const [offeredIds, setOfferedIds] = useState<number[]>(counterTrade?.requestedPropertyIds ?? []);
  const [requestedIds, setRequestedIds] = useState<number[]>(counterTrade?.offeredPropertyIds ?? []);
  const [offeredCards,setOfferedCards]=useState<CardDeck[]>(counterTrade?.requestedJailCards ?? []),[requestedCards,setRequestedCards]=useState<CardDeck[]>(counterTrade?.offeredJailCards ?? []);
  const target = game.players.find((player) => player.id === toPlayerId);
  const classic=game.mode==="classic", round=(s:string)=>Math.max(0,classic?Math.round((Number(s)||0)*100)/100:Math.floor(Number(s)||0));
  const giving = round(offeredCash), asking = round(requestedCash);
  const hasAsset=offeredIds.length+requestedIds.length+offeredCards.length+requestedCards.length>0;
  const hasTerms = classic ? hasAsset : giving > 0 || asking > 0 || hasAsset;
  const myCash=classic?classicSpendableCash(game,local.id):local.cash, theirCash=classic?classicSpendableCash(game,toPlayerId):target?.cash??0;
  const fee=(ids:number[])=>classic && game.rulesEdition !== "hasbro-2025" ? ids.reduce((n,id)=>n+(game.properties[id]?.mortgaged?Math.ceil(getPurchasableTile(id, game.boardSize, game.city)!.mortgageValue/10):0),0):0;
  const affordable = giving <= Math.max(0, myCash) && asking <= Math.max(0, theirCash) && (!fee(requestedIds) || myCash-giving+asking>=fee(requestedIds)) && (!fee(offeredIds) || theirCash-asking+giving>=fee(offeredIds));
  const mine = getBoard(game.boardSize, game.city).filter((tile) => canTradeProperty(game, tile.position, local.id));
  const theirs = getBoard(game.boardSize, game.city).filter((tile) => canTradeProperty(game, tile.position, toPlayerId));
  const toggle = (propertyId: number, list: number[], setList: (items: number[]) => void) => setList(list.includes(propertyId) ? list.filter((value) => value !== propertyId) : [...list, propertyId]);

  const sendOffer = () => {
    if (!target) return;
    const terms = {
      playerId: local.id,
      offerId: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      offeredCash: giving,
      offeredPropertyIds: offeredIds,
      requestedCash: asking,
      requestedPropertyIds: requestedIds,
      ...(classic?{offeredJailCards:offeredCards,requestedJailCards:requestedCards}:{})
    };
    if (counterTrade) sendAction({type:'TRADE_COUNTER', previousOfferId:counterTrade.id, ...terms});
    else sendAction({type:'TRADE_OFFER', toPlayerId, ...terms});
  };

  return (
    <div className="trade-composer">
      <p className="eyebrow">Write a trade</p>
      <label className="field-label">Trade with<select className="text-input" disabled={Boolean(counterTrade)} value={toPlayerId} onChange={(event) => { setToPlayerId(event.target.value); setRequestedIds([]); setRequestedCards([]); }}><option value="">Choose player</option>{otherPlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      <div className="cash-inputs"><label>Give ₹<input className="text-input" type="number" min="0" step={classic?"0.01":"1"} value={offeredCash} onChange={(event) => setOfferedCash(event.target.value)} /></label><label>Ask ₹<input className="text-input" type="number" min="0" step={classic?"0.01":"1"} value={requestedCash} onChange={(event) => setRequestedCash(event.target.value)} /></label></div>
      <PropertyChecks title="Your deeds" properties={mine} selected={offeredIds} toggle={(id) => toggle(id, offeredIds, setOfferedIds)} />
      <PropertyChecks title={`${target?.name ?? "Their"} deeds`} properties={theirs} selected={requestedIds} toggle={(id) => toggle(id, requestedIds, setRequestedIds)} />
      {classic && <><JailCardChecks title="Your release cards" cards={local.jailCardDecks??[]} selected={offeredCards} onChange={setOfferedCards}/><JailCardChecks title="Their release cards" cards={target?.jailCardDecks??[]} selected={requestedCards} onChange={setRequestedCards}/><p className="waiting-note">{game.rulesEdition === "hasbro-2025" ? "Received mortgages may stay mortgaged for free. Redemption costs principal + 10%." : `Received mortgages cost 10% interest immediately, or principal + 10% to redeem. Minimum interest: you ${formatMoney(fee(requestedIds))} · ${target?.name??"partner"} ${formatMoney(fee(offeredIds))}.`} Leading auction bids remain reserved.</p></>}
      {!hasTerms && <p className="waiting-note">{classic?"Include at least one deed or release card. Classic has no unsecured cash-only gifts.":"Choose cash or a deed to include in the offer."}</p>}
      {!affordable && <p className="inline-error" role="status">Each player needs enough unreserved cash, including any received-mortgage interest.</p>}
      <button className="primary-button" disabled={!target || !hasTerms || !affordable} type="button" onClick={sendOffer}>{counterTrade ? 'Send counter-offer' : 'Send trade offer'}</button>
    </div>
  );
}

function PropertyChecks({ title, properties, selected, toggle }: { title: string; properties: readonly Tile[]; selected: number[]; toggle: (id: number) => void }) {
  return <fieldset className="property-checks"><legend>{title}</legend>{properties.length === 0 ? <small>No unimproved deeds</small> : properties.map((tile) => isPurchasableTile(tile) && <label key={tile.position}><input type="checkbox" checked={selected.includes(tile.position)} onChange={() => toggle(tile.position)} />{tile.name}</label>)}</fieldset>;
}

function JailCardChecks({title,cards,selected,onChange}:{title:string;cards:CardDeck[];selected:CardDeck[];onChange:(cards:CardDeck[])=>void}) {
  return <fieldset className="property-checks"><legend>{title}</legend>{cards.length?cards.map(deck=><label key={deck}><input type="checkbox" checked={selected.includes(deck)} onChange={()=>onChange(selected.includes(deck)?selected.filter(d=>d!==deck):[...selected,deck])}/>{deck==="chance"?"Chance":"Community Chest"} · Get Out of Jail Free</label>):<small>No release cards held</small>}</fieldset>;
}

function EventLog({ game }: { game: GameState }) {
  return (
    <section className="event-log">
      <p className="eyebrow">Table chatter</p>
      <ol>{game.eventLog.slice(0, 10).map((event) => <li className={event.kind} key={event.id}>{event.text}</li>)}</ol>
    </section>
  );
}

export default App;
