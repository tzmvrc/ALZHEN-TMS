import type {ReactNode} from "react";
// Lightweight shared values/skeletons must not import dashboard chart libraries.
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export function StatusBadge({ value,color }: { value: unknown; color?:string|null }) {
  const raw =
    typeof value === "string"
      ? value.trim()
      : value === null || value === undefined
        ? ""
        : String(value);
  const normalized = raw || "Not recorded";
  const tone = (() => {
    const status = normalized.toLowerCase();
    if (/completed|delivered|verified|closed|finished|success/.test(status)) {
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    }
    if (
      /in progress|active|running|loading|pickup|assigned|processing|transit/.test(
        status,
      )
    ) {
      return "bg-cyan-50 text-cyan-700 ring-cyan-200";
    }
    if (
      /pending|waiting|queued|scheduled|delayed|hold|blocked|overdue/.test(
        status,
      )
    ) {
      return "bg-amber-50 text-amber-700 ring-amber-200";
    }
    if (/cancel|reject|failed|error|exception|critical/.test(status)) {
      return "bg-red-50 text-red-700 ring-red-200";
    }
    return "bg-slate-100 text-slate-600 ring-slate-200";
  })();

  return (
    <span
      style={color?{color,backgroundColor:`${color}18`,boxShadow:`inset 0 0 0 1px ${color}33`}:undefined} className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${tone}`}>
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

export function TableSkeleton({
  columns,
  rows = 5,
  columnWidths,
  showToolbar = false,
  toolbarActions,
}: {
  columns: number;
  rows?: number;
  columnWidths?: readonly number[];
  showToolbar?: boolean;
  toolbarActions?: ReactNode;
}) {
  return (
    <div role="status" aria-label="Loading report table" aria-busy="true" className="overflow-hidden rounded-[18px] border border-[#e4e9f0] bg-white">
      {showToolbar && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3"><div aria-hidden="true" className="h-8 w-44 animate-pulse rounded bg-slate-100" /><div className="flex items-center gap-2"><div aria-hidden="true" className="h-10 w-48 animate-pulse rounded-lg bg-slate-100" /><div aria-hidden="true" className="h-8 w-20 animate-pulse rounded bg-slate-100" />{toolbarActions}</div></div>}
      <div className="overflow-x-auto">
        <table aria-hidden="true" className="min-w-full table-fixed border-separate border-spacing-0 text-left text-sm" style={columnWidths ? { width: columnWidths.reduce((sum, width) => sum + width, 0) } : undefined}>
          {columnWidths && <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>}
          <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <th key={`header-${columnIndex}`} className="border-b border-r border-slate-200 px-3 py-3">
                  <div className="h-3 w-16 max-w-full animate-pulse rounded bg-slate-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-t border-slate-100">
                {Array.from({ length: columns }).map((__, columnIndex) => (
                  <td
                    key={`cell-${rowIndex}-${columnIndex}`}
                    className="border-b border-r border-slate-100 px-3 py-3">
                    <div
                      className={`h-4 max-w-full animate-pulse rounded bg-slate-200 ${
                        columnIndex % 3 === 0
                          ? "w-24"
                          : columnIndex % 3 === 1
                            ? "w-32"
                            : "w-20"
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

