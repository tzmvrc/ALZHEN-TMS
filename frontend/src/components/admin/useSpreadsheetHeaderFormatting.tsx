import { useState, type MouseEvent, type KeyboardEvent } from "react";
import type { ColumnDesign, HeaderDesign } from "../../services/shared-table-design";
import type { ReportCellFormat } from "./ReportSpreadsheetUtils";

/** Header selection is ephemeral. Only validated header appearance patches use shared persistence. */
export function useSpreadsheetHeaderFormatting(scope: string, canEdit: boolean, columns: Record<string, ColumnDesign>, save: (key: string, patch: HeaderDesign) => void) {
  const [selection, setSelection] = useState<{ scope: string; key: string } | null>(null);
  const key = canEdit && selection?.scope === scope ? selection.key : null;
  const clear = () => setSelection(null);
  const props = (column: string) => ({
    tabIndex: canEdit ? 0 : undefined,
    "data-header-selected": key === column ? "true" : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      const target = event.target as Element;
      if (target.closest("input,select,[role=separator],summary") || target.closest("button") && !target.closest("[data-spreadsheet-header-title]")) return;
      if (canEdit) setSelection({ scope, key: column });
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (canEdit && ["Enter", " "].includes(event.key)) { event.preventDefault(); setSelection({ scope, key: column }); }
      if (event.key === "Escape") clear();
    },
  });
  const format = key ? columns[key]?.header ?? {} : {};
  return { key, props, clear,
    tableProps: { onPointerDownCapture: (event: MouseEvent<HTMLTableElement>) => { if ((event.target as Element).closest("tbody td,tbody th")) clear(); }, onFocusCapture: (event: { target: EventTarget }) => { if ((event.target as Element).closest("tbody td,tbody th")) clear(); } },
    toolbarProps: { headerOnly: Boolean(key), ...(key ? { selectedCellCount: 1, selectedTextColor: format.color ?? null, selectedBackgroundColor: format.backgroundColor ?? null, selectedFontSize: format.fontSize ?? columns[key]?.format?.fontSize ?? 12, onApply: (change: Partial<ReportCellFormat>) => {
      const patch: HeaderDesign = {};
      if ("color" in change) patch.color = change.color || null;
      if ("backgroundColor" in change) patch.backgroundColor = change.backgroundColor || null;
      if ("fontSize" in change && (change.fontSize === null || Number.isInteger(change.fontSize) && Number(change.fontSize) >= 9 && Number(change.fontSize) <= 32)) patch.fontSize = change.fontSize;
      if (Object.keys(patch).length) save(key, patch);
    } } : {}) },
  };
}
