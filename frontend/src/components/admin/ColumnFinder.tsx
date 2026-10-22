import {matchesSpreadsheetSearch} from "../../services/spreadsheet-display";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import TableViewers from "./TableViewers";
import { Search, X } from "lucide-react";
import { scrollToTableColumn } from "./scrollToTableColumn";

type Column = { key: string; title: string; hidden?: boolean; index: number };
export type RowSearch={value:string;onSearch:(query:string)=>void;placeholder?:string};
export default function ColumnFinder({ columns, viewport, getHeader, onReveal, leadingColumns = 1,rowSearch,tableKey }: { columns: readonly Column[]; viewport: RefObject<HTMLDivElement | null>; getHeader: (key: string) => HTMLElement | null | undefined; onReveal: (key: string) => void; leadingColumns?: number;rowSearch?:RowSearch;tableKey?:string }) {
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const list = `${scope}-columns`;
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(rowSearch?.value??"");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const latestSearch = useRef(rowSearch);
  useEffect(() => { latestSearch.current = rowSearch; }, [rowSearch]);
  useEffect(() => {
    if (selected || !latestSearch.current || query.trim() === latestSearch.current.value) return;
    const timer = window.setTimeout(() => latestSearch.current?.onSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query, selected]);
  const offset=rowSearch?1:0;
  const searchRows=(value=query)=>{rowSearch?.onSearch(value.trim());setSelected(null);setOpen(false);};
  const matches = useMemo(() => columns.filter((column) => matchesSpreadsheetSearch(column.title,query)), [columns, query]);
  const found = columns.find((column) => column.key === selected);
  const child = found && !found.hidden ? found.index + leadingColumns + 1 : 0;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.setAttribute("data-column-finder-scope", scope);
    return () => { element.removeAttribute("data-column-finder-scope"); };
  }, [viewport, scope, child]);
  function choose(column: Column) {
    if (rowSearch?.value) rowSearch.onSearch("");
    if (column.hidden) onReveal(column.key);
    setSelected(column.key); setQuery(column.title); setOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const header = getHeader(column.key);
      if (!header || !viewport.current) return;
      scrollToTableColumn(viewport.current, header);
    }));
  }
  return <div className="flex w-full items-center gap-2 sm:w-auto">{tableKey&&<TableViewers table={tableKey}/>}<div ref={root} className={`relative shrink-0 ${rowSearch?"w-full sm:w-72":"w-44"}`} onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    {child > 0 && <style>{`[data-column-finder-scope="${scope}"] table > thead > tr > th:nth-child(${child}), [data-column-finder-scope="${scope}"] table > tbody > tr > td:nth-child(${child}) { box-shadow: inset 0 0 0 2px #eab30899 !important; background-image: linear-gradient(#fef08a33,#fef08a33) !important; }`}</style>}
    <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-3 h-3.5 w-3.5 text-slate-400" />
    <input data-realtime-refresh-safe="true" role="combobox" aria-label={rowSearch?"Search rows or columns":"Find a column"} aria-expanded={open} aria-controls={list} aria-autocomplete="list" aria-activedescendant={open && matches.length+offset>0 ? `${list}-${Math.min(active, matches.length+offset - 1)}` : undefined} value={query} placeholder={rowSearch?.placeholder??"Find column…"} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-8 pr-7 text-xs outline-none focus:border-blue-400" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setSelected(null); setActive(0); setOpen(true); }} onKeyDown={(event) => {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
      if (event.key === "Escape") { setOpen(false); setSelected(null); setQuery(rowSearch?.value??""); }
      if (event.key === "ArrowDown") { setOpen(true); setActive((current) => Math.min(current + 1, Math.max(0, matches.length+offset - 1))); }
      if (event.key === "ArrowUp") { setOpen(true); setActive((current) => Math.max(0, current - 1)); }
      if(event.key==="Enter"){if(rowSearch&&active===0)searchRows(event.currentTarget.value);else if(matches.length)choose(matches[Math.min(Math.max(active-offset,0),matches.length-1)]);}
    }} />
    {(query || selected) && <button type="button" aria-label={rowSearch?"Clear search":"Clear column finder"} onClick={() => { setQuery(""); setSelected(null); setOpen(false);rowSearch?.onSearch(""); }} className="absolute right-1 top-2 rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>}
    {open && <div id={list} role="listbox" aria-label="Matching columns" className="absolute right-0 top-full z-[150] mt-1 max-h-64 min-w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
      {rowSearch&&<><p className="px-3 py-1 text-[10px] font-semibold uppercase text-slate-400">Rows</p><button type="button" role="option" id={`${list}-0`} aria-selected={active===0} className={`block w-full rounded px-3 py-2 text-left text-xs ${active===0?"bg-blue-50 text-blue-800":"text-slate-700"}`} onClick={()=>searchRows()}>{query.trim()?`Search records for “${query.trim()}”`:"Show all records"}</button><p className="px-3 py-1 text-[10px] font-semibold uppercase text-slate-400">Columns</p></>}
      {matches.length ? matches.map((column, index) => <button type="button" role="option" aria-selected={active === index+offset} id={`${list}-${index+offset}`} key={column.key} className={`block w-full rounded px-3 py-2 text-left text-xs ${active === index+offset ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`} onClick={() => choose(column)}>{column.title}{column.hidden ? " (reveal hidden column)" : ""}</button>) : <p className="p-3 text-xs text-slate-500">No matching columns</p>}
    </div>}
  </div></div>;
}
