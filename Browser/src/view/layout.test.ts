import { describe, expect, it } from "vitest";
import { boardFrustum, boardSpan, tileLayout } from "./layout";

describe.each([40, 48, 56, 64])("readable %i-space board layout", (size) => {
  it("joins every rectangular space to its neighbours without gaps or overlap", () => {
    const side = size / 4;
    for (let position = 0; position < size; position += 1) {
      const tile = tileLayout(position, size), next = tileLayout((position + 1) % size, size);
      expect(Math.abs(tile.x) + tile.width / 2).toBeLessThanOrEqual(boardSpan(size) / 2 + .0001);
      expect(Math.abs(tile.z) + tile.depth / 2).toBeLessThanOrEqual(boardSpan(size) / 2 + .0001);
      const horizontal = Math.abs(tile.x - next.x) > .001;
      const distance = horizontal ? Math.abs(tile.x - next.x) : Math.abs(tile.z - next.z);
      expect(distance).toBeCloseTo(horizontal ? (tile.width + next.width) / 2 : (tile.depth + next.depth) / 2);
      expect(tile.corner).toBe(position % side === 0);
    }
  });
  it("fits the whole board tightly at portrait, square and landscape aspect ratios", () => {
    for (const aspect of [.65, 1, 1.6]) {
      const view = boardFrustum(size, aspect);
      expect(view.width).toBeGreaterThan(boardSpan(size));
      expect(view.height).toBeGreaterThan(boardSpan(size));
      expect(Math.min(view.width, view.height)).toBeLessThan(boardSpan(size) * 1.05);
    }
  });
});
