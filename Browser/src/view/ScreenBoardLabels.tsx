import { useEffect, useMemo, useRef } from "react";
import { getBoard, isPurchasableTile } from "../engine/board";
import type { BoardSize } from "../engine/types";
import { screenLabelLayout } from "./readability";
import type { LabelPacket } from "./readability";

export default function ScreenBoardLabels({ size }: { size: BoardSize }) {
  const root = useRef<HTMLDivElement>(null), nodes = useRef(new Map<number, HTMLDivElement>());
  const board = useMemo(() => getBoard(size), [size]);
  useEffect(() => {
    let packet: LabelPacket | undefined;
    const paint = () => {
      if (!packet || !root.current) return;
      const { width, height } = root.current.getBoundingClientRect();
      for (const anchor of packet.labels) {
        const node = nodes.current.get(anchor.id); if (!node) continue;
        const layout = screenLabelLayout(anchor, width, height);
        node.hidden = !layout.visible;
        node.style.transform = `translate(${layout.x}px, ${layout.y}px) translate(-50%, -50%)`;
        node.style.width = `${layout.width}px`; node.style.height = `${layout.height}px`;
        node.style.setProperty("--name-size", `${layout.nameSize}px`);
        node.style.setProperty("--price-size", `${layout.priceSize}px`);
        node.dataset.names = String(layout.showName); node.dataset.currency = String(layout.width >= 26);
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
    return () => { window.removeEventListener("tabletalk-unity", receive); observer.disconnect(); };
  }, [size]);
  return <div className="screen-board-labels" ref={root} aria-hidden="true">
    {board.map(tile => <div className={`screen-tile-label${isPurchasableTile(tile) ? " has-price" : ""}`} key={tile.position} hidden ref={node => { if (node) nodes.current.set(tile.position, node); else nodes.current.delete(tile.position); }}>
      <span className="screen-tile-name">{tile.boardLabel ?? tile.name}</span>
      {isPurchasableTile(tile) && <strong className="screen-tile-price"><i>₹</i>{tile.price}</strong>}
    </div>)}
  </div>;
}
