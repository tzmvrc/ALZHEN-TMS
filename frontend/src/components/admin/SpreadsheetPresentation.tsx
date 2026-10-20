import { ArrowUpRight } from "lucide-react";
import { SPREADSHEET_DEFAULT_ROW_HEIGHT } from "./spreadsheet-row-layout";
import { useContext, useEffect, useLayoutEffect, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { ToastContext } from "../ui/toast-context";

export const SPREADSHEET_GUTTER_WIDTH = 52;
export const SPREADSHEET_NUMBER_GUTTER_WIDTH = SPREADSHEET_GUTTER_WIDTH - 20;
export const SPREADSHEET_PANEL_CLASS = "min-w-0 overflow-hidden rounded-sm border border-slate-200 bg-white";
export const SPREADSHEET_ATTACHED_VIEWPORT_CLASS = "!rounded-none !border-0";

export function SpreadsheetFooter({ total, page = 1, totalPages = 1, children, label = "Table pagination" }: {
  total: number; page?: number; totalPages?: number; children?: ReactNode; label?: string;
}) {
  return <footer aria-label={label} className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-5 py-3 text-xs text-slate-400">
    <span>{total.toLocaleString()} rows {"\u00b7"} Page {Math.max(1, page)} of {Math.max(1, totalPages)}</span>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </footer>;
}

export type SpreadsheetColumn = { key: string; width: number; style?: CSSProperties };

/** Presentation only: never adds entries to a dataset, selection, or export. */
export function SpreadsheetBlankRows({ count, columns, start, height, loading = false, gutterWidth = SPREADSHEET_GUTTER_WIDTH }: {
  count: number; columns: SpreadsheetColumn[]; start: number; height: number; loading?: boolean; gutterWidth?: number;
}) {
  return <>{Array.from({ length: count }, (_, index) => <tr key={`blank-${index}`} data-spreadsheet-blank="true" aria-hidden="true" style={{ height }}>
    <td className="spreadsheet-gutter sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-1 text-center align-middle text-xs tabular-nums text-slate-400" style={{ width: gutterWidth, minWidth: gutterWidth }}><SpreadsheetRowNumber value={start + index} />{gutterWidth === SPREADSHEET_GUTTER_WIDTH && <span aria-hidden="true" className="inline-block w-[18px]" />}</td>
    {columns.map(column => <td key={column.key} className="border-b border-r border-slate-100 px-4" style={{ width: column.width, minWidth: column.width, maxWidth: column.width, ...column.style }}>{loading && <div className="h-3 w-2/3 animate-pulse rounded-sm bg-slate-100 motion-reduce:animate-none" />}</td>)}
  </tr>)}</>;
}

export function SpreadsheetRowNumber({ value }: { value: number | "#" }) {
  return <span aria-hidden="true" className="spreadsheet-row-number inline-block w-5 select-none text-center align-middle text-[11px] font-normal tabular-nums text-slate-400">{value}</span>;
}

export function SpreadsheetDetailsAction({ href, label = "View trip details", onClick }: {
  href?: string; label?: string; onClick?: (event: MouseEvent<HTMLElement>) => void;
}) {
  const className = "spreadsheet-details-action inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-inherit hover:bg-blue-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
  const icon = <ArrowUpRight aria-hidden="true" className="h-4 w-4" />;
  return href ? <a href={href} title={label} aria-label={label} className={className} onClick={onClick}>{icon}</a> : <button type="button" title={label} aria-label={label} className={className} onClick={onClick}>{icon}</button>;
}

/** Measures real layout and footer space instead of a fixed viewport offset. */
export function useSpreadsheetViewport(ref: RefObject<HTMLDivElement | null>, rowCount: number, enabled = true) {
  const [padding, setPadding] = useState({ count: 8, height: SPREADSHEET_DEFAULT_ROW_HEIGHT });
  useLayoutEffect(() => {
    const viewport = ref.current;
    if (!viewport || !enabled) return;
    let frame = 0;
    const measure = () => {
      if (!viewport.getClientRects().length) return;
      const top = viewport.getBoundingClientRect().top;
      const parent = viewport.parentElement;
      const footerHeight = parent ? Array.from(parent.children).filter(child => child !== viewport && child.getBoundingClientRect().top >= viewport.getBoundingClientRect().bottom - 1 && getComputedStyle(child).position !== "fixed").reduce((sum, child) => sum + child.getBoundingClientRect().height + parseFloat(getComputedStyle(child).marginTop || "0") + parseFloat(getComputedStyle(child).marginBottom || "0"), 0) : 0;
      let bottomPadding = 0;
      for (let ancestor = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        bottomPadding += parseFloat(style.paddingBottom || "0") + parseFloat(style.borderBottomWidth || "0");
        if (ancestor.tagName === "MAIN") break;
      }
      const available = Math.max(160, (window.visualViewport?.height ?? window.innerHeight) - top - footerHeight - bottomPadding);
      viewport.style.height = `${available}px`;
      const table = viewport.querySelector("table");
      const body = table?.tBodies[0];
      const realRows = body ? Array.from(body.rows).filter(row => !row.hasAttribute("data-spreadsheet-blank")) : [];
      const height = SPREADSHEET_DEFAULT_ROW_HEIGHT;
      const used = realRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
      const header = table?.tHead?.getBoundingClientRect().height ?? 30;
      const toolbar = viewport.querySelector('[aria-label="Cell formatting"]')?.getBoundingClientRect().height ?? 0;
      // Scroll-container height, not a forced table/body height, determines padding.
      const visibleHeight = viewport.clientHeight;
      const remaining = Math.max(0, visibleHeight - header - toolbar - used);
      const count = Math.min(Math.ceil(visibleHeight / height), Math.ceil(remaining / height));
      setPadding(current => current.count === count && current.height === height ? current : { count, height });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    for (let ancestor = viewport.parentElement; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor);
      if (ancestor.tagName === "MAIN") break;
    }
    const body = viewport.querySelector("tbody");
    if (body) observer.observe(body);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); viewport.style.removeProperty("height"); };
  }, [ref, rowCount, enabled]);
  return padding;
}

export function spreadsheetFeedbackMessage(message: string, variant: "success" | "error" | "warning" = "error") {
  // Only locally composed, bounded outcome summaries may retain their counts.
  if (/^(?:[0-9]+ reports? deleted\.|No reports were deleted\.)(?: [0-9]+ reports? could not be deleted\. Review the selection before retrying\.)?(?: Image cleanup is pending\. Use the image cleanup action to review it\.)?(?: The table could not be refreshed\. Retry loading it\.)?$/.test(message)) return message;
  if (variant === "error") {
    if (message === "Table design could not be saved or refreshed. Unsaved changes can be retried with Retry table design.") return message;
    if (/^(Quantity|Total CBM) must be a non-negative number\.$/.test(message)) return message;
    if (message === "Choose the original image with its original filename.") return message;
    if (/password|credentials/i.test(message)) return "Incorrect password. Please try again.";
    if (/session|expired|sign.?in|unauthenticated/i.test(message)) return "Your session has expired. Please sign in again.";
    if (/permission|not authorized|forbidden|access denied/i.test(message)) return "You do not have permission to perform this action.";
    if (/protected|retention|ownership|financial|pending upload/i.test(message)) return "Unable to complete this action because some records require additional review.";
    if (/conflict|another user|changed since|version/i.test(message)) return "This record changed. Review the latest values before trying again.";
    if (/network|fetch|connection|timeout/i.test(message)) return "Unable to complete this action. Check your connection and try again.";
    return "Unable to complete this action. Please try again.";
  }
  if (/before delete|report data|rpc|postgres|sql|constraint|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b(PGRST|42P|2350)/i.test(message)) {
    return variant === "warning" ? "Some records need review. Your unsaved changes have been kept." : "Changes saved.";
  }
  return message;
}

/** Existing toast provider; deduplicates feedback while keeping cached tables visible. */
export function useSpreadsheetFeedback(message: string | null | undefined, variant: "success" | "error" | "warning" = "success", eventKey?: unknown) {
  const toast = useContext(ToastContext);
  useEffect(() => {
    if (message) { const title = spreadsheetFeedbackMessage(message, variant); toast?.addToast({ title, variant, notificationKey: `spreadsheet:${variant}:${title}` }); }
  }, [message, variant, eventKey, toast?.addToast]);
}
