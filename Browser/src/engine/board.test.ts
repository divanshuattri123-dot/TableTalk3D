import { describe, expect, it } from "vitest";
import { BOARD, classicPosition, getBoard, isPurchasableTile } from "./board";
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

  it.each([40, 48, 56, 64] as const)("keeps the requested local names and existing deed economics on the %i-space board", size => {
    const places = [
      [1, "Khudda Lahora", "brown", 60, 50, [2, 10, 30, 90, 160, 250]],
      [3, "Nayagaon", "brown", 60, 50, [4, 20, 60, 180, 320, 450]],
      [6, "Sector 24", "lightBlue", 100, 50, [6, 30, 90, 270, 400, 550]],
      [8, "Sector 17", "lightBlue", 100, 50, [6, 30, 90, 270, 400, 550]],
      [9, "3B2 Mohali", "lightBlue", 120, 50, [8, 40, 100, 300, 450, 600]],
      [11, "Zirakpur", "pink", 140, 100, [10, 50, 150, 450, 625, 750]],
      [31, "GB Road", "green", 300, 200, [26, 130, 390, 900, 1100, 1275]]
    ] as const;
    for (const [position, name, group, price, houseCost, rent] of places) {
      expect(getBoard(size)[classicPosition(position, size)]).toMatchObject({
        position: classicPosition(position, size), name, boardLabel: name,
        kind: "property", group, price, mortgageValue: price / 2, houseCost, rent
      });
      expect(getBoard(size).filter(tile => tile.name === name)).toHaveLength(1);
    }
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
