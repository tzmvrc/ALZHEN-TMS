import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image, X } from "lucide-react";
import { fetchPendingOffloadCleanup, invalidateOperationsReportsCache, retryOffloadImageCleanup, type OffloadCleanupJob } from "../../services/operations-report.service";
import { useSpreadsheetFeedback } from "./SpreadsheetPresentation";

/** Cleanup recovery stays available without a persistent diagnostic banner. */
export default function OffloadCleanupNotice({ token, enabled, version }: { token: string; enabled: boolean; version: number }) {
  const [state, setState] = useState<{ token: string; rows: OffloadCleanupJob[]; error: string }>({ token, rows: [], error: "" });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const guard = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const rows = state.token === token ? state.rows : [];
  const error = state.token === token ? state.error : "";
  useSpreadsheetFeedback(error, "error");
  useEffect(() => {
    if (!enabled || !token) return;
    let active = true;
    void fetchPendingOffloadCleanup(token).then(rows => { if (active) setState({ token, rows, error: "" }); }).catch(() => { if (active) setState(current => ({ token, rows: current.token === token ? current.rows : [], error: "Unable to load image cleanup status. Please try again." })); });
    return () => { active = false; };
  }, [token, enabled, version, reload]);
  async function retry(id: string) {
    if (guard.current) return;
    guard.current = true;
    setBusy(id);
    try {
      const result = await retryOffloadImageCleanup(token, id, rows.find(job => job.id === id)?.source_type ?? "OFFLOAD");
      setState(current => ({ token, rows: result.cleanup_pending ? current.rows : current.rows.filter(job => job.id !== id), error: result.cleanup_pending ? "Image cleanup is still pending. Please try again later." : "" }));
      if (!result.cleanup_pending) {
        setReload(current => current + 1);
        invalidateOperationsReportsCache();
      }
    } catch { setState(current => ({ ...current, error: "Unable to complete image cleanup. Please try again later." })); }
    finally { guard.current = false; setBusy(null); }
  }
  const close = () => { if (!guard.current) { setOpen(false); trigger.current?.focus(); } };
  if (!enabled || !rows.length && !error && !open) return null;
  return <>
    <button ref={trigger} type="button" aria-label="Review image cleanup" title="Review image cleanup" onClick={() => setOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Image aria-hidden="true" className="h-4 w-4" /></button>
    {open && createPortal(<div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 al-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="report-cleanup-title" onKeyDown={event => { if (event.key === "Escape") close(); }} className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-xl">
        <header className="flex items-center justify-between gap-3"><h2 id="report-cleanup-title" className="font-semibold text-[#0b2341]">Report image cleanup</h2><button type="button" autoFocus disabled={Boolean(busy)} onClick={close} aria-label="Close image cleanup" className="rounded p-1 text-slate-500 disabled:opacity-40"><X className="h-4 w-4" /></button></header>
        <p className="mt-2 text-sm text-slate-600">Deleted reports may still have images awaiting cleanup. Retrying preserves ownership and retention checks.</p>
        <div className="mt-4 space-y-2">{rows.map((job, index) => <div key={job.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span>{job.source_type === "BACKLOAD" ? "Backload" : "Offload"} report {index + 1}</span><button type="button" disabled={Boolean(busy)} onClick={() => void retry(job.id)} className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">{busy === job.id ? "Retrying..." : "Retry cleanup"}</button></div>)}</div>
        {!rows.length && !error && <p className="mt-3 text-sm text-slate-600">No image cleanup is pending.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <button type="button" disabled={Boolean(busy)} onClick={() => setReload(current => current + 1)} className="mt-4 text-xs font-semibold text-blue-700 underline disabled:opacity-40">Refresh cleanup status</button>
      </section>
    </div>, document.body)}
  </>;
}
