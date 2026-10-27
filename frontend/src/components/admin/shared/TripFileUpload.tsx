import { useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, FolderOpen, Loader2, Upload } from "lucide-react";
import { tripPrimaryAction, tripSecondaryAction } from "./TripModalUI";

type Props = { disabled: boolean; busy: boolean; error: string; files: readonly { id: string; name: string; headers: string[]; rows: readonly unknown[] }[]; onFiles: (files: FileList) => void };
export default function TripFileUpload({ disabled, busy, error, files, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const helpId = useId();
  return <section aria-label="Upload trip request files" aria-busy={busy} className="min-w-0">
    <div>
      <div data-dragging={dragging && !disabled} data-disabled={disabled} onDragEnter={event => { event.preventDefault(); if (!disabled && event.dataTransfer.types.includes("Files")) setDragging(true); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled && event.dataTransfer.files.length) onFiles(event.dataTransfer.files); }} className={`trip-upload-zone flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center motion-reduce:transition-none sm:min-h-44 sm:px-8 ${error ? "border-rose-300 bg-rose-50/30" : "border-slate-300 bg-slate-50/70"}`}>
        <span aria-hidden="true" className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white shadow-sm ${error ? "border-rose-200 text-rose-600" : "border-blue-100 text-[#2678b9]"}`}>{busy ? <Loader2 className="h-6 w-6 animate-spin" /> : error ? <AlertCircle className="h-6 w-6" /> : <Upload className="h-6 w-6" />}</span>
        <p role="status" className="text-base font-semibold tracking-tight text-[#0b2341]">{busy ? "Reading your trip files…" : dragging && !disabled ? "Drop your files here" : "Drag and drop your files here"}</p>
        <p id={helpId} className="mt-2 max-w-md text-sm leading-6 text-slate-600">{busy ? "Your source rows and column headers are being prepared for review." : "CSV or XLSX · Multiple files supported."}</p>
        <button type="button" className={`${files.length ? tripSecondaryAction : tripPrimaryAction} mt-5`} disabled={disabled} onClick={() => inputRef.current?.click()}><FolderOpen aria-hidden="true" className="h-4 w-4" />{files.length ? "Choose replacement files" : "Browse files"}</button>
        <input ref={inputRef} aria-label="Upload trip files" aria-describedby={helpId} aria-invalid={Boolean(error)} type="file" multiple accept=".csv,.xlsx" disabled={disabled} className="sr-only" tabIndex={-1} onChange={event => { if (event.target.files?.length) onFiles(event.target.files); event.target.value = ""; }} />
        <p className="mt-4 text-xs leading-5 text-slate-500">Trips are created only when you save.</p>
      </div>
      {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
      {files.length > 0 && <div className="mt-4 space-y-2">{files.map(file => <div key={file.id} className="trip-file-row flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3"><FileSpreadsheet aria-hidden="true" className="h-5 w-5 shrink-0 text-[#2678b9]" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-[#0b2341]">{file.name}</p><p className="mt-1 text-xs tabular-nums text-slate-500">{file.rows.length} source rows · {file.headers.length} columns</p></div><span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#1d5f94]"><CheckCircle2 aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">Loaded</span></span></div>)}</div>}
    </div>
  </section>;
}
