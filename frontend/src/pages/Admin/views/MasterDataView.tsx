import { TableSkeleton } from "../../../components/admin/DashboardPrimitives";
import { useManagementTableColumns } from "../../../components/admin/useManagementTableColumns";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, RefreshCw, Image, Images, LoaderCircle } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { tableUi } from "../../../components/admin/dashboardStyles";
import { apiGetCached, invalidateApiCache, type ApiResponse } from "../../../services/api.service";
import { fetchMasterData, getCachedMasterData, saveMasterData, searchWarehouseLocations, type LocationSearchResult, type MasterDataKey, type MasterDataRow } from "../../../services/master-data.service";
import DatabaseExplorerView from "./DatabaseExplorerView";
import TruckImageManager from "../../../components/admin/TruckImageManager";
import ProductPhotoManager from "../../../components/admin/ProductPhotoManager";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import { useDeferredRealtimeRefresh } from "../../../components/admin/useDeferredRealtimeRefresh";

type Field = { key: string; label: string; kind?: "textarea" | "number" | "boolean" | "relation" | "select"; required?: boolean; source?: string; options?: string[] };
type ActiveCell = { rowId: string; field: string; value: string };
const resources: Array<{ key: MasterDataKey; label: string; fields: Field[] }> = [
  { key: "warehouses", label: "Warehouses", fields: [{ key: "code", label: "Code", required: true }, { key: "name", label: "Name", required: true }, { key: "address", label: "Address" }, { key: "province", label: "Province" }, { key: "city", label: "City" }, { key: "latitude", label: "Latitude", kind: "number" }, { key: "longitude", label: "Longitude", kind: "number" }, { key: "warehouse_type", label: "Type" }, { key: "status", label: "Status" }, { key: "region", label: "Region", kind: "select", options: ["LUZON", "VISAYAS", "MINDANAO"] }, { key: "notes", label: "Notes", kind: "textarea" }] },
  { key: "trucks", label: "Trucks", fields: [{ key: "plate_number", label: "Plate number", required: true }, { key: "trucking_company_id", label: "Trucking company", kind: "relation", source: "trucking-companies" }, { key: "truck_type", label: "Truck type" }, { key: "capacity_cbm", label: "Capacity (CBM)", kind: "number" }, { key: "status", label: "Status" }, { key: "notes", label: "Notes", kind: "textarea" }] },
  { key: "stores", label: "Stores", fields: [{ key: "customer_id", label: "Customer", kind: "relation", source: "customers", required: true }, { key: "name", label: "Name", required: true }, { key: "code", label: "Code" }, { key: "address", label: "Address" }, { key: "province", label: "Province" }, { key: "city", label: "City" }, { key: "postal_code", label: "Postal code" }, { key: "latitude", label: "Latitude", kind: "number" }, { key: "longitude", label: "Longitude", kind: "number" }, { key: "status", label: "Status" }, { key: "region", label: "Region" }, { key: "notes", label: "Notes", kind: "textarea" }] },
  { key: "store-contacts", label: "Store contacts", fields: [{ key: "store_id", label: "Store", kind: "relation", source: "stores", required: true }, { key: "name", label: "Name", required: true }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "position", label: "Position" }, { key: "is_primary", label: "Primary contact", kind: "boolean" }, { key: "notes", label: "Notes", kind: "textarea" }] },
  { key: "products", label: "Products", fields: [{ key: "sku", label: "SKU" }, { key: "model_code", label: "Model code" }, { key: "name", label: "Name", required: true }, { key: "category", label: "Category" }, { key: "description", label: "Description", kind: "textarea" }, { key: "unit_cbm", label: "Unit CBM", kind: "number" }, { key: "status", label: "Status", required: true }, { key: "notes", label: "Notes", kind: "textarea" }] },
];
const cell = (value: unknown) => value == null || value === "" ? "—" : typeof value === "object" ? "Related record" : String(value);

function LocationSearch({ accessToken, onSelect }: { accessToken: string | null; onSelect: (location: LocationSearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (!accessToken || query.trim().length < 3) return;
    setSearching(true);
    setSearched(false);
    setError("");
    try {
      setResults(await searchWarehouseLocations(accessToken, query));
      setSearched(true);
    } catch (cause) {
      setResults([]);
      setError(cause instanceof Error ? cause.message : "Unable to search map locations.");
    } finally {
      setSearching(false);
    }
  };

  return <div className="mt-4 space-y-2">
    <label htmlFor="record-location-search" className="block text-xs font-medium text-slate-600">Search location on map</label>
    <div className="flex gap-2">
      <input id="record-location-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setSearched(false); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Search an address or place" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
      <button type="button" onClick={() => void search()} disabled={searching || query.trim().length < 3} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#0b2341] px-4 text-sm font-medium text-white disabled:opacity-50"><Search className="h-4 w-4" />{searching ? "Searching…" : "Search"}</button>
    </div>
    <p className="text-[11px] text-slate-500">Choose a result to fill the address and exact coordinates. Map data © OpenStreetMap contributors.</p>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {results.length > 0 && <ul aria-label="Map search results" className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">{results.map((location, index) => <li key={`${location.latitude}:${location.longitude}:${index}`}><button type="button" onClick={() => onSelect(location)} className="w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-0 hover:bg-slate-50">{location.display_name}<span className="mt-1 block text-[10px] text-slate-400">{location.latitude}, {location.longitude}</span></button></li>)}</ul>}
    {searched && results.length === 0 && <p className="text-xs text-slate-500">No map locations found. Try a nearby address or place name.</p>}
  </div>;
}

export default function MasterDataView() {
  const { accessToken, profile } = useAuth();
  const initialCache=accessToken?getCachedMasterData(accessToken,"warehouses"):null;
  const [section, setSection] = useState<MasterDataKey | "pictures" | "explorer">("warehouses");
  const [loadedRows, setRows] = useState<MasterDataRow[]>(initialCache?.rows??[]);
  const [rowScope,setRowScope]=useState(initialCache?`${accessToken}:warehouses`:"");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialCache?.pagination.totalPages??1);
  const [totalRows, setTotalRows] = useState(initialCache?.pagination.total??0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<MasterDataRow | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [relations, setRelations] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  const [imagesTruck, setImagesTruck] = useState<MasterDataRow | null>(null);
  const [photoProduct, setPhotoProduct] = useState<MasterDataRow | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [cellSaveState, setCellSaveState] = useState<{ key: string; status: "saving" | "error"; message?: string } | null>(null);
  const cellSaves = useRef(new Set<string>());
  const config = resources.find((item) => item.key === section);
  const listConfig = config ?? (section === "pictures" ? resources.find((item) => item.key === "trucks") : undefined);
  const rows = rowScope===`${accessToken}:${listConfig?.key}` ? loadedRows : [];
  const realtimeGate = useDeferredRealtimeRefresh(() => setRevision((value) => value + 1), Boolean(activeCell || editing || Object.keys(form).length || saving || imagesTruck || photoProduct));
  useEffect(() => subscribeToAdminRealtime((event) => {
    const tables = event.kind === "batch" ? event.tables : event.kind === "change" ? [event.payload.table] : event.kind === "recovered" ? [event.table] : [];
    if (event.kind === "resume" || tables.some((table) => ["trucks", "truck_images", "warehouses", "customer_stores", "customers", "store_contacts", "products", "trucking_companies"].includes(table))) realtimeGate.request();
  }), [realtimeGate]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void Promise.all(["customers", "trucking-companies", "stores"].map(async (resource) => {
      const response = await apiGetCached<ApiResponse<Array<Record<string, unknown>>>>(`/lookups/${resource}?limit=500`, accessToken,60_000);
      if (!response.success || !response.data) return [resource, []] as const;
      return [resource, response.data.map((row) => ({ id: String(row.id), label: [row.code, row.name].filter(Boolean).join(" · ") || String(row.id) }))] as const;
    })).then((values) => { if (active) setRelations(Object.fromEntries(values)); }).catch(() => { if (active) setRelations({}); });
    return () => { active = false; };
  }, [accessToken, revision]);

  useEffect(() => {
    if (!accessToken || !listConfig) return;
    let active = true;
    void fetchMasterData(accessToken, listConfig.key, search, page).then((result) => { if (active) { setRows(result.rows); setRowScope(`${accessToken}:${listConfig.key}`); setTotalPages(result.pagination.totalPages); setTotalRows(result.pagination.total); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load master data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, listConfig, page, revision, search]);

  const columns = useMemo(() => config ? config.fields.map((field) => field.key) : [], [config]);
  const tableColumns = useMemo(() => section === "pictures" ? ["Plate number", "Trucking company", "Truck type", "Pictures"].map((title) => ({ key: title.toLowerCase().replaceAll(" ", "-"), title })) : [...(config?.fields ?? []).map((field) => ({ key: field.key, title: field.label })), { key: "actions", title: "Actions", width: 110 }], [section, config]);
  const { attachViewport, viewportProps, tableStyle, controls: columnControls, hiddenControl, colgroup, headerProps, headerControls, orderedColumns, renderCells } = useManagementTableColumns({ table: `master:${section}`, token: accessToken, profileId: profile?.id, columns: tableColumns, paused: Boolean(activeCell || cellSaveState?.status === "saving" || Object.keys(form).length), enabled: section !== "explorer" && ["ADMIN", "STAFF"].includes(profile?.role ?? "") });
  const openForm = (row?: MasterDataRow) => {
    setEditing(row ?? null); setFormError("");
    setForm(Object.fromEntries((config?.fields ?? []).map((field) => {
      const value = row?.[field.key] ?? (!row && field.key === "status" ? "ACTIVE" : undefined);
      return [field.key, field.kind === "boolean" ? Boolean(value) : value == null ? "" : String(value)];
    })));
  };
  const selectRecordLocation = (location: LocationSearchResult) => {
    setForm((current) => ({ ...current, address: location.display_name, latitude: String(location.latitude), longitude: String(location.longitude) }));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!accessToken || !config) return;
    setSaving(true); setFormError("");
    try {
      const payload: Record<string, unknown> = {};
      for (const field of config.fields) {
        const value = form[field.key];
        payload[field.key] = field.kind === "boolean" ? Boolean(value) : value === "" ? null : field.kind === "number" ? Number(value) : value;
      }
      await saveMasterData(accessToken, config.key, payload, editing?.id);
      setEditing(null); setForm({}); setRevision((value) => value + 1);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Unable to save this record."); }
    finally { setSaving(false); }
  };

  const cellKey = (rowId: string, field: string) => `${rowId}:${field}`;
  const editableField = (field: string) => config?.fields.find((item) => item.key === field && item.kind !== "relation");
  const beginCellEdit = (row: MasterDataRow, field: string) => {
    const definition = editableField(field);
    if (!definition || cellSaves.current.size > 0) return;
    setCellSaveState((current) => current?.key === cellKey(row.id, field) ? null : current);
    setActiveCell({ rowId: row.id, field, value: row[field] == null ? "" : definition.kind === "boolean" ? (row[field] ? "true" : "false") : String(row[field]) });
  };

  const commitCell = async (draft: ActiveCell) => {
    const key = cellKey(draft.rowId, draft.field);
    const definition = editableField(draft.field);
    if (!accessToken || !config || !definition || cellSaves.current.has(key)) return;
    const row = rows.find((item) => item.id === draft.rowId);
    if (!row) return;
    let value: unknown = draft.value.trim();
    if (definition.kind === "number") {
      value = draft.value.trim() === "" ? null : Number(draft.value);
      if (value !== null && !Number.isFinite(value)) { setCellSaveState({ key, status: "error", message: "Enter a valid number." }); return; }
    } else if (definition.kind === "boolean") {
      const normalized = draft.value.trim().toLowerCase();
      if (["true", "yes"].includes(normalized)) value = true;
      else if (["false", "no"].includes(normalized)) value = false;
      else { setCellSaveState({ key, status: "error", message: "Enter true/false or yes/no." }); return; }
    } else if (draft.value.trim() === "") value = null;
    if (Object.is(row[draft.field] ?? null, value)) { setActiveCell((current) => current?.rowId === draft.rowId && current.field === draft.field ? null : current); return; }

    cellSaves.current.add(key);
    setCellSaveState({ key, status: "saving" });
    setActiveCell((current) => current?.rowId === draft.rowId && current.field === draft.field ? null : current);
    setRows((current) => current.map((item) => item.id === draft.rowId ? { ...item, [draft.field]: value } : item));
    try {
      const canonical = await saveMasterData(accessToken, config.key, { [draft.field]: value }, draft.rowId);
      setRows((current) => current.map((item) => item.id === draft.rowId ? { ...item, ...canonical } : item));
      setCellSaveState((current) => current?.key === key ? null : current);
    } catch (cause) {
      setCellSaveState({ key, status: "error", message: cause instanceof Error ? cause.message : "Unable to save this value." });
    } finally { cellSaves.current.delete(key); }
  };

  const renderCell = (row: MasterDataRow, field: string) => {
    const definition = config?.fields.find((item) => item.key === field);
    const key = cellKey(row.id, field);
    const active = activeCell?.rowId === row.id && activeCell.field === field;
    const savingCell = cellSaveState?.key === key && cellSaveState.status === "saving";
    const error = cellSaveState?.key === key && cellSaveState.status === "error" ? cellSaveState.message : "";
    const relationValue = field === "trucking_company_id" ? (row.trucking_companies as Record<string, unknown> | null)?.name : field === "customer_id" ? (row.customers as Record<string, unknown> | null)?.name : field === "store_id" ? (row.customer_stores as Record<string, unknown> | null)?.name : undefined;
    const value = definition?.kind === "relation" ? relationValue : row[field];
    const inputClass = "w-full min-w-32 rounded-md border border-[#2678b9]/40 bg-white px-2 py-1.5 text-[13px] text-slate-800 outline-none ring-2 ring-[#2678b9]/10";
    return <td key={field} className={`${tableUi.td} max-w-72 whitespace-pre-wrap break-words align-top`} onClick={() => { if (!active && !savingCell && definition?.kind !== "relation") beginCellEdit(row, field); }}>
      {activeCell?.rowId === row.id && activeCell.field === field ? <div className="min-w-36 space-y-1">{definition?.kind === "textarea" ? <textarea autoFocus rows={3} className={`${inputClass} min-h-16 resize-y`} value={activeCell.value} onChange={(event) => setActiveCell({ ...activeCell, value: event.target.value })} onBlur={() => void commitCell(activeCell)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void commitCell(activeCell); } if (event.key === "Escape") { event.preventDefault(); setActiveCell(null); } }} /> : <input autoFocus className={inputClass} type={definition?.kind === "number" ? "number" : "text"} value={activeCell.value} onChange={(event) => setActiveCell({ ...activeCell, value: event.target.value })} onBlur={() => void commitCell(activeCell)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitCell(activeCell); } if (event.key === "Escape") { event.preventDefault(); setActiveCell(null); } }} />}{error && <span role="alert" className="block max-w-56 text-[11px] text-rose-700">{error}</span>}</div> : <div className="flex items-start gap-2"><span className={`${definition?.kind === "textarea" ? "whitespace-pre-wrap" : ""} min-h-5 flex-1 ${definition?.kind !== "relation" ? "cursor-text" : ""}`} title={error || undefined}>{definition?.kind === "boolean" ? (value ? "Yes" : "No") : cell(value)}</span>{savingCell && <LoaderCircle aria-label="Saving cell" className="mt-0.5 h-3.5 w-3.5 animate-spin text-slate-400" />}{error && <span role="alert" title={error} className="mt-0.5 text-xs font-semibold text-rose-600">!</span>}</div>}
    </td>;
  };

  return <div className="space-y-4">
    <header className={`${tableUi.toolbar} items-start lg:items-start`}>
      <div className="min-w-0 w-full lg:flex-1">
        <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[#0b2341]">Database</h1>
        <p className="mt-1 text-xs leading-snug text-slate-600">Browse Supabase tables and report views</p>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:flex-1 lg:justify-end">
        <label className="relative min-w-0 w-full sm:w-72 sm:flex-none"><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={tableUi.search} value={search} onChange={(event) => { setLoading(true); setPage(1); setSearch(event.target.value); }} placeholder="Search records" aria-label="Search master data" /></label>
        {section !== "explorer" && columnControls}
        {config && <button type="button" onClick={() => openForm()} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200]"><Plus className="h-4 w-4" />Add {config.label.slice(0, -1)}</button>}
        <button type="button" onClick={() => { invalidateApiCache(`/master-data/${listConfig?.key}`); invalidateApiCache("/lookups/"); setLoading(true); setRevision((value) => value + 1); }} className={tableUi.iconBtn} aria-label="Refresh master data" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </div>
    </header>
    {error && <div role="alert" className="flex items-center justify-between rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={()=>setRevision(value=>value+1)} className="underline">Retry</button></div>}
    <section className={`${tableUi.shell} overflow-hidden`}>
    <nav aria-label="Master data sections" className="flex flex-nowrap gap-2 overflow-x-auto border-b border-slate-100 px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">{[...resources.map((item) => [item.key, item.label] as const), ["pictures", "Truck pictures"] as const, ...(profile?.role === "ADMIN" ? [["explorer", "Database explorer"] as const] : [])].map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => { setLoading(true); setPage(1); setActiveCell(null); setCellSaveState(null); setError(""); setSection(key as typeof section); setSearch(""); }} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium ${section === key ? "bg-[#e6f0f9] text-[#0b2341]" : "text-slate-500 hover:bg-slate-50"}`}>{label}</button>)}</nav>
    {section === "explorer" ? <DatabaseExplorerView /> : loading && !rows.length && !error ? <TableSkeleton columns={tableColumns.length} rows={5} /> : section === "pictures" ? <div ref={attachViewport} {...viewportProps} className="overflow-x-auto"><div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">Choose a truck to view and manage its private pictures.</div>{error && !rows.length ? null : <table style={tableStyle} className="min-w-full text-left">{colgroup}<thead className={tableUi.thead}><tr>{orderedColumns.map((column) => <th key={column.key} {...headerProps(column.key)} className={tableUi.th}>{column.title}{headerControls(column)}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={4} className={tableUi.empty}>No trucks found.</td></tr> : rows.map((row) => <tr key={row.id} className={tableUi.row}>{renderCells(<><td className={tableUi.td}>{cell(row.plate_number)}</td><td className={tableUi.td}>{cell((row.trucking_companies as Record<string, unknown> | null)?.name)}</td><td className={tableUi.td}>{cell(row.truck_type)}</td><td className={tableUi.td}><button type="button" onClick={() => setImagesTruck(row)} className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 px-3 text-xs font-medium text-[#0b2341] hover:bg-slate-50"><Images className="h-4 w-4" />Manage pictures</button></td></>)}</tr>)}</tbody></table>}{(!error || rows.length>0) && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{totalRows.toLocaleString()} trucks · Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className={tableUi.pageBtn}>Previous</button><button type="button" disabled={loading || page >= totalPages} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className={tableUi.pageBtn}>Next</button></div></footer>}</div> : <div ref={attachViewport} {...viewportProps} className="overflow-x-auto">
      {error && !rows.length ? null : <table style={tableStyle} className="min-w-full text-left">{colgroup}<thead className={tableUi.thead}><tr>{orderedColumns.map((column) => <th key={column.key} {...headerProps(column.key)} className={tableUi.th}>{column.title}{headerControls(column)}</th>)}</tr></thead><tbody>
        {rows.length === 0 ? <tr><td colSpan={(config?.fields.length ?? 0) + 1} className={tableUi.empty}>No records found.</td></tr> : rows.map((row) => <tr key={row.id} className={tableUi.row}>{renderCells(<>{columns.map((column) => renderCell(row, column))}<td className={tableUi.td}><div className="flex items-center gap-1">{config?.key === "trucks" && <button type="button" aria-label={`Manage pictures for ${String(row.plate_number ?? "truck")}`} title="Manage truck pictures" onClick={() => setImagesTruck(row)} className={tableUi.iconBtn}><Image className="h-4 w-4" /></button>}{config?.key === "products" && <button type="button" aria-label={`Manage photo for ${String(row.name ?? "product")}`} title="Manage product photo" onClick={() => setPhotoProduct(row)} className={tableUi.iconBtn}><Image className="h-4 w-4" /></button>}</div></td></>)}</tr>)}
      </tbody></table>}
      {config && (!error || rows.length>0) && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{totalRows.toLocaleString()} records · Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className={tableUi.pageBtn}>Previous</button><button type="button" disabled={loading || page >= totalPages} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className={tableUi.pageBtn}>Next</button></div></footer>}
    </div>}
    {section !== "explorer" && hiddenControl}
    </section>
    {config && editing !== undefined && (editing || Object.keys(form).length > 0) && <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setForm({}); setEditing(null); } }}><form onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="master-data-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><h3 id="master-data-title" className="text-lg font-semibold text-[#0b2341]">{editing ? "Edit" : "Add"} {config.label.slice(0, -1)}</h3>{(config.key === "warehouses" || config.key === "stores") && <LocationSearch accessToken={accessToken} onSelect={selectRecordLocation} />}<div className="mt-4 grid gap-3 sm:grid-cols-2">{config.fields.map((field) => <label key={field.key} className={`space-y-1 text-xs font-medium text-slate-600 ${field.kind === "textarea" ? "sm:col-span-2" : ""}`}>{field.label}{field.kind === "boolean" ? <input type="checkbox" checked={Boolean(form[field.key])} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.checked }))} className="ml-2" /> : field.kind === "relation" ? <select required={field.required} value={String(form[field.key] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Choose {field.label.toLowerCase()}</option>{(relations[field.source ?? ""] ?? []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : field.kind === "select" ? <select required={field.required} value={String(form[field.key] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Choose {field.label.toLowerCase()}</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.kind === "textarea" ? <textarea required={field.required} value={String(form[field.key] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="min-h-24 w-full rounded-lg border border-slate-200 p-2 text-sm" /> : <input required={field.required} type={field.kind === "number" ? "number" : "text"} step={field.key === "latitude" || field.key === "longitude" ? "any" : undefined} value={String(form[field.key] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />}</label>)}</div>{formError && <p role="alert" className="mt-3 text-sm text-rose-700">{formError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => { setForm({}); setEditing(null); }} className="rounded-full border border-slate-200 px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button></div></form></div>}
    {accessToken && imagesTruck && <TruckImageManager token={accessToken} truckId={imagesTruck.id} truckLabel={String(imagesTruck.plate_number ?? "Truck")} onClose={() => setImagesTruck(null)} />}
    {accessToken && photoProduct && <ProductPhotoManager token={accessToken} productId={photoProduct.id} productLabel={String(photoProduct.name ?? "Product")} onClose={() => setPhotoProduct(null)} />}
  </div>;
}
