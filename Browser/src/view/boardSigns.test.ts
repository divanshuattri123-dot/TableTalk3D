import { describe, expect, it } from "vitest";
import { getBoard, isPurchasableTile } from "../engine/board";
import { boardSymbol, printedBoardLabel } from "./boardSigns";
import { screenLabelLayout } from "./readability";

describe("printed board signs", () => {
  it("gives the four corners and every special space a recognizable symbol", () => {
    expect(getBoard(40).filter(tile => tile.kind !== "property").every(tile => boardSymbol(tile))).toBe(true);
    expect([0,10,20,30].map(id => boardSymbol(getBoard(40)[id]!))).toEqual(["go","jail","parking","police"]);
    expect(boardSymbol(getBoard(40)[12]!)).toBe("bulb"); expect(boardSymbol(getBoard(40)[28]!)).toBe("water");
  });
  it("prints compact uppercase labels without changing game-place names", () => {
    expect(printedBoardLabel(getBoard(40)[7]!)).toBe("CHANCE");
    expect(printedBoardLabel(getBoard(40)[1]!)).toBe("KHUDDA LAHORA"); expect(getBoard(40)[1]!.name).toBe("Khudda Lahora");
  });
  it.each([40,48,56,64] as const)("keeps symbols, names and prices in separate regions on the %i-space board", size => {
    for (const tile of getBoard(size)) {
      const l = screenLabelLayout({id:tile.position,x:.5,y:.5,w:.04,h:.08,visible:true},844,390,size,isPurchasableTile(tile),Boolean(boardSymbol(tile)));
      expect(l.iconX).toBeGreaterThanOrEqual(0); expect(l.iconY).toBeGreaterThanOrEqual(0);
      expect(l.iconX+l.iconSize).toBeLessThanOrEqual(l.width+.001);
      expect(l.nameX+l.nameWidth).toBeLessThanOrEqual(l.width+.001);
      expect(l.nameY+l.nameHeight).toBeLessThanOrEqual(l.height+.001);
      if (isPurchasableTile(tile)) expect(l.nameY+l.nameHeight).toBeLessThan(l.height-l.priceSize);
    }
  });
});
