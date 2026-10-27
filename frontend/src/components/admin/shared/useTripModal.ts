import { useEffect, useRef } from "react";

let openModals = 0;
let previousOverflow = "";

/** Shared dialog behavior; dismissal still goes through each flow's save guards. */
export function useTripModal<T extends HTMLElement>({ onClose, onEscape = onClose, active = true }: {
  onClose: () => void; onEscape?: () => void; active?: boolean;
}) {
  const ref = useRef<T>(null);
  const callbacks = useRef({ onClose, onEscape });
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { callbacks.current = { onClose, onEscape }; });

  useEffect(() => {
    if (!active || !ref.current) return;
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openModals++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const frame = requestAnimationFrame(() => dialog.querySelector<HTMLElement>("[data-trip-initial-focus]")?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const dialogs = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter(element => element.getClientRects().length > 0);
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); callbacks.current.onEscape(); return; }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex]')]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      if (closingTimer.current) { clearTimeout(closingTimer.current); closingTimer.current = null; }
      window.removeEventListener("keydown", onKey);
      if (--openModals === 0) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [active]);

  const close = () => {
    if (closingTimer.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !ref.current) { callbacks.current.onClose(); return; }
    ref.current.dataset.closing = "true";
    closingTimer.current = setTimeout(() => { closingTimer.current = null; callbacks.current.onClose(); }, 140);
  };
  return { ref, close };
}
