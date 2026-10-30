import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const EMPTY_WIDTHS:Record<string,number>={};

type Column = { key: string; title: string; minWidth?: number };
/** Measure loaded records, including rows outside the virtual DOM window. Local view only. */
export function useSheetAutoFit(viewport: RefObject<HTMLDivElement | null>, columns: readonly Column[], rows: readonly object[],savedWidths:Readonly<Record<string,number>>=EMPTY_WIDTHS) {
  const [enabled,setEnabled]=useState(true);
  const manual=useRef(new Set<string>());
  const explicitlyFit=useRef(false);
  const [attachedSheet,setAttachedSheet]=useState<HTMLDivElement|null>(null);
  useLayoutEffect(()=>{if(viewport.current!==attachedSheet)setAttachedSheet(viewport.current);});
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
      const header = sheet.querySelector("th:not(.spreadsheet-gutter) [data-spreadsheet-header-title]") ?? sheet.querySelector("th:not(.spreadsheet-gutter)");
      const headerStyle = header ? getComputedStyle(header) : style;
      const headerCanvas = document.createElement("canvas").getContext("2d");
      if(headerCanvas)headerCanvas.font = `${headerStyle.fontWeight} ${headerStyle.fontSize} ${headerStyle.fontFamily}`;
      const headerWidth = (title:string) => (headerCanvas ?? context).measureText(headerStyle.textTransform === "uppercase" ? title.toUpperCase() : title).width;
      const next: Record<string, number> = {};
      for (const column of columns) {
        if(manual.current.has(column.key)||(!explicitlyFit.current&&savedWidths[column.key]!==undefined&&savedWidths[column.key]>= (column.minWidth ?? 60)))continue;
        let width = Math.min(280, headerWidth(column.title) + 44);
        for (const row of rows) width = Math.max(width, measure((row as Record<string, unknown>)[column.key]) + 24);
        next[column.key] = Math.max(column.minWidth ?? 60, Math.min(600, Math.ceil(width)));
      }
      setWidths(current=>Object.keys(current).length===Object.keys(next).length&&Object.keys(next).every(key=>current[key]===next[key])?current:next);
    };
    const toggle=()=>{if(!enabled){manual.current.clear();explicitlyFit.current=true;}setEnabled(current=>!current);};
    sheet.addEventListener("sheet:auto-fit", toggle);
    if(enabled)fit();
    return () => sheet.removeEventListener("sheet:auto-fit", toggle);
  }, [viewport, attachedSheet, columns, rows, enabled,savedWidths]);
  const clearWidth = (key: string) => {manual.current.add(key);setWidths(current => {
    if (!(key in current)) return current;
    const next = { ...current }; delete next[key]; return next;
  });};
  return { widths:enabled?widths:EMPTY_WIDTHS, clearWidth, enabled };
}
