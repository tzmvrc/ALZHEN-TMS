import { useEffect, useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { useTopbarFilter } from "./topbarFilters";

export default function TopbarFilterButton({ scope }: { scope: string }) {
  const config = useTopbarFilter(scope);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [scope]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!config?.options.length) return null;
  const active = config.options.find(option => option.value === config.value);
  const filtered = config.value !== config.options[0]?.value;
  return <div ref={root} className="al-search-filter" onKeyDown={event => event.stopPropagation()}>
    <button type="button" aria-label={`Filter: ${active?.label ?? config.label}`} title={config.label} aria-haspopup="menu" aria-expanded={open} disabled={config.disabled} data-active={filtered || undefined} onClick={() => setOpen(value => !value)}><ListFilter aria-hidden="true" size={16}/></button>
    {open && <div role="menu" aria-label={config.label} className="al-search-filter-menu">
      {config.options.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={config.value === option.value} disabled={config.disabled} onClick={() => { config.onChange(option.value); setOpen(false); }}><span>{option.label}</span>{config.value === option.value && <span aria-hidden="true">✓</span>}</button>)}
    </div>}
  </div>;
}
