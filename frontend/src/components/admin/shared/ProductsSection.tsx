import { Fragment, useCallback, useLayoutEffect, useReducer, useRef, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { fieldControl, secondaryAction } from "./styles";
import { productView, type StoreWorkspaceMemory, useStoreWorkspaceMemory, updateProductView, toggleProductView } from "./storeWorkspace";
export type StoreProductColumn<T> = { key: string; label: string; render: (row: T, index: number) => ReactNode };
export default function ProductsSection<T>({ rows, storeId, memory: provided, rowKey, searchText, columns, renderMore, isExpanded, onToggle, moreLabel, hasMore, onRemove, removeLabel, canRemove, onAdd, disabled = false }: {
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
  updateProductView(view, { page });
  useLayoutEffect(() => { if (scroller.current) { scroller.current.scrollTop = view.top; scroller.current.scrollLeft = view.left; } }, [view]);
  const resetScroll = useCallback(() => { updateProductView(view, { top: 0 }); if (scroller.current) scroller.current.scrollTop = 0; }, [view]);
  const changePage = (next: number) => { updateProductView(view, { page: next }); resetScroll(); refresh(); };
  useLayoutEffect(() => {
    if (!beforeAdd.current) return;
    const index = rows.findIndex(row => !beforeAdd.current!.has(rowKey(row)));
    if (index < 0) return;
    beforeAdd.current = null;
    updateProductView(view, { search: "", page: Math.floor(index / view.size) }); resetScroll(); refresh();
  }, [rows, view, rowKey, resetScroll]);
  return <section aria-label="Products for selected store" className="products-section">
    <div className="products-section-header"><h4>Products <span>({rows.length} {rows.length === 1 ? "line" : "lines"})</span></h4><label className="products-section-search"><span className="sr-only">Search product lines</span><input type="search" className={fieldControl} placeholder="Search products or DR" value={view.search} onChange={event => { updateProductView(view, { search: event.target.value, page: 0 }); resetScroll(); refresh(); }} /></label><label className="products-page-size"><span>Rows per page</span><select aria-label="Rows per page" className={fieldControl} value={view.size} onChange={event => { updateProductView(view, { size: Number(event.target.value), page: 0 }); resetScroll(); refresh(); }}>{[10, 25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>{onAdd && <button type="button" className={secondaryAction} disabled={disabled} onClick={() => { beforeAdd.current = new Set(rows.map(rowKey)); onAdd(); }}><Plus size={14} />Add product line</button>}</div>
    {!rows.length ? <p className="py-3 text-xs text-slate-500">No products yet</p> : <div ref={scroller} tabIndex={0} role="region" aria-label="Scrollable product rows" className="trip-horizontal-table" onScroll={event => { updateProductView(view, { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft }); }}>
      <table className="trip-product-table text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{columns.map(column => <th scope="col" key={column.key} className="px-3 py-3 font-semibold">{column.label}</th>)}<th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span><MoreHorizontal aria-hidden="true" size={16} /></th></tr></thead><tbody>
        {filtered.slice(page * view.size, (page + 1) * view.size).map(({ row, index }) => {
          const key = rowKey(row), expanded = isExpanded ? isExpanded(row) : Boolean(view.expanded[key]);
          return <Fragment key={key}><tr className="border-t border-slate-100 align-top hover:bg-slate-50/50">{columns.map(column => <td key={column.key} className="min-w-28 px-3 py-2 tabular-nums">{column.render(row, index)}</td>)}<td className="trip-row-actions"><details className="trip-action-menu"><summary aria-label={`Actions for product ${index + 1}`}><MoreHorizontal aria-hidden="true" size={16} /></summary><button type="button" className={secondaryAction} aria-expanded={expanded} aria-label={moreLabel?.(row) ?? `${expanded ? "Hide" : "Show"} more details for product ${index + 1}`} onClick={() => { if (onToggle) onToggle(row); else { toggleProductView(view, key); refresh(); } }}><ChevronDown aria-hidden="true" size={12} className={expanded ? "rotate-180" : ""} />More{hasMore?.(row) && <span aria-label="Additional details present">•</span>}</button>{onRemove && <button type="button" className={secondaryAction} disabled={disabled || (canRemove ? !canRemove(row) : false)} aria-label={removeLabel?.(row, index) ?? `Remove product line ${index + 1}`} onClick={() => onRemove(row, index)}><Trash2 aria-hidden="true" size={14} /></button>}</details></td></tr>{expanded && <tr className="border-t border-slate-100 bg-slate-50"><td colSpan={columns.length + 1} className="p-4">{renderMore(row)}</td></tr>}</Fragment>;
        })}
        {!filtered.length && <tr><td colSpan={columns.length + 1} className="p-6 text-center text-slate-500">{rows.length ? "No matching product lines." : "No products yet"}</td></tr>}
      </tbody></table>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span className="tabular-nums">{filtered.length ? `${page * view.size + 1}–${Math.min((page + 1) * view.size, filtered.length)}` : 0} of {filtered.length} products ({rows.length} total)</span><div className="flex items-center gap-2"><button type="button" className={secondaryAction} disabled={page === 0} onClick={() => changePage(page - 1)}>Previous products</button><span className="tabular-nums">{page + 1}/{pages}</span><button type="button" className={secondaryAction} disabled={page >= pages - 1} onClick={() => changePage(page + 1)}>Next products</button></div></div>

  </section>;
}
