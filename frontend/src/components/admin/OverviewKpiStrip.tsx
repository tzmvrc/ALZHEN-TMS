// src/components/admin/OverviewKpiStrip.tsx
// Admin-style stat cards: coloured icon tile, figure, note.
// "Recorded trips" also carries a 7-day sparkline and the status split bar.
import type { ComponentType } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, MapPin, Truck, UserRound } from "lucide-react";
import { surface } from "./dashboardStyles";

type Props = {
  total: number;
  inProgress: number;
  completed: number;
  delayed: number;
  activeDrivers: number;
  gpsReporting: number;
  gpsExpected: number;
  /** Trips (or fallback activity) per day, oldest first. */
  trend?: number[];
  trendLabel?: string;
  isLoading: boolean;
  onNavigate?: (sectionId: string) => void;
};

type Figure = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  tile: string;
  target?: string;
  alert?: boolean;
};

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center rounded-2xl bg-[#f2f6fa] text-[11px] text-slate-400">
        Trend appears after two days of data
      </div>
    );
  }
  const w = 220;
  const h = 64;
  const pad = 6;
  const max = Math.max(...values, 1);
  const x = (i: number) => pad + (i * (w - pad * 2)) / (values.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id="kpi-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2678b9" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#2678b9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#kpi-trend-fill)" />
      <path d={line} fill="none" stroke="#2678b9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function OverviewKpiStrip({
  total,
  inProgress,
  completed,
  delayed,
  activeDrivers,
  gpsReporting,
  gpsExpected,
  trend = [],
  trendLabel = "Trips per day",
  isLoading,
  onNavigate,
}: Props) {
  const show = (n: number) => (isLoading ? "…" : n.toLocaleString());
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const other = Math.max(total - inProgress - completed, 0);
  const gps = gpsExpected > 0 ? Math.round((gpsReporting / gpsExpected) * 100) : null;

  const segments = [
    { key: "completed", label: "Completed", n: completed, color: "#10b981" },
    { key: "transit", label: "In transit", n: inProgress, color: "#2678b9" },
    { key: "other", label: "Other", n: other, color: "#cbd5e1" },
  ];

  const figures: Figure[] = [
    {
      key: "transit",
      label: "In transit",
      value: show(inProgress),
      note: isLoading ? "" : `${pct(inProgress)}% of trips`,
      icon: Truck,
      tile: "bg-[#2678b9] text-white",
      target: "monitoring",
    },
    {
      key: "done",
      label: "Completed",
      value: show(completed),
      note: isLoading ? "" : `${pct(completed)}% of trips`,
      icon: CheckCircle2,
      tile: "bg-emerald-500 text-white",
      target: "combined",
    },
    {
      key: "delayed",
      label: "Delayed",
      value: show(delayed),
      note: delayed > 0 ? "Needs follow-up" : "On schedule",
      icon: AlertTriangle,
      tile: "bg-amber-400 text-[#0b2341]",
      target: "monitoring",
      alert: !isLoading && delayed > 0,
    },
    {
      key: "drivers",
      label: "Active drivers",
      value: show(activeDrivers),
      note: "On live trips",
      icon: UserRound,
      tile: "bg-violet-500 text-white",
    },
    {
      key: "gps",
      label: "GPS coverage",
      value: isLoading ? "…" : gps === null ? "—" : `${gps}%`,
      note: gpsExpected > 0 ? `${gpsReporting} of ${gpsExpected} reporting` : "No live trips",
      icon: MapPin,
      tile: "bg-[#0b2341] text-[#ffd43b]",
    },
  ];

  const cardBase = `${surface.card} min-w-0 p-5 text-left`;
  const clickable =
    "transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

  return (
    <section aria-label="Fleet summary" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">
      <article className={`${cardBase} col-span-2 sm:col-span-3 xl:col-span-2`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-slate-500">Recorded trips</p>
            <p className="mt-1 text-[34px] font-bold leading-none tabular-nums text-[#0b2341]">{show(total)}</p>
            <p className="mt-1.5 text-[11px] text-slate-400">{trendLabel}, last 7 days</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ffd43b] text-[#0b2341]">
            <ClipboardList aria-hidden="true" className="h-5 w-5" />
          </span>
        </div>
        <div className="mt-3">
          <Sparkline values={trend} label={`${trendLabel}, last 7 days`} />
        </div>
        <div
          className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#e3eaf2]"
          role="img"
          aria-label={`Trip status split: ${completed} completed, ${inProgress} in transit, ${other} other`}
        >
          {total > 0 &&
            segments.map((s) => (
              <span
                key={s.key}
                className="h-full transition-[width] duration-700 motion-reduce:transition-none"
                style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }}
              />
            ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {segments.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </article>

      {figures.map((f) => {
        const Icon = f.icon;
        const body = (
          <>
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${f.tile}`}>
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <p className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
              {f.alert && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
              {f.label}
            </p>
            <p className={`mt-1 text-[30px] font-bold leading-none tabular-nums ${f.alert ? "text-amber-600" : "text-[#0b2341]"}`}>
              {f.value}
            </p>
            <p className="mt-1.5 truncate text-[11px] text-slate-400">{f.note}</p>
          </>
        );
        return f.target && onNavigate ? (
          <button key={f.key} type="button" onClick={() => onNavigate(f.target!)} className={`${cardBase} ${clickable}`}>
            {body}
          </button>
        ) : (
          <div key={f.key} className={cardBase}>
            {body}
          </div>
        );
      })}
    </section>
  );
}