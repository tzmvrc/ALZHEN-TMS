import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

const SearchScopeContext = createContext<string | null>(null);
export const useTopbarSearchScope = () => useContext(SearchScopeContext);

export type TopbarSearchConfig =
  | { kind: "field"; value: string; placeholder: string; label: string; onChange: (value: string) => void; disabled?: boolean }
  | { kind: "custom"; content: ReactNode };

type Entry = { owner: symbol; config: TopbarSearchConfig };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => { listeners.forEach(listener => listener()); };

/** Registration belongs to the existing page component. Hidden Activity trees
 * release their registration, while their own query state stays mounted. */
export function useRegisterTopbarSearch(scope: string, config: TopbarSearchConfig | null) {
  const owner = useRef(Symbol(scope));
  useLayoutEffect(() => {
    return () => { if (entries.get(scope)?.owner === owner.current) { entries.delete(scope); emit(); } };
  }, [scope]);
  useLayoutEffect(() => {
    if (config) entries.set(scope, { owner: owner.current, config });
    else if (entries.get(scope)?.owner === owner.current) entries.delete(scope);
    emit();
  });
}

export function TopbarSearchRegistration({ scope, children }: { scope: string; children: ReactNode }) {
  useRegisterTopbarSearch(scope, { kind: "custom", content: <SearchScopeContext.Provider value={scope}>{children}</SearchScopeContext.Provider> });
  return null;
}

export function useTopbarSearch(scope: string) {
  return useSyncExternalStore(subscribe, () => entries.get(scope)?.config ?? null, () => null);
}
