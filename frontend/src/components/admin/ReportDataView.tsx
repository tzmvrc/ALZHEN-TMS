import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Package,
  Search,
  Table2,
  Truck,
  UserRound,
} from "lucide-react";
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
import {
  updateTripAssignmentRecord,
  updateStoreCallRecord,
  updateTripLineItemRecord,
  updateTripRecord,
  updateTripStopRecord,
} from "../../services/trip.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { StatusBadge, TableSkeleton } from "./DashboardPrimitives";

const reportKeys = Object.keys(REPORTS) as ReportKey[];

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
  storeCallId?: string;
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
  onOpenTrip,
}: {
  rows: ReportRow[];
  columns: ReportColumn[];
  reportKey: ReportKey;
  onOpenTrip?: (tripId: string) => void;
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
        const tripId = rowText(row, "trip_id");
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

            {tripId && onOpenTrip && (
              <footer className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                <span className="truncate text-[11px] text-slate-400">
                  {stores.length > 1 ? `${stores.length} stores` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenTrip(tripId)}
                  aria-label={`View trip ${identity}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#ffd43b] px-3.5 py-1.5 text-[11px] font-semibold text-[#0b2341] transition hover:bg-[#f2c200] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40">
                  View trip
                  <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </footer>
            )}
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
  onOpenTrip: _onOpenTrip,
  onReportScopeChange,
}: {
  initialReport?: ReportKey;
  showReportPicker?: boolean;
  onOpenTrip?: (tripId: string) => void;
  onReportScopeChange?: (value: ReportKey) => void;
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
  const [editingCell, setEditingCell] = useState<{
    rowKey: string;
    field: string;
    definition: ReportEditDefinition;
    dropdownField?: DropdownField;
    tripId?: string;
    stopId?: string;
    lineItemId?: string;
    assignmentId?: string;
    storeCallId?: string;
    relationshipId?: string;
    originalRelationshipId?: string;
    relationshipOption?: RelationshipOption;
    value: string;
    originalValue: string;
  } | null>(null);
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [dropdownOptionsError, setDropdownOptionsError] = useState("");
  const [optionManagerOpen, setOptionManagerOpen] = useState(false);
  const [optionManagerField, setOptionManagerField] =
    useState<DropdownField>("trip_status");
  const [newOptionValue, setNewOptionValue] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [optionManagerError, setOptionManagerError] = useState("");
  const [optionManagerBusy, setOptionManagerBusy] = useState(false);
  const [cellSaveState, setCellSaveState] = useState<{
    rowKey: string;
    field: string;
    status: "saving" | "saved" | "error";
    message: string;
  } | null>(null);
  const cellSaveInFlight = useRef(false);
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
    const nextReport = value as ReportKey;
    onReportScopeChange?.(nextReport);
    setPage(1);
    setReportKey(nextReport);
    setColumns([]);
    setRows([]);
    setPagination(null);
    setFilterDraft({});
    setAppliedFilters({});
  }

  function beginEditCell(row: ReportRow, index: number, columnKey: string) {
    const target = getEditableCellTarget(row, columnKey, reportKey);
    if (!target) return;
    const rawCurrentText = String(row[columnKey] ?? "");
    const currentText =
      target.editor === "date"
        ? rawCurrentText.slice(0, 10)
        : target.editor === "datetime"
          ? rawCurrentText.slice(0, 16)
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
      storeCallId: target.storeCallId,
      relationshipId:
        typeof relationshipId === "string" ? relationshipId : undefined,
      originalRelationshipId:
        typeof relationshipId === "string" ? relationshipId : undefined,
      value: currentText,
      originalValue: currentText,
    });
    setCellSaveState(null);
  }

  async function commitEditableCell() {
    if (!editingCell || !accessToken || cellSaveInFlight.current) return;
    const targetCell = { ...editingCell };
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
      if (definition.sourceEntity === "storeCall" && targetCell.storeCallId) {
        await updateStoreCallRecord(accessToken, targetCell.storeCallId, {
          [definition.sourceField]: nextValue,
        });
      } else if (
        definition.sourceEntity === "lineItem" &&
        targetCell.tripId &&
        targetCell.stopId &&
        targetCell.lineItemId
      ) {
        await updateTripLineItemRecord(
          accessToken,
          targetCell.tripId,
          targetCell.stopId,
          targetCell.lineItemId,
          { [definition.sourceField]: nextValue },
        );
      } else if (
        definition.sourceEntity === "stop" &&
        targetCell.tripId &&
        targetCell.stopId
      ) {
        await updateTripStopRecord(
          accessToken,
          targetCell.tripId,
          targetCell.stopId,
          { [definition.sourceField]: nextValue },
        );
      } else if (
        definition.sourceEntity === "assignment" &&
        targetCell.tripId &&
        targetCell.assignmentId
      ) {
        await updateTripAssignmentRecord(
          accessToken,
          targetCell.tripId,
          targetCell.assignmentId,
          { [definition.sourceField]: nextValue },
        );
      } else if (definition.sourceEntity === "trip" && targetCell.tripId) {
        await updateTripRecord(accessToken, targetCell.tripId, {
          [definition.sourceField]: nextValue,
        });
      } else {
        throw new Error("This report row is missing its update record ID.");
      }

      setRows((currentRows) =>
        currentRows.map((row, index) => {
          if (rowKey(row, index) !== targetCell.rowKey) return row;
          if (isRelationship && definition.relationship) {
            const option = targetCell.relationshipOption;
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
              ...(option?.values ?? {}),
            };
          }
          return { ...row, [targetCell.field]: nextValue };
        }),
      );

      setCellSaveState({
        rowKey: targetCell.rowKey,
        field: targetCell.field,
        status: "saved",
        message: "Saved",
      });
      setEditingCell(null);
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
      setEditingCell(null);
    } finally {
      cellSaveInFlight.current = false;
    }
  }

  async function reloadDropdownOptions() {
    if (!accessToken) return;
    const options = await fetchDropdownOptions(accessToken);
    setDropdownOptions(options);
    setDropdownOptionsError("");
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
  const sortableFields = getSortableFields(reportKey);
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

  return (
    <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04),0_10px_30px_-18px_rgba(11,35,65,0.14)]">
      <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
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
        </form>
      </div>

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
              ) : rows.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-slate-500">
                  No report records found.
                </p>
              ) : (
                <ReportVisualCards
                  rows={rows}
                  columns={columns}
                  reportKey={reportKey}
                  onOpenTrip={_onOpenTrip}
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
                    {columns.map((column) => (
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
                        {column.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(columns.length, 1)}
                        className="px-4 py-12 text-center text-sm text-slate-500">
                        No report rows found.
                      </td>
                    </tr>
                  )}
                  {rows.map((row, index) => {
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
                          const isEditable = Boolean(editableTarget);
                          const isEditing =
                            editingCell?.rowKey === currentRowKey &&
                            editingCell.field === column.key;

                          return (
                            <td
                              key={column.key}
                              onClick={() =>
                                beginEditCell(row, index, column.key)
                              }
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
                                    disabled={
                                      cellSaveState?.rowKey === currentRowKey &&
                                      cellSaveState.status === "saving"
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
                                    onSelect={(option) =>
                                      setEditingCell((current) => {
                                        if (!current) return current;
                                        const displayed =
                                          option.values?.[current.field] ??
                                          (current.field === "warehouse_code"
                                            ? (option.values?.warehouse_code ??
                                              option.secondary ??
                                              option.label)
                                            : option.label);
                                        return {
                                          ...current,
                                          value: displayed,
                                          relationshipId: option.id,
                                          relationshipOption: option,
                                        };
                                      })
                                    }
                                    onCommitBlur={() =>
                                      void commitEditableCell()
                                    }
                                    onCancel={() => setEditingCell(null)}
                                  />
                                ) : editingCell.definition.editor ===
                                    "status" ||
                                  editingCell.definition.editor ===
                                    "boolean" ? (
                                  <select
                                    autoFocus
                                    aria-label={`Edit ${column.title}`}
                                    disabled={
                                      cellSaveState?.rowKey === currentRowKey &&
                                      cellSaveState.status === "saving"
                                    }
                                    value={editingCell.value}
                                    onChange={(event) =>
                                      setEditingCell((current) =>
                                        current
                                          ? {
                                              ...current,
                                              value: event.target.value,
                                            }
                                          : current,
                                      )
                                    }
                                    onBlur={() => void commitEditableCell()}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        void commitEditableCell();
                                      }
                                      if (event.key === "Escape") {
                                        setEditingCell(null);
                                      }
                                    }}
                                    className="min-w-[130px] rounded-md border border-[#9cc3e3] bg-white px-2 py-1 text-sm font-medium text-slate-800 shadow-sm outline-none ring-2 ring-[#cfe1f1]">
                                    {editingCell.definition.editor ===
                                    "boolean" ? (
                                      <>
                                        <option value="true">Yes</option>
                                        <option value="false">No</option>
                                      </>
                                    ) : (
                                      <>
                                        {dropdownOptions
                                          .filter(
                                            (option) =>
                                              option.field_key ===
                                                editingCell.definition
                                                  .dropdownField &&
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
                                                editingCell.definition
                                                  .dropdownField &&
                                              option.option_value ===
                                                editingCell.value &&
                                              option.active,
                                          ) && (
                                            <option value={editingCell.value}>
                                              {editingCell.value} (inactive)
                                            </option>
                                          )}
                                      </>
                                    )}
                                  </select>
                                ) : (
                                  <input
                                    autoFocus
                                    type={
                                      editingCell.definition.editor ===
                                      "datetime"
                                        ? "datetime-local"
                                        : editingCell.definition.editor
                                    }
                                    step={
                                      editingCell.definition.editor ===
                                        "number" &&
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
                                    onChange={(event) =>
                                      setEditingCell((current) =>
                                        current
                                          ? {
                                              ...current,
                                              value: event.target.value,
                                            }
                                          : current,
                                      )
                                    }
                                    onBlur={() => void commitEditableCell()}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        void commitEditableCell();
                                      }
                                      if (event.key === "Escape") {
                                        setEditingCell(null);
                                      }
                                    }}
                                    className="min-w-[120px] rounded-md border border-[#9cc3e3] bg-white px-2 py-1 text-sm font-medium text-slate-800 shadow-sm outline-none ring-2 ring-[#cfe1f1]"
                                  />
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
                                      {displayValue(
                                        row[column.key],
                                        column.type,
                                      )}
                                    </span>
                                  )}
                                  {cellSaveState?.rowKey === currentRowKey &&
                                  cellSaveState.field === column.key ? (
                                    <span
                                      className={`text-[10px] font-medium ${cellSaveState.status === "error" ? "text-rose-600" : cellSaveState.status === "saving" ? "text-amber-600" : "text-emerald-600"}`}>
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