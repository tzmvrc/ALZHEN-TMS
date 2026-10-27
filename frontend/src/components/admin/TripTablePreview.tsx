import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { tableUi } from "./dashboardStyles";
import type { CsvField } from "./tripCsv";
import { cbmDisplay, isCbmField } from "../../services/cbm-display";

export type TripPreviewRow = Partial<Record<CsvField | "status" | "drivers" | "tripGroup" | "source" | "dn" | "sp", string>>;
const columns: Array<{ key: keyof TripPreviewRow; title: string }> = [
  { key: "dispatch", title: "Dispatch no." }, { key: "trip", title: "Trip no." },
  { key: "tripType", title: "Trip type" }, { key: "status", title: "Status" },
  { key: "loadingDate", title: "Loading date" }, { key: "eta", title: "Estimated delivery" },
  { key: "plate", title: "Plate no." }, { key: "drivers", title: "Driver" },
  { key: "warehouse", title: "Ship from" }, { key: "store", title: "Ship to" },
  { key: "customer", title: "Customer name" }, { key: "dr", title: "DR" },
  { key: "sapSo", title: "SAP SO no." }, { key: "customerPo", title: "Customer PO" },
  { key: "po", title: "PO no." }, { key: "product", title: "Customer model" },
  { key: "category", title: "Product category" }, { key: "qty", title: "Qty" },
  { key: "unitCbm", title: "Unit CBM" }, { key: "cbm", title: "Total CBM" },
  { key: "province", title: "Province" }, { key: "city", title: "City" },
  { key: "notes", title: "Remarks" },
  { key: "tripGroup", title: "Trip group" }, { key: "dn", title: "DN" },
  { key: "sp", title: "SP" }, { key: "source", title: "Source" },
];

export default function TripTablePreview({ rows, title, description, productColumns = false }: { rows: TripPreviewRow[]; title: string; description: string; productColumns?: boolean }) {
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const mainColumns = new Set<keyof TripPreviewRow>(productColumns ? ["store", "province", "city", "product", "category", "qty", "unitCbm", "cbm", "dr", "status"] : ["dispatch", "plate", "store", "product", "qty", "cbm", "dr", "status"]);
  const optionalColumns = new Set<keyof TripPreviewRow>(["tripGroup", "source", "dn", "sp"]);
  const visibleColumns = showAll ? columns.filter(column => !optionalColumns.has(column.key) || rows.some(row => row[column.key])) : columns.filter(column => mainColumns.has(column.key));
  const numeric = (key: keyof TripPreviewRow) => ["qty", "unitCbm", "cbm", "trip"].includes(key);
  const width = (key: keyof TripPreviewRow) => numeric(key) ? 100 : key === "notes" ? 320 : ["store", "product", "customer"].includes(key) ? 220 : 170;
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * 50;
  return <section aria-label={title} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-[#0b2341]">{title}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Not saved</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div><button type="button" aria-pressed={showAll} onClick={() => setShowAll(value => !value)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#2678b9] hover:bg-slate-50">{showAll ? "Show key columns" : "Show all columns"}</button></div>
    <div className={`${tableUi.shell} !shadow-none !ring-0`}>
      <div className="max-h-80 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-400" tabIndex={0} role="region" aria-label={`${title} rows`}>
        <table style={{ tableLayout: "fixed", width: 56 + visibleColumns.reduce((sum, column) => sum + width(column.key), 0), minWidth: "100%" }} className="text-left text-xs" aria-label={title}>
          <colgroup><col style={{ width: 56 }} />{visibleColumns.map(column => <col key={column.key} style={{ width: width(column.key) }} />)}</colgroup>
          <thead className={`${tableUi.thead} sticky top-0 z-10`}><tr><th scope="col" className={`${tableUi.th} !bg-slate-50`}>Row</th>{visibleColumns.map(column => <th scope="col" key={column.key} className={`${tableUi.th} whitespace-nowrap !bg-slate-50 ${numeric(column.key) ? "text-right" : ""}`}>{column.title}</th>)}</tr></thead>
          <tbody>{rows.slice(start, start + 50).map((row, index) => <tr key={start + index} className={tableUi.row}><td className={`${tableUi.td} tabular-nums text-slate-400`}>{start + index + 1}</td>{visibleColumns.map(column => { const value = isCbmField(column.key) ? cbmDisplay(row[column.key]) : row[column.key]; return <td key={column.key} className={`${tableUi.td} truncate ${numeric(column.key) ? "text-right tabular-nums" : ""}`} title={value || undefined}>{value || <span className="text-slate-300">—</span>}</td>; })}</tr>)}</tbody>
        </table>
      </div>
      <footer className={`${tableUi.footer} flex-wrap gap-2 !px-3 !py-2 text-slate-500`}><span>{rows.length ? `${start + 1}–${Math.min(start + 50, rows.length)} of ${rows.length} rows` : "No rows"}</span>{pages > 1 && <div className="flex items-center gap-2"><button type="button" aria-label="Previous preview page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={tableUi.pageBtn}><ChevronLeft className="h-4 w-4" /></button><span>{currentPage}/{pages}</span><button type="button" aria-label="Next preview page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={tableUi.pageBtn}><ChevronRight className="h-4 w-4" /></button></div>}</footer>
    </div>
  </section>;
}
