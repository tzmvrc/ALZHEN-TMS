import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  GripVertical,
  EyeOff,
  EllipsisVertical,
  Trash2,
  Bold,
  Palette,
  Paintbrush,
} from "lucide-react";
import type ExcelJS from "exceljs";
import { useAuth } from "../../context/AuthContext";
import FlexibleTableSectionTabs from "./FlexibleTableSectionTabs";
import { ApiError, invalidateApiCache } from "../../services/api.service";
import {
  fetchReportPage,
  fetchReportColumns,
  fetchReportRows,
  getCachedReportPage,
  getStaleReportPage,
  invalidateReportData,
  getReportFilters,
  getSortableFields,
  REPORTS,
  REPORT_PAGE_STALE_TTL_MS,
  setCachedReportPage,
  updateCachedReportPages,
  type Pagination,
  type ReportColumn,
  type ReportFilter,
  type ReportKey,
  type ReportRow,
} from "../../services/report.service";
import type { FlexSectionKey } from "../../services/flexible-table.service";
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
import { REPORT_REALTIME_TABLES, subscribeToAdminRealtime } from "../../services/realtime.service";
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
const FLEX_SECTION_BY_REPORT: Record<ReportKey, FlexSectionKey> = {
  combined: "combined_report",
  "dispatch-monitoring": "dispatch_monitoring",
  dispatch: "dispatch_report",
  "trip-booking": "trip_booking",
  "store-calling": "store_calling",
};
const BOOLEAN_DROPDOWN_CHOICES: ReportDropdownChoice[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];
const REPORT_COLUMN_COLORS = [
  "#fef2f2", "#fecaca", "#f87171", "#b91c1c",
  "#fff7ed", "#fed7aa", "#fb923c", "#c2410c",
  "#fefce8", "#fef08a", "#facc15", "#a16207",
  "#f0fdf4", "#bbf7d0", "#4ade80", "#15803d",
  "#ecfdf5", "#a7f3d0", "#34d399", "#047857",
  "#ecfeff", "#a5f3fc", "#22d3ee", "#0e7490",
  "#eff6ff", "#bfdbfe", "#60a5fa", "#1d4ed8",
  "#eef2ff", "#c7d2fe", "#818cf8", "#4338ca",
  "#faf5ff", "#e9d5ff", "#c084fc", "#7e22ce",
  "#fdf2f8", "#fbcfe8", "#f472b6", "#be185d",
  "#f8fafc", "#cbd5e1", "#64748b", "#1e293b",
];

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
  const name = REPORTS[reportKey].title.replace(/[:\\/?*\x5B\x5D]/g, " ").slice(0, 31);
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

function reportEditDiagnostic(event: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    // info is visible with the browser console's standard Info level; debug
    // messages may be hidden when Verbose logging is filtered out.
    console.info(`[report-edit-diagnostic] ${event}`, details);
  }
}

function diagnosticCellValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "string") return `[${typeof value} redacted]`;
  if (["delivery_status", "trip_status", "letter_status", "status", "confirmation_status"].includes(field)) {
    return value.slice(0, 80);
  }
  return `[text redacted; ${value.length} characters]`;
}

function summarizeReportEditRow(row: ReportRow, reportKey: ReportKey, field: string) {
  return {
    trip_id: row.trip_id ?? null,
    trip_stop_id: row.trip_stop_id ?? null,
    _trip_stop_id: row._trip_stop_id ?? null,
    trip_line_item_id: row.trip_line_item_id ?? null,
    identity: getReportRowKey(reportKey, row),
    editedField: field,
    currentValue: diagnosticCellValue(field, row[field]),
  };
}

function reportEditEndpoint(target: EditableCellTarget): string {
  switch (target.sourceEntity) {
    case "stop":
      return `/trips/${encodeURIComponent(target.tripId ?? "")}/stops/${encodeURIComponent(target.stopId ?? "")}`;
    case "lineItem":
      return `/trips/${encodeURIComponent(target.tripId ?? "")}/stops/${encodeURIComponent(target.stopId ?? "")}/line-items/${encodeURIComponent(target.lineItemId ?? "")}`;
    case "assignment":
      return `/trips/${encodeURIComponent(target.tripId ?? "")}/assignments/${encodeURIComponent(target.assignmentId ?? "")}`;
    case "billing":
      return `/trips/${encodeURIComponent(target.tripId ?? "")}/billings/${encodeURIComponent(target.billingId ?? "")}`;
    case "trip":
      return `/trips/${encodeURIComponent(target.tripId ?? "")}`;
    case "storeCall":
      return `/store-calls/${encodeURIComponent(target.storeCallId ?? "")}`;
  }
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

type ReportColumnLayout = { order: string[]; hidden: string[]; colors?: Record<string, string> };
type FillGesture = {
  sourceRowKey: string;
  sourceField: string;
  sourceValue: string;
  targetRowKey: string;
  targetField: string;
  baseline: Map<string, unknown>;
};
type ReportCellFormat = { bold?: boolean; color?: string; backgroundColor?: string };
type CellSelection = { anchorRowKey: string; anchorField: string; focusRowKey: string; focusField: string };
type DropdownOptionDraft = DropdownOption & { draftKey: string; originalLabel: string; isNew: boolean; removePending: boolean };

function readReportColumnLayout(storageKey: string): ReportColumnLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<ReportColumnLayout> | null;
    return {
      order: Array.isArray(parsed?.order) ? parsed.order.filter((key): key is string => typeof key === "string") : [],
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter((key): key is string => typeof key === "string") : [],
      colors: parsed?.colors && typeof parsed.colors === "object"
        ? Object.fromEntries(Object.entries(parsed.colors).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^#[0-9a-f]{6}$/i.test(entry[1])))
        : {},
    };
  } catch {
    return { order: [], hidden: [] };
  }
}

function readCellFormats(storageKey: string): Record<string, ReportCellFormat> {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const color = typeof item.color === "string" && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : undefined;
      const backgroundColor = typeof item.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(item.backgroundColor) ? item.backgroundColor : undefined;
      return [[key, { bold: item.bold === true, color, backgroundColor } satisfies ReportCellFormat]];
    }));
  } catch {
    return {};
  }
}

function columnForeground(color?: string): string | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.55 ? "#ffffff" : "#172b43";
}

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
    const tripId = rowText(row, "_trip_id", "trip_id");
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
        const tripId = firstValue(group, "_trip_id", "trip_id");

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
  pageTitle,
  pageSubtitle,
  onOpenTrip,
  onReportScopeChange,
  toolbarActions,
}: {
  initialReport?: ReportKey;
  notificationTarget?: AdminNotificationTarget | null;
  showReportPicker?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
  onOpenTrip?: (tripId: string) => void;
  onReportScopeChange?: (value: ReportKey) => void;
  /** Extra action buttons rendered at the end of the controls row above the table. */
  toolbarActions?: ReactNode;
}) {
  const { accessToken, refreshSession, profile } = useAuth();
  const navigate = useNavigate();
  const [reportKey, setReportKey] = useState<ReportKey>(initialReport);
  useEffect(() => {
    reportEditDiagnostic("ReportDataView mounted", {
      mode: import.meta.env.MODE,
      development: import.meta.env.DEV,
    });
  }, []);
  const [viewMode, setViewMode] = useState<"visual" | "table">("table");
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const columnLayoutStorageKey = `alzhen:report-column-layout:${profile?.id ?? "user"}:${reportKey}`;
  const [columnLayout, setColumnLayout] = useState<ReportColumnLayout>(() =>
    typeof window === "undefined" ? { order: [], hidden: [] } : readReportColumnLayout(`alzhen:report-column-layout:${profile?.id ?? "user"}:${initialReport}`),
  );
  const cellFormatStorageKey = `alzhen:report-cell-format:${profile?.id ?? "user"}:${reportKey}`;
  const [cellFormats, setCellFormats] = useState<Record<string, ReportCellFormat>>(() =>
    typeof window === "undefined" ? {} : readCellFormats(`alzhen:report-cell-format:${profile?.id ?? "user"}:${initialReport}`),
  );
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(null);
  const [openColorPicker, setOpenColorPicker] = useState<"text" | "background" | null>(null);
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [fillGesture, setFillGesture] = useState<FillGesture | null>(null);
  const fillGestureRef = useRef<FillGesture | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [pinnedColumnSides, setPinnedColumnSides] = useState<Record<string, "left" | "right">>({});
  const [leftPinOffsets, setLeftPinOffsets] = useState<Record<string, number>>({});
  const [rightPinOffsets, setRightPinOffsets] = useState<Record<string, number>>({});
  const [pinningNotice, setPinningNotice] = useState("");
  const [openColumnMenu, setOpenColumnMenu] = useState<{ key: string; left: number; top: number } | null>(null);
  const [editingColumnColor, setEditingColumnColor] = useState<string | null>(null);
  const [managingDropdownField, setManagingDropdownField] = useState<DropdownField | null>(null);
  const [newDropdownLabel, setNewDropdownLabel] = useState("");
  const [dropdownOptionDrafts, setDropdownOptionDrafts] = useState<DropdownOptionDraft[]>([]);
  const [dropdownManagerError, setDropdownManagerError] = useState("");
  const [dropdownManagerNotice, setDropdownManagerNotice] = useState("");
  const [dropdownManagerBusy, setDropdownManagerBusy] = useState(false);
  useEffect(() => {
    if (!openColumnMenu && !editingColumnColor && !managingDropdownField) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenColumnMenu(null);
      setEditingColumnColor(null);
      if (!dropdownManagerBusy && managingDropdownField && dropdownOptionDrafts.some((option) => option.isNew || option.display_label.trim() !== option.originalLabel) && !window.confirm("Discard the unsaved dropdown-option changes?")) return;
      if (!dropdownManagerBusy) setManagingDropdownField(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dropdownManagerBusy, dropdownOptionDrafts, editingColumnColor, managingDropdownField, openColumnMenu]);
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
  const displayedRowsRef = useRef<ReportRow[]>(displayedRows);
  displayedRowsRef.current = displayedRows;
  const layoutColumnKeys = useMemo(() => {
    const availableKeys = new Set(columns.map((column) => column.key));
    const orderedKeys = [
      ...columnLayout.order.filter((key) => availableKeys.has(key)),
      ...columns.map((column) => column.key).filter((key) => !columnLayout.order.includes(key)),
    ];
    return orderedKeys;
  }, [columnLayout.order, columns]);
  const hiddenColumnKeys = useMemo(
    () => new Set(columnLayout.hidden.filter((key) => columns.some((column) => column.key === key))),
    [columnLayout.hidden, columns],
  );
  const gridColumns = useMemo(
    () => layoutColumnKeys.filter((key) => !hiddenColumnKeys.has(key)).flatMap((key) => {
      const column = columns.find((item) => item.key === key);
      return column ? [column] : [];
    }),
    [columns, hiddenColumnKeys, layoutColumnKeys],
  );
  const hiddenColumns = useMemo(
    () => layoutColumnKeys.filter((key) => hiddenColumnKeys.has(key)).flatMap((key) => {
      const column = columns.find((item) => item.key === key);
      return column ? [column] : [];
    }),
    [columns, hiddenColumnKeys, layoutColumnKeys],
  );
  const visibleSelectionKeys = useMemo(
    () => displayedRows.flatMap((row) => {
      const key = getReportRowKey(reportKey, row);
      return key ? [key] : [];
    }),
    [displayedRows, reportKey],
  );
  const leftPinnedColumnKeys = useMemo(
    () => gridColumns.filter((column) => pinnedColumnSides[column.key] === "left").map((column) => column.key),
    [gridColumns, pinnedColumnSides],
  );
  const rightPinnedColumnKeys = useMemo(
    () => gridColumns.filter((column) => pinnedColumnSides[column.key] === "right").map((column) => column.key),
    [gridColumns, pinnedColumnSides],
  );
  // A sticky table cell left in the middle of the table is still constrained
  // by that in-flow table position; right insets do not create a separate edge
  // band. Render pinned columns at the physical edges so their sticky ranges,
  // stacking, and measured offsets agree with the visible grid order.
  const renderedGridColumns = useMemo(() => {
    const columnByKey = new Map(gridColumns.map((column) => [column.key, column]));
    const left = leftPinnedColumnKeys.flatMap((key) => {
      const column = columnByKey.get(key);
      return column ? [column] : [];
    });
    const right = rightPinnedColumnKeys.flatMap((key) => {
      const column = columnByKey.get(key);
      return column ? [column] : [];
    });
    const pinnedKeys = new Set([...leftPinnedColumnKeys, ...rightPinnedColumnKeys]);
    return [...left, ...gridColumns.filter((column) => !pinnedKeys.has(column.key)), ...right];
  }, [gridColumns, leftPinnedColumnKeys, rightPinnedColumnKeys]);
  const selectedFormatCellKeys = useMemo(() => {
    if (!cellSelection) return new Set<string>();
    const rowStart = displayedRows.findIndex((row) => getReportRowKey(reportKey, row) === cellSelection.anchorRowKey);
    const rowEnd = displayedRows.findIndex((row) => getReportRowKey(reportKey, row) === cellSelection.focusRowKey);
    const columnStart = renderedGridColumns.findIndex((column) => column.key === cellSelection.anchorField);
    const columnEnd = renderedGridColumns.findIndex((column) => column.key === cellSelection.focusField);
    if ([rowStart, rowEnd, columnStart, columnEnd].some((index) => index < 0)) return new Set<string>();
    const selected = new Set<string>();
    for (let rowIndex = Math.min(rowStart, rowEnd); rowIndex <= Math.max(rowStart, rowEnd); rowIndex += 1) {
      const rowKey = getReportRowKey(reportKey, displayedRows[rowIndex]);
      if (!rowKey) continue;
      for (let columnIndex = Math.min(columnStart, columnEnd); columnIndex <= Math.max(columnStart, columnEnd); columnIndex += 1) {
        selected.add(`${rowKey}\u0000${renderedGridColumns[columnIndex].key}`);
      }
    }
    return selected;
  }, [cellSelection, displayedRows, renderedGridColumns, reportKey]);
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
  const pageOptions = useMemo(() => ({
    page,
    limit: 50,
    search: effectiveSearch,
    sortBy: activeSortBy,
    sortOrder,
    filters: appliedFilters,
  }), [activeSortBy, appliedFilters, effectiveSearch, page, sortOrder]);
  const snapshotKeyRef = useRef(snapshotKey);
  const loadedSnapshotKeyRef = useRef<string | null>(null);
  const reportKeyRef = useRef(reportKey);
  const appliedNotificationTarget = useRef<string | null>(null);
  const handledNotificationTarget = useRef<string | null>(null);
  const inFlightReportQueries = useRef(new Map<string, number>());
  const realtimeRefreshDirty = useRef(false);
  const realtimeRefreshQueuedFor = useRef<string | null>(null);
  const realtimeRefreshTimer = useRef<number | null>(null);
  const realtimeRefreshMaxTimer = useRef<number | null>(null);
  const diagnosticEditTarget = useRef<{ reportKey: ReportKey; tripId?: string; stopId?: string; field: string } | null>(null);
  const successfulSaveVersion = useRef(0);
  const savedRowReconciliations = useRef<SavedRowReconciliation[]>([]);
  snapshotKeyRef.current = snapshotKey;
  reportKeyRef.current = reportKey;

  useEffect(() => {
    setColumnLayout(readReportColumnLayout(columnLayoutStorageKey));
  }, [columnLayoutStorageKey]);

  useEffect(() => {
    setCellFormats(readCellFormats(cellFormatStorageKey));
    setCellSelection(null);
    setOpenColorPicker(null);
  }, [cellFormatStorageKey]);

  useLayoutEffect(() => {
    const measurePinnedColumns = () => {
      const viewportWidth = tableViewportRef.current?.clientWidth ?? window.innerWidth;
      const selectionWidth = selectionColumnRef.current?.getBoundingClientRect().width ?? 44;
      let pinnedWidth = selectionWidth + [...leftPinnedColumnKeys, ...rightPinnedColumnKeys].reduce(
        (total, key) => total + (headerCellRefs.current.get(key)?.getBoundingClientRect().width ?? 160),
        0,
      );
      if (pinnedWidth > Math.max(180, viewportWidth - 120)) {
        const adjustedSides = { ...pinnedColumnSides };
        const candidates = [...rightPinnedColumnKeys, ...leftPinnedColumnKeys.slice().reverse()];
        for (const key of candidates) {
          if (pinnedWidth <= Math.max(180, viewportWidth - 120)) break;
          if (!adjustedSides[key]) continue;
          pinnedWidth -= headerCellRefs.current.get(key)?.getBoundingClientRect().width ?? 160;
          delete adjustedSides[key];
        }
        if (Object.keys(adjustedSides).length !== Object.keys(pinnedColumnSides).length) {
          setPinnedColumnSides(adjustedSides);
          setPinningNotice("Some pinned columns were unpinned to keep both sides clear at this viewport width.");
          return;
        }
      }
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
    if (tableViewportRef.current) observer?.observe(tableViewportRef.current);
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
  }, [gridColumns, leftPinnedColumnKeys, pinnedColumnSides, rightPinnedColumnKeys, rows]);

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
    invalidateReportData(reportKeyRef.current);
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
    setColumnLayout(readReportColumnLayout(`alzhen:report-column-layout:${profile?.id ?? "user"}:${initialReport}`));
    setViewMode("table");
    setPage(1);
    setSearch("");
    setAppliedSearch("");
    setAppliedFilters({});
    reportSelection.clear();
    setPinnedColumnSides({});
    setEditModalOpen(false);
  }, [initialReport, profile?.id]);

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

  useLayoutEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;
    const cached = getCachedReportPage(reportKey, accessToken, pageOptions);
    const displayCache = cached ?? getStaleReportPage(reportKey, accessToken, pageOptions);
    let staleCacheTimer: number | null = null;
    if (displayCache) {
      setColumns(displayCache.columns);
      setRows(displayCache.rows);
      setPagination(displayCache.pagination);
      setLoadedQueryKey(queryKey);
      loadedSnapshotKeyRef.current = snapshotKey;
      if (!cached) {
        staleCacheTimer = window.setTimeout(() => {
          if (!active) return;
          setColumns([]);
          setRows([]);
          setPagination(null);
          setRequestError({ key: queryKey, message: "Cached report data expired. Retry to load current records." });
        }, REPORT_PAGE_STALE_TTL_MS);
      }
    } else if (loadedSnapshotKeyRef.current === snapshotKey) {
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
        const result = await fetchReportPage(reportKey, accessToken, pageOptions, !cached && Boolean(displayCache));
        reportEditDiagnostic("report fetch completed", {
          reportEndpoint: REPORTS[reportKey].endpoint,
          reportKey,
          page: pageOptions.page,
          limit: pageOptions.limit,
          rowCount: result.rows.length,
          source: cached ? "fresh page cache" : displayCache ? "request refresh" : "request",
          viewIsActive: active,
        });
        if (!active) return;
        const diagnosticTarget = diagnosticEditTarget.current;
        if (import.meta.env.DEV && diagnosticTarget?.reportKey === reportKey && diagnosticTarget.tripId) {
          const matchingTripRows = result.rows.filter((row) => row.trip_id === diagnosticTarget.tripId);
          const diagnosticRows = [
            ...matchingTripRows.filter((row) => row.trip_stop_id === diagnosticTarget.stopId),
            ...matchingTripRows.filter((row) => row.trip_stop_id !== diagnosticTarget.stopId),
          ].slice(0, 2);
          reportEditDiagnostic("report rows returned to the grid", {
            reportEndpoint: REPORTS[reportKey].endpoint,
            reportKey,
            query: {
              page: pageOptions.page,
              limit: pageOptions.limit,
              sortBy: pageOptions.sortBy,
              sortOrder: pageOptions.sortOrder,
              hasSearch: Boolean(pageOptions.search),
              activeFilterKeys: Object.keys(pageOptions.filters).filter((key) => Boolean(pageOptions.filters[key]?.trim())),
            },
            source: cached ? "fresh page cache" : displayCache ? "request refresh" : "request",
            editedField: diagnosticTarget.field,
            rows: diagnosticRows.map((row) => summarizeReportEditRow(row, reportKey, diagnosticTarget.field)),
          });
        }
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
        setRequestError((current) => current?.key === queryKey ? null : current);
        setColumns(result.columns);
        setRows(reconciledRows);
        setPagination(result.pagination);
        setCachedReportPage(reportKey, accessToken, pageOptions, {
          columns: result.columns,
          rows: reconciledRows,
          pagination: result.pagination,
        });
        if (staleCacheTimer !== null) window.clearTimeout(staleCacheTimer);
        loadedSnapshotKeyRef.current = snapshotKey;
        savedRowReconciliations.current = savedRowReconciliations.current.filter(
          (reconciliation) =>
            reconciliation.reportKey !== reportKey ||
            reconciliation.version > requestSaveVersion,
        );
      } catch (cause) {
        reportEditDiagnostic("report fetch failed", {
          reportEndpoint: REPORTS[reportKey].endpoint,
          reportKey,
          page: pageOptions.page,
          errorType: cause instanceof ApiError ? "api" : cause instanceof Error ? cause.name : "unknown",
          status: cause instanceof ApiError ? cause.status : undefined,
        });
        if (!active) return;
        if (staleCacheTimer !== null) window.clearTimeout(staleCacheTimer);
        if (cause instanceof ApiError && cause.status === 401) {
          await refreshSession();
          return;
        }
        if (!cached && displayCache) {
          setColumns([]);
          setRows([]);
          setPagination(null);
        }
        if (!displayCache || !cached) setRequestError({
          key: queryKey,
          message:
            cause instanceof ApiError && cause.status === 403
              ? "You are not authorized to view this report."
              : cause instanceof Error
                ? cause.message
                : "Unable to load this report.",
        });
      } finally {
        if (staleCacheTimer !== null) window.clearTimeout(staleCacheTimer);
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
      if (staleCacheTimer !== null) window.clearTimeout(staleCacheTimer);
    };
  }, [
    accessToken,
    effectiveSearch,
    navigate,
    page,
    pageOptions,
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
    const reportTables = REPORT_REALTIME_TABLES[reportKey];
    const unsubscribe = subscribeToAdminRealtime((event) => {
      if (event.kind === "resume") {
        scheduleRealtimeRefreshRef.current();
      } else if (event.kind === "recovered") {
        if (reportTables.includes(event.table)) scheduleRealtimeRefreshRef.current();
      } else if (reportTables.includes(event.payload.table)) {
        const diagnosticTarget = diagnosticEditTarget.current;
        if (import.meta.env.DEV && diagnosticTarget?.reportKey === reportKey) {
          const payload = event.payload;
          const nextRow = payload.new ?? {};
          const oldRow = payload.old ?? {};
          const tripId = payload.table === "trips"
            ? nextRow.id ?? oldRow.id
            : nextRow.trip_id ?? oldRow.trip_id;
          const stopId = payload.table === "trip_stops"
            ? nextRow.id ?? oldRow.id
            : nextRow.trip_stop_id ?? oldRow.trip_stop_id;
          const relevantToEdit = (diagnosticTarget.tripId && tripId === diagnosticTarget.tripId)
            || (diagnosticTarget.stopId && stopId === diagnosticTarget.stopId);
          if (relevantToEdit) {
            reportEditDiagnostic("realtime event and report refresh", {
              table: payload.table,
              eventType: payload.eventType,
              trip_id: tripId ?? null,
              trip_stop_id: stopId ?? null,
              editedField: diagnosticTarget.field,
              eventValue: diagnosticCellValue(diagnosticTarget.field, nextRow[diagnosticTarget.field] ?? oldRow[diagnosticTarget.field]),
              effect: "shared realtime handler invalidates affected report cache; this view queues an active report refresh",
            });
          }
        }
        scheduleRealtimeRefreshRef.current();
      }
    });
    // Keep an active report reconciled if Postgres Changes are unavailable or
    // an event was missed. The shared channels themselves live for the session.
    const recovery = window.setInterval(() => scheduleRealtimeRefreshRef.current(), 60_000);
    return () => {
      unsubscribe();
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
    setColumnLayout(readReportColumnLayout(`alzhen:report-column-layout:${profile?.id ?? "user"}:${nextReport}`));
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
    diagnosticEditTarget.current = {
      reportKey,
      tripId: nextCell.tripId,
      stopId: nextCell.stopId,
      field: columnKey,
    };
    if (import.meta.env.DEV) {
      const sameTripRows = typeof nextCell.tripId === "string"
        ? displayedRowsRef.current.filter((candidate) => candidate.trip_id === nextCell.tripId)
        : [row];
      const diagnosticRows = [row, ...sameTripRows.filter((candidate) => candidate !== row)].slice(0, 2);
      reportEditDiagnostic("cell selected for editing", {
        reportEndpoint: REPORTS[reportKey].endpoint,
        reportKey,
        query: {
          page: pageOptions.page,
          limit: pageOptions.limit,
          sortBy: pageOptions.sortBy,
          sortOrder: pageOptions.sortOrder,
          hasSearch: Boolean(pageOptions.search),
          activeFilterKeys: Object.keys(pageOptions.filters).filter((key) => Boolean(pageOptions.filters[key]?.trim())),
        },
        selected: summarizeReportEditRow(row, reportKey, columnKey),
        canonicalIdentity: getReportRowKey(reportKey, row),
        editableTarget: {
          sourceEntity: nextCell.definition.sourceEntity,
          recordIdField: nextCell.definition.recordIdField,
          sourceField: nextCell.definition.sourceField,
          tripId: nextCell.tripId ?? null,
          stopId: nextCell.stopId ?? null,
          lineItemId: nextCell.lineItemId ?? null,
        },
        rowsWithSameTripId: diagnosticRows.map((candidate) => summarizeReportEditRow(candidate, reportKey, columnKey)),
      });
    }
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
    const pinnedWidth = gridColumns.reduce((total, column) => {
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

  function toggleColumnPinAutomatically(columnKey: string) {
    if (pinnedColumnSides[columnKey]) {
      setColumnPinSide(columnKey, null);
      return;
    }
    const columnRect = headerCellRefs.current.get(columnKey)?.getBoundingClientRect();
    const viewportRect = tableViewportRef.current?.getBoundingClientRect();
    if (!columnRect || !viewportRect) return;
    const center = (columnRect.left + columnRect.right) / 2;
    setColumnPinSide(columnKey, Math.abs(center - viewportRect.left) <= Math.abs(viewportRect.right - center) ? "left" : "right");
  }

  function saveColumnLayout(next: ReportColumnLayout) {
    setColumnLayout(next);
    try {
      localStorage.setItem(columnLayoutStorageKey, JSON.stringify(next));
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }

  function setReportColumnColor(columnKey: string, color: string | null) {
    const colors = { ...(columnLayout.colors ?? {}) };
    if (color) colors[columnKey] = color;
    else delete colors[columnKey];
    saveColumnLayout({ ...columnLayout, order: layoutColumnKeys, colors });
  }

  function showColumnMenu(event: MouseEvent<HTMLButtonElement>, columnKey: string) {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 232;
    const menuHeight = 336;
    setOpenColumnMenu({
      key: columnKey,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      top: rect.bottom + menuHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - menuHeight)
        : rect.bottom + 4,
    });
  }

  function openDropdownManager(field: DropdownField) {
    setDropdownOptionDrafts(dropdownOptions.filter((option) => option.field_key === field).map((option) => ({
      ...option,
      draftKey: option.id,
      originalLabel: option.display_label,
      isNew: false,
      removePending: false,
    })));
    setManagingDropdownField(field);
    setDropdownManagerError("");
    setDropdownManagerNotice("");
    setNewDropdownLabel("");
    setOpenColumnMenu(null);
  }

  function hasDropdownDraftChanges() {
    return dropdownOptionDrafts.some((option) => option.isNew || option.display_label.trim() !== option.originalLabel);
  }

  function closeDropdownManager() {
    if (dropdownManagerBusy) return;
    if (hasDropdownDraftChanges() && !window.confirm("Discard the unsaved dropdown-option changes?")) return;
    setManagingDropdownField(null);
  }

  function stageDropdownOption() {
    if (!managingDropdownField) return;
    setDropdownManagerError("");
    const label = newDropdownLabel.trim();
    const value = label.toUpperCase();
    if (!label) return setDropdownManagerError("Enter an option label.");
    if (label.length > 80) return setDropdownManagerError("Option labels can contain at most 80 characters.");
    if (managingDropdownField === "letter_status") return setDropdownManagerError("Letter status values are fixed by the system.");
    if (!/^[A-Z0-9][A-Z0-9 _-]{0,59}$/.test(value)) return setDropdownManagerError("Use letters, numbers, spaces, hyphens, or underscores.");
    const duplicate = dropdownOptionDrafts.some((option) => !option.removePending && (
      option.option_value.toLocaleLowerCase() === value.toLocaleLowerCase() ||
      option.display_label.trim().toLocaleLowerCase() === label.toLocaleLowerCase()
    ));
    if (duplicate) return setDropdownManagerError("An option with this value or label already exists.");
    setDropdownOptionDrafts((current) => [...current, {
      id: `draft:${crypto.randomUUID()}`,
      draftKey: crypto.randomUUID(),
      field_key: managingDropdownField,
      option_value: value,
      display_label: label,
      sort_order: current.length * 10,
      active: true,
      is_system: false,
      usage_count: 0,
      originalLabel: label,
      isNew: true,
      removePending: false,
    }]);
    setNewDropdownLabel("");
  }

  function removeDropdownDraft(draft: DropdownOptionDraft) {
    if (!draft.isNew) return;
    setDropdownOptionDrafts((current) => current.filter((option) => option.draftKey !== draft.draftKey));
  }

  async function saveDropdownOptionChanges() {
    if (!accessToken || !managingDropdownField) {
      setDropdownManagerError("Your session has expired. Please log in again.");
      return;
    }
    setDropdownManagerError("");
    setDropdownManagerNotice("");
    const pending = dropdownOptionDrafts.filter((option) => option.isNew || option.display_label.trim() !== option.originalLabel);
    if (pending.some((option) => !option.display_label.trim())) {
      setDropdownManagerError("Option labels cannot be empty.");
      return;
    }
    const duplicateLabels = new Set<string>();
    const duplicateValues = new Set<string>();
    for (const option of dropdownOptionDrafts.filter((item) => !item.removePending)) {
      const label = option.display_label.trim().toLocaleLowerCase();
      const value = option.option_value.trim().toLocaleLowerCase();
      if (duplicateLabels.has(label) || duplicateValues.has(value)) {
        setDropdownManagerError("Each option needs a unique label and stored value.");
        return;
      }
      duplicateLabels.add(label);
      duplicateValues.add(value);
    }
    setDropdownManagerBusy(true);
    let completed = 0;
    try {
      for (const draft of pending) {
        if (draft.isNew) {
          const created = await createConfigurableOption(managingDropdownField, draft.display_label, false);
          setDropdownOptionDrafts((current) => current.map((item) => item.draftKey === draft.draftKey ? {
            ...created,
            draftKey: created.id,
            originalLabel: created.display_label,
            isNew: false,
            removePending: false,
          } : item));
        } else {
          const original = dropdownOptions.find((option) => option.id === draft.id);
          if (!original) throw new Error(`Option ${draft.option_value} no longer exists. Refresh and review changes.`);
          const saved = await saveDropdownOption(original, draft.display_label, false);
          if (!saved) throw new Error("Option changes were cancelled.");
          setDropdownOptionDrafts((current) => current.map((item) => item.draftKey === draft.draftKey ? { ...item, originalLabel: draft.display_label.trim(), display_label: draft.display_label.trim() } : item));
        }
        completed += 1;
      }
      await reloadDropdownOptions();
      setDropdownManagerNotice(completed ? `${completed} change(s) saved.` : "There are no pending changes.");
    } catch (cause) {
      await reloadDropdownOptions().catch(() => undefined);
      setDropdownManagerError(`${cause instanceof Error ? cause.message : "Unable to save dropdown options."}${completed ? ` ${completed} earlier change(s) were saved; review the remaining drafts before retrying.` : ""}`);
    } finally {
      setDropdownManagerBusy(false);
    }
  }

  function selectFormatCell(row: ReportRow, field: string, extend: boolean) {
    const key = getReportRowKey(reportKey, row);
    if (!key || displayedRowsRef.current.filter((candidate) => getReportRowKey(reportKey, candidate) === key).length !== 1) return;
    setCellSelection((current) => extend && current
      ? { ...current, focusRowKey: key, focusField: field }
      : { anchorRowKey: key, anchorField: field, focusRowKey: key, focusField: field });
  }

  function applyCellFormat(change: Partial<ReportCellFormat>) {
    if (!selectedFormatCellKeys.size) return;
    const next = { ...cellFormats };
    for (const key of selectedFormatCellKeys) {
      const format = { ...next[key], ...change };
      if (format.bold === false) delete format.bold;
      if (format.color === "") delete format.color;
      if (format.backgroundColor === "") delete format.backgroundColor;
      if (Object.keys(format).length) next[key] = format;
      else delete next[key];
    }
    setCellFormats(next);
    setOpenColorPicker(null);
    try {
      localStorage.setItem(cellFormatStorageKey, JSON.stringify(next));
    } catch {
      // Keep current-session formatting usable if browser storage is unavailable.
    }
  }

  const selectedFormats = [...selectedFormatCellKeys].map((key) => cellFormats[key] ?? {});
  const selectionIsBold = selectedFormats.length > 0 && selectedFormats.every((format) => format.bold === true);
  const selectedTextColor = selectedFormats.length > 0 && selectedFormats.every((format) => format.color === selectedFormats[0].color) ? selectedFormats[0].color ?? "" : null;
  const selectedBackgroundColor = selectedFormats.length > 0 && selectedFormats.every((format) => format.backgroundColor === selectedFormats[0].backgroundColor) ? selectedFormats[0].backgroundColor ?? "" : null;

  function hideReportColumn(columnKey: string) {
    saveColumnLayout({
      ...columnLayout,
      order: layoutColumnKeys,
      hidden: [...new Set([...columnLayout.hidden, columnKey])],
    });
  }

  function restoreReportColumn(columnKey: string) {
    saveColumnLayout({
      ...columnLayout,
      order: layoutColumnKeys,
      hidden: columnLayout.hidden.filter((key) => key !== columnKey),
    });
  }

  function reorderReportColumn(sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey) return;
    const nextOrder = [...layoutColumnKeys];
    const sourceIndex = nextOrder.indexOf(sourceKey);
    const targetIndex = nextOrder.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, sourceKey);
    saveColumnLayout({ ...columnLayout, order: nextOrder });
  }

  function beginFillGesture(row: ReportRow, index: number, column: ReportColumn) {
    const sourceTarget = getEditableCellTarget(row, column.key, reportKey);
    if (!accessToken || cellSaveInFlight.current || !sourceTarget || sourceTarget.editor === "relationship") return;
    const sourceRowKey = getReportRowKey(reportKey, row);
    if (!sourceRowKey || displayedRowsRef.current.filter((candidate) => getReportRowKey(reportKey, candidate) === sourceRowKey).length !== 1) {
      setCellSaveState({ rowKey: rowKey(row, index), field: column.key, status: "warning", message: "Fill is unavailable because this report row does not have a unique stable identity." });
      return;
    }
    const baseline = new Map<string, unknown>();
    const identityCounts = new Map<string, number>();
    for (const candidate of displayedRowsRef.current) {
      const candidateKey = getReportRowKey(reportKey, candidate);
      if (candidateKey) identityCounts.set(candidateKey, (identityCounts.get(candidateKey) ?? 0) + 1);
    }
    for (const candidate of displayedRowsRef.current) {
      const candidateKey = getReportRowKey(reportKey, candidate);
      if (!candidateKey || identityCounts.get(candidateKey) !== 1) continue;
      for (const visibleColumn of gridColumns) {
        baseline.set(`${candidateKey}\u0000${visibleColumn.key}`, candidate[visibleColumn.key]);
      }
    }
    const gesture: FillGesture = {
      sourceRowKey,
      sourceField: column.key,
      sourceValue: createEditingCell(row, index, column.key)?.value ?? String(row[column.key] ?? ""),
      targetRowKey: sourceRowKey,
      targetField: column.key,
      baseline,
    };
    fillGestureRef.current = gesture;
    setFillGesture(gesture);
  }

  function extendFillGesture(row: ReportRow, column: ReportColumn) {
    const current = fillGestureRef.current;
    if (!current) return;
    const targetRowKey = getReportRowKey(reportKey, row);
    if (!targetRowKey || displayedRowsRef.current.filter((candidate) => getReportRowKey(reportKey, candidate) === targetRowKey).length !== 1) return;
    const next = { ...current, targetRowKey, targetField: column.key };
    fillGestureRef.current = next;
    setFillGesture(next);
  }

  async function finishFillGesture() {
    const gesture = fillGestureRef.current;
    if (!gesture) return;
    fillGestureRef.current = null;
    setFillGesture(null);
    const currentRows = displayedRowsRef.current;
    const identityCounts = new Map<string, number>();
    for (const row of currentRows) {
      const key = getReportRowKey(reportKey, row);
      if (key) identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
    }
    const sourceRowIndex = currentRows.findIndex((row) => getReportRowKey(reportKey, row) === gesture.sourceRowKey);
    const targetRowIndex = currentRows.findIndex((row) => getReportRowKey(reportKey, row) === gesture.targetRowKey);
    const sourceColumnIndex = renderedGridColumns.findIndex((column) => column.key === gesture.sourceField);
    const targetColumnIndex = renderedGridColumns.findIndex((column) => column.key === gesture.targetField);
    if (sourceRowIndex < 0 || targetRowIndex < 0 || sourceColumnIndex < 0 || targetColumnIndex < 0) return;
    if (!Object.is(currentRows[sourceRowIndex][gesture.sourceField], gesture.baseline.get(`${gesture.sourceRowKey}\u0000${gesture.sourceField}`))) {
      setCellSaveState({ rowKey: rowKey(currentRows[sourceRowIndex], sourceRowIndex), field: gesture.sourceField, status: "warning", message: "Fill cancelled because the source cell changed." });
      return;
    }
    const rowStart = Math.min(sourceRowIndex, targetRowIndex);
    const rowEnd = Math.max(sourceRowIndex, targetRowIndex);
    const columnStart = Math.min(sourceColumnIndex, targetColumnIndex);
    const columnEnd = Math.max(sourceColumnIndex, targetColumnIndex);
    const targets: Array<{ rowKey: string; field: string }> = [];
    for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
      for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
        const row = currentRows[rowIndex];
        const column = renderedGridColumns[columnIndex];
        const targetRowKey = getReportRowKey(reportKey, row);
        if (!targetRowKey || identityCounts.get(targetRowKey) !== 1) continue;
        if (targetRowKey !== gesture.sourceRowKey || column.key !== gesture.sourceField) targets.push({ rowKey: targetRowKey, field: column.key });
      }
    }
    for (const target of targets) {
      const latestRows = displayedRowsRef.current;
      const rowIndex = latestRows.findIndex((row) => getReportRowKey(reportKey, row) === target.rowKey);
      if (rowIndex < 0) continue;
      const row = latestRows[rowIndex];
      const targetKey = `${target.rowKey}\u0000${target.field}`;
      const editableTarget = getEditableCellTarget(row, target.field, reportKey);
      const sourceTarget = getEditableCellTarget(currentRows[sourceRowIndex], gesture.sourceField, reportKey);
      if (!editableTarget || !sourceTarget || editableTarget.editor === "relationship" || editableTarget.editor !== sourceTarget.editor) continue;
      if (editableTarget.editor === "status" && editableTarget.dropdownField !== sourceTarget.dropdownField) continue;
      if (!Object.is(row[target.field], gesture.baseline.get(targetKey))) {
        setCellSaveState({ rowKey: target.rowKey, field: target.field, status: "warning", message: "Skipped: this cell changed while the fill range was selected." });
        continue;
      }
      const candidate = createEditingCell(row, rowIndex, target.field);
      if (!candidate) continue;
      candidate.value = gesture.sourceValue;
      const saved = await commitEditableCell(candidate);
      if (!saved) return;
    }
  }

  const finishFillGestureRef = useRef(finishFillGesture);
  finishFillGestureRef.current = finishFillGesture;

  useEffect(() => {
    if (!fillGesture) return;
    const finishOnPointerUp = () => void finishFillGestureRef.current();
    window.addEventListener("pointerup", finishOnPointerUp);
    window.addEventListener("pointercancel", finishOnPointerUp);
    return () => {
      window.removeEventListener("pointerup", finishOnPointerUp);
      window.removeEventListener("pointercancel", finishOnPointerUp);
    };
  }, [fillGesture]);

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
      const eligibleUsers = options.filter((option) => ["ADMIN", "STAFF"].includes(option.secondary?.toUpperCase() ?? ""));
      setMentionOptions(eligibleUsers);
      if (eligibleUsers.length === 0) {
        mentionControlActive.current = false;
        setCellSaveState((current) => current ? { ...current, status: "error", message: "No eligible active admin or staff profiles found." } : current);
      }
    } catch (cause) {
      mentionControlActive.current = false;
      setCellSaveState((current) => current ? { ...current, status: "error", message: cause instanceof Error ? cause.message : "Unable to load eligible admin or staff profiles." } : current);
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
      const diagnosticTarget: EditableCellTarget = {
        ...definition,
        tripId: targetCell.tripId,
        stopId: targetCell.stopId,
        lineItemId: targetCell.lineItemId,
        assignmentId: targetCell.assignmentId,
        billingId: targetCell.billingId,
        storeCallId: targetCell.storeCallId,
      };
      reportEditDiagnostic("save request", {
        reportKey,
        reportEndpoint: REPORTS[reportKey].endpoint,
        endpoint: reportEditEndpoint(diagnosticTarget),
        canonicalIdentity: targetCell.rowKey,
        sourceEntity: definition.sourceEntity,
        recordIds: {
          trip_id: targetCell.tripId ?? null,
          trip_stop_id: targetCell.stopId ?? null,
          trip_line_item_id: targetCell.lineItemId ?? null,
        },
        editedField: definition.sourceField,
        payload: Object.fromEntries(Object.entries(updatePayload)
          .filter(([key]) => !key.startsWith("_") || key === definition.sourceField)
          .map(([key, value]) => [key, diagnosticCellValue(key, value)])),
      });
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

      reportEditDiagnostic("save response", {
        endpoint: reportEditEndpoint(diagnosticTarget),
        sourceEntity: definition.sourceEntity,
        responseRecordId: savedRecord.id ?? null,
        trip_id: savedRecord.trip_id ?? targetCell.tripId ?? null,
        trip_stop_id: definition.sourceEntity === "stop" ? savedRecord.id ?? targetCell.stopId ?? null : targetCell.stopId ?? null,
        trip_line_item_id: definition.sourceEntity === "lineItem" ? savedRecord.id ?? targetCell.lineItemId ?? null : targetCell.lineItemId ?? null,
        editedField: definition.sourceField,
        responseValue: diagnosticCellValue(definition.sourceField, savedRecord[definition.sourceField]),
      });

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

      if (import.meta.env.DEV) {
        const sameTripRows = targetCell.tripId
          ? rows.filter((row) => row.trip_id === targetCell.tripId)
          : rows;
        reportEditDiagnostic("optimistic row reconciliation", {
          sourceEntity: definition.sourceEntity,
          editedField: targetCell.field,
          intendedRecordIds: {
            trip_id: targetCell.tripId ?? null,
            trip_stop_id: targetCell.stopId ?? null,
            trip_line_item_id: targetCell.lineItemId ?? null,
          },
          matchingRowCount: sameTripRows.filter((row) => matchesEditedRecord(row, recordTarget)).length,
          rowsWithSameTripIdBeforeUpdate: sameTripRows.slice(0, 10).map((row) => ({
            ...summarizeReportEditRow(row, reportKey, targetCell.field),
            willReceivePatch: matchesEditedRecord(row, recordTarget),
          })),
        });
      }

      setRows((currentRows) =>
        currentRows.map((row) => {
          if (!matchesEditedRecord(row, recordTarget)) return row;
          return { ...row, ...savedRowPatch };
        }),
      );
      updateCachedReportPages(reportKey, accessToken, (cachedPage) => {
        if (import.meta.env.DEV) {
          const sameTripRows = targetCell.tripId
            ? cachedPage.rows.filter((row) => row.trip_id === targetCell.tripId)
            : cachedPage.rows;
          reportEditDiagnostic("cached report page reconciliation", {
            reportKey,
            sourceEntity: definition.sourceEntity,
            editedField: targetCell.field,
            matchingRowCount: sameTripRows.filter((row) => matchesEditedRecord(row, recordTarget)).length,
            rowsWithSameTripIdBeforeUpdate: sameTripRows.slice(0, 10).map((row) => ({
              ...summarizeReportEditRow(row, reportKey, targetCell.field),
              willReceivePatch: matchesEditedRecord(row, recordTarget),
            })),
          });
        }
        return {
          ...cachedPage,
          rows: cachedPage.rows.map((row) => matchesEditedRecord(row, recordTarget)
            ? { ...row, ...savedRowPatch }
            : row),
        };
      });

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
      const shouldReloadReportPage = Boolean(appliedSearch.trim())
        || Object.values(appliedFilters).some((value) => value.trim())
        || activeSortBy === targetCell.field;
      if (shouldReloadReportPage) {
        invalidateReportData(reportKey);
      } else {
        invalidateApiCache(REPORTS[reportKey].endpoint);
      }
      if (shouldReloadReportPage) {
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

  async function createConfigurableOption(field: DropdownField, rawLabel: string, refresh = true): Promise<DropdownOption> {
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
    const created = await addDropdownOption(accessToken, {
      field_key: field,
      option_value: value,
      display_label: displayLabel,
      sort_order: dropdownOptions.filter((item) => item.field_key === field).length * 10,
    });
    if (refresh) await reloadDropdownOptions();
    return created;
  }

  async function addTypedOptionAndSave(target: EditingCell, typedValue = target.value): Promise<boolean> {
    const field = target.definition.dropdownField;
    if (!field || field === "letter_status") return false;
    await createConfigurableOption(field, typedValue);
    return true;
  }

  async function saveDropdownOption(option: DropdownOption, displayLabel: string, refresh = true): Promise<boolean> {
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
    if (refresh) await reloadDropdownOptions();
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
  const isLoading = Boolean(accessToken) && loadedQueryKey !== queryKey;

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
      <div className={`${tableUi.toolbar} flex-wrap items-center justify-between gap-3`}>
        {pageTitle && (
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[#0b2341]">{pageTitle}</h1>
            {pageSubtitle && <p className="mt-1 text-xs leading-snug text-slate-600">{pageSubtitle}</p>}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
          {showReportPicker ? (
            <label className="sr-only" htmlFor="report-select">
              Select report
            </label>
          ) : null}
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

      <FlexibleTableSectionTabs
        key={reportKey}
        sectionKey={FLEX_SECTION_BY_REPORT[reportKey]}
        sectionLabel={REPORTS[reportKey].title}
        hideSectionTab
        accessToken={accessToken}
        role={profile?.role ?? ""}>
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
          {viewMode === "table" && <div role="toolbar" aria-label="Cell formatting" className="flex min-h-9 items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5">
            <button type="button" title="Bold selected cells" aria-label="Bold selected cells" aria-pressed={selectionIsBold} disabled={!selectedFormatCellKeys.size} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCellFormat({ bold: !selectionIsBold })} className={`inline-flex h-7 w-7 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-40 ${selectionIsBold ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Bold aria-hidden="true" className="h-4 w-4" /></button>
            <div className="relative">
              <button type="button" title="Text color" aria-label="Text color" aria-expanded={openColorPicker === "text"} disabled={!selectedFormatCellKeys.size} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpenColorPicker((current) => current === "text" ? null : "text")} className={`inline-flex h-7 w-7 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-40 ${openColorPicker === "text" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Palette aria-hidden="true" className="h-4 w-4" /></button>
              {openColorPicker === "text" && <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" aria-label="Text color palette">{["#111827", "#b91c1c", "#d97706", "#15803d", "#1d4ed8", "#7e22ce"].map((color) => <button key={color} type="button" title={`Text color ${color}`} aria-label={`Text color ${color}`} aria-pressed={selectedTextColor === color} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCellFormat({ color })} className={`h-5 w-5 rounded-full border border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedTextColor === color ? "ring-2 ring-slate-800 ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}<button type="button" title="Reset text color" aria-label="Reset text color" aria-pressed={selectedTextColor === ""} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCellFormat({ color: "" })} className="rounded px-1.5 text-[10px] text-slate-600 hover:bg-slate-100">Reset</button></div>}
            </div>
            <div className="relative">
              <button type="button" title="Cell color" aria-label="Cell color" aria-expanded={openColorPicker === "background"} disabled={!selectedFormatCellKeys.size} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpenColorPicker((current) => current === "background" ? null : "background")} className={`inline-flex h-7 w-7 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-40 ${openColorPicker === "background" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Paintbrush aria-hidden="true" className="h-4 w-4" /></button>
              {openColorPicker === "background" && <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" aria-label="Cell color palette">{["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#e5e7eb"].map((color) => <button key={color} type="button" title={`Cell color ${color}`} aria-label={`Cell color ${color}`} aria-pressed={selectedBackgroundColor === (color === "#ffffff" ? "" : color)} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCellFormat({ backgroundColor: color === "#ffffff" ? "" : color })} className={`h-5 w-5 rounded-full border border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedBackgroundColor === (color === "#ffffff" ? "" : color) ? "ring-2 ring-slate-800 ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}<button type="button" title="Reset cell color" aria-label="Reset cell color" aria-pressed={selectedBackgroundColor === ""} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCellFormat({ backgroundColor: "" })} className="rounded px-1.5 text-[10px] text-slate-600 hover:bg-slate-100">Reset</button></div>}
            </div>
            {cellSelection && <span className="ml-2 text-[10px] text-slate-500">{selectedFormatCellKeys.size} cell{selectedFormatCellKeys.size === 1 ? "" : "s"} selected</span>}
          </div>}
          <div ref={tableViewportRef} className="relative min-h-48 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
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
                    columns={Math.max(gridColumns.length || 5, 5)}
                  rows={6}
                />
              </div>
            ) : displayedRows.length === 0 && (Boolean(appliedSearch.trim()) || hasAppliedFilters) ? (
              <div className="flex min-h-48 w-full items-center justify-center px-4 py-12 text-center text-sm text-slate-500">
                No matching records found.
              </div>
            ) : (
              <table className="w-max min-w-full border-separate border-spacing-0 text-left">
                <thead className={tableUi.thead}>
                  <tr>
                    <th
                      ref={selectionColumnRef}
                      scope="col"
                      className="sticky left-0 z-50 w-11 min-w-11 border-b border-r border-slate-100/70 bg-white px-4 py-3.5">
                      <ReportSelectAllCheckbox rowKeys={visibleSelectionKeys} />
                    </th>
                    {renderedGridColumns.map((column) => {
                      const sortable = sortableFields.includes(column.key);
                      const isActiveSort = activeSortBy === column.key;
                      const pinSide = pinnedColumnSides[column.key];
                      const isPinned = Boolean(pinSide);
                      const isOuterPinnedEdge = pinSide === "left"
                        ? leftPinnedColumnKeys.at(-1) === column.key
                        : pinSide === "right" && rightPinnedColumnKeys[0] === column.key;
                      const columnColor = columnLayout.colors?.[column.key];
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
                        draggable={false}
                        onDragOver={(event) => { if (draggedColumnKey) event.preventDefault(); }}
                        onDrop={(event) => { event.preventDefault(); if (draggedColumnKey) reorderReportColumn(draggedColumnKey, column.key); setDraggedColumnKey(null); }}
                        style={{ ...(columnColor ? { "--report-column-color": columnColor, color: columnForeground(columnColor) } as CSSProperties : {}), ...(isPinned ? { position: "sticky" as const, ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? 44 } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 40 } : {}) }}
                        className={`${tableUi.th} border-r border-slate-100/70 last:border-r-0 ${columnColor ? "bg-[var(--report-column-color)]" : ""} ${isPinned ? `${columnColor ? "" : "bg-white"} ${isOuterPinnedEdge ? pinSide === "left" ? "shadow-[4px_0_8px_-6px_rgba(11,35,65,0.35)]" : "shadow-[-4px_0_8px_-6px_rgba(11,35,65,0.35)]" : ""}` : ""} ${
                          column.type === "number" ||
                          ["quantity", "cbm", "subcon_rate_manual"].includes(
                            column.key,
                          )
                            ? "text-right"
                            : "text-left"
                        }`}>
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <button
                            type="button"
                            draggable
                            title={`Drag to reorder ${column.title}`}
                            aria-label={`Drag to reorder ${column.title}`}
                            onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.key); setDraggedColumnKey(column.key); }}
                            onDragEnd={() => setDraggedColumnKey(null)}
                            className="min-w-0 cursor-grab truncate rounded px-1 py-0.5 text-left uppercase text-inherit active:cursor-grabbing"
                            >
                            {column.title}
                            {sortable && isActiveSort && <SortIcon aria-hidden="true" className={`ml-1 inline h-3 w-3 ${columnColor ? "text-slate-700" : "text-[#2678b9]"}`} />}
                          </button>
                          <button
                            type="button"
                            title={`Actions for ${column.title}`}
                            aria-label={`Actions for ${column.title}`}
                            aria-haspopup="menu"
                            aria-expanded={openColumnMenu?.key === column.key}
                            onClick={(event) => openColumnMenu?.key === column.key ? setOpenColumnMenu(null) : showColumnMenu(event, column.key)}
                            className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-100 hover:text-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                            <EllipsisVertical aria-hidden="true" className="h-4 w-4" />
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
                        colSpan={Math.max(gridColumns.length + 1, 1)}
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
                        <td className="sticky left-0 z-30 w-11 min-w-11 border-r border-slate-100/70 bg-white px-3 py-3.5 shadow-[3px_0_5px_-5px_rgba(11,35,65,0.65)] group-hover:bg-[#f2f6fa]">
                          <ReportRowSelectionCheckbox
                            rowKey={selectionKey}
                            label={rowText(row, "dispatch_number", "trip_number", "store_call_id")} />
                        </td>
                        {renderedGridColumns.map((column) => {
                          const visibleColumnIndex = renderedGridColumns.findIndex((item) => item.key === column.key);
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
                          const columnColor = columnLayout.colors?.[column.key];
                          const isPinned = Boolean(pinSide);
                          const isOuterPinnedEdge = pinSide === "left"
                            ? leftPinnedColumnKeys.at(-1) === column.key
                            : pinSide === "right" && rightPinnedColumnKeys[0] === column.key;
                          const isEditing =
                            editingCell?.rowKey === currentRowKey &&
                            editingCell.field === column.key;
                          const formatRowKey = getReportRowKey(reportKey, row);
                          const formatKey = formatRowKey ? `${formatRowKey}\u0000${column.key}` : "";
                          const cellFormat = formatKey ? cellFormats[formatKey] : undefined;
                          const isFormatSelected = formatKey !== "" && selectedFormatCellKeys.has(formatKey);
                          const fillRange = fillGesture ? (() => {
                            const sourceRow = displayedRows.findIndex((item) => getReportRowKey(reportKey, item) === fillGesture.sourceRowKey);
                            const targetRow = displayedRows.findIndex((item) => getReportRowKey(reportKey, item) === fillGesture.targetRowKey);
                            const sourceColumn = renderedGridColumns.findIndex((item) => item.key === fillGesture.sourceField);
                            const targetColumn = renderedGridColumns.findIndex((item) => item.key === fillGesture.targetField);
                            return sourceRow >= 0 && targetRow >= 0 && sourceColumn >= 0 && targetColumn >= 0 && index >= Math.min(sourceRow, targetRow) && index <= Math.max(sourceRow, targetRow) && visibleColumnIndex >= Math.min(sourceColumn, targetColumn) && visibleColumnIndex <= Math.max(sourceColumn, targetColumn);
                          })() : false;

                          return (
                            <td
                              key={column.key}
                              style={{
                                ...(isPinned ? { position: "sticky" as const, ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? 44 } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 20 } : {}),
                                ...(cellFormat?.bold ? { fontWeight: 700 } : {}),
                                ...(cellFormat?.color ? { color: cellFormat.color } : {}),
                                ...(columnColor ? { "--report-column-color": columnColor, color: cellFormat?.color ?? columnForeground(columnColor) } as CSSProperties : {}),
                                ...(cellFormat?.backgroundColor ? { backgroundColor: cellFormat.backgroundColor } : {}),
                              }}
                              onPointerEnter={() => extendFillGesture(row, column)}
                              onClick={(event) => {
                                if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
                                selectFormatCell(row, column.key, event.shiftKey);
                                if (!event.shiftKey && !isEditing) {
                                  beginEditCell(row, index, column.key);
                                }
                              }}
                              className={`group/cell relative ${isRemarksColumn ? "min-w-[14rem] max-w-[30rem] whitespace-pre-wrap break-words align-top" : "max-w-[22rem]"} ${tableUi.td} border-r border-slate-100/70 text-slate-800 last:border-r-0 ${columnColor && !cellFormat?.backgroundColor ? "bg-[var(--report-column-color)] hover:bg-[#e6f0f9]" : ""} ${isPinned ? `${columnColor && !cellFormat?.backgroundColor ? "" : "bg-white"} group-hover:bg-[#f2f6fa] ${isOuterPinnedEdge ? pinSide === "left" ? "shadow-[4px_0_7px_-5px_rgba(11,35,65,0.75)]" : "shadow-[-4px_0_7px_-5px_rgba(11,35,65,0.75)]" : ""}` : ""} ${fillRange ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""} ${isFormatSelected ? "outline outline-2 outline-inset outline-blue-500" : ""} ${
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
                                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { mentionControlActive.current = true; void loadMentionOptions(); }} className="w-fit rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-[#2678b9] hover:bg-blue-50">@ Mention admin or staff</button>
                                      {mentionOptions.length > 0 && mentionControlActive.current && (
                                        <select aria-label="Select admin or staff to mention" defaultValue="" onBlur={() => { mentionControlActive.current = false; void commitEditableCell(); }} onChange={(event) => {
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
                                          <option value="">Choose an eligible admin or staff member</option>
                                          {mentionOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                        </select>
                                      )}
                                      {mentionLoading && <span className="text-[10px] text-slate-500">Loading users…</span>}
                                      {cellSaveState?.status === "error" && cellSaveState.message.includes("eligible admin") && <span role="alert" className="text-[10px] text-rose-600">{cellSaveState.message}</span>}
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
                                  cellSaveState.field === column.key &&
                                  cellSaveState.status !== "saving" ? (
                                    <span
                                      className={`text-[10px] font-medium ${cellSaveState.status === "error" ? "text-rose-600" : cellSaveState.status === "warning" ? "text-amber-700" : "text-emerald-600"}`}>
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
                              cellSaveState.field === column.key &&
                              cellSaveState.status !== "saving" ? (
                                <span
                                  role="status"
                                  className={`ml-2 text-[10px] font-medium ${cellSaveState.status === "error" ? "text-rose-600" : cellSaveState.status === "warning" ? "text-amber-700" : cellSaveState.status === "saved" ? "text-emerald-600" : "text-slate-400"}`}>
                                  {cellSaveState.message}
                                </span>
                              ) : null}
                              {isEditable && !isEditing && (
                                <button
                                  type="button"
                                  title={`Drag to fill from ${column.title}`}
                                  aria-label={`Drag to fill from ${column.title}`}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    beginFillGesture(row, index, column);
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  className="absolute bottom-0.5 right-0.5 z-10 flex h-4 w-4 touch-none items-center justify-center rounded-sm border border-blue-300 bg-white text-blue-600 opacity-0 shadow-sm transition group-hover/cell:opacity-100 focus:opacity-100">
                                  <GripVertical aria-hidden="true" className="h-3 w-3 rotate-90" />
                                </button>
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
          {hiddenColumns.length > 0 && (
            <div aria-label="Hidden report columns" className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hidden columns</span>
              {hiddenColumns.map((column) => (
                <button key={column.key} type="button" title={`Restore ${column.title} column`} onClick={() => restoreReportColumn(column.key)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-blue-300 hover:text-[#0b2341]">
                  <EyeOff aria-hidden="true" className="h-3 w-3" />{column.title}<span aria-hidden="true" className="text-slate-400">· Restore</span>
                </button>
              ))}
            </div>
          )}
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
      {openColumnMenu && typeof document !== "undefined" && createPortal((() => {
        const menuColumn = columns.find((column) => column.key === openColumnMenu.key);
        if (!menuColumn) return null;
        const menuDropdownField = getReportEditDefinition(reportKey, menuColumn.key)?.dropdownField;
        const menuPinSide = pinnedColumnSides[menuColumn.key];
        const menuItemClass = "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#0b2341] hover:text-white focus-visible:bg-[#0b2341] focus-visible:text-white focus-visible:outline-none";
        const menuAction = (action: () => void) => {
          action();
          setOpenColumnMenu(null);
        };
        return (
          <div className="fixed inset-0 z-[100]" onMouseDown={() => setOpenColumnMenu(null)}>
            <div role="menu" aria-label={`${menuColumn.title} column actions`} onMouseDown={(event) => event.stopPropagation()} style={{ left: openColumnMenu.left, top: openColumnMenu.top }} className="fixed z-[101] w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <div className="truncate px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{menuColumn.title}</div>
              {sortableFields.includes(menuColumn.key) && <>
                <button role="menuitem" type="button" onClick={() => menuAction(() => { setSortBy(menuColumn.key); setSortOrder("asc"); setPage(1); })} className={menuItemClass}>Sort ascending {activeSortBy === menuColumn.key && sortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : null}</button>
                <button role="menuitem" type="button" onClick={() => menuAction(() => { setSortBy(menuColumn.key); setSortOrder("desc"); setPage(1); })} className={menuItemClass}>Sort descending {activeSortBy === menuColumn.key && sortOrder === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : null}</button>
              </>}
              <button role="menuitem" type="button" onClick={() => menuAction(() => toggleColumnPinAutomatically(menuColumn.key))} className={`${menuItemClass} justify-start`}><Pin className="h-3.5 w-3.5" />{menuPinSide ? "Unpin" : "Pin"}</button>
              <button role="menuitem" type="button" onClick={() => menuAction(() => { setEditingColumnColor(menuColumn.key); })} className={`${menuItemClass} justify-start`}><Palette className="h-3.5 w-3.5" />Edit Column</button>
              {menuDropdownField && canManageDropdowns && <button role="menuitem" type="button" onClick={() => menuAction(() => openDropdownManager(menuDropdownField))} className={`${menuItemClass} justify-start`}><SlidersHorizontal className="h-3.5 w-3.5" />Manage Options</button>}
              <button role="menuitem" type="button" onClick={() => menuAction(() => hideReportColumn(menuColumn.key))} className={`${menuItemClass} justify-start`}><EyeOff className="h-3.5 w-3.5" />Hide Column</button>
            </div>
          </div>
        );
      })(), document.body)}
      {editingColumnColor && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/25 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingColumnColor(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="report-column-color-title" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="report-column-color-title" className="text-sm font-semibold text-slate-900">Edit Column</h2><p className="mt-1 text-xs text-slate-500">Choose a display color for {columns.find((column) => column.key === editingColumnColor)?.title ?? "this column"}.</p></div>
              <button type="button" title="Close" aria-label="Close column color dialog" onClick={() => setEditingColumnColor(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 flex items-center gap-3"><input aria-label="Column display color" type="color" value={columnLayout.colors?.[editingColumnColor] ?? "#eaf2fb"} onChange={(event) => setReportColumnColor(editingColumnColor, event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1" /><span className="text-xs text-slate-600">Color is saved with this browser’s report column preferences.</span></div>
            <div className="mt-4 grid grid-cols-8 gap-2" aria-label="Column color palette">
              {REPORT_COLUMN_COLORS.map((color) => <button key={color} type="button" aria-label={`Set column color ${color}`} title={color} aria-pressed={columnLayout.colors?.[editingColumnColor]?.toLowerCase() === color} onClick={() => setReportColumnColor(editingColumnColor, color)} className="h-7 w-7 rounded-full border border-slate-300 ring-offset-2 hover:ring-2 hover:ring-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]" style={{ backgroundColor: color }} />)}
            </div>
            <div className="mt-5 flex justify-between"><button type="button" onClick={() => setReportColumnColor(editingColumnColor, null)} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">Reset to default</button><button type="button" onClick={() => setEditingColumnColor(null)} className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17375f]">Done</button></div>
          </section>
        </div>, document.body,
      )}
      {managingDropdownField && typeof document !== "undefined" && canManageDropdowns && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/25 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDropdownManager(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="report-dropdown-manager-title" className="max-h-[min(80vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="report-dropdown-manager-title" className="text-sm font-semibold text-slate-900">Manage Options</h2><p className="mt-1 text-xs text-slate-500">Edit several labels or add options, then save once. Requests run in sequence; a failure can leave earlier changes saved.</p></div><button type="button" title="Close" aria-label="Close option manager" disabled={dropdownManagerBusy} onClick={closeDropdownManager} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div>
            {dropdownManagerError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{dropdownManagerError}</p>}
            {dropdownManagerNotice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{dropdownManagerNotice}</p>}
            <div className="mt-4 space-y-2">{dropdownOptionDrafts.filter((option) => option.field_key === managingDropdownField).map((option) => <div key={option.draftKey} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border p-2.5 ${option.isNew || option.display_label !== option.originalLabel ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}><label className="min-w-0"><span className="sr-only">Display label for {option.option_value}</span><input aria-label={`Display label for ${option.option_value}`} disabled={dropdownManagerBusy} value={option.display_label} onChange={(event) => setDropdownOptionDrafts((current) => current.map((item) => item.draftKey === option.draftKey ? { ...item, display_label: event.target.value } : item))} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-100" /></label><span className="max-w-32 truncate rounded bg-white px-2 py-1 text-[10px] text-slate-500" title={`${option.option_value} · used by ${option.usage_count} record(s)`}>{option.option_value}{option.usage_count ? ` · ${option.usage_count} used` : ""}{!option.active ? " · inactive" : ""}</span><button type="button" title={option.isNew ? "Remove unsaved option" : "Permanent removal is unavailable for saved options"} aria-label={option.isNew ? `Remove new option ${option.display_label}` : `Cannot remove saved option ${option.display_label}`} disabled={dropdownManagerBusy || !option.isNew} onClick={() => removeDropdownDraft(option)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-4 w-4" /></button></div>)}</div>
            {managingDropdownField === "letter_status" ? <p className="mt-4 text-xs text-slate-500">Letter status values are fixed by the existing system configuration.</p> : <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); stageDropdownOption(); }}><input aria-label="New dropdown option label" value={newDropdownLabel} onChange={(event) => setNewDropdownLabel(event.target.value)} maxLength={80} placeholder="Add an option to this draft" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" /><button type="submit" disabled={dropdownManagerBusy || !newDropdownLabel.trim()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#0b2341] hover:bg-slate-50 disabled:opacity-50">Add to list</button></form>}
            <p className="mt-3 text-[11px] text-slate-500">Saved options cannot be safely removed with the current API: report values store text without a foreign key, and the backend has no atomic usage-check-and-delete operation. Removal is available for unsaved additions only.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={dropdownManagerBusy} onClick={closeDropdownManager} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button><button type="button" disabled={dropdownManagerBusy || !dropdownOptionDrafts.some((option) => option.isNew || option.display_label.trim() !== option.originalLabel)} onClick={() => void saveDropdownOptionChanges()} className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17375f] disabled:opacity-50">{dropdownManagerBusy ? "Saving changes…" : "Save Changes"}</button></div>
          </section>
        </div>, document.body,
      )}
      </FlexibleTableSectionTabs>
    </div>
  );
}
