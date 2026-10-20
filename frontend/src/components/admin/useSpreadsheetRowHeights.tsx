import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { SPREADSHEET_DEFAULT_ROW_HEIGHT, SPREADSHEET_MIN_ROW_HEIGHT, SPREADSHEET_MAX_ROW_HEIGHT } from "./spreadsheet-row-layout";

/** Physical row keys, scoped to the current account/table. No persistence API exists yet. */
export function useSpreadsheetRowHeights(scope: string, enabled = true) {
  const [state, setState] = useState<{ scope: string; heights: Record<string, number> }>({ scope, heights: {} });
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), [scope, enabled]);
  const heights = state.scope === scope ? state.heights : {};
  const height = (key: string) => heights[key] ?? SPREADSHEET_DEFAULT_ROW_HEIGHT;
  const apply = (key: string, next: number) => {
    if (!enabled) return;
    const value = Math.min(SPREADSHEET_MAX_ROW_HEIGHT, Math.max(SPREADSHEET_MIN_ROW_HEIGHT, Math.round(next)));
    setState(current => ({ scope, heights: { ...(current.scope === scope ? current.heights : {}), [key]: value } }));
  };
  const start = (event: ReactPointerEvent<HTMLElement>, key: string) => {
    if (!enabled || event.button !== 0) return;
    const row = event.currentTarget.closest("tr");
    if (!row) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    const pointerId = event.pointerId, startY = event.clientY;
    const original = row.style.height;
    const initial = row.getBoundingClientRect().height;
    let latest = initial;
    const oldSelect = document.body.style.userSelect, oldCursor = document.body.style.cursor;
    document.body.style.userSelect = "none"; document.body.style.cursor = "row-resize";
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      latest = Math.min(SPREADSHEET_MAX_ROW_HEIGHT, Math.max(SPREADSHEET_MIN_ROW_HEIGHT, Math.round(initial + pointer.clientY - startY)));
      row.style.height = `${latest}px`;
    };
    const release = () => {
      document.body.style.userSelect = oldSelect; document.body.style.cursor = oldCursor;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel);
      cleanup.current = null;
    };
    const finish = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) { move(pointer); release(); apply(key, latest); } };
    const cancel = () => { row.style.height = original; release(); };
    cleanup.current = cancel;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel);
  };
  return {
    style: (key: string): CSSProperties => ({ height: height(key) }),
    handle: (key: string) => enabled ? <div role="separator" aria-label="Resize row height" aria-orientation="horizontal" aria-valuenow={height(key)} aria-valuemin={SPREADSHEET_MIN_ROW_HEIGHT} aria-valuemax={SPREADSHEET_MAX_ROW_HEIGHT} tabIndex={0}
      title="Drag to resize row; double-click to reset" onPointerDown={event => start(event, key)} onClick={event => event.stopPropagation()}
      onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); apply(key, SPREADSHEET_DEFAULT_ROW_HEIGHT); }}
      onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); apply(key, height(key) + (event.key === "ArrowDown" ? 1 : -1) * (event.shiftKey ? 10 : 2)); } }}
      className="absolute inset-x-0 bottom-0 z-40 h-1.5 cursor-row-resize touch-none border-b border-transparent hover:border-blue-400 hover:bg-blue-100/60 focus-visible:border-blue-500 focus-visible:outline-none" /> : null,
  };
}
