import {useEffect,useRef,type MouseEvent,type PointerEvent as ReactPointerEvent,type RefObject} from "react";

type Cell={row:string;column:string};
type Gesture={start:Cell;x:number;y:number;pointer:number;dragged:boolean;last:Cell;userSelect:string};
/** Pointer gestures feed the existing cell selection; formats and values stay with the grid. */
export function useSpreadsheetDragSelection({viewport,scope,blocked,onSelect,onFinish}:{
 viewport:RefObject<HTMLDivElement|null>;scope:string;blocked:boolean;onSelect:(row:string,column:string,extend:boolean)=>void;onFinish?:(row:string,column:string)=>void;
}) {
 const live=useRef({blocked,onSelect,onFinish});live.current={blocked,onSelect,onFinish};
 const gesture=useRef<Gesture|null>(null),suppressClick=useRef(false);
 const cellAt=(element:Element|null):Cell|null=>{const cell=element?.closest<HTMLElement>('td[data-range-row][data-range-column]');return cell&&viewport.current?.contains(cell)?{row:cell.dataset.rangeRow!,column:cell.dataset.rangeColumn!}:null;};
 useEffect(()=>{
  const stop=()=>{const current=gesture.current;gesture.current=null;if(viewport.current)viewport.current.style.userSelect=current?.userSelect??viewport.current.style.userSelect;return current;};
  const move=(event:PointerEvent)=>{
   const current=gesture.current;if(!current||event.pointerId!==current.pointer)return;
   if(event.buttons!==1||live.current.blocked){stop();return;}
   const next=cellAt(document.elementFromPoint(event.clientX,event.clientY));if(!next)return;
   if(!current.dragged&&Math.hypot(event.clientX-current.x,event.clientY-current.y)<4)return;
   event.preventDefault();
   if(!current.dragged){current.dragged=true;suppressClick.current=true;if(viewport.current)viewport.current.style.userSelect="none";live.current.onSelect(current.start.row,current.start.column,false);}
   window.getSelection()?.removeAllRanges();
   const table=viewport.current?.querySelector("table");table?.removeAttribute("data-fast-selection");table?.querySelector("[data-fast-selected]")?.removeAttribute("data-fast-selected");
   if(next.row!==current.last.row||next.column!==current.last.column){current.last=next;live.current.onSelect(next.row,next.column,true);}
  };
  const up=(event:PointerEvent)=>{if(gesture.current?.pointer!==event.pointerId)return;const current=stop();if(current?.dragged)live.current.onFinish?.(current.last.row,current.last.column);};
  const cancel=()=>{stop();};
  window.addEventListener("pointermove",move,{capture:true,passive:false});window.addEventListener("pointerup",up,true);window.addEventListener("pointercancel",cancel,true);window.addEventListener("blur",cancel);
  return()=>{stop();suppressClick.current=false;window.removeEventListener("pointermove",move,true);window.removeEventListener("pointerup",up,true);window.removeEventListener("pointercancel",cancel,true);window.removeEventListener("blur",cancel);};
 },[scope,viewport]);
 return {
  cell:(row:string,column:string)=>({"data-range-row":row,"data-range-column":column}),
  onPointerDownCapture:(event:ReactPointerEvent<HTMLDivElement>)=>{
   suppressClick.current=false;
   if(event.defaultPrevented||event.button!==0||event.pointerType==="touch"||live.current.blocked)return;
   const target=event.target as Element;
   if(target.closest('input,textarea,select,a,[contenteditable="true"],[role="combobox"],[data-formula-fill-handle],[data-spreadsheet-fill-handle]'))return;
   const start=cellAt(target);if(!start)return;
   gesture.current={start,last:start,x:event.clientX,y:event.clientY,pointer:event.pointerId,dragged:false,userSelect:viewport.current?.style.userSelect??""};
  },
  onClickCapture:(event:MouseEvent<HTMLDivElement>)=>{if(!suppressClick.current)return;suppressClick.current=false;event.preventDefault();event.stopPropagation();},
 };
}
