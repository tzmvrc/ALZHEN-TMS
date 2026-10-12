export const REPORT_COLUMN_COLORS = [
  "#fef2f2", "#fecaca", "#f87171", "#b91c1c",
  "#fff7ed", "#fed7aa", "#fb923c", "#c2410c",
  "#fefce8", "#fef08a", "#facc15", "#a16207",
  "#f0fdf4", "#bbf7d0", "#4ade80", "#15803d",
  "#ecfdf5", "#a7f3d0", "#34d399", "#047857",
  "#ecfeff", "#a5f3fc", "#22d3ee", "#0e7490",
  "#eff6ff", "#bfdbfe", "#60a5fa", "#1d4ed8",
  "#eef2ff", "#c7d2fe", "#818cf8", "#4338ca",
  "#faf5ff", "#e9d5ff", "#c084fc", "#7e22ce",
  "#fdf2f8", "#fbcfe8", "#f472b6", "#be185d",
  "#f8fafc", "#cbd5e1", "#64748b", "#1e293b",
];

export const REPORT_GRID_VIEWPORT_CLASS = "relative min-h-48 max-h-[min(68vh,calc(100vh-18rem))] min-w-0 overflow-auto overscroll-contain rounded-xl border border-slate-200 bg-white";
export const REPORT_GRID_HEADER_CELL_CLASS = "sticky top-0 z-30 whitespace-nowrap border-b border-r border-slate-100/70 bg-white px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 last:border-r-0";
export const REPORT_GRID_BODY_CELL_CLASS = "px-4 py-3.5 text-[13px] text-slate-800";
export const REPORT_GRID_ROW_CLASS = "border-b border-slate-100/80 transition-colors last:border-0";

export function reorderColumnKeys(keys: string[], sourceKey: string, targetKey: string) {
  if (sourceKey === targetKey) return keys;
  const sourceIndex = keys.indexOf(sourceKey);
  const targetIndex = keys.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0) return keys;
  const next = [...keys];
  next.splice(sourceIndex, 1);
  next.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, sourceKey);
  return next;
}

export function chooseAutomaticPinSide(columnRect: DOMRect, viewportRect: DOMRect): "left" | "right" {
  const center = (columnRect.left + columnRect.right) / 2;
  return Math.abs(center - viewportRect.left) <= Math.abs(viewportRect.right - center) ? "left" : "right";
}

export function expandSpreadsheetRange(sourceRow: number, sourceColumn: number, targetRow: number, targetColumn: number) {
  const rows = Array.from({ length: Math.abs(targetRow - sourceRow) + 1 }, (_, index) => Math.min(sourceRow, targetRow) + index);
  const columns = Array.from({ length: Math.abs(targetColumn - sourceColumn) + 1 }, (_, index) => Math.min(sourceColumn, targetColumn) + index);
  return rows.flatMap((row) => columns.map((column) => ({ row, column })).filter((cell) => cell.row !== sourceRow || cell.column !== sourceColumn));
}

export function parseSpreadsheetClipboard(value: string): string[][] {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return normalized ? normalized.split("\n").map((line) => line.split("\t")) : [];
}
