import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  deleteOperationsReport,
  fetchAssignedOperations,
  fetchOperationsReceipts,
  fetchOperationsOverview,
  getCachedOperations,
  invalidateOperationsReportsCache,
  saveLoadingReport,
  saveUnloadingReport,
  updateScopedReport,
  updateOffloadItem,
  updateOperationsAssignment,
  updateOperationsEventType,
  updateOperationsStop,
  updateOperationsTrip,
  type OperationsEventType,
  type OperationsOffloadItem,
  type OperationsSourceType,
  type OperationsReportData,
  type OperationsEventRow,
  type OperationsReceiptEventType,
  type OperationsReceipt,
  type ScopeReport,
} from "../../services/operations-report.service";
import { ReportColumnActionsMenu, ReportColumnColorDialog, ReportTextCellEditor, ReportRowActionButton } from "./ReportSpreadsheetShared";
import ReportDropdownEditor, { type ReportDropdownChoice } from "./ReportDropdownEditor";
import { REPORT_GRID_BODY_CELL_CLASS, REPORT_GRID_HEADER_CELL_CLASS, REPORT_GRID_ROW_CLASS, REPORT_GRID_VIEWPORT_CLASS, chooseAutomaticPinSide, reorderColumnKeys } from "./ReportSpreadsheetUtils";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import type { RelationshipOption } from "../../services/lookup.service";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import { useDeferredRealtimeRefresh } from "./useDeferredRealtimeRefresh";
import { deleteConfirmedOperationsReports, operationsDeleteTargets } from "../../services/operations-report-delete";
import SlidingSegmentedControl from "./SlidingSegmentedControl";
import OperationsEventSubmissionForm from "./OperationsEventSubmissionForm";
import TableState from "./TableState";
import { TableSkeleton } from "./DashboardPrimitives";
import { useSharedTableWidths } from "./useSharedTableWidths";
import {useSharedTableDesign} from "./useSharedTableDesign";
import {designLayout,designChanges} from "../../services/shared-table-design";
import ColumnFinder from "./ColumnFinder";
import HiddenColumnsControl from "./HiddenColumnsControl";
import OffloadCleanupNotice from "./OffloadCleanupNotice";
import ReportImageGallery from "./ReportImageGallery";
import OperationsReporterEditor from "./OperationsReporterEditor";
import { exactOffloadReport } from "../../services/operations-offload-target";
import { manilaDateTime, manilaDateTimeToIso } from "../../services/offload-form.logic";

type Mode = "management" | "trucker";
type Kind = "loading" | "unloading" | "backloads" | "offloads";
type TimelineDraft = { warehouse_arrival_at: string; loading_start_at: string; loading_finished_at: string };
type StopDraft = { arrival_time: string; start_unloading_time: string; finish_unloading_time: string };
type OffloadInlineItem = { id: string; report: ScopeReport; persisted: OperationsOffloadItem | null };
type OperationsRowEditDraft = {
  row: OperationsEventRow;
  dispatchNumber: string;
  deliveryDate: string;
  reportDate: string;
  reporter: { id: string; name: string } | null;
  remarks: string;
  truck: RelationshipOption | null;
  driver: RelationshipOption | null;
  eventTypes: OperationsEventRow["event_type_records"];
  backloads: ScopeReport[];
  offloads: ScopeReport[];
  offloadItems: Array<{ report: ScopeReport; item: OperationsOffloadItem; quantity: string; totalCbm: string }>;
};

const emptyData: OperationsReportData = { trips: [], trip_options: [], stops: [], loading: [], unloading: [], backloads: [], offloads: [], event_rows: [] };
const inputClass = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#2678b9] focus:outline-none focus:ring-2 focus:ring-blue-100";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-[#0b2341] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16385f] disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

function inputTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function outputTime(value: string) { return value ? new Date(value).toISOString() : null; }
function tripLabel(trip: OperationsReportData["trips"][number]) { return trip.dispatch_number || trip.trip_number || trip.id; }
function pendingOffloadItemId(reportId: string, sourceItemId: string | null) {
  const storageKey = `alzhentms:pending-offload-item:${reportId}:${sourceItemId ?? "standalone"}`;
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export default function OperationsReportsView({ mode, onOpenTrip }: { mode: Mode; onOpenTrip?: (tripId: string, stopId?: string | null) => void }) {
  const { accessToken, profile } = useAuth();
  const [active, setActive] = useState<Kind>("loading");
  const cached = accessToken ? getCachedOperations(accessToken, mode === "trucker") : null;
  const [dataState, setDataState] = useState(() => ({ token: accessToken, mode, value: cached ?? emptyData }));
  const data = dataState.token === accessToken && dataState.mode === mode ? dataState.value : cached ?? emptyData;
  const [loading, setLoading] = useState(!cached);
  const [hasLoadedState, setHasLoaded] = useState(Boolean(cached));
  const hasLoaded = dataState.token === accessToken && dataState.mode === mode ? hasLoadedState : Boolean(cached);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSubmission, setShowSubmission] = useState(false);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const [loadingDrafts, setLoadingDrafts] = useState<Record<string, TimelineDraft>>({});
  const [stopDrafts, setStopDrafts] = useState<Record<string, StopDraft>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, Pick<ScopeReport, "reason" | "number_of_boxes" | "comments">>>({});
  const [editReportId, setEditReportId] = useState<string | null>(null);
  const loadingDirty = useRef<Record<string, Set<keyof TimelineDraft>>>({});
  const stopDirty = useRef<Record<string, Set<keyof StopDraft>>>({});
  const gridInteraction = useRef<() => boolean>(() => false);
  const registerGridInteraction = useCallback((check: () => boolean) => { gridInteraction.current = check; }, []);
  const realtimeLoad = useRef<() => Promise<void>>(async () => {});
  const realtimeGate = useDeferredRealtimeRefresh(() => realtimeLoad.current(), () => Boolean(busy || showSubmission || editReportId || gridInteraction.current()));

  const load = useCallback(async (quiet = false, propagateError = false, deferForEditing = false) => {
    if (!accessToken) return;
    const version = ++requestVersion.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const response = mode === "trucker" ? await fetchAssignedOperations(accessToken) : await fetchOperationsOverview(accessToken);
      if (version !== requestVersion.current) return;
      if (deferForEditing && realtimeGate.blocked()) { realtimeGate.request(); return; }
      setDataState({ token: accessToken, mode, value: response });
      setHasLoaded(true);
      setLoadingDrafts((current) => {
        const next = { ...current };
        response.trips.forEach((trip) => {
          const row = response.loading.find((item) => item.trip_id === trip.id);
          const server: TimelineDraft = { warehouse_arrival_at: inputTime(row?.warehouse_arrival_at), loading_start_at: inputTime(row?.loading_start_at), loading_finished_at: inputTime(row?.loading_finished_at) };
          const previous = next[trip.id] ?? server;
          const dirty = loadingDirty.current[trip.id] ?? new Set<keyof TimelineDraft>();
          next[trip.id] = { warehouse_arrival_at: dirty.has("warehouse_arrival_at") ? previous.warehouse_arrival_at : server.warehouse_arrival_at, loading_start_at: dirty.has("loading_start_at") ? previous.loading_start_at : server.loading_start_at, loading_finished_at: dirty.has("loading_finished_at") ? previous.loading_finished_at : server.loading_finished_at };
        });
        return next;
      });
      setStopDrafts((current) => {
        const next = { ...current };
        response.stops.forEach((stop) => {
          const server: StopDraft = { arrival_time: inputTime(stop.arrival_time), start_unloading_time: inputTime(stop.start_unloading_time), finish_unloading_time: inputTime(stop.finish_unloading_time) };
          const previous = next[stop.id] ?? server;
          const dirty = stopDirty.current[stop.id] ?? new Set<keyof StopDraft>();
          next[stop.id] = { arrival_time: dirty.has("arrival_time") ? previous.arrival_time : server.arrival_time, start_unloading_time: dirty.has("start_unloading_time") ? previous.start_unloading_time : server.start_unloading_time, finish_unloading_time: dirty.has("finish_unloading_time") ? previous.finish_unloading_time : server.finish_unloading_time };
        });
        return next;
      });
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(cause instanceof Error ? cause.message : "Unable to load operational reports.");
      if (propagateError) throw cause;
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [accessToken, mode, realtimeGate]);
  useEffect(() => { realtimeLoad.current = () => { invalidateOperationsReportsCache(); return load(true, false, true); }; }, [load]);

  async function openSubmission() {
    setShowSubmission(true);
    setSubmissionLoading(true);
    setSubmissionError(null);
    invalidateOperationsReportsCache();
    try { await load(true, true); }
    catch (cause) { setSubmissionError(cause instanceof Error ? cause.message : "Unable to load current dispatch numbers. Close and reopen Add Report to retry."); }
    finally { setSubmissionLoading(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [load]);
  useEffect(() => {
    if (mode !== "management") return;
    return subscribeToAdminRealtime((event) => {
      const relevant = ["trips", "trip_stops", "trip_line_items", "trip_truck_assignments", "loading_reports", "unloading_reports", "backloads", "offloads", "offload_items", "report_receipts", "operations_report_conversions", "drivers", "trucks", "profiles", "warehouses", "customers", "customer_stores"];
      if (event.kind === "batch") {
        if (event.tables.some((table) => relevant.includes(table) || ["backload_items", "offload_deletion_jobs", "transaction_deletion_jobs"].includes(table))) realtimeGate.request();
        return;
      }
      if (event.kind === "resume" || (event.kind === "recovered" && relevant.includes(event.table)) || (event.kind === "change" && relevant.includes(event.payload.table))) {
        realtimeGate.request();
      }
    });
  }, [load, mode, realtimeGate]);

  const tabs = [
    { value: "loading", label: "Loading" },
    { value: "unloading", label: "Unloading" },
    { value: "backloads", label: "Backload" },
    { value: "offloads", label: "Offload" },
  ] as const;
  const stopById = useMemo(() => new Map(data.stops.map((stop) => [stop.id, stop])), [data.stops]);
  const tripById = useMemo(() => new Map(data.trips.map((trip) => [trip.id, trip])), [data.trips]);
  const reportScope = (report: ScopeReport) => report.trip_stop_id ? `Stop ${stopById.get(report.trip_stop_id)?.stop_sequence ?? "—"}` : "Whole trip";

  async function submitLoading(event: FormEvent, tripId: string) {
    event.preventDefault(); if (!accessToken) return;
    const dirty = loadingDirty.current[tripId] ?? new Set<keyof TimelineDraft>();
    if (!dirty.size) { setNotice("There are no loading-time changes to save."); return; }
    setBusy(`loading:${tripId}`); setError(null); setNotice(null);
    try {
      const draft = loadingDrafts[tripId] ?? { warehouse_arrival_at: "", loading_start_at: "", loading_finished_at: "" };
      const values: Record<string, string | null> = {};
      dirty.forEach((field) => { values[field] = outputTime(draft[field]); });
      const saved = await saveLoadingReport(accessToken, tripId, values);
      delete loadingDirty.current[tripId];
      setLoadingDrafts((current) => ({ ...current, [tripId]: { warehouse_arrival_at: inputTime(saved.warehouse_arrival_at), loading_start_at: inputTime(saved.loading_start_at), loading_finished_at: inputTime(saved.loading_finished_at) } }));
      setNotice("Loading report saved."); await load(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save loading report."); }
    finally { setBusy(null); }
  }

  async function submitUnloading(event: FormEvent, tripId: string, stopId: string) {
    event.preventDefault(); if (!accessToken) return;
    const dirty = stopDirty.current[stopId] ?? new Set<keyof StopDraft>();
    if (!dirty.size) { setNotice("There are no unloading-time changes to save."); return; }
    setBusy(`unloading:${stopId}`); setError(null); setNotice(null);
    try {
      const draft = stopDrafts[stopId] ?? { arrival_time: "", start_unloading_time: "", finish_unloading_time: "" };
      const values: Record<string, string | null> = {};
      dirty.forEach((field) => { values[field] = outputTime(draft[field]); });
      const saved = await saveUnloadingReport(accessToken, tripId, stopId, values);
      delete stopDirty.current[stopId];
      setStopDrafts((current) => ({ ...current, [stopId]: { arrival_time: inputTime(saved.stop.arrival_time), start_unloading_time: inputTime(saved.stop.start_unloading_time), finish_unloading_time: inputTime(saved.stop.finish_unloading_time) } }));
      setNotice("Unloading report saved."); await load(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save unloading report."); }
    finally { setBusy(null); }
  }

  async function saveCargo(event: FormEvent, kind: "backloads" | "offloads", report: ScopeReport) {
    event.preventDefault(); if (!accessToken) return;
    setBusy(`edit:${report.id}`); setError(null); setNotice(null);
    const draft = reportDrafts[report.id] ?? { reason: report.reason, number_of_boxes: report.number_of_boxes, comments: report.comments };
    try {
      await updateScopedReport(accessToken, kind, report.id, { trip_id: report.trip_id, trip_stop_id: report.trip_stop_id, reason: draft.reason, number_of_boxes: draft.number_of_boxes, comments: draft.comments });
      setEditReportId(null); setNotice("Report changes saved."); await load(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update report."); }
    finally { setBusy(null); }
  }

  const filteredTrips = data.trips;
  const cargoReports = active === "backloads" ? data.backloads : data.offloads;
  const addReportButton = <button type="button" onClick={() => void openSubmission()} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] transition hover:bg-[#f2c200] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40"><span aria-hidden="true" className="text-base leading-none">+</span>Add Report</button>;

  return <section className="space-y-4" aria-label="Loading, unloading, backload and offload reports">
    {mode === "trucker" && <div className="flex flex-wrap items-center justify-between gap-3">
      {mode === "trucker" && <h2 className="text-lg font-bold text-[#0b2341]">Trip reports</h2>}
      {mode === "trucker" && <SlidingSegmentedControl aria-label="Operational report type" options={tabs} value={active} onChange={(value) => setActive(value)} />}
      {addReportButton}
    </div>}
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><span>{error}</span><button type="button" className="font-semibold underline" onClick={() => void load(false)} disabled={loading}>Retry loading reports</button></div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {mode === "management" && <OperationsEventsTable rows={data.event_rows} loading={loading} hasLoaded={hasLoaded} loadError={error} token={accessToken ?? ""} profileId={profile?.id} canManageReports={["ADMIN", "STAFF"].includes(profile?.role ?? "")} onOpenTrip={onOpenTrip} onSaved={() => load(true, true)} toolbarActions={addReportButton} onInteractionCheck={registerGridInteraction} />}
    {mode === "trucker" && loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading assigned trip reports…</div> : null}
    {mode === "trucker" && <details open className={`${cardClass} group`}>
    <div className="space-y-4">
    {!loading && hasLoaded && active === "loading" && <div className="space-y-3">{filteredTrips.length === 0 ? <Empty text="No trips are available." /> : filteredTrips.map((trip) => {
      const draft = loadingDrafts[trip.id] ?? { warehouse_arrival_at: "", loading_start_at: "", loading_finished_at: "" };
      return <form key={trip.id} className={cardClass} onSubmit={(event) => void submitLoading(event, trip.id)}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-[#0b2341]">{tripLabel(trip)}</h3><p className="text-xs text-slate-500">{trip.status ?? "Trip"} · one record per trip</p></div><button className={buttonClass} disabled={busy === `loading:${trip.id}`} type="submit">{busy === `loading:${trip.id}` ? "Saving…" : "Save loading times"}</button></div><div className="grid gap-3 sm:grid-cols-3">{(["warehouse_arrival_at", "loading_start_at", "loading_finished_at"] as const).map((field) => <label key={field} className="text-xs font-semibold text-slate-600">{field === "warehouse_arrival_at" ? "Warehouse arrival" : field === "loading_start_at" ? "Loading started" : "Loading finished"}<input type="datetime-local" className={`${inputClass} mt-1`} value={draft[field]} onChange={(event) => { const dirty = loadingDirty.current[trip.id] ?? new Set<keyof TimelineDraft>(); dirty.add(field); loadingDirty.current[trip.id] = dirty; setLoadingDrafts((current) => ({ ...current, [trip.id]: { ...draft, [field]: event.target.value } })); }} /></label>)}</div></form>;
    })}</div>}
    {!loading && hasLoaded && active === "unloading" && <div className="space-y-3">{data.stops.length === 0 ? <Empty text={mode === "trucker" ? "No stops are available for your active assigned trips." : "No trip stops are available."} /> : data.stops.map((stop) => {
      const draft = stopDrafts[stop.id] ?? { arrival_time: "", start_unloading_time: "", finish_unloading_time: "" };
      const trip = data.trips.find((item) => item.id === stop.trip_id);
      return <form key={`${stop.trip_id}:${stop.id}`} className={cardClass} onSubmit={(event) => void submitUnloading(event, stop.trip_id, stop.id)}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-[#0b2341]">{trip ? tripLabel(trip) : "Trip"} · Stop {stop.stop_sequence ?? "—"}</h3><p className="text-xs text-slate-500">This timeline belongs only to this stop.</p></div><button className={buttonClass} disabled={busy === `unloading:${stop.id}`} type="submit">{busy === `unloading:${stop.id}` ? "Saving…" : "Save unloading times"}</button></div><div className="grid gap-3 sm:grid-cols-3">{(["arrival_time", "start_unloading_time", "finish_unloading_time"] as const).map((field) => <label key={field} className="text-xs font-semibold text-slate-600">{field === "arrival_time" ? "Store arrival" : field === "start_unloading_time" ? "Unloading started" : "Unloading finished"}<input type="datetime-local" className={`${inputClass} mt-1`} value={draft[field]} onChange={(event) => { const dirty = stopDirty.current[stop.id] ?? new Set<keyof StopDraft>(); dirty.add(field); stopDirty.current[stop.id] = dirty; setStopDrafts((current) => ({ ...current, [stop.id]: { ...draft, [field]: event.target.value } })); }} /></label>)}</div></form>;
    })}</div>}
    {!loading && hasLoaded && (active === "backloads" || active === "offloads") && <div className="space-y-4">
      <div className="space-y-3">{cargoReports.length === 0 ? <Empty text={active === "offloads" ? "No offload data or reports yet." : "No backload reports have been recorded."} /> : cargoReports.map((report) => { const draft = reportDrafts[report.id] ?? { reason: report.reason, number_of_boxes: report.number_of_boxes, comments: report.comments }; const trip = tripById.get(report.trip_id); return <article key={report.id} className={cardClass}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-[#0b2341]">{trip ? tripLabel(trip) : report.trip_id}</h3><p className="text-xs text-slate-500">{reportScope(report)} · record {report.id}</p></div><button type="button" className="text-sm font-semibold text-[#2678b9] underline" onClick={() => setEditReportId(editReportId === report.id ? null : report.id)}>{editReportId === report.id ? "Close editor" : "Edit"}</button></div>{editReportId === report.id ? <form onSubmit={(event) => void saveCargo(event, active, report)} className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Reason<input className={`${inputClass} mt-1`} value={draft.reason ?? ""} onChange={(event) => setReportDrafts((current) => ({ ...current, [report.id]: { ...draft, reason: event.target.value || null } }))} /></label><label className="text-xs font-semibold text-slate-600">Number of boxes<input type="number" min="0" step="1" className={`${inputClass} mt-1`} value={draft.number_of_boxes ?? ""} onChange={(event) => setReportDrafts((current) => ({ ...current, [report.id]: { ...draft, number_of_boxes: event.target.value === "" ? null : Number(event.target.value) } }))} /></label><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Comments<textarea rows={2} className={`${inputClass} mt-1`} value={draft.comments ?? ""} onChange={(event) => setReportDrafts((current) => ({ ...current, [report.id]: { ...draft, comments: event.target.value || null } }))} /></label><button className={buttonClass} type="submit" disabled={busy === `edit:${report.id}`}>{busy === `edit:${report.id}` ? "Saving…" : "Save changes"}</button></form> : <div className="grid gap-2 text-sm sm:grid-cols-3"><p><span className="font-semibold">Reason:</span> {report.reason || "—"}</p><p><span className="font-semibold">Boxes:</span> {report.number_of_boxes ?? "—"}</p><p className="sm:col-span-3"><span className="font-semibold">Comments:</span> {report.comments || "—"}</p></div>}<OperationsReceiptGallery token={accessToken ?? ""} kind={active} recordId={report.id} /></article>; })}</div>
    </div>}
    </div></details>}
    {showSubmission && <div className="fixed inset-0 z-[2100] flex items-start justify-center overflow-y-auto bg-slate-900/20 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation">
      <div className="w-full max-w-3xl">
        <OperationsEventSubmissionForm token={accessToken ?? ""} tripOptions={data.trip_options} tripsLoading={submissionLoading} tripsError={submissionError} onSubmitted={async () => {
          await load(true, true);
        }} onComplete={(message) => {
          setShowSubmission(false);
          if (message) setNotice(message);
        }} onCancel={() => setShowSubmission(false)} />
      </div>
    </div>}
  </section>;
}

function EventTypeEditor({ token, sourceType, recordId, eventType, onSaved, style, className }: { token: string; sourceType: OperationsSourceType; recordId: string; eventType: OperationsEventType; onSaved: () => void | Promise<void>; style?: CSSProperties; className: string }) {
  const [value, setValue] = useState(eventType);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const saving = useRef(false);
  const options: ReportDropdownChoice[] = ["Loading", "Unloading", "Backload", "Offload"].map((option) => ({ value: option, label: option }));
  const valueColors: Record<OperationsEventType, string> = {
    Loading: "bg-blue-50 text-blue-700",
    Unloading: "bg-green-50 text-green-700",
    Backload: "bg-orange-50 text-orange-700",
    Offload: "bg-red-50 text-red-700",
  };
  const dropdownOptionColors = `
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(2) button[role="option"],
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(2) button[role="option"] span,
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(2) button[role="option"] span span { background-color:#eff6ff !important; color:#1d4ed8 !important; }
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(3) button[role="option"],
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(3) button[role="option"] span,
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(3) button[role="option"] span span { background-color:#f0fdf4 !important; color:#15803d !important; }
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(4) button[role="option"],
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(4) button[role="option"] span,
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(4) button[role="option"] span span { background-color:#fff7ed !important; color:#c2410c !important; }
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(5) button[role="option"],
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(5) button[role="option"] span,
    [aria-label="Event Type for report ${recordId} options"] > div:nth-child(5) button[role="option"] span span { background-color:#fef2f2 !important; color:#b91c1c !important; }
  `;

  async function save(nextValue: OperationsEventType) {
    if (saving.current) return;
    if (nextValue === value) { setEditing(false); return; }
    saving.current = true;
    setValue(nextValue);
    setMessage("Saving…");
    setHasError(false);
    setBusy(true);
    try {
      const saved = await updateOperationsEventType(token, sourceType, recordId, nextValue);
      const confirmed = saved.event_type;
      if (confirmed !== "Loading" && confirmed !== "Unloading" && confirmed !== "Backload" && confirmed !== "Offload") {
        throw new Error("The server did not confirm the saved Event Type.");
      }
      setValue(confirmed);
      setMessage("Saved");
      setEditing(false);
      try {
        await onSaved();
      } catch (cause) {
        setMessage(`Saved; table refresh failed: ${cause instanceof Error ? cause.message : "retry refresh"}`);
        setHasError(true);
      }
    } catch (cause) {
      setValue(eventType);
      setEditing(false);
      setMessage(cause instanceof Error ? cause.message : "Unable to save Event Type.");
      setHasError(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <td style={style} data-cell-hover-disabled={!editing ? undefined : "true"} tabIndex={editing ? undefined : 0}
    onClick={() => { if (!editing && !busy) setEditing(true); }}
    onKeyDown={(event) => {
      if (!editing && (event.key === "Enter" || event.key === "F2")) { event.preventDefault(); setEditing(true); }
      else if (editing && event.key === "Escape") setEditing(false);
    }}
    className={className + " relative cursor-text " + (!editing ? "hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2678b9] " : "")} title="Edit Event Type">
    {editing ? <><style>{dropdownOptionColors}</style><ReportDropdownEditor label={`Event Type for report ${recordId}`} value={value} displayValue={value} options={options} disabled={busy}
      onSelect={(next) => { const selected = next as OperationsEventType; void save(selected); }}
      onCommitSelection={(next) => void save(next as OperationsEventType)}
      onCommitBlur={() => setEditing(false)} onClose={() => setEditing(false)} /></> : <><span className={`inline-block rounded-sm px-1 text-sm font-medium ${valueColors[value]}`}>{value}</span>{message && <span role={hasError ? "alert" : "status"} className={`ml-2 text-[10px] ${hasError ? "text-rose-700" : busy ? "text-slate-500" : "text-emerald-700"}`}>{message}</span>}</>}
  </td>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>; }

function OperationsReceiptGallery({ token, kind, recordId }: { token: string; kind: Kind; recordId: string }) {
  const [result, setResult] = useState<{ scope: string; receipts: OperationsReceipt[]; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const receiptType: OperationsReceiptEventType = kind === "loading" ? "LOADING" : kind === "unloading" ? "UNLOADING" : kind === "backloads" ? "BACKLOAD" : "OFFLOAD";
  const scope = `${token}:${receiptType}:${recordId}:${attempt}`;
  useEffect(() => {
    let current = true;
    void fetchOperationsReceipts(token, receiptType, recordId)
      .then((receipts) => { if (current) setResult({ scope, receipts, error: null }); })
      .catch((cause) => { if (current) setResult({ scope, receipts: [], error: cause instanceof Error ? cause.message : "Unable to load report images." }); });
    return () => { current = false; };
  }, [receiptType, recordId, token, scope]);
  if (result?.scope !== scope) return <p role="status" className="mt-2 text-xs text-slate-500">Loading report images…</p>;
  if (result.error) return <p role="alert" className="mt-2 text-xs text-rose-700">Images could not be loaded: {result.error} <button type="button" className="font-semibold underline" onClick={() => setAttempt((value) => value + 1)}>Retry images</button></p>;
  return <ReportImageGallery images={result.receipts} />;
}

function OffloadItemFieldEditor({ token, model, field, onSaved }: { token: string; model: OffloadInlineItem; field: "quantity" | "total_cbm"; onSaved: () => void | Promise<void> }) {
  const saved = model.persisted?.[field];
  const original = model.persisted ? saved : null;
  const [value, setValue] = useState(original == null ? "" : String(original));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [editing, setEditing] = useState(false);
  const saving = useRef(false);
  const label = field === "quantity" ? "Quantity" : "Total CBM";
  const save = async () => {
    if (saving.current) return;
    setHasError(false);
    const numeric = value.trim() === "" ? null : Number(value);
    if (numeric !== null && (!Number.isFinite(numeric) || numeric < 0)) {
      setMessage(`${label} must be a non-negative number.`); setHasError(true); return;
    }
    if (numeric === (original == null ? null : Number(original))) { setEditing(false); return; }
    if (numeric === null && !model.persisted) { setEditing(false); return; }
    setMessage("Saving…");
    saving.current = true;
    setBusy(true);
    let mutationCompleted = false;
    try {
      await updateOffloadItem(token, model.report, { id: model.id, trip_line_item_id: model.persisted?.trip_line_item_id ?? null }, { [field]: numeric });
      mutationCompleted = true;
      await onSaved();
      setMessage("Saved");
      setEditing(false);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : `Unable to save ${label.toLowerCase()}.`;
      setMessage(mutationCompleted
        ? `The save may have completed, but the report could not be refreshed. Retry this edit to confirm safely. ${detail}`
        : `Save not confirmed. Your draft is still here; retry when ready. ${detail}`);
      setHasError(true);
    } finally { saving.current = false; setBusy(false); }
  };
  return <div className="min-w-0 text-left">
    {editing ? <ReportTextCellEditor value={value} type="number" step="any" label={`${label} for Offload ${model.report.id} item ${model.id}`} disabled={busy}
      onChange={setValue} onCommit={() => void save()} onCancel={() => { setValue(original == null ? "" : String(original)); setEditing(false); }}
      className="w-full min-w-20 rounded-md border border-blue-300 bg-white px-2 py-1.5 text-left text-sm tabular-nums text-slate-800 outline-none focus:ring-2 focus:ring-blue-100" /> : <button type="button" disabled={busy} onClick={() => { setMessage(""); setHasError(false); setEditing(true); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); setMessage(""); setHasError(false); setEditing(true); } }}
      className="w-full cursor-text rounded-sm px-1 py-0.5 text-left text-sm tabular-nums text-slate-800 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]" title={`Edit ${label}`}>{original == null ? "—" : String(original)}</button>}
    {message && <p role={hasError ? "alert" : "status"} className={`text-left text-[10px] ${hasError ? "text-rose-700" : busy ? "text-slate-500" : "text-emerald-700"}`}>{message}</p>}
  </div>;
}

function dateLabelSafe(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? {} : { timeStyle: "short" as const }), timeZone: "Asia/Manila" }).format(date);
}

type EventFilter = "All" | OperationsEventRow["report_type"];
type EventSortKey = "date" | "trip" | "plate_number" | "driver_name" | "route" | "dr_number" | "quantity" | "total_cbm" | "report_type" | "remarks" | "reported_by";
type EventColumnKey = EventSortKey | "trip" | "details";
type EditableEventField = "plate_number" | "driver_name" | "remarks" | "reported_by" | "delivery_date" | "dispatch_number";
const OPERATIONS_COLUMNS: Array<{ key: EventColumnKey; label: string; width: number; sortable: boolean }> = [
  { key: "date", label: "Date", width: 180, sortable: true },
  { key: "trip", label: "Trip / Dispatch", width: 180, sortable: true },
  { key: "plate_number", label: "Plate Number", width: 190, sortable: true },
  { key: "driver_name", label: "Driver", width: 220, sortable: true },
  { key: "route", label: "Route", width: 360, sortable: true },
  { key: "dr_number", label: "DR Number", width: 280, sortable: true },
  { key: "quantity", label: "Quantity", width: 160, sortable: true },
  { key: "total_cbm", label: "Total CBM", width: 150, sortable: true },
  { key: "report_type", label: "Report / Event Type", width: 210, sortable: true },
  { key: "remarks", label: "Remarks", width: 380, sortable: true },
  { key: "reported_by", label: "Reported By", width: 220, sortable: true },
  { key: "details", label: "Details", width: 160, sortable: false },
];
const OPERATIONS_COLUMN_STORAGE_KEY = "alzhen:operations-report-column-layout:v1";

function operationsColumnForeground(color?: string) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 < 0.55 ? "#ffffff" : "#172b43";
}

function readOperationsColumnLayout(storageKey = OPERATIONS_COLUMN_STORAGE_KEY) {
  const initial = { order: OPERATIONS_COLUMNS.map((column) => column.key), hidden: [] as EventColumnKey[], widths: {} as Record<string, number>, pins: { date: "left", details: "right" } as Record<string, "left" | "right">, colors: {} as Record<string, string> };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem(OPERATIONS_COLUMN_STORAGE_KEY) ?? "null") as Partial<typeof initial> | null;
    if (!saved) return initial;
    return {
      order: Array.isArray(saved.order) ? [...initial.order.filter((key) => saved.order?.includes(key)), ...initial.order.filter((key) => !saved.order?.includes(key))] : initial.order,
      hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((key): key is EventColumnKey => initial.order.includes(key as EventColumnKey)) : initial.hidden,
      widths: saved.widths ?? initial.widths,
      pins: saved.pins ?? initial.pins,
      colors: saved.colors ?? initial.colors,
    };
  } catch { return initial; }
}

export function OperationsEventsTable({ rows, loading, hasLoaded, loadError, token, profileId, canManageReports = false, onOpenTrip, onSaved, toolbarActions, onInteractionCheck }: { rows: OperationsEventRow[]; loading: boolean; hasLoaded: boolean; loadError: string | null; token: string; profileId?: string; canManageReports?: boolean; onOpenTrip?: (tripId: string, stopId?: string | null) => void; onSaved: () => void | Promise<void>; toolbarActions?: ReactNode; onInteractionCheck?: (check: () => boolean) => void }) {
  const [filter, setFilter] = useState<EventFilter>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: EventSortKey; direction: "asc" | "desc" }>({ key: "date", direction: "desc" });
  const [editing, setEditing] = useState<{ rowId: string; field: EditableEventField; value: string; original: string; reporterId?: string } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; field: string } | null>(null);
  const [detailRow, setDetailRow] = useState<OperationsEventRow | null>(null);
  const [feedback, setFeedback] = useState<{ rowId: string; field: string; kind: "saving" | "saved" | "error"; message: string } | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState<{ source: OperationsEventRow[]; rows: OperationsEventRow[] }>(() => ({ source: rows, rows }));
  const localRows = localSnapshot.source === rows ? localSnapshot.rows : rows;
  const selectedOption = useRef<RelationshipOption | null>(null);
  const saving = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layoutKey = `${OPERATIONS_COLUMN_STORAGE_KEY}:${profileId ?? "guest"}`;
  const sharedWidths = useSharedTableWidths("operations", token, canManageReports);
  const [draggingWidth, setDraggingWidth] = useState(false);
  const [layoutState, setLayoutState] = useState(() => ({ key: layoutKey, value: readOperationsColumnLayout(layoutKey) }));
  const localLayout = useMemo(() => layoutState.key === layoutKey ? layoutState.value : readOperationsColumnLayout(layoutKey), [layoutState, layoutKey]);
  const resizeCleanup = useRef<(() => void) | null>(null);
  const resizing = useRef(false);
  const [openColumnMenu, setOpenColumnMenu] = useState<{ key: EventColumnKey; left: number; top: number } | null>(null);
  const [editingColumnColor, setEditingColumnColor] = useState<EventColumnKey | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<EventColumnKey | null>(null);
  const [expandedLineItemsRow, setExpandedLineItemsRow] = useState<string | null>(null);
  const [selectedRowState, setSelectedRowState] = useState<{ datasetKey: string; source: OperationsEventRow[]; ids: Set<string> }>(() => ({ datasetKey: "", source: rows, ids: new Set() }));
  const [editingCargoRecord, setEditingCargoRecord] = useState<string | null>(null);
  const [cargoRecordDrafts, setCargoRecordDrafts] = useState<Record<string, ScopeReport>>({});
  const [rowEdit, setRowEdit] = useState<OperationsRowEditDraft | null>(null);
  const sharedDesign=useSharedTableDesign("operations",token,canManageReports,Boolean(editing||rowEdit||draggingWidth||draggedColumn));
  const layout=useMemo(()=>({...designLayout(localLayout,OPERATIONS_COLUMNS.map(c=>c.key),sharedDesign.columns,sharedDesign.loaded),widths:draggingWidth?localLayout.widths:{...(sharedWidths.loaded?{}:localLayout.widths),...sharedWidths.widths}}),[localLayout,sharedDesign.columns,sharedDesign.loaded,draggingWidth,sharedWidths.loaded,sharedWidths.widths]);
  const setLayout=(update:typeof layout|((current:typeof layout)=>typeof layout))=>{const next=typeof update==="function"?update(layout):update;setLayoutState({key:layoutKey,value:next});for(const [key,patch] of Object.entries(designChanges(layout,next)))void sharedDesign.save(key,patch,layout.widths[key]??OPERATIONS_COLUMNS.find(c=>c.key===key)?.width??180);};
  const [rowEditBusy, setRowEditBusy] = useState(false);
  const rowEditSaving = useRef(false);
  const [rowEditError, setRowEditError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const interaction = useRef<() => boolean>(() => false);
  useEffect(() => {
    interaction.current = () => Boolean(editing || rowEdit || rowEditBusy || deleteConfirmation || deleteBusy || draggingWidth || viewportRef.current?.querySelector('td[data-cell-hover-disabled="true"] input:not([type=checkbox]),td[data-cell-hover-disabled="true"] textarea,td[data-cell-hover-disabled="true"] [role=combobox]'));
  }, [editing, rowEdit, rowEditBusy, deleteConfirmation, deleteBusy, draggingWidth]);
  useEffect(() => {
    onInteractionCheck?.(() => interaction.current());
    return () => onInteractionCheck?.(() => false);
  }, [onInteractionCheck]);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [cleanupVersion, setCleanupVersion] = useState(0);
  const [deleteOutcomes, setDeleteOutcomes] = useState<Array<{ id: string; label: string; message: string }>>([]);
  const deleteSaving = useRef(false);

  useEffect(() => { if (resizing.current) return; try { localStorage.setItem(layoutKey, JSON.stringify(layout)); } catch { /* layout remains available for this session */ } }, [layout, layoutKey]);
  useEffect(() => () => resizeCleanup.current?.(), []);

  const filters: EventFilter[] = ["All", "Loading", "Unloading", "Backload", "Offload"];
  const columns = layout.order.flatMap((key) => {
    const column = OPERATIONS_COLUMNS.find((item) => item.key === key);
    return column && !layout.hidden.includes(key) ? [{ ...column, width: layout.widths[key] ?? column.width }] : [];
  });
  const leftPins = columns.filter((column) => layout.pins[column.key] === "left");
  const rightPins = columns.filter((column) => layout.pins[column.key] === "right");
  const leftOffsets = new Map<EventColumnKey, number>();
  let leftOffset = 44;
  leftPins.forEach((column) => { leftOffsets.set(column.key, leftOffset); leftOffset += column.width; });
  const rightOffsets = new Map<EventColumnKey, number>();
  let rightOffset = 0;
  [...rightPins].reverse().forEach((column) => { rightOffsets.set(column.key, rightOffset); rightOffset += column.width; });
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = localRows.filter((row) => {
      if (filter !== "All" && !row.report_types.includes(filter)) return false;
      const cargoText = [...row.backload_records, ...row.offload_records].flatMap((record) => [record.reason, record.number_of_boxes, record.comments]);
      return !query || [row.trip_number, row.dispatch_number, row.plate_number, row.driver_name, row.route, row.dr_number, row.quantity, row.total_cbm, ...row.report_types, row.remarks, row.reported_by, ...cargoText]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
    });
    return filtered.sort((left, right) => {
          const a = sort.key === "trip" ? left.dispatch_number ?? left.trip_number : sort.key === "report_type" ? left.report_types.join(", ") : left[sort.key];
          const b = sort.key === "trip" ? right.dispatch_number ?? right.trip_number : sort.key === "report_type" ? right.report_types.join(", ") : right[sort.key];
      const comparison = typeof a === "number" || typeof b === "number"
        ? Number(a ?? 0) - Number(b ?? 0)
        : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [filter, localRows, search, sort]);
  const offloadItemsByRow = useMemo(() => new Map<string, OffloadInlineItem[]>(localRows.map((row) => {
    const editors: OffloadInlineItem[] = row.offload_records.flatMap((record): OffloadInlineItem[] => {
      const report = record as ScopeReport;
      const persisted = record.items ?? [];
      if (persisted.length) return persisted.map((item) => ({ id: item.id, report, persisted: item }));
      return [{
        id: pendingOffloadItemId(String(record.id), null),
        report,
        persisted: null,
      }];
    });
    return [row.id, editors] as const;
  })), [localRows]);
  const sortBy = (key: EventSortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const selectionDatasetKey = JSON.stringify([filter, search, visibleRows.map((row) => [row.id, row.source_type, row.source_record_id, row.trip_id, row.trip_stop_id]).sort()]);
  const selectedRows = selectedRowState.datasetKey === selectionDatasetKey ? selectedRowState.ids : new Set<string>();
  const selectedTargets = operationsDeleteTargets(visibleRows, selectedRows);
  const setSelectedRows = (update: Set<string> | ((current: Set<string>) => Set<string>)) => setSelectedRowState((currentState) => {
    const current = currentState.datasetKey === selectionDatasetKey ? currentState.ids : new Set<string>();
    const next = typeof update === "function" ? update(current) : update;
    return { datasetKey: selectionDatasetKey, source: rows, ids: next };
  });
  const toggleRowSelection = (rowId: string) => setSelectedRows((current) => {
    const next = new Set(current);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    return next;
  });
  const editSelectedRow = () => {
    if (selectedRows.size !== 1) return;
    const row = localRows.find((item) => item.id === [...selectedRows][0]);
    if (!row) return;
    if (!row.source_record_id || row.event_type_records.length !== 1 || row.event_type_records[0].id !== row.source_record_id || row.event_type_records[0].source_type !== row.source_type) {
      setDeleteMessage("This row does not have one verified source report. Reload before editing or deleting it.");
      return;
    }
    const offloadRecords = row.offload_records as Array<ScopeReport & { items?: OperationsOffloadItem[] }>;
    setRowEdit({
      row,
      dispatchNumber: row.dispatch_number ?? "",
      deliveryDate: inputTime(row.date),
      reportDate: manilaDateTime(row.date ?? ""),
      reporter: null,
      remarks: row.remarks ?? "",
      truck: null,
      driver: null,
      eventTypes: row.event_type_records.map((record) => ({ ...record })),
      backloads: row.backload_records.map(({ id, trip_id, trip_stop_id, reason, number_of_boxes, comments }) => ({ id, trip_id, trip_stop_id, reason, number_of_boxes, comments })),
      offloads: row.offload_records.map(({ id, trip_id, trip_stop_id, reason, number_of_boxes, comments }) => ({ id, trip_id, trip_stop_id, reason, number_of_boxes, comments })),
      offloadItems: offloadRecords.flatMap((report) => (report.items ?? []).map((item) => ({
        report: { id: report.id, trip_id: report.trip_id, trip_stop_id: report.trip_stop_id, reason: report.reason, number_of_boxes: report.number_of_boxes, comments: report.comments },
        item,
        quantity: item.quantity == null ? "" : String(item.quantity),
        totalCbm: item.total_cbm == null ? "" : String(item.total_cbm),
      }))),
    });
    setRowEditError(null);
  };
  const deleteSelectedRows = async () => {
    if (!token || deleteSaving.current || !selectedRows.size) return;
    const selected = [...selectedRows].map((id) => visibleRows.find((row) => row.id === id)).filter((row): row is OperationsEventRow => Boolean(row));
    const targets = operationsDeleteTargets(visibleRows, selectedRows);
    if (!targets || selected.length !== selectedRows.size) {
      setDeleteMessage("One or more selected rows do not have a verified source report. Nothing was deleted; reload and select the rows again.");
      setDeleteConfirmation(false);
      return;
    }
    deleteSaving.current = true;
    setDeleteBusy(true);
    setDeleteMessage(null);
    try {
      const outcome = await deleteConfirmedOperationsReports(true, targets, (sourceType, recordId) => deleteOperationsReport(token, sourceType, recordId));
      const deletedIds = new Set(outcome.deletedRowIds);
      const failures = outcome.failures.map(({ target, message }) => `${target.label}: ${message}`);
      setDeleteOutcomes(targets.map((target) => ({ id: target.row_id, label: target.label, message: outcome.failures.find((failure) => failure.target.row_id === target.row_id)?.message ?? (outcome.cleanupPending.some((pending) => pending.target.row_id === target.row_id) ? "Database record deleted; image cleanup pending." : "Permanently deleted.") })));
      if (outcome.cleanupPending.length) {
        failures.push(`${outcome.cleanupPending.length} report(s) were deleted from the database, but image cleanup is pending. Use Retry image cleanup below; do not create replacement reports.`);
        setCleanupVersion((current) => current + 1);
      }
      if (deletedIds.size) {
        setLocalSnapshot({ source: rows, rows: localRows.filter((row) => !deletedIds.has(row.id)) });
        setSelectedRows((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
        try { await onSaved(); }
        catch (cause) { failures.push(`Deleted records could not be refreshed: ${cause instanceof Error ? cause.message : "Refresh failed."}`); }
      }
      const summary = outcome.cleanupPending.length ? `${deletedIds.size - outcome.cleanupPending.length} report(s) fully deleted. ${outcome.cleanupPending.length} database record(s) deleted with image cleanup pending.` : deletedIds.size ? `${deletedIds.size} of ${selected.length} report${selected.length === 1 ? "" : "s"} deleted.` : "No reports were deleted.";
      setDeleteMessage(failures.length ? `${summary} ${failures.join(" ")}` : summary);
    } finally {
      setDeleteConfirmation(false);
      deleteSaving.current = false;
      setDeleteBusy(false);
    }
  };
  const saveSelectedRow = async () => {
    if (!token || !rowEdit || rowEditSaving.current) return;
    const { row } = rowEdit;
    if (rowEdit.deliveryDate && Number.isNaN(new Date(rowEdit.deliveryDate).getTime())) {
      setRowEditError("Enter a valid delivery date.");
      return;
    }
    if (rowEdit.dispatchNumber.trim().length > 100) {
      setRowEditError("Dispatch number must be at most 100 characters.");
      return;
    }
    const allReports = [...rowEdit.backloads, ...rowEdit.offloads];
    if (allReports.some((record) => record.number_of_boxes !== null && (!Number.isSafeInteger(record.number_of_boxes) || record.number_of_boxes < 0))) {
      setRowEditError("Each box count must be a non-negative integer.");
      return;
    }
    const numericItems = rowEdit.offloadItems.map((draft) => ({
      ...draft,
      quantityValue: draft.quantity.trim() === "" ? null : Number(draft.quantity),
      cbmValue: draft.totalCbm.trim() === "" ? null : Number(draft.totalCbm),
    }));
    if (numericItems.some(({ quantityValue, cbmValue }) => [quantityValue, cbmValue].some((value) => value !== null && (!Number.isFinite(value) || value < 0)))) {
      setRowEditError("Offload Quantity and Total CBM must be non-negative numbers or blank.");
      return;
    }
    rowEditSaving.current = true;
    setRowEditBusy(true);
    setRowEditError(null);
    try {
      const offload = exactOffloadReport(row);
      if (offload && (rowEdit.reportDate !== manilaDateTime(row.date ?? "") || rowEdit.reporter)) {
        await updateScopedReport(token, "offloads", offload.id, { trip_id: row.trip_id, trip_stop_id: row.trip_stop_id,
          ...(rowEdit.reportDate !== manilaDateTime(row.date ?? "") ? { reported_at: manilaDateTimeToIso(rowEdit.reportDate) } : {}),
          ...(rowEdit.reporter ? { reported_by: rowEdit.reporter.id } : {}) });
      }
      if (row.trip_stop_id) {
        if ((row.dispatch_number ?? "") !== rowEdit.dispatchNumber) await updateOperationsStop(token, row.trip_id, row.trip_stop_id, { dispatch_number: rowEdit.dispatchNumber.trim() || null });
        if (row.source_type === "UNLOADING" && inputTime(row.date) !== rowEdit.deliveryDate) await saveUnloadingReport(token, row.trip_id, row.trip_stop_id, { finish_unloading_time: rowEdit.deliveryDate ? outputTime(rowEdit.deliveryDate) : null });
        if (row.source_type === "UNLOADING" && (row.remarks ?? "") !== rowEdit.remarks) await updateOperationsStop(token, row.trip_id, row.trip_stop_id, { remarks: rowEdit.remarks || null });
      } else {
        if ((row.dispatch_number ?? "") !== rowEdit.dispatchNumber) await updateOperationsTrip(token, row.trip_id, { dispatch_number: rowEdit.dispatchNumber.trim() || null });
        if (row.source_type === "LOADING" && (row.remarks ?? "") !== rowEdit.remarks) await updateOperationsTrip(token, row.trip_id, { remarks: rowEdit.remarks || null });
      }
      if (row.assignment_id && rowEdit.truck) await updateOperationsAssignment(token, row.trip_id, row.assignment_id, { truck_id: rowEdit.truck.id });
      if (row.assignment_id && rowEdit.driver) await updateOperationsAssignment(token, row.trip_id, row.assignment_id, { driver_id: rowEdit.driver.id });
      for (const event of rowEdit.eventTypes) {
        const original = row.event_type_records.find((candidate) => candidate.id === event.id && candidate.source_type === event.source_type);
        if (!original) throw new Error("An Event Type record no longer belongs to this row. Reload and retry.");
        if (original.event_type !== event.event_type) await updateOperationsEventType(token, event.source_type, event.id, event.event_type);
      }
      for (const [kind, reports] of [["backloads", rowEdit.backloads], ["offloads", rowEdit.offloads]] as const) {
        const originals = kind === "backloads" ? row.backload_records : row.offload_records;
        for (const report of reports) {
          const original = originals.find((candidate) => candidate.id === report.id);
          if (!original || original.trip_id !== row.trip_id || original.trip_stop_id !== row.trip_stop_id || report.trip_id !== original.trip_id || report.trip_stop_id !== original.trip_stop_id) {
            throw new Error(`A ${kind === "backloads" ? "Backload" : "Offload"} record no longer matches this trip and stop. Reload and retry.`);
          }
          if (original.reason !== report.reason || original.number_of_boxes !== report.number_of_boxes || original.comments !== report.comments) {
            await updateScopedReport(token, kind, report.id, { trip_id: original.trip_id, trip_stop_id: original.trip_stop_id, reason: report.reason, number_of_boxes: report.number_of_boxes, comments: report.comments });
          }
        }
      }
      for (const draft of numericItems) {
        const original = row.offload_records.find((report) => report.id === draft.report.id);
        if (!original || original.trip_id !== row.trip_id || original.trip_stop_id !== row.trip_stop_id) throw new Error("An Offload item no longer matches this trip and stop. Reload and retry.");
        const quantityChanged = draft.quantityValue !== (draft.item.quantity == null ? null : Number(draft.item.quantity));
        const cbmChanged = draft.cbmValue !== (draft.item.total_cbm == null ? null : Number(draft.item.total_cbm));
        if (quantityChanged || cbmChanged) {
          await updateOffloadItem(token, draft.report, { id: draft.item.id, trip_line_item_id: draft.item.trip_line_item_id }, {
            ...(quantityChanged ? { quantity: draft.quantityValue } : {}),
            ...(cbmChanged ? { total_cbm: draft.cbmValue } : {}),
          });
        }
      }
      await onSaved();
      setSelectedRows(new Set());
      setRowEdit(null);
    } catch (cause) {
      setRowEditError(`${cause instanceof Error ? cause.message : "Unable to save this row."} Any earlier field saves remain applied; review and retry the remaining edits.`);
    } finally {
      rowEditSaving.current = false;
      setRowEditBusy(false);
    }
  };

  const numberLabel = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 12 }).format(value);
  const saveCargoRecord = async (kind: "backloads" | "offloads", record: ScopeReport) => {
    if (!token) return;
    const draft = cargoRecordDrafts[record.id] ?? record;
    if (draft.number_of_boxes !== null && (!Number.isSafeInteger(draft.number_of_boxes) || draft.number_of_boxes < 0)) {
      setFeedback({ rowId: record.id, field: "number_of_boxes", kind: "error", message: "Number of boxes must be a non-negative integer." });
      return;
    }
    try {
      await updateScopedReport(token, kind, record.id, { trip_id: record.trip_id, trip_stop_id: record.trip_stop_id, reason: draft.reason, number_of_boxes: draft.number_of_boxes, comments: draft.comments });
      setEditingCargoRecord(null);
      setSelectedRows(new Set());
      setFeedback({ rowId: record.id, field: "reason", kind: "saved", message: "Saved" });
      await onSaved();
    } catch (cause) {
      setFeedback({ rowId: record.id, field: "reason", kind: "error", message: cause instanceof Error ? cause.message : "Unable to save this report." });
    }
  };
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, key: EventColumnKey) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenColumnMenu({ key, left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)), top: Math.min(rect.bottom + 4, window.innerHeight - 330) });
  };
  const togglePin = (key: EventColumnKey) => {
    if (layout.pins[key]) {
      setLayout((current) => { const pins = { ...current.pins }; delete pins[key]; return { ...current, pins }; });
      return;
    }
    const header = viewportRef.current?.querySelector<HTMLElement>(`[data-ops-column="${key}"]`);
    const viewport = viewportRef.current;
    if (!header || !viewport) return;
    const side = chooseAutomaticPinSide(header.getBoundingClientRect(), viewport.getBoundingClientRect());
    setLayout((current) => ({ ...current, pins: { ...current.pins, [key]: side } }));
  };
  const resizeColumn = (event: React.PointerEvent<HTMLSpanElement>, key: EventColumnKey, initialWidth: number) => {
    event.preventDefault(); event.stopPropagation();
    resizeCleanup.current?.();
    resizing.current = true;
    setLayout((current) => ({ ...current, widths: { ...(sharedWidths.loaded ? {} : current.widths), ...sharedWidths.widths } }));
    setDraggingWidth(true);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const startX = event.clientX;
    let latestWidth = initialWidth;
    const move = (pointer: PointerEvent) => { latestWidth = Math.max(100, Math.min(1200, initialWidth + pointer.clientX - startX)); setLayout((current) => ({ ...current, widths: { ...current.widths, [key]: latestWidth } })); };
    const cleanup = () => {
      document.body.style.userSelect = previousUserSelect;
      resizing.current = false;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish);
      resizeCleanup.current = null;
    };
    const finish = () => { if (latestWidth !== initialWidth) void sharedWidths.save(key, latestWidth); cleanup(); setDraggingWidth(false); setLayout((current) => ({ ...current })); };
    resizeCleanup.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };
  const reorderByDrop = (target: EventColumnKey) => {
    if (!draggedColumn || draggedColumn === target) return;
    setLayout((current) => ({ ...current, order: reorderColumnKeys(current.order, draggedColumn, target) as EventColumnKey[] }));
    setDraggedColumn(null);
  };
  const cellStyle = (column: (typeof columns)[number], header = false): CSSProperties => {
    const side = layout.pins[column.key];
    const color = layout.colors[column.key];
    return {
      width: column.width, minWidth: column.width, maxWidth: column.width,
      backgroundColor: color ?? (side || header ? "#ffffff" : undefined),
      ...(color ? { color: operationsColumnForeground(color) } : {}),
      ...(side ? { position: "sticky", ...(side === "left" ? { left: leftOffsets.get(column.key) ?? 0 } : { right: rightOffsets.get(column.key) ?? 0 }), zIndex: header ? 60 : 20 } : header ? { position: "sticky", top: 0, zIndex: 30 } : {}),
      ...(header ? { top: 0 } : {}),
    };
  };
  const canEdit = (row: OperationsEventRow, field: EditableEventField) => {
    if (field === "dispatch_number") return true;
    if (field === "plate_number" || field === "driver_name") return Boolean(row.assignment_id);
    if (field === "reported_by") return canManageReports && Boolean(exactOffloadReport(row));
    if (field === "remarks") return row.source_type === "LOADING" || row.source_type === "UNLOADING" || Boolean(exactOffloadReport(row));
    if (field === "delivery_date") return row.source_type === "UNLOADING" && Boolean(row.trip_stop_id);
    return false;
  };
  const beginEdit = (row: OperationsEventRow, field: EditableEventField) => {
    if (!canEdit(row, field) || saving.current) return;
    selectedOption.current = null;
    const raw = field === "delivery_date" ? inputTime(row.date) : field === "remarks" && exactOffloadReport(row) ? exactOffloadReport(row)!.comments : row[field];
    setSelectedCell({ rowId: row.id, field });
    setEditing({ rowId: row.id, field, value: String(raw ?? ""), original: String(raw ?? "") });
    setFeedback(null);
  };

  const saveCell = async (row: OperationsEventRow, field: EditableEventField, raw: string, option?: RelationshipOption) => {
    if (!token || saving.current) return;
    const selected = option ?? selectedOption.current;
    const offload = exactOffloadReport(row);
    const shown = String((field === "delivery_date" ? inputTime(row.date) : field === "remarks" && offload ? offload.comments : row[field]) ?? "");
    const value = selected ? selected.id : raw;
    if (editing?.rowId === row.id && editing.field === field && editing.original !== shown) {
      setFeedback({ rowId: row.id, field, kind: "error", message: "This value changed while you were editing. Review it and try again." });
      return;
    }
    if (selected && (field === "reported_by" ? selected.id === offload?.reported_by_id : selected.label === shown)) { setEditing(null); return; }
    if (!selected && value === shown) { setEditing(null); return; }
    if ((field === "plate_number" || field === "driver_name") && !selected) return;
    saving.current = true;
    setFeedback({ rowId: row.id, field, kind: "saving", message: "Saving…" });
    try {
      if (field === "plate_number" || field === "driver_name") {
        if (!row.assignment_id) throw new Error("No unambiguous trip assignment is available for this row.");
        await updateOperationsAssignment(token, row.trip_id, row.assignment_id, { [field === "plate_number" ? "truck_id" : "driver_id"]: value });
      } else if (field === "delivery_date" && row.trip_stop_id) {
        if (value && Number.isNaN(new Date(String(value)).getTime())) throw new Error("Enter a valid delivery date.");
        await saveUnloadingReport(token, row.trip_id, row.trip_stop_id, { finish_unloading_time: value ? outputTime(value) : null });
      } else if (field === "dispatch_number" && row.trip_stop_id) {
        if (String(value).trim().length > 100) throw new Error("Dispatch number must be at most 100 characters.");
        await updateOperationsStop(token, row.trip_id, row.trip_stop_id, { dispatch_number: String(value).trim() || null });
      } else if (field === "dispatch_number") {
        if (String(value).trim().length > 100) throw new Error("Dispatch number must be at most 100 characters.");
        await updateOperationsTrip(token, row.trip_id, { dispatch_number: String(value).trim() || null });
      } else if (offload && (field === "remarks" || field === "reported_by")) {
        if (field === "reported_by" && (!selected || !canManageReports)) throw new Error("Choose an eligible reporter.");
        await updateScopedReport(token, "offloads", offload.id, { trip_id: row.trip_id, trip_stop_id: row.trip_stop_id, ...(field === "remarks" ? { comments: value || null } : { reported_by: value }) });
      } else if (field === "remarks" && !row.trip_stop_id) {
        await updateOperationsTrip(token, row.trip_id, { remarks: value });
      } else if (field === "remarks" && row.trip_stop_id) {
        await updateOperationsStop(token, row.trip_id, row.trip_stop_id, { remarks: value });
      } else {
        throw new Error("This field has no supported safe update path.");
      }

      setLocalSnapshot({ source: rows, rows: localRows.map((item) => item.id !== row.id ? item : {
        ...item,
        ...(field === "plate_number" ? { plate_number: selected?.label ?? item.plate_number } : {}),
        ...(field === "driver_name" ? { driver_name: selected?.label ?? item.driver_name } : {}),
        ...(field === "remarks" ? { remarks: value } : {}),
        ...(offload && field === "remarks" ? { offload_records: [{ ...offload, comments: value || null }] } : {}),
        ...(offload && field === "reported_by" ? { reported_by: selected?.label ?? null, offload_records: [{ ...offload, reported_by: value, reported_by_id: value, reported_by_name: selected?.label ?? null }] } : {}),
        ...(field === "delivery_date" ? { date: value ? outputTime(value) : null } : {}),
        ...(field === "dispatch_number" ? { dispatch_number: String(value).trim() || null } : {}),
      }) });
      setSelectedRows(new Set());
      setEditing(null);
      setFeedback({ rowId: row.id, field, kind: "saved", message: "Saved" });
      await onSaved();
    } catch (cause) {
      setFeedback({ rowId: row.id, field, kind: "error", message: cause instanceof Error ? cause.message : "Unable to save this field." });
    } finally {
      saving.current = false;
      if (field !== "reported_by") selectedOption.current = null;
    }
  };

  const renderEditCell = (row: OperationsEventRow, field: EditableEventField, content: ReactNode, editable: boolean, extra = "", style?: CSSProperties, columnColor?: string) => {
    const active = editing?.rowId === row.id && editing.field === field;
    const selected = selectedCell?.rowId === row.id && selectedCell.field === field;
    const status = feedback?.rowId === row.id && feedback.field === field ? feedback : null;
    const label = columns.find((column) => column.key === field)?.label ?? field;
    return <td key={field} data-cell-hover-disabled={!editable || active || selected ? "true" : undefined}
      tabIndex={editable && !active ? 0 : undefined}
      onClick={() => editable && !active && beginEdit(row, field)}
      onKeyDown={(event) => { if (editable && !active && (event.key === "Enter" || event.key === "F2")) { event.preventDefault(); beginEdit(row, field); } }}
      style={style}
      className={REPORT_GRID_BODY_CELL_CLASS + " relative border-r border-slate-100/70 align-top text-slate-800 last:border-r-0 " + (editable ? "cursor-text " : "") + (selected ? "outline outline-2 outline-inset outline-blue-500 " : "") + (columnColor ? "bg-white " : "") + extra}
      title={editable ? "Edit " + label : undefined}>
      {active && editing ? <>{field === "reported_by" ? <OperationsReporterEditor token={token} value={editing.reporterId ?? exactOffloadReport(row)?.reported_by_id ?? ""} name={editing.value || "Name not recorded"} autoOpen disabled={status?.kind === "saving"} onSelect={(id, name) => { const option = { id, label: name }; selectedOption.current = option; setEditing((current) => current ? { ...current, value: name, reporterId: id } : current); void saveCell(row, field, name, option); }} onClose={() => { if (!saving.current && status?.kind !== "error") setEditing(null); }} /> : (field === "plate_number" || field === "driver_name") ? <SearchableRelationshipEditor
        token={token} kind={field === "plate_number" ? "trucks" : "drivers"}
        value={field === "plate_number" ? row.plate_number ?? "" : row.driver_name ?? ""}
        disabled={status?.kind === "saving"}
        onSelect={(option) => { selectedOption.current = option; setEditing((current) => current ? { ...current, value: option.label } : current); }}
        onCommitSelection={(option) => void saveCell(row, field, option.label, option)}
        onCommitBlur={() => void saveCell(row, field, editing.value)}
        onCancel={() => setEditing(null)} /> : <ReportTextCellEditor
        value={editing.value} type={field === "delivery_date" ? "datetime-local" : "text"}
        multiline={field === "remarks"} label={"Edit " + label} disabled={status?.kind === "saving"}
        className="w-full min-w-32 rounded-md border border-blue-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
        placeholder={field === "remarks" ? "Enter remarks" : undefined}
        onChange={(value) => setEditing((current) => current ? { ...current, value } : current)}
        onCommit={() => void saveCell(row, field, editing.value)} onCancel={() => setEditing(null)} />}
        {status && <span role={status.kind === "error" ? "alert" : "status"} className={"block text-[10px] font-medium " + (status.kind === "error" ? "text-rose-600" : status.kind === "saved" ? "text-emerald-600" : "text-slate-400")}>{status.message}</span>}
      </> : <>{content}{status && <span role={status.kind === "error" ? "alert" : "status"} className={"ml-2 text-[10px] font-medium " + (status.kind === "error" ? "text-rose-600" : status.kind === "saved" ? "text-emerald-600" : "text-slate-400")}>{status.message}</span>}</>}
    </td>;
  };

  if ((loading || !hasLoaded) && !hasLoaded && !loadError && !visibleRows.length) return <TableSkeleton columns={columns.length + 1} columnWidths={[44, ...columns.map((column) => column.width)]} rows={6} showToolbar toolbarActions={toolbarActions} />;

  return <section aria-label="Unified operations reports" className="space-y-3">
    {sharedWidths.feedback}
    {sharedDesign.feedback}
    <OffloadCleanupNotice key={token} token={token} enabled={canManageReports} version={cleanupVersion} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter operations reports by type">
        {filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setSelectedRows(new Set()); setFilter(item); if (item === "Offload") setExpandedLineItemsRow(null); }} className={"rounded-full px-3 py-1.5 text-xs font-semibold transition " + (filter === item ? "bg-[#0b2341] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{item}</button>)}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><ColumnFinder rowSearch={{value:search,onSearch:value=>{setSelectedRows(new Set());setSearch(value);},placeholder:"Search rows or columns…"}} columns={OPERATIONS_COLUMNS.map(column=>({key:column.key,title:column.label,hidden:layout.hidden.includes(column.key),index:columns.findIndex(item=>item.key===column.key)}))} viewport={viewportRef} getHeader={key=>viewportRef.current?.querySelector<HTMLElement>(`[data-ops-column="${key}"]`)} onReveal={key=>setLayout(current=>({...current,hidden:current.hidden.filter(item=>item!==key)}))} />{canManageReports && selectedRows.size > 0 && <>{selectedRows.size === 1 && <ReportRowActionButton action="edit" disabled={selectedTargets?.length !== 1 || rowEditBusy || deleteBusy || Boolean(editing)} onClick={editSelectedRow} />}<ReportRowActionButton action="delete" disabled={!selectedTargets?.length || rowEditBusy || deleteBusy || Boolean(editing)} onClick={() => { setDeleteMessage(null); setDeleteConfirmation(true); }} /></>}{toolbarActions}</div>
    </div>
    {loading && hasLoaded && <p role="status" className="text-xs text-slate-500">Refreshing reports…</p>}
    {selectedRows.size > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#b7d5ed] bg-[#edf6fd] px-3 py-2 text-sm text-[#155b8d]"><span className="mr-1">{selectedRows.size} row{selectedRows.size === 1 ? "" : "s"} selected</span><button type="button" disabled={deleteBusy} onClick={() => setSelectedRows(new Set())} className="px-2 py-1 text-xs font-medium underline disabled:opacity-50">Clear selection</button></div>}
    {deleteMessage && <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{deleteMessage}</p>}
    {deleteOutcomes.length > 0 && <ul aria-label="Per-report deletion results" className="space-y-1 text-xs text-slate-600">{deleteOutcomes.map((outcome) => <li key={outcome.id}>{outcome.label}: {outcome.message}</li>)}</ul>}
    {visibleRows.length === 0 ? <TableState loading={loading || !hasLoaded} error={loadError ? "Reports could not be loaded. Review the error above and retry." : null} message="No operational report rows available" description={filter === "Offload" && !localRows.some((row) => row.report_types.includes("Offload")) ? "Offload reports will appear here once they are added." : "Try changing the report type or search if you expected to see records."} /> : <div ref={viewportRef} className={REPORT_GRID_VIEWPORT_CLASS}>
      <table className="table-fixed border-separate border-spacing-0" style={{ width: tableWidth + 44, minWidth: tableWidth + 44 }}>
        <colgroup><col style={{ width: 44 }} />{columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
        <thead><tr><th scope="col" className={`${REPORT_GRID_HEADER_CELL_CLASS} sticky left-0 z-[70] w-11 min-w-11 text-center`}><input type="checkbox" aria-label="Select all visible operations rows" checked={visibleRows.length > 0 && visibleRows.every((row) => selectedRows.has(row.id))} onChange={(event) => setSelectedRows((current) => { const next = new Set(current); visibleRows.forEach((row) => event.target.checked ? next.add(row.id) : next.delete(row.id)); return next; })} className="h-4 w-4 rounded border-slate-300 accent-[#2678b9]" /></th>{columns.map((column) => {
          const pinned = layout.pins[column.key];
          return <th key={column.key} data-ops-column={column.key} scope="col" draggable onDragStart={(event) => { setDraggedColumn(column.key); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderByDrop(column.key); }}
            className={`${REPORT_GRID_HEADER_CELL_CLASS} relative ${pinned ? "z-50" : "z-30"}`} style={cellStyle(column, true)}>
            <div className="flex min-w-0 items-center justify-center gap-2 pr-2">
              {column.sortable && filter !== "Backload" ? <button type="button" className="min-w-0 flex-1 truncate text-center" title={column.label} onClick={() => sortBy(column.key as EventSortKey)}>{column.label}{sort.key === column.key && column.key !== "date" ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</button> : <span className="min-w-0 flex-1 truncate text-center" title={column.label}>{column.label}</span>}
              <button type="button" title={`${column.label} options`} aria-label={`${column.label} column options`} aria-haspopup="menu" aria-expanded={openColumnMenu?.key === column.key} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => openMenu(event, column.key)} className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"><MoreVertical aria-hidden="true" className="h-4 w-4" /></button>
            </div>
            <span role="separator" aria-orientation="vertical" aria-label={`Resize ${column.label}`} onPointerDown={(event) => resizeColumn(event, column.key, column.width)} className="absolute inset-y-0 right-0 z-[70] w-1.5 cursor-col-resize touch-none hover:bg-[#2678b9]/40" />
          </th>;
        })}</tr></thead>
        <tbody>
          {loading && !loadError && localRows.length === 0 && <tr><td colSpan={columns.length + 1} className={REPORT_GRID_BODY_CELL_CLASS + " text-center text-slate-500"}>Loading operations reports…</td></tr>}
          {loadError && visibleRows.length === 0 && <tr><td colSpan={columns.length + 1} className={REPORT_GRID_BODY_CELL_CLASS + " text-center text-rose-700"}>Reports could not be loaded. Review the error above and retry.</td></tr>}
          {!loading && hasLoaded && !loadError && visibleRows.length === 0 && <tr><td colSpan={columns.length + 1} className={REPORT_GRID_BODY_CELL_CLASS + " text-center text-slate-500"}>{filter === "Offload" && !localRows.some((row) => row.report_types.includes("Offload")) ? <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8"><p className="text-sm font-semibold text-[#0b2341]">No offload data or reports yet.</p></div> : localRows.length ? "No reports match this filter." : "No operational report rows are available."}</td></tr>}
          {visibleRows.map((row) => <Fragment key={row.id}><tr aria-selected={selectedRows.has(row.id)} tabIndex={0} onClick={(event) => { if (!(event.target as HTMLElement).closest("button,input,select,textarea,a,[role=combobox]")) setSelectedRows(new Set([row.id])); }} onKeyDown={(event) => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); setSelectedRows(new Set([row.id])); } }} className={`report-data-row ${REPORT_GRID_ROW_CLASS} focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${selectedRows.has(row.id) ? "bg-blue-50 [&>td]:!bg-blue-50" : ""}`}>
            <td data-cell-hover-disabled="true" className={`${REPORT_GRID_BODY_CELL_CLASS} sticky left-0 z-20 w-11 min-w-11 border-r border-slate-100 text-center ${selectedRows.has(row.id) ? "!bg-blue-50" : "bg-white"}`}><input type="checkbox" aria-label={`Select row ${row.dispatch_number || row.trip_number || row.id}`} checked={selectedRows.has(row.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleRowSelection(row.id)} className="h-4 w-4 rounded border-slate-300 accent-[#2678b9]" /></td>
            {columns.map((column) => {
              const style = cellStyle(column);
              const className = `${REPORT_GRID_BODY_CELL_CLASS} border-r border-slate-100/70 align-top text-slate-800 ${layout.pins[column.key] ? "bg-white shadow-sm" : ""}`;
              const offloadItems = offloadItemsByRow.get(row.id) ?? [];
              const eventRecord = row.event_type_records.length === 1
                && row.event_type_records[0].id === row.source_record_id
                && row.event_type_records[0].source_type === row.source_type
                ? row.event_type_records[0]
                : null;
              switch (column.key) {
                case "date": return renderEditCell(row, "delivery_date", dateLabelSafe(row.date), Boolean(row.trip_stop_id), "whitespace-nowrap text-center text-slate-700", style);
                case "trip": return renderEditCell(row, "dispatch_number", <span className="block font-semibold text-[#0b2341]">{row.dispatch_number || "—"}</span>, canEdit(row, "dispatch_number"), "text-center", style);
                case "plate_number": return renderEditCell(row, "plate_number", row.plate_number || "—", canEdit(row, "plate_number"), "", style);
                case "driver_name": return renderEditCell(row, "driver_name", row.driver_name || "—", canEdit(row, "driver_name"), "", style);
                case "route": return <td key={column.key} data-cell-hover-disabled="true" style={style} className={`${className} whitespace-normal break-words`}>{row.route || "—"}</td>;
                case "dr_number": return <td key={column.key} data-cell-hover-disabled="true" style={style} className={`${className} whitespace-normal break-words`}>{row.dr_number || "—"}</td>;
                case "quantity": case "total_cbm": {
                  const field = column.key;
                  return <td key={column.key} style={style} className={`${className} ${row.offload_records.length ? "text-left" : "text-right tabular-nums"}`}>
                    {row.offload_records.length ? offloadItems.map((item) => <OffloadItemFieldEditor key={`${item.report.id}:${item.id}:${item.persisted?.[field] ?? ""}:${field}`} token={token} model={item} field={field} onSaved={onSaved} />) : numberLabel(row[field])}
                  </td>;
                }
                case "report_type": return eventRecord ? <EventTypeEditor key={`${eventRecord.source_type}:${eventRecord.id}`} token={token} sourceType={eventRecord.source_type} recordId={eventRecord.id} eventType={eventRecord.event_type} onSaved={onSaved} style={style} className={className} /> : <td key={column.key} style={style} className={className}><span role="alert" className="text-xs text-rose-700">Invalid report identity</span></td>;
                case "remarks": return renderEditCell(row, "remarks", row.remarks || "—", canEdit(row, "remarks"), "whitespace-normal break-words", style);
                case "reported_by": return renderEditCell(row, "reported_by", row.reported_by || "—", canEdit(row, "reported_by"), "", style);
                case "details": return <td key={column.key} data-cell-hover-disabled="true" style={style} className={className}><button type="button" className="whitespace-nowrap text-xs font-semibold text-[#2678b9] underline" onClick={() => setDetailRow(row)}>View Details</button></td>;
              }
            })}
          </tr>{expandedLineItemsRow === row.id && <tr><td colSpan={columns.length + 1} className="border-b border-slate-200 bg-slate-50 px-4 py-3"><div className="overflow-x-auto">{row.line_items.length > 0 && <><div className="mb-2 text-xs font-bold text-[#0b2341]">Source line items · {row.dispatch_number || "Trip"}{row.trip_stop_id ? ` · Stop ${row.stop_sequence ?? "—"}` : " · trip scope"}</div>{row.line_items.map((item) => <div key={item.id} className="grid min-w-[440px] grid-cols-[minmax(160px,1fr)_120px_120px] gap-3 border-b border-slate-200 py-2 text-xs last:border-0"><span>{item.dr_number || `Line item ${item.id}`}</span><span>Quantity: {item.quantity ?? "—"}</span><span>CBM: {item.cbm ?? "—"}</span></div>)}</>}{[...row.backload_records.map((record) => ({ record, kind: "backloads" as const })), ...row.offload_records.map((record) => ({ record, kind: "offloads" as const }))].map(({ record, kind }) => { const report: ScopeReport = record; const draft = cargoRecordDrafts[record.id] ?? report; const isEditing = editingCargoRecord === record.id; const status = feedback?.rowId === record.id ? feedback : null; return <section key={record.id} className="mt-3 rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-semibold text-slate-700">{kind === "backloads" ? "Backload" : "Offload"} · {record.trip_stop_id ? `Stop ${row.stop_sequence ?? "—"}` : "Whole trip"} · record {record.id}</div><button type="button" onClick={() => { if (isEditing) setEditingCargoRecord(null); else { setEditingCargoRecord(record.id); setCargoRecordDrafts((current) => ({ ...current, [record.id]: { ...report } })); } }} className="text-xs font-semibold text-[#2678b9] underline">{isEditing ? "Close editor" : "Edit Row"}</button></div>{isEditing ? <div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">Reason<input value={draft.reason ?? ""} onChange={(event) => setCargoRecordDrafts((current) => ({ ...current, [record.id]: { ...draft, reason: event.target.value || null } }))} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-slate-600">Number of boxes<input type="number" min="0" step="1" value={draft.number_of_boxes ?? ""} onChange={(event) => setCargoRecordDrafts((current) => ({ ...current, [record.id]: { ...draft, number_of_boxes: event.target.value === "" ? null : Number(event.target.value) } }))} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-slate-600">Comments<input value={draft.comments ?? ""} onChange={(event) => setCargoRecordDrafts((current) => ({ ...current, [record.id]: { ...draft, comments: event.target.value || null } }))} className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm font-normal" /></label><div className="sm:col-span-3"><button type="button" onClick={() => void saveCargoRecord(kind, report)} className="rounded bg-[#0b2341] px-3 py-1.5 text-xs font-semibold text-white">Save changes</button><button type="button" onClick={() => setEditingCargoRecord(null)} className="ml-2 rounded border border-slate-200 px-3 py-1.5 text-xs">Cancel</button></div></div> : <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3"><span>Reason: {record.reason || "—"}</span><span>Boxes: {record.number_of_boxes ?? "—"}</span><span>Comments: {record.comments || "—"}</span></div>}<OperationsReceiptGallery token={token} kind={kind} recordId={record.id} />{status && <p role={status.kind === "error" ? "alert" : "status"} className={`mt-2 text-xs ${status.kind === "error" ? "text-rose-700" : "text-emerald-700"}`}>{status.message}</p>}</section>; })}{!row.line_items.length && !row.backload_records.length && !row.offload_records.length && <p className="text-xs text-slate-500">No editable source records are associated with this row.</p>}</div></td></tr>}</Fragment>)}
        </tbody>
      </table>
    </div>}
    {detailRow && <div className="fixed inset-0 z-[2050] flex items-center justify-center bg-[#0b2341]/45 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="operations-report-details-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-100 px-5 py-4"><h2 id="operations-report-details-title" className="text-lg font-bold text-[#0b2341]">Report details</h2><p className="mt-1 text-xs text-slate-600">{detailRow.dispatch_number || detailRow.trip_number || detailRow.trip_id}{detailRow.trip_stop_id ? ` · Stop ${detailRow.stop_sequence ?? "—"}` : " · Whole trip"}</p></header>
        <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <div><h3 className="text-xs font-bold uppercase text-slate-500">Event type</h3><div className="mt-1 flex flex-wrap gap-1">{detailRow.report_types.map((type) => <span key={type} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{type}</span>)}</div></div>
          <div><h3 className="text-xs font-bold uppercase text-slate-500">Date</h3><p className="mt-1 text-sm">{dateLabelSafe(detailRow.date)}</p></div>
          <div><h3 className="text-xs font-bold uppercase text-slate-500">Driver / vehicle</h3><p className="mt-1 text-sm">{detailRow.driver_name || "—"} · {detailRow.plate_number || "—"}</p></div>
          <div><h3 className="text-xs font-bold uppercase text-slate-500">Route</h3><p className="mt-1 text-sm">{detailRow.route || "—"}</p></div>
          {detailRow.source_type === "OFFLOAD" && <>
            <div><h3 className="text-xs font-bold uppercase text-slate-500">Reported By</h3><p className="mt-1 text-sm">{detailRow.reported_by || "Name not recorded"}</p></div>
            <div><h3 className="text-xs font-bold uppercase text-slate-500">Created By</h3><p className="mt-1 text-sm">{exactOffloadReport(detailRow)?.creator_name || "Name not recorded"}</p></div>
            <div><h3 className="text-xs font-bold uppercase text-slate-500">Quantity</h3><p className="mt-1 text-sm">{numberLabel(detailRow.quantity)}</p></div>
            <div><h3 className="text-xs font-bold uppercase text-slate-500">Total CBM</h3><p className="mt-1 text-sm">{numberLabel(detailRow.total_cbm)}</p></div>
            {detailRow.offload_records.flatMap((report) => (report.items ?? []).map((item) => <div key={item.id} className="text-xs text-slate-600 sm:col-span-2">Offload item {item.dr_number || item.id.slice(0, 8)} · Quantity {item.quantity ?? "—"} · CBM {item.total_cbm ?? "—"}</div>))}
          </>}
          <div className="sm:col-span-2"><h3 className="text-xs font-bold uppercase text-slate-500">Remarks</h3><p className="mt-1 whitespace-pre-wrap text-sm">{detailRow.remarks || (detailRow.source_type === "OFFLOAD" ? null : detailRow.reason) || "—"}</p></div>
          {detailRow.loading_report_id && <section className="rounded-lg border border-slate-200 p-3 sm:col-span-2"><h3 className="text-sm font-semibold text-[#0b2341]">Loading report</h3><p className="mt-1 text-xs text-slate-600">Arrival: {detailRow.loading_timestamps?.warehouse_arrival_at || "—"} · Started: {detailRow.loading_timestamps?.loading_start_at || "—"} · Finished: {detailRow.loading_timestamps?.loading_finished_at || "—"}</p><OperationsReceiptGallery token={token} kind="loading" recordId={detailRow.loading_report_id} /></section>}
          {detailRow.unloading_report_id && <section className="rounded-lg border border-slate-200 p-3 sm:col-span-2"><h3 className="text-sm font-semibold text-[#0b2341]">Unloading report</h3><p className="mt-1 text-xs text-slate-600">Arrival: {detailRow.unloading_timestamps?.arrival_time || "—"} · Started: {detailRow.unloading_timestamps?.start_unloading_time || "—"} · Finished: {detailRow.unloading_timestamps?.finish_unloading_time || "—"}</p><OperationsReceiptGallery token={token} kind="unloading" recordId={detailRow.unloading_report_id} /></section>}
          {[...detailRow.backload_records.map((record) => ({ record, kind: "backloads" as const, label: "Backload" })), ...detailRow.offload_records.map((record) => ({ record, kind: "offloads" as const, label: "Offload" }))].map(({ record, kind, label }) => <section key={`${kind}:${record.id}`} className="rounded-lg border border-slate-200 p-3 sm:col-span-2"><h3 className="text-sm font-semibold text-[#0b2341]">{label} report · {record.id}</h3><p className="mt-1 text-xs text-slate-600">Reason: {record.reason || "—"} · Boxes: {record.number_of_boxes ?? "—"}</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{record.comments || "—"}</p><OperationsReceiptGallery token={token} kind={kind} recordId={record.id} /></section>)}
          {detailRow.line_items.length > 0 && <section className="sm:col-span-2"><h3 className="text-xs font-bold uppercase text-slate-500">Trip line items · {detailRow.quantity_scope || detailRow.scope_label}</h3><ul className="mt-1 space-y-1 text-xs text-slate-700">{detailRow.line_items.map((item) => <li key={item.id}>DR {item.dr_number || "—"} · Quantity {item.quantity ?? "—"} · CBM {item.cbm ?? "—"}</li>)}</ul></section>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button type="button" onClick={() => setDetailRow(null)} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700">Close</button>{onOpenTrip && <button type="button" onClick={() => { const { trip_id, trip_stop_id } = detailRow; setDetailRow(null); onOpenTrip(trip_id, trip_stop_id); }} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341]">Open associated trip</button>}</footer>
      </section>
    </div>}
    <HiddenColumnsControl columns={layout.hidden.map((key) => ({ key, title: OPERATIONS_COLUMNS.find((column) => column.key === key)?.label ?? key }))} onRestore={(key) => setLayout((current) => ({ ...current, hidden: current.hidden.filter((item) => item !== key) }))} onRestoreAll={() => setLayout((current) => ({ ...current, hidden: [] }))} />
    {rowEdit && <div className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-slate-900/20 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !rowEditBusy) setRowEdit(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="operations-row-edit-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-100">
        <header className="border-b border-slate-100 bg-white px-6 py-5 sm:px-8"><h2 id="operations-row-edit-title" className="text-base font-semibold text-slate-800">Edit report row</h2><p className="mt-0.5 text-xs text-slate-400">{rowEdit.dispatchNumber || rowEdit.row.trip_number || rowEdit.row.trip_id}{rowEdit.row.trip_stop_id ? ` · Stop ${rowEdit.row.stop_sequence ?? "—"}` : " · Trip"}</p></header>
        <div className="grid gap-4 overflow-y-auto bg-white px-6 py-6 sm:grid-cols-2 sm:px-8">
          {rowEdit.row.source_type === "OFFLOAD" && canManageReports && <>
            <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">Report Date (Asia/Manila)<input type="datetime-local" value={rowEdit.reportDate} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, reportDate: event.target.value } : current)} className={inputClass} /></label>
            <div className="grid content-start gap-1.5 text-sm font-medium text-slate-700">Reported By<OperationsReporterEditor token={token} value={rowEdit.reporter?.id ?? exactOffloadReport(rowEdit.row)?.reported_by_id ?? ""} name={rowEdit.reporter?.name ?? rowEdit.row.reported_by ?? "Name not recorded"} disabled={rowEditBusy} onSelect={(id, name) => setRowEdit((current) => current ? { ...current, reporter: { id, name } } : current)} /></div>
          </>}
          <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">Dispatch number<input value={rowEdit.dispatchNumber} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, dispatchNumber: event.target.value } : current)} maxLength={100} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#cfe1f1] disabled:opacity-60" /></label>
          {rowEdit.row.source_type === "UNLOADING" && rowEdit.row.trip_stop_id && <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">Delivery date<input type="datetime-local" value={rowEdit.deliveryDate} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, deliveryDate: event.target.value } : current)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#cfe1f1] disabled:opacity-60" /></label>}
          {rowEdit.row.assignment_id && <>
            <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">Plate number<SearchableRelationshipEditor token={token} kind="trucks" value={rowEdit.truck?.label ?? rowEdit.row.plate_number ?? ""} autoFocus={false} disabled={rowEditBusy} onSelect={(option) => setRowEdit((current) => current ? { ...current, truck: option } : current)} onCommitBlur={() => undefined} onCancel={() => undefined} /></label>
            <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">Driver<SearchableRelationshipEditor token={token} kind="drivers" value={rowEdit.driver?.label ?? rowEdit.row.driver_name ?? ""} autoFocus={false} disabled={rowEditBusy} onSelect={(option) => setRowEdit((current) => current ? { ...current, driver: option } : current)} onCommitBlur={() => undefined} onCancel={() => undefined} /></label>
          </>}
          {(rowEdit.row.source_type === "LOADING" || rowEdit.row.source_type === "UNLOADING") && <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">{rowEdit.row.source_type === "LOADING" ? "Trip remarks" : "Stop remarks"}<textarea rows={3} value={rowEdit.remarks} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, remarks: event.target.value } : current)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#cfe1f1] disabled:opacity-60" /></label>}
          {rowEdit.eventTypes.map((event) => <label key={`${event.source_type}:${event.id}`} className="grid content-start gap-1.5 text-sm font-medium text-slate-700">{event.source_type} Event Type<ReportDropdownEditor label={`${event.source_type} Event Type`} value={event.event_type} displayValue={event.event_type} options={["Loading", "Unloading", "Backload", "Offload"].map((value) => ({ value, label: value }))} autoOpen={false} disabled={rowEditBusy} onSelect={(value) => setRowEdit((current) => current ? { ...current, eventTypes: current.eventTypes.map((item) => item.id === event.id && item.source_type === event.source_type ? { ...item, event_type: value as OperationsEventType } : item) } : current)} /></label>)}
          {[...rowEdit.backloads.map((record) => ({ record, kind: "backloads" as const })), ...rowEdit.offloads.map((record) => ({ record, kind: "offloads" as const }))].map(({ record, kind }) => <fieldset key={`${kind}:${record.id}`} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-3"><legend className="px-1 text-xs font-bold text-[#0b2341]">{kind === "backloads" ? "Backload" : "Offload"} report · {record.trip_stop_id ? `Stop ${rowEdit.row.stop_sequence ?? "—"}` : "Whole trip"} · {record.id.slice(0, 8)}</legend>
            <label className="text-xs font-semibold text-slate-600">Reason<input value={record.reason ?? ""} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, [kind]: current[kind].map((item) => item.id === record.id ? { ...item, reason: event.target.value || null } : item) } : current)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-600">Number of boxes<input type="number" min="0" step="1" value={record.number_of_boxes ?? ""} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, [kind]: current[kind].map((item) => item.id === record.id ? { ...item, number_of_boxes: event.target.value.trim() === "" ? null : Number(event.target.value) } : item) } : current)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-600">Comments<input value={record.comments ?? ""} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, [kind]: current[kind].map((item) => item.id === record.id ? { ...item, comments: event.target.value || null } : item) } : current)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
          </fieldset>)}
          {rowEdit.offloadItems.map((draft) => <fieldset key={draft.item.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2"><legend className="px-1 text-xs font-bold text-[#0b2341]">Offload item · {draft.item.dr_number || draft.item.id.slice(0, 8)}</legend>
            <label className="text-xs font-semibold text-slate-600">Quantity<input type="number" min="0" step="any" value={draft.quantity} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, offloadItems: current.offloadItems.map((item) => item.item.id === draft.item.id ? { ...item, quantity: event.target.value } : item) } : current)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-600">Total CBM<input type="number" min="0" step="any" value={draft.totalCbm} disabled={rowEditBusy} onChange={(event) => setRowEdit((current) => current ? { ...current, offloadItems: current.offloadItems.map((item) => item.item.id === draft.item.id ? { ...item, totalCbm: event.target.value } : item) } : current)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
          </fieldset>)}
          {rowEdit.backloads.length === 0 && rowEdit.offloads.length === 0 && <p className="text-sm text-slate-500 sm:col-span-2">No optional Backload or Offload report is associated with this row.</p>}
          {rowEditError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{rowEditError}</p>}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-3 sm:px-8"><button type="button" disabled={rowEditBusy} onClick={() => setRowEdit(null)} className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50">Cancel</button><button type="button" disabled={rowEditBusy} onClick={() => void saveSelectedRow()} className="rounded-full bg-[#0b2341] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1d5f94] disabled:cursor-not-allowed disabled:opacity-50">{rowEditBusy ? "Saving…" : "Save changes"}</button></footer>
      </section>
    </div>}
    {deleteConfirmation && <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-[#0b2341]/45 p-4 backdrop-blur-sm" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="operations-delete-title" aria-describedby="operations-delete-description" className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-100 px-5 py-4"><h2 id="operations-delete-title" className="text-lg font-semibold text-[#0b2341]">Delete selected reports?</h2></header>
        <div className="space-y-3 px-5 py-4 text-sm text-slate-700"><p id="operations-delete-description">Permanently delete {selectedRows.size} selected report record{selectedRows.size === 1 ? "" : "s"}? This cannot be undone. Eligible Offloads include their owned items and receipt images. Protected historical records will be retained, and failures will be reported individually. Other report types retain their existing receipt protections.</p><p>Trips, sibling stops, other reports, POD and Transmittal records will not be deleted. Image cleanup may require a separate retry after database deletion.</p>{deleteMessage && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-800">{deleteMessage}</p>}</div>
        <div className="max-h-40 overflow-y-auto px-5 text-xs text-slate-600">{selectedRows.size ? <ul className="space-y-1">{visibleRows.filter((row) => selectedRows.has(row.id)).map((row) => <li key={row.id}>{row.source_type} · {row.dispatch_number || row.trip_number || "Dispatch unavailable"} · {row.source_record_id}</li>)}</ul> : <p role="alert">The dataset or filter changed. Cancel and select the reports again.</p>}</div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button type="button" disabled={deleteBusy} onClick={() => setDeleteConfirmation(false)} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel</button><button type="button" disabled={deleteBusy || selectedRows.size === 0} onClick={() => void deleteSelectedRows()} className="rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{deleteBusy ? "Deleting…" : `Delete ${selectedRows.size} report${selectedRows.size === 1 ? "" : "s"}`}</button></footer>
      </section>
    </div>}
    {openColumnMenu && (() => { const column = OPERATIONS_COLUMNS.find((item) => item.key === openColumnMenu.key); if (!column) return null; return <ReportColumnActionsMenu title={column.label} position={openColumnMenu} onClose={() => setOpenColumnMenu(null)} sortActions={column.sortable ? (["asc", "desc"] as const).map((direction) => ({ label: direction === "asc" ? "Sort ascending" as const : "Sort descending" as const, active: sort.key === column.key && sort.direction === direction, onClick: () => setSort({ key: column.key as EventSortKey, direction }) })) : undefined} pinned={Boolean(layout.pins[column.key])} onTogglePin={() => togglePin(column.key)} onEditColumn={() => setEditingColumnColor(column.key)} canHide={column.key !== "details" && columns.length > 1} onHide={() => setLayout((current) => ({ ...current, hidden: [...current.hidden, column.key], pins: Object.fromEntries(Object.entries(current.pins).filter(([key]) => key !== column.key)) }))} />; })()}
    {editingColumnColor && <ReportColumnColorDialog columnName={OPERATIONS_COLUMNS.find((column) => column.key === editingColumnColor)?.label ?? editingColumnColor} color={layout.colors[editingColumnColor] ?? ""} onChange={(color) => setLayout((current) => ({ ...current, colors: { ...current.colors, [editingColumnColor]: color } }))} onReset={() => setLayout((current) => { const colors = { ...current.colors }; delete colors[editingColumnColor]; return { ...current, colors }; })} onClose={() => setEditingColumnColor(null)} />}
    <p className="text-[11px] text-slate-500">Each row is one existing physical report with its own report type and record ID. Stop-scoped reports use only that stop's dispatch number and line-item context. Offload Quantity and CBM come from the Offload's own items; Loading and Unloading totals are read-only trip or stop line-item summaries.</p>
  </section>;
}
