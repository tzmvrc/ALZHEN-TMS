// src/components/admin/FleetAnalytics.tsx
// npm i highcharts highcharts-react-official   (Highcharts 12+; modules self-register on import)
import { useMemo, type ReactNode } from "react";
import Highcharts from "highcharts";
import "highcharts/modules/sankey";
import { HighchartsReact } from "highcharts-react-official";
import { surface } from "./dashboardStyles";
import RegionComparison, { type RegionTrip } from "./RegionComparison";

export type MovementPoint = { label: string; distanceKm: number };
export type FlowRow = { warehouse: string; store: string; status: "Completed" | "Delayed" | "In Progress" | "Other" };
export type StatusSlice = { label: string; value: number; color: string };

const NAVY = "#0b2341";
const BLUE = "#2678b9";
const YELLOW = "#ffd43b";
const MUTED = "#718096";
const STATUS_COLOR: Record<FlowRow["status"], string> = {
  Completed: "#10b981",
  "In Progress": BLUE,
  Delayed: "#f59e0b",
  Other: "#cbd5e1",
};

const base: Highcharts.Options = {
  chart: { backgroundColor: "transparent", style: { fontFamily: "inherit" }, spacing: [8, 4, 4, 4] },
  title: { text: undefined },
  credits: { enabled: false },
  accessibility: { enabled: true },
  plotOptions: { series: { animation: { duration: 650 } } },
  legend: { itemStyle: { color: "#475569", fontWeight: "500", fontSize: "11px" }, itemHoverStyle: { color: NAVY } },
  tooltip: {
    backgroundColor: NAVY,
    borderWidth: 0,
    borderRadius: 14,
    shadow: false,
    padding: 12,
    style: { color: "#fff", fontSize: "12px" },
  },
  xAxis: { lineWidth: 0, tickWidth: 0, labels: { style: { color: MUTED, fontSize: "10px" } } },
  yAxis: { gridLineColor: "#e7ecf1", gridLineDashStyle: "Dash", title: { text: undefined }, labels: { style: { color: MUTED, fontSize: "10px" } } },
};

function Panel({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${surface.card} flex min-w-0 flex-col border border-slate-200/70 p-5 shadow-[0_8px_28px_-20px_rgba(11,35,65,0.25)] ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-bold tracking-tight text-[#0b2341]">{title}</h3>
        {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ text, height }: { text: string; height: number }) {
  return (
    <p className="flex items-center justify-center px-4 text-center text-sm text-slate-400" style={{ minHeight: height }}>
      {text}
    </p>
  );
}

function Chart({ options }: { options: Highcharts.Options }) {
  return <HighchartsReact highcharts={Highcharts} options={options} containerProps={{ style: { width: "100%" } }} />;
}

export default function FleetAnalytics({
  movement,
  dailyCounts,
  flows,
  regionTrips,
  unlocatedTrips,
  isLoading,
}: {
  movement: MovementPoint[];
  dailyCounts: { date: string; count: number }[];
  flows: FlowRow[];
  regionTrips: RegionTrip[];
  unlocatedTrips: number;
  isLoading: boolean;
}) {
  /* ---- Warehouse -> Store flow (Sankey), top 8 stores, rest grouped ---- */
  const flowOptions = useMemo<Highcharts.Options | null>(() => {
    if (flows.length === 0) return null;
    const perStore = new Map<string, number>();
    for (const f of flows) perStore.set(f.store, (perStore.get(f.store) ?? 0) + 1);
    const keep = new Set(
      [...perStore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name),
    );
    const links = new Map<string, { from: string; to: string; weight: number; status: FlowRow["status"] }>();
    for (const f of flows) {
      const to = keep.has(f.store) ? f.store : "Other stores";
      const key = `${f.warehouse}|${to}|${f.status}`;
      const hit = links.get(key);
      if (hit) hit.weight += 1;
      else links.set(key, { from: f.warehouse, to, weight: 1, status: f.status });
    }
    const data = [...links.values()].map((l) => ({
      from: l.from,
      to: l.to,
      weight: l.weight,
      color: STATUS_COLOR[l.status],
      name: l.status,
    }));
    return {
      ...base,
      chart: { ...base.chart, height: 320 },
      tooltip: {
        ...base.tooltip,
        useHTML: true,
        formatter() {
          const p = this as unknown as { point: { from: string; to: string; weight: number; name?: string } };
          return `<b>${p.point.from}</b> → <b>${p.point.to}</b><br/>${p.point.weight} booking${p.point.weight === 1 ? "" : "s"} · ${p.point.name ?? ""}`;
        },
      },
      series: [
        {
          type: "sankey",
          name: "Bookings",
          keys: ["from", "to", "weight"],
          data,
          nodeWidth: 14,
          nodePadding: 14,
          curveFactor: 0.5,
          linkOpacity: 0.35,
          colorByPoint: false,
          dataLabels: { style: { color: NAVY, textOutline: "none", fontWeight: "600", fontSize: "11px" } },
          nodes: [],
          states: { hover: { linkOpacity: 0.7 }, inactive: { opacity: 0.2 } },
        } as Highcharts.SeriesSankeyOptions,
      ],
    };
  }, [flows]);

  /* ---- Fleet movement: daily columns + running total spline ---- */
  const movementOptions = useMemo<Highcharts.Options>(() => {
    const labels = movement.map((p) => p.label);
    const daily = movement.map((p, i) =>
      Math.max(Math.round((p.distanceKm - (movement[i - 1]?.distanceKm ?? 0)) * 10) / 10, 0),
    );
    return {
      ...base,
      chart: { ...base.chart, height: 300 },
      xAxis: { ...base.xAxis, categories: labels, crosshair: true },
      yAxis: [
        { ...base.yAxis, title: { text: "Daily km", style: { color: MUTED, fontSize: "10px" } } },
        { ...base.yAxis, opposite: true, gridLineWidth: 0, title: { text: "Running km", style: { color: "#b08a00", fontSize: "10px" } } },
      ] as Highcharts.YAxisOptions[],
      tooltip: { ...base.tooltip, shared: true, valueSuffix: " km" },
      plotOptions: { column: { borderRadius: 6, borderWidth: 0, maxPointWidth: 38 } },
      series: [
        { type: "column", name: "Daily distance", data: daily, color: BLUE, yAxis: 0 },
        {
          type: "areaspline",
          name: "Running total",
          data: movement.map((p) => p.distanceKm),
          color: YELLOW,
          yAxis: 1,
          lineWidth: 3,
          fillOpacity: 0.15,
          marker: { enabled: false, states: { hover: { enabled: true, radius: 5 } } },
        },
      ],
    };
  }, [movement]);

  /* ---- Event volume ---- */
  const eventOptions = useMemo<Highcharts.Options>(() => {
    const peak = dailyCounts.reduce((m, d) => Math.max(m, d.count), 0);
    return {
      ...base,
      chart: { ...base.chart, height: 300 },
      legend: { enabled: false },
      xAxis: {
        ...base.xAxis,
        categories: dailyCounts.map((d) =>
          new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        ),
      },
      yAxis: { ...base.yAxis, allowDecimals: false },
      tooltip: { ...base.tooltip, headerFormat: "<span style='font-size:10px;opacity:.7'>{point.key}</span><br/>", pointFormat: "<b>{point.y}</b> events" },
      plotOptions: { column: { borderRadius: 6, borderWidth: 0, maxPointWidth: 34 } },
      series: [
        {
          type: "column",
          name: "Events",
          data: dailyCounts.map((d) => ({ y: d.count, color: d.count === peak && peak > 0 ? YELLOW : BLUE })),
        },
      ],
    };
  }, [dailyCounts]);

  const hasMovement = movement.length >= 2;

  return (
    <section aria-labelledby="analytics-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2678b9]">Performance</p>
          <h2 id="analytics-title" className="mt-0.5 text-lg font-bold tracking-tight text-[#0b2341]">Fleet analytics</h2>
        </div>
        <p className="text-xs text-slate-500">Routes, regional coverage, distance, and dispatch activity.</p>
      </div>

      <div className="grid items-start gap-4 2xl:grid-cols-2">
        <div className="space-y-4">
          <Panel title="Warehouse to store flow" hint="Booking volume · colour shows trip status">
            {isLoading ? (
              <Empty text="Loading flow data…" height={320} />
            ) : flowOptions ? (
              <Chart options={flowOptions} />
            ) : (
              <Empty text="Flow appears once bookings with a warehouse and store are available." height={320} />
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              {Object.entries(STATUS_COLOR).map(([name, color]) => (
                <span key={name} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  {name}
                </span>
              ))}
            </div>
          </Panel>

          <Panel title="Fleet movement" hint="GPS distance, last 7 active days">
            {isLoading ? (
              <Empty text="Loading route history…" height={300} />
            ) : hasMovement ? (
              <Chart options={movementOptions} />
            ) : (
              <Empty text="Appears after trips record more than one GPS location." height={300} />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <RegionComparison
            trips={regionTrips}
            unlocated={unlocatedTrips}
            isLoading={isLoading}
            compact
          />

          <Panel title="Dispatch activity" hint="Trip events per day · yellow is the peak">
            {isLoading ? (
              <Empty text="Loading events…" height={300} />
            ) : dailyCounts.length ? (
              <Chart options={eventOptions} />
            ) : (
              <Empty text="No trip events recorded." height={300} />
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}