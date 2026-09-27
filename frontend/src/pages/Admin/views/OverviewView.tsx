import { useEffect, useState } from "react";
import { Activity, CheckCircle2, RefreshCw, Truck } from "lucide-react";
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
import LiveTripMap, { type TripEventTrack } from "../../../components/admin/LiveTripMap";
import { fetchReportRows, type ReportRow } from "../../../services/report.service";
import {
  ActivityTimeline,
  FleetBoardPanel,
  StatusOverviewPanel,
} from "../../../components/admin/DashboardPrimitives";

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
  const stores = [...new Set(
    bookingDetails.map((row) => textValue(row.store_name)).filter(Boolean),
  )];
  const gpsEvents = events.filter(
    (event) => event.latitude !== null && event.latitude !== undefined &&
      event.longitude !== null && event.longitude !== undefined,
  );
  const deliveryDate = formatDate(trip.estimated_delivery_date);

  return {
    id: textValue(trip.id, textValue(trip.dispatch_number, "Trip")),
    displayId: dispatchNumber,
    route: warehouse || "Warehouse not set",
    tripType: textValue(trip.trip_type) === "Stock Transfer" ? "Stock Transfer" : "Regular",
    status: fleetStatus(rawStatus),
    statusText: rawStatus.replaceAll("_", " "),
    eta: deliveryDate || "Not set",
    hub: warehouse,
    driver: textValue(bookingDetails.find((row) => row.driver_name)?.driver_name, "Not assigned"),
    amount: "",
    origin: warehouse || "Warehouse not set",
    destination: stores.length > 0
      ? stores.join(", ")
      : gpsEvents.length > 0
        ? "GPS recorded"
        : "GPS not recorded",
    progressPct: fleetStatus(rawStatus) === "Completed" ? 100 : 0,
  };
}

export default function OverviewView({
  onOpenTrip,
}: {
  onOpenTrip?: (tripId: string) => void;
}) {
  const { accessToken, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
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
          const bookingPage = await fetchReportRows("trip-booking", accessToken, {
            page: 1,
            limit: 100,
            search: "",
            sortBy: "loading_date",
            sortOrder: "desc",
            filters: {},
          });
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
        const tracks = fulfilledTracks.map(({ trip, events }) => ({ trip, events }));
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
          eventsUnavailable: eventResults.some((result) => result.status === "rejected"),
          bookingUnavailable,
          total: allTrips.pagination.total,
          inProgress: inProgress.pagination.total,
          completed: completed.pagination.total,
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
        <p role="alert" className="text-sm text-rose-700">{error}</p>
        <button
          type="button"
          onClick={() => setReloadCount((count) => count + 1)}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  const metrics = [
    { label: "Total trips", value: snapshot?.total, icon: Truck },
    { label: "In progress", value: snapshot?.inProgress, icon: Activity },
    { label: "Completed", value: snapshot?.completed, icon: CheckCircle2 },
  ];
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
  const maxDailyEventCount = Math.max(...dailyEventCounts.map((item) => item.count), 1);
  const eventTypeCount = new Set((snapshot?.events ?? []).map((event) => event.event_type)).size;
  const recentEvents = (snapshot?.events ?? [])
    .slice()
    .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time))
    .slice(0, 8);
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
  const timelineEvents = recentEvents.map((event) => ({
    id: `${event.trip_id}-${event.id}`,
    time: localDateTime(event.event_time),
    message: `${eventLabel(event.event_type)} · ${event.dispatch_number}${event.notes ? ` · ${event.notes}` : ""}`,
    tone: /FINISHED|COMPLETED|DELIVERED/.test(event.event_type)
      ? "emerald" as const
      : /ARRIVAL/.test(event.event_type)
        ? "blue" as const
        : "amber" as const,
  }));
  const gpsTripCount = (snapshot?.tracks ?? []).filter((track) =>
    track.events.some((event) =>
      event.latitude !== null && event.latitude !== undefined &&
      event.longitude !== null && event.longitude !== undefined,
    ),
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.concat([{ label: "Trips with GPS", value: gpsTripCount, icon: Truck }]).map(({ label, value, icon: Icon }) => (
          <section key={label} className="flex min-h-28 items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{isLoading ? "..." : (value ?? 0).toLocaleString()}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon aria-hidden="true" className="h-4 w-4" /></span>
          </section>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr] xl:grid-rows-[590px]">
        <LiveTripMap
          tracks={snapshot?.tracks ?? []}
          focusTripId={focusedTripId}
          eventLoadError={snapshot?.eventsUnavailable ?? false}
          height={460}
        />
        <FleetBoardPanel
          rows={fleetRows}
          selectedTripId={focusedTripId}
          onSelectTrip={(tripId) =>
            setFocusedTripId((current) => current === tripId ? null : tripId)
          }
          onViewTrip={onOpenTrip}
          className="h-[590px] min-h-0"
        />
      </div>
      {snapshot?.bookingUnavailable && (
        <p className="-mt-3 text-xs text-amber-800">Warehouse and store labels are unavailable; trip and GPS data remain visible.</p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <StatusOverviewPanel rows={fleetRows} />
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <header className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Event volume by date</h2>
              <p className="mt-0.5 text-xs text-slate-500">Latest recorded events for recent trips</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold tabular-nums text-slate-900">{isLoading ? "..." : (snapshot?.events.length ?? 0)}</p>
              <p className="text-[10px] text-slate-500">{eventTypeCount} event types</p>
            </div>
          </header>
          {snapshot?.eventsUnavailable && <p className="mb-3 text-xs text-amber-800">Some trip events could not be loaded.</p>}
          {isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading event data...</p> : dailyEventCounts.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No trip events recorded.</p> : (
            <div className="rounded-md bg-slate-50 px-3 pt-4 pb-2">
              <div className="flex h-36 items-end gap-2 border-b border-slate-200 sm:gap-3">
                {dailyEventCounts.map(({ date, count }, index) => (
                  <div key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[10px] font-semibold tabular-nums text-slate-600">{count}</span>
                    <div
                      title={`${count} events on ${date}`}
                      className="spark-bar w-full max-w-10 rounded-t-sm bg-cyan-700"
                      style={{ height: `${Math.max((count / maxDailyEventCount) * 96, 5)}px`, opacity: 0.65 + (index / Math.max(dailyEventCounts.length, 1)) * 0.35 }}
                    />
                    <span className="mb-1 truncate text-[9px] text-slate-500">
                      {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
              <p className="pt-2 text-[10px] text-slate-500">Events grouped by database event date</p>
            </div>
          )}
        </section>
      </div>

      <ActivityTimeline events={timelineEvents} height={300} />
    </div>
  );
}

