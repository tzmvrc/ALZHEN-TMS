import "./MasterListView.css";
import { dropdownStoredValue } from "../../services/dropdown-option.service";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { addDropdownOption, editDropdownOption, fetchDropdownOptions, type DropdownField, type DropdownOption } from "../../services/dropdown-option.service";
import { REPORT_COLUMN_COLORS } from "./ReportSpreadsheetUtils";

export function ReportRowActionButton({ action, disabled, onClick, label: customLabel, showLabel=false }: { action: "edit" | "delete" | "restore"; disabled?: boolean; onClick: () => void; label?: string; showLabel?:boolean }) {
  const label = customLabel ?? (action === "edit" ? "Edit selected row" : action === "restore" ? "Restore selected row" : "Delete selected reports");
  const Icon = action === "edit" ? Pencil : action === "restore" ? RotateCcw : Trash2;
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={`inline-flex h-8 ${showLabel?"gap-2 rounded-md px-3 text-xs font-medium":"w-8 rounded-full"} shrink-0 items-center justify-center border bg-white cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] disabled:cursor-not-allowed disabled:opacity-50 ${action === "delete" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-[#b7d5ed] text-[#155b8d] hover:bg-[#edf6fd]"}`}>
    <Icon aria-hidden="true" className="h-4 w-4" />
    {showLabel&&<span>{label}</span>}
  </button>;
}

export {TripTableFormattingToolbar as ReportCellFormattingToolbar} from "./TripTableFormattingToolbar";

export {TripTableColumnMenu as ReportColumnActionsMenu,type TripTableSortAction as SortAction} from "./TripTableMenus";

export function ReportColumnColorDialog({ columnName, color, onChange, onReset, onClose }: {
  columnName: string;
  color: string;
  onChange: (color: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 al-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-column-color-title" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h2 id="report-column-color-title" className="text-sm font-semibold text-slate-900">Edit Column</h2><p className="mt-1 text-xs text-slate-500">Choose a display color for {columnName}.</p></div><button type="button" title="Close" aria-label="Close column color dialog" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <div className="mt-4 flex items-center gap-3"><input aria-label="Column display color" type="color" value={color || "#eaf2fb"} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1" /><span className="text-xs text-slate-600">Color is shared with authorized users of this table.</span></div>
      <div className="mt-4 grid grid-cols-8 gap-2" aria-label="Column color palette">{REPORT_COLUMN_COLORS.map((choice) => <button key={choice} type="button" aria-label={`Set column color ${choice}`} title={choice} aria-pressed={color.toLowerCase() === choice} onClick={() => onChange(choice)} className="h-7 w-7 rounded-full border border-slate-300 ring-offset-2 hover:ring-2 hover:ring-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]" style={{ backgroundColor: choice }} />)}</div>
      <div className="mt-5 flex justify-between"><button type="button" onClick={onReset} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">Reset to default</button><button type="button" onClick={onClose} className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17375f]">Done</button></div>
    </section>
  </div>, document.body);
}

export {TripTableTextEditor as ReportTextCellEditor} from "./TripTableTextEditor";

type OptionDraft = DropdownOption & { draftKey: string; originalLabel: string; originalColor?: string|null; originalActive: boolean; isNew: boolean };
const initialDrafts = (options: DropdownOption[], field: DropdownField): OptionDraft[] => options.filter((option) => option.field_key === field).map((option) => ({ ...option, draftKey: option.id, originalLabel: option.display_label, originalColor: option.color, originalActive: option.active, isNew: false }));

export function ReportDropdownOptionsDialog({ token, field, options, onClose, onOptionsUpdated }: {
  token: string;
  field: DropdownField;
  options: DropdownOption[];
  onClose: () => void;
  onOptionsUpdated: (options: DropdownOption[]) => void;
}) {
  const [drafts, setDrafts] = useState(() => initialDrafts(options, field));
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useMemo(() => drafts.filter((option) => option.isNew || (option.display_label.trim() !== option.originalLabel || option.color !== option.originalColor || option.active !== option.originalActive)), [drafts]);
  const close = useCallback(() => {
    if (busy) return;
    if (pending.length > 0 && !window.confirm("Discard the unsaved dropdown-option changes?")) return;
    onClose();
  }, [busy, onClose, pending.length]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const stageOption = () => {
    setError("");
    const label = newLabel.trim();
    const value = dropdownStoredValue(label);
    if (!label) return setError("Enter an option label.");
    if (label.length > 80) return setError("Option labels can contain at most 80 characters.");
    if (field === "letter_status") return setError("Letter status values are fixed by the system.");
    if (!/^[A-Z0-9][A-Z0-9 _-]{0,59}$/.test(value)) return setError("Use letters, numbers, spaces, hyphens, or underscores.");
    if (drafts.some((option) => option.option_value.toLocaleLowerCase() === value.toLocaleLowerCase() || option.display_label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) return setError("An option with this value or label already exists.");
    const draftKey = crypto.randomUUID();
    setDrafts((current) => [...current, { id: `draft:${draftKey}`, draftKey, field_key: field, option_value: value, display_label: label, sort_order: current.length * 10, active: true, is_system: false, usage_count: 0, originalLabel: label, originalColor: null, originalActive: true, isNew: true }]);
    setNewLabel("");
  };

  const save = async () => {
    setError(""); setNotice("");
    if (!token) { setError("Your session has expired. Please log in again."); return; }
    if (pending.some((option) => !option.display_label.trim())) { setError("Option labels cannot be empty."); return; }
    const labels = new Set<string>(); const values = new Set<string>();
    for (const option of drafts) {
      const label = option.display_label.trim().toLocaleLowerCase();
      const value = option.option_value.trim().toLocaleLowerCase();
      if (labels.has(label) || values.has(value)) { setError("Each option needs a unique label and stored value."); return; }
      labels.add(label); values.add(value);
    }
    setBusy(true); let completed = 0;
    const completedDrafts = new Set<string>();
    try {
      for (const draft of pending) {
        if (draft.isNew) {
          await addDropdownOption(token, { field_key: field, option_value: draft.option_value, display_label: draft.display_label.trim(), color: draft.color ?? null, sort_order: draft.sort_order });
        } else {
          const original = options.find((option) => option.id === draft.id);
          if (!original) throw new Error(`Option ${draft.option_value} no longer exists. Refresh and review changes.`);
          const label = draft.display_label.trim();
          const needsConfirmation = original.usage_count > 0 && (label !== original.display_label || !draft.active);
          const confirmed = needsConfirmation && window.confirm(`This option is used by ${original.usage_count} record(s). Changing its display label keeps the stored value unchanged. Continue?`);
          if (needsConfirmation && !confirmed) throw new Error("Option changes were cancelled.");
          await editDropdownOption(token, original.id, { display_label: label, color: draft.color ?? null, active: draft.active, ...(!draft.active?{remove_if_unused:true}:{}), ...(confirmed ? { confirm_in_use: true } : {}) });
        }
        completed += 1;
        completedDrafts.add(draft.draftKey);
      }
      const refreshed = await fetchDropdownOptions(token);
      onOptionsUpdated(refreshed);
      setDrafts(initialDrafts(refreshed, field));
      setNotice(completed ? `${completed} change(s) saved.` : "There are no pending changes.");
    } catch (cause) {
      const refreshed = await fetchDropdownOptions(token).catch(() => null);
      if (refreshed) {
        onOptionsUpdated(refreshed);
        const latestById = new Map(refreshed.filter((option) => option.field_key === field).map((option) => [option.id, option]));
        const latestByValue = new Map(refreshed.filter((option) => option.field_key === field).map((option) => [option.option_value.toLocaleLowerCase(), option]));
        setDrafts((current) => current.flatMap((draft) => {
          const latest = draft.isNew ? latestByValue.get(draft.option_value.toLocaleLowerCase()) : latestById.get(draft.id);
          if (!latest) return [draft];
          if (completedDrafts.has(draft.draftKey)) return [{ ...latest, draftKey: draft.draftKey, originalLabel: latest.display_label, originalColor: latest.color, originalActive: latest.active, isNew: false }];
          return [{ ...latest, draftKey: draft.draftKey, originalLabel: latest.display_label, originalColor: latest.color, originalActive: latest.active, display_label: draft.display_label, isNew: false }];
        }));
      }
      setError(`${cause instanceof Error ? cause.message : "Unable to save dropdown options."}${completed ? ` ${completed} earlier change(s) were saved; review the options before retrying.` : ""}`);
    } finally { setBusy(false); }
  };

  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 al-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-dropdown-manager-title" className="max-h-[min(80vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h2 id="report-dropdown-manager-title" className="text-sm font-semibold text-slate-900">Configure dropdown</h2><p className="mt-1 text-xs text-slate-600">Column: {field.replace(/_/g," ")} ? Input type: Dropdown</p><p className="mt-1 text-xs text-slate-500">Edit several labels or add options, then save once. Requests run in sequence; a failure can leave earlier changes saved.</p></div><button type="button" title="Close" aria-label="Close option manager" disabled={busy} onClick={close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}{notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}
      <div className="mt-3 space-y-1">{drafts.filter(option=>option.active).map(option=><div key={option.draftKey} className="flex items-center gap-2 border-b border-slate-100 py-1">
        <input id={`option-label-${option.draftKey}`} aria-label="Option display name" disabled={busy} value={option.display_label} onChange={event=>setDrafts(current=>current.map(item=>item.draftKey===option.draftKey?{...item,display_label:event.target.value}:item))} className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-300"/>
        <input type="color" aria-label={`Color for ${option.display_label}`} disabled={busy} value={option.color||"#e2e8f0"} onChange={event=>setDrafts(current=>current.map(item=>item.draftKey===option.draftKey?{...item,color:event.target.value}:item))} className="h-6 w-6 border border-slate-200 bg-white p-0.5"/>
        <button type="button" title="Rename option" aria-label={`Rename ${option.display_label}`} disabled={busy} onClick={()=>{const input=document.getElementById(`option-label-${option.draftKey}`) as HTMLInputElement|null;input?.focus();input?.select();}} className="p-1 text-slate-500"><Pencil className="h-3.5 w-3.5"/></button>
        <button type="button" title="Remove unused option" aria-label={`Remove ${option.display_label}`} disabled={busy||option.is_system} onClick={()=>{if(option.usage_count){setError("This option is used by existing records and cannot be removed.");return;}setDrafts(current=>option.isNew?current.filter(item=>item.draftKey!==option.draftKey):current.map(item=>item.draftKey===option.draftKey?{...item,active:false}:item));}} className="p-1 text-rose-600 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5"/></button>
      </div>)}</div>
      {field === "letter_status" ? <p className="mt-4 text-xs text-slate-500">Letter status values are fixed by the existing system configuration.</p> : <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); stageOption(); }}><input aria-label="New dropdown option label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} maxLength={80} placeholder="Add an option to this draft" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" /><button type="submit" disabled={busy || !newLabel.trim()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#0b2341] hover:bg-slate-50 disabled:opacity-50">Add to list</button></form>}
      <p className="mt-3 text-[11px] text-slate-500">Only unused options can be removed from choices. Historical stored values remain intact.</p>
      <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={close} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button><button type="button" disabled={busy || pending.length === 0} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17375f] disabled:opacity-50">{busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}{busy ? "Saving changes…" : "Save Changes"}</button></div>
    </section>
  </div>, document.body);
}
