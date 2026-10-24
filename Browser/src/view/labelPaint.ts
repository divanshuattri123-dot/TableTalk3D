import type { pinnedLabelLayout } from "./labelProjection";

export type ProjectedLabelLayout = ReturnType<typeof pinnedLabelLayout>;
type LabelSurface = Pick<HTMLDivElement, "hidden" | "style" | "dataset">;

export function paintProjectedLabel(node: LabelSurface, next: ProjectedLabelLayout, previous?: ProjectedLabelLayout) {
  if (previous?.visible !== next.visible) node.hidden = !next.visible;
  // Camera motion changes the tile plane, not its printing. Avoid dirtying every SVG's layout.
  if (next.visible && (!previous?.visible || previous.transform !== next.transform)) node.style.transform = next.transform;
  if (previous?.width !== next.width) node.style.width = `${next.width}px`;
  if (previous?.height !== next.height) node.style.height = `${next.height}px`;
  if (previous?.nameSize !== next.nameSize) node.style.setProperty("--name-size", `${next.nameSize}px`);
  if (previous?.nameHeight !== next.nameHeight) node.style.setProperty("--name-height", `${next.nameHeight}px`);
  if (previous?.priceSize !== next.priceSize) node.style.setProperty("--price-size", `${next.priceSize}px`);
  if (previous?.side !== next.side) node.dataset.side = String(next.side);
  if (previous?.showCurrency !== next.showCurrency) node.dataset.currency = String(next.showCurrency);
}
