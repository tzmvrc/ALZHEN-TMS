import { useWorkspacePreload } from "./useWorkspacePreload";
import { memo, useCallback, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {SpreadsheetSheetHeader,SpreadsheetBottomToolbar,SpreadsheetBottomControlsContext} from "./SpreadsheetWorkspace";
import ReportDataView from "./ReportDataView";
import TransmittalTrackerView from "./TransmittalTrackerView";
import RetainedFeature from "./RetainedFeature";
import { useAuth } from "../../context/AuthContext";
import { workspaceSheet, WORKSPACE_SHEETS, type WorkspaceSheet } from "../../services/trips-workspace";

type Props = ComponentProps<typeof ReportDataView>;
// Active-tab changes should not rerender every previously visited grid. Activity
// still resumes subscriptions and measurements for the newly visible sheet.
const WorkspaceReport = memo(ReportDataView);
const WorkspaceTracker = memo(TransmittalTrackerView);
const SHEET_TABS = [...WORKSPACE_SHEETS, {key:"transmittal" as const,title:"Transmittal Tracker",description:"Monitor delivery documents, transmittal references, and shipping progress."}];

/** One retained physical report instance per sheet; no data/model merging. */
export default function ReportsWorkspace(props: Props) {
  const [footerHiddenColumns,setFooterHiddenColumns]=useState<{owner:symbol;sheet:string;control:ReactNode}|null>(null);
  const registerHiddenColumns=useCallback((sheet:string,control:ReactNode)=>{
    const owner=Symbol(sheet);
    setFooterHiddenColumns({owner,sheet,control});
    return()=>setFooterHiddenColumns(current=>current?.owner===owner?null:current);
  },[]);
  const workspaceRef = useRef<HTMLElement>(null);
  const { profile, accessToken } = useAuth();
  const preference = `alzhen:trip-sheets:${profile?.id ?? "guest"}:${profile?.role ?? ""}`;
  const [active, setActive] = useState<WorkspaceSheet | "transmittal">(() => {
    if (props.initialReport && props.initialReport !== "combined") return workspaceSheet(props.initialReport);
    try { const saved=sessionStorage.getItem(preference); return saved==="transmittal"?saved:workspaceSheet(saved ?? "trips"); } catch { return "trips"; }
  });
  const [ready,setReady]=useState({token:accessToken,sheet:""});
  const markReady=useCallback((sheet:string)=>setReady(current=>current.token===accessToken&&current.sheet===sheet?current:{token:accessToken,sheet}),[accessToken]);
  useWorkspacePreload(accessToken,active,ready.token===accessToken&&ready.sheet===active);
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

  return <section ref={workspaceRef} data-trips-workspace aria-label="Trips spreadsheet workspace" className="min-w-0">
    <div className="mb-2"><SpreadsheetSheetHeader title={SHEET_TABS.find(sheet=>sheet.key===active)!.title} description={SHEET_TABS.find(sheet=>sheet.key===active)!.description} /></div>
    <SpreadsheetBottomControlsContext.Provider value={{activeSheet:active,registerHiddenColumns}}>
    {WORKSPACE_SHEETS.map(sheet => <RetainedFeature key={sheet.key} active={active === sheet.key}>
      <div role="tabpanel" id={`trip-sheet-${sheet.key}`} aria-labelledby={`trip-tab-${sheet.key}`}>
        <WorkspaceReport {...props} onDataReady={markReady} initialReport={sheet.report} pageTitle={undefined} pageSubtitle={undefined}
          transactionView={sheet.key === "trips"} allTripRecords={sheet.key === "trips"} ongoingOnly={sheet.key === "trips" ? false : props.ongoingOnly} showReportPicker={false} showExport
          notificationTarget={props.notificationTarget?.reportKey === sheet.report || sheet.key === "trips" && props.notificationTarget?.reportKey === "combined" ? {...props.notificationTarget!,reportKey:sheet.report} : null}
          onReportScopeChange={undefined} toolbarLeading={undefined}
          toolbarActions={sheet.key === "trips" ? props.toolbarActions : undefined}
          createdTripReference={sheet.key === "trips" ? props.createdTripReference : undefined} />
      </div>
    </RetainedFeature>)}
    <RetainedFeature active={active === "transmittal"}><div role="tabpanel" id="trip-sheet-transmittal" aria-labelledby="trip-tab-transmittal"><WorkspaceTracker onDataReady={markReady} /></div></RetainedFeature>
    </SpreadsheetBottomControlsContext.Provider>
    <SpreadsheetBottomToolbar workspace={workspaceRef} sheet={active} hiddenColumnsControl={footerHiddenColumns?.sheet===active?footerHiddenColumns.control:null}>
    <nav data-sheet-tabs role="tablist" aria-label="Trip workspace sheets" className="flex min-w-0 flex-1 flex-nowrap items-stretch overflow-x-auto overflow-y-hidden whitespace-nowrap">
      {SHEET_TABS.map(sheet => <button key={sheet.key} id={`trip-tab-${sheet.key}`} role="tab" aria-selected={active === sheet.key} aria-controls={`trip-sheet-${sheet.key}`} type="button" onClick={() => choose(sheet.key)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const index = SHEET_TABS.findIndex(item => item.key === sheet.key);
        const next = event.key === "Home" ? 0 : event.key === "End" ? SHEET_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + SHEET_TABS.length) % SHEET_TABS.length;
        choose(SHEET_TABS[next].key); document.getElementById(`trip-tab-${SHEET_TABS[next].key}`)?.focus();
      }} className={`relative flex-none whitespace-nowrap border-r border-t border-slate-200 px-3 py-1 text-[11px] leading-5 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-500 ${active === sheet.key ? "border-t-white bg-white font-semibold text-blue-800 before:absolute before:-top-px before:left-0 before:right-0 before:h-px before:bg-white" : "bg-slate-100 text-slate-500 hover:bg-slate-50"}`}>{sheet.title}</button>)}
    </nav>
    </SpreadsheetBottomToolbar>
  </section>;
}
