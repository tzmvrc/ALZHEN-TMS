import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, MapPin, Package, Search, Table2, Truck, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api.service";
import {
  fetchReportColumns,
  fetchReportRows,
  getReportFilters,
  getSortableFields,
  REPORTS,
  type Pagination,
  type ReportColumn,
  type ReportKey,
  type ReportRow,
} from "../../services/report.service";
import { fetchTripByDispatchNumber } from "../../services/trip.service";

const reportKeys = Object.keys(REPORTS) as ReportKey[];

function displayValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  if (type === "date" && typeof value === "string") return value.slice(0, 10);
  return String(value);
}

function rowKey(row: ReportRow, index: number): string {
  const identity = [row.trip_id, row.trip_stop_id, row.trip_line_item_id]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(":");
  return identity || String(row.store_call_id ?? row.dispatch_number ?? index);
}

function rowText(row: ReportRow, ...keys: string[]): string {
  const value = keys.map((key) => row[key]).find(
    (candidate) => candidate !== null && candidate !== undefined && candidate !== "",
  );
  return value === undefined ? "" : String(value);
}

function statusStyle(value: string): string {
  const status = value.toLowerCase();
  if (/complete|delivered|confirmed|contacted|ready/.test(status)) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }
  if (/delay|incident|cancel|reject|backload|offload/.test(status)) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }
  if (/progress|transit|active|assigned/.test(status)) {
    return "bg-cyan-50 text-cyan-900 ring-cyan-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function statusAccent(value: string): string {
  const classes = statusStyle(value);
  if (classes.includes("emerald")) return "border-l-emerald-500";
  if (classes.includes("amber")) return "border-l-amber-500";
  if (classes.includes("cyan")) return "border-l-cyan-600";
  return "border-l-slate-400";
}

function ReportVisualCards({
  rows,
  columns,
  reportKey,
  onOpenTrip,
}: {
  rows: ReportRow[];
  columns: ReportColumn[];
  reportKey: ReportKey;
  onOpenTrip?: (row: ReportRow) => void;
}) {
  const titleFor = (key: string) =>
    columns.find((column) => column.key === key)?.title ?? key.replaceAll("_", " ");

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-2">
      {rows.map((row, index) => {
        const identity = rowText(row, "dispatch_number", "store_call_id", "trip_id") || `Record ${index + 1}`;
        const statusTags = reportKey === "store-calling"
          ? [
              ["Call", rowText(row, "status")],
              ["Confirmation", rowText(row, "confirmation_status")],
            ] as const
          : [
              ["Trip", rowText(row, "trip_status", "status")],
              ["Delivery", rowText(row, "delivery_status")],
              ["Letter", rowText(row, "letter_status")],
            ] as const;
        const primaryStatus = statusTags.find(([, value]) => value)?.[1] || "Status not recorded";
        const from = rowText(row, "warehouse_name", "ship_from", "warehouse_code", "wh_code");
        const to = rowText(row, "store_name", "ship_to", "customer_name");
        const date = rowText(row, "loading_date", "date_assigned", "date_of_contact");
        const plate = rowText(row, "plate_number");
        const driver = rowText(row, "driver_name", "assigned_to");
        const product = rowText(row, "product_name", "product_model", "model_code", "sku");
        const shownKeys = new Set([
          "dispatch_number", "store_call_id", "trip_id", "trip_status", "delivery_status",
          "confirmation_status", "status", "letter_status", "warehouse_name", "ship_from",
          "warehouse_code", "wh_code", "store_name", "ship_to", "customer_name",
          "loading_date", "date_assigned", "date_of_contact", "plate_number", "driver_name",
          "assigned_to", "product_name", "product_model", "model_code", "sku",
        ]);
        const extraColumns = columns.filter((column) => !shownKeys.has(column.key));

        return (
          <article key={rowKey(row, index)} className={`min-w-0 rounded-lg border border-slate-200 border-l-4 bg-white transition-colors hover:border-slate-300 ${statusAccent(primaryStatus)}`}>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {reportKey === "store-calling" ? "Store call" : "Dispatch"}
                </p>
                <h3 className="mt-1 truncate font-mono text-sm font-bold text-cyan-950" title={identity}>
                  <span className="rounded bg-cyan-50 px-1.5 py-1">{identity}</span>
                </h3>
              </div>
              <div className="flex max-w-full flex-wrap justify-end gap-1.5">
                {statusTags.filter(([, value]) => Boolean(value)).map(([label, value]) => (
                  <span key={label} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusStyle(value)}`}>
                    <span className="opacity-70">{label}</span>
                    {value.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            </header>

            <div className="space-y-3 p-4">
              <div className="flex min-w-0 items-start gap-2.5 rounded-md bg-cyan-50/70 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-cyan-800 shadow-sm">
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-900">
                    {reportKey === "store-calling" ? "Store and origin" : "Route"}
                  </p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                    <span className="font-medium text-slate-800">{from || "Origin not recorded"}</span>
                    {to && <><span className="text-cyan-700">to</span><span className="font-semibold text-slate-900">{to}</span></>}
                  </div>
                  {Boolean(row.province || row.city) && (
                    <p className="mt-1 text-xs text-slate-600">{[row.city, row.province].filter(Boolean).join(", ")}</p>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-slate-100 bg-slate-50/70 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Schedule and assignment</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <VisualFact icon={CalendarDays} label="Date" value={displayValue(date, "date") || "Not recorded"} />
                <VisualFact icon={Truck} label="Truck" value={plate || "Not assigned"} />
                <VisualFact icon={UserRound} label={reportKey === "store-calling" ? "Assigned to" : "Driver"} value={driver || "Not assigned"} />
                <VisualFact icon={Truck} label="Carrier" value={rowText(row, "trucking_company") || "Not recorded"} />
                </div>
              </div>

              {product && (
                <div className="flex items-start gap-2.5 rounded-md border border-emerald-100 bg-emerald-50/50 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-emerald-800 shadow-sm">
                    <Package aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">Cargo / product</p>
                    <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{product}</p>
                  </div>
                </div>
              )}

              {extraColumns.length > 0 && (
                <details className="border-t border-slate-100 pt-2">
                  <summary className="cursor-pointer py-1 text-xs font-medium text-cyan-900 hover:text-cyan-700">
                    More record information ({extraColumns.length})
                  </summary>
                  <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {extraColumns.map((column) => (
                      <div key={column.key} className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase text-slate-500">{titleFor(column.key)}</dt>
                        <dd className="mt-0.5 break-words text-xs text-slate-700">{displayValue(row[column.key], column.type) || "Not recorded"}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}

              {onOpenTrip && (
                <div className="flex justify-end border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenTrip(row)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-cyan-800 px-3 text-xs font-semibold text-white transition-colors hover:bg-cyan-900"
                  >
                    View trip details
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function VisualFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
        <p className="mt-0.5 break-words text-xs font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}

export default function ReportDataView({
  initialReport = "combined",
  showReportPicker = true,
  onOpenTrip,
}: {
  initialReport?: ReportKey;
  showReportPicker?: boolean;
  onOpenTrip?: (tripId: string) => void;
}) {
  const { accessToken, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [reportKey, setReportKey] = useState<ReportKey>(initialReport);
  const [viewMode, setViewMode] = useState<"visual" | "table">("visual");
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState(getSortableFields(initialReport)[0]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [detailLookupMessage, setDetailLookupMessage] = useState<string | null>(null);
  const activeSortBy = getSortableFields(reportKey).includes(sortBy)
    ? sortBy
    : getSortableFields(reportKey)[0];
  const queryKey = JSON.stringify({
    accessToken,
    activeSortBy,
    appliedFilters,
    appliedSearch,
    page,
    reportKey,
    retryVersion,
    sortBy: activeSortBy,
    sortOrder,
  });

  useEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;

    void (async () => {
      try {
        const nextColumns = await fetchReportColumns(reportKey, accessToken);
        const result = await fetchReportRows(reportKey, accessToken, {
          page,
          limit: 50,
          search: appliedSearch,
          sortBy: activeSortBy,
          sortOrder,
          filters: appliedFilters,
        });
        if (!active) return;
        setColumns(nextColumns);
        setRows(result.rows);
        setPagination(result.pagination);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          await refreshSession();
          return;
        }
        setRequestError({
          key: queryKey,
          message:
            cause instanceof ApiError && cause.status === 403
            ? "You are not authorized to view this report."
            : cause instanceof Error
              ? cause.message
              : "Unable to load this report.",
        });
      } finally {
        if (active) setLoadedQueryKey(queryKey);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    accessToken,
    activeSortBy,
    appliedFilters,
    appliedSearch,
    navigate,
    page,
    queryKey,
    reportKey,
    refreshSession,
    retryVersion,
    sortBy,
    sortOrder,
  ]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search);
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filterDraft);
  }

  function clearFilters() {
    setPage(1);
    setFilterDraft({});
    setAppliedFilters({});
  }

  function changeReport(value: string) {
    if (!reportKeys.includes(value as ReportKey)) return;
    setPage(1);
    setReportKey(value as ReportKey);
    setColumns([]);
    setRows([]);
    setPagination(null);
    setFilterDraft({});
    setAppliedFilters({});
  }

  async function openTripDetails(row: ReportRow) {
    if (!accessToken || !onOpenTrip) return;
    setDetailLookupMessage(null);

    const directId = row.trip_id;
    if (typeof directId === "string" && directId) {
      onOpenTrip(directId);
      return;
    }

    const dispatchNumber = row.dispatch_number;
    if (typeof dispatchNumber !== "string" || !dispatchNumber) {
      setDetailLookupMessage("This row does not include a trip ID or dispatch number, so its trip details cannot be opened.");
      return;
    }

    try {
      const trip = await fetchTripByDispatchNumber(accessToken, dispatchNumber);
      onOpenTrip(trip.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await refreshSession();
        return;
      }
      setDetailLookupMessage(
        cause instanceof ApiError && cause.status === 404
          ? `No trip record was found for ${dispatchNumber}.`
          : cause instanceof Error
            ? cause.message
            : "Unable to resolve this report row to a trip.",
      );
    }
  }

  const reportFilters = getReportFilters(reportKey);
  const sortableFields = getSortableFields(reportKey);
  const pageCount = pagination?.totalPages ?? 0;
  const activeError =
    requestError?.key === queryKey
      ? requestError.message
      : !accessToken
        ? "Your session has expired. Please log in again."
        : null;
  const isLoading = Boolean(accessToken) && loadedQueryKey !== queryKey;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {showReportPicker ? (
            <label className="sr-only" htmlFor="report-select">
              Select report
            </label>
          ) : (
            <h2 className="text-sm font-semibold text-slate-900">
              {REPORTS[reportKey].title}
            </h2>
          )}
          {showReportPicker && (
            <div className="relative">
              <select
                id="report-select"
                value={reportKey}
                onChange={(event) => changeReport(event.target.value)}
                className="min-h-10 appearance-none rounded-md border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm font-medium text-slate-800 outline-none transition-colors focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100"
              >
                {reportKeys.map((key) => (
                  <option key={key} value={key}>
                    {REPORTS[key].title}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
          )}
          <div role="group" aria-label="Report display mode" className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-slate-50 p-0.5">
            <button
              type="button"
              aria-pressed={viewMode === "visual"}
              onClick={() => setViewMode("visual")}
              className={`inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors ${viewMode === "visual" ? "bg-white text-cyan-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
              Visual
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "table"}
              onClick={() => setViewMode("table")}
              className={`inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-white text-cyan-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Table2 aria-hidden="true" className="h-3.5 w-3.5" />
              Table
            </button>
          </div>
          <label className="text-xs text-slate-500" htmlFor="report-sort">
            Sort
          </label>
          <div className="relative">
            <select
              id="report-sort"
              value={activeSortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="min-h-10 max-w-48 appearance-none rounded-md border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100"
            >
              {sortableFields.map((field) => (
                <option key={field} value={field}>
                  {columns.find((column) => column.key === field)?.title ?? field}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
          <div className="relative">
            <select
              aria-label="Sort order"
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value as "asc" | "desc")
              }
              className="min-h-10 appearance-none rounded-md border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
        <form onSubmit={submitSearch} className="flex gap-2">
          <label className="relative min-w-0 flex-1 lg:w-64" htmlFor="report-search">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              id="report-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search report"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500"
            />
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
          >
            Search
          </button>
        </form>
      </div>

      <details className="border-b border-slate-200 px-4 py-2">
        <summary className="cursor-pointer py-1 text-xs font-medium text-slate-600">
          Filters
        </summary>
        <form
          onSubmit={submitFilters}
          className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {reportFilters.map((filter) => (
            <label
              key={filter.key}
              className="grid gap-1 text-xs font-medium text-slate-600"
            >
              {filter.label}
              <input
                type={filter.type ?? "text"}
                value={filterDraft[filter.key] ?? ""}
                onChange={(event) =>
                  setFilterDraft((current) => ({
                    ...current,
                    [filter.key]: event.target.value,
                  }))
                }
                className="min-h-9 rounded-md border border-slate-300 px-2.5 text-sm font-normal text-slate-800 outline-none focus:border-slate-500"
              />
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="min-h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </form>
      </details>

      {detailLookupMessage && (
        <p role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {detailLookupMessage}
        </p>
      )}

      {activeError ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
          <p role="alert" className="text-sm text-rose-700">{activeError}</p>
          <button
            type="button"
            onClick={() => setRetryVersion((value) => value + 1)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="relative min-h-48 overflow-x-auto">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm text-slate-600">
                Loading report...
              </div>
            )}
            {viewMode === "visual" ? (
              rows.length === 0 && !isLoading ? (
                <p className="px-4 py-12 text-center text-sm text-slate-500">No report records found.</p>
              ) : (
                <ReportVisualCards
                  rows={rows}
                  columns={columns}
                  reportKey={reportKey}
                  onOpenTrip={onOpenTrip ? (row) => void openTripDetails(row) : undefined}
                />
              )
            ) : (
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={`whitespace-nowrap border-b border-slate-200 px-4 py-3 ${
                        column.type === "number" ||
                        ["quantity", "cbm", "subcon_rate_manual"].includes(column.key)
                          ? "text-right"
                          : "text-left"
                      }`}
                    >
                      {column.title}
                    </th>
                  ))}
                  {onOpenTrip && <th scope="col" className="sticky right-0 border-b border-slate-200 bg-slate-50 px-3 py-3 text-right">Details</th>}
                </tr>
              </thead>
              <tbody>
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={Math.max(columns.length + (onOpenTrip ? 1 : 0), 1)}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      No report rows found.
                    </td>
                  </tr>
                )}
                {rows.map((row, index) => (
                  <tr
                    key={rowKey(row, index)}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`max-w-80 px-4 py-3 text-slate-700 ${
                          column.type === "number" ||
                          ["quantity", "cbm", "subcon_rate_manual"].includes(column.key)
                            ? "text-right tabular-nums"
                            : "text-left"
                        }`}
                      >
                        <span className="block truncate" title={displayValue(row[column.key], column.type)}>
                          {displayValue(row[column.key], column.type)}
                        </span>
                      </td>
                    ))}
                    {onOpenTrip && (
                      <td className="sticky right-0 border-b border-slate-100 bg-white px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void openTripDetails(row)}
                          aria-label={`View trip details for ${String(row.dispatch_number ?? row.trip_id ?? "this row")}`}
                          title="View trip details"
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-700 hover:border-cyan-700 hover:bg-cyan-50 hover:text-cyan-900"
                        >
                          Details
                          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
          <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pagination
                ? `${pagination.total.toLocaleString()} rows · Page ${pagination.page} of ${pagination.totalPages}`
                : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous page"
                disabled={isLoading || page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={isLoading || pageCount === 0 || page >= pageCount}
                onClick={() => setPage((value) => value + 1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}