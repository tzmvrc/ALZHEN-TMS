import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type TopbarViewMode = "grid" | "table";
export type TopbarViewConfig = {
  value: TopbarViewMode;
  onChange: (value: TopbarViewMode) => void;
  gridLabel?: string;
  tableLabel?: string;
};

type Entry = { owner: symbol; config: TopbarViewConfig };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => { listeners.forEach(listener => listener()); };

export function useRegisterTopbarView(scope: string, config: TopbarViewConfig | null) {
  const owner = useRef(Symbol(scope));
  useLayoutEffect(() => () => {
    if (entries.get(scope)?.owner === owner.current) { entries.delete(scope); emit(); }
  }, [scope]);
  useLayoutEffect(() => {
    if (config) entries.set(scope, { owner: owner.current, config });
    else if (entries.get(scope)?.owner === owner.current) entries.delete(scope);
    emit();
  });
}

export function useTopbarView(scope: string) {
  return useSyncExternalStore(subscribe, () => entries.get(scope)?.config ?? null, () => null);
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
