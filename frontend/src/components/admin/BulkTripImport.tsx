import { withOptionalTripAddress, withoutTripMapPins } from "../../services/optional-trip-address";
import { beginTripImportSave } from "../../services/trip-import-activity";
import { importBatchHasRecordedRows } from "../../services/import-batch-lock";
import { isolateImportRows } from "../../services/isolate-import-rows";
import { storeLocationLabel } from "../../services/store-location";
import PreviousImportSummary from "./PreviousImportSummary";
import type { ReviewAnnotations } from "../../services/review-annotations";
import { createAllocationSession, type AllocationSession } from "./useAutoAllocation";
import { ReviewSourceLines } from "./TripImportPresentation";
import TripFileUpload from "./shared/TripFileUpload";
import CsvPreviewTabs from "./CsvPreviewTabs";
import CsvSidePanel from "./CsvSidePanel";
import CsvStoreReview from "./CsvStoreReview";
import TripSaveProgress from "./shared/TripSaveProgress";
import { useTripModal } from "./shared/useTripModal";
import { TripModalHeader, TripModalSteps, tripModalBackdrop, tripModalShell, tripPrimaryAction, tripSecondaryAction, tripFooter } from "./shared/TripModalUI";
import { displayCargoTotal } from "./shared/TripLiveSummary";
import ImportDispatchTarget from "./ImportDispatchTarget";
import ImportTripDetailsCard from "./ImportTripDetailsCard";
import { emptyTripDetails } from "../../../../packages/trip-import/trip-details.js";

import SmartImportMapping from "./SmartImportMapping";
import TripImportPreview from "./TripImportPreview";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import SourceWarehousePicker from "./SourceWarehousePicker";
import TripCargoPlanner from "./TripCargoPlanner";
import { destinationKey, recoverDestinationDecisions, type LocationDecision } from "./ImportDestinationReview";
import { cargoSignature, emptyCargoPlan, validateCargo, type CargoPlan, type CargoLine } from "../../services/cargo-planning";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { readImportFile, editImportRows, regroupImportFile, importFields, importMappingProblems, setSourceMapping, sourceAssignments, importPayload, type ImportFile, type ImportField } from "./tripImportFiles";
import { previewImport, commitImport, confirmImportCargo, saveImportAssignmentCompanies, fetchImportBatches, reopenImportBatch, saveImportBatchDraft, type ImportRecoveryDraft, type ImportBatchSummary, type ImportPreview, type ImportTarget, type ImportOutcome, type ImportSourceHistory, type ImportRowResolution, type TripDetails } from "../../services/trip-import.service";
import { fetchTrips, fetchTripDetail, type TripRecord } from "../../services/trip.service";
import TripFormNotice from "./TripFormNotice";
import ImportLocationNotices from "./ImportLocationNotices";
import { ApiError } from "../../services/api.service";
import { useToast } from "../ui/Toast";

const button = tripSecondaryAction;
const primaryButton = tripPrimaryAction;

export default function BulkTripImport({ onClose: onDismiss, onBack, onComplete, onImported, initialTarget, initialTripDetails, active = true }: { onClose: () => void; onBack?: () => void; onComplete?: () => void; onImported: () => void; initialTarget?: ImportTarget; initialTripDetails?: TripDetails; active?: boolean }) {
  const { addToast } = useToast();
  const allocationSessions = useRef<Record<string, AllocationSession>>({});
  const [inheritedTarget, setInheritedTarget] = useState(initialTarget);
  const [tripDetails, setTripDetails] = useState<TripDetails | undefined>(initialTripDetails ?? initialTarget?.trip_details);
  const defaultTarget = (): ImportTarget => {
    // New imports create missing masters from reviewed source values by default;
    // existing matches are reused and the control stays visible and reversible.
    const target: ImportTarget = inheritedTarget ? { ...inheritedTarget } : { mode: "new", value: "", allow_create: true };
    const hasDetails = tripDetails && (tripDetails.trip_type_id || tripDetails.trip_type_name || tripDetails.loading_date || tripDetails.estimated_delivery_date || tripDetails.remarks || tripDetails.origin_warehouse_id || tripDetails.status !== "PLANNED");
    return hasDetails && tripDetails && target.mode !== "trip" ? { ...target, trip_details: { ...tripDetails }, origin_warehouse_id: target.origin_warehouse_id ?? tripDetails.origin_warehouse_id ?? undefined } : target;
  };
  const [history, setHistory] = useState<Record<string, ImportSourceHistory>>({});
  const [annotations, setAnnotations] = useState<ReviewAnnotations>({});
  const skippedRows = useMemo(()=>new Set(Object.entries(annotations).filter(([, value]) => value.skip).map(([id]) => id)),[annotations]);
  const toggleSkip = (id: string) => setAnnotations(current => ({ ...current, [id]: { ...current[id], skip: !current[id]?.skip } }));
  const [rowResolutions, setRowResolutions] = useState<Record<string, ImportRowResolution>>({});
  const [plans, setPlans] = useState<Record<string, CargoPlan>>({});
  const [locations, setLocations] = useState<Record<string, LocationDecision>>({});
  const locationChecking = false;
  const [locationRetryRequired, setLocationRetryRequired] = useState(false);
  const [cargoSaved, setCargoSaved] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const [companiesSaved, setCompaniesSaved] = useState<Record<string, boolean>>({});
  const savingRef = useRef(false);
  const refreshOnClose = useRef(false);
  const { accessToken, profile } = useAuth();
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [correctionsOpen,setCorrectionsOpen]=useState(true);
  const correctionReasons=useMemo(()=>{
    const reasons=new Map<string,Array<{filename:string;line:number}>>();
    for(const row of preview?.rows??[])for(const message of row.errors){const locations=reasons.get(message)??[];locations.push({filename:row.filename,line:row.line});reasons.set(message,locations);}
    return [...reasons].map(([message,locations])=>({message,locations})).sort((left,right)=>right.locations.length-left.locations.length);
  },[preview]);
  const [error, setError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
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
  const [saveOperation, setSaveOperation] = useState("Preparing save");
  const [phase, setPhase] = useState(0);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [error]);
  const [detailRecords, setDetailRecords] = useState<Record<string, TripRecord>>({});
  const [detailReadError, setDetailReadError] = useState("");
  const [existing, setExisting] = useState<TripRecord[]>([]);
  const [warehouseLabels, setWarehouseLabels] = useState<Record<string, string>>({});
  function acceptPreview(checked: ImportPreview) {
    setCorrectionsOpen(checked.invalid>0);
    setPreview(checked); setHistory(checked.history ?? {});
    setTargets(current => {
      const next = { ...current };
      for (const group of new Set(checked.rows.map(row => row.group))) {
        const target = next[group] ?? defaultTarget();
        const warehouse_ids = { ...target.warehouse_ids };
        for (const row of checked.rows.filter(row => row.group === group)) {
          const source = row.values.source_warehouse;
          const match = source ? checked.warehouse_matches?.[source] : undefined;
          if (source && match?.id && !warehouse_ids[source]) warehouse_ids[source] = match.id;
        }
        next[group] = { ...target, warehouse_ids };
      }
      return next;
    });
  }
  const draft = useMemo<ImportRecoveryDraft>(() => ({ review_annotations: annotations, files, preview, targets, plans, locations, rowResolutions, trip_details: tripDetails, initialTarget: inheritedTarget, confirmed, verified, verifiedCbm, verifiedUnmapped, started, locationFollowupPending: locationRetryRequired, detailsDirty }), [annotations, files, preview, targets, plans, locations, rowResolutions, tripDetails, inheritedTarget, confirmed, verified, verifiedCbm, verifiedUnmapped, started, locationRetryRequired, detailsDirty]);
  
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
      setTripDetails(saved.trip_details ?? saved.initialTarget?.trip_details);
      setHistory(recovered.history ?? saved.preview?.history ?? {}); setRowResolutions(saved.rowResolutions ?? {});
      setLocationRetryRequired(Boolean(recovered.location_retry_required)); setDetailsDirty(Boolean(saved.detailsDirty));
      batchRevision.current = recovered.revision; setBatchId(id); setFiles(saved.files); setPreview(saved.preview); setTargets(saved.targets ?? {}); setPlans(saved.plans ?? {}); setLocations(recoverDestinationDecisions(saved.locations)); setAnnotations(saved.review_annotations ?? {}); setInheritedTarget(saved.initialTarget); setConfirmed(false); setVerified(Boolean(saved.verified)); setVerifiedCbm(Boolean(saved.verifiedCbm)); setVerifiedUnmapped(Boolean(saved.verifiedUnmapped)); setOutcomes(Object.fromEntries(recovered.outcomes.map(row => [row.source_identity, row]))); setCargoSaved(recovered.cargo_saved); setCompaniesSaved({}); setStarted(importBatchHasRecordedRows(recovered)); setDraftLoaded(Boolean(saved.preview)); setPhase(0); setDraftStatus(`Reopened ${recovered.state}. ${recovered.last_error ?? "Existing trip and product IDs are preserved."}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reopen this batch."); } finally { setBusy(false); }
  }
  const groups = useMemo(()=>[...new Set(files.flatMap(file => file.rows.map(row => row.group.trim())).filter(Boolean))],[files]);
  // The preview endpoint preserves file/row order, including invalid rows. Keep these
  // UI-only identities separate from signed source_identity and document_hash.
  const sourceRows = useMemo(() => files.flatMap(file => importPayload([file])[0].rows.map(row => ({ ...row, filename: file.name, file_id: file.id }))), [files]);
  const rawRows = useMemo(() => sourceRows.map((row, index) => {
    const checked = preview?.rows[index];
    return { ...row, errors: !detailsDirty && checked?.filename === row.filename && checked.line === row.line ? checked.errors : [] };
  }), [sourceRows, preview, detailsDirty]);
  const results = Object.values(outcomes);
  const locked = started || results.some(row => row.status !== "failed");
  const validRows = useMemo(()=>preview?.rows.filter(row => !row.errors.length && !skippedRows.has(row.source_identity)) ?? [],[preview,skippedRows]);
  const detailIds = JSON.stringify([...new Set(groups.flatMap(group => {
    const target = targets[group] ?? defaultTarget();
    if (target.mode === "trip" && target.value) return [target.value];
    const saved = results.find(row => row.trip_id && !row.trip_reference && (row.status === "imported" || row.original_batch_id === batchId) && preview?.rows.some(source => source.group === group && source.source_identity === row.source_identity));
    return saved?.trip_id ? [saved.trip_id] : [];
  }))].sort());
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const missing = (JSON.parse(detailIds) as string[]).filter(id => !detailRecords[id]);
    if (!missing.length) return;
    void Promise.allSettled(missing.map(async id => {
      try {
        const loaded = await fetchTripDetail(accessToken, id);
        if (active) setDetailRecords(current => ({ ...current, [id]: { ...loaded.trip, trip_type_name: loaded.trip_type?.name } }));
      } catch { if (active) setDetailReadError("Some saved trip details could not be loaded. Existing records remain unchanged; reopen the batch or use Find trips to retry."); }
    }));
    return () => { active = false; };
    // The existing service deduplicates/caches reads; each selected ID loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, detailIds]);
  const destinations = [...new Map(validRows.map(row => [destinationKey(row.values), { key: destinationKey(row.values), customer: row.values.customer_name || '', shipTo: row.values.ship_to || '', province: row.values.province || '', city: row.values.city || '' }])).values()];
  const customerCodeValid = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(value.trim());
  const customerIssues = destinations.filter(source => {
    const decision = locations[source.key];
    const match = preview?.store_matches?.[source.key];
    return !decision?.store_id && !decision?.customer_id && match?.customer_status !== "matched" && !customerCodeValid(decision?.customer_code ?? "");
  });
  const ownsSource = (row: ImportPreview["rows"][number], latest = history) => {
    const item = latest[row.source_identity];
    if (item) return item.status !== "live" || item.batch_id === batchId;
    return !row.duplicate && !(outcomes[row.source_identity]?.status === "skipped" && outcomes[row.source_identity]?.line_item_id && outcomes[row.source_identity]?.original_batch_id !== batchId);
  };
  const cargoLines = (group: string): CargoLine[] => validRows.filter(row => row.group === group && ownsSource(row)).map(row => ({ key: row.source_identity, dr: row.values.dr_number || '', stop: storeLocationLabel(row.values), label: row.values.customer_model || row.values.dr_number || 'Product', quantity: row.values.quantity || '', cbm: row.values.cbm || '', filename: row.filename, sourceRow: row.line, phTruckReference: row.values.ph_truck_reference || '' }));
  
  function editCell(fileId: string, line: number, key: ImportField, value: string) {
    setFiles(current => editImportRows(current, [{ fileId, line, field: key, value }])); changed();
  }
  function changed() { setDetailsDirty(false); setDraftLoaded(false); setPhase(0); setPreview(null); setConfirmed(false); setVerified(false); setVerifiedCbm(false); setVerifiedUnmapped(false); setError(""); }
  async function load(selected: FileList) {
    setBusy(true); setError("");
    try {
      const loaded = (await Promise.all(Array.from(selected).map(readImportFile))).flat();
      setFiles(loaded); changed(); setOutcomes({}); setHistory({}); setRowResolutions({}); setPhase(0);
      if (accessToken && !loaded.flatMap(importMappingProblems).length) {
        acceptPreview(await previewImport(accessToken, importPayload(loaded)));
        setDraftLoaded(true);
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read the files."); }
    finally { setBusy(false); }
  }
  async function prepare() {
    if (!accessToken) return;
    const conflicts = files.flatMap(importMappingProblems);
    if (conflicts.length) { setError(conflicts.join(" ")); return; }
    setBusy(true); setError("");
    try { acceptPreview(await previewImport(accessToken, importPayload(files))); setDraftLoaded(true); setDetailsDirty(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to check import rows."); }
    finally { setBusy(false); }
  }
  async function searchExisting(search: string): Promise<TripRecord[]> {
    if (!accessToken) throw Error("Sign in to search dispatches and trips.");
    const rows = (await fetchTrips(accessToken, { limit: 100, search })).rows;
    setExisting(current => [...new Map([...current, ...rows].map(row => [row.id, row])).values()]);
    return rows;
  }
  /** Name the cause and the exact control that resolves a missing master record. */
  function explainImportFailure(message: string) {
    if (/A customer code is needed|customer identity failed/i.test(message)) return "Customer identity is missing. In Stores & products, select an existing customer or enter a real code to create one.";
    if (/No verified master match|no exact match/i.test(message)) return `${message} Turn on “Create missing records” in Complete details, or match the customer, store and product in the preview.`;
    return message;
  }
  async function save() {
    if (!preview || !draftLoaded || !accessToken || !validRows.length || savingRef.current) return;
    if (detailsDirty) { setError("Check the latest source edits before saving. Your draft is safe."); return; }
    if (preview.invalid || preview.setup_required || customerIssues.length || unresolvedGroupIssues.length || groups.some(group => cargoLines(group).some(line => Number(line.cbm) > 0) && !cargoReady(group))) {
      setError("Resolve the items listed under Fix before saving. Your imported rows and selections are still here."); return;
    }
    // Clicking Save accepts optional CSV totals/unmapped values, never recovery approval.
    setConfirmed(true); setVerifiedCbm(true); setVerifiedUnmapped(true);
    savingRef.current = true; setStarted(true);
    const finishImportSave = beginTripImportSave();
    const previouslyProcessed = validRows.filter(row => Boolean(outcomes[row.source_identity]?.line_item_id) && ["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")).length;
    const retryLocationFollowup = locationRetryRequired;
    const remainingChunks = groups.reduce((total, group) => total + Math.ceil(validRows.filter(row => row.group === group && (!["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "") || locationRetryRequired)).length / 100), 0);
    const remainingCargo = groups.filter(group => cargoReady(group) && !cargoSaved[group]).length;
    const remainingCompanies = groups.filter(group => cargoReady(group) && plans[group]?.trucks.some(truck => truck.companyId) && !companiesSaved[group]).length;
    const totalOperations = 3 + remainingChunks + remainingCargo + remainingCompanies;
    let completedOperations = 0;
    const advance = (operation: string) => { completedOperations += 1; setProgress(Math.min(99, Math.round(completedOperations / totalOperations * 100))); setSaveOperation(operation); };
    setSaving(true); setError(""); setSaveWarning(""); setProgress(0); setSaveOperation("Saving recovery draft");
    let processed = previouslyProcessed;
    let addressesDeferred = false;
    let saveSucceeded = false;
    try {
      await persistDraft({ ...draft, started: true, locationFollowupPending: true });
      advance("Recovery draft saved");
      setLocationRetryRequired(true);
      const failures: string[] = [];
      const failedRowsByCause = new Map<string, typeof validRows>();
      const latestHistory = { ...history };
      for (const group of groups) {
        let groupFailed = false;
        const latestOutcomes = { ...outcomes };
        const target = targets[group] ?? defaultTarget();
        const deferred = validRows.filter(row => row.group === group && history[row.source_identity]?.status === "missing" && (!rowResolutions[row.source_identity]?.restore_missing_source || rowResolutions[row.source_identity]?.restore_history_version !== history[row.source_identity].imported_at));
        if (deferred.length) failures.push(`${deferred.length} products still need the server's recovery approval. Use Approve all in Previously imported products.`);
        const pending = validRows.filter(row => row.group === group && !deferred.includes(row) && (history[row.source_identity]?.status === "missing" || retryLocationFollowup || !["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")));
        for (let index = 0; index < pending.length; index += 100) {
          const chunk = pending.slice(index, index + 100);
          const attempts = await isolateImportRows(chunk, subset => {
            const resolutions = Object.fromEntries(subset.map(row => {
              const location = locations[destinationKey(row.values)];
              return [row.source_identity, { ...location, ...(!location?.verified ? { address: location?.address || [row.values.ship_to, row.values.city, row.values.province].filter(Boolean).join(", "), latitude: "", longitude: "", verified: false } : {}), update_store_location: location?.update_store_location === true, ...rowResolutions[row.source_identity] }];
            }));
            return withOptionalTripAddress(defer => commitImport(accessToken, batchId, group, target, subset, verified, true, true, defer || addressesDeferred ? withoutTripMapPins(resolutions) : resolutions), () => { addressesDeferred = true; });
          }, failure => failure instanceof ApiError && ["IMPORT_WAREHOUSE_REVIEW_REQUIRED", "IMPORT_SOURCE_RECOVERY_REQUIRED"].includes(failure.code || ""), (row, failure) => ({ batch_id: batchId, rows: [{ source_identity: row.source_identity, status: "failed" as const, error: failure instanceof Error ? failure.message : "This product could not be saved." }], history: {} }));
          const result = { rows: attempts.flatMap(attempt => attempt.rows), history: Object.assign({}, ...attempts.map(attempt => attempt.history ?? {})) as Record<string, ImportSourceHistory> };

          Object.assign(latestHistory, result.history ?? {}); setHistory(current => ({ ...current, ...result.history }));
          if (result.rows.some(row => row.status === "failed" || row.status === "skipped" && !row.line_item_id)) groupFailed = true;
          if (result.rows.some(row => row.status === "imported")) refreshOnClose.current = true;
          Object.assign(latestOutcomes, Object.fromEntries(result.rows.map(row => [row.source_identity, row])));
          setOutcomes(current => ({ ...current, ...Object.fromEntries(result.rows.map(row => [row.source_identity, row])) }));
          processed = Math.min(validRows.length, processed + chunk.length); advance(`Source rows confirmed: ${processed} of ${validRows.length}`);
        }
        if (groupFailed) {
          // One actionable message per cause, with the affected rows named. Avoid
          // repeating the same server error once for every source row.
          const failedRows = validRows.filter(row => row.group === group && (latestOutcomes[row.source_identity]?.status === "failed" || latestOutcomes[row.source_identity]?.status === "skipped" && !latestOutcomes[row.source_identity]?.line_item_id));
          for (const row of failedRows) {
            const cause = explainImportFailure(latestOutcomes[row.source_identity]?.error || `${row.filename}, CSV row ${row.line}: source import failed.`);
            failedRowsByCause.set(cause, [...(failedRowsByCause.get(cause) ?? []), row]);
          }
          continue;
        }
        const newlyOwned = validRows.filter(row => row.group === group && ownsSource(row, latestHistory) && Boolean(latestOutcomes[row.source_identity]?.line_item_id));
        if (!newlyOwned.length) continue;
        if (cargoReady(group) && plans[group]?.placements.some(placement => !newlyOwned.some(row => row.source_identity === placement.line_key))) { failures.push(`${group}: duplicate cargo was skipped. Recalculate and confirm the remaining cargo before retrying.`); continue; }
        try {
          if (cargoReady(group) && !cargoSaved[group]) {
            await confirmImportCargo(accessToken, batchId, group, plans[group]);
            advance(`Cargo saved for ${group}`);
            refreshOnClose.current = true;
            setCargoSaved(current => ({ ...current, [group]: true }));
          }
          if (cargoReady(group) && plans[group]?.trucks.some(truck => truck.companyId) && !companiesSaved[group]) {
            const tripId = newlyOwned.map(row => latestOutcomes[row.source_identity]?.trip_id).find(Boolean);
            if (!tripId) throw new Error("Trip details are saved, but their assignment identity is unavailable. Reopen this batch to finish.");
            await saveImportAssignmentCompanies(accessToken, tripId, plans[group]);
            advance(`Truck companies saved for ${group}`);
            refreshOnClose.current = true;
            setCompaniesSaved(current => ({ ...current, [group]: true }));
          }
        } catch { failures.push("Product lines are saved. Truck and cargo details remain in the draft for a later assignment."); }

      }
      for (const [cause, rows] of failedRowsByCause) {
        const files = [...new Set(rows.map(row => row.filename))].join(", ");
        failures.push(`${rows.length} row${rows.length === 1 ? "" : "s"} not saved (${files}, rows ${rows.map(row => row.line).join(", ")}): ${cause}`);
      }
      const warnings = [...failures, ...(addressesDeferred ? ["Trip-only map pins could not be stored on this server. Product lines were saved where accepted; reviewed addresses and coordinates remain in this draft. Store locations were not updated. Saving map pins requires an administrator update."] : [])];
      saveSucceeded = warnings.length === 0;
      if (warnings.length) setSaveWarning(warnings.join(" "));
      if (!addressesDeferred) {
        await persistDraft({ ...draft, started: true, locationFollowupPending: false });
        advance("Import draft finalized");
        setLocationRetryRequired(false);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "TRIP_LOCATION_FOLLOWUP_REQUIRED") {
        setLocationRetryRequired(true);
        refreshOnClose.current = true;
      }
      if (addressesDeferred) setSaveWarning("Map-pin saving is unavailable on this server. Reviewed addresses and coordinates remain in the draft; store locations were not updated by the fallback.");
      setError(`${explainImportFailure(cause instanceof Error ? cause.message : "Import interrupted.")} Retry this batch; completed rows are protected from duplicates.`);
    } finally {
      // A Save attempt alone must not freeze an untouched batch. Reconcile with
      // the server before unlocking: a lost response may still have committed.
      try {
        const recovered = await reopenImportBatch(accessToken, batchId);
        setStarted(importBatchHasRecordedRows(recovered));
        setOutcomes(current => ({ ...current, ...Object.fromEntries(recovered.outcomes.map(row => [row.source_identity, row])) }));
        setHistory(recovered.history ?? {});
        setCargoSaved(recovered.cargo_saved);
        setLocationRetryRequired(recovered.location_retry_required === true);
        if (recovered.outcomes.some(row => row.line_item_id && (row.status === "imported" || row.original_batch_id === batchId))) refreshOnClose.current = true;
        const savedRows = new Map(recovered.outcomes.map(row => [row.source_identity, row]));
        const complete = saveSucceeded && validRows.every(row => {
          const outcome = savedRows.get(row.source_identity);
          return Boolean(outcome?.line_item_id) && ["imported", "skipped"].includes(outcome?.status ?? "");
        }) && groups.every(group => !cargoLines(group).length || !cargoReady(group) || recovered.cargo_saved[group]);
        if (complete) {
          setProgress(100); setSaveOperation("Save confirmed by server");
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          onImported();
          addToast({ variant: "success", title: "Trip added successfully!" });
          if (onComplete) onComplete(); else onClose();
        }
      } catch { /* Preserve the lock until server state can be confirmed. */ }
      savingRef.current = false; setSaving(false);
      finishImportSave();
    }
  }
  function downloadFailures() {
    const bad = preview?.rows.filter(row => row.errors.length || outcomes[row.source_identity]?.status === "failed") ?? [];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [["Filename", "Source row", ...importFields.map(([, label]) => label), "Validation errors"],
    ...bad.map(row => [row.filename, row.line, ...importFields.map(([key]) => row.values[key] ?? row.master_values?.[key]), [...row.errors, outcomes[row.source_identity]?.error].filter(Boolean).join("; ")])]
      .map(row => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `trip-import-errors-${batchId}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  function mapping(fileId: string, column: number, field: ImportField|null) {
    setFiles(current => current.map(file => file.id === fileId ? setSourceMapping(file, column, field) : file)); changed();
  }
  function applyMapping(fileId: string, assignments: Array<ImportField|null>) {
    setFiles(current => current.map(file => {
      if (file.id !== fileId) return file;
      return assignments.reduce<ImportFile>((next, field, index) => setSourceMapping(next, index, field), { ...file, columnMapping: sourceAssignments(file) });
    })); changed();
  }
  function suggestGroups(fileId: string, field: "file"|"ph_truck_reference"|"dispatch_number") {
    if (locked || saving || busy) return;
    const next = files.map(file => file.id === fileId ? regroupImportFile(file, field) : file);
    const affected = new Set(files.find(file => file.id === fileId)?.rows.map(row => row.group));
    for (const group of next.find(file => file.id === fileId)?.rows.map(row => row.group) ?? []) affected.add(group);
    // Replanning is explicit. Remove old group-scoped settings so stale cargo or
    // destinations cannot leak into a newly combined/split planning group.
    setPlans(current => Object.fromEntries(Object.entries(current).filter(([group]) => !affected.has(group))));
    setTargets(current => Object.fromEntries(Object.entries(current).filter(([group]) => !affected.has(group))));
    for (const group of affected) delete allocationSessions.current[group];
    setFiles(next); changed();
  }
  function updateRowResolution(identity: string, patch: Partial<ImportRowResolution>) { setSaveWarning(""); setRowResolutions(current => ({ ...current, [identity]: { ...current[identity], ...patch } })); setConfirmed(false); }
  function detailsForGroup(group: string): TripDetails {
    const target = targets[group] ?? defaultTarget();
    const details = target.trip_details ?? tripDetails ?? emptyTripDetails();
    if (target.mode === "trip") {
      const selected = detailRecords[target.value] ?? existing.find(trip => trip.id === target.value);
      if (selected) return { trip_type_id: typeof selected.trip_type_id === "string" ? selected.trip_type_id : null, trip_type_name: typeof selected.trip_type_name === "string" ? selected.trip_type_name : typeof selected.trip_type === "string" ? selected.trip_type : null, status: selected.status ?? "PLANNED", loading_date: selected.loading_date ?? null, estimated_delivery_date: selected.estimated_delivery_date ?? null, remarks: typeof selected.remarks === "string" ? selected.remarks : null, origin_warehouse_id: typeof selected.warehouse_id === "string" ? selected.warehouse_id : null };
      return { ...emptyTripDetails(), status: "UNCHANGED", loading_date: plans[group]?.schedule?.loading_date || null, estimated_delivery_date: plans[group]?.schedule?.estimated_delivery_date || null };
    }
    return { ...details, origin_warehouse_id: target.origin_warehouse_id ?? details.origin_warehouse_id, ...(!target.trip_details && !tripDetails && plans[group]?.schedule ? { loading_date: plans[group].schedule!.loading_date || null, estimated_delivery_date: plans[group].schedule!.estimated_delivery_date || null } : {}) };
  }
  function updateTarget(group: string, patch: Partial<ImportTarget>) {
    setTargets(current => {
      const target = { ...(current[group] ?? defaultTarget()), ...patch };
      if (patch.mode === "trip") delete target.trip_details;
      else if (patch.mode && !target.trip_details && tripDetails) target.trip_details = { ...tripDetails };
      if (patch.origin_warehouse_id !== undefined && target.trip_details) target.trip_details = { ...target.trip_details, origin_warehouse_id: patch.origin_warehouse_id };
      return { ...current, [group]: target };
    }); setConfirmed(false);
  }
  function updateTripDetails(group: string, patch: Partial<TripDetails>) {
    if (locked || busy || saving || (targets[group] ?? defaultTarget()).mode === "trip") return;
    const next = { ...detailsForGroup(group), ...patch };
    updateTarget(group, { trip_details: next, origin_warehouse_id: next.origin_warehouse_id ?? undefined });
  }
  function applyTripDetailsToAll(group: string) {
    if (locked || busy || saving) return;
    const details = { ...detailsForGroup(group) }; setTripDetails(details);
    setTargets(current => ({ ...current, ...Object.fromEntries(groups.filter(key => (current[key] ?? defaultTarget()).mode !== "trip").map(key => [key, { ...(current[key] ?? defaultTarget()), trip_details: { ...details }, origin_warehouse_id: details.origin_warehouse_id ?? undefined }])) })); setConfirmed(false);
  }
  useEffect(() => {
    if (locked) return;
    setPlans(current => {
      let changed = false; const next = { ...current };
      for (const group of groups) {
        const target = targets[group] ?? defaultTarget();
        const details = target.mode === "trip" && (detailRecords[target.value] || existing.some(trip => trip.id === target.value)) ? detailsForGroup(group) : target.trip_details;
        if (!details || cargoSaved[group]) continue;
        const plan = current[group] ?? emptyCargoPlan();
        const loading_date = details.loading_date ?? "", estimated_delivery_date = details.estimated_delivery_date ?? "";
        if (plan.schedule?.loading_date === loading_date && plan.schedule?.estimated_delivery_date === estimated_delivery_date) continue;
        next[group] = { ...plan, confirmed: false, schedule: { loading_date, estimated_delivery_date, unreserved_confirmed: false } }; changed = true;
      }
      return changed ? next : current;
    });
    // Source rows and sealed recovery targets are never rewritten by schedule sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, tripDetails, files, locked, cargoSaved, existing, detailRecords]);
  function tripNumberForGroup(group: string) {
    const target = targets[group] ?? defaultTarget();
    const result = results.find(row => row.trip_id && (row.status === "imported" || row.original_batch_id === batchId) && preview?.rows.some(source => source.group === group && source.source_identity === row.source_identity));
    const id = target.mode === "trip" ? target.value : result?.trip_id;
    const record = id ? detailRecords[id] ?? existing.find(trip => trip.id === id) : undefined;
    return result?.trip_reference || record?.trip_reference || (target.mode === "trip" ? "Existing trip reference" : "Generated on save");
  }
  function cargoReady(group: string) { const plan = plans[group], lines = cargoLines(group); return Boolean(plan?.trucks.length && lines.length && plan.trucks.every(truck => truck.driverId) && plan.confirmed && plan.signature === cargoSignature(lines, plan.trucks) && !validateCargo(lines, plan.trucks, plan.placements)); }
  const unresolvedGroupIssues = groups.flatMap(group => {
    const target = targets[group] ?? defaultTarget();
    const warehouses = [...new Set(validRows.filter(row => row.group === group).map(row => row.values.source_warehouse).filter((source): source is string => Boolean(source)))];
    const details = detailsForGroup(group);
    return [
      ...(details.loading_date && details.estimated_delivery_date && details.estimated_delivery_date < details.loading_date ? [`${group}: estimated delivery is before loading.`] : []),
      ...(target.mode !== "new" && !target.value ? [`${group}: select the existing ${target.mode === "trip" ? "trip" : "dispatch"}.`] : []),
      ...(warehouses.length > 1 && !target.origin_warehouse_id ? [`${group}: choose an origin warehouse.`] : []),
      ...(!locked ? warehouses.filter(source => !target.warehouse_ids?.[source]).map(source => `${group}: match source warehouse ${source}.`) : []),
    ];
  });
  const steps = ["Import & preview", "Trip details", "Stores", "Trucks & save"];
  const finished = !locationRetryRequired && results.length > 0 && validRows.every(row => history[row.source_identity]?.status !== "missing" && Boolean(outcomes[row.source_identity]?.line_item_id) && ["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")) && groups.every(group => !cargoLines(group).length || !cargoReady(group) || (cargoSaved[group] && (!plans[group].trucks.some(truck => truck.companyId) || companiesSaved[group])));
  const saveDisabled = finished || busy || saving || !validRows.length || Boolean(preview?.invalid || preview?.setup_required || detailsDirty || customerIssues.length || unresolvedGroupIssues.length) || groups.some(group => cargoLines(group).some(line => Number(line.cbm) > 0) && !cargoReady(group));
  function navigate(target: number) {
    if (busy || saving) return;
    if (target > 0 && !preview) return;
    setPhase(target); setError("");
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showCorrections(){setCorrectionsOpen(true);navigate(0);requestAnimationFrame(()=>bodyRef.current?.querySelector<HTMLElement>("[data-import-corrections] summary")?.focus());}
  function editGroup(fileId: string, line: number, group: string) {
    setFiles(current => current.map(file => file.id === fileId ? { ...file, rows: file.rows.map(row => row.line === line ? { ...row, group } : row) } : file));
    changed();
  }
  const mappingProblems = files.flatMap(importMappingProblems);
  const storeConfirmed = (key: string) => Boolean(locations[key]?.verified || locations[key]?.store_verified || preview?.store_matches?.[key]?.status === "matched");
  const confirmedStores = destinations.filter(source => storeConfirmed(source.key)).length;
  const allTrucks = groups.flatMap(group => plans[group]?.trucks ?? []);
  const sourceWarehouses = [...new Set(sourceRows.map(row => row.values.source_warehouse).filter((value): value is string => Boolean(value)))];
  const totalCapacity = allTrucks.reduce((sum, truck) => sum + (Number(truck.capacity) || 0), 0);
  const totalCbm = Number(displayCargoTotal(groups.flatMap(cargoLines).map(line => line.cbm)));
  const enoughCapacity = totalCapacity >= totalCbm && allTrucks.length > 0;
  const allDrivers = allTrucks.length > 0 && allTrucks.every(truck => Boolean(truck.driverId));
  const showSavedStatus = draftStatus.startsWith("Draft saved") || draftStatus.startsWith("Reopened");
  const autoMatchedPending = destinations.filter(source => preview?.store_matches?.[source.key]?.status === "matched" && preview.store_matches[source.key].id && !locations[source.key]?.store_id);
  function confirmAutoMatched() {
    setLocations(current => {
      const next = { ...current };
      for (const source of autoMatchedPending) {
        const match = preview?.store_matches?.[source.key];
        if (!match?.id) continue;
        next[source.key] = { ...(current[source.key] ?? { address: "", province: source.province, city: source.city, latitude: "", longitude: "", verified: false, replace_verified: false }), store_id: match.id, customer_id: match.customer_id ?? current[source.key]?.customer_id };
      }
      return next;
    });
  }

  const { ref: dialogRef, close: onClose } = useTripModal<HTMLElement>({ onClose: onDismiss, onEscape: () => { void closeImport(); }, active });
  return <div className={`${tripModalBackdrop} z-[2100]`}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-trip-title" aria-describedby="bulk-trip-title-description" aria-busy={saving || busy} className={`${tripModalShell} csv-trip-modal`}>
      <TripModalHeader id="bulk-trip-title" title="Add trip from CSV" description="Import trip requests in four steps." subtitle="Operations / Trips Â· Four quick steps" icon={<FileSpreadsheet className="h-6 w-6" />} disabled={saving || busy} onBack={onBack} onClose={() => void closeImport()} closeLabel="Close import" />
      <TripModalSteps labels={steps} current={phase} onJump={navigate} isDisabled={index => busy || saving || (index > 0 && !preview)} label="CSV import steps" />
      <div ref={bodyRef} className="trip-flow-body" data-csv-phase={phase}>
        <div className="csv-workspace"><main className="csv-main">
          {error && <TripFormNotice tone="error" title="Check the import" onDismiss={() => setError("")}>{error}</TripFormNotice>}
          {saveWarning && phase === 3 && <TripFormNotice tone="warning" title="Save warnings" onDismiss={() => setSaveWarning("")}>{saveWarning}</TripFormNotice>}
          {busy && <p role="status" className="csv-busy"><Loader2 size={16} className="animate-spin" />Checking source rows…</p>}
          {phase === 0 && <>
            <TripFileUpload compactWhenLoaded files={files} disabled={locked || busy || saving} busy={busy} error="" onFiles={selected => void load(selected)} />
            {files.length > 0 && <CsvPreviewTabs files={files} disabled={locked || busy || saving} onApply={applyMapping} />}
            {mappingProblems.length > 0 && <section className="csv-card csv-correction" aria-label="Column corrections"><h3>Correct column mapping</h3><p>Map the required columns to continue.</p>{files.filter(file => importMappingProblems(file).length > 0).map(file => <SmartImportMapping key={file.id} file={file} owner={profile?.id} disabled={locked || saving || busy} onMap={(index, field) => mapping(file.id, index, field)} onApply={assignments => applyMapping(file.id, assignments)} onGroup={field => suggestGroups(file.id, field)} />)}</section>}
            {preview && preview.invalid > 0 && <details className="csv-card csv-details" data-import-corrections open={correctionsOpen} onToggle={event=>setCorrectionsOpen(event.currentTarget.open)}><summary>Correct {preview.invalid} source row{preview.invalid === 1 ? "" : "s"}</summary><p className="csv-muted">Read each row's status. If the same field is missing across many rows, correct its column mapping above. Edit individual values below, then choose Check rows again.</p><TripImportPreview viewMode="mapped" invalidOnly files={files} preview={preview} outcomes={outcomes} disabled={locked || saving} onEdit={editCell} onGroup={editGroup} /></details>}
            {preview && <p role="status" className="csv-muted">{preview.valid} of {preview.detected} rows ready{preview.invalid ? ` Â· ${preview.invalid} need correction` : ""}{preview.duplicates ? ` Â· ${preview.duplicates} exact duplicates will be skipped` : ""}.</p>}
            <details className="csv-card csv-details"><summary>Resume a saved import <ChevronRight size={16} /></summary><div className="csv-saved-list"><button type="button" className={button} disabled={busy || saving} onClick={() => void savedImports()}>Load saved imports</button>{batches.map(batch => <div key={batch.id} className="csv-saved-row"><div><strong>{batch.state}</strong><p>{batch.imported} products saved / {batch.awaiting_allocation} cargo plans pending</p>{batch.last_error && <p className="csv-warning-text">{batch.last_error}</p>}</div><button type="button" className={button} disabled={busy || saving} onClick={() => void resume(batch.id)}>Reopen</button></div>)}</div></details>
          </>}
          {phase === 1 && preview && accessToken && groups.map(group => {
            const target = targets[group] ?? defaultTarget(), details = detailsForGroup(group);
            const warehouses = [...new Set(validRows.filter(row => row.group === group).map(row => row.values.source_warehouse).filter((value): value is string => Boolean(value)))];
            const unmatched = warehouses.filter(code => !target.warehouse_ids?.[code]);
            return <div key={group} className="csv-detail-group">
              {groups.length > 1 && <h3>{group}</h3>}
              <section className="csv-card"><h3>Dates</h3><div className="csv-two-fields"><label>Loading date<input type="date" value={details.loading_date || ""} disabled={locked || saving || target.mode === "trip"} onChange={event => updateTripDetails(group, { loading_date: event.target.value || null })} /></label><label>Estimated delivery<input type="date" value={details.estimated_delivery_date || ""} disabled={locked || saving || target.mode === "trip"} onChange={event => updateTripDetails(group, { estimated_delivery_date: event.target.value || null })} /></label></div></section>
              <section className="csv-card"><h3>Dispatch</h3><ImportDispatchTarget group={group} target={target} existing={[...existing, ...Object.values(detailRecords)]} disabled={locked || saving || busy} onChange={patch => updateTarget(group, patch)} onSearch={searchExisting} /></section>
              <details className="csv-card csv-details csv-optional-card"><summary>Optional details <span>Show 4 fields</span></summary><ImportTripDetailsCard hideDates token={accessToken} group={group} details={details} tripNumber={tripNumberForGroup(group)} disabled={locked || saving || busy} existingTrip={target.mode === "trip"} onChange={patch => updateTripDetails(group, patch)} onApplyAll={groups.length > 1 ? () => applyTripDetailsToAll(group) : undefined} /></details>
              {(unmatched.length > 0 || warehouses.length > 1 && !target.origin_warehouse_id) && <section className="csv-card csv-correction" aria-label={`Warehouse matching for ${group}`}><h3>Warehouse correction Â· {group}</h3>{warehouses.length > 1 && !target.origin_warehouse_id && <label>Trip origin<SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" value={warehouseLabels[group + "origin"] ?? ""} autoFocus={false} disabled={locked || saving || busy} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + "origin"]: option.label })); updateTarget(group, { origin_warehouse_id: option.id }); }} onCommitBlur={() => {}} onCancel={() => {}} /></label>}{unmatched.map(code => <div key={code}><p>{code}</p><SourceWarehousePicker token={accessToken} source={code} matched={false} conflict={preview.warehouse_matches?.[code]?.status === "conflict"} value={warehouseLabels[group + code] ?? code} disabled={locked || saving || busy} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + code]: option.label })); updateTarget(group, { warehouse_ids: { ...target.warehouse_ids, [code]: option.id } }); }} /></div>)}</section>}
            </div>;
          })}
          {phase === 2 && preview && accessToken && <CsvStoreReview token={accessToken} destinations={destinations} matches={preview.store_matches} decisions={locations} disabled={saving || busy} onChange={setLocations} onError={setError} />}
          {phase === 3 && preview && <>
            <section className="csv-card csv-trucks-card"><h3>Trucks &amp; drivers</h3><p className="csv-muted">Choose trucks and drivers for each trip. Allocate products by CBM.</p>{groups.map(group => {
              const plan = plans[group] ?? emptyCargoPlan(), details = detailsForGroup(group), lines = cargoLines(group), target = targets[group] ?? defaultTarget();
              const allocationSession = allocationSessions.current[group] ??= createAllocationSession();
              return <div key={group} className="csv-truck-group">{groups.length > 1 && <h4>{group}</h4>}<TripCargoPlanner simple token={accessToken || ""} session={allocationSession} lines={lines} plan={plan} scheduleManaged={Boolean(details.loading_date && details.estimated_delivery_date)} onEditSchedule={() => navigate(1)} existingTripId={target.mode === "trip" ? target.value : undefined} disabled={saving || Boolean(cargoSaved[group])} onChange={next => {
                const schedule = next.schedule ?? { loading_date: details.loading_date ?? "", estimated_delivery_date: details.estimated_delivery_date ?? "", unreserved_confirmed: !details.loading_date || !details.estimated_delivery_date };
                setPlans(current => ({ ...current, [group]: { ...next, schedule: { ...schedule, unreserved_confirmed: !schedule.loading_date || !schedule.estimated_delivery_date } } }));
                if (!locked && target.mode !== "trip" && next.schedule && (next.schedule.loading_date !== (details.loading_date ?? "") || next.schedule.estimated_delivery_date !== (details.estimated_delivery_date ?? ""))) updateTripDetails(group, { loading_date: next.schedule.loading_date || null, estimated_delivery_date: next.schedule.estimated_delivery_date || null });
              }} /></div>;
            })}<div className="csv-capacity-summary"><span>{displayCargoTotal(groups.flatMap(cargoLines).map(line => line.cbm))} of {totalCapacity} CBM allocated</span><span className={enoughCapacity ? "csv-pill-success" : "csv-pill-warning"}>{enoughCapacity ? "Ready" : "Add capacity"}</span></div></section>
            <section className="csv-review-card" aria-label="Review before saving"><div className="csv-review-total"><span>REVIEW Â· {groups.some(group => (targets[group] ?? defaultTarget()).mode !== "new") ? "EXISTING DISPATCH" : "NEW DISPATCH"}</span><strong>{displayCargoTotal(groups.flatMap(cargoLines).map(line => line.cbm))} <small>CBM</small></strong><div className="csv-review-track"><span style={{ width: `${totalCapacity > 0 ? Math.min(100, Math.round(totalCbm / totalCapacity * 100)) : 0}%` }} /></div><p>{totalCapacity > 0 ? Math.round(totalCbm / totalCapacity * 100) : 0}% of {totalCapacity} CBM Â· {allTrucks.map(truck => truck.label).join(", ") || "No trucks yet"}</p></div><div className="csv-review-stats"><div><span>Trips</span><strong>{groups.length}</strong></div><div><span>Trucks</span><strong>{allTrucks.length}</strong></div><div><span>Stores</span><strong>{destinations.length}</strong></div><div><span>Product rows</span><strong>{validRows.length}</strong></div></div></section>
            {(preview.invalid > 0 || preview.setup_required || detailsDirty || customerIssues.length > 0 || unresolvedGroupIssues.length > 0 || groups.some(group => !cargoReady(group) && cargoLines(group).some(line => Number(line.cbm) > 0))) && <section className="csv-card csv-save-errors" role="alert"><h3>Fix before saving</h3>{preview.setup_required && <p>Trip import setup is unavailable on this server. Your file and draft are preserved.</p>}{preview.invalid > 0 && <><button type="button" onClick={showCorrections}>Review {preview.invalid} source rows in Import &amp; preview</button><ul className="csv-correction-reasons">{correctionReasons.slice(0,5).map(({message,locations})=><li key={message}><strong>{message}</strong><span>{locations.length} row{locations.length===1?"":"s"}: {locations.slice(0,4).map(location=>files.length>1?`${location.filename} row ${location.line}`:`${location.line}`).join(", ")}{locations.length>4?` +${locations.length-4} more`:""}</span></li>)}</ul>{correctionReasons.length>5&&<p>Plus {correctionReasons.length-5} more issue types in the preview.</p>}</>}{detailsDirty && <button type="button" onClick={() => navigate(0)}>Edited rows need to be checked again.</button>}{customerIssues.map(source => <button key={source.key} type="button" onClick={() => navigate(2)}>{source.customer} / {source.shipTo}: choose a customer or enter its real code. Rows {validRows.filter(row => destinationKey(row.values) === source.key).map(row => row.line).join(", ")}.</button>)}{unresolvedGroupIssues.map(issue => <button key={issue} type="button" onClick={() => navigate(1)}>{issue}</button>)}{groups.filter(group => !cargoReady(group) && cargoLines(group).some(line => Number(line.cbm) > 0)).map(group => <p key={group}>{group}: finish truck and driver allocation above.</p>)}</section>}
            {saving && <TripSaveProgress value={progress} operation={saveOperation} />}
            <details className="csv-card csv-details csv-technical"><summary>Technical details</summary><p>Import batch {batchId}. Original CSV cells and source row identities are retained.</p>{detailReadError && <p role="alert">{detailReadError}</p>}{(preview.invalid > 0 || results.some(row => row.status === "failed")) && <button type="button" className={button} onClick={downloadFailures}><Download size={14} />Download failed rows</button>}{preview.rows.some(row => history[row.source_identity]?.status === "missing") && <PreviousImportSummary token={accessToken || ""} rows={preview.rows} history={history} resolutions={rowResolutions} skipped={skippedRows} disabled={saving || busy} onChange={updateRowResolution} onSkip={toggleSkip} />}{groups.map(group => <ReviewSourceLines key={group} rows={preview.rows.filter(row => row.group === group)} outcomes={outcomes} />)}<ImportLocationNotices destinations={destinations} decisions={locations} checking={locationChecking} /></details>
          </>}
        </main><div className="csv-side-column">
          {phase === 0 && <CsvSidePanel title="Ready check" items={[{ label: files.length ? `${rawRows.length} rows loaded` : "File loaded", done: files.length > 0 }, { label: "Required columns mapped", done: files.length > 0 && !mappingProblems.length }, { label: "Store / ship-to column found", done: files.length > 0 && files.every(file => file.mapping.ship_to >= 0) }, { label: "Qty and CBM found", done: files.length > 0 && files.every(file => file.mapping.quantity >= 0 && file.mapping.cbm >= 0) }]} note="Trips are created only when you save." />}
          {phase === 1 && <CsvSidePanel title="Nothing required" note="Every field here is optional. Set dates now, or add them later on the trip."><div className="csv-side-filled"><h4>Filled for you</h4><p>Origin warehouse: {sourceWarehouses.join(", ") || "not in file"}</p><p>Status: {[...new Set(groups.map(group => detailsForGroup(group).status))].join(", ") || "Planned"}</p><p>Trip number: {groups.some(group => (targets[group] ?? defaultTarget()).mode === "trip") ? "existing trip" : "generated on save"}</p></div></CsvSidePanel>}
          {phase === 2 && <CsvSidePanel title="Stores" items={[{ label: `${confirmedStores} of ${destinations.length} confirmed`, done: confirmedStores === destinations.length && destinations.length > 0 }, { label: `${destinations.length - confirmedStores} still to review`, done: confirmedStores === destinations.length }]} note="Only stores without a clear match need a location pick."><button type="button" className="csv-side-action" disabled={!autoMatchedPending.length} onClick={confirmAutoMatched}>Confirm all auto-matched</button></CsvSidePanel>}
          {phase === 3 && <CsvSidePanel title="Before saving" items={[{ label: "All stores confirmed", done: confirmedStores === destinations.length }, { label: "Trucks cover the total CBM", done: enoughCapacity }, { label: "Drivers assigned", done: allDrivers }]} note="Trips are created only when you save." />}
        </div></div>
      </div>
      <footer className={tripFooter}><div className="trip-footer-row"><span className="trip-footer-meta">{showSavedStatus ? "Draft saved" : draftStatus || (files.length ? "Saving draft…" : "")}</span><div className="trip-footer-actions"><button type="button" className={button} disabled={saving || busy} onClick={() => phase ? navigate(phase - 1) : void closeImport()}>{phase ? "Back" : "Cancel"}</button>{closeBlocked && <button type="button" className={button} onClick={onClose}>Close without latest draft</button>}{phase === 0 && files.length > 0 && <button type="button" className={primaryButton} disabled={busy || saving || mappingProblems.length > 0} onClick={() => preview ? navigate(1) : void prepare()}>{preview ? "Continue" : "Check rows"}<ChevronRight size={16} /></button>}{phase === 1 && <button type="button" className={primaryButton} disabled={busy || saving} onClick={() => navigate(2)}>Continue <ChevronRight size={16} /></button>}{phase === 2 && <button type="button" className={primaryButton} disabled={busy || saving} onClick={() => navigate(3)}>Continue <ChevronRight size={16} /></button>}{phase === 3 && <button type="button" className={primaryButton} disabled={saveDisabled} onClick={() => void save()}>{saving ? "Saving…" : "Save trip"}</button>}</div></div></footer>
    </section>
  </div>;
}
