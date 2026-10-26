import { useSyncExternalStore } from "react";

type PageScope = "trips" | "database" | "truckers" | "billing";

const sections: Record<PageScope, string> = { trips: "", database: "", truckers: "", billing: "" };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function setPageSection(scope: PageScope, title: string) {
  if (sections[scope] === title) return;
  sections[scope] = title;
  listeners.forEach((listener) => listener());
}

export function usePageSection(scope: PageScope) {
  return useSyncExternalStore(subscribe, () => sections[scope], () => "");
}
