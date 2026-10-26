import {useEffect,useLayoutEffect,useRef,type RefObject} from "react";

/** Shared near-end loading. Observe the content as well as the viewport so short
 * pages fill the visible area automatically without scroll jumps or polling. */
export function useSpreadsheetInfiniteScroll(ref:RefObject<HTMLElement|null>,{enabled=true,hasMore,loading=false,blocked=false,onLoadMore,revision,queryKey,axis="vertical"}:{axis?:"vertical"|"horizontal";enabled?:boolean;hasMore:boolean;loading?:boolean;blocked?:boolean;onLoadMore:()=>void|Promise<unknown>;revision?:unknown;queryKey?:string}){
 const latest=useRef({hasMore,loading,blocked,onLoadMore});latest.current={hasMore,loading,blocked,onLoadMore};
 const inFlight=useRef(false),resume=useRef<(()=>void)|undefined>(undefined);
 const previousQuery=useRef(queryKey);
 useLayoutEffect(()=>{if(previousQuery.current!==queryKey){previousQuery.current=queryKey;if(ref.current){if(axis==="horizontal")ref.current.scrollLeft=0;else ref.current.scrollTop=0;}}},[queryKey,ref,axis]);
 useEffect(()=>{
  const viewport=ref.current;if(!viewport||!enabled)return;
  let frame=0,disposed=false;
  const check=()=>{if(frame)return;frame=requestAnimationFrame(()=>{
   frame=0;const state=latest.current;
   if(disposed||inFlight.current||(axis==="horizontal"?viewport.clientWidth:viewport.clientHeight)<=0||!state.hasMore||state.loading||state.blocked||(axis==="horizontal"?viewport.scrollWidth-viewport.scrollLeft-viewport.clientWidth:viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight)>=Math.max(240,(axis==="horizontal"?viewport.clientWidth:viewport.clientHeight)*.6))return;
   inFlight.current=true;
   void Promise.resolve().then(()=>state.onLoadMore()).catch(()=>{
    // Adapters retain their rows and expose their own recoverable error state.
   }).finally(()=>{inFlight.current=false;resume.current?.();});
  });};
  resume.current=check;
  const observer=new ResizeObserver(check);observer.observe(viewport);if(viewport.firstElementChild)observer.observe(viewport.firstElementChild);
  viewport.addEventListener("scroll",check,{passive:true});check();
  return()=>{disposed=true;if(resume.current===check)resume.current=undefined;cancelAnimationFrame(frame);observer.disconnect();viewport.removeEventListener("scroll",check);};
 },[ref,enabled,hasMore,loading,blocked,revision,axis]);
}
