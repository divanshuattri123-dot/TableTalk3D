import * as THREE from "three";
import { assetUrl } from "../assets";
import type { AssetCatalog, GameAsset, ViewSettings } from "../assets";
import { disposeObject, loadModel } from "./scene";

const ROOFS = ["#f29d45", "#61b9c9", "#db6fa4", "#7ab695", "#d4b573", "#8c9cc8", "#df5b50", "#73c6cf"].map((color) => new THREE.Color(color));
function colourCity(object: THREE.Group, roofColour?: THREE.Color) {
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const positions = child.geometry.getAttribute("position"), normals = child.geometry.getAttribute("normal");
    const colours = new Float32Array(positions.count * 3), p = new THREE.Vector3(), n = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(child.matrixWorld);
    const facade = new THREE.Color("#e8dfc9"), glass = new THREE.Color("#79b7cd"), ground = new THREE.Color("#9fbea3");
    for (let index = 0; index < positions.count; index += 1) {
      p.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
      n.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize();
      const district = Math.abs(Math.floor((p.x + .5) * 6) + Math.floor((p.z + .5) * 6) * 3) % ROOFS.length;
      const colour = p.y < .012 ? ground : n.y > .45 ? roofColour ?? ROOFS[district]! : Math.abs(n.x) > .7 && p.y > .065 ? glass : facade;
      const shade = .72 + Math.max(0, n.y) * .28 + Math.max(0, n.z) * .06;
      colours.set([colour.r * shade, colour.g * shade, colour.b * shade], index * 3);
    }
    child.geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
      material.dispose();
    }
    child.material = new THREE.MeshBasicMaterial({ color: "#ffffff", vertexColors: true, toneMapped: false });
  });
}

function streetTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#45605c"; ctx.fillRect(0, 0, 1024, 1024);
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) {
    ctx.fillStyle = (row + col) % 3 === 0 ? "#84ad66" : "#a0b98b";
    ctx.fillRect(col * 256 + 18, row * 256 + 18, 220, 220);
    ctx.strokeStyle = "#d5d1bb"; ctx.lineWidth = 12; ctx.strokeRect(col * 256 + 25, row * 256 + 25, 206, 206);
  }
  ctx.strokeStyle = "#e4d595"; ctx.lineWidth = 3; ctx.setLineDash([14, 14]);
  for (let lane = 0; lane <= 4; lane += 1) { const p = lane * 256; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = "#ccecf0"; ctx.fillRect(552, 557, 154, 143); ctx.fillStyle = "#40abc4"; ctx.fillRect(562, 567, 134, 123);
  ctx.strokeStyle = "#9ce6ed"; ctx.lineWidth = 3; for (let line = 0; line < 4; line += 1) { ctx.beginPath(); ctx.moveTo(565, 582 + line * 28); ctx.lineTo(690, 582 + line * 28); ctx.stroke(); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
}

export function createCity(size: number, catalog: AssetCatalog | undefined, byId: Map<string, GameAsset>, settings: ViewSettings, ready: () => void) {
  const group = new THREE.Group(), span = size / 4 - 1.45;
  let alive = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshStandardMaterial({ map: streetTexture(), roughness: .98 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = .04; ground.receiveShadow = true; group.add(ground);
  const asset = byId.get(settings.cityId ?? catalog?.featured.cities[0] ?? "");
  if (asset?.kind === "model") void loadModel(asset, "#e2dfcb", byId.get(asset.textureId ?? "")).then((object) => {
    if (!alive) { disposeObject(object); return; }
    if (!asset.textureId || asset.name === "CombinedMesh_Theme000_Regular") colourCity(object);
    const box = new THREE.Box3().setFromObject(object), dimensions = box.getSize(new THREE.Vector3());
    const scale = span * .97 / Math.max(dimensions.x, dimensions.z, .001);
    object.scale.set(scale, Math.min(scale, span * .21 / Math.max(dimensions.y, .001)), scale);
    object.position.y = .065; group.add(object); ready();
  }).catch(() => {});
  const neighbourhood = ["building.001", "building.004", "building.009", "building.018", "building.031", "building.065"];
  const lots: Array<{ x: number; z: number; index: number }> = [];
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) {
    if (row > 0 && row < 3 && col > 0 && col < 3) continue;
    for (let pair = 0; pair < 2; pair += 1) lots.push({ x: (col / 4 - .375 + (pair === 0 ? -.052 : .052)) * span, z: (row / 4 - .375) * span, index: lots.length });
  }
  neighbourhood.forEach((name, modelIndex) => {
    const building = catalog?.assets.find((entry) => entry.kind === "model" && entry.name === name);
    if (!building) return;
    void loadModel(building).then((object) => {
      if (!alive) { disposeObject(object); return; }
      colourCity(object, ROOFS[modelIndex]);
      const dimensions = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      const placements = lots.filter((lot) => lot.index % neighbourhood.length === modelIndex);
      placements.forEach((lot, index) => {
        const model = index === 0 ? object : object.clone(true);
        model.scale.set(span * .075 / Math.max(dimensions.x, .01), span * (.085 + modelIndex % 3 * .018) / Math.max(dimensions.y, .01), span * .12 / Math.max(dimensions.z, .01));
        model.position.set(lot.x, .07, lot.z); model.rotation.y = lot.index % 4 === 0 ? Math.PI : 0; group.add(model);
      });
      ready();
    }).catch(() => {});
  });
  const matrix = new THREE.Matrix4(), trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), 64);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .045, .26, 5), new THREE.MeshStandardMaterial({ color: "#806341", roughness: 1 }), 64);
  for (let index = 0; index < 64; index += 1) {
    const edge = Math.floor(index / 16), along = (index % 16 / 15 - .5) * span * .95;
    const x = edge % 2 === 0 ? along : (edge === 1 ? -.46 : .46) * span;
    const z = edge % 2 === 1 ? along : (edge === 0 ? -.46 : .46) * span;
    matrix.compose(new THREE.Vector3(x, .29, z), new THREE.Quaternion(), new THREE.Vector3(.12 + index % 3 * .018, .18, .13)); trees.setMatrixAt(index, matrix);
    trees.setColorAt(index, new THREE.Color(index % 3 === 0 ? "#c1d278" : index % 3 === 1 ? "#6b9e51" : "#8fc064"));
    matrix.makeTranslation(x, .17, z); trunks.setMatrixAt(index, matrix);
  }
  trees.castShadow = true; group.add(trees, trunks);
  if (settings.tableArtId) {
    const art = byId.get(settings.tableArtId);
    if (art) new THREE.TextureLoader().load(assetUrl(art.src), (map) => {
      if (!alive) { map.dispose(); return; }
      map.colorSpace = THREE.SRGBColorSpace;
      const billboard = new THREE.Mesh(new THREE.PlaneGeometry(span * .3, span * .18), new THREE.MeshBasicMaterial({ map, transparent: true }));
      billboard.rotation.x = -Math.PI / 2; billboard.position.set(0, .075, span * .28); group.add(billboard);
    });
  }
  const traffic: THREE.Group[] = [], car = catalog?.assets.find((entry) => entry.kind === "model" && entry.name === "car_01");
  if (car) void loadModel(car, "#f5b94e").then((object) => {
    if (!alive) { disposeObject(object); return; }
    for (let index = 0; index < 4; index += 1) { const vehicle = index === 0 ? object : object.clone(true); vehicle.scale.setScalar(span * .032); group.add(vehicle); traffic.push(vehicle); }
    ready();
  }).catch(() => {});
  return { group, stop: () => { alive = false; }, animate: (time: number, still: boolean) => {
    if (still) return;
    traffic.forEach((vehicle, index) => {
      const t = (time * .000025 + index * .25) % 1, edge = Math.floor(t * 4), offset = (t * 4 % 1 - .5) * span * .5;
      vehicle.position.set(edge === 0 ? offset : edge === 1 ? span * .25 : edge === 2 ? -offset : -span * .25, .09, edge === 0 ? -span * .25 : edge === 1 ? offset : edge === 2 ? span * .25 : -offset);
      vehicle.rotation.y = edge === 0 ? Math.PI / 2 : edge === 1 ? 0 : edge === 2 ? -Math.PI / 2 : Math.PI;
    });
  } };
}
