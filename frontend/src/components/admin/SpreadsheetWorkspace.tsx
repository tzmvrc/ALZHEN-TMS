import {createContext, useCallback, useContext, useLayoutEffect, useRef, type ComponentProps, type ReactNode, type RefObject} from "react";
import HiddenColumnsControl from "./HiddenColumnsControl";
import SheetHorizontalScrollbar from "./SheetHorizontalScrollbar";
import {tableUi} from "./dashboardStyles";

export function SpreadsheetSheetHeader({title, description, children}: {title: string; description?: string; children?: ReactNode}) {
  return <header className={`${tableUi.toolbar} items-center`}>
    <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[#0b2341]">{title}</h1>{description && <p className="mt-1 text-xs text-slate-600">{description}</p>}</div>
    {children}
  </header>;
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

export function SpreadsheetBottomToolbar({workspace, sheet, onHiddenColumnsTarget, children, singleRow = false, hiddenColumnsControl}: {
  workspace: RefObject<HTMLElement | null>; sheet: string;
  onHiddenColumnsTarget?: (target: HTMLDivElement | null) => void; children: ReactNode; singleRow?: boolean; hiddenColumnsControl?: ReactNode;
}) {
  return <div data-sheet-tabs className={`relative z-10 flex min-w-0 shrink-0 items-stretch border-t border-slate-200 bg-slate-100 ${singleRow ? "w-full max-w-full flex-nowrap" : "flex-wrap"}`}>
    <div className={singleRow ? "flex min-w-0 flex-1 overflow-hidden" : "flex min-w-0 flex-[1_1_16rem] overflow-hidden"}>{children}</div>
    <div className={`flex items-stretch ${singleRow ? "min-w-0 flex-none flex-nowrap whitespace-nowrap" : "ml-auto min-w-0 max-w-full flex-wrap"}`}>
      <div ref={onHiddenColumnsTarget} className="flex shrink-0 items-center px-3 py-1">{hiddenColumnsControl}</div>
      <button type="button" title="Fit columns to loaded content" onClick={() => workspace.current?.querySelector(`#trip-sheet-${sheet} .spreadsheet-viewport`)?.dispatchEvent(new Event("sheet:auto-fit"))} className="shrink-0 border-l border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-500">Auto Fit</button>
      <SheetHorizontalScrollbar arrows workspace={workspace} sheet={sheet} width={singleRow ? 192 : undefined} />
    </div>
  </div>;
}
