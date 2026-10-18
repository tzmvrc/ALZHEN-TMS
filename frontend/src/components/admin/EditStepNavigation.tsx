export default function EditStepNavigation({ steps, current, onChange, busy }: {
  steps: readonly string[]; current: number; onChange: (step: number) => void; busy: boolean;
}) {
  return <nav aria-label="Edit sections" className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 p-3">
    {steps.map((title, index) => <button key={title} type="button" disabled={busy} aria-current={current === index ? "step" : undefined} onClick={() => onChange(index)} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${current === index ? "bg-[#0b2341] text-white" : "text-slate-600 hover:bg-white"}`}>{index + 1}. {title}</button>)}
  </nav>;
}
