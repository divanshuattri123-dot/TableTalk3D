import { describe, expect, it } from "vitest";
import { pinnedLabelLayout, quadMatrix } from "./labelProjection";
import type { LabelAnchor } from "./readability";
import { getBoard, isPurchasableTile } from "../engine/board";
import { boardSymbol, printedBoardLabel } from "./boardSigns";
import { fitBoardName } from "./readability";

const project = (m: number[], x: number, y: number) => {
  const w = m[3]! * x + m[7]! * y + m[15]!;
  return { x: (m[0]! * x + m[4]! * y + m[12]!) / w, y: (m[1]! * x + m[5]! * y + m[13]!) / w };
};
const anchor: LabelAnchor = { id: 1, x: .5, y: .5, w: .08, h: .1, visible: true };

describe("tile-printed property labels", () => {
  it.each([
    [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 80 }, { x: 10, y: 80 }],
    [{ x: 40, y: 25 }, { x: 120, y: 30 }, { x: 145, y: 100 }, { x: 5, y: 110 }],
    [{ x: -40, y: -25 }, { x: 190, y: -30 }, { x: 210, y: 150 }, { x: -10, y: 110 }]
  ])("pins all four corners, including perspective and partly clipped tiles", (...corners) => {
    const matrix = quadMatrix(corners, 40, 60)!;
    [[0, 0], [40, 0], [40, 60], [0, 60]].forEach(([x, y], i) => {
      const p = project(matrix, x!, y!);
      expect(p.x).toBeCloseTo(corners[i]!.x, 8); expect(p.y).toBeCloseTo(corners[i]!.y, 8);
    });
  });

  it.each([40, 48, 56, 64] as const)("never reflows the %i-space board's names, icons or price spacing while zooming", size => {
    for (const tile of getBoard(size)) {
      const layouts = [
        pinnedLabelLayout({ ...anchor, id: tile.position }, 667, 375, size, isPurchasableTile(tile), Boolean(boardSymbol(tile))),
        pinnedLabelLayout({ ...anchor, id: tile.position, x: .7, y: .8, w: .28, h: .35 }, 1600, 900, size, isPurchasableTile(tile), Boolean(boardSymbol(tile)))
      ];
      const { transform: _beforeTransform, visible: _beforeVisible, ...before } = layouts[0]!;
      const { transform: _afterTransform, visible: _afterVisible, ...after } = layouts[1]!;
      expect(after).toEqual(before);
      const fits = layouts.map(l => fitBoardName(printedBoardLabel(tile), l.nameWidth, Math.max(1, Math.min(3, Math.floor(l.nameHeight / l.nameSize))), text => text.length * l.nameSize * .48));
      expect(fits[1]).toEqual(fits[0]);
      expect(layouts[1]!.transform).not.toEqual(layouts[0]!.transform);
    }
  });

  it("uses the native label plane rather than a screen-aligned bounding box", () => {
    const corners = [{ x: .2, y: .3 }, { x: .4, y: .32 }, { x: .44, y: .6 }, { x: .18, y: .59 }];
    const layout = pinnedLabelLayout({ ...anchor, localWidth: .855, localHeight: 1.075, corners }, 1000, 500, 40, true);
    const m = layout.transform.slice(9, -1).split(",").map(Number);
    const p = project(m, layout.width, layout.height);
    expect(p.x).toBeCloseTo(440, 8); expect(p.y).toBeCloseTo(300, 8);
  });

  it("keeps labels hidden behind the camera or outside the viewport", () => {
    expect(pinnedLabelLayout({ ...anchor, visible: false }, 667, 375).visible).toBe(false);
    expect(pinnedLabelLayout({ ...anchor, x: -2 }, 667, 375).visible).toBe(false);
  });

  it("rejects a collapsed or non-finite projection instead of showing a stale label", () => {
    expect(quadMatrix(Array.from({ length: 4 }, () => ({ x: 1, y: 1 })), 40, 60)).toBeUndefined();
    expect(quadMatrix([{ x: NaN, y: 1 }], 40, 60)).toBeUndefined();
    expect(quadMatrix([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 0, 60)).toBeUndefined();
  });
});
