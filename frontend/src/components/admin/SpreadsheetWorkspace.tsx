import {createContext, useCallback, useContext, useLayoutEffect, useRef, type ComponentProps, type ReactNode, type RefObject} from "react";
import HiddenColumnsControl from "./HiddenColumnsControl";
import SheetHorizontalScrollbar from "./SheetHorizontalScrollbar";
import {tableUi} from "./dashboardStyles";

export function SpreadsheetSheetHeader({title, children}: {title: string; description?: string; children?: ReactNode}) {
  return children ? <header className={`${tableUi.toolbar} spreadsheet-page-toolbar items-center`}>
    <h1 className="sr-only">{title}</h1>
    {children}
  </header> : <h1 className="sr-only">{title}</h1>;
}

// Sheets register visibility actions; the footer owns the button's physical layout.
export const SpreadsheetBottomControlsContext = createContext<{
  activeSheet: string;
  registerHiddenColumns: (sheet: string, control: ReactNode) => () => void;
} | null>(null);
export function SpreadsheetHiddenColumns({sheet, ...props}: ComponentProps<typeof HiddenColumnsControl> & {sheet: string}) {
  const workspace = useContext(SpreadsheetBottomControlsContext);
  const latest = useRef(props);
  latest.current = props;
  const restore = useCallback((key: string) => latest.current.onRestore(key), []);
  const restoreAll = useCallback(() => latest.current.onRestoreAll(), []);
  const columnsKey = JSON.stringify(props.columns);
  const register = workspace?.registerHiddenColumns;
  const activeSheet = workspace?.activeSheet;
  useLayoutEffect(() => {
    if (!register || activeSheet !== sheet) return;
    return register(sheet, <HiddenColumnsControl key={sheet} columns={latest.current.columns} onRestore={restore} onRestoreAll={restoreAll} portalMenu />);
  }, [register, activeSheet, sheet, columnsKey, restore, restoreAll]);
  // Inside a Trips workspace there is never an inline control above the tabs.
  return workspace ? null : <HiddenColumnsControl key={sheet} {...props} portalMenu />;
}

export function SpreadsheetBottomToolbar({workspace, sheet, onHiddenColumnsTarget, children, hiddenColumnsControl}: {
  workspace: RefObject<HTMLElement | null>; sheet: string;
  onHiddenColumnsTarget?: (target: HTMLDivElement | null) => void; children: ReactNode; hiddenColumnsControl?: ReactNode;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const nav = tabs.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!nav) return;
    const reveal = () => {
      const active = nav.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active || !nav.clientWidth) return;
      const bounds = nav.getBoundingClientRect(), selected = active.getBoundingClientRect();
      if (selected.left < bounds.left) nav.scrollLeft += selected.left - bounds.left;
      else if (selected.right > bounds.right) nav.scrollLeft += selected.right - bounds.right;
    };
    const resize = new ResizeObserver(reveal);
    resize.observe(nav); reveal();
    return () => resize.disconnect();
  }, [sheet]);
  return <div data-sheet-tabs className="spreadsheet-footer relative z-10 w-full min-w-0 max-w-full shrink-0 border-t border-[#e4e9f0] bg-[#f3f5f8]">
    <div className="spreadsheet-footer-layout">
      <div ref={tabs} className="spreadsheet-footer-tabs">{children}</div>
      <div ref={onHiddenColumnsTarget} className="spreadsheet-footer-hidden flex min-w-0 items-center px-3 py-1">{hiddenColumnsControl}</div>
      <button type="button" title="Fit columns to loaded content" onClick={() => workspace.current?.querySelector(`#trip-sheet-${sheet} .spreadsheet-viewport`)?.dispatchEvent(new Event("sheet:auto-fit"))} className="whitespace-nowrap border-l border-[#e4e9f0] px-2 text-[11px] text-slate-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-[#0b2343]">Auto Fit</button>
      <SheetHorizontalScrollbar arrows workspace={workspace} sheet={sheet} />
    </div>
  </div>;
}
