import { SpreadsheetColumnConfiguration } from "./SpreadsheetColumnConfiguration";
import { useState, type MouseEvent, type KeyboardEvent } from "react";
import type { ColumnDesign, HeaderDesign } from "../../services/shared-table-design";
import type { ReportCellFormat } from "./ReportSpreadsheetUtils";

/** Header selection is ephemeral. Only validated header appearance patches use shared persistence. */
export function useSpreadsheetHeaderFormatting(scope: string, canEdit: boolean, columns: Record<string, ColumnDesign>, save: (key: string, patch: HeaderDesign) => void, saveAlias?: (key: string, alias: string | null) => void, saveInput?: (key: string, input: NonNullable<ColumnDesign["input"]>) => void) {
  const [selection, setSelection] = useState<{ scope: string; key: string } | null>(null);
  const key = canEdit && selection?.scope === scope ? selection.key : null;
  const [configuring,setConfiguring]=useState<{key:string;title:string}|null>(null);
  const [rename, setRename] = useState<{scope:string;key:string;value:string}|null>(null);
  const startRename = (key:string, fallback:string) => { if(canEdit && saveAlias) setRename({scope,key,value:columns[key]?.alias || fallback}); };
  const clear = () => setSelection(null);
  const props = (column: string) => ({
    tabIndex: canEdit ? 0 : undefined,
    "data-header-selected": key === column ? "true" : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      const target = event.target as Element;
      if (target.closest("input,select,[role=separator],summary") || target.closest("button") && !target.closest("[data-spreadsheet-header-title]")) return;
      if (canEdit) setSelection({ scope, key: column });
    },
    onDoubleClick: (event: MouseEvent<HTMLElement>) => { if ((event.target as Element).closest("button:not([data-spreadsheet-header-title]),input,select,[role=separator],summary")) return; startRename(column, event.currentTarget.querySelector("[data-spreadsheet-header-title]")?.textContent?.trim() || column); },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (canEdit && ["Enter", " "].includes(event.key)) { event.preventDefault(); setSelection({ scope, key: column }); }
      if (event.key === "Escape") clear();
    },
  });
  const format = key ? columns[key]?.header ?? {} : {};
  return { key, props, clear, startRename,
    configure: (key:string,title:string) => { if(canEdit) setConfiguring({key,title}); },
    configuration: configuring ? <SpreadsheetColumnConfiguration key={configuring.key} title={configuring.title} columnKey={configuring.key} value={columns[configuring.key]?.input} onClose={()=>setConfiguring(null)} onSave={input=>saveInput?.(configuring.key,input)} /> : null,

    title: (key:string, fallback:string) => columns[key]?.alias || fallback,
    restoreTitle: (key:string) => { if(canEdit) saveAlias?.(key,null); },
    editor: (key:string) => rename?.scope === scope && rename.key === key ? <input autoFocus aria-label="Column display name" maxLength={100} value={rename.value} onChange={event => setRename({...rename,value:event.target.value})} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==="Escape"){event.preventDefault();setRename(null);}if(event.key==="Enter"&&rename.value.trim()){event.preventDefault();saveAlias?.(key,rename.value.trim());setRename(null);}}} onBlur={()=>setRename(null)} className="absolute inset-x-1 top-1 z-[90] min-h-6 min-w-0 rounded-sm border border-blue-400 bg-white px-1 text-xs text-slate-900 outline-none" /> : null,

    tableProps: { onPointerDownCapture: (event: MouseEvent<HTMLTableElement>) => { if ((event.target as Element).closest("tbody td,tbody th")) clear(); }, onFocusCapture: (event: { target: EventTarget }) => { if ((event.target as Element).closest("tbody td,tbody th")) clear(); } },
    toolbarProps: { headerOnly: Boolean(key), ...(key ? { selectedCellCount: 1, selectedTextColor: format.color ?? null, selectedBackgroundColor: format.backgroundColor ?? null, selectedFontSize: format.fontSize ?? columns[key]?.format?.fontSize ?? 12, onApply: (change: Partial<ReportCellFormat>) => {
      const patch: HeaderDesign = {};
      if ("color" in change) patch.color = change.color || null;
      if ("backgroundColor" in change) patch.backgroundColor = change.backgroundColor || null;
      if ("fontSize" in change && (change.fontSize === null || Number.isInteger(change.fontSize) && Number(change.fontSize) >= 9 && Number(change.fontSize) <= 32)) patch.fontSize = change.fontSize;
      if (Object.keys(patch).length) save(key, patch);
    } } : {}) },
  };
}
