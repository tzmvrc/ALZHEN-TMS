import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type TopbarFilterOption = { value: string; label: string };
export type TopbarFilterConfig = {
  label: string;
  value: string;
  options: readonly TopbarFilterOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};
type Entry = { owner: symbol; config: TopbarFilterConfig };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());

/** Each page retains its own filter state; only the controls move into the topbar. */
export function useRegisterTopbarFilter(scope: string, config: TopbarFilterConfig | null) {
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

export function useTopbarFilter(scope: string) {
  return useSyncExternalStore(subscribe, () => entries.get(scope)?.config ?? null, () => null);
}
