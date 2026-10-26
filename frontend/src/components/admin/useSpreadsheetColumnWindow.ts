import {useLayoutEffect,useMemo,useState,type RefObject} from "react";

/** Keep every physical cell/header for sizing, selection and keyboard navigation,
 * but mount expensive editors/presence only near the horizontal viewport. */
export function useSpreadsheetColumnWindow(ref:RefObject<HTMLElement|null>,columns:readonly {key:string;width:number}[],pinned:Readonly<Record<string,unknown>>,required:readonly (string|null|undefined)[]){
 const [window,setWindow]=useState({first:0,last:9});
 useLayoutEffect(()=>{
  const viewport=ref.current;if(!viewport)return;
  let frame=0;
  const measure=()=>{frame=0;const left=viewport.scrollLeft,width=viewport.clientWidth;if(!width)return;let offset=32,first=columns.length,last=-1;columns.forEach((column,index)=>{if(offset+column.width>=left-240&&offset<=left+width+240){first=Math.min(first,index);last=index;}offset+=column.width;});setWindow(previous=>previous.first===first&&previous.last===last?previous:{first,last});};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  const resize=new ResizeObserver(schedule);resize.observe(viewport);viewport.addEventListener("scroll",schedule,{passive:true});measure();
  return()=>{cancelAnimationFrame(frame);resize.disconnect();viewport.removeEventListener("scroll",schedule);};
 },[ref,columns]);
 const requiredKey=required.join("|");
 return useMemo(()=>{
  const visible=new Set<string>(requiredKey.split("|").filter(Boolean));
  columns.forEach((column,index)=>{if(pinned[column.key]||index>=window.first&&index<=window.last)visible.add(column.key);});
  return visible;
 },[columns,pinned,requiredKey,window]);
}
