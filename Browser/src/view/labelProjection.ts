import { screenLabelLayout } from "./readability";
import type { LabelAnchor, LabelPoint } from "./readability";

export function quadMatrix(corners: LabelPoint[], width: number, height: number): number[] | undefined {
  if (corners.length !== 4 || width <= 0 || height <= 0 || !corners.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return;
  const [p, q, r, s] = corners as [LabelPoint, LabelPoint, LabelPoint, LabelPoint];
  const dx1 = q.x - r.x, dx2 = s.x - r.x, dx3 = p.x - q.x + r.x - s.x;
  const dy1 = q.y - r.y, dy2 = s.y - r.y, dy3 = p.y - q.y + r.y - s.y;
  const area = (q.x - p.x) * (s.y - p.y) - (s.x - p.x) * (q.y - p.y);
  if (Math.abs(area) < 1e-8) return;
  let g = 0, h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-10) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) < 1e-8) return;
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }
  // One projective plane keeps the text, price and icon printed on the same tile.
  return [
    (q.x - p.x + g * q.x) / width, (q.y - p.y + g * q.y) / width, 0, g / width,
    (s.x - p.x + h * s.x) / height, (s.y - p.y + h * s.y) / height, 0, h / height,
    0, 0, 1, 0, p.x, p.y, 0, 1
  ];
}

export function pinnedLabelLayout(anchor: LabelAnchor, width: number, height: number, boardSize = 40, priced = false, symbol = false) {
  const side = Math.floor(anchor.id / (boardSize / 4)), corner = anchor.id % (boardSize / 4) === 0;
  const street = priced && !symbol;
  const localWidth = anchor.localWidth ?? ((corner || side % 2 ? 1.5 : 1) - .025 - (street ? side % 2 ? .4 : .12 : .16));
  const localHeight = anchor.localHeight ?? ((corner || !(side % 2) ? 1.5 : 1) - .025 - (street ? side % 2 ? .12 : .4 : .16));
  // Typeset once in board units, never in camera pixels: zoom must not trigger reflow.
  const layout = screenLabelLayout({ ...anchor, x: .5, y: .5, w: localWidth * 40, h: localHeight * 40 }, 1, 1, boardSize, priced, symbol);
  const corners = anchor.corners ?? [
    { x: anchor.x - anchor.w / 2, y: anchor.y - anchor.h / 2 },
    { x: anchor.x + anchor.w / 2, y: anchor.y - anchor.h / 2 },
    { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 },
    { x: anchor.x - anchor.w / 2, y: anchor.y + anchor.h / 2 }
  ];
  const matrix = quadMatrix(corners.map(p => ({ x: p.x * width, y: p.y * height })), layout.width, layout.height);
  const visible = anchor.visible && Boolean(matrix) && Math.max(...corners.map(p => p.x)) > 0 && Math.min(...corners.map(p => p.x)) < 1
    && Math.max(...corners.map(p => p.y)) > 0 && Math.min(...corners.map(p => p.y)) < 1;
  return { ...layout, visible, transform: matrix ? `matrix3d(${matrix.join(",")})` : "none" };
}
