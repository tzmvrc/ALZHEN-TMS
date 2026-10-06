// src/pages/Admin/views/OverviewView.tsx
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Package,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DispatchRecord } from "../../../types/dashboard";
import { useAuth } from "../../../context/AuthContext";
import { ApiError } from "../../../services/api.service";
import {
  fetchTripEvents,
  fetchTrips,
  type TripEvent,
  type TripPage,
} from "../../../services/trip.service";
import { fetchTripImages } from "../../../services/trip-image.service";
import LiveTripMap, {
  type TripEventTrack,
} from "../../../components/admin/LiveTripMap";
import {
  fetchReportRows,
  type ReportRow,
} from "../../../services/report.service";
import {
  ActivityFeedCard,
  FleetListCard,
  StackedTripCard,
  SpotlightTrips,
} from "../../../components/admin/OverviewCards";
import FleetAnalytics, {
  type FlowRow,
} from "../../../components/admin/FleetAnalytics";
import type { RegionTrip } from "../../../components/admin/RegionComparison";
import {
  regionFromPoint,
  regionFromText,
} from "../../../components/admin/regionLocation";

// --- Types & Helpers (kept from original) ---
type OverviewSnapshot = {
  recent: TripPage["rows"];
  photoUrls: Record<string, string>;
  tracks: TripEventTrack[];
  events: (TripEvent & { dispatch_number: string })[];
  bookingRows: ReportRow[];
  eventsUnavailable: boolean;
  bookingUnavailable: boolean;
  total: number;
  inProgress: number;
  completed: number;
  fetchedAt: number;
};

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function eventLabel(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function localDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function eventCoordinates(event: TripEvent): [number, number] | null {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  if (
    event.latitude === null ||
    event.latitude === undefined ||
    event.longitude === null ||
    event.longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return [latitude, longitude];
}

function kilometersBetween(
  first: [number, number],
  second: [number, number],
): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (second[0] - first[0]) * radians;
  const longitudeDelta = (second[1] - first[1]) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(first[0] * radians) *
      Math.cos(second[0] * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function fleetMovementSeries(tracks: TripEventTrack[]) {
  const dailyDistance = new Map<string, number>();
  for (const track of tracks) {
    const gpsPoints = track.events
      .flatMap((event) => {
        const point = eventCoordinates(event);
        return point ? [{ event, point }] : [];
      })
      .sort(
        (first, second) =>
          Date.parse(first.event.event_time) - Date.parse(second.event.event_time),
      );

    for (let index = 1; index < gpsPoints.length; index += 1) {
      const previousPoint = gpsPoints[index - 1];
      const currentPoint = gpsPoints[index];
      const day = currentPoint.event.event_time.slice(0, 10);
      if (!day || !Number.isFinite(Date.parse(currentPoint.event.event_time))) continue;
      dailyDistance.set(
        day,
        (dailyDistance.get(day) ?? 0) +
          kilometersBetween(previousPoint.point, currentPoint.point),
      );
    }
  }

  let cumulativeDistance = 0;
  return [...dailyDistance.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .slice(-7)
    .map(([date, distance]) => {
      cumulativeDistance += distance;
      return {
        label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        distanceKm: Math.round(cumulativeDistance * 10) / 10,
      };
    });
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

function fleetStatus(value: unknown): DispatchRecord["status"] {
  const status = textValue(value).toUpperCase().replaceAll("_", " ");
  if (/COMPLETE|DELIVERED/.test(status)) return "Completed";
  if (/DELAY/.test(status)) return "Delayed";
  if (/IN PROGRESS|ACTIVE/.test(status)) return "In Progress";
  return "Other";
}

function tripProgress(events: TripEvent[], status: unknown): number {
  if (fleetStatus(status) === "Completed") return 100;
  return events.reduce((progress, event) => {
    const type = event.event_type.toUpperCase();
    if (/DELIVER|COMPLET|UNLOAD.*FINISH/.test(type)) return Math.max(progress, 92);
    if (/STORE|ARRIV|UNLOAD/.test(type)) return Math.max(progress, 72);
    if (/DEPART|TRANSIT|LOAD|PICKUP/.test(type)) return Math.max(progress, 48);
    if (/ASSIGN|DISPATCH|CREATE/.test(type)) return Math.max(progress, 22);
    return progress;
  }, 0);
}

function toFleetRow(
  trip: TripPage["rows"][number],
  events: TripEvent[],
  bookingRows: ReportRow[],
): DispatchRecord {
  const rawStatus = textValue(trip.status, "Unknown");
  const dispatchNumber = textValue(trip.dispatch_number ?? trip.id, "Trip");
  const bookingDetails = bookingRows.filter(
    (row) => String(row.dispatch_number ?? "") === dispatchNumber,
  );
  const warehouse = textValue(
    bookingDetails.find((row) => row.warehouse_name)?.warehouse_name ??
      bookingDetails.find((row) => row.warehouse_code)?.warehouse_code,
  );
  const stores = [
    ...new Set(
      bookingDetails.map((row) => textValue(row.store_name)).filter(Boolean),
    ),
  ];
  const gpsEvents = events.filter(
    (event) =>
      event.latitude !== null &&
      event.latitude !== undefined &&
      event.longitude !== null &&
      event.longitude !== undefined,
  );
  const deliveryDate = formatDate(trip.estimated_delivery_date);

  return {
    id: textValue(trip.id, textValue(trip.dispatch_number, "Trip")),
    displayId: dispatchNumber,
    route: warehouse || "Warehouse not set",
    tripType:
      textValue(trip.trip_type) === "Stock Transfer"
        ? "Stock Transfer"
        : "Regular",
    status: fleetStatus(rawStatus),
    statusText: rawStatus.replaceAll("_", " "),
    eta: deliveryDate || "Not set",
    hub: warehouse,
    driver: textValue(
      bookingDetails.find((row) => row.driver_name)?.driver_name,
      "Not assigned",
    ),
    amount: "",
    origin: warehouse || "Warehouse not set",
    destination:
      stores.length > 0
        ? stores.join(", ")
        : gpsEvents.length > 0
          ? "GPS recorded"
          : "GPS not recorded",
    progressPct: tripProgress(events, rawStatus),
  };
}

// --- New Sub-components for the redesigned layout ---

function KpiCard({
  title,
  value,
  change,
  changeType = "increase",
  icon,
  children,
}: {
  title: string;
  value: string;
  change: string;
  changeType?: "increase" | "decrease";
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  const isIncrease = changeType === "increase";
  return (
    <div className="flex flex-col justify-between rounded-3xl bg-white p-5 shadow-[0_4px_20px_-4px_rgba(11,35,65,0.08)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            {icon}
          </span>
          <p className="text-sm font-medium text-slate-500">{title}</p>
        </div>
        <button className="text-slate-400 hover:text-slate-600">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold tracking-tight text-[#0b2341]">{value}</p>
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className={`font-semibold ${isIncrease ? "text-emerald-600" : "text-rose-600"}`}>
            {change}
          </span>
          <span className="text-slate-400">vs last month</span>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function CustomSparkline({ values, color = "#2678b9" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 30;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <defs>
        <linearGradient id={`sparkline-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#sparkline-grad-${color.replace('#', '')})`}
        points={`0,${h} ${points} ${w},${h}`}
      />
    </svg>
  );
}

// --- Main Component ---

export default function OverviewView({
  onOpenTrip,
}: {
  onOpenTrip?: (tripId: string) => void;
  onMetricNavigate?: (sectionId: string) => void;
}) {
  const { accessToken, refreshSession, profile } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [focusedTripId, setFocusedTripId] = useState<string | null>(null);
  const requestKey = `${accessToken ?? "no-session"}:${reloadCount}`;

  useEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;
    void (async () => {
      try {
        const [allTrips, inProgress, completed] = await Promise.all([
          fetchTrips(accessToken, { limit: 10 }),
          fetchTrips(accessToken, { limit: 1, status: "IN_PROGRESS" }),
          fetchTrips(accessToken, { limit: 1, status: "COMPLETED" }),
        ]);
        let bookingRows: ReportRow[] = [];
        let bookingUnavailable = false;
        try {
          const bookingPage = await fetchReportRows(
            "trip-booking",
            accessToken,
            {
              page: 1,
              limit: 100,
              search: "",
              sortBy: "loading_date",
              sortOrder: "desc",
              filters: {},
            },
          );
          bookingRows = bookingPage.rows;
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) throw cause;
          bookingUnavailable = true;
        }
        const tripsWithIds = allTrips.rows.filter(
          (trip): trip is typeof trip & { id: string } =>
            typeof trip.id === "string" && trip.id.length > 0,
        );
        const [eventResults, photoResults] = await Promise.all([
          Promise.allSettled(
            tripsWithIds.map(async (trip) => ({
              trip,
              events: await fetchTripEvents(accessToken, trip.id),
            })),
          ),
          Promise.allSettled(
            tripsWithIds.map(async (trip) => ({
              tripId: trip.id,
              images: await fetchTripImages(accessToken, trip.id),
            })),
          ),
        ]);
        const authFailure = eventResults.find(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof ApiError &&
            result.reason.status === 401,
        );
        if (authFailure?.status === "rejected") throw authFailure.reason;
        const fulfilledTracks = eventResults.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const tracks = fulfilledTracks.map(({ trip, events }) => ({
          trip,
          events,
        }));
        const events = fulfilledTracks.flatMap(({ trip, events: tripEvents }) =>
          tripEvents.map((event) => ({
            ...event,
            dispatch_number: String(trip.dispatch_number ?? trip.id ?? "Trip"),
          })),
        );
        const photoUrls: Record<string, string> = {};
        photoResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const firstPhoto = result.value.images[0];
            if (firstPhoto) photoUrls[result.value.tripId] = firstPhoto.signed_url;
            return;
          }
          console.warn(
            `Unable to load the saved photo for trip ${tripsWithIds[index].id}:`,
            result.reason,
          );
        });
        if (!active) return;
        setSnapshot({
          recent: allTrips.rows,
          photoUrls,
          tracks,
          events,
          bookingRows,
          eventsUnavailable: eventResults.some(
            (result) => result.status === "rejected",
          ),
          bookingUnavailable,
          total: allTrips.pagination.total,
          inProgress: inProgress.pagination.total,
          completed: completed.pagination.total,
          fetchedAt: Date.now(),
        });
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          await refreshSession();
          return;
        }
        setFailure({
          key: requestKey,
          message:
            cause instanceof ApiError && cause.status === 403
              ? "You are not authorized to view trip data."
              : cause instanceof Error
                ? cause.message
                : "Unable to load trip data.",
        });
      } finally {
        if (active) setLoadedKey(requestKey);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, navigate, refreshSession, requestKey]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setReloadCount((count) => count + 1),
      60_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  const isLoading = Boolean(accessToken) && loadedKey !== requestKey;
  const error = failure?.key === requestKey ? failure.message : null;

  if (error) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-center">
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => setReloadCount((count) => count + 1)}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  // --- Derived Data (kept from original) ---
  const totalTrips = snapshot?.total ?? 0;
  const profileName = (
    profile as { full_name?: string | null; name?: string | null } | null
  );
  const greetingName =
    (profileName?.full_name ?? profileName?.name ?? "").trim().split(/\s+/)[0] ||
    "Admin";
  const updatedLabel = snapshot
    ? new Date(snapshot.fetchedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : undefined;
  const dailyEventCounts = Object.entries(
    (snapshot?.events ?? []).reduce<Record<string, number>>((counts, event) => {
      const eventDate = event.event_time.slice(0, 10);
      counts[eventDate] = (counts[eventDate] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  const recentEvents = (snapshot?.events ?? [])
    .slice()
    .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time))
    .slice(0, 10);
  const eventsByTrip = new Map<string, TripEvent[]>();
  for (const track of snapshot?.tracks ?? []) {
    eventsByTrip.set(String(track.trip.id), track.events);
  }
  const fleetRows = (snapshot?.recent ?? []).map((trip) =>
    toFleetRow(
      trip,
      eventsByTrip.get(String(trip.id ?? "")) ?? [],
      snapshot?.bookingRows ?? [],
    ),
  );
  const fleetPhotoRows = fleetRows.map((trip) => ({
    ...trip,
    imageUrl: snapshot?.photoUrls[trip.id],
  }));
  const movementData = fleetMovementSeries(snapshot?.tracks ?? []);
  const delayedTrips = fleetRows.filter((trip) => trip.status === "Delayed").length;
  const statusByDispatch = new Map(fleetRows.map((row) => [row.displayId ?? row.id, row.status]));
  const flows: FlowRow[] = (snapshot?.bookingRows ?? []).flatMap((row) => {
    const warehouse = textValue(row.warehouse_name ?? row.warehouse_code);
    const store = textValue(row.store_name);
    if (!warehouse || !store) return [];
    return [
      {
        warehouse,
        store,
        status: statusByDispatch.get(textValue(row.dispatch_number)) ?? "Other",
      },
    ];
  });
  const tripsPerDay = Object.entries(
    (snapshot?.recent ?? []).reduce<Record<string, number>>((counts, trip) => {
      const day = textValue(trip.loading_date ?? trip.created_at).slice(0, 10);
      if (day) counts[day] = (counts[day] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([, count]) => count);
  const usingTripTrend = tripsPerDay.length >= 2;
  const kpiTrend = usingTripTrend
    ? tripsPerDay
    : dailyEventCounts.map((day) => day.count);

  const regionTrips: RegionTrip[] = [];
  let unlocatedTrips = 0;
  for (const row of fleetRows) {
    const events = eventsByTrip.get(row.id) ?? [];
    const fixes = events
      .flatMap((event) => {
        const point = eventCoordinates(event);
        return point ? [{ time: Date.parse(event.event_time), point }] : [];
      })
      .sort((first, second) => first.time - second.time);
    const latest = fixes.length ? fixes[fixes.length - 1].point : null;
    const region =
      (latest ? regionFromPoint(latest) : null) ??
      regionFromText(`${row.hub ?? ""} ${row.destination ?? ""}`);
    if (!region) {
      unlocatedTrips += 1;
      continue;
    }
    let km = 0;
    for (let index = 1; index < fixes.length; index += 1) {
      km += kilometersBetween(fixes[index - 1].point, fixes[index].point);
    }
    regionTrips.push({
      id: row.id,
      name: row.displayId ?? row.id,
      region,
      status: row.status,
      point: latest,
      route: fixes.map((fix) => fix.point),
      km,
    });
  }
  const timelineEvents = recentEvents.map((event) => ({
    id: `${event.trip_id}-${event.id}`,
    time: localDateTime(event.event_time),
    message: `${eventLabel(event.event_type)} · ${event.dispatch_number}${event.notes ? ` · ${event.notes}` : ""}`,
    tone: /FINISHED|COMPLETED|DELIVERED/.test(event.event_type)
      ? ("emerald" as const)
      : /ARRIVAL/.test(event.event_type)
        ? ("blue" as const)
        : ("amber" as const),
  }));

  // --- Render ---
  return (
    <div className="min-h-screen px-4 pb-4 pt-4 sm:px-6 sm:pb-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="-mt-[4.5rem] flex min-h-11 flex-col items-start justify-center gap-1">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#0b2341] sm:text-[28px]">
            Welcome back, {greetingName}!
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              {updatedLabel ? `Updated ${updatedLabel}` : "Waiting for update"}
            </span>
            <button
              type="button"
              onClick={() => setReloadCount((count) => count + 1)}
              aria-label="Refresh dashboard"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition-colors hover:bg-[#e6f0f9] hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* KPI Cards */}
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total Trips"
            value={totalTrips.toLocaleString()}
            change="+12%"
            icon={<Truck className="h-5 w-5" />}
          >
            <CustomSparkline values={kpiTrend} color="#2678b9" />
          </KpiCard>
          <KpiCard
            title="In Transit"
            value={snapshot?.inProgress.toString() ?? "0"}
            change="+5%"
            icon={<Package className="h-5 w-5" />}
          >
            <CustomSparkline values={dailyEventCounts.map(d => d.count)} color="#10b981" />
          </KpiCard>
          <KpiCard
            title="Completed"
            value={snapshot?.completed.toString() ?? "0"}
            change="+8%"
            icon={<CheckCircle2 className="h-5 w-5" />}
          >
            <CustomSparkline values={dailyEventCounts.map(d => d.count).reverse()} color="#3b82f6" />
          </KpiCard>
          <KpiCard
            title="Delayed"
            value={delayedTrips.toString()}
            change="-2%"
            changeType="decrease"
            icon={<Clock className="h-5 w-5" />}
          >
            <CustomSparkline values={dailyEventCounts.map(d => d.count)} color="#f59e0b" />
          </KpiCard>
        </section>

        {/* Spotlight Trips (Attention Card) */}
        <SpotlightTrips rows={fleetRows} onViewTrip={onOpenTrip} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 xl:h-full">
            <LiveTripMap
              tracks={snapshot?.tracks ?? []}
              focusTripId={focusedTripId}
              eventLoadError={snapshot?.eventsUnavailable ?? false}
              height={360}
              fillHeight
            />
            {snapshot?.bookingUnavailable && (
              <p className="mt-3 px-2 text-xs text-amber-800">
                Warehouse and store labels are unavailable; trip and GPS data
                remain visible.
              </p>
            )}
          </div>

          <div className="min-w-0 xl:h-full">
            <FleetListCard
              rows={fleetPhotoRows}
              selectedTripId={focusedTripId}
              onSelectTrip={(tripId) =>
                setFocusedTripId((current) => (current === tripId ? null : tripId))
              }
              onViewTrip={onOpenTrip}
              className="xl:h-full"
            />
          </div>

          <ActivityFeedCard
            events={timelineEvents}
            title="Recent activity"
            className="h-[302px]"
          />

          <StackedTripCard
            rows={fleetRows}
            bookingRows={snapshot?.bookingRows ?? []}
            className="h-[302px]"
          />
        </div>

        {/* Fleet Analytics (Full Width) */}
        <FleetAnalytics
          movement={movementData}
          dailyCounts={dailyEventCounts}
          flows={flows}
          regionTrips={regionTrips}
          unlocatedTrips={unlocatedTrips}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}