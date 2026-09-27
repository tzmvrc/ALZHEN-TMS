import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Database, Search, Table2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

  return (
    <div className="grid min-h-[calc(100vh-11rem)] gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
        <header className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Database aria-hidden="true" className="h-4 w-4 text-cyan-800" />
            <h2 className="text-sm font-semibold text-slate-900">Supabase sources</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">27 tables and 5 views</p>
          <label className="relative mt-3 block">
            <Search aria-hidden="true" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search database sources"
              value={sourceSearch}
              onChange={(event) => setSourceSearch(event.target.value)}
              placeholder="Filter sources"
              className="h-9 w-full rounded-md border border-slate-300 pl-8 pr-2 text-xs outline-none focus:border-cyan-700"
            />
          </label>
        </header>
        <nav aria-label="Database sources" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {filteredSources.map((source) => (
            <button
              key={source.name}
              type="button"
              onClick={() => {
                setSelectedSource(source.name);
                setPage(1);
                setRowSearch("");
              }}
              className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs transition-colors ${
                selectedSource === source.name
                  ? "bg-cyan-50 font-semibold text-cyan-950"
                  : "text-slate-600 hover:bg-slate-50"
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

      <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <header className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase text-cyan-800">Read only · administrator access</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">
              {result?.source.label ?? selectedSource}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {result ? `${result.pagination.total.toLocaleString()} rows` : "Loading row count..."}
              {result && result.columns.length > 0 ? ` · ${result.columns.length} fields` : ""}
            </p>
          </div>
          <label className="relative md:w-72">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Filter current page rows"
              value={rowSearch}
              onChange={(event) => setRowSearch(event.target.value)}
              placeholder="Filter current page"
              className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-cyan-700"
            />
          </label>
        </header>

        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p role="alert" className="text-sm text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="min-h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
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
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] font-semibold uppercase text-slate-500">
                  <tr>
                    {(result?.columns ?? []).map((column) => (
                      <th key={column} className="max-w-64 whitespace-nowrap border-b border-slate-200 px-3 py-3">{column.replaceAll("_", " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!isLoading && filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(result?.columns.length ?? 1, 1)} className="px-4 py-12 text-center text-sm text-slate-500">
                        {result?.rows.length ? "No rows match this filter." : "No rows in this source."}
                      </td>
                    </tr>
                  )}
                  {filteredRows.map((row, rowIndex) => (
                    <tr key={String(row.id ?? `${selectedSource}-${rowIndex}`)} className="border-b border-slate-100 align-top last:border-0 hover:bg-cyan-50/30">
                      {(result?.columns ?? []).map((column) => {
                        const value = displayCell(row[column]);
                        return (
                          <td key={column} className="max-w-80 px-3 py-2.5 text-slate-700">
                            <span className="block max-h-24 min-w-12 overflow-auto whitespace-pre-wrap break-words" title={value}>{value}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={isLoading || pageCount === 0 || page >= pageCount}
                  onClick={() => setPage((value) => value + 1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 disabled:opacity-40"
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