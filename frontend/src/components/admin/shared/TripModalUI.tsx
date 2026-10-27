import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { focusRing } from "./styles";
import "./trip-modal.css";

export const tripModalBackdrop = "al-modal-backdrop trip-flow-backdrop fixed inset-0 flex items-center justify-center sm:p-4 lg:p-6";
export const tripModalShell = "trip-flow flex min-w-0 w-full flex-col overflow-hidden bg-white text-slate-800";
export const tripPrimaryAction = `trip-primary inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-[#0b2341] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#163b63] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
export const tripSecondaryAction = `trip-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0b2341] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
export const tripFooter = "trip-flow-footer shrink-0 border-t border-slate-200 bg-white";

type HeaderProps = { id: string; title: string; description: string; icon: ReactNode; children?: ReactNode; disabled?: boolean; onClose: () => void; closeLabel: string };
export function TripModalHeader({ id, title, description, icon, children, disabled, onClose, closeLabel }: HeaderProps) {
  return <header className="trip-flow-header">
    <span aria-hidden="true" className="trip-header-icon">{icon}</span>
    <h2 id={id} tabIndex={-1} data-trip-initial-focus className="min-w-0 text-lg font-semibold text-[#0b2341] outline-none">{title}</h2>
    <span className="trip-header-breadcrumb">Operations / Trips</span>
    <p id={`${id}-description`} className="sr-only">{description}</p>
    <div className="trip-header-meta">{children}</div>
    <button type="button" disabled={disabled} aria-label={closeLabel} onClick={onClose} className={`trip-close ${focusRing}`}><X aria-hidden="true" size={18} /></button>
  </header>;
}

type StepProps = { labels: readonly string[]; current: number; onJump: (index: number) => void; isDisabled: (index: number) => boolean; label: string };
export function TripModalSteps({ labels, current, onJump, isDisabled, label }: StepProps) {
  return <nav aria-label={label} className="trip-flow-steps"><ol>{labels.map((text, index) => {
    const active = index === current, complete = index < current;
    return <li key={text}><button type="button" disabled={isDisabled(index)} onClick={() => onJump(index)} aria-current={active ? "step" : undefined} className={focusRing}>
      <span aria-hidden="true" className={`trip-step-number ${active ? "is-active" : complete ? "is-complete" : ""}`}>{complete ? <Check size={12} /> : index + 1}</span><span>{text}</span><span className="sr-only">{active ? ", current step" : complete ? ", previous step" : ""}</span>
    </button></li>;
  })}</ol></nav>;
}
