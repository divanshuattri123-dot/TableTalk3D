import { useEffect, useRef, useState } from "react";
import { assetUrl, useAssets } from "../assets";
import type { ViewSettings } from "../assets";
import type { GameState } from "../engine/types";
import type { PresentationFrame } from "../presentation/plan";
import { unitySnapshot } from "../presentation/snapshot";
import { boardRenderSize } from "./readability";
import ScreenBoardLabels from "./ScreenBoardLabels";
import { watchGraphicsLoss } from './graphicsRecovery';
import {ModelStreams} from './modelStreams';

interface UnityInstance { SendMessage: (object: string, method: string, value?: string) => void; Quit: () => Promise<void> }
interface Release { loaderUrl: string; dataUrl: string; frameworkUrl: string; codeUrl: string; productVersion: string }
declare global { interface Window { createUnityInstance?: (canvas: HTMLCanvasElement, options: object, progress: (value: number) => void) => Promise<UnityInstance> } }
let loader: Promise<void> | undefined;

export default function UnityBoard({ game, target, settings, frame, syncVersion, onSelect, onComplete, onReady, onFallback, onReadPrices, onRetry, diceEnabled, diceId, onThrow }: {
  game: GameState; target: GameState; frame?: PresentationFrame;
  syncVersion: number;
  settings: ViewSettings;
  onSelect: (position: number) => void; onComplete: (id: string) => void;
  onReady: (ready: boolean) => void; onFallback: () => void;
  onReadPrices: () => void;
  onRetry: () => void;
  diceEnabled: boolean; diceId?: string; onThrow: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), instance = useRef<UnityInstance | undefined>(undefined);
  const latest = useRef({ game, target, frame, onSelect, onComplete, onReady, onFallback });
  latest.current = { game, target, frame, onSelect, onComplete, onReady, onFallback };
  const [progress, setProgress] = useState(0), [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(pointer: coarse), (max-width: 700px)").matches);
  const { byId } = useAssets();
  const streams=useRef<ModelStreams|undefined>(undefined);
  const syncedVersion = useRef(-1);
  const [assetError, setAssetError] = useState("");
  const [diceTarget,setDiceTarget]=useState<{x:number;y:number;width:number;height:number}>();
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse), (max-width: 700px)");
    const change = () => setMobile(media.matches); media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      const size = boardRenderSize(rect.width, rect.height, window.devicePixelRatio, settings.quality);
      if (element.width !== size.width) element.width = size.width;
      if (element.height !== size.height) element.height = size.height;
    };
    const observer = new ResizeObserver(resize); observer.observe(element);
    window.addEventListener("resize", resize); resize();
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [settings.quality, ready]);
  useEffect(() => {
    let dead = false,graphicsLost=false;
    const element=canvas.current;
    const stopWatching=element?watchGraphicsLoss(element,()=>{
      graphicsLost=true;
      setReady(false);latest.current.onReady(false);
      setFailure('Your phone interrupted the 3D view. Your confirmed moves stay in the saved room. Restore 3D or continue with the 2D board.');
    }):()=>{};
    const receive = (event: Event) => {
      const { kind, value } = (event as CustomEvent<{ kind: string; value: string }>).detail;
      if (kind === "complete") latest.current.onComplete(value);
      if (kind === "select") latest.current.onSelect(Number(value));
      if (kind === "dice-target") setDiceTarget(JSON.parse(value));
    };
    window.addEventListener("tabletalk-unity", receive);
    async function start() {
      const response = await fetch(assetUrl("unity/release.json"), { cache: "no-store" });
      if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) throw new Error("The Unity player is not available on this server yet.");
      const release = await response.json() as Release;
      if (!loader) loader = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script"); script.src = assetUrl(`unity/${release.loaderUrl}`);
        script.onload = () => resolve(); script.onerror = () => { loader = undefined; reject(new Error("The 3D player could not download. Try 2D or reload.")); };
        document.head.appendChild(script);
      });
      await loader;
      if (dead || !canvas.current) return;
      const player = await window.createUnityInstance!(canvas.current, {
        dataUrl: assetUrl(`unity/${release.dataUrl}`), frameworkUrl: assetUrl(`unity/${release.frameworkUrl}`), codeUrl: assetUrl(`unity/${release.codeUrl}`),
        streamingAssetsUrl: assetUrl("unity/StreamingAssets"), companyName: "Table Talk", productName: "Table Talk 3D", productVersion: release.productVersion,
        matchWebGLToCanvasSize: false, showBanner: (text: string, type: string) => { if (type === "error" && !dead) setFailure(text); }
      }, value => { if (!dead) setProgress(value); });
      if (dead||graphicsLost) { await player.Quit(); return; }
      instance.current = player;
      streams.current=new ModelStreams(async asset=>(await import('./streamUnityModel')).streamUnityModel(asset),
        json=>{player.SendMessage('GamePresentation','RegisterModel',json);setAssetError('');},
        asset=>setAssetError(`${asset.label} could not load. Reopen the collection to try another piece.`));
      player.SendMessage("GamePresentation", "ResetSnapshot", JSON.stringify(unitySnapshot(latest.current.game)));
      setReady(true); latest.current.onReady(true);
    }
    start().catch(error => { if (!dead) { setFailure(String(error instanceof Error ? error.message : error).split("\n")[0].slice(0, 240)); latest.current.onReady(false); } });
    return () => {
      dead = true; stopWatching();latest.current.onReady(false); window.removeEventListener("tabletalk-unity", receive);
      streams.current?.dispose();streams.current=undefined;
      const player = instance.current; instance.current = undefined;
      if (player) void player.Quit().catch(()=>undefined);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const method = syncedVersion.current === syncVersion ? "SyncSnapshot" : "ResumeSnapshot";
    syncedVersion.current = syncVersion;
    instance.current?.SendMessage("GamePresentation", method, JSON.stringify(unitySnapshot(game)));
  }, [game, ready, syncVersion]);
  useEffect(() => {
    if (ready && frame) instance.current?.SendMessage("GamePresentation", "PresentFrame", JSON.stringify({ ...frame, board: unitySnapshot(target) }));
  }, [frame, ready, target]);
  useEffect(()=>{
    if(ready) instance.current?.SendMessage('GamePresentation','SetDiceInput',JSON.stringify({enabled:diceEnabled&&!frame,diceId}));
  },[ready,diceEnabled,diceId,frame,syncVersion]);
  useEffect(() => {
    if (ready) instance.current?.SendMessage("GamePresentation", "SetVisualSettings", JSON.stringify({ quality: settings.quality, theme: settings.theme, camera: settings.camera, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, mobile, screenLabels: true }));
  }, [ready, settings.quality, settings.theme, settings.camera, mobile, game.boardSize, game.world]);
  useEffect(() => {
    if (!ready) return;
    const ids = new Set(game.players.flatMap(p => [p.tokenId, p.diceId]).filter((id): id is string => Boolean(id)));
    for(const id of ids){const asset=byId.get(id);if(asset)void streams.current?.ensure(asset);}
  }, [ready, game.players, byId]);
  return <div className="unity-board-shell" data-renderer={ready ? "unity-ready" : "unity-loading"}>
    <canvas id="unity-canvas" ref={canvas} className="unity-canvas" draggable={false} onDragStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()} tabIndex={0} aria-label="Interactive 3D city board. Drag to pan, pinch or use buttons to zoom." />
    {ready && <ScreenBoardLabels size={game.boardSize} city={game.city} />}
    {ready&&diceEnabled&&!frame&&diceTarget&&<button type="button" className="native-dice-touch" aria-label="Roll dice" title="Tap the 3D dice to throw" style={{left:`${diceTarget.x*100}%`,top:`${diceTarget.y*100}%`,width:`${diceTarget.width*100}%`,height:`${diceTarget.height*100}%`}} onClick={onThrow}><span>Tap the dice</span></button>}
    {!ready && !failure && <div className="unity-loading"><span className="pulse-token" /><h2>Opening your city</h2><p>Loading the Unity 3D player · {Math.round(progress * 100)}%</p><progress max="1" value={progress} /><small>Only the active city and pieces are loaded, not the entire collection.</small></div>}
    {failure && <div className="unity-loading" role="alert"><h2>Restore your board</h2><p>{failure}</p><button type="button" onClick={async()=>{const player=instance.current;instance.current=undefined;latest.current.onReady(false);if(player)try{await Promise.race([player.Quit(),new Promise(resolve=>window.setTimeout(resolve,2000))]);}catch{}onRetry();}}>Restore 3D</button><button type="button" onClick={onFallback}>Continue in 2D</button></div>}
    {assetError && <p className="asset-notice">{assetError}</p>}
    {ready && <><div className="unity-camera-tools"><button type="button" onClick={() => instance.current?.SendMessage("GamePresentation", "WholeBoard")} aria-label="Show whole board">⌂</button><button type="button" onClick={() => instance.current?.SendMessage("GamePresentation", "FocusActive")} aria-label="Follow current player">◎</button><button type="button" onClick={onReadPrices} aria-label="Read property prices" title="Property prices">₹</button><button type="button" aria-label="Zoom in" onClick={() => instance.current?.SendMessage("GamePresentation", "ZoomIn")}>＋</button><button type="button" aria-label="Zoom out" onClick={() => instance.current?.SendMessage("GamePresentation", "ZoomOut")}>−</button></div><p className="touch-guide"><span className="touch-copy">Prices in ₹ · pinch to zoom · tap a property</span><span className="mouse-copy">Drag to pan · scroll to zoom · click a property</span></p></>}
  </div>;
}
