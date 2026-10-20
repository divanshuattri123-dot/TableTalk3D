import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { assetUrl } from "../assets";
import type { GameAsset } from "../assets";
import { isPurchasableTile, isStreetTile } from "../engine/board";
import type { Tile } from "../engine/types";
import { GROUP_COLORS } from "./palette";
import { tileLayout } from "./layout";
import { formatRupees } from "../engine/currency";

const icons: Record<string, string> = { chance: "Chance1", community: "CommunityChest", freeParking: "FreeParking", goToJail: "GoToJail", jail: "Jail", railroad: "Train" };
export function createBoardLabels(board: readonly Tile[], assets: GameAsset[]) {
  const cols = 8, cell = 256, rows = Math.ceil(board.length / cols);
  const canvas = document.createElement("canvas"); canvas.width = cols * cell; canvas.height = rows * cell;
  const ctx = canvas.getContext("2d")!, geometries: THREE.BufferGeometry[] = [];
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  let alive = true;
  const images = new Map<string, Promise<HTMLImageElement>>();
  const icon = (name: string) => {
    if (!images.has(name)) images.set(name, new Promise((resolve, reject) => {
      const asset = assets.find((entry) => entry.name === `BoardTexture.${name}`);
      if (!asset) { reject(new Error("No board icon")); return; }
      const image = new Image(); image.crossOrigin = "anonymous";
      image.onload = () => resolve(image); image.onerror = reject; image.src = assetUrl(asset.src);
    }));
    return images.get(name)!;
  };
  for (const tile of board) {
    const layout = tileLayout(tile.position, board.length), col = tile.position % cols, row = Math.floor(tile.position / cols);
    const logicalWidth = layout.width * 200, logicalHeight = layout.depth * 200;
    const paint = (image?: HTMLImageElement) => {
      if (!alive) return;
      ctx.save(); ctx.translate(col * cell, row * cell); ctx.scale(cell / logicalWidth, cell / logicalHeight);
      const w = logicalWidth, h = logicalHeight, cx = w / 2;
      ctx.fillStyle = "#f8f1df"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#1d3941"; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      ctx.strokeStyle = "rgba(114,83,44,.23)"; ctx.lineWidth = 1; ctx.strokeRect(7, 7, w - 14, h - 14);
      if (isStreetTile(tile)) {
        ctx.fillStyle = GROUP_COLORS[tile.group];
        const strip = 42;
        if (layout.quarter === 0) ctx.fillRect(2, 2, w - 4, strip);
        else if (layout.quarter === 1) ctx.fillRect(w - strip - 2, 2, strip, h - 4);
        else if (layout.quarter === 2) ctx.fillRect(2, h - strip - 2, w - 4, strip);
        else ctx.fillRect(2, 2, strip, h - 4);
      }
      ctx.textAlign = "center"; ctx.fillStyle = "#182f38";
      const name = tile.boardLabel ?? tile.name.replace(" / Just Visiting", "");
      if (tile.kind === "go") {
        ctx.font = "900 88px Trebuchet MS"; ctx.fillStyle = "#dd453d"; ctx.fillText("GO", cx, h * .53);
        ctx.font = "900 66px Segoe UI"; ctx.fillText("←", cx, h * .77);
        ctx.fillStyle = "#173536"; ctx.font = "bold 26px Segoe UI"; ctx.fillText("COLLECT ₹200", cx, h * .21);
      } else if (image) {
        const imageSize = Math.min(w * .72, h * .61), ratio = image.width / image.height;
        const iw = imageSize * Math.min(1, ratio), ih = imageSize * Math.min(1, 1 / ratio);
        ctx.drawImage(image, cx - iw / 2, h * .53 - ih / 2, iw, ih);
        ctx.font = "900 25px Trebuchet MS"; ctx.fillText(name.toUpperCase(), cx, 34, w - 16);
        if (tile.region) { ctx.fillStyle = "#66776f"; ctx.font = "700 18px Segoe UI"; ctx.fillText(tile.region.split(" · ")[0].toUpperCase(), cx, h * .8, w - 20); }
      } else {
        ctx.font = "900 31px Trebuchet MS";
        const words = name.toUpperCase().split(" "), lines: string[] = []; let line = "";
        for (const word of words) { if (ctx.measureText(`${line} ${word}`.trim()).width > w - 35 && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
        if (line) lines.push(line);
        const top = isStreetTile(tile) ? h * .39 : h * .3;
        lines.slice(0, 3).forEach((text, index) => ctx.fillText(text, cx, top + index * 33, w - 28));
        if (tile.region) { ctx.fillStyle = "#66776f"; ctx.font = "700 19px Segoe UI"; ctx.fillText(tile.region.split(" · ")[0].toUpperCase(), cx, h * .76, w - 20); ctx.fillStyle = "#182f38"; }
        if (!isPurchasableTile(tile)) { ctx.font = "900 75px Trebuchet MS"; ctx.fillText(tile.kind === "chance" ? "?" : tile.kind === "community" ? "✦" : tile.kind === "tax" ? "₹" : "", cx, h * .77); }
      }
      if (isPurchasableTile(tile) || tile.kind === "tax") {
        ctx.fillStyle = "#173536"; ctx.font = "900 31px Segoe UI";
        ctx.fillText(formatRupees(isPurchasableTile(tile) ? tile.price : tile.kind === "tax" ? tile.amount : 0), cx, h - (layout.quarter === 2 && isStreetTile(tile) ? 54 : 18), w - 20);
      }
      ctx.restore(); map.needsUpdate = true;
    };
    paint();
    const imageName = icons[tile.kind] ?? (tile.kind === "tax" ? tile.amount === 200 ? "IncomeTax" : "SuperTax" : tile.kind === "utility" ? /Power|Electric/.test(tile.name) ? "ElectricCompany" : "WaterWorks" : undefined);
    if (imageName) void icon(imageName).then(paint).catch(() => {});
    const geometry = new THREE.PlaneGeometry(layout.width - .025, layout.depth - .025);
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (col + .006 + uv.getX(i) * .988) / cols, 1 - (row + 1 - .006 - uv.getY(i) * .988) / rows);
    geometry.rotateX(-Math.PI / 2); geometry.translate(layout.x, .116, layout.z); geometries.push(geometry);
  }
  const geometry = mergeGeometries(geometries)!; geometries.forEach((entry) => entry.dispose());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  return { mesh, stop: () => { alive = false; } };
}
