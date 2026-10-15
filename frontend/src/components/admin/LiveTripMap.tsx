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
import { RefreshCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { fetchSavedMapLocations, type SavedMapLocation } from "../../services/master-data.service";
import type { TripEvent, TripRecord } from "../../services/trip.service";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim();
/* Light base map, desaturated by the CSS filter below so the navy route stands out.
   Mapbox raster tiles are 512px, so the TileLayer uses tileSize 512 and zoomOffset -1. */
const MAPBOX_STYLE = "mapbox/light-v11";
const TILE_URL = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/tiles/{z}/{x}/{y}{r}?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN ?? "")}`;
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const MAP_NAVY = "#0b2341";
const MAP_BG = "#eceff3";
const PIN_BLUE = "#2678b9";
const STORE_STOP_EMOJI = "📦";

/* Things whose coordinates round to the same value at this many decimals
   (4 ≈ 11 m) are treated as sharing one location and merged into one pin. */
const OVERLAP_PRECISION = 4;

export type TripEventTrack = {
  trip: TripRecord;
  events: TripEvent[];
};

export type TripLocationRoute = {
  tripId: string;
  tripLabel: string;
  originWarehouseId: string;
  destinationStoreIds: string[];
};

function pointKey(point: [number, number]): string {
  return `${point[0].toFixed(OVERLAP_PRECISION)}:${point[1].toFixed(OVERLAP_PRECISION)}`;
}

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
        .saved-location-marker {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border: 2px solid #fff;
          border-radius: 9999px;
          background: #fff;
          box-shadow: 0 2px 8px rgba(11, 35, 65, 0.35);
          font-size: 17px;
        }
        /* Shared-location pin: one chip per store/warehouse/truck stacked above a location pin. */
        .map-cluster {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          filter: drop-shadow(0 3px 5px rgba(11, 35, 65, 0.3));
        }
        /* White pill that groups the chips so they read as one label sitting on the pin. */
        .map-cluster-chips {
          display: flex;
          align-items: center;
          padding: 3px;
          border: 1px solid #e2e8f0;
          border-radius: 9999px;
          background: #fff;
        }
        .map-cluster-chip {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          margin-left: -6px;
          border: 2px solid #fff;
          border-radius: 9999px;
          background: #f1f5f9;
          box-shadow: 0 0 0 1px ${MAP_NAVY}22;
          font-size: 14px;
          line-height: 1;
        }
        .map-cluster-chip:first-child { margin-left: 0; }
        .map-cluster-chip .truck-badge {
          top: -5px;
          right: -5px;
          width: 14px;
          height: 14px;
          border-width: 1.5px;
        }
        .map-cluster-chip .truck-badge svg { width: 8px; height: 8px; }
        .map-cluster-chip--more {
          background: ${MAP_NAVY};
          color: #fff;
          font-size: 10px;
          font-weight: 700;
        }
        .map-cluster-list p { margin: 2px 0; }
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

/* Plain-language line for what the truck is doing. Drivers' updates carry a note such as
   "On route to <place>", which wins; otherwise fall back to the trip's ship-to store. */
function describeTruck(status: unknown, latestEvent: TripEvent, destinationNames: string[]): string {
  const kind = truckKind(status);
  if (kind === "completed") return "Delivered";
  if (kind === "cancelled") return "Cancelled";
  if (kind === "error") return "Needs attention";
  const notes = latestEvent.notes?.trim();
  let headline: string;
  if (notes && /^(on route|en route|arrived)/i.test(notes)) headline = notes;
  else if (latestEvent.event_type === "STORE_ARRIVAL") headline = "At delivery stop";
  else headline = destinationNames.length ? `On route to ${destinationNames[0]}` : "On route";
  return kind === "delayed" ? `Delayed · ${headline}` : headline;
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
    html: `<div class="store-marker" aria-label="Store stop">${STORE_STOP_EMOJI}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function savedLocationIcon(kind: SavedMapLocation["kind"]) {
  const isWarehouse = kind === "warehouse";
  return L.divIcon({
    className: "",
    html: `<div class="saved-location-marker" role="img" aria-label="${isWarehouse ? "Warehouse" : "Store"}">${isWarehouse ? "🏭" : "🏬"}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function tripEndpointIcon(kind: SavedMapLocation["kind"]) {
  const isWarehouse = kind === "warehouse";
  const label = isWarehouse ? "Origin warehouse" : "Ship-to store";
  const color = isWarehouse ? "#0b2341" : "#16876d";
  const emoji = isWarehouse ? "🏭" : "🏬";
  return L.divIcon({
    className: "",
    html: `<div role="img" aria-label="${label}" style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:2px solid #fff;border-radius:50%;background:${color};box-shadow:0 2px 8px rgba(11,35,65,.35);font-size:18px">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/* ---- Shared-location pin -------------------------------------------------
   When a store, warehouse and/or truck sit on the same spot they used to be
   drawn on top of each other. Instead they are merged into a single location
   pin, with one chip per item stacked in a row above it. */

type MapItemKind = "truck" | "warehouse" | "store" | "store-stop";
type MapItem = { label: string; kind: MapItemKind; status?: unknown };
type OverlapGroup = { key: string; point: [number, number]; items: MapItem[] };

const ITEM_EMOJI: Record<MapItemKind, string> = {
  truck: "🚚",
  warehouse: "🏭",
  store: "🏬",
  "store-stop": STORE_STOP_EMOJI,
};
const ITEM_ORDER: Record<MapItemKind, number> = {
  truck: 0,
  warehouse: 1,
  store: 2,
  "store-stop": 3,
};

const CLUSTER_CHIP = 26;
const CLUSTER_OVERLAP = 6;
const CLUSTER_PILL_PAD = 4;
const CLUSTER_PIN_W = 28;
const CLUSTER_PIN_H = 37;
const CLUSTER_MAX_CHIPS = 4;
const CLUSTER_HEIGHT = CLUSTER_CHIP + CLUSTER_PILL_PAD * 2 + 1 + CLUSTER_PIN_H;

function clusterIcon(items: MapItem[]) {
  const overflow = items.length > CLUSTER_MAX_CHIPS;
  const shown = overflow ? items.slice(0, CLUSTER_MAX_CHIPS - 1) : items;
  const chips = shown.map((item) => {
    if (item.kind === "truck") {
      return `<span class="map-cluster-chip">${ITEM_EMOJI.truck}${truckBadge(truckKind(item.status))}</span>`;
    }
    return `<span class="map-cluster-chip">${ITEM_EMOJI[item.kind]}</span>`;
  });
  if (overflow) {
    chips.push(
      `<span class="map-cluster-chip map-cluster-chip--more">+${items.length - shown.length}</span>`,
    );
  }
  const width = Math.max(
    chips.length * CLUSTER_CHIP - (chips.length - 1) * CLUSTER_OVERLAP + CLUSTER_PILL_PAD * 2 + 2,
    CLUSTER_PIN_W,
  );
  /* Classic teardrop pin with a white head and the item count. */
  const pin = `<svg viewBox="0 0 24 32" width="${CLUSTER_PIN_W}" height="${CLUSTER_PIN_H}" aria-hidden="true"><path d="M12 31.2C12 31.2 1.6 19.2 1.6 12A10.4 10.4 0 0 1 22.4 12c0 7.2-10.4 19.2-10.4 19.2z" fill="${PIN_BLUE}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="6.4" fill="#fff"/><text x="12" y="15.4" text-anchor="middle" font-size="9.5" font-weight="800" fill="${PIN_BLUE}" font-family="system-ui,sans-serif">${items.length}</text></svg>`;
  return L.divIcon({
    className: "",
    html: `<div class="map-cluster" role="img" aria-label="${items.length} locations at this point" style="width:${width}px"><div class="map-cluster-chips">${chips.join("")}</div>${pin}</div>`,
    iconSize: [width, CLUSTER_HEIGHT],
    iconAnchor: [width / 2, CLUSTER_HEIGHT],
    tooltipAnchor: [0, -CLUSTER_HEIGHT + 4],
    popupAnchor: [0, -CLUSTER_HEIGHT + 4],
  });
}

export default function LiveTripMap({
  tracks,
  locationIds,
  tripLocationRoutes,
  focusTripId,
  eventLoadError = false,
  height = 420,
  fillHeight = false,
}: {
  tracks: TripEventTrack[];
  locationIds?: string[];
  tripLocationRoutes?: TripLocationRoute[];
  focusTripId?: string | null;
  eventLoadError?: boolean;
  height?: number;
  fillHeight?: boolean;
}) {
  const { accessToken } = useAuth();
  const [locations, setLocations] = useState<SavedMapLocation[]>([]);
  const [locationsError, setLocationsError] = useState("");
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationReloadCount, setLocationReloadCount] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetchSavedMapLocations(accessToken)
      .then((results) => {
        if (!active) return;
        setLocations(results);
        setLocationsError("");
      })
      .catch((error: unknown) => {
        if (active) setLocationsError(error instanceof Error ? error.message : "Unable to load saved map locations.");
      })
      .finally(() => {
        if (active) setLocationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, locationReloadCount]);

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

  const tripCoords = useMemo(
    () => plotted.flatMap((track) => track.points.map((point) => point.point)),
    [plotted],
  );
  const visibleLocations = useMemo(() => {
    if (!locationIds) return locations;
    const allowed = new Set(locationIds);
    return locations.filter((location) => allowed.has(location.id));
  }, [locationIds, locations]);
  const destinationNamesByTrip = useMemo(() => {
    const namesById = new Map(visibleLocations.map((location) => [location.id, location.name]));
    return new Map(
      (tripLocationRoutes ?? []).map((route) => [
        route.tripId,
        [...new Set(route.destinationStoreIds)].flatMap((id) => namesById.get(id) ?? []),
      ]),
    );
  }, [tripLocationRoutes, visibleLocations]);
  const tripLocationSegments = useMemo(() => {
    const locationsById = new Map(visibleLocations.map((location) => [location.id, location]));
    return (tripLocationRoutes ?? []).flatMap((route) => {
      const origin = locationsById.get(route.originWarehouseId);
      if (!origin || origin.kind !== "warehouse") return [];
      return [...new Set(route.destinationStoreIds)].flatMap((storeId) => {
        const destination = locationsById.get(storeId);
        if (!destination || destination.kind !== "store") return [];
        return [{
          key: `${route.tripId}-${origin.id}-${destination.id}`,
          tripLabel: route.tripLabel,
          origin,
          destination,
          positions: [
            [origin.latitude, origin.longitude],
            [destination.latitude, destination.longitude],
          ] as [number, number][],
        }];
      });
    });
  }, [tripLocationRoutes, visibleLocations]);
  const originLocationIds = useMemo(
    () => new Set(tripLocationSegments.map((segment) => segment.origin.id)),
    [tripLocationSegments],
  );
  const destinationLocationIds = useMemo(
    () => new Set(tripLocationSegments.map((segment) => segment.destination.id)),
    [tripLocationSegments],
  );
  const locationCoords = useMemo(
    () => visibleLocations.map((location): [number, number] => [location.latitude, location.longitude]),
    [visibleLocations],
  );
  const allCoords = useMemo(
    () => [...tripCoords, ...locationCoords],
    [tripCoords, locationCoords],
  );
  const center: [number, number] = allCoords[0] ?? [12.8797, 121.774];
  const markerCount = plotted.length;
  const warehouseCount = visibleLocations.filter((location) => location.kind === "warehouse").length;
  const storeCount = visibleLocations.filter((location) => location.kind === "store").length;
  const overlapGroups = useMemo<OverlapGroup[]>(() => {
    const groups = new Map<string, OverlapGroup>();
    const add = (point: [number, number], item: MapItem) => {
      const key = pointKey(point);
      const group = groups.get(key) ?? { key, point, items: [] };
      if (!group.items.some((existing) => existing.label === item.label)) group.items.push(item);
      groups.set(key, group);
    };
    for (const location of visibleLocations) {
      const role = location.kind === "warehouse" && originLocationIds.has(location.id)
        ? "Origin warehouse"
        : location.kind === "store" && destinationLocationIds.has(location.id)
          ? "Ship-to store"
          : location.kind === "warehouse" ? "Warehouse" : "Store";
      add([location.latitude, location.longitude], {
        kind: location.kind === "warehouse" ? "warehouse" : "store",
        label: `${role} · ${location.name}`,
      });
    }
    for (const track of plotted) {
      const latest = track.points[track.points.length - 1];
      const dispatch = String(track.trip.dispatch_number ?? track.trip.id ?? "Trip");
      add(latest.point, {
        kind: "truck",
        status: track.trip.status,
        label: `Truck · ${dispatch} · ${describeTruck(track.trip.status, latest.event, destinationNamesByTrip.get(String(track.trip.id ?? "")) ?? [])}`,
      });
      for (const { event, point } of track.points) {
        if (event.event_type === "STORE_ARRIVAL") {
          add(point, { kind: "store-stop", label: `Store stop · ${dispatch}` });
        }
      }
    }
    return [...groups.values()]
      .filter((group) => group.items.length > 1)
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => ITEM_ORDER[a.kind] - ITEM_ORDER[b.kind]),
      }));
  }, [destinationLocationIds, destinationNamesByTrip, originLocationIds, plotted, visibleLocations]);
  /* Locations drawn as a merged pin; their individual markers are skipped below. */
  const overlapKeys = useMemo(
    () => new Set(overlapGroups.map((group) => group.key)),
    [overlapGroups],
  );
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
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#e6f0f9] px-3 py-1 text-[11px] font-semibold text-[#1d5f94]">
            {markerCount} {markerCount === 1 ? "vehicle" : "vehicles"}
          </span>
          <button
            type="button"
            aria-label="Reload map locations"
            title="Reload map locations"
            disabled={locationsLoading}
            onClick={() => {
              setLocationsLoading(true);
              setLocationsError("");
              setLocationReloadCount((count) => count + 1);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${locationsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
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
            tileSize={512}
            zoomOffset={-1}
            maxZoom={22}
          />
          <FitBounds coords={allCoords} />
          <FocusTrip tripId={focusTripId} tracks={latestMarkers} />
          {tripLocationSegments.map((segment) => (
            <Fragment key={segment.key}>
              <Polyline
                positions={segment.positions}
                pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.9, lineCap: "round" }}
              />
              <Polyline
                positions={segment.positions}
                pathOptions={{ color: "#2678b9", weight: 4, opacity: 0.9, dashArray: "7 8", lineCap: "round" }}
              >
                <Tooltip sticky>
                  {`${segment.tripLabel} · ${segment.origin.name} → ${segment.destination.name}`}
                </Tooltip>
              </Polyline>
            </Fragment>
          ))}
          {visibleLocations
            .filter((location) => !overlapKeys.has(pointKey([location.latitude, location.longitude])))
            .map((location) => {
              const isOrigin = originLocationIds.has(location.id) && location.kind === "warehouse";
              const isDestination = destinationLocationIds.has(location.id) && location.kind === "store";
              const role = isOrigin ? "Origin warehouse" : isDestination ? "Ship-to store" : location.kind === "warehouse" ? "Warehouse" : "Store";
              return (
              <Marker
                key={`${location.kind}-${location.id}`}
                position={[location.latitude, location.longitude]}
                icon={isOrigin || isDestination ? tripEndpointIcon(location.kind) : savedLocationIcon(location.kind)}
              >
                <Tooltip direction="top" offset={[0, -12]}>
                  {`${role} · ${location.name}`}
                </Tooltip>
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold">
                      {role} · {location.name}
                    </p>
                    {location.code && <p>Code: {location.code}</p>}
                    {[location.address, location.city, location.province].filter(Boolean).length > 0 && (
                      <p>{[location.address, location.city, location.province].filter(Boolean).join(", ")}</p>
                    )}
                    <p>{location.latitude}, {location.longitude}</p>
                  </div>
                </Popup>
              </Marker>
              );
            })}
          {plotted.map((track) => {
            const latest = track.points[track.points.length - 1];
            const first = track.points[0];
            const positions = track.points.map((point) => point.point);
            const color = statusColor(track.trip.status);
            const dispatch = String(
              track.trip.dispatch_number ?? track.trip.id ?? "Trip",
            );
            const truckIsMerged = overlapKeys.has(pointKey(latest.point));
            const statusLine = describeTruck(
              track.trip.status,
              latest.event,
              destinationNamesByTrip.get(String(track.trip.id ?? "")) ?? [],
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
                  .filter(
                    ({ event, point }) =>
                      event.event_type === "STORE_ARRIVAL" && !overlapKeys.has(pointKey(point)),
                  )
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
                {!truckIsMerged && (
                  <AnimatedTruckMarker
                    position={latest.point}
                    icon={truckIcon(track.trip.status)}
                  >
                    <Tooltip direction="top" offset={[0, -24]}>
                      {`${dispatch} · ${statusLine}`}
                    </Tooltip>
                    <Popup>
                      <div className="text-xs">
                        <p className="font-semibold">{dispatch}</p>
                        <p>{statusLine}</p>
                        <p>
                          Event: {latest.event.event_type.replaceAll("_", " ")}
                        </p>
                        <p>
                          Recorded:{" "}
                          {new Date(latest.event.event_time).toLocaleString()}
                        </p>
                        {latest.event.notes && latest.event.notes.trim() !== statusLine && <p>{latest.event.notes}</p>}
                      </div>
                    </Popup>
                  </AnimatedTruckMarker>
                )}
              </Fragment>
            );
          })}
          {overlapGroups.map((group) => (
            <Marker
              key={`overlap-${group.key}`}
              position={group.point}
              icon={clusterIcon(group.items)}
              zIndexOffset={2000}
            >
              <Tooltip direction="top" offset={[0, 0]}>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <p key={item.label}>{ITEM_EMOJI[item.kind]} {item.label}</p>
                  ))}
                </div>
              </Tooltip>
              <Popup>
                <div className="map-cluster-list text-xs">
                  <p className="font-semibold">{group.items.length} locations at this point</p>
                  {group.items.map((item) => (
                    <p key={item.label}>{ITEM_EMOJI[item.kind]} {item.label}</p>
                  ))}
                  <p>{group.point[0]}, {group.point[1]}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {(!MAPBOX_ACCESS_TOKEN || (markerCount === 0 && visibleLocations.length === 0) || !selectedHasGps) && (
          <div className="pointer-events-none absolute inset-x-4 top-4 z-[1000] rounded-xl border border-white/10 bg-[#0b2341]/90 px-3 py-2 text-center text-sm text-white shadow-lg backdrop-blur">
            {!MAPBOX_ACCESS_TOKEN
              ? "Map tiles unavailable: set VITE_MAPBOX_ACCESS_TOKEN."
              : !selectedHasGps
              ? "No GPS position has been recorded for the selected trip."
              : visibleLocations.length > 0
                ? "Showing saved warehouse and store locations. No trip GPS coordinates are recorded yet."
              : eventLoadError
                ? "Trip GPS events could not be loaded."
                : tracks.length === 0 && locationIds?.length === 0
                  ? "No active trips to show on the map."
                : "No GPS coordinates are recorded for these trips yet."}
          </div>
        )}
        {locationsError && (
          <div role="alert" className="absolute inset-x-4 bottom-4 z-[1000] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 shadow-lg">
            Saved warehouses and stores could not be loaded: {locationsError}
          </div>
        )}
      </div>
      <footer className="shrink-0 px-5 py-3 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span><span aria-hidden="true">🏭</span> Warehouse</span>
          <span><span aria-hidden="true">🏬</span> Store location</span>
          <span>
            <span aria-hidden="true">{STORE_STOP_EMOJI}</span> Store stop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block w-6 border-t-2 border-dashed border-[#2678b9]" /> Trip origin → ship-to
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 32" width="11" height="14" aria-hidden="true">
              <path d="M12 31C12 31 2 19.5 2 12a10 10 0 0 1 20 0c0 7.5-10 19-10 19z" fill={PIN_BLUE} />
              <circle cx="12" cy="12" r="4" fill="#fff" />
            </svg>
            Several items at one spot
          </span>
          <span>{warehouseCount} {warehouseCount === 1 ? "warehouse" : "warehouses"} · {storeCount} {storeCount === 1 ? "store" : "stores"} mapped</span>
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