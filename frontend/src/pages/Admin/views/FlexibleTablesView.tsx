import {invalidateApiCache} from "../../../services/api.service";
import {useSpreadsheetInfiniteScroll} from "../../../components/admin/useSpreadsheetInfiniteScroll";
import {useRegisterTopbarSearch} from "../../../components/admin/topbarSearch";
import {useRegisterTopbarAction} from "../../../components/admin/topbarActions";
import VirtualSpreadsheetRows from "../../../components/admin/VirtualSpreadsheetRows";
import {appendSpreadsheetRows} from "../../../services/spreadsheet-pages";
import {useSharedTableDesign} from "../../../components/admin/useSharedTableDesign";
import { dropdownStoredValue } from "../../../services/dropdown-option.service";
import { FlexibleColumnConfiguration } from "../../../components/admin/FlexibleColumnConfiguration";
import ReportDropdownEditor from "../../../components/admin/ReportDropdownEditor";
import { ReportColumnActionsMenu } from "../../../components/admin/ReportSpreadsheetShared";
import { SpreadsheetFormulaBar } from "../../../components/admin/SpreadsheetFormulaBar";
import { bindFormula, columnLetters, formulaCellValue, createFormulaEvaluator, FormulaError, shiftBoundFormula, formulaDraftReferenceAddresses } from "../../../services/spreadsheet-formula";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useSpreadsheetHeaderFormatting } from "../../../components/admin/useSpreadsheetHeaderFormatting";
import { reportHeaderAppearance } from "../../../components/admin/ReportSpreadsheetUtils";
import type { HeaderDesign } from "../../../services/shared-table-design";
import { reportColumnAppearance, reorderColumnKeys } from "../../../components/admin/ReportSpreadsheetUtils";
import { useSpreadsheetRowHeights } from "../../../components/admin/useSpreadsheetRowHeights";
import { SPREADSHEET_NUMBER_GUTTER_WIDTH, SpreadsheetRowNumber, SpreadsheetBlankRows, useSpreadsheetViewport, useSpreadsheetFeedback } from "../../../components/admin/SpreadsheetPresentation";
import type { ReportCellFormat } from "../../../components/admin/ReportSpreadsheetUtils";
import {flexColumnAppearance,patchFlexColumnAppearance} from "../../../services/flex-column-appearance";
import { ReportCellFormattingToolbar, ReportColumnColorDialog } from "../../../components/admin/ReportSpreadsheetShared";
import { TableSkeleton, SkeletonBlock } from "../../../components/admin/TablePrimitives";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useManagementTableColumns } from "../../../components/admin/useManagementTableColumns";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import { useDeferredRealtimeRefresh } from "../../../components/admin/useDeferredRealtimeRefresh";
import { Pencil, Palette, ArrowLeft, ArrowDown, ArrowUp, Archive, Columns3, Eye, EyeOff, Plus, Settings2, Table2, Trash2, Users, X } from "lucide-react";
import {
  archiveFlexColumn,
  archiveFlexibleTable,
  archiveFlexRow,
  createFlexColumn,
  createFlexibleTable,
  createFlexOption,
  createFlexPermission,
  createFlexRow,
  deleteFlexPermission,
  getFlexOptions,
  getFlexPermissions,
  getFlexibleTable,
  listFlexibleTables,
  listFlexProfiles,
  renameFlexibleTable,
  reorderFlexRow,
  saveFlexCell,
  saveFlexFormulaBatch,
  updateFlexColumn,
  updateFlexOption,
  updateFlexPermission,
  type FlexCell,
  type FlexColumn,
  type FlexInputMode,
  type FlexOption,
  type FlexPermission,
  type FlexProfile,
  type FlexRow,
  type FlexTable,
  type FlexTableData,
  type FlexValueType,
} from "../../../services/flexible-table.service";

const VALUE_TYPES: FlexValueType[] = ["TEXT", "NUMBER", "DATE", "DATETIME", "BOOLEAN"];
const INPUT_MODES: FlexInputMode[] = ["TEXT", "DROPDOWN", "NUMBER", "DATE", "DATETIME", "BOOLEAN"];
const panel = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/10";
const buttonClass = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

type Props = { accessToken: string | null; role: string; embeddedTableId?: string; onExit?: () => void; searchScope?: string; searchValue?: string; onSearchChange?: (value: string) => void };

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function cellFor(row: FlexRow, columnId: string) {
  return row.cells.find((cell) => cell.column_id === columnId);
}

function cellInputValue(value: unknown) {
  return value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function FlexibleTablesView({ accessToken, role, embeddedTableId, onExit, searchScope, searchValue, onSearchChange }: Props) {
  const [tables, setTables] = useState<FlexTable[]>([]);
  const [tableData, setTableData] = useState<FlexTableData | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formatSaving, setFormatSaving] = useState(false);
  const formatSavingRef = useRef(false);
  const [resizing,setResizing]=useState(false);
  const [configurationColumn,setConfigurationColumn]=useState<string|null>(null);
  const [flexColumnMenu,setFlexColumnMenu]=useState<{key:string;left:number;top:number}|null>(null);
  const [appearanceColumn,setAppearanceColumn]=useState<string|null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const search = searchValue ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;
  const [serverSearch,setServerSearch]=useState("");
  const [loadingMore,setLoadingMore]=useState(false);
  const pageWindow=useRef({key:"",page:0});
  const requestGeneration=useRef(0),moreFlight=useRef(false);
  const searchRef=useRef(serverSearch);searchRef.current=serverSearch;
  useEffect(()=>{const timer=window.setTimeout(()=>setServerSearch(search),250);return()=>window.clearTimeout(timer);},[search]);
  const [newName, setNewName] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [revealedColumns, setRevealedColumns] = useState<Record<string, string[]>>({});
  const formulaInput = useRef<HTMLInputElement|null>(null);
  const activeFormulaInput=useRef<HTMLInputElement|null>(null);
  const formulaPicking = useRef(false);
  const formulaCancelled = useRef(false);
  const cellSaveLock=useRef(false);
  const [referencePreview,setReferencePreview]=useState<{key:string;references:Record<string,{rowId:string;columnId:string}>}>({key:"",references:{}});
  const pickedFormulaRefs=useRef<{key:string;references:Record<string,{rowId:string;columnId:string}>}>({key:"",references:{}});
  const fillCleanup=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>{fillCleanup.current?.();},[accessToken,selectedTableId]);
  const [fillPreview,setFillPreview]=useState<{columnId:string;from:number;to:number}|null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useRegisterTopbarSearch(searchScope??"flexible-tables",tableData?{kind:"field",value:search,placeholder:`Search ${tableData.table.name.toLowerCase()}...`,label:`Search ${tableData.table.name}`,disabled:saving||Object.keys(drafts).length>0,onChange:setSearch}:null);
  const [columnEditor, setColumnEditor] = useState<FlexColumn | "new" | null>(null);
  const [columnForm, setColumnForm] = useState({ name: "", value_type: "TEXT" as FlexValueType, input_mode: "TEXT" as FlexInputMode });
  const [optionsColumn, setOptionsColumn] = useState<FlexColumn | null>(null);
  const [allOptions, setAllOptions] = useState<FlexOption[]>([]);
  const [optionForm, setOptionForm] = useState({ label: "", stored_value: "", color: "#2678b9" });
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissions, setPermissions] = useState<FlexPermission[]>([]);
  const [profiles, setProfiles] = useState<FlexProfile[]>([]);
  const [permissionSubject, setPermissionSubject] = useState("ROLE:STAFF");
  const [permissionFlags, setPermissionFlags] = useState({ can_view: true, can_edit: false, can_manage: false });

  const loadTables = useCallback(async (quiet = false) => {
    if (!accessToken) return;
    if (!quiet) setLoading(true);
    setError("");
    try { setTables(await listFlexibleTables(accessToken)); }
    catch (cause) { setError(messageOf(cause, "Unable to load flexible tables.")); }
    finally { if (!quiet) setLoading(false); }
  }, [accessToken]);

  const loadTable = useCallback(async (id:string,quiet=false)=>{
    if(!accessToken)return;const version=++requestGeneration.current,key=JSON.stringify([accessToken,id,searchRef.current]);
    if(!quiet)setLoading(true);else invalidateApiCache(`/flexible-tables/${id}`);setError("");
    try{let result=await getFlexibleTable(accessToken,id,{search:searchRef.current});const target=pageWindow.current.key===key?pageWindow.current.page:1;
      for(let page=2;page<=Math.min(target,result.pagination?.totalPages??1);page++){const next=await getFlexibleTable(accessToken,id,{search:searchRef.current,page});result={...next,rows:appendSpreadsheetRows(result.rows,next.rows,row=>row.id),formula_sources:appendSpreadsheetRows(result.formula_sources??[],next.formula_sources??[],row=>row.id)};}
      if(version!==requestGeneration.current)return;pageWindow.current={key,page:Math.max(1,Math.min(target,result.pagination?.totalPages??1))};setTableData(result);setSelectedTableId(id);
    }catch(cause){if(version===requestGeneration.current){setError(messageOf(cause,"Unable to load this table."));if(!quiet)setTableData(null);}}
    finally{if(version===requestGeneration.current)setLoading(false);}
  },[accessToken]);
  useEffect(()=>{if(selectedTableId&&pageWindow.current.key!==JSON.stringify([accessToken,selectedTableId,serverSearch]))void loadTable(selectedTableId);},[serverSearch,selectedTableId,loadTable]);
  const realtimeGate = useDeferredRealtimeRefresh(async () => {
    if (selectedTableId) await loadTable(selectedTableId, true);
    await loadTables(true);
  }, Boolean(resizing || appearanceColumn || saving || formatSaving || configurationColumn || fillPreview || Object.keys(drafts).length || columnEditor || optionsColumn || permissionsOpen));
  useEffect(() => subscribeToAdminRealtime((event) => {
    const tables = event.kind === "batch" ? event.tables : event.kind === "change" ? [event.payload.table] : event.kind === "recovered" ? [event.table] : [];
    if (event.kind === "resume" || tables.some((table) => table.startsWith("flex_") || ["trips", "trip_stops", "trip_line_items", "trip_truck_assignments", "billings", "store_calls", "profiles"].includes(table))) realtimeGate.request();
  }), [realtimeGate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (embeddedTableId) void loadTable(embeddedTableId);
      else void loadTables();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [embeddedTableId, loadTable, loadTables]);

  const run = async (operation: () => Promise<unknown>, success: string, refresh = true) => {
    setSaving(true); setError(""); setNotice("");
    try {
      await operation();
      if (refresh && selectedTableId) await loadTable(selectedTableId, true);
      await loadTables();
      setNotice(success);
      return true;
    } catch (cause) {
      const text = messageOf(cause, "Unable to save changes.");
      setError(text);
      if (/changed since|created by another editor/i.test(text) && selectedTableId) await loadTable(selectedTableId, true);
      return false;
    } finally { setSaving(false); }
  };

  const createTable = async () => {
    const name = newName.trim();
    if (!name) { setError("Enter a table name."); return; }
    setSaving(true); setError("");
    try {
      const created = await createFlexibleTable(accessToken!, name);
      setNewName(""); setTables((current) => [created, ...current]);
      await loadTable(created.id, true); setNotice("Table created.");
    } catch (cause) { setError(messageOf(cause, "Unable to create table.")); }
    finally { setSaving(false); }
  };

  const archiveTable = async () => {
    if (!tableData || !window.confirm(`Archive “${tableData.table.name}”? It will no longer appear in the table list.`)) return;
    const ok = await run(() => archiveFlexibleTable(accessToken!, tableData.table.id, tableData.table.version), "Table archived.", false);
    if (ok) { setTableData(null); setSelectedTableId(null); onExit?.(); }
  };

  const renameTable = async () => {
    if (!tableData) return;
    const name = window.prompt("Table name", tableData.table.name)?.trim();
    if (!name || name === tableData.table.name) return;
    await run(() => renameFlexibleTable(accessToken!, tableData.table.id, name, tableData.table.version), "Table renamed.");
  };

  const columnOrderSaving = useRef(false);
  const [draggedFlexColumn, setDraggedFlexColumn] = useState<string | null>(null);
  const visibleColumns = useMemo(() => [...(tableData?.columns ?? [])].sort((a,b)=>a.position-b.position).filter((column) => showHidden || !column.is_hidden || (revealedColumns[tableData?.table.id ?? ""] ?? []).includes(column.id)), [tableData, showHidden, revealedColumns]);
  const layoutColumns = useMemo(() => [...(tableData?.columns ?? [])].sort((a,b)=>a.position-b.position).map((column) => ({ key: column.id, title: column.name, width: 220 })), [tableData]);
  const { attachViewport, viewportProps, tableStyle, controls: columnControls, hiddenControl, colgroup, headerProps, headerControls, columnWidth } = useManagementTableColumns({ table: `flex:${tableData?.table.id ?? "none"}`, token: accessToken, columns: layoutColumns, enabled: Boolean(tableData) && ["ADMIN", "STAFF"].includes(role), leadingColumns: 1, leadingWidth: SPREADSHEET_NUMBER_GUTTER_WIDTH, trailingWidth: tableData?.access.canEdit ? 88 : 0, omitsHiddenCells: true, supportsDesign: false, onResizeChange:setResizing, paused: Boolean(saving || Object.keys(drafts).length || columnEditor || appearanceColumn),
    hiddenKeys: (tableData?.columns ?? []).filter((column) => !visibleColumns.some((visible) => visible.id === column.id)).map((column) => column.id),
    onReveal: (key) => { if (tableData) setRevealedColumns((current) => ({ ...current, [tableData.table.id]: [...(current[tableData.table.id] ?? []), key] })); }, onRestoreAll: () => setShowHidden(true) });
  const flexStyle=(column:FlexColumn,header=false,cellFormat?:ReportCellFormat):CSSProperties=>{
    const appearance=flexColumnAppearance(column.settings??{}),pin=appearance.pin;
    const peers=visibleColumns.filter(c=>flexColumnAppearance(c.settings??{}).pin===pin),index=peers.findIndex(c=>c.id===column.id);
    const offset=pin==="left"?SPREADSHEET_NUMBER_GUTTER_WIDTH+peers.slice(0,index).reduce((n,c)=>n+columnWidth(c.id),0):peers.slice(index+1).reduce((n,c)=>n+columnWidth(c.id),tableData?.access.canEdit?88:0);
    return {width:columnWidth(column.id),position:pin?"sticky":header?"relative":undefined,...(pin?{[pin]:offset,zIndex:header?25:10}:{}),backgroundColor:pin?header?"#f8fafc":"#ffffff":undefined,...(header ? reportHeaderAppearance({color:appearance.color,format:appearance.format,header:appearance.header}) : reportColumnAppearance({color:appearance.color,format:appearance.format},cellFormat))};
  };
  const saveAppearance=async(column:FlexColumn,patch:{color?:string|null;pin?:"left"|"right"|null;alias?:string|null})=>{
    if(!tableData?.access.canManage||saving)return;
    setSaving(true);setError("");
    try{const updated=await updateFlexColumn(accessToken!,tableData.table.id,column.id,{settings:patchFlexColumnAppearance(column.settings??{},patch),expected_version:column.version});setTableData(current=>current?{...current,columns:current.columns.map(c=>c.id===updated.id?updated:c)}:current);}
    catch(error){setError(messageOf(error,"Column appearance could not be saved. Your current data is preserved; refresh before retrying."));}
    finally{setSaving(false);}
  };
  const formulaRows=useMemo(()=>appendSpreadsheetRows(tableData?.rows??[],tableData?.formula_sources??[],row=>row.id),[tableData?.rows,tableData?.formula_sources]);
  const evaluateSnapshot=useMemo(()=>createFormulaEvaluator(formulaRows,tableData?.columns),[formulaRows,tableData?.columns]);
  const filteredRows=tableData?.rows??[];

  const sharedRowDesign=useSharedTableDesign(`flex:${tableData?.table.id??"none"}`,accessToken,Boolean(tableData));
  const rowHeights = useSpreadsheetRowHeights(`${accessToken ?? "guest"}:flex:${tableData?.table.id ?? "none"}`, {...sharedRowDesign,canEdit:sharedRowDesign.canEdit&&Boolean(tableData?.access.canEdit)});
  const spreadsheetViewport = useRef<HTMLDivElement | null>(null);
  const [formatSelection, setFormatSelection] = useState<{ tableId: string; rowId: string; columnId: string } | null>(null);
  const formatColumn = tableData?.columns.find(column => column.id === formatSelection?.columnId && tableData.table.id === formatSelection.tableId);
  const savedFormats = (formatColumn?.settings.cell_formats ?? {}) as Record<string, ReportCellFormat>;
  const selectedFormat = formatSelection ? savedFormats[formatSelection.rowId] ?? {} : {};
  const applyCellFormat = async (patch: Partial<ReportCellFormat>) => {
    if (!tableData?.access.canManage || !formatColumn || !formatSelection || saving || formatSavingRef.current) return;
    const tableId = tableData.table.id;
    const original = formatColumn;
    const optimistic = { ...original, settings: { ...original.settings, cell_formats: { ...savedFormats, [formatSelection.rowId]: { ...selectedFormat, ...patch } } } };
    formatSavingRef.current = true;
    setFormatSaving(true);
    setError("");
    // Update only the design metadata, without disabling or replacing the value editor.
    setTableData(current => current?.table.id === tableId ? { ...current, columns: current.columns.map(column => column.id === original.id ? optimistic : column) } : current);
    try {
      const updated = await updateFlexColumn(accessToken!, tableId, original.id, { settings: optimistic.settings, expected_version: original.version });
      setTableData(current => current?.table.id === tableId ? { ...current, columns: current.columns.map(column => column === optimistic ? updated : column) } : current);
    } catch (cause) {
      setTableData(current => current?.table.id === tableId ? { ...current, columns: current.columns.map(column => column === optimistic ? original : column) } : current);
      setError(messageOf(cause, "Unable to save cell formatting."));
    } finally { formatSavingRef.current = false; setFormatSaving(false); }
  };
  const saveHeaderColors = async (key: string, header: HeaderDesign) => {
    if (!tableData?.access.canManage || saving || formatSavingRef.current) return;
    const original = tableData.columns.find(column => column.id === key);
    if (!original) return;
    const tableId = tableData.table.id;
    const optimistic = { ...original, settings: patchFlexColumnAppearance(original.settings, { header: { ...flexColumnAppearance(original.settings).header, ...header } }) };
    formatSavingRef.current = true; setFormatSaving(true); setError("");
    setTableData(current => current?.table.id === tableId ? { ...current, columns: current.columns.map(column => column.id === key ? optimistic : column) } : current);
    try {
      const updated = await updateFlexColumn(accessToken!, tableId, key, { settings: optimistic.settings, expected_version: original.version });
      setTableData(current => current?.table.id === tableId ? { ...current, columns: current.columns.map(column => column === optimistic ? updated : column) } : current);
    } catch (cause) {
      setTableData(current => current?.table.id === tableId ? { ...current, columns: current.columns.map(column => column === optimistic ? original : column) } : current);
      setError(messageOf(cause, "Unable to save header colors."));
    } finally { formatSavingRef.current = false; setFormatSaving(false); }
  };
  const headerFormatting = useSpreadsheetHeaderFormatting(`flex:${tableData?.table.id ?? "none"}`, Boolean(tableData?.access.canManage), Object.fromEntries((tableData?.columns ?? []).map(column => [column.id, { header: flexColumnAppearance(column.settings).header, alias:flexColumnAppearance(column.settings).alias, pin:flexColumnAppearance(column.settings).pin as "left"|"right"|null|undefined, format:flexColumnAppearance(column.settings).format }])), (key, header) => { void saveHeaderColors(key, header); }, (key,alias)=>{const column=tableData?.columns.find(column=>column.id===key);if(column)void saveAppearance(column,{alias});});
  const spreadsheetPadding = useSpreadsheetViewport(spreadsheetViewport, filteredRows.length, Boolean(tableData));
  const virtualKeys=useMemo(()=>filteredRows.map(row=>row.id),[filteredRows]);

  const scope=JSON.stringify([accessToken,selectedTableId,serverSearch]);
  const loadMore=async()=>{
    if(!accessToken||!tableData||moreFlight.current||loading||saving||Object.keys(drafts).length||pageWindow.current.key!==scope||pageWindow.current.page>=(tableData.pagination?.totalPages??1))return;
    const generation=requestGeneration.current,page=pageWindow.current.page+1;moreFlight.current=true;setLoadingMore(true);setError("");
    try{const next=await getFlexibleTable(accessToken,tableData.table.id,{page,search:serverSearch});if(generation!==requestGeneration.current||pageWindow.current.key!==scope)return;setTableData(current=>current?{...next,rows:appendSpreadsheetRows(current.rows,next.rows,row=>row.id),formula_sources:appendSpreadsheetRows(current.formula_sources??[],next.formula_sources??[],row=>row.id)}:current);pageWindow.current.page=page;}
    catch(cause){setError(messageOf(cause,"Unable to load more rows."));}finally{moreFlight.current=false;setLoadingMore(false);}
  };
  useSpreadsheetInfiniteScroll(spreadsheetViewport,{enabled:Boolean(tableData),hasMore:pageWindow.current.key===scope&&pageWindow.current.page<(tableData?.pagination?.totalPages??1),loading:loading||loadingMore,blocked:Boolean(error)||saving||Object.keys(drafts).length>0,queryKey:scope,revision:filteredRows.length,onLoadMore:loadMore});

  useSpreadsheetFeedback(notice);
  useSpreadsheetFeedback(error, "error");

  const saveCellValue = async (row: FlexRow, column: FlexColumn, raw: string, existing?: FlexCell) => {
    if(cellSaveLock.current)return;
    const isFormula=raw.startsWith("=");
    if(isFormula&&(!["TEXT","NUMBER"].includes(column.input_mode)||row.row_kind!=="CUSTOM")){setError("This cell accepts its normal value type only; formulas require a custom text or number cell.");return;}
    if(!isFormula&&column.input_mode==="DROPDOWN"){const option=tableData?.options.find(option=>option.column_id===column.id&&option.is_active&&(option.stored_value===raw||option.label===raw));if(!option){setError("Choose an active dropdown option.");return;}raw=option.stored_value;}
    if(!isFormula&&column.value_type==="BOOLEAN"){if(/^(true|yes)$/i.test(raw))raw="true";else if(/^(false|no)$/i.test(raw))raw="false";else {setError("Enter Yes or No for this cell.");return;}}

    let formula: ReturnType<typeof bindFormula> | null = null;
    try { formula=isFormula ? bindFormula(raw,tableData!.rows,[...tableData!.columns].sort((a,b)=>a.position-b.position)) : null; } catch(cause) { setError(cause instanceof Error ? `Invalid formula: ${cause.message}` : "Invalid formula."); return; }
    if(formula){
      // Unchanged references retain physical bindings after sorting/layout changes.
      // Explicit cell picks intentionally override a matching old address.
      for(const address of Object.keys(formula.references)){
        const picked=pickedFormulaRefs.current.key===`${row.id}:${column.id}`?pickedFormulaRefs.current.references[address]:undefined;
        formula.references[address]=picked??existing?.formula?.references[address]??formula.references[address];
      }
    }
    if(formula && (row.row_kind!=="CUSTOM" || !["TEXT","NUMBER"].includes(column.input_mode))) { setError("Formulas are only available in custom text or number cells."); return; }
    let value: unknown = formula ? null : raw;
    if (!formula && column.value_type === "NUMBER") value = raw === "" ? null : Number(raw);
    if (!formula && column.value_type === "BOOLEAN") value = raw === "true";
    if (raw === "" && column.value_type !== "BOOLEAN") value = null;
    const key = `${row.id}:${column.id}`;
    if (formula ? existing?.formula?.expression===raw && JSON.stringify(existing.formula.references)===JSON.stringify(formula.references) : !existing?.formula && (value === existing?.value || value === null && existing?.value === null)) {
      setDrafts(current=>{const next={...current};delete next[key];return next;}); return;
    }
    if(formula) {
      const preview=tableData!.rows.map(item=>item.id!==row.id?item:{...item,cells:[...item.cells.filter(c=>c.column_id!==column.id),{id:existing?.id??"draft",column_id:column.id,value:null,formula}]});
      try { formulaCellValue(preview,row.id,column.id); } catch(cause) { setError(cause instanceof FormulaError && cause.code==="#CYCLE!" ? "Circular formula references are not allowed." : cause instanceof FormulaError ? `Invalid formula: ${cause.code}` : "Unable to validate the formula."); return; }
    }
    cellSaveLock.current=true;
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await saveFlexCell(accessToken!, tableData!.table.id, row.id, column.id, value, existing?.version ?? 0, formula);
      setTableData((current) => current ? {
        ...current,
        rows: current.rows.map((item) => item.id !== row.id ? item : {
          ...item,
          cells: existing
            ? item.cells.map((cell) => cell.id === existing.id ? saved : cell)
            : [...item.cells, saved],
        }),
      } : current);
      setNotice("");
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
    } catch (cause) {
      const text = messageOf(cause, "Unable to save cell."); setError(text);
      if (/changed since|created by another editor/i.test(text) && selectedTableId) await loadTable(selectedTableId, true);
    } finally {
      cellSaveLock.current=false;setSaving(false);
    }
  };

  const selectedFormulaRow=tableData?.rows.find(row=>row.id===formatSelection?.rowId);
  const selectedFormulaColumn=tableData?.columns.find(column=>column.id===formatSelection?.columnId);
  const selectedFormulaCell=selectedFormulaRow?.cells.find(cell=>cell.column_id===selectedFormulaColumn?.id);
  const selectedFormulaKey=selectedFormulaRow&&selectedFormulaColumn?`${selectedFormulaRow.id}:${selectedFormulaColumn.id}`:"";
  const formulaBarValue=drafts[selectedFormulaKey] ?? selectedFormulaCell?.formula?.expression ?? cellInputValue(selectedFormulaCell?.value);
  const sourceValueEditable=Boolean(tableData?.access.canEdit&&selectedFormulaRow?.row_kind==="CUSTOM"&&selectedFormulaColumn?.binding_scope==="CUSTOM_ROW");
  const formulaEligible=Boolean(sourceValueEditable&&selectedFormulaRow?.row_kind==="CUSTOM"&&selectedFormulaColumn&&["TEXT","NUMBER"].includes(selectedFormulaColumn.input_mode));
  const formulaReferences=new Set<string>();
  if(formulaBarValue.startsWith("=")&&tableData){try{const refs={...selectedFormulaCell?.formula?.references,...(referencePreview.key===selectedFormulaKey?referencePreview.references:{})};for(const address of formulaDraftReferenceAddresses(formulaBarValue)){const ref=refs[address]??bindFormula(`=${address}`,tableData.rows,[...tableData.columns].sort((a,b)=>a.position-b.position)).references[address];if(ref)formulaReferences.add(`${ref.rowId}:${ref.columnId}`);}}catch{/* Incomplete formulas stay editable. */}}
  const readFormulaDisplay=(row:FlexRow,column:FlexColumn)=>{try{return cellInputValue(evaluateSnapshot(row.id,column.id));}catch(cause){return cause instanceof FormulaError?cause.code:"#ERROR!";}};
  const startFormulaFill=(event:ReactPointerEvent,row:FlexRow,column:FlexColumn,cell:FlexCell)=>{
    if(!cell.formula||!tableData?.access.canEdit)return;event.preventDefault();event.stopPropagation();
    const from=tableData.rows.findIndex(item=>item.id===row.id);let to=from;setFillPreview({columnId:column.id,from,to});
    const move=(event:PointerEvent)=>{const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("td[data-flex-row]");if(target?.dataset.flexColumn!==column.id)return;to=tableData.rows.findIndex(item=>item.id===target.dataset.flexRow);if(to>=0)setFillPreview({columnId:column.id,from,to});};
    const cleanup=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",finish);window.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",escape);fillCleanup.current=null;setFillPreview(null);};
    const cancel=()=>cleanup();const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();cancel();}};fillCleanup.current=cancel;
    const finish=()=>{cleanup();const targets=tableData.rows.slice(Math.min(from,to),Math.max(from,to)+1).filter(item=>item.id!==row.id);if(targets.length>50){setError("Fill at most 50 custom rows at a time.");return;}if(!targets.length)return;void (async()=>{setSaving(true);try{const axes=[...tableData.columns].sort((a,b)=>a.position-b.position).map(c=>({id:c.id}));const changes=targets.map(target=>{if(target.row_kind!=="CUSTOM")throw new Error("Fill is only available on custom rows.");const delta=tableData.rows.findIndex(item=>item.id===target.id)-from;return {row_id:target.id,column_id:column.id,formula:shiftBoundFormula(cell.formula!,delta,tableData.rows,axes),expected_version:cellFor(target,column.id)?.version??0};});const result=await saveFlexFormulaBatch(accessToken!,tableData.table.id,changes);setTableData(current=>current?{...current,rows:current.rows.map(item=>({...item,cells:[...item.cells.filter(c=>!result.saved.some(saved=>saved.row_id===item.id&&saved.column_id===c.column_id)),...result.saved.filter(saved=>saved.row_id===item.id)]}))}:current);if(result.failure)setError(`${result.saved.length} cells saved. ${result.failure.message}`);}catch(cause){setError(messageOf(cause,"Fill could not be confirmed. Refresh and review before retrying."));}finally{setSaving(false);}})();};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",finish,{once:true});window.addEventListener("pointercancel",cancel,{once:true});window.addEventListener("keydown",escape);
  };
  const openColumn = (column: FlexColumn | "new") => {
    setColumnEditor(column);
    setColumnForm(column === "new" ? { name: "", value_type: "TEXT", input_mode: "TEXT" } : { name: column.name, value_type: column.value_type, input_mode: column.input_mode });
  };

  const saveColumn = async () => {
    if (!tableData || !columnEditor) return;
    if (columnEditor === "new") {
      const ok = await run(() => createFlexColumn(accessToken!, tableData.table.id, { ...columnForm, binding_scope: "CUSTOM_ROW" }), "Column added.");
      if (ok) setColumnEditor(null);
      return;
    }
    const ok = await run(() => updateFlexColumn(accessToken!, tableData.table.id, columnEditor.id, { ...columnForm, binding_scope: columnEditor.binding_scope, expected_version: columnEditor.version }), "Column updated.");
    if (ok) setColumnEditor(null);
  };

  const toggleColumnHidden = (column: FlexColumn) => run(() => updateFlexColumn(accessToken!, tableData!.table.id, column.id, { is_hidden: !column.is_hidden, expected_version: column.version }), column.is_hidden ? "Column shown." : "Column hidden.");
  const reorderFlexibleColumn = async (sourceId: string, targetId: string, after = false) => {
    if (!tableData?.access.canManage || saving || columnOrderSaving.current) return;
    const table = tableData;
    const columns = [...table.columns].sort((a, b) => a.position - b.position);
    const keys = columns.map(column => column.id);
    if (!keys.includes(sourceId) || !keys.includes(targetId) || sourceId === targetId) return;
    const order = after ? keys.filter(key => key !== sourceId) : reorderColumnKeys(keys, sourceId, targetId);
    if (after) order.splice(order.indexOf(targetId) + 1, 0, sourceId);
    if (order.every((key, index) => key === columns[index]?.id)) return;
    if (new Set(columns.map(column => column.position)).size !== columns.length) { setError("Column positions need review before reordering. Nothing was changed."); return; }
    const byId = new Map(columns.map(column => [column.id, column]));
    const changes = order.map((key, index) => ({ column: byId.get(key)!, position: columns[index].position })).filter(change => change.column.position !== change.position);
    setSaving(true); setError(""); setNotice("");
    columnOrderSaving.current = true;
    setTableData(current => current?.table.id === table.table.id ? { ...current, columns: order.map((key, index) => ({ ...byId.get(key)!, position: columns[index].position })) } : current);
    try {
      for (const { column, position } of changes) {
        const updated = await updateFlexColumn(accessToken!, table.table.id, column.id, { position, expected_version: column.version });
        byId.set(column.id, updated);
      }
      setTableData(current => current?.table.id === table.table.id ? { ...current, columns: [...byId.values()].sort((a, b) => a.position - b.position) } : current);
      setNotice("Column order saved.");
    } catch { await loadTable(table.table.id, true); setError("Column order could not be fully saved. Review the reloaded layout before retrying."); }
    finally { columnOrderSaving.current = false; setSaving(false); }
  };
  const shiftColumn = (column: FlexColumn, delta: number) => {
    const index = visibleColumns.findIndex(item => item.id === column.id);
    const target = visibleColumns[index + delta];
    if (target) void reorderFlexibleColumn(column.id, target.id, delta > 0);
  };

  const openOptions = async (column: FlexColumn) => {
    setOptionsColumn(column); setError("");
    try { setAllOptions(await getFlexOptions(accessToken!, tableData!.table.id, column.id)); }
    catch (cause) { setError(messageOf(cause, "Unable to load dropdown options.")); }
  };

  const addOption = async () => {
    if (!optionsColumn) return;
    const ok = await run(async () => {
      const option = await createFlexOption(accessToken!, tableData!.table.id, optionsColumn.id, {...optionForm,stored_value:dropdownStoredValue(optionForm.label)});
      setAllOptions((items) => [...items, option].sort((a, b) => a.position - b.position));
    }, "Dropdown option added.");
    if (ok) setOptionForm({ label: "", stored_value: "", color: "#2678b9" });
  };

  const patchOption = async (option: FlexOption, patch: Partial<Pick<FlexOption, "is_active" | "position" | "label" | "stored_value" | "color">>) => {
    const updated = await updateFlexOption(accessToken!, tableData!.table.id, optionsColumn!.id, option.id, patch);
    setAllOptions((items) => items.map((item) => item.id === option.id ? updated : item));
    await loadTable(tableData!.table.id, true);
  };

  const openPermissions = async () => {
    setPermissionsOpen(true); setError("");
    try {
      const [items, users] = await Promise.all([getFlexPermissions(accessToken!, tableData!.table.id), listFlexProfiles(accessToken!)]);
      setPermissions(items); setProfiles(users);
    } catch (cause) { setError(messageOf(cause, "Unable to load table permissions.")); }
  };

  const addPermission = async () => {
    const [kind, value] = permissionSubject.split(":", 2);
    const input: Partial<FlexPermission> = kind === "PROFILE"
      ? { subject_type: "PROFILE", subject_profile_id: value, ...permissionFlags }
      : { subject_type: "ROLE", subject_role: "STAFF", ...permissionFlags };
    const ok = await run(async () => {
      const created = await createFlexPermission(accessToken!, tableData!.table.id, input);
      setPermissions((items) => [...items, created]);
    }, "Permission granted.");
    if (ok) setPermissionFlags({ can_view: true, can_edit: false, can_manage: false });
  };

  const patchPermission = async (permission: FlexPermission, patch: Pick<FlexPermission, "can_view" | "can_edit" | "can_manage">) => {
    try {
      const updated = await updateFlexPermission(accessToken!, tableData!.table.id, permission.id, patch);
      setPermissions((items) => items.map((item) => item.id === permission.id ? updated : item));
    } catch (cause) { setError(messageOf(cause, "Unable to update permission.")); }
  };

  const removePermission = async (permission: FlexPermission) => {
    if (!window.confirm("Remove this table permission?")) return;
    try { await deleteFlexPermission(accessToken!, tableData!.table.id, permission.id); setPermissions((items) => items.filter((item) => item.id !== permission.id)); }
    catch (cause) { setError(messageOf(cause, "Unable to remove permission.")); }
  };

  const moveRow = async (row: FlexRow, delta: number) => {
    const rows = [...(tableData?.rows ?? [])].sort((a, b) => a.position - b.position);
    const index = rows.findIndex((item) => item.id === row.id);
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const other = rows[target];
    setSaving(true); setError("");
    try {
      const first = await reorderFlexRow(accessToken!, tableData!.table.id, row.id, other.position, row.version);
      const second = await reorderFlexRow(accessToken!, tableData!.table.id, other.id, row.position, other.version);
      setTableData((current) => current ? { ...current, rows: current.rows.map((item) => item.id === first.id ? { ...item, ...first } : item.id === second.id ? { ...item, ...second } : item).sort((a, b) => a.position - b.position) } : current);
      setNotice("Row order saved.");
    } catch (cause) { setError(messageOf(cause, "Unable to reorder rows.")); await loadTable(tableData!.table.id, true); }
    finally { setSaving(false); }
  };

  const addRow = async () => {
    if (!tableData) return;
    const row = await createFlexRow(accessToken!, tableData.table.id).catch((cause) => { setError(messageOf(cause, "Unable to add row.")); return null; });
    if (row) { setTableData((current) => current ? { ...current, rows: [...current.rows, row] } : current); setNotice("Row added."); }
  };
  useRegisterTopbarAction(searchScope??"flexible-tables", "add", tableData ? { label: "Add row", priority: 10, disabled: !tableData.access.canEdit || saving, onClick: () => void addRow() } : null);

  const archiveRowAction = async (row: FlexRow) => {
    if (!window.confirm("Archive this custom row?")) return;
    try {
      await archiveFlexRow(accessToken!, tableData!.table.id, row.id, row.version);
      setTableData((current) => current ? { ...current, rows: current.rows.filter((item) => item.id !== row.id) } : current);
      setNotice("Row archived.");
    } catch (cause) { setError(messageOf(cause, "Unable to archive row.")); }
  };

  const archiveColumnAction = async (column: FlexColumn) => {
    if (!window.confirm(`Archive column “${column.name}”? Existing cell data will remain stored.`)) return;
    try { await archiveFlexColumn(accessToken!, tableData!.table.id, column.id, column.version); await loadTable(tableData!.table.id, true); setNotice("Column archived."); }
    catch (cause) { setError(messageOf(cause, "Unable to archive column.")); }
  };

  if (!accessToken || !["ADMIN", "STAFF"].includes(role)) return <div className={`${panel} p-6 text-sm text-slate-600`}>You do not have access to Flexible Tables.</div>;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {tableData && !embeddedTableId && <button type="button" className={buttonClass} onClick={() => { setTableData(null); setSelectedTableId(null); setError(""); setNotice(""); void loadTables(); }}><ArrowLeft className="h-4 w-4" />Tables</button>}
          {!embeddedTableId && <h1 className="sr-only">Flexible Tables</h1>}
        </div>
        {tableData?.access.canManage && <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => void renameTable()}><Settings2 className="h-4 w-4" />Rename</button><button type="button" className={buttonClass} onClick={() => void openPermissions()}><Users className="h-4 w-4" />Permissions</button><button type="button" className={`${buttonClass} text-rose-700`} onClick={() => void archiveTable()}><Archive className="h-4 w-4" />Archive</button></div>}
      </header>


      {!tableData && embeddedTableId ? (
        loading ? <TableSkeleton columns={5} rows={5} showToolbar /> : <div role="alert" className={`${panel} p-6 text-sm text-rose-700`}>{error || "This table is no longer available to your account."}</div>
      ) : !tableData ? (
        <div className={`${panel} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Create a custom table<input className={inputClass} value={newName} maxLength={100} placeholder="e.g. Weekly planning" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createTable(); }} /></label>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#0b2341] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#173b62] disabled:opacity-50" disabled={saving || !newName.trim()} onClick={() => void createTable()}><Plus className="h-4 w-4" />Create table</button>
          </div>
          {loading && !tables.length ? <div role="status" aria-label="Loading flexible tables" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map(key=><SkeletonBlock key={key} className="h-36 rounded-xl" />)}</div> : tables.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tables.map((table) => <button type="button" key={table.id} onClick={() => void loadTable(table.id)} className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-[#2678b9]/40 hover:bg-slate-50"><span className="flex items-center gap-2 text-sm font-semibold text-[#0b2341]"><Table2 className="h-4 w-4 text-[#2678b9]" />{table.name}</span><span className="mt-2 block text-[11px] text-slate-500">Updated {new Date(table.updated_at).toLocaleString()}</span><span className="mt-3 block text-[11px] font-medium text-slate-500">{table.access?.is_owner ? "Owner" : table.access?.can_manage ? "Can manage" : table.access?.can_edit ? "Can edit" : "View only"}</span></button>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No tables are shared with you yet. Create one or ask a table owner for access.</div>}
        </div>
      ) : loading && !tableData ? <TableSkeleton columns={5} rows={5} showToolbar /> : (
        <div className={`${panel} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 sm:px-4">
            <div className="min-w-0"><h2 className="truncate font-semibold text-[#0b2341]">{tableData.table.name}</h2><p className="text-[11px] text-slate-500">{tableData.rows.length} rows · {tableData.columns.length} columns</p></div>
            <div className="flex flex-wrap items-center gap-2">{columnControls}<button type="button" onClick={() => setShowHidden((shown) => !shown)} className={buttonClass}>{showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showHidden ? "Hide hidden" : "Show hidden"}</button><button type="button" className={buttonClass} onClick={() => openColumn("new")} disabled={!tableData.access.canManage || saving}><Columns3 className="h-4 w-4" />Add column</button></div>
          </div>
          <ReportCellFormattingToolbar selectedFontSize={selectedFormat.fontSize ?? 12} formulaBar={<SpreadsheetFormulaBar address={selectedFormulaRow&&selectedFormulaColumn&&tableData?`${columnLetters([...tableData.columns].sort((a,b)=>a.position-b.position).findIndex(column=>column.id===selectedFormulaColumn.id))}${tableData.rows.findIndex(row=>row.id===selectedFormulaRow.id)+1}`:undefined} inputRef={formulaInput} value={formulaBarValue} readOnly={!sourceValueEditable||saving||Boolean(headerFormatting.key)} readOnlyReason={saving?"Wait for the current save to finish.":headerFormatting.key?"Select a custom data cell; column headers do not support formulas.":"Select an editable custom cell. Dates, dropdowns and booleans accept normal values; expressions require text or number cells."} onFocus={()=>{activeFormulaInput.current=formulaInput.current;formulaCancelled.current=false;formulaPicking.current=formulaEligible&&!saving&&!headerFormatting.key;}} onBlur={event=>{if((event.relatedTarget as Element|null)?.closest("[data-formula-bar],[data-formula-help]"))return;formulaPicking.current=false;if(formulaCancelled.current){formulaCancelled.current=false;return;}if(sourceValueEditable&&!saving&&!headerFormatting.key&&selectedFormulaRow&&selectedFormulaColumn&&formulaBarValue!==(selectedFormulaCell?.formula?.expression??cellInputValue(selectedFormulaCell?.value)))void saveCellValue(selectedFormulaRow,selectedFormulaColumn,formulaBarValue,selectedFormulaCell);}} onChange={value=>{formulaCancelled.current=false;formulaPicking.current=true;setDrafts(current=>({...current,[selectedFormulaKey]:value}));}} onCommit={()=>{if(selectedFormulaRow&&selectedFormulaColumn){formulaPicking.current=false;void saveCellValue(selectedFormulaRow,selectedFormulaColumn,formulaBarValue,selectedFormulaCell);}}} onCancel={()=>{formulaCancelled.current=true;formulaPicking.current=false;pickedFormulaRefs.current={key:"",references:{}};setDrafts(current=>{const next={...current};delete next[selectedFormulaKey];return next;});}}/>} selectedCellCount={tableData.access.canManage && formatColumn && !saving && !formatSaving ? 1 : 0} selectionIsBold={Boolean(selectedFormat.bold)} selectionIsItalic={Boolean(selectedFormat.italic)} selectionIsUnderlined={Boolean(selectedFormat.underline)} selectedTextColor={selectedFormat.color ?? null} selectedBackgroundColor={selectedFormat.backgroundColor ?? null} onApply={patch => void applyCellFormat(patch)} {...headerFormatting.toolbarProps} />
          <div ref={element => { spreadsheetViewport.current = element; attachViewport(element); }} {...viewportProps} className="spreadsheet-viewport relative min-h-0 min-w-0 overflow-auto overscroll-contain">
            <table {...headerFormatting.tableProps} style={tableStyle} className="spreadsheet-grid min-w-full border-separate border-spacing-0 text-left text-xs">{colgroup}
              <thead className="sticky top-0 z-20 bg-slate-50"><tr><th style={{ width: SPREADSHEET_NUMBER_GUTTER_WIDTH, minWidth: SPREADSHEET_NUMBER_GUTTER_WIDTH }} className="spreadsheet-gutter sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-1 py-2 text-center text-[11px] font-semibold uppercase text-slate-500"><SpreadsheetRowNumber value="#" /></th>{visibleColumns.map((column, index) => <th key={column.id} {...headerProps(column.id)} {...headerFormatting.props(column.id)} onContextMenu={event=>setFlexColumnMenu({key:column.id,...headerFormatting.menuPosition(event)})} draggable={tableData.access.canManage && !saving}
                onDragStart={event => { if ((event.target as HTMLElement).closest("button,input,select,[role=separator]")) { event.preventDefault(); return; } setDraggedFlexColumn(column.id); event.dataTransfer.effectAllowed = "move"; }}
                onDragOver={event => { if (draggedFlexColumn) event.preventDefault(); }} onDragEnd={() => setDraggedFlexColumn(null)}
                onDrop={event => { event.preventDefault(); const source = draggedFlexColumn; setDraggedFlexColumn(null); if (source) void reorderFlexibleColumn(source, column.id); }} style={flexStyle(column,true)} className={`relative min-w-0 border-b border-r border-slate-200 px-3 py-1 align-middle ${column.is_hidden ? "bg-amber-50" : "bg-slate-50"}`}>{headerFormatting.editor(column.id)}<div className="spreadsheet-header-content flex min-w-0 items-center gap-1"><span data-spreadsheet-header-title className="min-w-0 flex-1 whitespace-normal break-words font-semibold text-inherit" title={column.name}>{headerFormatting.title(column.id,column.name)}</span>{tableData.access.canManage && <span className="flex shrink-0 items-center gap-0.5"><button type="button" title="Move column left" disabled={index === 0 || saving} onClick={() => shiftColumn(column, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button><button type="button" title="Move column right" disabled={index === visibleColumns.length - 1 || saving} onClick={() => shiftColumn(column, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button></span>}{tableData.access.canManage&&<details className="relative inline-block shrink-0"><summary title="Column appearance" aria-label={`Appearance for ${column.name}`} className="cursor-pointer list-none rounded p-1 text-slate-500"><Palette className="h-3 w-3" /></summary><span className="absolute right-0 top-full z-50 flex items-center gap-1 rounded border border-slate-200 bg-white p-2 shadow-sm"><button type="button" aria-label={`Color ${column.name} column`} disabled={saving} onClick={()=>setAppearanceColumn(column.id)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Palette className="h-3 w-3"/></button><select aria-label={`Pin ${column.name} column`} disabled={saving} value={flexColumnAppearance(column.settings??{}).pin??""} onChange={event=>void saveAppearance(column,{pin:event.target.value==="left"?"left":event.target.value==="right"?"right":null})} className="rounded border border-slate-200 bg-white p-1 text-[10px]"><option value="">Unpinned</option><option value="left">Pin left</option><option value="right">Pin right</option></select></span></details>}{headerControls({ key: column.id, title: column.name })}</div></th>)}{tableData.access.canEdit && <th className="min-w-12 border-b border-slate-200 bg-slate-50" />}</tr></thead>
              <tbody><VirtualSpreadsheetRows viewport={spreadsheetViewport} keys={virtualKeys} enabled={Boolean(tableData)} heights={rowHeights.heights} columnCount={visibleColumns.length+2} renderRow={index=>{const rowIndex=index,row=filteredRows[rowIndex];return <tr data-virtual-index={rowIndex} key={row.id} style={rowHeights.style(row.id)} className="group hover:bg-blue-50/30"><th style={{ width: SPREADSHEET_NUMBER_GUTTER_WIDTH, minWidth: SPREADSHEET_NUMBER_GUTTER_WIDTH }} className="spreadsheet-gutter sticky left-0 z-10 border-b border-r border-slate-100 bg-slate-50 px-1 py-1 text-[10px] font-medium text-slate-400 group-hover:bg-blue-50/30"><SpreadsheetRowNumber value={rowIndex+1} />{rowHeights.handle(row.id)}</th>{visibleColumns.map((column) => {
                const cell = cellFor(row, column.id);
                const key = `${row.id}:${column.id}`;
                const valueText = drafts[key] ?? (cell?.formula ? readFormulaDisplay(row,column) : cellInputValue(cell?.value));
                const disabled = !tableData.access.canEdit || saving;
                const options = tableData.options.filter((option) => option.column_id === column.id && option.is_active);
                const format = (column.settings.cell_formats as Record<string, ReportCellFormat> | undefined)?.[row.id];
                return <td key={column.id} data-flex-row={row.id} data-flex-column={column.id} data-formula-reference={drafts[selectedFormulaKey]!==undefined&&formulaReferences.has(key)?"true":undefined} onPointerDownCapture={event=>{if(!formulaPicking.current||!formulaEligible||saving||!formulaBarValue.startsWith("=")||selectedFormulaKey===key)return;event.preventDefault();event.stopPropagation();const columns=[...tableData.columns].sort((a,b)=>a.position-b.position);const address=`${columnLetters(columns.findIndex(c=>c.id===column.id))}${tableData.rows.findIndex(r=>r.id===row.id)+1}`;if(pickedFormulaRefs.current.key!==selectedFormulaKey)pickedFormulaRefs.current={key:selectedFormulaKey,references:{}};pickedFormulaRefs.current.references[address]={rowId:row.id,columnId:column.id};setReferencePreview({key:selectedFormulaKey,references:{...pickedFormulaRefs.current.references}});const field=activeFormulaInput.current??formulaInput.current;const at=field?.selectionStart??formulaBarValue.length,end=field?.selectionEnd??at;setDrafts(current=>({...current,[selectedFormulaKey]:formulaBarValue.slice(0,at)+address+formulaBarValue.slice(end)}));requestAnimationFrame(()=>{field?.focus();field?.setSelectionRange(at+address.length,at+address.length);});}} onClickCapture={event=>{if(formulaPicking.current&&formulaEligible&&!saving&&formulaBarValue.startsWith("=")&&selectedFormulaKey!==key){event.preventDefault();event.stopPropagation();}}} onFocus={() => setFormatSelection({ tableId: tableData.table.id, rowId: row.id, columnId: column.id })} onClick={() => setFormatSelection({ tableId: tableData.table.id, rowId: row.id, columnId: column.id })} style={flexStyle(column,false,format)} className={`relative border-b border-r border-slate-100 px-1.5 py-0.5 align-middle ${fillPreview?.columnId===column.id && tableData.rows.findIndex(r=>r.id===row.id)>=Math.min(fillPreview.from,fillPreview.to)&&tableData.rows.findIndex(r=>r.id===row.id)<=Math.max(fillPreview.from,fillPreview.to)?"outline outline-2 outline-blue-400":""}`}>{column.input_mode === "DROPDOWN" ? <ReportDropdownEditor label={headerFormatting.title(column.id,column.name)} value={valueText} displayValue={options.find(option=>option.stored_value===valueText)?.label??valueText} autoOpen={false} disabled={disabled} options={options.map(option=>({value:option.stored_value,label:option.label,color:option.color}))} onSelect={next=>void saveCellValue(row,column,next,cell)} /> : column.value_type === "BOOLEAN" ? <input aria-label={`${column.name}, row ${rowIndex + 1}`} disabled={disabled} type="checkbox" checked={cell?.value === true} onChange={(event) => void saveCellValue(row, column, String(event.target.checked), cell)} className="h-3.5 w-3.5 accent-[#2678b9]" /> : <input aria-label={`${column.name}, row ${rowIndex + 1}`} disabled={disabled} type={cell?.formula || drafts[key]?.startsWith("=") ? "text" : column.value_type === "NUMBER" ? "text" : column.value_type === "DATE" ? "date" : column.value_type === "DATETIME" ? "datetime-local" : "text"} step={column.value_type === "NUMBER" ? "any" : undefined} className="spreadsheet-cell-editor w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-xs hover:border-slate-200 focus:border-blue-400 focus:bg-white disabled:cursor-not-allowed" value={valueText} onFocus={event=>{activeFormulaInput.current=event.currentTarget;formulaPicking.current=formulaEligible;formulaCancelled.current=false;if(cell?.formula)setDrafts(current=>({...current,[key]:cell.formula!.expression}));}} onChange={(event) => {formulaPicking.current=true;setDrafts((current) => ({ ...current, [key]: event.target.value }));}} onBlur={(event) => { if((event.relatedTarget as Element|null)?.closest("[data-formula-bar]"))return; if (event.target.value !== (cell?.formula?.expression ?? cellInputValue(cell?.value))) void saveCellValue(row, column, event.target.value, cell); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); event.currentTarget.value = cell?.formula?.expression ?? cellInputValue(cell?.value); setDrafts(current => { const next = { ...current }; delete next[key]; return next; }); event.currentTarget.blur(); } }} />}{cell?.formula&&(drafts[key]===undefined||drafts[key]===cell.formula.expression)&&formatSelection?.rowId===row.id&&formatSelection.columnId===column.id&&<button type="button" aria-label="Fill formula down" onPointerDown={event=>startFormulaFill(event,row,column,cell)} className="absolute bottom-0 right-0 z-30 h-2 w-2 cursor-crosshair border border-white bg-blue-600"/>}</td>;
              })}{tableData.access.canEdit && <td className="border-b border-slate-100 px-1"><div className="flex items-center gap-1 opacity-50 transition group-hover:opacity-100"><button type="button" title="Move row up" className="rounded p-1 text-slate-500 hover:bg-slate-100" disabled={rowIndex === 0 || saving} onClick={() => void moveRow(row, -1)}><ArrowUp className="h-3 w-3" /></button><button type="button" title="Move row down" className="rounded p-1 text-slate-500 hover:bg-slate-100" disabled={rowIndex === filteredRows.length - 1 || saving} onClick={() => void moveRow(row, 1)}><ArrowDown className="h-3 w-3" /></button><button type="button" title="Archive row" className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => void archiveRowAction(row)}><Trash2 className="h-3.5 w-3.5" /></button></div></td>}</tr>;}}/>
     <SpreadsheetBlankRows gutterWidth={SPREADSHEET_NUMBER_GUTTER_WIDTH} count={spreadsheetPadding.count} height={spreadsheetPadding.height} start={filteredRows.length + 1} columns={[...visibleColumns.map(column => ({ key: column.id, width: columnWidth(column.id), style: flexStyle(column) })), ...(tableData.access.canEdit ? [{ key: "row-actions", width: 88 }] : [])]} /></tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-1 text-xs text-slate-500" role="status" aria-live="polite"><span>{loadingMore?"Loading more rows...":`${filteredRows.length} of ${tableData.pagination?.total??filteredRows.length} matching rows loaded`}</span>{error&&<button type="button" disabled={loading||loadingMore||saving} onClick={()=>{setError('');void loadMore();}} className="rounded px-2 py-1 text-blue-700">Retry loading</button>}</div>
          {hiddenControl}
          {tableData.access.canManage && <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2"><span className="mr-1 text-[10px] font-semibold uppercase text-slate-400">Columns</span>{tableData.columns.map((column) => <div key={column.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1"><span className="max-w-32 truncate text-[10px] text-slate-600">{column.name}</span><button type="button" title={column.is_hidden ? "Show column" : "Hide column"} onClick={() => void toggleColumnHidden(column)} className="text-slate-400 hover:text-slate-700">{column.is_hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button><button type="button" title="Column options" aria-label={`${column.name} column options`} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setFlexColumnMenu({key:column.id,left:Math.max(8,Math.min(rect.left,window.innerWidth-240)),top:Math.max(8,Math.min(rect.bottom,window.innerHeight-360))});}} className="text-slate-400 hover:text-slate-700"><Settings2 className="h-3 w-3" /></button><button type="button" title="Archive column" onClick={() => void archiveColumnAction(column)} className="text-rose-400 hover:text-rose-700"><Archive className="h-3 w-3" /></button></div>)}</div>}
        </div>
      )}

      {columnEditor && <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-3 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setColumnEditor(null); }}><section role="dialog" aria-modal="true" aria-label="Column settings" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><header className="flex items-center justify-between"><h2 className="font-semibold text-[#0b2341]">{columnEditor === "new" ? "Add column" : "Configure column"}</h2><button type="button" onClick={() => setColumnEditor(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Column name<input className={inputClass} maxLength={100} value={columnForm.name} onChange={(event) => setColumnForm((form) => ({ ...form, name: event.target.value }))} /></label><label className="text-xs font-semibold text-slate-600">Value type<select className={inputClass} value={columnForm.value_type} onChange={(event) => { const value = event.target.value as FlexValueType; setColumnForm((form) => ({ ...form, value_type: value, input_mode: value })); }}>{VALUE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Input mode<select className={inputClass} value={columnForm.input_mode} onChange={(event) => setColumnForm((form) => ({ ...form, input_mode: event.target.value as FlexInputMode }))}>{INPUT_MODES.filter((mode) => mode === "DROPDOWN" ? columnForm.value_type === "TEXT" : mode === "TEXT" || mode === columnForm.value_type).map((mode) => <option key={mode}>{mode}</option>)}</select></label></div><p className="mt-3 text-[11px] text-slate-500">New columns use custom rows. Report/source bindings are not enabled in this workspace.</p><div className="mt-5 flex flex-wrap justify-between gap-2">{columnEditor !== "new" && columnEditor.input_mode === "DROPDOWN" && <button type="button" className={buttonClass} onClick={() => { void openOptions(columnEditor); setColumnEditor(null); }}>Manage options</button>}<div className="ml-auto flex gap-2"><button type="button" className={buttonClass} onClick={() => setColumnEditor(null)}>Cancel</button><button type="button" disabled={saving || !columnForm.name.trim()} className="rounded-lg bg-[#0b2341] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void saveColumn()}>{saving ? "Saving…" : "Save column"}</button></div></div></section></div>}

      {optionsColumn && <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-3 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionsColumn(null); }}><section role="dialog" aria-modal="true" aria-label="Dropdown options" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"><header className="flex items-center justify-between"><div><h2 className="font-semibold text-[#0b2341]">Dropdown options</h2><p className="text-xs text-slate-500">{optionsColumn.name}</p></div><button type="button" onClick={() => setOptionsColumn(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><form className="mt-4 grid gap-2 sm:grid-cols-[1fr_60px_auto]" onSubmit={(event) => { event.preventDefault(); void addOption(); }}><input className="rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="Label" maxLength={100} value={optionForm.label} onChange={(event) => setOptionForm((form) => ({ ...form, label: event.target.value }))} /><input className="h-9 w-full rounded border border-slate-200" aria-label="Option color" type="color" value={optionForm.color} onChange={(event) => setOptionForm((form) => ({ ...form, color: event.target.value }))} /><button type="submit" disabled={saving || !optionForm.label.trim()} className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="inline h-3 w-3" /> Add</button></form><div className="mt-4 divide-y divide-slate-100">{allOptions.filter(option=>option.is_active).map((option, index) => <OptionRow key={option.id} option={option} index={index} count={allOptions.length} onPatch={(patch) => { void patchOption(option, patch).catch(cause=>setError(messageOf(cause,"Unable to save this option."))); }} />)}{!allOptions.length && <p className="py-8 text-center text-sm text-slate-500">No options configured.</p>}</div></section></div>}

      {configurationColumn&&(()=>{const column=tableData?.columns.find(c=>c.id===configurationColumn);return column&&accessToken?<FlexibleColumnConfiguration key={column.id} token={accessToken} tableId={tableData!.table.id} column={column} hasValues={tableData!.rows.some(row=>row.cells.some(cell=>cell.column_id===column.id))} onClose={()=>setConfigurationColumn(null)} onSaved={()=>loadTable(tableData!.table.id,true)} />:null;})()}
      {flexColumnMenu&&(()=>{const column=tableData?.columns.find(c=>c.id===flexColumnMenu.key);return column?<ReportColumnActionsMenu title={headerFormatting.title(column.id,column.name)} position={flexColumnMenu} onClose={()=>setFlexColumnMenu(null)} onRename={()=>headerFormatting.startRename(column.id,column.name)} onRestoreTitle={()=>headerFormatting.restoreTitle(column.id)} onConfigureInput={()=>setConfigurationColumn(column.id)} pinned={Boolean(flexColumnAppearance(column.settings).pin)} onTogglePin={()=>void saveAppearance(column,{pin:flexColumnAppearance(column.settings).pin?null:"left"})} onEditColumn={()=>setAppearanceColumn(column.id)} canManageOptions={column.input_mode==="DROPDOWN"} onManageOptions={()=>setConfigurationColumn(column.id)} onHide={()=>void updateFlexColumn(accessToken!,tableData!.table.id,column.id,{is_hidden:true,expected_version:column.version}).then(()=>loadTable(tableData!.table.id,true))} />:null;})()}
      {appearanceColumn&&(()=>{const column=tableData?.columns.find(c=>c.id===appearanceColumn);return column?<ReportColumnColorDialog columnName={column.name} color={flexColumnAppearance(column.settings??{}).color??""} onChange={color=>void saveAppearance(column,{color})} onReset={()=>void saveAppearance(column,{color:null})} onClose={()=>setAppearanceColumn(null)}/>:null;})()}
      {permissionsOpen && <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-3 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPermissionsOpen(false); }}><section role="dialog" aria-modal="true" aria-label="Table permissions" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"><header className="flex items-center justify-between"><div><h2 className="font-semibold text-[#0b2341]">Table permissions</h2><p className="text-xs text-slate-500">Owner access is based on the table creator profile.</p></div><button type="button" onClick={() => setPermissionsOpen(false)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_repeat(3,auto)]"><select className="rounded-lg border border-slate-200 px-3 py-2 text-xs" value={permissionSubject} onChange={(event) => setPermissionSubject(event.target.value)}><option value="ROLE:STAFF">All STAFF</option>{profiles.filter((profile) => profile.role === "STAFF").map((profile) => <option key={profile.id} value={`PROFILE:${profile.id}`}>{profile.full_name} · Staff</option>)}</select><PermissionCheckbox label="View" checked={permissionFlags.can_view} onChange={(value) => setPermissionFlags({ can_view: value, can_edit: value && permissionFlags.can_edit, can_manage: value && permissionFlags.can_manage })} /><PermissionCheckbox label="Edit" checked={permissionFlags.can_edit} onChange={(value) => setPermissionFlags({ can_view: value || permissionFlags.can_view, can_edit: value, can_manage: value && permissionFlags.can_manage })} /><PermissionCheckbox label="Manage" checked={permissionFlags.can_manage} onChange={(value) => setPermissionFlags({ can_view: value || permissionFlags.can_view, can_edit: value || permissionFlags.can_edit, can_manage: value })} /><button type="button" className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white sm:col-span-4" disabled={!permissionFlags.can_view || saving} onClick={() => void addPermission()}>Grant permission</button></div><div className="mt-4 divide-y divide-slate-100">{permissions.map((permission) => <PermissionRow key={permission.id} permission={permission} profiles={profiles} onPatch={(patch) => void patchPermission(permission, patch)} onDelete={() => void removePermission(permission)} />)}{!permissions.length && <p className="py-8 text-center text-sm text-slate-500">No explicit permissions have been added.</p>}</div></section></div>}
    </section>
  );
}

function OptionRow({ option, index, count, onPatch }: { option: FlexOption; index: number; count: number; onPatch: (patch: Partial<FlexOption>) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(option.label);
  return <div className="flex flex-wrap items-center gap-2 py-2"><input type="color" aria-label={`Color for ${option.label}`} value={option.color??"#64748b"} onChange={event=>onPatch({color:event.target.value})} className="h-6 w-6 rounded border border-slate-200" />{editing ? <><input className="min-w-24 flex-1 rounded border border-slate-200 px-2 py-1 text-xs" value={label} onChange={(event) => setLabel(event.target.value)} /><button type="button" className={buttonClass} onClick={() => { onPatch({ label }); setEditing(false); }}>Save</button></> : <><span className="min-w-24 flex-1 text-xs font-medium text-slate-700">{option.label}</span><button type="button" className="text-slate-400 disabled:opacity-30" title="Move up" disabled={index === 0} onClick={() => onPatch({ position: Math.max(0, option.position - 1) })}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" className="text-slate-400 disabled:opacity-30" title="Move down" disabled={index === count - 1} onClick={() => onPatch({ position: option.position + 1 })}><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" title="Rename option" aria-label="Rename option" className={buttonClass} onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5"/></button></>}<button type="button" title="Remove unused option" aria-label={`Remove ${option.label}`} className={buttonClass} onClick={() => onPatch({ is_active: false })}><Trash2 className="h-3.5 w-3.5"/></button></div>;
}

function PermissionCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-[11px] text-slate-600"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function PermissionRow({ permission, profiles, onPatch, onDelete }: { permission: FlexPermission; profiles: FlexProfile[]; onPatch: (patch: Pick<FlexPermission, "can_view" | "can_edit" | "can_manage">) => void; onDelete: () => void }) {
  const profile = profiles.find((item) => item.id === permission.subject_profile_id);
  return <div className="flex flex-wrap items-center gap-3 py-2"><span className="min-w-32 flex-1 text-xs font-medium text-slate-700">{permission.subject_type === "ROLE" ? "All STAFF" : profile?.full_name ?? permission.subject_profile_id}</span><PermissionCheckbox label="View" checked={permission.can_view} onChange={(value) => onPatch({ can_view: value, can_edit: value && permission.can_edit, can_manage: value && permission.can_manage })} /><PermissionCheckbox label="Edit" checked={permission.can_edit} onChange={(value) => onPatch({ can_view: value || permission.can_view, can_edit: value, can_manage: value && permission.can_manage })} /><PermissionCheckbox label="Manage" checked={permission.can_manage} onChange={(value) => onPatch({ can_view: value || permission.can_view, can_edit: value || permission.can_edit, can_manage: value })} /><button type="button" className="rounded p-1 text-rose-600 hover:bg-rose-50" title="Remove permission" onClick={onDelete}><Trash2 className="h-4 w-4" /></button></div>;
}
