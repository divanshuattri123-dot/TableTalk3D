import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { assetUrl } from "../assets";
import type { GameAsset, ViewSettings } from "../assets";
import { tileLayout } from "./layout";

const buffers = new Map<string, Promise<ArrayBuffer>>();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export async function loadSceneModel(src: string): Promise<THREE.Group> {
  const response = await fetch(assetUrl(src));
  if (!response.ok) throw new Error("The city scenery could not load.");
  return (await loader.parseAsync(await response.arrayBuffer(), "")).scene;
}

export async function loadModel(asset: GameAsset, color?: string, texture?: GameAsset): Promise<THREE.Group> {
  let promise = buffers.get(asset.id);
  if (!promise) {
    promise = fetch(assetUrl(asset.src)).then((response) => {
      if (!response.ok) throw new Error(`Model could not load: ${asset.label}`);
      return response.arrayBuffer();
    }).catch((reason) => { buffers.delete(asset.id); throw reason; });
    buffers.set(asset.id, promise);
    if (buffers.size > 24) buffers.delete(buffers.keys().next().value!);
  }
  const object = (await loader.parseAsync(await promise, "")).scene;
  const map = texture ? await new THREE.TextureLoader().loadAsync(assetUrl(texture.src)).catch(() => undefined) : undefined;
  // These meshes retain OBJ/Unity UVs, not glTF-authored image coordinates.
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.flipY = true; }
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = new THREE.MeshStandardMaterial({
      color: map ? "#ffffff" : color ?? "#c6cbd1", ...(map ? { map } : {}),
      metalness: map ? .12 : .48, roughness: map ? .72 : .34, side: THREE.DoubleSide
    });
    for (const original of Array.isArray(child.material) ? child.material : [child.material]) original.dispose();
    child.material = material;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return object;
}

export function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  textures.forEach((item) => item.dispose());
}

export function createRenderer(host: HTMLElement, quality: ViewSettings["quality"]) {
  const low = quality === "low" || (quality === "auto" && (window.innerWidth < 820 || navigator.hardwareConcurrency <= 4));
  const renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: true, powerPreference: low ? "low-power" : "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  return { renderer, low };
}

export function lightScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, night = false) {
  scene.add(new THREE.HemisphereLight(night ? "#a6c8ff" : "#f5f8ff", night ? "#2c345e" : "#8eaaab", night ? .7 : 1.3));
  const sun = new THREE.DirectionalLight(night ? "#c4d9ff" : "#fff0cf", night ? 1.1 : 2);
  sun.position.set(6, 14, 8);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -13;
  sun.shadow.camera.right = sun.shadow.camera.top = 13;
  sun.shadow.normalBias = .04;
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .55;
  pmrem.dispose(); room.dispose();
  return () => { environment.dispose(); sun.shadow.map?.dispose(); };
}

export function tilePoint(position: number, size: number): THREE.Vector3 {
  const { x, z } = tileLayout(position, size);
  return new THREE.Vector3(x, .17, z);
}

export const prefersStill = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
