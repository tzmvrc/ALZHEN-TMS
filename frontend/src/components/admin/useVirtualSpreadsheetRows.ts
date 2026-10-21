import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

type Item = {index:number; spacer?:never} | {index:number;spacer:number};
/** Variable-height windowing. Gaps keep the real scroll geometry and source indexes. */
export function useVirtualSpreadsheetRows(ref:RefObject<HTMLDivElement|null>, keys:string[], enabled:boolean, keepAlive=-1) {
 const heights=useRef(new Map<string,number>());
 const [window,setWindow]=useState({start:0,end:60,revision:0,active:-1});
 const signature=useMemo(()=>keys.join("|"),[keys]);
 const offsets=useMemo(()=>{const values=[0];for(const key of keys)values.push(values[values.length-1]+(heights.current.get(key)??30));return values;},[signature,window.revision]);
 useLayoutEffect(()=>{
  const viewport=ref.current;if(!viewport||!enabled)return;
  let frame=0;
  const find=(y:number)=>{let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>1;if(offsets[mid]<y)lo=mid+1;else hi=mid;}return lo;};
  const measure=()=>{
   let changed=false;
   for(const row of viewport.querySelectorAll<HTMLTableRowElement>("tr[data-virtual-index]")){
    const index=Number(row.dataset.virtualIndex),key=keys[index],height=row.getBoundingClientRect().height;
    if(key&&height>0&&Math.abs((heights.current.get(key)??30)-height)>.5){heights.current.set(key,height);changed=true;}
   }
   const start=Math.max(0,find(viewport.scrollTop)-15),end=Math.min(keys.length,find(viewport.scrollTop+viewport.clientHeight)+15);
   const activeRow=document.activeElement?.closest<HTMLTableRowElement>("tr[data-virtual-index]");
   const active=activeRow&&viewport.contains(activeRow)?Number(activeRow.dataset.virtualIndex):-1;
   setWindow(previous=>previous.start===start&&previous.end===end&&!changed&&previous.active===active?previous:{start,end,active,revision:previous.revision+(changed?1:0)});
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});};
  const observer=new ResizeObserver(schedule);observer.observe(viewport);
  viewport.querySelectorAll("tr[data-virtual-index]").forEach(row=>observer.observe(row));
  viewport.addEventListener("scroll",schedule,{passive:true});viewport.addEventListener("focusin",schedule);viewport.addEventListener("focusout",schedule);schedule();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();viewport.removeEventListener("scroll",schedule);viewport.removeEventListener("focusin",schedule);viewport.removeEventListener("focusout",schedule);};
 },[ref,enabled,signature,offsets,window.start,window.end]);
 return useMemo<Item[]>(()=>{
  if(!enabled||keys.length<=100)return keys.map((_,index)=>({index}));
  const visible=new Set<number>();for(let index=Math.min(window.start,keys.length);index<Math.min(keys.length,Math.max(window.end,window.start+1));index++)visible.add(index);
  if(window.active>=0&&window.active<keys.length)visible.add(window.active);
  if(keepAlive>=0&&keepAlive<keys.length)visible.add(keepAlive);
  const items:Item[]=[];let previous=0;
  for(const index of [...visible].sort((a,b)=>a-b)){if(index>previous)items.push({index:previous,spacer:offsets[index]-offsets[previous]});items.push({index});previous=index+1;}
  if(previous<keys.length)items.push({index:previous,spacer:offsets[keys.length]-offsets[previous]});
  return items;
 },[enabled,signature,offsets,window.start,window.end,window.active,keepAlive]);
}
