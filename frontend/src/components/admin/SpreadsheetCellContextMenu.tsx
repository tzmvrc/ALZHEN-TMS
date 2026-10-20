import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ReportCellFormattingToolbar } from "./ReportSpreadsheetShared";
import type { ReportCellFormat } from "./ReportSpreadsheetUtils";

/** Uses the same formatting callbacks and persistence as the main spreadsheet toolbar. */
export function SpreadsheetCellContextMenu({ x, y, count, format, canFormat, onApply, onSelectRow, onSelectColumn, onClose }: {
  x: number; y: number; count: number; format: ReportCellFormat; canFormat: boolean;
  onApply: (change: Partial<ReportCellFormat>) => void;
  onSelectRow: () => void; onSelectColumn: () => void; onClose: () => void;
}) {
  const panel=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:x,top:y});
  useLayoutEffect(()=>{
    const bounds=panel.current?.getBoundingClientRect();if(!bounds)return;
    setPosition({left:Math.max(8,Math.min(x,window.innerWidth-bounds.width-8)),top:Math.max(8,Math.min(y,window.innerHeight-bounds.height-8))});
  },[x,y]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node))onClose();};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();onClose();}};
    const dismiss=()=>onClose();
    document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",escape,true);
    window.addEventListener("resize",dismiss);window.addEventListener("scroll",dismiss,true);
    return()=>{document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",escape,true);window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);};
  },[onClose]);
  return createPortal(<div ref={panel} role="menu" aria-label="Cell actions" data-spreadsheet-context-menu data-spreadsheet-formatting
    style={position} onContextMenu={event=>event.preventDefault()} onPointerDown={event=>event.preventDefault()}
    onKeyDown={event=>{if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const index=items.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowUp"?-1:1)+items.length)%items.length;items[next]?.focus();}}
    className="fixed z-[2400] w-60 max-w-[calc(100vw-16px)] rounded-md border border-slate-200 bg-white p-1 shadow-lg">
    <ReportCellFormattingToolbar compact selectedCellCount={canFormat?Math.max(1,count):0} selectionIsBold={Boolean(format.bold)} selectionIsItalic={Boolean(format.italic)}
      selectedTextColor={format.color??null} selectedBackgroundColor={format.backgroundColor??null}
      onApply={change=>{onApply(change);onClose();}} />
    <div className="my-1 border-t border-slate-100" />
    <button type="button" role="menuitem" onClick={()=>{onSelectRow();onClose();}} className="block w-full rounded-sm px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:bg-blue-50 focus-visible:outline-none">Select Row</button>
    <button type="button" role="menuitem" onClick={()=>{onSelectColumn();onClose();}} className="block w-full rounded-sm px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:bg-blue-50 focus-visible:outline-none">Select Column</button>
  </div>,document.body);
}
