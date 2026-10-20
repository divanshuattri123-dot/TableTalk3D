import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GameAsset } from "../assets";
import { useAssets } from "../assets";
import { createRenderer, disposeObject, lightScene, loadModel, prefersStill } from "./scene";

export default function ModelPreview({ asset, color = "#e7b45f", className = "" }: { asset?: GameAsset; color?: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const { byId } = useAssets();
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let render: ReturnType<typeof createRenderer>;
    try { render = createRenderer(container, "auto"); } catch { setError("3D preview is unavailable on this browser."); return; }
    const { renderer } = render;
    const scene = new THREE.Scene(); sceneRef.current = scene;
    const cleanupLight = lightScene(scene, renderer);
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 30);
    camera.position.set(1.7, 1.2, 2.1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, .42, 0); controls.enableDamping = true;
    controls.enablePan = false; controls.minDistance = .8; controls.maxDistance = 4;
    controls.maxPolarAngle = Math.PI / 2 - .02; controls.autoRotate = !prefersStill(); controls.autoRotateSpeed = 1.3;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.72, .78, .1, 48), new THREE.MeshStandardMaterial({ color: "#243b5c", roughness: .65, metalness: .25 }));
    plinth.position.y = -.06; plinth.receiveShadow = true; scene.add(plinth);
    const observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    });
    observer.observe(container);
    let frame = 0, last = 0, visible = true;
    const visibility = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; });
    visibility.observe(container);
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || !visible || time - last < 32) return;
      if (container.classList.contains("hero-model") && document.querySelector(".studio-backdrop")) return;
      last = time; controls.update(); renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      sceneRef.current = null; cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); controls.dispose();
      disposeObject(scene); cleanupLight(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !asset) return;
    let active = true;
    let model: THREE.Group | undefined;
    setReady(false); setError("");
    loadModel(asset, color, byId.get(asset.textureId ?? "")).then((object) => {
      if (!active) { disposeObject(object); return; }
      model = object; scene.add(object); setReady(true);
    }).catch(() => setError("This model could not load. Try another piece."));
    return () => { active = false; if (model) { scene.remove(model); disposeObject(model); } };
  }, [asset?.id, color, byId]);
  return <div className={`model-preview ${className}`} ref={host} aria-label={asset ? `3D preview of ${asset.label}` : "3D collection preview"}>
    {(!ready || error) && <span className="model-loading">{error || (asset ? "Loading your piece…" : "Opening the collection…")}</span>}
    {asset && <span className="model-caption">{asset.label}<small>Drag to rotate · pinch to zoom</small></span>}
  </div>;
}
