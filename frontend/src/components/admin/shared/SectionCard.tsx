import type { ReactNode } from "react";
export type SectionCardProps = { title: string; description?: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string };
export default function SectionCard({ title, description, icon, actions, children, className = "", bodyClassName = "p-4 sm:p-5", id }: SectionCardProps) {
  return <section id={id} aria-label={title} className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:px-5"><div className="flex min-w-0 gap-3">{icon && <span aria-hidden="true" className="mt-0.5 shrink-0 text-[#2678b9]">{icon}</span>}<div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[#0b2341]">{title}</h3>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div></div>{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}</header>
    <div className={bodyClassName}>{children}</div>
  </section>;
}
