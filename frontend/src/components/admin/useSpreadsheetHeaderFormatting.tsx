import { useSpreadsheetSurface } from "./useSpreadsheetSurface";
import { SpreadsheetColumnConfiguration } from "./SpreadsheetColumnConfiguration";
import { useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import type { ColumnDesign, HeaderDesign } from "../../services/shared-table-design";
import type { ReportCellFormat } from "./ReportSpreadsheetUtils";

/** Header selection is ephemeral. Only validated header appearance patches use shared persistence. */
export function useSpreadsheetHeaderFormatting(scope: string, canEdit: boolean, columns: Record<string, ColumnDesign>, save: (key: string, patch: HeaderDesign) => void, saveAlias?: (key: string, alias: string | null) => void, saveInput?: (key: string, input: NonNullable<ColumnDesign["input"]>) => void) {
  const surfaceRef = useSpreadsheetSurface(scope, columns);
  const [selection, setSelection] = useState<{ scope: string; key: string } | null>(null);
  const key = canEdit && selection?.scope === scope ? selection.key : null;
  const [configuring,setConfiguring]=useState<{key:string;title:string}|null>(null);
  const [rename, setRename] = useState<{scope:string;key:string;value:string;original:string}|null>(null);
  const renameRef=useRef(rename);renameRef.current=rename;
  const finishRename=(commit:boolean)=>{const draft=renameRef.current;if(!draft)return;renameRef.current=null;setRename(null);if(commit&&draft.value.trim()&&draft.value.trim()!==draft.original)saveAlias?.(draft.key,draft.value.trim());};
  const startRename = (key:string, fallback:string) => { if(canEdit && saveAlias) setRename({scope,key,value:columns[key]?.alias || fallback,original:columns[key]?.alias || fallback}); };
  const clear = () => setSelection(null);
  const props = (column: string) => ({
    "data-spreadsheet-column": column,
    tabIndex: canEdit ? 0 : undefined,
    "data-header-selected": key === column ? "true" : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      const target = event.target as Element;
      if (target.closest("input,select,[role=separator],summary") || target.closest("button") && !target.closest("[data-spreadsheet-header-title]")) return;
      if (canEdit) setSelection(current=>current?.scope===scope&&current.key===column?current:{ scope, key: column });
    },
    onDoubleClick: (event: MouseEvent<HTMLElement>) => { if ((event.target as Element).closest("button:not([data-spreadsheet-header-title]),input,select,[role=separator],summary")) return; startRename(column, event.currentTarget.querySelector("[data-spreadsheet-header-title]")?.textContent?.trim() || column); },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (canEdit && ["Enter", " "].includes(event.key)) { event.preventDefault(); setSelection(current=>current?.scope===scope&&current.key===column?current:{ scope, key: column }); }
      if(event.key==="ContextMenu"||(event.key==="F10"&&event.shiftKey)){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();event.currentTarget.dispatchEvent(new window.MouseEvent("contextmenu",{bubbles:true,clientX:rect.left+8,clientY:rect.bottom}));}
      if (event.key === "Escape") clear();
    },
  });
  const format = key ? columns[key]?.header ?? {} : {};
  return { key, props, clear, startRename,
    menuPosition:(event:MouseEvent<HTMLElement>)=>{event.preventDefault();event.stopPropagation();return {left:Math.max(8,Math.min(event.clientX,window.innerWidth-248)),top:Math.max(8,Math.min(event.clientY,window.innerHeight-368))};},
    configure: (key:string,title:string) => { if(canEdit) setConfiguring({key,title}); },
    configuration: configuring ? <SpreadsheetColumnConfiguration key={configuring.key} title={configuring.title} columnKey={configuring.key} value={columns[configuring.key]?.input} onClose={()=>setConfiguring(null)} onSave={input=>saveInput?.(configuring.key,input)} /> : null,

    title: (key:string, fallback:string) => columns[key]?.alias || fallback,
    restoreTitle: (key:string) => { if(canEdit) saveAlias?.(key,null); },
    editor: (key:string) => rename?.scope === scope && rename.key === key ? <input autoFocus onFocus={event=>event.currentTarget.select()} aria-label="Column display name" maxLength={100} value={rename.value} onChange={event=>{const next={...rename,value:event.target.value};renameRef.current=next;setRename(next);}} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==="Escape"){event.preventDefault();finishRename(false);}if(event.key==="Enter"){event.preventDefault();finishRename(true);}}} onBlur={()=>finishRename(true)} className="spreadsheet-header-editor absolute inset-0 z-[90] h-full w-full min-w-0 border-0 bg-inherit px-1 py-0 font-inherit text-inherit outline-none" style={{font:"inherit",color:"inherit",borderRadius:0,boxShadow:"none"}}/> : null,

    tableProps: { ref: surfaceRef,
      onContextMenuCapture:(event:MouseEvent<HTMLTableElement>)=>{event.currentTarget.removeAttribute("data-fast-selection");event.currentTarget.querySelector("[data-fast-selected]")?.removeAttribute("data-fast-selected");},
      onKeyDownCapture:(event:KeyboardEvent<HTMLTableElement>)=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Tab","Enter","Escape"].includes(event.key)){event.currentTarget.removeAttribute("data-fast-selection");event.currentTarget.querySelector("[data-fast-selected]")?.removeAttribute("data-fast-selected");}},
      onPointerDownCapture: (event: MouseEvent<HTMLTableElement>) => {
      const table=event.currentTarget,cell=(event.target as Element).closest<HTMLElement>("tbody td[data-formula-row],tbody td[data-report-column-key],tbody td[data-tracker-field]");
      if(!cell){table.removeAttribute("data-fast-selection");table.querySelector("[data-fast-selected]")?.removeAttribute("data-fast-selected");}
      if(cell&&event.button===0){
        const active=document.activeElement;
        const composing=active instanceof HTMLInputElement&&active.value.startsWith("=")&&Boolean(active.closest("[data-formula-bar],[data-formula-inline]"));
        if(!composing&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){table.querySelector('[data-fast-selected]')?.removeAttribute('data-fast-selected');cell.dataset.fastSelected="true";table.dataset.fastSelection="true";}
        else if(!composing){table.removeAttribute('data-fast-selection');table.querySelector('[data-fast-selected]')?.removeAttribute('data-fast-selected');}
      }
      if ((event.target as Element).closest("tbody td,tbody th")) clear();
    }, onFocusCapture: (event: { target: EventTarget }) => { if ((event.target as Element).closest("tbody td,tbody th")) clear(); } },
    toolbarProps: { headerOnly: Boolean(key), ...(key ? { selectedCellCount: 1, selectedTextColor: format.color ?? null, selectedBackgroundColor: format.backgroundColor ?? null, selectedFontSize: format.fontSize ?? columns[key]?.format?.fontSize ?? 12, onApply: (change: Partial<ReportCellFormat>) => {
      const patch: HeaderDesign = {};
      if ("color" in change) patch.color = change.color || null;
      if ("backgroundColor" in change) patch.backgroundColor = change.backgroundColor || null;
      if ("fontSize" in change && (change.fontSize === null || Number.isInteger(change.fontSize) && Number(change.fontSize) >= 9 && Number(change.fontSize) <= 32)) patch.fontSize = change.fontSize;
      if (Object.keys(patch).length) save(key, patch);
    } } : {}) },
  };
}
