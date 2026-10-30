import TripTableColumnResizeHandle from "./TripTableColumnResizeHandle";
import {TripTableLoading} from "./TripTableLoading";
import {selectTripAxis,selectTripCells,tripSelectionText,tripSelectedAxes} from "./trip-table-selection";
import {TripTableTextEditor} from "./TripTableTextEditor";
import {useReportContextActions,type ContextAction} from "./useReportContextActions";
import ModernCellControls from "./ModernCellControls";
import ModernReportControls,{useModernReportControls} from "./ModernReportControls";
import ModernReportRows from "./ModernReportRows";
import {modernColumnCategory,modernColumnHeaderStyle,modernCategoryColumns} from "../../services/modern-table-categories";
import {useSpreadsheetInfiniteScroll} from "./useSpreadsheetInfiniteScroll";
import SpreadsheetRowSelectionHeader from "./SpreadsheetRowSelectionHeader";
import {useSpreadsheetDragSelection} from "./useSpreadsheetDragSelection";
import {useSpreadsheetSelectAll} from "./useSpreadsheetSelectAll";
import {fetchReportSelection} from "../../services/report.service";
import {isTripImportSaving,subscribeTripImportActivity} from "../../services/trip-import-activity";
import {useRegisterTopbarFilter} from "./topbarFilters";
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

import {useSpreadsheetColumnWindow} from "./useSpreadsheetColumnWindow";
import {TripTableCellMenu,TripTableColumnMenu} from "./TripTableMenus";
import {tripTableShortcut,TripTableActions,TripTableHeader,TripTableColumnTracks} from "./TripTableShared";
import { useOperationalFormulas } from "./useOperationalFormulas";
import { physicalRowIdentity } from "../../services/spreadsheet-formula";
import { TripIssuesProvider,TripIssueCell } from "./TripIssues";
import { configurableTextColumn } from "./SpreadsheetColumnConfiguration";
import { REPORT_TOOLBAR_ROW_CLASS } from "./ReportSpreadsheetUtils";
import { useSpreadsheetHeaderFormatting } from "./useSpreadsheetHeaderFormatting";
import { reportHeaderAppearance } from "./ReportSpreadsheetUtils";
import { reportColumnAppearance } from "./ReportSpreadsheetUtils";
import TripSheetCell from "./TripSheetCell";
import { useSpreadsheetRowHeights } from "./useSpreadsheetRowHeights";
import { SPREADSHEET_PANEL_CLASS, SPREADSHEET_ATTACHED_VIEWPORT_CLASS, SpreadsheetDetailsAction, SpreadsheetBlankRows, SpreadsheetRowNumber, useSpreadsheetViewport, useSpreadsheetFeedback } from "./SpreadsheetPresentation";
const SPREADSHEET_GUTTER_WIDTH = 32;
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
import {TopbarSearchRegistration} from "./topbarSearch";
import {useRegisterTopbarView,useStoredPageView} from "./topbarView";
import {useRegisterTopbarAction} from "./topbarActions";
import {SpreadsheetLoadedStatus,SpreadsheetHiddenColumns} from "./SpreadsheetWorkspace";
import TransactionCleanupNotice from "./TransactionCleanupNotice";
import {
  ChevronDown,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GripVertical,
} from "lucide-react";
import type ExcelJS from "exceljs";
import { useAuth } from "../../context/AuthContext";
import { TRIP_EDIT_STEPS, REPORT_EDIT_STEPS, tripEditFieldStep, tripEditFieldChanged, validateTripEditField } from "../../services/trip-edit-wizard";
import WholeTripDeletionDialog from "./WholeTripDeletionDialog";
import FlexibleTableSectionTabs from "./FlexibleTableSectionTabs";
import DispatchVisualCards, {DispatchCardsSkeleton} from "./DispatchVisualCards";
import {fetchDispatchCardPage} from "../../services/dispatch-card-page.service";
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
  ReportColumnColorDialog,
  ReportDropdownOptionsDialog,
} from "./ReportSpreadsheetShared";
import { REPORT_GRID_BODY_CELL_CLASS, REPORT_GRID_HEADER_CELL_CLASS, REPORT_GRID_ROW_CLASS, REPORT_GRID_VIEWPORT_CLASS, chooseAutomaticPinSide, expandSpreadsheetRange, parseSpreadsheetClipboard, reportCellFormatKey, reorderColumnKeys, type ReportCellFormat } from "./ReportSpreadsheetUtils";
import { tableUi } from "./dashboardStyles";
import ReportDropdownEditor, { type ReportDropdownChoice } from "./TripTableDropdownEditor";
import type { AdminNotificationTarget } from "../../services/notification.service";
import { StatusBadge } from "./TablePrimitives";

const reportKeys = Object.keys(REPORTS) as ReportKey[];
const REPORT_VIEW_MODES = ["visual", "table"] as const;
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
  const progressiveCount=reportKey==="dispatch-monitoring"&&!sourceLines;
  let finalPagination=firstPage.pagination;
  for (let pageNumber = 2; pageNumber <= finalPagination.totalPages; pageNumber += 1) {
    const pageResult = await fetchReportRows(reportKey, token, {
      page: pageNumber, limit: 100, search: options?.search??"", sortBy: options?.sortBy??"", sortOrder: options?.sortOrder??"asc", filters, fresh: true,
    });
    if(!progressiveCount&&pageResult.pagination.total!==firstPage.pagination.total)throw Error("Records changed during export. Retry to export the current matching data.");
    finalPagination=pageResult.pagination;
    for(const row of pageResult.rows){const key=identity(row);if(!key||seen.has(key))throw Error("Report rows changed during export. Retry to avoid duplicate or missing rows.");seen.add(key);rows.push(row);}
  }
  if(rows.length!==finalPagination.total)throw Error("The export is incomplete. Retry to export every matching row.");
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

const reportDateFormat=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"});
const operationalDateTimeFormat=new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
const operationalTimestampFields=new Set(["warehouse_arrival_at","warehouse_departure_time","departure_from_warehouse_at","arrival_time","departure_time","pod_submitted_at","pod_received_at","delivery_completed_date"]);
const reportNumberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:2});
function displayValue(value: unknown, type: string,field=""): string {
  if (isCbmField(field)) return cbmDisplay(value);
  if (field === "so_approval_date") return value == null ? "" : String(value).replace("T", " ");
  if(isTripTimeField(field))return tripTimeDisplay(value);
  if (value === null || value === undefined || value === "") return "";
  if(operationalTimestampFields.has(field)&&typeof value==="string"&&value.includes("T")){const date=new Date(value);return Number.isNaN(date.getTime())?value:operationalDateTimeFormat.format(date);}
  const formatDate = (date: Date) => reportDateFormat.format(date);
  if (type === "date" && typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const parsed = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : formatDate(parsed);
  }
  if (typeof value === "number") {
    return reportNumberFormat.format(value);
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
  if (import.meta.env.DEV && import.meta.env.VITE_REPORT_EDIT_DIAGNOSTICS === "true") {
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
  scope,
  reportKey,
  rows,
  columns,
  onEdit,
  onDeleteTrips,
  onDeleteRows,
  onDeletePhysical,
  deletionCapabilities,
  canManage,
  enabled=true,
  editingAllowed=true,
  disabled=false,
}: {
  selection: ReturnType<typeof createReportSelection>;
  scope: string;
  reportKey: ReportKey;
  rows: ReportRow[];
  columns: ReportColumn[];
  onEdit: () => void;
  onDeleteTrips?: (rows:ReportRow[])=>void;
  onDeleteRows?: (targets:LineItemDeletionTarget[])=>void;
  onDeletePhysical?:(targets:PhysicalDeletionTarget[])=>void;
  deletionCapabilities:{storeCalls:boolean;emptyStops:boolean};
  canManage: boolean;
  enabled?:boolean;
  editingAllowed?:boolean;
  disabled?:boolean;
}) {
  useSyncExternalStore(reportSelection.subscribe, reportSelection.revision, reportSelection.revision);
  const keys = reportSelection.getKeys(reportKey);
  const rowsByKey=useMemo(()=>new Map(rows.flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[[key,row] as const]:[];})),[rows,reportKey]);
  const hasSelection = enabled && canManage && keys.length > 0 && keys.some(key=>rowsByKey.has(key));
  const row = rowsByKey.get(keys[0]);
  const hasEditableFields = Boolean(row && columns.some((column) => getEditableCellTarget(row, column.key, reportKey)));
  const canEdit = editingAllowed && hasSelection && !disabled && keys.length === 1 && Boolean(row) && hasEditableFields;
  const selected=keys.map(key=>rowsByKey.get(key));
  const tripIds = selectedParentTripIds(selected);
  const physicalRows=selected.filter((candidate):candidate is ReportRow=>Boolean(candidate));
  // Store Calling rows represent calls, not their trip's cargo. Operational
  // event rows likewise must not offer a cargo deletion just because IDs coexist.
  const targets=hasSelection&&!onDeleteTrips && physicalRows.length===keys.length
    ?reportLineItemDeletionTargets(reportKey,physicalRows):null;
  const physicalTargets=hasSelection&&!targets&&!onDeleteTrips&&physicalRows.length===keys.length?physicalDeletionTargets(reportKey,physicalRows,deletionCapabilities):null;
  useRegisterTopbarAction(scope,"edit",canEdit?{label:"Edit selected row",onClick:onEdit}:null);
  useRegisterTopbarAction(scope,"delete",hasSelection&&physicalTargets&&onDeletePhysical
    ?{label:reportKey==="store-calling"?"Delete selected store calls only":"Delete selected empty stops only",disabled,onClick:()=>onDeletePhysical(physicalTargets)}
    :hasSelection&&targets&&onDeleteRows
      ?{label:"Delete selected line items only",disabled,onClick:()=>onDeleteRows(targets)}
      :hasSelection&&onDeleteTrips&&tripIds?.length
        ?{label:tripIds.length===1?"Delete Entire Trip":"Delete Selected Trips",disabled,onClick:()=>onDeleteTrips(physicalRows)}
        :null);
  return null;

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
type CellSelection = { anchorRowKey: string; anchorField: string; focusRowKey: string; focusField: string; mode?: "cells" | "row" | "column"; rows?: string[]; columns?:string[]; cells?:string[] };

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

export default function ReportDataView({
  initialReport = "combined",
  notificationTarget,
  showReportPicker = true,
  showExport = true,
  onDataReady,
  pageTitle,
  onOpenTrip,
  onReportScopeChange,
  toolbarLeading,
  toolbarActions,
  createdTripReference,
  ongoingOnly = false,
  transactionView = false,
  allTripRecords = false,
  topbarSearchScope,
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
  topbarSearchScope?: string;
}) {
  const { accessToken, refreshSession, profile } = useAuth();
  const [reportSelection] = useState(createReportSelection);
  const initializedSheet = useRef("");
  const selectionQuery = useRef("");
  const handledCreatedTrip = useRef<string|null|undefined>(undefined);
  const navigate = useNavigate();
  const [reportKey, setReportKey] = useState<ReportKey>(initialReport);
  const modernTable=useModernReportControls(!transactionView&&["dispatch-monitoring","dispatch","store-calling"].includes(reportKey));
  const gutterWidth=modernTable.modern?0:SPREADSHEET_GUTTER_WIDTH;
  useEffect(() => {
    reportEditDiagnostic("ReportDataView mounted", {
      mode: import.meta.env.MODE,
      development: import.meta.env.DEV,
    });
  }, []);
  const [viewMode, setViewMode] = useStoredPageView(topbarSearchScope??`reports:${reportKey}`, "table", REPORT_VIEW_MODES);
  useRegisterTopbarView(topbarSearchScope??"reports", {value:viewMode==="visual"?"grid":"table",gridLabel:"Visual view",tableLabel:"Table view",onChange:mode=>setViewMode(mode==="grid"?"visual":"table")});
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
  const columns=useMemo(()=>{const defaults=dataColumns.map(column=>({...column,title:spreadsheetColumnLabel(column.title)}));return defaults.length?withTripDetailsColumn(defaults.filter(column=>!["trip_issues","trip_details"].includes(column.key)),transactionView||reportKey==="combined"):[];},[dataColumns,transactionView,reportKey]);
  const sharedWidths = useSharedTableWidths(transactionView ? "trips" : `report:${reportKey}`, accessToken, ["ADMIN", "STAFF"].includes(profile?.role ?? ""));
  const saveSharedColumnWidth = sharedWidths.save;
  const columnLayoutStorageKey = `alzhen:report-column-layout:${profile?.id ?? "user"}:${reportKey}`;
  const workbookOrderStorageKey = `${columnLayoutStorageKey}:${reportKey === "dispatch" ? "dispatch-report-csv-order-v1" : reportKey === "store-calling" ? "store-calling-csv-order-v1" : "dispatch-workbook-order-v3"}`;
  const [localColumnLayout, setColumnLayout] = useState<ReportColumnLayout>(() =>
    typeof window === "undefined" ? { order: [], hidden: [] } : readReportColumnLayout(`alzhen:report-column-layout:${profile?.id ?? "user"}:${initialReport}`),
  );
  const [workbookManualOrder, setWorkbookManualOrder] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      setWorkbookManualOrder(window.localStorage.getItem(workbookOrderStorageKey) === "custom"
        ? readReportColumnLayout(columnLayoutStorageKey).order : null);
    } catch { setWorkbookManualOrder(null); }
  }, [workbookOrderStorageKey, columnLayoutStorageKey]);
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(null);
  const [physicalDeletion,setPhysicalDeletion]=useState<PhysicalDeletionTarget[]|null>(null);
  const [deletionCapabilities,setDeletionCapabilities]=useState({storeCalls:false,emptyStops:false});
  const [deletionCapabilitiesReady,setDeletionCapabilitiesReady]=useState(false);
  useEffect(()=>{if(!accessToken||transactionView)return;let live=true;setDeletionCapabilitiesReady(false);void readRecordDeletionCapabilities(accessToken).then(result=>{if(live){setDeletionCapabilities(result);setDeletionCapabilitiesReady(true);}}).catch(()=>{if(live){setDeletionCapabilities({storeCalls:false,emptyStops:false});setDeletionCapabilitiesReady(true);}});return()=>{live=false;};},[accessToken,transactionView]);
  const [rowDeletion,setRowDeletion]=useState<LineItemDeletionTarget[]|null>(null);
  const [cellContextMenu,setCellContextMenu]=useState<{x:number;y:number;row:string;field:string;rows?:string[];group?:string}|null>(null);
  useEffect(()=>()=>setCellContextMenu(null),[reportKey,accessToken]);
  useSyncExternalStore(reportSelection.subscribe,reportSelection.revision,reportSelection.revision);
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [columnResize, setColumnResize] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const [fillGesture, setFillGesture] = useState<FillGesture | null>(null);
  const fillGestureRef = useRef<FillGesture | null>(null);
  const deletedTripIds = useRef(new Set<string>());
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
      const width = Math.max(72, Math.min(600, columnResize.startWidth + event.clientX - columnResize.startX));
      latestWidth = width;
      setColumnLayout((current) => {
        const next = { ...current, widths: { ...(current.widths ?? {}), [columnResize.key]: width } };
        return next;
      });
    };
    const finish = (event:PointerEvent) => {
      if(event.type==="pointercancel"){setColumnLayout(current=>({...current,widths:{...current.widths,[columnResize.key]:columnResize.startWidth}}));setColumnResize(null);return;}
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
  const editSteps=transactionView?TRIP_EDIT_STEPS:REPORT_EDIT_STEPS;
  const [editModalBusy, setEditModalBusy] = useState(false);
  const [editModalError, setEditModalError] = useState("");
  const [tripEditStep, setTripEditStep] = useState(0);
  const tripEditHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (editModalOpen) tripEditHeading.current?.focus();
  }, [transactionView, editModalOpen, tripEditStep]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [cardPageWindow,setCardPageWindow]=useState<{page:number;totalPages:number}|null>(null);
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
  const visualLoadMoreRef = useRef<HTMLDivElement>(null);
  const autoFit = useSheetAutoFit(tableViewportRef, columns, rows,sharedWidths.widths);
  const columnLayout=useMemo<ReportColumnLayout>(()=>{
    const design=sharedDesign.columns;
    const layout=sharedDesign.loaded?{order:columns.map(c=>c.key).sort((a,b)=>(design[a]?.position??1001)-(design[b]?.position??1001)),hidden:Object.keys(design).filter(k=>design[k].hidden),colors:Object.fromEntries(Object.entries(design).filter(([,v])=>v.color).map(([k,v])=>[k,v.color!]))}:{...localColumnLayout,colors:{},hidden:[],order:columns.map(column=>column.key)};
    return {...layout,widths:columnResize?localColumnLayout.widths:{...(sharedWidths.loaded?{}:localColumnLayout.widths),...sharedWidths.widths,...autoFit.widths}};
  },[sharedDesign.columns,sharedDesign.loaded,columns,localColumnLayout,columnResize,sharedWidths.loaded,sharedWidths.widths,autoFit.widths]);
  // Keep Details pinned by default, but honor an explicit shared pin or unpin.
  const pinnedColumnSides=useMemo(()=>columns.some(column=>column.key==="trip_details")&&sharedDesign.columns.trip_details?.pin===undefined
    ?{...localPinnedColumnSides,trip_details:"right" as const}
    :localPinnedColumnSides,[columns,localPinnedColumnSides,sharedDesign.columns.trip_details?.pin]);
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
  useRegisterTopbarAction(topbarSearchScope??"reports", "export", showExport ? { label: "Export", onClick: () => { setExportError(""); setExportModalOpen(true); } } : null);
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
          .filter((column) => column.key !== "route" && !["pod_submitted_at","pod_received_at"].includes(column.key) && column.type !== "action")
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
    // Ignore legacy orders from before the Dispatch workbook was applied.
    // A new drag order is stored separately and remains available afterward.
    if ((reportKey === "dispatch-monitoring" && !allTripRecords) || reportKey === "dispatch" || reportKey === "store-calling") {
      const keys = new Set(columns.map(column => column.key));
      return workbookManualOrder
        ? [...workbookManualOrder.filter(key => keys.has(key)), ...columns.map(column => column.key).filter(key => !workbookManualOrder.includes(key))]
        : columns.map(column => column.key);
    }
    const availableKeys = new Set(columns.map((column) => column.key));
    const orderedKeys = [
      ...columnLayout.order.filter((key) => availableKeys.has(key)),
      ...columns.map((column) => column.key).filter((key) => !columnLayout.order.includes(key)),
    ];
    return orderedKeys;
  }, [columnLayout.order, columns, allTripRecords, reportKey, workbookManualOrder]);
  const hiddenColumnKeys = useMemo(
    () => new Set((reportKey === "store-calling" && !workbookManualOrder ? [] : columnLayout.hidden).filter((key) => columnsByKey.has(key))),
    [columnLayout.hidden, columnsByKey, reportKey, workbookManualOrder],
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
  const renderedGridColumns = useMemo(()=>modernTable.modern?modernCategoryColumns(gridColumns,modernTable.category):gridColumns,[gridColumns,modernTable.modern,modernTable.category]);
  const leftPinnedColumnKeys = useMemo(
    () => renderedGridColumns.filter((column) => pinnedColumnSides[column.key] === "left").map((column) => column.key),
    [renderedGridColumns, pinnedColumnSides],
  );
  const rightPinnedColumnKeys = useMemo(
    () => renderedGridColumns.filter((column) => pinnedColumnSides[column.key] === "right").map((column) => column.key),
    [renderedGridColumns, pinnedColumnSides],
  );
  // Pinning is a viewport behavior; retain the user's logical shared column order.
  const spreadsheetPadding = useSpreadsheetViewport(tableViewportRef, displayedRows.length, viewMode === "table");
  const presentationColumns=useMemo<ReportColumn[]>(()=>renderedGridColumns.length?renderedGridColumns:Array.from({length:5},(_,index)=>({key:`__loading_${index}`,title:"",type:"action"})),[renderedGridColumns]);
  const infiniteRows=transactionView||viewMode==="table";
  const coordinatedCardBatch=transactionView&&viewMode==="visual";
  const optimizedCardView=coordinatedCardBatch&&!effectiveSearch.trim()&&activeSortBy==="loading_date"&&
    Object.keys(queryFilters).every(key=>key==="source_lines");
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
    if(cellSelection.mode==="cells"&&cellSelection.cells)return new Set(cellSelection.cells);
    const rowStart=selectionRowKeys.indexOf(cellSelection.anchorRowKey),rowEnd=selectionRowKeys.indexOf(cellSelection.focusRowKey);
    const columnStart=presentationColumns.findIndex(column=>column.key===cellSelection.anchorField),columnEnd=presentationColumns.findIndex(column=>column.key===cellSelection.focusField);
    if((cellSelection.mode!=="row"&&[rowStart,rowEnd].some(index=>index<0))||[columnStart,columnEnd].some(index=>index<0))return new Set<string>();
    const selectedRows=cellSelection.mode==="column"?selectionRowKeys:cellSelection.mode==="row"?(cellSelection.rows??[cellSelection.anchorRowKey]):selectionRowKeys.slice(Math.min(rowStart,rowEnd),Math.max(rowStart,rowEnd)+1);
    const selectedRowSet=new Set(selectedRows);
    const formatRows=cellSelection.mode==="row"&&selectedRows.length>1000?selectionRowKeys.filter(key=>selectedRowSet.has(key)):selectedRows;
    const selectedColumns=cellSelection.mode==="column"&&cellSelection.columns?presentationColumns.filter(column=>cellSelection.columns!.includes(column.key)):cellSelection.mode==="row"?presentationColumns:presentationColumns.slice(Math.min(columnStart,columnEnd),Math.max(columnStart,columnEnd)+1);
    return new Set(formatRows.flatMap(row=>selectedColumns.map(column=>reportCellFormatKey(row,column.key))));
  }, [cellSelection, selectionRowKeys, presentationColumns]);
  const queryKey = JSON.stringify({
    accessToken,
    activeSortBy,
    appliedFilters: queryFilters,
    appliedSearch: effectiveSearch,
    page,
    reportKey,
    viewMode,
    retryVersion,
    sortBy: activeSortBy,
    sortOrder,
  });
  const snapshotKey = JSON.stringify({ accessToken, activeSortBy, appliedFilters: queryFilters, appliedSearch: effectiveSearch, page, reportKey, sortOrder, viewMode });
  const pageOptions = useMemo(() => ({
    page,
    // A full 50-row Master List page forces an extra exact count of the
    // expanded source view. The 100-row window also avoids a second read for
    // the common 50–100-row import while table rows remain virtualized.
    limit: allTripRecords && viewMode === "table" ? 100 : 50,
    search: effectiveSearch,
    sortBy: activeSortBy,
    sortOrder,
    filters: queryFilters,
    cardMeta: viewMode === "visual",
  }), [activeSortBy, queryFilters, effectiveSearch, page, sortOrder, viewMode, allTripRecords]);
  const formulas=useOperationalFormulas({viewport:tableViewportRef,token:accessToken,table:transactionView?"trips":`report:${reportKey}`,rows:displayedRows,columns:formulaColumns,identity:physicalRowIdentity,sourceEditor:prepareFormulaSource,virtualRows:virtualGridRows,onSelect:syncGridCellSelection,onActivate:(row,column)=>beginEditCell(row,displayedRows.indexOf(row),column),rowOffset:sheetRowOffset,canEdit:modernTable.canEdit&&["ADMIN","STAFF"].includes(profile?.role??"")&&!headerFormatting.key,paused:Boolean(editingCell||editModalOpen||fillGesture)});
  const formulaFocusIndex=useMemo(()=>formulas.selectedIdentity?(formulaRowLookup.get(formulas.selectedIdentity)?.index??-1):-1,[formulas.selectedIdentity,formulaRowLookup]);
  const windowColumns=useMemo(()=>renderedGridColumns.map(column=>({key:column.key,width:columnLayout.widths?.[column.key]??defaultReportColumnWidth(column)})),[renderedGridColumns,columnLayout.widths]);
  const mountedColumns=useSpreadsheetColumnWindow(tableViewportRef,windowColumns,pinnedColumnSides,[editingCell?.field,formulas.selectedColumn]);
  useEffect(()=>accessToken&&infiniteRows&&!optimizedCardView?retainReportCollection(reportKey,accessToken,pageOptions):undefined,[accessToken,reportKey,pageOptions,infiniteRows,optimizedCardView]);
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
    if(isTripImportSaving()){realtimeRefreshDirty.current=true;return true;}
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
    if(["trip_events","trip_images","pod_review_events","pod_records"].includes(commit.source)||commit.source==="trip_stops"&&(!commit.fields.length||commit.fields.some(f=>["delivery_status","arrival_time","start_unloading_time","finish_unloading_time","departure_time"].includes(f)))){if(!commit.tripId||!refreshOneTrip(commit.tripId))scheduleRealtimeRefreshRef.current();return;}
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
  const allMatchingRowsSelected=selectedPhysicalCount>0&&selectedPhysicalCount===pagination?.total&&pagination.total===displayedRows.length;
  const rangeDrag=useSpreadsheetDragSelection({viewport:tableViewportRef,scope:selectionScope,blocked:Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending||selectAllRequest.busy),onSelect:selectFormatKey,onFinish:(key,field)=>{
    const row=displayedRows.find(row=>getReportRowKey(reportKey,row)===key),id=row?physicalRowIdentity(row):key;
    if(id)formulas.selectCell(id,field,true);
    requestAnimationFrame(()=>tableViewportRef.current?.querySelector<HTMLElement>(`td[data-range-row="${CSS.escape(key)}"][data-range-column="${CSS.escape(field)}"]`)?.focus({preventScroll:true}));
  }});
  const clearOutsideSelection=useRef<()=>void>(()=>{});
  clearOutsideSelection.current=()=>{
    if(editingCell||editModalOpen||formulas.draftPending)return;
    setCellSelection(null);reportSelection.clear(reportKey);setSelectionRecords([]);
    headerFormatting.clear();formulas.clearSelection();
  };
  useEffect(()=>{
    const onPointerDown=(event:globalThis.PointerEvent)=>{
      const target=event.target;
      if(!(target instanceof Element)||tableViewportRef.current?.closest("[hidden]"))return;
      if(target.closest(".al-topbar,.spreadsheet-footer,[data-sheet-tabs],[data-spreadsheet-formatting],[data-spreadsheet-context-menu],[role=menu],[role=dialog],[role=alertdialog]"))return;
      if(tableViewportRef.current?.contains(target)&&target.closest("thead th,tbody td"))return;
      clearOutsideSelection.current();
    };
    document.addEventListener("pointerdown",onPointerDown);
    return()=>document.removeEventListener("pointerdown",onPointerDown);
  },[]);
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
      let left = selectionColumnRef.current?.getBoundingClientRect().width ?? gutterWidth;
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
  }, [gridColumns, gutterWidth, leftPinnedColumnKeys, pinnedColumnSides, rightPinnedColumnKeys, rows]);

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
      isTripImportSaving() ||
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
  useEffect(() => subscribeTripImportActivity(() => {
    if (!isTripImportSaving() && realtimeRefreshDirty.current) {
      realtimeRefreshDirty.current = false;
      savedTripRefreshes.current.clear();
      scheduleRealtimeRefreshRef.current();
    }
  }), []);
  useEffect(() => {
    if (activeReportEdit.current || isTripImportSaving()) return;
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
    if (!transactionView && !deletionCapabilitiesReady) return;

    let active = true;
    const collectionAbort = new AbortController();
    const cached = optimizedCardView ? null : infiniteRows ? getReportCollection(reportKey, accessToken, pageOptions) : getCachedReportPage(reportKey, accessToken, pageOptions);
    const displayCache = cached ?? (optimizedCardView ? null : infiniteRows ? getReportCollection(reportKey, accessToken, pageOptions,true) : getStaleReportPage(reportKey, accessToken, pageOptions));
    const cachedCardBatchReady = !coordinatedCardBatch || !displayCache ||
      new Set(displayCache.rows.map(row => String(row.dispatch_number ?? "").trim()).filter(Boolean)).size >= 3 ||
      Boolean(displayCache.collection && displayCache.collection.page >= displayCache.collection.totalPages);
    if (displayCache) {
      setColumns(displayCache.columns);
      setRows(displayCache.rows.filter(row => !deletedTripIds.current.has(String(row.trip_id))));
      setPagination(displayCache.pagination);
      setLoadedQueryKey(cachedCardBatchReady ? queryKey : null);
      loadedSnapshotKeyRef.current = snapshotKey;
    } else if (!coordinatedCardBatch && loadedSnapshotKeyRef.current === snapshotKey) {
      setLoadedQueryKey(queryKey);
    } else {
      // Preserve a known schema/widths while the requested rows load.
      setRows([]);
      setPagination(null);
      setCardPageWindow(null);
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
        const result = optimizedCardView
          ? await fetchDispatchCardPage(accessToken,pageOptions,1)
          : infiniteRows
          ? await fetchReportCollection(reportKey, accessToken, pageOptions, coordinatedCardBatch?undefined:progress=>{
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
        setCardPageWindow(optimizedCardView?result.collection??null:null);
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
    deletionCapabilitiesReady,
    infiniteRows,
    coordinatedCardBatch,
    optimizedCardView,
    queryKey,
    reportKey,
    refreshSession,
    retryVersion,
    sortBy,
    sortOrder,
    snapshotKey,
  ]);

  const collectionWindow=optimizedCardView?cardPageWindow:infiniteRows&&accessToken?getReportCollection(reportKey,accessToken,pageOptions,true)?.collection:null;
  const hasMoreRows=Boolean(collectionWindow&&collectionWindow.page<collectionWindow.totalPages);
  const loadMoreRows=async()=>{
    if(!accessToken||!infiniteRows||!hasMoreRows||moreRowsFlight.current||activeReportEdit.current||formulas.draftPending||cellSaveInFlight.current)return;
    const expected=snapshotKey;moreRowsFlight.current=true;setLoadingMore(true);setMoreRowsError("");
    try{
      const next=optimizedCardView
        ? await fetchDispatchCardPage(accessToken,pageOptions,(cardPageWindow?.page??0)+1)
        : await fetchNextReportCollection(reportKey,accessToken,pageOptions);
      if(snapshotKeyRef.current!==expected)return;
      setRows(current=>{
        const known=new Set(current.map(row=>getReportRowKey(reportKey,row)));
        return [...current,...next.rows.filter(row=>!known.has(getReportRowKey(reportKey,row))&&!deletedTripIds.current.has(String(row.trip_id))&&!isDeletedReportRecord(row))];
      });
      setPagination(next.pagination);
      if(optimizedCardView)setCardPageWindow(next.collection??null);
    }catch(cause){if(snapshotKeyRef.current===expected&&!(cause instanceof DOMException&&cause.name==="AbortError"))setMoreRowsError("Unable to load more rows. Please try again.");}
    finally{moreRowsFlight.current=false;setLoadingMore(false);}
  };
  const loadMoreRowsRef=useRef(loadMoreRows);loadMoreRowsRef.current=loadMoreRows;
  useEffect(()=>setMoreRowsError(""),[snapshotKey]);
  useSpreadsheetFeedback(moreRowsError,"error");
  useSpreadsheetInfiniteScroll(tableViewportRef,{queryKey:snapshotKey,enabled:infiniteRows&&viewMode==="table",hasMore:hasMoreRows,loading:loadingMore||loadedQueryKey!==queryKey,blocked:Boolean(moreRowsError||editingCell||editModalOpen||formulas.draftPending||formulas.busy||productDrafts.length||physicalDeletion||rowDeletion),revision:rows.length,onLoadMore:()=>loadMoreRowsRef.current()});
  useEffect(() => {
    const target=visualLoadMoreRef.current;
    if(viewMode!=="visual"||!infiniteRows||!target||!hasMoreRows||loadingMore||loadedQueryKey!==queryKey||moreRowsError)return;
    const observer=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting)void loadMoreRowsRef.current();},{rootMargin:"320px"});
    observer.observe(target);
    return()=>observer.disconnect();
  },[viewMode,infiniteRows,hasMoreRows,loadingMore,loadedQueryKey,queryKey,moreRowsError,rows.length]);

  useEffect(() => {
    if (!accessToken) return;
    const reportTables = REPORT_REALTIME_TABLES[reportKey];
    const unsubscribe = subscribeToAdminRealtime((event) => {
      if (event.kind === "batch") {
        if (event.tables.includes("tms_dropdown_options")) dropdownRefreshPending.current = true;
        const socket=collaborationSnapshot();
        if(allTripRecords&&socket.connected&&socket.bridgeHealthy&&event.tables.every(table=>[...COLLABORATION_SOURCES,"trip_events","trip_images","pod_review_events","pod_records"].includes(table)||table==="transaction_deletion_jobs"))return;
        if (event.tables.some((table) => !(socket.connected&&socket.bridgeHealthy&&[...COLLABORATION_SOURCES,"trip_events","trip_images","pod_review_events","pod_records"].includes(table))&&(reportTables.includes(table) || table === "tms_dropdown_options" || table === "transaction_deletion_jobs"))) scheduleRealtimeRefreshRef.current();
        return;
      }
      if (event.kind === "resume") {
        scheduleRealtimeRefreshRef.current();
      } else if (event.kind === "recovered") {
        if (reportTables.includes(event.table)) scheduleRealtimeRefreshRef.current();
      } else if (reportTables.includes(event.payload.table)) {
        const socket=collaborationSnapshot();
        if(socket.connected&&socket.bridgeHealthy&&[...COLLABORATION_SOURCES,"trip_events","trip_images","pod_review_events","pod_records"].includes(event.payload.table))return;
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
    if(!modernTable.canEdit)return undefined;
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
    if (!modernTable.canEdit || cellSaveInFlight.current) return;
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
    }, selectionColumnRef.current?.getBoundingClientRect().width ?? gutterWidth);
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
    if (reportKey === "store-calling" && !workbookManualOrder && next.order.join("\u0000") !== layoutColumnKeys.join("\u0000")) {
      next = { ...next, hidden: [] };
    }
    setColumnLayout(next);
    const reordered=next.order.join("\u0000")!==layoutColumnKeys.join("\u0000");
    if (reordered) void sharedDesign.saveOrder(next.order, getColumnWidth);
    if ((reordered && ((reportKey === "dispatch-monitoring" && !allTripRecords) || reportKey === "dispatch")) ||
      (reportKey === "store-calling" && (reordered || next.hidden.join("\u0000") !== [...hiddenColumnKeys].join("\u0000")))) {
      setWorkbookManualOrder(next.order);
      try { localStorage.setItem(workbookOrderStorageKey, "custom"); } catch { /* The current order still works this session. */ }
    }
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

  function selectFormatKey(key:string,field:string,extend=false,add=false){
    headerFormatting.clear();reportSelection.clear(reportKey);
    setCellSelection(current=>{
      const cell={row:key,column:field},origin=current?{row:current.anchorRowKey,column:current.anchorField}:null;
      const cells=selectTripCells(selectionRowKeys,presentationColumns.map(column=>column.key),current?.mode==="cells"?new Set(current.cells??selectedFormatCellKeys):new Set(),cell,origin,extend,add);
      return {anchorRowKey:extend&&current?current.anchorRowKey:key,anchorField:extend&&current?current.anchorField:field,focusRowKey:key,focusField:field,mode:"cells",cells:[...cells]};
    });
  }
  function syncGridCellSelection(id:string,field:string,extend:boolean,add=false){
    const row=formulaRowLookup.get(id)?.row;
    const key=row?getReportRowKey(reportKey,row):id;
    if(key)selectFormatKey(key,field,extend,add);
  }
  function selectFormatCell(row: ReportRow, field: string, extend: boolean,add=false) {
    const index=displayedRows.indexOf(row),key=getReportRowKey(reportKey,row)??selectionRowKeys[index];
    if(key)selectFormatKey(key,field,extend,add);
  }
  function selectWholeRow(key:string,add=false,extend=false){
    if(selectAllRequest.busy)return;
    if(!selectionRowKeys.includes(key)||!presentationColumns.length)return;
    headerFormatting.clear();
    const keys=[...selectTripAxis(selectionRowKeys,new Set(cellSelection?.mode==="row"?cellSelection.rows??[]:[]),key,cellSelection?.anchorRowKey??null,extend,add)];
    // Only verified physical records enter the existing bulk-action store.
    const known=new Set(selectionRows.flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[key]:[];}));
    reportSelection.selectOnly(reportKey,keys.filter(row=>known.has(row)));
    if(!keys.length){setCellSelection(null);return;}
    setCellSelection({anchorRowKey:extend&&cellSelection?cellSelection.anchorRowKey:key,focusRowKey:key,anchorField:presentationColumns[0].key,focusField:presentationColumns.at(-1)!.key,mode:"row",rows:keys});
  }
  function selectWholeColumn(key:string,extend=false,add=false,preserve=false){
    if(!presentationColumns.length)return;
    if(preserve&&cellSelection?.mode==="column"&&(cellSelection.columns??[cellSelection.focusField]).includes(key))return;
    headerFormatting.clear();reportSelection.clear(reportKey);
    const columns=[...selectTripAxis(presentationColumns.map(column=>column.key),new Set(cellSelection?.mode==="column"?cellSelection.columns??[cellSelection.focusField]:[]),key,cellSelection?.anchorField??null,extend,add)];
    setCellSelection(columns.length?{anchorRowKey:selectionRowKeys[0]??"",focusRowKey:selectionRowKeys.at(-1)??"",anchorField:extend&&cellSelection?cellSelection.anchorField:key,focusField:key,mode:"column",columns}:null);
  }
  function selectAllGridCells(){
    if(!accessToken||!presentationColumns.length||editingCell||editModalOpen||fillGesture||formulas.draftPending)return;
    setSelectionError("");
    const applySelection=(matching:ReportRow[])=>{
      const keys=matching.flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[key]:[];});
      headerFormatting.clear();setSelectionRecords(matching);reportSelection.selectOnly(reportKey,keys);
      if(!keys.length){setCellSelection(null);return;}
      const anchor=physicalGridKeys.find(key=>keys.includes(key))??keys[0];
      setCellSelection({anchorRowKey:anchor,focusRowKey:anchor,anchorField:presentationColumns[0].key,focusField:presentationColumns.at(-1)!.key,mode:"row",rows:keys});
    };
    // The complete filtered result is already in the collection. Re-querying
    // its expanded report view makes even a two-row Select All wait on SQL.
    if(pagination && pagination.total===displayedRows.length && displayedRows.every(row=>getReportRowKey(reportKey,row))){
      applySelection(displayedRows);
      return;
    }
    void selectAllRequest.run(current=>fetchReportSelection(reportKey,accessToken,pageOptions,current),applySelection);
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
    if((!selectedFormatCellKeys.size&&cellSelection?.mode!=="column")||!sharedDesign.canEdit||!columns.length)return;
    if(cellSelection?.mode==="row"&&(cellSelection.rows?.length??0)>1000){setSelectionError("Select at most 1,000 rows for individual cell formatting, or use whole-column formatting.");return;}
    const patch=normalizedFormat(change);
    if(cellSelection?.mode==="column"){
      for(const key of cellSelection.columns??[cellSelection.focusField]){
        const design=sharedDesign.columns[key]??{};
        const cells=Object.fromEntries(Object.entries(design.cells??{}).filter(([,format])=>format).map(([row,format])=>[row,{...(format??{}),...patch}]));
        void sharedDesign.save(key,{format:{...design.format,...patch},header:patch,cells},getColumnWidth(key));
      }
      return;
    }

    const grouped:Record<string,Record<string,ReportCellFormat|null>>={};
    for(const key of selectedFormatCellKeys){const split=key.lastIndexOf("\u0000");if(split<0)continue;const column=key.slice(split+1),row=key.slice(0,split);if(row.startsWith("display:")||column.startsWith("__loading_"))continue;(grouped[column]??={})[row]=patch;}
    // Existing revisioned design queue groups a row/range by column, not one request per cell.
    for(const [column,cells] of Object.entries(grouped))void sharedDesign.save(column,{cells},getColumnWidth(column));
  }
  const selectedFormats=cellSelection?.mode==="column"?(cellSelection.columns??[cellSelection.focusField]).map(key=>({...sharedDesign.columns[key]?.format,...sharedDesign.columns[key]?.header})):[...selectedFormatCellKeys].map(key=>{const column=key.slice(key.lastIndexOf("\u0000")+1);return {...sharedDesign.columns[column]?.format,...reportCellFormatFor(cellFormats,key)};});
  const selectionIsBold=selectedFormats.length>0&&selectedFormats.every(format=>format.bold===true);
  const selectedTextColor=selectedFormats.length>0&&selectedFormats.every(format=>format.color===selectedFormats[0].color)?selectedFormats[0].color??"":null;
  const selectedBackgroundColor=selectedFormats.length>0&&selectedFormats.every(format=>format.backgroundColor===selectedFormats[0].backgroundColor)?selectedFormats[0].backgroundColor??"":null;

  function hideReportColumn(columnKey: string) {
    saveColumnLayout({
      ...columnLayout,
      order: layoutColumnKeys,
      hidden: [...new Set([...hiddenColumnKeys, columnKey])],
    });
  }

  function restoreReportColumn(columnKey: string) {
    saveColumnLayout({
      ...columnLayout,
      order: layoutColumnKeys,
      hidden: [...hiddenColumnKeys].filter((key) => key !== columnKey),
    });
  }

  function reorderReportColumn(sourceKey: string, targetKey: string) {
    if (!sharedDesign.canEdit || !sharedDesign.loaded) return;
    const nextOrder = reorderColumnKeys(layoutColumnKeys, sourceKey, targetKey);
    if (nextOrder === layoutColumnKeys) return;
    saveColumnLayout({ ...columnLayout, order: nextOrder });
  }

  function beginFillGesture(row: ReportRow, index: number, column: ReportColumn) {
    if(!modernTable.canEdit)return;
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
    if (!modernTable.canEdit || !accessToken || cellSaveInFlight.current) return;
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

  function handleReportCopy(event:ReactClipboardEvent<HTMLDivElement>){
    if((event.target as Element).closest("input,textarea,[contenteditable=true]"))return;
    if(!selectedFormatCellKeys.size)return;event.preventDefault();
    event.clipboardData.setData("text/plain",tripSelectionText(displayedRows,renderedGridColumns.map(column=>column.key),selectedFormatCellKeys,row=>getReportRowKey(reportKey,row)??"",(row,column)=>String(row[column]??"")));
  }

  function openSelectedRowEditor() {
    if(!modernTable.canEdit)return;
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
    if(!modernTable.canEdit)return;
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
    if (!modernTable.canEdit) return false;
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
      if(!isRelationship)contextActions.record(targetCell.rowKey,targetCell.field,targetCell.originalValue,String(confirmedCellValue??textValue));
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
  const showVisualCards = viewMode === "visual";
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
        keys.map(async (key) => ({ key, ...(await fetchAllReportRows(key, accessToken, allTripRecords && key === "dispatch-monitoring",exportMode==="current-report"?{...pageOptions,cardMeta:false}:undefined)) })),
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

  const contextActions=useReportContextActions({scope:`${profile?.id}:${reportKey}`,rows:displayedRows,columns:renderedGridColumns,identity:(row:ReportRow)=>getReportRowKey(reportKey,row)??'',value:(row:ReportRow,key:string)=>String(row[key]??''),editable:(row:ReportRow,key:string)=>{const target=getEditableCellTarget(row,key,reportKey);return Boolean(target&&target.editor!=="relationship");},write:async(row:ReportRow,key:string,value:string)=>{const candidate=createEditingCell(row,rows.indexOf(row),key);if(!candidate)return false;candidate.value=value;return commitEditableCell(candidate);},selection:selectedFormatCellKeys,focus:cellContextMenu?{row:cellContextMenu.row,column:cellContextMenu.field}:cellSelection?{row:cellSelection.focusRowKey,column:cellSelection.focusField}:null,enabled:modernTable.canEdit&&!editingCell&&!editModalOpen&&!formulas.draftPending&&!fillGesture&&["ADMIN","STAFF"].includes(profile?.role??""),onError:setSelectionError});
  function reportContextItems():ContextAction[]{
    const menu=cellContextMenu;if(!menu)return [];
    const row=displayedRows.find(row=>getReportRowKey(reportKey,row)===menu.row);
    const target=row?getEditableCellTarget(row,menu.field,reportKey):null;
    const keys=cellSelection?.mode==="row"?cellSelection.rows??[menu.row]:tripSelectedAxes(selectedFormatCellKeys).rows;
    const targetRows=displayedRows.filter(row=>keys.includes(getReportRowKey(reportKey,row)??''));
    const lineTargets=reportLineItemDeletionTargets(reportKey,targetRows),physicalTargets=physicalDeletionTargets(reportKey,targetRows,deletionCapabilities);
    return [...contextActions.actions,
      {label:'Delete selected rows…',danger:true,disabled:!modernTable.canEdit||!["ADMIN","STAFF"].includes(profile?.role??'')||!targetRows.length||!(lineTargets?.length||physicalTargets?.length),onClick:()=>{if(physicalTargets?.length)setPhysicalDeletion(physicalTargets);else if(lineTargets?.length)setRowDeletion(lineTargets);}},
      {label:'Edit cell',disabled:!modernTable.canEdit||!row||!target||selectedFormatCellKeys.size!==1,onClick:()=>{if(row)beginEditCell(row,rows.indexOf(row),menu.field);}},
      {label:'Edit row',disabled:!modernTable.canEdit||!row||keys.length!==1,onClick:()=>{reportSelection.selectOnly(reportKey,[menu.row]);openSelectedRowEditor();}},
      {label:'Open trip details',disabled:!row||keys.length!==1||!tripDetailsTarget(row),onClick:()=>{if(row){const detail=tripDetailsTarget(row);if(detail){if(onOpenTrip)onOpenTrip(detail.tripId,detail.stopId);else navigate(detail.href);}}}},
      ...([44,56,72] as const).map((height,index)=>({label:['Compact row height','Standard row height','Roomy row height'][index],disabled:!sharedDesign.canEdit,onClick:()=>rowHeights.setHeight(menu.group?[...keys,menu.group]:keys,height)})),
    ];
  }
  useRegisterTopbarFilter(topbarSearchScope??"reports", quickFilterConfig ? {
    label: quickFilterConfig.label,
    options: quickFilterOptions,
    value: quickFilterValue,
    disabled: Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending),
    onChange: value => { setAppliedFilters(current => ({...current,[quickFilterConfig.field]:value})); setPage(1); },
  } : null);
  return (
    <TripIssuesProvider token={accessToken} enabled={Boolean(accessToken&&viewMode==="table"&&(transactionView||reportKey==="dispatch"))} tripIds={issueTripIds} onChanged={()=>{if(appliedFilters.issue_filter && appliedFilters.issue_filter !== "All")scheduleRealtimeRefreshRef.current();}}>
    <div className="space-y-2">
      <div className={REPORT_TOOLBAR_ROW_CLASS} style={showVisualCards ? {display:"none"} : undefined}>
        {pageTitle && (
          <h1 className="sr-only">{pageTitle}</h1>
        )}
        {toolbarLeading && <div className="shrink-0" data-report-toolbar-leading>{toolbarLeading}</div>}

        {/* Collaboration outcomes use deduplicated toasts; drafts and recovery stay in the hook. */}
        <div data-report-toolbar-actions className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-[1_1_36rem] lg:flex-nowrap">
          {sharedWidths.feedback}{sharedDesign.feedback}
          <TopbarSearchRegistration scope={topbarSearchScope??"reports"}><ColumnFinder key={reportKey} rowSearch={{value:search,placeholder:transactionView?"Search trips or columns...":"Search records or columns...",onSearch:value=>{setSearch(value);setAppliedSearch(value);setPage(1);}}} columns={columns.filter((column) => !(transactionView && !allTripRecords && column.key === "warehouse_code")).map((column) => ({ ...column, title:headerFormatting.title(column.key,column.title), hidden: hiddenColumnKeys.has(column.key), index: renderedGridColumns.findIndex((item) => item.key === column.key) }))} viewport={tableViewportRef} getHeader={(key) => headerCellRefs.current.get(key)} onReveal={restoreReportColumn} /></TopbarSearchRegistration>
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
            scope={topbarSearchScope??"reports"}
            reportKey={reportKey}
            deletionCapabilities={deletionCapabilities} onDeletePhysical={setPhysicalDeletion}
            canManage={["ADMIN", "STAFF"].includes(profile?.role ?? "")}
            enabled={viewMode==="table"}
            rows={selectionRows}
            disabled={selectAllRequest.busy}
            columns={columns}
            onDeleteTrips={(transactionView||reportKey==="combined")&&profile?.role==="ADMIN"?selected=>{const ids=selectedParentTripIds(selected);if(ids)setWholeTripIds(ids);}:undefined}
            onDeleteRows={!transactionView&&reportKey!=="combined"?setRowDeletion:undefined}
            editingAllowed={modernTable.canEdit} onEdit={openSelectedRowEditor} />

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
          </div>
          {toolbarActions}
        </div>
      </div>
      {rowContext && accessToken && <TripRowContextDialog token={accessToken} initial={selectedProductParent()} action={rowContext} onClose={() => setRowContext(null)} onChosen={parent => { if (rowContext === "parent") addProductRows(parent); else { invalidateReportData(reportKey); setRetryVersion(version=>version+1); setNewRowsMessage(rowContext === "stop" ? "Delivery stop saved. Select it to add product rows." : "Truck assignment saved. Choose cargo allocation in Trip details."); } }} />}
      {transactionView && (productDrafts.length > 0 || newRowsMessage) && <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-y border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900"><span>{newRowsMessage}</span>{productDrafts.length > 0 && <div className="flex gap-3"><button type="button" disabled={newRowsBusy} onClick={() => void saveProductDrafts()} className="rounded bg-[#ffd43b] px-3 py-1.5 font-semibold">{newRowsBusy ? "Saving rows?" : "Save new rows"}</button><button type="button" disabled={newRowsBusy} onClick={cancelProductDrafts}>Cancel new rows</button></div>}</div>}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 al-modal-backdrop">
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
              <button type="button" disabled={exportBusy} onClick={() => void runReportExport()} className="rounded-full bg-[#0b2343] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17385f] disabled:opacity-50">{exportBusy ? "Preparingâ€¦" : "Export"}</button>
            </div>
          </section>
        </div>
      )}

      {wholeTripIds&&accessToken&&<WholeTripDeletionDialog token={accessToken} tripIds={wholeTripIds} onClose={()=>setWholeTripIds(null)} onDeleted={(ids)=>{ids.forEach(id=>deletedTripIds.current.add(id));const retain=(current:ReportRow[])=>current.filter(row=>!deletedTripIds.current.has(String(row.trip_id)));setRows(retain);setSelectionRecords(retain);const removedKeys=selectionRows.filter(row=>deletedTripIds.current.has(String(row.trip_id))).flatMap(row=>{const key=getReportRowKey(reportKey,row);return key?[key]:[];});reportSelection.setVisible(removedKeys,false);if(!retain(displayedRows).length&&page>1)setPage(page-1);setRetryVersion(v=>v+1);}}/>}
      {transactionView && accessToken && <TransactionCleanupNotice key={accessToken} token={accessToken} version={retryVersion} />}
      {editModalOpen && editModalRecord && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 al-modal-backdrop" onMouseDown={(event) => {
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
        searchScope={topbarSearchScope}
        hideSectionTab
        cardsOnly={showVisualCards}
        accessToken={accessToken}
        role={profile?.role ?? ""}>
      <section
        className={showVisualCards ? "" : `${SPREADSHEET_PANEL_CLASS} flex min-h-0 flex-col`}
      >

        <>
          {!showVisualCards && !transactionView && <SpreadsheetLoadedStatus autoFit={autoFit.enabled} sheet={reportKey} loaded={displayedRows.length} total={pagination?.total??displayedRows.length} loading={isLoading}/>}
          {!showVisualCards && !transactionView && <ModernReportControls state={modernTable} columns={gridColumns} showLegend={columns.length>0} onSelect={key=>{const header=headerCellRefs.current.get(key);if(header&&tableViewportRef.current)scrollToTableColumn(tableViewportRef.current,header);}} lines={reportKey==="dispatch"} table={reportKey} canEdit={["ADMIN","STAFF"].includes(profile?.role??"")} busy={Boolean(editingCell||editModalOpen||formulas.draftPending||formulas.busy||fillGesture)}/> }
          {!showVisualCards && columns.some(column => column.fieldCategory) && <div aria-label="Column responsibilities" className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-white px-3 py-1 text-[10px] text-slate-500">{Object.entries(FIELD_CATEGORIES).map(([key, item]) => <button type="button" key={key} className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => { const column = renderedGridColumns.find(column => column.fieldCategory === key); const header = column && headerCellRefs.current.get(column.key); if (header && tableViewportRef.current) scrollToTableColumn(tableViewportRef.current, header); }}><span className="h-2 w-2 rounded-sm" style={{backgroundColor:item.background,border:'1px solid '+item.color}} />{item.label}</button>)}</div>}
          {!showVisualCards && sourceHeaderGroups.length > 0 && <div aria-label="Original Excel header color groups" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-white px-3 py-1 text-[10px] text-slate-600">{sourceHeaderGroups.map(group => <button type="button" key={group.group} className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => { const column = renderedGridColumns.find(column => column.sourceHeader?.group === group.group); const header = column && headerCellRefs.current.get(column.key); if (header && tableViewportRef.current) scrollToTableColumn(tableViewportRef.current, header); }}><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-slate-300" style={{ backgroundColor: group.background }} />{group.label}</button>)}</div>}
          {headerFormatting.configuration}{!showVisualCards && <ModernCellControls onSetRowHeight={height=>{const ids=cellSelection?.mode==="row"?cellSelection.rows??[]:[...new Set([...selectedFormatCellKeys].map(key=>key.slice(0,key.lastIndexOf("\u0000"))))];const groups=Array.from(tableViewportRef.current?.querySelectorAll<HTMLElement>('tr[data-group-key]:has([data-spreadsheet-selected="true"]),tr[data-group-key][aria-selected="true"]')??[]).map(node=>node.dataset.groupKey!);rowHeights.setHeight([...ids,...groups],height);}} onSetColumnWidth={width=>{const keys=cellSelection?.mode==="column"?cellSelection.columns??[cellSelection.focusField]:[...new Set([...selectedFormatCellKeys].map(key=>key.slice(key.lastIndexOf("\u0000")+1)))];for(const key of keys){autoFit.clearWidth(key);void sharedWidths.save(key,width);}}} selectionLabel={cellSelection?.mode==="column"?`${cellSelection.columns?.length??1} column${cellSelection.columns?.length===1?"":"s"} selected`:cellSelection?.mode==="row"?`${cellSelection.rows?.length??1} rows selected`:undefined} canFormat={sharedDesign.canEdit} selectedFormat={selectedFormats[0]} selectedFontFamily={selectedFormats.length&&selectedFormats.every(format=>(format.fontFamily??"Inter")===(selectedFormats[0].fontFamily??"Inter"))?selectedFormats[0].fontFamily??"Inter":""} modern={modernTable.modern} active={Boolean(cellSelection?.mode==="column"||selectedFormatCellKeys.size||formulas.selectedIdentity||headerFormatting.key)} cellSelected={Boolean(formulas.selectedIdentity||cellSelection?.mode==="cells")} label={columns.find(column=>column.key===formulas.selectedColumn)?.title??"Selected cell"} selectedFontSize={selectedFormats[0]?.fontSize ?? 13} formulaBar={formulas.bar} advanced selectionIsItalic={selectedFormats.length>0&&selectedFormats.every(f=>f.italic)} selectionIsUnderlined={selectedFormats.length>0&&selectedFormats.every(f=>f.underline)} selectedCellCount={sharedDesign.canEdit&&columns.length?(cellSelection?.mode==="column"?cellSelection.columns?.length??1:selectedFormatCellKeys.size):0} selectionIsBold={selectionIsBold} selectedTextColor={selectedTextColor} selectedBackgroundColor={selectedBackgroundColor} onApply={applyCellFormat} {...headerFormatting.toolbarProps} />}
          <div ref={tableViewportRef} aria-busy={!showVisualCards&&(isLoading||loadingMore)} onKeyDownCapture={event=>tripTableShortcut(event,[...contextActions.actions,{label:"Select all",onClick:selectAllGridCells}],()=>{const field=formulas.selectedColumn??cellSelection?.focusField,key=cellSelection?.focusRowKey;if(!field||!key)return;const cell=event.target as HTMLElement,box=cell.getBoundingClientRect();setCellContextMenu({x:box.left,y:box.bottom,row:key,field});})} onPointerDownCapture={event=>{if(event.button===2&&(event.target as Element).closest("tbody td"))event.preventDefault();rangeDrag.onPointerDownCapture(event);}} onClickCapture={rangeDrag.onClickCapture} onPaste={(event) => void handleReportPaste(event)} onCopy={handleReportCopy} className={`${!showVisualCards ? `${REPORT_GRID_VIEWPORT_CLASS} ${SPREADSHEET_ATTACHED_VIEWPORT_CLASS}` : "relative min-h-48 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"} w-full`}>
            {activeError && <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-rose-100 px-3 py-2 text-xs text-rose-700">{activeError} Your current data and drafts are preserved.{showVisualCards && <button type="button" onClick={() => { if (accessToken) retryReportRead(reportKey, accessToken); setRetryVersion(value => value + 1); }} className="rounded-full border border-rose-200 px-2 py-1 font-medium hover:bg-rose-50">Retry loading</button>}</div>}
            {showVisualCards ? (
              isLoading ? <DispatchCardsSkeleton/> : displayedRows.length === 0 ? (
                null
              ) : (
                <DispatchVisualCards
                  rows={displayedRows}
                  columns={columns}
                  reportKey={reportKey}
                  onOpenTrip={onOpenTrip}
                  groupByDispatch={transactionView}
                  loadingMore={loadingMore}
                />
              )
            ) : isLoading && !displayedRows.length ? (
              <TripTableLoading label="Loading rows…" className="trip-table-loading-empty"/>
            ) : (
              <table {...headerFormatting.tableProps} data-compact-headers={transactionView ? "true" : undefined} style={{tableLayout:"fixed",width:Math.max(1,gutterWidth+presentationColumns.reduce((sum,column)=>sum+(columnLayout.widths?.[column.key]??(columns.length?defaultReportColumnWidth(column):180)),0)),minWidth:0}} className="spreadsheet-grid border-separate border-spacing-0 text-left">
                <TripTableColumnTracks columns={[{key:"__row_number",width:gutterWidth},...presentationColumns.map(column=>({key:column.key,width:columnLayout.widths?.[column.key]??(columns.length?defaultReportColumnWidth(column):180)}))]}/>
                <thead className={`${tableUi.thead} bg-white`}>
                  <tr style={rowHeights.headerStyle}>
                    <th
                      ref={selectionColumnRef}
                      style={{ width: gutterWidth, minWidth: gutterWidth }}
                      scope="col"
                      className="spreadsheet-gutter sticky left-0 top-0 z-[70] whitespace-nowrap border-b border-r border-slate-100/70 bg-slate-50 px-1 py-1">
                      {!( !transactionView && ["dispatch-monitoring","dispatch","store-calling"].includes(reportKey))&&<SpreadsheetRowSelectionHeader active={cellSelection?.mode==="row"&&selectedRowKeys.length>0} checked={allMatchingRowsSelected} partial={selectedRowKeys.length>0&&!allMatchingRowsSelected} disabled={isLoading||selectAllRequest.busy||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onChange={checked=>{if(checked)selectAllGridCells();else{setCellSelection(null);reportSelection.clear(reportKey);setSelectionRecords([]);}}}/>}
                    {rowHeights.headerHandle()}</th>
                    {presentationColumns.map((column) => {
                      if(!columns.length)return <TripTableHeader key={column.key} scope="col" style={{width:180,minWidth:180}} className={REPORT_GRID_HEADER_CELL_CLASS}><div aria-hidden="true" className="h-3 w-20 animate-pulse rounded-sm bg-slate-100"/></TripTableHeader>;
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
                      <TripTableHeader
                        key={column.key}
                        {...headerFormatting.props(column.key)} data-trip-column-selected={cellSelection?.mode==="column"&&(cellSelection.columns??[cellSelection.focusField]).includes(column.key)?"true":undefined} onClick={event=>{if(!(event.target as Element).closest("input,select,[role=separator]"))selectWholeColumn(column.key,event.shiftKey,event.ctrlKey||event.metaKey);}} onContextMenu={event=>{selectWholeColumn(column.key,false,false,true);setOpenColumnMenu({key:column.key,...headerFormatting.menuPosition(event)});}}
                        ref={(element) => {
                          if (element) headerCellRefs.current.set(column.key, element);
                          else headerCellRefs.current.delete(column.key);
                        }}
                        data-modern-category={modernColumnCategory(column.key,column.title).key}
                        data-field-category={column.fieldCategory}
                        data-source-header-group={sourceHeader?.group}
                        data-category-default={!columnColor && !sharedDesign.columns[column.key]?.header?.backgroundColor && !sharedDesign.columns[column.key]?.format?.backgroundColor ? "true" : undefined}
                        title={sourceHeader?.label ?? (column.fieldCategory ? FIELD_CATEGORIES[column.fieldCategory].label : undefined)}
                        scope="col"
                        draggable={false}
                        onDragOver={(event) => { if (draggedColumnKey) event.preventDefault(); }}
                        onDrop={(event) => { event.preventDefault(); if (draggedColumnKey) reorderReportColumn(draggedColumnKey, column.key); setDraggedColumnKey(null); }}
                        style={{ width: columnWidth, minWidth: columnWidth, maxWidth: columnWidth, position: "sticky", top: 0, ...(columnColor ? { "--report-column-color": columnColor } as CSSProperties : {}), ...(modernTable.modern?modernColumnHeaderStyle(column.key,column.title):categoryHeaderStyle(column.fieldCategory)), ...reportHeaderAppearance(sharedDesign.columns[column.key], columnColor), ...(modernTable.modern?modernColumnHeaderStyle(column.key,column.title,sharedDesign.columns[column.key]?.header?.backgroundColor||sharedDesign.columns[column.key]?.color||columnColor):{}), ...(!modernTable.modern&&sourceHeader ? { backgroundColor: sourceHeader.background, color: sourceHeader.color } : {}), ...(isPinned ? { ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? gutterWidth } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 60 } : { zIndex: 40 }) }}
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
                        <TripTableColumnResizeHandle title={column.title} width={columnWidth} enabled={sharedDesign.canEdit&&sharedDesign.loaded} onStart={(event) => { event.preventDefault(); event.stopPropagation(); const visibleWidths={...columnLayout.widths}; autoFit.clearWidth(column.key); setColumnLayout((current) => ({ ...current, widths: visibleWidths })); setColumnResize({ key: column.key, startX: event.clientX, startWidth: columnWidth }); }} onResize={next=>{autoFit.clearWidth(column.key);void sharedWidths.save(column.key,next);}}/>
                      </TripTableHeader>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <ModernReportRows isCellSelected={(indices,column)=>indices.length>0&&indices.every(index=>selectedFormatCellKeys.has(reportCellFormatKey(physicalGridKeys[index],column)))} onGroupSelect={(event,indices,field)=>{const keys=indices.map(index=>physicalGridKeys[index]);if(!keys.length)return;headerFormatting.clear();if(field){const members=keys.map(key=>reportCellFormatKey(key,field));setCellSelection(current=>{const cells=event.ctrlKey||event.metaKey?new Set(selectedFormatCellKeys):event.shiftKey?selectTripCells(selectionRowKeys,presentationColumns.map(column=>column.key),new Set(),{row:keys.at(-1)!,column:field},current?{row:current.anchorRowKey,column:current.anchorField}:null,true):new Set<string>();const remove=(event.ctrlKey||event.metaKey)&&members.every(key=>cells.has(key));for(const key of members)if(remove)cells.delete(key);else cells.add(key);return {mode:"cells",cells:[...cells],anchorRowKey:event.shiftKey&&current?current.anchorRowKey:keys[0],focusRowKey:keys.at(-1)!,anchorField:event.shiftKey&&current?current.anchorField:field,focusField:field};});reportSelection.clear(reportKey);}else{const selected=event.ctrlKey||event.metaKey?new Set(selectedRowKeys):new Set<string>();const remove=keys.every(key=>selected.has(key));for(const key of keys)if(remove)selected.delete(key);else selected.add(key);const rows=[...selected];reportSelection.selectOnly(reportKey,rows);setCellSelection(rows.length?{mode:"row",rows,anchorRowKey:rows[0],focusRowKey:rows.at(-1)!,anchorField:presentationColumns[0].key,focusField:presentationColumns.at(-1)!.key}:null);}}} cellAppearance={(index,column)=>reportColumnAppearance(sharedDesign.columns[column],reportCellFormatFor(cellFormats,reportCellFormatKey(physicalGridKeys[index],column)))} selectedKeys={new Set(selectedRowKeys)} onGroupContextMenu={(event,indices,field)=>{event.preventDefault();event.stopPropagation();headerFormatting.clear();const keys=indices.map(index=>physicalGridKeys[index]);if(!keys.length)return;if(!keys.every(key=>selectedFormatCellKeys.has(reportCellFormatKey(key,field)))){if((event.target as Element).closest(".spreadsheet-gutter")){reportSelection.selectOnly(reportKey,keys);setCellSelection({mode:"row",rows:keys,anchorRowKey:keys[0],focusRowKey:keys.at(-1)!,anchorField:presentationColumns[0].key,focusField:presentationColumns.at(-1)!.key});}else{reportSelection.clear(reportKey);setCellSelection({mode:"cells",cells:keys.map(key=>reportCellFormatKey(key,field)),anchorRowKey:keys[0],focusRowKey:keys.at(-1)!,anchorField:field,focusField:field});}}setCellContextMenu({x:event.clientX,y:event.clientY,row:keys[0],field,rows:keys,group:event.currentTarget.dataset.groupKey});}} busy={Boolean(editingCell||editModalOpen||formulas.draftPending||formulas.busy||fillGesture)} state={{...modernTable,modern:modernTable.modern&&!transactionView&&["dispatch-monitoring","dispatch","store-calling"].includes(reportKey)}} rows={displayedRows} columns={renderedGridColumns} report={reportKey} viewport={tableViewportRef} keys={physicalGridKeys} enabled={viewMode==="table"} keepAlive={editingCell?physicalGridKeys.indexOf(editingCell.rowKey):formulaFocusIndex} heights={rowHeights.heights} columnCount={renderedGridColumns.length} renderRow={index => {
                    const row=displayedRows[index];
                    const currentRowKey = rowKey(reportKey, row, index);
                    const selectionKey = getReportRowKey(reportKey, row);
                    return (
                      <tr
                        key={currentRowKey}
                        data-virtual-index={index} data-new-product-draft={row._new_product_draft ? "true" : undefined}
                        style={rowHeights.style(selectionKey ?? currentRowKey)}
                        data-report-selection-key={selectionKey ?? undefined}
                        className={`group report-data-row ${REPORT_GRID_ROW_CLASS} ${selectionKey&&reportSelection.isSelected(selectionKey)?"bg-blue-50/50":""}`}>
                        <td onContextMenu={event=>{event.preventDefault();event.stopPropagation();const key=selectionKey??selectionRowKeys[index];if(!cellSelection?.rows?.includes(key))selectWholeRow(key);setCellContextMenu({x:event.clientX,y:event.clientY,row:key,field:presentationColumns[0].key,rows:cellSelection?.rows?.includes(key)?cellSelection.rows:[key]});}} style={{ width: gutterWidth, minWidth: gutterWidth }} className="spreadsheet-gutter sticky left-0 z-30 whitespace-nowrap border-r border-slate-100/70 bg-slate-50 px-1 py-1 shadow-[3px_0_5px_-5px_rgba(11,35,65,0.65)]">
                          <button type="button" aria-label={`Select spreadsheet row ${sheetRowOffset+index+1}`} title="Select row" onClick={event=>selectWholeRow(selectionKey??selectionRowKeys[index],event.ctrlKey||event.metaKey,event.shiftKey)} className="w-full text-center focus-visible:outline-2 focus-visible:outline-blue-500"><SpreadsheetRowNumber value={sheetRowOffset + index + 1} /></button>
                          {selectionKey && rowHeights.handle(selectionKey)}
                        </td>
                        {renderedGridColumns.map((column, visibleColumnIndex) => {
                          const columnWidth = columnLayout.widths?.[column.key] ?? defaultReportColumnWidth(column);
                          if(!mountedColumns.has(column.key))return <TripSheetCell key={column.key} {...formulas.cellProps(row,column.key)} {...rangeDrag.cell(selectionKey??selectionRowKeys[index],column.key)} data-report-column-key={column.key} data-column-placeholder="true" style={{width:columnWidth,minWidth:columnWidth,maxWidth:columnWidth,...reportColumnAppearance(sharedDesign.columns[column.key],reportCellFormatFor(cellFormats,reportCellFormatKey(selectionKey??selectionRowKeys[index],column.key)),columnLayout.colors?.[column.key])}} className={`${REPORT_GRID_BODY_CELL_CLASS} border-r border-slate-100/70`}><span className={/remarks|comment|notes/i.test(column.key)?"whitespace-pre-wrap break-words":"block truncate"}>{displayValue(row[column.key],column.type,column.key)}</span></TripSheetCell>;
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
                          const isEditable = modernTable.canEdit && Boolean(editableTarget);
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
                            <TripSheetCell
                              key={column.key}
                              {...formulas.cellProps(row,column.key)}
                              {...rangeDrag.cell(formatRowKey,column.key)}
                              data-report-column-key={column.key}
                              data-search-match={searchNeedle && (matchesSpreadsheetSearch(row[column.key],searchNeedle) || matchesSpreadsheetSearch(displayValue(row[column.key], column.type, column.key),searchNeedle)) ? "true" : undefined}
                              data-trip-editable={isEditable}
                              data-spreadsheet-selected={isFormatSelected ? "true" : undefined}
                              onContextMenu={event=>openCellContextMenu(event,formatRowKey,column.key)}
                              data-cell-hover-disabled={isPinned || isEditing || isFormatSelected || fillRange ? "true" : undefined}
                              style={{
                                width: columnWidth,
                                minWidth: columnWidth,
                                maxWidth: columnWidth,
                                ...(remoteEditors.length?{boxShadow:`inset 0 0 0 2px ${remoteEditors[0].color}`} : {}),
                                ...(isPinned ? { position: "sticky" as const, ...(pinSide === "left" ? { left: leftPinOffsets[column.key] ?? gutterWidth } : { right: rightPinOffsets[column.key] ?? 0 }), zIndex: 20 } : {}),
                                ...(columnColor ? { "--report-column-color": columnColor } as CSSProperties : {}),
                                ...reportColumnAppearance(sharedDesign.columns[column.key], cellFormat, columnColor),
                              }}
                              onDoubleClick={()=>beginEditCell(row,index,column.key)}
                              onPointerEnter={() => extendFillGesture(row, column)}
                              onClick={(event) => {
                                if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
                                selectFormatCell(row, column.key, event.shiftKey,event.ctrlKey||event.metaKey);

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
                              {["incident_report","incident_boxes","incident_details"].includes(column.key)? <TripIssueCell token={accessToken??""} tripId={String(row.trip_id??row._trip_id??"")} stopId={typeof (row.trip_stop_id??row._trip_stop_id)==="string"?String(row.trip_stop_id??row._trip_stop_id):null} status={row.trip_status??row.status} display={column.key==="incident_boxes"?"boxes":column.key==="incident_details"?"details":"types"} legacy={row}/> : column.key==="trip_issues"? <TripIssueCell token={accessToken??""} tripId={String(row.trip_id??row._trip_id??"")} stopId={typeof (row.trip_stop_id??row._trip_stop_id)==="string"?String(row.trip_stop_id??row._trip_stop_id):null} status={row.trip_status??row.status}/> : column.key==="trip_details"?(()=>{
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
                                  <TripTableTextEditor
                                    onNavigate={backward=>{const id=physicalRowIdentity(row);if(id)formulas.navigateCell(id,column.key,"Tab",backward);}}
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

                            </TripSheetCell>
                          );
                        })}

                      </tr>
                    );
                  }}/>
                  <SpreadsheetBlankRows count={spreadsheetPadding.count} height={spreadsheetPadding.height} start={sheetRowOffset+displayedRows.length+1} gutterWidth={gutterWidth}
                    rowSelection={cellSelection?.mode==="row" ? new Set(cellSelection.rows?.map(key=>Number(key.split(":").at(-1)))??[]) : undefined}
                    onRowSelect={(number,event)=>selectWholeRow(`virtual:${transactionView?"trips":reportKey}:slot:${number}`,cellSelection?.mode==="row"||event.ctrlKey||event.metaKey,event.shiftKey)}
                    cellProps={(number,column)=>{const id=`virtual:${transactionView?"trips":reportKey}:slot:${number}`,key=reportCellFormatKey(id,column);return {...formulas.virtualCellProps(id,column),...rangeDrag.cell(id,column),onContextMenu:event=>openCellContextMenu(event,id,column),"data-spreadsheet-selected":selectedFormatCellKeys.has(key)?"true":undefined,className:selectedFormatCellKeys.has(key)?"relative outline outline-2 outline-inset outline-blue-500":"relative",style:reportColumnAppearance(sharedDesign.columns[column],cellFormats[key],columnLayout.colors?.[column])};}}
                    columns={presentationColumns.map(column=>({key:column.key,width:columnLayout.widths?.[column.key]??(columns.length?defaultReportColumnWidth(column):180),style:{...reportColumnAppearance(sharedDesign.columns[column.key],undefined,columnLayout.colors?.[column.key]),...(pinnedColumnSides[column.key]?{position:"sticky",backgroundColor:reportColumnAppearance(sharedDesign.columns[column.key],undefined,columnLayout.colors?.[column.key]).backgroundColor??"white",left:pinnedColumnSides[column.key]==="left"?leftPinOffsets[column.key]:undefined,right:pinnedColumnSides[column.key]==="right"?rightPinOffsets[column.key]:undefined,zIndex:20}:{})}}))}/>

                </tbody>
              </table>
            )}
            {!showVisualCards&&(loadingMore||isLoading&&displayedRows.length>0)&&<TripTableLoading label={loadingMore?"Loading more rows…":"Updating rows…"} className="trip-table-loading-more"/>}
          </div>
          {showVisualCards&&infiniteRows&&hasMoreRows&&!moreRowsError&&<div ref={visualLoadMoreRef} aria-hidden="true" className="h-px"/>}
          {!infiniteRows&&(pageCount>1||page>1)&&<div aria-label="Table pagination" className="flex items-center justify-end gap-2 border-t border-slate-200 px-3 py-1 text-[11px] text-slate-500"><button type="button" disabled={isLoading||page<=1||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onClick={()=>setPage(current=>Math.max(1,current-1))} className="rounded-sm border px-2 py-1 disabled:opacity-40">Previous</button><label>Page <input key={page} aria-label="Go to page" inputMode="numeric" defaultValue={page} disabled={isLoading||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} onBlur={event=>{const next=Number(event.target.value);if(Number.isInteger(next)&&next>=1&&next<=pageCount)setPage(next);else event.target.value=String(page);}} className="w-12 rounded-sm border border-slate-200 px-1 text-center"/></label><span>of {pageCount}</span><button type="button" disabled={isLoading||page>=pageCount||Boolean(editingCell||editModalOpen||fillGesture||formulas.draftPending)} onClick={()=>setPage(current=>Math.min(pageCount,current+1))} className="rounded-sm border px-2 py-1 disabled:opacity-40">Next</button></div>}
          {infiniteRows&&moreRowsError&&<div role="alert" className="flex shrink-0 items-center justify-center gap-2 border-t border-amber-100 bg-white py-1 text-xs text-amber-800"><span>{moreRowsError}</span><button type="button" disabled={loadingMore} onClick={()=>{setMoreRowsError('');void loadMoreRowsRef.current();}} className="rounded px-2 py-1 text-blue-700">Retry loading</button></div>}
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
      {cellContextMenu&&<TripTableCellMenu actions={<TripTableActions items={reportContextItems()} onClose={()=>setCellContextMenu(null)}/>} x={cellContextMenu.x} y={cellContextMenu.y} count={selectedFormatCellKeys.size} canFormat={sharedDesign.canEdit&&columns.length>0}
        format={{...selectedFormats[0],bold:selectionIsBold,italic:selectedFormats.length>0&&selectedFormats.every(format=>format.italic),color:selectedTextColor,backgroundColor:selectedBackgroundColor}}
        onApply={applyCellFormat} onSelectRow={()=>{if(!cellContextMenu.rows)selectWholeRow(cellContextMenu.row);}} onSelectColumn={()=>selectWholeColumn(cellContextMenu.field)} onClose={()=>setCellContextMenu(null)}/>}
      {openColumnMenu && (() => {
        const menuColumn = columns.find((column) => column.key === openColumnMenu.key);
        if (!menuColumn) return null;
        const dropdownField = getReportEditDefinition(reportKey, menuColumn.key)?.dropdownField;
        return <TripTableColumnMenu
          title={menuColumn.title}
          position={openColumnMenu}
          onClose={() => setOpenColumnMenu(null)} onRename={allTripRecords && menuColumn.sourceHeader ? undefined : () => headerFormatting.startRename(openColumnMenu.key, menuColumn.title)} onRestoreTitle={allTripRecords && menuColumn.sourceHeader ? undefined : () => headerFormatting.restoreTitle(openColumnMenu.key)} onConfigureInput={() => dropdownField ? openDropdownManager(dropdownField) : headerFormatting.configure(openColumnMenu.key, columns.find(column=>column.key===openColumnMenu.key)?.title??openColumnMenu.key)}
          sortActions={sortableFields.includes(menuColumn.key) ? [
            { label: "Sort ascending", active: activeSortBy === menuColumn.key && sortOrder === "asc", onClick: () => { setSortBy(menuColumn.key); setSortOrder("asc"); setPage(1); } },
            { label: "Sort descending", active: activeSortBy === menuColumn.key && sortOrder === "desc", onClick: () => { setSortBy(menuColumn.key); setSortOrder("desc"); setPage(1); } },
          ] : undefined}
          viewportBounded
          selection={{count:cellSelection?.mode==="column"?cellSelection.columns?.length??1:selectedFormatCellKeys.size,format:{...selectedFormats[0],bold:selectionIsBold,color:selectedTextColor,backgroundColor:selectedBackgroundColor},canFormat:sharedDesign.canEdit,onApply:applyCellFormat}}
          extraActions={[
            {label:"Select column",onClick:()=>selectWholeColumn(menuColumn.key)},
            {label:"Pin left",disabled:!sharedDesign.canEdit,onClick:()=>setColumnPinSide(menuColumn.key,"left")},
            {label:"Pin right",disabled:!sharedDesign.canEdit,onClick:()=>setColumnPinSide(menuColumn.key,"right")},
            {label:"Resize column…",disabled:!sharedDesign.canEdit,onClick:()=>{const raw=window.prompt("Column width in pixels (72–600)",String(getColumnWidth(menuColumn.key)));if(raw===null)return;const width=Number(raw);if(Number.isFinite(width)&&width>=72&&width<=600){for(const key of cellSelection?.mode==="column"?cellSelection.columns??[menuColumn.key]:[menuColumn.key]){autoFit.clearWidth(key);void sharedWidths.save(key,Math.round(width));}}}},
            ...(["left","center","right"] as const).map(alignment=>({label:`Align ${alignment}`,disabled:!sharedDesign.canEdit,onClick:()=>applyCellFormat({alignment})})),
            {label:"Reset column width",disabled:!sharedDesign.canEdit,onClick:()=>{autoFit.clearWidth(menuColumn.key);void sharedWidths.save(menuColumn.key,defaultReportColumnWidth(menuColumn));}},
            {label:"Reset column order",disabled:!sharedDesign.canEdit,onClick:()=>saveColumnLayout({...columnLayout,order:columns.map(column=>column.key)})},
            {label:`Show all hidden columns (${hiddenColumnKeys.size})`,disabled:!hiddenColumnKeys.size,onClick:()=>saveColumnLayout({...columnLayout,order:layoutColumnKeys,hidden:[]})},
            {label:"Format selection…",disabled:!sharedDesign.canEdit,onClick:()=>selectWholeColumn(menuColumn.key)},
          ]}
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
