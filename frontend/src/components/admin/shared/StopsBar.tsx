import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import StopChip from "./StopChip";
import type { StoreNavigationItem } from "./storeWorkspace";

export default function StopsBar({ items, selectedId, panelId, onSelect, onOpen, onAdd, disabled, actions }: { items: readonly StoreNavigationItem[]; selectedId: string; panelId: string; onSelect: (id: string) => void; onOpen: () => void; onAdd?: () => void; disabled?: boolean; actions?: ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => { const node = scroll.current; if (!node) return; const next = { left: node.scrollLeft > 2, right: node.scrollLeft < node.scrollWidth - node.clientWidth - 2 }; setEdges(current => current.left === next.left && current.right === next.right ? current : next); };
  useLayoutEffect(() => { const node = scroll.current; if (!node) return; const observer = new ResizeObserver(measure); observer.observe(node); observer.observe(node.firstElementChild!); return () => observer.disconnect(); }, []);
  const selectedTitle = items.find(item => item.id === selectedId)?.title;
  useLayoutEffect(() => {
    const node = scroll.current, active = node?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!node || !active) return;
    const bounds = node.getBoundingClientRect(), chip = active.getBoundingClientRect();
    if (chip.left < bounds.left) node.scrollLeft -= bounds.left - chip.left + 8;
    else if (chip.right > bounds.right) node.scrollLeft += chip.right - bounds.right + 8;
  }, [selectedId, items.length, selectedTitle]);
  const arrow = (amount: number) => scroll.current?.scrollBy({ left: amount, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return <div className="stops-bar">
    <div className={`stops-strip-shell ${edges.left ? "has-left" : ""} ${edges.right ? "has-right" : ""}`} title="J / K to switch stops; arrow keys move between stop chips">
      <button type="button" className="stops-strip-arrow" aria-label="Scroll stops left" disabled={!edges.left} onClick={() => arrow(-260)}><ChevronLeft size={14} /></button>
      <div ref={scroll} className="stops-strip-scroll" onScroll={measure}><div className="stops-strip-content">
        <div role="tablist" aria-label="Delivery stops" className="stops-tabs" onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); const index = items.findIndex(item => item.id === selectedId);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
          if (items[next]) { onSelect(items[next].id); event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus({ preventScroll: true }); }
        }}>{items.map((item, index) => <StopChip key={item.id} item={item} number={index + 1} active={item.id === selectedId} panelId={panelId} onSelect={() => onSelect(item.id)} />)}</div>
        {onAdd && <button type="button" className="stop-chip stop-chip-add" disabled={disabled} onClick={onAdd}><Plus size={13} />Add stop</button>}
      </div></div>
      <button type="button" className="stops-strip-arrow" aria-label="Scroll stops right" disabled={!edges.right} onClick={() => arrow(260)}><ChevronRight size={14} /></button>
    </div>
    <div className="stops-bar-actions"><button type="button" className="stops-all-button" aria-haspopup="dialog" onClick={onOpen}><List size={14} /><span>All stops ({items.length})</span></button>{actions}</div>
  </div>;
}
