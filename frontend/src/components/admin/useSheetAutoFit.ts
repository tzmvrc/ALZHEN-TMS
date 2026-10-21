import { useEffect, useState, type RefObject } from "react";

type Column = { key: string; title: string };
/** Measure loaded records, including rows outside the virtual DOM window. Local view only. */
export function useSheetAutoFit(viewport: RefObject<HTMLDivElement | null>, columns: readonly Column[], rows: readonly object[]) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    const sheet = viewport.current;
    if (!sheet) return;
    const fit = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      const sample = sheet.querySelector("td:not(.spreadsheet-gutter)") ?? sheet;
      const style = getComputedStyle(sample);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const measure = (value: unknown) => Math.max(0, ...String(value ?? "").split(/\r?\n/).map(line => context.measureText(line).width));
      const next: Record<string, number> = {};
      for (const column of columns) {
        let width = Math.min(280, measure(column.title) + 44);
        for (const row of rows) width = Math.max(width, measure((row as Record<string, unknown>)[column.key]) + 24);
        next[column.key] = Math.max(60, Math.min(600, Math.ceil(width)));
      }
      setWidths(next);
    };
    sheet.addEventListener("sheet:auto-fit", fit);
    return () => sheet.removeEventListener("sheet:auto-fit", fit);
  }, [viewport, columns, rows]);
  const clearWidth = (key: string) => setWidths(current => {
    if (!(key in current)) return current;
    const next = { ...current }; delete next[key]; return next;
  });
  return { widths, clearWidth };
}
