import { useSpreadsheetFeedback } from "./SpreadsheetPresentation";
import { ToastContext } from "../ui/toast-context";
import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { emptyDesign, readSharedDesign, subscribeSharedDesign, refreshSharedDesign, saveSharedDesign, saveSharedColumnOrder, retrySharedDesign, mergeColumnDesign, mergeDesignPatches, type ColumnDesign } from "../../services/shared-table-design";
import { subscribeCollaborationEvents } from "../../services/collaboration.service";
import { subscribeToAdminRealtime } from "../../services/realtime.service";

export function useSharedTableDesign(table: string, token: string | null, enabled = true, paused = false) {
  const active = enabled && Boolean(token);
  const snapshot = useSyncExternalStore(fn => active ? subscribeSharedDesign(token!, table, fn) : () => {}, () => active ? readSharedDesign(token!, table) : emptyDesign);
  const toast = useContext(ToastContext);
  const owner = `${token}:${table}`;
  const [applied, setApplied] = useState(() => ({ owner, snapshot }));
  // Only this account's deliberate design changes can bypass the incoming-update pause.
  const [preview, setPreview] = useState<{ owner: string; columns: Record<string, ColumnDesign> }>({ owner, columns: {} });
  const columns = useMemo(() => {
    const base = applied.owner === owner ? applied.snapshot.columns : {};
    if (preview.owner !== owner || !Object.keys(preview.columns).length) return base;
    const next = { ...base };
    for (const [key, patch] of Object.entries(preview.columns)) next[key] = mergeColumnDesign(next[key] ?? {}, patch);
    return next;
  }, [applied, owner, preview]);
  useEffect(() => {
    let live = true;
    if (!paused) queueMicrotask(() => {
      if (!live) return;
      setApplied(current=>current.owner===owner&&current.snapshot===snapshot?current:{ owner, snapshot });
      if (!snapshot.saving) setPreview(current => current.owner === owner && !Object.keys(current.columns).length ? current : { owner, columns: {} });
    });
    return () => { live = false; };
  }, [owner, snapshot, paused]);
  useSpreadsheetFeedback(snapshot.error && !snapshot.saving ? "Formatting could not be saved or refreshed. Your changes are kept here; choose Retry design." : null, "error");
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { if (timer) return; timer = setTimeout(() => { timer = undefined; void refreshSharedDesign(token!, table, true); }, 150); };
    void refreshSharedDesign(token!, table);
    const socket = subscribeCollaborationEvents(event => { if (event.kind === "connected" || event.kind === "layout" && event.table === table) refresh(); });
    const signals = subscribeToAdminRealtime(event => { if (event.kind === "resume" || event.kind === "batch" && event.tables.includes("shared_table_column_widths") || event.kind === "change" && event.payload.table === "shared_table_column_widths" || event.kind === "recovered" && event.table === "shared_table_column_widths") refresh(); });
    window.addEventListener("focus", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); socket(); signals(); };
  }, [active, table, token]);
  const stage = useCallback((patches: Record<string, ColumnDesign>) => setPreview(current => {
    const next = current.owner === owner ? { ...current.columns } : {};
    for (const [key, patch] of Object.entries(patches)) next[key] = mergeDesignPatches(next[key] ?? {}, patch);
    return { owner, columns: next };
  }), [owner]);
  const denied = useCallback(() => { toast?.addToast({ title: "You do not have permission to change this table layout.", variant: "error" }); return Promise.resolve(); }, [toast?.addToast]);
  const save = useCallback((column: string, patch: ColumnDesign, width: number) => {
    if (!active) return denied();
    stage({ [column]: patch });
    return saveSharedDesign(token!, table, column, patch, width);
  }, [active, denied, stage, token, table]);
  const saveOrder = useCallback((keys: readonly string[], width: (key: string) => number) => {
    if (!active) return denied();
    stage(Object.fromEntries(keys.map((key, position) => [key, { position }])));
    return saveSharedColumnOrder(token!, table, keys, width);
  }, [active, denied, stage, token, table]);
  return { ...snapshot, canEdit: active, saveOrder, columns, loaded: applied.owner === owner && applied.snapshot.loaded, save,
    feedback: snapshot.error ? <button type="button" aria-label="Retry table design" title="Retry table design" onClick={() => void retrySharedDesign(token!, table)} className="inline-flex h-9 items-center justify-center rounded px-2 text-xs border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500">Retry design</button> : null,
  };
}
