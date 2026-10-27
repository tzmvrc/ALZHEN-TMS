import { FileText, X, Plus, Paperclip } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fetchTripStops, type TripChildRecord } from "../../services/trip.service";
import { apiDelete, apiGetCached, apiPost, invalidateApiCache, type ApiResponse } from "../../services/api.service";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import { invalidateReportPageCache } from "../../services/report.service";
import { deleteOperationsReports, fetchOperationsReceipts, uploadOperationsReceipt, type OperationsReceipt } from "../../services/operations-report.service";
import ReportImageGallery from "./ReportImageGallery";
import { useSpreadsheetFeedback } from "./SpreadsheetPresentation";

export type TripIssue = {
  id: string; trip_id: string; trip_stop_id: string | null;
  type: "OFFLOAD" | "BACKLOAD" | "DEMURRAGE" | "INCIDENT" | "FOU_ALERT";
  reason: string | null; date: string | null; number_of_boxes: number | null;
  remarks: string | null; ir_status: string | null; submitted_date: string | null;
};
type IssueDraft = { type: TripIssue["type"]; reason: string; date: string; boxes: string; remarks: string; status: string; submitted: string };
const emptyDraft = (): IssueDraft => ({ type: "OFFLOAD", reason: "", date: "", boxes: "", remarks: "", status: "", submitted: "" });
const issueLabel = (type: TripIssue["type"]) => type === "FOU_ALERT" ? "FOU Alert" : type.charAt(0) + type.slice(1).toLowerCase();
const toDate = (value: string | null) => value?.slice(0, 10) ?? "";
function invalidateIncidentReports() {
  invalidateApiCache("/reports/dispatch-monitoring");
  invalidateApiCache("/reports/dispatch?");
  invalidateReportPageCache();
}
const Context = createContext<{ issues: TripIssue[]; refresh: () => Promise<void> }>({ issues: [], refresh: async () => {} });

export function TripIssuesProvider({ token, tripIds, enabled, onChanged, children }: { token: string | null; tripIds: string[]; enabled: boolean; onChanged: () => void; children: ReactNode }) {
  const signature = useMemo(() => [...new Set(tripIds)].sort().join(","), [tripIds]);
  const [state, setState] = useState<{ owner: string; issues: TripIssue[] }>({ owner: "", issues: [] });
  const [error, setError] = useState("");
  const changed = useRef(onChanged); changed.current = onChanged;
  const refresh = useCallback(async (fresh = true) => {
    if (!enabled || !token || !signature) return;
    if (fresh) invalidateApiCache("/reports/trip-issues");
    const ids = signature.split(",");
    const responses = await Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
      apiGetCached<ApiResponse<TripIssue[]>>(`/reports/trip-issues?trip_ids=${encodeURIComponent(ids.slice(index * 100, index * 100 + 100).join(","))}`, token, 10_000)));
    if (responses.some(response => !response.success || !response.data)) throw new Error("Unable to load incident reports.");
    setState({ owner: `${token}:${signature}`, issues: responses.flatMap(response => response.data ?? []) });
    setError("");
  }, [token, signature, enabled]);
  useEffect(() => { let alive = true; void refresh(false).catch(() => { if (alive) setError("Unable to load incident reports. Reopen the report to retry."); }); return () => { alive = false; }; }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = subscribeToAdminRealtime(event => {
      const tables = event.kind === "batch" ? event.tables : event.kind === "change" ? [event.payload.table] : [];
      if (event.kind !== "resume" && !tables.some(table => ["offloads", "backloads", "demurrages", "incidents", "report_receipts"].includes(table))) return;
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; invalidateIncidentReports(); changed.current(); void refresh().catch(() => setError("Unable to refresh incident reports.")); }, 120);
    });
    return () => { clearTimeout(timer); stop(); };
  }, [enabled, refresh]);
  useSpreadsheetFeedback(error, "error");
  const value = useMemo(() => ({ issues: state.owner === `${token}:${signature}` ? state.issues : [], refresh }), [state, token, signature, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

type LegacyFields = Partial<Record<"incident_report" | "incident_boxes" | "incident_details" | "incident_date" | "backload_reason" | "backload_number_of_boxes" | "ir_status" | "ir_submitted_date" | "backload_comments" | "offload_number_of_boxes" | "offload_reason", unknown>>;
export function TripIssueCell({ token, tripId, stopId, status, iconOnly = false, display = "types", legacy }: {
  token: string; tripId: string; stopId: string | null; status: unknown; iconOnly?: boolean;
  display?: "types" | "boxes" | "details"; legacy?: LegacyFields;
}) {
  const { issues, refresh } = useContext(Context);
  const rows = issues.filter(issue => issue.trip_id === tripId && (!stopId || !issue.trip_stop_id || issue.trip_stop_id === stopId));
  const [open, setOpen] = useState(false);
  const [stops, setStops] = useState<TripChildRecord[]>([]);
  const [creationStop, setCreationStop] = useState<string | null>(stopId);
  const [selected, setSelected] = useState<TripIssue | null>(null);
  const [draft, setDraft] = useState<IssueDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<TripIssue | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [images, setImages] = useState<OperationsReceipt[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const requestId = useRef(crypto.randomUUID());
  const uploadIds = useRef(new Map<File, string>());
  const lock = useRef(false);
  const firstButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    firstButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
      if (event.key !== "Tab" || !dialog.current) return;
      const controls = [...dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary")];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const reset = () => { setSelected(null); setDraft(emptyDraft()); setImages([]); setFiles([]); uploadIds.current.clear(); requestId.current = crypto.randomUUID(); };
  const edit = (issue: TripIssue) => {
    if (files.length && !window.confirm("Discard pending images before editing another report?")) return;
    setSelected(issue); setDraft({ type: issue.type, reason: issue.reason ?? "", date: toDate(issue.date), boxes: issue.number_of_boxes == null ? "" : String(issue.number_of_boxes), remarks: issue.remarks ?? "", status: issue.ir_status ?? "", submitted: toDate(issue.submitted_date) });
    setFiles([]); setImages([]); setError("");
    if (["OFFLOAD", "BACKLOAD"].includes(issue.type)) void fetchOperationsReceipts(token, issue.type as "OFFLOAD" | "BACKLOAD", issue.id).then(setImages).catch(() => setError("Supporting documents could not load."));
  };
  const save = async () => {
    if (lock.current || !draft.reason.trim()) return;
    if (!selected && draft.type === "OFFLOAD" && !creationStop) { setError("Select a delivery stop with a DR number for Offload."); return; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    let committed = false;
    try {
      const response = await apiPost<ApiResponse<{ id?: string; report?: { id?: string } }>>("/reports/trip-issues", {
        trip_id: tripId, trip_stop_id: selected ? selected.trip_stop_id : creationStop,
        id: selected?.id, type: selected?.type ?? draft.type, reason: draft.reason,
        date: selected && draft.date === toDate(selected.date) ? undefined : draft.date || null,
        number_of_boxes: draft.boxes || null, remarks: draft.remarks || null,
        ir_status: draft.status || null,
        submitted_date: selected && draft.submitted === toDate(selected.submitted_date) ? undefined : draft.submitted || null,
        request_id: requestId.current,
      }, token);
      if (!response.success) throw new Error(response.message ?? "Unable to save report.");
      committed = true;
      const id = selected?.id ?? response.data?.report?.id ?? response.data?.id;
      if (files.length && ["OFFLOAD", "BACKLOAD"].includes(draft.type)) {
        if (!id) throw new Error("The saved report's document target could not be verified.");
        for (const file of files) {
          let uploadId = uploadIds.current.get(file); if (!uploadId) { uploadId = crypto.randomUUID(); uploadIds.current.set(file, uploadId); }
          await uploadOperationsReceipt(token, draft.type as "OFFLOAD" | "BACKLOAD", id, file, uploadId);
          setFiles(current => current.filter(item => item !== file));
        }
      }
      invalidateIncidentReports(); await refresh(); reset(); setNotice("Report saved.");
    } catch (cause) { setError(committed ? "Report saved, but supporting documents or display updates need review." : cause instanceof Error ? cause.message : "Unable to save report."); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (!deleting || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (["OFFLOAD", "BACKLOAD"].includes(deleting.type)) {
        const result = await deleteOperationsReports(token, [{ source_type: deleting.type as "OFFLOAD" | "BACKLOAD", record_id: deleting.id }]);
        if (!result.outcomes[0]?.success) throw new Error(result.outcomes[0]?.message ?? "Unable to delete report.");
      } else {
        const result = await apiDelete<ApiResponse<{ id: string }>>(`/reports/trip-issues/${deleting.type}/${encodeURIComponent(deleting.id)}`, token, {});
        if (!result.success) throw new Error(result.message ?? "Unable to delete report.");
      }
      invalidateIncidentReports(); await refresh(); if (selected?.id === deleting.id) reset(); setDeleting(null); setNotice("Report deleted. Other reports remain unchanged.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete report."); }
    finally { lock.current = false; setBusy(false); }
  };

  const legacyTypes = [legacy?.backload_reason || legacy?.backload_number_of_boxes != null ? "Backload" : "", legacy?.offload_reason || legacy?.offload_number_of_boxes != null ? "Offload" : "", legacy?.incident_date || legacy?.ir_status ? "Incident" : ""].filter(Boolean);
  const types = rows.length ? [...new Set(rows.map(issue => issueLabel(issue.type)))].join(", ") : String(legacy?.incident_report ?? "") || legacyTypes.join(", ");
  const boxes = rows.length ? rows.filter(issue => issue.number_of_boxes != null).map(issue => `${issueLabel(issue.type)}: ${issue.number_of_boxes}`).join(" · ") : String(legacy?.incident_boxes ?? "") || [legacy?.backload_number_of_boxes != null ? `Backload: ${legacy.backload_number_of_boxes}` : "", legacy?.offload_number_of_boxes != null ? `Offload: ${legacy.offload_number_of_boxes}` : ""].filter(Boolean).join(" · ");
  const detailText = rows.length ? `${rows.length} ${rows.length === 1 ? "report" : "reports"}` : String(legacy?.incident_details ?? "") || (legacyTypes.length ? "Imported details" : "Add details");
  const label = iconOnly ? "View incident details" : display === "boxes" ? boxes || "—" : display === "details" ? `${detailText} · Open` : types || (["COMPLETED", "DELIVERED", "DONE", "CLOSED"].includes(String(status ?? "").toUpperCase()) ? "No incident" : "None");
  const exportDetails = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Incident details");
      sheet.addRow(["Report ID", "Incident Report", "Trip ID", "Stop ID", "Date", "Reason", "No. of Box", "Remarks", "IR Status", "Submitted date"]);
      for (const issue of rows) sheet.addRow([issue.id, issueLabel(issue.type), issue.trip_id, issue.trip_stop_id, issue.date, issue.reason, issue.number_of_boxes, issue.remarks, issue.ir_status, issue.submitted_date]);
      if (legacyTypes.length) {
        const original = workbook.addWorksheet("Imported fields");
        original.addRow(["Field", "Original value"]);
        for (const [key, value] of Object.entries(legacy ?? {})) if (!["incident_report", "incident_boxes", "incident_details"].includes(key) && value != null && value !== "") original.addRow([key, String(value)]);
      }
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `incident-details-${tripId}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("Unable to export incident details."); }
  };
  useSpreadsheetFeedback(notice, "success"); useSpreadsheetFeedback(error, "error");
  const field = "mt-1 h-9 w-full rounded-lg border border-[#e4e9f0] bg-white px-3 text-sm text-[#0b2343] outline-none focus:border-[#0b2343] focus:ring-2 focus:ring-[#0b2343]/15";
  return <>
    <button type="button" aria-label={iconOnly ? label : `Incident ${display}: ${label}. Open details`} title="Open incident details" onClick={event => { event.stopPropagation(); setOpen(true); setError(""); void fetchTripStops(token, tripId).then(setStops).catch(() => setError("Unable to load delivery stops.")); }} className={iconOnly ? "inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100" : "block w-full min-w-0 text-left text-xs text-[#0b2343] hover:underline"}>{iconOnly ? <FileText size={16} /> : label}</button>
    {open && createPortal(<div className="fixed inset-0 z-[2300] flex items-center justify-center p-4 al-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-label="Incident details" className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#e4e9f0] bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[#e4e9f0] px-5 py-4"><div><h2 className="text-lg font-semibold text-[#0b2343]">Incident details</h2><p className="text-xs text-slate-500">{rows.length} saved {rows.length === 1 ? "report" : "reports"} · each record is managed separately</p></div><div className="flex items-center gap-3"><button type="button" onClick={() => void exportDetails()} className="text-xs font-medium text-[#0b2343] hover:underline">Export details</button><button ref={firstButton} type="button" aria-label="Close incident details" disabled={busy} onClick={() => setOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div></header>
        <div className="min-h-0 overflow-y-auto p-5">
          {rows.length === 0 && !legacyTypes.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No incident reports for this trip or stop.</p>}
          <div className="space-y-2">{rows.map(issue => <article key={`${issue.type}:${issue.id}`} className="rounded-xl border border-[#e4e9f0] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-sm text-[#0b2343]">{issueLabel(issue.type)}</strong><span className="ml-2 text-xs text-slate-500">{issue.trip_stop_id ? "Delivery stop" : "Whole trip"}</span><p className="mt-1 text-sm text-slate-700">{issue.reason || "No reason recorded"}</p></div><div className="flex gap-3 text-xs"><button type="button" disabled={busy} onClick={() => edit(issue)} className="font-medium text-[#0b2343] hover:underline">Edit</button><button type="button" disabled={busy} onClick={() => setDeleting(issue)} className="text-rose-700 hover:underline">Delete</button></div></div><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#e4e9f0] pt-3 text-xs sm:grid-cols-4"><div><dt className="text-slate-500">Date</dt><dd>{toDate(issue.date) || "—"}</dd></div><div><dt className="text-slate-500">No. of Box</dt><dd>{issue.number_of_boxes ?? "—"}</dd></div><div><dt className="text-slate-500">IR status</dt><dd>{issue.ir_status || "—"}</dd></div><div><dt className="text-slate-500">Submitted</dt><dd>{toDate(issue.submitted_date) || "—"}</dd></div></dl>{issue.remarks && <p className="mt-2 text-xs text-slate-600">Remarks: {issue.remarks}</p>}</article>)}</div>
          {legacyTypes.length > 0 && <details className="mt-3 rounded-xl border border-[#e4e9f0] p-3 text-xs"><summary className="cursor-pointer font-medium text-[#0b2343]">Imported incident fields · original values</summary><div className="mt-2 grid gap-1 text-slate-600">{Object.entries(legacy ?? {}).filter(([key, value]) => !["incident_report", "incident_boxes", "incident_details"].includes(key) && value != null && value !== "").map(([key, value]) => <span key={key}>{key.replaceAll("_", " ")}: {String(value)}</span>)}</div></details>}
          {deleting ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm"><p>Delete only this {issueLabel(deleting.type)} report? Other incidents remain unchanged.</p><div className="mt-3 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button><button type="button" disabled={busy} onClick={() => void remove()} className="font-semibold text-rose-700">{busy ? "Deleting…" : "Delete report"}</button></div></div> : <section className="mt-5 border-t border-[#e4e9f0] pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-[#0b2343]">{selected ? `Edit ${issueLabel(selected.type)}` : "Add an incident"}</h3>{selected && <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-xs font-medium text-[#0b2343]"><Plus size={14}/> Add another</button>}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Incident Report<select className={field} disabled={busy || Boolean(selected)} value={draft.type} onChange={event => setDraft(current => ({ ...current, type: event.target.value as TripIssue["type"] }))}><option value="OFFLOAD">Offload</option><option value="BACKLOAD">Backload</option><option value="DEMURRAGE">Demurrage</option><option value="FOU_ALERT">FOU Alert</option>{selected?.type === "INCIDENT" && <option value="INCIDENT">Incident</option>}</select></label><label className="text-xs font-medium text-slate-600">Scope<select className={field} disabled={busy || Boolean(selected) || Boolean(stopId)} value={selected?.trip_stop_id ?? creationStop ?? ""} onChange={event => setCreationStop(event.target.value || null)}><option value="">{draft.type === "OFFLOAD" ? "Select delivery stop" : "Whole trip"}</option>{stops.filter(stop => draft.type !== "OFFLOAD" || Boolean(stop.dr_number)).map(stop => <option key={String(stop.id)} value={String(stop.id)}>Stop {String(stop.stop_sequence ?? "")} · {String(stop.dr_number ?? "No DR")}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Date<input type="date" className={field} disabled={busy} value={draft.date} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))}/></label><label className="text-xs font-medium text-slate-600">No. of Box<input type="number" min="0" step="1" className={field} disabled={busy} value={draft.boxes} onChange={event => setDraft(current => ({ ...current, boxes: event.target.value }))}/></label><label className="text-xs font-medium text-slate-600">IR status<input className={field} maxLength={80} disabled={busy} value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))} placeholder="Open, submitted…"/></label><label className="text-xs font-medium text-slate-600">Submission date<input type="date" className={field} disabled={busy} value={draft.submitted} onChange={event => setDraft(current => ({ ...current, submitted: event.target.value }))}/></label></div>
            <label className="mt-3 block text-xs font-medium text-slate-600">Reason<textarea required maxLength={2000} disabled={busy} value={draft.reason} onChange={event => setDraft(current => ({ ...current, reason: event.target.value }))} className={`${field} min-h-20 py-2`}/></label><label className="mt-3 block text-xs font-medium text-slate-600">Remarks<textarea disabled={busy} value={draft.remarks} onChange={event => setDraft(current => ({ ...current, remarks: event.target.value }))} className={`${field} min-h-16 py-2`}/></label>
            {["OFFLOAD", "BACKLOAD"].includes(draft.type) && <div className="mt-3"><label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#0b2343]"><Paperclip size={14}/> Add supporting images<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => { const next = Array.from(event.target.files ?? []); if (files.length + next.length > 5 || next.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) setError("Choose up to five JPG, PNG or WebP images, up to 5 MB each."); else setFiles(current => [...current, ...next]); event.target.value = ""; }}/></label>{files.map(file => <div key={file.name} className="flex gap-2 text-xs"><span>{file.name}</span><button type="button" onClick={() => setFiles(current => current.filter(item => item !== file))}>Remove</button></div>)}<ReportImageGallery images={images.filter(image => image.signed_url).map(image => ({ ...image, signed_url: image.signed_url! }))}/></div>}
            {!["OFFLOAD", "BACKLOAD"].includes(draft.type) && <p className="mt-3 text-xs text-slate-500">Supporting documents are available for Offload and Backload reports. This report type does not yet have a document link.</p>}
            {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}{notice && <p role="status" className="mt-3 text-xs text-emerald-700">{notice}</p>}
            <div className="mt-4 flex justify-end"><button type="button" disabled={busy || !draft.reason.trim()} onClick={() => void save()} className="rounded-lg bg-[#0b2343] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17385f] disabled:opacity-50">{busy ? "Saving…" : selected ? "Save changes" : "Add report"}</button></div>
          </section>}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
