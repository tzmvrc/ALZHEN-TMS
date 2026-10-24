import { useEffect, useId, useRef, useState } from "react";
import type { ImportTarget } from "../../services/trip-import.service";
import type { TripRecord } from "../../services/trip.service";
import { fieldControl, focusRing, secondaryAction } from "./shared/styles";

/** Destination selection only; fetching and target mutations stay with the importer. */
export default function ImportDispatchTarget({ group, target, existing, disabled, onChange, onSearch }: {
  group: string; target: ImportTarget; existing: TripRecord[]; disabled: boolean;
  onChange: (patch: Partial<ImportTarget>) => void; onSearch: (query: string) => Promise<TripRecord[]>;
}) {
  const [query, setQuery] = useState(""), [results, setResults] = useState<TripRecord[] | null>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const id = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { if (open) optionRefs.current[active]?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  const rows = results ?? existing;
  const options = (target.mode === "trip" ? rows : rows.filter((row, index, all) => all.findIndex(item => item.dispatch_number === row.dispatch_number) === index))
    .map(row => ({ value: String(target.mode === "trip" ? row.id : row.dispatch_number), label: `${row.dispatch_number}${target.mode === "trip" ? ` / ${row.trip_reference ?? row.trip_number ?? row.id}` : ""}` }));
  const selected = existing.find(row => String(target.mode === "trip" ? row.id : row.dispatch_number) === target.value);
  const selectedLabel = selected ? `${selected.dispatch_number}${target.mode === "trip" ? ` / ${selected.trip_reference ?? selected.trip_number ?? selected.id}` : ""}` : target.value;
  async function search() {
    setLoading(true); setError("");
    try { setResults(await onSearch(query)); setOpen(true); setActive(0); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to find trips."); }
    finally { setLoading(false); }
  }
  const choose = (value: string) => { onChange({ value }); setOpen(false); setQuery(""); };
  return <div className="space-y-4">
    <div role="radiogroup" aria-label={`Destination for ${group}`} className="flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1">{([
      ["new", "New dispatch"], ["dispatch", "Existing dispatch"], ["trip", "Append to existing trip"],
    ] as const).map(([mode, label]) => <button type="button" role="radio" aria-checked={target.mode === mode} disabled={disabled} key={mode} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${focusRing} ${target.mode === mode ? "bg-[#0b2341] text-white" : "text-slate-600 hover:bg-white"}`} onClick={() => { onChange({ mode, value: "" }); setOpen(false); setQuery(""); setActive(0); }}>{label}</button>)}</div>
    <p className="text-xs text-slate-500">{target.mode === "new" ? "Create a new dispatch and trip for this group." : target.mode === "dispatch" ? "Create a new trip within the selected dispatch." : "Add these source products and stops to the selected trip. Existing trip details stay unchanged."}</p>
    {target.mode !== "new" && <div className="space-y-2">
      {target.value && <p className="break-words text-xs font-semibold text-[#0b2341]">Selected {target.mode}: {selectedLabel}</p>}
      <div className="flex gap-2"><input role="combobox" aria-label={`Search existing ${target.mode} for ${group}`} aria-expanded={open} aria-controls={`${id}-results`} aria-autocomplete="list" aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined} className={fieldControl} disabled={disabled || loading} placeholder="Search dispatch or trip number" value={query} onChange={event => { setQuery(event.target.value); setOpen(false); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(index => Math.min(Math.max(0, options.length - 1), Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter") { event.preventDefault(); if (open && options[active]) choose(options[active].value); else if (!loading) void search(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      }} /><button type="button" className={secondaryAction} disabled={disabled || loading} onClick={() => void search()}>{loading ? "Searching..." : "Find trips"}</button></div>
      {open && <div role="listbox" id={`${id}-results`} aria-label={`Existing ${target.mode} for ${group}`} className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">{options.map((option, index) => <button ref={node => { optionRefs.current[index] = node; }} type="button" role="option" aria-selected={index === active} id={`${id}-${index}`} key={option.value} disabled={disabled} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(option.value)} className={`block w-full px-3 py-2 text-left text-xs ${focusRing} ${index === active ? "bg-blue-50 text-[#0b2341]" : "text-slate-600 hover:bg-slate-50"}`}>{option.label}</button>)}{!options.length && <p className="p-3 text-xs text-slate-500">No matching trips or dispatches. Refine the search.</p>}</div>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </div>}
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><input type="checkbox" className={`mt-0.5 h-4 w-4 accent-[#2678b9] ${focusRing}`} disabled={disabled} checked={target.allow_create} onChange={event => onChange({ allow_create: event.target.checked })} /><span><strong className="block">Create missing records</strong><span className="mt-1 block leading-5 text-slate-500">Allow missing customer, store and product records to be created from reviewed source values. Physical trucks must still be selected. Source warehouses can be selected or explicitly added from their CSV names; identifiers are never guessed.</span></span></label>
  </div>;
}
