import { useEffect, useRef, useState } from "react";
import { assetUrl, useAssets } from "../assets";
import type { ViewSettings } from "../assets";
import type { GameState } from "../engine/types";
import type { PresentationFrame } from "../presentation/plan";
import { unitySnapshot } from "../presentation/snapshot";
import { boardRenderSize } from "./readability";
import ScreenBoardLabels from "./ScreenBoardLabels";

interface UnityInstance { SendMessage: (object: string, method: string, value?: string) => void; Quit: () => Promise<void> }
interface Release { loaderUrl: string; dataUrl: string; frameworkUrl: string; codeUrl: string; productVersion: string }
declare global { interface Window { createUnityInstance?: (canvas: HTMLCanvasElement, options: object, progress: (value: number) => void) => Promise<UnityInstance> } }
let loader: Promise<void> | undefined;

export default function UnityBoard({ game, target, settings, frame, onSelect, onComplete, onReady, onFallback, onReadPrices }: {
  game: GameState; target: GameState; frame?: PresentationFrame;
  settings: ViewSettings;
  onSelect: (position: number) => void; onComplete: (id: string) => void;
  onReady: (ready: boolean) => void; onFallback: () => void;
  onReadPrices: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), instance = useRef<UnityInstance | undefined>(undefined);
  const latest = useRef({ game, target, frame, onSelect, onComplete, onReady, onFallback });
  latest.current = { game, target, frame, onSelect, onComplete, onReady, onFallback };
  const [progress, setProgress] = useState(0), [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(pointer: coarse), (max-width: 700px)").matches);
  const { byId } = useAssets();
  const registered = useRef(new Set<string>());
  const [assetError, setAssetError] = useState("");
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
    let dead = false;
    const receive = (event: Event) => {
      const { kind, value } = (event as CustomEvent<{ kind: string; value: string }>).detail;
      if (kind === "complete") latest.current.onComplete(value);
      if (kind === "select") latest.current.onSelect(Number(value));
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
      if (dead) { await player.Quit(); return; }
      instance.current = player;
      player.SendMessage("GamePresentation", "ResetSnapshot", JSON.stringify(unitySnapshot(latest.current.game)));
      setReady(true); latest.current.onReady(true);
    }
    start().catch(error => { if (!dead) { setFailure(String(error instanceof Error ? error.message : error).split("\n")[0].slice(0, 240)); latest.current.onReady(false); } });
    return () => {
      dead = true; latest.current.onReady(false); window.removeEventListener("tabletalk-unity", receive);
      const player = instance.current; instance.current = undefined;
      if (player) void player.Quit();
    };
  }, []);
  useEffect(() => {
    if (ready) instance.current?.SendMessage("GamePresentation", "SyncSnapshot", JSON.stringify(unitySnapshot(game)));
  }, [game, ready]);
  useEffect(() => {
    if (ready && frame) instance.current?.SendMessage("GamePresentation", "PresentFrame", JSON.stringify({ ...frame, board: unitySnapshot(target) }));
  }, [frame, ready, target]);
  useEffect(() => {
    if (ready) instance.current?.SendMessage("GamePresentation", "SetVisualSettings", JSON.stringify({ quality: settings.quality, theme: settings.theme, camera: settings.camera, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, mobile, screenLabels: mobile }));
  }, [ready, settings.quality, settings.theme, settings.camera, mobile]);
  useEffect(() => {
    if (!ready) return;
    const ids = new Set(game.players.flatMap(p => [p.tokenId, p.diceId]).filter((id): id is string => Boolean(id)));
    let cancelled = false;
    void import("./streamUnityModel").then(async ({ BUNDLED_MODELS, streamUnityModel }) => {
      for (const id of ids) {
        const asset = byId.get(id);
        if (cancelled || !asset || BUNDLED_MODELS.has(id) || registered.current.has(id)) continue;
        registered.current.add(id);
        try {
          const json = await streamUnityModel(asset);
          if (!cancelled) instance.current?.SendMessage("GamePresentation", "RegisterModel", json);
          else registered.current.delete(id);
        } catch { registered.current.delete(id); if (!cancelled) setAssetError(`${asset.label} could not load. Reopen the collection to try another piece.`); }
      }
    });
    return () => { cancelled = true; };
  }, [ready, game.players, byId]);
  return <div className="unity-board-shell" data-renderer={ready ? "unity-ready" : "unity-loading"}>
    <canvas id="unity-canvas" ref={canvas} className="unity-canvas" tabIndex={0} aria-label="Interactive 3D city board. Drag to pan, pinch or use buttons to zoom." />
    {ready && mobile && <ScreenBoardLabels size={game.boardSize} />}
    {!ready && !failure && <div className="unity-loading"><span className="pulse-token" /><h2>Opening your city</h2><p>Loading the Unity 3D player · {Math.round(progress * 100)}%</p><progress max="1" value={progress} /><small>Only the active city and pieces are loaded, not the entire collection.</small></div>}
    {failure && <div className="unity-loading" role="alert"><h2>3D could not start</h2><p>{failure}</p><button type="button" onClick={onFallback}>Play in 2D</button></div>}
    {assetError && <p className="asset-notice">{assetError}</p>}
    {ready && <><div className="unity-camera-tools"><button type="button" onClick={() => instance.current?.SendMessage("GamePresentation", "WholeBoard")} aria-label="Show whole board">⌂</button><button type="button" onClick={() => instance.current?.SendMessage("GamePresentation", "FocusActive")} aria-label="Follow current player">◎</button><button type="button" onClick={onReadPrices} aria-label="Read property prices" title="Property prices">₹</button><button type="button" aria-label="Zoom in" onClick={() => instance.current?.SendMessage("GamePresentation", "ZoomIn")}>＋</button><button type="button" aria-label="Zoom out" onClick={() => instance.current?.SendMessage("GamePresentation", "ZoomOut")}>−</button></div><p className="touch-guide"><span className="touch-copy">Prices in ₹ · pinch to zoom · tap a property</span><span className="mouse-copy">Drag to pan · scroll to zoom · click a property</span></p></>}
  </div>;
}
