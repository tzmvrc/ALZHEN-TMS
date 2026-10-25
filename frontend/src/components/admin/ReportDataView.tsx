import {useSpreadsheetInfiniteScroll} from "./useSpreadsheetInfiniteScroll";
import SpreadsheetRowSelectionHeader from "./SpreadsheetRowSelectionHeader";
import {useSpreadsheetDragSelection} from "./useSpreadsheetDragSelection";
import {useSpreadsheetSelectAll} from "./useSpreadsheetSelectAll";
import {fetchReportSelection} from "../../services/report.service";
import SpreadsheetQuickFilters from "./SpreadsheetQuickFilters";
import {spreadsheetColumnLabel, matchesSpreadsheetSearch} from "../../services/spreadsheet-display";
import { useSheetAutoFit } from "./useSheetAutoFit";
import { cbmDisplay, isCbmField } from "../../services/cbm-display";
import { scrollToTableColumn } from "./scrollToTableColumn";
import { categoryHeaderStyle, FIELD_CATEGORIES } from "../../services/trip-column-categories";
import { insertProductDrafts, newProductDrafts, productDraftValues, PRODUCT_FIELDS } from "../../services/trip-row-drafts";
import { createProductRows } from "../../services/trip.service";
import TripRowContextDialog from "./TripRowContextDialog";
import {reportCellFormatFor} from "./ReportSpreadsheetUtils";
import {operationalExportRows} from "../../services/operational-export";
import {confirmedColumnDesign} from "../../services/shared-table-design";
import PhysicalRecordDeletionDialog from "./PhysicalRecordDeletionDialog";
import {physicalDeletionTargets,readRecordDeletionCapabilities,type PhysicalDeletionTarget} from "../../services/report-row-actions";
import { reportLineItemDeletionTargets } from "../../services/report-row-actions";
import { dropdownStoredValue } from "../../services/dropdown-option.service";
import { SpreadsheetRowDeletionDialog } from "./SpreadsheetRowDeletionDialog";
import { type LineItemDeletionTarget } from "../../services/trip.service";
import { useVirtualSpreadsheetRows } from "./useVirtualSpreadsheetRows";
import { SpreadsheetCellContextMenu } from "./SpreadsheetCellContextMenu";
import { useOperationalFormulas } from "./useOperationalFormulas";
import { physicalRowIdentity } from "../../services/spreadsheet-formula";
import { TripIssuesProvider,TripIssueCell } from "./TripIssues";
import { configurableTextColumn } from "./SpreadsheetColumnConfiguration";
import { REPORT_TOOLBAR_ROW_CLASS } from "./ReportSpreadsheetUtils";
import { useSpreadsheetHeaderFormatting } from "./useSpreadsheetHeaderFormatting";
import { reportHeaderAppearance } from "./ReportSpreadsheetUtils";
import { reportColumnAppearance } from "./ReportSpreadsheetUtils";
import { useSpreadsheetRowHeights } from "./useSpreadsheetRowHeights";
import { SPREADSHEET_NUMBER_GUTTER_WIDTH as SPREADSHEET_GUTTER_WIDTH, SPREADSHEET_PANEL_CLASS, SPREADSHEET_ATTACHED_VIEWPORT_CLASS, SpreadsheetDetailsAction, SpreadsheetBlankRows, SpreadsheetRowNumber, useSpreadsheetViewport, useSpreadsheetFeedback } from "./SpreadsheetPresentation";
import {withTripDetailsColumn,tripDetailsTarget} from "../../services/report-action-columns";
import { CollaborativeCell } from "./CollaborativeCell";
import { useDraftTrackerColumns } from "./useDraftTrackerColumns";
import {useWholeTripSelection} from "../../hooks/useWholeTripSelection";
import {selectedParentTripIds} from "../../services/whole-trip-deletion";
import { updateLoadingReport } from "../../services/operations-report.service";
import {isTripTimeField,tripTimeDisplay,manilaDateTime,saveTripTime} from "../../services/trip-time";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSharedTableWidths } from "./useSharedTableWidths";
import { useSharedTableDesign } from "./useSharedTableDesign";
import ColumnFinder from "./ColumnFinder";
import {SpreadsheetHiddenColumns} from "./SpreadsheetWorkspace";
import TransactionCleanupNotice from "./TransactionCleanupNotice";
import {
  Building2,
  CalendarDays,
  ArrowUpRight,
  ChevronDown,
  LayoutGrid,
  Package,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Table2,
  Truck,
  UserRound,
  Download,
  GripVertical,
} from "lucide-react";
import type ExcelJS from "exceljs";
import { useAuth } from "../../context/AuthContext";
import { TRIP_EDIT_STEPS, REPORT_EDIT_STEPS, tripEditFieldStep, tripEditFieldChanged, validateTripEditField } from "../../services/trip-edit-wizard";
import WholeTripDeletionDialog from "./WholeTripDeletionDialog";
import FlexibleTableSectionTabs from "./FlexibleTableSectionTabs";
import { ApiError, invalidateApiCache } from "../../services/api.service";
import {
  fetchReportPage,
  fetchReportCollection,
  retainReportCollection,
  fetchNextReportCollection,
  fetchReportTripRows,
  updateReportCollection,
  getReportCollection,
  isDeletedReportRecord,
  removeCachedReportRecord,
  fetchReportColumns,
  fetchReportRows,
  getCachedReportPage,
  getStaleReportPage,
  invalidateReportData,
  retryReportRead,
  getSortableFields,
  REPORTS,
  setCachedReportPage,
  updateCachedReportPages,
  type Pagination,
  type ReportColumn,
  type ReportKey,
  type ReportRow,
  type ReportPageOptions,
} from "../../services/report.service";
import { getReportRowIdentity } from "../../services/report-row-identity";
import { confirmReportCellWrite } from "../../services/report-edit-confirmation";
import { useSpreadsheetCollaboration } from "./useSpreadsheetCollaboration";
import { COLLABORATION_SOURCES,collaborationSnapshot,subscribeCollaborationEvents,rememberConfirmedVersion,rememberConfirmedRecord,type CellTarget as CollaborationCell } from "../../services/collaboration.service";
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
  updateMasterListCell,
  updateTripBillingRecord,
  updateStoreCallRecord,
  updateTripLineItemRecord,
  updateTripRecord,
  updateTripStopRecord,
  saveTransactionReference,
} from "../../services/trip.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import {
  ReportTextCellEditor,
  ReportRowActionButton,
  ReportCellFormattingToolbar,
  ReportColumnActionsMenu,
  ReportColumnColorDialog,
  ReportDropdownOptionsDialog,
} from "./ReportSpreadsheetShared";
import { REPORT_GRID_BODY_CELL_CLASS, REPORT_GRID_HEADER_CELL_CLASS, REPORT_GRID_ROW_CLASS, REPORT_GRID_VIEWPORT_CLASS, chooseAutomaticPinSide, expandSpreadsheetRange, parseSpreadsheetClipboard, reportCellFormatKey, reorderColumnKeys, type ReportCellFormat } from "./ReportSpreadsheetUtils";
import { tableUi } from "./dashboardStyles";
import ReportDropdownEditor, { type ReportDropdownChoice } from "./ReportDropdownEditor";
import type { AdminNotificationTarget } from "../../services/notification.service";
import { StatusBadge } from "./TablePrimitives";

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

async function fetchAllReportRows(reportKey: ReportKey, token: string, sourceLines = false, options?:ReportPageOptions) {
  const filters: Record<string, string> = {...options?.filters,...(sourceLines?{source_lines:"true"}:{})};
  const columns = await fetchReportColumns(reportKey, token, false, sourceLines);
  const firstPage = await fetchReportRows(reportKey, token, {
    page: 1, limit: 100, search: options?.search??"", sortBy: options?.sortBy??"", sortOrder: options?.sortOrder??"asc", filters, fresh: true,
  });
  const rows = [...firstPage.rows];
  const identity=(row:ReportRow)=>getReportRowKey(reportKey,row);
  const seen=new Set(rows.map(identity));
  for (let pageNumber = 2; pageNumber <= firstPage.pagination.totalPages; pageNumber += 1) {
    const pageResult = await fetchReportRows(reportKey, token, {
      page: pageNumber, limit: 100, search: options?.search??"", sortBy: options?.sortBy??"", sortOrder: options?.sortOrder??"asc", filters, fresh: true,
    });
    if(pageResult.pagination.total!==firstPage.pagination.total)throw Error("Records changed during export. Retry to export the current matching data.");
    for(const row of pageResult.rows){const key=identity(row);if(!key||seen.has(key))throw Error("Report rows changed during export. Retry to avoid duplicate or missing rows.");seen.add(key);rows.push(row);}
  }
  if(rows.length!==firstPage.pagination.total)throw Error("The export is incomplete. Retry to export every matching row.");
  return { columns, rows };
}

function appendReportWorksheet(workbook: ExcelJS.Workbook, reportKey: ReportKey, columns: ReportColumn[], rows: ReportRow[]) {
  const visibleColumns = columns.filter((column) =>
    !column.key.startsWith("_") &&
    !["trip_id", "trip_stop_id", "trip_line_item_id"].includes(column.key),
  );
  const sheetTitle = reportKey === "dispatch-monitoring" && columns.some(column => column.key === "added_by_name") ? "Master List" : REPORTS[reportKey].title;
  const name = sheetTitle.replace(/[:\\/?*\x5B\x5D]/g, " ").slice(0, 31);
  const worksheet = workbook.addWorksheet(name || "Report");
  worksheet.columns = visibleColumns.map((column) => ({
    header: column.title,
    key: column.key,
    width: Math.min(32, Math.max(14, column.title.length + 2)),
    style: column.type === "number" ? { numFmt: "0.###" } : column.type === "date" ? { numFmt: "yyyy-mm-dd hh:mm" } : undefined,
  }));
  worksheet.addRows(operationalExportRows(rows).map((row) => Object.fromEntries(visibleColumns.map((column) => {
    const value = isTripTimeField(column.key)?tripTimeDisplay(row[column.key]):row[column.key];
    if (column.type === "date" && typeof value === "string") {
      const parsed = new Date(value);
      return [column.key, Number.isNaN(parsed.getTime()) ? value : parsed];
    }
    return [column.key, value ?? null];
  }))));
  const header = worksheet.getRow(1);
  header.height = 30;
  header.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2341" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell((cell, columnNumber) => {
    const sourceHeader = visibleColumns[columnNumber - 1]?.sourceHeader;
    if (sourceHeader) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${sourceHeader.background.slice(1)}` } };
      cell.font = { ...cell.font, color: { argb: `FF${sourceHeader.color.slice(1)}` } };
    }
    cell.border = { bottom: { style: "medium", color: { argb: "FFFFD43B" } } };
  });
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 24;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Aptos", size: 10, color: { argb: "FF17365D" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "hair", color: { argb: "FFD9E2EC" } },
        left: { style: "hair", color: { argb: "FFE5EAF0" } },
        bottom: { style: "hair", color: { argb: "FFD9E2EC" } },
        right: { style: "hair", color: { argb: "FFE5EAF0" } },
      };
      if (rowNumber % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F8FC" } };
      }
    });
  }
  if (visibleColumns.length > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, worksheet.rowCount), column: visibleColumns.length },
    };
  }
  worksheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function displayValue(value: unknown, type: string,field=""): string {
  if (isCbmField(field)) return cbmDisplay(value);
  if (field === "so_approval_date") return value == null ? "" : String(value).replace("T", " ");
  if(isTripTimeField(field))return tripTimeDisplay(value);
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

function getReportRowKey(reportKey: ReportKey, row: ReportRow): string | null {
  return getReportRowIdentity(reportKey, row);
}

function rowKey(reportKey: ReportKey, row: ReportRow, index: number): string {
  return getReportRowKey(reportKey, row) ??
    `unmapped:${reportKey}:${index}`;
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
    case "masterList":
      return `/trips/${encodeURIComponent(target.tripId ?? "")}/master-list-cell`;
    case "loadingReport":
      return `/reports/operations/loading/${encodeURIComponent(target.tripId ?? "")}/reports/${encodeURIComponent(target.loadingReportId ?? "")}`;
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

const createReportSelection = () => {
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
};

const ReportSelectionToolbar = memo(function ReportSelectionToolbar({
  selection: reportSelection,
  reportKey,
  rows,
  columns,
  onEdit,
  onDeleteTrips,
  onDeleteRows,
  onDeletePhysical,
  deletionCapabilities,
  canManage,
  disabled=false,
}: {
  selection: ReturnType<typeof createReportSelection>;
  reportKey: ReportKey;
  rows: ReportRow[];
  columns: ReportColumn[];
  onEdit: () => void;
  onDeleteTrips?: (rows:ReportRow[])=>void;
  onDeleteRows?: (targets:LineItemDeletionTarget[])=>void;
  onDeletePhysical?:(targets:PhysicalDeletionTarget[])=>void;
  deletionCapabilities:{storeCalls:boolean;emptyStops:boolean};
  canManage: boolean;
  disabled?:boolean;
}) {
  useSyncExternalStore(reportSelection.subscribe, reportSelection.revision, reportSelection.revision);
  const keys = reportSelection.getKeys(reportKey);
  if (!canManage) return null;
  if (!keys.length || !rows.some(candidate => keys.includes(getReportRowKey(reportKey, candidate) ?? ""))) return null;
  const row = rows.find((candidate) => getReportRowKey(reportKey, candidate) === keys[0]);
  const hasEditableFields = Boolean(row && columns.some((column) => getEditableCellTarget(row, column.key, reportKey)));
  const canEdit = !disabled && keys.length === 1 && Boolean(row) && hasEditableFields;
  const selected=keys.map(key=>rows.find(candidate=>getReportRowKey(reportKey,candidate)===key));
  const tripIds = selectedParentTripIds(selected);
  const physicalRows=selected.filter((candidate):candidate is ReportRow=>Boolean(candidate));
  // Store Calling rows represent calls, not their trip's cargo. Operational
  // event rows likewise must not offer a cargo deletion just because IDs coexist.
  const targets=!onDeleteTrips && physicalRows.length===keys.length
    ?reportLineItemDeletionTargets(reportKey,physicalRows):null;
  const physicalTargets=!targets&&!onDeleteTrips&&physicalRows.length===keys.length?physicalDeletionTargets(reportKey,physicalRows,deletionCapabilities):null;
  return <>{canEdit&&<ReportRowActionButton action="edit" onClick={onEdit} />}
    {physicalTargets&&onDeletePhysical&&<ReportRowActionButton action="delete" disabled={disabled} label={reportKey==="store-calling"?"Delete selected store calls only":"Delete selected empty stops only"} onClick={()=>onDeletePhysical(physicalTargets)}/>}
    {targets&&onDeleteRows&&<ReportRowActionButton action="delete" disabled={disabled} label="Delete selected line items only" onClick={()=>onDeleteRows(targets)}/>}
    {onDeleteTrips&&tripIds?.length===1&&<ReportRowActionButton action="delete" disabled={disabled} label="Delete Entire Trip" onClick={()=>onDeleteTrips(physicalRows)}/>}
  </>;

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

function defaultReportColumnWidth(column: ReportColumn): number {
  if (column.type === "action" || column.key === "trip_details") return 80;
  if (/remarks|comment|notes/i.test(column.key)) return 360;
  if (/customer_name|store_name|ship_to/i.test(column.key)) return 300;
  return Math.max(144, Math.min(360, column.title.length * 8 + 76));
}

type EditableCellTarget = ReportEditDefinition & {
  newProductDraft?: boolean;
  tripId?: string;
  stopId?: string;
  lineItemId?: string;
  assignmentId?: string;
  billingId?: string;
  storeCallId?: string;
  loadingReportId?: string;
};

const collaborationSources:Record<ReportEditDefinition["sourceEntity"],string>={masterList:"trips",trip:"trips",stop:"trip_stops",lineItem:"trip_line_items",assignment:"trip_truck_assignments",billing:"billings",storeCall:"store_calls",loadingReport:"loading_reports"};
function liveDraftCell(table:string,target:EditableCellTarget|null,trackerColumn?:string){
 if(!target || target.newProductDraft || target.sourceEntity === "masterList")return null;
 if(target.sourceField==="transmittal_ref")return trackerColumn&&target.tripId&&target.stopId?{table,source:"flex_columns",recordId:trackerColumn,field:"value",tripId:target.tripId,stopId:target.stopId}:null;
 const id={trip:target.tripId,stop:target.stopId,lineItem:target.lineItemId,assignment:target.assignmentId,billing:target.billingId,storeCall:target.storeCallId,loadingReport:target.loadingReportId}[target.sourceEntity];
 return id?{table,source:collaborationSources[target.sourceEntity],recordId:id,tripId:target.tripId,stopId:["stop","lineItem","storeCall"].includes(target.sourceEntity)?target.stopId:undefined,field:target.sourceField}:null;
}
function collaborationCell(table:string,target:EditableCellTarget|null,status:"selected"|"editing"="selected"):CollaborationCell|null {
 if (target?.newProductDraft) return null;
 // Loading reports refresh through secure change signals; they have no approved
 // per-record collaboration version. Do not invent a versioned socket identity.
 if(!target||target.sourceEntity==="masterList"||target.sourceEntity==="loadingReport"||target.sourceField==="transmittal_ref")return null;
 const recordId={trip:target.tripId,stop:target.stopId,lineItem:target.lineItemId,assignment:target.assignmentId,billing:target.billingId,storeCall:target.storeCallId,loadingReport:target.loadingReportId}[target.sourceEntity];
 return recordId?{table,source:collaborationSources[target.sourceEntity],recordId,tripId:target.tripId,stopId:["stop","lineItem","storeCall"].includes(target.sourceEntity)?target.stopId:undefined,field:target.sourceField,status}:null;
}

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
    loadingReportId?: string;
  };
  patch: ReportRow;
  version: number;
};

type EditingCell = {
  transmittalVersion?: number;
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
  loadingReportId?: string;
  relationshipId?: string;
  originalRelationshipId?: string;
  relationshipOption?: RelationshipOption;
  value: string;
  originalValue: string;
  originalTimestamp?:string;
  mentionProfileIds?: string[];
  mentionEventKey?: string;
  assignmentEventKey?: string;
};

type ReportColumnLayout = { order: string[]; hidden: string[]; colors?: Record<string, string>; widths?: Record<string, number> };
type FillGesture = {
  sourceRowKey: string;
  sourceField: string;
  sourceValue: string;
  targetRowKey: string;
  targetField: string;
  baseline: Map<string, unknown>;
};
type CellSelection = { anchorRowKey: string; anchorField: string; focusRowKey: string; focusField: string; mode?: "cells" | "row" | "column"; rows?: string[] };

function readReportColumnLayout(storageKey: string): ReportColumnLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<ReportColumnLayout> | null;
    return {
      order: Array.isArray(parsed?.order) ? parsed.order.filter((key): key is string => typeof key === "string") : [],
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter((key): key is string => typeof key === "string") : [],
      colors: parsed?.colors && typeof parsed.colors === "object"
        ? Object.fromEntries(Object.entries(parsed.colors).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^#[0-9a-f]{6}$/i.test(entry[1])))
        : {},
      widths: parsed?.widths && typeof parsed.widths === "object"
        ? Object.fromEntries(Object.entries(parsed.widths).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 100 && entry[1] <= 800))
        : {},
    };
  } catch {
    return { order: [], hidden: [] };
  }
}



function getEditableCellTarget(
  row: ReportRow,
  columnKey: string,
  reportKey: ReportKey,
): EditableCellTarget | null {
  const definition = getReportEditDefinition(reportKey, columnKey, row);
  if (!definition) return null;
  if (row._new_product_draft && definition.sourceEntity !== "lineItem") return null;
  const recordId = row[definition.recordIdField];
  if (typeof recordId !== "string" || !recordId) return null;
  const targetIds: Partial<EditableCellTarget> = {};
  if (definition.sourceEntity === "masterList") {
    targetIds.tripId = recordId;
    targetIds.stopId = typeof row.trip_stop_id === "string" ? row.trip_stop_id : undefined;
    targetIds.lineItemId = typeof row.trip_line_item_id === "string" ? row.trip_line_item_id : undefined;
  }
  if (definition.sourceEntity === "loadingReport") {
    if (typeof row.trip_id !== "string" || !row.trip_id) return null;
    targetIds.tripId = row.trip_id;
    targetIds.loadingReportId = recordId;
  }
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
  return { ...definition, ...targetIds, newProductDraft: Boolean(row._new_product_draft) };
}

function matchesEditedRecord(
  row: ReportRow,
  target: SavedRowReconciliation["target"],
): boolean {
  switch (target.sourceEntity) {
    case "masterList":
      return row.trip_id === target.tripId && (row.trip_stop_id ?? undefined) === target.stopId && (row.trip_line_item_id ?? undefined) === target.lineItemId;
    case "loadingReport":
      return row.loading_report_id === target.loadingReportId && row.trip_id === target.tripId;
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
  onOpenTrip?: (tripId: string, stopId?: string | null) => void;
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
    <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
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
            className="group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_2px_5px_rgba(11,35,65,0.035),0_12px_28px_-18px_rgba(11,35,65,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b9d4ea] hover:shadow-[0_16px_34px_-20px_rgba(11,35,65,0.3)] motion-reduce:transition-none">
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${statusDot(primaryStatus)}`} />
            <header className="flex items-start justify-between gap-3 px-4 pt-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-400">
                  {isStoreCall ? "Store call" : "Dispatch"}
                </p>
                <h3
                  className="mt-0.5 truncate text-base font-extrabold tracking-tight text-[#0b2341]"
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
              <div className="rounded-2xl border border-[#dbe7f3] bg-gradient-to-r from-[#f4f8fc] to-[#edf4fa] p-3.5">
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

              <div className="grid grid-cols-2 gap-2.5">
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
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-[#fff8dc] to-[#fff3bf] p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#0b2341] shadow-sm">
                    <Package aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-[#8a6d00]">
                      Cargo <span className="rounded-full bg-white/80 px-2 py-0.5 normal-case tracking-normal text-[#0b2341]">{group.length} line{group.length === 1 ? "" : "s"}</span>
                    </p>
                    <p className="mt-1 break-words text-[13px] font-semibold leading-snug text-[#0b2341]">
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
                          {displayValue(row[column.key], column.type,column.key) ||
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
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e6f0f9] text-[#2678b9]">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-slate-400">{label}</p>
        <p
          className="truncate text-[12px] font-bold text-[#0b2341]"
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
  showExport = true,
  onDataReady,
  pageTitle,
  pageSubtitle,
  onOpenTrip,
  onReportScopeChange,
  toolbarLeading,
  toolbarActions,
  createdTripReference,
  ongoingOnly = false,
  transactionView = false,
  allTripRecords = false,
}: {
  initialReport?: ReportKey;
  notificationTarget?: AdminNotificationTarget | null;
  showReportPicker?: boolean;
  showExport?: boolean;
  onDataReady?: (sheet:string)=>void;
  pageTitle?: string;
  pageSubtitle?: string;
  onOpenTrip?: (tripId: string, stopId?: string | null) => void;
  onReportScopeChange?: (value: ReportKey) => void;
  /** Controls placed before search in the report toolbar. */
  toolbarLeading?: ReactNode;
  /** Extra action buttons rendered at the end of the controls row above the table. */
  toolbarActions?: ReactNode;
  /** Optional custom visual layout selected by the existing Visual view control. */
  visualOverview?: ReactNode;
  /** Hide the shared report pagination footer for a custom visual overview. */
  hideVisualPagination?: boolean;
  /** Focus the table on a newly persisted trip after creation. */
  createdTripReference?: string | null;
  /** Restrict Dispatch Monitoring to trips with at least one unfinished stop. */
  ongoingOnly?: boolean;
  transactionView?: boolean;
  allTripRecords?: boolean;
}) {
  const { accessToken, refreshSession, profile } = useAuth();
  const [reportSelection] = useState(createReportSelection);
  const initializedSheet = useRef("");
  const selectionQuery = useRef("");
  const handledCreatedTrip = useRef<string|null|undefined>(undefined);
  const navigate = useNavigate();
  const [reportKey, setReportKey] = useState<ReportKey>(initialReport);
  useEffect(() => {
    reportEditDiagnostic("ReportDataView mounted", {
      mode: import.meta.env.MODE,
      development: import.meta.env.DEV,
    });
  }, []);
  const [viewMode, setViewMode] = useState<"visual" | "table">("table");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [selectionRecords,setSelectionRecords]=useState<ReportRow[]>([]),[selectionError,setSelectionError]=useState("");
  useSpreadsheetFeedback(selectionError,"error");
  const [productDrafts, setProductDrafts] = useState<ReportRow[]>([]);
  const productDraftsRef = useRef(productDrafts); productDraftsRef.current = productDrafts;
  const newRowCount = 1;
  const [newRowsBusy, setNewRowsBusy] = useState(false);
  const [newRowsMessage, setNewRowsMessage] = useState("");
  const [rowContext, setRowContext] = useState<"parent" | "stop" | "assignment" | null>(null);
  useEffect(() => {
    if (!productDrafts.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [productDrafts.length]);
  const [loadingMore,setLoadingMore]=useState(false);
  const moreRowsFlight=useRef(false);
  const [moreRowsError,setMoreRowsError]=useState("");
  const [dataColumns, setColumns] = useState<ReportColumn[]>([]);
  const columns=useMemo(()=>{const defaults=dataColumns.map(column=>({...column,title:spreadsheetColumnLabel(column.title)}));return defaults.length?rows.length?withTripDetailsColumn(defaults.filter(column=>column.key!=="trip_issues"),transactionView||reportKey==="combined"):defaults.filter(column=>!["trip_issues","trip_details"].includes(column.key)):[];},[dataColumns,rows.length,transactionView,reportKey]);
  const sharedWidths = useSharedTableWidths(transactionView ? "trips" : `report:${reportKey}`, accessToken, ["ADMIN", "STAFF"].includes(profile?.role ?? ""));
  const saveSharedColumnWidth = sharedWidths.save;
  const columnLayoutStorageKey = `alzhen:report-column-layout:${profile?.id ?? "user"}:${reportKey}`;
  const [localColumnLayout, setColumnLayout] = useState<ReportColumnLayout>(() =>
    typeof window === "undefined" ? { order: [], hidden: [] } : readReportColumnLayout(`alzhen:report-column-layout:${profile?.id ?? "user"}:${initialReport}`),
  );
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(null);
  const [physicalDeletion,setPhysicalDeletion]=useState<PhysicalDeletionTarget[]|null>(null);
  const [deletionCapabilities,setDeletionCapabilities]=useState({storeCalls:false,emptyStops:false});
  useEffect(()=>{if(!accessToken||transactionView)return;let live=true;void readRecordDeletionCapabilities(accessToken).then(result=>{if(live)setDeletionCapabilities(result);}).catch(()=>{if(live)setDeletionCapabilities({storeCalls:false,emptyStops:false});});return()=>{live=false;};},[accessToken,transactionView]);
  const [rowDeletion,setRowDeletion]=useState<LineItemDeletionTarget[]|null>(null);
  const [cellContextMenu,setCellContextMenu]=useState<{x:number;y:number;row:string;field:string}|null>(null);
  useEffect(()=>()=>setCellContextMenu(null),[reportKey,accessToken]);
  useSyncExternalStore(reportSelection.subscribe,reportSelection.revision,reportSelection.revision);
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [columnResize, setColumnResize] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const [fillGesture, setFillGesture] = useState<FillGesture | null>(null);
  const fillGestureRef = useRef<FillGesture | null>(null);
  const deletedTripIds = useRef(new Set<string>());
  const deletionRowKeys = useRef<string[]>([]);
  useEffect(() => { deletedTripIds.current.clear(); }, [accessToken]);
  const [localPinnedColumnSides, setPinnedColumnSides] = useState<Record<string, "left" | "right">>({});
  const [leftPinOffsets, setLeftPinOffsets] = useState<Record<string, number>>({});
  const [rightPinOffsets, setRightPinOffsets] = useState<Record<string, number>>({});
  const [pinningNotice, setPinningNotice] = useState("");
  const [openColumnMenu, setOpenColumnMenu] = useState<{ key: string; left: number; top: number } | null>(null);
  const [editingColumnColor, setEditingColumnColor] = useState<string | null>(null);
  const [managingDropdownField, setManagingDropdownField] = useState<DropdownField | null>(null);
  useEffect(() => {
    if (!columnResize) return;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    let latestWidth = columnResize.startWidth;
    const move = (event: PointerEvent) => {
      const width = Math.max(60, Math.min(800, columnResize.startWidth + event.clientX - columnResize.startX));
      latestWidth = width;
      setColumnLayout((current) => {
        const next = { ...current, widths: { ...(current.widths ?? {}), [columnResize.key]: width } };
        return next;
      });
    };
    const finish = () => {
      if (latestWidth !== columnResize.startWidth) void saveSharedColumnWidth(columnResize.key, latestWidth);
      setColumnLayout((current) => {
        try { window.localStorage.setItem(columnLayoutStorageKey, JSON.stringify(current)); } catch { /* Widths remain usable for this session. */ }
        return current;
      });
      setColumnResize(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [columnLayoutStorageKey, columnResize, saveSharedColumnWidth]);
  useEffect(() => {
    if (!openColumnMenu && !editingColumnColor) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenColumnMenu(null);
      setEditingColumnColor(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editingColumnColor, openColumnMenu]);
  const [editModalFields, setEditModalFields] = useState<{
    column: ReportColumn;
    cell: EditingCell;
  }[]>([]);
  const [editModalRecord, setEditModalRecord] = useState<ReportRow | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const {tripIds:wholeTripIds,setTripIds:setWholeTripIds}=useWholeTripSelection(`${profile?.id??""}:${profile?.role??""}:${accessToken??""}`);
  const [wholeTripRowCount,setWholeTripRowCount]=useState(0);
  const editSteps=transactionView?TRIP_EDIT_STEPS:REPORT_EDIT_STEPS;
  const [editModalBusy, setEditModalBusy] = useState(false);
  const [editModalError, setEditModalError] = useState("");
  const [tripEditStep, setTripEditStep] = useState(0);
  const tripEditHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (editModalOpen) tripEditHeading.current?.focus();
  }, [transactionView, editModalOpen, tripEditStep]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>(
    {},
  );
  const queryFilters = useMemo(() => {
    const filters=transactionView&&!allTripRecords?{...appliedFilters,active_transactions:"true",archive_scope:"active"}:ongoingOnly?{...appliedFilters,ongoing_only:"true"}:appliedFilters;
    const scoped = allTripRecords ? { ...filters, source_lines: "true" } : filters;
    return !transactionView&&deletionCapabilities.emptyStops?{...scoped,record_delete_versions:"true"}:scoped;
  }, [appliedFilters, ongoingOnly, transactionView, allTripRecords, deletionCapabilities.emptyStops]);
  const [sortBy, setSortBy] = useState(getSortableFields(initialReport)[0]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const bufferedTextDraft = useRef<EditingCell | null>(null);
  const sharedDesign=useSharedTableDesign(transactionView?"trips":`report:${reportKey}`,accessToken,["ADMIN","STAFF"].includes(profile?.role??""),Boolean(editingCell||editModalOpen||columnResize||draggedColumnKey||fillGesture));
  const rowHeights = useSpreadsheetRowHeights(transactionView ? "trips" : `report:${reportKey}`, sharedDesign);
  const fixedHeaders = useMemo(() => allTripRecords ? Object.fromEntries(columns.flatMap(column => column.sourceHeader ? [[column.key, { backgroundColor: column.sourceHeader.background, color: column.sourceHeader.color }]] : [])) : undefined, [allTripRecords, columns]);
  const sourceHeaderGroups = useMemo(() => allTripRecords ? [...new Map(columns.flatMap(column => column.sourceHeader ? [[column.sourceHeader.group, column.sourceHeader] as const] : [])).values()] : [], [allTripRecords, columns]);
  const headerFormatting = useSpreadsheetHeaderFormatting(transactionView ? "trips" : `report:${reportKey}`, sharedDesign.canEdit, sharedDesign.columns, (key, header) => { void sharedDesign.save(key, { header }, getColumnWidth(key)); }, (key, alias) => { void sharedDesign.save(key, { alias }, getColumnWidth(key)); }, (key, input) => { void sharedDesign.save(key, { input }, getColumnWidth(key)); }, fixedHeaders);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const autoFit = useSheetAutoFit(tableViewportRef, columns, rows);
  const columnLayout=useMemo<ReportColumnLayout>(()=>{
    const design=sharedDesign.columns;
    const layout=sharedDesign.loaded?{order:columns.map(c=>c.key).sort((a,b)=>(design[a]?.position??1001)-(design[b]?.position??1001)),hidden:Object.keys(design).filter(k=>design[k].hidden),colors:Object.fromEntries(Object.entries(design).filter(([,v])=>v.color).map(([k,v])=>[k,v.color!]))}:{...localColumnLayout,colors:{},hidden:[],order:columns.map(column=>column.key)};
    return {...layout,widths:columnResize?localColumnLayout.widths:{...(sharedWidths.loaded?{}:localColumnLayout.widths),...sharedWidths.widths,...autoFit.widths}};
  },[sharedDesign.columns,sharedDesign.loaded,columns,localColumnLayout,columnResize,sharedWidths.loaded,sharedWidths.widths,autoFit.widths]);
  const pinnedColumnSides=localPinnedColumnSides;
  useEffect(()=>{let live=true;if(sharedDesign.loaded){const next=Object.fromEntries(Object.entries(sharedDesign.columns).flatMap(([k,v])=>v.pin?[[k,v.pin]]:[])) as Record<string,"left"|"right">;queueMicrotask(()=>{if(live)setPinnedColumnSides(next);});}return()=>{live=false;};},[sharedDesign.columns,sharedDesign.loaded]);
  const cellFormats=useMemo(()=>Object.fromEntries(Object.entries(sharedDesign.columns).flatMap(([column,design])=>Object.entries(design.cells??{}).flatMap(([row,format])=>format?[[reportCellFormatKey(row,column),format]]:[]))),[sharedDesign.columns]);
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
  const quickFilterConfig = transactionView ? {field:"issue_filter", dropdown:null, label:"Trip status and issue filters"} :
    reportKey === "dispatch-monitoring" ? {field:"trip_status", dropdown:"trip_status" as const, label:"Trip status filters"} :
    reportKey === "dispatch" ? {field:"delivery_status", dropdown:"delivery_status" as const, label:"Delivery status filters"} :
    reportKey === "trip-booking" ? {field:"letter_status", dropdown:"letter_status" as const, label:"Dispatch letter status filters"} :
    reportKey === "store-calling" ? {field:"status", dropdown:"store_call_status" as const, label:"Store contact status filters"} : null;
  const quickFilterValue = quickFilterConfig ? appliedFilters[quickFilterConfig.field] ?? (transactionView ? "All" : "") : "";
  let quickFilterOptions = transactionView
    ? ["All","In Progress","Demurrage","Offload","Backload","Completed"].map(value=>({value,label:value}))
    : [{value:"",label:"All"},...(quickFilterConfig?.dropdown ? dropdownChoicesByField[quickFilterConfig.dropdown] ?? [] : [])];
  if (quickFilterValue && !quickFilterOptions.some(option=>option.value===quickFilterValue)) quickFilterOptions.push({value:quickFilterValue,label:quickFilterValue});
  // Presentation only: preserve configured status values and other dropdown labels.
  if (!transactionView && ["dispatch-monitoring", "trip-booking", "store-calling"].includes(reportKey)) {
    quickFilterOptions = quickFilterOptions.map(option => ({...option, label: option.label.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase())}));
  }
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

  const headerCellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const cancelNextBlur = useRef(false);
  const mentionControlActive = useRef(false);
  const sortableFields =
    columns.length > 0
      ? columns
          .filter((column) => column.key !== "route" && column.type !== "action")
          .map((column) => column.key)
      : getSortableFields(reportKey);
  const activeSortBy = sortableFields.includes(sortBy)
    ? sortBy
    : getSortableFields(reportKey)[0];
  const effectiveSearch = appliedSearch;
  const searchNeedle = appliedSearch.trim().toLocaleLowerCase();
  const displayedRows = useMemo(() => insertProductDrafts(rows, productDrafts, row => getReportRowKey(reportKey, row)), [rows, productDrafts, reportKey]);
  const displayedRowsRef = useRef<ReportRow[]>(displayedRows);
  displayedRowsRef.current = displayedRows;
  const columnsByKey = useMemo(() => new Map(columns.map(column => [column.key, column])), [columns]);
  const layoutColumnKeys = useMemo(() => {
    // Preserve stored formatting and visibility while following the CSV order.
    if (allTripRecords && reportKey === "dispatch-monitoring") return columns.map(column => column.key);
    const availableKeys = new Set(columns.map((column) => column.key));
    const orderedKeys = [
      ...columnLayout.order.filter((key) => availableKeys.has(key)),
      ...columns.map((column) => column.key).filter((key) => !columnLayout.order.includes(key)),
    ];
    return orderedKeys;
  }, [columnLayout.order, columns, allTripRecords, reportKey]);
  const hiddenColumnKeys = useMemo(
    () => new Set(columnLayout.hidden.filter((key) => columnsByKey.has(key))),
    [columnLayout.hidden, columnsByKey],
  );
  const gridColumns = useMemo(
    () => layoutColumnKeys.filter((key) => !hiddenColumnKeys.has(key)).flatMap((key) => {
      const column = transactionView && !allTripRecords && key === "warehouse_code" ? undefined : columnsByKey.get(key);
      return column ? [column] : [];
    }),
    [columnsByKey, hiddenColumnKeys, layoutColumnKeys, transactionView, allTripRecords],
  );
  const hiddenColumns = useMemo(
    () => layoutColumnKeys.filter((key) => hiddenColumnKeys.has(key)).flatMap((key) => {
      const column = columnsByKey.get(key);
      return column ? [column] : [];
    }),
    [columnsByKey, hiddenColumnKeys, layoutColumnKeys],
  );
  const leftPinnedColumnKeys = useMemo(
    () => gridColumns.filter((column) => pinnedColumnSides[column.key] === "left").map((column) => column.key),
    [gridColumns, pinnedColumnSides],
  );
  const rightPinnedColumnKeys = useMemo(
    () => gridColumns.filter((column) => pinnedColumnSides[column.key] === "right").map((column) => column.key),
    [gridColumns, pinnedColumnSides],
  );
  // Pinning is a viewport behavior; retain the user's logical shared column order.
  const renderedGridColumns = gridColumns;
  const spreadsheetPadding = useSpreadsheetViewport(tableViewportRef, displayedRows.length, viewMode === "table");
  const presentationColumns=useMemo<ReportColumn[]>(()=>renderedGridColumns.length?renderedGridColumns:Array.from({length:5},(_,index)=>({key:`__loading_${index}`,title:"",type:"action"})),[renderedGridColumns]);
  const infiniteRows=viewMode==="table";
  const sheetRowOffset=infiniteRows?0:(page-1)*50;
  const virtualGridRows=useMemo(()=>Array.from({length:spreadsheetPadding.count},(_,index)=>({id:`virtual:${transactionView?"trips":reportKey}:slot:${sheetRowOffset+displayedRows.length+index+1}`})),[spreadsheetPadding.count,transactionView,reportKey,sheetRowOffset,displayedRows.length]);
  const issueTripIds=useMemo(()=>displayedRows.flatMap(row=>typeof (row.trip_id??row._trip_id)==="string"?[String(row.trip_id??row._trip_id)]:[]),[displayedRows]);
  const physicalGridKeys=useMemo(()=>displayedRows.map((row,index)=>getReportRowKey(reportKey,row)??`display:${reportKey}:${page}:${index}`),[displayedRows,reportKey,page]);
  const gridRowIndex=useMemo(()=>new Map(physicalGridKeys.map((key,index)=>[key,index])),[physicalGridKeys]);
  const formulaRowLookup=useMemo(()=>new Map(displayedRows.flatMap((row,index)=>{const id=physicalRowIdentity(row);return id?[[id,{row,index}] as const]:[];})),[displayedRows]);
  const selectionRowKeys=useMemo(()=>[...physicalGridKeys,...virtualGridRows.map(row=>row.id)],[physicalGridKeys,virtualGridRows]);
  const formulaColumns=presentationColumns;
  const selectedFormatCellKeys = useMemo(() => {
    if (!cellSelection) return new Set<string>();
    const rowStart=selectionRowKeys.indexOf(cellSelection.anchorRowKey),rowEnd=selectionRowKeys.indexOf(cellSelection.focusRowKey);
    const columnStart=presentationColumns.findIndex(column=>column.key===cellSelection.anchorField),columnEnd=presentationColumns.findIndex(column=>column.key===cellSelection.focusField);
    if((cellSelection.mode!=="row"&&[rowStart,rowEnd].some(index=>index<0))||[columnStart,columnEnd].some(index=>index<0))return new Set<string>();
    const selectedRows=cellSelection.mode==="column"?selectionRowKeys:cellSelection.mode==="row"?(cellSelection.rows??[cellSelection.anchorRowKey]):selectionRowKeys.slice(Math.min(rowStart,rowEnd),Math.max(rowStart,rowEnd)+1);
    const formatRows=cellSelection.mode==="row"&&selectedRows.length>1000?selectionRowKeys.filter(key=>selectedRows.includes(key)):selectedRows;
    const selectedColumns=cellSelection.mode==="row"?presentationColumns:presentationColumns.slice(Math.min(columnStart,columnEnd),Math.max(columnStart,columnEnd)+1);
    return new Set(formatRows.flatMap(row=>selectedColumns.map(column=>reportCellFormatKey(row,column.key))));
  }, [cellSelection, selectionRowKeys, presentationColumns]);
  const queryKey = JSON.stringify({
    accessToken,
    activeSortBy,
    appliedFilters: queryFilters,
    appliedSearch: effectiveSearch,
    page,
    reportKey,
    retryVersion,
    sortBy: activeSortBy,
    sortOrder,
  });
  const snapshotKey = JSON.stringify({ accessToken, activeSortBy, appliedFilters: queryFilters, appliedSearch: effectiveSearch, page, reportKey, sortOrder });
  const pageOptions = useMemo(() => ({
    page,
    limit: 50,
    search: effectiveSearch,
    sortBy: activeSortBy,
    sortOrder,
    filters: queryFilters,
  }), [activeSortBy, queryFilters, effectiveSearch, page, sortOrder, allTripRecords]);
  const formulas=useOperationalFormulas({viewport:tableViewportRef,token:accessToken,table:transactionView?"trips":`report:${reportKey}`,rows:displayedRows,columns:formulaColumns,identity:physicalRowIdentity,sourceEditor:prepareFormulaSource,virtualRows:virtualGridRows,onSelect:syncGridCellSelection,rowOffset:sheetRowOffset,canEdit:["ADMIN","STAFF"].includes(profile?.role??"")&&!headerFormatting.key,paused:Boolean(editingCell||editModalOpen||fillGesture)});
  const formulaFocusIndex=useMemo(()=>formulas.selectedIdentity?(formulaRowLookup.get(formulas.selectedIdentity)?.index??-1):-1,[formulas.selectedIdentity,formulaRowLookup]);
  const virtualItems = useVirtualSpreadsheetRows(tableViewportRef, physicalGridKeys, viewMode === "table", editingCell?physicalGridKeys.indexOf(editingCell.rowKey):formulaFocusIndex,rowHeights.heights);
  useEffect(()=>accessToken&&infiniteRows?retainReportCollection(reportKey,accessToken,pageOptions):undefined,[accessToken,reportKey,snapshotKey,infiniteRows]);
  const snapshotKeyRef = useRef(snapshotKey);
  const loadedSnapshotKeyRef = useRef<string | null>(null);
  const reportKeyRef = useRef(reportKey);
  const appliedNotificationTarget = useRef<string | null>(null);
  const handledNotificationTarget = useRef<string | null>(null);
  const inFlightReportQueries = useRef(new Map<string, number>());
  const realtimeRefreshDirty = useRef(false);
  const dropdownRefreshPending = useRef(false);
  const activeReportEdit = useRef(false);
  activeReportEdit.current = Boolean(productDrafts.length || editingCell || editModalOpen || formulas.draftPending || formulas.busy || physicalDeletion || rowDeletion);
  const realtimeRefreshQueuedFor = useRef<string | null>(null);
  const realtimeRefreshTimer = useRef<number | null>(null);
  const realtimeRefreshMaxTimer = useRef<number | null>(null);
  const diagnosticEditTarget = useRef<{ reportKey: ReportKey; tripId?: string; stopId?: string; field: string } | null>(null);
  const successfulSaveVersion = useRef(0);
  const savedRowReconciliations = useRef<SavedRowReconciliation[]>([]);
  const targetedRefreshes=useRef(new Map<string,Promise<void>>());
  const targetedDirty=useRef(new Set<string>());
  const savedTripRefreshes=useRef(new Map<string,string>());
  function refreshOneTrip(tripId:string){
    if(!allTripRecords||!accessToken||!tripId||activeReportEdit.current||loadedSnapshotKeyRef.current!==snapshotKey)return false;
    const targetKey=`${snapshotKey}:${tripId}`;
    if(targetedRefreshes.current.has(targetKey)){targetedDirty.current.add(targetKey);return true;}
    const requestedSnapshot=snapshotKey,token=accessToken;
    let readFailed=false;
    const request=fetchReportTripRows(reportKey,token,pageOptions,tripId).then(next=>{
      if(snapshotKeyRef.current!==requestedSnapshot)return;
      if(activeReportEdit.current){realtimeRefreshDirty.current=true;return;}
      const merge=(current:ReportRow[])=>{
        const updated=[...current.filter(row=>String(row.trip_id??row._trip_id)!==tripId),...next.filter(row=>!deletedTripIds.current.has(String(row.trip_id??row._trip_id)))];
        return updated.sort((a,b)=>{const left=a[activeSortBy],right=b[activeSortBy];if(left==null&&right==null)return 0;if(left==null)return 1;if(right==null)return -1;const compared=typeof left==="number"&&typeof right==="number"?left-right:String(left).localeCompare(String(right),undefined,{numeric:true});return sortOrder==="asc"?compared:-compared;});
      };
      setRows(merge);updateReportCollection(reportKey,token,pageOptions,merge);
    }).catch(()=>{readFailed=true;}).finally(()=>{targetedRefreshes.current.delete(targetKey);if(targetedDirty.current.delete(targetKey)&&!readFailed&&snapshotKeyRef.current===requestedSnapshot)refreshOneTripRef.current(tripId);});
    targetedRefreshes.current.set(targetKey,request);return true;
  }
  const refreshOneTripRef=useRef(refreshOneTrip);refreshOneTripRef.current=refreshOneTrip;
  const collaboration=useSpreadsheetCollaboration(transactionView?"trips":reportKey,accessToken,profile?.id,(commit,record)=>{
    if(["trip_cargo_allocations","trip_assignment_stops"].includes(commit.source)||commit.source==="trip_truck_assignments"&&commit.fields.includes("stop_scope")){
      if(activeReportEdit.current)realtimeRefreshDirty.current=true;else if(!commit.tripId||!refreshOneTrip(commit.tripId))scheduleRealtimeRefreshRef.current();return;
    }
    if(commit.operation==="DELETE"&&commit.source==="trips"&&editingCell?.tripId!==commit.recordId){
      deletedTripIds.current.add(commit.recordId);
      const retain=(current:ReportRow[])=>current.filter(row=>row.trip_id!==commit.recordId);
      setRows(retain);
      if(accessToken)updateCachedReportPages(reportKey,accessToken,bundle=>({...bundle,rows:retain(bundle.rows)}));
      if(!allTripRecords)scheduleRealtimeRefreshRef.current();
      return;
    }
    if(commit.operation==="DELETE"&&["trip_line_items","trip_stops","trip_truck_assignments","store_calls"].includes(commit.source)){
      const field={trip_line_items:"trip_line_item_id",trip_stops:"trip_stop_id",trip_truck_assignments:"assignment_id",store_calls:"store_call_id"}[commit.source as "trip_line_items"|"trip_stops"|"trip_truck_assignments"|"store_calls"];
      removeCachedReportRecord(commit.source,commit.recordId);
      const retain=(current:ReportRow[])=>current.filter(row=>(row[field]??row[`_${field}`])!==commit.recordId);
      setRows(retain);if(accessToken)updateCachedReportPages(reportKey,accessToken,bundle=>({...bundle,rows:retain(bundle.rows)}));
      if(!commit.tripId||!refreshOneTrip(commit.tripId))scheduleRealtimeRefreshRef.current();return;
    }
    if(!record){const trip=commit.source==="trips"?commit.recordId:commit.tripId;if(!trip||!refreshOneTrip(trip))scheduleRealtimeRefreshRef.current();return;}
    const directField: string|undefined=({trips:"trip_id",trip_stops:"trip_stop_id",trip_line_items:"trip_line_item_id",trip_truck_assignments:"assignment_id",billings:"billing_id",store_calls:"store_call_id",loading_reports:"loading_report_id"} as Record<string,string>)[commit.source];
    const refers=(row:ReportRow)=>!directField||row[directField]===commit.recordId||row[`_${directField}`]===commit.recordId;
    const firstMatch=(()=>{for(const row of rows){if(!refers(row))continue;for(const column of columns){const target=getEditableCellTarget(row,column.key,reportKey),cell=collaborationCell(transactionView?"trips":reportKey,target);if(cell?.source===commit.source&&cell.recordId===commit.recordId)return {row,column,target};}}return undefined;})();
    const firstTarget=firstMatch?.target;
    if(firstTarget&&firstMatch){const patch:ReportRow={};for(const column of columns){const target=getReportEditDefinition(reportKey,column.key,firstMatch.row);if(target&&target.sourceEntity===firstTarget.sourceEntity&&target.editor!=="relationship"&&Object.hasOwn(record,target.sourceField))patch[column.key]=record[target.sourceField];}savedRowReconciliations.current.push({reportKey,target:firstTarget,patch,version:++successfulSaveVersion.current});}
    const patchRows=(current:ReportRow[])=>current.map(row=>{
      if(!refers(row))return row;
      const matching=columns.map(column=>({column,target:getEditableCellTarget(row,column.key,reportKey)})).filter(({target})=>{const cell=collaborationCell(transactionView?"trips":reportKey,target);return cell?.source===commit.source&&cell.recordId===commit.recordId;});
      if(!matching.length||!record)return row;
      const patch:ReportRow={};
      for(const {column,target} of matching)if(target&&target.editor!=="relationship"&&Object.hasOwn(record,target.sourceField))patch[column.key]=record[target.sourceField];
      return {...row,...patch};
    });
    setRows(patchRows);
    if(accessToken)updateCachedReportPages(reportKey,accessToken,bundle=>({...bundle,rows:patchRows(bundle.rows)}));
    // A source relationship changes derived labels; keep drafts and use the
    // established deferred page refresh rather than guessing those labels.
    const relationshipChanged=firstMatch&&columns.some(column=>{const def=getReportEditDefinition(reportKey,column.key,firstMatch.row);return def?.editor==="relationship"&&def.relationship&&collaborationSources[def.sourceEntity]===commit.source&&Object.hasOwn(record,def.sourceField)&&record[def.sourceField]!==firstMatch.row[def.relationship.idField];});
    const sortTarget=firstMatch?getReportEditDefinition(reportKey,sortBy,firstMatch.row):undefined;
    const sortChanged=Boolean(sortTarget&&firstMatch&&collaborationSources[sortTarget.sourceEntity]===commit.source&&Object.hasOwn(record,sortTarget.sourceField)&&record[sortTarget.sourceField]!==firstMatch.row[sortBy]);
    const queryAffected=Boolean(appliedSearch||Object.values(appliedFilters).some(Boolean)||sortChanged);
    if(!firstMatch||commit.operation==="INSERT"||relationshipChanged||queryAffected){if(activeReportEdit.current)realtimeRefreshDirty.current=true;else{const trip=commit.source==="trips"?commit.recordId:commit.tripId;if(!trip||!refreshOneTrip(trip))scheduleRealtimeRefreshRef.current();}}
  });
  const draftTrackerColumns=useDraftTrackerColumns(accessToken,columns.some(column=>column.key==="transmittal_ref"));
  const selectionScope=JSON.stringify([accessToken,reportKey,pageOptions]);
  const selectAllRequest=useSpreadsheetSelectAll(selectionScope,setSelectionError);
  const selectionRows=useMemo(()=>[...new Map([...selectionRecords,...displayedRows].flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[[key,row] as const]:[];})).values()],[selectionRecords,displayedRows,reportKey]);
  const selectedRowKeys=cellSelection?.mode==="row"?cellSelection.rows??[cellSelection.anchorRowKey]:[];
  const selectedPhysicalCount=selectedRowKeys.filter(key=>!key.startsWith("virtual:")&&!key.startsWith("display:")).length;
  const allMatchingRowsSelected=selectedPhysicalCount>0&&selectedPhysicalCount===(pagination?.total??displayedRows.length);
  const rangeDrag=useSpreadsheetDragSelection({viewport:tableViewportRef,scope:selectionScope,blocked:Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending||selectAllRequest.busy),onSelect:selectFormatKey,onFinish:(key,field)=>{
    const row=displayedRows.find(row=>getReportRowKey(reportKey,row)===key),id=row?physicalRowIdentity(row):key;
    if(id)formulas.selectCell(id,field,true);
    requestAnimationFrame(()=>tableViewportRef.current?.querySelector<HTMLElement>(`td[data-range-row="${CSS.escape(key)}"][data-range-column="${CSS.escape(field)}"]`)?.focus({preventScroll:true}));
  }});
  const selectedCollaborationRow=cellSelection?displayedRows[gridRowIndex.get(cellSelection.focusRowKey)??-1]:null;
  const localCollaborationTarget=editingCell?{...editingCell.definition,...editingCell}:selectedCollaborationRow&&cellSelection?getEditableCellTarget(selectedCollaborationRow,cellSelection.focusField,reportKey):null;
  const presenceIdentity=JSON.stringify(collaborationCell(transactionView?"trips":reportKey,localCollaborationTarget,editingCell?"editing":"selected"));
  const focusCollaboration=collaboration.focus;
  useEffect(()=>{focusCollaboration(JSON.parse(presenceIdentity));},[presenceIdentity,focusCollaboration,accessToken]);
  snapshotKeyRef.current = snapshotKey;
  reportKeyRef.current = reportKey;

  useEffect(() => {
    setColumnLayout(readReportColumnLayout(columnLayoutStorageKey));
  }, [columnLayoutStorageKey]);

  useEffect(() => {
    setCellSelection(null);
  }, [reportKey, accessToken]);

  useLayoutEffect(() => {
    const measurePinnedColumns = () => {
      let left = selectionColumnRef.current?.getBoundingClientRect().width ?? SPREADSHEET_GUTTER_WIDTH;
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
      activeReportEdit.current ||
      cellSaveInFlight.current ||
      (inFlightReportQueries.current.get(targetSnapshot) ?? 0) > 0 ||
      realtimeRefreshQueuedFor.current === targetSnapshot
    ) {
      realtimeRefreshDirty.current = true;
      return;
    }
    realtimeRefreshQueuedFor.current = targetSnapshot;
    if (dropdownRefreshPending.current) { dropdownRefreshPending.current = false; void reloadDropdownOptions().catch(() => {}); }
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
    if (activeReportEdit.current) return;
    if (realtimeRefreshDirty.current) {
      savedTripRefreshes.current.clear();
      realtimeRefreshDirty.current = false;
      scheduleRealtimeRefreshRef.current();
    } else {
      const tripIds = [...savedTripRefreshes.current].filter(([, owner]) => owner === snapshotKeyRef.current).map(([tripId]) => tripId);
      savedTripRefreshes.current.clear();
      for (const tripId of tripIds) if (!refreshOneTripRef.current(tripId)) scheduleRealtimeRefreshRef.current();
    }
  }, [editingCell, editModalOpen, formulas.draftPending, formulas.busy, physicalDeletion, rowDeletion]);

  useEffect(() => {
    const owner=JSON.stringify([initialReport,profile?.id,profile?.role]);
    if(initializedSheet.current===owner)return;
    initializedSheet.current=owner;
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
  }, [initialReport, profile?.id, profile?.role]);

  useEffect(() => {
    if (!createdTripReference) { handledCreatedTrip.current=createdTripReference; return; }
    if(handledCreatedTrip.current===createdTripReference)return;
    handledCreatedTrip.current=createdTripReference;
    invalidateReportData(reportKeyRef.current);
    setPage(1);
    setSearch(createdTripReference);
    setAppliedSearch(createdTripReference);
    setAppliedFilters({});
    setViewMode("table");
    setRetryVersion((version) => version + 1);
    reportSelection.clear();
  }, [createdTripReference]);

  useEffect(() => {
    const imported = () => { invalidateReportData(reportKeyRef.current); setRetryVersion(version => version + 1); };
    window.addEventListener("alzhen:trip-imported", imported);
    return () => window.removeEventListener("alzhen:trip-imported", imported);
  }, []);

  useEffect(() => {
    const query=selectionScope;
    if(selectionQuery.current===query)return;
    selectionQuery.current=query;
    reportSelection.clear(reportKey);
    setSelectionRecords([]);setCellSelection(null);setSelectionError("");
    setEditModalOpen(false);
  }, [selectionScope,reportKey,reportSelection]);

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

  useEffect(()=>{
    if(loadedQueryKey===queryKey&&requestError?.key!==queryKey)onDataReady?.(transactionView?"trips":reportKey);
  },[loadedQueryKey,queryKey,requestError,onDataReady,transactionView,reportKey]);

  useLayoutEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;
    const collectionAbort = new AbortController();
    const cached = infiniteRows ? getReportCollection(reportKey, accessToken, pageOptions) : getCachedReportPage(reportKey, accessToken, pageOptions);
    const displayCache = cached ?? (infiniteRows ? getReportCollection(reportKey, accessToken, pageOptions,true) : getStaleReportPage(reportKey, accessToken, pageOptions));
    if (displayCache) {
      setColumns(displayCache.columns);
      setRows(displayCache.rows.filter(row => !deletedTripIds.current.has(String(row.trip_id))));
      setPagination(displayCache.pagination);
      setLoadedQueryKey(queryKey);
      loadedSnapshotKeyRef.current = snapshotKey;
    } else if (loadedSnapshotKeyRef.current === snapshotKey) {
      setLoadedQueryKey(queryKey);
    } else {
      // Preserve a known schema/widths while the requested rows load.
      setRows([]);
      setPagination(null);
    }
    if(!displayCache)void fetchReportColumns(reportKey,accessToken,false,allTripRecords).then(next=>{if(active)setColumns(next);}).catch(()=>{
      // The deduplicated page request below owns the visible failure/retry outcome.
    });

    inFlightReportQueries.current.set(
      snapshotKey,
      (inFlightReportQueries.current.get(snapshotKey) ?? 0) + 1,
    );
    const requestSaveVersion = successfulSaveVersion.current;
    let readFailed = false;
    if (realtimeRefreshQueuedFor.current === snapshotKey) {
      realtimeRefreshQueuedFor.current = null;
    }

    void (async () => {
      try {
        const result = infiniteRows
          ? await fetchReportCollection(reportKey, accessToken, pageOptions, progress=>{
              if(!active||activeReportEdit.current||successfulSaveVersion.current!==requestSaveVersion)return;
              setColumns(progress.columns);
              if(!displayCache){setRows(progress.rows.filter(row=>!deletedTripIds.current.has(String(row.trip_id))));setPagination(progress.pagination);}
            }, !cached && Boolean(displayCache), collectionAbort.signal)
          : await fetchReportPage(reportKey, accessToken, pageOptions, !cached && Boolean(displayCache));
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
        if (activeReportEdit.current && loadedSnapshotKeyRef.current === snapshotKey) {
          realtimeRefreshDirty.current = true;
          return;
        }
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
        const visibleRows = reconciledRows.filter(row => !deletedTripIds.current.has(String(row.trip_id))&&!isDeletedReportRecord(row));
        setRows(visibleRows);
        setPagination(result.pagination);
        if(!allTripRecords) setCachedReportPage(reportKey, accessToken, pageOptions, {
          columns: result.columns,
          rows: visibleRows,
          pagination: result.pagination,
        });
        loadedSnapshotKeyRef.current = snapshotKey;
        savedRowReconciliations.current = savedRowReconciliations.current.filter(
          (reconciliation) =>
            reconciliation.reportKey !== reportKey ||
            reconciliation.version > requestSaveVersion,
        );
      } catch (cause) {
        readFailed = true;
        if (!active) return;
        reportEditDiagnostic("report fetch failed", {
          reportEndpoint: REPORTS[reportKey].endpoint,
          reportKey,
          page: pageOptions.page,
          errorType: cause instanceof ApiError ? "api" : cause instanceof Error ? cause.name : "unknown",
          status: cause instanceof ApiError ? cause.status : undefined,
        });
        if (cause instanceof ApiError && cause.status === 401) {
          await refreshSession();
          return;
        }
        // Keep the last valid page visible during a failed background refresh.
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
        const remaining = (inFlightReportQueries.current.get(snapshotKey) ?? 1) - 1;
        if (remaining > 0) inFlightReportQueries.current.set(snapshotKey, remaining);
        else inFlightReportQueries.current.delete(snapshotKey);
        if (active) setLoadedQueryKey(queryKey);
        // A failed read must wait for Retry or a later external event; do not
        // immediately replay dirty signals accumulated during that failed read.
        if (active && readFailed) realtimeRefreshDirty.current = false;
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
      collectionAbort.abort();
    };
  }, [
    accessToken,
    effectiveSearch,
    navigate,
    page,
    pageOptions,
    allTripRecords,
    infiniteRows,
    queryKey,
    reportKey,
    refreshSession,
    retryVersion,
    sortBy,
    sortOrder,
    snapshotKey,
  ]);

  const collectionWindow=infiniteRows&&accessToken?getReportCollection(reportKey,accessToken,pageOptions,true)?.collection:null;
  const hasMoreRows=Boolean(collectionWindow&&collectionWindow.page<collectionWindow.totalPages);
  const loadMoreRows=async()=>{
    if(!accessToken||!infiniteRows||!hasMoreRows||moreRowsFlight.current||activeReportEdit.current||formulas.draftPending||cellSaveInFlight.current)return;
    const expected=snapshotKey;moreRowsFlight.current=true;setLoadingMore(true);setMoreRowsError("");
    try{
      const next=await fetchNextReportCollection(reportKey,accessToken,pageOptions);
      if(snapshotKeyRef.current!==expected)return;
      setRows(current=>{
        const known=new Set(current.map(row=>getReportRowKey(reportKey,row)));
        return [...current,...next.rows.filter(row=>!known.has(getReportRowKey(reportKey,row))&&!deletedTripIds.current.has(String(row.trip_id))&&!isDeletedReportRecord(row))];
      });
      setPagination(next.pagination);
    }catch(cause){if(snapshotKeyRef.current===expected&&!(cause instanceof DOMException&&cause.name==="AbortError"))setMoreRowsError("Unable to load more rows. Please try again.");}
    finally{moreRowsFlight.current=false;setLoadingMore(false);}
  };
  const loadMoreRowsRef=useRef(loadMoreRows);loadMoreRowsRef.current=loadMoreRows;
  useEffect(()=>setMoreRowsError(""),[snapshotKey]);
  useSpreadsheetFeedback(moreRowsError,"error");
  useSpreadsheetInfiniteScroll(tableViewportRef,{queryKey:snapshotKey,enabled:infiniteRows,hasMore:hasMoreRows,loading:loadingMore||loadedQueryKey!==queryKey,blocked:Boolean(moreRowsError||editingCell||editModalOpen||formulas.draftPending||formulas.busy||productDrafts.length||physicalDeletion||rowDeletion),revision:rows.length,onLoadMore:()=>loadMoreRowsRef.current()});

  useEffect(() => {
    if (!accessToken) return;
    const reportTables = REPORT_REALTIME_TABLES[reportKey];
    const unsubscribe = subscribeToAdminRealtime((event) => {
      if (event.kind === "batch") {
        if (event.tables.includes("tms_dropdown_options")) dropdownRefreshPending.current = true;
        const socket=collaborationSnapshot();
        if(allTripRecords&&socket.connected&&socket.bridgeHealthy&&event.tables.every(table=>(COLLABORATION_SOURCES as readonly string[]).includes(table)||table==="transaction_deletion_jobs"))return;
        if (event.tables.some((table) => !(socket.connected&&socket.bridgeHealthy&&(COLLABORATION_SOURCES as readonly string[]).includes(table))&&(reportTables.includes(table) || table === "tms_dropdown_options" || table === "transaction_deletion_jobs"))) scheduleRealtimeRefreshRef.current();
        return;
      }
      if (event.kind === "resume") {
        scheduleRealtimeRefreshRef.current();
      } else if (event.kind === "recovered") {
        if (reportTables.includes(event.table)) scheduleRealtimeRefreshRef.current();
      } else if (reportTables.includes(event.payload.table)) {
        const socket=collaborationSnapshot();
        if(socket.connected&&socket.bridgeHealthy&&(COLLABORATION_SOURCES as readonly string[]).includes(event.payload.table))return;
        const payloadTrip=event.payload.table==="trips"?event.payload.new?.id??event.payload.old?.id:event.payload.new?.trip_id??event.payload.old?.trip_id;
        if(typeof payloadTrip==="string"&&refreshOneTripRef.current(payloadTrip))return;
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
    const stopSocket=subscribeCollaborationEvents(event=>{if(event.kind==="connected")scheduleRealtimeRefreshRef.current();});
    // Shared channels reconnect; resume/online reconciliation covers missed events without per-view polling.
    const recover = () => scheduleRealtimeRefreshRef.current();
    window.addEventListener("online", recover);
    return () => {
      unsubscribe();
      stopSocket();
      window.removeEventListener("online", recover);
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
      isTripTimeField(columnKey)&&rawCurrentText&&manilaDateTime(rawCurrentText)?manilaDateTime(rawCurrentText).slice(11):target.editor === "date"
        ? rawCurrentText.slice(0, 10)
        : target.editor === "datetime" && currentDateTime &&
            !Number.isNaN(currentDateTime.getTime())
          ? `${currentDateTime.getFullYear()}-${String(currentDateTime.getMonth() + 1).padStart(2, "0")}-${String(currentDateTime.getDate()).padStart(2, "0")}T${String(currentDateTime.getHours()).padStart(2, "0")}:${String(currentDateTime.getMinutes()).padStart(2, "0")}`
          : rawCurrentText;
    const relationshipId = target.relationship
      ? row[target.relationship.idField]
      : undefined;
    return {
      rowKey: rowKey(reportKey, row, index),
      field: columnKey,
      definition: target,
      dropdownField: target.dropdownField,
      tripId: target.tripId,
      stopId: target.stopId,
      lineItemId: target.lineItemId,
      assignmentId: target.assignmentId,
      billingId: target.billingId,
      storeCallId: target.storeCallId,
      loadingReportId: target.loadingReportId,
      relationshipId:
        typeof relationshipId === "string" ? relationshipId : undefined,
      originalRelationshipId:
        typeof relationshipId === "string" ? relationshipId : undefined,
      value: currentText,
      originalValue: currentText,
      originalTimestamp:rawCurrentText,
      transmittalVersion: Number(row.transmittal_ref_version ?? 0),
      mentionProfileIds: [],
      assignmentEventKey:
        reportKey === "store-calling" && columnKey === "assigned_to"
          ? crypto.randomUUID()
          : undefined,
    };
  }

  function prepareFormulaSource(row:ReportRow,field:string) {
    const index=gridRowIndex.get(getReportRowKey(reportKey,row)??"")??-1;
    const active=editingCell?(bufferedTextDraft.current?.rowKey===editingCell.rowKey&&bufferedTextDraft.current.field===editingCell.field?bufferedTextDraft.current:editingCell):null;
    const original=active?.rowKey===getReportRowKey(reportKey,row)&&active.field===field?active:createEditingCell(row,index,field);
    if(!original)return undefined;
    const relationship=original.definition.editor==="relationship";
    return {value:original.value,writable:!relationship,allowExpression:!row._new_product_draft,reason:relationship?"Use the cell's searchable relationship selector to change its linked record. Formula overlays do not change that relationship.":undefined,
      cancel:()=>{bufferedTextDraft.current=null;setEditingCell(null);setCellSaveState(null);},
      save:async(raw:string)=>{
        if(relationship)return false;
        let value=raw;
        const configured=sharedDesign.columns[field]?.input;
        if(configured?.type==="DROPDOWN"){const option=configured.options?.find(option=>option.active&&(option.value===raw||option.label===raw));if(!option)throw new Error("Choose an active configured dropdown value.");value=option.value;}
        if(original.definition.editor==="status"){const option=dropdownOptions.find(option=>option.active&&option.field_key===original.definition.dropdownField&&(option.option_value===raw||option.display_label===raw));if(option)value=option.option_value;}
        if(original.definition.editor==="boolean"){if(/^(yes|true)$/i.test(raw))value="true";else if(/^(no|false)$/i.test(raw))value="false";}
        const saved=await commitEditableCell({...original,value});
        if(saved){bufferedTextDraft.current=null;setEditingCell(null);}
        return saved;
      }};
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
    bufferedTextDraft.current = null;
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
    }, selectionColumnRef.current?.getBoundingClientRect().width ?? SPREADSHEET_GUTTER_WIDTH);
    if (pinnedWidth > Math.max(180, viewportWidth - 120)) {
      setPinningNotice("Unpin a column to keep room for horizontal scrolling.");
      return;
    }
    setPinningNotice("");
    setPinnedColumnSides(next);
    void sharedDesign.save(columnKey,{pin:side},getColumnWidth(columnKey));
  }

  function toggleColumnPinAutomatically(columnKey: string) {
    if (pinnedColumnSides[columnKey]) {
      setColumnPinSide(columnKey, null);
      return;
    }
    const columnRect = headerCellRefs.current.get(columnKey)?.getBoundingClientRect();
    const viewportRect = tableViewportRef.current?.getBoundingClientRect();
    if (!columnRect || !viewportRect) return;
    setColumnPinSide(columnKey, chooseAutomaticPinSide(columnRect, viewportRect));
  }

  function saveColumnLayout(next: ReportColumnLayout) {
    if (!sharedDesign.canEdit) return;
    setColumnLayout(next);
    const reordered=next.order.join("\u0000")!==layoutColumnKeys.join("\u0000");
    if (reordered) void sharedDesign.saveOrder(next.order, getColumnWidth);
    for(const key of next.order){
      const patch:import("../../services/shared-table-design").ColumnDesign={};
      if(next.hidden.includes(key)!==columnLayout.hidden.includes(key))patch.hidden=next.hidden.includes(key);
      if((next.colors?.[key]??null)!==(columnLayout.colors?.[key]??null))patch.color=next.colors?.[key]??null;
      if(Object.keys(patch).length)void sharedDesign.save(key,patch,getColumnWidth(key));
    }
    try {
      localStorage.setItem(columnLayoutStorageKey, JSON.stringify(next));
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }
  function getColumnWidth(key:string){const column=columns.find(c=>c.key===key);return columnLayout.widths?.[key]??(column?defaultReportColumnWidth(column):180);}

  function setReportColumnColor(columnKey: string, color: string | null) {
    const colors = { ...(columnLayout.colors ?? {}) };
    if (color) colors[columnKey] = color;
    else delete colors[columnKey];
    saveColumnLayout({ ...columnLayout, order: layoutColumnKeys, colors });
  }


  function openDropdownManager(field: DropdownField) {
    setManagingDropdownField(field);
    setOpenColumnMenu(null);
  }

  function selectFormatKey(key:string,field:string,extend=false){
    headerFormatting.clear();reportSelection.clear(reportKey);
    setCellSelection(current=>!extend&&current?.mode==="cells"&&current.anchorRowKey===key&&current.focusRowKey===key&&current.anchorField===field&&current.focusField===field?current:extend&&current?{...current,mode:"cells",rows:undefined,focusRowKey:key,focusField:field}:{anchorRowKey:key,anchorField:field,focusRowKey:key,focusField:field,mode:"cells"});
  }
  function syncGridCellSelection(id:string,field:string,extend:boolean){
    const row=formulaRowLookup.get(id)?.row;
    const key=row?getReportRowKey(reportKey,row):id;
    if(key)selectFormatKey(key,field,extend);
  }
  function selectFormatCell(row: ReportRow, field: string, extend: boolean) {
    const index=displayedRows.indexOf(row),key=getReportRowKey(reportKey,row)??selectionRowKeys[index];
    if(key)selectFormatKey(key,field,extend);
  }
  function selectWholeRow(key:string,add=false,extend=false){
    if(selectAllRequest.busy)return;
    if(!selectionRowKeys.includes(key)||!presentationColumns.length)return;
    headerFormatting.clear();
    let keys=[key];
    if(extend&&cellSelection){const start=selectionRowKeys.indexOf(cellSelection.anchorRowKey),end=selectionRowKeys.indexOf(key);if(start>=0)keys=selectionRowKeys.slice(Math.min(start,end),Math.max(start,end)+1);}
    else if(add&&cellSelection?.mode==="row"){const current=cellSelection.rows??[cellSelection.anchorRowKey];keys=current.includes(key)?current.filter(row=>row!==key):[...current,key];}
    // Only verified physical records enter the existing bulk-action store.
    const known=new Set(selectionRows.flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[key]:[];}));
    reportSelection.selectOnly(reportKey,keys.filter(row=>known.has(row)));
    if(!keys.length){setCellSelection(null);return;}
    setCellSelection({anchorRowKey:keys[0],focusRowKey:keys.at(-1)!,anchorField:presentationColumns[0].key,focusField:presentationColumns.at(-1)!.key,mode:"row",rows:keys});
  }
  function selectWholeColumn(key:string){
    if(!selectionRowKeys.length)return;headerFormatting.clear();reportSelection.clear(reportKey);
    setCellSelection({anchorRowKey:selectionRowKeys[0],focusRowKey:selectionRowKeys.at(-1)!,anchorField:key,focusField:key,mode:"column"});
  }
  function selectAllGridCells(){
    if(!accessToken||!presentationColumns.length||editingCell||editModalOpen||fillGesture||formulas.draftPending)return;
    setSelectionError("");
    void selectAllRequest.run(current=>fetchReportSelection(reportKey,accessToken,pageOptions,current),matching=>{
      const keys=matching.flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[key]:[];});
      headerFormatting.clear();setSelectionRecords(matching);reportSelection.selectOnly(reportKey,keys);
      if(!keys.length){setCellSelection(null);return;}
      const anchor=physicalGridKeys.find(key=>keys.includes(key))??keys[0];
      setCellSelection({anchorRowKey:anchor,focusRowKey:anchor,anchorField:presentationColumns[0].key,focusField:presentationColumns.at(-1)!.key,mode:"row",rows:keys});
    });
  }
  function openCellContextMenu(event:MouseEvent<HTMLElement>,key:string,field:string){
    event.preventDefault();event.stopPropagation();headerFormatting.clear();
    const alreadySelected=selectedFormatCellKeys.has(reportCellFormatKey(key,field));
    if(!alreadySelected)selectFormatKey(key,field);
    setCellContextMenu({x:event.clientX,y:event.clientY,row:key,field});
    // Right-click is not an implicit commit/cancel of either formula or source drafts.
    if(!alreadySelected&&!formulas.draftPending&&!editingCell){const row=displayedRows.find(candidate=>getReportRowKey(reportKey,candidate)===key);const id=row?physicalRowIdentity(row):key;if(id)formulas.selectCell(id,field);}
  }
  function normalizedFormat(format:Partial<ReportCellFormat>):ReportCellFormat{
    return {...format,...(format.color===""?{color:null}:{}),...(format.backgroundColor===""?{backgroundColor:null}:{})};
  }
  function applyCellFormat(change: Partial<ReportCellFormat>) {
    if(!selectedFormatCellKeys.size||!sharedDesign.canEdit||!columns.length)return;
    if(cellSelection?.mode==="row"&&(cellSelection.rows?.length??0)>1000){setSelectionError("Select at most 1,000 rows for individual cell formatting, or use whole-column formatting.");return;}
    const patch=normalizedFormat(change);
    if(cellSelection?.mode==="column"){
      const key=cellSelection.focusField,design=sharedDesign.columns[key]??{};
      const cells=Object.fromEntries(Object.entries(design.cells??{}).filter(([,format])=>format).map(([row,format])=>[row,{...(format??{}),...patch}]));
      const header:Pick<ReportCellFormat,"color"|"backgroundColor"|"fontSize">={};
      if("color" in patch)header.color=patch.color;
      if("backgroundColor" in patch)header.backgroundColor=patch.backgroundColor;
      if("fontSize" in patch)header.fontSize=patch.fontSize;
      // One existing column-design write covers the header, off-page and future blank/data cells.
      void sharedDesign.save(key,{format:{...design.format,...patch},cells,...(Object.keys(header).length?{header}:{})},getColumnWidth(key));return;
    }
    const grouped:Record<string,Record<string,ReportCellFormat|null>>={};
    for(const key of selectedFormatCellKeys){const split=key.lastIndexOf("\u0000");if(split<0)continue;const column=key.slice(split+1),row=key.slice(0,split);if(row.startsWith("display:")||column.startsWith("__loading_"))continue;(grouped[column]??={})[row]=patch;}
    // Existing revisioned design queue groups a row/range by column, not one request per cell.
    for(const [column,cells] of Object.entries(grouped))void sharedDesign.save(column,{cells},getColumnWidth(column));
  }
  const selectedFormats=[...selectedFormatCellKeys].map(key=>{const column=key.slice(key.lastIndexOf("\u0000")+1);return {...sharedDesign.columns[column]?.format,...reportCellFormatFor(cellFormats,key)};});
  const selectionIsBold=selectedFormats.length>0&&selectedFormats.every(format=>format.bold===true);
  const selectedTextColor=selectedFormats.length>0&&selectedFormats.every(format=>format.color===selectedFormats[0].color)?selectedFormats[0].color??"":null;
  const selectedBackgroundColor=selectedFormats.length>0&&selectedFormats.every(format=>format.backgroundColor===selectedFormats[0].backgroundColor)?selectedFormats[0].backgroundColor??"":null;

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
    if (!sharedDesign.canEdit || !sharedDesign.loaded) return;
    const nextOrder = reorderColumnKeys(layoutColumnKeys, sourceKey, targetKey);
    if (nextOrder === layoutColumnKeys) return;
    saveColumnLayout({ ...columnLayout, order: nextOrder });
  }

  function beginFillGesture(row: ReportRow, index: number, column: ReportColumn) {
    const sourceTarget = getEditableCellTarget(row, column.key, reportKey);
    if (!accessToken || cellSaveInFlight.current || !sourceTarget || sourceTarget.editor === "relationship") return;
    const sourceRowKey = getReportRowKey(reportKey, row);
    if (!sourceRowKey || displayedRowsRef.current.filter((candidate) => getReportRowKey(reportKey, candidate) === sourceRowKey).length !== 1) {
      setCellSaveState({ rowKey: rowKey(reportKey, row, index), field: column.key, status: "warning", message: "Fill is unavailable because this report row does not have a unique stable identity." });
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
      setCellSaveState({ rowKey: rowKey(reportKey, currentRows[sourceRowIndex], sourceRowIndex), field: gesture.sourceField, status: "warning", message: "Fill cancelled because the source cell changed." });
      return;
    }
    const targets: Array<{ rowKey: string; field: string }> = [];
    for (const { row: rowIndex, column: columnIndex } of expandSpreadsheetRange(sourceRowIndex, sourceColumnIndex, targetRowIndex, targetColumnIndex)) {
      const row = currentRows[rowIndex];
      const column = renderedGridColumns[columnIndex];
      const targetRowKey = getReportRowKey(reportKey, row);
      if (!targetRowKey || identityCounts.get(targetRowKey) !== 1) continue;
      targets.push({ rowKey: targetRowKey, field: column.key });
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

  async function handleReportPaste(event: ReactClipboardEvent<HTMLDivElement>) {
    if (!accessToken || cellSaveInFlight.current) return;
    const values = parseSpreadsheetClipboard(event.clipboardData.getData("text/plain"));
    if (!values.length || (values.length === 1 && values[0].length === 1)) return;
    const target = (event.target as HTMLElement).closest<HTMLTableCellElement>("td[data-report-column-key]");
    const rowElement = target?.closest<HTMLTableRowElement>("tr[data-report-selection-key]");
    const rowKey = rowElement?.dataset.reportSelectionKey;
    const columnKey = target?.dataset.reportColumnKey;
    if (!rowKey || !columnKey) return;
    event.preventDefault();
    const startRow = displayedRows.findIndex((row) => getReportRowKey(reportKey, row) === rowKey);
    const startColumn = renderedGridColumns.findIndex((column) => column.key === columnKey);
    if (startRow < 0 || startColumn < 0) return;
    for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < values[rowOffset].length; columnOffset += 1) {
        const row = displayedRows[startRow + rowOffset];
        const column = renderedGridColumns[startColumn + columnOffset];
        if (!row || !column) continue;
        const target = getEditableCellTarget(row, column.key, reportKey);
        if (!target || target.editor === "relationship") continue;
        const candidate = createEditingCell(row, rows.indexOf(row), column.key);
        if (!candidate) continue;
        candidate.value = values[rowOffset][columnOffset];
        if (!await commitEditableCell(candidate)) return;
      }
    }
  }

  function selectedProductParent() {
    const key = cellSelection?.focusRowKey ?? reportSelection.getKeys(reportKey)[0];
    return displayedRows.find(row => getReportRowKey(reportKey, row) === key);
  }
  function addProductRows(parent = selectedProductParent()) {
    setNewRowsMessage("");
    if (productDraftsRef.current.length) { setNewRowsMessage("Save or cancel the current new rows first."); return; }
    if (!parent?.trip_id || !parent.trip_stop_id) { setRowContext("parent"); return; }
    try {
      const drafts = newProductDrafts(parent, newRowCount, getReportRowKey(reportKey, parent) ?? "");
      productDraftsRef.current = drafts; setProductDrafts(drafts); setViewMode("table");
      const firstKey = getReportRowKey(reportKey, drafts[0])!;
      setCellSelection({ anchorRowKey: firstKey, focusRowKey: firstKey, anchorField: "customer_model", focusField: "customer_model" });
      setNewRowsMessage(`${drafts.length} unsaved product row(s). Enter values in cells or the formula bar, then Save new rows. They stay visible here while drafting; saved rows follow the normal sort and filters after refresh.`);
    } catch (e) { setNewRowsMessage((e as Error).message); }
  }
  async function saveProductDrafts() {
    if (!accessToken || newRowsBusy) return;
    setNewRowsBusy(true); setNewRowsMessage("");
    try {
      if (formulas.draftPending && !await formulas.commitDraft()) throw Error("Correct the selected formula bar value before saving new rows.");
      const active = bufferedTextDraft.current ?? editingCell;
      if (active && !await commitEditableCell(active)) throw Error("Correct the selected cell before saving new rows.");
      const drafts = productDraftsRef.current;
      if (!drafts.length) return;
      const trip = String(drafts[0].trip_id), stop = String(drafts[0].trip_stop_id);
      if (drafts.some(row => row.trip_id !== trip || row.trip_stop_id !== stop)) throw Error("Save new rows for one trip and stop at a time.");
      const confirmed = await createProductRows(accessToken, trip, stop, drafts.map(row => ({ id: String(row.trip_line_item_id), values: productDraftValues(row) })));
      const saved = drafts.map(draft => {
        const record = confirmed.find(row => row.id === draft.trip_line_item_id);
        if (!record) throw Error("A product row was not confirmed. Retry the same drafts.");
        return { ...draft, ...record, trip_line_item_id: record.id, _new_product_draft: false };
      });
      const ids = new Set(saved.map(row => row.trip_line_item_id));
      setRows(current => insertProductDrafts(current.filter(row => !ids.has(row.trip_line_item_id)), saved, row => getReportRowKey(reportKey, row)));
      productDraftsRef.current = []; setProductDrafts([]); setEditingCell(null); bufferedTextDraft.current = null;
      setNewRowsMessage(`${saved.length} product row(s) saved with unique database IDs. Refresh applies the current sort and filters.`);
    } catch (e) { setNewRowsMessage((e as Error).message); }
    finally { setNewRowsBusy(false); }
  }
  function cancelProductDrafts() {
    formulas.cancelDraft(); bufferedTextDraft.current = null; setEditingCell(null);
    productDraftsRef.current = []; setProductDrafts([]); setNewRowsMessage("New product row drafts cancelled. No rows were saved.");
  }

  function handleReportCopy(event: ReactClipboardEvent<HTMLDivElement>) {
    if (!cellSelection) return;
    const rowA = displayedRows.findIndex((row) => getReportRowKey(reportKey, row) === cellSelection.anchorRowKey);
    const rowB = displayedRows.findIndex((row) => getReportRowKey(reportKey, row) === cellSelection.focusRowKey);
    const columnA = renderedGridColumns.findIndex((column) => column.key === cellSelection.anchorField);
    const columnB = renderedGridColumns.findIndex((column) => column.key === cellSelection.focusField);
    if (rowA < 0 || rowB < 0 || columnA < 0 || columnB < 0) return;
    const rows = Array.from({ length: Math.abs(rowB - rowA) + 1 }, (_, index) => Math.min(rowA, rowB) + index);
    const columns = Array.from({ length: Math.abs(columnB - columnA) + 1 }, (_, index) => Math.min(columnA, columnB) + index);
    const text = rows.map((rowIndex) => columns.map((columnIndex) => String(displayedRows[rowIndex][renderedGridColumns[columnIndex].key] ?? "")).join("\t")).join("\n");
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
  }

  function openSelectedRowEditor() {
    const keys = reportSelection.getKeys(reportKey);
    if (keys.length !== 1) return;
    const row = displayedRows.find((candidate) => getReportRowKey(reportKey, candidate) === keys[0]);
    if (!row) return;
    const rowIndex = rows.indexOf(row);
    const seen = new Set<string>();
    const fields = columns.flatMap((column) => {
      if (transactionView && !allTripRecords && column.key === "warehouse_code") return [];
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
        cell.loadingReportId,        cell.definition.sourceField,
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
    setTripEditStep(0);
    setEditModalOpen(true);
  }

  function updateModalCell(field: string, updater: (cell: EditingCell) => EditingCell) {
    setEditModalFields((current) => {
      const previous = current.find((item) => item.cell.field === field)?.cell;
      const next = current.map((item) => item.cell.field === field ? { ...item, cell: updater(item.cell) } : item);
      const updated = next.find((item) => item.cell.field === field)?.cell;
      if (previous?.definition.sourceField === "customer_id" && updated?.relationshipId !== previous.relationshipId) {
        return next.map((item) => item.cell.definition.sourceField === "store_id" ? { ...item, cell: { ...item.cell, value: "", relationshipId: undefined, relationshipOption: undefined } } : item);
      }
      return next;
    });
  }

  async function addConfiguredCellOption(target:EditingCell,label:string):Promise<boolean>{
    if(!accessToken||!sharedDesign.canEdit||!configurableTextColumn(target.field))return false;
    const input=sharedDesign.columns[target.field]?.input;if(input?.type!=="DROPDOWN")return false;
    const normalized=label.trim();if(!normalized||normalized.length>100)return false;
    const existing=input.options?.find(option=>option.label.trim().toLocaleLowerCase()===normalized.toLocaleLowerCase());
    const value=existing?.value??dropdownStoredValue(normalized);
    if(!existing&&input.options?.some(option=>option.value===value))return false;
    await sharedDesign.save(target.field,{input:{...input,options:existing?(input.options??[]).map(option=>option.value===value?{...option,active:true}:option):[...(input.options??[]),{value,label:normalized,color:null,active:true}]}},columnLayout.widths?.[target.field]??160);
    const confirmed=confirmedColumnDesign(accessToken,transactionView?"trips":`report:${reportKey}`,target.field);
    if(!confirmed?.input?.options?.some(option=>option.active&&option.value===value))return false;
    return commitEditableCell({...target,value});
  }
  async function addModalDropdownOption(target: EditingCell, rawValue: string): Promise<boolean> {
    const field = target.definition.dropdownField;
    if (!field || field === "letter_status") return false;
    await createConfigurableOption(field, rawValue);
    return true;
  }


  function closeRowEdit() {
    if (editModalBusy) return;
    if (editModalFields.some(({cell})=>tripEditFieldChanged(cell)) && !window.confirm("Discard unsaved row changes?")) return;
    setEditModalOpen(false);
  }
  async function saveSelectedRowEdits() {
    if (editModalBusy) return;
    const invalid = editModalFields.map(({ cell }) => validateTripEditField(cell)).find(Boolean);
    if (invalid) { setEditModalError(invalid); return; }
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
    bufferedTextDraft.current = candidate;
    formulas.notifySourceDraft();
    setCellSaveState({
      rowKey: candidate.rowKey,
      field: candidate.field,
      status: "editing",
      message: "Editing",
    });
    setEditingCell(candidate);
  }

  function keepTextDraftLocal(candidate: EditingCell) {
    bufferedTextDraft.current = candidate;
    formulas.notifySourceDraft();
    setCellSaveState(current => current?.rowKey===candidate.rowKey&&current.field===candidate.field&&current.status==="editing"
      ? current : {rowKey:candidate.rowKey,field:candidate.field,status:"editing",message:"Editing"});
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
    const buffered = bufferedTextDraft.current;
    const sourceCell = candidate ?? (buffered && editingCell && buffered.rowKey===editingCell.rowKey && buffered.field===editingCell.field ? buffered : editingCell);
    if (!sourceCell || !accessToken || cellSaveInFlight.current) return false;
    const targetCell = { ...sourceCell };
    const definition = targetCell.definition;
    const textValue = targetCell.value.trim();
    const isControlled = definition.editor === "status";
    const isRelationship = definition.editor === "relationship";
    const nullableStore = isRelationship && definition.sourceField === "store_id" && !definition.required;
    if (!textValue && (definition.required || isControlled || (isRelationship && !nullableStore))) {
      setCellSaveState({
        rowKey: targetCell.rowKey,
        field: targetCell.field,
        status: "error",
        message: "Value cannot be blank.",
      });
      return false;
    }

    const configuredInput=configurableTextColumn(targetCell.field)?(confirmedColumnDesign(accessToken,transactionView?"trips":`report:${reportKey}`,targetCell.field)?.input??sharedDesign.columns[targetCell.field]?.input):undefined;
    if(textValue&&configuredInput?.type==="NUMBER"&&!Number.isFinite(Number(textValue))||textValue&&configuredInput?.type==="DATE"&&(!/^\d{4}-\d{2}-\d{2}$/.test(textValue)||!Number.isFinite(Date.parse(textValue))||new Date(textValue).toISOString().slice(0,10)!==textValue)){
      setCellSaveState({rowKey:targetCell.rowKey,field:targetCell.field,status:"error",message:configuredInput?.type==="DATE"?"Enter a valid date.":"Enter a valid number."});return false;
    }
    if(textValue&&configuredInput?.type==="DROPDOWN"&&!configuredInput.options?.some(option=>(option.active||option.value===targetCell.originalValue)&&option.value===textValue)){setCellSaveState({rowKey:targetCell.rowKey,field:targetCell.field,status:"error",message:"Choose an active configured dropdown value."});return false;}
    let nextValue: unknown = textValue || null;
    if (isRelationship) {
      if (!targetCell.relationshipId && !(definition.sourceField === "store_id" && !textValue)) {
        setCellSaveState({
          rowKey: targetCell.rowKey,
          field: targetCell.field,
          status: "error",
          message: "Choose a matching record from the list.",
        });
        return false;
      }
      nextValue = targetCell.relationshipId ?? null;
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
      nextValue = (definition.sourceEntity === "stop" && ["quantity", "total_cbm"].includes(definition.sourceField)) || definition.sourceEntity === "lineItem" ? textValue : parsed;
    } else if (definition.editor === "datetime" && isTripTimeField(targetCell.field)&&textValue) {
      try{nextValue=saveTripTime(targetCell.originalTimestamp,textValue);}catch(cause){setCellSaveState({rowKey:targetCell.rowKey,field:targetCell.field,status:"error",message:cause instanceof Error?cause.message:"Invalid time."});return false;}
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

    const pendingRow = productDraftsRef.current.find(row => row.trip_line_item_id === targetCell.lineItemId);
    if (pendingRow) {
      if (definition.sourceEntity !== "lineItem" || !PRODUCT_FIELDS.includes(definition.sourceField)) return false;
      const next = productDraftsRef.current.map(row => row === pendingRow ? { ...row, [definition.sourceField]: nextValue, [targetCell.field]: isRelationship ? targetCell.relationshipOption?.label ?? textValue : nextValue } : row);
      productDraftsRef.current = next; setProductDrafts(next);
      bufferedTextDraft.current = null; setEditingCell(null);
      setCellSaveState({ rowKey: targetCell.rowKey, field: targetCell.field, status: "editing", message: "New row draft · choose Save new rows to persist" });
      return true;
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
    const collectionWasFresh = allTripRecords && Boolean(getReportCollection(reportKey, accessToken, pageOptions));

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
        loadingReportId: targetCell.loadingReportId,
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
      if (definition.sourceEntity === "masterList" && targetCell.tripId) {
        savedRecord = await updateMasterListCell(accessToken, targetCell.tripId, targetCell.stopId, targetCell.lineItemId, definition.sourceField, nextValue);
      } else if (definition.sourceEntity === "loadingReport" && targetCell.tripId && targetCell.loadingReportId) {
        savedRecord = await updateLoadingReport(accessToken, targetCell.tripId, targetCell.loadingReportId, updatePayload);
      } else if (definition.sourceEntity === "storeCall" && targetCell.storeCallId) {
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
        savedRecord = definition.sourceField === "transmittal_ref"
          ? await saveTransactionReference(accessToken, targetCell.tripId, targetCell.stopId, nextValue, targetCell.transmittalVersion ?? 0)
          : await updateTripStopRecord(
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

      const confirmedValue = confirmReportCellWrite(savedRecord, diagnosticTarget, definition.sourceField, {value: nextValue, editor: definition.editor});
      if (definition.sourceEntity === "masterList" && targetCell.tripId) savedTripRefreshes.current.set(targetCell.tripId, snapshotKey);
      const savedIdentity=collaborationCell(transactionView?"trips":reportKey,diagnosticTarget);
      if(savedIdentity)rememberConfirmedRecord(savedIdentity.source,savedIdentity.recordId,savedRecord);
      if(savedIdentity&&!rememberConfirmedVersion(savedIdentity.source,savedIdentity.recordId,savedRecord.collaboration_version)){
        setEditingCell(null);setCellSaveState({rowKey:targetCell.rowKey,field:targetCell.field,status:"warning",message:"Your save completed, but a newer committed edit is already authoritative. Review the latest value."});return true;
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

      if(definition.sourceField==="truck_id"&&savedRecord.driver_id){realtimeRefreshDirty.current=true;scheduleRealtimeRefreshRef.current();}
      const confirmedCellValue = confirmedValue;

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
        savedRowPatch = { [targetCell.field]: confirmedValue };
        if (definition.sourceField === "transmittal_ref") savedRowPatch.transmittal_ref_version = savedRecord.transmittal_ref_version;
      }

      const recordTarget: SavedRowReconciliation["target"] = {
        sourceEntity: definition.sourceEntity,
        tripId: targetCell.tripId,
        stopId: targetCell.stopId,
        lineItemId: targetCell.lineItemId,
        assignmentId: targetCell.assignmentId,
        billingId: targetCell.billingId,
        storeCallId: targetCell.storeCallId,
        loadingReportId: targetCell.loadingReportId,
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
        savedTripRefreshes.current.clear();
        invalidateReportData(reportKey);
      } else {
        invalidateApiCache(REPORTS[reportKey].endpoint);
        // The visible collection was current before this scalar write, and the
        // confirmed patch above is complete. Keep that snapshot usable on return
        // to this tab; other projections retain their normal invalidation.
        if (collectionWasFresh && !isRelationship && definition.sourceEntity !== "masterList" && !realtimeRefreshDirty.current) {
          updateReportCollection(reportKey, accessToken, pageOptions, current => current);
        }
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
      // Keep the draft in the cell after a failed request so the user can
      // correct it or retry without re-entering the value. No row/cache patch
      // is applied until the backend confirms the write.
      setEditingCell(targetCell);
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
    const value = dropdownStoredValue(displayLabel);
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
  const pageCount = pagination?.totalPages ?? 0;
  const activeError =
    requestError?.key === queryKey
      ? requestError.message
      : !accessToken
        ? "Your session has expired. Please log in again."
        : null;
  const isLoading = Boolean(accessToken) && loadedQueryKey !== queryKey;
  const navigatedSearch = useRef("");
  useEffect(() => {
    if (!searchNeedle) { navigatedSearch.current = ""; return; }
    if (isLoading || navigatedSearch.current === searchNeedle) return;
    const viewport = tableViewportRef.current;
    const match = viewport?.querySelector<HTMLElement>('td[data-search-match="true"]');
    const header = match && headerCellRefs.current.get(match.dataset.reportColumnKey ?? "");
    if (!viewport || !header) return;
    navigatedSearch.current = searchNeedle;
    scrollToTableColumn(viewport, header);
  }, [searchNeedle, isLoading, displayedRows, renderedGridColumns]);
  const showVisualCards = viewMode === "visual" && !isLoading;
  useSpreadsheetFeedback(collaboration.notice?.text, "warning");
  useSpreadsheetFeedback(cellSaveState && (cellSaveState.status === "error" || cellSaveState.status === "warning") ? cellSaveState.message : null, cellSaveState?.status === "error" ? "error" : cellSaveState?.status === "warning" ? "warning" : "success");
  useSpreadsheetFeedback(activeError, "error");

  useSpreadsheetFeedback(pinningNotice, "warning");

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
        keys.map(async (key) => ({ key, ...(await fetchAllReportRows(key, accessToken, allTripRecords && key === "dispatch-monitoring",exportMode==="current-report"?pageOptions:undefined)) })),
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
    <TripIssuesProvider token={accessToken} enabled={Boolean(transactionView&&accessToken)} tripIds={issueTripIds} onChanged={()=>{if(appliedFilters.issue_filter && appliedFilters.issue_filter !== "All")scheduleRealtimeRefreshRef.current();}}>
    <div className="space-y-2">
      <div className={REPORT_TOOLBAR_ROW_CLASS}>
        {pageTitle && (
          <div className="min-w-0 w-full">
            <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[#0b2341]">{pageTitle}</h1>
            {pageSubtitle && <p className="mt-1 text-xs leading-snug text-slate-600">{pageSubtitle}</p>}
          </div>
        )}
        {toolbarLeading && <div className="shrink-0" data-report-toolbar-leading>{toolbarLeading}</div>}
      {quickFilterConfig&&<SpreadsheetQuickFilters label={quickFilterConfig.label} options={quickFilterOptions} value={quickFilterValue} disabled={Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onChange={value=>{setAppliedFilters(current=>({...current,[quickFilterConfig.field]:value}));setPage(1);}}/>}

        {/* Collaboration outcomes use deduplicated toasts; drafts and recovery stay in the hook. */}
        <div data-report-toolbar-actions className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-[1_1_36rem] lg:flex-nowrap">
          {sharedWidths.feedback}{sharedDesign.feedback}
          <ColumnFinder tableKey={transactionView?"trips":reportKey} key={reportKey} rowSearch={{value:search,placeholder:"Search rows or columns...",onSearch:value=>{setSearch(value);setAppliedSearch(value);setPage(1);}}} columns={columns.filter((column) => !(transactionView && !allTripRecords && column.key === "warehouse_code")).map((column) => ({ ...column, title:headerFormatting.title(column.key,column.title), hidden: hiddenColumnKeys.has(column.key), index: renderedGridColumns.findIndex((item) => item.key === column.key) }))} viewport={tableViewportRef} getHeader={(key) => headerCellRefs.current.get(key)} onReveal={restoreReportColumn} />
          {showReportPicker && (
            <label className="sr-only" htmlFor="report-select">
              Select report
            </label>
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

          {activeError && <button type="button" onClick={() => { if (accessToken) retryReportRead(reportKey, accessToken); setRetryVersion(value => value + 1); }} className="h-9 rounded border border-slate-200 px-3 text-xs text-slate-600">Retry loading</button>}
          <ReportSelectionToolbar
            selection={reportSelection}
            reportKey={reportKey}
            deletionCapabilities={deletionCapabilities} onDeletePhysical={setPhysicalDeletion}
            canManage={["ADMIN", "STAFF"].includes(profile?.role ?? "")}
            rows={selectionRows}
            disabled={selectAllRequest.busy}
            columns={columns}
            onDeleteTrips={(transactionView||reportKey==="combined")&&profile?.role==="ADMIN"?selected=>{const ids=selectedParentTripIds(selected);if(ids){deletionRowKeys.current=reportSelection.getKeys(reportKey);setWholeTripRowCount(selected.length);setWholeTripIds(ids);}}:undefined}
            onDeleteRows={!transactionView&&reportKey!=="combined"?setRowDeletion:undefined}
            onEdit={openSelectedRowEditor} />

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
          <div className="flex shrink-0 items-center gap-1.5">
            <div role="group" aria-label="Report display mode" className={tableUi.segment}>
              <button type="button" title="Visual view" aria-label="Visual view" aria-pressed={viewMode === "visual"} onClick={() => setViewMode("visual")} className={`inline-flex h-8 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${viewMode === "visual" ? tableUi.segmentOn : tableUi.segmentOff}`}>
                <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Table view" aria-label="Table view" aria-pressed={viewMode === "table"} onClick={() => setViewMode("table")} className={`inline-flex h-8 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${viewMode === "table" ? tableUi.segmentOn : tableUi.segmentOff}`}>
                <Table2 aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
            {showExport && (
              <button
                type="button"
                title="Export reports"
                aria-label="Export reports"
                onClick={() => { setExportError(""); setExportModalOpen(true); }}
                className={`${tableUi.iconBtn} !bg-[#ffd43b] !text-[#0b2341] hover:!bg-[#f2c200]`}>
                <Download aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
          {toolbarActions}
        </div>
      </div>
      {rowContext && accessToken && <TripRowContextDialog token={accessToken} initial={selectedProductParent()} action={rowContext} onClose={() => setRowContext(null)} onChosen={parent => { if (rowContext === "parent") addProductRows(parent); else { invalidateReportData(reportKey); setRetryVersion(version=>version+1); setNewRowsMessage(rowContext === "stop" ? "Delivery stop saved. Select it to add product rows." : "Truck assignment saved. Choose cargo allocation in Trip details."); } }} />}
      {transactionView && (productDrafts.length > 0 || newRowsMessage) && <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-y border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900"><span>{newRowsMessage}</span>{productDrafts.length > 0 && <div className="flex gap-3"><button type="button" disabled={newRowsBusy} onClick={() => void saveProductDrafts()} className="rounded bg-[#ffd43b] px-3 py-1.5 font-semibold">{newRowsBusy ? "Saving rows?" : "Save new rows"}</button><button type="button" disabled={newRowsBusy} onClick={cancelProductDrafts}>Cancel new rows</button></div>}</div>}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]">
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
              <button type="button" disabled={exportBusy} onClick={() => void runReportExport()} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] disabled:opacity-50">{exportBusy ? "Preparingâ€¦" : "Export"}</button>
            </div>
          </section>
        </div>
      )}

      {wholeTripIds&&accessToken&&<WholeTripDeletionDialog token={accessToken} tripIds={wholeTripIds} selectedRowCount={wholeTripRowCount} onClose={()=>setWholeTripIds(null)} onDeleted={(ids)=>{ids.forEach(id=>deletedTripIds.current.add(id));const retain=(current:ReportRow[])=>current.filter(row=>!deletedTripIds.current.has(String(row.trip_id)));setRows(retain);reportSelection.setVisible(deletionRowKeys.current,false);if(!retain(displayedRows).length&&page>1)setPage(page-1);setRetryVersion(v=>v+1);}}/>}
      {transactionView && accessToken && <TransactionCleanupNotice key={accessToken} token={accessToken} version={retryVersion} />}
      {editModalOpen && editModalRecord && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeRowEdit();
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="report-row-edit-title" onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();closeRowEdit();}}} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="border-b border-slate-100 px-5 py-4">
              <h2 id="report-row-edit-title" ref={tripEditHeading} tabIndex={-1} className="text-lg font-semibold text-[#0b2341] outline-none">{transactionView ? `Edit transaction Â· ${TRIP_EDIT_STEPS[tripEditStep]}` : `Edit report row Â· ${editSteps[tripEditStep]}`}</h2>
              <p className="mt-1 text-sm text-slate-500">{REPORTS[reportKey].title} Â· {rowText(editModalRecord, "dispatch_number", "trip_number", "store_call_id") || "Selected record"}</p>
            </header>
            {<ol aria-label={transactionView ? "Trip edit progress" : "Report edit progress"} className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 sm:grid-cols-4">{editSteps.map((label, index) => <li key={label} aria-current={index === tripEditStep ? "step" : undefined}><button type="button" disabled={editModalBusy || index > tripEditStep} onClick={() => { setTripEditStep(index); setEditModalError(""); }} className={`w-full rounded-lg px-2 py-2 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] disabled:cursor-not-allowed ${index === tripEditStep ? "bg-[#0b2341] text-white" : index < tripEditStep ? "bg-emerald-50 text-emerald-700" : "text-slate-400"}`}>{index < tripEditStep ? "âœ“" : index + 1} {label}</button></li>)}</ol>}
            <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
              {transactionView && tripEditStep === 1 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2">Truck and driver assignments are shared by the other transactions on this physical trip.</p>}
              {transactionView && tripEditStep === 3 && <div className="sm:col-span-2"><h3 className="mb-3 text-sm font-semibold text-slate-700">Review pending changes</h3>{editModalFields.filter(({ cell }) => tripEditFieldChanged(cell)).length === 0 ? <p className="text-sm text-slate-500">No changes.</p> : <dl className="grid gap-3 sm:grid-cols-2">{editModalFields.filter(({ cell }) => tripEditFieldChanged(cell)).map(({ column, cell }) => <div key={cell.field} className="rounded-lg border border-slate-100 p-3"><dt className="text-xs font-semibold text-slate-500">{column.title}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{cell.value || "Blank"}{["trip", "assignment"].includes(cell.definition.sourceEntity) && <span className="ml-2 text-xs text-amber-700">Shared {cell.definition.sourceEntity}</span>}</dd></div>)}</dl>}</div>}
              {editModalFields.filter(({ cell }) => (!transactionView || tripEditStep < 3) && tripEditFieldStep(cell.definition) === tripEditStep).map(({ column, cell }) => {
                const saving = editModalBusy || cellSaveInFlight.current;
                const fieldKey = cell.definition.dropdownField;
                const choices = cell.definition.editor === "boolean"
                  ? BOOLEAN_DROPDOWN_CHOICES
                  : (fieldKey ? dropdownChoicesByField[fieldKey] : undefined) ?? [];
                return (
                  <label key={`${cell.definition.sourceEntity}:${cell.definition.sourceField}:${cell.field}`} className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
                    <span>{column.title}{transactionView && ["trip", "assignment"].includes(cell.definition.sourceEntity) && <span className="ml-2 text-[10px] font-normal text-amber-700">Shared {cell.definition.sourceEntity}</span>}</span>
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
                        customerId={editModalFields.find((field) => field.cell.definition.sourceField === "customer_id")?.cell.relationshipId ?? (typeof editModalRecord[cell.definition.relationship.customerIdField ?? ""] === "string" ? String(editModalRecord[cell.definition.relationship.customerIdField ?? ""]) : undefined)}
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
                        type={cell.definition.editor === "number" ? "number" : cell.definition.editor === "date" ? "date" : cell.definition.editor === "datetime" ? isTripTimeField(cell.field)&&manilaDateTime(cell.originalTimestamp??"")?"time":"datetime-local" : "text"}
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
              <button type="button" disabled={editModalBusy} onClick={closeRowEdit} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              {<button type="button" disabled={editModalBusy || tripEditStep === 0} onClick={() => { setTripEditStep((step) => step - 1); setEditModalError(""); }} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Previous</button>}
              {tripEditStep < editSteps.length - 1 && <button type="button" disabled={editModalBusy} onClick={() => {
                const invalid = editModalFields.filter(({ cell }) => tripEditFieldStep(cell.definition) === tripEditStep).map(({ cell }) => validateTripEditField(cell)).find(Boolean);
                if (invalid) { setEditModalError(invalid); return; }
                setTripEditStep((step) => step + 1); setEditModalError("");
              }} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200] disabled:opacity-50">Next</button>}<button type="button" disabled={editModalBusy || editModalFields.length === 0} onClick={() => void saveSelectedRowEdits()} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200] disabled:opacity-50">{editModalBusy ? "Savingâ€¦" : "Save changes"}</button>
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
      <section
        className={showVisualCards ? "" : `${SPREADSHEET_PANEL_CLASS} flex min-h-0 flex-col`}
      >

        <>
          {columns.some(column => column.fieldCategory) && <div aria-label="Column responsibilities" className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-white px-3 py-1 text-[10px] text-slate-500">{Object.entries(FIELD_CATEGORIES).map(([key, item]) => <button type="button" key={key} className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => { const column = renderedGridColumns.find(column => column.fieldCategory === key); const header = column && headerCellRefs.current.get(column.key); if (header && tableViewportRef.current) scrollToTableColumn(tableViewportRef.current, header); }}><span className="h-2 w-2 rounded-sm" style={{backgroundColor:item.background,border:'1px solid '+item.color}} />{item.label}</button>)}</div>}
          {sourceHeaderGroups.length > 0 && <div aria-label="Original Excel header color groups" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-white px-3 py-1 text-[10px] text-slate-600">{sourceHeaderGroups.map(group => <button type="button" key={group.group} className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => { const column = renderedGridColumns.find(column => column.sourceHeader?.group === group.group); const header = column && headerCellRefs.current.get(column.key); if (header && tableViewportRef.current) scrollToTableColumn(tableViewportRef.current, header); }}><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-slate-300" style={{ backgroundColor: group.background }} />{group.label}</button>)}</div>}
          {headerFormatting.configuration}{!showVisualCards && <ReportCellFormattingToolbar selectedFontSize={selectedFormats[0]?.fontSize ?? 12} formulaBar={formulas.bar} advanced selectionIsItalic={selectedFormats.length>0&&selectedFormats.every(f=>f.italic)} selectionIsUnderlined={selectedFormats.length>0&&selectedFormats.every(f=>f.underline)} selectedCellCount={sharedDesign.canEdit&&columns.length?selectedFormatCellKeys.size:0} selectionIsBold={selectionIsBold} selectedTextColor={selectedTextColor} selectedBackgroundColor={selectedBackgroundColor} onApply={applyCellFormat} {...headerFormatting.toolbarProps} />}
          <div ref={tableViewportRef} onPointerDownCapture={event=>{if(event.button===2&&(event.target as Element).closest("tbody td"))event.preventDefault();rangeDrag.onPointerDownCapture(event);}} onClickCapture={rangeDrag.onClickCapture} onPaste={(event) => void handleReportPaste(event)} onCopy={handleReportCopy} className={`${!showVisualCards ? `${REPORT_GRID_VIEWPORT_CLASS} ${SPREADSHEET_ATTACHED_VIEWPORT_CLASS}` : "relative min-h-48 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"} w-full`}>
            {activeError && <div role="alert" className="border-b border-rose-100 px-3 py-2 text-xs text-rose-700">{activeError} Your current data and drafts are preserved. Use Retry loading.</div>}
            {showVisualCards ? (
              displayedRows.length === 0 ? (
                null
              ) : (
                <ReportVisualCards
                  rows={displayedRows}
                  columns={columns}
                  reportKey={reportKey}
                  onOpenTrip={onOpenTrip}
                />
              )
            ) : (
              <table {...headerFormatting.tableProps} data-compact-headers={transactionView ? "true" : undefined} className="spreadsheet-grid w-max min-w-full border-separate border-spacing-0 text-left">
                <thead className={`${tableUi.thead} bg-white`}>
                  <tr style={rowHeights.headerStyle}>
                    <th
                      ref={selectionColumnRef}
                      style={{ width: SPREADSHEET_GUTTER_WIDTH, minWidth: SPREADSHEET_GUTTER_WIDTH }}
                      scope="col"
                      className="spreadsheet-gutter sticky left-0 top-0 z-[70] whitespace-nowrap border-b border-r border-slate-100/70 bg-slate-50 px-1 py-1">
                      <SpreadsheetRowSelectionHeader active={cellSelection?.mode==="row"&&selectedRowKeys.length>0} checked={allMatchingRowsSelected} partial={selectedRowKeys.length>0&&!allMatchingRowsSelected} disabled={isLoading||selectAllRequest.busy||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onChange={checked=>{if(checked)selectAllGridCells();else{setCellSelection(null);reportSelection.clear(reportKey);setSelectionRecords([]);}}}/>
                    {rowHeights.headerHandle()}</th>
                    {presentationColumns.map((column) => {
                      if(!columns.length)return <th key={column.key} scope="col" style={{width:180,minWidth:180}} className={REPORT_GRID_HEADER_CELL_CLASS}><div aria-hidden="true" className="h-3 w-20 animate-pulse rounded-sm bg-slate-100"/></th>;
                      const columnWidth = columnLayout.widths?.[column.key] ?? defaultReportColumnWidth(column);
                      const sortable = sortableFields.includes(column.key);
                      const isActiveSort = activeSortBy === column.key;
                      const pinSide = pinnedColumnSides[column.key];
                      const isPinned = Boolean(pinSide);
                      const isOuterPinnedEdge = pinSide === "left"
                        ? leftPinnedColumnKeys.at(-1) === column.key
                        : pinSide === "right" && rightPinnedColumnKeys[0] === column.key;
                      const columnColor = columnLayout.colors?.[column.key];
                      const sourceHeader = allTripRecords ? column.sourceHeader : undefined;
                      const SortIcon = !isActiveSort
                        ? ArrowUpDown
                        : sortOrder === "asc"
                          ? ArrowUp
                          : ArrowDown;
                      return (
                      <th
                        key={column.key}
                        {...headerFormatting.props(column.key)} onContextMenu={event=>setOpenColumnMenu({key:column.key,...headerFormatting.menuPosition(event)})}
                        ref={(element) => {
                          if (element) headerCellRefs.current.set(column.key, element);
                          else headerCellRefs.current.delete(column.key);
                        }}
                        data-field-category={column.fieldCategory}
                        data-source-header-group={sourceHeader?.group}
                        data-category-default={!columnColor && !sharedDesign.columns[column.key]?.header?.backgroundColor && !sharedDesign.columns[column.key]?.format?.backgroundColor ? "true" : undefined}
                        title={sourceHeader?.label ?? (column.fieldCategory ? FIELD_CATEGORIES[column.fieldCategory].label : undefined)}
                        scope="col"
                        draggable={false}
                        onDragOver={(event) => { if (draggedColumnKey) event.preventDefault(); }}
                        onDrop={(event) => { event.preventDefault(); if (draggedColumnKey) reorderReportColumn(draggedColumnKey, column.key); setDraggedColumnKey(null); }}
                        style={{ width: columnWidth, minWidth: columnWidth, maxWidth: columnWidth, position: "sticky", top: 0, ...(columnColor ? { "--report-column-color": columnColor } as CSSProperties : {}), ...categoryHeaderStyle(column.fieldCategory), ...reportHeaderAppearance(sharedDesign.columns[column.key], columnColor), ...(sourceHeader ? { backgroundColor: sourceHeader.background, color: sourceHeader.color } : {}), ...(isPinned ? { ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? SPREADSHEET_GUTTER_WIDTH } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 60 } : { zIndex: 40 }) }}
                        className={`${REPORT_GRID_HEADER_CELL_CLASS} ${columnColor ? "bg-[var(--report-column-color)]" : "bg-white"} ${isPinned ? `${isOuterPinnedEdge ? pinSide === "left" ? "shadow-[4px_0_8px_-6px_rgba(11,35,65,0.35)]" : "shadow-[-4px_0_8px_-6px_rgba(11,35,65,0.35)]" : ""}` : ""} ${
                          column.type === "number" ||
                          ["quantity", "cbm", "subcon_rate_manual"].includes(
                            column.key,
                          )
                            ? "text-right"
                            : "text-left"
                        }`}>
                        {headerFormatting.editor(column.key)}
                        <div className="spreadsheet-header-content flex min-w-0 items-center justify-between gap-2">
                          <button
                            type="button"
                            draggable={!allTripRecords && sharedDesign.canEdit && sharedDesign.loaded}
                            data-spreadsheet-header-title title={`Drag to reorder ${headerFormatting.title(column.key,column.title)}`}
                            aria-label={`Drag to reorder ${column.title}`}
                            onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.key); setDraggedColumnKey(column.key); }}
                            onDragEnd={() => setDraggedColumnKey(null)}
                            className="min-w-0 cursor-grab whitespace-normal rounded px-1 py-0.5 text-left leading-tight text-inherit active:cursor-grabbing"
                            >
                            {headerFormatting.title(column.key, column.title)}
                            {sortable && isActiveSort && column.key !== "loading_date" && <SortIcon aria-hidden="true" className={`ml-1 inline h-3 w-3 ${columnColor ? "text-slate-700" : "text-[#2678b9]"}`} />}
                          </button>

                        </div>
                        <span role="separator" aria-label={`Resize ${column.title} column`} aria-orientation="vertical" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); autoFit.clearWidth(column.key); setColumnLayout((current) => ({ ...current, widths: { ...(sharedWidths.loaded ? {} : current.widths), ...sharedWidths.widths } })); setColumnResize({ key: column.key, startX: event.clientX, startWidth: headerCellRefs.current.get(column.key)?.getBoundingClientRect().width ?? columnWidth }); }} className="absolute right-0 top-0 z-[60] h-full w-1.5 cursor-col-resize touch-none hover:bg-blue-400/60" />
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {virtualItems.map(item => {
                    if(item.spacer!==undefined)return <tr key={`gap-${item.index}`} data-virtual-spacer aria-hidden="true" style={{height:item.spacer}}><td colSpan={renderedGridColumns.length+1} style={{height:item.spacer,padding:0,border:0}} /></tr>;
                    const index=item.index,row=displayedRows[index];
                    const currentRowKey = rowKey(reportKey, row, index);
                    const selectionKey = getReportRowKey(reportKey, row);
                    return (
                      <tr
                        key={currentRowKey}
                        data-virtual-index={index} data-new-product-draft={row._new_product_draft ? "true" : undefined}
                        style={rowHeights.style(selectionKey ?? currentRowKey)}
                        data-report-selection-key={selectionKey ?? undefined}
                        className={`group report-data-row ${REPORT_GRID_ROW_CLASS} ${selectionKey&&reportSelection.isSelected(selectionKey)?"bg-blue-50/50":""}`}>
                        <td style={{ width: SPREADSHEET_GUTTER_WIDTH, minWidth: SPREADSHEET_GUTTER_WIDTH }} className="spreadsheet-gutter sticky left-0 z-30 whitespace-nowrap border-r border-slate-100/70 bg-slate-50 px-1 py-1 shadow-[3px_0_5px_-5px_rgba(11,35,65,0.65)]">
                          {cellSelection?.mode==="row"?<input type="checkbox" className="spreadsheet-row-checkbox" aria-label={`Select spreadsheet row ${index+1}`} checked={cellSelection.rows?.includes(selectionKey??selectionRowKeys[index])??false} onChange={()=>selectWholeRow(selectionKey??selectionRowKeys[index],true)}/>:<button type="button" aria-label={`Select spreadsheet row ${sheetRowOffset+index+1}`} title="Select row" onClick={event=>selectWholeRow(selectionKey??selectionRowKeys[index],event.ctrlKey||event.metaKey,event.shiftKey)} className="w-full text-center focus-visible:outline-2 focus-visible:outline-blue-500"><SpreadsheetRowNumber value={sheetRowOffset + index + 1} /></button>}
                          {selectionKey && rowHeights.handle(selectionKey)}
                        </td>
                        {renderedGridColumns.map((column, visibleColumnIndex) => {
                          const columnWidth = columnLayout.widths?.[column.key] ?? defaultReportColumnWidth(column);
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
                          const remoteEditors=collaboration.peers(collaborationCell(transactionView?"trips":reportKey,editableTarget));
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
                          const formatRowKey = getReportRowKey(reportKey, row)??selectionRowKeys[index];
                          const formatKey = formatRowKey ? reportCellFormatKey(formatRowKey, column.key) : "";
                          const cellFormat = formatKey ? reportCellFormatFor(cellFormats,formatKey) : undefined;
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
                              {...formulas.cellProps(row,column.key)}
                              {...rangeDrag.cell(formatRowKey,column.key)}
                              data-report-column-key={column.key}
                              data-search-match={searchNeedle && (matchesSpreadsheetSearch(row[column.key],searchNeedle) || matchesSpreadsheetSearch(displayValue(row[column.key], column.type, column.key),searchNeedle)) ? "true" : undefined}
                              data-spreadsheet-selected={isFormatSelected ? "true" : undefined}
                              onContextMenu={event=>openCellContextMenu(event,formatRowKey,column.key)}
                              data-cell-hover-disabled={isPinned || isEditing || isFormatSelected || fillRange ? "true" : undefined}
                              style={{
                                width: columnWidth,
                                minWidth: columnWidth,
                                maxWidth: columnWidth,
                                ...(remoteEditors.length?{boxShadow:`inset 0 0 0 2px ${remoteEditors[0].color}`} : {}),
                                ...(isPinned ? { position: "sticky" as const, ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? SPREADSHEET_GUTTER_WIDTH } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 20 } : {}),
                                ...(columnColor ? { "--report-column-color": columnColor } as CSSProperties : {}),
                                ...reportColumnAppearance(sharedDesign.columns[column.key], cellFormat, columnColor),
                              }}
                              onPointerEnter={() => extendFillGesture(row, column)}
                              onClick={(event) => {
                                if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
                                selectFormatCell(row, column.key, event.shiftKey);
                                if (!event.shiftKey && !isEditing) {
                                  beginEditCell(row, index, column.key);
                                }
                              }}
                              className={`group/cell relative ${isRemarksColumn ? "min-w-[14rem] max-w-[30rem] whitespace-pre-wrap break-words align-top" : "max-w-[22rem]"} ${REPORT_GRID_BODY_CELL_CLASS} border-r border-slate-100/70 text-slate-800 last:border-r-0 ${columnColor && !cellFormat?.backgroundColor ? "bg-[var(--report-column-color)]" : ""} ${isPinned ? `${columnColor && !cellFormat?.backgroundColor ? "" : "bg-white"} ${isOuterPinnedEdge ? pinSide === "left" ? "shadow-[4px_0_7px_-5px_rgba(11,35,65,0.75)]" : "shadow-[-4px_0_7px_-5px_rgba(11,35,65,0.75)]" : ""}` : ""} ${fillRange ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""} ${isFormatSelected ? "outline outline-2 outline-inset outline-blue-500" : ""} ${
                                isEditable
                                  ? "cursor-text transition"
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
                              <CollaborativeCell target={liveDraftCell(transactionView?"trips":reportKey,editableTarget,draftTrackerColumns.transmittal_ref)} selectionPresence={remoteEditors}>{formulas.render(row,column.key,<>
                              {column.key==="trip_issues"? <TripIssueCell token={accessToken??""} tripId={String(row.trip_id??row._trip_id??"")} stopId={typeof (row.trip_stop_id??row._trip_stop_id)==="string"?String(row.trip_stop_id??row._trip_stop_id):null} status={row.trip_status??row.status}/> : column.key==="trip_details"?(()=>{
                                const target=tripDetailsTarget(row);
                                return target ? <span className="inline-flex items-center gap-1">{transactionView&&<TripIssueCell iconOnly token={accessToken??""} tripId={target.tripId} stopId={target.stopId??null} status={row.trip_status??row.status}/>}<SpreadsheetDetailsAction href={target.href} label={`View trip details for ${rowText(row,"dispatch_number","trip_number") || "trip"}`} onClick={event => { event.stopPropagation(); if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); if (onOpenTrip) onOpenTrip(target.tripId, target.stopId); else navigate(target.href); } }} /></span> : <span aria-label="Trip details unavailable" />;
                              })():isEditing && editingCell ? (
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
                                ) : (configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="DROPDOWN") || editingCell.definition.editor ===
                                    "status" ||
                                  editingCell.definition.editor ===
                                    "boolean" ? (
                                  <ReportDropdownEditor
                                    label={column.title}
                                    value={editingCell.value}
                                    displayValue={editingCell.definition.editor === "boolean" ? editingCell.value === "true" ? "Yes" : editingCell.value === "false" ? "No" : "" : dropdownChoices.find((choice) => choice.value === editingCell.value)?.label ?? editingCell.value}
                                    options={configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="DROPDOWN" ? (sharedDesign.columns[column.key]?.input?.options??[]).filter(option=>option.active||option.value===editingCell.value).map(option=>({value:option.value,label:option.label,color:option.color})) : dropdownChoices}
                                    knownValues={editingCell.definition.dropdownField ? dropdownValuesByField[editingCell.definition.dropdownField] ?? [] : []}
                                    managedOptions={dropdownField ? activeDropdownOptionsByField[dropdownField] ?? [] : []}
                                    loading={editingCell.definition.editor === "status" && dropdownOptionsLoading}
                                    error={editingCell.definition.editor === "status" ? dropdownOptionsError : undefined}
                                    allowAdd={configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="DROPDOWN"||editingCell.definition.editor === "status" && editingCell.definition.dropdownField !== "letter_status"}
                                    canManageOptions={canManageDropdowns && (editingCell.definition.editor === "status"||configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="DROPDOWN")}
                                    disabled={cellSaveState?.rowKey === currentRowKey && cellSaveState.status === "saving"}
                                    onSelect={(value) => {
                                      const nextCell = { ...editingCell, value };
                                      setEditingCell(nextCell);
                                    }}
                                    onCommitSelection={(value) => void commitEditableCell({ ...editingCell, value })}
                                    onCommitBlur={() => void commitEditableCell()}
                                    onAdd={(value) => configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="DROPDOWN"?addConfiguredCellOption(editingCell,value):addTypedOptionAndSave(editingCell, value)}
                                    onEditOption={editOptionDisplayLabel}
                                    onCancel={() => { cancelNextBlur.current = true; setEditingCell(null); setCellSaveState(null); }}
                                    onClose={() => void commitEditableCell()}
                                  />
                                ) : (
                                  <div className="spreadsheet-editor-host grid min-w-0 w-full gap-1">
                                  <ReportTextCellEditor
                                    buffered
                                    value={editingCell.value}
                                    saveState={cellSaveState?.rowKey===currentRowKey&&cellSaveState.field===column.key?cellSaveState.status:undefined}
                                    type={configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="NUMBER"?"number":configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="DATE"?"date":editingCell.definition.editor === "number" ? "number" : editingCell.definition.editor === "date" ? "date" : editingCell.definition.editor === "datetime" ? isTripTimeField(editingCell.field)&&manilaDateTime(editingCell.originalTimestamp??"")?"time":"datetime-local" : "text"}
                                    multiline={editingCell.definition.sourceField === "remarks"||editingCell.field==="issue_reason"}
                                    label={`Edit ${column.title}`}
                                    placeholder=""
                                    step={editingCell.definition.editor === "number" && editingCell.field === "page_no" ? 1 : "any"}
                                    disabled={cellSaveState?.rowKey === currentRowKey && cellSaveState.status === "saving"}
                                    commitOnBlur={!mentionControlActive.current}
                                    onChange={(value) => keepTextDraftLocal({ ...editingCell, value })}
                                    onCommit={(value) => commitEditableCell({ ...editingCell, value })}
                                    onCancel={() => { bufferedTextDraft.current=null; setEditingCell(null); setCellSaveState(null); }}
                                    className="w-full min-w-0 text-inherit"
                                  />
                                  {(editingCell.tripId || editingCell.storeCallId) && editingCell.definition.sourceField === "remarks" && (
                                    <>
                                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { mentionControlActive.current = true; void loadMentionOptions(); }} className="w-fit rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-[#2678b9] hover:bg-blue-50">@ Mention admin or staff</button>
                                      {mentionOptions.length > 0 && mentionControlActive.current && (
                                        <select aria-label="Select admin or staff to mention" defaultValue="" onBlur={() => { mentionControlActive.current = false; void commitEditableCell(); }} onChange={(event) => {
                                          const option = mentionOptions.find((item) => item.id === event.target.value);
                                          if (!option) return;
                                          const current = bufferedTextDraft.current?.rowKey===editingCell.rowKey&&bufferedTextDraft.current.field===editingCell.field?bufferedTextDraft.current:editingCell;
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
                                      {mentionLoading && <span className="text-[10px] text-slate-500">Loading usersâ€¦</span>}
                                    </>
                                  )}
                                  </div>
                                )
                              ) : configurableTextColumn(column.key)&&sharedDesign.columns[column.key]?.input?.type==="DROPDOWN" ? (()=>{const option=sharedDesign.columns[column.key]?.input?.options?.find(option=>option.value===String(row[column.key]??""));return <span className="inline-block rounded-sm px-1 py-0.5 text-xs" style={option?.color?{color:option.color,backgroundColor:`${option.color}18`}:undefined}>{option?.label??String(row[column.key]??"")}</span>;})() : isEditable ? (
                                <div className="flex items-center justify-between gap-2">
                                  {editableTarget?.editor === "status" ? (
                                    <StatusBadge color={dropdownOptions.find(option=>option.field_key===dropdownField&&option.option_value===String(row[column.key]??""))?.color}
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
                                      className={["dr_number","transaction_dr_number"].includes(column.key)?"block whitespace-normal break-words":"block truncate"}
                                      title={displayValue(
                                        row[column.key],
                                        column.type,column.key,
                                      )}>
                                      {editableTarget?.editor === "boolean"
                                        ? row[column.key] === true ||
                                          row[column.key] === "true"
                                          ? "Yes"
                                          : "No"
                                        : displayValue(
                                            row[column.key],
                                            column.type,column.key,
                                          )}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span
                                  className={["dr_number","transaction_dr_number"].includes(column.key)?"block whitespace-normal break-words":"block truncate"}
                                  title={displayValue(
                                    row[column.key],
                                    column.type,column.key,
                                  )}>
                                  {displayValue(row[column.key], column.type,column.key)}
                                </span>
                              )}
                              </>)}</CollaborativeCell>
                              {isEditable && !isEditing && !formulas.has(row,column.key) && (
                                <button
                                  data-spreadsheet-fill-handle
                                  type="button"
                                  title={`Drag to fill from ${column.title}`}
                                  aria-label={`Drag to fill from ${column.title}`}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    beginFillGesture(row, index, column);
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  className="absolute bottom-0 right-0 z-10 flex h-4 w-4 touch-none items-center justify-center rounded-sm border border-blue-300 bg-white text-blue-600 opacity-0 shadow-sm transition group-hover/cell:opacity-100 focus:opacity-100">
                                  <GripVertical aria-hidden="true" className="h-3 w-3 rotate-90" />
                                </button>
                              )}

                            </td>
                          );
                        })}

                      </tr>
                    );
                  })}
                  <SpreadsheetBlankRows count={spreadsheetPadding.count} height={spreadsheetPadding.height} loading={isLoading&&!displayedRows.length} start={sheetRowOffset+displayedRows.length+1} gutterWidth={SPREADSHEET_GUTTER_WIDTH}
                    rowSelection={cellSelection?.mode==="row" ? new Set(cellSelection.rows?.map(key=>Number(key.split(":").at(-1)))??[]) : undefined}
                    onRowSelect={(number,event)=>selectWholeRow(`virtual:${transactionView?"trips":reportKey}:slot:${number}`,cellSelection?.mode==="row"||event.ctrlKey||event.metaKey,event.shiftKey)}
                    cellProps={(number,column)=>{const id=`virtual:${transactionView?"trips":reportKey}:slot:${number}`,key=reportCellFormatKey(id,column);return {...formulas.virtualCellProps(id,column),...rangeDrag.cell(id,column),onContextMenu:event=>openCellContextMenu(event,id,column),"data-spreadsheet-selected":selectedFormatCellKeys.has(key)?"true":undefined,className:selectedFormatCellKeys.has(key)?"relative outline outline-2 outline-inset outline-blue-500":"relative",style:reportColumnAppearance(sharedDesign.columns[column],cellFormats[key],columnLayout.colors?.[column])};}}
                    columns={presentationColumns.map(column=>({key:column.key,width:columnLayout.widths?.[column.key]??(columns.length?defaultReportColumnWidth(column):180),style:{...reportColumnAppearance(sharedDesign.columns[column.key],undefined,columnLayout.colors?.[column.key]),...(pinnedColumnSides[column.key]?{position:"sticky",backgroundColor:reportColumnAppearance(sharedDesign.columns[column.key],undefined,columnLayout.colors?.[column.key]).backgroundColor??"white",left:pinnedColumnSides[column.key]==="left"?leftPinOffsets[column.key]:undefined,right:pinnedColumnSides[column.key]==="right"?rightPinOffsets[column.key]:undefined,zIndex:20}:{})}}))}/>

                </tbody>
              </table>
            )}
          </div>
          {!infiniteRows&&(pageCount>1||page>1)&&<div aria-label="Table pagination" className="flex items-center justify-end gap-2 border-t border-slate-200 px-3 py-1 text-[11px] text-slate-500"><button type="button" disabled={isLoading||page<=1||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onClick={()=>setPage(current=>Math.max(1,current-1))} className="rounded-sm border px-2 py-1 disabled:opacity-40">Previous</button><label>Page <input key={page} aria-label="Go to page" inputMode="numeric" defaultValue={page} disabled={isLoading||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} onBlur={event=>{const next=Number(event.target.value);if(Number.isInteger(next)&&next>=1&&next<=pageCount)setPage(next);else event.target.value=String(page);}} className="w-12 rounded-sm border border-slate-200 px-1 text-center"/></label><span>of {pageCount}</span><button type="button" disabled={isLoading||page>=pageCount||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onClick={()=>setPage(current=>Math.min(pageCount,current+1))} className="rounded-sm border px-2 py-1 disabled:opacity-40">Next</button></div>}
          {infiniteRows&&moreRowsError&&<div role="alert" className="flex shrink-0 items-center justify-center gap-2 border-t border-amber-100 bg-white py-1 text-xs text-amber-800"><span>{moreRowsError}</span><button type="button" disabled={loadingMore} onClick={()=>{setMoreRowsError('');void loadMoreRowsRef.current();}} className="rounded px-2 py-1 text-blue-700">Retry loading</button></div>}
          {infiniteRows&&loadingMore&&<div role="status" className="flex shrink-0 justify-center border-t border-slate-100 bg-white py-1 text-xs text-slate-500">Loading more rows...</div>}
          <SpreadsheetHiddenColumns sheet={transactionView?"trips":reportKey} columns={hiddenColumns.map(column=>({...column,title:headerFormatting.title(column.key,column.title)}))} onRestore={restoreReportColumn} onRestoreAll={() => saveColumnLayout({ ...columnLayout, order: layoutColumnKeys, hidden: [] })} />
        </>
      </section>
      {physicalDeletion&&accessToken&&<PhysicalRecordDeletionDialog token={accessToken} targets={physicalDeletion} onClose={()=>setPhysicalDeletion(null)} onDeleted={deleted=>{const targets=new Set(deleted.map(target=>target.id));const field=deleted[0]?.source==="store_calls"?"store_call_id":"trip_stop_id";const retain=(current:ReportRow[])=>current.filter(row=>!targets.has(String(row[field]??row[`_${field}`])));const retainedKeys=new Set(retain(displayedRowsRef.current).flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[key]:[];}));reportSelection.selectOnly(reportKey,reportSelection.getKeys(reportKey).filter(key=>retainedKeys.has(key)));setCellSelection(current=>current?.mode==="row"?{...current,rows:current.rows?.filter(key=>retainedKeys.has(key))}:current);setRows(retain);scheduleRealtimeRefreshRef.current();}}/>}
      {rowDeletion&&accessToken&&<SpreadsheetRowDeletionDialog token={accessToken} targets={rowDeletion} onClose={()=>setRowDeletion(null)} onDeleted={ids=>{
        ids.forEach(id=>removeCachedReportRecord("trip_line_items",id));
        const removed=new Set(ids),retain=(current:ReportRow[])=>current.filter(row=>!removed.has(String(row.trip_line_item_id??row._trip_line_item_id)));
        const retained=retain(displayedRowsRef.current),retainedKeys=new Set(retained.flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[key]:[];}));
        reportSelection.selectOnly(reportKey,reportSelection.getKeys(reportKey).filter(key=>retainedKeys.has(key)));
        setCellSelection(current=>current?.mode==="row"?{...current,rows:current.rows?.filter(key=>retainedKeys.has(key))}:current);
        setRows(retain);updateCachedReportPages(reportKey,accessToken,bundle=>({...bundle,rows:retain(bundle.rows)}));
        scheduleRealtimeRefreshRef.current();
      }}/>}
      {cellContextMenu&&<SpreadsheetCellContextMenu x={cellContextMenu.x} y={cellContextMenu.y} count={selectedFormatCellKeys.size} canFormat={sharedDesign.canEdit&&columns.length>0}
        format={{bold:selectionIsBold,italic:selectedFormats.length>0&&selectedFormats.every(format=>format.italic),color:selectedTextColor,backgroundColor:selectedBackgroundColor}}
        onApply={applyCellFormat} onSelectRow={()=>selectWholeRow(cellContextMenu.row)} onSelectColumn={()=>selectWholeColumn(cellContextMenu.field)} onClose={()=>setCellContextMenu(null)}/>}
      {openColumnMenu && (() => {
        const menuColumn = columns.find((column) => column.key === openColumnMenu.key);
        if (!menuColumn) return null;
        const dropdownField = getReportEditDefinition(reportKey, menuColumn.key)?.dropdownField;
        return <ReportColumnActionsMenu
          title={menuColumn.title}
          position={openColumnMenu}
          onClose={() => setOpenColumnMenu(null)} onRename={allTripRecords && menuColumn.sourceHeader ? undefined : () => headerFormatting.startRename(openColumnMenu.key, menuColumn.title)} onRestoreTitle={allTripRecords && menuColumn.sourceHeader ? undefined : () => headerFormatting.restoreTitle(openColumnMenu.key)} onConfigureInput={() => dropdownField ? openDropdownManager(dropdownField) : headerFormatting.configure(openColumnMenu.key, columns.find(column=>column.key===openColumnMenu.key)?.title??openColumnMenu.key)}
          sortActions={sortableFields.includes(menuColumn.key) ? [
            { label: "Sort ascending", active: activeSortBy === menuColumn.key && sortOrder === "asc", onClick: () => { setSortBy(menuColumn.key); setSortOrder("asc"); setPage(1); } },
            { label: "Sort descending", active: activeSortBy === menuColumn.key && sortOrder === "desc", onClick: () => { setSortBy(menuColumn.key); setSortOrder("desc"); setPage(1); } },
          ] : undefined}
          pinned={Boolean(pinnedColumnSides[menuColumn.key])}
          onTogglePin={() => toggleColumnPinAutomatically(menuColumn.key)}
          onEditColumn={() => setEditingColumnColor(menuColumn.key)}
          canManageOptions={Boolean(dropdownField && canManageDropdowns)}
          onManageOptions={dropdownField ? () => openDropdownManager(dropdownField) : undefined}
          onHide={() => hideReportColumn(menuColumn.key)} />;
      })()}
      {editingColumnColor && <ReportColumnColorDialog
        columnName={columns.find((column) => column.key === editingColumnColor)?.title ?? "this column"}
        color={columnLayout.colors?.[editingColumnColor] ?? ""}
        onChange={(color) => setReportColumnColor(editingColumnColor, color)}
        onReset={() => setReportColumnColor(editingColumnColor, null)}
        onClose={() => setEditingColumnColor(null)} />}
      {managingDropdownField && accessToken && canManageDropdowns && <ReportDropdownOptionsDialog
        key={managingDropdownField}
        token={accessToken}
        field={managingDropdownField}
        options={dropdownOptions}
        onClose={() => setManagingDropdownField(null)}
        onOptionsUpdated={(options) => { setDropdownOptions(options); setDropdownOptionsError(""); }} />}
      </FlexibleTableSectionTabs>
    </div>
    </TripIssuesProvider>
  );
}
