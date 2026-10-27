import { withOptionalTripAddress, withoutTripMapPins } from "../../services/optional-trip-address";
import { importBatchHasRecordedRows } from "../../services/import-batch-lock";
import { isolateImportRows } from "../../services/isolate-import-rows";
import { storeLocationLabel } from "../../services/store-location";
import ReviewPreviewTable, { type PreviewLine } from "./ReviewPreviewTable";
import PreviousImportSummary from "./PreviousImportSummary";
import { rowAppearance, reviewFingerprint, type ReviewAnnotations } from "../../services/review-annotations";
import GroupRail, { type GroupTab } from "./GroupRail";
import { blockingIssues, completionTabs, confirmedStopAddress, csvCompletion, type CompletionIssue } from "./csv-completion";
import { createAllocationSession, type AllocationSession } from "./useAutoAllocation";
import { CsvSourceTabs, ReviewSourceLines } from "./TripImportPresentation";
import TripFileUpload from "./shared/TripFileUpload";
import { useTripModal } from "./shared/useTripModal";
import { TripModalHeader, TripModalSteps, tripModalBackdrop, tripModalShell, tripPrimaryAction, tripSecondaryAction, tripFooter } from "./shared/TripModalUI";
import ImportResultsPanel from "./ImportResultsPanel";
import { displayCargoTotal, TripSummaryBar } from "./shared/TripLiveSummary";
import ImportDispatchTarget from "./ImportDispatchTarget";
import { StatusChip } from "./shared";
import { createStoreWorkspaceMemory, useStoreWorkspaceMemory, type StoreWorkspaceMemory } from "./shared/storeWorkspace";
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
import { readImportFile, editImportRows, hasPhReferenceGroups, regroupImportFile, importFields, importMappingProblems, setSourceMapping, sourceAssignments, importPayload, type ImportFile, type ImportField } from "./tripImportFiles";
import TripPopover from "./shared/TripPopover";
import { previewImport, commitImport, confirmImportCargo, saveImportAssignmentCompanies, fetchImportBatches, reopenImportBatch, saveImportBatchDraft, type ImportRecoveryDraft, type ImportBatchSummary, type ImportPreview, type ImportTarget, type ImportOutcome, type ImportSourceHistory, type ImportRowResolution, type TripDetails } from "../../services/trip-import.service";
import { fetchTrips, fetchTripDetail, type TripRecord } from "../../services/trip.service";
import TripFormNotice from "./TripFormNotice";
import ImportLocationNotices from "./ImportLocationNotices";
import ImportStoreCards, { type ImportCardRow } from "./ImportStoreCards";
import { failedTripLocation, locationLookupFailed, resolveTripLocation, type TripLocationLookup } from "../../services/trip-location.service";
import { ApiError } from "../../services/api.service";

const button = tripSecondaryAction;
const primaryButton = tripPrimaryAction;

export default function BulkTripImport({ onClose: onDismiss, onComplete, onImported, initialTarget, initialTripDetails }: { onClose: () => void; onComplete?: () => void; onImported: () => void; initialTarget?: ImportTarget; initialTripDetails?: TripDetails }) {
  const storeNavigation = useStoreWorkspaceMemory();
  const groupNavigation = useRef<Record<string, StoreWorkspaceMemory>>({});
  const activeStoreGroup = useRef("");
  const allocationSessions = useRef<Record<string, AllocationSession>>({});
  const [capacityByGroup, setCapacityByGroup] = useState<Record<string, string>>({});
  const [groupView, setGroupView] = useState<{ group: string; tab: GroupTab }>({ group: "", tab: "details" });
  const [visitedTabs, setVisitedTabs] = useState<Record<string, GroupTab[]>>({});
  const [showCompletionIssues, setShowCompletionIssues] = useState(false);
  const [combineFile, setCombineFile] = useState<string | null>(null);
  const copyNavigation = (from: StoreWorkspaceMemory, to: StoreWorkspaceMemory) => {
    to.selected = from.selected; to.members = [...from.members]; to.search = from.search; to.attention = from.attention; to.rail = from.rail;
    Object.assign(to.details, from.details); Object.assign(to.products, from.products);
  };
  const navigationForGroup = (group: string) => {
    if (!groupNavigation.current[group]) {
      const memory = createStoreWorkspaceMemory(); copyNavigation(storeNavigation, memory); groupNavigation.current[group] = memory;
    }
    return groupNavigation.current[group];
  };
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
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const [locationChecking, setLocationChecking] = useState(false);
  const [locationProgress, setLocationProgress] = useState<Record<string, string>>({});
  const [locationRetryRequired, setLocationRetryRequired] = useState(false);
  const [cargoSaved, setCargoSaved] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const [companiesSaved, setCompaniesSaved] = useState<Record<string, boolean>>({});
  const savingRef = useRef(false);
  const refreshOnClose = useRef(false);
  const { accessToken, profile } = useAuth();
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
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
      setGroupView({ group: "", tab: "details" }); setVisitedTabs({}); setShowCompletionIssues(false);
      setHistory(recovered.history ?? saved.preview?.history ?? {}); setRowResolutions(saved.rowResolutions ?? {});
      setLocationRetryRequired(Boolean(recovered.location_retry_required)); setDetailsDirty(Boolean(saved.detailsDirty));
      batchRevision.current = recovered.revision; setBatchId(id); setFiles(saved.files); setPreview(saved.preview); setTargets(saved.targets ?? {}); setPlans(saved.plans ?? {}); setLocations(recoverDestinationDecisions(saved.locations)); setAnnotations(saved.review_annotations ?? {}); setInheritedTarget(saved.initialTarget); setConfirmed(false); setVerified(Boolean(saved.verified)); setVerifiedCbm(Boolean(saved.verifiedCbm)); setVerifiedUnmapped(Boolean(saved.verifiedUnmapped)); setOutcomes(Object.fromEntries(recovered.outcomes.map(row => [row.source_identity, row]))); setCargoSaved(recovered.cargo_saved); setCompaniesSaved({}); setStarted(importBatchHasRecordedRows(recovered)); setDraftLoaded(Boolean(saved.preview)); setPhase(saved.preview ? 2 : 1); setWarehouseLabels({}); setDraftStatus(`Reopened ${recovered.state}. ${recovered.last_error ?? "Existing trip and product IDs are preserved."}`);
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
  const results = Object.values(outcomes), imported = results.filter(row => row.status === "imported" || row.status === "skipped" && row.original_batch_id === batchId && row.line_item_id).length;
  const skipped = results.filter(row => row.status === "skipped" && row.original_batch_id !== batchId && row.line_item_id).length, failed = results.filter(row => row.status === "failed").length;
  const locked = started || results.some(row => row.status !== "failed");
  const validRows = useMemo(()=>preview?.rows.filter(row => !row.errors.length && !skippedRows.has(row.source_identity)) ?? [],[preview,skippedRows]);
  const stopCounts = new Set(validRows.filter(row => !row.duplicate).map(row => JSON.stringify([row.group, destinationKey(row.values)]))).size;
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
  const destinationSignature = JSON.stringify(destinations);
  const locationLookupActive = draftLoaded && !locked && !detailsDirty;
  useEffect(() => {
    if (!locationLookupActive || !accessToken) { setLocationChecking(false); return; }
    let active = true;
    const sources = (JSON.parse(destinationSignature) as typeof destinations).filter(source => {
      const decision = locationsRef.current[source.key];
      return !decision?.verified && !(decision?.lookup?.source_key === source.key && !locationLookupFailed(decision.lookup));
    });
    let next = 0;
    setLocationProgress(Object.fromEntries(sources.map((source, index) => [source.key, `Queued ${index + 1} of ${sources.length}`])));
    setLocationChecking(sources.length > 0);
    const worker = async () => {
      while (active && next < sources.length) {
        const index = next++, source = sources[index];
        const previous = locationsRef.current[source.key]?.lookup;
        const decision = locationsRef.current[source.key];
        if (decision?.verified || (previous?.source_key === source.key && !locationLookupFailed(previous))) {
          setLocationProgress(current => { const updated = { ...current }; delete updated[source.key]; return updated; });
          continue;
        }
        const effective = { ...source, province: source.province || decision?.province || "", city: source.city || decision?.city || "" };
        setLocationProgress(current => ({ ...current, [source.key]: `Checking ${index + 1} of ${sources.length}` }));
        let lookup: TripLocationLookup;
        try { lookup = await resolveTripLocation(accessToken, effective); }
        catch (error) { lookup = failedTripLocation(effective, error); }
        if (!active) return;
        setLocations(current => {
          const existing = current[source.key] ?? { address: "", province: source.province, city: source.city, latitude: "", longitude: "", verified: false, replace_verified: false, update_store_location: false };
          // A manual search/selection made while queued takes precedence. Never fill suggestions.
          if (existing.verified || existing.lookup !== previous) return current;
          return { ...current, [source.key]: { ...existing, lookup } };
        });
        setLocationProgress(current => { const updated = { ...current }; delete updated[source.key]; return updated; });
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, sources.length) }, worker)).finally(() => { if (active) setLocationChecking(false); });
    return () => { active = false; };
  }, [locationLookupActive, accessToken, destinationSignature]);
  const ownsSource = (row: ImportPreview["rows"][number], latest = history) => {
    const item = latest[row.source_identity];
    if (item) return item.status !== "live" || item.batch_id === batchId;
    return !row.duplicate && !(outcomes[row.source_identity]?.status === "skipped" && outcomes[row.source_identity]?.line_item_id && outcomes[row.source_identity]?.original_batch_id !== batchId);
  };
  const cargoLines = (group: string): CargoLine[] => validRows.filter(row => row.group === group && ownsSource(row)).map(row => ({ key: row.source_identity, dr: row.values.dr_number || '', stop: storeLocationLabel(row.values), label: row.values.customer_model || row.values.dr_number || 'Product', quantity: row.values.quantity || '', cbm: row.values.cbm || '', filename: row.filename, sourceRow: row.line, phTruckReference: row.values.ph_truck_reference || '' }));
  
  function editCell(fileId: string, line: number, key: ImportField, value: string) {
    setFiles(current => editImportRows(current, [{ fileId, line, field: key, value }])); changed();
  }
  function editDetails(changes: Array<{ fileId: string; line: number; field: ImportField; value: string }>) {
    if (locked || saving) return;
    setFiles(current => editImportRows(current, changes)); setDetailsDirty(true); setConfirmed(false);
  }
  function addDetailsProduct(source: ImportCardRow) {
    if (locked || saving) return;
    setFiles(current => current.map(file => {
      if (file.id !== source.file_id) return file;
      const cells = Array<string>(file.headers.length).fill("");
      for (const field of ["ship_to", "customer_name", "province", "city", "source_warehouse"] as const) if (file.mapping[field] >= 0) cells[file.mapping[field]] = source.values[field] ?? "";
      const line = file.rows.reduce((maximum, row) => Math.max(maximum, row.line), 0) + 1;
      return { ...file, rows: [...file.rows, { line, cells, originalCells: [], group: source.group }] };
    })); setDetailsDirty(true); setConfirmed(false);
  }
  function removeDetailsProduct(source: ImportCardRow) {
    if (locked || saving) return;
    setFiles(current => current.map(file => file.id === source.file_id ? { ...file, rows: file.rows.filter(row => row.line !== source.line) } : file)); setDetailsDirty(true); setConfirmed(false);
  }
  async function applyDetails() {
    if (!accessToken || locked || saving || busy) return;
    setBusy(true); setError("");
    try {
      const checked = await previewImport(accessToken, importPayload(files));
      acceptPreview(checked); setDetailsDirty(false); setVerified(false); setVerifiedCbm(false); setVerifiedUnmapped(false);
      setPlans(current => Object.fromEntries(Object.entries(current).map(([group, plan]) => [group, { ...plan, placements: [], signature: "", confirmed: false }])));
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to check the edited product lines."); return false; }
    finally { setBusy(false); }
  }
  function changed() { setGroupView({ group: "", tab: "details" }); setVisitedTabs({}); setShowCompletionIssues(false); setDetailsDirty(false); setDraftLoaded(false); setPhase(1); setPreview(null); setConfirmed(false); setVerified(false); setVerifiedCbm(false); setVerifiedUnmapped(false); setError(""); }
  async function load(selected: FileList) {
    setBusy(true); setError("");
    try { const loaded = []; for (const file of Array.from(selected)) loaded.push(...await readImportFile(file)); setFiles(loaded); changed(); setOutcomes({}); setHistory({}); setRowResolutions({}); setPhase(1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read the files."); }
    finally { setBusy(false); }
  }
  async function prepare() {
    if (!accessToken) return;
    const conflicts = files.flatMap(importMappingProblems);
    if (conflicts.length) { setError(conflicts.join(" ")); return; }
    setBusy(true); setError("");
    try { acceptPreview(await previewImport(accessToken, importPayload(files))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to check import rows."); }
    finally { setBusy(false); }
  }
  async function searchExisting(search: string): Promise<TripRecord[]> {
    if (!accessToken) throw Error("Sign in to search dispatches and trips.");
    const rows = (await fetchTrips(accessToken, { limit: 100, search })).rows;
    setExisting(current => [...new Map([...current, ...rows].map(row => [row.id, row])).values()]);
    return rows;
  }
  function editGroupDetails(changes: Array<{ fileId: string; line: number; field: ImportField; value: string }>) {
    const identityFields = new Set(["ship_to", "customer_name", "province", "city"]);
    const expanded = new Map<string, typeof changes[number]>();
    const rowsById = new Map(rawRows.map(row => [JSON.stringify([row.file_id, row.line]), row]));
    const expandedStores = new Set<string>();
    for (const change of changes) {
      const source = rowsById.get(JSON.stringify([change.fileId, change.line]));
      if (source && identityFields.has(change.field)) {
        const key = JSON.stringify([destinationKey(source.values), change.field, change.value]);
        if (expandedStores.has(key)) continue;
        expandedStores.add(key);
      }
      const affected = source && identityFields.has(change.field) ? rawRows.filter(row => destinationKey(row.values) === destinationKey(source.values)) : [];
      for (const next of affected.length ? affected.map(row => ({ ...change, fileId: row.file_id, line: row.line })) : [change]) expanded.set(JSON.stringify([next.fileId, next.line, next.field]), next);
    }
    editDetails([...expanded.values()]);
  }

  /** Name the cause and the exact control that resolves a missing master record. */
  function explainImportFailure(message: string) {
    if (/A customer code is needed/i.test(message)) return `${message} Select the existing customer in Complete details → Stops (Edit details), or add the customer with its code in Master Data first.`;
    if (/No verified master match|no exact match/i.test(message)) return `${message} Turn on “Create missing records” in Complete details, or match the customer, store and product in the preview.`;
    return message;
  }
  async function save() {
    if (!preview || !draftLoaded || !accessToken || !validRows.length || savingRef.current) return;
    if (detailsDirty) { setError("Check the latest source edits before saving. Your draft is safe."); return; }
    // Clicking Save accepts optional CSV totals/unmapped values, never recovery approval.
    setConfirmed(true); setVerifiedCbm(true); setVerifiedUnmapped(true);
    savingRef.current = true; setStarted(true);
    setSaving(true); setError(""); setSaveWarning(""); setProgress(0);
    let processed = 0;
    let addressesDeferred = false;
    try {
      await persistDraft({ ...draft, started: true, locationFollowupPending: true });
      setLocationRetryRequired(true);
      const failures: string[] = [];
      const latestHistory = { ...history };
      for (const group of groups) {
        let groupFailed = false;
        const latestOutcomes = { ...outcomes };
        const target = targets[group] ?? defaultTarget();
        const deferred = validRows.filter(row => row.group === group && history[row.source_identity]?.status === "missing" && (!rowResolutions[row.source_identity]?.restore_missing_source || rowResolutions[row.source_identity]?.restore_history_version !== history[row.source_identity].imported_at));
        if (deferred.length) failures.push(`${deferred.length} products still need the server's recovery approval. Use Approve all in Previously imported products.`);
        const pending = validRows.filter(row => row.group === group && !deferred.includes(row) && (history[row.source_identity]?.status === "missing" || locationRetryRequired || !["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")));
        for (let index = 0; index < pending.length; index += 100) {
          const chunk = pending.slice(index, index + 100);
          const attempts = await isolateImportRows(chunk, subset => {
            const resolutions = Object.fromEntries(subset.map(row => {
              const location = locations[destinationKey(row.values)];
              return [row.source_identity, { ...location, ...(!location?.verified ? { address: location?.address || [row.values.ship_to, row.values.city, row.values.province].filter(Boolean).join(", "), latitude: "", longitude: "", verified: false } : {}), update_store_location: location?.update_store_location === true, ...rowResolutions[row.source_identity] }];
            }));
            return withOptionalTripAddress(defer => commitImport(accessToken, batchId, group, target, subset, verified, true, true, defer || addressesDeferred ? withoutTripMapPins(resolutions) : resolutions), () => { addressesDeferred = true; });
          }, failure => failure instanceof ApiError && ["IMPORT_WAREHOUSE_REVIEW_REQUIRED", "IMPORT_DESTINATION_REVIEW_REQUIRED", "IMPORT_SOURCE_RECOVERY_REQUIRED"].includes(failure.code || ""), (row, failure) => ({ batch_id: batchId, rows: [{ source_identity: row.source_identity, status: "failed" as const, error: failure instanceof Error ? failure.message : "This product could not be saved." }], history: {} }));
          const result = { rows: attempts.flatMap(attempt => attempt.rows), history: Object.assign({}, ...attempts.map(attempt => attempt.history ?? {})) as Record<string, ImportSourceHistory> };

          Object.assign(latestHistory, result.history ?? {}); setHistory(current => ({ ...current, ...result.history }));
          if (result.rows.some(row => row.status === "failed" || row.status === "skipped" && !row.line_item_id)) groupFailed = true;
          if (result.rows.some(row => row.status === "imported")) refreshOnClose.current = true;
          Object.assign(latestOutcomes, Object.fromEntries(result.rows.map(row => [row.source_identity, row])));
          setOutcomes(current => ({ ...current, ...Object.fromEntries(result.rows.map(row => [row.source_identity, row])) }));
          processed += chunk.length; setProgress(processed);
        }
        if (groupFailed) {
          // One actionable message per cause, with the affected rows named. Avoid
          // repeating the same server error once for every source row.
          const failedRows = validRows.filter(row => row.group === group && (latestOutcomes[row.source_identity]?.status === "failed" || latestOutcomes[row.source_identity]?.status === "skipped" && !latestOutcomes[row.source_identity]?.line_item_id));
          const byCause = new Map<string, typeof failedRows>();
          for (const row of failedRows) {
            const cause = explainImportFailure(latestOutcomes[row.source_identity]?.error || `${row.filename}, CSV row ${row.line}: source import failed.`);
            byCause.set(cause, [...(byCause.get(cause) ?? []), row]);
          }
          for (const [cause, rows] of byCause) {
            const named = rows.slice(0, 3).map(row => `${row.filename} row ${row.line}`).join(", ");
            failures.push(`${rows.length} row${rows.length === 1 ? "" : "s"} not saved (${named}${rows.length > 3 ? ` +${rows.length - 3} more` : ""}): ${cause}`);
          }
          continue;
        }
        const newlyOwned = validRows.filter(row => row.group === group && ownsSource(row, latestHistory) && Boolean(latestOutcomes[row.source_identity]?.line_item_id));
        if (!newlyOwned.length) continue;
        if (cargoReady(group) && plans[group]?.placements.some(placement => !newlyOwned.some(row => row.source_identity === placement.line_key))) { failures.push(`${group}: duplicate cargo was skipped. Recalculate and confirm the remaining cargo before retrying.`); continue; }
        try {
          if (cargoReady(group) && !cargoSaved[group]) {
            await confirmImportCargo(accessToken, batchId, group, plans[group]);
            refreshOnClose.current = true;
            setCargoSaved(current => ({ ...current, [group]: true }));
          }
          if (cargoReady(group) && plans[group]?.trucks.some(truck => truck.companyId)) {
            const tripId = newlyOwned.map(row => latestOutcomes[row.source_identity]?.trip_id).find(Boolean);
            if (!tripId) throw new Error("Trip details are saved, but their assignment identity is unavailable. Reopen this batch to finish.");
            await saveImportAssignmentCompanies(accessToken, tripId, plans[group]);
            refreshOnClose.current = true;
            setCompaniesSaved(current => ({ ...current, [group]: true }));
          }
        } catch { failures.push("Product lines are saved. Truck and cargo details remain in the draft for a later assignment."); }

      }
      const warnings = [...failures, ...(addressesDeferred ? ["Trip-only map pins could not be stored on this server. Product lines were saved where accepted; reviewed addresses and coordinates remain in this draft. Store locations were not updated. Saving map pins requires an administrator update."] : [])];
      if (warnings.length) setSaveWarning(warnings.join(" "));
      if (!validRows.some(row => history[row.source_identity]?.status === "missing" && !rowResolutions[row.source_identity]?.restore_missing_source) && !failures.some(message => !message.startsWith("Product lines are saved."))) {
        await persistDraft({ ...draft, started: true, locationFollowupPending: false });
        setLocationRetryRequired(false);
      }
    } catch (cause) {
      try { const recovered = await reopenImportBatch(accessToken, batchId); setOutcomes(Object.fromEntries(recovered.outcomes.map(row => [row.source_identity, row]))); setHistory(recovered.history ?? {}); setCargoSaved(recovered.cargo_saved); if (recovered.outcomes.some(row => row.line_item_id && (row.status === "imported" || row.original_batch_id === batchId))) refreshOnClose.current = true; } catch { /* Keep the existing batch and draft when acknowledgements are unavailable. */ }
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
      } catch { /* Preserve the lock until server state can be confirmed. */ }
      savingRef.current = false; setSaving(false);
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
    setCapacityByGroup(current => Object.fromEntries(Object.entries(current).filter(([group]) => !affected.has(group))));
    for (const group of affected) { delete allocationSessions.current[group]; delete groupNavigation.current[group]; }
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
  function cargoReady(group: string) { const plan = plans[group], lines = cargoLines(group); return Boolean(plan?.trucks.length && lines.length && (plan.trucks.length === 1 || plan.trucks.every(truck => truck.driverId)) && plan.confirmed && plan.signature === cargoSignature(lines, plan.trucks) && !validateCargo(lines, plan.trucks, plan.placements)); }
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
  const steps = ["Upload CSV", "Preview & map", "Complete details", "Review & save"];
  const finished = !locationRetryRequired && results.length > 0 && validRows.every(row => history[row.source_identity]?.status !== "missing" && Boolean(outcomes[row.source_identity]?.line_item_id) && ["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")) && groups.every(group => !cargoLines(group).length || !cargoReady(group) || (cargoSaved[group] && (!plans[group].trucks.some(truck => truck.companyId) || companiesSaved[group])));
  const saveDisabled = finished || busy || saving || !validRows.length;
  const saveReason = finished ? "This batch is complete." : !validRows.length ? "No rows accepted by the current import endpoint." : "Ready. Optional details are saved as warnings.";
  function navigate(target: number) {
    if (busy || saving) return;
    if (target === 3 && reviewIssues.length) {
      setPhase(2); setShowCompletionIssues(true); focusCompletionIssue(reviewIssues[0]); return;
    }
    if (phase === 2 && target !== 2) {
      const memory = groupNavigation.current[activeStoreGroup.current || groups[0]];
      if (memory) copyNavigation(memory, storeNavigation);
    } else if (target === 2 && phase !== 2 && storeNavigation.members.length) {
      const matching = groups.filter(group => rawRows.some(row => row.group.trim() === group && storeNavigation.members.includes(`${row.file_id}:${row.line}`)));
      const group = matching.includes(activeStoreGroup.current) ? activeStoreGroup.current : matching[0];
      if (group) { copyNavigation(storeNavigation, navigationForGroup(group)); activeStoreGroup.current = group; }
    }
    setPhase(target); setError("");
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  function editGroup(fileId: string, line: number, group: string) {
    setFiles(current => current.map(file => file.id === fileId ? { ...file, rows: file.rows.map(row => row.line === line ? { ...row, group } : row) } : file));
    changed();
  }
  
  function revealSection(id: string, selector?: string, activate = false) {
    const section = id.match(/^csv-(?:trip-details|group)-(\d+)(?:-(.*))?$/);
    if (section && groups[Number(section[1])]) setGroupView({ group: groups[Number(section[1])], tab: section[2] === "cargo" ? "cargo" : section[2] === "stores" ? "stops" : "details" });
    requestAnimationFrame(() => {
      const element = document.getElementById(id);
      for (let parent = element?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
      if (element instanceof HTMLDetailsElement) element.open = true;
      element?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      const focus = element?.querySelector<HTMLElement>(selector || "input:not(:disabled), select:not(:disabled), button:not(:disabled), summary");
      if (activate) focus?.click();
      (focus ?? element)?.focus({ preventScroll: true });
    });
  }
  // Validate/group a cargo plan once per trip, not once per source product.
  const reviewGroups=new Map(groups.map(group=>{
    const plan=plans[group],ready=cargoReady(group),placements=new Map<string,CargoPlan["placements"]>();
    for(const placement of plan?.placements??[]){const line=placements.get(placement.line_key)??[];line.push(placement);placements.set(placement.line_key,line);}
    return [group,{details:detailsForGroup(group),target:targets[group]??defaultTarget(),plan,ready,placements,tripNumber:tripNumberForGroup(group),truckLabels:ready?plan?.trucks.map(truck=>truck.label).join(", "):null,companyLabels:ready?plan?.trucks.map(truck=>truck.companyLabel).filter(Boolean).join(", "):null}] as const;
  }));
  const reviewRows: PreviewLine[] = validRows.map(row => {
    const groupReview=reviewGroups.get(row.group)!;
    const {details,plan,target}=groupReview, location = locations[destinationKey(row.values)];
    const warehouse = row.values.source_warehouse ? preview?.warehouse_matches?.[row.values.source_warehouse] : undefined;
    const selectedWarehouse = warehouse?.candidates.find(candidate => candidate.id === (target.warehouse_ids?.[row.values.source_warehouse || ""] || warehouse.id));
    const values: Record<string, unknown> = { dispatch_number: target.mode === "dispatch" ? target.value : "Generated on save", trip_number: groupReview.tripNumber, trip_type: details.trip_type_name || null, plate_number: groupReview.truckLabels, trucking_company: groupReview.companyLabels, remarks: details.remarks || (!target.trip_details && target.mode !== "trip" ? `Source import: ${row.group}` : null), warehouse_code: selectedWarehouse?.code || null, warehouse_name: selectedWarehouse?.name || null, store_name: row.values.ship_to, customer_name: row.values.customer_name, dr_number: row.values.dr_number, sap_so_number: row.values.sap_so_number, customer_po_number: row.values.customer_po_number, internal_po_number: row.values.internal_po_number, source_product_category: row.values.product_category, customer_model: row.values.customer_model, quantity: row.values.quantity, cbm: row.values.cbm, source_province: row.values.province, source_city: row.values.city, ...row.master_values };
    const reasons = [...row.warnings, ...(!row.values.customer_model ? ["Product code can be added later"] : []), ...(!row.values.quantity ? ["Quantity can be added later"] : []), ...(!row.values.cbm ? ["CBM can be added later"] : []), ...(!row.values.dr_number ? ["DR can be added later"] : []), ...(!location?.verified ? [!location?.address ? "Delivery address is missing or unverified" : "Delivery address is unverified"] : []), ...(location?.verified && (!location.latitude || !location.longitude) ? ["Store coordinates are missing"] : []), ...(!details.trip_type_id && !details.trip_type_name ? ["Trip type can be added later"] : []), ...(!details.loading_date || !details.estimated_delivery_date ? ["Trip dates can be added later"] : []), ...(!plan?.trucks.length ? ["Truck and driver can be assigned later"] : plan.trucks.some(truck => !truck.driverId) ? ["Driver can be assigned later"] : []), ...(plan?.trucks.length && !groupReview.ready ? ["Cargo allocation stays in the draft until it is complete"] : []), ...(history[row.source_identity]?.status === "missing" && !rowResolutions[row.source_identity]?.restore_missing_source ? ["Product not in master list"] : []), ...unresolvedGroupIssues.filter(issue => issue.startsWith(`${row.group}:`)).map(issue => issue.slice(row.group.length + 2)), ...(outcomes[row.source_identity]?.status === "failed" ? ["This product was not saved; review the server response in Advanced details"] : [])];
    return { id: row.source_identity, group: row.group, groupLabel: row.values.ph_truck_reference || row.group, label: row.values.customer_model || row.values.dr_number || "Product", stop: destinationKey(row.values), values, dataVersion: { values, source: row.values, group: row.group, location: location || null, details, trucks: plan?.trucks || [], allocations: groupReview.placements.get(row.source_identity) || [], resolution: rowResolutions[row.source_identity] || null }, reasons: [...new Set(reasons)] };
  });
  const reviewFlaggedCount = reviewRows.filter(row => { const appearance = rowAppearance(annotations[row.id], reviewFingerprint(row.dataVersion || row.values, row.reasons), row.reasons); return row.reasons.length > 0 && !appearance.reviewed || appearance.manual && appearance.color !== "none"; }).length;
  const activeGroup = groups.includes(groupView.group) ? groupView.group : groups[0];
  const completionByGroup = Object.fromEntries(groups.map((group, index) => {
    const rows = rawRows.filter(row => row.group.trim() === group);
    const stops = [...new Map(rows.map(row => [destinationKey(row.values), row])).entries()].map(([key, row]) => ({ key, label: row.values.ship_to || "destination store", verified: confirmedStopAddress(locations[key]) }));
    return [group, csvCompletion({ group, index, detailIssues: unresolvedGroupIssues.filter(issue => issue.startsWith(`${group}:`)).map(issue => issue.slice(group.length + 2)), stops, lines: cargoLines(group), plan: plans[group] ?? emptyCargoPlan(), cargoSaved: Boolean(cargoSaved[group]), dirty: detailsDirty })];
  }));
  const reviewIssues = blockingIssues(Object.values(completionByGroup));
  function focusCompletionIssue(issue: CompletionIssue) {
    if (issue.stop) {
      const source = rawRows.find(row => row.group.trim() === issue.group && destinationKey(row.values) === issue.stop);
      if (source) {
        const memory = navigationForGroup(issue.group);
        memory.selected = `${source.file_id}:${source.line}`; memory.members = [memory.selected]; memory.search = ""; memory.attention = false;
      }
    }
    setVisitedTabs(current => ({ ...current, [issue.group]: [...new Set([...(current[issue.group] ?? []), issue.tab])] }));
    setGroupView({ group: issue.group, tab: issue.tab }); activeStoreGroup.current = issue.group;
    const unassigned = issue.tab === "cargo" && /DRs? unassigned/.test(issue.message);
    revealSection(issue.section, issue.stop ? '.address-card button:not(:disabled), .address-card input:not(:disabled)' : /delivery is before/.test(issue.message) ? 'input[type="date"]' : unassigned ? '.cargo-truck-summary:first-child .cargo-truck-select' : /Plan without reserving/.test(issue.message) ? '.cargo-schedule-line input[type="checkbox"]' : undefined, unassigned);
  }
  function selectTab(tab: GroupTab) {
    if (busy || saving) return;
    const forward = completionTabs.indexOf(tab) > completionTabs.indexOf(groupView.tab);
    const pending = forward ? blockingIssues([completionByGroup[activeGroup]], tab) : [];
    if (pending.length) { setShowCompletionIssues(true); focusCompletionIssue(pending[0]); return; }
    setVisitedTabs(current => ({ ...current, [activeGroup]: [...new Set([...(current[activeGroup] ?? []), groupView.tab, tab])] }));
    setGroupView({ group: activeGroup, tab });
    bodyRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
  }
  const groupItems = groups.map(group => {
    const rows = rawRows.filter(row => row.group === group), stops = [...new Set(rows.map(row => destinationKey(row.values)))];
    const issues = blockingIssues([completionByGroup[group]]).length + rows.filter(row => row.errors.length).length;
    return { key: group, lines: rows.length, stores: stops.length, cbm: displayCargoTotal(cargoLines(group).map(line => line.cbm)), issues, ready: !issues && !detailsDirty };
  });
  function selectGroup(group: string) { setGroupView(current => ({ ...current, group })); activeStoreGroup.current = group; bodyRef.current?.scrollTo({ top: 0 }); }
  const { ref: dialogRef, close: onClose } = useTripModal<HTMLElement>({ onClose: onDismiss, onEscape: () => { void closeImport(); } });
  return <div className={`${tripModalBackdrop} z-[2100]`}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-trip-title" aria-describedby="bulk-trip-title-description" aria-busy={saving || busy} className={tripModalShell}>
      <TripModalHeader id="bulk-trip-title" title="Add trip from CSV" description="Bring in your trip requests, review the details, and save with confidence." icon={<FileSpreadsheet className="h-6 w-6" />} disabled={saving || busy} onClose={() => void closeImport()} closeLabel="Close import">
      </TripModalHeader>
      <TripModalSteps labels={steps} current={phase} onJump={navigate} isDisabled={index => busy || saving || (index > 0 && !files.length) || (index > 1 && !draftLoaded)} label="CSV import steps" />
      <div ref={bodyRef} className="trip-flow-body" data-csv-phase={phase}>
        <div key={phase} className="trip-step-panel space-y-4">
        {saveWarning && phase !== 0 && <TripFormNotice tone="warning" title="Save warnings" onDismiss={() => setSaveWarning("")}>{saveWarning}</TripFormNotice>}
        {error && phase !== 0 && <TripFormNotice tone="error" title="Check the import" onDismiss={() => setError("")}>{error}</TripFormNotice>}
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" />Checking source rows...</p>}
        
        {phase === 0 && <>
          <TripFileUpload files={files} disabled={locked || busy || saving} busy={busy} error={error} onFiles={selected => void load(selected)} />
          <details className="group border-t border-slate-200 pt-3"><summary className="cursor-pointer text-sm font-medium text-slate-600 list-none flex items-center justify-between">Resume a saved import <ChevronRight className="h-4 w-4 group-open:rotate-90 transition-transform" /></summary><div className="mt-4 space-y-3"><button type="button" className={button} disabled={busy || saving} onClick={() => void savedImports()}>Load saved imports</button>{batches.map(batch => <div key={batch.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs border border-slate-200"><div className="min-w-0 flex-1"><strong className="text-slate-800">{batch.state}</strong><p className="text-slate-500">{batch.imported} products saved / {batch.awaiting_allocation} cargo plans pending</p>{batch.last_error && <p className="mt-1 text-amber-800">{batch.last_error}</p>}</div><button type="button" className={button} disabled={busy || saving} onClick={() => void resume(batch.id)}>Reopen</button></div>)}</div></details>
        </>}
        
        {phase === 1 && files.length > 0 && <>
          <div className="flex items-center justify-between gap-3"><h3>Review your source files</h3><span className="text-xs text-slate-500">{files.length} files · {rawRows.length} rows</span></div>
          <CsvSourceTabs>{tab => tab === "mapping" ? <section aria-label="Column mapping">{files.map(file => <SmartImportMapping key={file.id} file={file} owner={profile?.id} disabled={locked || saving || busy} onMap={(index, field) => mapping(file.id, index, field)} onApply={assignments => applyMapping(file.id, assignments)} onGroup={field => suggestGroups(file.id, field)} />)}</section> : <TripImportPreview viewMode={tab} files={files} preview={preview} outcomes={outcomes} disabled={locked || saving} onEdit={editCell} onGroup={editGroup} />}</CsvSourceTabs>
          {preview && <TripFormNotice tone={preview.invalid || preview.setup_required ? "warning" : "success"} title={preview.setup_required ? "Import setup needed" : "CSV checked"}>{preview.setup_required ? "An administrator needs to finish enabling trip imports. Your file and draft are safe." : preview.setup_message || `${preview.detected} rows checked / ${preview.valid} valid / ${preview.invalid} need correction / ${preview.duplicates} exact duplicates will be skipped.`}</TripFormNotice>}
        </>}
        
        {phase === 2 && preview && <div className="space-y-4">
          {files.filter(hasPhReferenceGroups).map(file => <div key={file.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 p-3 text-xs text-slate-600"><p className="min-w-0 flex-1"><strong>{file.name}</strong>: PH references can share a physical truck across stops. Combine these groups to plan cargo against one shared truck capacity.</p><button type="button" className={button} disabled={locked || saving || busy} onClick={() => setCombineFile(file.id)}>Combine PH groups</button>{locked && <p className="w-full">This batch has recorded rows. Its saved trip groups must stay unchanged; use a new import batch to plan a combined trip.</p>}</div>)}
          {detailReadError && <TripFormNotice tone="warning" title="Saved trip details">{detailReadError}</TripFormNotice>}
          {showCompletionIssues && reviewIssues.length > 0 && <section className="csv-completion-issues" role="alert" aria-label="Complete before reviewing"><h3>Complete before reviewing</h3><ul>{reviewIssues.map((issue, index) => <li key={`${issue.group}-${issue.tab}-${index}`}><button type="button" onClick={() => focusCompletionIssue(issue)}>{groups.length > 1 && <span>{issue.group} · </span>}<strong>{issue.tab === "details" ? "Details" : issue.tab === "stops" ? "Stops" : "Trucks & cargo"}</strong> – {issue.message}</button></li>)}</ul></section>}
          {inheritedTarget?.mode === "dispatch" && <p className="text-sm text-slate-600">Selected dispatch: <strong>{inheritedTarget.value}</strong></p>}
          <GroupRail items={groupItems} current={activeGroup} tab={groupView.tab} onSelect={selectGroup} onTab={selectTab} completion={completionByGroup[activeGroup]} visited={visitedTabs[activeGroup]}>
          {accessToken && groups.filter(group => group === activeGroup).map(group => {
            const index = groups.indexOf(group);
            const allocationSession = allocationSessions.current[group] ??= createAllocationSession();
            const target = targets[group] ?? defaultTarget(), details = detailsForGroup(group), groupRows = validRows.filter(row => row.group === group);
            const sourceRows = rawRows.filter(row => row.group.trim() === group), plan = plans[group] ?? emptyCargoPlan();
            const warehouses = [...new Set(groupRows.map(row => row.values.source_warehouse).filter((code): code is string => Boolean(code?.trim())))];
            const ids = { details: `csv-trip-details-${index}`, destination: `csv-group-${index}-destination`, warehouses: `csv-group-${index}-warehouses`, stores: `csv-group-${index}-stores`, cargo: `csv-group-${index}-cargo` };
            return <div key={group}>
              {groupView.tab === "details" && <div className="group-details-fields">
                  <ImportTripDetailsCard id={ids.details} token={accessToken} group={group} details={details} tripNumber={tripNumberForGroup(group)} disabled={locked || saving || busy} existingTrip={target.mode === "trip"} onChange={patch => updateTripDetails(group, patch)} onApplyAll={() => applyTripDetailsToAll(group)} />
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2678b9]" disabled={locked || saving || busy} checked={target.allow_create} onChange={event => updateTarget(group, { allow_create: event.target.checked })} /><span><strong className="block">Create missing records</strong><span className="mt-1 block leading-5 text-slate-500">Allow customers, stores, products and source warehouses that are missing from the master lists to be created from reviewed source values. Existing matches are always reused; physical trucks must still be selected.</span></span></label>
                  <details className="group-details-disclosure" id={ids.destination}><summary>Dispatch &amp; trip group <span>{target.mode === "new" ? "New dispatch" : "Existing destination"}</span></summary><div><ImportDispatchTarget group={group} target={target} existing={[...new Map([...existing, ...Object.values(detailRecords)].map(trip => [trip.id, trip])).values()]} disabled={locked || saving || busy} onChange={patch => updateTarget(group, patch)} onSearch={searchExisting} /></div></details>
                  <details className="group-details-disclosure" id={ids.warehouses}><summary>Warehouses <span>{warehouses.length ? `${warehouses.length} source warehouses` : "No source warehouses"}</span></summary><div>
                    <div className="space-y-4">{warehouses.length > 1 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Several source warehouses: select the trip origin or split the trip group. Original line warehouses remain separate.</p>}
                      <div className="space-y-2"><p className="text-xs font-medium text-slate-600">Origin warehouse</p><SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" autoFocus={false} value={warehouseLabels[group + "origin"] ?? (target.origin_warehouse_id || details.origin_warehouse_id ? "Selected origin warehouse" : "")} disabled={locked || saving || busy} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + "origin"]: option.label })); updateTarget(group, { origin_warehouse_id: option.id }); }} onCommitBlur={() => {}} onCancel={() => {}} /></div>
                      {warehouses.map(code => { const matched = Boolean(target.warehouse_ids?.[code]), conflict = preview.warehouse_matches?.[code]?.status === "conflict";
                        return <div key={code} className="grid items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]"><div className="space-y-2"><strong className="block break-words text-xs text-slate-700">Source: {code}</strong><StatusChip label={matched ? "Matched" : conflict ? "Conflict" : "Needs selection"} tone={matched ? "success" : conflict ? "danger" : "warning"} /></div><div className="min-w-0"><SourceWarehousePicker token={accessToken} source={code} matched={matched} conflict={conflict} disabledReason={saving || busy ? "Wait for the current operation to finish." : locked ? "This batch has recorded rows, or its save result could not be confirmed. Reopen the saved import to check its state. Saved destinations cannot be changed in this batch." : undefined} value={warehouseLabels[group + code] ?? preview.warehouse_matches?.[code]?.label ?? code} disabled={locked || saving || busy} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + code]: option.label })); updateTarget(group, { warehouse_ids: { ...target.warehouse_ids, [code]: option.id } }); }} /></div></div>;
                      })}
                      {!warehouses.length && <p className="text-xs text-slate-500">No source warehouse codes were supplied for this group.</p>}
                    </div>
                  </div></details>
                  <div id={`csv-group-${index}-history`}><PreviousImportSummary token={accessToken} rows={preview.rows.filter(row => row.group === group && !row.errors.length)} history={history} resolutions={rowResolutions} skipped={skippedRows} disabled={saving || busy} onChange={updateRowResolution} onSkip={toggleSkip} /></div>
              </div>}
              {groupView.tab === "stops" && <section id={ids.stores} onFocusCapture={() => { activeStoreGroup.current = group; }} onPointerDownCapture={() => { activeStoreGroup.current = group; }} className="min-w-0 space-y-3">
                    <p className="text-xs text-slate-500">Finding and confirming an address is optional. You can continue and add it later.</p>
                    {detailsDirty && <TripFormNotice tone="warning" title="Store or product changes need checking">Apply changes to update the signed preview and cargo proposal before continuing. Original CSV values are preserved.</TripFormNotice>}
                    <ImportStoreCards onImport={() => navigate(0)} navigation={navigationForGroup(group)} locationProgress={locationProgress} token={accessToken} rows={sourceRows} locations={locations} locationChecking={locationChecking} disabled={locked || saving || busy} identityDisabled={saving || busy} onLocations={next => { setLocations(next); setConfirmed(false); }} onEdit={editGroupDetails} onAdd={addDetailsProduct} onRemove={removeDetailsProduct} />
                    {detailsDirty && <button type="button" className={button} disabled={busy || saving || locked} onClick={() => void applyDetails()}>{busy && <Loader2 size={15} className="animate-spin" />}Apply store &amp; product changes</button>}
                  </section>}
              {groupView.tab === "cargo" && <div id={ids.cargo}>
                    <TripCargoPlanner onCapacity={value => setCapacityByGroup(current => current[group] === value ? current : { ...current, [group]: value })} session={allocationSession} token={accessToken} scheduleManaged={Boolean(details.loading_date && details.estimated_delivery_date)} onEditSchedule={locked || target.mode === "trip" ? undefined : () => { setGroupView({ group, tab: "details" }); revealSection(ids.details); }}
                      existingTripId={target.mode === "trip" ? target.value : results.find(row => row.trip_id && preview.rows.some(source => source.group === group && source.source_identity === row.source_identity))?.trip_id}
                      lines={cargoLines(group)} plan={plan} onChange={next => {
                        setPlans(current => ({ ...current, [group]: next })); setConfirmed(false);
                        if (!locked && target.mode !== "trip" && next.schedule && (next.schedule.loading_date !== (details.loading_date ?? "") || next.schedule.estimated_delivery_date !== (details.estimated_delivery_date ?? ""))) updateTripDetails(group, { loading_date: next.schedule.loading_date || null, estimated_delivery_date: next.schedule.estimated_delivery_date || null });
                      }} disabled={saving || Boolean(cargoSaved[group])} />
                  </div>}
            </div>;
          })}
          </GroupRail>
        </div>}
        
        {phase === 3 && preview && <>
          {groups.some(group => !(targets[group] ?? defaultTarget()).allow_create) && <TripFormNotice tone="warning" title="Missing master records will not be created" action={!locked && !saving && !busy ? <button type="button" className={button} onClick={() => { setGroupView({ group: activeGroup, tab: "details" }); navigate(2); }}>Review complete details</button> : undefined}>Creating records is off, so rows whose customer, store, product or source warehouse is not already in the master lists will fail. Turn on <strong>Create missing records</strong> in Complete details, or match each record in the preview before saving.</TripFormNotice>}
          <ReviewPreviewTable token={accessToken || ""} rows={reviewRows} annotations={annotations} onAnnotations={setAnnotations}
            excluded={(preview.rows.filter(row => row.errors.length || skippedRows.has(row.source_identity))).map(row => ({ id: row.source_identity, label: `${row.values.customer_model || row.values.dr_number || "Product"} · ${row.filename}`, reason: skippedRows.has(row.source_identity) ? "Skipped by you" : row.errors.join(" ") }))}
            notices={<><PreviousImportSummary token={accessToken || ""} rows={preview.rows} history={history} resolutions={rowResolutions} skipped={skippedRows} disabled={saving || busy} onChange={updateRowResolution} onSkip={toggleSkip} />{preview.setup_required && <p role="status" className="text-xs text-amber-800">Trip import setup is still needed on this server. Your draft can be reviewed and retained.</p>}<details className="review-advanced"><summary>Advanced details</summary><p className="text-xs">The current import API excludes rows with invalid source values, missing Customer Name, Ship To, trip group, or all source identifiers. Product code, quantity and DR are not universally required by the optional-booking schema.</p>{groups.map(group => <ReviewSourceLines key={group} rows={preview.rows.filter(row => row.group === group)} outcomes={outcomes} />)}<ImportLocationNotices destinations={destinations} decisions={locations} checking={locationChecking} /></details></>} />
          {(started || results.length > 0) && <ImportResultsPanel trips={new Set(results.filter(row => row.trip_created).map(row => row.trip_id).filter(Boolean)).size} imported={imported} skipped={skipped} failed={failed} invalid={preview.invalid} cargoSaved={Object.values(cargoSaved).filter(Boolean).length} batchId={batchId} finished={finished} retryDisabled={saveDisabled} retryReason={saveReason} onRetry={() => void save()} onDownload={downloadFailures} />}
          {saving && <p role="status" className="text-xs text-slate-600">Processed {progress} source rows. Keep this window open.</p>}
        </>}
        </div>

      </div>
      <footer className={tripFooter}>
        {files.length > 0 && <TripSummaryBar stops={preview ? stopCounts : new Set(rawRows.map(row => JSON.stringify([row.group, destinationKey(row.values)]))).size} qty={displayCargoTotal(preview ? groups.flatMap(cargoLines).map(line => line.quantity) : rawRows.map(row => row.values.quantity || "0"))} label="All trips" cbm={preview ? displayCargoTotal(groups.flatMap(cargoLines).map(line => line.cbm)) : displayCargoTotal(rawRows.map(row => row.values.cbm || "0"))} trucks={Object.values(plans).reduce((total, plan) => total + plan.trucks.length, 0)} capacity={displayCargoTotal(groups.map(group => capacityByGroup[group] ?? displayCargoTotal((plans[group]?.trucks ?? []).filter(truck => /^\d+(?:\.\d+)?$/.test(truck.capacity) && Number(truck.capacity) > 0).map(truck => truck.capacity))))} />}
        <div className="trip-footer-row"><div className="trip-footer-meta"><span>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} · ${rawRows.length} rows` : "CSV / XLSX"}</span>{draftStatus && <span role="status" className="trip-footer-draft" title={draftStatus}>{draftStatus.startsWith("Draft saved") ? "Draft saved ✓" : draftStatus}</span>}{files.length > 0 && <button type="button" disabled={busy || saving} className="text-xs font-medium text-[#2678b9]" onClick={() => void persistDraft().catch(() => { })}>Save draft</button>}</div>
          <div className="trip-footer-actions">
            {phase === 1 && (busy || saving || !preview || preview.setup_required || !validRows.length) && <button type="button" className="trip-footer-hint" onClick={() => revealSection("csv-source-review")}>{busy ? "Checking rows…" : preview?.setup_required ? "Import setup needed" : !preview ? "Check CSV before continuing" : "Resolve source row errors"}</button>}
            <button type="button" className={button} disabled={saving || busy} onClick={() => phase === 2 && groupView.tab !== "details" ? selectTab(groupView.tab === "cargo" ? "stops" : "details") : phase > 0 && !finished ? navigate(phase - 1) : void closeImport()}>{finished ? "Done" : phase ? "Back" : "Back to Add trip"}</button>{closeBlocked && <button type="button" className={button} onClick={onClose}>Close without saving</button>}
            {preview && (preview.invalid > 0 || failed > 0) && <button type="button" className={button} onClick={downloadFailures}><Download size={16} />Download failed rows</button>}
            {phase === 0 && files.length > 0 && <button type="button" className={primaryButton} onClick={() => navigate(1)}>Preview CSV <ChevronRight size={14} /></button>}
            {phase === 1 && <>{!locked && <button type="button" className={button} disabled={busy || saving} onClick={() => void prepare()}>{preview ? "Recheck CSV" : "Check CSV"}</button>}<button type="button" className={primaryButton} disabled={busy || saving || !preview || !validRows.length} onClick={() => { setDraftLoaded(true); navigate(2); }}>Continue to details <ChevronRight size={14} /></button></>}
            {phase === 2 && <button type="button" className={primaryButton} disabled={busy || saving || !rawRows.length} onClick={async () => { if (groupView.tab !== "cargo") { selectTab(groupView.tab === "details" ? "stops" : "cargo"); return; } if (detailsDirty && !await applyDetails()) return; navigate(3); }}>{groupView.tab === "details" ? "Next: Stops" : groupView.tab === "stops" ? "Next: Trucks & cargo" : "Review trip"}<ChevronRight size={14} /></button>}
            {phase === 3 && <><span role="status" className="review-save-status">{finished ? "Saved" : `Ready · ${reviewFlaggedCount} rows flagged for review`}</span><button type="button" className={primaryButton} disabled={saveDisabled} onClick={() => void save()}>{saving ? "Saving…" : finished ? "Trip saved" : "Save trip"}</button></>}

          </div>
        </div>
      </footer>
      {combineFile && <TripPopover title="Combine PH reference groups" onClose={() => setCombineFile(null)}><div className="space-y-4 text-sm text-slate-600"><p>Plan all stops and PH references in this file together. Each physical truck can carry multiple DRs and stops up to its CBM capacity.</p><p>Group-specific truck assignments and trip settings will be reset. Source products, quantities, CBM, PH references, address decisions and recovery approvals are retained. Recheck the CSV, then choose the shared trucks and review the new allocation.</p><div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} onClick={() => setCombineFile(null)}>Keep groups</button><button type="button" className={primaryButton} disabled={locked || saving || busy} onClick={() => { suggestGroups(combineFile, "file"); setCombineFile(null); }}>Combine and replan</button></div></div></TripPopover>}
    </section>
  </div>;
}
