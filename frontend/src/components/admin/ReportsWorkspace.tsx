import { lazy, memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {SpreadsheetSheetHeader,SpreadsheetBottomToolbar} from "./SpreadsheetWorkspace";
import {SpreadsheetBottomControlsContext} from "./SpreadsheetBottomControlsContext";
import type ReportDataView from "./ReportDataView";
import RetainedFeature from "./RetainedFeature";
import { useAuth } from "../../context/AuthContext";
import { useAccountPreferences } from "../account/useAccountPreferences";
import { workspaceSheet, WORKSPACE_SHEETS, type WorkspaceSheet } from "../../services/trips-workspace";
import { setPageSection } from "./pageSection";
import {useRegisterTopbarView,useStoredPageView} from "./topbarView";
import {TripsTableAppearanceContext} from "./TripsTableAppearance";
import SpreadsheetViewToggle from "./SpreadsheetViewToggle";
import "./TripsTableAppearance.css";

type Props = ComponentProps<typeof ReportDataView>;
// Active-tab changes should not rerender every previously visited grid. Activity
// still resumes subscriptions and measurements for the newly visible sheet.
const WorkspaceReport = memo(lazy(()=>import("./ReportDataView")));
const WorkspaceTracker = memo(lazy(()=>import("./TransmittalTrackerView")));
const MasterListView = memo(lazy(()=>import("./MasterListView")));
const MonitoringOperational = memo(lazy(()=>import("./DispatchMonitoringOperationalView")));
const DeliveryOperational = memo(lazy(()=>import("./DispatchDeliveryView")));
const CallingOperational = memo(lazy(()=>import("./StoreCallingOperationalView")));
const SHEET_TABS = [...WORKSPACE_SHEETS, {key:"transmittal" as const,title:"Transmittal Tracker",description:"Monitor delivery documents, transmittal references, and shipping progress."}];
const REPORT_VIEW_MODES = ["visual", "table"] as const;

/** One retained physical report instance per sheet; no data/model merging. */
export default function ReportsWorkspace(props: Props) {
  const [footerHiddenColumns,setFooterHiddenColumns]=useState<{owner:symbol;sheet:string;control:ReactNode}|null>(null);
  const [footerPaging,setFooterPaging]=useState<{owner:symbol;sheet:string;status:ReactNode;pagination:ReactNode;autoFit:boolean|null}|null>(null);
  const registerHiddenColumns=useCallback((sheet:string,control:ReactNode)=>{
    const owner=Symbol(sheet);
    setFooterHiddenColumns({owner,sheet,control});
    return()=>setFooterHiddenColumns(current=>current?.owner===owner?null:current);
  },[]);
  const registerPaging=useCallback((sheet:string,status:ReactNode,pagination:ReactNode,autoFit:boolean|null)=>{
    const owner=Symbol(sheet);
    setFooterPaging({owner,sheet,status,pagination,autoFit});
    return()=>setFooterPaging(current=>current?.owner===owner?null:current);
  },[]);
  const workspaceRef = useRef<HTMLElement>(null);
  const { profile } = useAuth();
  const {preferences:accountPreferences,save:saveAccountPreferences}=useAccountPreferences(profile?.id??"anonymous");
  const [monitoringSpreadsheet,setMonitoringSpreadsheet]=useState(false);
  const [dispatchSpreadsheet,setDispatchSpreadsheet]=useState(false);
  const [callingSpreadsheet,setCallingSpreadsheet]=useState(false);
  const callingOperational=accountPreferences.tableAppearance==="modern"&&!callingSpreadsheet;
  const deliveryOperational=accountPreferences.tableAppearance==="modern"&&!dispatchSpreadsheet;
  const monitoringOperational=accountPreferences.tableAppearance==="modern"&&!monitoringSpreadsheet;
  const preference = `alzhen:trip-sheets:${profile?.id ?? "guest"}:${profile?.role ?? ""}`;
  const [active, setActive] = useState<WorkspaceSheet | "transmittal">(() => {
    if (props.initialReport && props.initialReport !== "combined") return workspaceSheet(props.initialReport);
    try { const saved=sessionStorage.getItem(preference); return saved==="transmittal"?saved:workspaceSheet(saved ?? "trips"); } catch { return "trips"; }
  });
  const notificationKey=props.notificationTarget?.navigationKey;
  const [incoming,setIncoming]=useState({report:props.initialReport,notificationKey});
  // Reconcile explicit navigation before rendering a sheet, without an effect-driven extra frame.
  if(incoming.report!==props.initialReport||incoming.notificationKey!==notificationKey){
    setIncoming({report:props.initialReport,notificationKey});
    if(notificationKey!==incoming.notificationKey&&props.notificationTarget)setActive(workspaceSheet(props.notificationTarget.reportKey));
    else if(props.initialReport)setActive(workspaceSheet(props.initialReport));
  }
  const choose = (sheet: WorkspaceSheet | "transmittal") => {
    setActive(sheet);
    try { sessionStorage.setItem(preference, sheet); } catch { /* Local navigation preference only. */ }
    if (sheet !== "transmittal") {
      props.onReportScopeChange?.(sheet === "trips" ? "combined" : sheet);
    }
  };

  const footerContext=useMemo(()=>({activeSheet:active,registerHiddenColumns,registerPaging}),[active,registerHiddenColumns,registerPaging]);
  const activeTitle=SHEET_TABS.find(sheet=>sheet.key===active)!.title;
  const [activeView,setActiveView]=useStoredPageView(`trips:${activeTitle}`, "table", REPORT_VIEW_MODES);
  useEffect(()=>{if(active==="trips"&&props.notificationTarget?.masterListCells)setActiveView("table");},[active,notificationKey,setActiveView]);
  const [,setMonitoringReportView]=useStoredPageView("trips:Dispatch Monitoring","table",REPORT_VIEW_MODES);
  useRegisterTopbarView("trips:Dispatch Monitoring",active==="dispatch-monitoring"&&accountPreferences.tableAppearance==="modern"?{priority:10,value:monitoringSpreadsheet?"table":"grid",gridLabel:"Monitoring",tableLabel:"Spreadsheet · all columns",onChange:mode=>{if(mode==="table")setMonitoringReportView("table");setMonitoringSpreadsheet(mode==="table");}}:null);
  useRegisterTopbarView("trips:Dispatch Report",active==="dispatch"&&accountPreferences.tableAppearance==="modern"?{priority:10,value:dispatchSpreadsheet?"table":"grid",gridLabel:"Deliveries",tableLabel:"Spreadsheet · all columns",onChange:mode=>{setDispatchSpreadsheet(mode==="table");}}:null);
  useRegisterTopbarView("trips:Store Calling",active==="store-calling"&&accountPreferences.tableAppearance==="modern"?{priority:10,value:callingSpreadsheet?"table":"grid",gridLabel:"Calling",tableLabel:"Spreadsheet · all columns",onChange:mode=>setCallingSpreadsheet(mode==="table")}:null);
  const cardView=active!=="transmittal"&&activeView==="visual"&&!(active==="dispatch-monitoring"&&accountPreferences.tableAppearance==="modern")&&!(active==="dispatch"&&accountPreferences.tableAppearance==="modern")&&!(active==="store-calling"&&accountPreferences.tableAppearance==="modern");
  const bottomToolbar=!cardView&&<SpreadsheetBottomToolbar key={`${active}:${monitoringOperational}:${deliveryOperational}:${callingOperational}`} workspace={workspaceRef} sheet={active} hiddenColumnsControl={footerHiddenColumns?.sheet===active?footerHiddenColumns.control:null} masterPaging={footerPaging?.sheet===active?footerPaging:null}>
    <span className="sr-only">Sheet controls</span>
  </SpreadsheetBottomToolbar>;
  useEffect(()=>setPageSection("trips",activeTitle),[activeTitle]);
  const renderReport=(sheet:typeof WORKSPACE_SHEETS[number])=><WorkspaceReport {...props} initialReport={sheet.report} pageTitle={undefined} pageSubtitle={undefined} topbarSearchScope={`trips:${sheet.title}`} transactionView={sheet.key==="trips"} allTripRecords={sheet.key==="trips"} ongoingOnly={sheet.key==="trips"?false:props.ongoingOnly} showReportPicker={false} showExport notificationTarget={props.notificationTarget?.reportKey===sheet.report||sheet.key==="trips"&&props.notificationTarget?.reportKey==="combined"?{...props.notificationTarget!,reportKey:sheet.report}:null} onReportScopeChange={undefined} toolbarLeading={undefined} createdTripReference={sheet.key==="trips"?props.createdTripReference:undefined}/>;
  return <section ref={workspaceRef} data-trips-workspace data-operational-monitoring={(active==="dispatch-monitoring"&&monitoringOperational||active==="dispatch"&&deliveryOperational||active==="store-calling"&&callingOperational)?"true":undefined} data-table-appearance={(active==="dispatch-monitoring"&&monitoringSpreadsheet||active==="dispatch"&&dispatchSpreadsheet||active==="store-calling"&&callingSpreadsheet)?"excel":accountPreferences.tableAppearance} aria-label="Trips spreadsheet workspace" className="min-w-0">
    <TripsTableAppearanceContext.Provider value={(active==="dispatch-monitoring"&&monitoringSpreadsheet||active==="dispatch"&&dispatchSpreadsheet||active==="store-calling"&&callingSpreadsheet)?"excel":accountPreferences.tableAppearance}>
    {props.toolbarActions}
    <SpreadsheetSheetHeader title={activeTitle} />
    {!cardView&&<div className="trip-sheet-navigation"><nav data-sheet-tabs role="tablist" aria-label="Trip workspace sheets" className="trip-sheet-bookmarks">
      {SHEET_TABS.map(sheet => <button key={sheet.key} id={`trip-tab-${sheet.key}`} role="tab" aria-selected={active === sheet.key} aria-controls={`trip-sheet-${sheet.key}`} tabIndex={active === sheet.key ? 0 : -1} type="button" onClick={() => choose(sheet.key)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const index = SHEET_TABS.findIndex(item => item.key === sheet.key);
        const next = event.key === "Home" ? 0 : event.key === "End" ? SHEET_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + SHEET_TABS.length) % SHEET_TABS.length;
        choose(SHEET_TABS[next].key); document.getElementById(`trip-tab-${SHEET_TABS[next].key}`)?.focus();
      }}>{sheet.title}</button>)}
    </nav><SpreadsheetViewToggle checked={Boolean(accountPreferences.tableAppearance==="excel"||active==="dispatch-monitoring"&&monitoringSpreadsheet||active==="dispatch"&&dispatchSpreadsheet||active==="store-calling"&&callingSpreadsheet)} onChange={checked=>{setMonitoringSpreadsheet(false);setDispatchSpreadsheet(false);setCallingSpreadsheet(false);saveAccountPreferences({...accountPreferences,tableAppearance:checked?"excel":"modern"});}} className="trip-sheet-view-toggle"/></div>}
    <div className={cardView ? "min-w-0" : (active === "trips"||(active==="dispatch-monitoring"&&monitoringOperational||active==="dispatch"&&deliveryOperational||active==="store-calling"&&callingOperational)) ? "trip-sheet-table min-w-0 overflow-hidden border border-[#dce5f0] bg-white" : "trip-sheet-table al-table-shell min-w-0 overflow-hidden border border-[#dce5f0] bg-white"}>
    <SpreadsheetBottomControlsContext.Provider value={footerContext}>
    {WORKSPACE_SHEETS.map(sheet => <RetainedFeature key={sheet.key} active={active === sheet.key}>
      <div role="tabpanel" className="trip-sheet-panel" data-sheet-active={active===sheet.key} id={`trip-sheet-${sheet.key}`} aria-labelledby={`trip-tab-${sheet.key}`}>
        {sheet.key==="dispatch-monitoring"&&accountPreferences.tableAppearance==="modern"?<><RetainedFeature active={monitoringOperational}><MonitoringOperational onOpenTrip={props.onOpenTrip} initialSearch={props.notificationTarget?.reportKey==="dispatch-monitoring"?props.notificationTarget.searchText??"":""}/></RetainedFeature><RetainedFeature active={!monitoringOperational}>{renderReport(sheet)}</RetainedFeature></>:sheet.key==="dispatch"&&accountPreferences.tableAppearance==="modern"?<><RetainedFeature active={deliveryOperational}><DeliveryOperational onOpenTrip={props.onOpenTrip}/></RetainedFeature><RetainedFeature active={!deliveryOperational}>{renderReport(sheet)}</RetainedFeature></>:sheet.key==="store-calling"&&accountPreferences.tableAppearance==="modern"?<><RetainedFeature active={callingOperational}><CallingOperational/></RetainedFeature><RetainedFeature active={!callingOperational}>{renderReport(sheet)}</RetainedFeature></>:sheet.key==="trips"&&!cardView?<MasterListView createdTripReference={props.createdTripReference} notificationDispatch={props.notificationTarget?.reportKey==="combined"?props.notificationTarget.searchText:null} notificationTarget={props.notificationTarget?.reportKey==="combined"?props.notificationTarget:null} onOpenTrip={props.onOpenTrip}/>:renderReport(sheet)}
      </div>
    </RetainedFeature>)}
    <RetainedFeature active={active === "transmittal"}><div role="tabpanel" className="trip-sheet-panel" data-sheet-active={active==="transmittal"} id="trip-sheet-transmittal" aria-labelledby="trip-tab-transmittal"><WorkspaceTracker /></div></RetainedFeature>
    </SpreadsheetBottomControlsContext.Provider>
    </div>
    {bottomToolbar}
    </TripsTableAppearanceContext.Provider>
  </section>;
}
