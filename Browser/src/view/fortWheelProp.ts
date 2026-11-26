import * as THREE from "three";
import { fortPosition } from "../engine/mayor";
import type { BoardSize } from "../engine/types";
import { tilePoint } from "./scene";

export function createFortWheel(size: BoardSize) {
  const group = new THREE.Group();
  const tile = tilePoint(fortPosition({ boardSize: size }), size);
  group.position.set(tile.x, .05, tile.z + .85);
  const brass = new THREE.MeshStandardMaterial({ color: "#d5a450", roughness: .44, metalness: .48 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.5, .57, .15, 20), brass);
  base.position.y = .13;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.095, .15, .57, 10), brass);
  post.position.y = .4;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(.48, .49, .09, 32), brass);
  ring.position.y = .67;
  group.add(base, post, ring);

  const disc = new THREE.Group();
  const colors = ["#2a896e", "#c78943", "#b74264", "#4d6c8f", "#3396a6", "#79569a"];
  for (const [index, color] of colors.entries()) {
    const arc = new THREE.CircleGeometry(.435, 8, Math.PI / 3 * (index - .5), Math.PI / 3 - .026);
    const wedge = new THREE.Mesh(arc, new THREE.MeshStandardMaterial({ color, roughness: .67 }));
    wedge.rotation.x = -Math.PI / 2;
    disc.add(wedge);
  }
  disc.position.y = .721;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(.095, 12, 6), brass);
  hub.position.y = .731;
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(.115, .21, 3), brass);
  pointer.rotation.z = Math.PI / 2;
  pointer.position.set(.46, .752, 0);
  group.add(disc, hub, pointer);
  return { group, disc };
}
