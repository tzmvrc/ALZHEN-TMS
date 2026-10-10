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
/* Light base map, desaturated by the CSS filter below so the navy route stands out. */
const TILE_URL = CARTO_API_KEY
  ? `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`
  : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const MAP_NAVY = "#0b2341";
const MAP_BG = "#eceff3";

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

/* Softens the light tiles to a clean grey map and styles the Leaflet controls,
   tooltips, popups and attribution to match the dashboard. */
function NavyMapTheme() {
  return (
    <>
      <style>{`
        .navy-map { background: ${MAP_BG}; font-family: inherit; }
        .navy-map .leaflet-tile-pane { filter: grayscale(1) contrast(0.9) brightness(1.04); }
        .navy-map .leaflet-control-attribution {
          background: rgba(255, 255, 255, 0.72);
          color: #64748b;
          font-size: 10px;
        }
        .navy-map .leaflet-control-attribution a { color: #334155; }
        .navy-map .leaflet-bar {
          border: 0;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(11, 35, 65, 0.08), 0 6px 16px -8px rgba(11, 35, 65, 0.25);
        }
        .navy-map .leaflet-bar a {
          background: #fff;
          color: ${MAP_NAVY};
          border-color: #eef1f5;
        }
        .navy-map .leaflet-bar a:hover { background: #f2f6fa; }
        .navy-map .leaflet-tooltip {
          background: ${MAP_NAVY};
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
          font-weight: 600;
        }
        .navy-map .leaflet-tooltip-top:before { border-top-color: ${MAP_NAVY}; }
        .navy-map .leaflet-tooltip-bottom:before { border-bottom-color: ${MAP_NAVY}; }
        .navy-map .leaflet-popup-content-wrapper,
        .navy-map .leaflet-popup-tip {
          background: ${MAP_NAVY};
          color: #fff;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
        }
        .navy-map .leaflet-popup-content-wrapper { border-radius: 16px; }
        .navy-map .leaflet-popup-close-button { color: #9fb6d0; }
        .truck-badge {
          position: absolute;
          top: -7px;
          right: -7px;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 19px;
          height: 19px;
          border: 2px solid #fff;
          border-radius: 9999px;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
          animation: truck-badge-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .truck-badge--alert { animation: truck-badge-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both, truck-badge-pulse 1.8s ease-out 0.4s infinite; }
        @keyframes truck-badge-pop { from { transform: scale(0); } to { transform: scale(1); } }
        @keyframes truck-badge-pulse {
          0% { box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45), 0 0 0 0 rgba(245, 158, 11, 0.7); }
          70%, 100% { box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45), 0 0 0 9px rgba(245, 158, 11, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .truck-badge, .truck-badge--alert { animation: none; }
        }
      `}</style>
    </>
  );
}

type TruckKind = "completed" | "in-progress" | "cancelled" | "delayed" | "error";

function truckKind(status: unknown): TruckKind {
  const normalized = String(status ?? "").toUpperCase();
  if (/CANCEL|VOID/.test(normalized)) return "cancelled";
  if (/ERROR|FAIL|EXCEPTION|INCIDENT|BREAKDOWN/.test(normalized)) return "error";
  if (/COMPLET|DELIVER|FINISH/.test(normalized)) return "completed";
  if (/DELAY/.test(normalized)) return "delayed";
  return "in-progress";
}

function statusColor(status: unknown): string {
  switch (truckKind(status)) {
    case "completed":
      return "#64748b";
    case "cancelled":
    case "error":
      return "#ef4444";
    case "delayed":
      return "#f59e0b";
    default:
      return MAP_NAVY;
  }
}

/* Notification-style badge on the truck circle: check, road, X or exclamation. */
const BADGE_STYLE: Record<TruckKind, { bg: string; icon: string; label: string; pulse?: boolean }> = {
  completed: {
    bg: "#10b981",
    label: "Completed",
    icon: '<polyline points="5 12.5 10 17.5 19 7"/>',
  },
  "in-progress": {
    bg: "#2678b9",
    label: "On the road",
    icon: '<path d="M8.5 3 4.5 21"/><path d="M15.5 3 19.5 21"/><path d="M12 4.5v3.5"/><path d="M12 10.5v3.5"/><path d="M12 16.5v3.5"/>',
  },
  cancelled: {
    bg: "#ef4444",
    label: "Cancelled",
    icon: '<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>',
  },
  delayed: {
    bg: "#f59e0b",
    label: "Delayed",
    pulse: true,
    icon: '<path d="M12 5v8.5"/><path d="M12 18.5v.01"/>',
  },
  error: {
    bg: "#dc2626",
    label: "Error",
    pulse: true,
    icon: '<path d="M12 5v8.5"/><path d="M12 18.5v.01"/>',
  },
};

function truckBadge(kind: TruckKind): string {
  const badge = BADGE_STYLE[kind];
  return `<span class="truck-badge${badge.pulse ? " truck-badge--alert" : ""}" role="img" aria-label="${badge.label}" style="background:${badge.bg}"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${badge.icon}</svg></span>`;
}

function truckIcon(status: unknown) {
  const kind = truckKind(status);
  /* "cancelled" and "error" have no dedicated marker colour in the global CSS,
     so they reuse the closest existing one and rely on the badge for meaning. */
  const markerClass =
    kind === "cancelled" ? "completed" : kind === "error" ? "delayed" : kind;
  const muted = kind === "cancelled" ? ' style="filter:grayscale(1);opacity:.85"' : "";
  return L.divIcon({
    className: "",
    html: `<div class="truck-marker-wrap" style="position:relative;width:32px;height:32px"><div class="truck-marker truck-marker--${markerClass}" role="img" aria-label="Truck position"${muted}><span class="truck-marker-emoji truck-emoji-right">🚚</span></div>${truckBadge(kind)}</div>`,
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
    <section className={`overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(11,35,65,0.03)] ${fillHeight ? "flex h-full min-h-[460px] flex-col" : ""}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-[#0b2341]">
            Map overview
          </h2>
          <p className="text-[11px] text-slate-500">
            Latest GPS positions, recorded routes, and stops
          </p>
        </div>
        <span className="rounded-full bg-[#e6f0f9] px-3 py-1 text-[11px] font-semibold text-[#1d5f94]">
          {markerCount} {markerCount === 1 ? "vehicle" : "vehicles"}
        </span>
      </header>
      <div className={`relative mx-3 overflow-hidden rounded-2xl bg-[#eceff3] ${fillHeight ? "min-h-[360px] min-w-0 flex-1" : ""}`}>
        <NavyMapTheme />
        <MapContainer
          className="navy-map"
          center={center}
          zoom={6}
          style={
            fillHeight
              ? { position: "absolute", inset: 0, background: MAP_BG }
              : { height, width: "100%", background: MAP_BG }
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
                        weight: 9,
                        opacity: 0.95,
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
                        weight: 5,
                        opacity: 1,
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
                    fillColor: MAP_NAVY,
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
                  <Tooltip direction="top" offset={[0, -24]}>
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
          <div className="pointer-events-none absolute inset-x-4 top-4 z-[1000] rounded-xl border border-white/10 bg-[#0b2341]/90 px-3 py-2 text-center text-sm text-white shadow-lg backdrop-blur">
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
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">✓</span> Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#0b2341] text-[8px] font-bold text-white">≡</span> On the road
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">✕</span> Cancelled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">!</span> Delayed / error
          </span>
          <span className="text-slate-400">
          Routes follow recorded GPS fixes; unreported route segments are not inferred.
          </span>
        </div>
      </footer>
    </section>
  );
}