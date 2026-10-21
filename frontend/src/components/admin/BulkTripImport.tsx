import TripImportPreview from "./TripImportPreview";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import TripCargoPlanner from "./TripCargoPlanner";
import ImportDestinationReview, { destinationKey, type LocationDecision } from "./ImportDestinationReview";
import { cargoSignature, emptyCargoPlan, validateCargo, type CargoPlan, type CargoLine } from "../../services/cargo-planning";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FileSpreadsheet, Loader2, Upload, X, Package, Truck, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { readImportFile, importFields, importMappingSummary, importPayload, type ImportFile, type ImportField } from "./tripImportFiles";
import { previewImport, commitImport, confirmImportCargo, saveImportAssignmentCompanies, fetchImportBatches, reopenImportBatch, saveImportBatchDraft, type ImportRecoveryDraft, type ImportBatchSummary, type ImportPreview, type ImportTarget, type ImportOutcome } from "../../services/trip-import.service";
import { fetchTrips, type TripRecord } from "../../services/trip.service";
import TripFormNotice from "./TripFormNotice";

const control = "min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2678b9]/20 disabled:bg-slate-100 disabled:text-slate-500";
const button = "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#0b2341] shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-full border border-transparent !bg-[#0b2341] px-4 py-2 text-sm font-medium !text-white shadow-sm hover:!bg-[#1a365d] disabled:opacity-50 transition-colors";

export default function BulkTripImport({ onClose, onComplete, onImported, initialTarget }: { onClose: () => void; onComplete?: () => void; onImported: () => void; initialTarget?: ImportTarget }) {
  const [inheritedTarget, setInheritedTarget] = useState(initialTarget);
  const defaultTarget = (): ImportTarget => inheritedTarget ? { ...inheritedTarget } : ({ mode: "new", value: "", allow_create: true });
  const [plans, setPlans] = useState<Record<string, CargoPlan>>({});
  const [locations, setLocations] = useState<Record<string, LocationDecision>>({});
  const [cargoSaved, setCargoSaved] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const [companiesSaved, setCompaniesSaved] = useState<Record<string, boolean>>({});
  const savingRef = useRef(false);
  const refreshOnClose = useRef(false);
  const { accessToken } = useAuth();
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [batchId, setBatchId] = useState<string>(() => crypto.randomUUID());
  
  const batchRevision = useRef(0), draftWrites = useRef<Promise<unknown>>(Promise.resolve());
  const [draftStatus, setDraftStatus] = useState("");
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [batches, setBatches] = useState<ImportBatchSummary[]>([]);
  const [targets, setTargets] = useState<Record<string, ImportTarget>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifiedCbm, setVerifiedCbm] = useState(false);
  const [verifiedUnmapped, setVerifiedUnmapped] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, ImportOutcome>>({});
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0);
  const [mappedFileRequest, setMappedFileRequest] = useState<{ fileId: string; id: number }>();
  const [draftLoaded, setDraftLoaded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [error]);
  const [existing, setExisting] = useState<TripRecord[]>([]);
  const [query, setQuery] = useState("");
  const [existingError, setExistingError] = useState("");
  const [warehouseLabels, setWarehouseLabels] = useState<Record<string, string>>({});
  const draft = useMemo<ImportRecoveryDraft>(() => ({ files, preview, targets, plans, locations, initialTarget: inheritedTarget, confirmed, verified, verifiedCbm, verifiedUnmapped, started }), [files, preview, targets, plans, locations, inheritedTarget, confirmed, verified, verifiedCbm, verifiedUnmapped, started]);
  
  async function persistDraft(snapshot: ImportRecoveryDraft = draft) {
    if (!accessToken || !snapshot.files.length) return;
    const write = draftWrites.current.catch(() => undefined).then(async () => { setDraftStatus("Saving draft..."); const saved = await saveImportBatchDraft(accessToken, batchId, batchRevision.current, snapshot); batchRevision.current = saved.revision; setDraftStatus("Draft saved. Reopen it from Saved imports to continue."); });
    draftWrites.current = write;
    try { await write; } catch (cause) { setDraftStatus(cause instanceof Error ? cause.message : "Draft not saved. Keep this window open."); throw cause; }
  }
  useEffect(() => {
    if (!files.length || saving || busy || preview?.setup_required) return;
    const timer = setTimeout(() => { void persistDraft(draft).catch(() => { }); }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saving, busy, batchId, accessToken]);
  async function savedImports() { if (!accessToken) return; setBusy(true); setError(""); try { setBatches(await fetchImportBatches(accessToken)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load saved imports."); } finally { setBusy(false); } }
  async function closeImport() {
    if (saving || busy) return; setBusy(true); setCloseBlocked(false);
    try { if (files.length && !preview?.setup_required) await persistDraft(); if (refreshOnClose.current) onImported(); if (finished && onComplete) onComplete(); else onClose(); }
    catch (cause) { setCloseBlocked(true); setError(`${cause instanceof Error ? cause.message : "Draft not saved."} Keep this window open to retry, or explicitly close without saving the latest changes.`); }
    finally { setBusy(false); }
  }
  async function resume(id: string) {
    if (!accessToken) return; setBusy(true); setError("");
    try {
      if (files.length) await persistDraft(); else await draftWrites.current.catch(() => undefined);
      const recovered = await reopenImportBatch(accessToken, id), saved = recovered.draft;
      if (!Array.isArray(saved.files) || !saved.files.length) throw Error("This older batch has no saved source preview. Its imported records are preserved.");
      batchRevision.current = recovered.revision; setBatchId(id); setFiles(saved.files); setPreview(saved.preview); setTargets(saved.targets ?? {}); setPlans(saved.plans ?? {}); setLocations(saved.locations ?? {}); setInheritedTarget(saved.initialTarget); setConfirmed(false); setVerified(Boolean(saved.verified)); setVerifiedCbm(Boolean(saved.verifiedCbm)); setVerifiedUnmapped(Boolean(saved.verifiedUnmapped)); setOutcomes(Object.fromEntries(recovered.outcomes.map(row => [row.source_identity, row]))); setCargoSaved(recovered.cargo_saved); setCompaniesSaved({}); setStarted(Boolean(saved.started) || recovered.outcomes.length > 0); setDraftLoaded(Boolean(saved.preview)); setPhase(saved.preview ? 2 : 1); setWarehouseLabels({}); setDraftStatus(`Reopened ${recovered.state}. ${recovered.last_error ?? "Existing trip and product IDs are preserved."}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reopen this batch."); } finally { setBusy(false); }
  }
  const groups = [...new Set(files.flatMap(file => file.rows.map(row => row.group.trim())).filter(Boolean))];
  const rawRows = useMemo(() => files.flatMap(file => importPayload([file])[0].rows.map(row => ({ ...row, filename: file.name, file_id: file.id, errors: [] as string[] }))), [files]);
  const results = Object.values(outcomes), imported = results.filter(row => row.status === "imported").length;
  const skipped = results.filter(row => row.status === "skipped").length, failed = results.filter(row => row.status === "failed").length;
  const locked = started || results.some(row => row.status !== "failed");
  const validRows = preview?.rows.filter(row => !row.errors.length) ?? [];
  const stopCounts = new Set(validRows.filter(row => !row.duplicate).map(row => JSON.stringify([row.group, row.values.customer_name, row.values.ship_to, row.values.province, row.values.city]))).size;
  const destinations = [...new Map(validRows.map(row => [destinationKey(row.values), { key: destinationKey(row.values), customer: row.values.customer_name || '', shipTo: row.values.ship_to || '', province: row.values.province || '', city: row.values.city || '' }])).values()];
  const cargoLines = (group: string): CargoLine[] => validRows.filter(row => row.group === group && !row.duplicate && !(outcomes[row.source_identity]?.status === "skipped" && outcomes[row.source_identity]?.original_batch_id !== batchId)).map(row => ({ key: row.source_identity, dr: row.values.dr_number || '', stop: row.values.ship_to || '', label: row.values.customer_model || row.values.dr_number || 'Product', quantity: row.values.quantity || '', cbm: row.values.cbm || '' }));
  
  function editCell(fileId: string, line: number, key: ImportField, value: string) {
    setFiles(current => current.map(file => { if (file.id !== fileId) return file; const index = file.mapping[key] >= 0 ? file.mapping[key] : file.headers.length; return { ...file, originalHeaders: file.originalHeaders ?? [...file.headers], headers: file.mapping[key] >= 0 ? file.headers : [...file.headers, importFields.find(([field]) => field === key)![1]], mapping: { ...file.mapping, [key]: index }, rows: file.rows.map(row => { if (row.line !== line) return row; const cells = [...row.cells]; cells[index] = value; return { ...row, cells }; }) }; })); changed();
  }
  function changed() { setDraftLoaded(false); setPhase(1); setPreview(null); setConfirmed(false); setVerified(false); setVerifiedCbm(false); setVerifiedUnmapped(false); setError(""); }
  async function load(selected: FileList) {
    setBusy(true); setError("");
    try { const loaded = []; for (const file of Array.from(selected)) loaded.push(...await readImportFile(file)); setFiles(loaded); changed(); setOutcomes({}); setPhase(1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read the files."); }
    finally { setBusy(false); }
  }
  async function prepare() {
    if (!accessToken) return;
    setBusy(true); setError("");
    try { setPreview(await previewImport(accessToken, importPayload(files))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to check import rows."); }
    finally { setBusy(false); }
  }
  async function searchExisting() {
    if (!accessToken) return;
    setExistingError("");
    try { setExisting((await fetchTrips(accessToken, { limit: 100, search: query })).rows); }
    catch (cause) { setExistingError(cause instanceof Error ? cause.message : "Unable to find trips."); }
  }
  async function save() {
    if (!preview || !draftLoaded || !accessToken || !confirmed || preview.setup_required || savingRef.current) return;
    for (const group of groups) { const plan = plans[group], lines = cargoLines(group); if (plan?.trucks.length && lines.length && !cargoSaved[group]) { const problem = validateCargo(lines, plan.trucks, plan.placements); if (!plan.confirmed || plan.signature !== cargoSignature(lines, plan.trucks) || problem) { setError(problem || "Review and confirm the current cargo proposal for every group."); return; } } }
    savingRef.current = true; setStarted(true);
    setSaving(true); setError(""); setProgress(0);
    let processed = 0;
    try {
      await persistDraft({ ...draft, started: true });
      const failures: string[] = [];
      for (const group of groups) {
        let groupFailed = false;
        const latestOutcomes = { ...outcomes };
        const target = targets[group] ?? defaultTarget();
        const pending = validRows.filter(row => row.group === group && !["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? ""));
        for (let index = 0; index < pending.length; index += 100) {
          const chunk = pending.slice(index, index + 100);
          const result = await commitImport(accessToken, batchId, group, target, chunk, verified, verifiedCbm, verifiedUnmapped, Object.fromEntries(chunk.flatMap(row => locations[destinationKey(row.values)] ? [[row.source_identity, locations[destinationKey(row.values)]]] : [])));
          if (result.rows.some(row => row.status === "failed")) groupFailed = true;
          if (result.rows.some(row => row.status === "imported")) refreshOnClose.current = true;
          Object.assign(latestOutcomes, Object.fromEntries(result.rows.map(row => [row.source_identity, row])));
          setOutcomes(current => ({ ...current, ...Object.fromEntries(result.rows.map(row => [row.source_identity, row])) }));
          processed += chunk.length; setProgress(processed);
        }
        if (groupFailed) { failures.push(`${group}: resolve failed product rows before confirming cargo.`); continue; }
        const newlyOwned = validRows.filter(row => row.group === group && !row.duplicate && !(latestOutcomes[row.source_identity]?.status === "skipped" && latestOutcomes[row.source_identity]?.original_batch_id !== batchId));
        if (!newlyOwned.length) continue;
        if (plans[group]?.placements.some(placement => !newlyOwned.some(row => row.source_identity === placement.line_key))) { failures.push(`${group}: duplicate cargo was skipped. Recalculate and confirm the remaining cargo before retrying.`); continue; }
        if (plans[group]?.trucks.length && !cargoSaved[group]) {
          await confirmImportCargo(accessToken, batchId, group, plans[group]);
          refreshOnClose.current = true;
          setCargoSaved(current => ({ ...current, [group]: true }));
        }
        if (plans[group]?.trucks.some(truck => truck.companyId)) {
          const tripId = newlyOwned.map(row => latestOutcomes[row.source_identity]?.trip_id).find(Boolean);
          if (!tripId) throw new Error("Trip details are saved, but their assignment identity is unavailable. Reopen this batch to finish.");
          await saveImportAssignmentCompanies(accessToken, tripId, plans[group]);
          refreshOnClose.current = true;
          setCompaniesSaved(current => ({ ...current, [group]: true }));
        }
      }
      if (failures.length) setError(failures.join(" "));
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Import interrupted."} Retry this batch; completed rows are protected from duplicates.`);
    } finally { savingRef.current = false; setSaving(false); }
  }
  function downloadFailures() {
    const bad = preview?.rows.filter(row => row.errors.length || outcomes[row.source_identity]?.status === "failed") ?? [];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [["Filename", "Source row", ...importFields.map(([, label]) => label), "Validation errors"],
    ...bad.map(row => [row.filename, row.line, ...importFields.map(([key]) => row.values[key]), [...row.errors, outcomes[row.source_identity]?.error].filter(Boolean).join("; ")])]
      .map(row => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `trip-import-errors-${batchId}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  function mapping(fileId: string, field: ImportField, column: number) {
    setFiles(current => current.map(file => file.id === fileId ? { ...file, mapping: { ...file.mapping, [field]: column } } : file)); changed();
  }
  function updateTarget(group: string, patch: Partial<ImportTarget>) {
    setTargets(current => ({ ...current, [group]: { ...(current[group] ?? defaultTarget()), ...patch } })); setConfirmed(false);
  }
  const unresolved = groups.some(group => { const target = targets[group] ?? defaultTarget(); return target.mode !== "new" && !target.value || new Set(validRows.filter(row => row.group === group).map(row => row.values.source_warehouse).filter(Boolean)).size > 1 && !target.origin_warehouse_id; });
  const steps = ["Upload CSV", "Preview & import", "Complete details", "Review & save"];
  const finished = results.length > 0 && validRows.every(row => row.duplicate || ["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")) && groups.every(group => !cargoLines(group).length || !plans[group]?.trucks.length || (cargoSaved[group] && (!plans[group].trucks.some(truck => truck.companyId) || companiesSaved[group])));
  function navigate(target: number) {
    if (busy || saving) return;
    setPhase(target); setError("");
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  function editGroup(fileId: string, line: number, group: string) {
    setFiles(current => current.map(file => file.id === fileId ? { ...file, rows: file.rows.map(row => row.line === line ? { ...row, group } : row) } : file));
    changed();
  }
  
  return <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-5">
    <section role="dialog" aria-modal="true" aria-labelledby="bulk-trip-title" aria-busy={saving || busy} className="flex h-[100dvh] min-w-0 w-full max-w-[1200px] flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-[92dvh] sm:rounded-3xl">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 pt-5 sm:px-8">
        <div className="flex items-start justify-between gap-3"><div><h2 id="bulk-trip-title" className="text-xl font-bold tracking-tight text-[#0b2341]">Add trip from CSV</h2><p className="mt-1 text-sm text-slate-500">Preview your file, complete the trip, then save.</p></div><button type="button" className="rounded-full p-2.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-colors" disabled={saving || busy} aria-label="Close import" onClick={() => void closeImport()}><X size={20} /></button></div>
        <nav aria-label="CSV import steps" className="mt-5 flex min-w-0 gap-2 overflow-x-auto pb-2 sm:gap-4">{steps.map((label, index) => <button key={label} type="button" disabled={busy || saving || (index > 0 && !files.length) || (index > 1 && !draftLoaded)} aria-current={phase === index ? "step" : undefined} onClick={() => navigate(index)} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm transition disabled:opacity-40 ${phase === index ? "bg-[#0b2341] font-semibold text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${phase === index ? "bg-white/20 text-white" : "bg-white text-slate-400"}`}>{index + 1}</span>{label}</button>)}</nav>
      </header>
      <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-8">
        {error && <TripFormNotice tone="error" title="Check the import" onDismiss={() => setError("")}>{error}</TripFormNotice>}
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" />Checking source rows...</p>}
        
        {phase === 0 && <>
          <section className="rounded-2xl border border-dashed border-blue-200 bg-white px-5 py-16 text-center shadow-sm">
            <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-[#2678b9]" /><h3 className="text-lg font-semibold text-[#0b2341]">Start with your trip request file</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Choose CSV or XLSX files. You can inspect every row and column before loading them into the trip draft.</p>
            <label className={`${primaryButton} mt-6 ${locked || busy || saving ? "pointer-events-none opacity-50" : "cursor-pointer"}`}><Upload size={16} />Choose CSV / XLSX<input aria-label="Upload trip files" type="file" multiple accept=".csv,.xlsx" disabled={locked || busy || saving} className="sr-only" onChange={event => { if (event.target.files?.length) void load(event.target.files); event.target.value = ""; }} /></label>
            <p className="mt-3 text-xs text-slate-400">Selecting a file does not create trips or products.</p>
          </section>
          <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm group"><summary className="cursor-pointer text-sm font-medium text-slate-600 list-none flex items-center justify-between">Resume a saved import <ChevronRight className="h-4 w-4 group-open:rotate-90 transition-transform" /></summary><div className="mt-4 space-y-3"><button type="button" className={button} disabled={busy || saving} onClick={() => void savedImports()}>Load saved imports</button>{batches.map(batch => <div key={batch.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs border border-slate-200"><div className="min-w-0 flex-1"><strong className="text-slate-800">{batch.state}</strong><p className="text-slate-500">{batch.imported} products saved / {batch.awaiting_allocation} cargo plans pending</p>{batch.last_error && <p className="mt-1 text-amber-800">{batch.last_error}</p>}</div><button type="button" className={button} disabled={busy || saving} onClick={() => void resume(batch.id)}>Reopen</button></div>)}</div></details>
        </>}
        
        {phase === 1 && files.length > 0 && <>
          <div><h3 className="text-lg font-semibold text-[#0b2341]">Preview your CSV</h3><p className="mt-1 text-sm text-slate-500">Review the original table. Use Mapped fields to edit values or trip groups.</p></div>
          <TripImportPreview files={files} preview={preview} outcomes={outcomes} disabled={locked || saving} onEdit={editCell} onGroup={editGroup} mappedFileRequest={mappedFileRequest} />
          <section aria-label="Column mapping" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h3 className="text-sm font-semibold text-[#0b2341]">Column mapping</h3><p className="mt-1 text-xs text-slate-500">Matching headers are selected automatically. Open a file below to adjust them.</p></div>
        {files.map(file => { const summary = importMappingSummary(file); return <details key={file.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm group">
          <summary className="cursor-pointer text-sm font-medium text-[#0b2341] list-none flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-slate-400" />{file.name} · {file.rows.length} rows · Column mapping <ChevronRight className="h-4 w-4 ml-auto group-open:rotate-90 transition-transform" /></summary>
          <p className="mt-3 text-xs font-medium text-slate-600">{summary.mappedSourceColumns === summary.sourceColumns ? `All ${summary.sourceColumns} source columns are mapped.` : `${summary.mappedSourceColumns} of ${summary.sourceColumns} source columns are mapped.`}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{importFields.map(([key, label]) => <label key={key} className="text-xs text-slate-600 font-medium">{label}<select aria-label={`${file.name}: ${label}`} disabled={locked || saving} value={file.mapping[key]} onChange={event => mapping(file.id, key, Number(event.target.value))} className={`${control} mt-1 w-full`}><option value={-1}>Not mapped / leave blank</option>{file.headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div>
          {summary.optionalFields.length > 0 && <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500"><p>Not provided by this CSV (optional): {summary.optionalFields.join(", ")}</p><p>These columns are absent from the source file. Leave them blank or enter values in Mapped fields. Unit CBM stays separate from Total CBM.</p><button type="button" disabled={locked || saving} className="font-medium text-[#2678b9] disabled:opacity-50" onClick={() => setMappedFileRequest(current => ({ fileId: file.id, id: (current?.id ?? 0) + 1 }))}>Complete optional fields</button></div>}
          {summary.unmappedColumns.length > 0 && <p className="mt-2 text-xs text-amber-700">Source columns needing mapping: {summary.unmappedColumns.join(", ")}. Their original values are preserved.</p>}
          <label className="mt-4 block text-xs text-slate-600 font-medium">Set every row in this file to a trip group<input disabled={locked || saving} className={`${control} ml-2 w-64`} placeholder={file.name} onBlur={event => { const group = event.target.value.trim(); if (group) { setFiles(current => current.map(item => item.id === file.id ? { ...item, rows: item.rows.map(row => ({ ...row, group })) } : item)); changed(); } }} /></label>
        </details>; })}

          </section>
          {preview && <TripFormNotice tone={preview.invalid || preview.setup_required ? "warning" : "success"} title={preview.setup_required ? "Database setup required" : "CSV checked"}>{preview.setup_message || `${preview.detected} rows checked / ${preview.valid} valid / ${preview.invalid} need correction / ${preview.duplicates} exact duplicates will be skipped.`}</TripFormNotice>}
        </>}
        
        {phase === 2 && preview && (
          <div className="space-y-6">
            {unresolved && <TripFormNotice tone="warning" title="Complete trip grouping">Choose a destination for each group and an origin warehouse for groups with several warehouses before continuing.</TripFormNotice>}
            
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[#0b2341] flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs">✓</span>
                CSV loaded into your trip draft
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {preview.detected} source rows are ready. Complete stores, warehouses and truck assignments below. Trips and products are created only when you select Save trip.
              </p>
            </div>
            
            {inheritedTarget?.mode === "dispatch" && <p className="text-sm text-slate-600">Selected dispatch: <strong>{inheritedTarget.value}</strong></p>}

            {/* Dispatch and trip groups */}
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h3 className="text-base font-semibold text-[#0b2341]">Dispatch and trip groups</h3>
                <p className="text-xs text-slate-500 mt-1">Each group becomes a trip. Choose a new dispatch, an existing dispatch, or an existing trip for each group.</p>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <input className={control} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an existing trip or dispatch" aria-label="Search existing trips" />
                <button type="button" disabled={saving} className={button} onClick={() => void searchExisting()}>Find trips</button>
              </div>
              {existingError && <p role="alert" className="text-xs text-red-600">{existingError}</p>}
              
              <div className="space-y-3">
                {groups.map(group => { 
                  const target = targets[group] ?? defaultTarget(); 
                  return (
                    <div key={group} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <span className="min-w-48 flex-1 text-sm font-semibold text-slate-800 flex items-center gap-2">
                        <span className="bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs">{rawRows.filter(row => row.group === group).length} lines</span>
                        {group}
                      </span>
                      <select aria-label={`Destination for ${group}`} disabled={locked || saving} value={target.mode} onChange={event => updateTarget(group, { mode: event.target.value as ImportTarget["mode"], value: "" })} className={control}>
                        <option value="new">New dispatch + new trip</option>
                        <option value="dispatch">New trip in existing dispatch</option>
                        <option value="trip">Append new stops to existing trip</option>
                      </select>
                      {target.mode !== "new" && (
                        <select aria-label={`Existing ${target.mode} for ${group}`} className={control} disabled={locked || saving} value={target.value} onChange={event => updateTarget(group, { value: event.target.value })}>
                          <option value="">Choose a search result</option>
                          {target.value && !existing.some(trip => String(target.mode === "trip" ? trip.id : trip.dispatch_number) === target.value) && <option value={target.value}>{target.mode === "dispatch" ? "Selected dispatch: " : "Selected trip: "}{target.value}</option>}
                          {(target.mode === "trip" ? existing : existing.filter((row, index, all) => all.findIndex(item => item.dispatch_number === row.dispatch_number) === index)).map(trip => <option key={String(trip.id)} value={String(target.mode === "trip" ? trip.id : trip.dispatch_number)}>{String(trip.dispatch_number)} {target.mode === "trip" ? ` / ${trip.trip_reference ?? trip.trip_number ?? trip.id}` : ""}</option>)}
                        </select>
                      )}
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition">
                        <input type="checkbox" disabled={locked || saving} checked={target.allow_create} onChange={event => updateTarget(group, { allow_create: event.target.checked })} />Create missing records
                      </label>
                    </div>
                  ); 
                })}
              </div>
            </section>

            {/* Warehouses */}
            {accessToken && groups.map(group => {
              const groupRows = validRows.filter(row => row.group === group);
              const uniqueWarehouses: string[] = [...new Set(
                groupRows
                  .map(row => row.values.source_warehouse)
                  .filter((code): code is string => typeof code === "string" && code.trim().length > 0),
              )];
              if (uniqueWarehouses.length === 0) return null;
              
              return (
                <section key={group} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-5 w-5 text-[#2678b9]" />
                    <h3 className="text-base font-semibold text-[#0b2341]">Warehouses for {group}</h3>
                  </div>
                  
                  {uniqueWarehouses.length > 1 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <p className="text-xs font-medium text-amber-800">This group contains several source warehouses. Choose the trip origin or split the trip group; original line warehouses remain separate.</p>
                      <div className="bg-white rounded-xl p-1 shadow-sm border border-amber-100">
                        <SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" autoFocus={false} value={warehouseLabels[group + "origin"] ?? ""} disabled={locked || saving} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + "origin"]: option.label })); updateTarget(group, { origin_warehouse_id: option.id }); }} onCommitBlur={() => {}} onCancel={() => {}} />
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-slate-500">Codes match existing warehouses. If a source value is a name rather than a code, select its verified warehouse here. Unknown code-only records keep their address and coordinates blank.</p>
                  
                  <div className="space-y-3">
                    {uniqueWarehouses.map(code => (
                      <div key={code} className="grid gap-3 sm:grid-cols-[auto_1fr] items-center rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                          Source: {code}
                        </span>
                        <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                          <SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" autoFocus={false} value={warehouseLabels[group + code] ?? code} disabled={locked || saving} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + code]: option.label })); const target = targets[group] ?? defaultTarget(); updateTarget(group, { warehouse_ids: { ...target.warehouse_ids, [code]: option.id } }); }} onCommitBlur={() => {}} onCancel={() => {}} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Destinations */}
            {accessToken && preview && (
              <ImportDestinationReview token={accessToken} destinations={destinations} decisions={locations} onChange={next => { setLocations(next); setConfirmed(false); }} disabled={locked || saving} />
            )}

            {/* Trucks & Cargo */}
            {accessToken && preview && groups.map((group: string) => {
              const groupStr = group as string;
              return (
                <section key={groupStr} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-[#2678b9]" />
                      <h3 className="text-base font-semibold text-[#0b2341]">Trucks, drivers and cargo / {groupStr}</h3>
                    </div>
                    {cargoSaved[groupStr] ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 shadow-sm">
                        <CheckCircle2 className="h-4 w-4" /> Saved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200 shadow-sm">
                        <AlertTriangle className="h-4 w-4" /> Pending
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <TripCargoPlanner 
                      token={accessToken} 
                      existingTripId={(targets[groupStr] ?? defaultTarget()).mode === "trip" ? (targets[groupStr] ?? defaultTarget()).value : results.find(row => row.trip_id && preview.rows.some(source => source.group === groupStr && source.source_identity === row.source_identity))?.trip_id} 
                      lines={cargoLines(groupStr)} 
                      plan={plans[groupStr] ?? emptyCargoPlan()} 
                      onChange={plan => { setPlans(current => ({ ...current, [groupStr]: plan })); setConfirmed(false); }} 
                      disabled={saving || Boolean(cargoSaved[groupStr])} 
                    />
                  </div>
                </section>
              );
            })}
          </div>
        )}
        
        {phase === 3 && preview && <>
          <div><h3 className="text-lg font-semibold text-[#0b2341]">Review and save your trip</h3><p className="mt-1 text-sm text-slate-500">Check the assignments and source rows before creating records.</p></div>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-base font-semibold text-[#0b2341] mb-4">Trip assignments</h3><div className="space-y-3">{groups.map(group => <div key={group} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm shadow-sm"><strong className="text-slate-800">{group}</strong><p className="mt-1 text-slate-500 text-xs">{(targets[group] ?? defaultTarget()).mode === "new" ? "New dispatch and trip" : (targets[group] ?? defaultTarget()).value}</p>{plans[group]?.trucks.length ? <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">{plans[group].trucks.map(truck => <p key={truck.id} className="text-xs text-slate-600 font-medium"><span className="text-slate-800">{truck.label}</span> / {truck.driverLabel || "Driver to be assigned"} / {truck.companyLabel || "Company from truck"} / {truck.capacity || "Unknown"} CBM capacity</p>)}</div> : <p className="mt-2 text-xs text-slate-500 italic">Trucks and drivers can be assigned later.</p>}</div>)}</div></section>
          {preview && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-base font-semibold text-[#0b2341]">Review trip details</h3><p className="text-sm font-medium text-slate-700">{preview.detected} detected · {preview.valid} valid · {preview.invalid} invalid · {preview.duplicates} duplicates · {preview.potential_duplicates} potential matches</p>
            <p className="text-xs leading-5 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">Estimated new records before duplicates: {groups.filter(group => (targets[group] ?? defaultTarget()).mode === "new").length} dispatches, {groups.filter(group => (targets[group] ?? defaultTarget()).mode !== "trip").length} trips, {stopCounts} stops, {validRows.filter(row => !row.duplicate).length} product lines. {Object.values(plans).reduce((count, plan) => count + plan.trucks.length, 0)} truck selections; {destinations.filter(destination => !locations[destination.key]?.verified).length} locations remain unverified.</p>
            {preview.invalid > 0 && <TripFormNotice tone="warning" title="Some source rows need correction">Only valid rows will be imported. Download the failed rows, correct their values or mapping, and prepare a new preview.</TripFormNotice>}
            <div className="space-y-2 pt-2">
              <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer p-2 hover:bg-slate-50 rounded-lg transition-colors"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirmed} disabled={saving || unresolved} onChange={event => setConfirmed(event.target.checked)} /> <span>I reviewed the row groups and destination choices. Save valid rows and skip exact duplicates.</span></label>
              {preview.rows.some(row => Object.keys(row.unmapped ?? {}).length > 0) && <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer p-2 hover:bg-slate-50 rounded-lg transition-colors"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={verifiedUnmapped} disabled={saving} onChange={event => setVerifiedUnmapped(event.target.checked)} /> <span>I reviewed the unmapped columns. Keep their data in import provenance; do not assign them to an unrelated TMS field.</span></label>}
              {preview.potential_duplicates > 0 && <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer p-2 hover:bg-slate-50 rounded-lg transition-colors"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={verified} disabled={saving} onChange={event => setVerified(event.target.checked)} /> <span>I verified potential matches in other files and authorize creating these as separate product lines.</span></label>}
              {preview.rows.some(row => row.warnings.some(warning => warning.includes("Total CBM differs"))) && <label className="flex items-start gap-3 text-xs text-amber-800 cursor-pointer p-2 hover:bg-amber-50 rounded-lg transition-colors bg-amber-50/50"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={verifiedCbm} disabled={saving} onChange={event => setVerifiedCbm(event.target.checked)} /> <span>I reviewed {preview.rows.filter(row => row.warnings.some(warning => warning.includes("Total CBM differs"))).length} CBM discrepancies and authorize keeping the supplied Total CBM values.</span></label>}
            </div>
          </section>}
          <TripImportPreview files={files} preview={preview} outcomes={outcomes} disabled onEdit={editCell} onGroup={editGroup} />
        {results.length > 0 && <TripFormNotice tone={failed || error ? "warning" : "success"} title={failed || error ? "Import partially completed" : "Import results"}>
          <p>{new Set(results.filter(row => row.trip_created).map(row => row.trip_id).filter(Boolean)).size} trips created / {imported} products imported · 0 updated · {skipped} duplicates skipped · {failed} failed · {preview?.invalid ?? 0} invalid rows excluded.</p><p>{Object.values(cargoSaved).filter(Boolean).length} cargo plans saved. Any imported cargo without a confirmed plan remains unassigned; retry this same batch to finish.</p><p className="break-all font-mono text-[10px] bg-white/50 p-1.5 rounded mt-2">Batch: {batchId}</p><p>Retry this batch for failures. Existing operational records were not overwritten.</p>
        </TripFormNotice>}
        {saving && <p role="status" className="flex items-center gap-2 text-sm bg-blue-50 text-blue-800 p-3 rounded-xl border border-blue-200"><Loader2 size={16} className="animate-spin" />Processed {progress} source rows. Keep this window open.</p>}
        </>}
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-4 sm:px-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-medium"><span>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} / ${rawRows.length} rows` : "CSV and XLSX supported"}</span>{files.length > 0 && <button type="button" disabled={busy || saving} className="text-[#2678b9] hover:underline" onClick={() => void persistDraft().catch(() => { })}>Save draft</button>}</div>
        {draftStatus && <p role="status" className="mb-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg inline-block">{draftStatus}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={saving || busy} onClick={() => phase > 0 && !finished ? navigate(phase - 1) : void closeImport()}>{finished ? "Done" : phase ? "Back" : "Back to Add trip"}</button>{closeBlocked && <button type="button" className={button} onClick={onClose}>Close without saving</button>}</div>
          <div className="flex flex-wrap gap-2">
            {preview && (preview.invalid > 0 || failed > 0) && <button type="button" className={button} onClick={downloadFailures}><Download size={16} />Download failed rows</button>}
            {phase === 0 && files.length > 0 && <button type="button" className={primaryButton} onClick={() => navigate(1)}>Preview CSV <ChevronRight size={14} /></button>}
            {phase === 1 && <>{!locked && <button type="button" className={button} disabled={busy || saving} onClick={() => void prepare()}>{preview ? "Recheck CSV" : "Check CSV"}</button>}<button type="button" className={primaryButton} disabled={busy || saving || !preview || preview.setup_required || !validRows.length} onClick={() => { setDraftLoaded(true); navigate(2); }}>Import CSV <ChevronRight size={14} /></button></>}
            {phase === 2 && <button type="button" className={primaryButton} disabled={busy || saving || unresolved} onClick={() => navigate(3)}>Review trip <ChevronRight size={14} /></button>}
            {phase === 3 && <button type="button" className={primaryButton} disabled={finished || busy || saving || Boolean(preview?.rows.some(row => Object.keys(row.unmapped ?? {}).length > 0) && !verifiedUnmapped) || preview?.setup_required || !confirmed || unresolved || !validRows.length || Boolean(preview?.potential_duplicates && !verified) || Boolean(preview?.rows.some(row => row.warnings.some(warning => warning.includes("Total CBM differs"))) && !verifiedCbm)} onClick={() => void save()}>{saving && <Loader2 size={16} className="animate-spin" />}{finished ? "Trip saved" : saving ? "Saving trip..." : locked ? "Retry unfinished save" : "Save trip"}</button>}
          </div>
        </div>
      </footer>
    </section>
  </div>;
}
