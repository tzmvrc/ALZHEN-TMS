import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type TopbarActionKind = "prepare" | "add" | "export" | "edit" | "delete";
export type TopbarAction = { label: string; onClick: () => void; disabled?: boolean; priority?: number };
type Actions = Partial<Record<TopbarActionKind, TopbarAction>>;

const entries = new Map<string, Record<TopbarActionKind, Map<symbol, TopbarAction>>>();
const snapshots = new Map<string, Actions>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function publish(scope: string) {
  const entry = entries.get(scope);
  const pick = (kind: TopbarActionKind) => [...(entry?.[kind].values() ?? [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  if (entry && Object.values(entry).some(actions => actions.size)) snapshots.set(scope, { prepare: pick("prepare"), add: pick("add"), export: pick("export"), edit: pick("edit"), delete: pick("delete") });
  else snapshots.delete(scope);
  listeners.forEach(listener => listener());
}

/** Independent slots keep scoped actions together in the topbar. */
export function useRegisterTopbarAction(scope: string, kind: TopbarActionKind, action: TopbarAction | null) {
  const owner = useRef(Symbol("topbar-action"));
  useLayoutEffect(() => () => {
    const current = entries.get(scope);
    if (!current?.[kind].delete(owner.current)) return;
    if (!Object.values(current).some(actions => actions.size)) entries.delete(scope);
    publish(scope);
  }, [scope, kind]);
  useLayoutEffect(() => {
    const current = entries.get(scope) ?? { prepare: new Map(), add: new Map(), export: new Map(), edit: new Map(), delete: new Map() };
    if (action) current[kind].set(owner.current, action);
    else current[kind].delete(owner.current);
    if (Object.values(current).some(actions => actions.size)) entries.set(scope, current);
    else entries.delete(scope);
    publish(scope);
  });
}

export function useTopbarActions(scope: string): Actions | null {
  return useSyncExternalStore(subscribe, () => snapshots.get(scope) ?? null, () => null);
}
