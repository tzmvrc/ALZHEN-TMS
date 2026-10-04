import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Package,
  Search,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Table2,
  Truck,
  UserRound,
  X,
  Download,
} from "lucide-react";
import type ExcelJS from "exceljs";
import { useAuth } from "../../context/AuthContext";
import { ApiError, invalidateApiCache } from "../../services/api.service";
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
import {
  addDropdownOption,
  editDropdownOption,
  fetchDropdownOptions,
  type DropdownField,
  type DropdownOption,
} from "../../services/dropdown-option.service";
import {
  getReportEditDefinition,
  type ReportEditDefinition,
} from "../../services/report-editing.config";
import type { RelationshipOption } from "../../services/lookup.service";
import { searchRelationshipOptions } from "../../services/lookup.service";
import {
  updateTripAssignmentRecord,
  updateTripBillingRecord,
  updateStoreCallRecord,
  updateTripLineItemRecord,
  updateTripRecord,
  updateTripStopRecord,
} from "../../services/trip.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { StatusBadge, TableSkeleton } from "./DashboardPrimitives";

const reportKeys = Object.keys(REPORTS) as ReportKey[];
type ExportMode = "all-workbook" | "separate-zip" | "current-report";

async function loadExportLibraries() {
  try {
    const [{ default: ExcelJS }, { default: JSZip }] = await Promise.all([
      import("exceljs"),
      import("jszip"),
    ]);
    return { ExcelJS, JSZip };
  } catch {
    throw new Error("Export could not start. Reload the page and try again.");
  }
}

async function fetchAllReportRows(reportKey: ReportKey, token: string) {
  const columns = await fetchReportColumns(reportKey, token);
  const firstPage = await fetchReportRows(reportKey, token, {
    page: 1, limit: 100, search: "", sortBy: "", sortOrder: "asc", filters: {}, fresh: true,
  });
  const rows = [...firstPage.rows];
  for (let pageNumber = 2; pageNumber <= firstPage.pagination.totalPages; pageNumber += 1) {
    const pageResult = await fetchReportRows(reportKey, token, {
      page: pageNumber, limit: 100, search: "", sortBy: "", sortOrder: "asc", filters: {}, fresh: true,
    });
    rows.push(...pageResult.rows);
  }
  return { columns, rows };
}

function appendReportWorksheet(workbook: ExcelJS.Workbook, reportKey: ReportKey, columns: ReportColumn[], rows: ReportRow[]) {
  const visibleColumns = columns.filter((column) => !column.key.startsWith("_"));
  const name = REPORTS[reportKey].title.replace(/[:\\/?*\[\]]/g, " ").slice(0, 31);
  const worksheet = workbook.addWorksheet(name || "Report");
  worksheet.columns = visibleColumns.map((column) => ({
    header: column.title,
    key: column.key,
    width: Math.min(32, Math.max(14, column.title.length + 2)),
    style: column.type === "number" ? { numFmt: "0.###" } : column.type === "date" ? { numFmt: "yyyy-mm-dd hh:mm" } : undefined,
  }));
  worksheet.addRows(rows.map((row) => Object.fromEntries(visibleColumns.map((column) => {
    const value = row[column.key];
    if (column.type === "date" && typeof value === "string") {
      const parsed = new Date(value);
      return [column.key, Number.isNaN(parsed.getTime()) ? value : parsed];
    }
    return [column.key, value ?? null];
  }))));
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function displayValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (type === "date" && typeof value === "string") return value.slice(0, 10);
  if (typeof value === "number") {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  return String(value);
}

function searchableValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function rowKey(row: ReportRow, index: number): string {
  const identity = [row.trip_id, row.trip_stop_id, row.trip_line_item_id]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(":");
  return identity || String(row.store_call_id ?? row.dispatch_number ?? index);
}

function rowText(row: ReportRow, ...keys: string[]): string {
  const value = keys
    .map((key) => row[key])
    .find(
      (candidate) =>
        candidate !== null && candidate !== undefined && candidate !== "",
    );
  return value === undefined ? "" : String(value);
}

type EditableCellTarget = ReportEditDefinition & {
  tripId?: string;
  stopId?: string;
  lineItemId?: string;
  assignmentId?: string;
  billingId?: string;
  storeCallId?: string;
};

type EditingCell = {
  rowKey: string;
  field: string;
  definition: ReportEditDefinition;
  dropdownField?: DropdownField;
  tripId?: string;
  stopId?: string;
  lineItemId?: string;
  assignmentId?: string;
  billingId?: string;
  storeCallId?: string;
  relationshipId?: string;
  originalRelationshipId?: string;
  relationshipOption?: RelationshipOption;
  value: string;
  originalValue: string;
  mentionProfileIds?: string[];
  mentionEventKey?: string;
  assignmentEventKey?: string;
};

function getEditableCellTarget(
  row: ReportRow,
  columnKey: string,
  reportKey: ReportKey,
): EditableCellTarget | null {
  const definition = getReportEditDefinition(reportKey, columnKey);
  if (!definition) return null;
  const recordId = row[definition.recordIdField];
  if (typeof recordId !== "string" || !recordId) return null;
  const targetIds: Partial<EditableCellTarget> = {};
  if (definition.sourceEntity === "trip") targetIds.tripId = recordId;
  if (definition.sourceEntity === "stop") {
    if (typeof row.trip_id !== "string" || !row.trip_id) return null;
    targetIds.tripId = row.trip_id;
    targetIds.stopId = recordId;
  }
  if (definition.sourceEntity === "lineItem") {
    if (
      typeof row.trip_id !== "string" ||
      !row.trip_id ||
      typeof row.trip_stop_id !== "string" ||
      !row.trip_stop_id
    )
      return null;
    targetIds.tripId = row.trip_id;
    targetIds.stopId = row.trip_stop_id;
    targetIds.lineItemId = recordId;
  }
  if (definition.sourceEntity === "assignment") {
    if (typeof row.trip_id !== "string" || !row.trip_id) return null;
    targetIds.tripId = row.trip_id;
    targetIds.assignmentId = recordId;
  }
  if (definition.sourceEntity === "billing") {
    if (typeof row.trip_id !== "string" || !row.trip_id) return null;
    targetIds.tripId = row.trip_id;
    targetIds.billingId = recordId;
  }
  if (definition.sourceEntity === "storeCall") targetIds.storeCallId = recordId;
  return { ...definition, ...targetIds };
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
    return "bg-[#e6f0f9] text-[#1d5f94] ring-[#b9d4ea]";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function statusDot(value: string): string {
  const status = value.toLowerCase();
  if (/complete|delivered|confirmed|contacted|ready/.test(status)) {
    return "bg-emerald-500";
  }
  if (/delay|incident|cancel|reject|backload|offload/.test(status)) {
    return "bg-amber-500";
  }
  if (/progress|transit|active|assigned/.test(status)) return "bg-[#2678b9]";
  return "bg-slate-400";
}

function firstValue(rows: ReportRow[], ...keys: string[]): string {
  for (const row of rows) {
    const value = rowText(row, ...keys);
    if (value) return value;
  }
  return "";
}

function uniqueValues(rows: ReportRow[], ...keys: string[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = rowText(row, ...keys);
    if (value) seen.add(value);
  }
  return [...seen];
}

/* The trip reports return one row per line item. In Visual mode we show one
   card per trip, so rows that share a trip_id are folded together. */
function groupRows(rows: ReportRow[], byTrip: boolean): ReportRow[][] {
  const groups = new Map<string, ReportRow[]>();
  rows.forEach((row, index) => {
    const tripId = rowText(row, "trip_id");
    const key = byTrip && tripId ? `trip:${tripId}` : `row:${index}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  });
  return [...groups.values()];
}

function ReportVisualCards({
  rows,
  columns,
  reportKey,
}: {
  rows: ReportRow[];
  columns: ReportColumn[];
  reportKey: ReportKey;
}) {
  const isStoreCall = reportKey === "store-calling";
  const groups = groupRows(rows, !isStoreCall);
  const titleFor = (key: string) =>
    columns.find((column) => column.key === key)?.title ??
    key.replaceAll("_", " ");

  const shownKeys = new Set([
    "dispatch_number",
    "store_call_id",
    "trip_id",
    "trip_status",
    "delivery_status",
    "confirmation_status",
    "status",
    "letter_status",
    "warehouse_name",
    "ship_from",
    "warehouse_code",
    "wh_code",
    "store_name",
    "ship_to",
    "customer_name",
    "loading_date",
    "date_assigned",
    "date_of_contact",
    "plate_number",
    "driver_name",
    "assigned_to",
    "product_name",
    "product_model",
    "model_code",
    "sku",
    "trucking_company",
    "city",
    "province",
  ]);
  const extraColumns = columns.filter((column) => !shownKeys.has(column.key));

  return (
    <div className="grid gap-4 bg-[#f2f6fa] p-4 md:grid-cols-2 2xl:grid-cols-3">
      {groups.map((group, index) => {
        const row = group[0];
        const identity =
          firstValue(group, "dispatch_number", "store_call_id", "trip_id") ||
          `Record ${index + 1}`;
        const statusTags: Array<readonly [string, string]> = isStoreCall
          ? [
              ["Call", firstValue(group, "status")],
              ["Confirmation", firstValue(group, "confirmation_status")],
            ]
          : [
              ["Trip", firstValue(group, "trip_status", "status")],
              ["Delivery", firstValue(group, "delivery_status")],
              ["Letter", firstValue(group, "letter_status")],
            ];
        const primaryStatus =
          statusTags.find(([, value]) => value)?.[1] || "Status not recorded";
        const otherTags = statusTags.filter(
          ([, value]) => Boolean(value) && value !== primaryStatus,
        );
        const from = firstValue(
          group,
          "warehouse_name",
          "ship_from",
          "warehouse_code",
          "wh_code",
        );
        const stores = uniqueValues(
          group,
          "store_name",
          "ship_to",
          "customer_name",
        );
        const destination =
          stores.length === 0
            ? ""
            : stores.length === 1
              ? stores[0]
              : `${stores[0]} +${stores.length - 1} more`;
        const place = [
          firstValue(group, "city"),
          firstValue(group, "province"),
        ]
          .filter(Boolean)
          .join(", ");
        const date = firstValue(
          group,
          "loading_date",
          "date_assigned",
          "date_of_contact",
        );
        const plate = firstValue(group, "plate_number");
        const driver = firstValue(group, "driver_name", "assigned_to");
        const carrier = firstValue(group, "trucking_company");
        const products = uniqueValues(
          group,
          "product_name",
          "product_model",
          "model_code",
          "sku",
        );
        const showExtras = group.length === 1 && extraColumns.length > 0;

        return (
          <article
            key={`${identity}-${index}`}
            className="flex min-w-0 flex-col rounded-3xl bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04),0_8px_24px_-16px_rgba(11,35,65,0.16)]">
            <header className="flex items-start justify-between gap-3 px-4 pt-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-400">
                  {isStoreCall ? "Store call" : "Dispatch"}
                </p>
                <h3
                  className="mt-0.5 truncate text-[15px] font-bold tracking-tight text-[#0b2341]"
                  title={identity}>
                  {identity}
                </h3>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusStyle(primaryStatus)}`}>
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${statusDot(primaryStatus)}`}
                />
                {primaryStatus.replaceAll("_", " ")}
              </span>
            </header>

            {otherTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">
                {otherTags.map(([label, value]) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-[#f2f6fa] px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    <span className="text-slate-400">{label}</span>
                    {value.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-3 p-4">
              <div className="rounded-2xl bg-[#f2f6fa] p-3.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-slate-400">
                      Origin
                    </p>
                    <p
                      className="truncate text-[13px] font-semibold text-[#0b2341]"
                      title={from}>
                      {from || "Not recorded"}
                    </p>
                  </div>
                  <span aria-hidden="true" className="flex w-24 items-center">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${statusDot(primaryStatus)}`}
                    />
                    <span className="h-px flex-1 border-t border-dashed border-slate-300" />
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#0b2341] shadow-sm">
                      <Truck className="h-3.5 w-3.5" />
                    </span>
                    <span className="h-px flex-1 border-t border-dashed border-slate-300" />
                    <span className="h-2 w-2 shrink-0 rounded-full border-2 border-slate-300 bg-white" />
                  </span>
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] font-medium text-slate-400">
                      {isStoreCall ? "Store" : "Destination"}
                    </p>
                    <p
                      className="truncate text-[13px] font-semibold text-[#0b2341]"
                      title={stores.join(", ")}>
                      {destination || "Not recorded"}
                    </p>
                  </div>
                </div>
                {place && (
                  <p className="mt-2 truncate text-right text-[11px] text-slate-500">
                    {place}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <VisualFact
                  icon={CalendarDays}
                  label="Date"
                  value={displayValue(date, "date") || "Not recorded"}
                />
                <VisualFact
                  icon={Truck}
                  label="Truck"
                  value={plate || "Not assigned"}
                />
                <VisualFact
                  icon={UserRound}
                  label={isStoreCall ? "Assigned to" : "Driver"}
                  value={driver || "Not assigned"}
                />
                <VisualFact
                  icon={Building2}
                  label="Carrier"
                  value={carrier || "Not recorded"}
                />
              </div>

              {products.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-[#fff8dc] p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#0b2341]">
                    <Package aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-[#8a6d00]">
                      Cargo
                      {group.length > 1 ? ` · ${group.length} line items` : ""}
                    </p>
                    <p className="mt-0.5 break-words text-[13px] font-medium text-[#0b2341]">
                      {products.slice(0, 2).join(", ")}
                      {products.length > 2
                        ? ` +${products.length - 2} more`
                        : ""}
                    </p>
                  </div>
                </div>
              )}

              {showExtras && (
                <details className="rounded-2xl border border-slate-100 px-3 py-1">
                  <summary className="cursor-pointer py-1.5 text-xs font-medium text-[#1d5f94] hover:text-[#0b2341]">
                    More record information ({extraColumns.length})
                  </summary>
                  <dl className="grid gap-x-4 gap-y-2 pb-2 pt-1 sm:grid-cols-2">
                    {extraColumns.map((column) => (
                      <div key={column.key} className="min-w-0">
                        <dt className="text-[10px] font-medium text-slate-400">
                          {titleFor(column.key)}
                        </dt>
                        <dd className="mt-0.5 break-words text-xs text-slate-700">
                          {displayValue(row[column.key], column.type) ||
                            "Not recorded"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
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
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e6f0f9] text-[#2678b9]">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-slate-400">{label}</p>
        <p
          className="truncate text-xs font-semibold text-[#0b2341]"
          title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function ReportDataView({
  initialReport = "combined",
  showReportPicker = true,
  onReportScopeChange,
  tripScope,
  onTripScopeChange,
}: {
  initialReport?: ReportKey;
  showReportPicker?: boolean;
  onOpenTrip?: (tripId: string) => void;
  onReportScopeChange?: (value: ReportKey) => void;
  tripScope?: "dispatches" | "monitoring" | "deliveries";
  onTripScopeChange?: (value: "dispatches" | "monitoring" | "deliveries") => void;
}) {
  const { accessToken, refreshSession, profile } = useAuth();
  const navigate = useNavigate();
  const [reportKey, setReportKey] = useState<ReportKey>(initialReport);
  const [viewMode, setViewMode] = useState<"visual" | "table">("table");
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterDraft, setFilterDraft] = useState<Record<string, string>>({});
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>(
    {},
  );
  const [sortBy, setSortBy] = useState(getSortableFields(initialReport)[0]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [dropdownOptionsLoading, setDropdownOptionsLoading] = useState(true);
  const [dropdownOptionsError, setDropdownOptionsError] = useState("");
  const [optionManagerOpen, setOptionManagerOpen] = useState(false);
  const [optionManagerField, setOptionManagerField] =
    useState<DropdownField>("trip_status");
  const [newOptionValue, setNewOptionValue] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [optionManagerError, setOptionManagerError] = useState("");
  const [optionManagerBusy, setOptionManagerBusy] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("current-report");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [mentionOptions, setMentionOptions] = useState<RelationshipOption[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [cellSaveState, setCellSaveState] = useState<{
    rowKey: string;
    field: string;
    status: "editing" | "saving" | "saved" | "warning" | "error";
    message: string;
  } | null>(null);
  const cellSaveInFlight = useRef(false);
  const cancelNextBlur = useRef(false);
  const textSaveTimer = useRef<number | null>(null);
  const mentionControlActive = useRef(false);
  const sortableFields =
    columns.length > 0
      ? columns.map((column) => column.key)
      : getSortableFields(reportKey);
  const activeSortBy = sortableFields.includes(sortBy)
    ? sortBy
    : getSortableFields(reportKey)[0];
  const effectiveSearch = reportKey === "store-calling" ? "" : appliedSearch;
  const displayedRows = useMemo(() => {
    const term = reportKey === "store-calling" ? appliedSearch.trim().toLocaleLowerCase() : "";
    if (!term) return rows;
    return rows.filter((row) => columns.some((column) => {
      const values = [row[column.key]];
      if (column.key === "assigned_to") values.push(row.assigned_to_name);
      return values.some((value) => searchableValue(value).toLocaleLowerCase().includes(term));
    }));
  }, [appliedSearch, columns, reportKey, rows]);
  const queryKey = JSON.stringify({
    accessToken,
    activeSortBy,
    appliedFilters,
    appliedSearch: effectiveSearch,
    page,
    reportKey,
    retryVersion,
    sortBy: activeSortBy,
    sortOrder,
  });

  useEffect(
    () => () => {
      if (textSaveTimer.current !== null) {
        window.clearTimeout(textSaveTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    setReportKey(initialReport);
    setViewMode("table");
    setPage(1);
    setSearch("");
    setAppliedSearch("");
    setFilterDraft({});
    setAppliedFilters({});
  }, [initialReport]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetchDropdownOptions(accessToken)
      .then((options) => {
        if (!active) return;
        setDropdownOptions(options);
        setDropdownOptionsError("");
      })
      .catch((cause) => {
        if (!active) return;
        setDropdownOptionsError(
          cause instanceof Error
            ? cause.message
          : "Unable to load dropdown options.",
        );
      })
      .finally(() => {
        if (active) setDropdownOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

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
          search: effectiveSearch,
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
    effectiveSearch,
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
    setAppliedSearch(search.trim());
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

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
    const nextReport = value as ReportKey;
    onReportScopeChange?.(nextReport);
    setPage(1);
    setReportKey(nextReport);
    setViewMode("table");
    setSearch("");
    setAppliedSearch("");
    setColumns([]);
    setRows([]);
    setPagination(null);
    setFilterDraft({});
    setAppliedFilters({});
  }

  function beginEditCell(row: ReportRow, index: number, columnKey: string) {
    if (cellSaveInFlight.current) return;
    cancelNextBlur.current = false;
    if (textSaveTimer.current !== null) {
      window.clearTimeout(textSaveTimer.current);
      textSaveTimer.current = null;
    }
    const target = getEditableCellTarget(row, columnKey, reportKey);
    if (!target) return;
    setMentionOptions([]);
    const rawCurrentText = String(row[columnKey] ?? "");
    const currentDateTime =
      target.editor === "datetime" && rawCurrentText
        ? new Date(rawCurrentText)
        : null;
    const currentText =
      target.editor === "date"
        ? rawCurrentText.slice(0, 10)
        : target.editor === "datetime" && currentDateTime &&
            !Number.isNaN(currentDateTime.getTime())
          ? `${currentDateTime.getFullYear()}-${String(currentDateTime.getMonth() + 1).padStart(2, "0")}-${String(currentDateTime.getDate()).padStart(2, "0")}T${String(currentDateTime.getHours()).padStart(2, "0")}:${String(currentDateTime.getMinutes()).padStart(2, "0")}`
          : rawCurrentText;
    const relationshipId = target.relationship
      ? row[target.relationship.idField]
      : undefined;
    setEditingCell({
      rowKey: rowKey(row, index),
      field: columnKey,
      definition: target,
      dropdownField: target.dropdownField,
      tripId: target.tripId,
      stopId: target.stopId,
      lineItemId: target.lineItemId,
      assignmentId: target.assignmentId,
      billingId: target.billingId,
      storeCallId: target.storeCallId,
      relationshipId:
        typeof relationshipId === "string" ? relationshipId : undefined,
      originalRelationshipId:
        typeof relationshipId === "string" ? relationshipId : undefined,
      value: currentText,
      originalValue: currentText,
      mentionProfileIds: [],
      assignmentEventKey:
        reportKey === "store-calling" && columnKey === "assigned_to"
          ? crypto.randomUUID()
          : undefined,
    });
    setCellSaveState({
      rowKey: rowKey(row, index),
      field: columnKey,
      status: "editing",
      message: "Editing",
    });
  }

  async function loadMentionOptions() {
    if (!accessToken || mentionLoading) return;
    setMentionLoading(true);
    try {
      const options = await searchRelationshipOptions(accessToken, "assignees", "");
      const admins = options.filter((option) => option.secondary?.toUpperCase() === "ADMIN");
      setMentionOptions(admins);
      if (admins.length === 0) {
        mentionControlActive.current = false;
        setCellSaveState((current) => current ? { ...current, status: "error", message: "No eligible active admin profiles found." } : current);
      }
    } catch (cause) {
      mentionControlActive.current = false;
      setCellSaveState((current) => current ? { ...current, status: "error", message: cause instanceof Error ? cause.message : "Unable to load eligible admins." } : current);
    } finally {
      setMentionLoading(false);
    }
  }

  function scheduleTextSave(candidate: EditingCell) {
    if (textSaveTimer.current !== null) {
      window.clearTimeout(textSaveTimer.current);
    }
    setCellSaveState({
      rowKey: candidate.rowKey,
      field: candidate.field,
      status: "editing",
      message: "Editing",
    });
    textSaveTimer.current = window.setTimeout(() => {
      textSaveTimer.current = null;
      void commitEditableCell(candidate, true);
    }, 700);
  }

  async function commitEditableCell(
    candidate?: EditingCell,
    keepEditing = false,
  ) {
    if (cancelNextBlur.current) {
      cancelNextBlur.current = false;
      return;
    }
    const sourceCell = candidate ?? editingCell;
    if (!sourceCell || !accessToken || cellSaveInFlight.current) return;
    if (textSaveTimer.current !== null) {
      window.clearTimeout(textSaveTimer.current);
      textSaveTimer.current = null;
    }
    const targetCell = { ...sourceCell };
    const definition = targetCell.definition;
    const textValue = targetCell.value.trim();
    const isControlled = definition.editor === "status";
    const isRelationship = definition.editor === "relationship";
    if (!textValue && (definition.required || isControlled || isRelationship)) {
      setCellSaveState({
        rowKey: targetCell.rowKey,
        field: targetCell.field,
        status: "error",
        message: "Value cannot be blank.",
      });
      return;
    }

    let nextValue: unknown = textValue || null;
    if (isRelationship) {
      if (!targetCell.relationshipId) {
        setCellSaveState({
          rowKey: targetCell.rowKey,
          field: targetCell.field,
          status: "error",
          message: "Choose a matching record from the list.",
        });
        return;
      }
      nextValue = targetCell.relationshipId;
    } else if (definition.editor === "number" && textValue) {
      const parsed = Number(textValue);
      if (!Number.isFinite(parsed)) {
        setCellSaveState({
          rowKey: targetCell.rowKey,
          field: targetCell.field,
          status: "error",
          message: "Enter a valid number.",
        });
        return;
      }
      nextValue = parsed;
    } else if (definition.editor === "datetime" && textValue) {
      const parsed = new Date(textValue);
      if (Number.isNaN(parsed.getTime())) {
        setCellSaveState({
          rowKey: targetCell.rowKey,
          field: targetCell.field,
          status: "error",
          message: "Enter a valid date and time.",
        });
        return;
      }
      nextValue = parsed.toISOString();
    } else if (definition.editor === "boolean") {
      if (textValue !== "true" && textValue !== "false") {
        setCellSaveState({
          rowKey: targetCell.rowKey,
          field: targetCell.field,
          status: "error",
          message: "Choose Yes or No.",
        });
        return;
      }
      nextValue = textValue === "true";
    } else if (isControlled) {
      const allowed = dropdownOptions.some(
        (option) =>
          option.field_key === definition.dropdownField &&
          option.option_value === textValue &&
          option.active,
      );
      if (!allowed) {
        setCellSaveState({
          rowKey: targetCell.rowKey,
          field: targetCell.field,
          status: "error",
          message: dropdownOptionsError || "Choose an active option.",
        });
        return;
      }
    }

    if (
      (isRelationship &&
        targetCell.relationshipId === targetCell.originalRelationshipId) ||
      (!isRelationship && textValue === targetCell.originalValue.trim())
    ) {
      setEditingCell(null);
      setCellSaveState(null);
      return;
    }

    setCellSaveState({
      rowKey: targetCell.rowKey,
      field: targetCell.field,
      status: "saving",
      message: "Saving...",
    });
    cellSaveInFlight.current = true;

    try {
      let savedRecord: Record<string, unknown>;
      const updatePayload: Record<string, unknown> = {
        [definition.sourceField]: nextValue,
      };
      if (definition.sourceField === "remarks" && targetCell.mentionProfileIds?.length) {
        updatePayload._mention = {
          recipientIds: targetCell.mentionProfileIds,
          reportKey,
          eventKey: targetCell.mentionEventKey ?? crypto.randomUUID(),
          recordLabel: definition.label,
        };
      }
      if (
        reportKey === "store-calling" &&
        definition.sourceEntity === "storeCall" &&
        definition.sourceField === "assigned_to" &&
        isRelationship &&
        targetCell.relationshipId !== targetCell.originalRelationshipId &&
        targetCell.relationshipOption?.secondary?.toUpperCase() === "ADMIN"
      ) {
        updatePayload._assignment_notification = {
          eventKey: targetCell.assignmentEventKey ?? crypto.randomUUID(),
        };
      }
      if (
        definition.sourceEntity === "stop" &&
        definition.sourceField === "customer_id" &&
        targetCell.relationshipId !== targetCell.originalRelationshipId
      ) {
        // A stop cannot retain a store that belongs to a different customer.
        updatePayload.store_id = null;
      } else if (
        definition.sourceEntity === "stop" &&
        definition.sourceField === "store_id" &&
        targetCell.relationshipOption?.values?.customer_id
      ) {
        updatePayload.customer_id =
          targetCell.relationshipOption.values.customer_id;
      }
      if (definition.sourceEntity === "storeCall" && targetCell.storeCallId) {
        savedRecord = await updateStoreCallRecord(accessToken, targetCell.storeCallId, {
          ...updatePayload,
        });
      } else if (
        definition.sourceEntity === "lineItem" &&
        targetCell.tripId &&
        targetCell.stopId &&
        targetCell.lineItemId
      ) {
        savedRecord = await updateTripLineItemRecord(
          accessToken,
          targetCell.tripId,
          targetCell.stopId,
          targetCell.lineItemId,
          updatePayload,
        );
      } else if (
        definition.sourceEntity === "stop" &&
        targetCell.tripId &&
        targetCell.stopId
      ) {
        savedRecord = await updateTripStopRecord(
          accessToken,
          targetCell.tripId,
          targetCell.stopId,
          updatePayload,
        );
      } else if (
        definition.sourceEntity === "assignment" &&
        targetCell.tripId &&
        targetCell.assignmentId
      ) {
        savedRecord = await updateTripAssignmentRecord(
          accessToken,
          targetCell.tripId,
          targetCell.assignmentId,
          updatePayload,
        );
      } else if (
        definition.sourceEntity === "billing" &&
        targetCell.tripId &&
        targetCell.billingId
      ) {
        savedRecord = await updateTripBillingRecord(
          accessToken,
          targetCell.tripId,
          targetCell.billingId,
          updatePayload,
        );
      } else if (definition.sourceEntity === "trip" && targetCell.tripId) {
        savedRecord = await updateTripRecord(accessToken, targetCell.tripId, {
          ...updatePayload,
        });
      } else {
        throw new Error("This report row is missing its update record ID.");
      }

      const mentionWarning = typeof savedRecord._mention_notification_warning === "string"
        ? savedRecord._mention_notification_warning
        : "";

      const confirmedCellValue = !isRelationship &&
        Object.prototype.hasOwnProperty.call(savedRecord, definition.sourceField)
        ? savedRecord[definition.sourceField]
        : nextValue;

      setRows((currentRows) =>
        currentRows.map((row) => {
          const matchesEditedRecord =
            definition.sourceEntity === "trip"
              ? row.trip_id === targetCell.tripId
              : definition.sourceEntity === "stop"
                ? row.trip_stop_id === targetCell.stopId &&
                  row.trip_id === targetCell.tripId
                : definition.sourceEntity === "lineItem"
                  ? row.trip_line_item_id === targetCell.lineItemId &&
                    row.trip_stop_id === targetCell.stopId &&
                    row.trip_id === targetCell.tripId
                  : definition.sourceEntity === "assignment"
                    ? row.assignment_id === targetCell.assignmentId &&
                      row.trip_id === targetCell.tripId
                    : definition.sourceEntity === "billing"
                      ? row.billing_id === targetCell.billingId &&
                        row.trip_id === targetCell.tripId
                      : row.store_call_id === targetCell.storeCallId;
          if (!matchesEditedRecord) return row;
          if (isRelationship && definition.relationship) {
            const option = targetCell.relationshipOption;
            const internalIdField: Record<string, string> = {
              trip_type_id: "_trip_type_id",
              warehouse_id: "_warehouse_id",
              customer_id: "_customer_id",
              store_id: "_store_id",
              truck_id: "_truck_id",
              driver_id: "_driver_id",
              trucking_company_id: "_trucking_company_id",
              product_id: "_product_id",
              truck_allocated_by: "_truck_allocated_by",
              tms_done_by: "_tms_done_by",
            };
            const internalIdKey =
              internalIdField[definition.relationship.idField];
            const displayText =
              option?.values?.[targetCell.field] ??
              (targetCell.field === "warehouse_code"
                ? option?.secondary
                : option?.label) ??
              targetCell.value;
            return {
              ...row,
              [targetCell.field]: displayText,
              [definition.relationship.idField]: nextValue,
              ...(internalIdKey ? { [internalIdKey]: nextValue } : {}),
              ...(option?.values ?? {}),
              ...(definition.sourceEntity === "stop" &&
              definition.sourceField === "customer_id"
                ? {
                    store_id: null,
                    _store_id: null,
                    store_name: null,
                    ship_to: null,
                    city: null,
                    province: null,
                  }
                : {}),
              ...(definition.sourceEntity === "stop" &&
              definition.sourceField === "store_id" &&
              option?.values?.customer_id
                ? {
                    customer_id: option.values.customer_id,
                    _customer_id: option.values.customer_id,
                  }
                : {}),
            };
          }
          const confirmedValue = Object.prototype.hasOwnProperty.call(
            savedRecord,
            definition.sourceField,
          )
            ? savedRecord[definition.sourceField]
            : nextValue;
          return { ...row, [targetCell.field]: confirmedValue };
        }),
      );

      setCellSaveState({
        rowKey: targetCell.rowKey,
        field: targetCell.field,
        status: mentionWarning ? "warning" : "saved",
        message: mentionWarning || "Saved",
      });
      if (keepEditing) {
        setEditingCell({
          ...targetCell,
          value: String(confirmedCellValue ?? ""),
          originalValue: String(confirmedCellValue ?? ""),
          originalRelationshipId: targetCell.relationshipId,
          mentionProfileIds: [],
          mentionEventKey: undefined,
          assignmentEventKey: undefined,
        });
      } else {
        setEditingCell(null);
      }
      invalidateApiCache(REPORTS[reportKey].endpoint);
      if (
        appliedSearch ||
        Object.values(appliedFilters).some((value) => value.trim()) ||
        activeSortBy === targetCell.field
      ) {
        setRetryVersion((version) => version + 1);
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to save this change.";
      setCellSaveState({
        rowKey: targetCell.rowKey,
        field: targetCell.field,
        status: "error",
        message: message,
      });
      if (!keepEditing) setEditingCell(null);
    } finally {
      cellSaveInFlight.current = false;
    }
  }

  async function reloadDropdownOptions() {
    if (!accessToken) return;
    setDropdownOptionsLoading(true);
    try {
      const options = await fetchDropdownOptions(accessToken);
      setDropdownOptions(options);
      setDropdownOptionsError("");
    } catch (cause) {
      setDropdownOptionsError(
        cause instanceof Error
          ? cause.message
          : "Unable to load dropdown options.",
      );
      throw cause;
    } finally {
      setDropdownOptionsLoading(false);
    }
  }

  async function submitNewDropdownOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setOptionManagerBusy(true);
    setOptionManagerError("");
    try {
      await addDropdownOption(accessToken, {
        field_key: optionManagerField,
        option_value: newOptionValue,
        display_label: newOptionLabel || newOptionValue,
        sort_order:
          dropdownOptions.filter(
            (option) => option.field_key === optionManagerField,
          ).length * 10,
      });
      setNewOptionValue("");
      setNewOptionLabel("");
      await reloadDropdownOptions();
    } catch (cause) {
      setOptionManagerError(
        cause instanceof Error ? cause.message : "Unable to add option.",
      );
    } finally {
      setOptionManagerBusy(false);
    }
  }

  async function saveDropdownOption(
    option: DropdownOption,
    patch: {
      display_label?: string;
      sort_order?: number;
      active?: boolean;
    },
  ) {
    if (!accessToken) return;
    let confirmInUse = false;
    const affectsInUseOption =
      option.usage_count > 0 &&
      ((patch.display_label !== undefined &&
        patch.display_label !== option.display_label) ||
        patch.active === false);
    if (affectsInUseOption) {
      confirmInUse = window.confirm(
        `This option is used by ${option.usage_count} record(s). Changing its label preserves the stored value; deactivation removes it from new selections but keeps historical records. Continue?`,
      );
      if (!confirmInUse) return;
    }

    setOptionManagerBusy(true);
    setOptionManagerError("");
    try {
      await editDropdownOption(accessToken, option.id, {
        ...patch,
        ...(confirmInUse ? { confirm_in_use: true } : {}),
      });
      await reloadDropdownOptions();
    } catch (cause) {
      setOptionManagerError(
        cause instanceof Error ? cause.message : "Unable to update option.",
      );
    } finally {
      setOptionManagerBusy(false);
    }
  }

  async function moveDropdownOption(option: DropdownOption, direction: -1 | 1) {
    if (!accessToken) return;
    const siblings = dropdownOptions
      .filter((candidate) => candidate.field_key === optionManagerField)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.option_value.localeCompare(right.option_value),
      );
    const index = siblings.findIndex((candidate) => candidate.id === option.id);
    const neighbor = siblings[index + direction];
    if (!neighbor) return;

    setOptionManagerBusy(true);
    setOptionManagerError("");
    try {
      await Promise.all([
        editDropdownOption(accessToken, option.id, {
          sort_order: neighbor.sort_order,
        }),
        editDropdownOption(accessToken, neighbor.id, {
          sort_order: option.sort_order,
        }),
      ]);
      await reloadDropdownOptions();
    } catch (cause) {
      setOptionManagerError(
        cause instanceof Error ? cause.message : "Unable to reorder options.",
      );
    } finally {
      setOptionManagerBusy(false);
    }
  }

  function renameDropdownOption(option: DropdownOption) {
    const displayLabel = window.prompt(
      "Display label. The stored business value will not change.",
      option.display_label,
    );
    if (displayLabel === null || displayLabel.trim() === option.display_label) {
      return;
    }
    void saveDropdownOption(option, { display_label: displayLabel });
  }

  const reportFilters = getReportFilters(reportKey);
  const canManageDropdowns =
    profile?.is_admin === true || profile?.role?.toUpperCase() === "ADMIN";
  const pageCount = pagination?.totalPages ?? 0;
  const activeError =
    requestError?.key === queryKey
      ? requestError.message
      : !accessToken
        ? "Your session has expired. Please log in again."
        : null;
  const isLoading = Boolean(accessToken) && loadedQueryKey !== queryKey;

  function openOptionManager() {
    setOptionManagerField(
      reportKey === "store-calling"
        ? "store_call_status"
        : reportKey === "dispatch"
          ? "delivery_status"
          : "trip_status",
    );
    setOptionManagerError("");
    setOptionManagerOpen(true);
  }

  async function runReportExport() {
    if (!accessToken || exportBusy) return;
    setExportBusy(true);
    setExportError("");
    try {
      const { ExcelJS, JSZip } = await loadExportLibraries();
      const keys = exportMode === "current-report" ? [reportKey] : reportKeys;
      const datasets = await Promise.all(
        keys.map(async (key) => ({ key, ...(await fetchAllReportRows(key, accessToken)) })),
      );
      if (exportMode === "all-workbook") {
        const workbook = new ExcelJS.Workbook();
        for (const dataset of datasets) {
          appendReportWorksheet(workbook, dataset.key, dataset.columns, dataset.rows);
        }
        const bytes = await workbook.xlsx.writeBuffer();
        downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "alzhen-all-reports.xlsx");
      } else if (exportMode === "separate-zip") {
        const zip = new JSZip();
        for (const dataset of datasets) {
          const workbook = new ExcelJS.Workbook();
          appendReportWorksheet(workbook, dataset.key, dataset.columns, dataset.rows);
          const bytes = await workbook.xlsx.writeBuffer();
          const safeName = REPORTS[dataset.key].title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          zip.file(`${safeName}.xlsx`, bytes);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, "alzhen-reports.zip");
      } else {
        const dataset = datasets[0];
        const workbook = new ExcelJS.Workbook();
        appendReportWorksheet(workbook, dataset.key, dataset.columns, dataset.rows);
        const bytes = await workbook.xlsx.writeBuffer();
        const filename = REPORTS[dataset.key].title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
      }
      setExportModalOpen(false);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Unable to export report data.");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04),0_10px_30px_-18px_rgba(11,35,65,0.14)]">
      <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {tripScope && onTripScopeChange && (
            <div role="tablist" aria-label="Trip views" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#f2f6fa] p-1">
              {([
                ["dispatches", "All trips"],
                ["monitoring", "Dispatch monitoring"],
                ["deliveries", "Deliveries"],
              ] as const).map(([scope, label]) => (
                <button key={scope} type="button" role="tab" aria-selected={tripScope === scope} onClick={() => onTripScopeChange(scope)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${tripScope === scope ? "bg-[#0b2341] text-white" : "text-slate-500 hover:text-[#0b2341]"}`}>{label}</button>
              ))}
            </div>
          )}
          {showReportPicker ? (
            <label className="sr-only" htmlFor="report-select">
              Select report
            </label>
          ) : (
            <h2 className="text-[17px] font-semibold tracking-tight text-[#0b2341]">
              {REPORTS[reportKey].title}
            </h2>
          )}
          {showReportPicker && (
            <div className="relative">
              <select
                id="report-select"
                value={reportKey}
                onChange={(event) => changeReport(event.target.value)}
                className="min-h-10 appearance-none rounded-full border border-slate-200 bg-[#f2f6fa] py-2 pl-3 pr-9 text-sm font-medium text-slate-800 outline-none transition-colors focus:border-[#2678b9] focus:ring-2 focus:ring-[#cfe1f1]">
                {reportKeys.map((key) => (
                  <option key={key} value={key}>
                    {REPORTS[key].title}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              />
            </div>
          )}
          <div
            role="group"
            aria-label="Report display mode"
            className="inline-flex h-10 items-center rounded-full bg-[#f2f6fa] p-1">
            <button
              type="button"
              aria-pressed={viewMode === "visual"}
              onClick={() => setViewMode("visual")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${viewMode === "visual" ? "bg-[#0b2341] text-white shadow-sm" : "text-slate-500 hover:text-[#0b2341]"}`}>
              <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
              Visual
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "table"}
              onClick={() => setViewMode("table")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${viewMode === "table" ? "bg-[#0b2341] text-white shadow-sm" : "text-slate-500 hover:text-[#0b2341]"}`}>
              <Table2 aria-hidden="true" className="h-3.5 w-3.5" />
              Table
            </button>
          </div>
          <button
            type="button"
            title="Export reports"
            aria-label="Export reports"
            onClick={() => { setExportError(""); setExportModalOpen(true); }}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
            <Download aria-hidden="true" className="h-4 w-4" />
            <span>Export</span>
          </button>
          <label className="text-xs text-slate-500" htmlFor="report-sort">
            Sort
          </label>
          <div className="relative">
            <select
              id="report-sort"
              value={activeSortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="min-h-10 max-w-48 appearance-none rounded-full border border-slate-200 bg-[#f2f6fa] py-2 pl-3 pr-9 text-sm text-slate-700 outline-none transition-colors focus:border-[#2678b9] focus:ring-2 focus:ring-[#cfe1f1]">
              {sortableFields.map((field) => (
                <option key={field} value={field}>
                  {columns.find((column) => column.key === field)?.title ??
                    field}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            />
          </div>
          <div className="relative">
            <select
              aria-label="Sort order"
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value as "asc" | "desc")
              }
              className="min-h-10 appearance-none rounded-full border border-slate-200 bg-[#f2f6fa] py-2 pl-3 pr-9 text-sm text-slate-700 outline-none transition-colors focus:border-[#2678b9] focus:ring-2 focus:ring-[#cfe1f1]">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            />
          </div>
          {canManageDropdowns && (
            <button
              type="button"
              onClick={openOptionManager}
              className="min-h-9 rounded-full border border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-[#f2f6fa]">
              Manage options
            </button>
          )}
        </div>
        <form onSubmit={submitSearch} className="flex gap-2">
          <label
            className="relative min-w-0 flex-1 lg:w-64"
            htmlFor="report-search">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              id="report-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search report"
              className="min-h-10 w-full rounded-full border border-slate-200 bg-[#f2f6fa] pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500"
            />
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-full bg-[#ffd43b] px-5 text-sm font-semibold text-[#0b2341] transition hover:bg-[#f2c200]">
            Search
          </button>
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
                setPage(1);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {exportModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="report-export-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 id="report-export-title" className="text-lg font-semibold text-[#0b2341]">Export reports</h2>
            <p className="mt-1 text-sm text-slate-500">Exports use report access already granted to your account and include all pages of report data.</p>
            <div className="mt-4 space-y-2">
              {([
                ["all-workbook", "All reports in one workbook", "One Excel workbook with a worksheet for each report."],
                ["separate-zip", "All reports separately", "A ZIP containing a separate Excel workbook for each report."],
                ["current-report", `This report: ${REPORTS[reportKey].title}`, "One Excel workbook for the selected report."],
              ] as [ExportMode, string, string][]).map(([value, label, description]) => (
                <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${exportMode === value ? "border-amber-400 bg-amber-50/60" : "border-slate-200 hover:bg-slate-50"}`}>
                  <input type="radio" name="report-export-mode" value={value} checked={exportMode === value} onChange={() => setExportMode(value)} className="mt-1 accent-amber-500" />
                  <span><span className="block text-sm font-semibold text-slate-800">{label}</span><span className="mt-0.5 block text-xs text-slate-500">{description}</span></span>
                </label>
              ))}
            </div>
            {exportError && <p role="alert" className="mt-3 text-sm text-rose-700">{exportError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={exportBusy} onClick={() => setExportModalOpen(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={exportBusy} onClick={() => void runReportExport()} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] disabled:opacity-50">{exportBusy ? "Preparing…" : "Export"}</button>
            </div>
          </section>
        </div>
      )}

      {optionManagerOpen && canManageDropdowns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dropdown-manager-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
              <div>
                <h2
                  id="dropdown-manager-title"
                  className="text-base font-semibold text-slate-900">
                  Dropdown options
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Labels do not change stored values. Deactivated options remain
                  on historical records.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dropdown manager"
                onClick={() => setOptionManagerOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
                Close
              </button>
            </header>
            <div className="grid gap-4 p-4">
              <label className="grid max-w-sm gap-1 text-xs font-medium text-slate-600">
                Field
                <select
                  value={optionManagerField}
                  onChange={(event) =>
                    setOptionManagerField(event.target.value as DropdownField)
                  }
                  className="min-h-9 rounded-md border border-slate-300 px-2.5 text-sm text-slate-800">
                  <option value="trip_status">Trip status</option>
                  <option value="delivery_status">Delivery status</option>
                  <option value="letter_status">Letter status</option>
                  <option value="store_call_status">
                    Store Calling status
                  </option>
                  <option value="confirmation_status">
                    Confirmation status
                  </option>
                </select>
              </label>

              {optionManagerField === "letter_status" ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Values are fixed by the trips database constraint: READY,
                  SENT, CANCELLED. Labels and ordering can be changed, but
                  values cannot be added or deactivated.
                </p>
              ) : (
                <form
                  onSubmit={(event) => void submitNewDropdownOption(event)}
                  className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    Stored value
                    <input
                      required
                      maxLength={60}
                      value={newOptionValue}
                      onChange={(event) =>
                        setNewOptionValue(event.target.value)
                      }
                      className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-normal text-slate-800"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    Display label
                    <input
                      maxLength={80}
                      value={newOptionLabel}
                      onChange={(event) =>
                        setNewOptionLabel(event.target.value)
                      }
                      className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-normal text-slate-800"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={optionManagerBusy}
                    className="min-h-9 rounded-md bg-[#0b2341] px-4 text-xs font-medium text-white hover:bg-[#16345a] disabled:opacity-50">
                    Add option
                  </button>
                </form>
              )}

              {optionManagerError && (
                <p role="alert" className="text-xs text-rose-700">
                  {optionManagerError}
                </p>
              )}
              {dropdownOptionsError && (
                <p role="alert" className="text-xs text-rose-700">
                  {dropdownOptionsError}
                </p>
              )}

              <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {dropdownOptions
                  .filter((option) => option.field_key === optionManagerField)
                  .sort(
                    (left, right) =>
                      left.sort_order - right.sort_order ||
                      left.option_value.localeCompare(right.option_value),
                  )
                  .map((option, index, options) => (
                    <div
                      key={option.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {option.display_label}
                          {!option.active && (
                            <span className="ml-2 text-[10px] font-normal text-slate-500">
                              Inactive
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Stored value: {option.option_value} · Used by{" "}
                          {option.usage_count} record(s)
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          title="Move up"
                          aria-label={`Move ${option.display_label} up`}
                          disabled={optionManagerBusy || index === 0}
                          onClick={() => void moveDropdownOption(option, -1)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">
                          ↑
                        </button>
                        <button
                          type="button"
                          title="Move down"
                          aria-label={`Move ${option.display_label} down`}
                          disabled={
                            optionManagerBusy || index === options.length - 1
                          }
                          onClick={() => void moveDropdownOption(option, 1)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={optionManagerBusy}
                          onClick={() => renameDropdownOption(option)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50">
                          Rename label
                        </button>
                        {option.field_key !== "letter_status" && (
                          <button
                            type="button"
                            disabled={optionManagerBusy}
                            onClick={() =>
                              void saveDropdownOption(option, {
                                active: !option.active,
                              })
                            }
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50">
                            {option.active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </div>
      )}

      <details className="border-y border-slate-100 px-5 py-2">
        <summary className="cursor-pointer py-1 text-xs font-medium text-slate-600">
          Filters
        </summary>
        <form
          onSubmit={submitFilters}
          className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {reportFilters.map((filter) => (
            <label
              key={filter.key}
              className="grid gap-1 text-xs font-medium text-slate-600">
              {filter.label}
              {filter.dropdownField ? (
                <select
                  value={filterDraft[filter.key] ?? ""}
                  onChange={(event) =>
                    setFilterDraft((current) => ({
                      ...current,
                      [filter.key]: event.target.value,
                    }))
                  }
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-normal text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100">
                  <option value="">All</option>
                  {[...new Map(
                    dropdownOptions
                      .filter(
                        (option) =>
                          option.field_key === filter.dropdownField &&
                          option.active,
                      )
                      .map((option) => [option.option_value, option]),
                  ).values()].map((option) => (
                    <option key={option.option_value} value={option.option_value}>
                      {option.display_label}
                    </option>
                  ))}
                  {filterDraft[filter.key] &&
                    !dropdownOptions.some(
                      (option) =>
                        option.field_key === filter.dropdownField &&
                        option.option_value === filterDraft[filter.key] &&
                        option.active,
                    ) && (
                      <option value={filterDraft[filter.key]}>
                        {filterDraft[filter.key]} (inactive)
                      </option>
                    )}
                </select>
              ) : (
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
              )}
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="min-h-9 rounded-md bg-[#0b2341] px-4 text-xs font-medium text-white hover:bg-[#16345a]">
              Apply filters
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Clear
            </button>
          </div>
        </form>
      </details>

      {activeError ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
          <p role="alert" className="text-sm text-rose-700">
            {activeError}
          </p>
          <button
            type="button"
            onClick={() => setRetryVersion((value) => value + 1)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="relative min-h-48 overflow-x-auto">
            {viewMode === "visual" ? (
              isLoading ? (
                <div className="p-3">
                  <TableSkeleton
                    columns={Math.min(columns.length || 5, 5)}
                    rows={5}
                  />
                </div>
              ) : displayedRows.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-slate-500">
                  {appliedSearch ||
                  Object.values(appliedFilters).some((value) => value.trim())
                    ? "No matching records found."
                    : "No report records found."}
                </p>
              ) : (
                <ReportVisualCards
                  rows={displayedRows}
                  columns={columns}
                  reportKey={reportKey}
                />
              )
            ) : isLoading ? (
              <div className="p-3">
                <TableSkeleton
                  columns={Math.max(columns.length || 5, 5)}
                  rows={6}
                />
              </div>
            ) : (
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <thead className="bg-[#f2f6fa] text-xs font-semibold text-slate-600">
                  <tr>
                    {columns.map((column) => {
                      const sortable = sortableFields.includes(column.key);
                      const isActiveSort = activeSortBy === column.key;
                      const SortIcon = !isActiveSort
                        ? ArrowUpDown
                        : sortOrder === "asc"
                          ? ArrowUp
                          : ArrowDown;
                      return (
                      <th
                        key={column.key}
                        scope="col"
                        className={`whitespace-nowrap border-b border-slate-100 px-4 py-3 ${
                          column.type === "number" ||
                          ["quantity", "cbm", "subcon_rate_manual"].includes(
                            column.key,
                          )
                            ? "text-right"
                            : "text-left"
                        }`}>
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isActiveSort) {
                                setSortOrder((current) =>
                                  current === "asc" ? "desc" : "asc",
                                );
                              } else {
                                setSortBy(column.key);
                                setSortOrder("asc");
                              }
                              setPage(1);
                            }}
                            aria-label={`Sort by ${column.title}${isActiveSort ? `, currently ${sortOrder === "asc" ? "ascending" : "descending"}` : ""}`}
                            className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-inherit transition hover:bg-[#e6f0f9] hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]">
                            {column.title}
                            <SortIcon
                              aria-hidden="true"
                              className={`h-3.5 w-3.5 ${isActiveSort ? "text-[#d97706]" : "text-slate-400"}`}
                            />
                          </button>
                        ) : (
                          column.title
                        )}
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(columns.length, 1)}
                        className="px-4 py-12 text-center text-sm text-slate-500">
                        {appliedSearch ||
                        Object.values(appliedFilters).some((value) => value.trim())
                          ? "No matching records found."
                          : "No report rows found."}
                      </td>
                    </tr>
                  )}
                  {displayedRows.map((row, index) => {
                    const currentRowKey = rowKey(row, index);
                    return (
                      <tr
                        key={currentRowKey}
                        className="border-b border-slate-100 last:border-0 hover:bg-[#f2f6fa]/70">
                        {columns.map((column) => {
                          const editableTarget = getEditableCellTarget(
                            row,
                            column.key,
                            reportKey,
                          );
                          const activeOptionsForCell = editableTarget?.dropdownField
                            ? dropdownOptions.filter(
                                (option) =>
                                  option.field_key ===
                                    editableTarget.dropdownField &&
                                  option.active,
                              )
                            : [];
                          const isEditable = Boolean(editableTarget);
                          const isEditing =
                            editingCell?.rowKey === currentRowKey &&
                            editingCell.field === column.key;

                          return (
                            <td
                              key={column.key}
                              onClick={() => {
                                if (!isEditing) {
                                  beginEditCell(row, index, column.key);
                                }
                              }}
                              className={`max-w-80 px-4 py-3 text-slate-700 ${
                                isEditable
                                  ? "cursor-pointer outline-none ring-1 ring-transparent transition hover:bg-amber-50/40 hover:ring-amber-200"
                                  : ""
                              } ${
                                column.type === "number" ||
                                [
                                  "quantity",
                                  "cbm",
                                  "subcon_rate_manual",
                                ].includes(column.key)
                                  ? "text-right tabular-nums"
                                  : "text-left"
                              }`}>
                              {isEditing && editingCell ? (
                                editingCell.definition.editor ===
                                  "relationship" &&
                                editingCell.definition.relationship ? (
                                  <SearchableRelationshipEditor
                                    token={accessToken ?? ""}
                                    kind={
                                      editingCell.definition.relationship.kind
                                    }
                                    value={editingCell.value}
                                    storeId={
                                      typeof row[
                                        editingCell.definition.relationship
                                          .storeIdField ?? ""
                                      ] === "string"
                                        ? String(
                                            row[
                                              editingCell.definition
                                                .relationship.storeIdField ?? ""
                                            ],
                                        )
                                        : undefined
                                    }
                                    customerId={
                                      typeof row[
                                        editingCell.definition.relationship
                                          .customerIdField ?? ""
                                      ] === "string"
                                        ? String(
                                            row[
                                              editingCell.definition
                                                .relationship.customerIdField ?? ""
                                            ],
                                          )
                                        : undefined
                                    }
                                    onChange={(value) =>
                                      setEditingCell((current) =>
                                        current
                                          ? {
                                              ...current,
                                              value,
                                              relationshipId: undefined,
                                              relationshipOption: undefined,
                                            }
                                          : current,
                                      )
                                    }
                                    onSelect={(option) => {
                                      if (!editingCell) return;
                                      const displayed =
                                        option.values?.[editingCell.field] ??
                                        (editingCell.field === "warehouse_code"
                                          ? (option.values?.warehouse_code ??
                                            option.secondary ??
                                            option.label)
                                          : option.label);
                                      const nextCell = {
                                        ...editingCell,
                                        value: displayed,
                                        relationshipId: option.id,
                                        relationshipOption: option,
                                      };
                                      setEditingCell(nextCell);
                                      void commitEditableCell(nextCell);
                                    }}
                                    onCommitBlur={() =>
                                      void commitEditableCell()
                                    }
                                    onCancel={() => {
                                      cancelNextBlur.current = true;
                                      setEditingCell(null);
                                      setCellSaveState(null);
                                    }}
                                    disabled={
                                      cellSaveState?.rowKey === currentRowKey &&
                                      cellSaveState.status === "saving"
                                    }
                                  />
                                ) : editingCell.definition.editor ===
                                    "status" ||
                                  editingCell.definition.editor ===
                                    "boolean" ? (
                                  editingCell.definition.editor === "boolean" ? (
                                    <input
                                      autoFocus
                                      type="checkbox"
                                      aria-label={`Edit ${column.title}`}
                                      checked={editingCell.value === "true"}
                                      disabled={
                                        cellSaveState?.rowKey === currentRowKey &&
                                        cellSaveState.status === "saving"
                                      }
                                      onChange={(event) => {
                                        const nextCell = {
                                          ...editingCell,
                                          value: String(event.target.checked),
                                        };
                                        setEditingCell(nextCell);
                                        void commitEditableCell(nextCell);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          cancelNextBlur.current = true;
                                          setEditingCell(null);
                                          setCellSaveState(null);
                                        }
                                      }}
                                      className="h-4 w-4 accent-cyan-700"
                                    />
                                  ) : (
                                  <div className="relative inline-flex max-w-full">
                                  <select
                                    autoFocus
                                    aria-label={`Edit ${column.title}`}
                                    disabled={
                                      (cellSaveState?.rowKey === currentRowKey &&
                                        cellSaveState.status === "saving") ||
                                      activeOptionsForCell.length === 0
                                    }
                                    value={editingCell.value}
                                    onChange={(event) => {
                                      const nextCell = {
                                        ...editingCell,
                                        value: event.target.value,
                                      };
                                      setEditingCell(nextCell);
                                      void commitEditableCell(nextCell);
                                    }}
                                    onBlur={() => void commitEditableCell()}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        void commitEditableCell();
                                      }
                                      if (event.key === "Escape") {
                                        cancelNextBlur.current = true;
                                        if (textSaveTimer.current !== null) {
                                          window.clearTimeout(textSaveTimer.current);
                                          textSaveTimer.current = null;
                                        }
                                        setEditingCell(null);
                                        setCellSaveState(null);
                                      }
                                    }}

                                    className="max-w-[min(22rem,70vw)] min-w-[130px] appearance-none rounded-lg border border-amber-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-800 shadow-sm outline-none transition hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-60">
                                    {activeOptionsForCell.length === 0 &&
                                      !editingCell.value && (
                                        <option value="" disabled>
                                          {dropdownOptionsLoading
                                            ? "Loading options..."
                                            : dropdownOptionsError
                                              ? "Options unavailable"
                                              : "No active options"}
                                        </option>
                                      )}

                                    {dropdownOptions
                                      .filter(
                                        (option) =>
                                          option.field_key ===
                                            editingCell.definition.dropdownField &&
                                          option.active,
                                      )
                                      .map((option) => (
                                        <option
                                          key={option.id}
                                          value={option.option_value}>
                                          {option.display_label}
                                        </option>
                                      ))}
                                    {editingCell.value &&
                                      !dropdownOptions.some(
                                        (option) =>
                                          option.field_key ===
                                            editingCell.definition.dropdownField &&
                                          option.option_value ===
                                            editingCell.value &&
                                          option.active,
                                      ) && (
                                        <option value={editingCell.value}>
                                          {editingCell.value} (inactive)
                                        </option>
                                      )}
                                  </select>
                                  <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700"
                                  />
                                  </div>
                                  )
                                ) : (
                                  <div className="grid min-w-[150px] gap-1">
                                  <input
                                    autoFocus
                                    type={
                                      editingCell.definition.editor === "number"
                                        ? "number"
                                        : editingCell.definition.editor === "date"
                                          ? "date"
                                          : editingCell.definition.editor === "datetime"
                                            ? "datetime-local"
                                            : "text"
                                    }
                                    step={
                                      editingCell.definition.editor === "number" &&

                                      editingCell.field === "page_no"
                                        ? "1"
                                        : "any"
                                    }
                                    aria-label={`Edit ${column.title}`}
                                    disabled={
                                      cellSaveState?.rowKey === currentRowKey &&
                                      cellSaveState.status === "saving"
                                    }
                                    value={editingCell.value}
                                    onChange={(event) => {
                                      const nextCell = {
                                        ...editingCell,
                                        value: event.target.value,
                                      };
                                      setEditingCell(nextCell);
                                      if (
                                        editingCell.definition.editor === "text" ||
                                        editingCell.definition.editor === "number"
                                      ) {
                                        scheduleTextSave(nextCell);
                                      }
                                    }}
                                    onBlur={() => {
                                      if (!mentionControlActive.current) void commitEditableCell();
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        void commitEditableCell();
                                      }
                                      if (event.key === "Escape") {
                                        cancelNextBlur.current = true;
                                        if (textSaveTimer.current !== null) {
                                          window.clearTimeout(textSaveTimer.current);
                                          textSaveTimer.current = null;
                                        }
                                        setEditingCell(null);
                                        setCellSaveState(null);
                                      }
                                    }}
                                    className="min-w-[120px] rounded-md border border-[#9cc3e3] bg-white px-2 py-1 text-sm font-medium text-slate-800 shadow-sm outline-none ring-2 ring-[#cfe1f1]"
                                  />
                                  {(editingCell.tripId || editingCell.storeCallId) && editingCell.definition.sourceField === "remarks" && (
                                    <>
                                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { mentionControlActive.current = true; if (textSaveTimer.current !== null) { window.clearTimeout(textSaveTimer.current); textSaveTimer.current = null; } void loadMentionOptions(); }} className="w-fit rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-[#2678b9] hover:bg-blue-50">@ Mention admin</button>
                                      {mentionOptions.length > 0 && mentionControlActive.current && (
                                        <select aria-label="Select admin to mention" defaultValue="" onBlur={() => { mentionControlActive.current = false; void commitEditableCell(); }} onChange={(event) => {
                                          const option = mentionOptions.find((item) => item.id === event.target.value);
                                          if (!option) return;
                                          const current = editingCell;
                                          const nextCell = {
                                            ...current,
                                            value: `${current.value}${current.value && !current.value.endsWith(" ") ? " " : ""}@${option.label}`,
                                            mentionProfileIds: [...new Set([...(current.mentionProfileIds ?? []), option.id])],
                                            mentionEventKey: current.mentionEventKey ?? crypto.randomUUID(),
                                          };
                                          setEditingCell(nextCell);
                                          mentionControlActive.current = false;
                                          setMentionOptions([]);
                                          scheduleTextSave(nextCell);
                                        }} className="max-w-[min(22rem,70vw)] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                                          <option value="">Choose an eligible admin</option>
                                          {mentionOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                        </select>
                                      )}
                                      {mentionLoading && <span className="text-[10px] text-slate-500">Loading admins…</span>}
                                      {cellSaveState?.status === "error" && cellSaveState.message.includes("eligible admins") && <span role="alert" className="text-[10px] text-rose-600">{cellSaveState.message}</span>}
                                    </>
                                  )}
                                  </div>
                                )
                              ) : isEditable ? (
                                <div className="flex items-center justify-between gap-2">
                                  {editableTarget?.editor === "status" ? (
                                    <StatusBadge
                                      value={
                                        dropdownOptions.find(
                                          (option) =>
                                            option.field_key ===
                                              editableTarget.dropdownField &&
                                            option.option_value ===
                                              String(row[column.key] ?? ""),
                                        )?.display_label ?? row[column.key]
                                      }
                                    />
                                  ) : (
                                    <span
                                      className="block truncate"
                                      title={displayValue(
                                        row[column.key],
                                        column.type,
                                      )}>
                                      {editableTarget?.editor === "boolean"
                                        ? row[column.key] === true ||
                                          row[column.key] === "true"
                                          ? "Yes"
                                          : "No"
                                        : displayValue(
                                            row[column.key],
                                            column.type,
                                          )}
                                    </span>
                                  )}
                                  {cellSaveState?.rowKey === currentRowKey &&
                                  cellSaveState.field === column.key ? (
                                    <span
                                      className={`text-[10px] font-medium ${cellSaveState.status === "error" ? "text-rose-600" : cellSaveState.status === "saving" || cellSaveState.status === "warning" ? "text-amber-700" : "text-emerald-600"}`}>
                                      {cellSaveState.message}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span
                                  className="block truncate"
                                  title={displayValue(
                                    row[column.key],
                                    column.type,
                                  )}>
                                  {displayValue(row[column.key], column.type)}
                                </span>
                              )}
                              {isEditing &&
                              cellSaveState?.rowKey === currentRowKey &&
                              cellSaveState.field === column.key ? (
                                <span
                                  role="status"
                                  className={`ml-2 text-[10px] font-medium ${cellSaveState.status === "error" ? "text-rose-600" : cellSaveState.status === "saving" || cellSaveState.status === "warning" ? "text-amber-700" : cellSaveState.status === "saved" ? "text-emerald-600" : "text-slate-400"}`}>
                                  {cellSaveState.message}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <footer className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-[#f2f6fa] disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={isLoading || pageCount === 0 || page >= pageCount}
                onClick={() => setPage((value) => value + 1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-[#f2f6fa] disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
