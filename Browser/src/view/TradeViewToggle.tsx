import { createPortal } from "react-dom";

export function MinimiseTrade({ onClick }: { onClick: () => void }) {
  return <button className="trade-minimise" type="button" onClick={onClick} aria-label="Minimise trade">
    <span aria-hidden="true">−</span> Minimise
  </button>;
}

export function ReopenTrade({ onClick, label = "Reopen trade" }: { onClick: () => void; label?: string }) {
  // The button stays visible when a finance overlay and its parent decision are hidden.
  return createPortal(
    <button className="trade-reopen" type="button" onClick={onClick} autoFocus>{label}</button>,
    document.body
  );
}
