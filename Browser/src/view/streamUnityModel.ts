import * as THREE from "three";
import type { GameAsset } from "../assets";
import { disposeObject, loadModel } from "./scene";

export {BUNDLED_MODELS} from './modelStreams';

export async function streamUnityModel(asset: GameAsset): Promise<string> {
  const model = await loadModel(asset);
  model.updateMatrixWorld(true);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const vertices = child.geometry.getAttribute("position"), faces = child.geometry.index, ns = child.geometry.getAttribute("normal");
    const offset = positions.length / 3;
    normalMatrix.getNormalMatrix(child.matrixWorld);
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(child.matrixWorld);
      normal.set(0, 1, 0); if (ns) normal.fromBufferAttribute(ns, i).applyMatrix3(normalMatrix).normalize();
      positions.push(point.x, point.y, -point.z); normals.push(normal.x, normal.y, -normal.z);
    }
    for (let i = 0; i < (faces?.count ?? vertices.count); i += 3) {
      indices.push(offset + (faces?.getX(i) ?? i), offset + (faces?.getX(i + 2) ?? i + 2), offset + (faces?.getX(i + 1) ?? i + 1));
    }
  });
  disposeObject(model);
  return JSON.stringify({ id: asset.id, positions, normals, indices });
}
