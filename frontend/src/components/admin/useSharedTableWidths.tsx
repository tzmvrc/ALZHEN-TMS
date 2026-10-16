import { useCallback, useEffect, useSyncExternalStore } from "react";
import { emptyWidths, readSharedWidths, refreshSharedWidths, retrySharedWidths, saveSharedWidth, subscribeSharedWidths } from "../../services/shared-table-widths";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import {subscribeCollaborationEvents} from "../../services/collaboration.service";

const polling = new Map<string, { count: number; stop: () => void }>();
function startPolling(token: string, table: string) {
  const key = `${token}:${table}`;
  let state = polling.get(key);
  if (!state) {
    const refresh = () => { if (document.visibilityState !== "hidden") void refreshSharedWidths(token, table); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    const unsubscribe = subscribeToAdminRealtime((event) => {
      if (event.kind === "resume" || (event.kind === "batch" && event.tables.includes("shared_table_column_widths"))) refresh();
    });
    const stopSocket=subscribeCollaborationEvents(event=>{if(event.kind==="layout"&&event.table===table)refresh();});
    window.addEventListener("focus", refresh);
    state = { count: 0, stop: () => { unsubscribe();stopSocket(); window.clearInterval(timer); window.removeEventListener("focus", refresh); } };
    polling.set(key, state);
  }
  state.count += 1;
  return () => { if (--state.count === 0) { state.stop(); polling.delete(key); } };
}

export function useSharedTableWidths(table: string, token: string | null, enabled = true) {
  const active = enabled && Boolean(token);
  const snapshot = useSyncExternalStore(
    (listener) => active ? subscribeSharedWidths(token!, table, listener) : () => {},
    () => active ? readSharedWidths(token!, table) : emptyWidths,
  );
  useEffect(() => {
    if (!active) return;
    // Authorized API reconciliation: no direct base-table grants or exposed data.
    return startPolling(token!, table);
  }, [active, token, table]);
  const save = useCallback((column: string, width: number) => active ? saveSharedWidth(token!, table, column, width) : Promise.resolve(), [active, token, table]);
  return { ...snapshot, save,
    feedback: snapshot.error ? <p role="alert" className="text-xs text-amber-800">{snapshot.error} <button type="button" className="underline" onClick={() => void retrySharedWidths(token!, table)}>Retry shared layout</button></p> : null,
  };
}
