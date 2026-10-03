// src/components/admin/OverviewCards.tsx
import { useState, type ReactNode } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { DispatchRecord } from "../../types/dashboard";
import { fleetTruckPhoto, surface } from "./dashboardStyles";

/* ------------------------------------------------------------------ */
/* Greeting header                                                      */
/* ------------------------------------------------------------------ */
export function GreetingHeader({
  name,
  updatedLabel,
  onRefresh,
}: {
  name: string;
  updatedLabel?: string;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex flex-col justify-center py-2">
      <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight text-[#0b2341] sm:text-[40px]">
        Hi, {name}!
        <br />
        What&apos;s moving{" "}
        <span className="rounded-xl bg-[#ffd43b] px-2 pb-0.5">today</span>?
      </h1>
      <p className="mt-4 max-w-sm text-[15px] leading-snug text-slate-500">
        Keep an eye on every trip, truck and driver, and step in before a
        delivery slips.
      </p>
      <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-400">
        {updatedLabel ? <span>Last updated {updatedLabel}</span> : null}
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh dashboard"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trip shortcut cards (top-right row)                                  */
/* ------------------------------------------------------------------ */
export function TripShortcutRow({
  rows,
  selectedTripId,
  onSelectTrip,
}: {
  rows: DispatchRecord[];
  selectedTripId?: string | null;
  onSelectTrip?: (id: string) => void;
}) {
  const shown = rows.slice(0, 4);
  if (shown.length === 0) {
    return (
      <div className={`${surface.card} flex items-center justify-center p-6 text-sm text-slate-400`}>
        No trips yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {shown.map((trip) => {
        const selected = trip.id === selectedTripId;
        return (
          <button
            key={trip.id}
            type="button"
            onClick={() => onSelectTrip?.(trip.id)}
            aria-pressed={selected}
            className={`${surface.card} flex min-w-0 flex-col p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30 ${
              selected ? "ring-2 ring-[#ffd43b]" : "hover:-translate-y-0.5"
            }`}
          >
            <span className="flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-[#f2f6fa]">
              <img
                src={fleetTruckPhoto}
                alt=""
                className="h-full w-full object-contain p-2"
              />
            </span>
            <span className="mt-3 truncate text-[13px] font-semibold text-[#0b2341]">
              {trip.displayId ?? trip.id}
            </span>
            <span className="truncate text-[11px] text-slate-400">
              {trip.driver}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ring stat card                                                       */
/* ------------------------------------------------------------------ */
function ProgressRing({
  percent,
  color,
  track = "#e3eaf2",
}: {
  percent: number;
  color: string;
  track?: string;
}) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <span className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 60 60" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="30" cy="30" r={radius} fill="none" stroke={track} strokeWidth="5" />
        <circle
          cx="30"
          cy="30"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <span className="relative text-[12px] font-bold tabular-nums text-[#0b2341]">
        {Math.round(clamped)}%
      </span>
    </span>
  );
}

export function RingStatCard({
  label,
  title,
  caption,
  value,
  percent,
  color,
  actionLabel = "View",
  onAction,
}: {
  label: string;
  title: string;
  caption: string;
  value: string;
  percent: number;
  color: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`${surface.card} flex min-w-0 flex-col justify-between gap-3 p-4`}>
      <div className="flex items-center gap-3">
        <ProgressRing percent={percent} color={color} />
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-wide" style={{ color }}>
            {label}
          </p>
          <p className="truncate text-[15px] font-bold text-[#0b2341]">{title}</p>
          <p className="text-[22px] font-extrabold leading-none tabular-nums text-[#0b2341]">
            {value}
          </p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-[11px] leading-snug text-slate-400">{caption}</p>
        {onAction ? (
          <button type="button" onClick={onAction} className={surface.chip}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spotlight trips (dark + light card, like the to-do list)             */
/* ------------------------------------------------------------------ */
function statusTag(status: DispatchRecord["status"]) {
  if (status === "Delayed") return "bg-[#fde8d4] text-[#a14b00]";
  if (status === "Completed") return "bg-[#e4f3e8] text-[#1d6b3a]";
  if (status === "In Progress") return "bg-[#e5eefc] text-[#2457b3]";
  return "bg-slate-100 text-slate-600";
}

export function SpotlightTrips({
  rows,
  onViewTrip,
  action,
}: {
  rows: DispatchRecord[];
  onViewTrip?: (id: string) => void;
  action?: ReactNode;
}) {
  const ordered = [
    ...rows.filter((trip) => trip.status === "Delayed"),
    ...rows.filter((trip) => trip.status === "In Progress"),
    ...rows.filter((trip) => trip.status === "Other"),
    ...rows.filter((trip) => trip.status === "Completed"),
  ];
  const [featured, next] = ordered;

  return (
    <section className={`${surface.card} p-5`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={surface.heading}>Needs your attention</h2>
        {action}
      </div>
      {!featured ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No trips to review right now.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onViewTrip?.(featured.id)}
            className="flex min-h-[148px] flex-col justify-between rounded-3xl bg-[#0b2341] p-4 text-left text-white shadow-[0_18px_36px_-18px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="text-[17px] font-semibold leading-tight">
                {featured.displayId ?? featured.id}
                <span className="mt-1 block text-[12px] font-normal text-white/60">
                  {featured.origin} → {featured.destination}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-[#0b2341]">
                {featured.statusText ?? featured.status}
              </span>
            </span>
            <span className="flex items-end justify-between gap-3">
              <span className="rounded-full bg-[#ffd43b] px-3 py-1.5 text-[11px] font-semibold text-[#0b2341]">
                {featured.tripType ?? "Regular"}
              </span>
              <span className="truncate text-[11px] text-white/70">
                {featured.driver} · ETA {featured.eta}
              </span>
            </span>
          </button>

          {next ? (
            <button
              type="button"
              onClick={() => onViewTrip?.(next.id)}
              className="flex min-h-[148px] flex-col justify-between rounded-3xl bg-[#f2f6fa] p-4 text-left transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-[17px] font-semibold leading-tight text-[#0b2341]">
                  {next.displayId ?? next.id}
                  <span className="mt-1 block text-[12px] font-normal text-slate-500">
                    {next.origin} → {next.destination}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTag(next.status)}`}>
                  {next.statusText ?? next.status}
                </span>
              </span>
              <span className="flex items-end justify-between gap-3">
                <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {next.tripType ?? "Regular"}
                </span>
                <span className="truncate text-[11px] text-slate-500">
                  {next.driver} · ETA {next.eta}
                </span>
              </span>
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Active fleet list (assignments style)                                */
/* ------------------------------------------------------------------ */
type FleetTab = "all" | "delayed" | "in-progress" | "completed" | "other";

export function FleetListCard({
  rows,
  selectedTripId,
  onSelectTrip,
  onViewTrip,
}: {
  rows: DispatchRecord[];
  selectedTripId?: string | null;
  onSelectTrip?: (id: string) => void;
  onViewTrip?: (id: string) => void;
}) {
  const [tab, setTab] = useState<FleetTab>("all");
  const tabs: { id: FleetTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: rows.length },
    { id: "delayed", label: "Delayed", count: rows.filter((r) => r.status === "Delayed").length },
    { id: "in-progress", label: "In progress", count: rows.filter((r) => r.status === "In Progress").length },
    { id: "completed", label: "Completed", count: rows.filter((r) => r.status === "Completed").length },
    { id: "other", label: "Other", count: rows.filter((r) => r.status === "Other").length },
  ];
  const priority: Record<DispatchRecord["status"], number> = {
    "In Progress": 0,
    Delayed: 1,
    Completed: 2,
    Other: 3,
  };
  const visible = rows
    .filter(
      (trip) =>
        tab === "all" ||
        trip.status.toLowerCase().replace(" ", "-") === tab,
    )
    .slice()
    .sort((a, b) => priority[a.status] - priority[b.status])
    .slice(0, 6);

  return (
    <section className={`${surface.card} p-5`}>
      <h2 className={`${surface.heading} mb-3`}>Active fleet</h2>
      <div
        className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-[#f2f6fa] p-1"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 ${
              tab === t.id
                ? "bg-[#0b2341] text-white"
                : "text-slate-500 hover:text-[#0b2341]"
            }`}
          >
            {t.label} <span className="opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          No trips in this view.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((trip) => {
            const progress = Math.min(Math.max(trip.progressPct ?? 0, 0), 100);
            const selected = trip.id === selectedTripId;
            const barColor =
              trip.status === "Delayed"
                ? "#f59e0b"
                : trip.status === "Completed"
                  ? "#10b981"
                  : "#2678b9";
            return (
              <li
                key={trip.id}
                className={`flex items-center gap-2 rounded-2xl bg-[#f2f6fa] p-2.5 transition ${
                  selected ? "ring-2 ring-[#ffd43b]" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectTrip?.(trip.id)}
                  aria-pressed={selected}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                    <img src={fleetTruckPhoto} alt="" className="h-full w-full object-contain p-1" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-[#0b2341]">
                        {trip.displayId ?? trip.id}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTag(trip.status)}`}>
                        {trip.statusText ?? trip.status}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      {trip.origin} → {trip.destination}
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${progress}%`, backgroundColor: barColor }}
                        />
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums text-slate-600">
                        {progress}%
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-slate-400">
                      {trip.driver} · ETA {trip.eta}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewTrip?.(trip.id)}
                  aria-label={`View trip details for ${trip.displayId ?? trip.id}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 transition hover:bg-[#ffd43b] hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity (notifications style)                                */
/* ------------------------------------------------------------------ */
const feedDot = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
} as const;

export function ActivityFeedCard({
  events,
  title = "Recent activity",
}: {
  events: { id: string; time: string; message: string; tone: string }[];
  title?: string;
}) {
  return (
    <section className={`${surface.card} flex min-h-0 flex-col p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={surface.heading}>{title}</h2>
        <span className="text-[11px] text-slate-400">{events.length} events</span>
      </div>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No recent activity.</p>
      ) : (
        <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {events.map((event) => (
            <li key={event.id} className="rounded-2xl bg-[#f2f6fa] px-3.5 py-3">
              <p className="flex items-start gap-2 text-[12px] font-semibold capitalize leading-snug text-[#0b2341]">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    feedDot[event.tone as keyof typeof feedDot] ?? "bg-slate-400"
                  }`}
                />
                <span className="min-w-0 break-words">{event.message}</span>
              </p>
              <time className="mt-1 block pl-4 text-[10px] tabular-nums text-slate-400">
                {event.time}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}