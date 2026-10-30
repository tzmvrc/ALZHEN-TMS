import {ChevronLeft,ChevronRight} from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

function tableScrollRange(viewport: HTMLElement) {
  const table = viewport.querySelector("table");
  const available = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  if (!table) return available;
  const tableRight = table.getBoundingClientRect().right - viewport.getBoundingClientRect().left + viewport.scrollLeft;
  return Math.max(0, Math.min(available, tableRight - viewport.clientWidth));
}

export function visibleSheetViewport(workspace:HTMLElement|null,sheet:string){
  return Array.from(workspace?.querySelectorAll<HTMLElement>(`#trip-sheet-${sheet} .spreadsheet-viewport`)??[]).find(viewport=>viewport.clientWidth>0&&viewport.getClientRects().length>0);
}

/** Compact native scrollbar; synchronization never rerenders the grid. */
export default function SheetHorizontalScrollbar({ workspace, sheet, arrows=false }: { workspace: RefObject<HTMLElement | null>; sheet: string; arrows?:boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const leftArrow = useRef<HTMLButtonElement>(null), rightArrow = useRef<HTMLButtonElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout>|null>(null), holdFrame = useRef(0), held = useRef(false);
  const stopHold=()=>{if(hold.current!==null){clearTimeout(hold.current);hold.current=null;}cancelAnimationFrame(holdFrame.current);holdFrame.current=0;};
  const getViewport=()=>visibleSheetViewport(workspace.current,sheet);
  const scroll=(direction:number)=>{
    const viewport=getViewport();if(!viewport)return;
    const distance=direction*Math.max(80,Math.round(viewport.clientWidth*.15));
    const target=Math.max(0,Math.min(tableScrollRange(viewport),viewport.scrollLeft+distance));
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)viewport.scrollLeft=target;
    else viewport.scrollTo({left:target,behavior:"smooth"});
  };
  const startHold=(direction:number)=>{
    stopHold();held.current=false;
    hold.current=setTimeout(()=>{
      hold.current=null;held.current=true;let previous=performance.now();
      const advance=(time:number)=>{
        const viewport=getViewport();if(!viewport){stopHold();return;}
        const position=viewport.scrollLeft;
        viewport.scrollLeft=Math.max(0,Math.min(tableScrollRange(viewport),position+direction*Math.min(32,time-previous)*.75));previous=time;
        if(viewport.scrollLeft===position){stopHold();return;}
        holdFrame.current=requestAnimationFrame(advance);
      };
      holdFrame.current=requestAnimationFrame(advance);
    },220);
  };
  useEffect(()=>{window.addEventListener("pointerup",stopHold);window.addEventListener("pointercancel",stopHold);window.addEventListener("blur",stopHold);return()=>{stopHold();window.removeEventListener("pointerup",stopHold);window.removeEventListener("pointercancel",stopHold);window.removeEventListener("blur",stopHold);};},[sheet]);
  useEffect(() => {
    const root = workspace.current, bar = track.current, content = spacer.current;
    if (!root || !bar || !content) return;
    let cleanup = () => {};
    const connect = () => {
      const viewport = visibleSheetViewport(root,sheet);
      if (!viewport) return false;
      let frame = 0;
      let synchronizedPosition = -1;
      let synchronizedViewport = viewport.scrollLeft;
      let viewportRange = 0, barRange = 0;
      const syncPosition = () => {
        if(viewport.scrollLeft>viewportRange)viewport.scrollLeft=viewportRange;
        bar.scrollLeft = viewportRange > 0 ? viewport.scrollLeft / viewportRange * barRange : 0;
        synchronizedPosition = bar.scrollLeft;
        synchronizedViewport = viewport.scrollLeft;
        if(leftArrow.current)leftArrow.current.disabled=viewportRange<=0||viewport.scrollLeft<=0;
        if(rightArrow.current)rightArrow.current.disabled=viewportRange<=0||viewport.scrollLeft>=viewportRange-1;
      };
      const sync = () => {
        frame = 0;
        // Hidden/retained sheets must not reset their saved scroll position.
        if(!bar.clientWidth||!viewport.clientWidth)return;
        viewportRange = tableScrollRange(viewport);
        content.style.width = `${bar.clientWidth * (1 + viewportRange / viewport.clientWidth)}px`;
        barRange = Math.max(0,bar.scrollWidth - bar.clientWidth);
        syncPosition();
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
      const move = () => {
        if (viewport.scrollLeft !== synchronizedViewport) { syncPosition(); return; }
        if (bar.scrollLeft === synchronizedPosition) return;
        synchronizedPosition = bar.scrollLeft;
        viewport.scrollLeft = barRange > 0 ? bar.scrollLeft / barRange * viewportRange : 0;
        synchronizedViewport = viewport.scrollLeft;
      };
      const wheel = (event: WheelEvent) => {
        if(event.ctrlKey)return; // Preserve browser/trackpad pinch zoom.
        const overBar=event.currentTarget===bar;
        const delta=event.deltaX||((overBar||event.shiftKey)?event.deltaY:0);
        if (!delta) return;
        const previous = viewport.scrollLeft;
        viewport.scrollLeft = Math.max(0,Math.min(tableScrollRange(viewport),previous+delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1)));
        if (viewport.scrollLeft !== previous) {
          // Diagonal trackpad gestures keep their vertical component in the grid.
          if(!overBar&&!event.shiftKey&&event.deltaY)viewport.scrollTop+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
          event.preventDefault();
        }
      };
      viewport.addEventListener("wheel", wheel, { passive: false });
      bar.addEventListener("wheel", wheel, { passive: false });
      const resize = new ResizeObserver(schedule);
      resize.observe(viewport); resize.observe(bar);
      const tableContent = viewport.querySelector("table, .ml-table-inner");
      if (tableContent) resize.observe(tableContent);
      viewport.addEventListener("scroll", syncPosition, { passive: true });
      bar.addEventListener("scroll", move, { passive: true });
      schedule();
      cleanup = () => { cancelAnimationFrame(frame); resize.disconnect(); viewport.removeEventListener("wheel", wheel); bar.removeEventListener("wheel", wheel); viewport.removeEventListener("scroll", syncPosition); bar.removeEventListener("scroll", move); };
      return true;
    };
    const observer = new MutationObserver(() => { if (connect()) observer.disconnect(); });
    if (!connect()) observer.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); cleanup(); };
  }, [workspace, sheet]);
  return <div className="sheet-horizontal-scrollbar-control flex items-center border-l border-slate-200 bg-slate-100 px-1">
    {arrows&&<button ref={leftArrow} type="button" aria-label="Scroll sheet left" title="Scroll left (hold to continue)" onPointerDown={event=>{if(event.button===0)startHold(-1);}} onPointerLeave={stopHold} onClick={event=>{if(event.detail&&held.current){held.current=false;return;}scroll(-1);}} className="flex h-6 w-5 shrink-0 touch-none cursor-pointer items-center justify-center rounded text-slate-500 hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5"/></button>}
    <div ref={track} tabIndex={0} role="region" aria-label="Scroll sheet horizontally" className="sheet-horizontal-scrollbar min-w-0 flex-1 overflow-x-scroll overflow-y-hidden focus-visible:outline-2 focus-visible:outline-blue-500"><div ref={spacer} style={{ height: 1 }} /></div>
    {arrows&&<button ref={rightArrow} type="button" aria-label="Scroll sheet right" title="Scroll right (hold to continue)" onPointerDown={event=>{if(event.button===0)startHold(1);}} onPointerLeave={stopHold} onClick={event=>{if(event.detail&&held.current){held.current=false;return;}scroll(1);}} className="flex h-6 w-5 shrink-0 touch-none cursor-pointer items-center justify-center rounded text-slate-500 hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5"/></button>}
  </div>;
}
