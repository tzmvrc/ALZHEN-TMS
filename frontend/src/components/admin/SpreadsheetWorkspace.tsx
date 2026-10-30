import {useCallback, useContext, useLayoutEffect, useRef, type ComponentProps, type ReactNode, type RefObject} from "react";
import HiddenColumnsControl from "./HiddenColumnsControl";
import SheetHorizontalScrollbar,{visibleSheetViewport} from "./SheetHorizontalScrollbar";
import {SpreadsheetBottomControlsContext} from "./SpreadsheetBottomControlsContext";
import {tableUi} from "./dashboardStyles";

export function SpreadsheetSheetHeader({title, children}: {title: string; description?: string; children?: ReactNode}) {
  return children ? <header className={`${tableUi.toolbar} spreadsheet-page-toolbar items-center`}>
    <h1 className="sr-only">{title}</h1>
    {children}
  </header> : <h1 className="sr-only">{title}</h1>;
}

// Sheets register visibility actions; the footer owns the button's physical layout.
export function SpreadsheetHiddenColumns({sheet, ...props}: ComponentProps<typeof HiddenColumnsControl> & {sheet: string}) {
  const workspace = useContext(SpreadsheetBottomControlsContext);
  const latest = useRef(props);
  useLayoutEffect(()=>{latest.current=props;});
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

export function SpreadsheetLoadedStatus({sheet,loaded,total,loading,autoFit}:{sheet:string;loaded:number;total:number;loading:boolean;autoFit:boolean}){
  const context=useContext(SpreadsheetBottomControlsContext);
  const register=context?.registerPaging;
  const active=context?.activeSheet;
  useLayoutEffect(()=>{
    if(active!==sheet||!register)return;
    return register(sheet,<span>Showing {loaded.toLocaleString()} of {total.toLocaleString()} rows{loading?' · Updating…':''}</span>,null,autoFit);
  },[register,active,sheet,loaded,total,loading,autoFit]);
  return null;
}

export function SpreadsheetBottomToolbar({workspace, sheet, onHiddenColumnsTarget, children, hiddenColumnsControl, masterPaging}: {
  workspace: RefObject<HTMLElement | null>; sheet: string;
  onHiddenColumnsTarget?: (target: HTMLDivElement | null) => void; children: ReactNode; hiddenColumnsControl?: ReactNode;
  masterPaging?: {status:ReactNode;pagination:ReactNode;autoFit:boolean|null}|null;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  const toggleAutoFit=()=>{
    visibleSheetViewport(workspace.current,sheet)?.dispatchEvent(new Event("sheet:auto-fit"));
  };
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
  return <div data-sheet-tabs className={`spreadsheet-footer relative z-10 w-full min-w-0 max-w-full shrink-0 border-t border-[#e4e9f0] ml-master-footer bg-[#F6F8FC]`}>
    <div className="spreadsheet-footer-layout">
      <div ref={tabs} className="spreadsheet-footer-tabs">{children}</div>
      <div className="ml-master-footer-status">{masterPaging?.status}</div>
      <div ref={onHiddenColumnsTarget} className="ml-master-footer-tools">
        {hiddenColumnsControl}
        {masterPaging?.autoFit!==null&&<button type="button" role="switch" aria-checked={masterPaging?.autoFit??true} aria-label="Auto fit columns" onClick={toggleAutoFit} className="ml-auto-fit-control"><span className="ml-auto-fit-track" aria-hidden="true"><span/></span><span>Auto fit</span></button>}
      </div>
      <SheetHorizontalScrollbar arrows workspace={workspace} sheet={sheet} />
      <div className="ml-master-footer-pagination">{masterPaging?.pagination}</div>
    </div>
  </div>;
}
