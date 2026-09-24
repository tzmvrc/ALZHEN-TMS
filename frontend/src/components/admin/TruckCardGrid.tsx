// src/components/admin/TruckCardGrid.tsx
import { Search, SlidersHorizontal, LayoutGrid } from "lucide-react";
import type { DispatchRecord } from "../../types/dashboard";

/* Map status → pill classes + dot */
const statusStyles: Record<
  string,
  { pill: string; dot: string; label: string }
> = {
  "In Progress": {
    pill: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    label: "Loading",
  },
  Completed: {
    pill: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  Delayed: {
    pill: "bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    label: "Delayed",
  },
  Ready: {
    pill: "bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    label: "Ready",
  },
  "Not Started": {
    pill: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
    label: "Not started",
  },
};

/* Pick a status bucket + derive UI values from the record */
function getCardMeta(trip: DispatchRecord, index: number) {
  // Cycle through buckets so the demo has variety.
  // In production, derive these from the record itself.
  const buckets = ["In Progress", "Not Started", "Completed", "Ready"] as const;
  const fallbackBucket = buckets[index % buckets.length];

  const bucket =
    trip.status === "Delayed"
      ? "Delayed"
      : trip.status === "Completed"
        ? "Completed"
        : trip.progressPct === 100
          ? "Completed"
          : trip.progressPct !== undefined && trip.progressPct < 10
            ? "Not Started"
            : trip.progressPct !== undefined && trip.progressPct > 80
              ? "Ready"
              : fallbackBucket;

  const progress =
    trip.progressPct ??
    [48, 0, 89, 100, 12, 65, 0, 45, 70][index % 9];

  const weightKg = [6500, 0, 8870, 10000, 850, 7400][index % 6];
  const loadPct = [48, 0, 92, 100, 12, 70][index % 6];

  const docks = ["Dock #3", "Dock #1", "Dock #7", "Dock #5", "Dock #2", "Dock #8"];
  const dock = docks[index % docks.length];

  const plates = ["TRC-204", "TRC-118", "TRC-551", "TRC-392", "TRC-405", "TRC-622"];
  const code = plates[index % plates.length];

  const [origin = "NY", destination = "NJ"] = (trip.origin && trip.destination)
    ? [abbr(trip.origin), abbr(trip.destination)]
    : (trip.route ?? "NY → NJ").split("→").map((s) => s.trim());

  return {
    bucket,
    progress,
    weightKg,
    loadPct,
    dock,
    code,
    origin,
    destination,
    driver: trip.driver,
  };
}

function abbr(name: string) {
  // Turn "Cagayan de Oro" → "CDO", "New York" → "NY", etc.
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/* ---------- Truck illustration (inline SVG) ---------- */
function TruckIllustration({ variant = 0 }: { variant?: number }) {
  const v = variant % 3;
  return (
    <svg
      viewBox="0 0 320 140"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`truck-body-${v}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eef2f7" />
        </linearGradient>
        <linearGradient id={`truck-cab-${v}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="160" cy="126" rx="130" ry="6" fill="#e2e8f0" />

      {/* Cargo container */}
      {v === 0 && (
        <rect
          x="30"
          y="34"
          width="180"
          height="80"
          rx="4"
          fill={`url(#truck-body-${v})`}
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
      )}
      {v === 1 && (
        <>
          <rect
            x="20"
            y="30"
            width="200"
            height="84"
            rx="3"
            fill={`url(#truck-body-${v})`}
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          {/* corrugation */}
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={i}
              x1={28 + i * 14}
              y1="34"
              x2={28 + i * 14}
              y2="110"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}
        </>
      )}
      {v === 2 && (
        <>
          <rect
            x="20"
            y="38"
            width="200"
            height="74"
            rx="3"
            fill={`url(#truck-body-${v})`}
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          <line x1="20" y1="75" x2="220" y2="75" stroke="#e2e8f0" strokeWidth="1" />
        </>
      )}

      {/* Cab */}
      <path
        d="M210 60 L250 60 Q262 60 268 72 L278 92 L278 114 L210 114 Z"
        fill={`url(#truck-cab-${v})`}
        stroke="#cbd5e1"
        strokeWidth="1.5"
      />
      {/* Windshield */}
      <path d="M214 66 L246 66 L258 88 L214 88 Z" fill="#94a3b8" opacity="0.5" />
      {/* Headlight */}
      <rect x="272" y="102" width="6" height="6" rx="1.5" fill="#facc15" />
      {/* Bumper */}
      <rect x="272" y="112" width="10" height="6" rx="1.5" fill="#94a3b8" />

      {/* Wheels */}
      <g>
        <circle cx="70" cy="118" r="12" fill="#1e293b" />
        <circle cx="70" cy="118" r="5" fill="#94a3b8" />
        <circle cx="120" cy="118" r="12" fill="#1e293b" />
        <circle cx="120" cy="118" r="5" fill="#94a3b8" />
        <circle cx="240" cy="118" r="12" fill="#1e293b" />
        <circle cx="240" cy="118" r="5" fill="#94a3b8" />
      </g>
    </svg>
  );
}

/* ---------- TruckCard ---------- */
function TruckCard({
  trip,
  index,
}: {
  trip: DispatchRecord;
  index: number;
}) {
  const m = getCardMeta(trip, index);
  const styles = statusStyles[m.bucket] ?? statusStyles["Not Started"];

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      {/* Top section */}
      <div className="p-4">
        {/* Status pill */}
        <div className="mb-3 flex items-center">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${styles.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
            {styles.label}
          </span>
        </div>

        {/* Truck illustration */}
        <div className="relative mb-4 h-[110px] w-full">
          <TruckIllustration variant={index} />
        </div>

        {/* Trip ID + weight */}
        <div className="mb-4">
          <p className="text-base font-bold text-slate-900">{m.code}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {m.weightKg.toLocaleString()} kg · ({m.loadPct}%)
          </p>
        </div>

        {/* Route + driver + dock */}
        <div className="mb-3 flex items-center justify-between text-[11px]">
          <span className="font-semibold tracking-wide text-slate-700">
            {m.origin} → {m.destination}
          </span>
          <span className="text-slate-500">
            {m.driver} · {m.dock}
          </span>
        </div>
      </div>

      {/* Progress section */}
      <div className="border-t border-slate-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Load progress</span>
          <span className="font-semibold text-slate-900">{m.progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${m.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Main grid ---------- */
export default function TruckCardGrid({
  rows = [],
}: {
  rows?: DispatchRecord[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header row with search + filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Warehouse
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">
            Trucks currently in warehouse
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search for truck ID"
              className="w-56 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-slate-900"
            />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((trip, index) => (
          <TruckCard key={trip.id} trip={trip} index={index} />
        ))}
      </div>
    </div>
  );
}