import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type TopbarViewMode = "grid" | "table";
export type TopbarViewConfig = {
  value: TopbarViewMode;
  onChange: (value: TopbarViewMode) => void;
  gridLabel?: string;
  tableLabel?: string;
  priority?:number;
};

const entries = new Map<string,Map<symbol,TopbarViewConfig>>();
const snapshots=new Map<string,TopbarViewConfig>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish=(scope:string)=>{const value=[...(entries.get(scope)?.values()??[])].sort((a,b)=>(b.priority??0)-(a.priority??0))[0];if(value)snapshots.set(scope,value);else snapshots.delete(scope);listeners.forEach(listener=>listener());};
export function useRegisterTopbarView(scope: string, config: TopbarViewConfig | null) {
 const owner=useRef(Symbol(scope));
 useLayoutEffect(()=>()=>{const scoped=entries.get(scope);scoped?.delete(owner.current);if(!scoped?.size)entries.delete(scope);publish(scope);},[scope]);
 useLayoutEffect(()=>{const scoped=entries.get(scope)??new Map<symbol,TopbarViewConfig>();if(config)scoped.set(owner.current,config);else scoped.delete(owner.current);if(scoped.size)entries.set(scope,scoped);else entries.delete(scope);publish(scope);});
}

export function useTopbarView(scope: string) {
  return useSyncExternalStore(subscribe, () => snapshots.get(scope) ?? null, () => null);
}

const savedModes = new Map<string, string>();
const modeListeners = new Map<string, Set<() => void>>();
const storageKey = (scope: string) => `alzhen:view:${scope}`;
function readMode(scope: string) {
  if (!savedModes.has(scope)) {
    let saved = "";
    try { saved = sessionStorage.getItem(storageKey(scope)) ?? ""; } catch { /* Browsers may block storage. */ }
    savedModes.set(scope, saved);
  }
  return savedModes.get(scope) ?? "";
}

/** Each report sheet and page keeps its own view, including after a refresh. */
export function useStoredPageView<T extends string>(scope: string, initial: T, allowed: readonly T[]): [T, (value: T) => void] {
  const subscribeMode = useCallback((listener: () => void) => {
    const scoped = modeListeners.get(scope) ?? new Set<() => void>();
    scoped.add(listener);
    modeListeners.set(scope, scoped);
    return () => { scoped.delete(listener); if (!scoped.size) modeListeners.delete(scope); };
  }, [scope]);
  const getMode = useCallback(() => {
    const saved = readMode(scope);
    return allowed.includes(saved as T) ? saved as T : initial;
  }, [scope, initial, allowed]);
  const value = useSyncExternalStore(subscribeMode, getMode, () => initial);
  const setValue = useCallback((next: T) => {
    if (readMode(scope) === next) return;
    savedModes.set(scope, next);
    try { sessionStorage.setItem(storageKey(scope), next); } catch { /* Keep the in-memory preference. */ }
    modeListeners.get(scope)?.forEach(listener => listener());
  }, [scope]);
  return [value, setValue];
}
