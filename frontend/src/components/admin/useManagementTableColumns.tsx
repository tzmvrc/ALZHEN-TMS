import { reportColumnAppearance, chooseAutomaticPinSide } from "./ReportSpreadsheetUtils";
import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { EyeOff, EllipsisVertical } from "lucide-react";
import { useSharedTableWidths } from "./useSharedTableWidths";
import ColumnFinder,{type RowSearch} from "./ColumnFinder";
import HiddenColumnsControl from "./HiddenColumnsControl";
import { ReportColumnColorDialog, ReportColumnActionsMenu, type SortAction } from "./ReportSpreadsheetShared";
import {useSharedTableDesign} from "./useSharedTableDesign";

export type ManagementColumn = { key: string; title: string; width?: number };
const defaultWidth = (column: ManagementColumn) => column.width ?? (/remarks|notes|address/i.test(column.title) ? 320 : /customer|store|user|name/i.test(column.title) ? 240 : 180);
function readHidden(key: string) {
  try { const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}

/** Company-wide widths and appearance, sharing the existing revisioned storage. Table cells,
 * record IDs, editing and permissions remain owned by each management view. */
export function useManagementTableColumns(options: {
  table: string; token: string | null; profileId?: string; columns: readonly ManagementColumn[];
  showFinder?:boolean; reportMenu?:boolean; sortActions?:(key:string)=>SortAction[]; onAutoFit?:()=>void;
  onRenameColumn?:(key:string)=>void; onRestoreColumnTitle?:(key:string)=>void; onSelectColumn?:(key:string)=>void; onFormatHeader?:(key:string)=>void;
  contextMenuOnly?: boolean; columnMenuActions?: (column:ManagementColumn)=>ReactNode;
  enabled?: boolean; omitsHiddenCells?: boolean; leadingColumns?: number; leadingWidth?: number; trailingWidth?: number;
  hiddenKeys?: readonly string[]; onReveal?: (key: string) => void; onRestoreAll?: () => void;
  rowSearch?:RowSearch; paused?:boolean; supportsDesign?:boolean; onResizeChange?:(active:boolean)=>void;
}) {
  const shared = useSharedTableWidths(options.table, options.token, options.enabled ?? true);
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const viewport = useRef<HTMLDivElement>(null), headers = useRef(new Map<string, HTMLTableCellElement>());
  const attachViewport = useCallback((element: HTMLDivElement | null) => { viewport.current = element; }, []);
  const storageKey = `alzhen:management-hidden:${options.profileId ?? "staff"}:${options.table}`;
  const [visibility, setVisibility] = useState(() => ({ key: storageKey, hidden: readHidden(storageKey) }));
  const [drag, setDrag] = useState<{ table: string; widths: Record<string, number> } | null>(null);
  const paused=Boolean(drag||options.paused);
  const design=useSharedTableDesign(options.table,options.token,options.enabled??true,paused);
  const menuPosition=useRef({left:0,top:0});
  const [menu,setMenu]=useState<string|null>(null),[colorColumn,setColorColumn]=useState<string|null>(null);
  useEffect(()=>{if(!menu)return;const close=(event:Event)=>{if(event instanceof KeyboardEvent&&event.key!=="Escape")return;if(event.type==="pointerdown"&&(event.target as HTMLElement).closest('[role="menu"],button[aria-expanded]'))return;setMenu(null);};window.addEventListener("pointerdown",close);window.addEventListener("keydown",close);return()=>{window.removeEventListener("pointerdown",close);window.removeEventListener("keydown",close);};},[menu]);
  useEffect(()=>{if(options.reportMenu&&options.enabled===false){setMenu(null);setColorColumn(null);}},[options.reportMenu,options.enabled]);
  const widthOwner=`${options.token}:${options.table}`;
  const [appliedWidths,setAppliedWidths]=useState(()=>({owner:widthOwner,widths:shared.widths}));
  useEffect(()=>{let active=true;if(!paused)queueMicrotask(()=>{if(active)setAppliedWidths({owner:widthOwner,widths:shared.widths});});return()=>{active=false;};},[paused,widthOwner,shared.widths]);
  const savedWidths=useMemo(()=>appliedWidths.owner===widthOwner?appliedWidths.widths:{},[appliedWidths,widthOwner]);
  const canDesign=options.supportsDesign!==false;
  const orderedColumns=useMemo(()=>canDesign?[...options.columns].sort((a,b)=>(design.columns[a.key]?.position??1001)-(design.columns[b.key]?.position??1001)):options.columns,[canDesign,options.columns,design.columns]);
  const hidden = options.hiddenKeys ?? (design.loaded?Object.keys(design.columns).filter(k=>design.columns[k].hidden):(visibility.key === storageKey ? visibility.hidden : readHidden(storageKey)));
  const cleanup = useRef<(() => void) | null>(null);
  const widths = useMemo(() => drag?.table === options.table ? drag.widths : Object.fromEntries(options.columns.map((column) => [column.key, savedWidths[column.key] ?? defaultWidth(column)])), [drag, options.columns, options.table, savedWidths]);
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
    options.onResizeChange?.(true);
    const oldSelect = document.body.style.userSelect; document.body.style.userSelect = "none";
    const move = (next: PointerEvent) => {
      latest = Math.min(1600, Math.max(60, Math.round(original + next.clientX - startX)));
      setDrag({ table: options.table, widths: { ...snapshot, [column.key]: latest } });
    };
    const stop = () => {
      document.body.style.userSelect = oldSelect;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel);
      cleanup.current = null;
      options.onResizeChange?.(false);
    };
    const finish = () => { if (latest !== original) void shared.save(column.key, latest); stop(); setDrag(null); };
    const cancel = () => { stop(); setDrag(null); };
    cleanup.current = stop;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish, { once: true }); window.addEventListener("pointercancel", cancel, { once: true });
  };
  const leading = options.leadingColumns ?? 0;
  const leadingWidth = options.leadingWidth ?? 44;
  const visibleColumns = orderedColumns.filter((column) => !hidden.includes(column.key));
  const finderColumns = orderedColumns.map((column, index) => ({ ...column, index: options.omitsHiddenCells ? visibleColumns.findIndex((visible) => visible.key === column.key) : index, hidden: hidden.includes(column.key) }));
  const hiddenColumns = finderColumns.filter((column) => column.hidden);
  const css = (options.omitsHiddenCells ? [] : hiddenColumns).map((column) => {
    const child = column.index + leading + 1;
    return `[data-management-columns="${scope}"] table>thead>tr>th:nth-child(${child}),[data-management-columns="${scope}"] table>tbody>tr>td:not([colspan]):nth-child(${child}){display:none}`;
  }).join("\n");
  const tableWidth = options.columns.filter((column) => !hidden.includes(column.key)).reduce((total, column) => total + width(column.key), leading * leadingWidth + (options.trailingWidth ?? 0));
  const cellStyle=(key:string,header=false):CSSProperties=>{
    if(!canDesign)return header?{position:"relative",width:width(key)}:{};
    const column=design.columns[key]??{},pin=column.pin;
    const pinned=visibleColumns.filter(c=>design.columns[c.key]?.pin===pin),index=pinned.findIndex(c=>c.key===key);
    const offset=pin==="left"?leading*leadingWidth+pinned.slice(0,index).reduce((n,c)=>n+width(c.key),0):pinned.slice(index+1).reduce((n,c)=>n+width(c.key),options.trailingWidth??0);
    return {position:pin?"sticky":header?"relative":undefined,...(pin?{[pin]:offset,zIndex:header?45:20}:{}),width:width(key),backgroundColor:pin?(header?"#eaf2fb":"#ffffff"):undefined,...reportColumnAppearance(column)};
  };
  const moveColumn=(key:string,direction:number)=>{
    const order=orderedColumns.map(c=>c.key),index=order.indexOf(key),destination=index+direction;
    if(destination<0||destination>=order.length)return;
    [order[index],order[destination]]=[order[destination],order[index]];
    order.forEach((column,position)=>{if(design.columns[column]?.position!==position)void design.save(column,{position},width(column));});
  };
  const flatten=(children:ReactNode):ReactNode[]=>Children.toArray(children).flatMap(child=>isValidElement<{children?:ReactNode}>(child)&&child.type===Fragment?flatten(child.props.children):[child]);
  const renderCells=(children:ReactNode)=>{
    const cells=flatten(children).filter(child=>isValidElement(child));
    return orderedColumns.map(column=>{
      const cell=cells[options.columns.findIndex(original=>original.key===column.key)];
      return isValidElement(cell)?cloneElement(cell as ReactElement<{style?:CSSProperties;"data-management-column"?:string}>,{key:column.key,"data-management-column":column.key,style:{...(cell.props as {style?:CSSProperties}).style,...cellStyle(column.key)}}):cell;
    });
  };
  return {
    design, saveWidth:shared.save, openColumnMenu:(key:string,x:number,y:number)=>{menuPosition.current={left:Math.max(8,Math.min(x,window.innerWidth-190)),top:Math.max(8,Math.min(y,window.innerHeight-300))};setMenu(key);},
    columnWidth:width,visibleColumns,orderedColumns,renderCells,attachViewport, viewportProps: { "data-management-columns": scope },
    tableStyle: { tableLayout: "fixed", width: tableWidth, minWidth: "100%" } as CSSProperties,
    controls: <><style>{css}</style>{colorColumn&&<ReportColumnColorDialog columnName={options.columns.find(c=>c.key===colorColumn)?.title??colorColumn} color={design.columns[colorColumn]?.color??""} onChange={color=>void design.save(colorColumn,{color},width(colorColumn))} onReset={()=>void design.save(colorColumn,{color:null},width(colorColumn))} onClose={()=>setColorColumn(null)} />}{options.showFinder!==false&&<ColumnFinder tableKey={options.enabled===false?undefined:options.table} key={options.table} rowSearch={options.rowSearch} leadingColumns={leading} columns={finderColumns} viewport={viewport} getHeader={(key) => headers.current.get(key)} onReveal={reveal} />}{shared.feedback}{design.feedback}</>,
    hiddenControl: <HiddenColumnsControl columns={hiddenColumns} onRestore={reveal} onRestoreAll={restoreAll} />,
    colgroup: <colgroup>{Array.from({ length: leading }, (_, index) => <col key={`leading-${index}`} style={{ width: leadingWidth }} />)}{orderedColumns.filter((column) => !hidden.includes(column.key)).map((column) => <col key={column.key} style={{ width: width(column.key) }} />)}{Boolean(options.trailingWidth) && <col style={{ width: options.trailingWidth }} />}</colgroup>,
    bodyProps:(key:string)=>({style:cellStyle(key)}),
    headerProps: (key: string) => ({ ref: (element: HTMLTableCellElement | null) => { if (element) headers.current.set(key, element); else headers.current.delete(key); }, style: cellStyle(key,true) }),
    headerControls: (column: ManagementColumn) => <>
      {canDesign&&<span className="inline-block">{!options.contextMenuOnly&&<button type="button" aria-label={`${column.title} column options`} aria-expanded={menu===column.key} onClick={event=>{event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();menuPosition.current={left:Math.min(rect.left,window.innerWidth-180),top:Math.min(rect.bottom,window.innerHeight-260)};setMenu(menu===column.key?null:column.key);}} className="ml-1 rounded p-1 text-slate-500 hover:bg-slate-100"><EllipsisVertical className="h-3 w-3" /></button>}{menu===column.key&&(options.reportMenu?<ReportColumnActionsMenu title={design.columns[column.key]?.alias??column.title} position={menuPosition.current} viewportBounded onClose={()=>setMenu(null)} sortActions={options.sortActions?.(column.key)} pinned={!!design.columns[column.key]?.pin} onTogglePin={()=>{
        const head=headers.current.get(column.key),view=viewport.current;
        const side=head&&view?chooseAutomaticPinSide(head.getBoundingClientRect(),view.getBoundingClientRect()):"left";
        void design.save(column.key,{pin:design.columns[column.key]?.pin?null:side},width(column.key));
      }} onRename={options.onRenameColumn?()=>options.onRenameColumn!(column.key):undefined} onRestoreTitle={options.onRestoreColumnTitle?()=>options.onRestoreColumnTitle!(column.key):undefined} onEditColumn={()=>setColorColumn(column.key)} onHide={()=>hide(column.key)} canHide={visibleColumns.length>1} extraActions={[
        ...(options.onSelectColumn?[{label:"Select Column",onClick:()=>options.onSelectColumn!(column.key)}]:[]),
        ...(options.onFormatHeader?[{label:"Format header",onClick:()=>options.onFormatHeader!(column.key)}]:[]),
        {label:"Move left",onClick:()=>moveColumn(column.key,-1),disabled:orderedColumns[0]?.key===column.key},
        {label:"Move right",onClick:()=>moveColumn(column.key,1),disabled:orderedColumns.at(-1)?.key===column.key},
        ...(options.onAutoFit?[{label:"Auto Fit",onClick:options.onAutoFit}]:[])
      ]}/>:<div role="menu" style={{position:"fixed",...menuPosition.current}} aria-label={`${column.title} design`} onKeyDown={event=>{if(event.key==="Escape")setMenu(null);}} className="absolute left-0 top-full z-[90] min-w-40 rounded-lg border border-slate-200 bg-white p-1 text-xs font-normal text-slate-700 shadow-lg">{options.columnMenuActions?.(column)}{[...(options.contextMenuOnly?[["Hide column",()=>hide(column.key)]]:[]),["Move left",()=>moveColumn(column.key,-1)],["Move right",()=>moveColumn(column.key,1)],["Pin left",()=>void design.save(column.key,{pin:"left"},width(column.key))],["Pin right",()=>void design.save(column.key,{pin:"right"},width(column.key))],["Unpin",()=>void design.save(column.key,{pin:null},width(column.key))],["Column color",()=>setColorColumn(column.key)]] .map(([label,run])=><button key={String(label)} type="button" role="menuitem" onClick={event=>{event.stopPropagation();(run as ()=>void)();setMenu(null);}} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-100">{String(label)}</button>)}</div>)}</span>}
      {!options.contextMenuOnly && !options.hiddenKeys && <button type="button" aria-label={`Hide ${column.title} column`} title={`Hide ${column.title}`} onClick={(event) => { event.stopPropagation(); hide(column.key); }} className="ml-2 inline-flex rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><EyeOff className="h-3 w-3" /></button>}
      <span role="separator" tabIndex={0} aria-label={`Resize ${column.title}`} aria-orientation="vertical" aria-valuemin={60} aria-valuemax={1600} aria-valuenow={width(column.key)} onPointerDown={(event) => startResize(event, column)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); void shared.save(column.key, Math.max(60, Math.min(1600, width(column.key) + (event.key === "ArrowRight" ? 10 : -10)))); } }} className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-blue-400/50 focus-visible:bg-blue-400/50 focus-visible:outline-none" />
    </>,
  };
}
