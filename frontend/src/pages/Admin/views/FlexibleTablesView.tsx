import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, Archive, Columns3, Eye, EyeOff, LoaderCircle, Plus, Settings2, Table2, Trash2, Users, X } from "lucide-react";
import {
  archiveFlexColumn,
  archiveFlexibleTable,
  archiveFlexRow,
  createFlexColumn,
  createFlexibleTable,
  createFlexOption,
  createFlexPermission,
  createFlexRow,
  deleteFlexPermission,
  getFlexOptions,
  getFlexPermissions,
  getFlexibleTable,
  listFlexibleTables,
  listFlexProfiles,
  renameFlexibleTable,
  reorderFlexRow,
  saveFlexCell,
  updateFlexColumn,
  updateFlexOption,
  updateFlexPermission,
  type FlexCell,
  type FlexColumn,
  type FlexInputMode,
  type FlexOption,
  type FlexPermission,
  type FlexProfile,
  type FlexRow,
  type FlexTable,
  type FlexTableData,
  type FlexValueType,
} from "../../../services/flexible-table.service";

const VALUE_TYPES: FlexValueType[] = ["TEXT", "NUMBER", "DATE", "DATETIME", "BOOLEAN"];
const INPUT_MODES: FlexInputMode[] = ["TEXT", "DROPDOWN", "NUMBER", "DATE", "DATETIME", "BOOLEAN"];
const panel = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inputClass = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/10";
const buttonClass = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

type Props = { accessToken: string | null; role: string; embeddedTableId?: string; onExit?: () => void };

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function cellFor(row: FlexRow, columnId: string) {
  return row.cells.find((cell) => cell.column_id === columnId);
}

function cellInputValue(value: unknown) {
  return value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function FlexibleTablesView({ accessToken, role, embeddedTableId, onExit }: Props) {
  const [tables, setTables] = useState<FlexTable[]>([]);
  const [tableData, setTableData] = useState<FlexTableData | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [columnEditor, setColumnEditor] = useState<FlexColumn | "new" | null>(null);
  const [columnForm, setColumnForm] = useState({ name: "", value_type: "TEXT" as FlexValueType, input_mode: "TEXT" as FlexInputMode });
  const [optionsColumn, setOptionsColumn] = useState<FlexColumn | null>(null);
  const [allOptions, setAllOptions] = useState<FlexOption[]>([]);
  const [optionForm, setOptionForm] = useState({ label: "", stored_value: "", color: "#2678b9" });
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissions, setPermissions] = useState<FlexPermission[]>([]);
  const [profiles, setProfiles] = useState<FlexProfile[]>([]);
  const [permissionSubject, setPermissionSubject] = useState("ROLE:STAFF");
  const [permissionFlags, setPermissionFlags] = useState({ can_view: true, can_edit: false, can_manage: false });

  const loadTables = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try { setTables(await listFlexibleTables(accessToken)); }
    catch (cause) { setError(messageOf(cause, "Unable to load flexible tables.")); }
    finally { setLoading(false); }
  }, [accessToken]);

  const loadTable = useCallback(async (id: string, quiet = false) => {
    if (!accessToken) return;
    if (!quiet) setLoading(true);
    setError("");
    try { setTableData(await getFlexibleTable(accessToken, id)); setSelectedTableId(id); }
    catch (cause) { setError(messageOf(cause, "Unable to load this table.")); if (!quiet) setTableData(null); }
    finally { if (!quiet) setLoading(false); }
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (embeddedTableId) void loadTable(embeddedTableId);
      else void loadTables();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [embeddedTableId, loadTable, loadTables]);

  const run = async (operation: () => Promise<unknown>, success: string, refresh = true) => {
    setSaving(true); setError(""); setNotice("");
    try {
      await operation();
      if (refresh && selectedTableId) await loadTable(selectedTableId, true);
      await loadTables();
      setNotice(success);
      return true;
    } catch (cause) {
      const text = messageOf(cause, "Unable to save changes.");
      setError(text);
      if (/changed since|created by another editor/i.test(text) && selectedTableId) await loadTable(selectedTableId, true);
      return false;
    } finally { setSaving(false); }
  };

  const createTable = async () => {
    const name = newName.trim();
    if (!name) { setError("Enter a table name."); return; }
    setSaving(true); setError("");
    try {
      const created = await createFlexibleTable(accessToken!, name);
      setNewName(""); setTables((current) => [created, ...current]);
      await loadTable(created.id, true); setNotice("Table created.");
    } catch (cause) { setError(messageOf(cause, "Unable to create table.")); }
    finally { setSaving(false); }
  };

  const archiveTable = async () => {
    if (!tableData || !window.confirm(`Archive “${tableData.table.name}”? It will no longer appear in the table list.`)) return;
    const ok = await run(() => archiveFlexibleTable(accessToken!, tableData.table.id, tableData.table.version), "Table archived.", false);
    if (ok) { setTableData(null); setSelectedTableId(null); onExit?.(); }
  };

  const renameTable = async () => {
    if (!tableData) return;
    const name = window.prompt("Table name", tableData.table.name)?.trim();
    if (!name || name === tableData.table.name) return;
    await run(() => renameFlexibleTable(accessToken!, tableData.table.id, name, tableData.table.version), "Table renamed.");
  };

  const visibleColumns = useMemo(() => (tableData?.columns ?? []).filter((column) => showHidden || !column.is_hidden), [tableData, showHidden]);
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tableData?.rows ?? [];
    return (tableData?.rows ?? []).filter((row) => row.cells.some((cell) => String(cell.value ?? "").toLowerCase().includes(needle)));
  }, [tableData, search]);

  const saveCellValue = async (row: FlexRow, column: FlexColumn, raw: string, existing?: FlexCell) => {
    let value: unknown = raw;
    if (column.value_type === "NUMBER") value = raw === "" ? null : Number(raw);
    if (column.value_type === "BOOLEAN") value = raw === "true";
    if (raw === "" && column.value_type !== "BOOLEAN") value = null;
    if (value === existing?.value || (value === null && existing?.value === null)) return;
    const key = `${row.id}:${column.id}`;
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await saveFlexCell(accessToken!, tableData!.table.id, row.id, column.id, value, existing?.version ?? 0);
      setTableData((current) => current ? {
        ...current,
        rows: current.rows.map((item) => item.id !== row.id ? item : {
          ...item,
          cells: existing
            ? item.cells.map((cell) => cell.id === existing.id ? saved : cell)
            : [...item.cells, saved],
        }),
      } : current);
      setNotice("Cell saved.");
    } catch (cause) {
      const text = messageOf(cause, "Unable to save cell."); setError(text);
      if (/changed since|created by another editor/i.test(text) && selectedTableId) await loadTable(selectedTableId, true);
    } finally {
      setSaving(false);
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
    }
  };

  const openColumn = (column: FlexColumn | "new") => {
    setColumnEditor(column);
    setColumnForm(column === "new" ? { name: "", value_type: "TEXT", input_mode: "TEXT" } : { name: column.name, value_type: column.value_type, input_mode: column.input_mode });
  };

  const saveColumn = async () => {
    if (!tableData || !columnEditor) return;
    if (columnEditor === "new") {
      const ok = await run(() => createFlexColumn(accessToken!, tableData.table.id, { ...columnForm, binding_scope: "CUSTOM_ROW" }), "Column added.");
      if (ok) setColumnEditor(null);
      return;
    }
    const ok = await run(() => updateFlexColumn(accessToken!, tableData.table.id, columnEditor.id, { ...columnForm, binding_scope: columnEditor.binding_scope, expected_version: columnEditor.version }), "Column updated.");
    if (ok) setColumnEditor(null);
  };

  const toggleColumnHidden = (column: FlexColumn) => run(() => updateFlexColumn(accessToken!, tableData!.table.id, column.id, { is_hidden: !column.is_hidden, expected_version: column.version }), column.is_hidden ? "Column shown." : "Column hidden.");
  const shiftColumn = (column: FlexColumn, delta: number) => {
    const columns = [...(tableData?.columns ?? [])].sort((a, b) => a.position - b.position);
    const index = columns.findIndex((item) => item.id === column.id);
    const target = index + delta;
    if (target < 0 || target >= columns.length) return;
    const other = columns[target];
    void (async () => {
      setSaving(true); setError("");
      try {
        const first = await updateFlexColumn(accessToken!, tableData!.table.id, column.id, { position: other.position, expected_version: column.version });
        const second = await updateFlexColumn(accessToken!, tableData!.table.id, other.id, { position: column.position, expected_version: other.version });
        setTableData((current) => current ? { ...current, columns: current.columns.map((item) => item.id === first.id ? first : item.id === second.id ? second : item).sort((a, b) => a.position - b.position) } : current);
        setNotice("Column order saved.");
      } catch (cause) { setError(messageOf(cause, "Unable to reorder columns.")); await loadTable(tableData!.table.id, true); }
      finally { setSaving(false); }
    })();
  };

  const openOptions = async (column: FlexColumn) => {
    setOptionsColumn(column); setError("");
    try { setAllOptions(await getFlexOptions(accessToken!, tableData!.table.id, column.id)); }
    catch (cause) { setError(messageOf(cause, "Unable to load dropdown options.")); }
  };

  const addOption = async () => {
    if (!optionsColumn) return;
    const ok = await run(async () => {
      const option = await createFlexOption(accessToken!, tableData!.table.id, optionsColumn.id, optionForm);
      setAllOptions((items) => [...items, option].sort((a, b) => a.position - b.position));
    }, "Dropdown option added.");
    if (ok) setOptionForm({ label: "", stored_value: "", color: "#2678b9" });
  };

  const patchOption = async (option: FlexOption, patch: Partial<Pick<FlexOption, "is_active" | "position" | "label" | "stored_value" | "color">>) => {
    const updated = await updateFlexOption(accessToken!, tableData!.table.id, optionsColumn!.id, option.id, patch);
    setAllOptions((items) => items.map((item) => item.id === option.id ? updated : item));
    await loadTable(tableData!.table.id, true);
  };

  const openPermissions = async () => {
    setPermissionsOpen(true); setError("");
    try {
      const [items, users] = await Promise.all([getFlexPermissions(accessToken!, tableData!.table.id), listFlexProfiles(accessToken!)]);
      setPermissions(items); setProfiles(users);
    } catch (cause) { setError(messageOf(cause, "Unable to load table permissions.")); }
  };

  const addPermission = async () => {
    const [kind, value] = permissionSubject.split(":", 2);
    const input: Partial<FlexPermission> = kind === "PROFILE"
      ? { subject_type: "PROFILE", subject_profile_id: value, ...permissionFlags }
      : { subject_type: "ROLE", subject_role: "STAFF", ...permissionFlags };
    const ok = await run(async () => {
      const created = await createFlexPermission(accessToken!, tableData!.table.id, input);
      setPermissions((items) => [...items, created]);
    }, "Permission granted.");
    if (ok) setPermissionFlags({ can_view: true, can_edit: false, can_manage: false });
  };

  const patchPermission = async (permission: FlexPermission, patch: Pick<FlexPermission, "can_view" | "can_edit" | "can_manage">) => {
    try {
      const updated = await updateFlexPermission(accessToken!, tableData!.table.id, permission.id, patch);
      setPermissions((items) => items.map((item) => item.id === permission.id ? updated : item));
    } catch (cause) { setError(messageOf(cause, "Unable to update permission.")); }
  };

  const removePermission = async (permission: FlexPermission) => {
    if (!window.confirm("Remove this table permission?")) return;
    try { await deleteFlexPermission(accessToken!, tableData!.table.id, permission.id); setPermissions((items) => items.filter((item) => item.id !== permission.id)); }
    catch (cause) { setError(messageOf(cause, "Unable to remove permission.")); }
  };

  const moveRow = async (row: FlexRow, delta: number) => {
    const rows = [...(tableData?.rows ?? [])].sort((a, b) => a.position - b.position);
    const index = rows.findIndex((item) => item.id === row.id);
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const other = rows[target];
    setSaving(true); setError("");
    try {
      const first = await reorderFlexRow(accessToken!, tableData!.table.id, row.id, other.position, row.version);
      const second = await reorderFlexRow(accessToken!, tableData!.table.id, other.id, row.position, other.version);
      setTableData((current) => current ? { ...current, rows: current.rows.map((item) => item.id === first.id ? { ...item, ...first } : item.id === second.id ? { ...item, ...second } : item).sort((a, b) => a.position - b.position) } : current);
      setNotice("Row order saved.");
    } catch (cause) { setError(messageOf(cause, "Unable to reorder rows.")); await loadTable(tableData!.table.id, true); }
    finally { setSaving(false); }
  };

  const addRow = async () => {
    if (!tableData) return;
    const row = await createFlexRow(accessToken!, tableData.table.id).catch((cause) => { setError(messageOf(cause, "Unable to add row.")); return null; });
    if (row) { setTableData((current) => current ? { ...current, rows: [...current.rows, row] } : current); setNotice("Row added."); }
  };

  const archiveRowAction = async (row: FlexRow) => {
    if (!window.confirm("Archive this custom row?")) return;
    try {
      await archiveFlexRow(accessToken!, tableData!.table.id, row.id, row.version);
      setTableData((current) => current ? { ...current, rows: current.rows.filter((item) => item.id !== row.id) } : current);
      setNotice("Row archived.");
    } catch (cause) { setError(messageOf(cause, "Unable to archive row.")); }
  };

  const archiveColumnAction = async (column: FlexColumn) => {
    if (!window.confirm(`Archive column “${column.name}”? Existing cell data will remain stored.`)) return;
    try { await archiveFlexColumn(accessToken!, tableData!.table.id, column.id, column.version); await loadTable(tableData!.table.id, true); setNotice("Column archived."); }
    catch (cause) { setError(messageOf(cause, "Unable to archive column.")); }
  };

  if (!accessToken || !["ADMIN", "STAFF"].includes(role)) return <div className={`${panel} p-6 text-sm text-slate-600`}>You do not have access to Flexible Tables.</div>;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {tableData && !embeddedTableId && <button type="button" className={buttonClass} onClick={() => { setTableData(null); setSelectedTableId(null); setError(""); setNotice(""); void loadTables(); }}><ArrowLeft className="h-4 w-4" />Tables</button>}
          {!embeddedTableId && <div><h1 className="text-xl font-bold text-[#0b2341]">Flexible Tables</h1><p className="mt-0.5 text-xs text-slate-500">Custom operational workspaces, separate from trip records.</p></div>}
        </div>
        {tableData?.access.canManage && <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => void renameTable()}><Settings2 className="h-4 w-4" />Rename</button><button type="button" className={buttonClass} onClick={() => void openPermissions()}><Users className="h-4 w-4" />Permissions</button><button type="button" className={`${buttonClass} text-rose-700`} onClick={() => void archiveTable()}><Archive className="h-4 w-4" />Archive</button></div>}
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {!tableData && embeddedTableId ? (
        loading ? <div role="status" className={`${panel} flex items-center gap-2 p-8 text-sm text-slate-500`}><LoaderCircle className="h-4 w-4 animate-spin" />Loading connected table…</div> : <div role="alert" className={`${panel} p-6 text-sm text-rose-700`}>{error || "This table is no longer available to your account."}</div>
      ) : !tableData ? (
        <div className={`${panel} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Create a custom table<input className={inputClass} value={newName} maxLength={100} placeholder="e.g. Weekly planning" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createTable(); }} /></label>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#0b2341] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#173b62] disabled:opacity-50" disabled={saving || !newName.trim()} onClick={() => void createTable()}><Plus className="h-4 w-4" />Create table</button>
          </div>
          {loading ? <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading tables…</div> : tables.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tables.map((table) => <button type="button" key={table.id} onClick={() => void loadTable(table.id)} className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-[#2678b9]/40 hover:bg-slate-50"><span className="flex items-center gap-2 text-sm font-semibold text-[#0b2341]"><Table2 className="h-4 w-4 text-[#2678b9]" />{table.name}</span><span className="mt-2 block text-[11px] text-slate-500">Updated {new Date(table.updated_at).toLocaleString()}</span><span className="mt-3 block text-[11px] font-medium text-slate-500">{table.access?.is_owner ? "Owner" : table.access?.can_manage ? "Can manage" : table.access?.can_edit ? "Can edit" : "View only"}</span></button>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No tables are shared with you yet. Create one or ask a table owner for access.</div>}
        </div>
      ) : loading ? <div className={`${panel} flex items-center gap-2 p-8 text-sm text-slate-500`}><LoaderCircle className="h-4 w-4 animate-spin" />Loading table…</div> : (
        <div className={`${panel} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 sm:px-4">
            <div className="min-w-0"><h2 className="truncate font-semibold text-[#0b2341]">{tableData.table.name}</h2><p className="text-[11px] text-slate-500">{tableData.rows.length} rows · {tableData.columns.length} columns</p></div>
            <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="flex-search">Search rows</label><input id="flex-search" className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-xs sm:w-56" value={search} placeholder="Filter rows…" onChange={(event) => setSearch(event.target.value)} /><button type="button" onClick={() => setShowHidden((shown) => !shown)} className={buttonClass}>{showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showHidden ? "Hide hidden" : "Show hidden"}</button><button type="button" className={buttonClass} onClick={() => void addRow()} disabled={!tableData.access.canEdit || saving}><Plus className="h-4 w-4" />Add row</button><button type="button" className={buttonClass} onClick={() => openColumn("new")} disabled={!tableData.access.canManage || saving}><Columns3 className="h-4 w-4" />Add column</button></div>
          </div>
          {saving && <div className="h-0.5 w-full overflow-hidden bg-slate-100"><div className="h-full w-1/3 animate-pulse bg-[#2678b9]" /></div>}
          <div className="max-h-[68vh] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
              <thead className="sticky top-0 z-20 bg-slate-50"><tr><th className="sticky left-0 z-30 min-w-24 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-bold uppercase text-slate-500">Row</th>{visibleColumns.map((column, index) => <th key={column.id} className={`min-w-44 border-b border-r border-slate-200 px-2 py-2 align-top ${column.is_hidden ? "bg-amber-50" : "bg-slate-50"}`}><div className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate font-semibold text-slate-700" title={column.name}>{column.name}</span>{tableData.access.canManage && <span className="flex shrink-0 items-center gap-0.5"><button type="button" title="Move column left" disabled={index === 0 || saving} onClick={() => shiftColumn(column, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button><button type="button" title="Move column right" disabled={index === visibleColumns.length - 1 || saving} onClick={() => shiftColumn(column, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button><button type="button" title="Configure column" onClick={() => openColumn(column)} className="rounded p-1 text-slate-400 hover:bg-slate-200"><Settings2 className="h-3.5 w-3.5" /></button></span>}</div><div className="mt-1 text-[9px] font-medium uppercase tracking-wide text-slate-400">{column.input_mode === "DROPDOWN" ? "Dropdown" : column.value_type}</div></th>)}{tableData.access.canEdit && <th className="min-w-12 border-b border-slate-200 bg-slate-50" />}</tr></thead>
              <tbody>{filteredRows.map((row, rowIndex) => <tr key={row.id} className="group hover:bg-blue-50/30"><th className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-2 py-1 text-[10px] font-medium text-slate-400 group-hover:bg-blue-50/30">{rowIndex + 1}</th>{visibleColumns.map((column) => {
                const cell = cellFor(row, column.id);
                const key = `${row.id}:${column.id}`;
                const valueText = drafts[key] ?? cellInputValue(cell?.value);
                const disabled = !tableData.access.canEdit || saving;
                const options = tableData.options.filter((option) => option.column_id === column.id && option.is_active);
                return <td key={column.id} className="border-b border-r border-slate-100 p-1.5 align-middle">{column.input_mode === "DROPDOWN" ? <select aria-label={`${column.name}, row ${rowIndex + 1}`} disabled={disabled} className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-xs hover:border-slate-200 focus:border-blue-400 focus:bg-white disabled:cursor-not-allowed" value={valueText} onChange={(event) => void saveCellValue(row, column, event.target.value, cell)}><option value="">—</option>{options.map((option) => <option key={option.id} value={option.stored_value}>{option.label}</option>)}</select> : column.value_type === "BOOLEAN" ? <input aria-label={`${column.name}, row ${rowIndex + 1}`} disabled={disabled} type="checkbox" checked={cell?.value === true} onChange={(event) => void saveCellValue(row, column, String(event.target.checked), cell)} className="ml-2 h-4 w-4 accent-[#2678b9]" /> : <input aria-label={`${column.name}, row ${rowIndex + 1}`} disabled={disabled} type={column.value_type === "NUMBER" ? "number" : column.value_type === "DATE" ? "date" : column.value_type === "DATETIME" ? "datetime-local" : "text"} step={column.value_type === "NUMBER" ? "any" : undefined} className="w-full min-w-36 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-xs hover:border-slate-200 focus:border-blue-400 focus:bg-white disabled:cursor-not-allowed" value={valueText} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} onBlur={(event) => { if (event.target.value !== cellInputValue(cell?.value)) void saveCellValue(row, column, event.target.value, cell); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />}</td>;
              })}{tableData.access.canEdit && <td className="border-b border-slate-100 px-1"><div className="flex items-center gap-1 opacity-50 transition group-hover:opacity-100"><button type="button" title="Move row up" className="rounded p-1 text-slate-500 hover:bg-slate-100" disabled={rowIndex === 0 || saving} onClick={() => void moveRow(row, -1)}><ArrowUp className="h-3 w-3" /></button><button type="button" title="Move row down" className="rounded p-1 text-slate-500 hover:bg-slate-100" disabled={rowIndex === filteredRows.length - 1 || saving} onClick={() => void moveRow(row, 1)}><ArrowDown className="h-3 w-3" /></button><button type="button" title="Archive row" className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => void archiveRowAction(row)}><Trash2 className="h-3.5 w-3.5" /></button></div></td>}</tr>)}</tbody>
            </table>
            {!filteredRows.length && <div className="p-8 text-center text-sm text-slate-500">{search ? "No rows match this filter." : "No custom rows yet. Add a row to get started."}</div>}
          </div>
          {tableData.access.canManage && <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2"><span className="mr-1 text-[10px] font-semibold uppercase text-slate-400">Columns</span>{tableData.columns.map((column) => <div key={column.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1"><span className="max-w-32 truncate text-[10px] text-slate-600">{column.name}</span><button type="button" title={column.is_hidden ? "Show column" : "Hide column"} onClick={() => void toggleColumnHidden(column)} className="text-slate-400 hover:text-slate-700">{column.is_hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button><button type="button" title="Configure column" onClick={() => openColumn(column)} className="text-slate-400 hover:text-slate-700"><Settings2 className="h-3 w-3" /></button><button type="button" title="Archive column" onClick={() => void archiveColumnAction(column)} className="text-rose-400 hover:text-rose-700"><Archive className="h-3 w-3" /></button></div>)}</div>}
        </div>
      )}

      {columnEditor && <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/40 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setColumnEditor(null); }}><section role="dialog" aria-modal="true" aria-label="Column settings" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><header className="flex items-center justify-between"><h2 className="font-semibold text-[#0b2341]">{columnEditor === "new" ? "Add column" : "Configure column"}</h2><button type="button" onClick={() => setColumnEditor(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Column name<input className={inputClass} maxLength={100} value={columnForm.name} onChange={(event) => setColumnForm((form) => ({ ...form, name: event.target.value }))} /></label><label className="text-xs font-semibold text-slate-600">Value type<select className={inputClass} value={columnForm.value_type} onChange={(event) => { const value = event.target.value as FlexValueType; setColumnForm((form) => ({ ...form, value_type: value, input_mode: value })); }}>{VALUE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Input mode<select className={inputClass} value={columnForm.input_mode} onChange={(event) => setColumnForm((form) => ({ ...form, input_mode: event.target.value as FlexInputMode }))}>{INPUT_MODES.filter((mode) => mode === "DROPDOWN" ? columnForm.value_type === "TEXT" : mode === "TEXT" || mode === columnForm.value_type).map((mode) => <option key={mode}>{mode}</option>)}</select></label></div><p className="mt-3 text-[11px] text-slate-500">New columns use custom rows. Report/source bindings are not enabled in this workspace.</p><div className="mt-5 flex flex-wrap justify-between gap-2">{columnEditor !== "new" && columnEditor.input_mode === "DROPDOWN" && <button type="button" className={buttonClass} onClick={() => { void openOptions(columnEditor); setColumnEditor(null); }}>Manage options</button>}<div className="ml-auto flex gap-2"><button type="button" className={buttonClass} onClick={() => setColumnEditor(null)}>Cancel</button><button type="button" disabled={saving || !columnForm.name.trim()} className="rounded-lg bg-[#0b2341] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void saveColumn()}>{saving ? "Saving…" : "Save column"}</button></div></div></section></div>}

      {optionsColumn && <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/40 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionsColumn(null); }}><section role="dialog" aria-modal="true" aria-label="Dropdown options" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"><header className="flex items-center justify-between"><div><h2 className="font-semibold text-[#0b2341]">Dropdown options</h2><p className="text-xs text-slate-500">{optionsColumn.name}</p></div><button type="button" onClick={() => setOptionsColumn(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><form className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_80px_auto]" onSubmit={(event) => { event.preventDefault(); void addOption(); }}><input className="rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="Label" maxLength={100} value={optionForm.label} onChange={(event) => setOptionForm((form) => ({ ...form, label: event.target.value }))} /><input className="rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="Stored value" maxLength={100} value={optionForm.stored_value} onChange={(event) => setOptionForm((form) => ({ ...form, stored_value: event.target.value }))} /><input className="h-9 w-full rounded border border-slate-200" aria-label="Option color" type="color" value={optionForm.color} onChange={(event) => setOptionForm((form) => ({ ...form, color: event.target.value }))} /><button type="submit" disabled={saving || !optionForm.label.trim() || !optionForm.stored_value.trim()} className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="inline h-3 w-3" /> Add</button></form><div className="mt-4 divide-y divide-slate-100">{allOptions.map((option, index) => <OptionRow key={option.id} option={option} index={index} count={allOptions.length} onPatch={(patch) => void patchOption(option, patch)} />)}{!allOptions.length && <p className="py-8 text-center text-sm text-slate-500">No options configured.</p>}</div></section></div>}

      {permissionsOpen && <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/40 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPermissionsOpen(false); }}><section role="dialog" aria-modal="true" aria-label="Table permissions" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"><header className="flex items-center justify-between"><div><h2 className="font-semibold text-[#0b2341]">Table permissions</h2><p className="text-xs text-slate-500">Owner access is based on the table creator profile.</p></div><button type="button" onClick={() => setPermissionsOpen(false)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_repeat(3,auto)]"><select className="rounded-lg border border-slate-200 px-3 py-2 text-xs" value={permissionSubject} onChange={(event) => setPermissionSubject(event.target.value)}><option value="ROLE:STAFF">All STAFF</option>{profiles.filter((profile) => profile.role === "STAFF").map((profile) => <option key={profile.id} value={`PROFILE:${profile.id}`}>{profile.full_name} · Staff</option>)}</select><PermissionCheckbox label="View" checked={permissionFlags.can_view} onChange={(value) => setPermissionFlags({ can_view: value, can_edit: value && permissionFlags.can_edit, can_manage: value && permissionFlags.can_manage })} /><PermissionCheckbox label="Edit" checked={permissionFlags.can_edit} onChange={(value) => setPermissionFlags({ can_view: value || permissionFlags.can_view, can_edit: value, can_manage: value && permissionFlags.can_manage })} /><PermissionCheckbox label="Manage" checked={permissionFlags.can_manage} onChange={(value) => setPermissionFlags({ can_view: value || permissionFlags.can_view, can_edit: value || permissionFlags.can_edit, can_manage: value })} /><button type="button" className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white sm:col-span-4" disabled={!permissionFlags.can_view || saving} onClick={() => void addPermission()}>Grant permission</button></div><div className="mt-4 divide-y divide-slate-100">{permissions.map((permission) => <PermissionRow key={permission.id} permission={permission} profiles={profiles} onPatch={(patch) => void patchPermission(permission, patch)} onDelete={() => void removePermission(permission)} />)}{!permissions.length && <p className="py-8 text-center text-sm text-slate-500">No explicit permissions have been added.</p>}</div></section></div>}
    </section>
  );
}

function OptionRow({ option, index, count, onPatch }: { option: FlexOption; index: number; count: number; onPatch: (patch: Partial<FlexOption>) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(option.label);
  const [value, setValue] = useState(option.stored_value);
  return <div className="flex flex-wrap items-center gap-2 py-2"><span className="h-3 w-3 rounded-full border border-slate-200" style={{ background: option.color ?? "#ffffff" }} />{editing ? <><input className="min-w-24 flex-1 rounded border border-slate-200 px-2 py-1 text-xs" value={label} onChange={(event) => setLabel(event.target.value)} /><input className="min-w-24 flex-1 rounded border border-slate-200 px-2 py-1 text-xs" value={value} onChange={(event) => setValue(event.target.value)} /><button type="button" className={buttonClass} onClick={() => { onPatch({ label, stored_value: value }); setEditing(false); }}>Save</button></> : <><span className="min-w-24 flex-1 text-xs font-medium text-slate-700">{option.label}<span className="ml-2 text-slate-400">{option.stored_value}</span></span><button type="button" className="text-slate-400 disabled:opacity-30" title="Move up" disabled={index === 0} onClick={() => onPatch({ position: Math.max(0, option.position - 1) })}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" className="text-slate-400 disabled:opacity-30" title="Move down" disabled={index === count - 1} onClick={() => onPatch({ position: option.position + 1 })}><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" className={buttonClass} onClick={() => setEditing(true)}>Edit</button></>}<button type="button" className={`${buttonClass} ${option.is_active ? "" : "text-amber-700"}`} onClick={() => onPatch({ is_active: !option.is_active })}>{option.is_active ? "Deactivate" : "Activate"}</button></div>;
}

function PermissionCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-[11px] text-slate-600"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function PermissionRow({ permission, profiles, onPatch, onDelete }: { permission: FlexPermission; profiles: FlexProfile[]; onPatch: (patch: Pick<FlexPermission, "can_view" | "can_edit" | "can_manage">) => void; onDelete: () => void }) {
  const profile = profiles.find((item) => item.id === permission.subject_profile_id);
  return <div className="flex flex-wrap items-center gap-3 py-2"><span className="min-w-32 flex-1 text-xs font-medium text-slate-700">{permission.subject_type === "ROLE" ? "All STAFF" : profile?.full_name ?? permission.subject_profile_id}</span><PermissionCheckbox label="View" checked={permission.can_view} onChange={(value) => onPatch({ can_view: value, can_edit: value && permission.can_edit, can_manage: value && permission.can_manage })} /><PermissionCheckbox label="Edit" checked={permission.can_edit} onChange={(value) => onPatch({ can_view: value || permission.can_view, can_edit: value, can_manage: value && permission.can_manage })} /><PermissionCheckbox label="Manage" checked={permission.can_manage} onChange={(value) => onPatch({ can_view: value || permission.can_view, can_edit: value || permission.can_edit, can_manage: value })} /><button type="button" className="rounded p-1 text-rose-600 hover:bg-rose-50" title="Remove permission" onClick={onDelete}><Trash2 className="h-4 w-4" /></button></div>;
}
