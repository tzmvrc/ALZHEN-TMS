import { useEffect, type ReactNode } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel = "Log out",
  confirmDisabled = false,
  isConfirming = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center px-4 al-modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="relative z-[2001] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.25)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="logout-dialog-title"
          className="text-lg font-semibold text-slate-900"
        >
          {title}
        </h2>

        {description ? (
          <div className="mt-2 text-sm leading-6 text-slate-600">
            {description}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled || isConfirming}
            className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isConfirming ? "Logging out..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
