import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Package,
  Search,
  SlidersHorizontal,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Table2,
  Truck,
  UserRound,
  X,
  Download,
  Pin,
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
  type ReportFilter,
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
import { REPORT_REALTIME_TABLES, subscribeToTable } from "../../services/realtime.service";
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
import { tableUi } from "./dashboardStyles";
import ReportDropdownEditor, { type ReportDropdownChoice } from "./ReportDropdownEditor";
import type { AdminNotificationTarget } from "../../services/notification.service";
import { StatusBadge, TableSkeleton } from "./DashboardPrimitives";

const reportKeys = Object.keys(REPORTS) as ReportKey[];
type ExportMode = "all-workbook" | "separate-zip" | "current-report";
const BOOLEAN_DROPDOWN_CHOICES: ReportDropdownChoice[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];
const reportPageCache = new Map<string, { columns: ReportColumn[]; rows: ReportRow[]; pagination: Pagination }>();

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
  const visibleColumns = columns.filter((column) =>
    !column.key.startsWith("_") &&
    !["trip_id", "trip_stop_id", "trip_line_item_id"].includes(column.key),
  );
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
  const formatDate = (date: Date) => new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  if (type === "date" && typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const parsed = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : formatDate(parsed);
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : formatDate(date);
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

function getReportRowKey(reportKey: ReportKey, row: ReportRow): string | null {
  if (reportKey === "store-calling") {
    return typeof row.store_call_id === "string" && row.store_call_id
      ? `${reportKey}:store-call:${row.store_call_id}`
      : null;
  }
  const ids = [
    ["trip", row.trip_id],
    ["stop", row.trip_stop_id],
    ["line-item", row.trip_line_item_id],
    ["assignment", row.assignment_id],
    ["billing", row.billing_id],
  ].filter(([, id]) => typeof id === "string" && id) as [string, string][];
  return ids.length ? `${reportKey}:${ids.map(([kind, id]) => `${kind}:${id}`).join(":")}` : null;
}

const reportSelection = (() => {
  let selected = new Set<string>();
  let revision = 0;
  const listeners = new Set<() => void>();
  const keyListeners = new Map<string, Set<() => void>>();
  const notify = (next: Set<string>) => {
    const changed = new Set([...selected, ...next]);
    const changedKeys = [...changed].filter((key) => selected.has(key) !== next.has(key));
    if (!changedKeys.length) return;
    selected = next;
    revision += 1;
    changedKeys.forEach((key) => keyListeners.get(key)?.forEach((listener) => listener()));
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeKey(key: string, listener: () => void) {
      const keySet = keyListeners.get(key) ?? new Set<() => void>();
      keySet.add(listener);
      keyListeners.set(key, keySet);
      return () => {
        keySet.delete(listener);
        if (!keySet.size) keyListeners.delete(key);
      };
    },
    revision: () => revision,
    isSelected: (key: string) => selected.has(key),
    getKeys: (reportKey: ReportKey) => [...selected].filter((key) => key.startsWith(`${reportKey}:`)),
    toggle(key: string) {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      notify(next);
    },
    setVisible(keys: string[], checked: boolean) {
      const next = new Set(selected);
      keys.forEach((key) => checked ? next.add(key) : next.delete(key));
      notify(next);
    },
    clear(reportKey?: ReportKey) {
      if (!reportKey) {
        notify(new Set());
        return;
      }
      const next = new Set(selected);
      [...next].filter((key) => key.startsWith(`${reportKey}:`)).forEach((key) => next.delete(key));
      notify(next);
    },
    selectOnly(reportKey: ReportKey, rowKeys: string[]) {
      const next = new Set([...selected].filter((key) => !key.startsWith(`${reportKey}:`)));
      rowKeys.forEach((key) => next.add(key));
      notify(next);
    },
  };
})();

const ReportRowSelectionCheckbox = memo(function ReportRowSelectionCheckbox({
  rowKey,
  label,
}: {
  rowKey: string | null;
  label: string;
}) {
  const selected = useSyncExternalStore(
    (listener) => rowKey ? reportSelection.subscribeKey(rowKey, listener) : () => undefined,
    () => rowKey ? reportSelection.isSelected(rowKey) : false,
    () => false,
  );
  return (
    <input
      type="checkbox"
      data-report-row-select="true"
      aria-label={`Select row ${label}`}
      checked={selected}
      disabled={!rowKey}
      onClick={(event) => event.stopPropagation()}
      onChange={() => rowKey && reportSelection.toggle(rowKey)}
      className="h-4 w-4 rounded border-slate-300 accent-[#2678b9] focus-visible:ring-2 focus-visible:ring-blue-300" />
  );
});

const ReportSelectAllCheckbox = memo(function ReportSelectAllCheckbox({
  rowKeys,
}: {
  rowKeys: string[];
}) {
  const ref = useRef<HTMLInputElement>(null);
  useSyncExternalStore(reportSelection.subscribe, reportSelection.revision, reportSelection.revision);
  const selectedCount = rowKeys.filter((key) => reportSelection.isSelected(key)).length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectedCount > 0 && selectedCount < rowKeys.length;
  }, [rowKeys.length, selectedCount]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all visible report rows"
      checked={rowKeys.length > 0 && selectedCount === rowKeys.length}
      disabled={rowKeys.length === 0}
      onChange={(event) => reportSelection.setVisible(rowKeys, event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 accent-[#2678b9] focus-visible:ring-2 focus-visible:ring-blue-300" />
  );
});

const ReportSelectionToolbar = memo(function ReportSelectionToolbar({
  reportKey,
  rows,
  columns,
  onEdit,
}: {
  reportKey: ReportKey;
  rows: ReportRow[];
  columns: ReportColumn[];
  onEdit: () => void;
}) {
  useSyncExternalStore(reportSelection.subscribe, reportSelection.revision, reportSelection.revision);
  const keys = reportSelection.getKeys(reportKey);
  if (!keys.length) return null;
  const row = rows.find((candidate) => getReportRowKey(reportKey, candidate) === keys[0]);
  const hasEditableFields = Boolean(row && columns.some((column) => getEditableCellTarget(row, column.key, reportKey)));
  const canEdit = keys.length === 1 && Boolean(row) && hasEditableFields;
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={onEdit}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#b7d5ed] bg-[#edf6fd] px-3.5 text-sm font-semibold text-[#155b8d] transition hover:bg-[#e1f0fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] disabled:cursor-not-allowed disabled:opacity-50">
      Edit {keys.length > 1 ? `(${keys.length})` : "selected row"}
    </button>
  );
});

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

type SavedRowReconciliation = {
  reportKey: ReportKey;
  target: {
    sourceEntity: ReportEditDefinition["sourceEntity"];
    tripId?: string;
    stopId?: string;
    lineItemId?: string;
    assignmentId?: string;
    billingId?: string;
    storeCallId?: string;
  };
  patch: ReportRow;
  version: number;
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

function matchesEditedRecord(
  row: ReportRow,
  target: SavedRowReconciliation["target"],
): boolean {
  switch (target.sourceEntity) {
    case "trip":
      return row.trip_id === target.tripId;
    case "stop":
      return row.trip_stop_id === target.stopId && row.trip_id === target.tripId;
    case "lineItem":
      return row.trip_line_item_id === target.lineItemId &&
        row.trip_stop_id === target.stopId && row.trip_id === target.tripId;
    case "assignment":
      return row.assignment_id === target.assignmentId && row.trip_id === target.tripId;
    case "billing":
      return row.billing_id === target.billingId && row.trip_id === target.tripId;
    case "storeCall":
      return row.store_call_id === target.storeCallId;
  }
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
        const tripId = isStoreCall ? "" : firstValue(group, "trip_id");

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
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusStyle(primaryStatus)}`}>
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${statusDot(primaryStatus)}`}
                  />
                  {primaryStatus.replaceAll("_", " ")}
                </span>
                {tripId && onOpenTrip && (
                  <button
                    type="button"
                    onClick={() => onOpenTrip(tripId)}
                    title="View trip details"
                    aria-label={`View trip details for ${identity}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2f6fa] text-slate-600 transition hover:bg-[#ffd43b] hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40">
                    <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </div>
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
  notificationTarget,
  showReportPicker = true,
  onOpenTrip,
  onReportScopeChange,
  tripScope,
  onTripScopeChange,
  toolbarActions,
}: {
  initialReport?: ReportKey;
  notificationTarget?: AdminNotificationTarget | null;
  showReportPicker?: boolean;
  onOpenTrip?: (tripId: string) => void;
  onReportScopeChange?: (value: ReportKey) => void;
  tripScope?: "dispatches" | "monitoring" | "deliveries";
  onTripScopeChange?: (value: "dispatches" | "monitoring" | "deliveries") => void;
  /** Extra action buttons rendered at the end of the controls row above the table. */
  toolbarActions?: ReactNode;
}) {
  const { accessToken, refreshSession, profile } = useAuth();
  const navigate = useNavigate();
  const [reportKey, setReportKey] = useState<ReportKey>(initialReport);
  const [viewMode, setViewMode] = useState<"visual" | "table">("table");
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [pinnedColumnSides, setPinnedColumnSides] = useState<Record<string, "left" | "right">>({});
  const [leftPinOffsets, setLeftPinOffsets] = useState<Record<string, number>>({});
  const [rightPinOffsets, setRightPinOffsets] = useState<Record<string, number>>({});
  const [pinningNotice, setPinningNotice] = useState("");
  const [editModalFields, setEditModalFields] = useState<{
    column: ReportColumn;
    cell: EditingCell;
  }[]>([]);
  const [editModalRecord, setEditModalRecord] = useState<ReportRow | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalBusy, setEditModalBusy] = useState(false);
  const [editModalError, setEditModalError] = useState("");
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>(
    {},
  );
  const [filtersExpanded, setFiltersExpanded] = useState(false);
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
  const activeDropdownOptionsByField = useMemo(() => {
    const grouped: Partial<Record<DropdownField, DropdownOption[]>> = {};
    for (const option of dropdownOptions) {
      if (!option.active) continue;
      (grouped[option.field_key] ??= []).push(option);
    }
    return grouped;
  }, [dropdownOptions]);
  const dropdownChoicesByField = useMemo(() => {
    const mapped: Partial<Record<DropdownField, ReportDropdownChoice[]>> = {};
    for (const [field, options] of Object.entries(activeDropdownOptionsByField) as [DropdownField, DropdownOption[]][]) {
      mapped[field] = options.map((option) => ({ value: option.option_value, label: option.display_label }));
    }
    return mapped;
  }, [activeDropdownOptionsByField]);
  const dropdownValuesByField = useMemo(() => {
    const grouped: Partial<Record<DropdownField, string[]>> = {};
    for (const option of dropdownOptions) {
      (grouped[option.field_key] ??= []).push(option.option_value);
    }
    return grouped;
  }, [dropdownOptions]);
  const [dropdownOptionsLoading, setDropdownOptionsLoading] = useState(true);
  const [dropdownOptionsError, setDropdownOptionsError] = useState("");
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
  const selectionColumnRef = useRef<HTMLTableCellElement>(null);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const headerCellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const cancelNextBlur = useRef(false);
  const mentionControlActive = useRef(false);
  const sortableFields =
    columns.length > 0
      ? columns.map((column) => column.key)
      : getSortableFields(reportKey);
  const activeSortBy = sortableFields.includes(sortBy)
    ? sortBy
    : getSortableFields(reportKey)[0];
  const notificationSearch = notificationTarget?.reportKey === reportKey
    ? notificationTarget.searchText?.trim() ?? ""
    : "";
  const effectiveSearch = reportKey === "store-calling" && !notificationSearch ? "" : appliedSearch;
  const displayedRows = useMemo(() => {
    const term = reportKey === "store-calling" ? appliedSearch.trim().toLocaleLowerCase() : "";
    if (!term) return rows;
    return rows.filter((row) => columns.some((column) => {
      const values = [row[column.key]];
      if (column.key === "assigned_to") values.push(row.assigned_to_name);
      return values.some((value) => searchableValue(value).toLocaleLowerCase().includes(term));
    }));
  }, [appliedSearch, columns, reportKey, rows]);
  const visibleSelectionKeys = useMemo(
    () => displayedRows.flatMap((row) => {
      const key = getReportRowKey(reportKey, row);
      return key ? [key] : [];
    }),
    [displayedRows, reportKey],
  );
  const leftPinnedColumnKeys = columns
    .filter((column) => pinnedColumnSides[column.key] === "left")
    .map((column) => column.key);
  const rightPinnedColumnKeys = columns
    .filter((column) => pinnedColumnSides[column.key] === "right")
    .map((column) => column.key);
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
  const snapshotKey = JSON.stringify({ accessToken, activeSortBy, appliedFilters, appliedSearch: effectiveSearch, page, reportKey, sortOrder });
  const snapshotKeyRef = useRef(snapshotKey);
  const reportKeyRef = useRef(reportKey);
  const appliedNotificationTarget = useRef<string | null>(null);
  const handledNotificationTarget = useRef<string | null>(null);
  const inFlightReportQueries = useRef(new Map<string, number>());
  const realtimeRefreshDirty = useRef(false);
  const realtimeRefreshQueuedFor = useRef<string | null>(null);
  const realtimeRefreshTimer = useRef<number | null>(null);
  const realtimeRefreshMaxTimer = useRef<number | null>(null);
  const successfulSaveVersion = useRef(0);
  const savedRowReconciliations = useRef<SavedRowReconciliation[]>([]);
  snapshotKeyRef.current = snapshotKey;
  reportKeyRef.current = reportKey;

  useLayoutEffect(() => {
    const measurePinnedColumns = () => {
      let left = selectionColumnRef.current?.getBoundingClientRect().width ?? 44;
      const nextLeftOffsets: Record<string, number> = {};
      for (const key of leftPinnedColumnKeys) {
        nextLeftOffsets[key] = left;
        left += headerCellRefs.current.get(key)?.getBoundingClientRect().width ?? 160;
      }
      let right = 0;
      const nextRightOffsets: Record<string, number> = {};
      for (const key of [...rightPinnedColumnKeys].reverse()) {
        nextRightOffsets[key] = right;
        right += headerCellRefs.current.get(key)?.getBoundingClientRect().width ?? 160;
      }
      setLeftPinOffsets((current) => {
        const currentKeys = Object.keys(current);
        const nextKeys = Object.keys(nextLeftOffsets);
        if (currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === nextLeftOffsets[key])) {
          return current;
        }
        return nextLeftOffsets;
      });
      setRightPinOffsets((current) => {
        const currentKeys = Object.keys(current);
        const nextKeys = Object.keys(nextRightOffsets);
        if (currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === nextRightOffsets[key])) {
          return current;
        }
        return nextRightOffsets;
      });
    };
    measurePinnedColumns();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measurePinnedColumns);
    if (selectionColumnRef.current) observer?.observe(selectionColumnRef.current);
    for (const key of [...leftPinnedColumnKeys, ...rightPinnedColumnKeys]) {
      const cell = headerCellRefs.current.get(key);
      if (cell) observer?.observe(cell);
    }
    window.addEventListener("resize", measurePinnedColumns);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measurePinnedColumns);
    };
  }, [columns, leftPinnedColumnKeys.join("|"), rightPinnedColumnKeys.join("|"), rows]);

  const flushRealtimeRefresh = () => {
    if (realtimeRefreshTimer.current !== null) {
      window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = null;
    }
    if (realtimeRefreshMaxTimer.current !== null) {
      window.clearTimeout(realtimeRefreshMaxTimer.current);
      realtimeRefreshMaxTimer.current = null;
    }
    const targetSnapshot = snapshotKeyRef.current;
    if (
      cellSaveInFlight.current ||
      (inFlightReportQueries.current.get(targetSnapshot) ?? 0) > 0 ||
      realtimeRefreshQueuedFor.current === targetSnapshot
    ) {
      realtimeRefreshDirty.current = true;
      return;
    }
    realtimeRefreshQueuedFor.current = targetSnapshot;
    invalidateApiCache(REPORTS[reportKeyRef.current].endpoint);
    setRetryVersion((version) => version + 1);
  };
  const scheduleRealtimeRefresh = () => {
    if (realtimeRefreshTimer.current !== null) {
      window.clearTimeout(realtimeRefreshTimer.current);
    }
    realtimeRefreshTimer.current = window.setTimeout(flushRealtimeRefresh, 250);
    if (realtimeRefreshMaxTimer.current === null) {
      realtimeRefreshMaxTimer.current = window.setTimeout(flushRealtimeRefresh, 1_000);
    }
  };
  const scheduleRealtimeRefreshRef = useRef(scheduleRealtimeRefresh);
  scheduleRealtimeRefreshRef.current = scheduleRealtimeRefresh;

  useEffect(() => {
    setReportKey(initialReport);
    setViewMode("table");
    setPage(1);
    setSearch("");
    setAppliedSearch("");
    setAppliedFilters({});
    reportSelection.clear();
    setPinnedColumnSides({});
    setEditModalOpen(false);
  }, [initialReport]);

  useEffect(() => {
    reportSelection.clear(reportKey);
    setEditModalOpen(false);
  }, [reportKey, page, appliedSearch, appliedFilters]);

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
    const cached = reportPageCache.get(snapshotKey);
    if (cached) {
      setColumns(cached.columns);
      setRows(cached.rows);
      setPagination(cached.pagination);
      setLoadedQueryKey(queryKey);
    } else {
      setColumns([]);
      setRows([]);
      setPagination(null);
    }

    inFlightReportQueries.current.set(
      snapshotKey,
      (inFlightReportQueries.current.get(snapshotKey) ?? 0) + 1,
    );
    const requestSaveVersion = successfulSaveVersion.current;
    if (realtimeRefreshQueuedFor.current === snapshotKey) {
      realtimeRefreshQueuedFor.current = null;
    }

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
        const applicableReconciliations = savedRowReconciliations.current.filter(
          (reconciliation) =>
            reconciliation.reportKey === reportKey &&
            reconciliation.version > requestSaveVersion,
        );
        const reconciledRows = applicableReconciliations.length
          ? result.rows.map((row) =>
              applicableReconciliations.reduce(
                (nextRow, reconciliation) =>
                  matchesEditedRecord(nextRow, reconciliation.target)
                    ? { ...nextRow, ...reconciliation.patch }
                    : nextRow,
                row,
              ),
            )
          : result.rows;
        setColumns(nextColumns);
        setRows(reconciledRows);
        setPagination(result.pagination);
        reportPageCache.set(snapshotKey, { columns: nextColumns, rows: reconciledRows, pagination: result.pagination });
        savedRowReconciliations.current = savedRowReconciliations.current.filter(
          (reconciliation) =>
            reconciliation.reportKey !== reportKey ||
            reconciliation.version > requestSaveVersion,
        );
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
        const remaining = (inFlightReportQueries.current.get(snapshotKey) ?? 1) - 1;
        if (remaining > 0) inFlightReportQueries.current.set(snapshotKey, remaining);
        else inFlightReportQueries.current.delete(snapshotKey);
        if (active) setLoadedQueryKey(queryKey);
        const latestSnapshot = snapshotKeyRef.current;
        if (
          realtimeRefreshDirty.current &&
          !cellSaveInFlight.current &&
          (inFlightReportQueries.current.get(latestSnapshot) ?? 0) === 0 &&
          realtimeRefreshQueuedFor.current !== latestSnapshot
        ) {
          realtimeRefreshDirty.current = false;
          scheduleRealtimeRefreshRef.current();
        }
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
    snapshotKey,
  ]);

  useEffect(() => {
    if (!accessToken) return;
    const unsubscribers = REPORT_REALTIME_TABLES[reportKey].map((table) =>
      subscribeToTable(
        table,
        scheduleRealtimeRefreshRef.current,
        scheduleRealtimeRefreshRef.current,
      ),
    );
    // Realtime is best effort: refresh when returning to the tab and periodically
    // so a disconnected subscription cannot leave this report stale indefinitely.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRealtimeRefreshRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const recovery = window.setInterval(() => scheduleRealtimeRefreshRef.current(), 60_000);
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(recovery);
      if (realtimeRefreshTimer.current !== null) {
        window.clearTimeout(realtimeRefreshTimer.current);
        realtimeRefreshTimer.current = null;
      }
      if (realtimeRefreshMaxTimer.current !== null) {
        window.clearTimeout(realtimeRefreshMaxTimer.current);
        realtimeRefreshMaxTimer.current = null;
      }
      realtimeRefreshDirty.current = false;
      realtimeRefreshQueuedFor.current = null;
    };
  }, [accessToken, reportKey]);

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
    setAppliedFilters({});
    reportSelection.clear();
    setPinnedColumnSides({});
    setEditModalOpen(false);
  }

  function createEditingCell(row: ReportRow, index: number, columnKey: string): EditingCell | null {
    const target = getEditableCellTarget(row, columnKey, reportKey);
    if (!target) return null;
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
    return {
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
    };
  }

  function beginEditCell(row: ReportRow, index: number, columnKey: string) {
    if (cellSaveInFlight.current) return;
    cancelNextBlur.current = false;
    const nextCell = createEditingCell(row, index, columnKey);
    if (!nextCell) return;
    setMentionOptions([]);
    setEditingCell(nextCell);
    setCellSaveState({
      rowKey: nextCell.rowKey,
      field: columnKey,
      status: "editing",
      message: "Editing",
    });
  }

  function setColumnPinSide(columnKey: string, side: "left" | "right" | null) {
    const next = { ...pinnedColumnSides };
    if (side) next[columnKey] = side;
    else delete next[columnKey];
    const viewportWidth = tableViewportRef.current?.clientWidth ?? window.innerWidth;
    const pinnedWidth = columns.reduce((total, column) => {
      if (!next[column.key]) return total;
      return total + (headerCellRefs.current.get(column.key)?.getBoundingClientRect().width ?? 160);
    }, selectionColumnRef.current?.getBoundingClientRect().width ?? 44);
    if (pinnedWidth > Math.max(180, viewportWidth - 120)) {
      setPinningNotice("Unpin a column to keep room for horizontal scrolling.");
      return;
    }
    setPinningNotice("");
    setPinnedColumnSides(next);
  }

  function openSelectedRowEditor() {
    const keys = reportSelection.getKeys(reportKey);
    if (keys.length !== 1) return;
    const row = displayedRows.find((candidate) => getReportRowKey(reportKey, candidate) === keys[0]);
    if (!row) return;
    const rowIndex = rows.indexOf(row);
    const seen = new Set<string>();
    const fields = columns.flatMap((column) => {
      const cell = createEditingCell(row, rowIndex, column.key);
      if (!cell) return [];
      const identity = [
        cell.definition.sourceEntity,
        cell.tripId,
        cell.stopId,
        cell.lineItemId,
        cell.assignmentId,
        cell.billingId,
        cell.storeCallId,
        cell.definition.sourceField,
      ].join(":");
      if (seen.has(identity)) return [];
      seen.add(identity);
      if (cell.definition.editor === "boolean") {
        cell.value = row[column.key] === true || row[column.key] === "true" ? "true" : "false";
        cell.originalValue = cell.value;
      }
      return [{ column, cell }];
    });
    if (!fields.length) return;
    setEditModalRecord(row);
    setEditModalFields(fields);
    setEditModalError("");
    setEditModalOpen(true);
  }

  function updateModalCell(field: string, updater: (cell: EditingCell) => EditingCell) {
    setEditModalFields((current) => current.map((item) =>
      item.cell.field === field ? { ...item, cell: updater(item.cell) } : item,
    ));
  }

  async function addModalDropdownOption(target: EditingCell, rawValue: string): Promise<boolean> {
    const field = target.definition.dropdownField;
    if (!field || field === "letter_status") return false;
    await createConfigurableOption(field, rawValue);
    return true;
  }


  async function saveSelectedRowEdits() {
    if (editModalBusy) return;
    setEditModalBusy(true);
    setEditModalError("");
    let nextFields = editModalFields;
    try {
      for (let index = 0; index < nextFields.length; index += 1) {
        const item = nextFields[index];
        const cell = item.cell;
        const changed = cell.definition.editor === "relationship"
          ? cell.relationshipId !== cell.originalRelationshipId
          : cell.value.trim() !== cell.originalValue.trim();
        if (!changed) continue;
        const succeeded = await commitEditableCell(cell);
        if (!succeeded) {
          setEditModalFields(nextFields);
          setEditModalError(`Could not save ${item.column.title}. Correct the field and try again. Any earlier fields saved successfully remain saved.`);
          return;
        }
        nextFields = nextFields.map((field, fieldIndex) => fieldIndex === index
          ? {
              ...field,
              cell: {
                ...field.cell,
                originalValue: field.cell.value,
                originalRelationshipId: field.cell.relationshipId,
              },
            }
          : field,
        );
      }
      setEditModalFields(nextFields);
      setEditModalOpen(false);
      reportSelection.clear(reportKey);
    } finally {
      setEditModalBusy(false);
    }
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

  function keepCellEditLocal(candidate: EditingCell) {
    setCellSaveState({
      rowKey: candidate.rowKey,
      field: candidate.field,
      status: "editing",
      message: "Editing",
    });
    setEditingCell(candidate);
  }

  async function commitEditableCell(
    candidate?: EditingCell,
    keepEditing = false,
    verifiedDropdownOption?: DropdownOption,
  ): Promise<boolean> {
    if (cancelNextBlur.current) {
      cancelNextBlur.current = false;
      return false;
    }
    const sourceCell = candidate ?? editingCell;
    if (!sourceCell || !accessToken || cellSaveInFlight.current) return false;
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
      return false;
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
        return false;
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
        return false;
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
        return false;
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
        return false;
      }
      nextValue = textValue === "true";
    } else if (isControlled) {
      const allowed = dropdownOptions.some(
        (option) =>
          option.field_key === definition.dropdownField &&
          option.option_value === textValue &&
          option.active,
      ) || Boolean(
        verifiedDropdownOption?.active &&
        verifiedDropdownOption.field_key === definition.dropdownField &&
        verifiedDropdownOption.option_value === textValue,
      );
      if (!allowed) {
        setCellSaveState({
          rowKey: targetCell.rowKey,
          field: targetCell.field,
          status: "error",
          message: dropdownOptionsError || "Choose an active option.",
        });
        return false;
      }
    }

    if (
      (isRelationship &&
        targetCell.relationshipId === targetCell.originalRelationshipId) ||
      (!isRelationship && textValue === targetCell.originalValue.trim())
    ) {
      setEditingCell(null);
      setCellSaveState(null);
      return true;
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

      let savedRowPatch: ReportRow;
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
        const internalIdKey = internalIdField[definition.relationship.idField];
        const displayText =
          option?.values?.[targetCell.field] ??
          (targetCell.field === "warehouse_code" ? option?.secondary : option?.label) ??
          targetCell.value;
        savedRowPatch = {
          [targetCell.field]: displayText,
          [definition.relationship.idField]: nextValue,
          ...(internalIdKey ? { [internalIdKey]: nextValue } : {}),
          ...(option?.values ?? {}),
          ...(definition.sourceEntity === "stop" && definition.sourceField === "customer_id"
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
      } else {
        const confirmedValue = Object.prototype.hasOwnProperty.call(
          savedRecord,
          definition.sourceField,
        )
          ? savedRecord[definition.sourceField]
          : nextValue;
        savedRowPatch = { [targetCell.field]: confirmedValue };
      }

      const recordTarget: SavedRowReconciliation["target"] = {
        sourceEntity: definition.sourceEntity,
        tripId: targetCell.tripId,
        stopId: targetCell.stopId,
        lineItemId: targetCell.lineItemId,
        assignmentId: targetCell.assignmentId,
        billingId: targetCell.billingId,
        storeCallId: targetCell.storeCallId,
      };
      const saveVersion = ++successfulSaveVersion.current;
      const reconciliation: SavedRowReconciliation = {
        reportKey,
        target: recordTarget,
        patch: savedRowPatch,
        version: saveVersion,
      };
      savedRowReconciliations.current.push(reconciliation);

      setRows((currentRows) =>
        currentRows.map((row) => {
          if (!matchesEditedRecord(row, recordTarget)) return row;
          return { ...row, ...savedRowPatch };
        }),
      );
      for (const [cacheKey, cachedPage] of reportPageCache) {
        try {
          const cachedReportKey = (JSON.parse(cacheKey) as { reportKey?: ReportKey }).reportKey;
          if (cachedReportKey !== reportKey) continue;
          reportPageCache.set(cacheKey, {
            ...cachedPage,
            rows: cachedPage.rows.map((row) =>
              matchesEditedRecord(row, recordTarget)
                ? { ...row, ...savedRowPatch }
                : row,
            ),
          });
        } catch {
          // Ignore cache entries whose keys are not report snapshot JSON.
        }
      }

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
      return true;
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
      return false;
    } finally {
      cellSaveInFlight.current = false;
      const latestSnapshot = snapshotKeyRef.current;
      if (
        realtimeRefreshDirty.current &&
        (inFlightReportQueries.current.get(latestSnapshot) ?? 0) === 0 &&
        realtimeRefreshQueuedFor.current !== latestSnapshot
      ) {
        realtimeRefreshDirty.current = false;
        scheduleRealtimeRefreshRef.current();
      }
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

  async function createConfigurableOption(field: DropdownField, rawLabel: string): Promise<void> {
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");
    const displayLabel = rawLabel.trim();
    const value = displayLabel.toUpperCase();
    if (!displayLabel) throw new Error("Enter a display label.");
    if (!/^[A-Z0-9][A-Z0-9 _-]{0,59}$/.test(value)) {
      throw new Error("Use letters, numbers, spaces, hyphens, or underscores for the stored option value.");
    }
    if (field === "letter_status") throw new Error("Letter status is fixed and cannot accept new options.");
    const duplicate = dropdownOptions.some((option) => option.field_key === field && (
      option.option_value.trim().toLocaleLowerCase() === value.toLocaleLowerCase() ||
      option.display_label.trim().toLocaleLowerCase() === displayLabel.toLocaleLowerCase()
    ));
    if (duplicate) throw new Error("An option with this value or display label already exists.");
    await addDropdownOption(accessToken, {
      field_key: field,
      option_value: value,
      display_label: displayLabel,
      sort_order: dropdownOptions.filter((item) => item.field_key === field).length * 10,
    });
    await reloadDropdownOptions();
  }

  async function addTypedOptionAndSave(target: EditingCell, typedValue = target.value): Promise<boolean> {
    const field = target.definition.dropdownField;
    if (!field || field === "letter_status") return false;
    await createConfigurableOption(field, typedValue);
    return true;
  }

  async function saveDropdownOption(option: DropdownOption, displayLabel: string): Promise<boolean> {
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");
    const normalizedLabel = displayLabel.trim();
    if (!normalizedLabel) throw new Error("Display labels cannot be empty.");
    if (dropdownOptions.some((candidate) => candidate.field_key === option.field_key && candidate.id !== option.id && candidate.display_label.trim().toLocaleLowerCase() === normalizedLabel.toLocaleLowerCase())) {
      throw new Error("An option with this display label already exists.");
    }
    const needsConfirmation = option.usage_count > 0 && normalizedLabel !== option.display_label;
    const confirmInUse = needsConfirmation && window.confirm(
      `This option is used by ${option.usage_count} record(s). Changing its display label keeps the stored value unchanged. Continue?`,
    );
    if (needsConfirmation && !confirmInUse) return false;
    await editDropdownOption(accessToken, option.id, {
      display_label: normalizedLabel,
      ...(confirmInUse ? { confirm_in_use: true } : {}),
    });
    await reloadDropdownOptions();
    return true;
  }

  async function editOptionDisplayLabel(option: DropdownOption, displayLabel: string): Promise<boolean> {
    return saveDropdownOption(option, displayLabel);
  }

  const canManageDropdowns = ["ADMIN", "STAFF"].includes(profile?.role?.toUpperCase() ?? "");
  const reportFilters = getReportFilters(reportKey);
  const hasAppliedFilters = Object.values(appliedFilters).some((value) => value.trim());
  const pageCount = pagination?.totalPages ?? 0;
  const activeError =
    requestError?.key === queryKey
      ? requestError.message
      : !accessToken
        ? "Your session has expired. Please log in again."
        : null;
  const isLoading = Boolean(accessToken) && loadedQueryKey !== queryKey && !reportPageCache.has(snapshotKey);

  useEffect(() => {
    if (!notificationTarget || notificationTarget.reportKey !== reportKey || appliedNotificationTarget.current === notificationTarget.navigationKey) return;
    appliedNotificationTarget.current = notificationTarget.navigationKey;
    setPage(1);
    setAppliedFilters({});
    const searchText = notificationTarget.searchText ?? "";
    setSearch(searchText);
    setAppliedSearch(searchText);
  }, [notificationTarget, reportKey]);

  useEffect(() => {
    const targetSearch = notificationTarget?.searchText?.trim() ?? "";
    const hasActiveFilters = Object.values(appliedFilters).some((value) => value.trim());
    if (!notificationTarget || notificationTarget.reportKey !== reportKey || !accessToken || isLoading || loadedQueryKey !== queryKey || page !== 1 || handledNotificationTarget.current === notificationTarget.navigationKey || appliedSearch.trim() !== targetSearch || hasActiveFilters) return;
    const row = displayedRows.find((candidate) => notificationTarget.referenceType === "store_call"
      ? candidate.store_call_id === notificationTarget.referenceId
      : candidate.trip_id === notificationTarget.referenceId);
    if (!row) return;
    const selectionKey = getReportRowKey(reportKey, row);
    if (!selectionKey) return;
    reportSelection.selectOnly(reportKey, [selectionKey]);
    handledNotificationTarget.current = notificationTarget.navigationKey;
    window.requestAnimationFrame(() => {
      const targetElement = [...document.querySelectorAll<HTMLTableRowElement>("tr[data-report-selection-key]")]
        .find((element) => element.dataset.reportSelectionKey === selectionKey);
      targetElement?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    });
  }, [accessToken, appliedFilters, appliedSearch, displayedRows, isLoading, loadedQueryKey, notificationTarget, page, queryKey, reportKey]);

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
    <div className="space-y-4">
      <div className={`${tableUi.toolbar} flex-wrap`}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {tripScope && onTripScopeChange && (
            <div role="tablist" aria-label="Trip views" className={`${tableUi.segment} max-w-full gap-1 overflow-x-auto`}>
              {([
                ["dispatches", "All trips"],
                ["monitoring", "Dispatch monitoring"],
                ["deliveries", "Deliveries"],
              ] as const).map(([scope, label]) => (
                <button key={scope} type="button" role="tab" aria-selected={tripScope === scope} onClick={() => onTripScopeChange(scope)} className={`${tableUi.segmentBtn} shrink-0 ${tripScope === scope ? tableUi.segmentOn : tableUi.segmentOff}`}>{label}</button>
              ))}
            </div>
          )}
          {showReportPicker ? (
            <label className="sr-only" htmlFor="report-select">
              Select report
            </label>
          ) : (
            <h2 className="sr-only">
              {REPORTS[reportKey].title}
            </h2>
          )}
          {showReportPicker && (
            <div className="relative">
              <select
                id="report-select"
                value={reportKey}
                onChange={(event) => changeReport(event.target.value)}
                className={`${tableUi.select} font-medium text-[#0b2341]`}>
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
          <ReportSelectionToolbar
            reportKey={reportKey}
            rows={displayedRows}
            columns={columns}
            onEdit={openSelectedRowEditor} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <form onSubmit={submitSearch} className="flex min-w-0 w-full gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-64" htmlFor="report-search">
              <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="report-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report" className={tableUi.search} />
            </label>
            <button type="submit" className="h-10 shrink-0 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] transition hover:bg-[#f2c200]">Search</button>
            {reportFilters.length > 0 && (
              <button type="button" aria-label={filtersExpanded ? "Hide filters" : "Show filters"} aria-expanded={filtersExpanded} aria-controls="report-filter-controls" title={filtersExpanded ? "Hide filters" : "Show filters"} onClick={() => setFiltersExpanded((expanded) => !expanded)} className={`${tableUi.iconBtn} relative shrink-0 ${filtersExpanded ? "bg-[#e6f0f9] text-[#0b2341]" : ""}`}>
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                {hasAppliedFilters && <span aria-label={`${Object.values(appliedFilters).filter((value) => value.trim()).length} active filters`} className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#2678b9]" />}
              </button>
            )}
            {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setAppliedSearch(""); setPage(1); }} className={tableUi.iconBtn}><X aria-hidden="true" className="h-4 w-4" /></button>}
          </form>
          <div
            role="group"
            aria-label="Report display mode"
            className={tableUi.segment}>
            <button
              type="button"
              title="Visual view"
              aria-label="Visual view"
              aria-pressed={viewMode === "visual"}
              onClick={() => setViewMode("visual")}
              className={`inline-flex h-8 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${viewMode === "visual" ? tableUi.segmentOn : tableUi.segmentOff}`}>
              <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Table view"
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
              onClick={() => setViewMode("table")}
              className={`inline-flex h-8 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${viewMode === "table" ? tableUi.segmentOn : tableUi.segmentOff}`}>
              <Table2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            title="Export reports"
            aria-label="Export reports"
            onClick={() => { setExportError(""); setExportModalOpen(true); }}
            className={tableUi.iconBtn}>
            <Download aria-hidden="true" className="h-4 w-4" />
          </button>
          {viewMode === "visual" && (
            <>
                    <div className="relative">
            <select
              id="report-sort"
              aria-label="Sort by column"
              value={activeSortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className={`${tableUi.select} max-w-48`}>
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
              className={tableUi.select}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            />
          </div>
            </>
          )}
          {toolbarActions}
        </div>
      </div>
      {reportFilters.length > 0 && (
        <section
          id="report-filter-controls"
          hidden={!filtersExpanded}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            {reportFilters.map((filter: ReportFilter) => (
              <label key={filter.key} className="grid min-w-[150px] flex-1 gap-1.5 text-xs font-medium text-slate-600">
                <span>{filter.label}</span>
                {filter.dropdownField ? (
                  <select
                    aria-label={filter.label}
                    value={appliedFilters[filter.key] ?? ""}
                    onChange={(event) => {
                      setPage(1);
                      setAppliedFilters((current) => ({
                        ...current,
                        [filter.key]: event.target.value,
                      }));
                    }}
                    className={tableUi.select}>
                    <option value="">All</option>
                    {(activeDropdownOptionsByField[filter.dropdownField] ?? []).map((option) => (
                      <option key={option.id} value={option.option_value}>
                        {option.display_label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={filter.type === "date" ? "date" : "search"}
                    aria-label={filter.label}
                    value={appliedFilters[filter.key] ?? ""}
                    onChange={(event) => {
                      setPage(1);
                      setAppliedFilters((current) => ({
                        ...current,
                        [filter.key]: event.target.value,
                      }));
                    }}
                    className={tableUi.search}
                  />
                )}
              </label>
            ))}
            {hasAppliedFilters && (
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  setAppliedFilters({});
                }}
                className="h-10 rounded-full px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-[#0b2341]">
                Clear filters
              </button>
            )}
          </div>
        </section>
      )}

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

      {editModalOpen && editModalRecord && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !editModalBusy) setEditModalOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="report-row-edit-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="border-b border-slate-100 px-5 py-4">
              <h2 id="report-row-edit-title" className="text-lg font-semibold text-[#0b2341]">Edit report row</h2>
              <p className="mt-1 text-sm text-slate-500">{REPORTS[reportKey].title} · {rowText(editModalRecord, "dispatch_number", "trip_number", "store_call_id") || "Selected record"}</p>
            </header>
            <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
              {editModalFields.map(({ column, cell }) => {
                const saving = editModalBusy || cellSaveInFlight.current;
                const fieldKey = cell.definition.dropdownField;
                const choices = cell.definition.editor === "boolean"
                  ? BOOLEAN_DROPDOWN_CHOICES
                  : (fieldKey ? dropdownChoicesByField[fieldKey] : undefined) ?? [];
                return (
                  <label key={`${cell.definition.sourceEntity}:${cell.definition.sourceField}:${cell.field}`} className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
                    <span>{column.title}</span>
                    {cell.definition.editor === "status" || cell.definition.editor === "boolean" ? (
                      <ReportDropdownEditor
                        label={column.title}
                        value={cell.value}
                        displayValue={cell.definition.editor === "boolean" ? cell.value === "true" ? "Yes" : cell.value === "false" ? "No" : "" : choices.find((choice) => choice.value === cell.value)?.label ?? cell.value}
                        options={choices}
                        knownValues={fieldKey ? dropdownValuesByField[fieldKey] : []}
                        managedOptions={fieldKey ? activeDropdownOptionsByField[fieldKey] ?? [] : []}
                        autoOpen={false}
                        loading={cell.definition.editor === "status" && dropdownOptionsLoading}
                        error={cell.definition.editor === "status" ? dropdownOptionsError : undefined}
                        allowAdd={cell.definition.editor === "status" && cell.definition.dropdownField !== "letter_status"}
                        canManageOptions={canManageDropdowns && cell.definition.editor === "status"}
                        disabled={saving}
                        onSelect={(value) => updateModalCell(cell.field, (current) => ({ ...current, value }))}
                        onAdd={(value) => addModalDropdownOption(cell, value)}
                        onEditOption={editOptionDisplayLabel} />
                    ) : cell.definition.editor === "relationship" && cell.definition.relationship ? (
                      <SearchableRelationshipEditor
                        token={accessToken ?? ""}
                        kind={cell.definition.relationship.kind}
                        value={cell.value}
                        autoFocus={false}
                        storeId={typeof editModalRecord[cell.definition.relationship.storeIdField ?? ""] === "string" ? String(editModalRecord[cell.definition.relationship.storeIdField ?? ""]) : undefined}
                        customerId={typeof editModalRecord[cell.definition.relationship.customerIdField ?? ""] === "string" ? String(editModalRecord[cell.definition.relationship.customerIdField ?? ""]) : undefined}
                        disabled={saving}
                        onSelect={(option) => updateModalCell(cell.field, (current) => ({
                          ...current,
                          value: option.values?.[cell.field] ?? (cell.field === "warehouse_code" ? option.values?.warehouse_code ?? option.secondary ?? option.label : option.label),
                          relationshipId: option.id,
                          relationshipOption: option,
                        }))}
                        onCommitBlur={() => undefined}
                        onCancel={() => undefined} />
                    ) : (
                      <input
                        type={cell.definition.editor === "number" ? "number" : cell.definition.editor === "date" ? "date" : cell.definition.editor === "datetime" ? "datetime-local" : "text"}
                        placeholder={!cell.value ? `Enter ${column.title.toLowerCase()}` : undefined}
                        step={cell.definition.editor === "number" && cell.field === "page_no" ? "1" : "any"}
                        disabled={saving}
                        value={cell.value}
                        onChange={(event) => updateModalCell(cell.field, (current) => ({ ...current, value: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#2678b9] focus:ring-2 focus:ring-[#cfe1f1] disabled:opacity-60" />
                    )}
                  </label>
                );
              })}
              {editModalFields.length === 0 && <p className="text-sm text-slate-500">This row has no fields supported by the existing report update APIs.</p>}
            </div>
            {editModalError && <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{editModalError}</p>}
            <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" disabled={editModalBusy} onClick={() => setEditModalOpen(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={editModalBusy || editModalFields.length === 0} onClick={() => void saveSelectedRowEdits()} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200] disabled:opacity-50">{editModalBusy ? "Saving…" : "Save changes"}</button>
            </footer>
          </section>
        </div>
      )}

      <section className={tableUi.shell}>
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
          <style>{`
            .report-data-row:has([data-report-row-select]:checked) { background-color: #eaf4ff; }
            .report-data-row:has([data-report-row-select]:checked) > td { background-color: #eaf4ff; }
            .report-data-row:has([data-report-row-select]:checked):hover,
            .report-data-row:has([data-report-row-select]:checked):hover > td { background-color: #deefff; }
            .report-data-row > td:hover { outline: 1px solid rgba(38, 120, 185, 0.2); outline-offset: -1px; }
          `}</style>
          <div ref={tableViewportRef} className="relative min-h-48 overflow-x-auto">
            {pinningNotice && <p role="status" className="sticky left-2 z-40 w-fit rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 shadow-sm">{pinningNotice}</p>}
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
                  onOpenTrip={onOpenTrip}
                />
              )
            ) : isLoading ? (
              <div className="p-3">
                <TableSkeleton
                  columns={Math.max(columns.length || 5, 5)}
                  rows={6}
                />
              </div>
            ) : displayedRows.length === 0 && (Boolean(appliedSearch.trim()) || hasAppliedFilters) ? (
              <div className="flex min-h-48 w-full items-center justify-center px-4 py-12 text-center text-sm text-slate-500">
                No matching records found.
              </div>
            ) : (
              <table className="w-full min-w-max border-separate border-spacing-0 text-left">
                <thead className={tableUi.thead}>
                  <tr>
                    <th
                      ref={selectionColumnRef}
                      scope="col"
                      className="sticky left-0 z-30 w-11 min-w-11 border-b border-r border-slate-100/70 bg-white px-4 py-3.5">
                      <ReportSelectAllCheckbox rowKeys={visibleSelectionKeys} />
                    </th>
                    {columns.map((column) => {
                      const sortable = sortableFields.includes(column.key);
                      const isActiveSort = activeSortBy === column.key;
                      const pinSide = pinnedColumnSides[column.key];
                      const isPinned = Boolean(pinSide);
                      const isOuterPinnedEdge = pinSide === "left"
                        ? leftPinnedColumnKeys.at(-1) === column.key
                        : pinSide === "right" && rightPinnedColumnKeys[0] === column.key;
                      const SortIcon = !isActiveSort
                        ? ArrowUpDown
                        : sortOrder === "asc"
                          ? ArrowUp
                          : ArrowDown;
                      return (
                      <th
                        key={column.key}
                        ref={(element) => {
                          if (element) headerCellRefs.current.set(column.key, element);
                          else headerCellRefs.current.delete(column.key);
                        }}
                        scope="col"
                        style={isPinned ? { position: "sticky", ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? 44 } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 20 } : undefined}
                        className={`${tableUi.th} border-r border-slate-100/70 last:border-r-0 ${isPinned ? `bg-white ${isOuterPinnedEdge ? pinSide === "left" ? "shadow-[4px_0_8px_-6px_rgba(11,35,65,0.35)]" : "shadow-[-4px_0_8px_-6px_rgba(11,35,65,0.35)]" : ""}` : ""} ${
                          column.type === "number" ||
                          ["quantity", "cbm", "subcon_rate_manual"].includes(
                            column.key,
                          )
                            ? "text-right"
                            : "text-left"
                        }`}>
                        <div className="group/th flex items-center justify-between gap-2">
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
                            className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 uppercase text-inherit transition hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]">
                            {column.title}
                            <SortIcon
                              aria-hidden="true"
                              className={`h-3 w-3 ${isActiveSort ? "text-[#2678b9]" : "text-slate-300"}`}
                            />
                          </button>
                        ) : (
                          column.title
                        )}
                        <button
                          type="button"
                          title={pinSide ? `Unpin ${column.title}` : `Pin ${column.title} to the nearest table edge`}
                          aria-label={pinSide ? `Unpin ${column.title} column` : `Pin ${column.title} to the nearest table edge`}
                          aria-pressed={Boolean(pinSide)}
                          onClick={() => {
                            if (pinSide) {
                              setColumnPinSide(column.key, null);
                              return;
                            }
                            const columnRect = headerCellRefs.current.get(column.key)?.getBoundingClientRect();
                            const viewportRect = tableViewportRef.current?.getBoundingClientRect();
                            if (!columnRect || !viewportRect) return;
                            const columnCenter = (columnRect.left + columnRect.right) / 2;
                            const leftDistance = Math.abs(columnCenter - viewportRect.left);
                            const rightDistance = Math.abs(viewportRect.right - columnCenter);
                            setColumnPinSide(column.key, leftDistance <= rightDistance ? "left" : "right");
                          }}
                          className={`shrink-0 rounded p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${pinSide ? "bg-[#e6f0f9] text-[#2678b9]" : "text-slate-300 opacity-0 hover:text-[#0b2341] focus:opacity-100 group-hover/th:opacity-100"}`}>
                          <Pin aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                        </div>
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(columns.length + 1, 1)}
                        className={tableUi.empty}>
                        {appliedSearch ||
                        Object.values(appliedFilters).some((value) => value.trim())
                          ? "No matching records found."
                          : "No report rows found."}
                      </td>
                    </tr>
                  )}
                  {displayedRows.map((row, index) => {
                    const currentRowKey = rowKey(row, index);
                    const selectionKey = getReportRowKey(reportKey, row);
                    return (
                      <tr
                        key={currentRowKey}
                        data-report-selection-key={selectionKey ?? undefined}
                        className={`group report-data-row ${tableUi.row}`}>
                        <td className="sticky left-0 z-10 w-11 min-w-11 border-r border-slate-100/70 bg-white px-3 py-3.5 shadow-[3px_0_5px_-5px_rgba(11,35,65,0.65)] group-hover:bg-[#f2f6fa]">
                          <ReportRowSelectionCheckbox
                            rowKey={selectionKey}
                            label={rowText(row, "dispatch_number", "trip_number", "store_call_id")} />
                        </td>
                        {columns.map((column) => {
                          const editableTarget = getEditableCellTarget(
                            row,
                            column.key,
                            reportKey,
                          );
                          const dropdownField = editableTarget?.dropdownField;
                          const dropdownChoices = editableTarget?.editor === "boolean"
                            ? BOOLEAN_DROPDOWN_CHOICES
                            : dropdownField
                              ? dropdownChoicesByField[dropdownField] ?? []
                              : [];
                          const isEditable = Boolean(editableTarget);
                          const isRemarksColumn = /remarks|comment|notes/i.test(column.key) || editableTarget?.sourceField === "remarks";
                          const pinSide = pinnedColumnSides[column.key];
                          const isPinned = Boolean(pinSide);
                          const isOuterPinnedEdge = pinSide === "left"
                            ? leftPinnedColumnKeys.at(-1) === column.key
                            : pinSide === "right" && rightPinnedColumnKeys[0] === column.key;
                          const isEditing =
                            editingCell?.rowKey === currentRowKey &&
                            editingCell.field === column.key;

                          return (
                            <td
                              key={column.key}
                              style={isPinned ? { position: "sticky", ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? 44 } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 10 } : undefined}
                              onClick={(event) => {
                                if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
                                if (!isEditing) {
                                  beginEditCell(row, index, column.key);
                                }
                              }}
                              className={`${isRemarksColumn ? "min-w-[14rem] max-w-[30rem] whitespace-pre-wrap break-words align-top" : "max-w-80"} ${tableUi.td} border-r border-slate-100/70 text-slate-700 last:border-r-0 ${isPinned ? `bg-white group-hover:bg-[#f2f6fa] ${isOuterPinnedEdge ? pinSide === "left" ? "shadow-[4px_0_7px_-5px_rgba(11,35,65,0.75)]" : "shadow-[-4px_0_7px_-5px_rgba(11,35,65,0.75)]" : ""}` : ""} ${
                                isEditable
                                  ? "cursor-text outline-none transition hover:bg-[#e6f0f9]/50"
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
                                    }}
                                    onCommitSelection={(option) => {
                                      if (!editingCell) return;
                                      const displayed = option.values?.[editingCell.field] ??
                                        (editingCell.field === "warehouse_code"
                                          ? option.values?.warehouse_code ?? option.secondary ?? option.label
                                          : option.label);
                                      void commitEditableCell({
                                        ...editingCell,
                                        value: displayed,
                                        relationshipId: option.id,
                                        relationshipOption: option,
                                      });
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
                                  <ReportDropdownEditor
                                    label={column.title}
                                    value={editingCell.value}
                                    displayValue={editingCell.definition.editor === "boolean" ? editingCell.value === "true" ? "Yes" : editingCell.value === "false" ? "No" : "" : dropdownChoices.find((choice) => choice.value === editingCell.value)?.label ?? editingCell.value}
                                    options={dropdownChoices}
                                    knownValues={editingCell.definition.dropdownField ? dropdownValuesByField[editingCell.definition.dropdownField] ?? [] : []}
                                    managedOptions={dropdownField ? activeDropdownOptionsByField[dropdownField] ?? [] : []}
                                    loading={editingCell.definition.editor === "status" && dropdownOptionsLoading}
                                    error={editingCell.definition.editor === "status" ? dropdownOptionsError : undefined}
                                    allowAdd={editingCell.definition.editor === "status" && editingCell.definition.dropdownField !== "letter_status"}
                                    canManageOptions={canManageDropdowns && editingCell.definition.editor === "status"}
                                    disabled={cellSaveState?.rowKey === currentRowKey && cellSaveState.status === "saving"}
                                    onSelect={(value) => {
                                      const nextCell = { ...editingCell, value };
                                      setEditingCell(nextCell);
                                    }}
                                    onCommitSelection={(value) => void commitEditableCell({ ...editingCell, value })}
                                    onCommitBlur={() => void commitEditableCell()}
                                    onAdd={(value) => addTypedOptionAndSave(editingCell, value)}
                                    onEditOption={editOptionDisplayLabel}
                                    onClose={() => void commitEditableCell()}
                                  />
                                ) : (
                                  <div className="grid min-w-[150px] gap-1">
                                  {editingCell.definition.sourceField === "remarks" ? (
                                  <textarea
                                    autoFocus
                                    rows={4}
                                    placeholder={!editingCell.value ? `Enter ${column.title.toLowerCase()}` : undefined}
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
                                      keepCellEditLocal(nextCell);
                                    }}
                                    onBlur={() => {
                                      if (!mentionControlActive.current) void commitEditableCell();
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        if (!event.shiftKey) {
                                          event.preventDefault();
                                          void commitEditableCell();
                                        }
                                      }
                                      if (event.key === "Escape") {
                                        cancelNextBlur.current = true;
                                        setEditingCell(null);
                                        setCellSaveState(null);
                                      }
                                    }}
                                    className="w-[min(36rem,70vw)] min-w-[min(24rem,70vw)] max-w-[70vw] resize-y rounded-md border border-[#9cc3e3] bg-white px-2 py-1 text-sm font-medium text-slate-800 shadow-sm outline-none ring-2 ring-[#cfe1f1]"
                                  />
                                  ) : <input
                                    autoFocus
                                    placeholder={!editingCell.value ? `Enter ${column.title.toLowerCase()}` : undefined}
                                    type={editingCell.definition.editor === "number" ? "number" : editingCell.definition.editor === "date" ? "date" : editingCell.definition.editor === "datetime" ? "datetime-local" : "text"}
                                    step={editingCell.definition.editor === "number" && editingCell.field === "page_no" ? "1" : "any"}
                                    aria-label={`Edit ${column.title}`}
                                    disabled={cellSaveState?.rowKey === currentRowKey && cellSaveState.status === "saving"}
                                    value={editingCell.value}
                                    onChange={(event) => keepCellEditLocal({ ...editingCell, value: event.target.value })}
                                    onBlur={() => { if (!mentionControlActive.current) void commitEditableCell(); }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") { event.preventDefault(); void commitEditableCell(); }
                                      if (event.key === "Escape") { cancelNextBlur.current = true; setEditingCell(null); setCellSaveState(null); }
                                    }}
                                    className="min-w-[120px] rounded-md border border-[#9cc3e3] bg-white px-2 py-1 text-sm font-medium text-slate-800 shadow-sm outline-none ring-2 ring-[#cfe1f1]" />}
                                  {(editingCell.tripId || editingCell.storeCallId) && editingCell.definition.sourceField === "remarks" && (
                                    <>
                                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { mentionControlActive.current = true; void loadMentionOptions(); }} className="w-fit rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-[#2678b9] hover:bg-blue-50">@ Mention admin</button>
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
                                          keepCellEditLocal(nextCell);
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
          <footer className={tableUi.footer}>
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
                className={tableUi.pageBtn}>
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={isLoading || pageCount === 0 || page >= pageCount}
                onClick={() => setPage((value) => value + 1)}
                className={tableUi.pageBtn}>
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
