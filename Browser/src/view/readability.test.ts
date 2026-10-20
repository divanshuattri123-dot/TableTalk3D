import { describe, expect, it } from "vitest";
import { boardRenderSize, fitBoardName, screenLabelLayout } from "./readability";

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
  it("keeps the name when a six-player tile is too small for the old name-and-price stack", () => {
    const layout = screenLabelLayout({ id: 1, x: .5, y: .5, w: .05, h: .03, visible: true }, 390, 844);
    expect(layout.showName).toBe(true); expect(layout.nameSize).toBeGreaterThanOrEqual(8);
  });
  it.each([40, 48, 56, 64] as const)("shows names on every side of the %i-space landscape board", size => {
    const bounds = [{ w: 24, h: 29 }, { w: 27, h: 19 }, { w: 21, h: 24 }, { w: 27, h: 19 }];
    bounds.forEach((rect, side) => {
      const layout = screenLabelLayout({ id: side * size / 4 + 1, x: .5, y: .5, w: rect.w / 844, h: rect.h / 390, visible: true }, 844, 390, size);
      expect(layout.showName).toBe(true); expect(layout.side).toBe(side);
      expect(layout.nameSize).toBeGreaterThanOrEqual(8);
    });
  });
  it("fits the entire name into the available lines instead of clipping or removing it", () => {
    const name = "Victoria Memorial";
    const fit = fitBoardName(name, 27, 2, text => text.length * 4);
    expect(fit.lines.join(" ").replaceAll(" ", "")).toBe(name.replaceAll(" ", ""));
    expect(fit.lines).toHaveLength(2);
    expect(fit.scale).toBeLessThan(1); expect(fit.scale).toBeGreaterThan(.7);
  });
  it("preserves long single-word names and uses uncompressed type when there is room", () => {
    const narrow = fitBoardName("Mattancherry", 21, 3, text => text.length * 4);
    expect(narrow.lines.join("")).toBe("Mattancherry"); expect(narrow.lines.length).toBeLessThanOrEqual(3);
    expect(fitBoardName("Fort Kochi", 90, 3, text => text.length * 8)).toEqual({ lines: ["Fort Kochi"], scale: 1 });
  });
  it("keeps separate place-name words together when the side tile has two lines", () => {
    expect(fitBoardName("Cubbon Park", 20, 2, text => text.length * 4).lines).toEqual(["Cubbon", "Park"]);
    const lines = fitBoardName("Mattancherry", 21, 3, text => text.length * 4).lines;
    expect(lines.every(line => line.length > 1)).toBe(true);
  });
  it("hides clipped and behind-camera labels rather than leaving stale prices on screen", () => {
    const anchor = { id: 1, x: .5, y: .5, w: .08, h: .05, visible: false };
    expect(screenLabelLayout(anchor, 390, 844).visible).toBe(false);
    expect(screenLabelLayout({ ...anchor, x: -1, visible: true }, 390, 844).visible).toBe(false);
  });
});
