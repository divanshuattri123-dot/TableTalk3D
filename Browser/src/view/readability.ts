export interface LabelPoint { x: number; y: number }
export interface LabelAnchor { id: number; x: number; y: number; w: number; h: number; visible: boolean; localWidth?: number; localHeight?: number; corners?: LabelPoint[] }
export interface LabelPacket { size: number; labels: LabelAnchor[] }

export function boardRenderSize(width: number, height: number, dpr: number, quality: "auto" | "low" | "high") {
  const cap = quality === "low" ? 1.25 : quality === "high" ? 2.5 : 2;
  const budget = quality === "low" ? 1_800_000 : quality === "high" ? 4_500_000 : 3_200_000;
  // Retina text is independent of this limit, so large screens need not exhaust the GPU.
  const scale = Math.min(Math.max(1, dpr || 1), cap, Math.sqrt(budget / Math.max(1, width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function screenLabelLayout(anchor: LabelAnchor, width: number, height: number, boardSize = 40, priced = false, symbol = false) {
  const w = Math.max(0, anchor.w * width);
  const side = Math.floor(anchor.id / (boardSize / 4));
  // The side tiles have spare border space that can hold an upright price line.
  const h = Math.max(0, anchor.h * height) * (priced && side % 2 ? 1.15 : 1);
  const priceSize = Math.floor(Math.max(7, Math.min(13, w * .3, h * .27)) * 2) / 2;
  const textBottom = priced ? h - priceSize - 1 : h;
  const horizontalIcon = symbol && anchor.id % (boardSize / 4) !== 0 && w > h * 1.22;
  const iconSize = symbol ? Math.max(0, Math.min(w * (horizontalIcon ? .37 : .76), textBottom * (horizontalIcon ? .8 : .58))) : 0;
  const nameX = horizontalIcon ? iconSize + 1 : 0, nameY = symbol && !horizontalIcon ? iconSize + 1 : 0;
  const nameWidth = Math.max(1, w - nameX), nameHeight = Math.max(1, textBottom - nameY);
  return {
    x: anchor.x * width, y: anchor.y * height, width: w, height: h,
    visible: anchor.visible && w > 0 && h > 0 && anchor.x + anchor.w / 2 > 0 && anchor.x - anchor.w / 2 < 1 && anchor.y + anchor.h / 2 > 0 && anchor.y - anchor.h / 2 < 1,
    nameSize: anchor.id === 0 && symbol ? Math.min(18, nameHeight * .85) : Math.floor(Math.max(priced ? 7 : 8, Math.min(16, nameWidth * .4, nameHeight / (symbol || priced ? 2 : 2.5))) * 2) / 2,
    nameX, nameY, nameWidth, nameHeight, priceSize,
    iconSize, iconX: horizontalIcon ? 0 : (w - iconSize) / 2, iconY: horizontalIcon ? (textBottom - iconSize) / 2 : 0,
    showCurrency: w >= 18,
    side,
    showName: true
  };
}

export function fitBoardName(name: string, width: number, maxLines: number, measure: (text: string) => number) {
  const wrap = (limit: number) => {
    const lines: string[] = []; let current = "";
    for (const word of name.trim().split(/\s+/).filter(Boolean)) {
      if (!current || measure(`${current} ${word}`) <= limit) current = current ? `${current} ${word}` : word;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    return lines;
  };
  let lines = wrap(width), low = width, high = Math.max(width, measure(name));
  // Board words stay intact: narrow tiles can tighten type, never turn Chance into disconnected fragments.
  if (lines.length > maxLines) {
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      if (wrap(mid).length > maxLines) low = mid; else high = mid;
    }
    lines = wrap(high);
  }
  return { lines, scale: Math.min(1, width / Math.max(1, ...lines.map(measure))) };
}
