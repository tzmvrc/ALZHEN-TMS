import { lazy, memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {SpreadsheetSheetHeader,SpreadsheetBottomToolbar,SpreadsheetBottomControlsContext} from "./SpreadsheetWorkspace";
import type ReportDataView from "./ReportDataView";
import RetainedFeature from "./RetainedFeature";
import { useAuth } from "../../context/AuthContext";
import { workspaceSheet, WORKSPACE_SHEETS, type WorkspaceSheet } from "../../services/trips-workspace";
import { setPageSection } from "./pageSection";

type Props = ComponentProps<typeof ReportDataView>;
// Active-tab changes should not rerender every previously visited grid. Activity
// still resumes subscriptions and measurements for the newly visible sheet.
const WorkspaceReport = memo(lazy(()=>import("./ReportDataView")));
const WorkspaceTracker = memo(lazy(()=>import("./TransmittalTrackerView")));
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
  const { profile } = useAuth();
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

  const footerContext=useMemo(()=>({activeSheet:active,registerHiddenColumns}),[active,registerHiddenColumns]);
  const activeTitle=SHEET_TABS.find(sheet=>sheet.key===active)!.title;
  useEffect(()=>setPageSection("trips",activeTitle),[activeTitle]);
  return <section ref={workspaceRef} data-trips-workspace aria-label="Trips spreadsheet workspace" className="min-w-0">
    <SpreadsheetSheetHeader title={activeTitle} />
    <SpreadsheetBottomControlsContext.Provider value={footerContext}>
    {WORKSPACE_SHEETS.map(sheet => <RetainedFeature key={sheet.key} active={active === sheet.key}>
      <div role="tabpanel" id={`trip-sheet-${sheet.key}`} aria-labelledby={`trip-tab-${sheet.key}`}>
        <WorkspaceReport {...props} initialReport={sheet.report} pageTitle={undefined} pageSubtitle={undefined} topbarSearchScope={`trips:${sheet.title}`}
          transactionView={sheet.key === "trips"} allTripRecords={sheet.key === "trips"} ongoingOnly={sheet.key === "trips" ? false : props.ongoingOnly} showReportPicker={false} showExport
          notificationTarget={props.notificationTarget?.reportKey === sheet.report || sheet.key === "trips" && props.notificationTarget?.reportKey === "combined" ? {...props.notificationTarget!,reportKey:sheet.report} : null}
          onReportScopeChange={undefined} toolbarLeading={undefined}
          toolbarActions={sheet.key === "trips" ? props.toolbarActions : undefined}
          createdTripReference={sheet.key === "trips" ? props.createdTripReference : undefined} />
      </div>
    </RetainedFeature>)}
    <RetainedFeature active={active === "transmittal"}><div role="tabpanel" id="trip-sheet-transmittal" aria-labelledby="trip-tab-transmittal"><WorkspaceTracker /></div></RetainedFeature>
    </SpreadsheetBottomControlsContext.Provider>
    <SpreadsheetBottomToolbar workspace={workspaceRef} sheet={active} hiddenColumnsControl={footerHiddenColumns?.sheet===active?footerHiddenColumns.control:null}>
    <nav data-sheet-tabs role="tablist" aria-label="Trip workspace sheets" className="flex min-w-0 flex-1 flex-nowrap items-stretch overflow-x-auto overflow-y-hidden whitespace-nowrap">
      {SHEET_TABS.map(sheet => <button key={sheet.key} id={`trip-tab-${sheet.key}`} role="tab" aria-selected={active === sheet.key} aria-controls={`trip-sheet-${sheet.key}`} type="button" onClick={() => choose(sheet.key)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const index = SHEET_TABS.findIndex(item => item.key === sheet.key);
        const next = event.key === "Home" ? 0 : event.key === "End" ? SHEET_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + SHEET_TABS.length) % SHEET_TABS.length;
        choose(SHEET_TABS[next].key); document.getElementById(`trip-tab-${SHEET_TABS[next].key}`)?.focus();
      }} className={`relative flex-none whitespace-nowrap border-b-2 px-3 py-1 text-[11px] leading-5 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#0b2343] ${active === sheet.key ? "border-[#0b2343] bg-white font-semibold text-[#0b2343]" : "border-transparent bg-[#f3f5f8] text-slate-500 hover:bg-white"}`}>{sheet.title}</button>)}
    </nav>
    </SpreadsheetBottomToolbar>
  </section>;
}
