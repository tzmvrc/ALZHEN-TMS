import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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
import LiveTripMap, {
  type TripEventTrack,
} from "../../../components/admin/LiveTripMap";
import {
  fetchReportRows,
  type ReportRow,
} from "../../../services/report.service";
import {
  FleetMovementPanel,
  OperationsActivityPanel,
} from "../../../components/admin/DashboardPrimitives";
import {
  ActivityFeedCard,
  FleetListCard,
  GreetingHeader,
  RingStatCard,
  SpotlightTrips,
  TripShortcutRow,
} from "../../../components/admin/OverviewCards";
import { toneHex } from "../../../components/admin/dashboardStyles";

type OverviewSnapshot = {
  recent: TripPage["rows"];
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

export default function OverviewView({
  onOpenTrip,
  onMetricNavigate,
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
        const eventResults = await Promise.allSettled(
          tripsWithIds.map(async (trip) => ({
            trip,
            events: await fetchTripEvents(accessToken, trip.id),
          })),
        );
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
        if (!active) return;
        setSnapshot({
          recent: allTrips.rows,
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
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => setReloadCount((count) => count + 1)}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  const totalTrips = snapshot?.total ?? 0;
  const shareOfTotal = (count: number) =>
    !isLoading && totalTrips > 0
      ? `${Math.round((count / totalTrips) * 100)}%`
      : undefined;
  const display = (count: number) =>
    isLoading ? "..." : count.toLocaleString();
  const inProgressShare = shareOfTotal(snapshot?.inProgress ?? 0);
  const completedShare = shareOfTotal(snapshot?.completed ?? 0);
  const shareValue = (count: number) =>
    !isLoading && totalTrips > 0 ? Math.round((count / totalTrips) * 100) : 0;
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
  const tripsUpdated = new Set(
    (snapshot?.events ?? []).map((event) => event.trip_id),
  ).size;
  const stopsCompleted = new Set(
    (snapshot?.events ?? [])
      .filter((event) =>
        /STORE_ARRIVAL|STOP.*(COMPLET|DELIVER|ARRIV)|(COMPLET|DELIVER).*STOP/i.test(
          event.event_type,
        ),
      )
      .map((event) => `${event.trip_id}:${event.trip_stop_id ?? event.id}`),
  ).size;
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
  const movementData = fleetMovementSeries(snapshot?.tracks ?? []);
  const activeGpsRoutes = (snapshot?.tracks ?? []).filter((track) => {
    const status = fleetStatus(track.trip.status);
    return (
      status === "In Progress" &&
      track.events.some((event) => eventCoordinates(event) !== null)
    );
  }).length;
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

  return (
    <div className="space-y-4">
      {/* Greeting + trip summary */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)]">
        <GreetingHeader
          name={greetingName}
          updatedLabel={updatedLabel}
          onRefresh={() => setReloadCount((count) => count + 1)}
        />
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <RingStatCard
            label="All trips"
            title="Total trips"
            value={display(totalTrips)}
            percent={!isLoading && totalTrips > 0 ? 100 : 0}
            color={toneHex.navy}
            caption="All recorded trips"
            actionLabel="Check"
            onAction={() => onMetricNavigate?.("dispatches")}
          />
          <RingStatCard
            label="On the road"
            title="In transit"
            value={display(snapshot?.inProgress ?? 0)}
            percent={shareValue(snapshot?.inProgress ?? 0)}
            color={toneHex.brand}
            caption={inProgressShare ? `${inProgressShare} of all trips` : "On the road"}
            actionLabel="Check"
            onAction={() => onMetricNavigate?.("monitoring")}
          />
          <RingStatCard
            label="Delivered"
            title="Completed"
            value={display(snapshot?.completed ?? 0)}
            percent={shareValue(snapshot?.completed ?? 0)}
            color={toneHex.emerald}
            caption={completedShare ? `${completedShare} of all trips` : "Successfully delivered"}
            actionLabel="Check"
            onAction={() => onMetricNavigate?.("combined")}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <TripShortcutRow
            rows={fleetRows}
            selectedTripId={focusedTripId}
            onSelectTrip={(tripId) =>
              setFocusedTripId((current) => (current === tripId ? null : tripId))
            }
          />

          <SpotlightTrips rows={fleetRows} onViewTrip={onOpenTrip} />

          <LiveTripMap
            tracks={snapshot?.tracks ?? []}
            focusTripId={focusedTripId}
            eventLoadError={snapshot?.eventsUnavailable ?? false}
            height={400}
          />

          {snapshot?.bookingUnavailable && (
            <p className="text-xs text-amber-800">
              Warehouse and store labels are unavailable; trip and GPS data
              remain visible.
            </p>
          )}

          <FleetMovementPanel
            data={movementData}
            isLoading={isLoading}
            activeRoutes={activeGpsRoutes}
          />
        </div>

        {/* Side column */}
        <div className="min-w-0 space-y-4">
          <ActivityFeedCard events={timelineEvents} title="Recent activity" />
          <FleetListCard
            rows={fleetRows}
            selectedTripId={focusedTripId}
            onSelectTrip={(tripId) =>
              setFocusedTripId((current) => (current === tripId ? null : tripId))
            }
            onViewTrip={onOpenTrip}
          />
          <OperationsActivityPanel
            dailyCounts={dailyEventCounts}
            totalEvents={snapshot?.events.length ?? 0}
            tripsUpdated={tripsUpdated}
            stopsCompleted={stopsCompleted}
            isLoading={isLoading}
            unavailable={snapshot?.eventsUnavailable}
          />
        </div>
      </div>
    </div>
  );
}