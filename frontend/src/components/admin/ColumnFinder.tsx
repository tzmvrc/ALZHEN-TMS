import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { Search, X } from "lucide-react";

type Column = { key: string; title: string; hidden?: boolean; index: number };
export default function ColumnFinder({ columns, viewport, getHeader, onReveal, leadingColumns = 1 }: { columns: readonly Column[]; viewport: RefObject<HTMLDivElement | null>; getHeader: (key: string) => HTMLElement | null | undefined; onReveal: (key: string) => void; leadingColumns?: number }) {
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const list = `${scope}-columns`;
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => columns.filter((column) => column.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [columns, query]);
  const found = columns.find((column) => column.key === selected);
  const child = found && !found.hidden ? found.index + leadingColumns + 1 : 0;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.setAttribute("data-column-finder-scope", scope);
    return () => { element.removeAttribute("data-column-finder-scope"); };
  }, [viewport, scope, child]);
  function choose(column: Column) {
    if (column.hidden) onReveal(column.key);
    setSelected(column.key); setQuery(column.title); setOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const header = getHeader(column.key);
      if (!header || !viewport.current) return;
      const style = getComputedStyle(header);
      if (style.position === "sticky" && (style.left !== "auto" || style.right !== "auto")) return;
      header.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }));
  }
  return <div ref={root} className="relative w-44 shrink-0" onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    {child > 0 && <style>{`[data-column-finder-scope="${scope}"] table > thead > tr > th:nth-child(${child}), [data-column-finder-scope="${scope}"] table > tbody > tr > td:nth-child(${child}) { box-shadow: inset 0 0 0 2px #eab30899 !important; background-image: linear-gradient(#fef08a33,#fef08a33) !important; }`}</style>}
    <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-3 h-3.5 w-3.5 text-slate-400" />
    <input role="combobox" aria-label="Find a column" aria-expanded={open} aria-controls={list} aria-autocomplete="list" aria-activedescendant={open && matches.length ? `${list}-${Math.min(active, matches.length - 1)}` : undefined} value={query} placeholder="Find column…" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs outline-none focus:border-blue-400" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }} onKeyDown={(event) => {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
      if (event.key === "Escape") { setOpen(false); setSelected(null); setQuery(""); }
      if (event.key === "ArrowDown") { setOpen(true); setActive((current) => Math.min(current + 1, Math.max(0, matches.length - 1))); }
      if (event.key === "ArrowUp") { setOpen(true); setActive((current) => Math.max(0, current - 1)); }
      if (event.key === "Enter" && matches.length) choose(matches[Math.min(active, matches.length - 1)]);
    }} />
    {(query || selected) && <button type="button" aria-label="Clear column finder" onClick={() => { setQuery(""); setSelected(null); setOpen(false); }} className="absolute right-1 top-2 rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>}
    {open && <div id={list} role="listbox" aria-label="Matching columns" className="absolute right-0 top-full z-[150] mt-1 max-h-64 min-w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
      {matches.length ? matches.map((column, index) => <button type="button" role="option" aria-selected={active === index} id={`${list}-${index}`} key={column.key} className={`block w-full rounded px-3 py-2 text-left text-xs ${active === index ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`} onClick={() => choose(column)}>{column.title}{column.hidden ? " (reveal hidden column)" : ""}</button>) : <p className="p-3 text-xs text-slate-500">No matching columns</p>}
    </div>}
  </div>;
}
