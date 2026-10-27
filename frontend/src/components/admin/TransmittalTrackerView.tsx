import {useSpreadsheetInfiniteScroll} from "./useSpreadsheetInfiniteScroll";
import {appendSpreadsheetRows} from "../../services/spreadsheet-pages";
import type {TrackerSelectionRow} from "../../services/transmittal-tracker.service";
import SpreadsheetRowSelectionHeader from "./SpreadsheetRowSelectionHeader";
import {useSpreadsheetDragSelection} from "./useSpreadsheetDragSelection";
import {useSpreadsheetSelectAll} from "./useSpreadsheetSelectAll";
import {useRegisterTopbarFilter} from "./topbarFilters";
import {matchesSpreadsheetSearch} from "../../services/spreadsheet-display";
import { useSheetAutoFit } from "./useSheetAutoFit";
import { scrollToTableColumn } from "./scrollToTableColumn";
import {reportCellFormatFor} from "./ReportSpreadsheetUtils";
import TrackerResetDialog from "./TrackerResetDialog";
import { configurableTextColumn } from "./SpreadsheetColumnConfiguration";
import { configuredCellValue } from "../../services/configured-cell-input";
import { confirmedColumnDesign } from "../../services/shared-table-design";
import { dropdownStoredValue } from "../../services/dropdown-option.service";
import { SpreadsheetCellContextMenu } from "./SpreadsheetCellContextMenu";
import VirtualSpreadsheetRows from "./VirtualSpreadsheetRows";
import { useOperationalFormulas } from "./useOperationalFormulas";
import { REPORT_TOOLBAR_ROW_CLASS } from "./ReportSpreadsheetUtils";
import { useSpreadsheetHeaderFormatting } from "./useSpreadsheetHeaderFormatting";
import { reportHeaderAppearance } from "./ReportSpreadsheetUtils";
import { reportColumnAppearance } from "./ReportSpreadsheetUtils";
import { useSpreadsheetRowHeights } from "./useSpreadsheetRowHeights";
import { SPREADSHEET_NUMBER_GUTTER_WIDTH as SPREADSHEET_GUTTER_WIDTH, SPREADSHEET_PANEL_CLASS, SPREADSHEET_ATTACHED_VIEWPORT_CLASS, SpreadsheetFooter, SpreadsheetBlankRows, SpreadsheetRowNumber, useSpreadsheetViewport, useSpreadsheetFeedback } from "./SpreadsheetPresentation";
import { CollaborativeCell } from "./CollaborativeCell";
import EditStepNavigation from "./EditStepNavigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, CSSProperties, KeyboardEvent as ReactKeyboardEvent, ClipboardEvent as ReactClipboardEvent, MouseEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, GripVertical, LoaderCircle, Printer, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import companyLogo from "../../assets/logo.png";
import { ApiError } from "../../services/api.service";
import { addDropdownOption, editDropdownOption, fetchDropdownOptions, type DropdownOption } from "../../services/dropdown-option.service";
import { subscribeToAdminRealtime, TRANSMITTAL_TRACKER_REALTIME_TABLES } from "../../services/realtime.service";
import { useDeferredRealtimeRefresh } from "./useDeferredRealtimeRefresh";
import { trackerRowKey, fetchTrackerSelection, fetchTransmittalTracker, getCachedTransmittalTracker, initializeTransmittalTracker, invalidateTransmittalTrackerCache, saveTransmittalTrackerCell, fetchTrackerExportRows, fetchTrackerPage, TRACKER_PAGINATION_ENABLED, type TrackerPageOptions, type TransmittalTrackerResponse, type TransmittalTrackerRow } from "../../services/transmittal-tracker.service";
import { projectTrackerExportRows, projectTransmittalSheetRows, reconcileTrackerRows } from "../../services/transmittal-tracker-export.logic";
import ReportDropdownEditor, { type ReportDropdownChoice } from "./ReportDropdownEditor";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import {
  ReportTextCellEditor,
  ReportRowActionButton,
  ReportCellFormattingToolbar,
  ReportColumnActionsMenu,
  ReportColumnColorDialog,
  ReportDropdownOptionsDialog,
} from "./ReportSpreadsheetShared";
import { REPORT_GRID_BODY_CELL_CLASS, REPORT_GRID_HEADER_CELL_CLASS, REPORT_GRID_ROW_CLASS, REPORT_GRID_VIEWPORT_CLASS, chooseAutomaticPinSide, expandSpreadsheetRange, parseSpreadsheetClipboard, readReportCellFormats, reportCellFormatKey, reorderColumnKeys, writeReportCellFormats, type ReportCellFormat } from "./ReportSpreadsheetUtils";
import { tableUi } from "./dashboardStyles";
import { useSharedTableWidths } from "./useSharedTableWidths";
import {useSharedTableDesign} from "./useSharedTableDesign";
import {designLayout,designChanges} from "../../services/shared-table-design";
import ColumnFinder from "./ColumnFinder";
import {TopbarSearchRegistration} from "./topbarSearch";
import {useRegisterTopbarAction} from "./topbarActions";
import {SpreadsheetHiddenColumns} from "./SpreadsheetWorkspace";

const trackerFormulaIdentity=(row:Record<string,unknown>)=>typeof row.trip_stop_id==="string"?`stop:${row.trip_stop_id}${row.assignment_id?`:assignment:${row.assignment_id}`:""}`:null;
const LEGACY_TRACKER_PAGE_OPTIONS = {};

type EditableField = "assigned_plate_number" | "driver_name" | "warehouse_code_override" | "delivered_to_override" | "plate_number_override" | "delivery_receipt_no_override" | "sales_order_no_override" | "transmittal_ref" | "date_created_override" | "tracker_status" | "lbc_waybill_no" | "lbc_shipping_date" | "tracker_remarks" | "loading_date_override" | "delivery_date_override";
type TrackerColumn = { key: keyof TransmittalTrackerRow; title: string; field: EditableField; editor: "text" | "date" | "dropdown" | "relationship" | "readonly"; relationshipKind?: "warehouses" | "stores" | "trucks"; relationshipValueField?: string; minWidth: number };
type TrackerColumnLayout = { order: string[]; hidden: string[]; colors: Record<string, string>; widths: Record<string, number>; pins: Record<string, "left" | "right"> };
type DraftValue = { value: string; expectedVersion: number };
type DraftMap = Record<string, DraftValue>;
type FillGesture = { sourceStopId: string; sourceField: EditableField; sourceValue: string; targetStopId: string; targetField: EditableField; baseline: Map<string, string> };
type Preparation = { date: string; preparedBy: string; checkedBy: string };
const TRACKER_COLUMNS: TrackerColumn[] = [
  {key:"assigned_plate_number",title:"Assigned Plate",field:"assigned_plate_number",editor:"readonly",minWidth:150},
  {key:"driver_name",title:"Assigned Driver",field:"driver_name",editor:"readonly",minWidth:170},
  { key: "warehouse_code", title: "WH CODE", field: "warehouse_code_override", editor: "relationship", relationshipKind: "warehouses", relationshipValueField: "warehouse_code", minWidth: 150 },
  { key: "delivered_to", title: "Delivered to", field: "delivered_to_override", editor: "relationship", relationshipKind: "stores", relationshipValueField: "store_name", minWidth: 190 },
  { key: "plate_number", title: "Reported Plate #", field: "plate_number_override", editor: "relationship", relationshipKind: "trucks", relationshipValueField: "plate_number", minWidth: 150 },
  { key: "delivery_receipt_no", title: "Delivery Receipt No.", field: "delivery_receipt_no_override", editor: "text", minWidth: 176 },
  { key: "sales_order_no", title: "S.O. No.", field: "sales_order_no_override", editor: "text", minWidth: 132 },
  { key: "transmittal_ref", title: "Transmittal Ref#", field: "transmittal_ref", editor: "text", minWidth: 160 },
  { key: "date_created", title: "Date created", field: "date_created_override", editor: "date", minWidth: 140 },
  { key: "status", title: "Status", field: "tracker_status", editor: "dropdown", minWidth: 148 },
  { key: "lbc_waybill_no", title: "LBC Waybill no.", field: "lbc_waybill_no", editor: "text", minWidth: 160 },
  { key: "shipping_date_via_lbc", title: "Shipping date via LBC", field: "lbc_shipping_date", editor: "date", minWidth: 172 },
  { key: "remarks", title: "Remarks", field: "tracker_remarks", editor: "text", minWidth: 240 },
];
const SHEET_CONFLICT_LABELS: Partial<Record<EditableField, string>> = {
  warehouse_code_override: "WH CODE", delivered_to_override: "Delivered to", plate_number_override: "Plate #",
  delivery_receipt_no_override: "Delivery Receipt No.", sales_order_no_override: "S.O. No.", transmittal_ref: "Transmittal Ref#",
  date_created_override: "Date created", loading_date_override: "Loading Date", delivery_date_override: "Date Delivered",
};
const SHEET_FIELDS = new Set<EditableField>(Object.keys(SHEET_CONFLICT_LABELS) as EditableField[]);

function sheetConflictMessage(rows: TransmittalTrackerRow[]) {
  const conflictingFields = new Set(rows.flatMap((row) => row.legacy_conflicts.filter((field): field is EditableField => SHEET_FIELDS.has(field as EditableField))));
  return conflictingFields.size
    ? `Resolve ambiguous legacy values for ${[...conflictingFields].map((field) => SHEET_CONFLICT_LABELS[field] ?? field).join(", ")} in the selected reference before preparing the sheet.`
    : "";
}

function readColumnLayout(key: string): TrackerColumnLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<TrackerColumnLayout> | null;
    const validMap = <T,>(value: unknown, validate: (item: unknown) => item is T) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, item]) => validate(item))) as Record<string, T> : {};
    return {
      order: Array.isArray(parsed?.order) ? parsed.order.filter((item): item is string => typeof item === "string") : [],
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter((item): item is string => typeof item === "string") : [],
      colors: validMap(parsed?.colors, (item): item is string => typeof item === "string" && /^#[0-9a-f]{6}$/i.test(item)),
      widths: validMap(parsed?.widths, (item): item is number => typeof item === "number" && Number.isFinite(item) && item >= 60 && item <= 800),
      pins: validMap(parsed?.pins, (item): item is "left" | "right" => item === "left" || item === "right"),
    };
  } catch { return { order: [], hidden: [], colors: {}, widths: {}, pins: {} }; }
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatSheetDate(value: string) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : value;
}

function safeFilenamePart(value: string, fallback: string) {
  const safe = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim().slice(0, 100);
  return safe || fallback;
}

function setExcelIdentifier(cell: { value: unknown; numFmt?: string }, value: unknown) {
  const identifier = value === null || value === undefined ? "" : String(value);
  if (/^\d{1,15}$/.test(identifier)) {
    cell.value = Number(identifier);
    cell.numFmt = "0".repeat(identifier.length);
    return;
  }
  cell.value = identifier;
  cell.numFmt = "@";
}

function draftKey(stopId: string, field: string) {
  return `${stopId}:${field}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function filterTrackerRows(rows: TransmittalTrackerRow[], query: string, columnFilter: { key: keyof TransmittalTrackerRow; value: string } | null, sort: { key: keyof TransmittalTrackerRow; direction: "asc" | "desc" } | null) {
  const needle = query.trim().toLocaleLowerCase();
  let filtered = rows.filter((row) => !needle || [row.warehouse_code, row.delivered_to, row.plate_number, row.delivery_receipt_no, row.sales_order_no, row.transmittal_ref, row.date_created, row.status, row.lbc_waybill_no, row.shipping_date_via_lbc, row.remarks]
    .some((value) => matchesSpreadsheetSearch(value,needle)));
  if (columnFilter?.value.trim()) {
    const filterColumn = TRACKER_COLUMNS.find((column) => column.key === columnFilter.key);
    const filter = columnFilter.value.trim().toLocaleLowerCase();
    if (filterColumn) filtered = filtered.filter((row) => matchesSpreadsheetSearch(row[filterColumn.key],filter));
  }
  if (sort) filtered = [...filtered].sort((left, right) => String(left[sort.key] ?? "").localeCompare(String(right[sort.key] ?? ""), undefined, { numeric: true, sensitivity: "base" }) * (sort.direction === "asc" ? 1 : -1));
  return filtered;
}

function displayDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}


function defaultTrackerColumnWidth(column: TrackerColumn) {
  return Math.max(column.minWidth, Math.min(360, column.title.length * 7 + 72));
}

async function loadExcelJs() {
  try {
    const { default: ExcelJS } = await import("exceljs");
    return ExcelJS;
  } catch {
    throw new Error("The spreadsheet export could not load. Reload the page and try again.");
  }
}

export default function TransmittalTrackerView({toolbarLeading,onDataReady}:{toolbarLeading?:ReactNode;onDataReady?:(sheet:string)=>void}={}) {
  const { accessToken, profile, user } = useAuth();
  const isAdmin = profile?.role === "ADMIN";
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: keyof TransmittalTrackerRow; direction: "asc" | "desc" } | null>(null);
  const [quickStatus,setQuickStatus]=useState("");
  const [columnFilter, setColumnFilter] = useState<{ key: keyof TransmittalTrackerRow; value: string } | null>(null);
  const criteriaKey = JSON.stringify([query,sort,columnFilter,quickStatus]);
  const [navigation,setNavigation]=useState({criteriaKey,page:1,limit:50});
  if (TRACKER_PAGINATION_ENABLED && navigation.criteriaKey!==criteriaKey) setNavigation({...navigation,criteriaKey,page:1});
  const page = navigation.criteriaKey===criteriaKey ? navigation.page : 1;
  const pageOptions = useMemo<TrackerPageOptions>(()=>TRACKER_PAGINATION_ENABLED ? ({page,limit:navigation.limit,search:query,sortBy:sort?.key,sortOrder:sort?.direction,filterBy:columnFilter?.key,filter:columnFilter?.value,status:quickStatus}) : LEGACY_TRACKER_PAGE_OPTIONS,[page,navigation.limit,query,sort,columnFilter,quickStatus]);
  const cached = accessToken ? getCachedTransmittalTracker(accessToken,pageOptions) : null;
  const windowKey=JSON.stringify([accessToken,pageOptions]);
  const loadedWindow=useRef({key:"",page:0});
  const moreFlight=useRef(false);
  const [loadingMore,setLoadingMore]=useState(false);
  const deletedTripIds = useRef(new Set<string>());
  useEffect(()=>{deletedTripIds.current.clear();},[accessToken]);
  const [dataState, setDataState] = useState<{ token: string | null; value: TransmittalTrackerResponse | null }>(() => ({ token: accessToken, value: cached }));
  const data = dataState.token === accessToken ? dataState.value : cached;
  const setData = useCallback((update: TransmittalTrackerResponse | null | ((current: TransmittalTrackerResponse | null) => TransmittalTrackerResponse | null)) => setDataState((current) => ({ token: accessToken, value: typeof update === "function" ? update(current.token === accessToken ? current.value : null) : update })), [accessToken]);
  const columnLayoutKey = `alzhen:report-column-layout:${profile?.id ?? "user"}:transmittal-tracker`;
  const sharedWidths = useSharedTableWidths("transmittal-tracker", accessToken, ["ADMIN", "STAFF"].includes(profile?.role ?? ""));
  const saveSharedColumnWidth = sharedWidths.save;
  const [columnLayoutState, setColumnLayoutState] = useState(() => ({ key: columnLayoutKey, value: typeof window === "undefined" ? { order: [], hidden: [], colors: {}, widths: {}, pins: {} } : readColumnLayout(columnLayoutKey) }));
  const localColumnLayout = useMemo(() => columnLayoutState.key === columnLayoutKey ? columnLayoutState.value : readColumnLayout(columnLayoutKey), [columnLayoutState, columnLayoutKey]);
  const [menuColumn, setMenuColumn] = useState<TrackerColumn | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
  const [editingColumnColor, setEditingColumnColor] = useState<string | null>(null);
  const [manageOptionsOpen, setManageOptionsOpen] = useState(false);
  const [editingCellKey, setEditingCellKey] = useState("");
  const [selectedRowState, setSelectedRowState] = useState<{ datasetKey: string; ids: Set<string> }>(() => ({ datasetKey: "", ids: new Set() }));
  const [rowEdit, setRowEdit] = useState<{ stopId: string; profileId: string | null; values: Partial<Record<EditableField, string>> } | null>(null);
  const [resetRows,setResetRows]=useState<TrackerSelectionRow[]|null>(null);
  const [rowEditError, setRowEditError] = useState("");
  const [rowEditBusy, setRowEditBusy] = useState(false);
  const [rowEditStep, setRowEditStep] = useState(0);
  const rowEditBaseline = useRef("");
  const rowEditSaving = useRef(false);
  const editingCellKeyRef = useRef("");
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; field: EditableField } | null>(null);
  const [cellSelection, setCellSelection] = useState<{ anchorRowId: string; anchorField: EditableField; focusRowId: string; focusField: EditableField } | null>(null);
  const [selectionRecords,setSelectionRecords]=useState<TrackerSelectionRow[]>([]),[selectionError,setSelectionError]=useState("");
  useSpreadsheetFeedback(selectionError,"error");
  const [formatSelection,setFormatSelection]=useState<{mode:"row"|"column";keys:string[]}|null>(null);
  const [cellMenu,setCellMenu]=useState<{x:number;y:number;row:string;column:string}|null>(null);
  const [fillGesture, setFillGesture] = useState<FillGesture | null>(null);
  const fillGestureRef = useRef<FillGesture | null>(null);
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [dropdownOptionsError, setDropdownOptionsError] = useState("");
  const [dropdownOptionsLoading, setDropdownOptionsLoading] = useState(true);
  const [dropdownRefresh, setDropdownRefresh] = useState(0);
  const dropdownRefreshPending = useRef(false);
  const [reorderSource, setReorderSource] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const sharedDesign=useSharedTableDesign("transmittal-tracker",accessToken,["ADMIN","STAFF"].includes(profile?.role??""),Boolean(editingCellKey||rowEdit||resizeState||reorderSource));
  const rowHeights = useSpreadsheetRowHeights("transmittal-tracker", sharedDesign);
  const headerFormatting = useSpreadsheetHeaderFormatting("transmittal-tracker", sharedDesign.canEdit, sharedDesign.columns, (key, header) => { void sharedDesign.save(key, { header }, designColumnWidth(key)); }, (key, alias) => { void sharedDesign.save(key, { alias }, designColumnWidth(key)); }, (key, input) => { void sharedDesign.save(key, { input }, designColumnWidth(key)); });
  const {columns:sharedColumns,loaded:designLoaded,save:saveSharedColumnDesign}=sharedDesign;
  const viewportRef = useRef<HTMLDivElement>(null);
  const autoFit = useSheetAutoFit(viewportRef, TRACKER_COLUMNS, data?.rows ?? []);
  const columnLayout = useMemo(() => ({ ...designLayout(localColumnLayout,TRACKER_COLUMNS.map(c=>c.key),sharedColumns,designLoaded), widths: resizeState ? localColumnLayout.widths : { ...(sharedWidths.loaded ? {} : localColumnLayout.widths), ...sharedWidths.widths, ...autoFit.widths } }), [localColumnLayout, resizeState, sharedWidths.widths, sharedWidths.loaded,sharedColumns,designLoaded,autoFit.widths]);

  function designColumnWidth(key:string){const column=TRACKER_COLUMNS.find(c=>c.key===key);return columnLayout.widths[key]??(column?defaultTrackerColumnWidth(column):180);}
  const setColumnLayout=(update:TrackerColumnLayout|((current:TrackerColumnLayout)=>TrackerColumnLayout))=>{if(!sharedDesign.canEdit)return;const before={...columnLayout,order:[...columnLayout.order],hidden:[...columnLayout.hidden],colors:{...columnLayout.colors},pins:{...columnLayout.pins},widths:{...columnLayout.widths}};const copy={...before,order:[...before.order],hidden:[...before.hidden],colors:{...before.colors},pins:{...before.pins},widths:{...before.widths}};const next=typeof update==="function"?update(copy):update;setColumnLayoutState({key:columnLayoutKey,value:next});if(before.order.join("\u0000")!==next.order.join("\u0000"))void sharedDesign.saveOrder(next.order,designColumnWidth);for(const [key,patch] of Object.entries(designChanges(before,next))){delete patch.position;if(Object.keys(patch).length)void saveSharedColumnDesign(key,patch,designColumnWidth(key));}};
  const headerRefs = useRef(new Map<string, HTMLTableCellElement>());
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const [drafts, setDrafts] = useState<DraftMap>({});
  const draftsRef = useRef<DraftMap>({});
  const [busyCells, setBusyCells] = useState<Set<string>>(new Set());
  const busyRef = useRef(new Set<string>());
  const pendingSavePromises = useRef(new Map<string, Promise<boolean>>());
  const [conflictKeys, setConflictKeys] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportError, setExportError] = useState("");
  const [selectedReference, setSelectedReference] = useState("");
  const [prepareDialogOpen, setPrepareDialogOpen] = useState(false);
  const [preparingSheet, setPreparingSheet] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSnapshot,setSheetSnapshot]=useState<{token:string;reference:string;rows:TransmittalTrackerRow[]}|null>(null);
  const [referenceSearch,setReferenceSearch]=useState("");
  const [referencePage,setReferencePage]=useState(1);
  const [referenceLookup,setReferenceLookup]=useState<{token:string;query:string;values:string[];pages:number;error:string}>({token:"",query:"",values:[],pages:1,error:""});
  const [referenceLoading,setReferenceLoading]=useState(false);
  const prepKey = `alzhen:transmittal-preparation:${profile?.id ?? "user"}`;
  const cellFormatStorageKey = `alzhen:report-cell-format:${profile?.id ?? "user"}:transmittal_tracker`;
  const [localCellFormats, setCellFormats] = useState<Record<string, ReportCellFormat>>(() => typeof window === "undefined" ? {} : readReportCellFormats(cellFormatStorageKey));
  const cellFormats=useMemo(()=>designLoaded?Object.fromEntries(Object.entries(sharedColumns).flatMap(([column,design])=>Object.entries(design.cells??{}).flatMap(([row,format])=>format?[[reportCellFormatKey(row,column),format]]:[]))):localCellFormats,[localCellFormats,designLoaded,sharedColumns]);
  const [preparation, setPreparation] = useState<Preparation>(() => {
    if (typeof window === "undefined") return { date: localDate(), preparedBy: "", checkedBy: "" };
    try {
      const parsed = JSON.parse(window.localStorage.getItem(prepKey) ?? "null") as Partial<Preparation> | null;
      return { date: parsed?.date || localDate(), preparedBy: parsed?.preparedBy ?? "", checkedBy: parsed?.checkedBy ?? "" };
    } catch {
      return { date: localDate(), preparedBy: "", checkedBy: "" };
    }
  });

  useEffect(() => {
    if (columnLayoutState.key !== columnLayoutKey || resizeState) return;
    try { window.localStorage.setItem(columnLayoutKey, JSON.stringify(columnLayoutState.value)); } catch { /* Keep the grid usable when browser storage is unavailable. */ }
  }, [columnLayoutKey, columnLayoutState, resizeState]);
  useEffect(() => {
    if (!resizeState) return;
    let latestWidth = resizeState.startWidth;
    const move = (event: PointerEvent) => { latestWidth = Math.max(60, Math.min(800, resizeState.startWidth + event.clientX - resizeState.startX)); setColumnLayoutState((state) => {
      const current = state.key === columnLayoutKey ? state.value : readColumnLayout(columnLayoutKey);
      return { key: columnLayoutKey, value: { ...current, widths: { ...current.widths, [resizeState.key]: latestWidth } } };
    }); };
    const finish = () => { if (latestWidth !== resizeState.startWidth) void saveSharedColumnWidth(resizeState.key, latestWidth); setResizeState(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
  }, [columnLayoutKey, resizeState, saveSharedColumnWidth]);
  useEffect(() => {
    const pinsState = columnLayout.pins;
    const widthsState = columnLayout.widths;
    const adjustPins = () => {
      // A narrow local viewport must not rewrite the company-wide pin settings.
      if(designLoaded)return;
      const viewportWidth = viewportRef.current?.clientWidth ?? window.innerWidth;
      const limit = Math.max(180, viewportWidth - 120);
      let width = Object.keys(pinsState).reduce((total, key) => { const column = TRACKER_COLUMNS.find((item) => item.key === key); return total + (headerRefs.current.get(key)?.getBoundingClientRect().width ?? widthsState[key] ?? (column ? defaultTrackerColumnWidth(column) : 160)); }, 0);
      if (width <= limit) return;
      const pins = { ...pinsState };
      const unpinCandidates = [
        ...TRACKER_COLUMNS.filter((column) => pinsState[column.key] === "right"),
        ...TRACKER_COLUMNS.filter((column) => pinsState[column.key] === "left").reverse(),
      ];
      for (const column of unpinCandidates) {
        if (width <= limit) break;
        if (!pins[column.key]) continue;
        width -= headerRefs.current.get(column.key)?.getBoundingClientRect().width ?? widthsState[column.key] ?? defaultTrackerColumnWidth(column);
        delete pins[column.key];
      }
      setColumnLayoutState((state) => {
        const current = state.key === columnLayoutKey ? state.value : readColumnLayout(columnLayoutKey);
        return { key: columnLayoutKey, value: { ...current, pins } };
      });
    };
    const viewport = viewportRef.current;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(adjustPins);
    if (viewport) observer?.observe(viewport);
    window.addEventListener("resize", adjustPins);
    return () => { observer?.disconnect(); window.removeEventListener("resize", adjustPins); };
  }, [columnLayoutKey, columnLayout.pins, columnLayout.widths,designLoaded]);

  useEffect(() => {
    try { window.localStorage.setItem(prepKey, JSON.stringify(preparation)); } catch { /* Browser storage may be disabled. */ }
  }, [prepKey, preparation]);
  const hydratedCellFormats=useRef("");
  useEffect(() => {
    if(hydratedCellFormats.current===cellFormatStorageKey)return;
    hydratedCellFormats.current=cellFormatStorageKey;
    setCellFormats(readReportCellFormats(cellFormatStorageKey));
    setCellSelection(null);
  }, [cellFormatStorageKey]);

  const realtimeLoad = useRef<() => Promise<void>>(async () => {});
  const realtimeGate = useDeferredRealtimeRefresh(() => realtimeLoad.current(), () => Boolean(resetRows || editingCellKey || rowEdit || rowEditBusy || busyRef.current.size || Object.keys(draftsRef.current).length || resizeState));
  const load = useCallback(async (background = false, deferForEditing = false) => {
    if (!accessToken) return;
    const generation = ++loadGenerationRef.current;
    if (!background) setLoading(true);
    setError("");
    try {
      if (background) invalidateTransmittalTrackerCache();
      if (TRACKER_PAGINATION_ENABLED && realtimeGate.blocked()) { realtimeGate.request(); return; }
      let result: TransmittalTrackerResponse;
      try { result = await fetchTransmittalTracker(accessToken,pageOptions.search??"",pageOptions); }
      catch (cause) {
        // Initialization is a repair action for missing tracker metadata, not a
        // write/invalidation on every cached navigation.
        if (!isAdmin || initializedRef.current || !(cause instanceof ApiError) || !["TRANSMITTAL_TRACKER_NOT_INITIALIZED", "TRANSMITTAL_TRACKER_SCHEMA_INCOMPLETE"].includes(cause.code ?? "")) throw cause;
        await initializeTransmittalTracker(accessToken); initializedRef.current = true;
        result = await fetchTransmittalTracker(accessToken,pageOptions.search??"",pageOptions);
      }
      const target=TRACKER_PAGINATION_ENABLED&&loadedWindow.current.key===windowKey?loadedWindow.current.page:1;
      for(let nextPage=2;nextPage<=Math.min(target,result.pagination?.totalPages??1);nextPage++){const next=await fetchTransmittalTracker(accessToken,pageOptions.search??"",{...pageOptions,page:nextPage});result={...result,rows:appendSpreadsheetRows(result.rows,next.rows,trackerRowKey)};}
      result={...result,rows:result.rows.filter(row=>!deletedTripIds.current.has(String(row.trip_id)))};
      if(generation===loadGenerationRef.current)loadedWindow.current={key:windowKey,page:Math.max(1,Math.min(target,result.pagination?.totalPages??1))};
      if (generation === loadGenerationRef.current) {
        if ((deferForEditing || TRACKER_PAGINATION_ENABLED) && realtimeGate.blocked()) { realtimeGate.request(); return; }
        if (result.pagination && Number(pageOptions.page ?? 1) > Math.max(1, result.pagination.totalPages)) {
          const lastPage = Math.max(1, result.pagination.totalPages);
          setData(result);
          setNavigation(current => current.page === pageOptions.page ? { ...current, page: lastPage } : current);
          return;
        }
        setData((current) => {
          if (!current) return result;
          return {
            ...result,
            rows: reconcileTrackerRows(result.rows, current.rows),
          };
        });
      }
    } catch (loadError) {
      if (generation !== loadGenerationRef.current) return;
      const message = loadError instanceof Error ? loadError.message : "Unable to load the Transmittal Tracker.";
      setError(message);
    } finally {
      if (generation===loadGenerationRef.current) setLoading(false);
    }
  }, [accessToken, isAdmin, setData, realtimeGate, pageOptions,windowKey]);
  useEffect(() => { realtimeLoad.current = () => {
    if (dropdownRefreshPending.current) { dropdownRefreshPending.current = false; setDropdownRefresh((version) => version + 1); }
    return load(true, true);
  }; }, [load]);

  useEffect(()=>{if(data&&!loading&&!error)onDataReady?.("transmittal");},[data,loading,error,onDataReady]);
  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(false); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetchDropdownOptions(accessToken).then((options) => {
      if (!active) return;
      setDropdownOptions(options);
      setDropdownOptionsError("");
    }).catch((optionError) => {
      if (active) setDropdownOptionsError(optionError instanceof Error ? optionError.message : "Unable to load dropdown options.");
    }).finally(() => { if (active) setDropdownOptionsLoading(false); });
    return () => { active = false; };
  }, [accessToken, dropdownRefresh]);
  useEffect(() => {
    const unsubscribe = subscribeToAdminRealtime((event) => {
      if (event.kind === "batch") {
        if (event.tables.includes("tms_dropdown_options")) dropdownRefreshPending.current = true;
        if (event.tables.some((table) => (TRANSMITTAL_TRACKER_REALTIME_TABLES as readonly string[]).includes(table) || ["pod_records", "pod_drive_files", "flex_columns", "flex_dropdown_options", "tms_dropdown_options", "transaction_deletion_jobs"].includes(table))) realtimeGate.request();
        return;
      }
      if (event.kind === "resume" || event.kind === "recovered" || (event.kind === "change" && (TRANSMITTAL_TRACKER_REALTIME_TABLES as readonly string[]).includes(event.payload.table))) realtimeGate.request();
    });
    return unsubscribe;
  }, [load, realtimeGate]);

  useEffect(()=>{
    if(!TRACKER_PAGINATION_ENABLED||!accessToken||!prepareDialogOpen||!referenceSearch.trim())return;
    let active=true;
    const timer=window.setTimeout(()=>{
      setReferenceLoading(true);
      void fetchTrackerPage(accessToken,{page:referencePage,limit:50,filterBy:"transmittal_ref",filter:referenceSearch,sortBy:"transmittal_ref"}).then(result=>{
        if(!active)return;
        const values=result.rows.map(row=>row.transmittal_ref).filter(Boolean);
        setReferenceLookup(current=>({token:accessToken,query:referenceSearch,values:[...new Set([...(referencePage>1&&current.token===accessToken&&current.query===referenceSearch?current.values:[]),...values])],pages:result.pagination?.totalPages??1,error:""}));
      }).catch(cause=>{if(active)setReferenceLookup(current=>({...current,token:accessToken,error:cause instanceof Error?cause.message:"Unable to find references."}));}).finally(()=>{if(active)setReferenceLoading(false);});
    },200);
    return()=>{active=false;window.clearTimeout(timer);};
  },[accessToken,prepareDialogOpen,referenceSearch,referencePage]);

  const orderedColumns = useMemo(() => {
    const available = new Set<string>(TRACKER_COLUMNS.map((column) => column.key));
    const order = [...columnLayout.order.filter((key) => available.has(key)), ...TRACKER_COLUMNS.map((column) => column.key).filter((key) => !columnLayout.order.includes(key))];
    return order.flatMap((key) => TRACKER_COLUMNS.filter((column) => column.key === key));
  }, [columnLayout.order]);
  const visibleColumns = useMemo(() => orderedColumns.filter((column) => !columnLayout.hidden.includes(column.key)), [columnLayout.hidden, orderedColumns]);
  const hiddenColumns = useMemo(() => orderedColumns.filter((column) => columnLayout.hidden.includes(column.key)), [columnLayout.hidden, orderedColumns]);
  const pinnedLeft = useMemo(() => visibleColumns.filter((column) => columnLayout.pins[column.key] === "left"), [columnLayout.pins, visibleColumns]);
  const pinnedRight = useMemo(() => visibleColumns.filter((column) => columnLayout.pins[column.key] === "right"), [columnLayout.pins, visibleColumns]);
  const renderedColumns = visibleColumns;
  const pinOffsets = useMemo(() => {
    const left: Record<string, number> = {};
    const right: Record<string, number> = {};
    let leftOffset = SPREADSHEET_GUTTER_WIDTH;
    for (const column of pinnedLeft) { left[column.key] = leftOffset; leftOffset += columnLayout.widths[column.key] ?? defaultTrackerColumnWidth(column); }
    let rightOffset = 0;
    for (const column of [...pinnedRight].reverse()) { right[column.key] = rightOffset; rightOffset += columnLayout.widths[column.key] ?? defaultTrackerColumnWidth(column); }
    return { left, right };
  }, [columnLayout.widths, pinnedLeft, pinnedRight]);

  const filteredRows = useMemo(() => data?.pagination ? data.rows : filterTrackerRows(data?.rows ?? [], query, columnFilter, sort).filter(row=>!quickStatus||row.status.toLowerCase()===quickStatus.toLowerCase()), [columnFilter, data, query, sort, quickStatus]);
  const spreadsheetPadding = useSpreadsheetViewport(viewportRef, filteredRows.length);
  const virtualTrackerRows=useMemo(()=>Array.from({length:spreadsheetPadding.count},(_,index)=>({id:`virtual:transmittal-tracker:slot:${(page-1)*navigation.limit+filteredRows.length+index+1}`})),[spreadsheetPadding.count,page,navigation.limit,filteredRows.length]);
  const trackerRowKeys=useMemo(()=>filteredRows.map(row=>trackerRowKey(row)),[filteredRows]);
  const trackerSelectionRowKeys=useMemo(()=>[...trackerRowKeys,...virtualTrackerRows.map(row=>row.id)],[trackerRowKeys,virtualTrackerRows]);
  const formulaColumns=useMemo(()=>renderedColumns.map(column=>({key:String(column.key),title:column.title})),[renderedColumns]);
  const selectionDatasetKey = `${TRACKER_PAGINATION_ENABLED ? JSON.stringify(pageOptions) : "legacy"}:${profile?.id ?? "anonymous"}:${accessToken ?? ""}`;
  if (TRACKER_PAGINATION_ENABLED && selectedRowState.ids.size && selectedRowState.datasetKey!==selectionDatasetKey) setSelectedRowState({datasetKey:selectionDatasetKey,ids:new Set()});
  const selectedRows = selectedRowState.datasetKey === selectionDatasetKey ? selectedRowState.ids : new Set<string>();
  const setSelectedRows = (update: Set<string> | ((current: Set<string>) => Set<string>)) => setSelectedRowState((currentState) => {
    const current = currentState.datasetKey === selectionDatasetKey ? currentState.ids : new Set<string>();
    const next = typeof update === "function" ? update(current) : update;
    return currentState.datasetKey===selectionDatasetKey&&next===currentState.ids?currentState:{ datasetKey: selectionDatasetKey, ids: next };
  });

  const references = useMemo(() => [...new Set([...(data?.rows??[]).map(row=>row.transmittal_ref),...(referenceLookup.token===accessToken?referenceLookup.values:[])].filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[data?.rows,referenceLookup,accessToken]);
  const sheetRows = useMemo(() => projectTransmittalSheetRows((sheetSnapshot?.token===accessToken&&sheetSnapshot.reference===selectedReference?sheetSnapshot.rows:data?.rows)??[],selectedReference),[data?.rows,sheetSnapshot,selectedReference,accessToken]);
  const selectedRange = useMemo(() => {
    if (!cellSelection) return null;
    const rowA = trackerSelectionRowKeys.indexOf(cellSelection.anchorRowId);
    const rowB = trackerSelectionRowKeys.indexOf(cellSelection.focusRowId);
    const columnA = renderedColumns.findIndex((column) => column.field === cellSelection.anchorField);
    const columnB = renderedColumns.findIndex((column) => column.field === cellSelection.focusField);
    return rowA < 0 || rowB < 0 || columnA < 0 || columnB < 0 ? null : { minRow: Math.min(rowA, rowB), maxRow: Math.max(rowA, rowB), minColumn: Math.min(columnA, columnB), maxColumn: Math.max(columnA, columnB) };
  }, [cellSelection, trackerSelectionRowKeys, renderedColumns]);
  const selectedFormatCellKeys = useMemo(() => {
    if(formatSelection?.mode==="row"){const selected=new Set(formatSelection.keys);const keys=formatSelection.keys.length>1000?trackerSelectionRowKeys.filter(id=>selected.has(id)):formatSelection.keys;return new Set(keys.flatMap(id=>renderedColumns.map(column=>reportCellFormatKey(id,column.key))));}
    if(formatSelection?.mode==="column")return new Set([...filteredRows.map(row=>trackerRowKey(row)),...virtualTrackerRows.map(row=>row.id)].flatMap(id=>formatSelection.keys.map(column=>reportCellFormatKey(id,column))));
    if (!selectedRange) return new Set<string>();
    const selected = new Set<string>();
    for (let rowIndex = selectedRange.minRow; rowIndex <= selectedRange.maxRow; rowIndex += 1) {
      for (let columnIndex = selectedRange.minColumn; columnIndex <= selectedRange.maxColumn; columnIndex += 1) {
        selected.add(reportCellFormatKey(trackerSelectionRowKeys[rowIndex], renderedColumns[columnIndex].key));
      }
    }
    return selected;
  }, [filteredRows, renderedColumns, selectedRange, formatSelection, trackerSelectionRowKeys, virtualTrackerRows]);
  const selectedFormats = [...selectedFormatCellKeys].map(key=>({...sharedColumns[key.slice(key.lastIndexOf("\u0000")+1)]?.format,...reportCellFormatFor(cellFormats,key)}));
  const selectionIsBold = selectedFormats.length > 0 && selectedFormats.every((format) => format.bold === true);
  const selectedTextColor = selectedFormats.length > 0 && selectedFormats.every((format) => format.color === selectedFormats[0].color) ? selectedFormats[0].color ?? "" : null;
  const selectedBackgroundColor = selectedFormats.length > 0 && selectedFormats.every((format) => format.backgroundColor === selectedFormats[0].backgroundColor) ? selectedFormats[0].backgroundColor ?? "" : null;

  const applyCellFormat = (change: Partial<ReportCellFormat>) => {
    if (!sharedDesign.canEdit || !selectedFormatCellKeys.size) return;
    if(formatSelection?.mode==="row"&&formatSelection.keys.length>1000){setSelectionError("Select at most 1,000 rows for individual cell formatting, or use whole-column formatting.");return;}
    const patch={...change,...(change.color===""?{color:null}:{}),...(change.backgroundColor===""?{backgroundColor:null}:{})};
    if(formatSelection?.mode==="column"){
      for(const column of formatSelection.keys){const design=sharedColumns[column],header={};
        const headerPatch={...(Object.hasOwn(patch,"color")?{color:patch.color}:{}),...(Object.hasOwn(patch,"backgroundColor")?{backgroundColor:patch.backgroundColor}:{}),...(Object.hasOwn(patch,"fontSize")?{fontSize:patch.fontSize}:{})};
        void saveSharedColumnDesign(column,{format:{...design?.format,...patch},header:{...header,...headerPatch},cells:Object.fromEntries(Object.entries(design?.cells??{}).map(([id,value])=>[id,{...value,...patch}]))},designColumnWidth(column));
      }
      return;
    }
    const next = Object.fromEntries(Object.entries(cellFormats).map(([key,value])=>[key,{...value}]));
    for (const key of selectedFormatCellKeys) {
      const format = { ...next[key], ...patch };
      if (format.color === "") delete format.color;
      if (format.backgroundColor === "") delete format.backgroundColor;
      if (Object.keys(format).length) next[key] = format;
      else delete next[key];
    }
    setCellFormats(next);
    writeReportCellFormats(cellFormatStorageKey, next);
    const groups:Record<string,Record<string,ReportCellFormat|null>>={};for(const key of selectedFormatCellKeys){const i=key.lastIndexOf("\u0000"),column=key.slice(i+1),row=key.slice(0,i);if(i>=0)(groups[column]??={})[row]=next[key]??null;}for(const [column,cells] of Object.entries(groups))void saveSharedColumnDesign(column,{cells},designColumnWidth(column));
  };

  function selectTrackerRow(id:string,toggle=false,extend=false){
    if(selectAllRequest.busy)return;
    headerFormatting.clear();
    const current=formatSelection?.mode==="row"?formatSelection.keys:[];
    const anchor=trackerSelectionRowKeys.indexOf(current[0]),end=trackerSelectionRowKeys.indexOf(id);
    const keys=extend&&anchor>=0&&end>=0?trackerSelectionRowKeys.slice(Math.min(anchor,end),Math.max(anchor,end)+1):toggle?(current.includes(id)?current.filter(key=>key!==id):[...current,id]):[id];
    setCellSelection(null);
    setFormatSelection(keys.length?{mode:"row",keys}:null);
    setSelectedRows(new Set(keys.filter(key=>!key.startsWith("virtual:"))));
  }
  function trackerContext(event:MouseEvent<HTMLElement>,row:string,column:string){
    event.preventDefault();event.stopPropagation();headerFormatting.clear();
    if(!selectedFormatCellKeys.has(reportCellFormatKey(row,column))){setFormatSelection(null);const field=renderedColumns.find(item=>item.key===column)?.field;if(field)setCellSelection({anchorRowId:row,focusRowId:row,anchorField:field,focusField:field});}
    setCellMenu({x:event.clientX,y:event.clientY,row,column});
  }
  const userMetadata = user?.user_metadata ?? {};
  const accountDisplayName = [profile?.first_name, profile?.last_name].filter((part): part is string => Boolean(part?.trim())).join(" ").trim()
    || [userMetadata.full_name, userMetadata.name, userMetadata.display_name].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim()
    || user?.email?.trim()
    || "";

  const openPrepareDialog = () => {
    if (selectedReference && !references.includes(selectedReference)) setSelectedReference("");
    setExportError("");
    setPrepareDialogOpen(true);
  };

  const baseValue = (row: TransmittalTrackerRow, field: EditableField) => {
    switch (field) {
      case "assigned_plate_number": return row.assigned_plate_number ?? "";
      case "driver_name": return row.driver_name;
      case "warehouse_code_override": return row.warehouse_code;
      case "delivered_to_override": return row.delivered_to;
      case "plate_number_override": return row.plate_number;
      case "delivery_receipt_no_override": return row.delivery_receipt_no;
      case "sales_order_no_override": return row.sales_order_no;
      case "transmittal_ref": return row.transmittal_ref;
      case "date_created_override": return row.date_created;
      case "tracker_status": return row.status;
      case "lbc_waybill_no": return row.lbc_waybill_no;
      case "lbc_shipping_date": return row.shipping_date_via_lbc;
      case "tracker_remarks": return row.remarks;
      case "loading_date_override": return row.loading_date;
      case "delivery_date_override": return row.date_delivered;
    }
  };
  const cellValue = (row: TransmittalTrackerRow, field: EditableField) => {
    const key = draftKey(trackerRowKey(row), field);
    if (drafts[key]) return drafts[key].value;
    const cell = row.cells[field];
    return !cell || cell.value === null || cell.value === undefined ? baseValue(row, field) : text(cell.value);
  };

  const deliveryOptions = dropdownOptions.filter((option) => option.field_key === "delivery_status" && option.active);
  const dropdownChoices: ReportDropdownChoice[] = deliveryOptions.map((option) => ({ value: option.option_value, label: option.display_label }));
  const canManageDropdowns = ["ADMIN", "STAFF"].includes(profile?.role?.toUpperCase() ?? "");

  const saveColumnLayout = (next: TrackerColumnLayout) => setColumnLayout(next);
  const hideColumn = (key: string) => saveColumnLayout({ ...columnLayout, hidden: [...new Set([...columnLayout.hidden, key])] });
  const restoreColumn = (key: string) => saveColumnLayout({ ...columnLayout, hidden: columnLayout.hidden.filter((item) => item !== key) });
  const reorderColumn = (sourceKey: string, targetKey: string) => {
    if (!sharedDesign.canEdit || !designLoaded) return;
    const order = reorderColumnKeys(orderedColumns.map((column) => column.key), sourceKey, targetKey);
    if (order.every((key, index) => key === orderedColumns[index]?.key)) return;
    saveColumnLayout({ ...columnLayout, order });
  };
  const togglePin = (key: string) => {
    const pins = { ...columnLayout.pins };
    if (pins[key]) delete pins[key];
    else {
      const rect = headerRefs.current.get(key)?.getBoundingClientRect();
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!rect || !viewport) return;
      const side = chooseAutomaticPinSide(rect, viewport);
      const nextCount = Object.keys(pins).length + 1;
      if (nextCount > 5 || Object.keys(pins).reduce((total, pinKey) => { const column = TRACKER_COLUMNS.find((item) => item.key === pinKey); return total + (columnLayout.widths[pinKey] ?? (column ? defaultTrackerColumnWidth(column) : 160)); }, 0) + defaultTrackerColumnWidth(TRACKER_COLUMNS.find((column) => column.key === key) ?? TRACKER_COLUMNS[0]) > (viewportRef.current?.clientWidth ?? window.innerWidth) - 120) {
        setNotice("Unpin a column to keep enough room for the table.");
        return;
      }
      pins[key] = side;
    }
    saveColumnLayout({ ...columnLayout, pins });
  };
  const sortColumn = (key: keyof TransmittalTrackerRow) => setSort((current) => current?.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });

  const addStatusOption = async (rawLabel: string) => {
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");
    const label = rawLabel.trim(); const value = dropdownStoredValue(label);
    if (!label || !/^[A-Z0-9][A-Z0-9 _-]{0,59}$/.test(value)) throw new Error("Use letters, numbers, spaces, hyphens, or underscores for the stored option value.");
    if (dropdownOptions.some((option) => option.field_key === "delivery_status" && (option.option_value.toLowerCase() === value.toLowerCase() || option.display_label.toLowerCase() === label.toLowerCase()))) throw new Error("A delivery status with that label or value already exists.");
    await addDropdownOption(accessToken, { field_key: "delivery_status", option_value: value, display_label: label, sort_order: dropdownOptions.filter((option) => option.field_key === "delivery_status").length * 10 });
    setDropdownOptions(await fetchDropdownOptions(accessToken));
    return true;
  };
  const editStatusOption = async (option: DropdownOption, rawLabel: string) => {
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");
    const label = rawLabel.trim();
    if (!label) throw new Error("Display labels cannot be empty.");
    if (dropdownOptions.some((candidate) => candidate.field_key === "delivery_status" && candidate.id !== option.id && candidate.display_label.toLowerCase() === label.toLowerCase())) throw new Error("A delivery status with that display label already exists.");
    const confirmed = option.usage_count > 0 && label !== option.display_label ? window.confirm(`This option is used by ${option.usage_count} record(s). Changing its label keeps the stored value unchanged. Continue?`) : false;
    if (option.usage_count > 0 && label !== option.display_label && !confirmed) return false;
    await editDropdownOption(accessToken, option.id, { display_label: label, ...(confirmed ? { confirm_in_use: true } : {}) });
    setDropdownOptions(await fetchDropdownOptions(accessToken));
    return true;
  };

  const trackerCellKey = (row: TransmittalTrackerRow, field: EditableField) => draftKey(trackerRowKey(row), field);
  const startEditingCell = (key: string) => { editingCellKeyRef.current = key; setEditingCellKey(key); };
  const closeEditedCell = (key: string) => {
    if (editingCellKeyRef.current !== key) return;
    editingCellKeyRef.current = "";
    setEditingCellKey("");
    requestAnimationFrame(() => { if (!editingCellKeyRef.current) cellRefs.current.get(key)?.focus(); });
  };
  const liveTrackerTarget=(row:TransmittalTrackerRow,field:EditableField)=>{
    if(!data)return null;
    if(field==="delivery_receipt_no_override")return {table:"transmittal-tracker",source:"trip_stops",recordId:row.trip_stop_id,tripId:row.trip_id,stopId:row.trip_stop_id,field:"dr_number"};
    const column=data.columns.find(column=>column.settings.system_key===field);
    return column?{table:"transmittal-tracker",source:"flex_columns",recordId:column.id,tripId:row.trip_id,stopId:row.trip_stop_id,field:"value"}:null;
  };
  const renderEditableCell = (row: TransmittalTrackerRow, field: EditableField, editor: TrackerColumn["editor"], column?: TrackerColumn) => {
    if(editor==="readonly")return <span className="block whitespace-pre-wrap break-words" title="Manage truck assignments in Trip Details">{baseValue(row,field)}</span>;
    const key = trackerCellKey(row, field);
    const value = cellValue(row, field);
    const input=column&&configurableTextColumn(String(column.key))?sharedColumns[column.key]?.input:undefined;
    const editing = editingCellKey === key;
    const legacyConflict = row.legacy_conflicts.includes(field);
    const editable = data?.access.canEdit ?? false;
    if(editing&&input?.type==="DROPDOWN"&&column){
      const choices=(input.options??[]).filter(option=>option.active||option.value===value).map(option=>({value:option.value,label:option.label}));
      const commit=(next:string)=>{editDraft(row,field,next);void saveCell(row,field,next).then(saved=>{if(saved)closeEditedCell(key);});};
      return <ReportDropdownEditor label={column.title} value={value} options={choices} displayValue={choices.find(option=>option.value===value)?.label??value} allowAdd={sharedDesign.canEdit} canManageOptions={sharedDesign.canEdit} onSelect={next=>editDraft(row,field,next)} onCommitSelection={commit} onCommitBlur={()=>commit(draftsRef.current[key]?.value??value)} onCancel={()=>{const next={...draftsRef.current};delete next[key];draftsRef.current=next;setDrafts(next);closeEditedCell(key);}} onAdd={async label=>{
        if(!accessToken)return false;
        const normalized=label.trim(),stored=dropdownStoredValue(normalized);
        if(!normalized||normalized.length>100)return false;
        const existing=input.options?.find(option=>option.label.toLocaleLowerCase()===normalized.toLocaleLowerCase());
        if(!existing&&input.options?.some(option=>option.value===stored))throw new Error("An option with this name already exists.");
        const nextValue=existing?.value??stored;
        await sharedDesign.save(String(column.key),{input:{...input,options:existing?(input.options??[]).map(option=>option.value===nextValue?{...option,active:true}:option):[...(input.options??[]),{value:nextValue,label:normalized,color:null,active:true}]}},columnLayout.widths[column.key]??160);
        if(!confirmedColumnDesign(accessToken,"transmittal-tracker",String(column.key))?.input?.options?.some(option=>option.active&&option.value===nextValue))return false;
        editDraft(row,field,nextValue);const saved=await saveCell(row,field,nextValue);if(saved)closeEditedCell(key);return saved;
      }}/>;
    }
    const customOption=input?.type==="DROPDOWN"?input.options?.find(option=>option.value===value):undefined;
    const shownValue = customOption?.label ?? (editor === "date" ? displayDate(value) : editor === "dropdown" ? dropdownChoices.find((choice) => choice.value === value)?.label ?? value : value);
    if (editing && editor === "relationship" && column?.relationshipKind) {
      const relationshipCommit = (nextValue: string) => {
        editDraft(row, field, nextValue);
        void saveCell(row, field, nextValue).then((saved) => { if (saved) closeEditedCell(key); });
      };
      return <SearchableRelationshipEditor
        token={accessToken ?? ""}
        kind={column.relationshipKind}
        value={value}
        onSelect={(option) => editDraft(row, field, option.values?.[column.relationshipValueField ?? ""] ?? option.secondary ?? option.label)}
        onCommitSelection={(option) => relationshipCommit(option.values?.[column.relationshipValueField ?? ""] ?? option.secondary ?? option.label)}
        onCommitBlur={() => relationshipCommit(draftsRef.current[key]?.value ?? value)}
        onCancel={() => { const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next); closeEditedCell(key); }}
        disabled={!editable || busyCells.has(key) || conflictKeys.has(key)} />;
    }
    if (editing && field === "tracker_status" && column) {
      const choices = [...dropdownChoices];
      if (value && !choices.some((choice) => choice.value === value)) choices.unshift({ value, label: value });
      return <ReportDropdownEditor label={column.title} value={value} displayValue={choices.find((choice) => choice.value === value)?.label ?? value} options={choices} knownValues={dropdownOptions.filter((option) => option.field_key === "delivery_status").map((option) => option.option_value)} managedOptions={dropdownOptions.filter((option) => option.field_key === "delivery_status" && option.active)} loading={dropdownOptionsLoading} error={dropdownOptionsError} allowAdd canManageOptions={canManageDropdowns} onSelect={(next) => editDraft(row, field, next)} onCommitSelection={(next) => { editDraft(row, field, next); void saveCell(row, field, next).then((saved) => { if (saved) closeEditedCell(key); }); }} onCommitBlur={() => { const next = draftsRef.current[key]?.value ?? value; void saveCell(row, field, next).then((saved) => { if (saved) closeEditedCell(key); }); }} onAdd={addStatusOption} onEditOption={editStatusOption} onCancel={() => { const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next); closeEditedCell(key); }} onClose={() => { const next = draftsRef.current[key]?.value ?? value; void saveCell(row, field, next).then((saved) => { if (saved) closeEditedCell(key); }); }} />;
    }
    if (editing) return <ReportTextCellEditor
      buffered
      value={value}
      saveState={conflictKeys.has(key)?"error":undefined}
      type={input?.type==="NUMBER"?"number":input?.type==="DATE"||editor==="date"?"date":"text"}
      multiline={field === "tracker_remarks" && (!input || input.type==="TEXT")}
      label={`Edit ${column?.title ?? field} for ${row.delivered_to || "delivery stop"}`}
      maxLength={10_000}
      disabled={busyCells.has(key) || conflictKeys.has(key)}
      className={`w-full min-w-0 rounded-md border border-[#9cc3e3] bg-white px-2 py-1.5 text-sm font-medium text-slate-800 shadow-sm outline-none ring-2 ring-[#cfe1f1] ${editor === "date" ? "min-w-32" : ""} ${field === "tracker_remarks" ? "min-h-24 resize-y" : ""}`}
      onChange={(next) => editDraft(row, field, next, false)}
      onCommit={(next) => saveCell(row, field, next).then((saved) => { if (saved) closeEditedCell(key); return saved; })}
      onCancel={() => { const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next); closeEditedCell(key); }} />;
    return <button type="button" tabIndex={0} disabled={!editable || busyCells.has(key) || conflictKeys.has(key)} title={legacyConflict ? "Legacy values conflict; edit and save to resolve." : editable ? `Click to edit ${column?.title ?? field}` : undefined} onClick={(event) => { if (!editable) return; setSelectedCell({ rowId: trackerRowKey(row), field }); if (event.shiftKey && cellSelection) { setCellSelection((current) => current ? { ...current, focusRowId: trackerRowKey(row), focusField: field } : { anchorRowId: trackerRowKey(row), anchorField: field, focusRowId: trackerRowKey(row), focusField: field }); return; } setCellSelection({ anchorRowId: trackerRowKey(row), anchorField: field, focusRowId: trackerRowKey(row), focusField: field }); startEditingCell(key); }} className={`block min-h-5 w-full min-w-0 rounded-md border border-transparent p-0 text-left text-[13px] text-inherit transition ${editable ? "cursor-text" : "cursor-default"} ${legacyConflict ? "bg-amber-50" : ""}`}>
      <span style={customOption?.color?{color:customOption.color,backgroundColor:`${customOption.color}18`}:editor==="dropdown"&&dropdownOptions.find(option=>option.field_key==="delivery_status"&&option.option_value===value)?.color?{color:dropdownOptions.find(option=>option.field_key==="delivery_status"&&option.option_value===value)!.color!,backgroundColor:`${dropdownOptions.find(option=>option.field_key==="delivery_status"&&option.option_value===value)!.color}18`}:undefined} className="inline-block whitespace-pre-wrap break-words rounded-sm px-1">{shownValue}</span>
    </button>;
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!selectedCell || (event.target as HTMLElement).closest("input,[role=combobox]")) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
    const currentRow = filteredRows.findIndex((row) => trackerRowKey(row) === selectedCell.rowId);
    const currentColumn = renderedColumns.findIndex((column) => column.field === selectedCell.field);
    if (currentRow < 0 || currentColumn < 0) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (data?.access.canEdit && renderedColumns[currentColumn]?.editor!=="readonly") startEditingCell(draftKey(selectedCell.rowId, selectedCell.field));
      return;
    }
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(filteredRows.length - 1, currentRow + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0)));
    const nextColumn = Math.max(0, Math.min(renderedColumns.length - 1, currentColumn + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0)));
    const row = filteredRows[nextRow];
    const column = renderedColumns[nextColumn];
    setSelectedCell(current=>current?.rowId===trackerRowKey(row)&&current.field===column.field?current:{ rowId: trackerRowKey(row), field: column.field });
    if (event.shiftKey && cellSelection) setCellSelection((current) => current ? { ...current, focusRowId: trackerRowKey(row), focusField: column.field } : { anchorRowId: selectedCell.rowId, anchorField: selectedCell.field, focusRowId: trackerRowKey(row), focusField: column.field });
    else setCellSelection({ anchorRowId: trackerRowKey(row), anchorField: column.field, focusRowId: trackerRowKey(row), focusField: column.field });
    requestAnimationFrame(() => cellRefs.current.get(draftKey(trackerRowKey(row), column.field))?.focus());
  };

  const editDraft = (row: TransmittalTrackerRow, field: EditableField, value: string, notify=true) => {
    const key = draftKey(trackerRowKey(row), field);
    const existing = draftsRef.current[key];
    const next = { ...draftsRef.current, [key]: { value, expectedVersion: existing?.expectedVersion ?? row.cells[field]?.version ?? 0 } };
    draftsRef.current = next;
    if(notify||!existing)setDrafts(next);
  };

  const persistCell = async (row: TransmittalTrackerRow, field: EditableField, value: string): Promise<boolean> => {
    if(field==="assigned_plate_number"||field==="driver_name")return false;
    const key = draftKey(trackerRowKey(row), field);
    if (!accessToken || busyRef.current.has(key)) return false;
    const configuredColumn=TRACKER_COLUMNS.find(column=>column.field===field);
    try { if(configuredColumn&&configurableTextColumn(String(configuredColumn.key)))value=configuredCellValue(value,confirmedColumnDesign(accessToken,"transmittal-tracker",String(configuredColumn.key))?.input??sharedColumns[configuredColumn.key]?.input,baseValue(row,field)); }
    catch(cause){setError(cause instanceof Error?cause.message:"Invalid cell value.");return false;}
    const originalValue = baseValue(row, field);
    const existing = row.cells[field];
    const draft = draftsRef.current[key];
    const resolveLegacyConflict = row.legacy_conflicts.includes(field);
    if (!resolveLegacyConflict && value === (existing?.value !== null && existing?.value !== undefined ? text(existing.value) : originalValue)) {
      const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next);
      return true;
    }
    if (conflictKeys.has(key)) return false;
    if (resolveLegacyConflict && !window.confirm(`Several different values were stored for this stop's ${field.replaceAll("_", " ")} field. Saving will replace the old POD-specific values with one stop-level value. Continue?`)) return false;
    busyRef.current.add(key);
    setBusyCells((current) => new Set(current).add(key));
    setNotice("");
    try {
      const saved = await saveTransmittalTrackerCell(accessToken, row.trip_stop_id, field, value, draft?.expectedVersion ?? existing?.version ?? 0, resolveLegacyConflict);
      ++loadGenerationRef.current; // Discard any GET that began before this committed write.
      const applySaved = (candidate:TransmittalTrackerRow):TransmittalTrackerRow => {
        if (candidate.trip_stop_id !== row.trip_stop_id) return candidate;
        const currentCell = candidate.cells[field];
        if (currentCell && currentCell.version > saved.cell.version) return candidate;
        return {
          ...candidate,
          cells: { ...candidate.cells, [field]: { value: saved.cell.value, version: saved.cell.version, row_id: saved.row_id } },
          legacy_conflicts: candidate.legacy_conflicts.filter((conflictedField) => conflictedField !== field),
          ...(field === "warehouse_code_override" ? { warehouse_code: value } : {}),
          ...(field === "delivered_to_override" ? { delivered_to: value } : {}),
          ...(field === "plate_number_override" ? { plate_number: value } : {}),
          ...(field === "delivery_receipt_no_override" ? { delivery_receipt_no: value } : {}),
          ...(field === "sales_order_no_override" ? { sales_order_no: value } : {}),
          ...(field === "transmittal_ref" ? { transmittal_ref: value } : {}),
          ...(field === "date_created_override" ? { date_created: value } : {}),
          ...(field === "tracker_status" ? { status: value } : {}),
          ...(field === "lbc_waybill_no" ? { lbc_waybill_no: value } : {}),
          ...(field === "lbc_shipping_date" ? { shipping_date_via_lbc: value } : {}),
          ...(field === "tracker_remarks" ? { remarks: value } : {}),
          ...(field === "loading_date_override" ? { loading_date: value } : {}),
          ...(field === "delivery_date_override" ? { date_delivered: value } : {}),
        };
      };
      setData(current=>current?({...current,rows:current.rows.map(applySaved)}):current);
      setSheetSnapshot(current=>current?.token===accessToken?({...current,rows:current.rows.map(applySaved)}):current);
      const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next);
      setConflictKeys((current) => { const nextConflicts = new Set(current); nextConflicts.delete(key); return nextConflicts; });
      setError("");
      setSelectedRows(new Set());
      setNotice(saved.audit_warning ?? "");
      return true;
    } catch (saveError) {
      const message = saveError instanceof ApiError && saveError.status === 409
        ? "This value changed in another session. Your original draft is preserved and was not applied. Discard it to use the latest value."
        : saveError instanceof Error ? saveError.message : "Unable to save this value.";
      setError(message);
      if (saveError instanceof ApiError && saveError.status === 409) setConflictKeys((current) => new Set(current).add(key));
      return false;
    } finally {
      busyRef.current.delete(key);
      setBusyCells((current) => { const next = new Set(current); next.delete(key); return next; });
    }
  };

  const saveCell = (row: TransmittalTrackerRow, field: EditableField, value: string): Promise<boolean> => {
    const key = draftKey(trackerRowKey(row), field);
    const existing = pendingSavePromises.current.get(key);
    if (existing) return existing;
    const request = persistCell(row, field, value);
    pendingSavePromises.current.set(key, request);
    void request.finally(() => {
      if (pendingSavePromises.current.get(key) === request) pendingSavePromises.current.delete(key);
    });
    return request;
  };

  const closeRowEditor = () => {
    if (rowEditSaving.current || rowEditBusy) return;
    if (rowEdit && JSON.stringify(rowEdit.values) !== rowEditBaseline.current && !window.confirm("Discard unsaved tracker changes?")) return;
    setRowEdit(null);
  };
  const openSelectedRowEditor = () => {
    if (selectedRows.size !== 1 || !data?.access.canEdit) return;
    const stopId = [...selectedRows][0];
    const row = data.rows.find((candidate) => trackerRowKey(candidate) === stopId);
    if (!row) return;
    const values = Object.fromEntries(TRACKER_COLUMNS.map((column) => [column.field, cellValue(row, column.field)]));
    rowEditBaseline.current = JSON.stringify(values);
    setRowEditStep(0);
    setRowEdit({ stopId, profileId: profile?.id ?? null, values });
    setRowEditError("");
  };

  function prepareFormulaSource(row:TransmittalTrackerRow,key:string){
    const column=TRACKER_COLUMNS.find(column=>column.key===key);if(!column)return undefined;
    const field=column.field,cellKey=draftKey(trackerRowKey(row),field),relationship=column.editor==="relationship"||column.editor==="readonly";
    return {value:draftsRef.current[cellKey]?.value??cellValue(row,field),writable:Boolean(data?.access.canEdit)&&!relationship&&!conflictKeys.has(cellKey),reason:relationship?"Use the cell's searchable relationship selector; typed labels cannot change linked records.":"Resolve the cell's existing conflict before saving.",
      cancel:()=>{const next={...draftsRef.current};delete next[cellKey];draftsRef.current=next;setDrafts(next);closeEditedCell(cellKey);},
      save:async(raw:string)=>{let value=raw;if(column.editor==="dropdown"){const option=dropdownOptions.find(option=>option.field_key==="delivery_status"&&option.active&&(option.option_value===raw||option.display_label===raw));if(!option)throw new Error("Choose an active status value.");value=option.option_value;}editDraft(row,field,value,false);const saved=await saveCell(row,field,value);if(saved)closeEditedCell(cellKey);return saved;}};
  }

  function selectTrackerRange(idForGrid:string,columnKey:string,extend:boolean){
    const field=renderedColumns.find(column=>column.key===columnKey)?.field;
    if(!field)return;headerFormatting.clear();setFormatSelection(null);setSelectedRows(current=>current.size?new Set():current);
    setSelectedCell({rowId:idForGrid,field});
    setCellSelection(current=>!extend&&current?.anchorRowId===idForGrid&&current.focusRowId===idForGrid&&current.anchorField===field&&current.focusField===field?current:extend&&current?{...current,focusRowId:idForGrid,focusField:field}:{anchorRowId:idForGrid,focusRowId:idForGrid,anchorField:field,focusField:field});
  }
  const formulas=useOperationalFormulas({viewport:viewportRef,token:accessToken,table:"transmittal-tracker",rows:filteredRows,columns:formulaColumns,identity:trackerFormulaIdentity,sourceEditor:prepareFormulaSource,virtualRows:virtualTrackerRows,onSelect:(id,column,extend)=>selectTrackerRange(id.startsWith("stop:")?id.slice(5).replace(":assignment:","~"):id,column,extend),rowOffset:(page-1)*navigation.limit,canEdit:Boolean(data?.access.canEdit)&&!headerFormatting.key,paused:Boolean(editingCellKey||fillGesture)});
  const selectionScope=JSON.stringify([accessToken,criteriaKey,page,navigation.limit]);
  const selectAllRequest=useSpreadsheetSelectAll(selectionScope,setSelectionError);
  useEffect(()=>{setFormatSelection(null);setCellSelection(null);setSelectedRows(new Set());setSelectionRecords([]);setSelectionError("");},[selectionScope]);
  const selectionRows=useMemo(()=>new Map<string,TrackerSelectionRow>([...selectionRecords,...filteredRows].map(row=>[trackerRowKey(row),row])),[selectionRecords,filteredRows]);
  const selectedPhysicalCount=formatSelection?.mode==="row"?formatSelection.keys.filter(id=>!id.startsWith("virtual:")).length:0;
  const allMatchingRowsSelected=selectedPhysicalCount>0&&selectedPhysicalCount===(data?.pagination?.total??filteredRows.length);
  function selectAllTrackerRows(){
    if(!accessToken||pageNavigationBlocked)return;setSelectionError("");
    void selectAllRequest.run(current=>TRACKER_PAGINATION_ENABLED?fetchTrackerSelection(accessToken,pageOptions,current):Promise.resolve(filteredRows),matching=>{
      const keys=matching.map(trackerRowKey);headerFormatting.clear();setCellSelection(null);setSelectionRecords(matching);setSelectedRows(new Set(keys));setFormatSelection(keys.length?{mode:"row",keys}:null);
    });
  }
  const rangeDrag=useSpreadsheetDragSelection({viewport:viewportRef,scope:selectionScope,blocked:Boolean(editingCellKey||rowEdit||fillGesture||formulas.draftPending||selectAllRequest.busy),onSelect:selectTrackerRange,onFinish:(key,column)=>{
    const row=filteredRows.find(row=>trackerRowKey(row)===key),id=row?trackerFormulaIdentity(row):key;
    if(id)formulas.selectCell(id,column,true);
    requestAnimationFrame(()=>viewportRef.current?.querySelector<HTMLElement>(`td[data-range-row="${CSS.escape(key)}"][data-range-column="${CSS.escape(column)}"]`)?.focus({preventScroll:true}));
  }});

  const saveSelectedTrackerRow = async () => {
    if (rowEditSaving.current || !rowEdit || rowEdit.profileId !== (profile?.id ?? null) || !data?.access.canEdit) return;
    const row = data.rows.find((candidate) => trackerRowKey(candidate) === rowEdit.stopId);
    if (!row) { setRowEditError("This delivery stop is no longer available. Refresh the tracker."); return; }
    rowEditSaving.current = true;
    setRowEditBusy(true);
    setRowEditError("");
    const dirty = TRACKER_COLUMNS.filter((column) => column.editor!=="readonly" && rowEdit.values[column.field] !== cellValue(row, column.field));
    try {
      for (const column of dirty) {
        const saved = await saveCell(row, column.field, rowEdit.values[column.field] ?? "");
        if (!saved) throw new Error(`Unable to save ${column.title}. Any earlier fields in this row may already have saved.`);
      }
      setRowEdit(null);
      setNotice(dirty.length ? "Row changes saved." : "No row changes to save.");
    } catch (cause) {
      setRowEditError(cause instanceof Error ? cause.message : "Unable to save this row.");
    } finally { rowEditSaving.current = false; setRowEditBusy(false); }
  };

  const beginFillGesture = (row: TransmittalTrackerRow, column: TrackerColumn) => {
    if (!data?.access.canEdit || ["relationship","readonly"].includes(column.editor) || busyRef.current.size || Object.keys(draftsRef.current).length) return;
    const baseline = new Map<string, string>();
    for (const candidate of filteredRows) for (const item of renderedColumns) baseline.set(draftKey(trackerRowKey(candidate), item.field), cellValue(candidate, item.field));
    const gesture: FillGesture = { sourceStopId: trackerRowKey(row), sourceField: column.field, sourceValue: cellValue(row, column.field), targetStopId: trackerRowKey(row), targetField: column.field, baseline };
    fillGestureRef.current = gesture;
    setFillGesture(gesture);
  };

  const extendFillGesture = (row: TransmittalTrackerRow, column: TrackerColumn) => {
    const gesture = fillGestureRef.current;
    if (!gesture) return;
    const next = { ...gesture, targetStopId: trackerRowKey(row), targetField: column.field };
    fillGestureRef.current = next;
    setFillGesture(next);
  };

  const finishFillGesture = async () => {
    const gesture = fillGestureRef.current;
    if (!gesture) return;
    fillGestureRef.current = null;
    setFillGesture(null);
    const sourceRowIndex = filteredRows.findIndex((row) => trackerRowKey(row) === gesture.sourceStopId);
    const targetRowIndex = filteredRows.findIndex((row) => trackerRowKey(row) === gesture.targetStopId);
    const sourceColumnIndex = renderedColumns.findIndex((column) => column.field === gesture.sourceField);
    const targetColumnIndex = renderedColumns.findIndex((column) => column.field === gesture.targetField);
    if (sourceRowIndex < 0 || targetRowIndex < 0 || sourceColumnIndex < 0 || targetColumnIndex < 0) return;
    if (cellValue(filteredRows[sourceRowIndex], gesture.sourceField) !== gesture.baseline.get(draftKey(gesture.sourceStopId, gesture.sourceField))) {
      setError("Fill cancelled because the source cell changed.");
      return;
    }
    for (const { row: rowIndex, column: columnIndex } of expandSpreadsheetRange(sourceRowIndex, sourceColumnIndex, targetRowIndex, targetColumnIndex)) {
      const row = filteredRows[rowIndex];
      const column = renderedColumns[columnIndex];
      const sourceColumn = renderedColumns[sourceColumnIndex];
      if (!row || !column || ["relationship","readonly"].includes(column.editor) || column.editor !== sourceColumn.editor) continue;
      if (cellValue(row, column.field) !== gesture.baseline.get(draftKey(trackerRowKey(row), column.field))) {
        setError("A destination changed while the fill range was selected. Remaining cells were not overwritten.");
        return;
      }
      editDraft(row, column.field, gesture.sourceValue);
      if (!await saveCell(row, column.field, gesture.sourceValue)) return;
    }
  };

  const finishFillRef = useRef(finishFillGesture);
  useEffect(() => { finishFillRef.current = finishFillGesture; });
  useEffect(() => {
    if (!fillGesture) return;
    const finish = () => { void finishFillRef.current(); };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => { window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
  }, [fillGesture]);

  const handleTrackerPaste = async (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (!data?.access.canEdit || busyRef.current.size) return;
    const values = parseSpreadsheetClipboard(event.clipboardData.getData("text/plain"));
    if (!values.length || (values.length === 1 && values[0].length === 1)) return;
    const target = (event.target as HTMLElement).closest<HTMLTableCellElement>("td[data-tracker-stop-id]");
    const stopId = target?.dataset.trackerStopId;
    const field = target?.dataset.trackerField as EditableField | undefined;
    if (!stopId || !field) return;
    event.preventDefault();
    const startRow = filteredRows.findIndex((row) => trackerRowKey(row) === stopId);
    const startColumn = renderedColumns.findIndex((column) => column.field === field);
    if (startRow < 0 || startColumn < 0) return;
    for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < values[rowOffset].length; columnOffset += 1) {
        const row = filteredRows[startRow + rowOffset];
        const column = renderedColumns[startColumn + columnOffset];
        if (!row || !column || ["relationship","readonly"].includes(column.editor)) continue;
        const nextValue = values[rowOffset][columnOffset];
        if (column.editor === "dropdown" && !deliveryOptions.some((option) => option.option_value === nextValue)) {
          setError(`Skipped invalid ${column.title} value: ${nextValue}`);
          return;
        }
        if (column.editor === "date" && nextValue && !/^\d{4}-\d{2}-\d{2}$/.test(nextValue)) {
          setError(`Skipped invalid date for ${column.title}. Use YYYY-MM-DD.`);
          return;
        }
        editDraft(row, column.field, nextValue);
        if (!await saveCell(row, column.field, nextValue)) return;
      }
    }
    setError("");
  };

  const handleTrackerCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLTableCellElement>("td[data-tracker-stop-id]");
    const focusRowId = target?.dataset.trackerStopId ?? selectedCell?.rowId;
    const focusField = (target?.dataset.trackerField as EditableField | undefined) ?? selectedCell?.field;
    if (!focusRowId || !focusField) return;
    const selection = cellSelection ?? { anchorRowId: focusRowId, anchorField: focusField, focusRowId, focusField };
    const rowA = filteredRows.findIndex((row) => trackerRowKey(row) === selection.anchorRowId);
    const rowB = filteredRows.findIndex((row) => trackerRowKey(row) === selection.focusRowId);
    const columnA = renderedColumns.findIndex((column) => column.field === selection.anchorField);
    const columnB = renderedColumns.findIndex((column) => column.field === selection.focusField);
    if (rowA < 0 || rowB < 0 || columnA < 0 || columnB < 0) return;
    const rowIndexes = Array.from({ length: Math.abs(rowB - rowA) + 1 }, (_, index) => Math.min(rowA, rowB) + index);
    const columnIndexes = Array.from({ length: Math.abs(columnB - columnA) + 1 }, (_, index) => Math.min(columnA, columnB) + index);
    event.preventDefault();
    event.clipboardData.setData("text/plain", rowIndexes.map((rowIndex) => columnIndexes.map((columnIndex) => cellValue(filteredRows[rowIndex], renderedColumns[columnIndex].field)).join("\t")).join("\n"));
  };

  const discardConflicts = () => {
    const next = { ...draftsRef.current };
    for (const key of conflictKeys) delete next[key];
    draftsRef.current = next;
    setDrafts(next);
    setConflictKeys(new Set());
    void load(true);
    if(TRACKER_PAGINATION_ENABLED&&sheetOpen&&accessToken&&selectedReference) {
      void fetchTrackerExportRows(accessToken,{reference:selectedReference}).then(rows=>setSheetSnapshot({token:accessToken,reference:selectedReference,rows})).catch(cause=>setError(cause instanceof Error?cause.message:"Unable to refresh the reference sheet."));
    }
  };

  const legacyConflictCount = (data?.rows ?? []).filter((row) => row.legacy_conflicts.length > 0).length;
  const getCommittedExportRows = async (scopeStopIds?: Set<string>, rejectLegacyConflicts = true): Promise<TransmittalTrackerRow[] | null> => {
    if (!accessToken) {
      setExportError("Your session has expired. Log in again before exporting.");
      return null;
    }
    const isInScope = (key: string) => !scopeStopIds || scopeStopIds.has(key.slice(0, key.indexOf(":")).split("~")[0]);
    const editableRows=[...(data?.rows??[]),...(scopeStopIds && sheetSnapshot?.token===accessToken?sheetSnapshot.rows:[])];
    const scopedRows = editableRows.filter((row) => !scopeStopIds || scopeStopIds.has(row.trip_stop_id));
    if (rejectLegacyConflicts && scopedRows.some((row) => row.legacy_conflicts.length > 0)) {
      setExportError("Resolve conflicting legacy POD values in the rows being exported so the output cannot contain an ambiguous tracker value.");
      return null;
    }
    setExportError("");
    const inFlight = [...pendingSavePromises.current.entries()].filter(([key]) => isInScope(key)).map(([, promise]) => promise);
    const draftSaves = Object.entries(draftsRef.current).flatMap(([key, draft]) => {
      if (!isInScope(key)) return [];
      if (pendingSavePromises.current.has(key)) return [];
      const separator = key.indexOf(":");
      if (separator < 0) return [];
      const stopId = key.slice(0, separator);
      const field = key.slice(separator + 1) as EditableField;
      const row = editableRows.find((candidate) => trackerRowKey(candidate) === stopId);
      return row && !conflictKeys.has(key) ? [saveCell(row, field, draft.value)] : [];
    });
    const results = await Promise.all([...inFlight, ...draftSaves]);
    if (results.some((saved) => !saved) || Object.keys(draftsRef.current).some(isInScope) || [...busyRef.current].some(isInScope)) {
      setExportError("Some edits could not be saved. Resolve the cell errors or conflicts before exporting.");
      return null;
    }
    try {
      // Read the committed projection after the last CAS completes so exports
      // never use stale React state while save reconciliation is rendering.
      if (TRACKER_PAGINATION_ENABLED) {
        invalidateTransmittalTrackerCache();
        const exported = await fetchTrackerExportRows(accessToken,scopeStopIds ? {reference:selectedReference,status:quickStatus} : {search:query,filterBy:columnFilter?.key,filter:columnFilter?.value,status:quickStatus});
        const reconciled = reconcileTrackerRows(exported,editableRows);
        if(rejectLegacyConflicts && reconciled.some(row=>row.legacy_conflicts.length))throw new Error("Resolve legacy conflicts before exporting.");
        return reconciled;
      }
      const refreshed = await fetchTransmittalTracker(accessToken);
      setData((current) => current ? { ...refreshed, rows: reconcileTrackerRows(refreshed.rows, current.rows) } : refreshed);
      return refreshed.rows;
    } catch (cause) {
      setExportError(cause instanceof Error ? `Edits were saved, but current export data could not be refreshed: ${cause.message}` : "Edits were saved, but current export data could not be refreshed.");
      return null;
    }
  };

  const exportFiltered = async () => {
    const committedRows = await getCommittedExportRows();
    if (!committedRows) return;
    try {
      const ExcelJS = await loadExcelJs();
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transmittal Tracker");
      const columns = [
        ["Assigned Plate", "assigned_plate_number"], ["Assigned Driver", "driver_name"],
        ["WH CODE", "warehouse_code"], ["Delivered to", "delivered_to"], ["Plate #", "plate_number"], ["Delivery Receipt No.", "delivery_receipt_no"], ["S.O. No.", "sales_order_no"], ["Transmittal Ref#", "transmittal_ref"], ["Date created", "date_created"], ["Status", "status"], ["LBC Waybill no.", "lbc_waybill_no"], ["Shipping date via LBC", "shipping_date_via_lbc"], ["Remarks", "remarks"],
      ] as const;
      sheet.columns = columns.map(([header, key]) => ({ header, key, width: Math.max(15, Math.min(34, header.length + 5)) }));
      const exportRows = filterTrackerRows(committedRows, query, columnFilter, sort).filter(row=>!quickStatus||row.status.toLowerCase()===quickStatus.toLowerCase());
      const textIdentifiers = ["delivery_receipt_no", "sales_order_no", "transmittal_ref", "lbc_waybill_no"];
      const exportValues = projectTrackerExportRows(exportRows, columns).map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [
          key,
          textIdentifiers.includes(key) && value !== null && value !== undefined ? String(value) : value,
        ])),
      );
      sheet.addRows(exportValues);
      const identifierColumns = new Set(["delivery_receipt_no", "sales_order_no", "transmittal_ref", "lbc_waybill_no"]);
      columns.forEach(([, key], columnIndex) => {
        if (!identifierColumns.has(key)) return;
        exportValues.forEach((row, rowIndex) => {
          setExcelIdentifier(sheet.getCell(rowIndex + 2, columnIndex + 1), row[key]);
        });
      });
      const trackerHeader = sheet.getRow(1);
      trackerHeader.height = 30;
      trackerHeader.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      trackerHeader.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      trackerHeader.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2341" } };
      });
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        row.height = 25;
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
      exportRows.forEach((row, rowIndex) => columns.forEach(([, key], columnIndex) => {
        const format = (cellFormats[reportCellFormatKey(trackerRowKey(row), key)]??cellFormats[reportCellFormatKey(row.trip_stop_id,key)]);
        if (!format) return;
        const cell = sheet.getCell(rowIndex + 2, columnIndex + 1);
        if (format.bold) cell.font = { ...cell.font, bold: true };
        if (format.color) cell.font = { ...cell.font, color: { argb: `FF${format.color.slice(1).toUpperCase()}` } };
        if (format.backgroundColor) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${format.backgroundColor.slice(1).toUpperCase()}` } };
      }));
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: columns.length } };
      sheet.views = [{ showGridLines: false }];
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const statusView = columnFilter?.key === "status" && columnFilter.value.trim() ? columnFilter.value.trim().toLocaleLowerCase() : "";
      const exportViewName = statusView || (query.trim() || columnFilter?.value.trim() ? "filtered" : "Tracker");
      const link = document.createElement("a"); link.href = url; link.download = `Transmittal ${safeFilenamePart(exportViewName, "Tracker")}.xlsx`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportFailure) { setExportError(exportFailure instanceof Error ? exportFailure.message : "Export failed."); }
  };
  useRegisterTopbarAction("trips:Transmittal Tracker", "prepare", { label: "Prepare Sheet", onClick: openPrepareDialog });
  useRegisterTopbarAction("trips:Transmittal Tracker", "export", { label: "Export", disabled: legacyConflictCount > 0, onClick: () => void exportFiltered() });

  const exportSheet = async () => {
    if (!selectedReference) return;
    const matchingRows = sheetRows;
    const conflictMessage = sheetConflictMessage(matchingRows);
    if (conflictMessage) {
      setExportError(conflictMessage);
      return;
    }
    const stopIds = new Set(matchingRows.map((row) => row.trip_stop_id));
    const committedRows = await getCommittedExportRows(stopIds, false);
    if (!committedRows) return;
    try {
      const ExcelJS = await loadExcelJs();
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transmittal Sheet", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
      const headers = ["Loading Date", "Date Delivered", "WH CODE", "Delivered to", "Plate #", "Delivery Receipt No.", "S.O. No.", "Transmittal Ref#", "Transmittal Date"];
      sheet.columns = [16, 16, 13, 24, 16, 24, 16, 22, 17].map((width) => ({ width }));
      const lastCol = headers.length;
      for (let row = 1; row <= 5; row += 1) sheet.getRow(row).height = 15;
      sheet.mergeCells(1, 1, 5, lastCol);
      const masthead = sheet.getCell(1, 1);
      masthead.value = "TRANSMITTAL SHEET";
      masthead.font = { name: "Aptos Display", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      masthead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
      masthead.alignment = { horizontal: "center", vertical: "middle" };
      masthead.border = { bottom: { style: "thin", color: { argb: "FF17365D" } } };
      sheet.getCell(7, 1).value = "Date"; sheet.getCell(7, 2).value = formatSheetDate(preparation.date);
      sheet.getCell(8, 1).value = "Prepared by"; sheet.getCell(8, 2).value = preparation.preparedBy;
      sheet.getCell(9, 1).value = "Checked by"; sheet.getCell(9, 2).value = preparation.checkedBy;
      sheet.getCell(10, 1).value = "Transmittal Ref#"; setExcelIdentifier(sheet.getCell(10, 2), selectedReference);
      sheet.getCell(11, 1).value = "Transmittal Date";
      const committedSheetRows = projectTransmittalSheetRows(committedRows, selectedReference);
      if (committedSheetRows.length === 0) {
        setExportError("No delivery rows match the selected Transmittal Ref# after saving. Refresh the tracker and select a current reference.");
        return;
      }
      const refreshedConflict = sheetConflictMessage(committedSheetRows);
      if (refreshedConflict) {
        setExportError(refreshedConflict);
        return;
      }
      sheet.getCell(11, 2).value = [...new Set(committedSheetRows.map((row) => row.date_created).filter(Boolean))].join(", ");
      sheet.addRow([]);
      const headerRow = sheet.addRow(headers);
      const outputRows = committedSheetRows.map((row) => [row.loading_date, row.date_delivered, row.warehouse_code, row.delivered_to, row.plate_number, row.delivery_receipt_no == null ? "" : String(row.delivery_receipt_no), row.sales_order_no == null ? "" : String(row.sales_order_no), String(selectedReference), row.date_created]);
      outputRows.forEach((values) => sheet.addRow(values));
      committedSheetRows.forEach((row, rowIndex) => {
        setExcelIdentifier(sheet.getCell(headerRow.number + rowIndex + 1, 6), row.delivery_receipt_no);
        setExcelIdentifier(sheet.getCell(headerRow.number + rowIndex + 1, 7), row.sales_order_no);
        setExcelIdentifier(sheet.getCell(headerRow.number + rowIndex + 1, 8), selectedReference);
      });
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { vertical: "middle", wrapText: true };
      headerRow.height = 44;
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
        cell.border = {
          top: { style: "thin", color: { argb: "FF17365D" } },
          left: { style: "thin", color: { argb: "FFFFFFFF" } },
          bottom: { style: "thin", color: { argb: "FF17365D" } },
          right: { style: "thin", color: { argb: "FFFFFFFF" } },
        };
      });
      const headerRowNumber = headerRow.number;
      const sheetColumnFormatKeys: (keyof TransmittalTrackerRow | null)[] = [null, null, "warehouse_code", "delivered_to", "plate_number", "delivery_receipt_no", "sales_order_no", "transmittal_ref", "date_created"];
      committedSheetRows.forEach((trackerRow, rowIndex) => sheetColumnFormatKeys.forEach((key, columnIndex) => {
        if (!key) return;
        const format = (cellFormats[reportCellFormatKey(trackerRowKey(trackerRow), key)]??cellFormats[reportCellFormatKey(trackerRow.trip_stop_id,key)]);
        if (!format) return;
        const cell = sheet.getCell(headerRowNumber + rowIndex + 1, columnIndex + 1);
        if (format.bold) cell.font = { ...cell.font, bold: true };
        if (format.color) cell.font = { ...cell.font, color: { argb: `FF${format.color.slice(1).toUpperCase()}` } };
        if (format.backgroundColor) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${format.backgroundColor.slice(1).toUpperCase()}` } };
      }));
      for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        row.height = 30;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: "Aptos", size: 10, color: { argb: "FF17365D" } };
          cell.alignment = { vertical: "middle", wrapText: true };
          cell.border = {
            top: { style: "hair", color: { argb: "FFD5DEE8" } },
            left: { style: "hair", color: { argb: "FFE5EAF0" } },
            bottom: { style: "thin", color: { argb: "FFD5DEE8" } },
            right: { style: "hair", color: { argb: "FFE5EAF0" } },
          };
          if (rowNumber % 2 === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F8FC" } };
          }
        });
      }
      sheet.views = [{ showGridLines: false }];
      sheet.pageSetup.printArea = `A1:I${sheet.rowCount}`;
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `Transmittal - ${safeFilenamePart(selectedReference, "Sheet")}.xlsx`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportFailure) { setExportError(exportFailure instanceof Error ? exportFailure.message : "Transmittal Sheet export failed."); }
  };

  const openSheetAfterSave = async () => {
    setExportError("");
    if (!selectedReference) {
      setExportError("Select a Transmittal Ref# before preparing the sheet.");
      return;
    }
    const matchingRows = sheetRows;
    if (matchingRows.length === 0 && !TRACKER_PAGINATION_ENABLED) {
      setExportError("No delivery rows match the selected Transmittal Ref#. Select a reference with at least one delivery row.");
      return;
    }
    const stopIds = new Set(matchingRows.map((row) => row.trip_stop_id));
    const conflictMessage = sheetConflictMessage(matchingRows);
    if (conflictMessage) {
      setExportError(conflictMessage);
      return;
    }
    setPreparingSheet(true);
    try {
      const committedRows = await getCommittedExportRows(stopIds, false);
      if (!committedRows) return;
      const committedSheetRows = projectTransmittalSheetRows(committedRows, selectedReference);
      if (committedSheetRows.length === 0) {
        setExportError("No delivery rows match the selected Transmittal Ref# after saving. Refresh the tracker and select a current reference.");
        return;
      }
      const refreshedConflict = sheetConflictMessage(committedSheetRows);
      if (refreshedConflict) {
        setExportError(refreshedConflict);
        return;
      }
      if(TRACKER_PAGINATION_ENABLED)setSheetSnapshot({token:accessToken!,reference:selectedReference,rows:committedRows.filter(row=>row.transmittal_ref===selectedReference)});
      setPreparation((current) => ({ ...current, date: localDate(), preparedBy: accountDisplayName || current.preparedBy }));
      setPrepareDialogOpen(false);
      setSheetOpen(true);
    } finally {
      setPreparingSheet(false);
    }
  };

  const searchNeedle = query.trim().toLocaleLowerCase();
  const navigatedSearch = useRef("");
  useEffect(() => {
    if (!searchNeedle) { navigatedSearch.current = ""; return; }
    if (loading || navigatedSearch.current === searchNeedle) return;
    const viewport = viewportRef.current;
    const match = viewport?.querySelector<HTMLElement>('td[data-search-match="true"]');
    const header = match && headerRefs.current.get(match.dataset.trackerColumnKey ?? "");
    if (!viewport || !header) return;
    navigatedSearch.current = searchNeedle;
    scrollToTableColumn(viewport, header);
  }, [searchNeedle, loading, filteredRows, renderedColumns]);
  const selectedPhysicalRows=[...selectedRows].map(id=>selectionRows.get(id));
  const hasSelectedDataRows = selectedPhysicalRows.some(Boolean);
  const selectedStopCount=new Set(selectedPhysicalRows.flatMap(row=>row?[row.trip_stop_id]:[])).size;
  const pageNavigationBlocked = Boolean(editingCellKey || rowEdit || rowEditBusy || busyCells.size || Object.keys(drafts).length || resizeState || formulas.draftPending || formulas.busy);
  const loadMore=async()=>{
    if(!accessToken||!TRACKER_PAGINATION_ENABLED||loading||moreFlight.current||pageNavigationBlocked||loadedWindow.current.key!==windowKey||loadedWindow.current.page>=(data?.pagination?.totalPages??1))return;
    const expected=windowKey,generation=loadGenerationRef.current,nextPage=loadedWindow.current.page+1;moreFlight.current=true;setLoadingMore(true);setError("");
    try{const next=await fetchTransmittalTracker(accessToken,pageOptions.search??"",{...pageOptions,page:nextPage});if(generation!==loadGenerationRef.current||loadedWindow.current.key!==expected)return;setData(current=>current?{...next,rows:appendSpreadsheetRows(current.rows,next.rows.filter(row=>!deletedTripIds.current.has(String(row.trip_id))),trackerRowKey)}:current);loadedWindow.current.page=nextPage;}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to load more rows.");}
    finally{moreFlight.current=false;setLoadingMore(false);}
  };
  useSpreadsheetInfiniteScroll(viewportRef,{hasMore:TRACKER_PAGINATION_ENABLED&&loadedWindow.current.key===windowKey&&loadedWindow.current.page<(data?.pagination?.totalPages??1),loading:loading||loadingMore,blocked:Boolean(error)||pageNavigationBlocked,queryKey:windowKey,revision:filteredRows.length,onLoadMore:loadMore});

  useSpreadsheetFeedback(notice);
  useSpreadsheetFeedback(error || exportError, "error");
  useSpreadsheetFeedback(legacyConflictCount > 0 || conflictKeys.size > 0 ? "Some cells have conflicting values. Review them before saving or exporting." : null, "warning");

  const renderSheetEditor = (row: TransmittalTrackerRow, field: EditableField) => {
    const key = draftKey(trackerRowKey(row), field);
    const value = cellValue(row, field);
    return <CollaborativeCell target={liveTrackerTarget(row,field)}><ReportTextCellEditor
      buffered
      label={`${field} for ${row.delivered_to || "delivery stop"}`}
      type="date"
      value={value}
      disabled={!data?.access.canEdit || busyCells.has(key) || conflictKeys.has(key)}
      className="w-full min-w-28 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white disabled:opacity-60"
      onChange={(next) => editDraft(row, field, next, false)}
      onCommit={(next) => draftsRef.current[key] !== undefined ? saveCell(row, field, next) : Promise.resolve(true)}
      onCancel={() => { const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next); }} /></CollaborativeCell>;
  };

  useRegisterTopbarFilter("trips:Transmittal Tracker", {
    label: "Tracker status filters",
    value: quickStatus,
    options: [{value:"",label:"All"},...dropdownChoices,...(quickStatus&&!dropdownChoices.some(option=>option.value===quickStatus)?[{value:quickStatus,label:quickStatus}]:[])],
    disabled: pageNavigationBlocked,
    onChange: setQuickStatus,
  });
  return <section className="space-y-2">
    {resetRows&&accessToken&&<TrackerResetDialog token={accessToken} rows={resetRows} onClose={()=>setResetRows(null)} onReset={ids=>{setSelectedRows(current=>new Set([...current].filter(id=>!ids.includes(id.split("~")[0]))));void load(true);}}/>}
    <div className={REPORT_TOOLBAR_ROW_CLASS} aria-label="Transmittal report toolbar">
      <div className="flex shrink-0 items-center gap-2" data-report-toolbar-leading>{toolbarLeading}</div>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2" data-report-toolbar-actions>
        {sharedWidths.feedback}{sharedDesign.feedback}
        {error && <button type="button" onClick={() => void load(false)} disabled={loading} className="h-9 rounded border border-slate-200 px-3 text-xs text-slate-600 disabled:opacity-40">Retry loading</button>}
        <TopbarSearchRegistration scope="trips:Transmittal Tracker"><ColumnFinder rowSearch={{value:query,onSearch:setQuery,placeholder:"Search rows or columns…"}} columns={TRACKER_COLUMNS.map(column=>({key:column.key,title:headerFormatting.title(column.key,column.title),hidden:columnLayout.hidden.includes(column.key),index:renderedColumns.findIndex(item=>item.key===column.key)}))} viewport={viewportRef} getHeader={key=>headerRefs.current.get(key)} onReveal={restoreColumn} /></TopbarSearchRegistration>
        {hasSelectedDataRows&&data?.access.canEdit&&<ReportRowActionButton action="edit" disabled={selectedRows.size!==1||pageNavigationBlocked||selectAllRequest.busy} onClick={openSelectedRowEditor}/>}
        {hasSelectedDataRows&&data?.access.canEdit&&<ReportRowActionButton action="restore" label="Reset selected transmittal overrides" disabled={selectedStopCount>20||pageNavigationBlocked||loading||selectAllRequest.busy||selectedPhysicalRows.some(row=>!row)} onClick={()=>setResetRows(selectedPhysicalRows.filter((row):row is TrackerSelectionRow=>Boolean(row)))}/>}
      </div>
    </div>
    {columnFilter && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold">Filter {TRACKER_COLUMNS.find((column) => column.key === columnFilter.key)?.title}</span><input autoFocus value={columnFilter.value} onChange={(event) => setColumnFilter({ ...columnFilter, value: event.target.value })} aria-label={`Filter ${TRACKER_COLUMNS.find((column) => column.key === columnFilter.key)?.title}`} className="h-8 min-w-48 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-400" /><button type="button" onClick={() => setColumnFilter(null)} className="rounded px-2 py-1 text-slate-500 hover:bg-white">Clear filter</button></div>}
    {conflictKeys.size > 0 && <button type="button" onClick={discardConflicts} className="text-xs font-semibold text-amber-800 underline">Discard conflicted drafts and load latest</button>}
    <div className={SPREADSHEET_PANEL_CLASS}>
    <div ref={viewportRef} tabIndex={0} onPointerDownCapture={rangeDrag.onPointerDownCapture} onClickCapture={rangeDrag.onClickCapture} onKeyDown={handleGridKeyDown} onPaste={(event) => void handleTrackerPaste(event)} onCopy={handleTrackerCopy} aria-label="Transmittal Tracker grid" className={`${REPORT_GRID_VIEWPORT_CLASS} ${SPREADSHEET_ATTACHED_VIEWPORT_CLASS} outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}>
      <div className="sticky left-0 top-0 z-[80] w-full min-w-0 bg-white">{headerFormatting.configuration}<ReportCellFormattingToolbar selectedFontSize={selectedFormats[0]?.fontSize ?? 12} formulaBar={formulas.bar} selectionIsItalic={selectedFormats.length > 0 && selectedFormats.every(format => format.italic)} selectionIsUnderlined={selectedFormats.length > 0 && selectedFormats.every(format => format.underline)} selectedCellCount={selectedFormatCellKeys.size} selectionIsBold={selectionIsBold} selectedTextColor={selectedTextColor} selectedBackgroundColor={selectedBackgroundColor} onApply={applyCellFormat} {...headerFormatting.toolbarProps} /></div>
      {error&&<div role="alert" className="border-b border-rose-100 px-3 py-2 text-xs text-rose-700">Unable to load tracker records. Your drafts are preserved. Use Retry loading.</div>}
      {!loading&&!error&&data&&!filteredRows.length&&<div role="status" className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">No eligible transmittal records match this view.</div>}
      <table {...headerFormatting.tableProps} className="spreadsheet-grid w-max min-w-full border-separate border-spacing-0 text-left">
        <thead className={tableUi.thead}><tr style={rowHeights.headerStyle}><th scope="col" style={{ top: "var(--spreadsheet-toolbar-height, 36px)", width: SPREADSHEET_GUTTER_WIDTH, minWidth: SPREADSHEET_GUTTER_WIDTH }} className={`${REPORT_GRID_HEADER_CELL_CLASS} sticky left-0 z-[70] spreadsheet-gutter whitespace-nowrap text-center !px-1`}><SpreadsheetRowSelectionHeader active={formatSelection?.mode==="row"&&formatSelection.keys.length>0} checked={allMatchingRowsSelected} partial={formatSelection?.mode==="row"&&formatSelection.keys.length>0&&!allMatchingRowsSelected} disabled={loading||pageNavigationBlocked||selectAllRequest.busy} onChange={checked=>{if(checked)selectAllTrackerRows();else{setFormatSelection(null);setSelectedRows(new Set());setCellSelection(null);setSelectionRecords([]);}}}/>{rowHeights.headerHandle()}</th>{renderedColumns.map((column) => {
          const width = columnLayout.widths[column.key] ?? defaultTrackerColumnWidth(column);
          const pin = columnLayout.pins[column.key];
          const activeSort = sort?.key === column.key;
          const SortIcon = !activeSort ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
          return <th key={column.key} {...headerFormatting.props(column.key)} onContextMenu={event=>{setMenuPosition(headerFormatting.menuPosition(event));setMenuColumn(column);}} ref={(element) => { if (element) headerRefs.current.set(column.key, element); else headerRefs.current.delete(column.key); }} scope="col" onDragOver={(event) => { if (reorderSource) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (reorderSource) reorderColumn(reorderSource, column.key); setReorderSource(null); }} style={{ width, minWidth: width, maxWidth: width, position: "sticky", top: "var(--spreadsheet-toolbar-height, 36px)", backgroundColor: "#ffffff", ...reportHeaderAppearance(sharedColumns[column.key], columnLayout.colors[column.key]), ...(pin ? { left: pin === "left" ? pinOffsets.left[column.key] ?? 0 : undefined, right: pin === "right" ? pinOffsets.right[column.key] ?? 0 : undefined, zIndex: 60 } : { zIndex: 40 }) } as CSSProperties} className={`${REPORT_GRID_HEADER_CELL_CLASS} relative ${pin ? "shadow-sm" : ""}`}>
            {headerFormatting.editor(column.key)}<div className="spreadsheet-header-content flex min-w-0 items-center justify-between gap-1"><button type="button" draggable={sharedDesign.canEdit && designLoaded} data-spreadsheet-header-title title={`Drag to reorder ${column.title}; click to sort`} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(column.key)); setReorderSource(column.key); }} onDragEnd={() => setReorderSource(null)} onClick={() => sortColumn(column.key)} className="min-w-0 flex-1 cursor-grab whitespace-normal rounded px-1 py-1 text-left text-[11px] font-semibold uppercase leading-tight tracking-wide text-inherit active:cursor-grabbing">{headerFormatting.title(column.key, column.title)}{activeSort && <SortIcon aria-hidden="true" className="ml-1 inline h-3 w-3" />}</button></div>
            <span role="separator" aria-label={`Resize ${column.title} column`} aria-orientation="vertical" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); autoFit.clearWidth(column.key); setColumnLayout((current) => ({ ...current, widths: { ...(sharedWidths.loaded ? {} : current.widths), ...sharedWidths.widths } })); setResizeState({ key: column.key, startX: event.clientX, startWidth: headerRefs.current.get(column.key)?.getBoundingClientRect().width ?? width }); }} className="absolute right-0 top-0 z-[60] h-full w-1.5 cursor-col-resize touch-none hover:bg-blue-400/60" />
          </th>;
        })}</tr></thead>
        <tbody><VirtualSpreadsheetRows viewport={viewportRef} keys={trackerRowKeys} keepAlive={editingCellKey?trackerRowKeys.findIndex(key=>editingCellKey.startsWith(key+":")):trackerRowKeys.indexOf(formulas.selectedIdentity?.replace(/^stop:/,"").replace(":assignment:","~")??"")} heights={rowHeights.heights} columnCount={renderedColumns.length+1} renderRow={index=>{const rowIndex=index,row=filteredRows[rowIndex];return <tr data-virtual-index={rowIndex} key={trackerRowKey(row)} style={rowHeights.style(trackerRowKey(row))} className={`group report-data-row ${REPORT_GRID_ROW_CLASS} ${selectedRows.has(trackerRowKey(row)) ? "bg-blue-50/50" : ""}`}><td data-cell-hover-disabled="true" style={{ width: SPREADSHEET_GUTTER_WIDTH, minWidth: SPREADSHEET_GUTTER_WIDTH, height: "var(--spreadsheet-row-height, 30px)" }} className={`spreadsheet-gutter sticky left-0 z-30 whitespace-nowrap border-r border-slate-100 text-center align-middle !px-1 ${REPORT_GRID_BODY_CELL_CLASS} ${selectedRows.has(trackerRowKey(row)) ? "!bg-blue-50" : "bg-slate-50"}`}>{formatSelection?.mode==="row"?<input type="checkbox" className="spreadsheet-row-checkbox" aria-label={`Select row ${(page - 1) * navigation.limit + rowIndex + 1}`} checked={formatSelection.keys.includes(trackerRowKey(row))} onChange={()=>selectTrackerRow(trackerRowKey(row),true)}/>:<button type="button" aria-label={`Select row ${(page - 1) * navigation.limit + rowIndex + 1}`} onClick={event=>selectTrackerRow(trackerRowKey(row),event.ctrlKey||event.metaKey,event.shiftKey)}><SpreadsheetRowNumber value={(page - 1) * navigation.limit + rowIndex + 1}/></button>}<div className="spreadsheet-row-resize-hit-area">{rowHeights.handle(trackerRowKey(row))}</div></td>{renderedColumns.map((column, columnIndex) => {
          const width = columnLayout.widths[column.key] ?? defaultTrackerColumnWidth(column);
          const pin = columnLayout.pins[column.key];
          const formatColor = columnLayout.colors[column.key];
          const formatKey = reportCellFormatKey(trackerRowKey(row), column.key);
          const cellFormat = reportCellFormatFor(cellFormats,formatKey);
          const fieldKey = trackerCellKey(row, column.field);
          const selected = selectedFormatCellKeys.has(formatKey);
          const fillSourceRow = fillGesture ? filteredRows.findIndex((candidate) => trackerRowKey(candidate) === fillGesture.sourceStopId) : -1;
          const fillTargetRow = fillGesture ? filteredRows.findIndex((candidate) => trackerRowKey(candidate) === fillGesture.targetStopId) : -1;
          const fillSourceColumn = fillGesture ? renderedColumns.findIndex((candidate) => candidate.field === fillGesture.sourceField) : -1;
          const fillTargetColumn = fillGesture ? renderedColumns.findIndex((candidate) => candidate.field === fillGesture.targetField) : -1;
          const fillRange = fillGesture && rowIndex >= Math.min(fillSourceRow, fillTargetRow) && rowIndex <= Math.max(fillSourceRow, fillTargetRow) && columnIndex >= Math.min(fillSourceColumn, fillTargetColumn) && columnIndex <= Math.max(fillSourceColumn, fillTargetColumn);
          const editing = editingCellKey === fieldKey;
          return <td key={column.key} {...formulas.cellProps(row,String(column.key))} {...rangeDrag.cell(trackerRowKey(row),String(column.key))} data-spreadsheet-selected={selected?"true":undefined} onContextMenu={event=>trackerContext(event,trackerRowKey(row),String(column.key))} onMouseDownCapture={event=>{if(event.button===0){setFormatSelection(null);setSelectedRows(current=>current.size?new Set():current);}}} data-tracker-stop-id={row.trip_stop_id} data-tracker-field={column.field} data-tracker-column-key={column.key} data-search-match={searchNeedle && cellValue(row, column.field).toLocaleLowerCase().includes(searchNeedle) ? "true" : undefined} data-cell-hover-disabled={pin || editing || selected || fillRange ? "true" : undefined} ref={(element) => { if (element) cellRefs.current.set(fieldKey, element); else cellRefs.current.delete(fieldKey); }} tabIndex={-1} style={{ width, minWidth: width, maxWidth: width, ...reportColumnAppearance(sharedColumns[column.key], cellFormat, formatColor), ...(pin ? { position: "sticky", left: pin === "left" ? pinOffsets.left[column.key] ?? 0 : undefined, right: pin === "right" ? pinOffsets.right[column.key] ?? 0 : undefined, zIndex: 20 } : {}) } as CSSProperties} onPointerEnter={() => extendFillGesture(row, column)} onClick={(event) => { if ((event.target as HTMLElement).closest("button, input, select, textarea")) return; setSelectedCell(current=>current?.rowId===trackerRowKey(row)&&current.field===column.field?current:{ rowId: trackerRowKey(row), field: column.field }); if (data?.access.canEdit && column.editor!=="readonly") startEditingCell(fieldKey); }} className={`${REPORT_GRID_BODY_CELL_CLASS} relative group/cell border-r border-slate-100/70 ${pin ? "bg-white shadow-sm" : ""} ${fillRange ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""} ${selected ? "outline outline-2 outline-inset outline-blue-500" : ""} ${column.key === "remarks" ? "whitespace-pre-wrap break-words" : ""}`}>
            <CollaborativeCell target={liveTrackerTarget(row,column.field)}>{formulas.render(row,String(column.key),renderEditableCell(row, column.field, column.editor, column))}</CollaborativeCell>
            {data?.access.canEdit && !["relationship","readonly"].includes(column.editor) && !editing && !formulas.has(row,String(column.key)) && <button type="button" data-spreadsheet-fill-handle title={`Drag to fill from ${column.title}`} aria-label={`Drag to fill from ${column.title}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); beginFillGesture(row, column); }} onClick={(event) => event.stopPropagation()} className="absolute bottom-0 right-0 z-10 flex h-4 w-4 touch-none items-center justify-center rounded-sm border border-blue-300 bg-white text-blue-600 opacity-0 shadow-sm transition group-hover/cell:opacity-100 focus:opacity-100"><GripVertical aria-hidden="true" className="h-3 w-3 rotate-90" /></button>}
          </td>;
        })}</tr>;}}/>
     <SpreadsheetBlankRows count={spreadsheetPadding.count} height={spreadsheetPadding.height} start={(page - 1) * navigation.limit + filteredRows.length + 1} loading={loading && !data}
          rowSelection={formatSelection?.mode==="row"?new Set(formatSelection.keys.map(key=>Number(key.split(":").at(-1)))):undefined}
          onRowSelect={(number,event)=>selectTrackerRow(`virtual:transmittal-tracker:slot:${number}`,formatSelection?.mode==="row"||event.ctrlKey||event.metaKey,event.shiftKey)}
          cellProps={(number,column)=>{const id=`virtual:transmittal-tracker:slot:${number}`,key=reportCellFormatKey(id,column);return {...formulas.virtualCellProps(id,column),...rangeDrag.cell(id,column),onContextMenu:event=>trackerContext(event,id,column),"data-spreadsheet-selected":selectedFormatCellKeys.has(key)?"true":undefined,style:reportColumnAppearance(sharedColumns[column],cellFormats[key],columnLayout.colors[column])};}}
          columns={renderedColumns.map(column => ({ key: column.key, width: columnLayout.widths[column.key] ?? defaultTrackerColumnWidth(column), style: { ...reportHeaderAppearance(sharedColumns[column.key], columnLayout.colors[column.key]), ...(columnLayout.pins[column.key] ? { position: "sticky", backgroundColor: reportColumnAppearance(sharedColumns[column.key], undefined, columnLayout.colors[column.key]).backgroundColor ?? "white", left: columnLayout.pins[column.key] === "left" ? pinOffsets.left[column.key] : undefined, right: columnLayout.pins[column.key] === "right" ? pinOffsets.right[column.key] : undefined, zIndex: 20 } : {}) } }))} /></tbody>
      </table>
      <SpreadsheetHiddenColumns sheet={"transmittal"} columns={hiddenColumns.map(column=>({...column,title:headerFormatting.title(column.key,column.title)}))} onRestore={restoreColumn} onRestoreAll={() => saveColumnLayout({ ...columnLayout, hidden: [] })} />
    </div>
    {cellMenu&&<SpreadsheetCellContextMenu x={cellMenu.x} y={cellMenu.y} count={selectedFormatCellKeys.size} canFormat={sharedDesign.canEdit} format={{bold:selectionIsBold,italic:selectedFormats.length>0&&selectedFormats.every(format=>format.italic),color:selectedTextColor,backgroundColor:selectedBackgroundColor}} onApply={applyCellFormat} onSelectRow={()=>selectTrackerRow(cellMenu.row)} onSelectColumn={()=>{headerFormatting.clear();setSelectedRows(new Set());setFormatSelection({mode:"column",keys:[cellMenu.column]});}} onClose={()=>setCellMenu(null)}/>}
    {TRACKER_PAGINATION_ENABLED&&data?.pagination&&<SpreadsheetFooter label="Tracker loading" total={data.pagination.total} page={1} totalPages={1}><span role="status">{loadingMore?"Loading more rows...":`${filteredRows.length} rows loaded`}</span></SpreadsheetFooter>}
    </div>
    {rowEdit && rowEdit.profileId === (profile?.id ?? null) && <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 al-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !rowEditBusy) closeRowEditor(); }}><section onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeRowEditor(); } }} role="dialog" aria-modal="true" aria-labelledby="tracker-row-edit-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="tracker-row-edit-title" className="text-lg font-semibold text-[#0b2341]">Edit Transmittal Tracker row</h2><p className="mt-1 text-xs text-slate-500">Delivery stop {rowEdit.stopId}. Changes save to this stop only.</p></div><button type="button" disabled={rowEditBusy} onClick={closeRowEditor} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">Close</button></div><EditStepNavigation steps={["Delivery details", "Shipping / Supporting details"]} current={rowEditStep} onChange={setRowEditStep} busy={rowEditBusy} /><div className="mt-4 grid gap-3 sm:grid-cols-2">{TRACKER_COLUMNS.filter(column=>column.editor!=="readonly").filter((_, index) => rowEditStep === 0 ? index < 7 : index >= 7).map((column) => {
      const value = rowEdit.values[column.field] ?? "";
      return <label key={column.field} className="text-xs font-semibold text-slate-600">{column.title}{column.editor === "dropdown" ? <select value={value} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, values: { ...current.values, [column.field]: event.target.value } } : current)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800"><option value="">—</option>{[...dropdownChoices, ...(value && !dropdownChoices.some((option) => option.value === value) ? [{ value, label: value }] : [])].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : column.editor === "text" && column.field === "tracker_remarks" ? <textarea rows={3} value={value} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, values: { ...current.values, [column.field]: event.target.value } } : current)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" /> : <input type={column.editor === "date" ? "date" : "text"} value={column.editor === "date" ? value.slice(0, 10) : value} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, values: { ...current.values, [column.field]: event.target.value } } : current)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-800" />}</label>;
    })}</div>{rowEditError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{rowEditError}</p>}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={rowEditBusy || rowEditStep === 0} onClick={() => setRowEditStep(0)} className="rounded-full border px-4 py-2 text-sm disabled:opacity-40">Previous</button><button type="button" disabled={rowEditBusy || rowEditStep === 1} onClick={() => setRowEditStep(1)} className="rounded-full border px-4 py-2 text-sm disabled:opacity-40">Next</button><button type="button" disabled={rowEditBusy} onClick={closeRowEditor} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">Cancel</button><button type="button" disabled={rowEditBusy} onClick={() => void saveSelectedTrackerRow()} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] disabled:opacity-50">{rowEditBusy ? "Saving…" : "Save changes"}</button></div><p className="mt-3 text-[11px] text-slate-500">Each changed field uses the tracker’s existing version check. If a later field fails, earlier fields may already be saved.</p></section></div>}
    {menuColumn && <ReportColumnActionsMenu
      title={menuColumn.title}
      position={menuPosition}
      onClose={() => setMenuColumn(null)} onRename={() => headerFormatting.startRename(menuColumn.key, menuColumn.title)} onRestoreTitle={() => headerFormatting.restoreTitle(menuColumn.key)} onConfigureInput={() => menuColumn.field==="tracker_status" ? setManageOptionsOpen(true) : headerFormatting.configure(menuColumn.key, menuColumn.title)}
      sortActions={[
        { label: "Sort ascending", active: sort?.key === menuColumn.key && sort.direction === "asc", onClick: () => setSort({ key: menuColumn.key, direction: "asc" }) },
        { label: "Sort descending", active: sort?.key === menuColumn.key && sort.direction === "desc", onClick: () => setSort({ key: menuColumn.key, direction: "desc" }) },
      ]}
      pinned={Boolean(columnLayout.pins[menuColumn.key])}
      onTogglePin={() => togglePin(menuColumn.key)}
      onEditColumn={() => setEditingColumnColor(menuColumn.key)}
      onFilter={() => setColumnFilter({ key: menuColumn.key, value: "" })}
      canManageOptions={menuColumn.field === "tracker_status" && canManageDropdowns}
      onManageOptions={() => setManageOptionsOpen(true)}
      onHide={() => hideColumn(menuColumn.key)} />}
    {editingColumnColor && <ReportColumnColorDialog
      columnName={TRACKER_COLUMNS.find((column) => column.key === editingColumnColor)?.title ?? "this column"}
      color={columnLayout.colors[editingColumnColor] ?? ""}
      onChange={(color) => setColumnLayout((current) => ({ ...current, colors: { ...current.colors, [editingColumnColor]: color } }))}
      onReset={() => setColumnLayout((current) => { const colors = { ...current.colors }; delete colors[editingColumnColor]; return { ...current, colors }; })}
      onClose={() => setEditingColumnColor(null)} />}
    {manageOptionsOpen && accessToken && canManageDropdowns && <ReportDropdownOptionsDialog
      key="delivery_status"
      token={accessToken}
      field="delivery_status"
      options={dropdownOptions}
      onClose={() => setManageOptionsOpen(false)}
      onOptionsUpdated={(options) => { setDropdownOptions(options); setDropdownOptionsError(""); setNotice("Delivery status options updated."); }} />}
    {prepareDialogOpen && createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-5 al-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !preparingSheet) setPrepareDialogOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="prepare-transmittal-title" className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-5 shadow-[0_30px_90px_-24px_rgba(11,35,65,0.5)]">
        <div className="flex items-start justify-between gap-3"><div><h2 id="prepare-transmittal-title" className="text-base font-semibold text-[#17365d]">Prepare Transmittal Sheet</h2><p className="mt-1 text-sm text-slate-500">Choose the reference whose delivery stops should appear on the sheet.</p></div><button type="button" title="Close preparation dialog" aria-label="Close preparation dialog" disabled={preparingSheet} onClick={() => setPrepareDialogOpen(false)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div>
        {TRACKER_PAGINATION_ENABLED && <div className="mt-4 space-y-2"><label className="block text-xs font-semibold text-slate-700">Find a Transmittal Reference<input aria-label="Search all Transmittal References" value={referenceSearch} onChange={event=>{setReferenceSearch(event.target.value);setReferencePage(1);setReferenceLoading(false);setReferenceLookup(current=>({...current,error:""}));}} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" placeholder="Search saved references across all pages" /></label>{referenceLoading&&<p role="status" className="text-xs text-slate-500">Finding references...</p>}{referenceLookup.error&&<p role="alert" className="text-xs text-rose-700">{referenceLookup.error}</p>}{referenceLookup.token===accessToken&&referenceLookup.query===referenceSearch&&referencePage<referenceLookup.pages&&<button type="button" disabled={referenceLoading} onClick={()=>setReferencePage(page=>page+1)} className="text-xs font-semibold text-blue-700 underline">Load more matching references</button>}</div>}
        {references.length === 0 ? <p role="status" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">No transmittal references available.</p> : <label className="mt-4 block text-xs font-semibold text-slate-700">Transmittal Ref#<select value={selectedReference} onChange={(event) => { setSelectedReference(event.target.value); setExportError(""); }} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-blue-400"><option value="">Select a reference</option>{references.map((reference) => <option key={reference} value={reference}>{reference}</option>)}</select></label>}
        {exportError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{exportError}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={preparingSheet} onClick={() => setPrepareDialogOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="button" disabled={preparingSheet || references.length === 0 || !selectedReference || !references.includes(selectedReference)} onClick={() => void openSheetAfterSave()} className="inline-flex items-center gap-2 rounded-lg bg-[#12365a] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{preparingSheet && <LoaderCircle className="h-4 w-4 animate-spin" />}{preparingSheet ? "Preparing…" : "Prepare sheet"}</button></div>
      </section>
    </div>, document.body)}
    {sheetOpen && createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-5 print:static print:block print:bg-white print:p-0 print:backdrop-blur-none al-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheetOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="transmittal-sheet-title" className="max-h-[94vh] w-full max-w-[min(96vw,1400px)] overflow-auto rounded-2xl bg-white shadow-[0_30px_90px_-24px_rgba(11,35,65,0.5)] ring-1 ring-white/70 print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:bg-transparent print:shadow-none print:ring-0">
        <div className="transmittal-sheet-controls print:hidden border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-600">{selectedReference} · {sheetRows.length} delivery row{sheetRows.length === 1 ? "" : "s"}</p><div className="flex items-center gap-2"><button type="button" onClick={() => window.print()} title="Print Transmittal Sheet" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"><Printer className="h-4 w-4" />Print</button><button type="button" onClick={() => setSheetOpen(false)} title="Close sheet preview" aria-label="Close sheet preview" className="rounded p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium text-slate-600">Preparation date<input type="date" value={preparation.date} onChange={(event) => setPreparation((value) => ({ ...value, date: event.target.value }))} className="mt-1 block h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800" /></label><label className="text-xs font-medium text-slate-600">Prepared by<input value={preparation.preparedBy} onChange={(event) => setPreparation((value) => ({ ...value, preparedBy: event.target.value }))} className="mt-1 block h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800" /></label><label className="text-xs font-medium text-slate-600">Checked by (optional)<input value={preparation.checkedBy} onChange={(event) => setPreparation((value) => ({ ...value, checkedBy: event.target.value }))} className="mt-1 block h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800" /></label></div>
        </div>
        <article id="transmittal-sheet-document" style={{ page: "transmittal-sheet" }} className="mx-auto max-w-[11in] bg-white px-8 py-7 text-slate-900 print:max-w-none print:px-3 print:py-2">
          <header className="border-b-2 border-[#17365d] pb-5">
            <img src={companyLogo} alt="Alzhen Trucking Services" className="mx-auto h-28 w-28 object-contain" />
            <h2 id="transmittal-sheet-title" className="mt-2 text-center text-2xl font-bold tracking-wide text-[#17365d]">TRANSMITTAL SHEET</h2>
            <dl className="mt-5 grid max-w-xl grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="font-semibold text-slate-700">Date:</dt><dd>{formatSheetDate(preparation.date)}</dd>
              <dt className="font-semibold text-slate-700">Prepared by:</dt><dd>{preparation.preparedBy}</dd>
              {preparation.checkedBy && <><dt className="font-semibold text-slate-700">Checked by:</dt><dd>{preparation.checkedBy}</dd></>}
              <dt className="font-semibold text-slate-700">Transmittal Ref#:</dt><dd>{selectedReference}</dd>
            </dl>
          </header>
          <div className="transmittal-print-table-wrap mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-xs">
              <colgroup>{["10%", "10%", "8%", "12%", "9%", "13%", "9%", "13%", "10%"].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
              <thead><tr>{["Loading Date", "Date Delivered", "WH CODE", "Delivered to", "Plate #", "Delivery Receipt No.", "S.O. No.", "Transmittal Ref#", "Transmittal Date"].map((header) => <th key={header} className="border border-[#17365d] bg-[#17365d] px-2.5 py-3 text-center align-middle text-[11px] font-bold leading-snug text-white whitespace-normal break-words">{header}</th>)}</tr></thead>
              <tbody>{sheetRows.map((row) => {
                const displayFields: (keyof TransmittalTrackerRow | null)[] = [null, null, "warehouse_code", "delivered_to", "plate_number", "delivery_receipt_no", "sales_order_no", "transmittal_ref", "date_created"];
                const cells = [
                  <td key="loading" className="border border-slate-300 px-1.5 py-2 align-middle">{renderSheetEditor(row, "loading_date_override")}</td>,
                  <td key="delivered" className="border border-slate-300 px-1.5 py-2 align-middle">{renderSheetEditor(row, "delivery_date_override")}</td>,
                  ...([row.warehouse_code, row.delivered_to, row.plate_number, row.delivery_receipt_no, row.sales_order_no, selectedReference, row.date_created] as const).map((value, index) => {
                    const field = displayFields[index + 2];
                    const format = field ? (cellFormats[reportCellFormatKey(trackerRowKey(row), field)]??cellFormats[reportCellFormatKey(row.trip_stop_id,field)]) : undefined;
                    return <td key={field ?? index} style={{ ...(format?.bold ? { fontWeight: 700 } : {}), ...(format?.color ? { color: format.color } : {}), ...(format?.backgroundColor ? { backgroundColor: format.backgroundColor } : {}) }} className="border border-slate-300 px-2.5 py-2 align-middle whitespace-normal break-words">{value}</td>;
                  }),
                ];
                return <tr key={trackerRowKey(row)} className="break-inside-avoid">{cells}</tr>;
              })}</tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end print:hidden"><button onClick={() => void exportSheet()} disabled={sheetRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#0b2343] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17385f] disabled:opacity-50"><Download className="h-4 w-4" />Export Transmittal Sheet</button></div>
          {exportError && <p role="alert" className="mt-3 text-sm text-red-700 print:hidden">{exportError}</p>}
        </article>
      </div>
    </div>, document.body)}
  </section>;
}
