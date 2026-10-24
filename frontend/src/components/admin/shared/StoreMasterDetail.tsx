import { useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import StopsBar from "./StopsBar";
import AllStopsPanel from "./AllStopsPanel";
import { type StoreNavigationItem, type StoreWorkspaceMemory, useStoreWorkspaceMemory, updateWorkspace, carryProductView } from "./storeWorkspace";

type Props = { items: readonly StoreNavigationItem[]; memory?: StoreWorkspaceMemory; children: (item: StoreNavigationItem) => ReactNode; toolbar?: ReactNode; helper?: ReactNode; onAdd?: () => void; disabled?: boolean };
/** Full-width stop workspace. Search and paging live in the overlay, not a second column. */
export default function StoreMasterDetail({ items, memory: provided, children, toolbar, helper, onAdd, disabled }: Props) {
  const local = useStoreWorkspaceMemory(), memory = provided ?? local;
  const [, refresh] = useReducer(value => value + 1, 0), [open, setOpen] = useState(false);
  const owner = useId(), panelId = `${owner}-store-editor`, root = useRef<HTMLDivElement>(null);
  const previous = useRef<readonly StoreNavigationItem[]>([]);
  const filtered = useMemo(() => {
    const terms = memory.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(item => (!memory.attention || item.status !== "ready") && terms.every(term => item.searchText.toLocaleLowerCase().includes(term)));
  }, [items, memory.search, memory.attention]);
  const active = items.find(item => item.id === memory.selected) ?? items.find(item => item.members.some(id => memory.members.includes(id))) ?? items[0];
  useLayoutEffect(() => {
    const prior = previous.current, priorIndex = prior.findIndex(item => item.id === memory.selected);
    const added = items.filter(item => !prior.some(old => old.id === item.id || old.members.some(id => item.members.includes(id))));
    const member = items.find(item => item.members.some(id => memory.members.includes(id)));
    const next = prior.length && added.length ? added.at(-1) : items.find(item => item.id === memory.selected) ?? member ?? items[Math.max(0, priorIndex - 1)] ?? items[0];
    previous.current = items;
    if (!next) return;
    const old = memory.selected;
    if (old !== next.id && member?.id === next.id && memory.products[old]) carryProductView(memory, old, next.id);
    updateWorkspace(memory, { selected: next.id, members: next.members });
    if (old !== next.id) refresh();
  }, [items, memory]);
  const select = (id: string) => { const item = items.find(candidate => candidate.id === id); if (!item) return; updateWorkspace(memory, { selected: id, members: item.members }); refresh(); };
  const move = (offset: number) => { const index = filtered.findIndex(item => item.id === active?.id), item = filtered[index + offset]; if (item) { select(item.id); setOpen(false); } };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !root.current?.checkVisibility()) return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      const dialogs = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')], top = dialogs.at(-1);
      if (top && !top.contains(root.current) && top.dataset.stopsOwner !== owner) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        const workspace = element?.closest("[data-store-workspace]") ?? (top?.dataset.stopsOwner === owner ? root.current : top?.querySelector("[data-store-workspace]"));
        if (workspace !== root.current) return;
        event.preventDefault(); setOpen(true); const input = top?.querySelector<HTMLInputElement>('input[aria-label="Find store"]'); input?.focus(); input?.select(); return;
      }
      if ((!root.current.contains(element) && top?.dataset.stopsOwner !== owner) || event.ctrlKey || event.metaKey || event.altKey || element?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return;
      if (["j", "k"].includes(event.key.toLowerCase())) { event.preventDefault(); move(event.key.toLowerCase() === "j" ? 1 : -1); }
    };
    document.addEventListener("keydown", handler); return () => document.removeEventListener("keydown", handler);
  });
  return <div ref={root} data-store-workspace="" className="store-workspace" aria-label="Store and product workspace">
    <StopsBar items={items} selectedId={active?.id ?? ""} panelId={panelId} onSelect={select} onOpen={() => setOpen(true)} onAdd={onAdd} disabled={disabled} actions={toolbar} />
    {helper && <div className="stops-workspace-helper">{helper}</div>}
    <div role="tabpanel" id={panelId} aria-label="Selected stop" className="store-workspace-editor">{active ? children(active) : <p className="text-sm text-slate-500">No stops yet.</p>}</div>
    {open && <AllStopsPanel owner={owner} anchor={root} total={items.length} items={filtered} selectedId={active?.id ?? ""} query={memory.search} attention={memory.attention} onQuery={value => { updateWorkspace(memory, { search: value }); refresh(); }} onAttention={value => { updateWorkspace(memory, { attention: value }); refresh(); }} onSelect={select} onAdd={onAdd} disabled={disabled} onClose={() => setOpen(false)} />}
  </div>;
}
