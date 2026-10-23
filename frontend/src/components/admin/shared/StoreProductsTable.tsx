import { Fragment, useLayoutEffect, useReducer, useRef, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { fieldControl, secondaryAction } from "./styles";
import { productView, type StoreWorkspaceMemory, useStoreWorkspaceMemory } from "./storeWorkspace";
export type StoreProductColumn<T> = { key: string; label: string; render: (row: T, index: number) => ReactNode };
export default function StoreProductsTable<T>({ rows, storeId, memory: provided, rowKey, searchText, columns, renderMore, isExpanded, onToggle, moreLabel, hasMore, onRemove, removeLabel, canRemove, onAdd, disabled = false }: {
  rows: readonly T[]; storeId: string; memory?: StoreWorkspaceMemory;
  rowKey: (row: T) => string; searchText: (row: T) => string; columns: readonly StoreProductColumn<T>[];
  renderMore: (row: T) => ReactNode; isExpanded?: (row: T) => boolean; onToggle?: (row: T) => void;
  moreLabel?: (row: T) => string; hasMore?: (row: T) => boolean;
  onRemove?: (row: T, index: number) => void; removeLabel?: (row: T, index: number) => string;
  canRemove?: (row: T) => boolean; onAdd?: () => void; disabled?: boolean;
}) {
  const local = useStoreWorkspaceMemory(), memory = provided ?? local, view = productView(memory, storeId);
  const [, refresh] = useReducer(value => value + 1, 0), scroller = useRef<HTMLDivElement>(null);
  const beforeAdd = useRef<Set<string> | null>(null);
  const query = view.search.trim().toLocaleLowerCase();
  const filtered = rows.map((row, index) => ({ row, index })).filter(({ row }) => searchText(row).toLocaleLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(filtered.length / view.size)), page = Math.min(view.page, pages - 1);
  view.page = page;
  useLayoutEffect(() => { if (scroller.current) { scroller.current.scrollTop = view.top; scroller.current.scrollLeft = view.left; } }, [view]);
  const resetScroll = () => { view.top = 0; if (scroller.current) scroller.current.scrollTop = 0; };
  const changePage = (next: number) => { view.page = next; resetScroll(); refresh(); };
  useLayoutEffect(() => {
    if (!beforeAdd.current) return;
    const index = rows.findIndex(row => !beforeAdd.current!.has(rowKey(row)));
    if (index < 0) return;
    beforeAdd.current = null;
    view.search = ""; view.page = Math.floor(index / view.size); resetScroll(); refresh();
  }, [rows, view, rowKey]);
  return <section aria-label="Products for selected store" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-3"><label className="min-w-40 flex-1"><span className="sr-only">Search products</span><input type="search" className={`${fieldControl} w-full`} placeholder="Search products, DR or source fields" value={view.search} onChange={event => { view.search = event.target.value; view.page = 0; resetScroll(); refresh(); }} /></label><label className="flex items-center gap-2 text-xs text-slate-600">Rows per page<select className={fieldControl} value={view.size} onChange={event => { view.size = Number(event.target.value); view.page = 0; resetScroll(); refresh(); }}>{[10, 25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label></div>
    <div ref={scroller} tabIndex={0} role="region" aria-label="Scrollable product rows" className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-[#2678b9]" onScroll={event => { view.top = event.currentTarget.scrollTop; view.left = event.currentTarget.scrollLeft; }}>
      <table className="w-full min-w-[700px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-slate-600"><tr>{columns.map(column => <th scope="col" key={column.key} className="px-3 py-3 font-semibold">{column.label}</th>)}<th scope="col" className="px-3 py-3">Actions</th></tr></thead><tbody>
        {filtered.slice(page * view.size, (page + 1) * view.size).map(({ row, index }) => {
          const key = rowKey(row), expanded = isExpanded ? isExpanded(row) : Boolean(view.expanded[key]);
          return <Fragment key={key}><tr className="border-t border-slate-100 align-top hover:bg-slate-50/50">{columns.map(column => <td key={column.key} className="min-w-28 px-3 py-2 tabular-nums">{column.render(row, index)}</td>)}<td className="px-3 py-2"><div className="flex gap-1"><button type="button" className={secondaryAction} aria-expanded={expanded} aria-label={moreLabel?.(row) ?? `${expanded ? "Hide" : "Show"} more details for product ${index + 1}`} onClick={() => { if (onToggle) onToggle(row); else { view.expanded[key] = !expanded; refresh(); } }}><ChevronDown aria-hidden="true" size={12} className={expanded ? "rotate-180" : ""} />More{hasMore?.(row) && <span aria-label="Additional details present">•</span>}</button>{onRemove && <button type="button" className={secondaryAction} disabled={disabled || (canRemove ? !canRemove(row) : false)} aria-label={removeLabel?.(row, index) ?? `Remove product line ${index + 1}`} onClick={() => onRemove(row, index)}><Trash2 aria-hidden="true" size={14} /></button>}</div></td></tr>{expanded && <tr className="border-t border-slate-100 bg-slate-50"><td colSpan={columns.length + 1} className="p-4">{renderMore(row)}</td></tr>}</Fragment>;
        })}
        {!filtered.length && <tr><td colSpan={columns.length + 1} className="p-6 text-center text-slate-500">No matching product lines.</td></tr>}
      </tbody></table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span className="tabular-nums">{filtered.length ? `${page * view.size + 1}–${Math.min((page + 1) * view.size, filtered.length)}` : 0} of {filtered.length} products ({rows.length} total)</span><div className="flex items-center gap-2"><button type="button" className={secondaryAction} disabled={page === 0} onClick={() => changePage(page - 1)}>Previous products</button><span className="tabular-nums">{page + 1}/{pages}</span><button type="button" className={secondaryAction} disabled={page >= pages - 1} onClick={() => changePage(page + 1)}>Next products</button></div></div>
    {onAdd && <button type="button" className={secondaryAction} disabled={disabled} onClick={() => { beforeAdd.current = new Set(rows.map(rowKey)); onAdd(); }}><Plus size={16} />Add product line</button>}
  </section>;
}
