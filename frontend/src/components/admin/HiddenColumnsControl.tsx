import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties} from "react";
import {createPortal} from "react-dom";

type Props = {
  columns: readonly {key: string; title: string}[];
  onRestore: (key: string) => void;
  onRestoreAll: () => void;
  portalMenu?: boolean;
};

export default function HiddenColumnsControl({columns, onRestore, onRestoreAll, portalMenu = true}: Props) {
  const anchor = useRef<HTMLDetailsElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState<CSSProperties>({});
  useEffect(() => { if (!columns.length) setOpen(false); }, [columns.length]);
  useLayoutEffect(() => {
    if (!open) return;
    const dismiss = () => {
      if (anchor.current) anchor.current.open = false;
      setOpen(false);
    };
    const place = () => {
      if (!portalMenu) return;
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(232, window.innerWidth - 16);
      setPosition({position: "fixed", width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(256, Math.max(40, rect.top - 12))});
    };
    const contains = (target: Node) => anchor.current?.contains(target) || menu.current?.contains(target);
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        if (menu.current?.contains(document.activeElement)) anchor.current?.querySelector("summary")?.focus();
      } else if (contains(event.target as Node)) return;
      dismiss();
    };
    // Keyboard/programmatic menu opening may not produce an outside pointer event.
    const isPopup = (node: Node) => node instanceof Element && !contains(node) &&
      (node.matches('[role="menu"],[role="listbox"],[role="dialog"]') || Boolean(node.querySelector('[role="menu"],[role="listbox"],[role="dialog"]')));
    const observer = new MutationObserver(records => {
      if (records.some(record => !contains(record.target) && (
        record.type === "attributes" && record.target instanceof Element && record.target.matches('[aria-expanded="true"],[role="tab"][aria-selected="true"]') ||
        record.type === "childList" && Array.from(record.addedNodes).some(isPopup)
      ))) dismiss();
    });
    place();
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ["aria-expanded", "aria-selected"]});
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    for (const event of ["pointerdown", "click", "contextmenu", "keydown"]) window.addEventListener(event, close, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      for (const event of ["pointerdown", "click", "contextmenu", "keydown"]) window.removeEventListener(event, close, true);
    };
  }, [portalMenu, open]);
  if (!columns.length) return null;
  const dropdown = <div ref={menu} role="menu" aria-label="Hidden columns" style={portalMenu ? position : undefined} className="absolute bottom-full left-0 z-[100] mb-1 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-600 shadow-lg">
    <button type="button" role="menuitem" className="w-full rounded px-3 py-2 text-left font-semibold hover:bg-blue-50" onClick={onRestoreAll}>Restore all</button>
    {columns.map(column => <button type="button" role="menuitem" key={column.key} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => onRestore(column.key)}>Restore {column.title}</button>)}
  </div>;
  return <details ref={anchor} onToggle={event => setOpen(event.currentTarget.open)} className="relative inline-block w-fit shrink-0 text-xs text-slate-600">
    <summary className="cursor-pointer whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Hidden columns ({columns.length})</summary>
    {portalMenu ? (open ? createPortal(dropdown, document.body) : null) : dropdown}
  </details>;
}
