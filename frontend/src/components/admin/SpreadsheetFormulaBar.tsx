import { useEffect, useId, useRef, useState, type FocusEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

const EXAMPLES = [
  ["=A2+B2", "Add two cells"],
  ["=A2*B2", "Multiply two cells"],
  ["=SUM(A2:A10)", "Add a range"],
  ["=AVERAGE(B2:B10)", "Calculate an average"],
  ['=IF(C2>0,"Yes","No")', "Return a result based on a condition"],
];

export function SpreadsheetFormulaBar({ value, onChange, onCommit, onCancel, readOnly=false,
  readOnlyReason="Select a supported data cell. Calculated overlays do not overwrite operational source records.",
  inputRef, onFocus, onBlur, address,
}: { value:string; onChange?:(value:string)=>void; onCommit?:()=>void; onCancel?:()=>void;
  address?:string;
  readOnly?:boolean; readOnlyReason?:string; inputRef?:RefObject<HTMLInputElement|null>;
  onFocus?:()=>void; onBlur?:(event:FocusEvent<HTMLInputElement>)=>void;
}) {
  const [help,setHelp]=useState<{left:number;top:number;maxHeight:number}|null>(null);
  const helpButton=useRef<HTMLButtonElement|null>(null), helpPanel=useRef<HTMLDivElement|null>(null);
  const helpId=useId(), reasonId=useId();
  useEffect(()=>{
    if(!help)return;
    const close=(event:PointerEvent)=>{if(!helpButton.current?.contains(event.target as Node)&&!helpPanel.current?.contains(event.target as Node))setHelp(null);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setHelp(null);helpButton.current?.focus();}};
    const dismiss=()=>setHelp(null);
    const scroll=(event:Event)=>{if(!helpPanel.current?.contains(event.target as Node))setHelp(null);};
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape,true);
    window.addEventListener("resize",dismiss);window.addEventListener("scroll",scroll,true);
    return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape,true);window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",scroll,true);};
  },[help]);
  return <div data-formula-bar className="flex h-7 w-full min-w-0 items-center gap-1">
    <div className="flex h-7 min-w-0 flex-1 items-center rounded-sm border border-slate-300 bg-white">
    <span aria-label="Selected cell address" className="min-w-12 shrink-0 border-r border-slate-200 px-2 text-center text-[11px] tabular-nums text-slate-600">{address??""}</span>

    <span id={reasonId} className="sr-only">{readOnly?readOnlyReason:"Enter a formula or value. Enter saves; Escape cancels."}</span>
    <input ref={inputRef} aria-label="Formula or cell value" aria-describedby={reasonId} title={readOnly?readOnlyReason:undefined} readOnly={readOnly} value={value}
      onFocus={onFocus} onBlur={onBlur} onChange={event=>{if(!readOnly)onChange?.(event.target.value);}}
      onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.stopPropagation();if(!readOnly)onCommit?.();}if(event.key==="Escape"){event.preventDefault();event.stopPropagation();onCancel?.();}}}
      className="h-6 w-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[10px] text-slate-800 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400 read-only:cursor-default read-only:text-slate-500" />
    </div>
    <button ref={helpButton} type="button" aria-label="Formula help" title="How to use formulas" aria-expanded={Boolean(help)} aria-controls={help?helpId:undefined}
      onMouseDown={event=>event.preventDefault()} onClick={()=>{if(help){setHelp(null);return;}const rect=helpButton.current?.getBoundingClientRect();if(rect){const top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-320));setHelp({left:Math.max(8,Math.min(rect.left,window.innerWidth-368)),top,maxHeight:Math.max(120,window.innerHeight-top-8)});}}}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-500"><CircleHelp aria-hidden="true" className="h-3.5 w-3.5"/></button>
    {help&&createPortal(<div data-formula-help ref={helpPanel} id={helpId} role="dialog" aria-label="Formula help" style={{left:help.left,top:help.top,maxHeight:help.maxHeight}} className="fixed z-[2500] w-[min(352px,calc(100vw-16px))] overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
      <div className="mb-2 flex items-center justify-between"><strong className="text-slate-800">Formulas</strong><button type="button" aria-label="Close formula help" onClick={()=>{setHelp(null);helpButton.current?.focus();}} className="rounded px-1 text-slate-500 hover:bg-slate-100">Close</button></div>
      <p>Select a supported cell first. Ordinary values use its existing source validation. Type <code>=</code> to begin, then click other cells to insert references. Press Enter to save or Escape to cancel.</p>
      <table className="my-2 w-full text-left text-[11px]"><thead><tr><th className="pr-2 font-medium">Formula</th><th className="font-medium">Meaning</th></tr></thead><tbody>{EXAMPLES.map(([formula,meaning])=><tr key={formula}><td className="py-1 pr-2 align-top"><code>{formula}</code></td><td className="py-1">{meaning}</td></tr>)}</tbody></table>
      <p>Drag the fill handle down to copy a formula. Relative references adjust automatically. <code>$A$2</code> locks both the column and row; <code>A$2</code> locks the row, and <code>$A2</code> locks the column.</p>
      <p className="mt-2">Formulas work in supported custom cells and calculated overlays. Overlays never overwrite operational source records.</p>
    </div>,document.body)}
  </div>;
}
