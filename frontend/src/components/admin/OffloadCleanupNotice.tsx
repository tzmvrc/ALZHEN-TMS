import { useEffect, useRef, useState } from "react";
import { fetchPendingOffloadCleanup, invalidateOperationsReportsCache, retryOffloadImageCleanup, type OffloadCleanupJob } from "../../services/operations-report.service";

export default function OffloadCleanupNotice({ token, enabled, version }: { token: string; enabled: boolean; version: number }) {
  const [state, setState] = useState<{ token: string; rows: OffloadCleanupJob[]; error: string }>({ token, rows: [], error: "" });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const guard = useRef(false);
  const rows = state.token === token ? state.rows : [];
  const error = state.token === token ? state.error : "";
  useEffect(() => {
    if (!enabled || !token) return;
    let active = true;
    void fetchPendingOffloadCleanup(token).then((rows) => { if (active) setState({ token, rows, error: "" }); }).catch(() => { if (active) setState((current) => ({ token, rows: current.token === token ? current.rows : [], error: "Pending image cleanup could not be loaded." })); });
    return () => { active = false; };
  }, [token, enabled, version, reload]);
  async function retry(id: string) {
    if (guard.current) return;
    guard.current = true; setBusy(id);
    try {
      const result = await retryOffloadImageCleanup(token, id);
      setState((current) => ({ token, rows: result.cleanup_pending ? current.rows : current.rows.filter((job) => job.id !== id), error: result.cleanup_pending ? "The report is deleted, but image cleanup is still pending. Retry later or ask an administrator to review storage ownership." : "" }));
      if (!result.cleanup_pending) setReload((current) => current + 1);
    } catch (cause) { setState((current) => ({ ...current, error: cause instanceof Error ? cause.message : "Image cleanup could not be confirmed." })); }
    finally { guard.current = false; setBusy(null); }
  }
  if (!enabled || (!rows.length && !error)) return null;
  return <section aria-label="Pending Offload image cleanup" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
    {rows.length > 0 && <p>These reports were permanently deleted. Their image cleanup is not complete:</p>}
    {rows.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2"><span>Offload {job.offload_id}</span><button type="button" disabled={Boolean(busy)} className="rounded border border-amber-300 px-2 py-1 font-semibold disabled:opacity-50" onClick={() => void retry(job.id)}>{busy === job.id ? "Cleaning images…" : "Retry image cleanup"}</button></div>)}
    {error && <p role="alert">{error} <button type="button" disabled={Boolean(busy)} className="underline" onClick={() => { invalidateOperationsReportsCache(); setReload((current) => current + 1); }}>Refresh cleanup status</button></p>}
  </section>;
}
