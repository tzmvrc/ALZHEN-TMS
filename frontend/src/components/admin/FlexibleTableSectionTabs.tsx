import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link2Off, LoaderCircle, Table2 } from "lucide-react";
import FlexibleTablesView from "../../pages/Admin/views/FlexibleTablesView";
import {
  disconnectFlexibleTableFromSection,
  listSectionFlexibleTables,
  type FlexSectionKey,
  type FlexTable,
} from "../../services/flexible-table.service";

type Props = {
  sectionKey: FlexSectionKey;
  sectionLabel: string;
  accessToken: string | null;
  role: string;
  children: ReactNode;
  hideSectionTab?: boolean;
};

const tabClass = "max-w-[15rem] shrink-0 truncate border-b-2 px-3 py-2 text-xs font-semibold transition";

export default function FlexibleTableSectionTabs({ sectionKey, sectionLabel, accessToken, role, children, hideSectionTab = false }: Props) {
  const [connected, setConnected] = useState<FlexTable[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!accessToken) { setConnected([]); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const rows = await listSectionFlexibleTables(accessToken, sectionKey);
      setConnected(rows);
      setActiveTableId((current) => current && rows.some((table) => table.id === current) ? current : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load connected tables.");
    } finally { setLoading(false); }
  }, [accessToken, sectionKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const disconnect = async (table: FlexTable) => {
    if (!accessToken || !window.confirm(`Disconnect “${table.name}” from ${sectionLabel}? Its table and data will remain unchanged.`)) return;
    setBusy(true); setError("");
    try {
      await disconnectFlexibleTableFromSection(accessToken, sectionKey, table.id);
      if (activeTableId === table.id) setActiveTableId(null);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to disconnect this table."); }
    finally { setBusy(false); }
  };

  if (!accessToken || !["ADMIN", "STAFF"].includes(role)) {
    return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Flexible tables are available to ADMIN and STAFF accounts.</div>;
  }

  return <div className="space-y-3">
    {(!hideSectionTab || connected.length > 0) && <div className="flex min-w-0 items-center gap-1 border-b border-slate-200">
      <div role="tablist" aria-label={`${sectionLabel} tables`} className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        <button role="tab" aria-selected={!activeTableId} type="button" title={hideSectionTab ? `Show ${sectionLabel} table` : undefined} aria-label={hideSectionTab ? `Show ${sectionLabel} table` : undefined} className={`${tabClass} ${!activeTableId ? "border-[#2678b9] text-[#0b2341]" : "border-transparent text-slate-500 hover:text-slate-800"}`} onClick={() => setActiveTableId(null)}>{hideSectionTab ? <Table2 aria-hidden="true" className="mx-auto h-4 w-4" /> : sectionLabel}</button>
        {connected.map((table) => <div key={table.id} className="flex max-w-[18rem] shrink-0 items-center border-b-2" style={{ borderColor: activeTableId === table.id ? "#2678b9" : "transparent" }}>
          <button role="tab" aria-selected={activeTableId === table.id} type="button" className={`${tabClass} border-0 ${activeTableId === table.id ? "text-[#0b2341]" : "text-slate-500 hover:text-slate-800"}`} title={table.name} onClick={() => setActiveTableId(table.id)}><span className="inline-flex items-center gap-1.5"><Table2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{table.name}</span></button>
          <button type="button" title={`Disconnect ${table.name} from ${sectionLabel}; keep the table and its data`} aria-label={`Disconnect ${table.name} from ${sectionLabel}`} disabled={busy} onClick={() => void disconnect(table)} className="mr-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40"><Link2Off className="h-3 w-3" /></button>
        </div>)}
      </div>
    </div>}
    {loading && <p role="status" className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Loading section tables…</p>}
    {error && <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"><span>{error}</span><button type="button" title="Retry loading connected tables" aria-label="Retry loading connected tables" className="underline" onClick={() => void reload()}>Retry</button></div>}
    {activeTableId ? <FlexibleTablesView key={activeTableId} accessToken={accessToken} role={role} embeddedTableId={activeTableId} onExit={() => { setActiveTableId(null); void reload(); }} /> : children}

  </div>;
}
