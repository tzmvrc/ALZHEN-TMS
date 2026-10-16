import { useCallback, useEffect, useRef, useState } from "react";
import ReportDropdownEditor from "./ReportDropdownEditor";
import { offloadTransactionChoices, searchOffloadTransactions, type OffloadTransaction, type OffloadTransactionPage } from "../../services/offload-dr-selection";

export default function OffloadDrSelector({ token, value, disabled, onSelect }: { token: string; value: OffloadTransaction | null; disabled: boolean; onSelect: (row: OffloadTransaction) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<OffloadTransactionPage>({ rows: [], page: 1, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);
  const load = useCallback(async (query: string, number: number) => {
    const request = ++version.current; setLoading(true); setError("");
    try { const result = await searchOffloadTransactions(token, query, number); if (request === version.current) setPage(result); }
    catch (cause) { if (request === version.current) { setPage({ rows: [], page: number, hasMore: false }); setError(cause instanceof Error ? cause.message : "Unable to load DR transactions."); } }
    finally { if (request === version.current) setLoading(false); }
  }, [token]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(search, 1); }, 250);
    return () => { window.clearTimeout(timer); version.current += 1; };
  }, [load, search]);
  return <div className="space-y-1">
    <ReportDropdownEditor label="DR Number" value={value?.id ?? ""} displayValue={value ? offloadTransactionChoices([value])[0]?.label : "Select DR Number"} options={offloadTransactionChoices(page.rows)} showStoredValue={false} autoOpen={false} popoverZIndex={2200} loading={loading} error={error} disabled={disabled} onSearch={setSearch} onSelect={(id) => { const row = page.rows.find((item) => item.id === id); if (row) onSelect(row); }} />
    {!loading && !error && page.rows.length === 0 && <p className="text-xs font-normal text-slate-500">No eligible DR transactions match. Save a DR Number in Trips first.</p>}
    {error && <button type="button" className="text-xs text-rose-700 underline" disabled={disabled || loading} onClick={() => void load(search, page.page)}>Retry DR lookup</button>}
    {(page.hasMore || page.page > 1) && <div className="flex items-center gap-3 text-xs font-normal"><button type="button" disabled={disabled || loading || page.page === 1} onClick={() => void load(search, page.page - 1)}>Previous matches</button><span>Page {page.page}</span><button type="button" disabled={disabled || loading || !page.hasMore} onClick={() => void load(search, page.page + 1)}>More matches</button></div>}
  </div>;
}
