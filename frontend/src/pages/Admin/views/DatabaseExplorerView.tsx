import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Database, Search, Table2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { tableUi } from "../../../components/admin/dashboardStyles";
import { useAuth } from "../../../context/AuthContext";
import { ApiError } from "../../../services/api.service";
import {
  fetchDatabaseSourcePage,
  fetchDatabaseSources,
  type DatabaseSource,
  type DatabaseSourcePage,
} from "../../../services/database.service";

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function DatabaseExplorerView() {
  const { accessToken, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [sources, setSources] = useState<DatabaseSource[]>([]);
  const [selectedSource, setSelectedSource] = useState("trips");
  const [sourceSearch, setSourceSearch] = useState("");
  const [rowSearch, setRowSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DatabaseSourcePage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = `${accessToken ?? "no-session"}:${selectedSource}:${page}:${retry}`;

  useEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;
    void (async () => {
      try {
        const [nextSources, nextPage] = await Promise.all([
          fetchDatabaseSources(accessToken),
          fetchDatabaseSourcePage(selectedSource, page, accessToken),
        ]);
        if (!active) return;
        setSources(nextSources);
        setResult(nextPage);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          await refreshSession();
          return;
        }
        setFailure({
          key: requestKey,
          message:
            cause instanceof ApiError && cause.status === 403
              ? "Database browsing is restricted to administrators."
              : cause instanceof Error
                ? cause.message
                : "Unable to load database records.",
        });
      } finally {
        if (active) setLoadedKey(requestKey);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, navigate, page, refreshSession, requestKey, selectedSource]);

  const isLoading = Boolean(accessToken) && loadedKey !== requestKey;
  const error = failure?.key === requestKey ? failure.message : null;
  const filteredSources = sources.filter((source) =>
    `${source.label} ${source.name} ${source.kind}`
      .toLowerCase()
      .includes(sourceSearch.trim().toLowerCase()),
  );
  const filteredRows = (result?.rows ?? []).filter((row) => {
    const query = rowSearch.trim().toLowerCase();
    return !query || Object.values(row).some((value) => displayCell(value).toLowerCase().includes(query));
  });
  const pageCount = result?.pagination.totalPages ?? 0;

  const selectSource = (source: string) => {
    setSelectedSource(source);
    setPage(1);
    setRowSearch("");
  };

  return (
    <div className="grid min-w-0 gap-3 xl:min-h-[calc(100vh-11rem)] xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-4">
      <aside className={`${tableUi.shell} flex min-w-0 flex-col xl:min-h-0`}>
        <header className="border-b border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <Database aria-hidden="true" className="h-4 w-4 text-[#2678b9]" />
            <h2 className="text-sm font-semibold text-[#0b2341]">Supabase sources</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">27 tables and 5 views</p>
          <label className="relative mt-3 block">
            <Search aria-hidden="true" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search database sources"
              value={sourceSearch}
              onChange={(event) => setSourceSearch(event.target.value)}
              placeholder="Filter sources"
              className={`${tableUi.search} h-9 pl-8 text-xs !bg-[#f2f6fa] !shadow-none`}
            />
          </label>
          <label className="mt-3 block xl:hidden">
            <span className="sr-only">Choose database source</span>
            <select
              aria-label="Choose database source"
              value={selectedSource}
              onChange={(event) => selectSource(event.target.value)}
              className={`${tableUi.select} w-full !bg-[#f2f6fa] !shadow-none`}
            >
              {filteredSources.map((source) => (
                <option key={source.name} value={source.name}>
                  {source.label} · {source.kind}
                </option>
              ))}
            </select>
          </label>
        </header>
        <nav aria-label="Database sources" className="hidden min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 xl:block">
          {filteredSources.map((source) => (
            <button
              key={source.name}
              type="button"
              onClick={() => selectSource(source.name)}
              className={`flex min-h-9 w-full items-center gap-2 rounded-full px-3 text-left text-xs transition-colors ${
                selectedSource === source.name
                  ? "bg-[#e6f0f9] font-semibold text-[#0b2341]"
                  : "text-slate-500 hover:bg-[#f2f6fa]"
              }`}
            >
              {source.kind === "view" ? (
                <Table2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Database aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{source.label}</span>
              <span className="text-[9px] uppercase text-slate-400">{source.kind}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className={`${tableUi.shell} flex min-w-0 flex-col`}>
        <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400">Read only · administrator access</p>
            <h2 className="mt-0.5 text-[17px] font-semibold tracking-tight text-[#0b2341]">
              {result?.source.label ?? selectedSource}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {result ? `${result.pagination.total.toLocaleString()} rows` : "Loading row count..."}
              {result && result.columns.length > 0 ? ` · ${result.columns.length} fields` : ""}
            </p>
          </div>
          <label className="relative md:w-72">
            <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Filter current page rows"
              value={rowSearch}
              onChange={(event) => setRowSearch(event.target.value)}
              placeholder="Filter current page"
              className={`${tableUi.search} !bg-[#f2f6fa] !shadow-none`}
            />
          </label>
        </header>

        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p role="alert" className="text-sm text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="min-h-9 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200]"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="relative min-h-64 flex-1 overflow-auto">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm text-slate-600">
                  Loading records...
                </div>
              )}
              <table className="w-full min-w-max border-collapse text-left">
                <thead className={`sticky top-0 z-[1] ${tableUi.thead}`}>
                  <tr>
                    {(result?.columns ?? []).map((column) => (
                      <th key={column} className={`max-w-64 ${tableUi.th}`}>{column.replaceAll("_", " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!isLoading && filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(result?.columns.length ?? 1, 1)} className={tableUi.empty}>
                        {result?.rows.length ? "No rows match this filter." : "No rows in this source."}
                      </td>
                    </tr>
                  )}
                  {filteredRows.map((row, rowIndex) => (
                    <tr key={String(row.id ?? `${selectedSource}-${rowIndex}`)} className={`align-top ${tableUi.row}`}>
                      {(result?.columns ?? []).map((column) => {
                        const value = displayCell(row[column]);
                        return (
                          <td key={column} className={`max-w-80 ${tableUi.td}`}>
                            <span className="block max-h-24 min-w-12 overflow-auto whitespace-pre-wrap break-words" title={value}>{value}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className={`${tableUi.footer} flex-wrap gap-2 px-4`}>
              <span>
                {result
                  ? `Page ${result.pagination.page} of ${result.pagination.totalPages} · Showing ${filteredRows.length} of ${result.rows.length} rows`
                  : ""}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={isLoading || page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className={tableUi.pageBtn}
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={isLoading || pageCount === 0 || page >= pageCount}
                  onClick={() => setPage((value) => value + 1)}
                  className={tableUi.pageBtn}
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}