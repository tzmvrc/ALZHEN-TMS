import ImportPreviewInput from "./ImportPreviewInput";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { importFields, importPayload, type ImportField, type ImportFile } from "./tripImportFiles";
import type { ImportOutcome, ImportPreview } from "../../services/trip-import.service";
import { cbmDisplay, isCbmField } from "../../services/cbm-display";

type Props = {
  files: ImportFile[];
  preview: ImportPreview | null;
  outcomes: Record<string, ImportOutcome>;
  disabled: boolean;
  onEdit: (file: string, line: number, field: ImportField, value: string) => void;
  onGroup: (file: string, line: number, group: string) => void;
  viewMode?: "source" | "mapped";
  mappedFileRequest?: { fileId: string; id: number };
};

/** Paginate rows, never columns: every original header remains inspectable. */
export default function TripImportPreview({ files, preview, outcomes, disabled, onEdit, onGroup, mappedFileRequest, viewMode }: Props) {
  const [fileId, setFileId] = useState("");
  const [localView, setView] = useState<"source" | "mapped">("source");
  const view = viewMode ?? localView;
  const [page, setPage] = useState(1);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mappedFileRequest) return;
    setFileId(mappedFileRequest.fileId);
    setView("mapped");
    setPage(1);
    const frame = requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      panelRef.current?.querySelector<HTMLInputElement>('input[data-optional="true"]')?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [mappedFileRequest]);
  const file = files.find(item => item.id === fileId) ?? files[0];
  if (!file) return null;
  const pages = Math.max(1, Math.ceil(file.rows.length / 50));
  const current = Math.min(page, pages), offset = (current - 1) * 50;
  const mapped = importPayload([file])[0].rows;
  const checkedRows = new Map(preview?.rows.filter(row => row.filename === file.name).map(row => [row.line, row]));
  const sourceHeaders = file.originalHeaders ?? file.headers;
  const headers = view === "source" ? sourceHeaders : ["Trip group", "Row status", ...importFields.map(([, label]) => label)];
  const cell = "border-b border-r border-slate-100 px-3 py-2.5 align-top";
  return <section ref={panelRef} aria-label="CSV preview" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
    {!viewMode && <>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
      <div><h3 className="text-sm font-semibold text-[#0b2341]">CSV preview</h3><p className="mt-1 text-xs text-slate-500">All columns are included. Scroll across for more columns and use the pages for more rows.</p></div>
      <div className="flex rounded-lg bg-slate-100 p-1" aria-label="Preview display">
        {(["source", "mapped"] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === mode ? "bg-white text-[#0b2341] shadow-sm" : "text-slate-500"}`}>{mode === "source" ? "Original CSV" : "Mapped fields"}</button>)}
      </div>
    </div>
    </>}
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-500">
      {files.length > 1 ? <label className="min-w-0">File or worksheet <select aria-label="Preview file or worksheet" value={file.id} onChange={event => { setFileId(event.target.value); setPage(1); }} className="ml-2 max-w-64 rounded-lg border border-slate-200 p-2 text-slate-700">{files.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <span className="min-w-0 truncate font-medium text-slate-700" title={file.name}>{file.name}</span>}
      <span>{file.rows.length} rows / {view === "source" ? sourceHeaders.length : importFields.length} columns</span>
    </div>
    <div role="region" aria-label="CSV data table" tabIndex={0} className="trip-horizontal-table border-y border-slate-100">
      <table className="w-max min-w-full border-collapse text-left text-xs">
        <thead className="bg-slate-50 text-slate-600"><tr><th className={cell}>Row</th>{headers.map((header, index) => <th key={index} className={`${cell} whitespace-nowrap font-medium`}>{header || `Column ${index + 1}`}</th>)}</tr></thead>
        <tbody>{file.rows.slice(offset, offset + 50).map((source, index) => {
          const checked = checkedRows.get(source.line), outcome = checked && outcomes[checked.source_identity];
          const message = outcome?.error || outcome?.status || checked?.errors.join(" ") || (checked?.duplicate ? "Duplicate: skipped on save" : checked?.warnings.join(" ")) || (checked ? "Ready" : "Not checked yet");
          const invalid = Boolean(checked?.errors.length || outcome?.status === "failed");
          return <tr key={source.line} className={invalid ? "bg-rose-50" : "even:bg-slate-50/50"}>
            <td className={`${cell} tabular-nums text-slate-400`}>{source.line}</td>
            {view === "source" ? sourceHeaders.map((_, column) => { const value = (source.originalCells ?? source.cells)[column] ?? ""; const display = column === file.mapping.unit_cbm || column === file.mapping.cbm ? cbmDisplay(value) : value; return <td key={column} className={`${cell} max-w-80 whitespace-pre-wrap break-words`}>{display || <span className="text-slate-300">—</span>}</td>; }) : <>
              <td className={cell}><input aria-label={`Trip group source row ${source.line}`} disabled={disabled} defaultValue={source.group} key={source.group} onBlur={event => { if (event.target.value.trim() !== source.group) onGroup(file.id, source.line, event.target.value.trim()); }} className="w-40 rounded-md border border-slate-200 bg-transparent p-1.5 disabled:border-transparent" /></td>
              <td className={`${cell} max-w-72 whitespace-normal ${invalid ? "text-rose-700" : "text-slate-500"}`}>{message}</td>
              {importFields.map(([field, label]) => { const value = mapped[offset + index].values[field] ?? ""; const display = isCbmField(field) ? cbmDisplay(value) : value; const optional = file.mapping[field] < 0 || file.mapping[field] >= sourceHeaders.length; return <td key={field} className={cell}><ImportPreviewInput aria-label={`${label} source row ${source.line}`} data-optional={optional} placeholder={optional ? "Optional — not in CSV" : undefined} disabled={disabled} value={display} onCommit={value => onEdit(file.id, source.line, field, value)} className="w-40 rounded-md border border-transparent bg-transparent p-1.5 focus:border-blue-300 focus:outline-none" /></td>; })}
            </>}
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs text-slate-500"><span>{file.rows.length ? offset + 1 : 0}–{Math.min(offset + 50, file.rows.length)} of {file.rows.length} rows</span><div className="flex items-center gap-3"><button type="button" aria-label="Previous CSV preview page" disabled={current === 1} onClick={() => setPage(current - 1)} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronLeft size={14} /></button><span>Page {current} of {pages}</span><button type="button" aria-label="Next CSV preview page" disabled={current === pages} onClick={() => setPage(current + 1)} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronRight size={14} /></button></div></div>
  </section>;
}
