import { PackageOpen } from "lucide-react";
import type { ReactNode } from "react";
export default function EmptyState({ title, description, icon = <PackageOpen className="h-6 w-6" />, action }: { title: string; description: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8 text-center"><span aria-hidden="true" className="rounded-2xl bg-white p-3 text-[#2678b9] shadow-sm">{icon}</span><div><h4 className="text-sm font-semibold text-[#0b2341]">{title}</h4><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p></div>{action}</div>;
}
