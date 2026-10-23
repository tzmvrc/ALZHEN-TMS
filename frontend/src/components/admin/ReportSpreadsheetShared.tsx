import { dropdownStoredValue } from "../../services/dropdown-option.service";
import { useLiveCellEditor } from "./useLiveCellEditor";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type ChangeEvent, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ALargeSmall, Bold,Italic,Underline, EyeOff, LoaderCircle, Paintbrush, Palette, Pencil, Pin, RotateCcw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { addDropdownOption, editDropdownOption, fetchDropdownOptions, type DropdownField, type DropdownOption } from "../../services/dropdown-option.service";
import { REPORT_COLUMN_COLORS, type ReportCellFormat } from "./ReportSpreadsheetUtils";

export function ReportRowActionButton({ action, disabled, onClick, label: customLabel }: { action: "edit" | "delete" | "restore"; disabled?: boolean; onClick: () => void; label?: string }) {
  const label = customLabel ?? (action === "edit" ? "Edit selected row" : action === "restore" ? "Restore selected row" : "Delete selected reports");
  const Icon = action === "edit" ? Pencil : action === "restore" ? RotateCcw : Trash2;
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] disabled:cursor-not-allowed disabled:opacity-50 ${action === "delete" ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-[#b7d5ed] text-[#155b8d] hover:bg-[#edf6fd]"}`}>
    <Icon aria-hidden="true" className="h-4 w-4" />
  </button>;
}

export function ReportCellFormattingToolbar({ selectedCellCount, selectionIsBold, selectedTextColor, selectedBackgroundColor, onApply,advanced=true,selectionIsItalic=false,selectionIsUnderlined=false, headerOnly=false, headerSelection=false, selectedFontSize=12, formulaBar, compact=false, actions, colorsLocked=false }: {
  colorsLocked?: boolean;
  actions?:ReactNode;
  formulaBar?:ReactNode;
  compact?:boolean;
  selectedCellCount: number;
  selectionIsBold: boolean;
  selectedTextColor: string | null;
  selectedBackgroundColor: string | null;
  onApply: (change: Partial<ReportCellFormat>) => void;
  advanced?:boolean;selectionIsItalic?:boolean;selectionIsUnderlined?:boolean;headerOnly?:boolean;headerSelection?:boolean;selectedFontSize?:number;
}) {
  const [fontOpen,setFontOpen]=useState(false);
  const fontControl=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{if(!fontOpen)return;const outside=(event:PointerEvent)=>{if(!fontControl.current?.contains(event.target as Node))setFontOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setFontOpen(false);fontControl.current?.querySelector<HTMLButtonElement>("button")?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape,true);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape,true);};},[fontOpen]);
  const [colorPicker, setOpenColorPicker] = useState<"text" | "background" | null>(null);
  const openColorPicker = colorsLocked ? null : colorPicker;
  const apply = (change: Partial<ReportCellFormat>) => { onApply(change); setOpenColorPicker(null); };
  const toolbarButtonClass = "inline-flex h-7 w-7 items-center justify-center rounded-sm border disabled:cursor-not-allowed disabled:opacity-40";
  const plainFormatButtonClass = (active: boolean) => `inline-flex h-7 w-7 items-center justify-center border-0 bg-transparent p-0 shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 ${active ? "text-blue-700 hover:text-blue-800" : "text-slate-500 hover:text-slate-900"}`;
  return <div role="toolbar" data-spreadsheet-formatting="true" aria-label="Cell formatting" className={compact ? "flex min-w-0 items-center gap-1 px-1 py-0.5" : "flex min-h-9 min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-1"}>
    <div className="flex min-w-0 flex-wrap items-center gap-1">
    {!compact&&<div ref={fontControl} className="relative"><button type="button" title="Font size" aria-label="Font size" aria-haspopup="listbox" aria-expanded={fontOpen} disabled={!selectedCellCount} onMouseDown={event=>event.preventDefault()} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();setFontOpen(true);requestAnimationFrame(()=>fontControl.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus());}}} onClick={()=>{setOpenColorPicker(null);setFontOpen(current=>!current);}} className={`${toolbarButtonClass} ${fontOpen?"border-blue-300 bg-blue-100 text-blue-800":"border-transparent text-slate-600 hover:bg-white"}`}><ALargeSmall aria-hidden="true" className="h-[18px] w-[18px]"/></button>{fontOpen&&<div role="listbox" aria-label="Font size" onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));const at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(at+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();}}} className="absolute left-0 top-full z-[120] mt-1 grid min-w-24 rounded border border-slate-200 bg-white p-1 shadow-lg"><span className="px-2 py-1 text-[10px] text-slate-500">Current: {selectedFontSize}px</span>{[...new Set([10,11,12,13,14,16,18,20,selectedFontSize])].sort((a,b)=>a-b).map(size=><button key={size} type="button" role="option" aria-selected={size===selectedFontSize} onMouseDown={event=>event.preventDefault()} onClick={()=>{apply({fontSize:size});setFontOpen(false);}} className={`rounded px-2 py-1 text-left text-xs hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none ${size===selectedFontSize?"font-semibold text-blue-700":"text-slate-700"}`}>{size}px</button>)}</div>}</div>}
    {!headerOnly && <button type="button" title="Bold selected cells" aria-label="Bold selected cells" aria-pressed={selectionIsBold} disabled={!selectedCellCount} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ bold: !selectionIsBold })} className={`${toolbarButtonClass} ${selectionIsBold ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Bold aria-hidden="true" className="h-4 w-4" /></button>}
    {advanced&&!headerOnly&&<><button type="button" title="Italic selected cells" aria-label="Italic selected cells" aria-pressed={selectionIsItalic} disabled={!selectedCellCount} onMouseDown={e=>e.preventDefault()} onClick={()=>apply({italic:!selectionIsItalic})} className={plainFormatButtonClass(selectionIsItalic)}><Italic className="h-4 w-4" /></button>{!compact&&<button type="button" aria-label="Underline selected cells" title="Underline selected cells" aria-pressed={selectionIsUnderlined} disabled={!selectedCellCount} onMouseDown={e=>e.preventDefault()} onClick={()=>apply({underline:!selectionIsUnderlined})} className={plainFormatButtonClass(selectionIsUnderlined)}><Underline className="h-4 w-4"/></button>}</>}
    <div className="relative">
      <button type="button" title={colorsLocked ? "Header colors follow the original Excel groups" : "Text color"} aria-label="Text color" aria-expanded={!colorsLocked && openColorPicker === "text"} disabled={!selectedCellCount || colorsLocked} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpenColorPicker((current) => current === "text" ? null : "text")} className={`${toolbarButtonClass} ${openColorPicker === "text" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Palette aria-hidden="true" className="h-4 w-4" /></button>
      {openColorPicker === "text" && <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" aria-label="Text color palette">{["#111827", "#b91c1c", "#d97706", "#15803d", "#1d4ed8", "#7e22ce"].map((color) => <button key={color} type="button" title={`Text color ${color}`} aria-label={`Text color ${color}`} aria-pressed={selectedTextColor === color} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ color })} className={`h-5 w-5 rounded-full border border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedTextColor === color ? "ring-2 ring-slate-800 ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}<button type="button" title="Reset text color" aria-label="Reset text color" aria-pressed={selectedTextColor === ""} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ color: "" })} className="rounded px-1.5 text-[10px] text-slate-600 hover:bg-slate-100">Reset</button></div>}
    </div>
    <div className="relative">
      <button type="button" title={colorsLocked ? "Header colors follow the original Excel groups" : "Cell color"} aria-label="Cell color" aria-expanded={!colorsLocked && openColorPicker === "background"} disabled={!selectedCellCount || colorsLocked} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpenColorPicker((current) => current === "background" ? null : "background")} className={`${toolbarButtonClass} ${openColorPicker === "background" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900"}`}><Paintbrush aria-hidden="true" className="h-4 w-4" /></button>
      {openColorPicker === "background" && <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" aria-label="Cell color palette">{["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#e5e7eb"].map((color) => <button key={color} type="button" title={`Cell color ${color}`} aria-label={`Cell color ${color}`} aria-pressed={selectedBackgroundColor === (color === "#ffffff" && !headerOnly&&!headerSelection ? "" : color)} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ backgroundColor: color === "#ffffff" && !headerOnly&&!headerSelection ? "" : color })} className={`h-5 w-5 rounded-full border border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedBackgroundColor === (color === "#ffffff" && !headerOnly&&!headerSelection ? "" : color) ? "ring-2 ring-slate-800 ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}<button type="button" title="Reset cell color" aria-label="Reset cell color" aria-pressed={selectedBackgroundColor === ""} onMouseDown={(event) => event.preventDefault()} onClick={() => apply({ backgroundColor: "" })} className="rounded px-1.5 text-[10px] text-slate-600 hover:bg-slate-100">Reset</button></div>}
    </div>
    {!compact&&selectedCellCount > 0 && <span className="ml-2 text-[10px] text-slate-500">{headerOnly||headerSelection ? "Header selected" : `${selectedCellCount} cell${selectedCellCount === 1 ? "" : "s"} selected`}</span>}
    </div>
    {actions}
    {formulaBar && <div className="min-w-0 flex-[1_1_14rem]">{formulaBar}</div>}
  </div>;
}

export type SortAction = { label: "Sort ascending" | "Sort descending"; active: boolean; onClick: () => void };
export function ReportColumnActionsMenu({
  title, position, onClose, sortActions, pinned, onTogglePin, onEditColumn,
  onFilter, canManageOptions, onManageOptions, onRename, onRestoreTitle, onConfigureInput, onHide, canHide = true, extraActions, viewportBounded=false,
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
  onRename?: () => void; onRestoreTitle?: () => void; onConfigureInput?: () => void;
  onHide: () => void;
  canHide?: boolean;
  extraActions?:Array<{label:string;onClick:()=>void;disabled?:boolean}>;
  viewportBounded?:boolean;
}) {
  const panel=useRef<HTMLDivElement>(null);
  const [boundedPosition,setBoundedPosition]=useState(position);
  useLayoutEffect(()=>{
    if(!viewportBounded)return;const rect=panel.current?.getBoundingClientRect();if(!rect)return;
    setBoundedPosition({left:Math.max(8,Math.min(position.left,window.innerWidth-rect.width-8)),top:Math.max(8,Math.min(position.top,window.innerHeight-rect.height-8))});
  },[viewportBounded,position.left,position.top]);
  useEffect(()=>{if(!viewportBounded)return;const dismiss=(event:Event)=>{if(event.target instanceof Node&&panel.current?.contains(event.target))return;onClose();};window.addEventListener("resize",dismiss);window.addEventListener("scroll",dismiss,true);return()=>{window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);};},[viewportBounded,onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  const itemClass = "flex w-full items-center justify-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#0b2341] hover:text-white focus-visible:bg-[#0b2341] focus-visible:text-white focus-visible:outline-none";
  const run = (action: () => void) => { action(); onClose(); };
  return createPortal(<div className="fixed inset-0 z-[100]" onMouseDown={onClose}>
    <div ref={panel} role="menu" aria-label={`${title} column actions`} onMouseDown={(event) => event.stopPropagation()} style={viewportBounded?boundedPosition:position} className="fixed z-[101] max-h-[calc(100vh-16px)] overflow-y-auto w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      <div className="truncate px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {onRename && <button role="menuitem" type="button" onClick={()=>run(onRename)} className={itemClass}>Rename column</button>}
      {onRestoreTitle && <button role="menuitem" type="button" onClick={()=>run(onRestoreTitle)} className={itemClass}>Restore default column title</button>}
      {onConfigureInput && <button role="menuitem" type="button" onClick={()=>run(onConfigureInput)} className={itemClass}>Configure input type / option colors</button>}
      {sortActions?.map((action) => <button key={action.label} role="menuitem" type="button" onClick={() => run(action.onClick)} className={`${itemClass} justify-between`}>{action.label}{action.active ? action.label === "Sort ascending" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" /> : null}</button>)}
      {extraActions?.map(action=><button key={action.label} role="menuitem" type="button" disabled={action.disabled} onClick={()=>run(action.onClick)} className={`${itemClass} disabled:opacity-40 disabled:cursor-default`}>{action.label}</button>)}
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
      <div className="mt-4 flex items-center gap-3"><input aria-label="Column display color" type="color" value={color || "#eaf2fb"} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1" /><span className="text-xs text-slate-600">Color is shared with authorized users of this table.</span></div>
      <div className="mt-4 grid grid-cols-8 gap-2" aria-label="Column color palette">{REPORT_COLUMN_COLORS.map((choice) => <button key={choice} type="button" aria-label={`Set column color ${choice}`} title={choice} aria-pressed={color.toLowerCase() === choice} onClick={() => onChange(choice)} className="h-7 w-7 rounded-full border border-slate-300 ring-offset-2 hover:ring-2 hover:ring-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]" style={{ backgroundColor: choice }} />)}</div>
      <div className="mt-5 flex justify-between"><button type="button" onClick={onReset} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">Reset to default</button><button type="button" onClick={onClose} className="rounded-lg bg-[#0b2341] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17375f]">Done</button></div>
    </section>
  </div>, document.body);
}

export function ReportTextCellEditor({
  value, type = "text", multiline = false, label, disabled, className, placeholder, maxLength, step,
  commitOnBlur = true, onChange, onCommit, onCancel, saveState, buffered = false,
}: {
  value: string;
  type?: "text" | "number" | "date" | "time" | "datetime-local";
  multiline?: boolean;
  label: string;
  disabled?: boolean;
  className: string;
  placeholder?: string;
  maxLength?: number;
  step?: number | "any";
  commitOnBlur?: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void | Promise<boolean | void>;
  onCancel: () => void;
  saveState?: string;
  buffered?: boolean;
}) {
  // Optional local buffer keeps large report owners out of the typing path.
  // Parent-driven edits (mentions, canonical saves) still replace the base.
  const [draft,setDraft]=useState({base:value,text:value});
  if(draft.base!==value)setDraft({base:value,text:value});
  const displayed=buffered&&draft.base===value?draft.text:value;
  const live=useLiveCellEditor(displayed,saveState);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const element = editorRef.current;
    if (!(element instanceof HTMLTextAreaElement)) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(20, element.scrollHeight)}px`;
  });
  useEffect(()=>{
    const element=editorRef.current;if(type!=="number"||!element)return;
    const preventStep=(event:Event)=>{if(document.activeElement===element)event.preventDefault();};
    element.addEventListener("wheel",preventStep,{passive:false});return()=>element.removeEventListener("wheel",preventStep);
  },[type]);
  const skipBlurCommit = useRef(false);
  const keyHandlers = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      live.commit(()=>onCommit(displayed));
    } else if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommit.current = true;
      live.cancel();
      onCancel();
    }
  };
  const common = {
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => { editorRef.current = element; },
    autoFocus: true,
    "aria-label": label,
    disabled,
    value:displayed,
    placeholder,
    maxLength,
    ...(!multiline && type === "number" ? { step } : {}),
    onFocus: live.focus,

    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const next=event.target.value; if(buffered)setDraft({base:value,text:next}); live.change(next); onChange(next); },
    onBlur: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Formula editing is a focus handoff, not a formatting click or a source save.
      if ((event.relatedTarget as Element | null)?.closest("[data-formula-bar],[data-spreadsheet-context-menu]")) return;
      if ((event.relatedTarget as Element | null)?.closest("[data-spreadsheet-formatting]")) {
        requestAnimationFrame(() => editorRef.current?.focus());
        return;
      }
      live.blur();
      if (skipBlurCommit.current) { skipBlurCommit.current = false; return; }
      if (commitOnBlur) live.commit(()=>onCommit(displayed));
    },
    onKeyDown: keyHandlers,
    className: `spreadsheet-cell-editor ${className}`,
  };
  return multiline ? <textarea {...common} rows={1} /> : <input {...common} type={type} />;
}

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
  return createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
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
