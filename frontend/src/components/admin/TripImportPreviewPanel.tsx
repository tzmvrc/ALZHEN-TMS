// components/admin/TripImportPreviewPanel.tsx
import { useState } from "react";
import { FileSpreadsheet, Upload, X, ChevronDown, ChevronRight } from "lucide-react";
import TripTablePreview, { type TripPreviewRow } from "./TripTablePreview";

export type TripImportPreviewPanelProps = {
  fileName: string;
  fileCount: number;
  rowCount: number;
  previewRows: TripPreviewRow[];
  groupCount: number;
  /** Called after the admin clicks "Import & continue to assignment". */
  onImport: () => void;
  /** Optional: remove the loaded file and go back to the picker. */
  onDiscard?: () => void;
  disabled?: boolean;
};

/**
 * A self-contained preview card. It is NOT a modal — it renders inline as its
 * own panel so the assignment card can sit next to/below it.
 */
export default function TripImportPreviewPanel({
  fileName,
  fileCount,
  rowCount,
  previewRows,
  groupCount,
  onImport,
  onDiscard,
  disabled = false,
}: TripImportPreviewPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <section
      aria-label="CSV import preview"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      {/* Header: file + counts, collapsible */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet aria-hidden="true" className="h-4 w-4 shrink-0 text-[#2678b9]" />
            <h3 className="min-w-0 truncate text-sm font-semibold text-[#0b2341]" title={fileName}>
              {fileName}
            </h3>
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              Not imported yet
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {fileCount} file{fileCount === 1 ? "" : "s"} · {groupCount} trip group{groupCount === 1 ? "" : "s"} ·{" "}
            {rowCount} line row{rowCount === 1 ? "" : "s"}. Review, then import to unlock truck &amp; driver assignment.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {open ? "Hide rows" : "Show rows"}
          </button>
          {onDiscard && (
            <button
              type="button"
              disabled={disabled}
              onClick={onDiscard}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Remove file
            </button>
          )}
        </div>
      </header>

      {open && (
        <div className="min-w-0">
          <TripTablePreview
            rows={previewRows}
            title="CSV preview"
            description="Raw rows as parsed. Nothing is saved until you import."
          />
        </div>
      )}

      {/* Sticky action row */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          Importing creates draft trips. Truck, driver and cargo assignment happens in the next panel.
        </p>
        <button
          type="button"
          disabled={disabled || rowCount === 0}
          onClick={onImport}
          className="inline-flex items-center gap-2 rounded-full bg-[#2678b9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1f6499] disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" /> Import CSV
        </button>
      </footer>
    </section>
  );
}