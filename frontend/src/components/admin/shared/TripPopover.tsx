import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Native modal focus containment; unmounting restores focus to the invoking control. */
export default function TripPopover({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return createPortal(<dialog ref={ref} aria-modal="true" aria-label={title} className="trip-popover trip-flow" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
    <header><h3>{title}</h3><button type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></button></header><div className="trip-popover-body">{children}</div>
  </dialog>, document.body);
}
