import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import OperationsReporterEditor from "./OperationsReporterEditor";
import { manilaDateTime, manilaDateTimeToIso, optionalOffloadNumber, selectedTransactionValues } from "../../services/offload-form.logic";
import {
  createScopedReport,
  fetchOperationsReceipts,
  uploadOperationsReceipt,
  type OperationsReceipt,
  type OperationsTripOption,
} from "../../services/operations-report.service";
import { buildOperationsTripChoices, findOperationsTripChoice } from "../../services/operations-trip-selection";
import ReportDropdownEditor from "./ReportDropdownEditor";
import OffloadDrSelector from "./OffloadDrSelector";
import { offloadTransactionChoice, type OffloadTransaction } from "../../services/offload-dr-selection";
import { MAX_OFFLOAD_IMAGES, selectReportImages, validateReportImage } from "../../services/report-image-selection";

const inputClass = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#2678b9] focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-full bg-[#0b2341] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1d5f94] disabled:cursor-not-allowed disabled:opacity-50";
const cancelClass = "inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50";

type PendingReceiptUpload = { eventType: "BACKLOAD" | "OFFLOAD"; recordId: string; files: File[] };

type Props = {
  token: string;
  assignedDispatch?: boolean;
  tripOptions: OperationsTripOption[];
  tripsLoading: boolean;
  tripsError?: string | null;
  onSubmitted: () => void | Promise<void>;
  onComplete?: (message?: string) => void;
  onCancel?: () => void;
};

export default function OperationsEventSubmissionForm({ token, assignedDispatch = false, tripOptions, tripsLoading, tripsError, onSubmitted, onComplete, onCancel }: Props) {
  const { profile } = useAuth();
  const canManage = ["ADMIN", "STAFF"].includes(profile?.role ?? "");
  const [reportedAt, setReportedAt] = useState(() => manilaDateTime());
  const [dateEdited, setDateEdited] = useState(false);
  const [reporter, setReporter] = useState<{ id: string; name: string } | null>(null);
  const reporterId = reporter?.id ?? profile?.id ?? "";
  const reporterName = reporter?.name ?? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const [quantity, setQuantity] = useState("");
  const [totalCbm, setTotalCbm] = useState("");
  const [tripId, setTripId] = useState("");
  const [drTransaction, setDrTransaction] = useState<OffloadTransaction | null>(null);
  const [eventType, setEventType] = useState<"BACKLOAD" | "OFFLOAD">("OFFLOAD");
  const [reason, setReason] = useState("");
  const [numberOfBoxes, setNumberOfBoxes] = useState("");
  const [comments, setComments] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [receipts, setReceipts] = useState<OperationsReceipt[]>([]);
  const [pendingUpload, setPendingUpload] = useState<PendingReceiptUpload | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const submitGuard = useRef(false);
  const choices = useMemo(() => eventType === "OFFLOAD" && !assignedDispatch ? drTransaction ? [offloadTransactionChoice(drTransaction)] : [] : buildOperationsTripChoices(tripOptions), [tripOptions, eventType, drTransaction, assignedDispatch]);
  const selectedChoice = findOperationsTripChoice(choices, tripId);
  const selectedTrip = selectedChoice?.trip ?? null;
  const submitting = busy || Boolean(pendingUpload);
  const maximumImages = eventType === "OFFLOAD" ? MAX_OFFLOAD_IMAGES : 20;

  async function refreshReports() {
    try {
      await onSubmitted();
      return null;
    } catch {
      return "The report list could not refresh. Use Retry loading reports; do not submit this report again.";
    }
  }

  async function uploadPendingReceipts(pending: PendingReceiptUpload) {
    for (let index = 0; index < pending.files.length; index += 1) {
      try {
        setStatus(`Uploading image ${index + 1} of ${pending.files.length}…`);
        await uploadOperationsReceipt(token, pending.eventType, pending.recordId, pending.files[index]);
      } catch (cause) {
        setPendingUpload({ ...pending, files: pending.files.slice(index) });
        setError(cause instanceof Error ? cause.message : "Unable to upload the receipt.");
        setStatus("The report was saved, but the receipt still needs to be uploaded. Retry the receipt upload below; do not submit another report.");
        const refreshError = await refreshReports();
        if (refreshError) setStatus(`The report was saved and the receipt still needs uploading. ${refreshError}`);
        return;
      }
    }

    setPendingUpload(null);
    let completionMessage = "Report and images submitted.";
    try {
      const signedReceipts = await fetchOperationsReceipts(token, pending.eventType, pending.recordId);
      setReceipts(signedReceipts);
      setStatus("Report and images submitted.");
    } catch {
      setReceipts([]);
      completionMessage = "The report and receipt were saved, but the secure image link could not be refreshed. Do not submit another report; try viewing the report again later.";
      setStatus(completionMessage);
    }
    const refreshError = await refreshReports();
    onComplete?.(refreshError ? `${completionMessage} ${refreshError}` : completionMessage);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitGuard.current || pendingUpload) return;
    setError("");
    setStatus("");
    setReceipts([]);

    const choice = findOperationsTripChoice(choices, tripId);
    const trip = choice?.trip;
    if (!trip || !choice?.selectable) {
      setError(eventType === "OFFLOAD" ? "Select an eligible transaction by DR Number." : "Select a trip with a valid dispatch number.");
      return;
    }
    if (choice.stopId && !trip.stops.some((stop) => stop.id === choice.stopId)) {
      setError("This dispatch no longer matches a stop on the selected trip. Select the dispatch again.");
      return;
    }
    const normalizedReason = reason.trim();
    const normalizedComments = comments.trim();
    if (!normalizedReason || normalizedReason.length > 2000) {
      setError("Enter a reason (up to 2,000 characters).");
      return;
    }
    if (numberOfBoxes !== "" && (!Number.isSafeInteger(Number(numberOfBoxes)) || Number(numberOfBoxes) < 0)) {
      setError("Number of boxes must be a non-negative whole number or left blank.");
      return;
    }
    const imageErrors = files.map(validateReportImage).filter(Boolean);
    if (files.length > maximumImages || imageErrors.length) {
      setError(files.length > maximumImages ? `Choose at most ${maximumImages} images.` : imageErrors.join(" "));
      return;
    }

    let offloadDetails = {};
    if (eventType === "OFFLOAD") {
      try {
        offloadDetails = { quantity: optionalOffloadNumber(quantity), total_cbm: optionalOffloadNumber(totalCbm),
          ...(canManage && dateEdited ? { reported_at: manilaDateTimeToIso(reportedAt) } : {}),
          ...(canManage && reporter ? { reported_by: reporter.id } : {}) };
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the report values."); return; }
    }

    submitGuard.current = true;
    setBusy(true);
    setStatus("Submitting report…");
    let created;
    try {
      created = await createScopedReport(token, eventType === "OFFLOAD" ? "offloads" : "backloads", {
        trip_id: trip.id,
        trip_stop_id: choice.stopId,
        reason: normalizedReason,
        number_of_boxes: numberOfBoxes === "" ? null : Number(numberOfBoxes),
        comments: normalizedComments || null,
        ...offloadDetails,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to create the ${eventType.toLowerCase()} report.`);
      setStatus("");
      submitGuard.current = false;
      setBusy(false);
      return;
    }

    if (files.length === 0) {
      setStatus("Report submitted.");
      const refreshError = await refreshReports();
      onComplete?.(refreshError ? `Report submitted. ${refreshError}` : "Report submitted.");
      submitGuard.current = false;
      setBusy(false);
      return;
    }

    const pending = { eventType, recordId: created.id, files };
    setPendingUpload(pending);
    await uploadPendingReceipts(pending);
    submitGuard.current = false;
    setBusy(false);
  }

  async function retryReceiptUpload() {
    if (!pendingUpload || submitGuard.current) return;
    submitGuard.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await uploadPendingReceipts(pendingUpload);
    } finally {
      submitGuard.current = false;
      setBusy(false);
    }
  }

  const tripListMessage = tripsLoading
    ? "Loading available trips…"
    : tripsError
      ? tripsError
      : choices.length === 0
        ? "No trips are available for report submission."
        : "Select an existing trip. No trip will be created by this form.";

  return <form onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="operations-add-report-title" className="flex max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-100">
    <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-6 py-5 sm:px-8">
      <div>
        <h2 id="operations-add-report-title" className="text-base font-semibold text-slate-800">{assignedDispatch ? "Report Trip" : `Add ${eventType === "OFFLOAD" ? "Offload" : "Backload"} report`}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{eventType === "OFFLOAD" ? "Choose a delivery by DR Number and enter the report details." : "Choose an existing trip and enter the report details."}</p>
      </div>
      {onCancel && <button type="button" onClick={onCancel} disabled={submitting} aria-label="Close" className="rounded-full p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"><X className="h-4 w-4" /></button>}
    </header>

    <div className="flex-1 space-y-6 overflow-y-auto bg-white px-6 py-6 sm:px-8">
      <section className="space-y-4" aria-labelledby="operations-trip-information-title">
        <div>
          <h3 id="operations-trip-information-title" className="text-sm font-medium text-slate-700">Transaction</h3>
          <p className="mt-0.5 text-xs text-slate-400">Trip and assignment details are read-only and come from existing TMS records.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {eventType === "OFFLOAD" && !assignedDispatch ? <div className="text-xs font-semibold text-slate-600 sm:col-span-2">DR Number <span className="text-rose-600">*</span><div className="mt-1"><OffloadDrSelector token={token} value={drTransaction} disabled={submitting} onSelect={(row) => { setDrTransaction(row); setTripId(row.id); setQuantity(row.quantity == null ? "" : String(row.quantity)); setTotalCbm(row.total_cbm == null ? "" : String(row.total_cbm)); setError(""); }} /></div></div> : <div className="text-xs font-semibold text-slate-600 sm:col-span-2">Dispatch Number <span className="text-rose-600">*</span>
            <div className="mt-1"><ReportDropdownEditor label="Dispatch Number" value={tripId} displayValue={selectedChoice?.label ?? ""} options={choices.filter((choice) => choice.selectable).map((choice) => ({ value: choice.id, label: choice.label }))} autoOpen={false} popoverZIndex={2200} showStoredValue={false} loading={tripsLoading} error={tripsError ?? undefined} disabled={submitting || tripsLoading || Boolean(tripsError)} onSelect={(id) => { setTripId(id); const values = selectedTransactionValues(findOperationsTripChoice(choices, id)); setQuantity(values.quantity); setTotalCbm(values.totalCbm); setError(""); }} /></div>
            <span className={`mt-1 block font-normal ${tripsError ? "text-rose-700" : "text-slate-400"}`} role={tripsError ? "alert" : undefined}>{tripListMessage}</span>
          </div>}
          <ReadOnlyField label="Dispatch Number" value={selectedChoice?.dispatchNumber || "Not recorded"} />
          {eventType === "OFFLOAD" && <><ReadOnlyField label="Warehouse" value={drTransaction?.warehouse || "Not recorded"} /><ReadOnlyField label="Delivery Destination" value={drTransaction?.destination || "Not recorded"} /></>}
          <ReadOnlyField label="Driver" value={selectedTrip?.driver_name || "Unassigned"} />
          <ReadOnlyField label="Plate Number" value={selectedTrip?.plate_number || "Not assigned"} />
          <ReadOnlyField label="Route" value={selectedTrip?.route || "Route unavailable"} className="sm:col-span-2" />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="operations-offload-details-title">
        <div>
          <h3 id="operations-offload-details-title" className="text-sm font-medium text-slate-700">{eventType === "OFFLOAD" ? "Offload Details" : "Backload Details"}</h3>
          <p className="mt-0.5 text-xs text-slate-400">Enter the report reason and any supporting information.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Event Type
            <select className={`${inputClass} mt-1`} value={eventType} onChange={(event) => { setEventType(event.target.value as "BACKLOAD" | "OFFLOAD"); setTripId(""); setDrTransaction(null); setQuantity(""); setTotalCbm(""); }} disabled={submitting}>
              <option value="OFFLOAD">Offload</option><option value="BACKLOAD">Backload</option>
            </select>
          </label>
          {eventType === "OFFLOAD" && <>
            <label className="text-xs font-semibold text-slate-600">Report Date (Asia/Manila)<input className={`${inputClass} mt-1`} type="datetime-local" value={reportedAt} readOnly={!canManage} disabled={submitting} required={canManage} onChange={(event) => { setReportedAt(event.target.value); setDateEdited(true); }} />{!canManage && <span className="block font-normal text-slate-400">Assigned automatically when saved.</span>}</label>
            <label className="text-xs font-semibold text-slate-600">Quantity<input className={`${inputClass} mt-1`} type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={submitting} /></label>
            <label className="text-xs font-semibold text-slate-600">Total CBM<input className={`${inputClass} mt-1`} type="number" min="0" step="any" value={totalCbm} onChange={(event) => setTotalCbm(event.target.value)} disabled={submitting} /></label>
            <div className="text-xs font-semibold text-slate-600 sm:col-span-2">Reported By<div className="mt-1">{canManage ? <OperationsReporterEditor token={token} value={reporterId} name={reporterName || "Name not recorded"} disabled={submitting} onSelect={(id, name) => setReporter({ id, name })} /> : <input className={inputClass} value={reporterName || "Name not recorded"} readOnly />}</div></div>
          </>}
          <label className="text-xs font-semibold text-slate-600">Number of boxes
            <input className={`${inputClass} mt-1`} type="number" min="0" step="1" inputMode="numeric" value={numberOfBoxes} onChange={(event) => setNumberOfBoxes(event.target.value)} disabled={submitting} placeholder="Optional" />
          </label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Reason <span className="text-rose-600">*</span>
            <textarea className={`${inputClass} mt-1`} rows={3} required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={submitting} />
          </label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Remarks
            <textarea className={`${inputClass} mt-1`} rows={2} value={comments} onChange={(event) => setComments(event.target.value)} disabled={submitting} />
          </label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Supporting images
            <input className={`${inputClass} mt-1`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
              const result = selectReportImages(files, Array.from(event.target.files ?? []), maximumImages);
              setFiles(result.files);
              setError(result.errors.join(" "));
              event.target.value = "";
            }} disabled={submitting} />
            <span className="mt-1 block font-normal text-slate-400">Up to {maximumImages} images. JPEG, PNG, or WebP; up to 5 MB each.</span>
          </label>
        </div>
        {files.length > 0 && <div className="flex flex-wrap gap-3" aria-label="Selected report images">{files.map((file, index) => <SelectedReportImage key={`${file.name}:${file.lastModified}:${file.size}:${file.type}`} file={file} disabled={submitting} onRemove={() => setFiles((current) => current.filter((_, position) => position !== index))} />)}</div>}
        {files.length > maximumImages && <p role="alert" className="text-xs text-rose-700">Remove {files.length - maximumImages} image{files.length - maximumImages === 1 ? "" : "s"} before saving. This report type supports up to {maximumImages} images.</p>}
      </section>

      {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
      {status && <p role="status" className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{status}</p>}
      {receipts.length > 0 && <div className="flex flex-wrap gap-3">{receipts.map((receipt) => <a key={receipt.id} href={receipt.signed_url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">{receipt.file_name}</a>)}</div>}
    </div>

    <footer className="flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4 sm:px-8">
      {onCancel && <button type="button" onClick={onCancel} disabled={submitting} className={cancelClass}>Cancel</button>}
      {pendingUpload
        ? <button className={buttonClass} type="button" onClick={() => void retryReceiptUpload()} disabled={busy}>{busy ? "Uploading…" : "Retry receipt upload"}</button>
        : <button className={buttonClass} type="submit" disabled={submitting || !selectedChoice?.selectable || (eventType === "BACKLOAD" && (tripsLoading || Boolean(tripsError))) || !reason.trim() || files.length > maximumImages}>{busy ? "Saving…" : assignedDispatch ? "Submit Report" : "Add Report"}</button>}
    </footer>
  </form>;
}

function SelectedReportImage({ file, disabled, onRemove }: { file: File; disabled: boolean; onRemove: () => void }) {
  const previewRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (previewRef.current) previewRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="relative w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
    <img ref={previewRef} alt={file.name} className="h-24 w-full object-cover" />
    <button type="button" aria-label={`Remove ${file.name}`} title={`Remove ${file.name}`} disabled={disabled} onClick={onRemove} className="absolute right-1 top-1 rounded-full bg-white p-1 text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
    <span className="block truncate px-2 py-1 text-[10px] text-slate-600">{file.name}</span>
  </div>;
}

function ReadOnlyField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <label className={`text-xs font-semibold text-slate-600 ${className}`}>{label}<input className={`${inputClass} mt-1`} value={value} readOnly tabIndex={-1} /></label>;
}
