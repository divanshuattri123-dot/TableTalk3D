export interface LabelAnchor { id: number; x: number; y: number; w: number; h: number; visible: boolean }
export interface LabelPacket { size: number; labels: LabelAnchor[] }

export function boardRenderSize(width: number, height: number, dpr: number, quality: "auto" | "low" | "high") {
  const cap = quality === "low" ? 1.25 : quality === "high" ? 2.5 : 2;
  const budget = quality === "low" ? 1_800_000 : quality === "high" ? 4_500_000 : 3_200_000;
  // Retina text is independent of this limit, so large screens need not exhaust the GPU.
  const scale = Math.min(Math.max(1, dpr || 1), cap, Math.sqrt(budget / Math.max(1, width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function screenLabelLayout(anchor: LabelAnchor, width: number, height: number, boardSize = 40) {
  const w = Math.max(0, anchor.w * width), h = Math.max(0, anchor.h * height);
  const side = Math.floor(anchor.id / (boardSize / 4));
  return {
    x: anchor.x * width, y: anchor.y * height, width: w, height: h,
    visible: anchor.visible && w >= 13 && h >= 12 && anchor.x + anchor.w / 2 > 0 && anchor.x - anchor.w / 2 < 1 && anchor.y + anchor.h / 2 > 0 && anchor.y - anchor.h / 2 < 1,
    nameSize: Math.round(Math.max(8, Math.min(16, w * .34, h / 2.5)) * 2) / 2,
    priceSize: Math.max(8, Math.min(14, (side % 2 ? h : w) * .34)),
    side,
    showName: true
  };
}

export function fitBoardName(name: string, width: number, maxLines: number, measure: (text: string) => number) {
  const wrap = (limit: number) => {
    const lines: string[] = []; let current = "";
    for (const word of name.trim().split(/\s+/).filter(Boolean)) {
      if (measure(word) > limit) {
        if (current) { lines.push(current); current = ""; }
        const count = Math.min(word.length, Math.ceil(measure(word) / limit));
        for (let i = 0; i < count; i++) lines.push(word.slice(Math.round(i * word.length / count), Math.round((i + 1) * word.length / count)));
      } else if (!current || measure(`${current} ${word}`) <= limit) current = current ? `${current} ${word}` : word;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    return lines;
  };
  let lines = wrap(width), low = width, high = Math.max(width, measure(name));
  // Keep the complete name at a readable height; only tighten its width when a narrow tile needs it.
  if (lines.length > maxLines) {
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      if (wrap(mid).length > maxLines) low = mid; else high = mid;
    }
    lines = wrap(high);
  }
  return { lines, scale: Math.min(1, width / Math.max(1, ...lines.map(measure))) };
}
