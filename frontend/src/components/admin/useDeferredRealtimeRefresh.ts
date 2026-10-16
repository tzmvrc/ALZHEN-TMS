import { useEffect, useLayoutEffect, useState } from "react";
import { createDeferredRefresh } from "../../services/deferred-refresh";

export function useDeferredRealtimeRefresh(refresh: () => Promise<unknown> | void, editing: boolean | (() => boolean)) {
  const [gate] = useState(() => createDeferredRefresh({
    refresh: () => {}, blocked: () => true,
    schedule: (callback, delay) => setTimeout(callback, delay), cancel: clearTimeout,
  }));
  useLayoutEffect(() => {
    gate.configure({ refresh, blocked: () => (typeof editing === "function" ? editing() : editing)
      || Boolean(document.activeElement?.matches("input:not([type=checkbox]):not([type=button]),textarea,select,[contenteditable=true],[role=combobox]")) });
  }, [gate, refresh, editing]);
  useEffect(() => {
    gate.resume();
    return () => gate.stop();
  }, [gate]);
  return gate;
}
