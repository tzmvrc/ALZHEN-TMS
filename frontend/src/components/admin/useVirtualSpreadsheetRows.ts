import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

type Item = {index:number; spacer?:never} | {index:number;spacer:number};
/** Variable-height windowing. Gaps keep the real scroll geometry and source indexes. */
export function useVirtualSpreadsheetRows(ref:RefObject<HTMLDivElement|null>, keys:string[], enabled:boolean, keepAlive=-1, configuredHeights?:Readonly<Record<string,number>>) {
 const heights=useRef(new Map<string,{height:number;configured:number|undefined}>());
 const [window,setWindow]=useState({start:0,end:32,revision:0,active:-1});
 const signature=useMemo(()=>keys.join("|"),[keys]);
 useLayoutEffect(()=>{const retained=new Set(keys);for(const key of heights.current.keys())if(!retained.has(key))heights.current.delete(key);},[signature]);
 const offsets=useMemo(()=>{const values=[0];for(const key of keys){const configured=configuredHeights?.[key],measured=heights.current.get(key);values.push(values[values.length-1]+((measured?.configured===configured?measured?.height:undefined)??configured??30));}return values;},[signature,window.revision,configuredHeights]);
 useLayoutEffect(()=>{
  const viewport=ref.current;if(!viewport||!enabled)return;
  let frame=0;
  const find=(y:number)=>{let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>1;if(offsets[mid]<y)lo=mid+1;else hi=mid;}return lo;};
  const measure=()=>{
   let changed=false;
   for(const row of viewport.querySelectorAll<HTMLTableRowElement>("tr[data-virtual-index]")){
    const index=Number(row.dataset.virtualIndex),key=keys[index];let height=row.getBoundingClientRect().height;
    let extra=row.nextElementSibling as HTMLElement|null;
    while(extra?.dataset.virtualExtra===String(index)){height+=extra.getBoundingClientRect().height;extra=extra.nextElementSibling as HTMLElement|null;}
    const previous=heights.current.get(key),configured=configuredHeights?.[key];
    if(key&&height>0&&(!previous||previous.configured!==configured||Math.abs(previous.height-height)>.5)){heights.current.set(key,{height,configured});changed=true;}
   }
   const start=Math.max(0,find(viewport.scrollTop)-6),end=Math.min(keys.length,find(viewport.scrollTop+viewport.clientHeight)+6);
   const activeRow=document.activeElement?.closest<HTMLTableRowElement>("tr[data-virtual-index],tr[data-virtual-extra]");
   const active=activeRow&&viewport.contains(activeRow)?Number(activeRow.dataset.virtualIndex??activeRow.dataset.virtualExtra):-1;
   setWindow(previous=>previous.start===start&&previous.end===end&&!changed&&previous.active===active?previous:{start,end,active,revision:previous.revision+(changed?1:0)});
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});};
  let previousTop=viewport.scrollTop;
  const onScroll=()=>{if(viewport.scrollTop!==previousTop){previousTop=viewport.scrollTop;schedule();}};
  const observer=new ResizeObserver(schedule);observer.observe(viewport);
  viewport.querySelectorAll("tr[data-virtual-index],tr[data-virtual-extra]").forEach(row=>observer.observe(row));
  viewport.addEventListener("scroll",onScroll,{passive:true});viewport.addEventListener("focusin",schedule);viewport.addEventListener("focusout",schedule);schedule();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();viewport.removeEventListener("scroll",onScroll);viewport.removeEventListener("focusin",schedule);viewport.removeEventListener("focusout",schedule);};
 },[ref,enabled,signature,offsets,window.start,window.end]);
 return useMemo<Item[]>(()=>{
  // Disabling measurements for a hidden sheet must not expand its DOM to every
  // loaded row. Retain the last window, focused row and real spacer geometry.
  if(keys.length<=24)return keys.map((_,index)=>({index}));
  const visible=new Set<number>();for(let index=Math.min(window.start,keys.length);index<Math.min(keys.length,Math.max(window.end,window.start+1));index++)visible.add(index);
  if(window.active>=0&&window.active<keys.length)visible.add(window.active);
  if(keepAlive>=0&&keepAlive<keys.length)visible.add(keepAlive);
  const items:Item[]=[];let previous=0;
  for(const index of [...visible].sort((a,b)=>a-b)){if(index>previous)items.push({index:previous,spacer:offsets[index]-offsets[previous]});items.push({index});previous=index+1;}
  if(previous<keys.length)items.push({index:previous,spacer:offsets[keys.length]-offsets[previous]});
  return items;
 },[enabled,signature,offsets,window.start,window.end,window.active,keepAlive]);
}
