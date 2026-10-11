// src/components/admin/DashboardPrimitives.tsx
import { useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Calendar,
  CheckCircle2,
  HelpCircle,
  MoreHorizontal,
  MoreVertical,
  Settings,
  Truck,
  Zap,
} from "lucide-react";
import type {
  DispatchRecord,
  IncidentRecord,
  RegionalSummary,
  SalesPoint,
  SnapshotRecord,
} from "../../types/dashboard";
import { getFleetTruckPhoto, toneClasses, toneHex, surface } from "./dashboardStyles";
import ImageWithFallback from "./ImageWithFallback";

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
    <header className="sticky top-3 z-20 mx-3 mb-4 rounded-xl border border-white/80 bg-white/90 px-3 py-1.5 shadow-[0_10px_25px_rgba(42,76,120,0.08)] backdrop-blur-xl sm:px-4 lg:mx-5">
      <div className="flex h-10 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-[13px] font-semibold text-slate-900">
            {activeLabel}
          </h1>
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 sm:flex">
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
              className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
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
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Help"
              onClick={onHelp}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          <div className="ml-3 border-l border-slate-200 pl-3">
            <button
              type="button"
              aria-label="Profile"
              onClick={onProfile}
              title={userName}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-[11px] font-bold text-white ring-2 ring-white transition hover:ring-slate-200">
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
      className={`${surface.card} ${className}`}
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
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0b2341]">
        {title}
      </h1>
      <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <SkeletonBlock className="h-12 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock
              key={index}
              className="h-28 rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
        <SkeletonBlock className="h-72 w-full rounded-2xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

/**
 * Card title row. `eyebrow` is still accepted so existing call sites compile,
 * but the small caps label above the title is no longer rendered.
 */
export function SectionHeader({
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
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className={surface.heading}>{title}</h2>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function CardMenuButton({ label = "More options" }: { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
    >
      <MoreVertical className="h-4 w-4" />
    </button>
  );
}

export function CardHeader({
  title,
  right,
  className = "mb-4",
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2 className={surface.heading}>{title}</h2>
      {right ?? null}
    </div>
  );
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "In Progress": "bg-blue-50 text-blue-700 ring-blue-200",
    Delayed: "bg-amber-50 text-amber-700 ring-amber-200",
    Pending: "bg-amber-50 text-amber-700 ring-amber-200",
    High: "bg-red-50 text-red-700 ring-red-200",
    Medium: "bg-amber-50 text-amber-700 ring-amber-200",
    Low: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return map[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
}

export function StatusBadge({ value }: { value: unknown }) {
  const raw =
    typeof value === "string"
      ? value.trim()
      : value === null || value === undefined
        ? ""
        : String(value);
  const normalized = raw || "Not recorded";
  const tone = (() => {
    const status = normalized.toLowerCase();
    if (/completed|delivered|verified|closed|finished|success/.test(status)) {
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    }
    if (
      /in progress|active|running|loading|pickup|assigned|processing|transit/.test(
        status,
      )
    ) {
      return "bg-cyan-50 text-cyan-700 ring-cyan-200";
    }
    if (
      /pending|waiting|queued|scheduled|delayed|hold|blocked|overdue/.test(
        status,
      )
    ) {
      return "bg-amber-50 text-amber-700 ring-amber-200";
    }
    if (/cancel|reject|failed|error|exception|critical/.test(status)) {
      return "bg-red-50 text-red-700 ring-red-200";
    }
    return "bg-slate-100 text-slate-600 ring-slate-200";
  })();

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${tone}`}>
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

export function TableSkeleton({
  columns,
  rows = 5,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <th key={`header-${columnIndex}`} className="px-4 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-t border-slate-100">
                {Array.from({ length: columns }).map((__, columnIndex) => (
                  <td
                    key={`cell-${rowIndex}-${columnIndex}`}
                    className="px-4 py-3">
                    <div
                      className={`h-4 animate-pulse rounded bg-slate-200 ${
                        columnIndex % 3 === 0
                          ? "w-24"
                          : columnIndex % 3 === 1
                            ? "w-32"
                            : "w-20"
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusDot(status: string) {
  const map: Record<string, string> = {
    Completed: "bg-emerald-500",
    "In Progress": "bg-blue-500",
    Delayed: "bg-amber-500",
  };
  return map[status] ?? "bg-slate-400";
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
    <CardShell className="relative overflow-hidden p-5 pl-6">
      <span
        aria-hidden="true"
        className="absolute inset-y-4 left-0 w-[3px] rounded-r-full"
        style={{ backgroundColor: toneHex[tone] }}
      />
      <p className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
        {icon ? (
          <span className="text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        ) : null}
        {label}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
          {value}
        </p>
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          <TrendIcon className="h-3 w-3" />
          {change}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">vs last period</p>
    </CardShell>
  );
}

/* One card, several metric columns, each with a coloured rail on the left */
export type OverviewMetric = {
  id: string;
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: keyof typeof toneHex;
  badge?: string;
  badgeNote?: string;
  onClick?: () => void;
};

export function OperationsOverviewCard({
  title = "Operations overview",
  updatedLabel,
  metrics,
}: {
  title?: string;
  updatedLabel?: string;
  metrics: OverviewMetric[];
}) {
  return (
    <CardShell className="p-5">
      <CardHeader
        title={title}
        right={
          <div className="flex items-center gap-2">
            {updatedLabel ? (
              <span className="text-[11px] text-slate-500">
                Last updated: {updatedLabel}
              </span>
            ) : null}
            <CardMenuButton />
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
            <button
              key={metric.id}
              type="button"
              onClick={metric.onClick}
              className="group relative flex min-w-0 flex-col rounded-r-xl py-1 pl-4 pr-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px] rounded-full"
                style={{ backgroundColor: toneHex[metric.tone] }}
              />
              <span className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
                <span className="text-slate-400 [&>svg]:h-4 [&>svg]:w-4">
                  {metric.icon}
                </span>
                {metric.label}
              </span>
              <span className="mt-3 flex items-center justify-between gap-2">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                  {metric.value}
                </span>
                {metric.badge ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClasses[metric.tone]}`}
                  >
                    {metric.badge}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>{metric.hint}</span>
                {metric.badgeNote ? <span>{metric.badgeNote}</span> : null}
              </span>
            </button>
        ))}
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ================================================================ */
/* RevenueChart (bar-style)                                          */
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
    <CardShell className="p-5">
      <SectionHeader eyebrow="Revenue" title="Trip revenue trend" />
      <div className="flex h-56 items-end justify-between gap-3">
        {points.map((point) => (
          <div
            key={point.label}
            className="flex flex-1 flex-col items-center gap-2">
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
/* DeliveryPerformanceChart (SVG line/area)                          */
/* ================================================================ */
function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
}

export function DeliveryPerformanceChart({
  data = [],
}: {
  data?: SalesPoint[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
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
  const H = 280;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const rawMax = Math.max(
    ...points.map((p) => Math.max(p.primary, p.secondary)),
    1,
  );
  const tickStep = niceStep(rawMax / 5);
  const maxVal = Math.ceil(rawMax / tickStep) * tickStep;
  const yTicks = Array.from(
    { length: Math.round(maxVal / tickStep) + 1 },
    (_, i) => i * tickStep,
  );

  const toX = (i: number) =>
    PAD_L + (i / Math.max(points.length - 1, 1)) * innerW;
  const toY = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;

  const buildPath = (key: "primary" | "secondary") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p[key])}`)
      .join(" ");

  const primaryPath = buildPath("primary");
  const secondaryPath = buildPath("secondary");
  const areaPath = `${primaryPath} L ${toX(points.length - 1)} ${toY(0)} L ${toX(0)} ${toY(0)} Z`;

  const colW = innerW / Math.max(points.length - 1, 1);
  const active = hovered !== null ? points[hovered] : null;
  const TIP_W = 148;
  const TIP_H = 70;
  const tipX =
    hovered !== null
      ? Math.min(Math.max(toX(hovered) - TIP_W / 2, PAD_L), W - PAD_R - TIP_W)
      : 0;
  const tipY =
    active !== null ? Math.max(PAD_T, toY(active.primary) - TIP_H - 14) : 0;

  return (
    <CardShell className="p-5">
      <CardHeader title="Delivery performance" />

      <div
        className={`${surface.inner} mb-4 grid grid-cols-2 divide-x divide-slate-200/80 text-[12px] font-medium text-slate-600`}
      >
        <span className="flex items-center justify-center gap-2 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Delivered
        </span>
        <span className="flex items-center justify-center gap-2 py-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> Delayed
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-64 w-full min-w-[520px]"
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="dpArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal grid + y labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={toY(t)}
                y2={toY(t)}
                stroke="#eef2f6"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 10}
                y={toY(t) + 3}
                textAnchor="end"
                fontSize="10"
                fill="#94a3b8"
              >
                {t}
              </text>
            </g>
          ))}

          {/* vertical grid + x labels */}
          {points.map((p, i) => (
            <g key={p.label + i}>
              <line
                x1={toX(i)}
                x2={toX(i)}
                y1={PAD_T}
                y2={toY(0)}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <text
                x={toX(i)}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fontWeight={hovered === i ? 700 : 400}
                fill={hovered === i ? "#0f172a" : "#94a3b8"}
              >
                {p.label}
              </text>
            </g>
          ))}

          <path d={areaPath} fill="url(#dpArea)" />
          <path
            d={secondaryPath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={primaryPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((p, i) => (
            <g key={`dots-${i}`}>
              <circle
                cx={toX(i)}
                cy={toY(p.secondary)}
                r={hovered === i ? 4.5 : 3}
                fill="#fff"
                stroke="#3b82f6"
                strokeWidth="2"
              />
              <circle
                cx={toX(i)}
                cy={toY(p.primary)}
                r={hovered === i ? 5 : 3.5}
                fill="#fff"
                stroke="#10b981"
                strokeWidth="2"
              />
            </g>
          ))}

          {/* hover guide + tooltip */}
          {active !== null && hovered !== null ? (
            <g pointerEvents="none">
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={toY(active.primary)}
                y2={toY(active.primary)}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <rect
                x={2}
                y={toY(active.primary) - 9}
                width={PAD_L - 8}
                height={18}
                rx={9}
                fill="#0f172a"
              />
              <text
                x={2 + (PAD_L - 8) / 2}
                y={toY(active.primary) + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#fff"
              >
                {active.primary}
              </text>

              <rect
                x={tipX}
                y={tipY}
                width={TIP_W}
                height={TIP_H}
                rx={10}
                fill="#fff"
                stroke="#e2e8f0"
              />
              <text
                x={tipX + 12}
                y={tipY + 20}
                fontSize="11"
                fontWeight="600"
                fill="#0f172a"
              >
                {active.label}
              </text>
              <circle cx={tipX + 16} cy={tipY + 38} r={3} fill="#10b981" />
              <text x={tipX + 26} y={tipY + 42} fontSize="11" fill="#475569">
                Delivered
              </text>
              <text
                x={tipX + TIP_W - 12}
                y={tipY + 42}
                textAnchor="end"
                fontSize="11"
                fontWeight="600"
                fill="#0f172a"
              >
                {active.primary}
              </text>
              <circle cx={tipX + 16} cy={tipY + 57} r={3} fill="#3b82f6" />
              <text x={tipX + 26} y={tipY + 61} fontSize="11" fill="#475569">
                Delayed
              </text>
              <text
                x={tipX + TIP_W - 12}
                y={tipY + 61}
                textAnchor="end"
                fontSize="11"
                fontWeight="600"
                fill="#0f172a"
              >
                {active.secondary}
              </text>
            </g>
          ) : null}

          {/* hit areas */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.label}-${i}`}
              x={toX(i) - colW / 2}
              y={PAD_T}
              width={colW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onClick={() => setHovered(i)}
            />
          ))}
        </svg>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ================================================================ */
/* FleetMovementPanel                                                 */
/* ================================================================ */
export type FleetMovementPoint = { label: string; distanceKm: number };

type ChartTipProps = {
  active?: boolean;
  payload?: { payload?: Record<string, unknown> }[];
  label?: string | number;
};

function MovementTooltip({ active, payload, label }: ChartTipProps) {
  const row = payload?.[0]?.payload as
    | { daily: number; cumulative: number }
    | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-2xl bg-[#0b2341] px-3.5 py-2.5 text-white shadow-[0_16px_40px_-12px_rgba(11,35,65,0.5)]">
      <p className="text-[10px] font-medium text-white/60">{label}</p>
      <p className="mt-1.5 flex items-center justify-between gap-6 text-[12px]">
        <span className="flex items-center gap-1.5 text-white/70">
          <span className="h-2 w-2 rounded-full bg-[#5aa3d8]" />
          That day
        </span>
        <span className="font-semibold tabular-nums">{row.daily.toFixed(1)} km</span>
      </p>
      <p className="mt-1 flex items-center justify-between gap-6 text-[12px]">
        <span className="flex items-center gap-1.5 text-white/70">
          <span className="h-2 w-2 rounded-full bg-[#ffd43b]" />
          Running total
        </span>
        <span className="font-semibold tabular-nums">{row.cumulative.toFixed(1)} km</span>
      </p>
    </div>
  );
}

export function FleetMovementPanel({
  data,
  isLoading,
  activeRoutes,
}: {
  data: FleetMovementPoint[];
  isLoading: boolean;
  activeRoutes: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [hidden, setHidden] = useState({ daily: false, cumulative: false });
  const totalDistance = data.at(-1)?.distanceKm ?? 0;

  const rows = data.map((point, index) => ({
    label: point.label,
    cumulative: point.distanceKm,
    daily: Math.max(
      Math.round((point.distanceKm - (data[index - 1]?.distanceKm ?? 0)) * 10) / 10,
      0,
    ),
  }));
  const best = rows.reduce(
    (top, row) => (row.daily > top.daily ? row : top),
    rows[0] ?? { label: "", daily: 0, cumulative: 0 },
  );
  const average = rows.length > 0 ? totalDistance / rows.length : 0;

  const legend: { key: "daily" | "cumulative"; label: string; dot: string }[] = [
    { key: "daily", label: "Daily distance", dot: "bg-[#2678b9]" },
    { key: "cumulative", label: "Running total", dot: "bg-[#ffd43b]" },
  ];

  return (
    <CardShell className="flex min-w-0 flex-col p-5">
      <CardHeader
        title="Fleet movement"
        right={
          <span className="rounded-full bg-[#e6f0f9] px-3 py-1 text-[11px] font-semibold text-[#1d5f94]">
            {totalDistance.toFixed(1)} km GPS distance
          </span>
        }
        className="mb-3"
      />
      {isLoading ? (
        <p className="flex min-h-[200px] items-center justify-center text-sm text-slate-500">Loading route history...</p>
      ) : data.length < 2 ? (
        <p className="flex min-h-[200px] items-center justify-center px-4 text-center text-sm text-slate-500">
          GPS movement will appear after trips record more than one location.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {legend.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={!hidden[item.key]}
                  onClick={() => setHidden((current) => ({ ...current, [item.key]: !current[item.key] }))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${
                    hidden[item.key]
                      ? "bg-white text-slate-400 ring-1 ring-slate-200"
                      : "bg-[#f2f6fa] text-[#0b2341]"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${hidden[item.key] ? "bg-slate-300" : item.dot}`} />
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Best day <span className="font-semibold text-[#0b2341]">{best.label} · {best.daily.toFixed(1)} km</span>
              <span className="mx-1.5 text-slate-300">•</span>
              Avg <span className="font-semibold text-[#0b2341]">{average.toFixed(1)} km/day</span>
              <span className="mx-1.5 text-slate-300">•</span>
              {activeRoutes} active {activeRoutes === 1 ? "route" : "routes"}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={rows} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fleet-bar-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2678b9" stopOpacity={1} />
                  <stop offset="100%" stopColor="#8dbfe6" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="fleet-total-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffd43b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ffd43b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e7ecf1" strokeDasharray="3 5" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#718096", fontSize: 10 }} />
              <YAxis yAxisId="day" width={40} tickLine={false} axisLine={false} tick={{ fill: "#718096", fontSize: 10 }} />
              <YAxis yAxisId="total" orientation="right" width={44} tickLine={false} axisLine={false} tick={{ fill: "#b08a00", fontSize: 10 }} />
              <Tooltip content={<MovementTooltip />} cursor={{ fill: "rgba(38,120,185,0.07)" }} />
              {!hidden.cumulative && (
                <Area
                  yAxisId="total"
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#f2c200"
                  strokeWidth={3}
                  fill="url(#fleet-total-fill)"
                  dot={false}
                  activeDot={{ r: 6, fill: "#ffd43b", stroke: "#fff", strokeWidth: 2 }}
                  animationDuration={900}
                />
              )}
              {!hidden.daily && (
                <Bar
                  yAxisId="day"
                  dataKey="daily"
                  radius={[10, 10, 0, 0]}
                  maxBarSize={38}
                  animationDuration={700}
                  onMouseEnter={(_data: unknown, index: number) => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {rows.map((row, index) => (
                    <Cell
                      key={row.label}
                      fill="url(#fleet-bar-fill)"
                      fillOpacity={hovered === null || hovered === index ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-center text-[10px] text-slate-400">
            Hover a day for details · tap a legend chip to show or hide a series
          </p>
        </div>
      )}
    </CardShell>
  );
}

/* ================================================================ */
/* EventVolumePanel                                                   */
/* ================================================================ */
function OpsTooltip({ active, payload, label }: ChartTipProps) {
  const row = payload?.[0]?.payload as { count: number; isPeak: boolean } | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-2xl bg-[#0b2341] px-3.5 py-2.5 text-white shadow-[0_16px_40px_-12px_rgba(11,35,65,0.5)]">
      <p className="text-[10px] font-medium text-white/60">{label}</p>
      <p className="mt-1 text-[13px] font-semibold tabular-nums">
        {row.count} {row.count === 1 ? "event" : "events"}
        {row.isPeak && (
          <span className="ml-2 rounded-full bg-[#ffd43b] px-2 py-0.5 text-[9px] font-bold text-[#0b2341]">
            PEAK
          </span>
        )}
      </p>
    </div>
  );
}

export function OperationsActivityPanel({
  dailyCounts,
  totalEvents,
  tripsUpdated,
  stopsCompleted,
  isLoading,
  unavailable,
}: {
  dailyCounts: { date: string; count: number }[];
  totalEvents: number;
  tripsUpdated: number;
  stopsCompleted: number;
  isLoading: boolean;
  unavailable?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const peak = dailyCounts.reduce(
    (best, entry) => (entry.count > best.count ? entry : best),
    dailyCounts[0] ?? { date: "", count: 0 },
  );

  const dayLabel = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  const rows = dailyCounts.map(({ date, count }) => ({
    label: dayLabel(date),
    count,
    isPeak: date === peak.date,
  }));
  const average =
    rows.length > 0 ? rows.reduce((sum, row) => sum + row.count, 0) / rows.length : 0;

  return (
    <CardShell className="flex min-w-0 flex-col p-5">
      <CardHeader
        title="Operations activity"
        right={
          <span className="text-[11px] font-medium text-slate-500">
            {peak.date ? `Peak ${peak.count} · ${dayLabel(peak.date)}` : "By day"}
          </span>
        }
      />

      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { label: "Total events", value: totalEvents },
          { label: "Trips updated", value: tripsUpdated },
          { label: "Stops completed", value: stopsCompleted },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-[#f2f6fa] px-3 py-2.5 text-center">
            <p className="text-xl font-bold tabular-nums text-[#0b2341]">
              {isLoading ? "..." : stat.value}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {unavailable && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Some trip events could not be loaded.
        </p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-500">
          Loading event data...
        </p>
      ) : dailyCounts.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No trip events recorded.
        </p>
      ) : (
        <div className="flex flex-col">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rows} margin={{ top: 14, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ops-bar-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2678b9" stopOpacity={1} />
                  <stop offset="100%" stopColor="#8dbfe6" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="ops-peak-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffd43b" stopOpacity={1} />
                  <stop offset="100%" stopColor="#f2c200" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e7ecf1" strokeDasharray="3 5" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#718096", fontSize: 10 }} />
              <YAxis allowDecimals={false} width={34} tickLine={false} axisLine={false} tick={{ fill: "#718096", fontSize: 10 }} />
              <Tooltip content={<OpsTooltip />} cursor={{ fill: "rgba(38,120,185,0.07)" }} />
              <ReferenceLine
                y={average}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: `avg ${average.toFixed(1)}`, position: "insideTopRight", fill: "#64748b", fontSize: 10 }}
              />
              <Bar
                dataKey="count"
                radius={[10, 10, 0, 0]}
                maxBarSize={34}
                animationDuration={700}
                onMouseEnter={(_data: unknown, index: number) => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                {rows.map((row, index) => (
                  <Cell
                    key={row.label}
                    fill={row.isPeak ? "url(#ops-peak-fill)" : "url(#ops-bar-fill)"}
                    fillOpacity={hovered === null || hovered === index ? 1 : 0.4}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="pt-1 text-center text-[10px] text-slate-400">
            Events by date · last {dailyCounts.length} days · yellow marks the busiest day
          </p>
        </div>
      )}
    </CardShell>
  );
}

/* ================================================================ */
/* ActivityTimelineCard                                               */
/* ================================================================ */
const timelineToneConfig = {
  emerald: {
    dot: "bg-emerald-500",
    icon: CheckCircle2,
  },
  blue: {
    dot: "bg-blue-500",
    icon: Truck,
  },
  amber: {
    dot: "bg-amber-500",
    icon: Zap,
  },
} as const;

export function ActivityTimelineCard({
  events = [],
  title = "Activity timeline",
}: {
  events?: {
    id: string;
    time: string;
    message: string;
    tone: keyof typeof toneHex;
  }[];
  title?: string;
}) {
  return (
    <CardShell className="flex min-h-0 flex-col p-4">
      <CardHeader
        title={title}
        right={<span className="text-[10px] font-medium text-slate-500">{events.length} events</span>}
        className="mb-3"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No recent activity.</p>
        ) : (
          <ol className="space-y-2">
            {events.map((entry) => {
              const tone =
                timelineToneConfig[entry.tone as keyof typeof timelineToneConfig] ??
                timelineToneConfig.blue;
              const Icon = tone.icon;
              return (
                <li
                  key={entry.id}
                  className="group relative grid min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-2"
                >
                  <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full border-2 border-white ring-1 ring-slate-200 ${tone.dot}`}>
                    <Icon className="h-4 w-4 shrink-0 text-white" />
                  </span>

                  <div className="min-w-0 border-b border-slate-100 pb-2 last:border-0">
                    <time className="block text-[10px] font-semibold tabular-nums text-slate-500">
                      {entry.time}
                    </time>
                    <p className="mt-0.5 break-words text-[12px] leading-snug text-slate-700">
                      {entry.message}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ActivityPanel                                                     */
/* ================================================================ */
export function ActivityPanel({ rows = [] }: { rows?: DispatchRecord[] }) {
  return (
    <CardShell className="p-5">
      <SectionHeader eyebrow="Activity" title="Recent trips" />
      <ul className="space-y-3">
        {rows.slice(0, 4).map((row) => (
          <li key={row.id} className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-800">
                {row.id} · {row.route}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {row.hub} · {row.eta}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                row.status,
              )}`}>
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ================================================================ */
/* FleetBoardPanel                                                   */
/* ================================================================ */
function FleetTripCard({
  trip,
  onSelect,
  onViewTrip,
  selected,
  imageIndex,
}: {
  trip: DispatchRecord;
  onSelect?: (id: string) => void;
  onViewTrip?: (id: string) => void;
  selected?: boolean;
  imageIndex: number;
}) {
  const progress = Math.min(Math.max(trip.progressPct ?? 0, 0), 100);
  const statusTheme =
    trip.status === "Delayed"
      ? {
          card: "border-amber-200 bg-amber-50/70",
          route: "bg-amber-500",
          icon: "text-amber-700",
        }
      : trip.status === "Completed"
        ? {
            card: "border-emerald-200 bg-emerald-50/70",
            route: "bg-emerald-600",
            icon: "text-emerald-700",
          }
        : trip.status === "In Progress"
          ? {
              card: "border-blue-200 bg-blue-50/70",
              route: "bg-blue-600",
              icon: "text-blue-700",
            }
          : {
              card: "border-slate-200 bg-white",
              route: "bg-slate-500",
              icon: "text-slate-600",
            };

  return (
    <div
      className={`relative min-h-[108px] rounded-xl border ${statusTheme.card} ${selected ? "ring-2 ring-blue-300" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSelect?.(trip.id)}
        className="w-full cursor-pointer p-2 pb-1.5 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] font-semibold text-slate-900">
            {trip.displayId ?? trip.id}
            <span className="mx-1.5 text-slate-300">•</span>
            <span className="font-medium text-slate-500">ETA {trip.eta}</span>
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusPill(
              trip.status,
            )}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusDot(trip.status)}`}
            />
            {trip.statusText ?? trip.status}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-white/80 bg-white/75 p-1">
          <span className="h-8 w-10 shrink-0 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200/70">
            <ImageWithFallback
              src={trip.imageUrl}
              fallbackSrc={getFleetTruckPhoto(undefined, imageIndex)}
              alt="Alzhen fleet truck at origin"
              className="h-full w-full object-cover object-center"
            />
          </span>

          <div className="w-16 shrink-0 min-w-0">
            <p className="truncate text-[10px] font-semibold text-slate-900" title={trip.origin ?? "Origin"}>
              {trip.origin ?? "Origin"}
            </p>
            <p className="text-[8px] text-slate-400">Origin</p>
          </div>

          <div className="relative flex h-6 min-w-[28px] flex-1 items-center">
            <div className="trip-route-track absolute inset-x-0 top-1/2 -translate-y-1/2" />
            <div
              className={`fleet-progress-line absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full ${statusTheme.route}`}
              style={{ width: `${progress}%` }}
            />
            <span
              aria-hidden="true"
              className={`fleet-progress-marker absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 ${statusTheme.icon}`}
              style={{ left: `${progress}%` }}
            >
              <span role="img" aria-label="Moving delivery truck" className="truck-emoji-right text-lg leading-none">
                🚚
              </span>
            </span>
          </div>

          <div className="w-16 shrink-0 min-w-0 text-right">
            <p className="truncate text-[10px] font-semibold text-slate-900" title={trip.destination ?? "Destination"}>
              {trip.destination ?? "Destination"}
            </p>
            <p className="text-[8px] text-slate-400">Destination</p>
          </div>
        </div>

        <p className="mt-1 truncate pr-8 text-[9px] text-slate-500">
          Driver: <span className="text-slate-500">{trip.driver}</span>
        </p>
      </button>

      <button
        type="button"
        onClick={() => onViewTrip?.(trip.id)}
        aria-label={`View trip details for ${trip.displayId ?? trip.id}`}
        title="View trip details"
        className="absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white bg-white/80 text-slate-600 hover:bg-white hover:text-slate-950"
      >
        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
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
    "all" | "in-progress" | "completed" | "delayed" | "other"
  >("all");
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
    <CardShell className={`flex min-h-0 flex-col p-4 ${className}`}>
      <CardHeader title="Active fleet" right={<CardMenuButton />} className="mb-2" />

      <div className="fleet-tabs flex gap-1 overflow-x-auto rounded-full bg-slate-100/80 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.1)]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}{" "}
            <span className="ml-0.5 opacity-60">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        <div className="grid gap-3 xl:grid-cols-1">
          {filteredRows.slice(0, 6).map((trip, index) => (
            <FleetTripCard
              key={trip.id}
              trip={trip}
              onSelect={onSelectTrip}
              onViewTrip={onViewTrip}
              selected={trip.id === selectedTripId}
              imageIndex={index}
            />
          ))}
        </div>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ================================================================ */
/* RegionalPanel                                                     */
/* ================================================================ */
export function RegionalPanel({ data = [] }: { data?: RegionalSummary[] }) {
  return (
    <CardShell className="p-5">
      <SectionHeader eyebrow="Regions" title="Regional summary" />
      <ul className="space-y-3.5">
        {data.map((item) => (
          <li key={item.region}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-slate-600">{item.region}</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {item.value}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
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
    <CardShell className="p-5">
      <SectionHeader eyebrow="Issues" title="Issue clusters" />
      <ul className="space-y-2">
        {data.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5"
          >
            <span className="text-[12px] font-medium text-slate-600">
              {item.label}
            </span>
            <span className="text-[12px] font-bold tabular-nums text-slate-900">
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
    <CardShell className="p-5">
      <SectionHeader eyebrow="Snapshots" title="Daily snapshots" />
      <ul className="divide-y divide-slate-100">
        {data.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
          >
            <span className="text-[12px] text-slate-500">{item.label}</span>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums text-slate-900">
                {item.value}
              </p>
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
    <CardShell className="p-5">
      <SectionHeader eyebrow="Exceptions" title={title} action="View all" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4 font-semibold">ID</th>
              <th className="pb-3 pr-4 font-semibold">Issue</th>
              <th className="pb-3 pr-4 font-semibold">Location</th>
              <th className="pb-3 pr-4 font-semibold">Severity</th>
              <th className="pb-3 pr-4 font-semibold">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 last:border-none hover:bg-slate-50/50"
              >
                <td className="py-3 pr-4 text-[12px] font-medium text-slate-800">
                  {row.id}
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-600">
                  {row.title}
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-600">
                  {row.location}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                      row.severity,
                    )}`}>
                    {row.severity}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-500">
                  {row.age}
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
    <CardShell className="p-5">
      <SectionHeader eyebrow="Trips" title={title} action="Export" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="pb-3 pr-4 font-semibold">Trip ID</th>
              <th className="pb-3 pr-4 font-semibold">Route</th>
              <th className="pb-3 pr-4 font-semibold">Type</th>
              <th className="pb-3 pr-4 font-semibold">Status</th>
              <th className="pb-3 pr-4 font-semibold">ETA</th>
              <th className="pb-3 pr-4 font-semibold">Hub</th>
              <th className="pb-3 pr-4 font-semibold">Driver</th>
              <th className="pb-3 pr-4 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 last:border-none hover:bg-slate-50/50"
              >
                <td className="py-3 pr-4 text-[12px] font-medium text-slate-800">
                  {row.id}
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-600">
                  {row.route}
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-600">
                  {row.tripType}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                      row.status,
                    )}`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-600">
                  {row.eta}
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-600">
                  {row.hub}
                </td>
                <td className="py-3 pr-4 text-[12px] text-slate-600">
                  {row.driver}
                </td>
                <td className="py-3 pr-4 text-[12px] font-medium tabular-nums text-slate-800">
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
        <CardShell
          key={row.id}
          className="flex flex-col p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-semibold text-slate-800">
                {row.id}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{row.route}</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
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
              )}`}>
              {row.status}
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-slate-800">
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
    <div className="flex h-12 items-end gap-1">
      {bars.map((bar, index) => (
        <div
          key={index}
          className="spark-bar min-w-0 flex-1 rounded-t"
          style={{
            height: `${bar}%`,
            background: `linear-gradient(180deg, ${color}99 0%, ${color}1f 100%)`,
          }}
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

  const cells = [
    {
      value: String(s.trucksLoading).padStart(2, "0"),
      label: "Trucks being loaded",
      bars: s.volumeBars,
      color: "#10b981",
    },
    {
      value: `${s.avgLoadPct}%`,
      label: "Average load",
      bars: s.volumeBars,
      color: "#3b82f6",
    },
    {
      value: s.totalVolume,
      label: "Total volume today",
      bars: s.weightBars,
      color: "#10b981",
    },
    {
      value: s.totalWeight,
      label: "Total weight loaded",
      bars: s.weightBars,
      color: "#3b82f6",
    },
  ];

  return (
    <CardShell className="p-5">
      <CardHeader title="Current loading status" right={<CardMenuButton />} />

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200/80">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={`p-4 ${i % 2 === 0 ? "border-r border-slate-200/80" : ""} ${
              i < 2 ? "border-b border-slate-200/80" : ""
            }`}
          >
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {cell.value}
            </p>
            <p className="text-[11px] text-slate-500">{cell.label}</p>
            <div className="mt-3">
              <SparkRow bars={cell.bars} color={cell.color} />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ================================================================ */
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
  const size = 200;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const arcs = slices.reduce<{
    total: number;
    arcs: Array<
      (typeof slices)[number] & { dash: number; offset: number }
    >;
  }>(
    (accumulator, slice) => {
      const dash = (slice.value / total) * circumference;
      return {
        total: accumulator.total + dash,
        arcs: [
          ...accumulator.arcs,
          { ...slice, dash, offset: accumulator.total },
        ],
      };
    },
    { total: 0, arcs: [] },
  ).arcs;

  return (
    <CardShell className="p-5">
      <CardHeader title="Trip status" right={<CardMenuButton />} />

      <div className="flex flex-col items-center">
        <div className="relative">
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="#f1f5f9"
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
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
              {centerLabel}
            </p>
            <p className="text-[11px] text-slate-400">{centerSub}</p>
          </div>
        </div>

        <div className="mt-5 flex w-full flex-wrap justify-center gap-x-7 gap-y-3 text-[11px]">
          {slices.map((s) => (
            <div key={s.label} className="min-w-[72px]">
              <p className="flex items-center gap-1.5 font-medium text-slate-700">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </p>
              <p className="mt-0.5 pl-3.5 tabular-nums text-slate-400">
                {Math.round((s.value / total) * 100)}% • {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/* ================================================================ */
/* ActivityTimeline                                                  */
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
    <CardShell className="flex flex-col p-5">
      <CardHeader
        title="Activity timeline"
        right={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            Latest
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: height }}>
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
              <p className="mt-0.5 text-[12px] text-slate-700">{e.message}</p>
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
    <CardShell className="p-5">
      <SectionHeader eyebrow="New trip" title="Trip intake" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["Origin", "Destination", "Truck type", "Scheduled date"].map(
          (label) => (
            <label
              key={label}
              className="block text-[12px] font-medium text-slate-600"
            >
              {label}
              <input
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                placeholder={`Enter ${label.toLowerCase()}`}
              />
            </label>
          ),
        )}
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-slate-800"
      >
        Create trip
      </button>
    </CardShell>
  );
}

export function PodWorkflowPanel({ rows = [] }: { rows?: DispatchRecord[] }) {
  return (
    <CardShell className="p-5">
      <SectionHeader eyebrow="POD" title="Proof of delivery workflow" />
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between rounded-xl border border-slate-100 px-3.5 py-2.5"
          >
            <div>
              <p className="text-[12px] font-semibold text-slate-800">
                {row.id}
              </p>
              <p className="text-[11px] text-slate-500">{row.route}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                row.status,
              )}`}>
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
      <CardShell className="p-5">
        <SectionHeader eyebrow="Live" title="Delivery monitoring" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5"
            >
              <p className="text-[12px] font-semibold text-slate-800">
                {row.id}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{row.route}</p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(
                  row.status,
                )}`}>
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
    <CardShell className="p-5">
      <SectionHeader eyebrow="Store calling" title="Delivery call list" />
      <p className="text-[12px] text-slate-500">
        Store calling workflow will appear here.
      </p>
    </CardShell>
  );
}

export function ReportsPanel() {
  return (
    <CardShell className="p-5">
      <SectionHeader eyebrow="Reports" title="Export center" />
      <p className="text-[12px] text-slate-500">
        Report generation tools will appear here.
      </p>
    </CardShell>
  );
}

export function ChecklistPanel() {
  return (
    <CardShell className="p-5">
      <SectionHeader eyebrow="Data controls" title="Compliance checklist" />
      <ul className="space-y-2 text-[12px] text-slate-600">
        <li>• POD completeness audit</li>
        <li>• Trip record retention</li>
        <li>• Document access review</li>
      </ul>
    </CardShell>
  );
}

export function SettingsPanel() {
  return (
    <CardShell className="p-5">
      <SectionHeader eyebrow="Settings" title="Dashboard preferences" />
      <p className="text-[12px] text-slate-500">
        Workspace and integration settings will appear here.
      </p>
    </CardShell>
  );
}
