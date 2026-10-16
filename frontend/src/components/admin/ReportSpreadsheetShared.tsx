import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Bold,Italic, EyeOff, LoaderCircle, Paintbrush, Palette, Pencil, Pin, RotateCcw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { addDropdownOption, editDropdownOption, fetchDropdownOptions, type DropdownField, type DropdownOption } from "../../services/dropdown-option.service";
import { REPORT_COLUMN_COLORS, type ReportCellFormat } from "./ReportSpreadsheetUtils";

export function ReportRowActionButton({ action, disabled, onClick, label: customLabel }: { action: "edit" | "delete" | "restore"; disabled?: boolean; onClick: () => void; label?: string }) {
  const label = customLabel ?? (action === "edit" ? "Edit selected row" : action === "restore" ? "Restore selected row" : "Delete selected reports");
  const Icon = action === "edit" ? Pencil : action === "restore" ? RotateCcw : Trash2;
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] disabled:cursor-not-allowed disabled:opacity-50 ${action === "delete" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-[#b7d5ed] text-[#155b8d] hover:bg-[#edf6fd]"}`}>
    <Icon aria-hidden="true" className="h-4 w-4" />
  </button>;
}

export function ReportCellFormattingToolbar({ selectedCellCount, selectionIsBold, selectedTextColor, selectedBackgroundColor, onApply,advanced=false,selectionIsItalic=false,fontSize,fontFamily }: {
  selectedCellCount: number;
  selectionIsBold: boolean;
  selectedTextColor: string | null;
  selectedBackgroundColor: string | null;
  onApply: (change: Partial<ReportCellFormat>) => void;
  advanced?:boolean;selectionIsItalic?:boolean;fontSize?:number|null;fontFamily?:string|null;
}) {
  const [openColorPicker, setOpenColorPicker] = useState<"text" | "background" | null>(null);
  const apply = (change: Partial<ReportCellFormat>) => { onApply(change); setOpenColorPicker(null); };
  const toolbarButtonClass = "inline-flex h-7 w-7 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-40";
  return <div role="toolbar" aria-label="Cell formatting" className="flex min-h-9 items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5">
    {advanced&&<><select aria-label="Font family" value={fontFamily??""} disabled={!selectedCellCount} onChange={e=>apply({fontFamily:e.target.value||null})} className="h-7 max-w-28 rounded border border-slate-200 bg-white px-1 text-xs"><option value="">Default font</option>{["Arial","Calibri","Verdana","Georgia","monospace"].map(v=><option key={v}>{v}</option>)}</select><select aria-label="Font size" value={fontSize??""} disabled={!selectedCellCount} onChange={e=>apply({fontSize:e.target.value?Number(e.target.value):null})} className="h-7 rounded border border-slate-200 bg-white px-1 text-xs"><option value="">Size</option>{[9,10,11,12,13,14,16,18,20,24,28,32].map(v=><option key={v}>{v}</option>)}</select><button type="button" title="Italic selected cells" aria-label="Italic selected cells" aria-pressed={selectionIsItalic} disabled={!selectedCellCount} onMouseDown={e=>e.preventDefault()} onClick={()=>apply({italic:!selectionIsItalic})} className={toolbarButtonClass}><Italic className="h-4 w-4" /></button></>}
    <button type="button" title="Bold selected cells" aria-label="Bold selected cells" aria-pressed={selectionIsBold} disabled={!selectedCellCount} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ bold: !selectionIsBold })} className={`${toolbarButtonClass} ${selectionIsBold ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Bold aria-hidden="true" className="h-4 w-4" /></button>
    <div className="relative">
      <button type="button" title="Text color" aria-label="Text color" aria-expanded={openColorPicker === "text"} disabled={!selectedCellCount} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpenColorPicker((current) => current === "text" ? null : "text")} className={`${toolbarButtonClass} ${openColorPicker === "text" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Palette aria-hidden="true" className="h-4 w-4" /></button>
      {openColorPicker === "text" && <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" aria-label="Text color palette">{["#111827", "#b91c1c", "#d97706", "#15803d", "#1d4ed8", "#7e22ce"].map((color) => <button key={color} type="button" title={`Text color ${color}`} aria-label={`Text color ${color}`} aria-pressed={selectedTextColor === color} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ color })} className={`h-5 w-5 rounded-full border border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedTextColor === color ? "ring-2 ring-slate-800 ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}<button type="button" title="Reset text color" aria-label="Reset text color" aria-pressed={selectedTextColor === ""} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ color: "" })} className="rounded px-1.5 text-[10px] text-slate-600 hover:bg-slate-100">Reset</button></div>}
    </div>
    <div className="relative">
      <button type="button" title="Cell color" aria-label="Cell color" aria-expanded={openColorPicker === "background"} disabled={!selectedCellCount} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpenColorPicker((current) => current === "background" ? null : "background")} className={`${toolbarButtonClass} ${openColorPicker === "background" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Paintbrush aria-hidden="true" className="h-4 w-4" /></button>
      {openColorPicker === "background" && <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" aria-label="Cell color palette">{["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#e5e7eb"].map((color) => <button key={color} type="button" title={`Cell color ${color}`} aria-label={`Cell color ${color}`} aria-pressed={selectedBackgroundColor === (color === "#ffffff" ? "" : color)} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ backgroundColor: color === "#ffffff" ? "" : color })} className={`h-5 w-5 rounded-full border border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedBackgroundColor === (color === "#ffffff" ? "" : color) ? "ring-2 ring-slate-800 ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}<button type="button" title="Reset cell color" aria-label="Reset cell color" aria-pressed={selectedBackgroundColor === ""} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ backgroundColor: "" })} className="rounded px-1.5 text-[10px] text-slate-600 hover:bg-slate-100">Reset</button></div>}
    </div>
    {selectedCellCount > 0 && <span className="ml-2 text-[10px] text-slate-500">{selectedCellCount} cell{selectedCellCount === 1 ? "" : "s"} selected</span>}
  </div>;
}

type SortAction = { label: "Sort ascending" | "Sort descending"; active: boolean; onClick: () => void };
export function ReportColumnActionsMenu({
  title, position, onClose, sortActions, pinned, onTogglePin, onEditColumn,
  onFilter, canManageOptions, onManageOptions, onHide, canHide = true,
}: {
  title: string;
  position: { left: number; top: number };
  onClose: () => void;
  sortActions?: SortAction[];
  pinned: boolean;
  onTogglePin: () => void;
  onEditColumn: () => void;
  onFilter?: () => void;
  canManageOptions?: boolean;
  onManageOptions?: () => void;
  onHide: () => void;
  canHide?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  const itemClass = "flex w-full items-center justify-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#0b2341] hover:text-white focus-visible:bg-[#0b2341] focus-visible:text-white focus-visible:outline-none";
  const run = (action: () => void) => { action(); onClose(); };
  return createPortal(<div className="fixed inset-0 z-[100]" onMouseDown={onClose}>
    <div role="menu" aria-label={`${title} column actions`} onMouseDown={(event) => event.stopPropagation()} style={{ left: position.left, top: position.top }} className="fixed z-[101] w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      <div className="truncate px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {sortActions?.map((action) => <button key={action.label} role="menuitem" type="button" onClick={() => run(action.onClick)} className={`${itemClass} justify-between`}>{action.label}{action.active ? action.label === "Sort ascending" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" /> : null}</button>)}
      {onFilter && <button role="menuitem" type="button" onClick={() => run(onFilter)} className={itemClass}><Search className="h-3.5 w-3.5" />Filter this column</button>}
      <button role="menuitem" type="button" onClick={() => run(onTogglePin)} className={itemClass}><Pin className="h-3.5 w-3.5" />{pinned ? "Unpin" : "Pin"}</button>
      <button role="menuitem" type="button" onClick={() => run(onEditColumn)} className={itemClass}><Palette className="h-3.5 w-3.5" />Edit Column</button>
      {canManageOptions && onManageOptions && <button role="menuitem" type="button" onClick={() => run(onManageOptions)} className={itemClass}><SlidersHorizontal className="h-3.5 w-3.5" />Manage Options</button>}
      {canHide && <button role="menuitem" type="button" onClick={() => run(onHide)} className={itemClass}><EyeOff className="h-3.5 w-3.5" />Hide Column</button>}
    </div>
  </div>, document.body);
}

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
  return createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-column-color-title" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h2 id="report-column-color-title" className="text-sm font-semibold text-slate-900">Edit Column</h2><p className="mt-1 text-xs text-slate-500">Choose a display color for {columnName}.</p></div><button type="button" title="Close" aria-label="Close column color dialog" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <div className="mt-4 flex items-center gap-3"><input aria-label="Column display color" type="color" value={color || "#eaf2fb"} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1" /><span className="text-xs text-slate-600">Color is saved with this browser’s report column preferences.</span></div>
      <div className="mt-4 grid grid-cols-8 gap-2" aria-label="Column color palette">{REPORT_COLUMN_COLORS.map((choice) => <button key={choice} type="button" aria-label={`Set column color ${choice}`} title={choice} aria-pressed={color.toLowerCase() === choice} onClick={() => onChange(choice)} className="h-7 w-7 rounded-full border border-slate-300 ring-offset-2 hover:ring-2 hover:ring-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]" style={{ backgroundColor: choice }} />)}</div>
      <div className="mt-5 flex justify-between"><button type="button" onClick={onReset} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">Reset to default</button><button type="button" onClick={onClose} className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17375f]">Done</button></div>
    </section>
  </div>, document.body);
}

export function ReportTextCellEditor({
  value, type = "text", multiline = false, label, disabled, className, placeholder, maxLength, step,
  commitOnBlur = true, onChange, onCommit, onCancel,
}: {
  value: string;
  type?: "text" | "number" | "date" | "datetime-local";
  multiline?: boolean;
  label: string;
  disabled?: boolean;
  className: string;
  placeholder?: string;
  maxLength?: number;
  step?: number | "any";
  commitOnBlur?: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const skipBlurCommit = useRef(false);
  const keyHandlers = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommit.current = true;
      onCancel();
    }
  };
  const common = {
    autoFocus: true,
    "aria-label": label,
    disabled,
    value,
    placeholder,
    maxLength,
    ...(!multiline && type === "number" ? { step } : {}),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    onBlur: () => {
      if (skipBlurCommit.current) { skipBlurCommit.current = false; return; }
      if (commitOnBlur) onCommit();
    },
    onKeyDown: keyHandlers,
    className,
  };
  return multiline ? <textarea {...common} rows={4} /> : <input {...common} type={type} />;
}

type OptionDraft = DropdownOption & { draftKey: string; originalLabel: string; isNew: boolean };
const initialDrafts = (options: DropdownOption[], field: DropdownField): OptionDraft[] => options.filter((option) => option.field_key === field).map((option) => ({ ...option, draftKey: option.id, originalLabel: option.display_label, isNew: false }));

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
  const pending = useMemo(() => drafts.filter((option) => option.isNew || option.display_label.trim() !== option.originalLabel), [drafts]);
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
    const value = label.toUpperCase();
    if (!label) return setError("Enter an option label.");
    if (label.length > 80) return setError("Option labels can contain at most 80 characters.");
    if (field === "letter_status") return setError("Letter status values are fixed by the system.");
    if (!/^[A-Z0-9][A-Z0-9 _-]{0,59}$/.test(value)) return setError("Use letters, numbers, spaces, hyphens, or underscores.");
    if (drafts.some((option) => option.option_value.toLocaleLowerCase() === value.toLocaleLowerCase() || option.display_label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) return setError("An option with this value or label already exists.");
    const draftKey = crypto.randomUUID();
    setDrafts((current) => [...current, { id: `draft:${draftKey}`, draftKey, field_key: field, option_value: value, display_label: label, sort_order: current.length * 10, active: true, is_system: false, usage_count: 0, originalLabel: label, isNew: true }]);
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
          await addDropdownOption(token, { field_key: field, option_value: draft.option_value, display_label: draft.display_label.trim(), sort_order: draft.sort_order });
        } else {
          const original = options.find((option) => option.id === draft.id);
          if (!original) throw new Error(`Option ${draft.option_value} no longer exists. Refresh and review changes.`);
          const label = draft.display_label.trim();
          const needsConfirmation = original.usage_count > 0 && label !== original.display_label;
          const confirmed = needsConfirmation && window.confirm(`This option is used by ${original.usage_count} record(s). Changing its display label keeps the stored value unchanged. Continue?`);
          if (needsConfirmation && !confirmed) throw new Error("Option changes were cancelled.");
          await editDropdownOption(token, original.id, { display_label: label, ...(confirmed ? { confirm_in_use: true } : {}) });
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
          if (completedDrafts.has(draft.draftKey)) return [{ ...latest, draftKey: draft.draftKey, originalLabel: latest.display_label, isNew: false }];
          return [{ ...latest, draftKey: draft.draftKey, originalLabel: latest.display_label, display_label: draft.display_label, isNew: false }];
        }));
      }
      setError(`${cause instanceof Error ? cause.message : "Unable to save dropdown options."}${completed ? ` ${completed} earlier change(s) were saved; review the options before retrying.` : ""}`);
    } finally { setBusy(false); }
  };

  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-dropdown-manager-title" className="max-h-[min(80vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h2 id="report-dropdown-manager-title" className="text-sm font-semibold text-slate-900">Manage Options</h2><p className="mt-1 text-xs text-slate-500">Edit several labels or add options, then save once. Requests run in sequence; a failure can leave earlier changes saved.</p></div><button type="button" title="Close" aria-label="Close option manager" disabled={busy} onClick={close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}{notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}
      <div className="mt-4 space-y-2">{drafts.map((option) => <div key={option.draftKey} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border p-2.5 ${option.isNew || option.display_label !== option.originalLabel ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}><label className="min-w-0"><span className="sr-only">Display label for {option.option_value}</span><input aria-label={`Display label for ${option.option_value}`} disabled={busy} value={option.display_label} onChange={(event) => setDrafts((current) => current.map((item) => item.draftKey === option.draftKey ? { ...item, display_label: event.target.value } : item))} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-100" /></label><span className="max-w-32 truncate rounded bg-white px-2 py-1 text-[10px] text-slate-500" title={`${option.option_value} · used by ${option.usage_count} record(s)`}>{option.option_value}{option.usage_count ? ` · ${option.usage_count} used` : ""}{!option.active ? " · inactive" : ""}</span><button type="button" title={option.isNew ? "Remove unsaved option" : "Permanent removal is unavailable for saved options"} aria-label={option.isNew ? `Remove new option ${option.display_label}` : `Cannot remove saved option ${option.display_label}`} disabled={busy || !option.isNew} onClick={() => setDrafts((current) => current.filter((item) => item.draftKey !== option.draftKey))} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-4 w-4" /></button></div>)}</div>
      {field === "letter_status" ? <p className="mt-4 text-xs text-slate-500">Letter status values are fixed by the existing system configuration.</p> : <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); stageOption(); }}><input aria-label="New dropdown option label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} maxLength={80} placeholder="Add an option to this draft" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" /><button type="submit" disabled={busy || !newLabel.trim()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#0b2341] hover:bg-slate-50 disabled:opacity-50">Add to list</button></form>}
      <p className="mt-3 text-[11px] text-slate-500">Saved options cannot be safely removed with the current API because report values store text without a foreign key. Removal is available for unsaved additions only.</p>
      <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={close} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button><button type="button" disabled={busy || pending.length === 0} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17375f] disabled:opacity-50">{busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}{busy ? "Saving changes…" : "Save Changes"}</button></div>
    </section>
  </div>, document.body);
}
