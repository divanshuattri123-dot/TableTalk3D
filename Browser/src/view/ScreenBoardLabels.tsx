import { useEffect, useMemo, useRef } from "react";
import { getBoard, isPurchasableTile } from "../engine/board";
import type { BoardSize } from "../engine/types";
import { fitBoardName } from "./readability";
import { pinnedLabelLayout } from "./labelProjection";
import type { LabelPacket } from "./readability";
import { boardSymbol, printedBoardLabel } from "./boardSigns";

export default function ScreenBoardLabels({ size }: { size: BoardSize }) {
  const root = useRef<HTMLDivElement>(null), nodes = useRef(new Map<number, HTMLDivElement>());
  const board = useMemo(() => getBoard(size), [size]);
  useEffect(() => {
    let packet: LabelPacket | undefined, disposed = false;
    const measure = document.createElement("canvas").getContext("2d"), fitted = new Map<number, string>();
    const textWidths = new Map<string, number>();
    const paint = () => {
      if (!packet || !root.current) return;
      const { width, height } = root.current.getBoundingClientRect();
      for (const anchor of packet.labels) {
        const node = nodes.current.get(anchor.id); if (!node) continue;
        const tile = board[anchor.id]!;
        const layout = pinnedLabelLayout(anchor, width, height, size, isPurchasableTile(tile), Boolean(boardSymbol(tile)));
        node.hidden = !layout.visible;
        node.style.transform = layout.transform;
        node.style.width = `${layout.width}px`; node.style.height = `${layout.height}px`;
        node.style.setProperty("--name-size", `${layout.nameSize}px`);
        node.style.setProperty("--name-height", `${layout.nameHeight}px`);
        node.style.setProperty("--price-size", `${layout.priceSize}px`);
        node.dataset.side = String(layout.side);
        node.dataset.currency = String(layout.showCurrency);
        const key = `${Math.round(layout.nameWidth)}:${Math.round(layout.nameHeight)}:${layout.nameSize}`;
        if (!layout.visible || fitted.get(anchor.id) === key) continue;
        fitted.set(anchor.id, key);
        if (measure) measure.font = `600 ${layout.nameSize}px BarlowBoard, sans-serif`;
        const textWidth = (text: string) => {
          const key = `${layout.nameSize}:${text}`;
          let value = textWidths.get(key);
          if (value === undefined) { value = measure?.measureText(text).width ?? text.length * layout.nameSize * .55; textWidths.set(key, value); }
          return value;
        };
        const icon = node.querySelector("image");
        if (icon) { icon.setAttribute("x", String(layout.iconX)); icon.setAttribute("y", String(layout.iconY)); icon.setAttribute("width", String(layout.iconSize)); icon.setAttribute("height", String(layout.iconSize)); }
        const fit = fitBoardName(printedBoardLabel(tile), layout.nameWidth, Math.max(1, Math.min(3, Math.floor(layout.nameHeight / layout.nameSize))), textWidth);
        node.querySelectorAll("text").forEach((line, index) => {
          const text = fit.lines[index] ?? "";
          line.textContent = text;
          line.setAttribute("x", String(layout.nameX + layout.nameWidth / 2));
          line.setAttribute("y", String(layout.nameY + (layout.nameHeight - (fit.lines.length - 1) * layout.nameSize) / 2 + index * layout.nameSize));
          if (text) line.setAttribute("textLength", String(textWidth(text) * fit.scale)); else line.removeAttribute("textLength");
        });
      }
    };
    const receive = (event: Event) => {
      const { kind, value } = (event as CustomEvent<{ kind: string; value: string }>).detail;
      if (kind !== "labels") return;
      const next = JSON.parse(value) as LabelPacket;
      if (next.size !== size) return;
      packet = next; paint();
    };
    window.addEventListener("tabletalk-unity", receive);
    const observer = new ResizeObserver(paint); if (root.current) observer.observe(root.current);
    void document.fonts.load("600 12px BarlowBoard").then(() => { if (!disposed) { textWidths.clear(); fitted.clear(); paint(); } }, () => {});
    return () => { disposed = true; window.removeEventListener("tabletalk-unity", receive); observer.disconnect(); };
  }, [size, board]);
  return <div className="screen-board-labels" ref={root} aria-hidden="true">
    {board.map(tile => <div className={`screen-tile-label${isPurchasableTile(tile) ? " has-price" : ""}`} key={tile.position} hidden ref={node => { if (node) nodes.current.set(tile.position, node); else nodes.current.delete(tile.position); }}>
      <svg className="screen-tile-name" aria-label={printedBoardLabel(tile)}>{boardSymbol(tile) && <image href={`${import.meta.env.BASE_URL}board-icons/${boardSymbol(tile)}.svg`} preserveAspectRatio="xMidYMid meet" />}{[0, 1, 2].map(line => <text key={line} x="50%" textAnchor="middle" dominantBaseline="central" lengthAdjust="spacingAndGlyphs" />)}</svg>
      {isPurchasableTile(tile) && <strong className="screen-tile-price"><i>₹</i>{tile.price}</strong>}
    </div>)}
  </div>;
}
