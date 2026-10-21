import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import TripCargoPlanner from "./TripCargoPlanner";
import ImportDestinationReview, { destinationKey, type LocationDecision } from "./ImportDestinationReview";
import { cargoSignature, emptyCargoPlan, validateCargo, type CargoPlan, type CargoLine } from "../../services/cargo-planning";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { readImportFile, importFields, importPayload, type ImportFile, type ImportField } from "./tripImportFiles";
import { previewImport, commitImport, confirmImportCargo, fetchImportBatches, reopenImportBatch, saveImportBatchDraft, type ImportRecoveryDraft, type ImportBatchSummary, type ImportPreview, type ImportTarget, type ImportOutcome } from "../../services/trip-import.service";
import { fetchTrips, type TripRecord } from "../../services/trip.service";
import TripFormNotice from "./TripFormNotice";

const control = "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100";
const button = "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-[#0b2341] hover:bg-slate-50 disabled:opacity-50";


export default function BulkTripImport({ onClose, onImported, initialTarget }: { onClose: () => void; onImported: () => void; initialTarget?: ImportTarget }) {
  const [inheritedTarget,setInheritedTarget]=useState(initialTarget);
  const defaultTarget = (): ImportTarget => inheritedTarget ? {...inheritedTarget} : ({mode:"new",value:"",allow_create:true});
  const [plans,setPlans] = useState<Record<string,CargoPlan>>({});
  const [locations,setLocations] = useState<Record<string,LocationDecision>>({});
  const [cargoSaved,setCargoSaved] = useState<Record<string,boolean>>({});
  const [started,setStarted] = useState(false);
  const savingRef = useRef(false);
  const { accessToken } = useAuth();
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchId,setBatchId] = useState(() => crypto.randomUUID());
  const batchRevision=useRef(0),draftWrites=useRef<Promise<unknown>>(Promise.resolve());
  const [draftStatus,setDraftStatus]=useState("");
  const [closeBlocked,setCloseBlocked]=useState(false);
  const [batches,setBatches]=useState<ImportBatchSummary[]>([]);
  const [targets, setTargets] = useState<Record<string, ImportTarget>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifiedCbm, setVerifiedCbm] = useState(false);
  const [verifiedUnmapped, setVerifiedUnmapped] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, ImportOutcome>>({});
  const [progress, setProgress] = useState(0);
  const [page, setPage] = useState(1);
  const [existing, setExisting] = useState<TripRecord[]>([]);
  const [query, setQuery] = useState("");
  const [existingError, setExistingError] = useState("");
  const [warehouseLabels,setWarehouseLabels]=useState<Record<string,string>>({});
  const draft=useMemo<ImportRecoveryDraft>(()=>({files,preview,targets,plans,locations,initialTarget:inheritedTarget,confirmed,verified,verifiedCbm,verifiedUnmapped,started}),[files,preview,targets,plans,locations,inheritedTarget,confirmed,verified,verifiedCbm,verifiedUnmapped,started]);
  async function persistDraft(snapshot:ImportRecoveryDraft=draft){
    if(!accessToken||!snapshot.files.length)return;
    const write=draftWrites.current.catch(()=>undefined).then(async()=>{setDraftStatus("Saving draft...");const saved=await saveImportBatchDraft(accessToken,batchId,batchRevision.current,snapshot);batchRevision.current=saved.revision;setDraftStatus("Draft saved. Reopen it from Saved imports to continue.");});
    draftWrites.current=write;
    try{await write;}catch(cause){setDraftStatus(cause instanceof Error?cause.message:"Draft not saved. Keep this window open.");throw cause;}
  }
  useEffect(()=>{
    if(!files.length||saving||busy||preview?.setup_required)return;
    const timer=setTimeout(()=>{void persistDraft(draft).catch(()=>{});},1200);
    return()=>clearTimeout(timer);
    // The snapshot changes only when editable draft contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[draft,saving,busy,batchId,accessToken]);
  async function savedImports(){if(!accessToken)return;setBusy(true);setError("");try{setBatches(await fetchImportBatches(accessToken));}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load saved imports.");}finally{setBusy(false);}}
  async function closeImport(){
    if(saving||busy)return;setBusy(true);setCloseBlocked(false);
    try{if(files.length&&!preview?.setup_required)await persistDraft();onClose();}
    catch(cause){setCloseBlocked(true);setError(`${cause instanceof Error?cause.message:"Draft not saved."} Keep this window open to retry, or explicitly close without saving the latest changes.`);}
    finally{setBusy(false);}
  }
  async function resume(id:string){
    if(!accessToken)return;setBusy(true);setError("");
    try{
      if(files.length)await persistDraft();else await draftWrites.current.catch(()=>undefined);
      const recovered=await reopenImportBatch(accessToken,id),saved=recovered.draft;
      if(!Array.isArray(saved.files)||!saved.files.length)throw Error("This older batch has no saved source preview. Its imported records are preserved.");
      batchRevision.current=recovered.revision;setBatchId(id);setFiles(saved.files);setPreview(saved.preview);setTargets(saved.targets??{});setPlans(saved.plans??{});setLocations(saved.locations??{});setInheritedTarget(saved.initialTarget);setConfirmed(false);setVerified(Boolean(saved.verified));setVerifiedCbm(Boolean(saved.verifiedCbm));setVerifiedUnmapped(Boolean(saved.verifiedUnmapped));setOutcomes(Object.fromEntries(recovered.outcomes.map(row=>[row.source_identity,row])));setCargoSaved(recovered.cargo_saved);setStarted(Boolean(saved.started)||recovered.outcomes.length>0);setPage(1);setWarehouseLabels({});setDraftStatus(`Reopened ${recovered.state}. ${recovered.last_error??"Existing trip and product IDs are preserved."}`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to reopen this batch.");}finally{setBusy(false);}
  }
  const groups = [...new Set(files.flatMap(file => file.rows.map(row => row.group.trim())).filter(Boolean))];
  const rawRows = useMemo(() => files.flatMap(file => importPayload([file])[0].rows.map(row => ({ ...row, filename: file.name, file_id:file.id, errors: [] as string[] }))), [files]);
  const rows = preview?.rows ?? rawRows;
  const pages = Math.max(1, Math.ceil(rows.length / 50)), currentPage = Math.min(page, pages), offset = (currentPage - 1) * 50;
  const results = Object.values(outcomes), imported = results.filter(row => row.status === "imported").length;
  const skipped = results.filter(row => row.status === "skipped").length, failed = results.filter(row => row.status === "failed").length;
  const locked = started || results.some(row => row.status !== "failed");
  const validRows = preview?.rows.filter(row => !row.errors.length) ?? [];
  const stopCounts = new Set(validRows.filter(row => !row.duplicate).map(row => JSON.stringify([row.group, row.values.customer_name, row.values.ship_to, row.values.province, row.values.city]))).size;
  const destinations = [...new Map(validRows.map(row=>[destinationKey(row.values),{key:destinationKey(row.values),customer:row.values.customer_name||'',shipTo:row.values.ship_to||'',province:row.values.province||'',city:row.values.city||''}])).values()];
  const cargoLines = (group:string):CargoLine[] => validRows.filter(row=>row.group===group&&!row.duplicate&&!(outcomes[row.source_identity]?.status==="skipped"&&outcomes[row.source_identity]?.original_batch_id!==batchId)).map(row=>({key:row.source_identity,dr:row.values.dr_number||'',stop:row.values.ship_to||'',label:row.values.customer_model||row.values.dr_number||'Product',quantity:row.values.quantity||'',cbm:row.values.cbm||''}));
  function editCell(fileId:string,line:number,key:ImportField,value:string){
    setFiles(current=>current.map(file=>{if(file.id!==fileId)return file;const index=file.mapping[key]>=0?file.mapping[key]:file.headers.length;return {...file,headers:file.mapping[key]>=0?file.headers:[...file.headers,importFields.find(([field])=>field===key)![1]],mapping:{...file.mapping,[key]:index},rows:file.rows.map(row=>{if(row.line!==line)return row;const cells=[...row.cells];cells[index]=value;return {...row,cells};})};}));changed();
  }
  function changed() { setPreview(null); setConfirmed(false); setVerified(false); setVerifiedCbm(false); setVerifiedUnmapped(false); setError(""); }
  async function load(selected: FileList) {
    setBusy(true); setError("");
    try { const loaded = []; for (const file of Array.from(selected)) loaded.push(...await readImportFile(file)); setFiles(loaded); changed(); setOutcomes({}); setPage(1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read the files."); }
    finally { setBusy(false); }
  }
  async function prepare() {
    if (!accessToken) return;
    setBusy(true); setError("");
    try { setPreview(await previewImport(accessToken, importPayload(files))); setPage(1); }
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
    if (!preview || !accessToken || !confirmed || preview.setup_required || savingRef.current) return;
    for(const group of groups){const plan=plans[group],lines=cargoLines(group);if(plan?.trucks.length&&lines.length&&!cargoSaved[group]){const problem=validateCargo(lines,plan.trucks,plan.placements);if(!plan.confirmed||plan.signature!==cargoSignature(lines,plan.trucks)||problem){setError(problem||"Review and confirm the current cargo proposal for every group.");return;}}}
    savingRef.current=true;setStarted(true);
    setSaving(true); setError(""); setProgress(0);
    let processed = 0;
    try {
      await persistDraft({...draft,started:true});
      const failures:string[]=[];
      for (const group of groups) {
        let groupFailed=false;
        const latestOutcomes={...outcomes};
        const target = targets[group] ?? defaultTarget();
        const pending = validRows.filter(row => row.group === group && !["imported", "skipped"].includes(outcomes[row.source_identity]?.status ?? ""));
        for (let index = 0; index < pending.length; index += 100) {
          const chunk = pending.slice(index, index + 100);
          const result = await commitImport(accessToken, batchId, group, target, chunk, verified, verifiedCbm, verifiedUnmapped,Object.fromEntries(chunk.flatMap(row=>locations[destinationKey(row.values)]?[[row.source_identity,locations[destinationKey(row.values)]]]:[])));
          if(result.rows.some(row=>row.status==="failed"))groupFailed=true;
          Object.assign(latestOutcomes,Object.fromEntries(result.rows.map(row=>[row.source_identity,row])));
          setOutcomes(current => ({ ...current, ...Object.fromEntries(result.rows.map(row => [row.source_identity, row])) }));
          processed += chunk.length; setProgress(processed);
        }
        if (groupFailed) { failures.push(`${group}: resolve failed product rows before confirming cargo.`); continue; }
        const newlyOwned=validRows.filter(row=>row.group===group&&!row.duplicate&&!(latestOutcomes[row.source_identity]?.status==="skipped"&&latestOutcomes[row.source_identity]?.original_batch_id!==batchId));
        if(!newlyOwned.length)continue;
        if(plans[group]?.placements.some(placement=>!newlyOwned.some(row=>row.source_identity===placement.line_key))){failures.push(`${group}: duplicate cargo was skipped. Recalculate and confirm the remaining cargo before retrying.`);continue;}
        if (plans[group]?.trucks.length&&!cargoSaved[group]) {
          await confirmImportCargo(accessToken, batchId, group, plans[group]);
          setCargoSaved(current => ({ ...current, [group]: true }));
        }
      }
      if (failures.length) setError(failures.join(" "));
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Import interrupted."} Retry this batch; completed rows are protected from duplicates.`);
    } finally { savingRef.current=false; setSaving(false); onImported(); }
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
  const unresolved = groups.some(group => { const target = targets[group] ?? defaultTarget(); return target.mode !== "new" && !target.value || new Set(validRows.filter(row=>row.group===group).map(row=>row.values.source_warehouse).filter(Boolean)).size>1&&!target.origin_warehouse_id; });
  return <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-900/40 p-2 sm:p-5">
    <section role="dialog" aria-modal="true" aria-labelledby="bulk-trip-title" className="flex max-h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-4 sm:px-6">
        <div><h2 id="bulk-trip-title" className="text-lg font-semibold text-[#0b2341]">Import trip requests</h2><p className="mt-1 text-xs text-slate-500">Map every source row, review trip groups, then import into the existing Trips table.</p></div>
        <button type="button" className={button} disabled={saving || busy} aria-label="Close import" onClick={()=>void closeImport()}><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-6">
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-sm font-semibold">Saved imports</h3><button type="button" className={button} disabled={busy||saving} onClick={()=>void savedImports()}>Refresh saved batches</button>{files.length>0&&<button type="button" className={button} disabled={busy||saving} onClick={()=>void persistDraft().catch(()=>{})}>Save draft</button>}</div>{draftStatus&&<p role="status" className="text-xs text-slate-600">{draftStatus}</p>}{batches.map(batch=><div key={batch.id} className="flex items-center gap-2 rounded border border-slate-100 p-2 text-xs"><div className="min-w-0 flex-1"><strong>{batch.state}</strong><p className="truncate">{batch.id} / {batch.imported} products saved / {batch.awaiting_allocation} cargo plans pending</p>{batch.last_error&&<p className="text-amber-800">{batch.last_error}</p>}</div><button type="button" className={button} disabled={busy||saving} onClick={()=>void resume(batch.id)}>Reopen</button></div>)}</section>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div><p className="text-sm font-semibold text-[#0b2341]">CSV and XLSX files</p><p className="mt-1 text-xs text-slate-500">Select multiple files. Every worksheet with data is included. PH TRUCK NAME is preserved. Select verified trucks in the cargo panel; names alone never identify a physical vehicle.</p></div>
          <label className={`${button} ${locked || busy || saving ? "pointer-events-none opacity-50" : "cursor-pointer"}`}><Upload size={16} />Choose files<input type="file" multiple accept=".csv,.xlsx" disabled={locked || busy || saving} className="sr-only" onChange={event => { if (event.target.files?.length) void load(event.target.files); event.target.value = ""; }} /></label>
        </div>
        {inheritedTarget?.mode==="dispatch" && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Selected dispatch: <strong>{inheritedTarget.value}</strong>. Each group creates its trip under this dispatch unless you explicitly change its destination below.</p>}
        {error && <TripFormNotice tone="error" title="Import needs attention">{error}</TripFormNotice>}
        {preview?.setup_required && <TripFormNotice tone="warning" title="Preview ready · database setup required">{preview.setup_message}<p className="mt-1">Duplicate checks have not run. Import stays disabled until setup is complete; validate again after the migration is applied.</p></TripFormNotice>}
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" />Reading and checking all source rows…</p>}
        {files.map(file => <details key={file.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-[#0b2341]"><FileSpreadsheet className="mr-2 inline h-4 w-4" />{file.name} · {file.rows.length} rows · Column mapping</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{importFields.map(([key, label]) => <label key={key} className="text-xs text-slate-600">{label}<select aria-label={`${file.name}: ${label}`} disabled={locked || saving} value={file.mapping[key]} onChange={event => mapping(file.id, key, Number(event.target.value))} className={`${control} mt-1 w-full`}><option value={-1}>Missing / null</option>{file.headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div>
          <p className="mt-3 text-xs text-slate-500">Missing optional fields: {importFields.filter(([key]) => file.mapping[key] < 0).map(([, label]) => label).join(", ") || "None"}</p>
          <p className="mt-1 text-xs text-slate-500">Unmapped columns: {file.headers.filter((_, index) => !Object.values(file.mapping).includes(index)).join(", ") || "None"}</p>
          <label className="mt-3 block text-xs text-slate-600">Set every row in this file to a trip group<input disabled={locked || saving} className={`${control} ml-2`} placeholder={file.name} onBlur={event => { const group = event.target.value.trim(); if (group) { setFiles(current => current.map(item => item.id === file.id ? { ...item, rows: item.rows.map(row => ({ ...row, group })) } : item)); changed(); } }} /></label>
        </details>)}
        {files.length > 0 && <>
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold text-[#0b2341]">Trip setup / dispatch and grouping</h3>
            <p className="text-xs text-slate-500">The source files do not identify TMS trips. Review the proposed groups or edit each row’s group below. Stops group by customer, destination and geography; every product keeps a separate identity.</p>
            <div className="flex flex-wrap gap-2"><input className={control} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an existing trip or dispatch" aria-label="Search existing trips" /><button type="button" disabled={saving} className={button} onClick={() => void searchExisting()}>Find trips</button></div>
            {existingError && <p role="alert" className="text-xs text-red-600">{existingError}</p>}
            {groups.map(group => { const target = targets[group] ?? defaultTarget(); return <div key={group} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
              <span className="min-w-48 flex-1 text-xs font-medium">{group} · {rawRows.filter(row => row.group === group).length} lines</span>
              <select aria-label={`Destination for ${group}`} disabled={locked || saving} value={target.mode} onChange={event => updateTarget(group, { mode: event.target.value as ImportTarget["mode"], value: "" })} className={control}><option value="new">New dispatch + new trip</option><option value="dispatch">New trip in existing dispatch</option><option value="trip">Append new stops to existing trip</option></select>
              {target.mode !== "new" && <select aria-label={`Existing ${target.mode} for ${group}`} className={control} disabled={locked || saving} value={target.value} onChange={event => updateTarget(group, { value: event.target.value })}><option value="">Choose a search result</option>{target.value && !existing.some(trip=>String(target.mode==="trip"?trip.id:trip.dispatch_number)===target.value) && <option value={target.value}>{target.mode==="dispatch"?"Selected dispatch: ":"Selected trip: "}{target.value}</option>}{(target.mode === "trip" ? existing : existing.filter((row, index, all) => all.findIndex(item => item.dispatch_number === row.dispatch_number) === index)).map(trip => <option key={String(trip.id)} value={String(target.mode === "trip" ? trip.id : trip.dispatch_number)}>{String(trip.dispatch_number)} {target.mode === "trip" ? ` / ${trip.trip_reference ?? trip.trip_number ?? trip.id}` : ""}</option>)}</select>}
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" disabled={locked || saving} checked={target.allow_create} onChange={event => updateTarget(group, { allow_create: event.target.checked })} />Create missing masters with sufficient identity</label>
            </div>; })}
          </section>
          {accessToken && preview && groups.map(group=><details key={group} className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Warehouse identity / {group}</summary>{new Set(validRows.filter(row=>row.group===group).map(row=>row.values.source_warehouse).filter(Boolean)).size>1&&<div className="mt-3"><p className="text-xs text-amber-800">This group contains several source warehouses. Choose the trip origin or split the trip group; original line warehouses remain separate.</p><SearchableRelationshipEditor token={accessToken} kind="warehouses" autoFocus={false} value={warehouseLabels[group+"origin"]??""} disabled={locked||saving} onSelect={option=>{setWarehouseLabels(current=>({...current,[group+"origin"]:option.label}));updateTarget(group,{origin_warehouse_id:option.id});}} onCommitBlur={()=>{}} onCancel={()=>{}} /></div>}<p className="mt-2 text-xs text-slate-500">Codes match existing warehouses. If a source value is a name rather than a code, select its verified warehouse here. Unknown code-only records keep their address and coordinates blank.</p>{[...new Set(validRows.filter(row=>row.group===group).map(row=>row.values.source_warehouse).filter((value):value is string=>Boolean(value)))].map(code=><div key={code} className="mt-2 grid gap-2 sm:grid-cols-2"><span className="text-xs">Source warehouse: {code}</span><SearchableRelationshipEditor token={accessToken} kind="warehouses" autoFocus={false} value={warehouseLabels[group+code]??code} disabled={locked||saving} onSelect={option=>{setWarehouseLabels(current=>({...current,[group+code]:option.label}));const target=targets[group]??defaultTarget();updateTarget(group,{warehouse_ids:{...target.warehouse_ids,[code]:option.id}});}} onCommitBlur={()=>{}} onCancel={()=>{}} /></div>)}</details>)}
          {accessToken && preview && <ImportDestinationReview token={accessToken} destinations={destinations} decisions={locations} onChange={next=>{setLocations(next);setConfirmed(false);}} disabled={locked||saving} />}
          {accessToken && preview && groups.map(group=><details key={group} className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Truck and cargo proposal / {group} {cargoSaved[group]?" / Saved":""}</summary><div className="mt-3"><TripCargoPlanner token={accessToken} existingTripId={(targets[group]??defaultTarget()).mode==="trip"?(targets[group]??defaultTarget()).value:results.find(row=>row.trip_id&&preview.rows.some(source=>source.group===group&&source.source_identity===row.source_identity))?.trip_id} lines={cargoLines(group)} plan={plans[group]??emptyCargoPlan()} onChange={plan=>{setPlans(current=>({...current,[group]:plan}));setConfirmed(false);}} disabled={saving||Boolean(cargoSaved[group])} /></div></details>)}
          <details open className="overflow-hidden rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer border-b border-slate-100 p-3 text-sm font-semibold">Imported data preview</summary><div className="flex flex-wrap items-center justify-between gap-2 p-3"><h3 className="text-sm font-semibold">All source rows · {rows.length}</h3><span className="text-xs text-slate-500">{offset + 1}–{Math.min(offset + 50, rows.length)} of {rows.length}</span></div>
            <div role="region" aria-label="Import row preview" tabIndex={0} className="max-h-[420px] overflow-auto"><table className="w-max min-w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-[#0b2341]"><tr>{["File / row", "Trip group", "Validation / result", ...importFields.map(([, label]) => label)].map(label => <th key={label} className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 font-medium">{label}</th>)}</tr></thead>
              <tbody>{rows.slice(offset, offset + 50).map((row, index) => {
                const checked = preview?.rows[offset + index], outcome = checked ? outcomes[checked.source_identity] : undefined;
                return <tr key={`${row.filename}:${row.line}:${offset+index}`} className={`border-b border-slate-100 ${row.errors.length || outcome?.status === "failed" ? "bg-rose-50" : checked?.warnings.length ? "bg-amber-50" : "even:bg-slate-50/50"}`}><td className="max-w-56 px-3 py-2" title={row.filename}><span className="block truncate">{row.filename} / {row.line}</span>{row.original_values && <details className="mt-1"><summary className="cursor-pointer text-blue-700">Original source values</summary><dl className="mt-2 max-h-48 overflow-auto">{Object.entries(row.original_values).map(([header,value])=><div key={header} className="mb-1"><dt className="font-medium">{header}</dt><dd className="break-words text-slate-500">{value || "(blank)"}</dd></div>)}</dl></details>}</td>
                  <td className="px-2 py-1"><input aria-label={`Trip group row ${offset + index + 1}`} className={`${control} w-48`} defaultValue={row.group} key={`${row.filename}:${row.line}:${row.group}`} disabled={locked || saving} onBlur={event => { const group = event.target.value.trim(); if (group !== row.group) { const fileIndex = files.findIndex(file => file.id === rawRows[offset+index].file_id); setFiles(current => current.map((file, i) => i === fileIndex ? { ...file, rows: file.rows.map(item => item.line === row.line ? { ...item, group } : item) } : file)); changed(); } }} /></td>
                  <td className={`max-w-72 whitespace-normal px-3 py-2 ${row.errors.length || outcome?.status === "failed" ? "text-red-700" : checked?.warnings.length ? "text-amber-700" : "text-slate-600"}`}>{outcome?.error ?? outcome?.status ?? (row.errors.length ? row.errors.join(" ") : checked?.duplicate ? "Duplicate: will skip" : checked?.potential_duplicate ? "Potential match: review" : checked?.warnings.length ? checked.warnings.join(" ") : checked ? "Valid" : "Not validated")}</td>
                  {importFields.map(([key]) => <td key={key} className="max-w-64 border-r border-slate-100 px-2 py-1" title={String(row.values[key]??'')}><input aria-label={`${key} source row ${offset+index+1}`} className="w-36 rounded border border-transparent bg-transparent p-1 text-xs focus:border-blue-300" disabled={locked||saving} defaultValue={row.values[key]??''} key={`${row.filename}:${row.line}:${key}:${row.values[key]??''}`} onBlur={event=>{if(event.target.value!==(row.values[key]??''))editCell(rawRows[offset+index].file_id,row.line,key,event.target.value);}} /></td>)}</tr>;
              })}</tbody></table></div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 p-2"><button type="button" className={button} disabled={currentPage === 1} aria-label="Previous import preview page" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button><span className="text-xs">Page {currentPage} / {pages}</span><button type="button" className={button} disabled={currentPage === pages} aria-label="Next import preview page" onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button></div>
          </details>
          {preview && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold">Review and save</h3><p className="text-sm font-medium">{preview.detected} detected · {preview.valid} valid · {preview.invalid} invalid · {preview.duplicates} duplicates · {preview.potential_duplicates} potential matches</p>
            <p className="text-xs text-slate-600">Estimated new records before duplicates: {groups.filter(group => (targets[group]??defaultTarget()).mode === "new").length} dispatches, {groups.filter(group => (targets[group]??defaultTarget()).mode !== "trip").length} trips, {stopCounts} stops, {validRows.filter(row => !row.duplicate).length} product lines. {Object.values(plans).reduce((count,plan)=>count+plan.trucks.length,0)} truck selections; {destinations.filter(destination=>!locations[destination.key]?.verified).length} locations remain unverified.</p>
            {preview.invalid > 0 && <TripFormNotice tone="warning" title="Some source rows need correction">Only valid rows will be imported. Download the failed rows, correct their values or mapping, and prepare a new preview.</TripFormNotice>}
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={saving || unresolved} onChange={event => setConfirmed(event.target.checked)} />I reviewed the row groups and destination choices. Import all valid rows and skip exact duplicates.</label>
            {preview.rows.some(row=>Object.keys(row.unmapped??{}).length>0) && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={verifiedUnmapped} disabled={saving} onChange={event=>setVerifiedUnmapped(event.target.checked)} />I reviewed the unmapped columns. Keep their data in import provenance; do not assign them to an unrelated TMS field.</label>}
            {preview.potential_duplicates > 0 && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={verified} disabled={saving} onChange={event => setVerified(event.target.checked)} />I verified potential matches in other files and authorize creating these as separate product lines.</label>}
            {preview.rows.some(row => row.warnings.some(warning=>warning.includes("Total CBM differs"))) && <label className="flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" checked={verifiedCbm} disabled={saving} onChange={event => setVerifiedCbm(event.target.checked)} />I reviewed {preview.rows.filter(row => row.warnings.some(warning=>warning.includes("Total CBM differs"))).length} CBM discrepancies and authorize keeping the supplied Total CBM values.</label>}
          </section>}
        </>}
        {results.length > 0 && <TripFormNotice tone={failed || error ? "warning" : "success"} title={failed || error ? "Import partially completed" : "Import results"}>
          <p>{new Set(results.filter(row=>row.trip_created).map(row=>row.trip_id).filter(Boolean)).size} trips created / {imported} products imported · 0 updated · {skipped} duplicates skipped · {failed} failed · {preview?.invalid ?? 0} invalid rows excluded.</p><p>{Object.values(cargoSaved).filter(Boolean).length} cargo plans saved. Any imported cargo without a confirmed plan remains unassigned; retry this same batch to finish.</p><p className="break-all">Batch: {batchId}</p><p>Retry this batch for failures. Existing operational records were not overwritten.</p>
        </TripFormNotice>}
        {saving && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Processed {progress} source rows. Keep this window open.</p>}
      </div>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 bg-white p-4 sm:px-6"><div className="flex gap-2"><button type="button" className={button} disabled={saving || busy} onClick={()=>void closeImport()}>{imported ? "Done" : "Back to Add trip"}</button>{closeBlocked&&<button type="button" disabled={saving||busy} className={`${button} text-rose-700`} onClick={onClose}>Close without saving latest changes</button>}</div><div className="flex flex-wrap gap-2">
        {preview && (preview.invalid > 0 || failed > 0) && <button type="button" className={button} onClick={downloadFailures}><Download size={16} />Download failed rows</button>}
        {!locked && <button type="button" className={button} disabled={busy || saving || !files.length} onClick={() => void prepare()}>Validate and preview all rows</button>}
        <button type="button" className={`${button} border-transparent bg-[#ffd43b] hover:bg-[#f2c200]`} disabled={busy || saving || Boolean(preview?.rows.some(row=>Object.keys(row.unmapped??{}).length>0) && !verifiedUnmapped) || preview?.setup_required || !confirmed || unresolved || !validRows.length || Boolean(preview?.potential_duplicates && !verified) || Boolean(preview?.rows.some(row => row.warnings.some(warning=>warning.includes("Total CBM differs"))) && !verifiedCbm)} onClick={() => void save()}>{saving && <Loader2 size={16} className="animate-spin" />}{failed || error && locked ? "Retry incomplete rows" : "Import all valid rows"}</button>
      </div></footer>
    </section>
  </div>;
}
