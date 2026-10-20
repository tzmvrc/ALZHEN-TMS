import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const tones = {
  info: { style: "border-blue-100 bg-blue-50 text-blue-900", icon: Info },
  success: { style: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  warning: { style: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  error: { style: "border-rose-200 bg-rose-50 text-rose-900", icon: AlertCircle },
};

export default function TripFormNotice({ tone = "info", title, children, action, onDismiss }: {
  tone?: keyof typeof tones; title: string; children?: ReactNode; action?: ReactNode; onDismiss?: () => void;
}) {
  const { style, icon: Icon } = tones[tone];
  return <div role={tone === "error" || tone === "warning" ? "alert" : "status"} className={`flex min-w-0 items-start gap-3 rounded-xl border px-4 py-3 ${style}`}>
    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0 flex-1 space-y-1 break-words text-xs leading-5"><p className="text-[13px] font-semibold leading-5">{title}</p>{children && <div>{children}</div>}{action && <div className="pt-1">{action}</div>}</div>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label={`Dismiss ${title}`} className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 opacity-70 hover:bg-white/60 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"><X aria-hidden="true" className="h-4 w-4" /></button>}
  </div>;
}
