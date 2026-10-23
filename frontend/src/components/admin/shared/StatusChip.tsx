import { AlertTriangle, CheckCircle2, Clock3, Info, XCircle } from "lucide-react";
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
const tones = {
  success: { style: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  warning: { style: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle },
  danger: { style: "border-rose-200 bg-rose-50 text-rose-800", icon: XCircle },
  info: { style: "border-blue-200 bg-blue-50 text-[#2678b9]", icon: Info },
  neutral: { style: "border-slate-200 bg-slate-100 text-slate-600", icon: Clock3 },
};
export default function StatusChip({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  const { style, icon: Icon } = tones[tone];
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style}`}><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span>{label}</span></span>;
}
