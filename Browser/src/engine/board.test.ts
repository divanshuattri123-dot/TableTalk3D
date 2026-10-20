import { describe, expect, it } from "vitest";
import { BOARD, getBoard, isPurchasableTile } from "./board";
import { formatRupees } from "./currency";

describe("India edition board", () => {
  it("keeps the classic forty-space layout and familiar corner positions", () => {
    expect(BOARD).toHaveLength(40);
    expect([BOARD[0]?.name, BOARD[10]?.name, BOARD[20]?.name, BOARD[30]?.name]).toEqual([
      "GO", "Jail / Just Visiting", "Free Parking", "Go To Jail"
    ]);
    expect(BOARD.filter((tile) => tile.kind === "property")).toHaveLength(22);
    expect(BOARD.filter((tile) => tile.kind === "railroad")).toHaveLength(4);
  });

  it("gives every deed an Indian place, short board label and useful landmark detail", () => {
    for (const size of [40, 48, 56, 64] as const) {
      const deeds = getBoard(size).filter(isPurchasableTile);
      expect(deeds.length).toBeGreaterThanOrEqual(28);
      for (const deed of deeds) {
        expect(deed.region, deed.name).toBeTruthy();
        expect(deed.boardLabel, deed.name).toBeTruthy();
        expect(deed.detail, deed.name).toBeTruthy();
      }
    }
    expect(getBoard(40).map((tile) => tile.name)).toContain("Gateway of India");
    expect(getBoard(40).map((tile) => tile.name)).toContain("Hawa Mahal");
    expect(getBoard(64).map((tile) => tile.name)).toContain("Radhanagar Beach");
  });
});

describe("Indian rupee display", () => {
  it("uses lakhs-style digit grouping consistently", () => {
    expect(formatRupees(0)).toBe("₹0");
    expect(formatRupees(1500)).toBe("₹1,500");
    expect(formatRupees(12345678)).toBe("₹1,23,45,678");
    expect(formatRupees(-50)).toBe("−₹50");
  });
});
