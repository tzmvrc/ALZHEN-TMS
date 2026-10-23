import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import StatusChip from "./StatusChip";
import { focusRing } from "./styles";
import { formatStoreNumber, storeStatusLabels, type StoreNavigationItem, type StoreWorkspaceMemory } from "./storeWorkspace";
export type StoreRailItem = { id: string; title: string; description?: string; trailing?: ReactNode } & Partial<StoreNavigationItem>;
const ROW = 152, WIDTH = 248;
export default function StoreRail({ items, selectedId, onSelect, disabled = false, memory }: { items: readonly StoreRailItem[]; selectedId: string; onSelect: (id: string) => void; disabled?: boolean; memory?: StoreWorkspaceMemory }) {
  const viewport = useRef<HTMLElement>(null);
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const [offset, setOffset] = useState(memory?.rail ?? 0), [extent, setExtent] = useState(608);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const node = viewport.current; if (!node) return;
    const measure = () => setExtent(desktop ? node.clientHeight : node.clientWidth);
    const observer = new ResizeObserver(measure); observer.observe(node); measure();
    if (desktop) node.scrollTop = memory?.rail ?? 0; else node.scrollLeft = memory?.rail ?? 0;
    return () => observer.disconnect();
  }, [desktop, memory]);
  useLayoutEffect(() => {
    const node = viewport.current, index = items.findIndex(item => item.id === selectedId);
    if (!node || index < 0) return;
    const unit = desktop ? ROW : WIDTH, start = index * unit, position = desktop ? node.scrollTop : node.scrollLeft;
    const size = desktop ? node.clientHeight : node.clientWidth;
    if (start < position || start + unit > position + size) {
      const next = start < position ? start : start + unit - size;
      if (desktop) node.scrollTop = next; else node.scrollLeft = next;
      setOffset(next); if (memory) memory.rail = next;
    }
    // Values changing within a store must not scroll its rail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, desktop, items.length]);
  const unit = desktop ? ROW : WIDTH, virtual = items.length > 100;
  const start = virtual ? Math.min(Math.max(0, items.length - 1), Math.max(0, Math.floor(offset / unit) - 4)) : 0;
  const end = virtual ? Math.min(items.length, Math.max(start + 1, Math.ceil((offset + extent) / unit) + 4)) : items.length;
  const spacer = (count: number) => desktop ? { height: count * ROW, flexShrink: 0 } : { width: count * WIDTH, flexShrink: 0 };
  return <nav ref={viewport} aria-label="Delivery stores" className={`flex min-w-0 overflow-auto rounded-xl bg-slate-100/60 p-1 lg:flex-col ${desktop ? "max-h-[72vh]" : ""}`} style={desktop ? { height: Math.min(items.length * ROW + 8, 608) } : undefined} onScroll={event => { const next = desktop ? event.currentTarget.scrollTop : event.currentTarget.scrollLeft; setOffset(next); if (memory) memory.rail = next; }}>
    {virtual && <div aria-hidden="true" style={spacer(start)} />}
    {items.slice(start, end).map(item => <div key={item.id} style={{ height: ROW, width: desktop ? "100%" : WIDTH, flexShrink: 0 }} className="p-1"><button type="button" disabled={disabled} aria-current={item.id === selectedId ? "true" : undefined} onClick={() => onSelect(item.id)} className={`flex h-full w-full items-start gap-2 rounded-xl border p-3 text-left transition disabled:opacity-50 ${focusRing} ${item.id === selectedId ? "border-[#2678b9] bg-blue-50 text-[#0b2341]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#2678b9]" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs" title={item.title}>{item.title}</strong><span className="mt-1 block truncate text-[11px] text-slate-500">{item.description ?? [item.city || "Missing city", item.province || "Missing province"].join(", ")}</span>
        {item.products != null && <span className="my-1 block text-[11px] tabular-nums">{item.products} products {"\u00b7"} {formatStoreNumber(item.qty ?? 0)} Qty {"\u00b7"} {formatStoreNumber(item.cbm ?? 0)} CBM</span>}
        {item.status && <span className="flex items-center gap-1"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.status === "ready" ? "bg-emerald-500" : item.status === "location" ? "bg-amber-500" : "bg-rose-500"}`} /><StatusChip label={storeStatusLabels[item.status]} tone={item.status === "ready" ? "success" : item.status === "location" ? "warning" : "danger"} /></span>}{item.trailing}
      </span></button></div>)}
    {virtual && <div aria-hidden="true" style={spacer(items.length - end)} />}
  </nav>;
}
