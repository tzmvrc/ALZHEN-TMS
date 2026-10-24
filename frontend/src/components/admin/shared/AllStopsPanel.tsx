import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { formatStoreNumber, storeStatusLabels, type StoreNavigationItem } from "./storeWorkspace";

export default function AllStopsPanel({ owner, anchor, items, total, selectedId, query, attention, onQuery, onAttention, onSelect, onAdd, onClose, disabled }: { owner: string; anchor: RefObject<HTMLDivElement | null>; items: readonly StoreNavigationItem[]; total: number; selectedId: string; query: string; attention: boolean; onQuery: (value: string) => void; onAttention: (value: boolean) => void; onSelect: (id: string) => void; onAdd?: () => void; onClose: () => void; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0), size = 12, pages = Math.max(1, Math.ceil(items.length / size)), current = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const body = anchor.current?.closest<HTMLElement>(".trip-flow-body"), node = dialog.current;
    if (!body || !node) return;
    const position = () => { const box = body.getBoundingClientRect(); node.style.left = `${box.left}px`; node.style.top = `${box.top}px`; node.style.width = `${box.width}px`; node.style.height = `${box.height}px`; };
    position(); const observer = new ResizeObserver(position); observer.observe(body); window.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); };
  }, [anchor]);
  useEffect(() => { const node = dialog.current, previous = document.activeElement as HTMLElement | null; node?.showModal(); search.current?.focus({ preventScroll: true }); return () => { node?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); }; }, []);
  return createPortal(<dialog ref={dialog} aria-modal="true" aria-label="All stops" data-stops-owner={owner} className="all-stops-overlay trip-flow" onKeyDown={event => { if (event.key !== "Tab") return; const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node => node.checkVisibility()); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="all-stops-panel"><header><h3>Stops ({total})</h3><button type="button" aria-label="Close all stops" onClick={onClose}><X size={18} /></button></header>
      <div className="all-stops-filters"><label><Search size={15} /><input ref={search} type="search" aria-label="Find store" aria-keyshortcuts="Control+k Meta+k" value={query} placeholder="Find store · Ctrl/Cmd+K" onChange={event => { onQuery(event.target.value); setPage(0); }} /></label><label><input type="checkbox" checked={attention} onChange={event => { onAttention(event.target.checked); setPage(0); }} />Needs attention only</label></div>
      <div className="all-stops-list"><nav aria-label="All delivery stops">{items.slice(current * size, (current + 1) * size).map(item => <button type="button" key={item.id} className="all-stops-item" aria-current={selectedId === item.id ? "true" : undefined} onClick={() => { onSelect(item.id); onClose(); }}><strong>{item.title}</strong><small>{[item.city || "Missing city", item.province || "Missing province"].join(", ")}</small><small>{item.products} product{item.products === 1 ? "" : "s"} · {formatStoreNumber(item.qty)} qty · {formatStoreNumber(item.cbm)} CBM</small><span><i aria-hidden="true" className={`stop-chip-dot ${!item.products && !item.city && !item.province ? "is-empty" : item.status === "ready" ? "is-ready" : "needs-attention"}`} />{!item.products && !item.city && !item.province ? "Empty stop" : storeStatusLabels[item.status]}</span></button>)}</nav>{!items.length && <p className="all-stops-empty">No matching stops. Clear the search or turn off the attention filter.</p>}</div>
      {pages > 1 && <div className="all-stops-pagination"><button type="button" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Next</button></div>}
      <footer>{onAdd && <button type="button" disabled={disabled} onClick={() => { onAdd(); onClose(); }}><Plus size={14} />Add stop</button>}<span>J / K to switch stops</span></footer>
    </div>
  </dialog>, document.body);
}
