import { useId, useState, type ReactNode } from "react";
import { ChevronDown, CheckCircle2, AlertCircle } from "lucide-react";
import type { ReviewCheck } from "./shared/ReviewChecklist";
import type { ImportOutcome, ImportPreview } from "../../services/trip-import.service";
import { storeLocationLabel } from "../../services/store-location";
import { tripSecondaryAction } from "./shared/TripModalUI";

export function CsvSourceTabs({ children }: { children: (tab: "source" | "mapped" | "mapping") => ReactNode }) {
  const [tab, setTab] = useState<"source" | "mapped" | "mapping">("source");
  const id = useId();
  const tabs = [["source", "Original CSV"], ["mapped", "Mapped fields"], ["mapping", "Column mapping"]] as const;
  return <div id="csv-source-review" tabIndex={-1}><div role="tablist" aria-label="CSV source views" className="trip-csv-tabs">{tabs.map(([key, label], index) => <button type="button" key={key} id={`${id}-${key}`} role="tab" aria-selected={tab === key} aria-controls={`${id}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
    setTab(tabs[next][0]); document.getElementById(`${id}-${tabs[next][0]}`)?.focus();
  }}>{label}</button>)}</div><div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>{children(tab)}</div></div>;
}

export function TripGroupPanel({ group, index, summary, items, children }: { group: string; index: number; summary: ReactNode; items: readonly ReviewCheck[]; children: ReactNode }) {
  return <details id={`csv-trip-group-${index}`} name="csv-trip-groups" open={index === 0} data-trip-group="" className="trip-group">
    <summary className="trip-group-header"><ChevronDown aria-hidden="true" size={14} /><strong className="text-sm text-[#0b2341]">{group}</strong>{summary}</summary>
    <div className="trip-group-content"><nav aria-label={`Sections for ${group}`} className="trip-group-subnav">{items.map(item => <a key={item.id} href={`#${item.id}`} onClick={event => { event.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ block: "start", behavior: "smooth" }); }}><span aria-hidden="true" className={`trip-status-dot ${item.checked ? "is-ready" : "is-pending"}`} />{item.label}<span className="sr-only">{item.checked ? ", reviewed" : ", pending review"}</span></a>)}</nav><div>{children}</div></div>
  </details>;
}

export function TripBlockerList({ items, onFix }: { items: readonly ReviewCheck[]; onFix: (id: string) => void }) {
  const pending = items.filter(item => !item.checked);
  return <section id="import-save-readiness" aria-label="Blockers" className="trip-blockers" tabIndex={-1}><h3>Blockers {pending.length > 0 && <span className="text-slate-500">({pending.length})</span>}</h3>
    {pending.length ? <ul>{pending.map(item => <li key={item.id}><AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><strong className="text-xs text-slate-700">{item.label}</strong>{item.description && <p className="mt-1">{item.description}</p>}</div><button type="button" onClick={() => onFix(item.id)} aria-label={`Fix ${item.label}`}>Fix</button></li>)}</ul> : <p className="mt-2 flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 aria-hidden="true" size={14} />All checks are complete.</p>}
  </section>;
}

export function ReviewSourceLines({ rows, outcomes }: { rows: ImportPreview["rows"]; outcomes: Record<string, ImportOutcome> }) {
  const [page, setPage] = useState(0);
  const size = 25, current = Math.min(page, Math.max(0, Math.ceil(rows.length / size) - 1));
  return <details className="mt-3"><summary className="text-xs font-medium text-[#2678b9]">Source product lines ({rows.length})</summary><div className="trip-horizontal-table mt-3"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-slate-50"><tr>{["CSV row", "Store", "Product", "DR", "Qty", "CBM", "Status"].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead><tbody>{rows.slice(current * size, (current + 1) * size).map(row => <tr key={row.source_identity} className="border-t border-slate-100"><td className="break-words p-2">{row.filename}:{row.line}</td><td className="p-2">{storeLocationLabel(row.values)}</td><td className="p-2">{row.values.customer_model || "Product"}</td><td className="p-2">{row.values.dr_number}</td><td className="p-2 tabular-nums">{row.values.quantity}</td><td className="p-2 tabular-nums">{row.values.cbm}</td><td className="p-2">{row.errors.length ? row.errors.join(" / ") : outcomes[row.source_identity]?.status || (row.duplicate ? "Duplicate / review history" : "Ready")}</td></tr>)}</tbody></table></div><div className="mt-3 flex items-center justify-end gap-3 text-xs"><button type="button" className={tripSecondaryAction} disabled={!current} onClick={() => setPage(current - 1)}>Previous source lines</button><span>{current + 1}/{Math.max(1, Math.ceil(rows.length / size))}</span><button type="button" className={tripSecondaryAction} disabled={(current + 1) * size >= rows.length} onClick={() => setPage(current + 1)}>Next source lines</button></div></details>;
}
