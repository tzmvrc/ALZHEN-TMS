import {useLayoutEffect,useRef,useSyncExternalStore} from "react";

const rooms = new Map<symbol,string>();
const listeners = new Set<() => void>();
const subscribe = (listener:()=>void) => {listeners.add(listener);return()=>{listeners.delete(listener);};};
const current = () => [...rooms.values()].at(-1) ?? null;
const emit = () => listeners.forEach(listener=>listener());

/** A transient table shown in a modal can temporarily own sidebar presence. */
export function useRegisterSidebarPresence(table:string|null){
 const owner=useRef(Symbol("sidebar-presence"));
 useLayoutEffect(()=>()=>{if(rooms.delete(owner.current))emit();},[]);
 useLayoutEffect(()=>{if(table)rooms.set(owner.current,table);else rooms.delete(owner.current);emit();});
}
export function useSidebarPresence(){return useSyncExternalStore(subscribe,current,()=>null);}
