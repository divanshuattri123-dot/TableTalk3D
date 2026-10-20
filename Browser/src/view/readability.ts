export interface LabelAnchor { id: number; x: number; y: number; w: number; h: number; visible: boolean }
export interface LabelPacket { size: number; labels: LabelAnchor[] }

export function boardRenderSize(width: number, height: number, dpr: number, quality: "auto" | "low" | "high") {
  const cap = quality === "low" ? 1.25 : quality === "high" ? 2.5 : 2;
  const budget = quality === "low" ? 1_800_000 : quality === "high" ? 4_500_000 : 3_200_000;
  // Retina text is independent of this limit, so large screens need not exhaust the GPU.
  const scale = Math.min(Math.max(1, dpr || 1), cap, Math.sqrt(budget / Math.max(1, width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function screenLabelLayout(anchor: LabelAnchor, width: number, height: number) {
  const w = Math.max(0, anchor.w * width), h = Math.max(0, anchor.h * height);
  const priceSize = Math.max(10, Math.min(20, w * .34, h * .35));
  return {
    x: anchor.x * width, y: anchor.y * height, width: w, height: h,
    visible: anchor.visible && w >= 13 && h >= 12 && anchor.x + anchor.w / 2 > 0 && anchor.x - anchor.w / 2 < 1 && anchor.y + anchor.h / 2 > 0 && anchor.y - anchor.h / 2 < 1,
    nameSize: Math.max(8, Math.min(16, w * .24, (h - priceSize * 1.04 - 1) / 2.08)),
    priceSize,
    showName: w >= 27 && h >= 32
  };
}
