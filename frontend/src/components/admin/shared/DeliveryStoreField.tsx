import { useEffect, useRef, useState, type ReactNode } from "react";

export default function DeliveryStoreField({ name, selected, disabled, children }: { name: string; selected: boolean; disabled?: boolean; children: (onPicked: () => void) => ReactNode }) {
  const [changing, setChanging] = useState(false);
  const editing = !selected || changing;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing || document.activeElement?.closest('[role="tablist"]')) return;
    // Let the modal capture its opener before focusing an empty store field.
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [editing]);
  return <div ref={root} className={`delivery-store-field ${editing ? "is-editing" : ""}`}><h4>Delivery store</h4>{editing ? <><div className="delivery-store-search">{children(() => setChanging(false))}</div><p>Search a store or type a destination</p>{selected && <button type="button" className="delivery-store-change" onClick={() => setChanging(false)}>Cancel change</button>}</> : <div className="delivery-store-value"><span title={name}>{name}</span><button type="button" disabled={disabled} onClick={() => setChanging(true)}>Change</button></div>}</div>;
}
