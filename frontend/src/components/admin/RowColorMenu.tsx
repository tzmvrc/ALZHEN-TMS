import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Paintbrush, RotateCcw } from "lucide-react";
import type { HighlightColor, ReviewAction } from "../../services/review-annotations";

export default function RowColorMenu({ x, y, count, onAction, onClose, returnFocus }: { x: number; y: number; count: number; onAction: (action: ReviewAction) => void; onClose: () => void; returnFocus: HTMLElement | null }) {
  const root = useRef<HTMLDivElement>(null), [colors, setColors] = useState(false);
  useLayoutEffect(() => { const node = root.current; if (!node) return; const box = node.getBoundingClientRect(); node.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`; node.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`; }, [x, y, colors]);
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); }, [x, y]);
  useEffect(() => { const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); }; document.addEventListener("pointerdown", outside, true); return () => { document.removeEventListener("pointerdown", outside, true); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); }; }, [onClose, returnFocus]);
  const choose = (action: ReviewAction) => { onAction(action); onClose(); };
  return createPortal(<div ref={root} role="menu" aria-label={`Row review actions for ${count} rows`} className="row-color-menu" style={{ left: x, top: y }} onKeyDown={event => {
    if (["Escape", "Tab"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")], current = items.indexOf(document.activeElement as HTMLButtonElement);
    items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }}><small>{count} {count === 1 ? "row" : "rows"} selected</small><button role="menuitem" type="button" onClick={() => choose({ type: "review" })}><CheckCircle2 size={14} />Mark as reviewed (remove highlight)</button><button role="menuitem" type="button" aria-expanded={colors} onClick={() => setColors(value => !value)}><Paintbrush size={13} />Highlight color ▸</button>{colors && <div role="group" aria-label="Highlight color">{(["yellow", "red", "green", "blue", "none"] as HighlightColor[]).map(color => <button role="menuitem" type="button" key={color} onClick={() => choose({ type: "color", color })}><i aria-hidden="true" className={`review-color-swatch is-${color}`} />{color[0].toUpperCase() + color.slice(1)}</button>)}</div>}<button role="menuitem" type="button" onClick={() => choose({ type: "reset" })}><RotateCcw size={14} />Reset to automatic</button></div>, document.body);
}
