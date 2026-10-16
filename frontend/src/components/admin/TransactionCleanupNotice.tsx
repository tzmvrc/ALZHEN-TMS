import { useEffect, useRef, useState } from "react";
import { fetchTransactionCleanup, retryTransactionCleanup, type TransactionCleanup } from "../../services/trip.service";

export default function TransactionCleanupNotice({ token, version }: { token: string; version: number }) {
  const [state, setState] = useState<{ token: string; rows: TransactionCleanup[]; error: string }>({ token, rows: [], error: "" });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  useEffect(() => {
    let active = true;
    void fetchTransactionCleanup(token).then((rows) => { if (active) setState({ token, rows, error: "" }); }).catch(() => {
      if (active) setState((current) => ({ token, rows: current.token === token ? current.rows : [], error: "Pending transaction image cleanup could not be loaded." }));
    });
    return () => { active = false; };
  }, [token, version, reload]);
  async function retry(id: string) {
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try {
      const outcome = await retryTransactionCleanup(token, id);
      setState((current) => ({ token, rows: outcome.cleanup_pending ? current.rows : current.rows.filter((job) => job.id !== id), error: outcome.cleanup_pending ? "Transaction deleted; image cleanup is still pending. Retry later." : "" }));
    } catch (error) { setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Cleanup could not be confirmed." })); }
    finally { guard.current = false; setBusy(false); }
  }
  if (state.token !== token || (!state.rows.length && !state.error)) return null;
  return <section aria-label="Pending transaction image cleanup" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
    {state.rows.length > 0 && <p>These transactions are permanently deleted. Their image cleanup is pending:</p>}
    {state.rows.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2"><span>Transaction {job.transaction_id}</span><button type="button" disabled={busy} onClick={() => void retry(job.id)} className="rounded border border-amber-300 px-2 py-1 font-semibold disabled:opacity-50">Retry image cleanup</button></div>)}
    {state.error && <p role="alert">{state.error} <button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)} className="underline">Refresh cleanup status</button></p>}
  </section>;
}
