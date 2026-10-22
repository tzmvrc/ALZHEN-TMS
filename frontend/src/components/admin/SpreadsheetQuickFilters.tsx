type Option = {value: string; label: string};
/** Shared Master List appearance; each sheet supplies its own stored values. */
export default function SpreadsheetQuickFilters({label, options, value, disabled, onChange}: {
  label: string; options: readonly Option[]; value: string; disabled?: boolean; onChange: (value: string) => void;
}) {
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} disabled={disabled} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={`inline-flex h-8 items-center rounded-full border px-3 text-xs disabled:opacity-50 ${value === option.value ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{option.label}</button>)}
  </div>;
}
