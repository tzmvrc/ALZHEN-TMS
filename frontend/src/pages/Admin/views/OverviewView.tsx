import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ApiError, invalidateApiCache } from "../../../services/api.service";
import { settledBackgroundPreload } from "../../../services/background-preload";
import { fetchTripEvents, fetchTrips } from "../../../services/trip.service";
import { fetchTripImages } from "../../../services/trip-image.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import { fetchReportPage, invalidateReportPageCache, type ReportRow } from "../../../services/report.service";
import HomeCommandCenter from "../../../components/admin/home/HomeCommandCenter";
import { HomeSkeleton } from "../../../components/admin/home/HomePrimitives";
import { text as textValue, type HomeSnapshot as OverviewSnapshot } from "../../../components/admin/home/home-dashboard-data";

export default function OverviewView({ onOpenTrip, onMetricNavigate, active = true }: {
  onOpenTrip?: (tripId: string) => void;
  onMetricNavigate?: (sectionId: string) => void;
  active?: boolean;
  sidebarExpanded?: boolean;
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
        const [firstPage,inProgressPage,completedPage,plannedPage] = await Promise.all([
          fetchTrips(accessToken,{limit:100,archiveScope:"active"}),
          fetchTrips(accessToken,{limit:1,status:"IN_PROGRESS",archiveScope:"active"}),
          fetchTrips(accessToken,{limit:1,status:"COMPLETED",archiveScope:"active"}),
          fetchTrips(accessToken,{limit:1,status:"PLANNED",archiveScope:"active"}),
        ]);
        const allTrips = { ...firstPage, rows: [...firstPage.rows] };
        const fetchedAt = Date.now();
        if (!isCurrent) return;
        // Make the essential snapshot usable before booking, activity or photo requests.
        setSnapshot(previous => ({
          recent: allTrips.rows, photoUrls: previous?.photoUrls ?? {},
          tracks: previous?.tracks ?? [], events: previous?.events ?? [],
          bookingRows: previous?.bookingRows ?? [], eventsUnavailable: false,
          bookingUnavailable: false, bookingLimited: false, detailsLoading: true, planned: plannedPage.pagination.total, total: allTrips.pagination.total,
          inProgress: inProgressPage.pagination.total,
          completed: completedPage.pagination.total, fetchedAt,
        }));
        setLoadedKey(requestKey);
        // Yield to navigation and rendering before starting nonessential reads.
        await new Promise(resolve => window.setTimeout(resolve, 1500));
        if (!isCurrent) return;
        let bookingRows: ReportRow[] = [];
        let bookingUnavailable = false;
        let bookingLimited = false;
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
          bookingLimited = bookingPage.pagination.total > bookingPage.rows.length;
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
        setSnapshot(previous => previous ? {...previous, bookingRows, bookingUnavailable, bookingLimited} : previous);
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
          bookingUnavailable, bookingLimited,
          detailsLoading: false, planned: plannedPage.pagination.total,
          total: allTrips.pagination.total,
          inProgress: inProgressPage.pagination.total,
          completed: completedPage.pagination.total,
          fetchedAt,
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
        if (isCurrent) { setLoadedKey(requestKey); setSnapshot(current => current ? {...current, detailsLoading: false} : current); }
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
      <div className="home-command-center flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-center">
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

  if (isInitialLoading || !snapshot && !error) return <HomeSkeleton />;

  if (!snapshot) return null;
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Operations team";
  return <HomeCommandCenter snapshot={snapshot} name={name} refreshing={isLoading} error={error} active={active}
    onRefresh={() => { invalidateApiCache("/trips"); invalidateReportPageCache("dispatch-monitoring"); setReloadCount(count => count + 1); }}
    onOpenTrip={onOpenTrip} onNavigate={onMetricNavigate}/>;
}
