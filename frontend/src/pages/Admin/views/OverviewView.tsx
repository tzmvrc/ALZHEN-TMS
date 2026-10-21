import { reportBelongsToTrip } from "../../../services/trip-identity";
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
import {settledBackgroundPreload} from "../../../services/background-preload";
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
} from "../../../components/admin/OverviewCards";
import FleetAnalytics, {
  type FlowRow,
} from "../../../components/admin/FleetAnalytics";
import OverviewMiniCalendar from "../../../components/admin/OverviewMiniCalendar";
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
  const bookingDetails = bookingRows.filter((row) => reportBelongsToTrip(row, trip.id));
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

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100);

/** Ring gauge with the percentage in the middle. */
function RingGauge({ percent, color = "#2678b9" }: { percent: number; color?: string }) {
  const value = clampPercent(percent);
  return (
    <div
      role="img"
      aria-label={`${value}%`}
      className="relative flex h-[60px] w-[60px] items-center justify-center">
      <svg aria-hidden="true" viewBox="0 0 60 60" className="absolute inset-0 -rotate-90">
        <circle cx="30" cy="30" r="24" fill="none" stroke="#e3eaf2" strokeWidth="6" />
        <circle
          cx="30"
          cy="30"
          r="24"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${value} 100`}
        />
      </svg>
      <span className="relative text-[12px] font-semibold tabular-nums text-[#0b2341]">{value}%</span>
    </div>
  );
}

/** Semicircle gauge with the percentage underneath the arc. */
function ArcGauge({ percent, color = "#0b2341" }: { percent: number; color?: string }) {
  const value = clampPercent(percent);
  return (
    <div role="img" aria-label={`${value}%`} className="relative h-[46px] w-[76px]">
      <svg aria-hidden="true" viewBox="0 0 76 46" className="absolute inset-0">
        <path d="M 8 40 A 30 30 0 0 1 68 40" fill="none" stroke="#e3eaf2" strokeWidth="7" strokeLinecap="round" />
        <path
          d="M 8 40 A 30 30 0 0 1 68 40"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${value} 100`}
        />
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center text-[12px] font-semibold tabular-nums text-[#0b2341]">
        {value}%
      </span>
    </div>
  );
}

/** A single tall rounded bar. */
function PillBar() {
  return <span aria-hidden="true" className="block h-14 w-2.5 rounded-full bg-[#2678b9]" />;
}

/** A glowing status dot. */
function StatusDot({ tone }: { tone: "amber" | "green" }) {
  const color = tone === "amber" ? "bg-[#ffd43b] ring-[#ffd43b]/30" : "bg-emerald-400 ring-emerald-400/30";
  return <span aria-hidden="true" className={`block h-4 w-4 rounded-full ring-[6px] ${color}`} />;
}

/** Stat card: navy icon circle, label, big figure, quiet note, and a small visual on the right. */
function KpiCard({
  title,
  value,
  note,
  icon,
  visual,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  visual: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-[28px] bg-white px-5 py-5 ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(11,35,65,0.03)]">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-white [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-600">{title}</p>
        <p className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight tabular-nums text-[#0b2341]">
          {value}
        </p>
        <p className="truncate text-[11px] text-slate-400">{note}</p>
      </div>
      <div className="shrink-0">{visual}</div>
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
        {Array.from({ length: 4 }, (_, index) => <div key={index} className={`${block} h-[108px] rounded-[28px]`} />)}
      </section>
      <div aria-hidden="true" className={`${block} h-[116px] w-full`} />
      <section aria-hidden="true" className="grid grid-cols-1 gap-4 xl:h-[720px] xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-3">
          <div className={`${block} h-[250px]`} />
          <div className={`${block} min-h-[300px] flex-1`} />
        </div>
        <div className={`${block} min-h-[420px] xl:col-span-4`} />
        <div className={`${block} min-h-[360px] xl:col-span-5`} />
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

    if (!active) return;
    let isCurrent = true;
    void (async () => {
      try {
        const [firstPage,inProgressPage,completedPage] = await Promise.all([
          fetchTrips(accessToken,{limit:100,archiveScope:"active"}),
          fetchTrips(accessToken,{limit:1,status:"IN_PROGRESS",archiveScope:"active"}),
          fetchTrips(accessToken,{limit:1,status:"COMPLETED",archiveScope:"active"}),
        ]);
        const allTrips = { ...firstPage, rows: [...firstPage.rows] };
        if (!isCurrent) return;
        // Make the essential snapshot usable before booking, activity or photo requests.
        setSnapshot(previous => ({
          recent: allTrips.rows, photoUrls: previous?.photoUrls ?? {},
          tracks: previous?.tracks ?? [], events: previous?.events ?? [],
          bookingRows: previous?.bookingRows ?? [], eventsUnavailable: false,
          bookingUnavailable: false, total: allTrips.pagination.total,
          inProgress: inProgressPage.pagination.total,
          completed: completedPage.pagination.total, fetchedAt: Date.now(),
        }));
        setLoadedKey(requestKey);
        // Yield to navigation and rendering before starting nonessential reads.
        await new Promise(resolve => window.setTimeout(resolve, 1500));
        if (!isCurrent) return;
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
        if (!isCurrent) return;
        setSnapshot(previous => previous ? {...previous, bookingRows, bookingUnavailable} : previous);
        const partialTracks: OverviewSnapshot["tracks"] = [];
        const partialPhotos: Record<string,string> = {};
        let detailAuthFailure: ApiError | undefined;
        // One bounded queue for both resources; never run two independent 100-trip queues.
        const details = await settledBackgroundPreload(tripsWithIds.map((trip, index) => async () => {
          await new Promise(resolve => window.setTimeout(resolve, 200));
          if (!isCurrent) throw new Error("Overview navigation changed");
          const events = await Promise.allSettled([fetchTripEvents(accessToken, trip.id)]);
          if (events[0].status === "rejected" && events[0].reason instanceof ApiError && events[0].reason.status === 401) detailAuthFailure = events[0].reason;
          if (!isCurrent || detailAuthFailure) return {trip, events: events[0], images: null};
          const images = await Promise.allSettled([fetchTripImages(accessToken, trip.id)]);
          if (images[0].status === "rejected" && images[0].reason instanceof ApiError && images[0].reason.status === 401) detailAuthFailure = images[0].reason;
          if (events[0].status === "fulfilled") partialTracks.push({trip, events: events[0].value.filter(event => !event.trip_stop_id || (!bookingUnavailable && activeStopIds.has(event.trip_stop_id)))});
          if (images[0].status === "fulfilled" && images[0].value[0]) partialPhotos[trip.id] = images[0].value[0].signed_url;
          // Publish early map/activity detail, then batches, without rerendering per request.
          if (isCurrent && (index < 3 || index % 10 === 9)) {
            const tracks = [...partialTracks], photoUrls = {...partialPhotos};
            setSnapshot(previous => previous ? {...previous, tracks, photoUrls,
              events: tracks.flatMap(({trip,events}) => events.map(event => ({...event, dispatch_number: String(trip.dispatch_number ?? trip.id ?? "Trip")}))),
            } : previous);
          }
          return {trip, events: events[0], images: images[0]};
        }), 1, () => isCurrent && !detailAuthFailure);
        if (detailAuthFailure) throw detailAuthFailure;
        const eventResults = details.map(result => {
          if (result.status === "rejected") return result;
          const {trip, events} = result.value;
          return events.status === "rejected" ? events : {
            status: "fulfilled" as const, value: {trip, events: events.value.filter(
              event => !event.trip_stop_id || (!bookingUnavailable && activeStopIds.has(event.trip_stop_id)),
            )},
          };
        });
        const photoResults = details.map(result => {
          if (result.status === "rejected") return result;
          const {trip, images} = result.value;
          return !images ? {status: "rejected" as const, reason: "Navigation changed"} : images.status === "rejected" ? images : {
            status: "fulfilled" as const, value: {tripId: trip.id, images: images.value},
          };
        });
        if(!isCurrent)return;
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
        if (!isCurrent) return;
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
          inProgress: inProgressPage.pagination.total,
          completed: completedPage.pagination.total,
          fetchedAt: Date.now(),
        });
      } catch (cause) {
        if (!isCurrent) return;
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
        if (isCurrent) setLoadedKey(requestKey);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [accessToken, navigate, refreshSession, requestKey, active]);

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
      if (event.kind === "batch") {
        if (!event.tables.some((table) => ["trips", "trip_stops", "warehouses", "customer_stores", "trip_truck_assignments", "trip_events", "trip_images"].includes(table))) return;
        if (active) scheduleReload(); else inactiveChanges.current = true;
        return;
      }
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
    return () => {
      unsubscribe();
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

  const inProgressTrips = snapshot?.inProgress ?? 0;
  const completedTrips = snapshot?.completed ?? 0;
  const deliveryDates = activeTrips
    .map((trip) => textValue(trip.estimated_delivery_date).slice(0, 10))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));

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
        {snapshot&&snapshot.total>snapshot.recent.length&&<p className="text-xs text-slate-500">Showing the latest {snapshot.recent.length} active trips in charts and previews; headline totals cover all active trips.</p>}

        <div className="space-y-4">
        {/* Summary cards */}
        <section aria-label="Fleet summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total trips"
            value={snapshot ? totalTrips.toLocaleString() : "…"}
            note="Non-archived trips"
            icon={<Truck />}
            visual={<PillBar />}
          />
          <KpiCard
            title="In transit"
            value={snapshot ? inProgressTrips.toLocaleString() : "…"}
            note={`${pctOfTrips(inProgressTrips)}% of trips`}
            icon={<Package />}
            visual={<RingGauge percent={pctOfTrips(inProgressTrips)} />}
          />
          <KpiCard
            title="Completed"
            value={snapshot ? completedTrips.toLocaleString() : "…"}
            note={`${pctOfTrips(completedTrips)}% of trips`}
            icon={<CheckCircle2 />}
            visual={<ArcGauge percent={pctOfTrips(completedTrips)} />}
          />
          <KpiCard
            title="Delayed"
            value={snapshot ? delayedTrips.toLocaleString() : "…"}
            note={delayedTrips > 0 ? "Needs follow-up" : "On schedule"}
            icon={<Clock />}
            visual={<StatusDot tone={delayedTrips > 0 ? "amber" : "green"} />}
          />
        </section>

        {/* Trips that need attention */}
        <SpotlightTrips rows={fleetRows} onViewTrip={onOpenTrip} />

        {/* Left panel: requests + mini calendar | active fleet | live trip map.
            One fixed-height row: all three columns share the same top and bottom edge,
            and the fleet list and live trip card scroll inside their own box. */}
        <div className="grid grid-cols-1 gap-4 xl:h-[720px] xl:grid-cols-12">
          <div className="flex min-h-0 min-w-0 flex-col gap-4 xl:col-span-3">
            <PendingRequestsCard
              className="h-[340px] shrink-0 xl:h-auto xl:min-h-0 xl:flex-1"
              requests={pendingRequests}
              onReview={(id) => {
                selectRequest(id);
                onMetricNavigate?.("requests");
              }}
              onViewAll={() => onMetricNavigate?.("requests")}
            />
            <OverviewMiniCalendar
              className="shrink-0"
              markedDates={deliveryDates}
              markedLabel="deliveries"
              onOpenCalendar={() => onMetricNavigate?.("calendar")}
            />
          </div>

          <div className="relative h-[520px] min-w-0 xl:col-span-4 xl:h-auto">
            <div className="absolute inset-0 overflow-y-auto overscroll-contain rounded-[28px]">
              <FleetListCard
                rows={fleetPhotoRows}
                selectedTripId={focusedTripId}
                onSelectTrip={(tripId) =>
                  setFocusedTripId((current) => (current === tripId ? null : tripId))
                }
                onViewTrip={onOpenTrip}
                className="w-full min-h-full"
              />
            </div>
          </div>

          <div className="relative h-[620px] min-w-0 xl:col-span-5 xl:h-auto">
            <div className="absolute inset-0 overflow-y-auto overscroll-contain rounded-[28px]">
              <LiveTripMap
                unified
                tracks={activeTracks}
                locationIds={activeMapLocationIds}
                tripLocationRoutes={activeMapRoutes}
                focusTripId={focusedTripId && activeTripIds.has(focusedTripId) ? focusedTripId : null}
                eventLoadError={snapshot?.eventsUnavailable ?? false}
                height={320}
              />
            </div>
          </div>
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