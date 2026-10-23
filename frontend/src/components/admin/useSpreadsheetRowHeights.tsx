import { useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { useSharedTableDesign } from "./useSharedTableDesign";
import { SPREADSHEET_DEFAULT_ROW_HEIGHT, SPREADSHEET_MIN_ROW_HEIGHT, SPREADSHEET_MAX_ROW_HEIGHT } from "./spreadsheet-row-layout";

// Reserved design entries never participate in column order, widths or visibility.
// Partition metadata so large sheets do not concentrate every height in one JSON value.
function heightColumn(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index++) hash = (hash * 31 + key.charCodeAt(index)) | 0;
  return `__row_heights_${(hash >>> 0) % 32}`;
}
const HEADER_COLUMN = "__row_header_height";
type SharedDesign = ReturnType<typeof useSharedTableDesign>;
const clamp = (value: number) => Math.min(SPREADSHEET_MAX_ROW_HEIGHT, Math.max(SPREADSHEET_MIN_ROW_HEIGHT, Math.round(value)));
const sizeStyle = (height: number): CSSProperties => ({ height, "--spreadsheet-row-height": `${height}px` } as CSSProperties);

/** Stable physical row IDs; shared design owns authorization, revision retries and Realtime. */
export function useSpreadsheetRowHeights(scope: string, design: SharedDesign) {
  const cleanup = useRef<(() => void) | null>(null);
  const enabled = design.canEdit && design.loaded;
  const heights = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [column, value] of Object.entries(design.columns)) {
      if (!/^__row_heights_\d+$/.test(column)) continue;
      for (const [key, height] of Object.entries(value.rowHeights ?? {})) if (height != null) result[key] = height;
    }
    return result;
  }, [design.columns]);
  useEffect(() => () => cleanup.current?.(), [scope, enabled, design.save]);
  const height = (key: string, header = false) => header
    ? design.columns[HEADER_COLUMN]?.headerHeight ?? 32
    : heights[key] ?? SPREADSHEET_DEFAULT_ROW_HEIGHT;
  const apply = (key: string, next: number | null, header: boolean) => {
    if (!enabled) return;
    void design.save(header ? HEADER_COLUMN : heightColumn(key), header
      ? { headerHeight: next === null ? null : clamp(next) }
      : { rowHeights: { [key]: next === null ? null : clamp(next) } }, 60);
  };
  const start = (event: ReactPointerEvent<HTMLElement>, key: string, header: boolean) => {
    if (!enabled || event.button !== 0) return;
    const row = event.currentTarget.closest("tr");
    const viewport = row?.closest(".spreadsheet-viewport");
    if (!row) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    const pointerId = event.pointerId, startY = event.clientY;
    const original = row.style.height, originalVariable = row.style.getPropertyValue("--spreadsheet-row-height");
    const initial = row.getBoundingClientRect().height;
    let latest = initial;
    const oldSelect = document.body.style.userSelect, oldCursor = document.body.style.cursor;
    document.body.style.userSelect = "none"; document.body.style.cursor = "row-resize";
    const guide = document.createElement("div");
    guide.className = "spreadsheet-row-resize-guide";
    guide.setAttribute("aria-hidden", "true");
    document.body.appendChild(guide);
    const drawGuide = () => {
      const bounds = (viewport ?? row.closest("table") ?? row).getBoundingClientRect();
      guide.style.left = `${Math.max(0, bounds.left)}px`;
      guide.style.width = `${Math.max(0, Math.min(window.innerWidth, bounds.right) - Math.max(0, bounds.left))}px`;
      guide.style.top = `${Math.min(window.innerHeight - 1, row.getBoundingClientRect().bottom)}px`;
    };
    drawGuide();
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      latest = clamp(initial + pointer.clientY - startY);
      row.style.height = `${latest}px`;
      row.style.setProperty("--spreadsheet-row-height", `${latest}px`);
      drawGuide();
    };
    const release = () => {
      guide.remove();
      document.body.style.userSelect = oldSelect; document.body.style.cursor = oldCursor;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape);
      cleanup.current = null;
    };
    const finish = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) { move(pointer); release(); apply(key, latest, header); } };
    const cancel = () => { row.style.height = original; if (originalVariable) row.style.setProperty("--spreadsheet-row-height", originalVariable); else row.style.removeProperty("--spreadsheet-row-height"); release(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } };
    cleanup.current = cancel;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", escape);
  };
  const handle = (key: string, header = false) => enabled ? <div role="separator" aria-label={header ? "Resize column header height" : "Resize row height"} aria-orientation="horizontal" aria-valuenow={height(key, header)} aria-valuemin={SPREADSHEET_MIN_ROW_HEIGHT} aria-valuemax={SPREADSHEET_MAX_ROW_HEIGHT} tabIndex={0}
    title="Drag to resize height; double-click to reset" onPointerDown={event => start(event, key, header)} onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); apply(key, null, header); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const current = event.currentTarget.closest("tr")?.getBoundingClientRect().height ?? height(key, header); apply(key, current + (event.key === "ArrowDown" ? 1 : -1) * (event.shiftKey ? 10 : 2), header); } }}
    className="spreadsheet-row-resize-handle absolute inset-x-0 bottom-0 z-40 h-1.5 cursor-row-resize touch-none border-b border-transparent hover:border-blue-400 hover:bg-blue-100/60 focus-visible:border-blue-500 focus-visible:outline-none" /> : null;
  const headerHeight = design.columns[HEADER_COLUMN]?.headerHeight;
  return {
    heights,
    style: (key: string): CSSProperties => heights[key] == null ? { height: SPREADSHEET_DEFAULT_ROW_HEIGHT } : sizeStyle(heights[key]),
    headerStyle: headerHeight == null ? undefined : sizeStyle(headerHeight),
    handle,
    headerHandle: () => handle("header", true),
  };
}
