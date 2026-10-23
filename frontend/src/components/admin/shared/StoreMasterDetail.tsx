import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import StoreRail from "./StoreRail";
import StatChip from "./StatChip";
import EmptyState from "./EmptyState";
import { fieldControl, secondaryAction } from "./styles";
import { formatStoreNumber, type StoreNavigationItem, type StoreWorkspaceMemory, useStoreWorkspaceMemory } from "./storeWorkspace";

type Props = { items: readonly StoreNavigationItem[]; memory?: StoreWorkspaceMemory; children: (item: StoreNavigationItem) => ReactNode };
export default function StoreMasterDetail({ items, memory: provided, children }: Props) {
  const local = useStoreWorkspaceMemory(), memory = provided ?? local;
  const [, refresh] = useReducer(value => value + 1, 0);
  const root = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null), detail = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const terms = memory.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(item => (!memory.attention || item.status !== "ready") && terms.every(term => item.searchText.toLocaleLowerCase().includes(term)));
  }, [items, memory.search, memory.attention]);
  const selected = items.find(item => item.id === memory.selected) ?? items.find(item => item.members.some(id => memory.members.includes(id)));
  const active = filtered.find(item => item.id === selected?.id) ?? filtered[0];
  const previousId = memory.selected;
  // Removing a store's first product can change its display ID. Other source
  // members identify the same store, so its product view follows those members.
  if (active && previousId !== active.id && active.members.some(id => memory.members.includes(id))) {
    if (memory.products[previousId] && !memory.products[active.id]) memory.products[active.id] = memory.products[previousId];
    memory.details[active.id] ??= memory.details[previousId] ?? 0;
  }
  useLayoutEffect(() => {
    if (!active) return;
    memory.selected = active.id; memory.members = active.members;
    if (detail.current) detail.current.scrollTop = memory.details[active.id] ?? 0;
    // Refreshing source values must not reset the current scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  useLayoutEffect(() => { if (active) memory.members = active.members; }, [active, memory]);
  const select = (id: string) => {
    const item = items.find(candidate => candidate.id === id); if (!item) return;
    if (active && detail.current) memory.details[active.id] = detail.current.scrollTop;
    memory.selected = id; memory.members = item.members; refresh();
  };
  const index = filtered.findIndex(item => item.id === active?.id);
  const move = (offset: number) => { const item = filtered[index + offset]; if (item) select(item.id); };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      if (dialogs.length && !dialogs[dialogs.length - 1].contains(root.current)) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        const focusedWorkspace = document.activeElement?.closest("[data-store-workspace]");
        const groupWorkspace = document.activeElement?.closest("[data-trip-group]")?.querySelector("[data-store-workspace]");
        const owner = focusedWorkspace ?? groupWorkspace ?? (dialogs[dialogs.length - 1] ?? document).querySelector("[data-store-workspace]");
        if (owner !== root.current) return;
        event.preventDefault(); search.current?.focus(); search.current?.select(); return;
      }
      if (!root.current?.contains(element) || event.ctrlKey || event.metaKey || event.altKey || element?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return;
      if (event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k") { event.preventDefault(); move(event.key.toLowerCase() === "j" ? 1 : -1); }
    };
    document.addEventListener("keydown", handler); return () => document.removeEventListener("keydown", handler);
  });
  const totals = items.reduce((sum, item) => ({ products: sum.products + item.products, qty: sum.qty + item.qty, cbm: sum.cbm + item.cbm, attention: sum.attention + Number(item.status !== "ready") }), { products: 0, qty: 0, cbm: 0, attention: 0 });
  return <div ref={root} data-store-workspace="" className="min-w-0 space-y-4" aria-label="Store and product workspace">
    <div className="flex flex-wrap gap-2" aria-label="Store summary"><StatChip label="Stores" value={items.length} /><StatChip label="Products" value={totals.products} /><StatChip label="Qty" value={formatStoreNumber(totals.qty)} /><StatChip label="CBM" value={formatStoreNumber(totals.cbm)} /><StatChip label="Needing attention" value={totals.attention} /></div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative min-w-56 flex-1"><span className="sr-only">Jump to store</span><Search aria-hidden="true" size={16} className="absolute left-3 top-3 text-slate-400" /><input ref={search} type="search" aria-keyshortcuts="Control+k Meta+k" className={`${fieldControl} w-full pl-9`} placeholder="Jump to store · Ctrl/Cmd+K" value={memory.search} onChange={event => { memory.search = event.target.value; refresh(); }} /></label>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" className="h-4 w-4 accent-[#2678b9] focus-visible:ring-2 focus-visible:ring-[#2678b9]" checked={memory.attention} onChange={event => { memory.attention = event.target.checked; refresh(); }} />Needs attention only</label>
      <div className="flex items-center gap-2"><button type="button" className={secondaryAction} aria-label="Previous store" aria-keyshortcuts="k" disabled={index <= 0} onClick={() => move(-1)}><ChevronLeft size={14} />Prev</button><span className="text-xs tabular-nums text-slate-500">{index < 0 ? 0 : index + 1}/{filtered.length}</span><button type="button" className={secondaryAction} aria-label="Next store" aria-keyshortcuts="j" disabled={index < 0 || index >= filtered.length - 1} onClick={() => move(1)}>Next<ChevronRight size={14} /></button></div>
    </div>
    <p className="text-xs text-slate-500">Search destination, customer, city, province, DR or product code. J/K switches stores while focused outside an input.</p>
    {active ? <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]"><aside className="min-w-0 lg:sticky lg:top-0"><StoreRail items={filtered} selectedId={active.id} onSelect={select} memory={memory} /></aside><div ref={detail} className="max-h-[65vh] min-w-0 overflow-y-auto pr-1 lg:max-h-[72vh]" onScroll={event => { memory.details[active.id] = event.currentTarget.scrollTop; }}>{children(active)}</div></div> : <EmptyState title="No matching stores" description="Clear the search or turn off the attention filter to show other stores." />}
  </div>;
}
