// src/pages/Admin/views/OverviewView.tsx
import { useState } from "react";
import { FileText, Timer, Truck, Wallet } from "lucide-react";
import type { DashboardData } from "../../../types/dashboard";
import {
  DispatchTable,
  FleetBoardPanel,
  IncidentPanel,
  KpiCard,
  LoadingStatusPanel,
  StatusOverviewPanel,
  TripStatusDonut,
} from "../../../components/admin/DashboardPrimitives";
import LiveTripMap from "../../../components/admin/LiveTripMap";

export default function OverviewView({ data }: { data: DashboardData }) {
  const operations = data.operations;
  const [focusedTripId, setFocusedTripId] = useState<string | null>(null);

  const completed = operations.dispatches.filter((r) => r.status === "Completed").length;
  const active = operations.dispatches.filter((r) => r.status === "In Progress").length;
  const delayed = operations.dispatches.filter((r) => r.status === "Delayed").length;
  const onTimePct =
    operations.dispatches.length > 0
      ? Math.round((completed / operations.dispatches.length) * 100)
      : 0;

  const kpis = [
    {
      label: "Trips today",
      value: String(operations.dispatches.length),
      change: "+12.5%",
      tone: "blue" as const,
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      label: "Active trucks",
      value: String(active),
      change: "+6.2%",
      tone: "emerald" as const,
      icon: <Truck className="h-4 w-4" />,
    },
    {
      label: "Avg delivery time",
      value: "4h 12m",
      change: "-18m",
      tone: "violet" as const,
      icon: <Timer className="h-4 w-4" />,
    },
    {
      label: "On-time delivery rate",
      value: `${onTimePct}%`,
      change: delayed > 0 ? `-${delayed}` : "+0",
      tone: "amber" as const,
      icon: <FileText className="h-4 w-4" />,
      trend: delayed > 0 ? ("down" as const) : ("up" as const),
    },
  ];

  const donutSlices = operations.donutSlices ?? [
    { label: "On the way", value: active, color: "#10b981" },
    { label: "Delivered", value: completed, color: "#3b82f6" },
    { label: "Delayed", value: delayed, color: "#f59e0b" },
  ];
  const donutTotal = donutSlices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Map (left, wide) + Active fleet (right, scrollable) */}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr] xl:grid-rows-[590px]">
        <div className="min-h-0 overflow-y-auto">
          <LiveTripMap
            rows={operations.dispatches}
            hubs={operations.hubs ?? []}
            focusTripId={focusedTripId}
            height={460}
          />
        </div>
        <FleetBoardPanel
          rows={operations.dispatches}
          onSelectTrip={(id) =>
            setFocusedTripId(id === focusedTripId ? null : id)
          }
          selectedTripId={focusedTripId}
          className="h-[590px] min-h-0"
        />
      </div>

      {/* Status + Loading + Donut */}
      <div className="grid gap-6 xl:grid-cols-3">
        <StatusOverviewPanel rows={operations.dispatches} />
        <LoadingStatusPanel stats={operations.loadingStats} />
        <TripStatusDonut
          slices={donutSlices}
          centerLabel={String(donutTotal)}
          centerSub="Total trips"
        />
      </div>

      {/* Exceptions */}
      <IncidentPanel
        rows={operations.incidents.slice(0, 3)}
        title="Open delivery exceptions"
      />

      {/* Full table */}
      <DispatchTable rows={operations.dispatches} title="All active trips" />
    </div>
  );
}

