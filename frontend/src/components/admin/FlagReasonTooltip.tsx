import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";

export default function FlagReasonTooltip({ reasons, label, reviewed }: { reasons: readonly string[]; label: string; reviewed?: boolean }) {
  const Icon = reviewed ? CheckCircle2 : reasons.length ? AlertTriangle : Circle;
  const description = `${label}${reasons.length ? `: ${reasons.join("; ")}` : ""}`;
  return <span className="review-flag" tabIndex={0} role="img" aria-label={description} title={description}><Icon aria-hidden="true" size={14} /><span>{label}</span></span>;
}
