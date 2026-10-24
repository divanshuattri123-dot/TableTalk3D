import { describe, expect, it } from "vitest";
import { getBoard, isPurchasableTile } from "../engine/board";
import { boardSymbol } from "./boardSigns";
import { paintProjectedLabel } from "./labelPaint";
import { pinnedLabelLayout } from "./labelProjection";

const anchor = { id: 1, x: .5, y: .5, w: .08, h: .1, visible: true };
const layout = () => pinnedLabelLayout(anchor, 667, 375, 40, true);

function surface() {
  const writes: string[] = [];
  const style = new Proxy({ setProperty: (name: string) => { writes.push(name); } }, {
    set: (target, key, value) => { writes.push(String(key)); return Reflect.set(target, key, value); }
  }) as unknown as CSSStyleDeclaration;
  const dataset = new Proxy({}, {
    set: (target, key, value) => { writes.push(`data-${String(key)}`); return Reflect.set(target, key, value); }
  }) as DOMStringMap;
  let hidden = true;
  const node = { style, dataset, get hidden() { return hidden; }, set hidden(value: boolean) { hidden = value; writes.push("hidden"); } };
  return { node, writes };
}

describe("low-cost projected label painting", () => {
  it("initializes all label styles and visibility", () => {
    const { node, writes } = surface(), next = layout();
    paintProjectedLabel(node, next);
    expect(node.hidden).toBe(false);
    expect(node.style.transform).toBe(next.transform);
    expect(writes).toHaveLength(9);
    expect(node.dataset.side).toBe("0");
  });

  it("does no DOM work for a duplicate packet or a font-ready repaint with unchanged geometry", () => {
    const { node, writes } = surface(), first = layout();
    paintProjectedLabel(node, first); writes.length = 0;
    paintProjectedLabel(node, { ...first }, first);
    expect(writes).toEqual([]);
  });

  it("moves only the plane when the camera zooms or pans", () => {
    const { node, writes } = surface(), first = layout();
    paintProjectedLabel(node, first); writes.length = 0;
    const zoomed = pinnedLabelLayout({ ...anchor, x: .6, w: .2, h: .3 }, 1600, 900, 40, true);
    paintProjectedLabel(node, zoomed, first);
    expect(writes).toEqual(["transform"]);
    expect(node.style.width).toBe(`${first.width}px`);
    expect(node.style.height).toBe(`${first.height}px`);
  });

  it("does not update hidden planes and restores their latest transform before showing them", () => {
    const { node, writes } = surface(), first = layout();
    paintProjectedLabel(node, first); writes.length = 0;
    const hidden = { ...first, visible: false, transform: "none" };
    paintProjectedLabel(node, hidden, first);
    expect(writes).toEqual(["hidden"]);
    expect(node.hidden).toBe(true); writes.length = 0;
    paintProjectedLabel(node, { ...hidden }, hidden);
    expect(writes).toEqual([]);
    paintProjectedLabel(node, first, hidden);
    expect(writes).toEqual(["hidden", "transform"]);
    expect(node.hidden).toBe(false);
    expect(node.style.transform).toBe(first.transform);
  });

  it("still applies genuine printing changes", () => {
    const { node, writes } = surface(), first = layout();
    paintProjectedLabel(node, first); writes.length = 0;
    paintProjectedLabel(node, { ...first, width: first.width + 1, priceSize: first.priceSize + 1, side: 1, showCurrency: !first.showCurrency }, first);
    expect(writes).toEqual(["width", "--price-size", "data-side", "data-currency"]);
  });

  it.each([40, 48, 56, 64] as const)("keeps a %i-tile camera frame to one transform write per visible label", size => {
    let total = 0;
    for (const tile of getBoard(size)) {
      const { node, writes } = surface();
      const before = pinnedLabelLayout({ ...anchor, id: tile.position }, 667, 375, size, isPurchasableTile(tile), Boolean(boardSymbol(tile)));
      const after = pinnedLabelLayout({ ...anchor, id: tile.position, x: .6, y: .4 }, 1600, 900, size, isPurchasableTile(tile), Boolean(boardSymbol(tile)));
      paintProjectedLabel(node, before); writes.length = 0;
      paintProjectedLabel(node, after, before);
      expect(writes).toEqual(["transform"]); total += writes.length;
    }
    expect(total).toBe(size);
  });
});
