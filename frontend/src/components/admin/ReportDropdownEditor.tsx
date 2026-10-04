import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pencil, Plus, Save, X } from "lucide-react";
import type { DropdownOption } from "../../services/dropdown-option.service";

export type ReportDropdownChoice = { value: string; label: string };

type ReportDropdownEditorProps = {
  label: string;
  value: string;
  displayValue?: string;
  options: ReportDropdownChoice[];
  knownValues?: string[];
  managedOptions?: DropdownOption[];
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  allowAdd?: boolean;
  canManageOptions?: boolean;
  autoOpen?: boolean;
  onSelect: (value: string) => void;
  onAdd?: (displayLabel: string) => Promise<boolean>;
  onEditOption?: (option: DropdownOption, displayLabel: string) => Promise<boolean>;
  onClose?: () => void;
};

export default function ReportDropdownEditor({
  label,
  value,
  displayValue,
  options,
  knownValues = [],
  managedOptions = [],
  disabled = false,
  loading = false,
  error,
  allowAdd = false,
  canManageOptions = false,
  autoOpen = true,
  onSelect,
  onAdd,
  onEditOption,
  onClose,
}: ReportDropdownEditorProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 240 });
  const [addingOption, setAddingOption] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [managementError, setManagementError] = useState("");

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options
      .filter((option) => `${option.label} ${option.value}`.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => {
        const aStarts = `${a.label} ${a.value}`.toLocaleLowerCase().startsWith(normalized);
        const bStarts = `${b.label} ${b.value}`.toLocaleLowerCase().startsWith(normalized);
        return Number(bStarts) - Number(aStarts);
      });
  }, [options, query]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const exactMatch = options.some((option) => option.value.trim().toLocaleLowerCase() === normalizedQuery || option.label.trim().toLocaleLowerCase() === normalizedQuery) ||
    knownValues.some((knownValue) => knownValue.trim().toLocaleLowerCase() === normalizedQuery);
  const canOfferAdd = canManageOptions && allowAdd && !exactMatch && Boolean(normalizedQuery) && Boolean(onAdd);
  const itemCount = filteredOptions.length + Number(canOfferAdd);

  useEffect(() => {
    if (!open || query) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    if (selectedIndex >= 0) setActiveIndex(selectedIndex);
  }, [open, options, query, value]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 240) - 8)),
        top: Math.min(rect.bottom + 4, window.innerHeight - 290),
        width: Math.max(rect.width, 240),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) || popoverRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      onClose?.();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open && autoOpen) inputRef.current?.focus();
  }, [autoOpen, open]);

  function close() {
    setOpen(false);
    onClose?.();
  }

  async function createOption() {
    const name = newLabel.trim();
    if (!name || !onAdd || busy) return;
    setBusy(true);
    setManagementError("");
    try {
      if (await onAdd(name)) {
        setAddingOption(false);
        setNewLabel("");
        setQuery("");
      }
    } catch (cause) {
      setManagementError(cause instanceof Error ? cause.message : "Unable to add option.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOptionLabel(option: DropdownOption) {
    const name = editingLabel.trim();
    if (!name || !onEditOption || busy) return;
    if (managedOptions.some((other) => other.id !== option.id && other.display_label.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setManagementError("An option with this display label already exists.");
      return;
    }
    setBusy(true);
    setManagementError("");
    try {
      if (await onEditOption(option, name)) setEditingOptionId(null);
    } catch (cause) {
      setManagementError(cause instanceof Error ? cause.message : "Unable to update option label.");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, itemCount - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && !addingOption && !editingOptionId) {
      event.preventDefault();
      if (canOfferAdd && activeIndex === filteredOptions.length) {
        setNewLabel(query.trim());
        setAddingOption(true);
      } else if (filteredOptions.length) {
        onSelect(filteredOptions[Math.min(activeIndex, filteredOptions.length - 1)].value);
        close();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (editingOptionId) setEditingOptionId(null);
      else if (addingOption) setAddingOption(false);
      else close();
      setManagementError("");
    }
  }

  const popover = open ? (
    <div
      ref={popoverRef}
      id={listId}
      role="listbox"
      aria-label={`${label} options`}
      className="fixed z-[120] max-h-[min(75vh,22rem)] overflow-y-auto rounded-xl border border-amber-200 bg-white py-1 shadow-xl"
      style={position}>
      {value && <div className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">Current: <span className="font-semibold text-slate-700">{displayValue ?? value}</span></div>}
      {loading ? (
        <p className="px-3 py-2 text-xs text-slate-500">Loading options...</p>
      ) : error ? (
        <p role="alert" className="px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : filteredOptions.length ? filteredOptions.map((option, index) => {
        const managedOption = managedOptions.find((candidate) => candidate.option_value === option.value);
        const isEditing = managedOption?.id === editingOptionId;
        return (
          <div key={option.value} className={`group flex min-h-10 items-center gap-1 px-1 ${index === activeIndex ? "bg-amber-50" : "hover:bg-amber-50/70"}`}>
            {isEditing && managedOption ? (
              <form className="flex min-w-0 flex-1 items-center gap-1 px-1" onSubmit={(event) => { event.preventDefault(); void saveOptionLabel(managedOption); }}>
                <input autoFocus value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditingOptionId(null); setManagementError(""); } }} aria-label={`Edit display label for ${option.label}`} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-blue-100" />
                <button type="submit" title={busy ? "Saving label..." : "Save label"} aria-label={busy ? "Saving option label" : "Save option label"} disabled={busy || !editingLabel.trim()} className="rounded p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><Save aria-hidden="true" className="h-4 w-4" /></button>
                <button type="button" title="Cancel" aria-label="Cancel label edit" disabled={busy} onClick={() => { setEditingOptionId(null); setManagementError(""); }} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X aria-hidden="true" className="h-4 w-4" /></button>
              </form>
            ) : (
              <>
                <button type="button" role="option" aria-selected={option.value === value} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => { onSelect(option.value); close(); }} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{option.label}</span>
                    <span className="block truncate text-[11px] font-normal text-slate-500">{option.value}</span>
                  </span>
                  {option.value === value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" />}
                </button>
                {canManageOptions && managedOption && onEditOption && (
                  <button type="button" title={`Edit ${option.label} display label`} aria-label={`Edit ${option.label} display label`} onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); setEditingOptionId(managedOption.id); setEditingLabel(managedOption.display_label); setManagementError(""); }} className="rounded p-1 text-slate-400 opacity-0 transition hover:bg-white hover:text-[#2678b9] focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] group-hover:opacity-100"><Pencil aria-hidden="true" className="h-3.5 w-3.5" /></button>
                )}
              </>
            )}
          </div>
        );
      }) : <p className="px-3 py-2 text-xs text-slate-500">No matching options.</p>}

      {canOfferAdd && !addingOption && !loading && !error && (
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setNewLabel(query.trim()); setAddingOption(true); setManagementError(""); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-[#2678b9] hover:bg-blue-50"><Plus aria-hidden="true" className="h-4 w-4" />Add "{query.trim()}"</button>
      )}

      {canManageOptions && allowAdd && onAdd && !loading && !error && !addingOption && !canOfferAdd && (
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setNewLabel(""); setAddingOption(true); setManagementError(""); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-[#2678b9] hover:bg-blue-50"><Plus aria-hidden="true" className="h-4 w-4" />Add option</button>
      )}

      {addingOption && (
        <form onSubmit={(event) => { event.preventDefault(); void createOption(); }} className="grid gap-2 border-t border-slate-100 bg-slate-50 p-2.5">
          <label className="grid gap-1 text-xs font-medium text-slate-600">New display label<input autoFocus maxLength={80} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setAddingOption(false); setManagementError(""); } }} className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-normal text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-blue-100" /></label>
          <div className="flex justify-end gap-1.5"><button type="button" disabled={busy} onClick={() => { setAddingOption(false); setManagementError(""); }} className="rounded-md px-2.5 py-1.5 text-xs text-slate-600 hover:bg-white">Cancel</button><button type="submit" disabled={busy || !newLabel.trim()} className="rounded-md bg-[#0b2341] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save option"}</button></div>
        </form>
      )}
      {managementError && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{managementError}</p>}
    </div>
  ) : null;

  return (
    <>
      <div ref={rootRef} className="relative min-w-[150px] max-w-full">
        {open ? (
          <input ref={inputRef} type="text" role="combobox" aria-label={`Search ${label} options`} aria-autocomplete="list" aria-expanded="true" aria-controls={listId} autoComplete="off" disabled={disabled || busy} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder={(displayValue ?? value) ? `Current: ${displayValue ?? value}` : `Search ${label.toLowerCase()}`} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:opacity-60" />
        ) : (
          <button type="button" disabled={disabled} onClick={() => { setQuery(""); setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value))); setOpen(true); }} className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-sm hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60">
            <span className="truncate">{(displayValue ?? value) || `Choose ${label.toLowerCase()}`}</span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700" />
          </button>
        )}
        {open && <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700" />}
      </div>
      {popover && typeof document !== "undefined" && createPortal(popover, document.body)}
    </>
  );
}
