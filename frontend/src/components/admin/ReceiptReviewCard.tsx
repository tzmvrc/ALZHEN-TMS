import {savedPdfPages} from "../../services/pdf-intake.service";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { surface } from "./dashboardStyles";
import PodDecisionControls from "./PodDecisionControls";
import { recognizeReceipt } from "../../services/ocr.service";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import { RECEIPT_TABLES } from "../../services/live-activity.service";
import {
  EMPTY_SNAPSHOT,
  composeSaved,
  extractFields,
  sameSnapshot,
  snapshotOf,
  type ReceiptFields,
  type ReceiptSnapshot,
} from "../../services/receipt-fields.service";
import {
  fetchTripReceipts,
  saveReceiptText,
  interpretReceiptText,
  type ReceiptInterpretation,
  type TripReceipt,
} from "../../services/receipt.service";

const LOW_CONFIDENCE = 70;

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function reviewState(receipt: TripReceipt): "reviewed" | "needs-review" | "not-scanned" {
  if (receipt.reviewed_at) return "reviewed";
  return receipt.ocr_text ? "needs-review" : "not-scanned";
}

const stateStyle = {
  reviewed: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", label: "Verified" },
  "needs-review": { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500", label: "Needs review" },
  "not-scanned": { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400", label: "Awaiting OCR" },
} as const;

const inputClass =
  "mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0b2341] shadow-sm placeholder:text-slate-400 focus:border-[#2678b9] focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Field({ label, htmlFor, children, extra }: { label: string; htmlFor: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-[#0b2341]">{label}</label>
      {children}
      {extra}
    </div>
  );
}

export default function ReceiptReviewCard({
  tripId,
  accessToken,
  stopLabels,
  refreshKey = 0,
}: {
  tripId: string;
  accessToken: string | null;
  /** trip_stop_id → "Stop 1 · Store name" */
  stopLabels: Record<string, string>;
  refreshKey?: number;
}) {
  const [receipts, setReceipts] = useState<TripReceipt[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  /* `work` is what the admin is editing; `base` is what is saved. They differ = unsaved edits. */
  const [work, setWork] = useState<ReceiptSnapshot>(EMPTY_SNAPSHOT);
  const [base, setBase] = useState<ReceiptSnapshot>(EMPTY_SNAPSHOT);
  const baseRef = useRef(base);
  baseRef.current = base;
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [sessionConfidence, setSessionConfidence] = useState<Record<string, number>>({});
  const [liveTick, setLiveTick] = useState(0);
  const [interpreting, setInterpreting] = useState(false);
  const interpretationScope = useMemo(() => ({tripId,signedIn:Boolean(accessToken)}), [accessToken, tripId]);
  const [interpretation, setInterpretation] = useState<(ReceiptInterpretation & {scope:object}) | null>(null);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const attempted = useRef(new Set<string>());

  const active = receipts?.find((receipt) => receipt.id === activeId) ?? null;
  const dirty = !sameSnapshot(work, base);
  const confidence = active ? sessionConfidence[active.id] ?? active.ocr_confidence : null;

  const replaceReceipt = (updated: TripReceipt) =>
    setReceipts((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)));
  const setField = (key: keyof ReceiptFields, value: string) => {
    setWork((current) => ({ ...current, fields: { ...current.fields, [key]: value } }));
    setJustSaved(false);
  };

  /* ---- load ---- */
  useEffect(() => {
    if (!accessToken) return;
    let current = true;
    void fetchTripReceipts(accessToken, tripId).then(
      (rows) => {
        if (!current) return;
        setReceipts(rows);
        setLoadError(null);
        setActiveId((id) =>
          id && rows.some((row) => row.id === id)
            ? id
            : (rows.find((row) => !row.reviewed_at) ?? rows[0])?.id ?? null,
        );
      },
      (cause: unknown) => {
        if (!current) return;
        setReceipts((rows) => rows ?? []);
        setLoadError(cause instanceof Error ? cause.message : "Unable to load delivery receipts.");
      },
    );
    return () => {
      current = false;
    };
  }, [accessToken, tripId, refreshKey, liveTick]);

  /* A driver just saved a receipt or its text: pick it up without a page refresh. */
  useEffect(() => {
    let timer: number | null = null;
    const unsubscribe = subscribeToAdminRealtime((event) => {
      const tables: readonly string[] = RECEIPT_TABLES;
      if (event.kind === "batch" ? !event.tables.some(table=>tables.includes(table)) : event.kind === "recovered" ? !tables.includes(event.table) : event.kind !== "resume" && (
        !tables.includes(event.payload.table) ||
        ![event.payload.new?.trip_id, event.payload.old?.trip_id].includes(tripId)
      )) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setLiveTick((value) => value + 1), 300);
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [tripId]);

  /* ---- OCR ---- */
  const runOcr = async (receipt: TripReceipt) => {
    if (!accessToken || !receipt.signed_url) return;
    setScanning(true);
    setProgress(0);
    setScanError(null);
    setSaveError(null);
    setJustSaved(false);
    try {
      const image = receipt.mime_type==="application/pdf"?null:await fetch(receipt.signed_url);
      if (image&&!image.ok) throw new Error("The receipt photo could not be downloaded.");
      const result = await recognizeReceipt(image?await image.blob():await savedPdfPages(accessToken,tripId,receipt.id), setProgress);
      setWork(snapshotOf(result.text, receipt.dr_number ?? ""));
      setSessionConfidence((current) => ({ ...current, [receipt.id]: result.confidence }));
      if (!result.text) {
        setScanError("No text could be read from this photo. You can type the receipt details in manually.");
        return;
      }
      /* Keep the raw scan so it isn't recomputed on the next visit; still unreviewed. */
      try {
        replaceReceipt(
          await saveReceiptText(accessToken, tripId, receipt.id, {
              ocr_text: result.text,
              ocr_confidence: result.confidence,
              reviewed: false,
              expected_version: receipt.ocr_version
          }),
        );
      } catch (cause) {
        setSaveError(
          cause instanceof Error
            ? `Scanned, but the text could not be saved yet: ${cause.message}`
            : "Scanned, but the text could not be saved yet.",
        );
      }
    } catch (cause) {
      setScanError(
        cause instanceof Error
          ? cause.message
          : "Text recognition failed. Check your connection and try again.",
      );
    } finally {
      setScanning(false);
    }
  };

  /* Show the saved values for the selected receipt and scan it once if it never was. */
  useEffect(() => {
    if (!active) return;
    const snapshot = snapshotOf(active.ocr_text ?? "", active.dr_number ?? "");
    setWork(snapshot);
    setBase(snapshot);
    setScanError(null);
    setSaveError(null);
    setJustSaved(false);
    if (!active.ocr_text && active.signed_url && !attempted.current.has(active.id)) {
      attempted.current.add(active.id);
      void runOcr(active);
    }
    // Only react to switching receipts, not to every saved-text update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  /* Text that arrives later (the driver's phone finished reading, or another admin saved)
     replaces the form only if nobody has started editing it. */
  useEffect(() => {
    if (!active) return;
    const incoming = snapshotOf(active.ocr_text ?? "", active.dr_number ?? "");
    setWork((current) => (sameSnapshot(current, baseRef.current) ? incoming : current));
    setBase(incoming);
    // Only the saved text matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.ocr_text]);

  const selectReceipt = (id: string) => {
    if (id === activeId || scanning || saving || interpreting) return;
    if (dirty && !window.confirm("Discard your unsaved edits to this receipt?")) return;
    setActiveId(id);
  };

  const rescan = () => {
    if (!active || scanning || saving || interpreting) return;
    if (dirty && !window.confirm("Scanning again will replace your unsaved edits. Continue?")) return;
    void runOcr(active);
  };

  const save = async () => {
    if (!active || !accessToken || saving || scanning || interpreting) return;
    setSaving(true);
    setSaveError(null);
    try {
      replaceReceipt(
        await saveReceiptText(accessToken, tripId, active.id, {
            ocr_text: composeSaved(work),
            ocr_confidence: confidence ?? null,
            reviewed: true,
            expected_version: active.ocr_version
        }),
      );
      setJustSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Unable to save receipt text.");
    } finally {
      setSaving(false);
    }
  };

  const interpret = async () => {
    if (!active || !accessToken || scanning || saving || interpreting) return;
    setInterpretError(null);
    if (dirty) { setInterpretError("Save or undo your OCR edits before requesting interpretation."); return; }
    if (!window.confirm("Send this receipt's saved OCR text to Google Gemini for interpretation? Suggestions require human review and will not approve the POD.")) return;
    setInterpreting(true);
    try { setInterpretation({...await interpretReceiptText(accessToken, tripId, active.id, active.ocr_version),scope:interpretationScope}); }
    catch (error) { setInterpretError(`Unable to interpret with Gemini. ${error instanceof Error ? error.message : "Retry later."} Manual review remains available.`); }
    finally { setInterpreting(false); }
  };
  const currentInterpretation = interpretation?.scope === interpretationScope && interpretation?.receipt_id === active?.id && interpretation?.ocr_version === active?.ocr_version ? interpretation : null;
  const useSuggestions = () => {
    if (!currentInterpretation || currentInterpretation.linked_stop_mismatch) return;
    if (dirty && !window.confirm("Replace the corresponding draft fields with these AI suggestions?")) return;
    const map = {dr:"dr_number",receiver:"receiver_name",models:"product_information",date:"delivery_date"} as const;
    setWork(current => ({...current, fields:Object.fromEntries(Object.entries(current.fields).map(([key,value]) => {
      const suggested=currentInterpretation.interpretation.fields[map[key as keyof typeof map]];
      return [key, suggested && !suggested.uncertain && typeof suggested.value === "string" ? suggested.value : value];
    })) as ReceiptFields}));
    setJustSaved(false);
  };

  /* ---- derived ---- */
  const state = active ? reviewState(active) : null;
  const counts = {
    total: receipts?.length ?? 0,
    awaiting: receipts?.filter((r) => reviewState(r) === "not-scanned").length ?? 0,
    review: receipts?.filter((r) => reviewState(r) === "needs-review").length ?? 0,
    done: receipts?.filter((r) => reviewState(r) === "reviewed").length ?? 0,
  };
  const { fields, raw } = work;
  const drNumber = active?.dr_number?.trim() ?? "";
  const detectedDr = extractFields(raw).dr;
  const drSuggestion = detectedDr && squash(detectedDr) !== squash(fields.dr) ? detectedDr : null;
  const drFound = fields.dr && raw ? squash(raw).includes(squash(fields.dr)) : null;
  const hasContent = raw.trim().length > 0 || Object.values(fields).some((value) => value.trim());
  const canSave = Boolean(active) && hasContent && (dirty || state !== "reviewed") && !scanning && !saving && !interpreting;

  return (
    <section aria-labelledby="receipt-card-title" className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="receipt-card-title" className="text-lg font-bold text-[#0b2341]">Delivery receipts &amp; OCR</h3>
          <p className="text-sm text-slate-500">Check the fields read from each driver’s photo, then confirm.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receipts" value={counts.total} hint="Uploaded for this trip" tone="text-[#0b2341]" />
        <Stat label="Awaiting OCR" value={counts.awaiting} hint="Not scanned yet" tone="text-slate-600" />
        <Stat label="Needs review" value={counts.review} hint="Read, not yet checked" tone="text-amber-600" />
        <Stat label="Verified" value={counts.done} hint="Checked by an admin" tone="text-emerald-600" />
      </div>

      {receipts === null ? (
        <div role="status" className={`${surface.card} flex items-center justify-center gap-2 py-16 text-sm text-slate-500`}>
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#2678b9]" />
          Loading receipts
        </div>
      ) : receipts.length === 0 ? (
        <div className={`${surface.card} flex flex-col items-center justify-center gap-1 py-14 text-center`}>
          <p className="text-sm font-semibold text-[#0b2341]">No receipts uploaded yet</p>
          <p className="max-w-xs text-xs text-slate-500">When a driver saves a delivery receipt photo, it appears here with its fields ready to check.</p>
          {loadError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadError}</p>}
        </div>
      ) : (
        <div className="grid min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-[250px_minmax(0,1fr)]">
          {/* Queue */}
          <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            <h4 className="px-5 py-4 text-sm font-semibold text-[#0b2341]">Submission queue</h4>
            <ul className="max-h-[220px] overflow-y-auto border-t border-slate-100 lg:max-h-none">
              {receipts.map((receipt) => {
                const style = stateStyle[reviewState(receipt)];
                const selected = receipt.id === activeId;
                const title = (receipt.trip_stop_id && stopLabels[receipt.trip_stop_id]) || receipt.dr_number || "Receipt";
                return (
                  <li key={receipt.id} className="border-b border-slate-100 last:border-b-0">
                    <button
                      type="button"
                      aria-current={selected}
                      onClick={() => selectReceipt(receipt.id)}
                      className={`block w-full px-5 py-3.5 text-left transition ${selected ? "bg-[#eaf1fb]" : "hover:bg-slate-50"}`}
                    >
                      <span className="block truncate text-sm font-semibold text-[#0b2341]">{title}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {receipt.dr_number ? `DR ${receipt.dr_number}` : "No DR number"}
                        {receipt.uploaded_at ? ` · ${new Date(receipt.uploaded_at).toLocaleDateString()}` : ""}
                      </span>
                      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.pill}`}>
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {style.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Verification */}
          {active && state && (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-[#0b2341]">OCR verification{drNumber ? ` — DR ${drNumber}` : ""}</h4>
                  <p className="text-xs text-slate-500">
                    {confidence !== null && confidence !== undefined ? `Confidence ${confidence}%` : "Confidence not recorded"}
                    {active.uploaded_at ? ` · Uploaded ${new Date(active.uploaded_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {justSaved && !dirty && <span role="status" className="text-xs font-semibold text-emerald-700">Saved</span>}
                  <button
                    type="button"
                    disabled={!canSave}
                    onClick={() => void save()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b2341] px-4 text-xs font-semibold text-white transition hover:bg-[#16385f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
                    {saving ? "Saving…" : state === "reviewed" ? "Save changes" : "Confirm receipt"}
                  </button>
                </div>
              </div>

              <div className="grid min-w-0 xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
                {/* Photo */}
                <div className="min-w-0 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Raw scan</p>
                  <div className="relative mt-3 flex aspect-[3/4] max-h-[520px] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                    {active.signed_url ? (
                      active.mime_type==="application/pdf"?<iframe title="Original PDF receipt" sandbox="" src={active.signed_url} className="h-full w-full"/>:(<img src={active.signed_url} alt={`Delivery receipt${drNumber ? ` ${drNumber}` : ""}`} className="h-full w-full object-contain" />)
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ImageOff aria-hidden="true" className="h-8 w-8" />
                        <span className="text-xs">Photo unavailable</span>
                      </div>
                    )}
                    {active.signed_url && (
                      <a
                        href={active.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#0b2341] shadow transition hover:bg-white"
                      >
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        Full size
                      </a>
                    )}
                  </div>
                </div>

                {/* Fields */}
                <div className="relative min-w-0 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Extracted fields (editable)</p>
                  <div className="mt-3 space-y-4">
                    <Field
                      label="DR number"
                      htmlFor="rc-dr"
                      extra={drSuggestion && (
                        <button type="button" onClick={() => setField("dr", drSuggestion)} className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#e6f0f9] px-2.5 py-1 text-[11px] font-semibold text-[#1d5f94] transition hover:bg-[#d5e7f6]">
                          <Sparkles aria-hidden="true" className="h-3 w-3" />
                          Photo shows {drSuggestion}. Use it
                        </button>
                      )}
                    >
                      <input id="rc-dr" value={fields.dr} disabled={scanning} maxLength={100} onChange={(e) => setField("dr", e.target.value)} placeholder="e.g. 386601" className={inputClass} />
                    </Field>
                    <Field label="Receiver / signature" htmlFor="rc-receiver">
                      <input id="rc-receiver" value={fields.receiver} disabled={scanning} onChange={(e) => setField("receiver", e.target.value)} placeholder="Who received the delivery" className={inputClass} />
                    </Field>
                    <Field label="Model codes" htmlFor="rc-models">
                      <input id="rc-models" value={fields.models} disabled={scanning} onChange={(e) => setField("models", e.target.value)} placeholder="Separate with commas" className={inputClass} />
                    </Field>
                    <Field label="Delivery completion date" htmlFor="rc-date">
                      <input id="rc-date" type="date" value={fields.date} disabled={scanning} onChange={(e) => setField("date", e.target.value)} className={inputClass} />
                    </Field>
                  </div>

                  <ul className="mt-4 space-y-1.5 text-xs">
                    {confidence !== null && confidence !== undefined && confidence < LOW_CONFIDENCE && (
                      <li className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">Low confidence ({confidence}%). The photo may be blurry, so check every field against the image.</li>
                    )}
                    {drFound === false && (
                      <li className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">DR number {fields.dr} was not found in the scanned text. Compare with the photo.</li>
                    )}
                    {drFound === true && <li className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">DR number {fields.dr} appears on the receipt.</li>}
                  </ul>
                  {scanError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{scanError}</p>}
                  {saveError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{saveError}</p>}
                  {interpretError && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{interpretError}</p>}
                  {currentInterpretation && <section aria-label="Gemini suggestions" className="mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs">
                    <p className="font-semibold">Gemini suggestions — review required</p>
                    <p>Suggestions are not saved or approved. Original OCR and transaction values remain unchanged.</p>
                    <dl className="space-y-2">{Object.entries(currentInterpretation.interpretation.fields).map(([key,field])=><div key={key}>
                      <dt className="font-semibold capitalize">{key.replaceAll("_"," ")}</dt>
                      <dd>{field.value ?? "Not found"}{field.uncertain ? " · Needs review" : ""}</dd>
                      {field.evidence && <dd className="text-slate-500">OCR: {field.evidence}</dd>}
                    </div>)}</dl>
                    {currentInterpretation.interpretation.warnings.map((warning,index)=><p key={index}>{warning}</p>)}
                    <p>{currentInterpretation.matching.ambiguous ? "Transaction match is ambiguous or incomplete. Review the association manually." : `Suggested destination: ${currentInterpretation.matching.suggested?.store_name ?? currentInterpretation.matching.suggested?.customer_name ?? "Review transaction"}`}</p>
                    {currentInterpretation.matching.suggested?.evidence.map(item=><p key={item}>{item}</p>)}
                    {currentInterpretation.linked_stop_mismatch && <p role="alert" className="font-semibold text-rose-700">The suggested stop differs from this upload's stop. Do not confirm until its association is reviewed.</p>}
                    <button type="button" disabled={currentInterpretation.linked_stop_mismatch || scanning || saving} onClick={useSuggestions} className={`${surface.chipGhost} disabled:opacity-50`}>Use suggested fields</button>
                  </section>}
                  {loadError && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{loadError}</p>}
                  <PodDecisionControls key={active.id} token={accessToken} receipt={active} disabled={dirty||saving||scanning||interpreting} reviewedFields={{dr_number:fields.dr,receiver_name:fields.receiver,product_information:fields.models,delivery_date:fields.date||null}} onSaved={replaceReceipt}/>

                  <div className="mt-4 rounded-lg bg-slate-50 p-4 text-xs">
                    <p className="font-semibold text-[#0b2341]">On save</p>
                    <p className="mt-1 text-slate-500">Marks this receipt as verified.</p>
                    <p className="text-slate-500">Keeps the fields above with the scanned text on this trip.</p>
                    {state === "reviewed" && active.reviewed_at && !dirty && (
                      <p className="mt-1 text-slate-500">Verified {new Date(active.reviewed_at).toLocaleString()}</p>
                    )}
                  </div>

                  <details className="group mt-4 rounded-lg border border-slate-200">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold text-[#0b2341]">
                      Text read from the photo
                      <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-slate-100 p-3">
                      <label htmlFor="receipt-text" className="sr-only">Text from receipt</label>
                      <textarea
                        id="receipt-text"
                        value={raw}
                        disabled={scanning}
                        onChange={(event) => { setWork((current) => ({ ...current, raw: event.target.value })); setJustSaved(false); }}
                        spellCheck={false}
                        rows={8}
                        placeholder="No text yet. Scan the photo or type the receipt details."
                        className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-700 focus:border-[#2678b9] focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                      />
                    </div>
                  </details>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={scanning || saving || interpreting || !active.signed_url} onClick={rescan} className={`${surface.chipGhost} disabled:cursor-not-allowed disabled:opacity-50`}>
                      <RefreshCw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                      Scan again
                    </button>
                    <button type="button" disabled={scanning || saving || interpreting || !active.ocr_text} onClick={() => void interpret()} className={`${surface.chipGhost} disabled:opacity-50`}>
                      <Sparkles aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />{interpreting ? "Interpreting…" : "Interpret with Gemini"}
                    </button>
                    {dirty && (
                      <button type="button" disabled={scanning || saving} onClick={() => setWork(base)} className={`${surface.chipGhost} disabled:opacity-50`}>
                        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                        Undo edits
                      </button>
                    )}
                  </div>

                  {scanning && (
                    <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/85 px-8 text-center backdrop-blur-[1px]">
                      <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin text-[#2678b9]" />
                      <p className="text-sm font-semibold text-[#0b2341]">Reading the receipt…</p>
                      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                        <div className="h-full rounded-full bg-[#2678b9] transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
