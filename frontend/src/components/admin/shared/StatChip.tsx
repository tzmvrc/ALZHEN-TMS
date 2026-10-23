import type { ReactNode } from "react";
export default function StatChip({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return <div className="inline-flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><span aria-hidden="true" className="shrink-0 text-[#2678b9]">{icon}</span><span className="min-w-0"><span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span><span className="block break-words font-semibold tabular-nums text-[#0b2341]">{value}</span></span></div>;
}
