// src/pages/Admin/views/OverviewView.tsx
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Package,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRequests } from "../../../components/admin/requestsStore";
import type { DispatchRecord } from "../../../types/dashboard";
import { useAuth } from "../../../context/AuthContext";
import { ApiError } from "../../../services/api.service";
import { fetchTripEvents, fetchTrips, type TripEvent, type TripPage } from "../../../services/trip.service";
import { fetchTripImages } from "../../../services/trip-image.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import LiveTripMap, {
  type TripEventTrack,
  type TripLocationRoute,
} from "../../../components/admin/LiveTripMap";
import {
  fetchReportPage,
  type ReportRow,
} from "../../../services/report.service";
import {
  ActivityFeedCard,
  FleetListCard,
  PendingRequestsCard,
  SpotlightTrips,
  TripStatusRing,
} from "../../../components/admin/OverviewCards";
import FleetAnalytics, {
  type FlowRow,
} from "../../../components/admin/FleetAnalytics";
import OverviewCalendarCard from "../../../components/admin/OverviewCalendarCard";
import PayablesMiniTable from "../../../components/admin/PayablesMiniTable";
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

function isActiveTrip(trip: TripPage["rows"][number]): boolean {
  return !trip.archived_at && !/COMPLETE|DELIVER|CANCEL|VOID|ARCHIV/.test(
    textValue(trip.status).toUpperCase(),
  );
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
    (row) => textValue(row.trip_id ?? row._trip_id) === textValue(trip.id) ||
      String(row.dispatch_number ?? "") === dispatchNumber,
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

/** Tiny bar chart: the last bar (today) is the navy accent. */
function MiniBars({ values }: { values: number[] }) {
  const recent = values.slice(-6);
  const padded = [...Array(6 - recent.length).fill(0), ...recent] as number[];
  const max = Math.max(...padded, 1);
  return (
    <div aria-hidden="true" className="flex h-11 w-[4.25rem] items-end justify-between gap-1">
      {padded.map((value, index) => (
        <span
          key={index}
          className={`w-2 rounded-full ${index === padded.length - 1 ? "bg-[#0b2341]" : "bg-[#d3deec]"}`}
          style={{ height: `${Math.max((value / max) * 100, 14)}%` }}
        />
      ))}
    </div>
  );
}

/** Tiny ring showing a share of all trips. */
function MiniRing({ percent, color = "#0b2341" }: { percent: number; color?: string }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <svg aria-hidden="true" viewBox="0 0 44 44" className="h-11 w-11">
      <circle cx="22" cy="22" r={radius} fill="none" stroke="#e8edf3" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

/** Stat card: navy icon circle, big figure, quiet note and a tiny chart on the right. */
function KpiCard({
  title,
  value,
  note,
  icon,
  chart,
  alert = false,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  chart: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5 rounded-[28px] bg-white px-5 py-4 ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(11,35,65,0.03)]">
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-white [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-slate-500">{title}</p>
        <p className="mt-0.5 text-[30px] font-semibold leading-none tracking-tight tabular-nums text-[#0b2341]">
          {value}
        </p>
        <p className={`mt-1 truncate text-[11px] ${alert ? "font-medium text-amber-600" : "text-slate-400"}`}>{note}</p>
      </div>
      <div className="shrink-0">{chart}</div>
    </div>
  );
}

// --- Main Component ---

function OverviewSkeleton() {
  const block = "animate-pulse rounded-2xl bg-slate-200/80";
  return (
    <div aria-label="Loading operations overview" aria-busy="true" className="w-full space-y-4">
      <header className="flex min-h-[3.5rem] items-start justify-between">
        <div className="space-y-2">
          <div className={`${block} h-8 w-64 max-w-[70vw]`} />
          <div className={`${block} h-4 w-40`} />
        </div>
        <div className={`${block} h-8 w-8 rounded-full`} />
      </header>
      <section aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[126px] rounded-2xl border border-slate-200 bg-white p-4"><div className={`${block} h-3 w-24`} /><div className={`${block} mt-4 h-8 w-20`} /><div className={`${block} mt-3 h-3 w-32`} /></div>)}
      </section>
      <div aria-hidden="true" className={`${block} h-[116px] w-full`} />
      <section aria-hidden="true" className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:grid-rows-[340px_430px]">
        <div className={`${block} min-h-[260px] xl:col-span-3`} />
        <div className={`${block} min-h-[260px] xl:col-span-5`} />
        <div className={`${block} min-h-[360px] xl:col-span-4 xl:row-span-2`} />
        <div className={`${block} min-h-[300px] xl:col-span-3`} />
        <div className={`${block} min-h-[300px] xl:col-span-5`} />
      </section>
      <div aria-hidden="true" className={`${block} min-h-[360px] w-full`} />
      <section aria-hidden="true" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className={`${block} min-h-[300px] xl:col-span-7`} />
        <div className={`${block} min-h-[300px] xl:col-span-5`} />
      </section>
      <span className="sr-only">Loading dashboard data</span>
    </div>
  );
}

export default function OverviewView({
  onOpenTrip,
  onMetricNavigate,
  active = true,
}: {
  onOpenTrip?: (tripId: string) => void;
  onMetricNavigate?: (sectionId: string) => void;
  active?: boolean;
  /** Still accepted so existing callers compile; the page shell now handles the sidebar offset. */
  sidebarExpanded?: boolean;
}) {
  const { accessToken, refreshSession, profile } = useAuth();
  const navigate = useNavigate();
  const { pending: pendingRequests, select: selectRequest } = useRequests();
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [focusedTripId, setFocusedTripId] = useState<string | null>(null);
  const inactiveChanges = useRef(false);
  const requestKey = `${accessToken ?? "no-session"}:${reloadCount}`;

  useEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;
    void (async () => {
      try {
        const firstPage = await fetchTrips(accessToken, { limit: 100, archiveScope: "active" });
        const allTrips = { ...firstPage, rows: [...firstPage.rows] };
        for (let page = 2; page <= allTrips.pagination.totalPages; page += 1) {
          const next = await fetchTrips(accessToken, { limit: 100, page, archiveScope: "active" });
          allTrips.rows.push(...next.rows);
        }
        let bookingRows: ReportRow[] = [];
        let bookingUnavailable = false;
        try {
          const bookingOptions = {
            page: 1,
            limit: 500,
            search: "",
            sortBy: "loading_date",
            sortOrder: "desc" as const,
            filters: { active_transactions: "true", archive_scope: "active" },
          };
          const bookingPage = await fetchReportPage(
            "dispatch-monitoring",
            accessToken,
            bookingOptions,
          );
          bookingRows = [...bookingPage.rows];
          for (let page = 2; page <= bookingPage.pagination.totalPages; page += 1) {
            const next = await fetchReportPage("dispatch-monitoring", accessToken, { ...bookingOptions, page });
            bookingRows.push(...next.rows);
          }
          const visibleTripIds = new Set(allTrips.rows.map((trip) => textValue(trip.id)));
          bookingRows = bookingRows.filter((row) => visibleTripIds.has(textValue(row.trip_id ?? row._trip_id)));
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) throw cause;
          bookingUnavailable = true;
        }
        const tripsWithIds = allTrips.rows.filter(
          (trip): trip is typeof trip & { id: string } =>
            typeof trip.id === "string" && trip.id.length > 0,
        );
        const activeStopIds = new Set(bookingRows.map((row) => textValue(row.trip_stop_id ?? row._trip_stop_id)).filter(Boolean));
        const [eventResults, photoResults] = await Promise.all([
          Promise.allSettled(
            tripsWithIds.map(async (trip) => ({
              trip,
              events: (await fetchTripEvents(accessToken, trip.id)).filter(
                (event) => !event.trip_stop_id || (!bookingUnavailable && activeStopIds.has(event.trip_stop_id)),
              ),
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
          inProgress: allTrips.rows.filter((trip) => trip.status === "IN_PROGRESS").length,
          completed: allTrips.rows.filter((trip) => fleetStatus(trip.status) === "Completed").length,
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
    if (!accessToken) return;
    const tripIds = (snapshot?.recent ?? []).flatMap((trip) =>
      typeof trip.id === "string" && trip.id.length > 0 ? [trip.id] : [],
    );
    const tripIdSet = new Set(tripIds);
    let reloadTimer: number | null = null;
    const scheduleReload = () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        setReloadCount((count) => count + 1);
      }, 250);
    };
    const relevant = (table: string, payload?: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      if (["trips", "trip_stops", "warehouses", "customer_stores", "trip_truck_assignments"].includes(table)) return true;
      if (table !== "trip_events" && table !== "trip_images") return false;
      return [payload?.new?.trip_id, payload?.old?.trip_id].some(
        (id) => typeof id === "string" && tripIdSet.has(id),
      );
    };
    const unsubscribe = subscribeToAdminRealtime((event) => {
      if (event.kind === "resume") {
        if (active && inactiveChanges.current) {
          inactiveChanges.current = false;
          scheduleReload();
        }
        return;
      }
      if (event.kind === "recovered") {
        if (!relevant(event.table)) return;
      } else if (!relevant(event.payload.table, event.payload)) return;
      if (active) scheduleReload();
      else inactiveChanges.current = true;
    });
    if (active && inactiveChanges.current) {
      inactiveChanges.current = false;
      scheduleReload();
    }
    const interval = active ? window.setInterval(scheduleReload, 60_000) : undefined;
    return () => {
      unsubscribe();
      if (interval !== undefined) window.clearInterval(interval);
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    };
  }, [accessToken, active, snapshot?.recent]);

  const isLoading = Boolean(accessToken) && loadedKey !== requestKey;
  const isInitialLoading = isLoading && !snapshot;
  const error = failure?.key === requestKey ? failure.message : null;

  if (error && !snapshot) {
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

  if (isInitialLoading) return <OverviewSkeleton />;

  // --- Derived Data (kept from original) ---
  const totalTrips = snapshot?.total ?? 0;
  const pctOfTrips = (count: number) =>
    totalTrips > 0 ? Math.round((count / totalTrips) * 100) : 0;
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
  const activeTripIds = new Set((snapshot?.recent ?? []).filter(isActiveTrip).map((trip) => textValue(trip.id)));
  const activeTrips = (snapshot?.recent ?? []).filter(isActiveTrip);
  const activeTracks = (snapshot?.tracks ?? []).filter((track) => activeTripIds.has(textValue(track.trip.id)));
  const fleetPhotoRows = fleetRows.filter((trip) => activeTripIds.has(trip.id)).map((trip) => ({
    ...trip,
    imageUrl: snapshot?.photoUrls[trip.id],
  }));
  const activeMapLocationIds = [...new Set((snapshot?.recent ?? []).filter(isActiveTrip).flatMap((trip) => {
    const tripId = textValue(trip.id);
    const dispatchNumber = textValue(trip.dispatch_number);
    const bookingRows = (snapshot?.bookingRows ?? []).filter((row) =>
      (tripId && textValue(row.trip_id ?? row._trip_id) === tripId) ||
      (dispatchNumber && textValue(row.dispatch_number) === dispatchNumber),
    );
    return [
      textValue(trip.warehouse_id),
      ...bookingRows.flatMap((row) => [
        textValue(row._warehouse_id ?? row.warehouse_id),
        textValue(row._store_id ?? row.store_id),
      ]),
    ].filter(Boolean);
  }))];
  const activeMapRoutes: TripLocationRoute[] = activeTrips.flatMap((trip) => {
    const tripId = textValue(trip.id);
    const dispatchNumber = textValue(trip.dispatch_number);
    const bookingRows = (snapshot?.bookingRows ?? []).filter((row) =>
      (tripId && textValue(row.trip_id ?? row._trip_id) === tripId) ||
      (dispatchNumber && textValue(row.dispatch_number) === dispatchNumber),
    );
    const reportWarehouse = bookingRows.find((row) =>
      Boolean(textValue(row._warehouse_id ?? row.warehouse_id)),
    );
    const originWarehouseId = textValue(trip.warehouse_id) ||
      textValue(reportWarehouse?._warehouse_id ?? reportWarehouse?.warehouse_id);
    const destinationStoreIds = [...new Set(bookingRows
      .map((row) => textValue(row._store_id ?? row.store_id))
      .filter(Boolean))];
    return originWarehouseId && destinationStoreIds.length
      ? [{
          tripId,
          tripLabel: dispatchNumber || tripId,
          originWarehouseId,
          destinationStoreIds,
        }]
      : [];
  });
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
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(-6)
    .map(([, count]) => count);
  const inProgressTrips = snapshot?.inProgress ?? 0;
  const completedTrips = snapshot?.completed ?? 0;
  const otherTrips = Math.max(totalTrips - inProgressTrips - completedTrips - delayedTrips, 0);

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
    <div className="w-full">
      <div className="w-full space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-[#0b2341]">
              Welcome back, {greetingName}!
            </h1>
            <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
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
              {isLoading && snapshot && <span role="status" className="text-xs">Refreshing…</span>}
            </div>
          </div>
        </header>
        {error && snapshot && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Dashboard refresh failed: {error} <button type="button" className="ml-2 underline" onClick={() => setReloadCount((count) => count + 1)}>Retry</button></div>}

        <div className="space-y-4">
        {/* Top row: the 4 stat cards only */}
        <section aria-label="Fleet summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total trips"
            value={snapshot ? totalTrips.toLocaleString() : "…"}
            note="Non-archived trips"
            icon={<Truck />}
            chart={<MiniBars values={tripsPerDay} />}
          />
          <KpiCard
            title="In transit"
            value={snapshot ? inProgressTrips.toLocaleString() : "…"}
            note={`${pctOfTrips(inProgressTrips)}% of trips`}
            icon={<Package />}
            chart={<MiniRing percent={pctOfTrips(inProgressTrips)} />}
          />
          <KpiCard
            title="Completed"
            value={snapshot ? completedTrips.toLocaleString() : "…"}
            note={`${pctOfTrips(completedTrips)}% of trips`}
            icon={<CheckCircle2 />}
            chart={<MiniRing percent={pctOfTrips(completedTrips)} />}
          />
          <KpiCard
            title="Delayed"
            value={snapshot ? delayedTrips.toLocaleString() : "…"}
            note={delayedTrips > 0 ? "Needs follow-up" : "On schedule"}
            alert={delayedTrips > 0}
            icon={<Clock />}
            chart={<MiniRing percent={pctOfTrips(delayedTrips)} color="#f59e0b" />}
          />
        </section>

        {/* Spotlight Trips (Attention Card) */}
        <SpotlightTrips rows={fleetRows} onViewTrip={onOpenTrip} />

        {/* Bento grid: requests + status | activity + fleet | map */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:grid-rows-[340px_430px]">
          <div className="relative flex min-w-0 xl:col-span-3">
          <PendingRequestsCard
            className="h-full w-full"
            requests={pendingRequests}
            onReview={(id) => {
              selectRequest(id);
              onMetricNavigate?.("requests");
            }}
            onViewAll={() => onMetricNavigate?.("requests")}
          />
          </div>

          <OverviewCalendarCard
            className="xl:col-span-5 xl:min-h-0"
            onOpenCalendar={() => onMetricNavigate?.("calendar")}
          />

          <div className="min-w-0 xl:col-span-4 xl:row-span-2">
            <LiveTripMap
              tracks={activeTracks}
              locationIds={activeMapLocationIds}
              tripLocationRoutes={activeMapRoutes}
              focusTripId={focusedTripId && activeTripIds.has(focusedTripId) ? focusedTripId : null}
              eventLoadError={snapshot?.eventsUnavailable ?? false}
              height={460}
              fillHeight
            />
          </div>

          <TripStatusRing
            className="min-h-[380px] xl:col-span-3 xl:min-h-0"
            total={totalTrips}
            segments={[
              { label: "Completed", value: completedTrips, color: "#0b2341" },
              { label: "In transit", value: inProgressTrips, color: "#4f7bb0" },
              { label: "Delayed", value: delayedTrips, color: "#f59e0b" },
              { label: "Other", value: otherTrips, color: "#cbd5e1" },
            ]}
          />

          <FleetListCard
            rows={fleetPhotoRows}
            selectedTripId={focusedTripId}
            onSelectTrip={(tripId) =>
              setFocusedTripId((current) => (current === tripId ? null : tripId))
            }
            onViewTrip={onOpenTrip}
            className="xl:col-span-5"
          />
        </div>
        {snapshot?.bookingUnavailable && (
          <p className="px-2 text-xs text-amber-800">
            Warehouse and store labels are unavailable; trip and GPS data
            remain visible.
          </p>
        )}

        {/* Fleet Analytics (Full Width) */}
        <FleetAnalytics
          movement={movementData}
          dailyCounts={dailyEventCounts}
          flows={flows}
          regionTrips={regionTrips}
          unlocatedTrips={unlocatedTrips}
          isLoading={isInitialLoading}
        />

        {/* Bottom row: payables beside recent activity */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <PayablesMiniTable
            className="xl:col-span-7"
            onViewAll={() => onMetricNavigate?.("payables")}
          />
          <ActivityFeedCard
            events={timelineEvents}
            title="Recent activity"
            className="max-h-[420px] min-h-[300px] xl:col-span-5"
          />
        </div>
        </div>
      </div>
    </div>
  );
}
