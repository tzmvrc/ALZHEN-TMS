import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { TripEvent, TripRecord } from "../../services/trip.service";

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY?.trim();
const TILE_URL = CARTO_API_KEY
  ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`
  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = CARTO_API_KEY
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type TripEventTrack = {
  trip: TripRecord;
  events: TripEvent[];
};

function coordinates(event: TripEvent): [number, number] | null {
  if (event.latitude === null || event.latitude === undefined || event.longitude === null || event.longitude === undefined) {
    return null;
  }
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  if (
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

function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length === 1) map.setView(coords[0], 10);
    if (coords.length > 1) map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
  }, [coords, map]);
  return null;
}

function FocusTrip({
  tripId,
  tracks,
}: {
  tripId?: string | null;
  tracks: { id: string; point: [number, number] }[];
}) {
  const map = useMap();
  useEffect(() => {
    if (!tripId) return;
    const selected = tracks.find((track) => track.id === tripId);
    if (selected) map.flyTo(selected.point, 10, { duration: 0.8 });
  }, [map, tracks, tripId]);
  return null;
}

function statusColor(status: unknown): string {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "COMPLETED") return "#3478c8";
  if (normalized === "DELAYED") return "#d17a22";
  return "#079a83";
}

function truckIcon(status: unknown) {
  const normalized = String(status ?? "").toUpperCase();
  const kind = normalized === "COMPLETED"
    ? "completed"
    : normalized === "DELAYED"
      ? "delayed"
      : "in-progress";
  return L.divIcon({
    className: "",
    html: `<div class="truck-marker truck-marker--${kind}">🚚</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function storeIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="store-marker" aria-label="Store">🏬</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function LiveTripMap({
  tracks,
  focusTripId,
  eventLoadError = false,
  height = 420,
}: {
  tracks: TripEventTrack[];
  focusTripId?: string | null;
  eventLoadError?: boolean;
  height?: number;
}) {
  const plotted = useMemo(() => tracks.map((track) => {
    const points = track.events
      .slice()
      .sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time))
      .flatMap((event) => {
        const point = coordinates(event);
        return point ? [{ event, point }] : [];
      });
    return { ...track, points };
  }).filter((track) => track.points.length > 0), [tracks]);

  const allCoords = useMemo(
    () => plotted.flatMap((track) => track.points.map((point) => point.point)),
    [plotted],
  );
  const center: [number, number] = allCoords[0] ?? [12.8797, 121.774];
  const markerCount = plotted.length;
  const latestMarkers = useMemo(
    () => plotted.map((track) => ({
      id: String(track.trip.id ?? track.trip.dispatch_number ?? ""),
      point: track.points[track.points.length - 1].point,
    })),
    [plotted],
  );
  const selectedHasGps =
    !focusTripId || latestMarkers.some((marker) => marker.id === focusTripId);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-500">GPS locations and stops</p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">Trip routes</h2>
        </div>
        <span className="text-xs text-slate-500">{markerCount} trips with GPS</span>
      </header>
      <div className="relative">
        <MapContainer
          center={center}
          zoom={6}
          style={{ height, width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution={TILE_ATTRIBUTION}
            url={TILE_URL}
            subdomains={["a", "b", "c", "d"]}
            maxZoom={19}
          />
          <FitBounds coords={allCoords} />
          <FocusTrip tripId={focusTripId} tracks={latestMarkers} />
          {plotted.map((track) => {
            const latest = track.points[track.points.length - 1];
            const positions = track.points.map((point) => point.point);
            const dispatch = String(track.trip.dispatch_number ?? track.trip.id ?? "Trip");
            return (
              <Fragment key={String(track.trip.id ?? dispatch)}>
                {positions.length > 1 && (
                  <>
                    <Polyline
                      positions={positions}
                      pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
                    />
                    <Polyline
                      positions={positions}
                      pathOptions={{ color: statusColor(track.trip.status), weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }}
                      eventHandlers={{
                        add: (event) => event.target.getElement()?.classList.add("route-line"),
                      }}
                    />
                  </>
                )}
                {track.points
                  .filter(({ event }) => event.event_type === "STORE_ARRIVAL")
                  .map(({ event, point }) => (
                    <Marker
                      key={`store-${event.id}`}
                      position={point}
                      icon={storeIcon()}
                    >
                      <Popup>
                        <div className="text-xs">
                          <p className="font-semibold">Store stop · {dispatch}</p>
                          <p>{event.notes || "Store arrival recorded"}</p>
                          <p>{new Date(event.event_time).toLocaleString()}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                <Marker position={latest.point} icon={truckIcon(track.trip.status)}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold">{dispatch}</p>
                      <p>Status: {String(track.trip.status ?? "Unknown")}</p>
                      <p>Event: {latest.event.event_type.replaceAll("_", " ")}</p>
                      <p>Recorded: {new Date(latest.event.event_time).toLocaleString()}</p>
                      {latest.event.notes && <p>{latest.event.notes}</p>}
                    </div>
                  </Popup>
                </Marker>
              </Fragment>
            );
          })}
        </MapContainer>
        {(markerCount === 0 || !selectedHasGps) && (
          <div className="pointer-events-none absolute inset-x-4 top-4 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-center text-sm text-slate-700 shadow-sm">
            {!selectedHasGps
              ? "No GPS position has been recorded for the selected trip."
              : eventLoadError
              ? "Trip GPS events could not be loaded."
              : "No GPS coordinates are recorded for these trips yet."}
          </div>
        )}
      </div>
      <footer className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span><span aria-hidden="true">🏬</span> Store stop</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#087f8c]" /> In progress</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3977a8]" /> Completed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#c7852a]" /> Delayed</span>
          <span className="text-slate-400">Routes follow recorded GPS events.</span>
        </div>
      </footer>
    </section>
  );
}