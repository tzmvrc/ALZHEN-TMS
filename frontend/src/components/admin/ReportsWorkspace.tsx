import { useState, type ComponentProps } from "react";
import ReportDataView from "./ReportDataView";
import TransmittalTrackerView from "./TransmittalTrackerView";
import RetainedFeature from "./RetainedFeature";
import { useAuth } from "../../context/AuthContext";
import { workspaceSheet, WORKSPACE_SHEETS, type WorkspaceSheet } from "../../services/trips-workspace";

type Props = ComponentProps<typeof ReportDataView>;

/** One retained physical report instance per sheet; no data/model merging. */
export default function ReportsWorkspace(props: Props) {
  const { profile } = useAuth();
  const preference = `alzhen:trip-sheets:${profile?.id ?? "guest"}:${profile?.role ?? ""}`;
  const [active, setActive] = useState<WorkspaceSheet | "transmittal">(() => {
    if (props.initialReport && props.initialReport !== "combined") return workspaceSheet(props.initialReport);
    try { return workspaceSheet(sessionStorage.getItem(preference) ?? "trips"); } catch { return "trips"; }
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
    if (sheet !== "transmittal") {
      try { sessionStorage.setItem(preference, sheet); } catch { /* Preference only; no drafts are stored. */ }
      props.onReportScopeChange?.(sheet === "trips" ? "combined" : sheet);
    }
  };
  const tools = <button type="button" aria-pressed={active === "transmittal"} onClick={() => choose(active === "transmittal" ? "trips" : "transmittal")} className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">{active === "transmittal" ? "Back to Trips" : "Transmittal Tracker"}</button>;
  return <section data-trips-workspace aria-label="Trips spreadsheet workspace" className="min-w-0">
    <h1 className="mb-2 text-xl font-bold leading-tight text-[#0b2341]">Trips</h1>
    {WORKSPACE_SHEETS.map(sheet => <RetainedFeature key={sheet.key} active={active === sheet.key}>
      <div role="tabpanel" id={`trip-sheet-${sheet.key}`} aria-labelledby={`trip-tab-${sheet.key}`}>
        <ReportDataView {...props} initialReport={sheet.report} pageTitle={undefined} pageSubtitle={undefined}
          transactionView={sheet.key === "trips"} allTripRecords={sheet.key === "trips"} showReportPicker={false} showExport
          notificationTarget={props.notificationTarget?.reportKey === sheet.report || sheet.key === "trips" && props.notificationTarget?.reportKey === "combined" ? {...props.notificationTarget!,reportKey:sheet.report} : null}
          onReportScopeChange={undefined} toolbarLeading={tools}
          toolbarActions={sheet.key === "trips" ? props.toolbarActions : undefined}
          createdTripReference={sheet.key === "trips" ? props.createdTripReference : undefined} />
      </div>
    </RetainedFeature>)}
    <RetainedFeature active={active === "transmittal"}><TransmittalTrackerView toolbarLeading={tools} /></RetainedFeature>
    <nav data-sheet-tabs role="tablist" aria-label="Trip workspace sheets" className="relative z-10 -mt-px flex min-w-0 items-stretch overflow-x-auto border border-t-0 border-slate-200 bg-slate-100">
      {WORKSPACE_SHEETS.map(sheet => <button key={sheet.key} id={`trip-tab-${sheet.key}`} role="tab" aria-selected={active === sheet.key} aria-controls={`trip-sheet-${sheet.key}`} type="button" onClick={() => choose(sheet.key)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const index = WORKSPACE_SHEETS.findIndex(item => item.key === sheet.key);
        const next = event.key === "Home" ? 0 : event.key === "End" ? WORKSPACE_SHEETS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + WORKSPACE_SHEETS.length) % WORKSPACE_SHEETS.length;
        choose(WORKSPACE_SHEETS[next].key); document.getElementById(`trip-tab-${WORKSPACE_SHEETS[next].key}`)?.focus();
      }} className={`relative shrink-0 border-r border-t border-slate-200 px-2 py-0.5 text-[10px] leading-5 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-500 ${active === sheet.key ? "border-t-white bg-white font-semibold text-blue-800 before:absolute before:-top-px before:left-0 before:right-0 before:h-px before:bg-white" : "bg-slate-100 text-slate-500 hover:bg-slate-50"}`}>{sheet.title}</button>)}
    </nav>
  </section>;
}
