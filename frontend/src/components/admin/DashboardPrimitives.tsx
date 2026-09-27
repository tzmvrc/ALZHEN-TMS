// src/components/admin/DashboardPrimitives.tsx
import { useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Calendar,
  HelpCircle,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import type {
  DispatchRecord,
  IncidentRecord,
  RegionalSummary,
  SalesPoint,
  SnapshotRecord,
} from "../../types/dashboard";
import { toneClasses, toneHex } from "./dashboardStyles";

/* ================================================================ */
/* TopBar                                                            */
/* ================================================================ */
export function TopBar({
  activeLabel,
  dateLabel = "Sep 1 – Sep 30, 2026",
  onNotifications,
  onSettings,
  onHelp,
  onProfile,
  profileImageUrl,
  userName = "Operations Admin",
  userInitial = "A",
  notificationCount = 0,
}: {
  activeLabel: string;
  dateLabel?: string;
  onNotifications?: () => void;
  onSettings?: () => void;
  onHelp?: () => void;
  onProfile?: () => void;
  profileImageUrl?: string;
  userName?: string;
  userInitial?: string;
  notificationCount?: number;
}) {
  return (
    <header className="sticky top-4 z-20 mx-4 mb-5 rounded-2xl border border-white/80 bg-white/90 px-4 py-2 shadow-[0_14px_35px_rgba(42,76,120,0.1)] backdrop-blur-xl sm:px-6 lg:mx-6">
      <div className="flex h-12 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-[13px] font-semibold text-slate-900">
            {activeLabel}
          </h1>
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 sm:flex"
          >
            <Calendar className="h-3 w-3 text-slate-400" />
            {dateLabel}
          </button>
        </div>

        <div className="flex items-center">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Notifications"
              onClick={onNotifications}
              className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <Bell className="h-4 w-4" />
              {notificationCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                  {notificationCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label="Settings"
              onClick={onSettings}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Help"
              onClick={onHelp}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          <div className="ml-3 border-l border-slate-200 pl-3">
            <button
              type="button"
              aria-label="Profile"
              onClick={onProfile}
              title={userName}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-[11px] font-bold text-white ring-2 ring-white transition hover:ring-slate-200"
            >
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={userName}
                  className="h-full w-full object-cover"
                />
              ) : (
                userInitial
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ================================================================ */
/* Shared helpers                                                    */
/* ================================================================ */
function CardShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PageIntro({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-0.5 text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    Completed: "bg-blue-50 text-blue-700",
    "In Progress": "bg-emerald-50 text-emerald-700",
    Delayed: "bg-amber-50 text-amber-700",
    High: "bg-red-50 text-red-700",
    Medium: "bg-amber-50 text-amber-700",
    Low: "bg-slate-100 text-slate-600",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}

/* ================================================================ */
/* KPI Card                                                          */
/* ================================================================ */
export function KpiCard({
  label,
  value,
  change,
  tone = "blue",
  icon,
  trend = "up",
}: {
  label: string;
  value: string;
  change: string;
  tone?: keyof typeof toneClasses;
  icon?: ReactNode;
  trend?: "up" | "down";
}) {
  const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight;
  const positive = trend === "up";
  return (
    <CardShell>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        {icon ? (
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClasses[tone]}`}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs font-medium">
        <TrendIcon
          className={`h-3.5 w-3.5 ${positive ? "text-emerald-600" : "text-red-600"}`}
        />
        <span className={positive ? "text-emerald-600" : "text-red-600"}>
          {change}
        </span>
        <span className="text-slate-400">vs last period</span>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* RevenueChart (bar-style) — used by Reports later                  */
/* ================================================================ */
export function RevenueChart({ data = [] }: { data?: SalesPoint[] }) {
  const points = data.length
    ? data
    : [
        { label: "W1", primary: 40, secondary: 30, bar: 50 },
        { label: "W2", primary: 55, secondary: 42, bar: 65 },
        { label: "W3", primary: 48, secondary: 38, bar: 58 },
        { label: "W4", primary: 70, secondary: 52, bar: 80 },
        { label: "W5", primary: 62, secondary: 46, bar: 72 },
        { label: "W6", primary: 78, secondary: 58, bar: 88 },
      ];

  return (
    <CardShell>
      <SectionHeader eyebrow="Revenue" title="Trip revenue trend" />
      <div className="flex h-56 items-end justify-between gap-3">
        {points.map((point) => (
          <div
            key={point.label}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <div className="flex h-44 w-full items-end justify-center gap-1">
              <div
                className="w-2 rounded-t bg-blue-200"
                style={{ height: `${point.bar ?? point.primary}%` }}
              />
              <div
                className="w-2 rounded-t bg-blue-600"
                style={{ height: `${point.primary}%` }}
              />
              <div
                className="w-2 rounded-t bg-slate-300"
                style={{ height: `${point.secondary}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-slate-400">
              {point.label}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* DeliveryPerformanceChart — kept for Reports page later            */
/* ================================================================ */
export function DeliveryPerformanceChart({
  data = [],
}: {
  data?: SalesPoint[];
}) {
  const points = data.length
    ? data
    : [
        { label: "06:00", primary: 40, secondary: 22 },
        { label: "08:00", primary: 90, secondary: 35 },
        { label: "10:00", primary: 180, secondary: 52 },
        { label: "12:00", primary: 240, secondary: 60 },
        { label: "14:00", primary: 340, secondary: 55 },
        { label: "16:00", primary: 430, secondary: 62 },
        { label: "18:00", primary: 560, secondary: 68 },
      ];

  const W = 720;
  const H = 260;
  const PAD_X = 40;
  const PAD_Y = 24;
  const maxVal = Math.max(...points.map((p) => p.primary)) * 1.15 || 1;

  const toXY = (i: number, v: number): [number, number] => {
    const x = PAD_X + (i / Math.max(points.length - 1, 1)) * (W - PAD_X * 2);
    const y = H - PAD_Y - (v / maxVal) * (H - PAD_Y * 2);
    return [x, y];
  };

  const buildPath = (key: "primary" | "secondary") =>
    points
      .map((p, i) => {
        const [x, y] = toXY(i, p[key]);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

  const primaryPath = buildPath("primary");
  const secondaryPath = buildPath("secondary");
  const areaPath = `${primaryPath} L ${toXY(points.length - 1, 0)[0]} ${
    H - PAD_Y
  } L ${toXY(0, 0)[0]} ${H - PAD_Y} Z`;

  const yTicks = [0, 100, 200, 300, 400, 500, 600];

  return (
    <CardShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Performance
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">
            Delivery performance
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Delivered
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Delayed
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full min-w-[520px]">
          <defs>
            <linearGradient id="dpArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((t) => {
            const y = H - PAD_Y - (t / maxVal) * (H - PAD_Y * 2);
            return (
              <g key={t}>
                <line
                  x1={PAD_X}
                  x2={W - PAD_X}
                  y1={y}
                  y2={y}
                  stroke="#eef2f7"
                  strokeWidth="1"
                />
                <text
                  x={PAD_X - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {t}
                </text>
              </g>
            );
          })}

          {points.map((p, i) => {
            const [x] = toXY(i, 0);
            return (
              <text
                key={p.label + i}
                x={x}
                y={H - 4}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {p.label}
              </text>
            );
          })}

          <path d={areaPath} fill="url(#dpArea)" />
          <path
            d={primaryPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={secondaryPath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {points.map((p, i) => {
            const [x, y] = toXY(i, p.primary);
            return (
              <circle
                key={`p-${i}`}
                cx={x}
                cy={y}
                r="3.5"
                fill="#fff"
                stroke="#10b981"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* StatusOverviewPanel                                               */
/* ================================================================ */
export function StatusOverviewPanel({ rows = [] }: { rows?: DispatchRecord[] }) {
  const counts = {
    Completed: rows.filter((r) => r.status === "Completed").length,
    "In Progress": rows.filter((r) => r.status === "In Progress").length,
    Delayed: rows.filter((r) => r.status === "Delayed").length,
    Other: rows.filter((r) => r.status === "Other").length,
  };
  const total = rows.length || 1;

  const colorFor = (s: string) =>
    s === "Completed"
      ? "bg-blue-500"
      : s === "In Progress"
        ? "bg-emerald-500"
        : s === "Delayed"
          ? "bg-amber-500"
          : "bg-slate-400";

  return (
    <CardShell>
      <SectionHeader eyebrow="Status" title="Trip status overview" />
      <div className="space-y-3">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{status}</span>
              <span className="font-semibold text-slate-900">{count}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${colorFor(status)}`}
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ActivityPanel                                                     */
/* ================================================================ */
export function ActivityPanel({ rows = [] }: { rows?: DispatchRecord[] }) {
  return (
    <CardShell>
      <SectionHeader eyebrow="Activity" title="Recent trips" />
      <ul className="space-y-3">
        {rows.slice(0, 4).map((row) => (
          <li key={row.id} className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">
                {row.id} · {row.route}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {row.hub} · {row.eta}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                row.status,
              )}`}
            >
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ================================================================ */
/* FleetBoardPanel (clickable cards → focus map marker)              */
/* ================================================================ */
function FleetTripCard({
  trip,
  onSelect,
  onViewTrip,
  selected,
}: {
  trip: DispatchRecord;
  onSelect?: (id: string) => void;
  onViewTrip?: (id: string) => void;
  selected?: boolean;
}) {
  const progress = trip.progressPct ?? 0;
  const dotColor =
    trip.status === "Completed"
      ? "bg-blue-500"
      : trip.status === "Delayed"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className={`rounded-xl border bg-white transition ${
        selected
          ? "border-blue-400 ring-2 ring-blue-200"
          : "border-slate-100 hover:border-slate-200 hover:shadow-sm"
      }`}>
      <button
        type="button"
        onClick={() => onSelect?.(trip.id)}
        className="w-full cursor-pointer p-4 text-left"
      >
        <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-800">
          {trip.displayId ?? trip.id} · ETA {trip.eta}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
            trip.status,
          )}`}
        >
            {trip.statusText ?? trip.status}
        </span>
        </div>

        <div className="mt-4 flex items-center gap-3 text-[11px] text-slate-500">
        <div className="flex flex-col items-center">
          <span className="text-base leading-none">🚚</span>
          <span className="mt-1 max-w-[70px] truncate">
            {trip.origin ?? "Origin"}
          </span>
        </div>

        <div className="relative flex-1">
          <div className="h-[3px] w-full rounded-full bg-slate-100" />
          <div
            className="absolute left-0 top-0 h-[3px] rounded-full bg-slate-900"
            style={{ width: `${progress}%` }}
          />
          <span
            className={`absolute -top-[5px] h-3 w-3 rounded-full border-2 border-white shadow ${dotColor}`}
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>

        <div className="flex flex-col items-center">
          <span className="text-base leading-none">📍</span>
          <span className="mt-1 max-w-[70px] truncate">
            {trip.destination ?? "Destination"}
          </span>
        </div>
        </div>
      </button>
      <div className="flex justify-end border-t border-slate-100 px-3 py-1.5">
        <button
          type="button"
          onClick={() => onViewTrip?.(trip.id)}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-50"
        >
          Trip details
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function FleetBoardPanel({
  rows = [],
  onSelectTrip,
  onViewTrip,
  selectedTripId,
  className = "",
}: {
  rows?: DispatchRecord[];
  onSelectTrip?: (id: string) => void;
  onViewTrip?: (id: string) => void;
  selectedTripId?: string | null;
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState<
    "all" | "in-progress" | "completed" | "delayed"
    | "other">("all");
  const tabs = [
    { id: "all" as const, label: "All", count: rows.length },
    {
      id: "delayed" as const,
      label: "Delayed",
      count: rows.filter((trip) => trip.status === "Delayed").length,
    },
    {
      id: "in-progress" as const,
      label: "In progress",
      count: rows.filter((trip) => trip.status === "In Progress").length,
    },
    {
      id: "completed" as const,
      label: "Completed",
      count: rows.filter((trip) => trip.status === "Completed").length,
    },
    {
      id: "other" as const,
      label: "Other",
      count: rows.filter((trip) => trip.status === "Other").length,
    },
  ];
  const statusPriority: Record<DispatchRecord["status"], number> = {
    "In Progress": 0,
    Delayed: 1,
    Completed: 2,
    Other: 3,
  };
  const filteredRows = rows
    .filter(
      (trip) =>
        activeTab === "all" ||
        trip.status.toLowerCase().replace(" ", "-") === activeTab,
    )
    .sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);

  return (
    <CardShell className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Fleet
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">
            Active fleet
          </h2>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-100 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${
              activeTab === tab.id
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {tab.label} <span className="ml-0.5 opacity-70">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        <div className="grid gap-3 xl:grid-cols-1">
        {filteredRows.slice(0, 6).map((trip) => (
          <FleetTripCard
            key={trip.id}
            trip={trip}
            onSelect={onSelectTrip}
            onViewTrip={onViewTrip}
            selected={trip.id === selectedTripId}
          />
        ))}
        </div>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* RegionalPanel                                                     */
/* ================================================================ */
export function RegionalPanel({ data = [] }: { data?: RegionalSummary[] }) {
  return (
    <CardShell>
      <SectionHeader eyebrow="Regions" title="Regional summary" />
      <ul className="space-y-3">
        {data.map((item) => (
          <li key={item.region}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{item.region}</span>
              <span className="font-semibold text-slate-900">{item.value}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${item.share}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ================================================================ */
/* IssuePanel                                                        */
/* ================================================================ */
export function IssuePanel({
  data = [],
}: {
  data?: { label: string; value: string }[];
}) {
  return (
    <CardShell>
      <SectionHeader eyebrow="Issues" title="Issue clusters" />
      <ul className="space-y-2">
        {data.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
          >
            <span className="text-xs font-medium text-slate-600">
              {item.label}
            </span>
            <span className="text-xs font-bold text-slate-900">
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ================================================================ */
/* SnapshotPanel                                                     */
/* ================================================================ */
export function SnapshotPanel({ data = [] }: { data?: SnapshotRecord[] }) {
  return (
    <CardShell>
      <SectionHeader eyebrow="Snapshots" title="Daily snapshots" />
      <ul className="space-y-3">
        {data.map((item) => (
          <li key={item.label} className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{item.label}</span>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900">{item.value}</p>
              <p className="text-[10px] font-medium text-emerald-600">
                {item.change}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ================================================================ */
/* IncidentPanel                                                     */
/* ================================================================ */
export function IncidentPanel({
  rows = [],
  title = "Incidents",
}: {
  rows?: IncidentRecord[];
  title?: string;
}) {
  return (
    <CardShell>
      <SectionHeader eyebrow="Exceptions" title={title} action="View all" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4 font-medium">ID</th>
              <th className="pb-3 pr-4 font-medium">Issue</th>
              <th className="pb-3 pr-4 font-medium">Location</th>
              <th className="pb-3 pr-4 font-medium">Severity</th>
              <th className="pb-3 pr-4 font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 last:border-none hover:bg-slate-50/50"
              >
                <td className="py-3 pr-4 font-medium text-slate-800">
                  {row.id}
                </td>
                <td className="py-3 pr-4 text-slate-600">{row.title}</td>
                <td className="py-3 pr-4 text-slate-600">{row.location}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                      row.severity,
                    )}`}
                  >
                    {row.severity}
                  </span>
                </td>
                <td className="py-3 pr-4 text-slate-500">{row.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* DispatchTable                                                     */
/* ================================================================ */
export function DispatchTable({
  rows = [],
  title = "Trips",
}: {
  rows?: DispatchRecord[];
  title?: string;
}) {
  return (
    <CardShell>
      <SectionHeader eyebrow="Trips" title={title} action="Export" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4 font-medium">Trip ID</th>
              <th className="pb-3 pr-4 font-medium">Route</th>
              <th className="pb-3 pr-4 font-medium">Type</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">ETA</th>
              <th className="pb-3 pr-4 font-medium">Hub</th>
              <th className="pb-3 pr-4 font-medium">Driver</th>
              <th className="pb-3 pr-4 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 last:border-none hover:bg-slate-50/50"
              >
                <td className="py-3 pr-4 font-medium text-slate-800">
                  {row.id}
                </td>
                <td className="py-3 pr-4 text-slate-600">{row.route}</td>
                <td className="py-3 pr-4 text-slate-600">{row.tripType}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                      row.status,
                    )}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-slate-600">{row.eta}</td>
                <td className="py-3 pr-4 text-slate-600">{row.hub}</td>
                <td className="py-3 pr-4 text-slate-600">{row.driver}</td>
                <td className="py-3 pr-4 font-medium text-slate-800">
                  {row.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* TruckGridView                                                     */
/* ================================================================ */
export function TruckGridView({ rows = [] }: { rows?: DispatchRecord[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => (
        <CardShell key={row.id} className="flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-800">{row.id}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{row.route}</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 space-y-1.5 text-[11px] text-slate-500">
            <p>Driver: {row.driver}</p>
            <p>Hub: {row.hub}</p>
            <p>ETA: {row.eta}</p>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                row.status,
              )}`}
            >
              {row.status}
            </span>
            <span className="text-xs font-semibold text-slate-800">
              {row.amount}
            </span>
          </div>
        </CardShell>
      ))}
    </div>
  );
}

/* ================================================================ */
/* LoadingStatusPanel                                                */
/* ================================================================ */
function SparkRow({ bars, color }: { bars: number[]; color: string }) {
  return (
    <div className="flex h-10 items-end gap-1">
      {bars.map((bar, index) => (
        <div
          key={index}
          className="spark-bar w-2 rounded-t"
          style={{ height: `${bar}%`, backgroundColor: color, opacity: 0.85 }}
        />
      ))}
    </div>
  );
}

export function LoadingStatusPanel({
  stats,
}: {
  stats?: {
    trucksLoading: number;
    avgLoadPct: number;
    totalVolume: string;
    totalWeight: string;
    volumeBars: number[];
    weightBars: number[];
  };
}) {
  const s = stats ?? {
    trucksLoading: 8,
    avgLoadPct: 72,
    totalVolume: "18.2 m³",
    totalWeight: "4.1 tons",
    volumeBars: [42, 55, 38, 62, 48, 71, 58, 66],
    weightBars: [30, 48, 42, 55, 60, 52, 68, 62],
  };

  return (
    <CardShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Loading
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">
            Current loading status
          </h2>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <p className="text-2xl font-bold text-slate-900">
            {String(s.trucksLoading).padStart(2, "0")}
          </p>
          <p className="text-[11px] text-slate-500">Trucks being loaded</p>
          <div className="mt-3">
            <SparkRow bars={s.volumeBars} color="#10b981" />
          </div>
        </div>

        <div>
          <p className="text-2xl font-bold text-slate-900">{s.avgLoadPct}%</p>
          <p className="text-[11px] text-slate-500">Average load</p>
          <div className="mt-3">
            <SparkRow bars={s.volumeBars} color="#3b82f6" />
          </div>
        </div>

        <div>
          <p className="text-2xl font-bold text-slate-900">{s.totalVolume}</p>
          <p className="text-[11px] text-slate-500">Total volume today</p>
          <div className="mt-3">
            <SparkRow bars={s.weightBars} color="#10b981" />
          </div>
        </div>

        <div>
          <p className="text-2xl font-bold text-slate-900">{s.totalWeight}</p>
          <p className="text-[11px] text-slate-500">Total weight loaded</p>
          <div className="mt-3">
            <SparkRow bars={s.weightBars} color="#3b82f6" />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* TripStatusDonut                                                   */
/* ================================================================ */
export function TripStatusDonut({
  slices = [],
  centerLabel = "0",
  centerSub = "Total trips",
}: {
  slices?: { label: string; value: number; color: string }[];
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const size = 220;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const arcs = slices.reduce<
    { total: number; arcs: (typeof slices)[number][] extends never[] ? never[] : Array<(typeof slices)[number] & { dash: number; offset: number }> }
  >(
    (accumulator, slice) => {
      const dash = (slice.value / total) * circumference;
      return {
        total: accumulator.total + dash,
        arcs: [...accumulator.arcs, { ...slice, dash, offset: accumulator.total }],
      };
    },
    { total: 0, arcs: [] },
  ).arcs;

  return (
    <CardShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Orders
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">
            Trip status
          </h2>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col items-center">
        <div className="relative">
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="#eef2f7"
              strokeWidth={stroke}
            />
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={stroke}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-slate-900">{centerLabel}</p>
            <p className="text-[11px] text-slate-400">{centerSub}</p>
          </div>
        </div>

        <div className="mt-5 grid w-full grid-cols-2 gap-2 text-[11px]">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-slate-600">{s.label}</span>
              <span className="ml-auto font-semibold text-slate-800">
                {Math.round((s.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ActivityTimeline (scrollable, taller)                             */
/* ================================================================ */
export function ActivityTimeline({
  events = [],
  height = 420,
}: {
  events?: {
    id: string;
    time: string;
    message: string;
    tone: keyof typeof toneHex;
  }[];
  height?: number;
}) {
  return (
    <CardShell className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Trip events
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">
            Activity timeline
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
          Latest
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto pr-1"
        style={{ maxHeight: height }}
      >
        <ol className="relative ml-2 border-l border-slate-200 pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative mb-5 last:mb-0">
              <span
                className="timeline-dot absolute -left-[27px] top-1 flex h-3 w-3 items-center justify-center rounded-full"
                style={{
                  backgroundColor: toneHex[e.tone],
                  color: toneHex[e.tone],
                }}
              />
              <p className="text-[11px] font-semibold text-slate-400">
                {e.time}
              </p>
              <p className="mt-0.5 text-xs text-slate-700">{e.message}</p>
            </li>
          ))}
        </ol>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ResourceView stubs                                                */
/* ================================================================ */
export function TripIntakePanel() {
  return (
    <CardShell>
      <SectionHeader eyebrow="New trip" title="Trip intake" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["Origin", "Destination", "Truck type", "Scheduled date"].map(
          (label) => (
            <label
              key={label}
              className="block text-xs font-medium text-slate-600"
            >
              {label}
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-slate-900"
                placeholder={`Enter ${label.toLowerCase()}`}
              />
            </label>
          ),
        )}
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
      >
        Create trip
      </button>
    </CardShell>
  );
}

export function PodWorkflowPanel({ rows = [] }: { rows?: DispatchRecord[] }) {
  return (
    <CardShell>
      <SectionHeader eyebrow="POD" title="Proof of delivery workflow" />
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800">{row.id}</p>
              <p className="text-[11px] text-slate-500">{row.route}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                row.status,
              )}`}
            >
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

export function MonitoringPanel({
  rows = [],
  incidents = [],
}: {
  rows?: DispatchRecord[];
  incidents?: IncidentRecord[];
  monitoring?: unknown;
}) {
  return (
    <div className="space-y-6">
      <CardShell>
        <SectionHeader eyebrow="Live" title="Delivery monitoring" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
            >
              <p className="text-xs font-semibold text-slate-800">{row.id}</p>
              <p className="mt-1 text-[11px] text-slate-500">{row.route}</p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                  row.status,
                )}`}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </CardShell>
      <IncidentPanel rows={incidents} title="Monitoring exceptions" />
    </div>
  );
}

export function StoreCallingPanel() {
  return (
    <CardShell>
      <SectionHeader eyebrow="Store calling" title="Delivery call list" />
      <p className="text-xs text-slate-500">
        Store calling workflow will appear here.
      </p>
    </CardShell>
  );
}

export function ReportsPanel() {
  return (
    <CardShell>
      <SectionHeader eyebrow="Reports" title="Export center" />
      <p className="text-xs text-slate-500">
        Report generation tools will appear here.
      </p>
    </CardShell>
  );
}

export function ChecklistPanel() {
  return (
    <CardShell>
      <SectionHeader eyebrow="Data controls" title="Compliance checklist" />
      <ul className="space-y-2 text-xs text-slate-600">
        <li>• POD completeness audit</li>
        <li>• Trip record retention</li>
        <li>• Document access review</li>
      </ul>
    </CardShell>
  );
}

export function SettingsPanel() {
  return (
    <CardShell>
      <SectionHeader eyebrow="Settings" title="Dashboard preferences" />
      <p className="text-xs text-slate-500">
        Workspace and integration settings will appear here.
      </p>
    </CardShell>
  );
}