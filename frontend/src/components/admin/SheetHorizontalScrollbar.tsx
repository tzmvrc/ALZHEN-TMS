import {ChevronLeft,ChevronRight} from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

/** Small native scrollbar synchronized directly with the active sheet, without grid renders. */
export default function SheetHorizontalScrollbar({ workspace, sheet, arrows=false, width }: { workspace: RefObject<HTMLElement | null>; sheet: string; arrows?:boolean; width?:number }) {
  const track = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setInterval>|null>(null);
  const stopHold=()=>{if(hold.current!==null){clearInterval(hold.current);hold.current=null;}};
  const scroll=(direction:number,amount=40)=>{const viewport=workspace.current?.querySelector<HTMLElement>(`#trip-sheet-${sheet} .spreadsheet-viewport`);if(viewport)viewport.scrollLeft+=direction*amount;};
  const startHold=(direction:number)=>{stopHold();hold.current=setInterval(()=>scroll(direction,12),40);};
  useEffect(()=>{window.addEventListener("pointerup",stopHold);window.addEventListener("pointercancel",stopHold);window.addEventListener("blur",stopHold);return()=>{stopHold();window.removeEventListener("pointerup",stopHold);window.removeEventListener("pointercancel",stopHold);window.removeEventListener("blur",stopHold);};},[sheet]);
  useEffect(() => {
    const root = workspace.current, bar = track.current, content = spacer.current;
    if (!root || !bar || !content) return;
    let cleanup = () => {};
    const connect = () => {
      const viewport = root.querySelector<HTMLElement>(`#trip-sheet-${sheet} .spreadsheet-viewport`);
      if (!viewport) return false;
      let frame = 0;
      let synchronizedPosition = -1;
      let synchronizedViewport = viewport.scrollLeft;
      let viewportRange = 0, barRange = 0;
      const syncPosition = () => {
        bar.scrollLeft = viewportRange > 0 ? viewport.scrollLeft / viewportRange * barRange : 0;
        synchronizedPosition = bar.scrollLeft;
        synchronizedViewport = viewport.scrollLeft;
      };
      const sync = () => {
        frame = 0;
        content.style.width = `${Math.max(bar.clientWidth, bar.clientWidth * viewport.scrollWidth / Math.max(1, viewport.clientWidth))}px`;
        viewportRange = viewport.scrollWidth - viewport.clientWidth;
        barRange = bar.scrollWidth - bar.clientWidth;
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
        const delta = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX;
        if (!delta) return;
        const previous = viewport.scrollLeft;
        viewport.scrollLeft += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1);
        if (viewport.scrollLeft !== previous) event.preventDefault();
      };
      viewport.addEventListener("wheel", wheel, { passive: false });
      const resize = new ResizeObserver(schedule);
      resize.observe(viewport); resize.observe(bar);
      const table = viewport.querySelector("table");
      if (table) resize.observe(table);
      viewport.addEventListener("scroll", syncPosition, { passive: true });
      bar.addEventListener("scroll", move, { passive: true });
      schedule();
      cleanup = () => { cancelAnimationFrame(frame); resize.disconnect(); viewport.removeEventListener("wheel", wheel); viewport.removeEventListener("scroll", syncPosition); bar.removeEventListener("scroll", move); };
      return true;
    };
    const observer = new MutationObserver(() => { if (connect()) observer.disconnect(); });
    if (!connect()) observer.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); cleanup(); };
  }, [workspace, sheet]);
  return <div className={`flex shrink-0 items-center border-l border-slate-200 bg-slate-100 px-1 ${width === undefined ? "w-1/4 min-w-32" : "min-w-0"}`} style={width === undefined ? undefined : {width, minWidth:width, maxWidth:width, flex:`0 0 ${width}px`}}>
    {arrows&&<button type="button" aria-label="Scroll database left" title="Scroll left (hold to continue)" onPointerDown={()=>startHold(-1)} onPointerLeave={stopHold} onClick={()=>scroll(-1)} className="flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center text-slate-500 hover:bg-white"><ChevronLeft className="h-3.5 w-3.5"/></button>}
    <div ref={track} tabIndex={0} role="region" aria-label="Scroll sheet horizontally" className="sheet-horizontal-scrollbar min-w-0 flex-1 overflow-x-scroll overflow-y-hidden focus-visible:outline-2 focus-visible:outline-blue-500"><div ref={spacer} style={{ height: 1 }} /></div>
    {arrows&&<button type="button" aria-label="Scroll database right" title="Scroll right (hold to continue)" onPointerDown={()=>startHold(1)} onPointerLeave={stopHold} onClick={()=>scroll(1)} className="flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center text-slate-500 hover:bg-white"><ChevronRight className="h-3.5 w-3.5"/></button>}
  </div>;
}
