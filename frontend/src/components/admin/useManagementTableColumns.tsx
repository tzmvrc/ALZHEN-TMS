import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { EyeOff } from "lucide-react";
import { useSharedTableWidths } from "./useSharedTableWidths";
import ColumnFinder,{type RowSearch} from "./ColumnFinder";
import HiddenColumnsControl from "./HiddenColumnsControl";
import {useSharedTableDesign} from "./useSharedTableDesign";

export type ManagementColumn = { key: string; title: string; width?: number };
const defaultWidth = (column: ManagementColumn) => column.width ?? (/remarks|notes|address/i.test(column.title) ? 320 : /customer|store|user|name/i.test(column.title) ? 240 : 180);
function readHidden(key: string) {
  try { const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}

/** Existing company-wide width service plus personal visibility. Table cells,
 * record IDs, editing and permissions remain owned by each management view. */
export function useManagementTableColumns(options: {
  table: string; token: string | null; profileId?: string; columns: readonly ManagementColumn[];
  enabled?: boolean; omitsHiddenCells?: boolean; leadingColumns?: number; trailingWidth?: number;
  hiddenKeys?: readonly string[]; onReveal?: (key: string) => void; onRestoreAll?: () => void;
  rowSearch?:RowSearch;
}) {
  const shared = useSharedTableWidths(options.table, options.token, options.enabled ?? true);
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const viewport = useRef<HTMLDivElement>(null), headers = useRef(new Map<string, HTMLTableCellElement>());
  const attachViewport = useCallback((element: HTMLDivElement | null) => { viewport.current = element; }, []);
  const storageKey = `alzhen:management-hidden:${options.profileId ?? "staff"}:${options.table}`;
  const [visibility, setVisibility] = useState(() => ({ key: storageKey, hidden: readHidden(storageKey) }));
  const [drag, setDrag] = useState<{ table: string; widths: Record<string, number> } | null>(null);
  const design=useSharedTableDesign(options.table,options.token,options.enabled??true,Boolean(drag));
  const hidden = options.hiddenKeys ?? (design.loaded?Object.keys(design.columns).filter(k=>design.columns[k].hidden):(visibility.key === storageKey ? visibility.hidden : readHidden(storageKey)));
  const cleanup = useRef<(() => void) | null>(null);
  const widths = useMemo(() => drag?.table === options.table ? drag.widths : Object.fromEntries(options.columns.map((column) => [column.key, shared.widths[column.key] ?? defaultWidth(column)])), [drag, options.columns, options.table, shared.widths]);
  const width = (key: string) => widths[key] ?? 180;
  const reveal = (key: string) => {
    if (options.onReveal) { options.onReveal(key); return; }
    const next = hidden.filter((item) => item !== key); setVisibility({ key: storageKey, hidden: next });
    void design.save(key,{hidden:false},width(key));
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Width persistence remains server-backed. */ }
  };
  const restoreAll = () => {
    if (options.onRestoreAll) { options.onRestoreAll(); return; }
    setVisibility({ key: storageKey, hidden: [] }); try { localStorage.setItem(storageKey, "[]"); } catch { /* Optional visibility only. */ }
    for(const key of hidden)void design.save(key,{hidden:false},width(key));
  };
  const hide = (key: string) => {
    if (options.hiddenKeys || options.columns.filter((column) => !hidden.includes(column.key)).length < 2) return;
    const next = [...hidden, key]; setVisibility({ key: storageKey, hidden: next });
    void design.save(key,{hidden:true},width(key));
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Optional visibility only. */ }
  };
  useEffect(() => () => { cleanup.current?.(); }, [options.table]);
  const startResize = (event: ReactPointerEvent, column: ManagementColumn) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    const original = width(column.key), startX = event.clientX, snapshot = { ...widths };
    let latest = original;
    setDrag({ table: options.table, widths: snapshot });
    const oldSelect = document.body.style.userSelect; document.body.style.userSelect = "none";
    const move = (next: PointerEvent) => {
      latest = Math.min(1600, Math.max(80, Math.round(original + next.clientX - startX)));
      setDrag({ table: options.table, widths: { ...snapshot, [column.key]: latest } });
    };
    const stop = () => {
      document.body.style.userSelect = oldSelect;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel);
      cleanup.current = null;
    };
    const finish = () => { if (latest !== original) void shared.save(column.key, latest); stop(); setDrag(null); };
    const cancel = () => { stop(); setDrag(null); };
    cleanup.current = stop;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish, { once: true }); window.addEventListener("pointercancel", cancel, { once: true });
  };
  const leading = options.leadingColumns ?? 0;
  const visibleColumns = options.columns.filter((column) => !hidden.includes(column.key));
  const finderColumns = options.columns.map((column, index) => ({ ...column, index: options.omitsHiddenCells ? visibleColumns.findIndex((visible) => visible.key === column.key) : index, hidden: hidden.includes(column.key) }));
  const hiddenColumns = finderColumns.filter((column) => column.hidden);
  const css = (options.omitsHiddenCells ? [] : hiddenColumns).map((column) => {
    const child = column.index + leading + 1;
    return `[data-management-columns="${scope}"] table>thead>tr>th:nth-child(${child}),[data-management-columns="${scope}"] table>tbody>tr>td:not([colspan]):nth-child(${child}){display:none}`;
  }).join("\n");
  const tableWidth = options.columns.filter((column) => !hidden.includes(column.key)).reduce((total, column) => total + width(column.key), leading * 44 + (options.trailingWidth ?? 0));
  return {
    attachViewport, viewportProps: { "data-management-columns": scope },
    tableStyle: { tableLayout: "fixed", width: tableWidth, minWidth: "100%" } as CSSProperties,
    controls: <><style>{css}</style><ColumnFinder key={options.table} rowSearch={options.rowSearch} leadingColumns={leading} columns={finderColumns} viewport={viewport} getHeader={(key) => headers.current.get(key)} onReveal={reveal} />{shared.feedback}{design.feedback}</>,
    hiddenControl: <HiddenColumnsControl columns={hiddenColumns} onRestore={reveal} onRestoreAll={restoreAll} />,
    colgroup: <colgroup>{Array.from({ length: leading }, (_, index) => <col key={`leading-${index}`} style={{ width: 44 }} />)}{options.columns.filter((column) => !hidden.includes(column.key)).map((column) => <col key={column.key} style={{ width: width(column.key) }} />)}{Boolean(options.trailingWidth) && <col style={{ width: options.trailingWidth }} />}</colgroup>,
    headerProps: (key: string) => ({ ref: (element: HTMLTableCellElement | null) => { if (element) headers.current.set(key, element); else headers.current.delete(key); }, style: { position: "relative", width: width(key) } as CSSProperties }),
    headerControls: (column: ManagementColumn) => <>
      {!options.hiddenKeys && <button type="button" aria-label={`Hide ${column.title} column`} title={`Hide ${column.title}`} onClick={(event) => { event.stopPropagation(); hide(column.key); }} className="ml-2 inline-flex rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><EyeOff className="h-3 w-3" /></button>}
      <span role="separator" tabIndex={0} aria-label={`Resize ${column.title}`} aria-orientation="vertical" aria-valuemin={80} aria-valuemax={1600} aria-valuenow={width(column.key)} onPointerDown={(event) => startResize(event, column)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); void shared.save(column.key, Math.max(80, Math.min(1600, width(column.key) + (event.key === "ArrowRight" ? 10 : -10)))); } }} className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-blue-400/50 focus-visible:bg-blue-400/50 focus-visible:outline-none" />
    </>,
  };
}
