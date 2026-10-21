// components/admin/TripStoreProductStep.tsx
import { useRef, useState } from "react";
import { FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { DestinationSource, LocationDecision } from "./ImportDestinationReview";
import ImportDestinationReview from "./ImportDestinationReview";
import TripFormNotice from "./TripFormNotice";

export type TripStoreProductStepProps = {
  token: string;
  disabled?: boolean;

  /** File currently loaded, if any. */
  fileName?: string | null;
  fileCount?: number;
  rowCount?: number;

  /** Called when the admin picks a file (CSV/XLSX). */
  onFileChosen: (file: File) => void;

  /** Store/product lines to review (already parsed). */
  lines: { key: string; label: string; dr: string; stop: string; qty: string; cbm: string }[];

  destinations: DestinationSource[];
  locationDecisions: Record<string, LocationDecision>;
  onLocationDecisionsChange: (decisions: Record<string, LocationDecision>) => void;

  /** Summary counts for the header. */
  verifiedCount: number;
  totalDestinations: number;

  loading?: boolean;
  error?: string | null;
};

export default function TripStoreProductStep({
  token,
  disabled = false,
  fileName,
  fileCount = 0,
  rowCount = 0,
  onFileChosen,
  lines,
  destinations,
  locationDecisions,
  onLocationDecisionsChange,
  verifiedCount,
  totalDestinations,
  loading = false,
  error,
}: TripStoreProductStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <section aria-label="Store and product" className="space-y-4">
      {/* ── Sub-card A: Choose file ─────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-[#0b2341]">1. Choose CSV or XLSX</h3>
          <p className="mt-1 text-xs text-slate-500">
            One file can contain many trips. Nothing is saved until you review the preview and import.
          </p>
        </header>

        {/* Drop zone / picker */}
        {!fileName ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onFileChosen(file);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-[#2678b9] bg-blue-50" : "border-slate-200 bg-slate-50/60"
            }`}
          >
            <FileUp aria-hidden="true" className="h-6 w-6 text-slate-400" />
            <p className="text-xs text-slate-600">
              Drag a <strong>.csv</strong> or <strong>.xlsx</strong> here, or
            </p>
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => inputRef.current?.click()}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Browse files
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx"
              disabled={disabled || loading}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileChosen(file);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-emerald-900">{fileName}</p>
              <p className="text-[11px] text-emerald-800">
                {fileCount} file{fileCount === 1 ? "" : "s"} · {rowCount} line row{rowCount === 1 ? "" : "s"} parsed
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            >
              Replace file
            </button>
          </div>
        )}

        {loading && <p role="status" className="mt-2 text-xs text-slate-500">Parsing file…</p>}
        {error && (
          <TripFormNotice tone="error" title="Could not read the file">
            {error}
          </TripFormNotice>
        )}
      </div>

      {/* ── Sub-card B: Review stores & products ────────────────── */}
      {lines.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#0b2341]">2. Review stores &amp; products</h3>
              <p className="mt-1 text-xs text-slate-500">
                Fix ambiguous store identities below. Product lines are matched automatically; unmatched lines stay
                flagged until resolved.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                verifiedCount === totalDestinations && totalDestinations > 0
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {verifiedCount === totalDestinations && totalDestinations > 0 ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {verifiedCount}/{totalDestinations} destinations verified
            </span>
          </header>

          {/* Destination identity/location review — reuse your existing component */}
          <ImportDestinationReview
            token={token}
            destinations={destinations}
            decisions={locationDecisions}
            onChange={onLocationDecisionsChange}
            disabled={disabled}
          />

          {/* Product line summary — compact, no per-row editors here */}
          <div className="mt-3">
            <h4 className="mb-1.5 text-xs font-semibold text-slate-700">Product lines ({lines.length})</h4>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-medium">DR</th>
                    <th className="px-2 py-2 font-medium">Destination</th>
                    <th className="px-2 py-2 font-medium">Product</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-2 py-2 text-right font-medium">Total CBM</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-slate-600">{line.dr || <span className="text-rose-600">No DR</span>}</td>
                      <td className="px-2 py-1.5">{line.stop}</td>
                      <td className="px-2 py-1.5">{line.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{line.qty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{line.cbm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}