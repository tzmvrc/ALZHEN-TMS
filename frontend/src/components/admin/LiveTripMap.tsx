import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
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
  if (
    event.latitude === null ||
    event.latitude === undefined ||
    event.longitude === null ||
    event.longitude === undefined
  ) {
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
    if (coords.length > 1)
      map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
  }, [coords, map]);
  return null;
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false, debounceMoveend: true });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
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

function AnimatedTruckMarker({
  position,
  icon,
  children,
}: {
  position: [number, number];
  icon: L.DivIcon;
  children: ReactNode;
}) {
  const [displayedPosition, setDisplayedPosition] = useState(position);
  const currentPosition = useRef(position);
  const latitude = position[0];
  const longitude = position[1];

  useEffect(() => {
    const target: [number, number] = [latitude, longitude];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = currentPosition.current;
    if (reduceMotion || (from[0] === target[0] && from[1] === target[1])) {
      currentPosition.current = target;
      setDisplayedPosition(target);
      return;
    }

    const startedAt = performance.now();
    const duration = 1200;
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const next: [number, number] = [
        from[0] + (target[0] - from[0]) * eased,
        from[1] + (target[1] - from[1]) * eased,
      ];
      currentPosition.current = next;
      setDisplayedPosition(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
      else currentPosition.current = target;
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [latitude, longitude]);

  return (
    <Marker position={displayedPosition} icon={icon}>
      {children}
    </Marker>
  );
}

function statusColor(status: unknown): string {
  const normalized = String(status ?? "").toUpperCase();
  if (/COMPLET|DELIVER|FINISH/.test(normalized)) return "#94a3b8";
  if (/DELAY/.test(normalized)) return "#f59e0b";
  return "#2678b9";
}

function truckIcon(status: unknown) {
  const normalized = String(status ?? "").toUpperCase();
  const kind =
    /COMPLET|DELIVER|FINISH/.test(normalized)
      ? "completed"
      : /DELAY/.test(normalized)
        ? "delayed"
        : "in-progress";
  return L.divIcon({
    className: "",
    html: `<div class="truck-marker truck-marker--${kind}" role="img" aria-label="Truck position"><span class="truck-marker-emoji truck-emoji-right">🚚</span></div>`,
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
  fillHeight = false,
}: {
  tracks: TripEventTrack[];
  focusTripId?: string | null;
  eventLoadError?: boolean;
  height?: number;
  fillHeight?: boolean;
}) {
  const plotted = useMemo(
    () =>
      tracks
        .map((track) => {
          const points = track.events
            .slice()
            .sort(
              (a, b) => Date.parse(a.event_time) - Date.parse(b.event_time),
            )
            .flatMap((event) => {
              const point = coordinates(event);
              return point ? [{ event, point }] : [];
            });
          return { ...track, points };
        })
        .filter((track) => track.points.length > 0),
    [tracks],
  );

  const allCoords = useMemo(
    () => plotted.flatMap((track) => track.points.map((point) => point.point)),
    [plotted],
  );
  const center: [number, number] = allCoords[0] ?? [12.8797, 121.774];
  const markerCount = plotted.length;
  const latestMarkers = useMemo(
    () =>
      plotted.map((track) => ({
        id: String(track.trip.id ?? track.trip.dispatch_number ?? ""),
        point: track.points[track.points.length - 1].point,
      })),
    [plotted],
  );
  const selectedHasGps =
    !focusTripId || latestMarkers.some((marker) => marker.id === focusTripId);

  return (
    <section className={`overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_8px_28px_-20px_rgba(11,35,65,0.25)] ${fillHeight ? "flex h-full min-h-[460px] flex-col" : ""}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-[#0b2341]">
            Live location
          </h2>
          <p className="text-[11px] text-slate-500">
            Latest GPS positions, recorded routes, and stops
          </p>
        </div>
        <span className="rounded-full bg-[#e6f0f9] px-3 py-1 text-[11px] font-semibold text-[#1d5f94]">
          {markerCount} {markerCount === 1 ? "vehicle" : "vehicles"}
        </span>
      </header>
      <div className={`relative mx-3 overflow-hidden rounded-2xl border border-slate-200/70 ${fillHeight ? "min-h-[360px] min-w-0 flex-1" : ""}`}>
        <MapContainer
          center={center}
          zoom={6}
          style={
            fillHeight
              ? { position: "absolute", inset: 0 }
              : { height, width: "100%" }
          }
          scrollWheelZoom={false}
        >
          <ResizeMap />
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
            const first = track.points[0];
            const positions = track.points.map((point) => point.point);
            const color = statusColor(track.trip.status);
            const dispatch = String(
              track.trip.dispatch_number ?? track.trip.id ?? "Trip",
            );
            return (
              <Fragment key={String(track.trip.id ?? dispatch)}>
                {positions.length > 1 && (
                  <>
                    <Polyline
                      positions={positions}
                      pathOptions={{
                        color: "#ffffff",
                        weight: 8,
                        opacity: 0.8,
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                      eventHandlers={{
                        add: (event) =>
                          event.target
                            .getElement()
                            ?.classList.add("route-line"),
                      }}
                    />
                    <Polyline
                      positions={positions}
                      pathOptions={{
                        color,
                        weight: 4,
                        opacity: 0.9,
                        dashArray: "8 5",
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    />
                  </>
                )}
                <CircleMarker
                  center={first.point}
                  radius={5}
                  pathOptions={{
                    color,
                    weight: 2,
                    fillColor: "#fff",
                    fillOpacity: 1,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -5]}>
                    {`First GPS fix · ${dispatch}`}
                  </Tooltip>
                </CircleMarker>
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
                          <p className="font-semibold">
                            Store stop · {dispatch}
                          </p>
                          <p>{event.notes || "Store arrival recorded"}</p>
                          <p>
                            {new Date(event.event_time).toLocaleString()}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                <AnimatedTruckMarker
                  position={latest.point}
                  icon={truckIcon(track.trip.status)}
                >
                  <Tooltip direction="top" offset={[0, -18]}>
                    {`${dispatch} · ${String(track.trip.status ?? "Unknown")}`}
                  </Tooltip>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold">{dispatch}</p>
                      <p>
                        Status: {String(track.trip.status ?? "Unknown")}
                      </p>
                      <p>
                        Event: {latest.event.event_type.replaceAll("_", " ")}
                      </p>
                      <p>
                        Recorded:{" "}
                        {new Date(latest.event.event_time).toLocaleString()}
                      </p>
                      {latest.event.notes && <p>{latest.event.notes}</p>}
                    </div>
                  </Popup>
                </AnimatedTruckMarker>
              </Fragment>
            );
          })}
        </MapContainer>
        {(markerCount === 0 || !selectedHasGps) && (
          <div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-sm text-slate-700 shadow-sm backdrop-blur">
            {!selectedHasGps
              ? "No GPS position has been recorded for the selected trip."
              : eventLoadError
                ? "Trip GPS events could not be loaded."
                : "No GPS coordinates are recorded for these trips yet."}
          </div>
        )}
      </div>
      <footer className="shrink-0 px-5 py-3 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>
            <span aria-hidden="true">🏬</span> Store stop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> In
            progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Delayed
          </span>
          <span className="text-slate-400">
          Routes follow recorded GPS fixes; unreported route segments are not inferred.
          </span>
        </div>
      </footer>
    </section>
  );
}