// src/components/admin/OverviewCards.tsx
import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, MapPin, RefreshCw, Users } from "lucide-react";
import type { DispatchRecord } from "../../types/dashboard";
import type { ReportRow } from "../../services/report.service";
import type { DispatchRequest } from "../../types/requests";
import { getFleetTruckCutout, getFleetTruckPhoto, surface } from "./dashboardStyles";
import ImageWithFallback from "./ImageWithFallback";
import { regionTagClass, senderInitials, timeAgo } from "./requestFormat";

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
export function FleetHealthRow({
  delayed,
  tripsChecked,
  activeDrivers,
  gpsReporting,
  gpsExpected,
  stopsCompleted,
  isLoading,
  onDelayedClick,
}: {
  delayed: number;
  tripsChecked: number;
  activeDrivers: number;
  gpsReporting: number;
  gpsExpected: number;
  stopsCompleted: number;
  isLoading: boolean;
  onDelayedClick?: () => void;
}) {
  const show = (value: number) => (isLoading ? "..." : value.toLocaleString());
  const gpsPercent =
    gpsExpected > 0 ? Math.round((gpsReporting / gpsExpected) * 100) : null;
  const hasDelays = !isLoading && delayed > 0;

  const tileBase = `${surface.card} flex min-w-0 flex-col gap-3 p-4 text-left`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* Delayed trips: the one number an operator must act on */}
      <button
        type="button"
        onClick={onDelayedClick}
        className={`${tileBase} transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30 ${
          hasDelays ? "ring-2 ring-amber-300/80" : ""
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={surface.eyebrow}>Delayed trips</span>
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              hasDelays ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {hasDelays ? (
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            )}
          </span>
        </span>
        <span className="text-[28px] font-bold leading-none tabular-nums text-[#0b2341]">
          {show(delayed)}
        </span>
        <span className="truncate text-[11px] text-slate-500">
          {isLoading
            ? "Checking trips"
            : hasDelays
              ? `Needs follow-up · of latest ${tripsChecked}`
              : `None in the latest ${tripsChecked} trips`}
        </span>
      </button>

      <div className={tileBase}>
        <span className="flex items-center justify-between gap-2">
          <span className={surface.eyebrow}>Active drivers</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e6f0f9] text-[#1d5f94]">
            <Users aria-hidden="true" className="h-4 w-4" />
          </span>
        </span>
        <span className="text-[28px] font-bold leading-none tabular-nums text-[#0b2341]">
          {show(activeDrivers)}
        </span>
        <span className="truncate text-[11px] text-slate-500">
          On in-progress trips
        </span>
      </div>

      <div className={tileBase}>
        <span className="flex items-center justify-between gap-2">
          <span className={surface.eyebrow}>GPS coverage</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <MapPin aria-hidden="true" className="h-4 w-4" />
          </span>
        </span>
        <span className="text-[28px] font-bold leading-none tabular-nums text-[#0b2341]">
          {isLoading ? "..." : gpsPercent === null ? "—" : `${gpsPercent}%`}
        </span>
        <span className="flex flex-col gap-1.5">
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-[#e3eaf2]">
            <span
              className="block h-full rounded-full bg-violet-500 transition-[width] duration-700 motion-reduce:transition-none"
              style={{ width: `${gpsPercent ?? 0}%` }}
            />
          </span>
          <span className="truncate text-[11px] text-slate-500">
            {gpsExpected > 0
              ? `${gpsReporting} of ${gpsExpected} active trips reporting`
              : "No active trips"}
          </span>
        </span>
      </div>

      <div className={tileBase}>
        <span className="flex items-center justify-between gap-2">
          <span className={surface.eyebrow}>Stops completed</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          </span>
        </span>
        <span className="text-[28px] font-bold leading-none tabular-nums text-[#0b2341]">
          {show(stopsCompleted)}
        </span>
        <span className="truncate text-[11px] text-slate-500">
          Store arrivals recorded
        </span>
      </div>
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
    <div
      className={`${surface.card} flex min-w-0 flex-col justify-between gap-3 p-4 ${
        onAction
          ? "transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(11,35,65,0.35)] motion-reduce:transition-none"
          : ""
      }`}
    >
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

const ATTENTION_CSS = `
@keyframes attn-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.attn-track { position: relative; z-index: 1; animation: attn-marquee 40s linear infinite; will-change: transform; }
.attn-ticker:hover .attn-track,
.attn-ticker:focus-within .attn-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .attn-track { animation: none; }
  .attn-track > [aria-hidden="true"] { display: none; }
  .attn-viewport { overflow-x: auto; }
}
`;

function attentionTone(status: DispatchRecord["status"]) {
  if (status === "Delayed")
    return { label: "Delayed", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700" };
  if (status === "In Progress")
    return { label: "In transit", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700" };
  return { label: "Check", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600" };
}

function AttentionItem({
  trip,
  onViewTrip,
  duplicate,
}: {
  trip: DispatchRecord;
  onViewTrip?: (id: string) => void;
  duplicate?: boolean;
}) {
  const tone = attentionTone(trip.status);
  return (
    <button
      type="button"
      tabIndex={duplicate ? -1 : 0}
      onClick={() => onViewTrip?.(trip.id)}
      className="flex shrink-0 items-center gap-3 rounded-2xl bg-[#f2f6fa] py-2.5 pl-3 pr-4 text-left transition-colors hover:bg-[#e6f0f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
    >
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.chip}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        {trip.statusText ?? tone.label}
      </span>
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[13px] font-semibold text-[#0b2341]">
          {trip.displayId ?? trip.id}
        </span>
        <span className="block whitespace-nowrap text-[11px] text-slate-500">
          {trip.origin} → {trip.destination}
        </span>
      </span>
      <span className="hidden border-l border-slate-200 pl-3 sm:block">
        <span className="block whitespace-nowrap text-[11px] font-medium text-slate-700">
          {trip.driver || "Unassigned"}
        </span>
        <span className="block whitespace-nowrap text-[11px] text-slate-400">
          ETA {trip.eta}
        </span>
      </span>
    </button>
  );
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
  /* Completed trips don't need attention; delayed and flagged ones come first. */
  const items = [
    ...rows.filter((trip) => trip.status === "Delayed"),
    ...rows.filter((trip) => trip.status === "Other"),
    ...rows.filter((trip) => trip.status === "In Progress"),
  ];
  const duration = Math.max(items.length * 10, 36);

  return (
    <section
      aria-label="Needs your attention"
      className={`attn-ticker relative flex flex-col overflow-hidden ${surface.card} sm:flex-row sm:items-center`}
    >
      <style>{ATTENTION_CSS}</style>

      <div className="flex shrink-0 items-center gap-3 px-5 py-3.5 sm:w-60 sm:border-r sm:border-slate-100">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold leading-tight text-[#0b2341]">Needs attention</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {items.length === 0 ? "All clear" : `${items.length} trip${items.length === 1 ? "" : "s"} flagged`}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="flex flex-1 items-center gap-2 px-5 py-4 text-sm text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          No trips need attention right now.
        </p>
      ) : (
        <div
          className="attn-viewport relative min-w-0 flex-1 overflow-hidden py-3"
          style={{
            containerType: "inline-size",
            maskImage: "linear-gradient(to right, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%)",
          }}
        >
          <div className="attn-track flex w-max" style={{ animationDuration: `${duration}s` }}>
            {[0, 1].map((copy) => (
              <div
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
                className="flex min-w-[100cqw] shrink-0 items-center gap-3 pl-6 pr-3"
              >
                {items.map((trip) => (
                  <AttentionItem
                    key={`${copy}-${trip.id}`}
                    trip={trip}
                    onViewTrip={onViewTrip}
                    duplicate={copy === 1}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {action ? <div className="relative z-10 flex items-center px-4 pb-3 sm:pb-0">{action}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Active fleet list (assignments style)                                */
/* ------------------------------------------------------------------ */
type FleetTab = "all" | "delayed" | "in-progress" | "completed" | "other";

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function FleetListCard({
  rows,
  selectedTripId,
  onSelectTrip,
  onViewTrip,
  className = "",
}: {
  rows: DispatchRecord[];
  selectedTripId?: string | null;
  onSelectTrip?: (id: string) => void;
  onViewTrip?: (id: string) => void;
  className?: string;
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
    <section className={`${surface.card} flex min-h-0 flex-col overflow-hidden p-5 ${className}`}>
      <h2 className={`${surface.heading} mb-3`}>Active fleet</h2>
      <div
        className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-[#f5f7fa] p-1"
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
        <ul className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(210px,1fr))] content-start gap-3 overflow-y-auto overscroll-contain p-1">
          {visible.map((trip) => {
            const progress = Math.min(Math.max(trip.progressPct ?? 0, 0), 100);
            const selected = trip.id === selectedTripId;
            const barColor =
              trip.status === "Delayed"
                ? "#f59e0b"
                : trip.status === "Completed"
                  ? "#10b981"
                  : "#4aa3e8";
            const displayId = trip.displayId ?? trip.id;
            return (
              <li
                key={trip.id}
                className={`flex flex-col rounded-2xl p-3 ring-2 transition duration-200 motion-reduce:transition-none ${
                  selected
                    ? "bg-[#0b2341] ring-transparent"
                    : "bg-[#f5f7fa] ring-transparent hover:ring-[#0b2341]/15"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectTrip?.(trip.id)}
                  aria-pressed={selected}
                  className="block w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] font-semibold ${selected ? "text-white" : "text-[#0b2341]"}`}>
                        {displayId}
                      </span>
                      <span className={`mt-0.5 block truncate text-[10px] ${selected ? "text-white/60" : "text-slate-400"}`}>
                        {trip.origin} → {trip.destination}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTag(trip.status)}`}>
                      {trip.statusText ?? trip.status}
                    </span>
                  </span>
                  <span className="mt-2 flex h-24 items-center justify-center">
                    <img
                      src={getFleetTruckCutout(trip.id)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="max-h-full max-w-full object-contain drop-shadow-[0_6px_6px_rgba(11,35,65,0.12)]"
                    />
                  </span>
                </button>

                <div className={`mt-2 rounded-xl p-2.5 transition-colors duration-200 motion-reduce:transition-none ${selected ? "bg-white/10" : "bg-white"}`}>
                  <p className={`text-[10px] font-medium ${selected ? "text-white/60" : "text-slate-400"}`}>Driver</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[10px] font-bold text-[#1d5f94]"
                    >
                      {initials(trip.driver)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[12px] font-semibold ${selected ? "text-white" : "text-[#0b2341]"}`}>
                        {trip.driver || "Unassigned"}
                      </span>
                      <span className={`block truncate text-[10px] ${selected ? "text-white/60" : "text-slate-400"}`}>
                        ETA {trip.eta}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onViewTrip?.(trip.id)}
                      aria-label={`View trip details for ${displayId}`}
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:!bg-[#ffd43b] hover:!text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b] ${selected ? "bg-white/15 text-white" : "bg-[#f2f6fa] text-slate-600"}`}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[10px]">
                    <span className={`font-medium ${selected ? "text-white/60" : "text-slate-400"}`}>Trip progress</span>
                    <span className={`font-semibold tabular-nums ${selected ? "text-white" : "text-slate-700"}`}>{progress}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Trip progress for ${displayId}`}
                    className={`mt-1 h-2 w-full overflow-hidden rounded-full ${
                      selected
                        ? "bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.22)_0_3px,rgba(255,255,255,0.06)_3px_6px)]"
                        : "bg-[repeating-linear-gradient(135deg,#e3eaf2_0_3px,#f2f6fa_3px_6px)]"
                    }`}
                  >
                    <span
                      className="block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
                      style={{ width: `${progress}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const TRUCK_CARD_PHOTOS = [
  "https://images.unsplash.com/photo-1711942179703-fce59b6afac6?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1733662095268-7a88cb5fa10e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1605705658744-45f0fe8f9663?auto=format&fit=crop&w=900&q=80",
];

function reportText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

export function StackedTripCard({
  rows,
  bookingRows,
  className = "",
}: {
  rows: DispatchRecord[];
  bookingRows: ReportRow[];
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const cards = rows.slice(0, 5).map((trip, index) => {
    const matchingRows = bookingRows.filter(
      (row) =>
        reportText(row.dispatch_number) ===
        (trip.displayId ?? trip.id),
    );
    const cbmValues = matchingRows
      .map((row) => reportText(row.cbm).replaceAll(",", ""))
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
    const cbm = cbmValues.length
      ? cbmValues.reduce((total, value) => total + value, 0)
      : null;
    const plate = matchingRows
      .map((row) => reportText(row.plate_number))
      .find(Boolean);

    return {
      trip,
      index,
      cbm,
      plate,
      image: TRUCK_CARD_PHOTOS[index % TRUCK_CARD_PHOTOS.length],
    };
  });

  if (!cards.length) {
    return (
      <section className={`${surface.card} flex min-h-64 flex-1 items-center justify-center p-5 text-center text-sm text-slate-400 ${className}`}>
        Truck and trip details will appear when trips are available.
      </section>
    );
  }

  const activeCard = activeIndex % cards.length;

  return (
    <section aria-label="Truck and driver cards" className={`flex flex-none flex-col ${className}`}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className={surface.heading}>Truck &amp; driver</h2>
        <span className="text-[11px] text-slate-400">
          {activeCard + 1} / {cards.length} · Click to cycle
        </span>
      </div>
      <div className="relative h-[270px] flex-none">
        {cards.map(({ trip, index, cbm, plate, image }) => {
          const depth = (index - activeCard + cards.length) % cards.length;

          return (
            <button
              key={trip.id}
              type="button"
              aria-label={`Trip ${trip.displayId ?? trip.id}, driver ${trip.driver}, ${trip.status}. Show next truck`}
              aria-hidden={depth !== 0}
              tabIndex={depth === 0 ? 0 : -1}
              onClick={() => setActiveIndex((current) => (current + 1) % cards.length)}
              className={`absolute inset-x-0 top-0 h-[246px] overflow-hidden rounded-3xl border border-white/15 bg-[#0b2341] text-left text-white shadow-[0_18px_35px_-18px_rgba(11,35,65,0.65)] transition-[transform,opacity,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b] motion-reduce:transition-none ${
                depth === 0 ? "cursor-pointer" : "pointer-events-none"
              }`}
              style={{
                zIndex: Math.max(1, 3 - depth),
                transform: `translateY(${Math.min(depth, 3) * 11}px) scale(${Math.max(0.86, 1 - depth * 0.045)})`,
                opacity: Math.max(0, 1 - depth * 0.25),
              }}
            >
              <ImageWithFallback
                src={image}
                fallbackSrc={getFleetTruckPhoto(undefined, index)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
                loading="lazy"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#0b2341] via-[#0b2341]/90 to-[#0b2341]/10" />
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0b2341]/90 to-transparent" />
              <span className="relative flex h-full flex-col justify-between p-4 sm:p-5">
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
                      Assigned truck
                    </span>
                    <span className="mt-1 block max-w-[75%] truncate text-lg font-bold tracking-tight">
                      {trip.displayId ?? trip.id}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTag(trip.status)}`}>
                    {trip.statusText ?? trip.status}
                  </span>
                </span>

                <span className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/20 pt-3">
                  <span className="min-w-0">
                    <span className="block text-[10px] text-white/60">Driver</span>
                    <span className="mt-0.5 block truncate text-[13px] font-semibold">
                      {trip.driver || "Not assigned"}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] text-white/60">Truck / plate</span>
                    <span className="mt-0.5 block truncate text-[13px] font-semibold">
                      {plate || "Not recorded"}
                    </span>
                  </span>
                  <span>
                    <span className="block text-[10px] text-white/60">Cargo volume</span>
                    <span className="mt-0.5 block text-[13px] font-semibold">
                      {cbm === null ? "—" : `${cbm.toLocaleString(undefined, { maximumFractionDigits: 2 })} CBM`}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] text-white/60">Route</span>
                    <span className="mt-0.5 block truncate pr-8 text-[12px] font-medium">
                      {trip.origin || trip.hub || "Origin not set"} → {trip.destination || "Destination not set"}
                    </span>
                  </span>
                </span>
              </span>
              {cards.length > 1 && depth === 0 && (
                <span aria-hidden="true" className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#ffd43b] text-[#0b2341] shadow">
                  <ArrowUpRight className="h-4 w-4 rotate-45" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Requests to approve: stack of blue cards, swipe to browse            */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Email requests to approve (detail card)                              */
/* ------------------------------------------------------------------ */
export function PendingRequestsCard({
  requests,
  onReview,
  onViewAll,
  className = "",
}: {
  /** Only the requests that still need a decision. */
  requests: DispatchRequest[];
  onReview?: (id: string) => void;
  onViewAll?: () => void;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const cards = requests
    .slice()
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, 8);

  if (cards.length === 0) {
    return (
      <section
        aria-label="Requests to approve"
        className={`${surface.card} flex min-h-[200px] min-w-0 flex-col items-center justify-center gap-2 p-5 text-center ${className}`}
      >
        <CheckCircle2 aria-hidden="true" className="h-6 w-6 text-emerald-500" />
        <h2 className={surface.heading}>All caught up</h2>
        <p className="text-xs text-slate-400">New client requests will show up here for approval.</p>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className={`${surface.chipGhost} mt-1`}>
            Open requests
          </button>
        )}
      </section>
    );
  }

  const total = cards.length;
  const active = activeIndex % total;
  const go = (step: number) => setActiveIndex((current) => (current + step + total) % total);
  const request = cards[active];
  const qty = request.items.reduce((sum, item) => sum + item.qty, 0);
  const lines = request.items.length;
  const stats = [
    { label: "Lines", value: String(lines) },
    { label: "Pieces", value: String(qty) },
    { label: "Amount", value: request.amount || "—" },
  ];
  const pagerBtn =
    "inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f7fa] text-slate-500 transition hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 disabled:opacity-30";

  return (
    <section
      aria-label="Requests to approve"
      className={`${surface.card} flex min-h-0 min-w-0 flex-col p-5 ${className}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(1);
        if (event.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={surface.heading}>Email requests</h2>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {total} to approve · {timeAgo(request.receivedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1" aria-live="polite">
          <button type="button" onClick={() => go(-1)} disabled={total < 2} aria-label="Previous request" className={pagerBtn}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <span className="min-w-[2.25rem] text-center text-[11px] tabular-nums text-slate-400">
            {active + 1} / {total}
          </span>
          <button type="button" onClick={() => go(1)} disabled={total < 2} aria-label="Next request" className={pagerBtn}>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <p className="min-w-0 truncate text-[22px] font-semibold tracking-tight text-[#0b2341]">{request.reference}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${regionTagClass(request.region)}`}>
          {request.region}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-slate-400">{request.warehouse || request.courier || "Warehouse not set"}</p>

      <dl className="mt-2 grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-2xl bg-[#f5f7fa] px-2 py-2.5 text-center">
            <dd className="truncate text-[13px] font-semibold text-[#0b2341]">{stat.value}</dd>
            <dt className="mt-0.5 text-[10px] text-slate-400">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4">
        <p className="mb-2 text-[13px] font-semibold text-[#0b2341]">Sender</p>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[12px] font-bold text-[#0b2341]"
          >
            {senderInitials(request.fromEmail)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[#0b2341]">{request.fromName || request.fromEmail}</p>
            <p className="truncate text-[11px] text-slate-400">{request.fromEmail}</p>
          </div>
          <button
            type="button"
            onClick={() => onReview?.(request.id)}
            aria-label={`Review request ${request.reference} from ${request.fromEmail}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-white transition hover:bg-[#17365f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 focus-visible:ring-offset-2"
          >
            <ArrowUpRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 transition hover:text-[#0b2341] focus:outline-none focus-visible:underline"
          >
            View all requests
            <ChevronRight aria-hidden="true" className="h-3 w-3" />
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Trip status ring (segmented dial)                                    */
/* ------------------------------------------------------------------ */
export function TripStatusRing({
  segments,
  total,
  title = "Trip status",
  hint = "Share of all recorded trips",
  className = "",
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  title?: string;
  hint?: string;
  className?: string;
}) {
  const TICKS = 60;
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
  const raw = segments.map((segment) => (sum > 0 ? (segment.value / sum) * TICKS : 0));
  const counts = raw.map(Math.floor);
  let left = sum > 0 ? TICKS - counts.reduce((a, b) => a + b, 0) : 0;
  raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => {
      if (left > 0 && segments[index].value > 0) {
        counts[index] += 1;
        left -= 1;
      }
    });
  const colors: string[] = [];
  segments.forEach((segment, index) => {
    for (let n = 0; n < counts[index]; n += 1) colors.push(segment.color);
  });
  while (colors.length < TICKS) colors.push("#e8edf3");

  return (
    <section className={`${surface.card} flex min-h-0 min-w-0 flex-col p-5 ${className}`}>
      <h2 className={surface.heading}>{title}</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>

      <div className="relative mx-auto my-3 min-h-0 w-full max-w-[210px] flex-1">
        <svg
          viewBox="0 0 220 220"
          className="h-full w-full"
          role="img"
          aria-label={`Trip status: ${segments.map((segment) => `${segment.value} ${segment.label.toLowerCase()}`).join(", ")}`}
        >
          {colors.map((color, index) => (
            <rect
              key={index}
              x={107}
              y={8}
              width={6}
              height={20}
              rx={3}
              fill={color}
              transform={`rotate(${(index * 360) / TICKS} 110 110)`}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[44px] font-semibold leading-none tracking-tight tabular-nums text-[#0b2341]">
            {total.toLocaleString()}
          </span>
          <span className="mt-1 text-[11px] text-slate-400">trips</span>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        {segments.map((segment) => (
          <li key={segment.label} className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="min-w-0 flex-1 truncate">{segment.label}</span>
            <span className="font-semibold tabular-nums text-[#0b2341]">{segment.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity (notifications style)                                */
/* ------------------------------------------------------------------ */
export function ActivityFeedCard({
  events,
  title = "Recent activity",
  className = "",
}: {
  events: { id: string; time: string; message: string; tone: string }[];
  title?: string;
  className?: string;
}) {
  return (
    <section className={`${surface.card} flex min-h-0 min-w-0 flex-col p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={surface.heading}>{title}</h2>
        <span className="text-[11px] text-slate-400">{events.length} events</span>
      </div>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No recent activity.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {events.map((event, index) => (
            <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < events.length - 1 && (
                <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-4 w-px bg-slate-200" />
              )}
              <span
                aria-hidden="true"
                className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full bg-white ${
                  index === 0 ? "border-[3px] border-[#0b2341]" : "border-2 border-slate-300"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`break-words text-[12px] capitalize leading-snug ${
                    index === 0 ? "font-semibold text-[#0b2341]" : "font-medium text-slate-600"
                  }`}
                >
                  {event.message}
                </p>
                <time className="mt-0.5 block text-[10px] tabular-nums text-slate-400">{event.time}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
