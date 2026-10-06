// src/components/admin/RegionComparison.tsx
import { useMemo } from "react";
import Highcharts from "highcharts";
import "highcharts/modules/map";
import { HighchartsReact } from "highcharts-react-official";
import { surface } from "./dashboardStyles";
import type { Region } from "./regionLocation";
import philippinesBoundary from "../../assets/philippines-boundary.geojson?raw";

export type RegionTrip = {
  id: string;
  name: string;
  region: Region;
  status: "Completed" | "Delayed" | "In Progress" | "Other";
  point: [number, number] | null;
  route?: [number, number][];
  km: number;
};

const PHILIPPINES_MAP = JSON.parse(philippinesBoundary) as Highcharts.GeoJSON;

const REGIONS: { name: Region; color: string; anchor: [number, number] }[] = [
  { name: "Luzon", color: "#0b2341", anchor: [16.2, 121.0] },
  { name: "Visayas", color: "#8b5cf6", anchor: [11.0, 123.8] },
  { name: "Mindanao", color: "#f2c200", anchor: [7.6, 125.2] },
];

const STATUS_COLOR: Record<RegionTrip["status"], string> = {
  Completed: "#10b981",
  "In Progress": "#2678b9",
  Delayed: "#f59e0b",
  Other: "#cbd5e1",
};

export default function RegionComparison({
  trips,
  unlocated,
  isLoading,
  compact = false,
}: {
  trips: RegionTrip[];
  unlocated: number;
  isLoading: boolean;
  compact?: boolean;
}) {
  const stats = useMemo(
    () =>
      REGIONS.map((r) => {
        const mine = trips.filter((t) => t.region === r.name);
        const count = (s: RegionTrip["status"]) => mine.filter((t) => t.status === s).length;
        return {
          ...r,
          total: mine.length,
          inProgress: count("In Progress"),
          completed: count("Completed"),
          delayed: count("Delayed"),
          other: count("Other"),
          km: Math.round(mine.reduce((sum, t) => sum + t.km, 0)),
        };
      }),
    [trips],
  );
  const placed = trips.length;
  const routeCount = trips.filter((trip) => (trip.route?.length ?? 0) > 1).length;
  const leader = [...stats].sort((a, b) => b.total - a.total)[0];
  const mapOptions = useMemo<Highcharts.Options>(() => {
    const routeData = trips.flatMap((trip) => {
      const route = trip.route ?? [];
      if (route.length < 2) return [];
      return [{
        name: `${trip.name} · ${trip.status}`,
        color: STATUS_COLOR[trip.status],
        geometry: {
          type: "LineString",
          coordinates: route.map(([lat, lon]) => [lon, lat]),
        },
      }];
    });
    const regionPoints = stats.map((region) => ({
      lon: region.anchor[1],
      lat: region.anchor[0],
      name: `${region.name} · ${region.total}`,
      color: region.color,
    }));
    const tripPoints = trips.flatMap((trip) =>
      trip.point
        ? [{
            lon: trip.point[1],
            lat: trip.point[0],
            name: `${trip.name} · ${trip.status}`,
            color: STATUS_COLOR[trip.status],
          }]
        : [],
    );

    return {
      chart: {
        map: PHILIPPINES_MAP,
        backgroundColor: "#dcecf0",
        height: compact ? 250 : 360,
        spacing: [8, 8, 8, 8],
        style: { fontFamily: "inherit" },
      },
      title: { text: undefined },
      credits: { enabled: false },
      accessibility: { enabled: true },
      legend: { enabled: false },
      tooltip: {
        backgroundColor: "#0b2341",
        borderWidth: 0,
        borderRadius: 10,
        style: { color: "#fff", fontSize: "11px" },
        pointFormat: "<b>{point.name}</b>",
      },
      mapNavigation: {
        enabled: true,
        enableMouseWheelZoom: false,
        buttonOptions: {
          verticalAlign: "top",
          alignTo: "plotBox",
          theme: {
            fill: "#fff",
            stroke: "#cbd5e1",
            r: 8,
            style: { color: "#0b2341", fontWeight: "600" },
          },
        },
      },
      mapView: {
        padding: [8, 8, 8, 8],
        projection: { name: "EqualEarth" },
      },
      series: [
        {
          type: "map",
          name: "Philippines",
          mapData: PHILIPPINES_MAP,
          data: [],
          allAreas: true,
          nullColor: "#f8fbff",
          borderColor: "#9bb4c7",
          borderWidth: 0.55,
          enableMouseTracking: false,
          states: { hover: { enabled: false } },
          zIndex: 0,
        },
        {
          type: "mapline",
          name: "GPS route",
          data: routeData,
          lineWidth: 3,
          opacity: 0.65,
          className: "ph-map-route-base",
          enableMouseTracking: false,
          zIndex: 2,
        },
        {
          type: "mapline",
          name: "Animated route",
          data: routeData,
          lineWidth: 2,
          color: "#ffffff",
          className: "ph-map-route-pulse",
          zIndex: 3,
        },
        {
          type: "mappoint",
          name: "Regions",
          data: regionPoints,
          marker: {
            radius: 12,
            lineWidth: 2,
            lineColor: "#fff",
            fillOpacity: 0.82,
          },
          dataLabels: {
            enabled: true,
            format: "{point.name}",
            allowOverlap: true,
            crop: false,
            overflow: "allow",
            style: {
              color: "#0b2341",
              fontSize: "9px",
              fontWeight: "700",
              textOutline: "none",
            },
            y: -21,
          },
          enableMouseTracking: false,
          zIndex: 4,
        },
        {
          type: "mappoint",
          name: "Latest GPS fixes",
          data: tripPoints,
          marker: {
            radius: 5,
            lineWidth: 2,
            lineColor: "#fff",
          },
          zIndex: 5,
        },
      ],
    };
  }, [compact, stats, trips]);

  return (
    <section className={`${surface.card} min-w-0 border border-slate-200/70 p-5 shadow-[0_8px_28px_-20px_rgba(11,35,65,0.25)]`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-[#0b2341]">Regional comparison</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Animated recorded GPS routes and regional coverage
          </p>
        </div>
        <span className="rounded-full bg-[#f2f6fa] px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {placed} located · {routeCount} routes
        </span>
      </div>

      {isLoading ? (
        <p
          className="flex items-center justify-center text-sm text-slate-400"
          style={{ minHeight: compact ? 280 : 340 }}
        >
          Loading regions…
        </p>
      ) : (
        <div
          className={`grid gap-4 ${
            compact
              ? "xl:grid-cols-1"
              : "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
          }`}
        >
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-[#dcecf0]">
            <HighchartsReact
              highcharts={Highcharts}
              constructorType="mapChart"
              options={mapOptions}
            />
            {placed === 0 && (
              <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-sm text-slate-700 shadow-sm">
                No trips could be placed in a region yet.
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col justify-between gap-3">
            <ul
              className={
                compact
                  ? "grid gap-x-5 gap-y-3 sm:grid-cols-3 xl:grid-cols-1"
                  : "space-y-4"
              }
            >
              {stats.map((r) => {
                const share = placed > 0 ? Math.round((r.total / placed) * 100) : 0;
                const parts: [string, number, string][] = [
                  ["Completed", r.completed, STATUS_COLOR.Completed],
                  ["In transit", r.inProgress, STATUS_COLOR["In Progress"]],
                  ["Delayed", r.delayed, STATUS_COLOR.Delayed],
                  ["Other", r.other, STATUS_COLOR.Other],
                ];
                return (
                  <li key={r.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b2341]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                      <span className="text-sm tabular-nums text-slate-500">
                        <b className="text-[18px] text-[#0b2341]">{r.total}</b> trips · {share}%
                      </span>
                    </div>
                    <div
                      className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-[#e3eaf2]"
                      role="img"
                      aria-label={`${r.name}: ${parts.map(([l, n]) => `${n} ${l.toLowerCase()}`).join(", ")}`}
                    >
                      {r.total > 0 &&
                        parts.map(([label, n, color]) => (
                          <span key={label} className="h-full" style={{ width: `${(n / r.total) * 100}%`, backgroundColor: color }} />
                        ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {r.inProgress} in transit · {r.completed} completed · {r.delayed} delayed · {r.km.toLocaleString()} km driven
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(Object.entries(STATUS_COLOR) as [string, string][]).map(([name, color]) => (
                  <span key={name} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {name === "In Progress" ? "In transit" : name}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                Map boundary: geoBoundaries · OCHA Philippines / NAMRIA · CC BY 3.0 IGO
              </p>
              {placed > 0 && leader.total > 0 && (
                <p>
                  {leader.name} has the most trips in this view
                  {unlocated > 0 ? `; ${unlocated} trip${unlocated === 1 ? "" : "s"} without a location are not counted.` : "."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}