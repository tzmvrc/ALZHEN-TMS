import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

export type TopbarActionKind = "prepare" | "add" | "export";
export type TopbarAction = { label: string; onClick: () => void; disabled?: boolean; priority?: number };
type Actions = Partial<Record<TopbarActionKind, TopbarAction>>;

const entries = new Map<string, Record<TopbarActionKind, Map<symbol, TopbarAction>>>();
const snapshots = new Map<string, Actions>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function publish(scope: string) {
  const entry = entries.get(scope);
  const pick = (kind: TopbarActionKind) => [...(entry?.[kind].values() ?? [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  if (entry?.prepare.size || entry?.add.size || entry?.export.size) snapshots.set(scope, { prepare: pick("prepare"), add: pick("add"), export: pick("export") });
  else snapshots.delete(scope);
  listeners.forEach(listener => listener());
}

/** Independent slots keep scoped Prepare, Export, and Add actions together in the topbar. */
export function useRegisterTopbarAction(scope: string, kind: TopbarActionKind, action: TopbarAction | null) {
  const owner = useRef(Symbol("topbar-action"));
  useLayoutEffect(() => () => {
    const current = entries.get(scope);
    if (!current?.[kind].delete(owner.current)) return;
    if (!current.prepare.size && !current.add.size && !current.export.size) entries.delete(scope);
    publish(scope);
  }, [scope, kind]);
  useLayoutEffect(() => {
    const current = entries.get(scope) ?? { prepare: new Map(), add: new Map(), export: new Map() };
    if (action) current[kind].set(owner.current, action);
    else current[kind].delete(owner.current);
    if (current.prepare.size || current.add.size || current.export.size) entries.set(scope, current);
    else entries.delete(scope);
    publish(scope);
  });
}

export function useTopbarActions(scope: string): Actions | null {
  return useSyncExternalStore(subscribe, () => snapshots.get(scope) ?? null, () => null);
}
