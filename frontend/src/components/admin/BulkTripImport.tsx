import { focusRing } from "./shared/styles";
import ImportResultsPanel from "./ImportResultsPanel";
import { displayCargoTotal } from "./shared/TripLiveSummary";
import ImportDispatchTarget from "./ImportDispatchTarget";
import { SectionCard, ReviewChecklist, StatusChip, StatChip, TruckCard } from "./shared";
import { createStoreWorkspaceMemory, useStoreWorkspaceMemory, type StoreWorkspaceMemory } from "./shared/storeWorkspace";
import ImportTripDetailsCard from "./ImportTripDetailsCard";
import { emptyTripDetails } from "../../../../packages/trip-import/trip-details.js";
import ImportSourceRecovery from "./ImportSourceRecovery";
import SmartImportMapping from "./SmartImportMapping";
import TripImportPreview from "./TripImportPreview";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import TripCargoPlanner from "./TripCargoPlanner";
import { destinationKey, recoverDestinationDecisions, type LocationDecision } from "./ImportDestinationReview";
import { cargoSignature, cargoCapacity, emptyCargoPlan, validateCargo, type CargoPlan, type CargoLine } from "../../services/cargo-planning";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { readImportFile, editImportRows, importFields, importMappingProblems, setSourceMapping, sourceAssignments, importPayload, type ImportFile, type ImportField } from "./tripImportFiles";
import { previewImport, commitImport, confirmImportCargo, saveImportAssignmentCompanies, fetchImportBatches, reopenImportBatch, saveImportBatchDraft, type ImportRecoveryDraft, type ImportBatchSummary, type ImportPreview, type ImportTarget, type ImportOutcome, type ImportSourceHistory, type ImportRowResolution, type TripDetails } from "../../services/trip-import.service";
import { fetchTrips, fetchTripDetail, type TripRecord } from "../../services/trip.service";
import TripFormNotice from "./TripFormNotice";
import ImportLocationNotices from "./ImportLocationNotices";
import ImportStoreProductsPreview from "./ImportStoreProductsPreview";
import ImportStoreCards, { type ImportCardRow } from "./ImportStoreCards";
import { storeLocationLabel } from "../../services/store-location";
import { failedTripLocation, locationLookupFailed, resolveTripLocation, type TripLocationLookup } from "../../services/trip-location.service";
import { ApiError } from "../../services/api.service";

const button = "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#0b2341] shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors " + focusRing;
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-full border border-transparent !bg-[#0b2341] px-4 py-2 text-sm font-medium !text-white shadow-sm hover:!bg-[#1a365d] disabled:opacity-50 transition-colors " + focusRing;

export default function BulkTripImport({ onClose, onComplete, onImported, initialTarget, initialTripDetails }: { onClose: () => void; onComplete?: () => void; onImported: () => void; initialTarget?: ImportTarget; initialTripDetails?: TripDetails }) {
  const storeNavigation = useStoreWorkspaceMemory();
  const groupNavigation = useRef<Record<string, StoreWorkspaceMemory>>({});
  const activeStoreGroup = useRef("");
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
    const target: ImportTarget = inheritedTarget ? { ...inheritedTarget } : { mode: "new", value: "", allow_create: false };
    return tripDetails && target.mode !== "trip" ? { ...target, trip_details: { ...tripDetails }, origin_warehouse_id: target.origin_warehouse_id ?? tripDetails.origin_warehouse_id ?? undefined } : target;
  };
  const [history, setHistory] = useState<Record<string, ImportSourceHistory>>({});
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
  const draft = useMemo<ImportRecoveryDraft>(() => ({ files, preview, targets, plans, locations, rowResolutions, trip_details: tripDetails, initialTarget: inheritedTarget, confirmed, verified, verifiedCbm, verifiedUnmapped, started, locationFollowupPending: locationRetryRequired, detailsDirty }), [files, preview, targets, plans, locations, rowResolutions, tripDetails, inheritedTarget, confirmed, verified, verifiedCbm, verifiedUnmapped, started, locationRetryRequired, detailsDirty]);
  
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
      batchRevision.current = recovered.revision; setBatchId(id); setFiles(saved.files); setPreview(saved.preview); setTargets(saved.targets ?? {}); setPlans(saved.plans ?? {}); setLocations(recoverDestinationDecisions(saved.locations)); setInheritedTarget(saved.initialTarget); setConfirmed(false); setVerified(Boolean(saved.verified)); setVerifiedCbm(Boolean(saved.verifiedCbm)); setVerifiedUnmapped(Boolean(saved.verifiedUnmapped)); setOutcomes(Object.fromEntries(recovered.outcomes.map(row => [row.source_identity, row]))); setCargoSaved(recovered.cargo_saved); setCompaniesSaved({}); setStarted(Boolean(saved.started) || recovered.outcomes.length > 0); setDraftLoaded(Boolean(saved.preview)); setPhase(saved.preview ? 2 : 1); setWarehouseLabels({}); setDraftStatus(`Reopened ${recovered.state}. ${recovered.last_error ?? "Existing trip and product IDs are preserved."}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reopen this batch."); } finally { setBusy(false); }
  }
  const groups = [...new Set(files.flatMap(file => file.rows.map(row => row.group.trim())).filter(Boolean))];
  // The preview endpoint preserves file/row order, including invalid rows. Keep these
  // UI-only identities separate from signed source_identity and document_hash.
  const sourceRows = useMemo(() => files.flatMap(file => importPayload([file])[0].rows.map(row => ({ ...row, filename: file.name, file_id: file.id }))), [files]);
  const storePreviewRows = useMemo(() => (preview?.rows ?? []).map((row, index) => {
    const source = sourceRows[index];
    const aligned = source?.filename === row.filename && source.line === row.line && source.group.trim() === row.group;
    return { ...row, navigation_row_id: !detailsDirty && aligned ? `${source.file_id}:${source.line}` : row.source_identity };
  }), [preview, sourceRows, detailsDirty]);
  const rawRows = useMemo(() => sourceRows.map((row, index) => {
    const checked = preview?.rows[index];
    return { ...row, errors: !detailsDirty && checked?.filename === row.filename && checked.line === row.line ? checked.errors : [] };
  }), [sourceRows, preview, detailsDirty]);
  const results = Object.values(outcomes), imported = results.filter(row => row.status === "imported" || row.status === "skipped" && row.original_batch_id === batchId && row.line_item_id).length;
  const skipped = results.filter(row => row.status === "skipped" && row.original_batch_id !== batchId && row.line_item_id).length, failed = results.filter(row => row.status === "failed").length;
  const locked = started || results.some(row => row.status !== "failed");
  const validRows = preview?.rows.filter(row => !row.errors.length) ?? [];
  const liveDuplicates = validRows.filter(row => history[row.source_identity]?.status === "live" ? history[row.source_identity].batch_id !== batchId : !history[row.source_identity] && row.duplicate).length;
  const missingSources = validRows.filter(row => history[row.source_identity]?.status === "missing").length;
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
          const existing = current[source.key] ?? { address: "", province: source.province, city: source.city, latitude: "", longitude: "", verified: false, replace_verified: false };
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to check the edited product lines."); }
    finally { setBusy(false); }
  }
  function changed() { setDetailsDirty(false); setDraftLoaded(false); setPhase(1); setPreview(null); setConfirmed(false); setVerified(false); setVerifiedCbm(false); setVerifiedUnmapped(false); setError(""); }
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

  async function save() {
    if (saveBlockers.length) { setError(saveBlockers.join("\n")); return; }
    if (detailsDirty) { setError("Apply the store and product changes before saving this trip."); return; }
    if (locationChecking) { setError("Wait for delivery location checks to finish before saving."); return; }
    if (!preview || !draftLoaded || !accessToken || !confirmed || preview.setup_required || savingRef.current) return;
    for (const group of groups) { const plan = plans[group], lines = cargoLines(group); if (plan?.trucks.length && lines.length && !cargoSaved[group]) { const problem = validateCargo(lines, plan.trucks, plan.placements); if (!plan.confirmed || plan.signature !== cargoSignature(lines, plan.trucks) || problem) { setError(problem || "Review and confirm the current cargo proposal for every group."); return; } } }
    if (validRows.some(row => history[row.source_identity]?.status === "missing" && (!rowResolutions[row.source_identity]?.restore_missing_source || rowResolutions[row.source_identity]?.restore_history_version !== history[row.source_identity].imported_at))) { setError("Review and explicitly approve each missing historical product in Source history before retrying. These rows are not live duplicates."); return; }
    savingRef.current = true; setStarted(true);
    setSaving(true); setError(""); setProgress(0);
    let processed = 0;
    try {
      await persistDraft({ ...draft, started: true, locationFollowupPending: true });
      setLocationRetryRequired(true);
      const failures: string[] = [];
      const latestHistory = { ...history };
      for (const group of groups) {
        let groupFailed = false;
        const latestOutcomes = { ...outcomes };
        const target = targets[group] ?? defaultTarget();
        const pending = validRows.filter(row => row.group === group && (history[row.source_identity]?.status === "missing" || locationRetryRequired || !["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")));
        for (let index = 0; index < pending.length; index += 100) {
          const chunk = pending.slice(index, index + 100);
          const result = await commitImport(accessToken, batchId, group, target, chunk, verified, verifiedCbm, verifiedUnmapped, Object.fromEntries(chunk.map(row => [row.source_identity, { ...locations[destinationKey(row.values)], ...rowResolutions[row.source_identity] }])));
          Object.assign(latestHistory, result.history ?? {}); setHistory(current => ({ ...current, ...result.history }));
          if (result.rows.some(row => row.status === "failed" || row.status === "skipped" && !row.line_item_id)) groupFailed = true;
          if (result.rows.some(row => row.status === "imported")) refreshOnClose.current = true;
          Object.assign(latestOutcomes, Object.fromEntries(result.rows.map(row => [row.source_identity, row])));
          setOutcomes(current => ({ ...current, ...Object.fromEntries(result.rows.map(row => [row.source_identity, row])) }));
          processed += chunk.length; setProgress(processed);
        }
        if (groupFailed) { failures.push(...validRows.filter(row => row.group === group && (latestOutcomes[row.source_identity]?.status === "failed" || latestOutcomes[row.source_identity]?.status === "skipped" && !latestOutcomes[row.source_identity]?.line_item_id)).map(row => latestOutcomes[row.source_identity]?.error || `${row.filename}, CSV row ${row.line}: source import failed.`)); continue; }
        const newlyOwned = validRows.filter(row => row.group === group && ownsSource(row, latestHistory) && Boolean(latestOutcomes[row.source_identity]?.line_item_id));
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
      else {
        await persistDraft({ ...draft, started: true, locationFollowupPending: false });
        setLocationRetryRequired(false);
      }
    } catch (cause) {
      try { const recovered = await reopenImportBatch(accessToken, batchId); setOutcomes(Object.fromEntries(recovered.outcomes.map(row => [row.source_identity, row]))); setHistory(recovered.history ?? {}); setCargoSaved(recovered.cargo_saved); if (recovered.outcomes.some(row => row.line_item_id && (row.status === "imported" || row.original_batch_id === batchId))) refreshOnClose.current = true; } catch { /* Keep the existing batch and draft when acknowledgements are unavailable. */ }
      if (cause instanceof ApiError && cause.code === "TRIP_LOCATION_FOLLOWUP_REQUIRED") {
        setLocationRetryRequired(true);
        refreshOnClose.current = true;
      }
      setError(`${cause instanceof Error ? cause.message : "Import interrupted."} Retry this batch; completed rows are protected from duplicates.`);
    } finally { savingRef.current = false; setSaving(false); }
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
    setFiles(current => current.map(file => file.id !== fileId ? file : { ...file, rows: file.rows.map(row => {
      const value = field === "file" ? "" : row.cells[file.mapping[field]]?.trim() ?? "";
      const trip = field === "dispatch_number" ? row.cells[file.mapping.trip_number]?.trim() ?? "" : "";
      return { ...row, group: value ? `${file.name} / ${value}${trip ? ` / Trip ${trip}` : ""}` : file.name };
    }) })); changed();
  }
  function updateRowResolution(identity: string, patch: Partial<ImportRowResolution>) { setRowResolutions(current => ({ ...current, [identity]: { ...current[identity], ...patch } })); setConfirmed(false); }
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
  const unresolved = unresolvedGroupIssues.length > 0;
  const steps = ["Upload CSV", "Preview & import", "Complete details", "Review & save"];
  const finished = !locationRetryRequired && results.length > 0 && validRows.every(row => history[row.source_identity]?.status !== "missing" && Boolean(outcomes[row.source_identity]?.line_item_id) && ["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? "")) && groups.every(group => !cargoLines(group).length || !plans[group]?.trucks.length || (cargoSaved[group] && (!plans[group].trucks.some(truck => truck.companyId) || companiesSaved[group])));
  const hasUnmapped = Boolean(preview?.rows.some(row => Object.keys(row.unmapped ?? {}).length > 0));
  const cbmDiscrepancies = preview?.rows.filter(row => row.warnings.some(warning => warning.includes("Total CBM differs"))).length ?? 0;
  const missingApprovals = validRows.filter(row => history[row.source_identity]?.status === "missing" && (!rowResolutions[row.source_identity]?.restore_missing_source || rowResolutions[row.source_identity]?.restore_history_version !== history[row.source_identity].imported_at));
  const cargoProblems = groups.flatMap(group => {
    const plan = plans[group], lines = cargoLines(group);
    if (!plan?.trucks.length || !lines.length || cargoSaved[group]) return [];
    const problem = validateCargo(lines, plan.trucks, plan.placements);
    return problem || !plan.confirmed || plan.signature !== cargoSignature(lines, plan.trucks) ? [`${group}: ${problem || "Review and confirm the current cargo proposal."}`] : [];
  });
  const readinessChecks = [
    { id: "preview", label: "Signed preview ready", checked: Boolean(preview && draftLoaded && accessToken && validRows.length && !preview.setup_required), description: preview?.setup_required ? preview.setup_message || "Database setup is required before saving." : !accessToken ? "Sign in before saving." : !validRows.length ? "Prepare at least one valid source row." : !draftLoaded ? "Load the checked CSV into the trip draft." : "Valid rows are ready; invalid rows remain excluded." },
    { id: "details", label: "Store & product changes applied", checked: !detailsDirty, description: detailsDirty ? "Return to Complete details and apply store & product changes." : "Source preview reflects the current edits." },
    { id: "locations", label: "Location checks complete", checked: !locationChecking, description: locationChecking ? "Wait for delivery location checks to finish." : "Unverified locations are reported below and may be saved without coordinates." },
    { id: "groups", label: "Trip groups, dates & warehouses resolved", checked: !unresolved, description: unresolved ? unresolvedGroupIssues.join(" / ") : "Group destinations, dates and warehouse selections are resolved." },
    { id: "cargo", label: "Cargo plans confirmed", checked: !cargoProblems.length, description: cargoProblems.join(" / ") || "Current cargo plans are confirmed or already saved; trucks may be assigned later." },
    { id: "history", label: "Missing-source approvals current", checked: !missingApprovals.length, description: missingApprovals.length ? `${missingApprovals.length} historical products need current restoration approval in Source history & recovery: ${missingApprovals.map(row => `${row.filename}, CSV row ${row.line}`).join("; ")}.` : "No historical product is awaiting restoration approval." },
  ];
  const confirmationChecks = [
    { id: "groups-reviewed", label: "I reviewed the row groups and destination choices", description: "Save valid rows and skip exact duplicates.", checked: confirmed, disabled: unresolved },
    ...(hasUnmapped ? [{ id: "unmapped", label: "I reviewed the unmapped columns", description: "Keep their values in import provenance without assigning unrelated TMS fields.", checked: verifiedUnmapped }] : []),
    ...(preview?.potential_duplicates ? [{ id: "duplicates", label: "I verified potential matches in other files", description: "Authorize creating these as separate product lines rather than silently merging them.", checked: verified }] : []),
    ...(cbmDiscrepancies ? [{ id: "cbm", label: `I reviewed ${cbmDiscrepancies} CBM discrepancies`, description: "Authorize retaining the supplied Total CBM values.", checked: verifiedCbm }] : []),
  ];
  const saveBlockers = [...readinessChecks.filter(check => !check.checked).map(check => `${check.label}: ${check.description}`), ...confirmationChecks.filter(check => !check.checked).map(check => check.label)];
  const saveDisabled = finished || busy || saving || saveBlockers.length > 0;
  const saveReason = finished ? "This batch is complete." : saving ? "A save is already in progress." : busy ? "Wait for the current request to finish." : saveBlockers.join("\n") || "Save the reviewed trip groups.";
  function navigate(target: number) {
    if (busy || saving) return;
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
          <TripImportPreview files={files} preview={preview} outcomes={outcomes} disabled={locked || saving} onEdit={editCell} onGroup={editGroup} />
          <section aria-label="Column mapping" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h3 className="text-sm font-semibold text-[#0b2341]">Column mapping</h3><p className="mt-1 text-xs text-slate-500">Matching headers are selected automatically. Open a file below to adjust them.</p></div>
        {files.map(file => <SmartImportMapping key={file.id} file={file} owner={profile?.id} disabled={locked || saving || busy} onMap={(index, field) => mapping(file.id, index, field)} onApply={assignments => applyMapping(file.id, assignments)} onGroup={field => suggestGroups(file.id, field)} />)}

          </section>
          {preview && <TripFormNotice tone={preview.invalid || preview.setup_required ? "warning" : "success"} title={preview.setup_required ? "Database setup required" : "CSV checked"}>{preview.setup_message || `${preview.detected} rows checked / ${preview.valid} valid / ${preview.invalid} need correction / ${preview.duplicates} exact duplicates will be skipped.`}</TripFormNotice>}
          {preview && <ImportStoreProductsPreview rows={storePreviewRows} navigation={storeNavigation} locations={locations} />}
        </>}
        
        {phase === 2 && preview && <div className="space-y-6">
          {detailReadError && <TripFormNotice tone="warning" title="Saved trip details">{detailReadError}</TripFormNotice>}
          {unresolved && <TripFormNotice tone="warning" title="Complete trip grouping">Correct trip dates, choose a destination for each group, resolve source warehouses to existing records, and choose an origin for groups with several warehouses.</TripFormNotice>}
          <TripFormNotice tone="info" title="CSV loaded into your trip draft">{preview.detected} source rows loaded. Complete each group below. Trips and products are created only when you select Save trip.</TripFormNotice>
          {inheritedTarget?.mode === "dispatch" && <p className="text-sm text-slate-600">Selected dispatch: <strong>{inheritedTarget.value}</strong></p>}
          {accessToken && groups.map((group, index) => {
            const target = targets[group] ?? defaultTarget(), details = detailsForGroup(group), groupRows = validRows.filter(row => row.group === group);
            const sourceRows = rawRows.filter(row => row.group.trim() === group), plan = plans[group] ?? emptyCargoPlan(), lines = cargoLines(group);
            const warehouses = [...new Set(groupRows.map(row => row.values.source_warehouse).filter((code): code is string => Boolean(code?.trim())))];
            const stores = [...new Map(sourceRows.map(row => [destinationKey(row.values), row])).values()];
            const cargoReviewed = Boolean(plan.confirmed && plan.signature === cargoSignature(lines, plan.trucks) && !validateCargo(lines, plan.trucks, plan.placements));
            const sourceAttention = groupRows.filter(row => history[row.source_identity]?.status === "missing" || outcomes[row.source_identity]?.status === "failed" || row.potential_duplicate).length;
            const ids = { details: `csv-trip-details-${index}`, destination: `csv-group-${index}-destination`, warehouses: `csv-group-${index}-warehouses`, stores: `csv-group-${index}-stores`, cargo: `csv-group-${index}-cargo` };
            const checklist = [
              { id: ids.details, label: "Trip details", checked: Boolean(details.status) && !(details.loading_date && details.estimated_delivery_date && details.estimated_delivery_date < details.loading_date), description: "Review type, status, dates and remarks." },
              { id: ids.destination, label: "Destination", checked: target.mode === "new" || Boolean(target.value), description: "Dispatch and trip destination." },
              { id: ids.warehouses, label: "Warehouses", checked: warehouses.every(code => Boolean(target.warehouse_ids?.[code])) && (warehouses.length < 2 || Boolean(target.origin_warehouse_id)), description: "Match source codes and trip origin." },
              { id: ids.stores, label: "Stores", checked: !detailsDirty && !sourceRows.some(row => row.errors?.length) && stores.every(row => Boolean(locations[destinationKey(row.values)]?.verified)), description: "Review products and delivery locations." },
              { id: ids.cargo, label: "Trucks & cargo", checked: Boolean(cargoSaved[group]) || Boolean(plan.trucks.length && cargoReviewed), description: plan.trucks.length ? "Allocate every source line and confirm." : "Trucks and drivers can be assigned later." },
            ];
            return <article key={group} data-trip-group="" aria-label={`Trip group ${group}`} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-5">
              <header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="break-words text-base font-semibold text-[#0b2341]">{group}</h3><p className="mt-1 text-xs text-slate-500">Complete this trip group in order. The checklist is navigation, not an extra save requirement.</p></div><div className="flex flex-wrap gap-2"><StatChip label="Source lines" value={sourceRows.length} /><StatusChip label={locked ? "Source locked" : "Draft"} tone={locked ? "neutral" : "info"} /><StatusChip label={cargoSaved[group] ? "Cargo saved" : cargoReviewed ? "Cargo reviewed" : "Cargo needs review"} tone={cargoSaved[group] ? "success" : "warning"} />{sourceRows.some(row => row.errors?.length) && <StatusChip label="Invalid rows need attention" tone="danger" />}</div></header>
              <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
                <aside className="rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-3"><h4 className="text-xs font-semibold text-[#0b2341]">Group progress</h4><ReviewChecklist items={checklist} onNavigate={id => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })} /></aside>
                <div className="min-w-0 space-y-5">
                  <ImportTripDetailsCard id={ids.details} token={accessToken} group={group} details={details} tripNumber={tripNumberForGroup(group)} disabled={locked || saving || busy} existingTrip={target.mode === "trip"} onChange={patch => updateTripDetails(group, patch)} onApplyAll={() => applyTripDetailsToAll(group)} />
                  <SectionCard id={ids.destination} title="Dispatch & trip group" description="Choose where this group's source products will be saved."><ImportDispatchTarget group={group} target={target} existing={[...new Map([...existing, ...Object.values(detailRecords)].map(trip => [trip.id, trip])).values()]} disabled={locked || saving || busy} onChange={patch => updateTarget(group, patch)} onSearch={searchExisting} /></SectionCard>
                  <SectionCard id={ids.warehouses} title="Warehouses" description="Codes and names match exactly. Unknown labels never create warehouse records automatically.">
                    <div className="space-y-4">{warehouses.length > 1 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Several source warehouses: select the trip origin or split the trip group. Original line warehouses remain separate.</p>}
                      <div className="space-y-2"><p className="text-xs font-medium text-slate-600">Origin warehouse</p><SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" autoFocus={false} value={warehouseLabels[group + "origin"] ?? (target.origin_warehouse_id || details.origin_warehouse_id ? "Selected origin warehouse" : "")} disabled={locked || saving || busy} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + "origin"]: option.label })); updateTarget(group, { origin_warehouse_id: option.id }); }} onCommitBlur={() => {}} onCancel={() => {}} /></div>
                      {warehouses.map(code => { const matched = Boolean(target.warehouse_ids?.[code]), conflict = preview.warehouse_matches?.[code]?.status === "conflict";
                        return <div key={code} className="grid items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]"><div className="space-y-2"><strong className="block break-words text-xs text-slate-700">Source: {code}</strong><StatusChip label={matched ? "Matched" : conflict ? "Conflict" : "Needs selection"} tone={matched ? "success" : conflict ? "danger" : "warning"} /></div><div className="min-w-0"><SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" autoFocus={false} value={warehouseLabels[group + code] ?? preview.warehouse_matches?.[code]?.label ?? code} disabled={locked || saving || busy} onSelect={option => { setWarehouseLabels(current => ({ ...current, [group + code]: option.label })); updateTarget(group, { warehouse_ids: { ...target.warehouse_ids, [code]: option.id } }); }} onCommitBlur={() => {}} onCancel={() => {}} />{!matched && <p className="mt-2 text-xs text-amber-800">{conflict ? "Several warehouses match. Select the intended record." : "No confirmed match. Select an existing warehouse."}</p>}</div></div>;
                      })}
                      {!warehouses.length && <p className="text-xs text-slate-500">No source warehouse codes were supplied for this group.</p>}
                    </div>
                  </SectionCard>
                  <details className="rounded-xl border border-amber-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#0b2341]">Source history & recovery / {sourceAttention} needing review</summary><div className="mt-4">{sourceAttention ? <ImportSourceRecovery token={accessToken} rows={groupRows} history={history} outcomes={outcomes} resolutions={rowResolutions} disabled={saving || busy} onChange={updateRowResolution} /> : <p className="text-xs text-slate-500">No missing historical products, failed sources or potential matches require review in this group.</p>}</div></details>
                  <section id={ids.stores} onFocusCapture={() => { activeStoreGroup.current = group; }} onPointerDownCapture={() => { activeStoreGroup.current = group; }} className="min-w-0 space-y-3">
                    {detailsDirty && <TripFormNotice tone="warning" title="Store or product changes need checking">Apply changes to update the signed preview and cargo proposal before continuing. Original CSV values are preserved.</TripFormNotice>}
                    <ImportStoreCards navigation={navigationForGroup(group)} locationProgress={locationProgress} token={accessToken} rows={sourceRows} locations={locations} locationChecking={locationChecking} disabled={locked || saving || busy} identityDisabled={saving || busy} onLocations={next => { setLocations(next); setConfirmed(false); }} onEdit={editGroupDetails} onAdd={addDetailsProduct} onRemove={removeDetailsProduct} />
                    {detailsDirty && <button type="button" className={primaryButton} disabled={busy || saving || locked} onClick={() => void applyDetails()}>{busy && <Loader2 size={15} className="animate-spin" />}Apply store &amp; product changes</button>}
                  </section>
                  <SectionCard id={ids.cargo} title="Trucks, drivers & cargo" actions={<StatusChip label={cargoSaved[group] ? "Saved" : "Pending"} tone={cargoSaved[group] ? "success" : "warning"} />}>
                    <TripCargoPlanner token={accessToken} scheduleManaged={Boolean(details.loading_date && details.estimated_delivery_date)} onEditSchedule={locked || target.mode === "trip" ? undefined : () => { const card = document.getElementById(ids.details); card?.scrollIntoView({ behavior: "smooth", block: "start" }); card?.querySelector<HTMLInputElement>('input[type="date"]')?.focus({ preventScroll: true }); }}
                      existingTripId={target.mode === "trip" ? target.value : results.find(row => row.trip_id && preview.rows.some(source => source.group === group && source.source_identity === row.source_identity))?.trip_id}
                      lines={lines} plan={plan} onChange={next => {
                        setPlans(current => ({ ...current, [group]: next })); setConfirmed(false);
                        if (!locked && target.mode !== "trip" && next.schedule && (next.schedule.loading_date !== (details.loading_date ?? "") || next.schedule.estimated_delivery_date !== (details.estimated_delivery_date ?? ""))) updateTripDetails(group, { loading_date: next.schedule.loading_date || null, estimated_delivery_date: next.schedule.estimated_delivery_date || null });
                      }} disabled={saving || Boolean(cargoSaved[group])} />
                  </SectionCard>
                </div>
              </div>
            </article>;
          })}
        </div>}
        
        {phase === 3 && preview && <>
          <div><h3 className="text-lg font-semibold text-[#0b2341]">Review &amp; save</h3><p className="mt-1 text-sm text-slate-500">Review each group, resolve save blockers, then confirm the source decisions.</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
            ["Trips", groups.length], ["Stops", stopCounts], ["Product lines", validRows.filter(row => ownsSource(row)).length], ["Total CBM", displayCargoTotal(validRows.filter(row => ownsSource(row)).map(row => row.values.cbm || "0"))],
            ["Truck selections", groups.reduce((count, group) => count + (plans[group]?.trucks.length ?? 0), 0)], ["Unverified locations", destinations.filter(destination => !locations[destination.key]?.verified).length], ["Live duplicates", liveDuplicates], ["Missing historical products", missingSources],
          ].map(([label, value]) => <StatChip key={label} label={String(label)} value={value} />)}</div>
          <SectionCard id="import-save-readiness" title="Save readiness" description="Every outstanding item below blocks saving. Unverified addresses are reported separately."><ReviewChecklist items={readinessChecks} /></SectionCard>
          <ImportLocationNotices destinations={destinations} decisions={locations} checking={locationChecking} />
          {groups.map(group => {
            const target = targets[group] ?? defaultTarget(), plan = plans[group] ?? emptyCargoPlan();
            const rows = preview.rows.filter(row => row.group === group);
            const stores = new Set(rows.map(row => destinationKey(row.values))).size;
            const destination = target.mode === "new" ? "New dispatch and trip" : target.mode === "dispatch" ? `Existing dispatch: ${target.value}` : `Append to existing trip: ${tripNumberForGroup(group)}`;
            return <SectionCard key={group} title={group} description={destination} actions={<StatusChip label={cargoSaved[group] ? "Cargo saved" : plan.trucks.length ? plan.confirmed && !cargoProblems.some(problem => problem.startsWith(`${group}:`)) ? "Cargo confirmed" : "Cargo needs review" : "Assignment later"} tone={cargoSaved[group] || (plan.confirmed && !cargoProblems.some(problem => problem.startsWith(`${group}:`))) ? "success" : "info"} />}>
              <div className="space-y-4">
                {accessToken && <ImportTripDetailsCard token={accessToken} group={group} details={detailsForGroup(group)} tripNumber={tripNumberForGroup(group)} disabled readOnly existingTrip={target.mode === "trip"} onChange={() => {}} />}
                <div className="flex flex-wrap gap-2"><StatChip label="Stores" value={stores} /><StatChip label="Source lines" value={rows.length} /><StatChip label="CBM to import" value={displayCargoTotal(cargoLines(group).map(line => line.cbm))} /></div>
                <div className="grid gap-3 md:grid-cols-2">{plan.trucks.map(truck => {
                  const usage = cargoCapacity(truck.capacity, plan.placements.filter(placement => placement.truck_id === truck.id));
                  return <TruckCard key={truck.id} title={truck.label} description={`${truck.driverLabel || "Driver to be assigned"} / ${truck.companyLabel || "Company from truck"}`} assigned={usage.assigned} capacity={truck.capacity} usage={usage} />;
                })}</div>
                {!plan.trucks.length && <p className="text-xs text-slate-500">Trucks and drivers can be assigned later.</p>}
                <details className="rounded-xl border border-slate-200"><summary className="cursor-pointer rounded-xl p-3 text-xs font-semibold text-[#2678b9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]">Expand {rows.length} source product lines</summary><div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr>{["CSV row", "Store", "Product", "DR", "Qty", "CBM", "Status"].map(label => <th key={label} scope="col" className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.source_identity} className="border-t border-slate-100"><td className="p-3">{row.filename}:{row.line}</td><td className="p-3">{storeLocationLabel(row.values)}</td><td className="p-3">{row.values.customer_model || "Product"}</td><td className="p-3">{row.values.dr_number}</td><td className="p-3 tabular-nums">{row.values.quantity}</td><td className="p-3 tabular-nums">{row.values.cbm}</td><td className="p-3"><StatusChip label={row.errors.length ? "Invalid / excluded" : outcomes[row.source_identity]?.status || (row.duplicate ? "Duplicate / review history" : "Ready")} tone={row.errors.length ? "danger" : "info"} />{row.errors.length > 0 && <p className="mt-1 text-rose-700">{row.errors.join(" / ")}</p>}</td></tr>)}</tbody></table></div></details>
              </div>
            </SectionCard>;
          })}
          <ImportStoreProductsPreview rows={storePreviewRows} navigation={storeNavigation} locations={locations} />
          <SectionCard id="import-save-confirmations" title="Before you save" description="Confirm each applicable decision. These approvals are retained in the recovery draft.">
            {preview.invalid > 0 && <TripFormNotice tone="warning" title="Invalid rows are excluded">{preview.invalid} source rows need correction. Download failed rows to correct their values or mapping before preparing another preview.</TripFormNotice>}
            <ReviewChecklist items={confirmationChecks} disabled={saving} onToggle={(id, checked) => { if (id === "groups-reviewed") setConfirmed(checked); else if (id === "unmapped") setVerifiedUnmapped(checked); else if (id === "duplicates") setVerified(checked); else if (id === "cbm") setVerifiedCbm(checked); }} />
          </SectionCard>
          <TripImportPreview files={files} preview={preview} outcomes={outcomes} disabled onEdit={editCell} onGroup={editGroup} />
          {(started || results.length > 0) && <ImportResultsPanel trips={new Set(results.filter(row => row.trip_created).map(row => row.trip_id).filter(Boolean)).size} imported={imported} skipped={skipped} failed={failed} invalid={preview.invalid} cargoSaved={Object.values(cargoSaved).filter(Boolean).length} batchId={batchId} finished={finished} retryDisabled={saveDisabled} retryReason={saveReason} onRetry={() => void save()} onDownload={downloadFailures} />}
          {saving && <p role="status" className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-[#0b2341]"><Loader2 size={16} className="animate-spin" />Processed {progress} source rows. Keep this window open.</p>}
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
            {phase === 2 && <button type="button" className={primaryButton} disabled={busy || saving || unresolved || detailsDirty || !validRows.length} onClick={() => navigate(3)}>Review trip <ChevronRight size={14} /></button>}
            {phase === 3 && <span className={`rounded-full ${focusRing}`} title={saveReason} tabIndex={saveDisabled ? 0 : undefined}><button type="button" className={primaryButton} title={saveReason} aria-describedby="import-save-readiness import-save-confirmations" aria-label={locked ? "Retry unfinished save" : "Save trip"} disabled={saveDisabled} onClick={() => void save()}>{saving && <Loader2 size={16} className="animate-spin" />}{finished ? "Trip saved" : saving ? "Saving trip..." : locked ? "Retry unfinished save" : "Save trip"}</button></span>}
          </div>
        </div>
      </footer>
    </section>
  </div>;
}
