import type { CSSProperties } from "react";
import type { ColumnDesign } from "../../services/shared-table-design";
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

export const REPORT_GRID_VIEWPORT_CLASS = "spreadsheet-viewport relative min-h-0 min-w-0 overflow-auto overscroll-contain rounded-[10px] border border-[#e4e9f0] bg-white";
export const REPORT_GRID_HEADER_CELL_CLASS = "sticky top-0 z-30 whitespace-normal break-words border-b border-r border-[#e8ecf1] bg-[#f3f5f8] px-2.5 py-1 align-middle text-[11px] leading-4 font-semibold tracking-normal text-[#0b2343] last:border-r-0";
export const REPORT_GRID_BODY_CELL_CLASS = "border-b border-r border-[#e8ecf1] px-2.5 py-1 align-middle text-[12px] leading-5 text-[#24354b] last:border-r-0";
export const REPORT_GRID_ROW_CLASS = "border-b border-[#e8ecf1] transition-colors last:border-0 hover:bg-[#f5f7fa]";

export type {CellDesign as ReportCellFormat} from "../../services/shared-table-design";

/** A stop/item's earlier shared appearance remains a default after convoy
 * expansion; an explicitly formatted assignment cell always takes precedence. */
export function reportCellFormatFor(formats:Record<string,ReportCellFormat>,key:string):ReportCellFormat|undefined{
  const inheritedKey=key.replace(/:assignment:[0-9a-f-]{36}/i,"").replace(/~[0-9a-f-]{36}/i,"");
  const specific=formats[key],inherited=formats[inheritedKey];
  return inheritedKey===key||!inherited?specific:!specific?inherited:{...inherited,...specific};
}
import type {CellDesign as ReportCellFormat} from "../../services/shared-table-design";

export function reportCellFormatKey(rowKey: string, field: string) {
  return `${rowKey}\u0000${field}`;
}

export function readReportCellFormats(storageKey: string): Record<string, ReportCellFormat> {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const color = typeof item.color === "string" && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : undefined;
      const backgroundColor = typeof item.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(item.backgroundColor) ? item.backgroundColor : undefined;
      return [[key, { ...(typeof item.bold === "boolean" ? { bold: item.bold } : {}), ...(typeof item.italic === "boolean" ? { italic: item.italic } : {}), ...(typeof item.underline === "boolean" ? { underline: item.underline } : {}), fontFamily: typeof item.fontFamily === "string" ? item.fontFamily : undefined, fontSize: typeof item.fontSize === "number" && Number.isFinite(item.fontSize) ? item.fontSize : undefined, color, backgroundColor } satisfies ReportCellFormat]];
    }));
  } catch {
    return {};
  }
}

export function writeReportCellFormats(storageKey: string, formats: Record<string, ReportCellFormat>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(formats));
  } catch {
    // Formatting remains usable in this session if browser storage is unavailable.
  }
}

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

/** Column defaults apply to the header and blanks; only body cells receive cell overrides. */
export function reportColumnAppearance(column?: ColumnDesign, cell?: ReportCellFormat, legacyBackground?: string): CSSProperties {
  const defaults = column?.format;
  const background = cell?.backgroundColor || defaults?.backgroundColor || column?.color || legacyBackground;
  const foreground = cell?.color || defaults?.color;
  const bold = cell?.bold ?? defaults?.bold;
  const italic = cell?.italic ?? defaults?.italic;
  const underline = cell?.underline ?? defaults?.underline;
  let contrast: string | undefined;
  if (background && /^#[0-9a-f]{6}$/i.test(background)) {
    const [r, g, b] = [1, 3, 5].map(index => Number.parseInt(background.slice(index, index + 2), 16));
    contrast = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55 ? "#ffffff" : "#172b43";
  }
  return {
    ...(background ? { backgroundColor: background } : {}),
    ...(foreground || contrast ? { color: foreground || contrast } : {}),
    ...(bold !== undefined ? { fontWeight: bold ? 700 : 400 } : {}),
    ...(italic !== undefined ? { fontStyle: italic ? "italic" : "normal" } : {}),
    ...(underline !== undefined ? { textDecoration: underline ? "underline" : "none" } : {}),
    ...(cell?.fontFamily ?? defaults?.fontFamily ? { fontFamily: cell?.fontFamily ?? defaults?.fontFamily ?? undefined } : {}),
    ...(cell?.fontSize ?? defaults?.fontSize ? { fontSize: cell?.fontSize ?? defaults?.fontSize ?? undefined } : {}),
    ...(column?.alignment ? { textAlign: column.alignment } : {}),
  };
}

/** Separate header appearance overrides never leak into data cells. */
export function reportHeaderAppearance(column?: ColumnDesign, legacyBackground?: string): CSSProperties {
  return { fontWeight: 600, ...reportColumnAppearance(column, column?.header, legacyBackground) };
}

export const REPORT_TOOLBAR_ROW_CLASS = "report-toolbar-row flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2";
