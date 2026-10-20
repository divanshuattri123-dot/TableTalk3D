import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { getBoard } from "../engine/board";
import type { GameState } from "../engine/types";
import { useAssets } from "../assets";
import type { ViewSettings } from "../assets";
import { createRenderer, disposeObject, lightScene, loadModel, prefersStill, tilePoint } from "./scene";
import { boardFrustum, boardSpan, tileLayout } from "./layout";
import { createBoardLabels } from "./boardLabels";
import { createCity } from "./city";

interface BoardHandle { focus: () => void; reset: () => void; zoom: (factor: number) => void; sync: (game: GameState) => void; top: (top: boolean) => void }
interface TokenView { root: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; route: THREE.Vector3[]; position: number; duration: number; start: number; modelId?: string; model?: THREE.Group; version: number }

function geometryFromModel(object: THREE.Group): THREE.BufferGeometry {
  object.updateMatrixWorld(true);
  const geometries: THREE.BufferGeometry[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const original = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    const geometry = new THREE.BufferGeometry();
    for (const key of ["position", "normal", "uv"]) {
      const attr = original.getAttribute(key); if (!attr) continue;
      const values = new Float32Array(attr.count * attr.itemSize);
      for (let i = 0; i < attr.count; i += 1) {
        values[i * attr.itemSize] = attr.getX(i); values[i * attr.itemSize + 1] = attr.getY(i);
        if (attr.itemSize > 2) values[i * attr.itemSize + 2] = attr.getZ(i);
      }
      geometry.setAttribute(key, new THREE.BufferAttribute(values, attr.itemSize));
    }
    geometry.applyMatrix4(child.matrixWorld); geometries.push(geometry); original.dispose();
  });
  const result = mergeGeometries(geometries, false) ?? geometries[0]!.clone();
  geometries.forEach((geometry) => geometry.dispose()); disposeObject(object);
  return result;
}

export default function ThreeBoard({ game, settings, onSelect, onFallback, onCamera }: {
  game: GameState; settings: ViewSettings; onSelect: (position: number) => void; onFallback: () => void; onCamera: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<BoardHandle | null>(null);
  const snapshot = useRef(game); snapshot.current = game;
  const selected = useRef(onSelect); selected.current = onSelect;
  const [loaded, setLoaded] = useState(0);
  const [failure, setFailure] = useState("");
  const { catalog, byId } = useAssets();

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let render: ReturnType<typeof createRenderer>;
    try { render = createRenderer(container, settings.quality); }
    catch { setFailure("This browser could not open 3D. The full game is available in 2D."); return; }
    setFailure(""); setLoaded(0);
    const { renderer, low } = render;
    const scene = new THREE.Scene();
    const cleanupLight = lightScene(scene, renderer, settings.theme === "night");
    const side = game.boardSize / 4;
    const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, .1, 180);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09;
    controls.minZoom = 1; controls.maxZoom = 3.5;
    controls.enableRotate = settings.camera !== "top";
    controls.minPolarAngle = .015; controls.maxPolarAngle = 1.37;
    controls.screenSpacePanning = true; controls.target.set(0, 0, 0);
    const night = settings.theme === "night";
    const felt = new THREE.MeshStandardMaterial({ color: night ? "#314950" : "#9ebd82", roughness: .96 });
    const island = new THREE.Mesh(new RoundedBoxGeometry(boardSpan(game.boardSize) + .16, .45, boardSpan(game.boardSize) + .16, 2, .1), new THREE.MeshStandardMaterial({ color: night ? "#253a43" : "#7d9475", roughness: .86 }));
    island.position.y = -.43; island.receiveShadow = true; scene.add(island);
    const center = new THREE.Mesh(new RoundedBoxGeometry(side - .9, .25, side - .9, 2, .1), felt);
    center.position.y = -.12; center.receiveShadow = true; scene.add(center);
    const rim = new THREE.Mesh(new RoundedBoxGeometry(boardSpan(game.boardSize) + .34, .13, boardSpan(game.boardSize) + .34, 2, .1), new THREE.MeshStandardMaterial({ color: "#435a52", roughness: .8 }));
    rim.position.y = -.72; scene.add(rim);

    const board = getBoard(game.boardSize);
    const tileGeo = new THREE.BoxGeometry(1, .15, 1);
    const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ color: "#b2d0ac", roughness: .9 }), board.length);
    const matrix = new THREE.Matrix4();
    board.forEach((tile) => {
      const layout = tileLayout(tile.position, game.boardSize);
      matrix.compose(new THREE.Vector3(layout.x, .02, layout.z), new THREE.Quaternion(), new THREE.Vector3(layout.width - .015, 1, layout.depth - .015)); tiles.setMatrixAt(tile.position, matrix);
    });
    tiles.castShadow = true; tiles.receiveShadow = true; scene.add(tiles);
    const labels = createBoardLabels(board, catalog?.assets ?? []); scene.add(labels.mesh);

    const decorations = new THREE.Group(); scene.add(decorations);
    const diceRoot = new THREE.Group(); scene.add(diceRoot); diceRoot.position.set(0, 2.7, 0);
    const activeRing = new THREE.Mesh(new THREE.RingGeometry(.43, .52, 32), new THREE.MeshBasicMaterial({ color: "#fff17b", transparent: true, opacity: .95, depthTest: false }));
    activeRing.rotation.x = -Math.PI / 2; activeRing.renderOrder = 4; scene.add(activeRing);
    const tokens = new Map<string, TokenView>();
    let alive = true, loadedCount = 0, diceVersion = 0, diceId = "", propertyKey = "", houseGeometry: THREE.BufferGeometry | undefined, hotelGeometry: THREE.BufferGeometry | undefined;
    let interaction = performance.now(), frame = 0, lastFrame = 0, frames = 0;
    let lastPhase = "", lastActive = "";
    const ready = () => { if (alive) setLoaded(++loadedCount); };
    const city = createCity(game.boardSize, catalog, byId, settings, ready); scene.add(city.group);
    controls.addEventListener("start", () => { interaction = performance.now(); });
    controls.addEventListener("change", () => { interaction = performance.now(); });
    function clearDecorations() {
      for (const child of [...decorations.children]) {
        decorations.remove(child);
        if (child instanceof THREE.Mesh) {
          if (child.geometry !== houseGeometry && child.geometry !== hotelGeometry) child.geometry.dispose();
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
          if (child instanceof THREE.InstancedMesh) child.dispose();
        }
      }
    }
    function refreshBuildings(state: GameState) {
      const key = JSON.stringify(state.properties);
      if (key === propertyKey) return;
      propertyKey = key; clearDecorations();
      const houses: THREE.Matrix4[] = [], hotels: THREE.Matrix4[] = [];
      for (const [positionString, property] of Object.entries(state.properties)) {
        if (!property.ownerId) continue;
        const position = Number(positionString), point = tilePoint(position, state.boardSize);
        const owner = state.players.find((player) => player.id === property.ownerId);
        const marker = new THREE.Mesh(new THREE.BoxGeometry(.86, .025, .09), new THREE.MeshBasicMaterial({ color: property.mortgaged ? "#76818a" : owner?.color ?? "#999999" }));
        marker.position.set(point.x, .13, point.z); marker.rotation.y = Math.floor(position / side) * Math.PI / 2; decorations.add(marker);
        for (let index = 0; index < property.houses; index += 1) {
          const hotel = property.houses === 5;
          if (hotel && index > 0) break;
          const offset = hotel ? new THREE.Vector3() : new THREE.Vector3((index % 2 - .5) * .26, 0, (Math.floor(index / 2) - .5) * .26);
          const target = point.clone().add(offset); target.y = .15;
          const transform = new THREE.Matrix4().compose(target, new THREE.Quaternion(), new THREE.Vector3().setScalar(hotel ? .45 : .27));
          (hotel ? hotels : houses).push(transform);
        }
      }
      for (const [placements, geometry, color] of [[houses, houseGeometry, "#56bd83"], [hotels, hotelGeometry, "#e86a64"]] as const) {
        if (!geometry || !placements.length) continue;
        const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .58 }), placements.length);
        placements.forEach((placement, index) => mesh.setMatrixAt(index, placement)); mesh.castShadow = true; mesh.receiveShadow = true; decorations.add(mesh);
      }
    }
    for (const [role, assetId] of [["house", catalog?.featured.house], ["hotel", catalog?.featured.hotel]]) {
      const asset = byId.get(assetId ?? "");
      if (asset) loadModel(asset).then((object) => {
        const geometry = geometryFromModel(object);
        if (!alive) { geometry.dispose(); return; }
        if (role === "house") houseGeometry = geometry; else hotelGeometry = geometry;
        propertyKey = ""; refreshBuildings(snapshot.current); ready();
      }).catch(() => {});
    }
    function sync(state: GameState) {
      const activePlayer = state.players.find((player) => player.id === state.activePlayerId);
      activeRing.visible = Boolean(activePlayer);
      if (activePlayer) { activeRing.position.copy(tilePoint(activePlayer.position, state.boardSize)); activeRing.position.y = .15; }
      const present = new Set(state.players.filter((player) => !player.bankrupt).map((player) => player.id));
      for (const [id, view] of tokens) if (!present.has(id)) { scene.remove(view.root); disposeObject(view.root); tokens.delete(id); }
      for (const player of state.players.filter((candidate) => !candidate.bankrupt)) {
        const occupants = state.players.filter((candidate) => !candidate.bankrupt && candidate.position === player.position);
        const slot = occupants.findIndex((candidate) => candidate.id === player.id);
        const point = tilePoint(player.position, state.boardSize);
        if (occupants.length > 1) point.add(new THREE.Vector3((slot % 2 - .5) * .4, 0, (Math.floor(slot / 2) - (Math.ceil(occupants.length / 2) - 1) / 2) * .31));
        let view = tokens.get(player.id);
        if (!view) {
          const root = new THREE.Group(); root.position.copy(point); scene.add(root);
          const base = new THREE.Mesh(new THREE.CylinderGeometry(.3, .33, .055, 24), new THREE.MeshStandardMaterial({ color: player.color, roughness: .4, metalness: .3 }));
          root.add(base); view = { root, from: point.clone(), to: point.clone(), route: [point.clone(), point.clone()], position: player.position, duration: 0, start: 0, version: 0 }; tokens.set(player.id, view);
        }
        if (view.to.distanceToSquared(point) > .0001) {
          view.from.copy(view.root.position); view.to.copy(point); view.start = performance.now();
          const steps = (player.position - view.position + state.boardSize) % state.boardSize;
          const walking = !player.inJail && state.lastRoll?.playerId === player.id && steps === state.lastRoll.total;
          view.route = walking ? [view.from.clone(), ...Array.from({ length: steps }, (_, step) => tilePoint((view!.position + step + 1) % state.boardSize, state.boardSize))] : [view.from.clone(), point.clone()];
          view.route[view.route.length - 1] = point.clone();
          view.duration = walking ? Math.min(1400, steps * 115) : steps === 0 ? 280 : 700;
          view.position = player.position;
        }
        view.root.scale.setScalar(occupants.length > 2 ? .75 : 1);
        const modelId = player.tokenId ?? catalog?.featured.tokens[state.players.indexOf(player) % (catalog?.featured.tokens.length || 1)];
        if (view.modelId !== modelId) {
          view.modelId = modelId; const version = ++view.version;
          if (view.model) { view.root.remove(view.model); disposeObject(view.model); view.model = undefined; }
          const asset = byId.get(modelId ?? "");
          if (asset) {
            const token = view;
            loadModel(asset, player.color, byId.get(asset.textureId ?? "")).then((object) => {
              if (!alive || token.version !== version || !tokens.has(player.id)) { disposeObject(object); return; }
              object.scale.setScalar(.72); object.position.y = .045; token.model = object; token.root.add(object); ready();
            }).catch(() => {});
          }
        }
      }
      refreshBuildings(state);
      const roller = state.players.find((player) => player.id === state.lastRoll?.playerId) ?? state.players[0];
      const nextDice = roller?.diceId ?? catalog?.featured.dice[0] ?? "";
      if (nextDice !== diceId) {
        diceId = nextDice; const version = ++diceVersion;
        for (const child of [...diceRoot.children]) { diceRoot.remove(child); disposeObject(child); }
        const asset = byId.get(nextDice);
        if (asset) for (const index of [0, 1]) loadModel(asset, "#f7dfab", byId.get(asset.textureId ?? "")).then((object) => {
          if (!alive || version !== diceVersion) { disposeObject(object); return; }
          object.scale.setScalar(.76); object.position.set(index === 0 ? -.6 : .6, 0, 0); diceRoot.add(object); ready();
        }).catch(() => {});
      }
      interaction = performance.now();
      if (lastActive && lastActive !== state.activePlayerId) reset();
      if (lastPhase && lastPhase !== state.phase && state.phase === "awaitingBuy") focus();
      lastPhase = state.phase; lastActive = state.activePlayerId ?? "";
    }
    const reset = () => {
      controls.target.set(0, .05, 0);
      camera.position.set(0, side * 3, side * (controls.enableRotate ? 1.6 : .65));
      camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); interaction = performance.now();
    };
    const top = (enabled: boolean) => {
      controls.enableRotate = !enabled;
      controls.mouseButtons.LEFT = enabled ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.touches.ONE = enabled ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      reset();
    };
    const focus = () => {
      const active = snapshot.current.activePlayerId ? tokens.get(snapshot.current.activePlayerId) : undefined;
      if (!active) return;
      const delta = active.to.clone().sub(controls.target);
      camera.position.add(delta); controls.target.copy(active.to); camera.zoom = 2.1; camera.updateProjectionMatrix(); controls.update(); interaction = performance.now();
    };
    const zoom = (factor: number) => { camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 1, 3.5); camera.updateProjectionMatrix(); controls.update(); interaction = performance.now(); };
    const resize = new ResizeObserver(() => {
      const width = container.clientWidth, height = container.clientHeight; if (!width || !height) return;
      renderer.setSize(width, height);
      const view = boardFrustum(game.boardSize, width / height);
      camera.left = -view.width / 2; camera.right = view.width / 2; camera.top = view.height / 2; camera.bottom = -view.height / 2;
      camera.updateProjectionMatrix(); top(settings.camera === "top");
    });
    resize.observe(container);
    const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    let downX = 0, downY = 0;
    const down = (event: PointerEvent) => { downX = event.clientX; downY = event.clientY; interaction = performance.now(); };
    const up = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 7) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(pointer, camera); const hit = ray.intersectObject(tiles)[0];
      if (hit?.instanceId !== undefined) selected.current(hit.instanceId);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    sync(snapshot.current); top(settings.camera === "top");
    handle.current = { sync, reset, focus, top, zoom };
    const still = prefersStill();
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (!alive || document.hidden || document.querySelector(".studio-backdrop")) return;
      const state = snapshot.current;
      const moving = [...tokens.values()].some((view) => time - view.start < view.duration + 60);
      const rolling = state.phase === "awaitingMove";
      const active = moving || rolling || time - interaction < 1400;
      if (time - lastFrame < (active ? (low ? 32 : 16) : 66)) return;
      lastFrame = time; controls.update();
      for (const view of tokens.values()) {
        const progress = still ? 1 : Math.min(1, Math.max(0, (time - view.start) / Math.max(1, view.duration)));
        const travel = progress * (view.route.length - 1), segment = Math.min(view.route.length - 2, Math.floor(travel));
        const fraction = travel - segment, from = view.route[segment]!, to = view.route[segment + 1]!;
        view.root.position.lerpVectors(from, to, fraction);
        if (!still && progress < 1) view.root.position.y += Math.sin(fraction * Math.PI) * (view.route.length > 2 ? .22 : .5);
        if (moving && to.distanceToSquared(from) > .001) view.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      }
      city.animate(time, still);
      activeRing.scale.setScalar(still ? 1 : 1 + Math.sin(time * .004) * .06);
      diceRoot.visible = rolling;
      diceRoot.children.forEach((die, index) => {
        if (rolling && !still) { die.rotation.set(time * .012 + index, time * .016, time * .009); die.position.y = .45 + Math.abs(Math.sin(time * .012 + index)) * .5; }
        else { const value = state.lastRoll?.dice[index] ?? 1; die.rotation.set(value * .25, value * .55, .08); die.position.y = .04; }
      });
      renderer.render(scene, camera); frames += 1;
      if (frames % 20 === 0) { container.dataset.renderedFrames = String(frames); container.dataset.drawCalls = String(renderer.info.render.calls); container.dataset.triangles = String(renderer.info.render.triangles); }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      alive = false; labels.stop(); city.stop(); handle.current = null; cancelAnimationFrame(frame); resize.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointerup", up);
      disposeObject(scene); houseGeometry?.dispose(); hotelGeometry?.dispose(); cleanupLight(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [game.boardSize, settings.quality, settings.theme, settings.cityId, settings.tableArtId, catalog, byId]);

  useEffect(() => { handle.current?.sync(game); }, [game]);
  useEffect(() => { handle.current?.top(settings.camera === "top"); }, [settings.camera]);
  return <section className={`three-board-shell ${settings.theme}`} aria-label={`3D board with ${game.boardSize} tiles`}>
    <div className="three-board-canvas" ref={host} data-models-ready={loaded} />
    <div className="scene-tools"><button type="button" onClick={() => handle.current?.zoom(1.3)} aria-label="Zoom in">+</button><button type="button" onClick={() => handle.current?.zoom(1 / 1.3)} aria-label="Zoom out">−</button><button type="button" onClick={() => handle.current?.focus()}>My turn close-up</button><button type="button" onClick={() => handle.current?.reset()}>Whole board</button><button type="button" onClick={onCamera}>{settings.camera === "top" ? "3D angle" : "Play camera"}</button></div>
    {game.phase === "awaitingMove" && <div className="scene-roll">Rolling…</div>}
    {game.lastRoll && game.phase !== "awaitingMove" && <div className="scene-dice"><span>{game.lastRoll.dice[0]}</span><span>{game.lastRoll.dice[1]}</span><small>{game.lastRoll.doubles ? "Doubles" : `Total ${game.lastRoll.total}`}</small></div>}
    {failure && <div className="scene-failure"><p>{failure}</p><button className="primary-button" type="button" onClick={onFallback}>Use 2D board</button></div>}
  </section>;
}
