import { describe, expect, it } from "vitest";
import { boardRenderSize, screenLabelLayout } from "./readability";

describe("mobile board clarity", () => {
  it("renders an ordinary retina phone at 2x instead of the previous 1.25x cap", () => {
    expect(boardRenderSize(390, 844, 3, "auto")).toEqual({ width: 780, height: 1688 });
  });
  it("keeps a battery-saving option and a higher-detail option", () => {
    expect(boardRenderSize(400, 800, 3, "low")).toEqual({ width: 500, height: 1000 });
    expect(boardRenderSize(400, 800, 3, "high")).toEqual({ width: 1000, height: 2000 });
    expect(boardRenderSize(400, 800, 1, "auto")).toEqual({ width: 400, height: 800 });
  });
  it("bounds render-target memory on large high-DPI screens", () => {
    const size = boardRenderSize(3840, 2160, 3, "auto");
    expect(size.width * size.height).toBeLessThan(3_205_000);
  });
  it("positions labels in CSS pixels, independent of canvas pixel density", () => {
    const layout = screenLabelLayout({ id: 1, x: .5, y: .4, w: .08, h: .05, visible: true }, 390, 844);
    expect(layout.x).toBe(195); expect(layout.y).toBeCloseTo(337.6);
    expect(layout.width).toBeCloseTo(31.2); expect(layout.visible).toBe(true);
    expect(layout.priceSize).toBeGreaterThanOrEqual(10); expect(layout.showName).toBe(true);
  });
  it("prioritizes the price when a six-player tile has too little room for a full name", () => {
    const layout = screenLabelLayout({ id: 1, x: .5, y: .5, w: .05, h: .03, visible: true }, 390, 844);
    expect(layout.showName).toBe(false); expect(layout.priceSize).toBe(10);
  });
  it("hides clipped and behind-camera labels rather than leaving stale prices on screen", () => {
    const anchor = { id: 1, x: .5, y: .5, w: .08, h: .05, visible: false };
    expect(screenLabelLayout(anchor, 390, 844).visible).toBe(false);
    expect(screenLabelLayout({ ...anchor, x: -1, visible: true }, 390, 844).visible).toBe(false);
  });
});
