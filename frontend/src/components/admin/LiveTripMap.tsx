// src/components/admin/LiveTripMap.tsx
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { DispatchRecord, HubPin } from "../../types/dashboard";
import { SectionHeader } from "./DashboardPrimitives";

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;
const CARTO_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`;

/* ---------- Custom icons ---------- */
const truckIcon = (status: string, highlighted = false) => {
  const cls =
    status === "Completed"
      ? "truck-marker truck-marker--completed"
      : status === "Delayed"
        ? "truck-marker truck-marker--delayed"
        : "truck-marker truck-marker--in-progress";

  return L.divIcon({
    className: "",
    html: `<div class="${cls}" style="${
      highlighted
        ? "transform: scale(1.35); box-shadow: 0 0 0 4px rgba(59,130,246,0.35), 0 4px 10px rgba(15,23,42,0.35);"
        : ""
    }">🚚</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const hubIcon = () =>
  L.divIcon({
    className: "",
    html: `<div class="hub-marker">🏢</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const statusHex = (status: string) =>
  status === "Completed"
    ? "#3b82f6"
    : status === "Delayed"
      ? "#f59e0b"
      : "#10b981";

/* ---------- Fit bounds helper ---------- */
function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length === 0) return;
    if (coords.length === 1) {
      map.setView(coords[0], 9);
      return;
    }
    map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
  }, [coords, map]);
  return null;
}

/* ---------- Focus helper ---------- */
function FocusTrip({ coord }: { coord: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!coord) return;
    map.flyTo(coord, 9, { duration: 0.8 });
  }, [coord, map]);
  return null;
}

/* ---------- Legend ---------- */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/* ---------- Main component ---------- */
export default function LiveTripMap({
  rows = [],
  hubs = [],
  focusTripId,
  height = 420,
}: {
  rows?: DispatchRecord[];
  hubs?: HubPin[];
  focusTripId?: string | null;
  height?: number;
}) {
  const { routes, markers, allCoords } = useMemo(() => {
    const routes: { id: string; positions: [number, number][]; color: string }[] = [];
    const markers: { id: string; coord: [number, number]; trip: DispatchRecord }[] = [];
    const allCoords: [number, number][] = [];

    rows.forEach((trip) => {
      if (trip.originCoord && trip.destCoord) {
        const positions: [number, number][] = [trip.originCoord, trip.destCoord];
        if (trip.currentCoord) positions.splice(1, 0, trip.currentCoord);
        routes.push({ id: trip.id, positions, color: statusHex(trip.status) });
        allCoords.push(...positions);
      }
      if (trip.currentCoord) {
        markers.push({ id: trip.id, coord: trip.currentCoord, trip });
      }
    });

    hubs.forEach((h) => allCoords.push([h.lat, h.lng]));

    return { routes, markers, allCoords };
  }, [rows, hubs]);

  const center: [number, number] = allCoords[0] ?? [12.8797, 121.774];

  const focusCoord = useMemo(() => {
    if (!focusTripId) return null;
    const m = markers.find((x) => x.id === focusTripId);
    return m ? m.coord : null;
  }, [focusTripId, markers]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-5 pt-5">
        <SectionHeader eyebrow="Live" title="Fleet map" />
        <input
          placeholder="Search for fleet"
          className="hidden w-48 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-slate-900 sm:block"
        />
      </div>

      <div className="mt-3 overflow-hidden">
        <MapContainer
          center={center}
          zoom={6}
          style={{ height, width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url={CARTO_URL}
            subdomains={["a", "b", "c", "d"]}
            maxZoom={20}
          />

          <FitBounds coords={allCoords} />
          <FocusTrip coord={focusCoord} />

          {hubs.map((h) => (
            <Marker key={h.id} position={[h.lat, h.lng]} icon={hubIcon()}>
              <Popup>
                <strong>{h.name}</strong>
              </Popup>
            </Marker>
          ))}

          {routes.map((r) => (
            <Polyline
              key={r.id}
              positions={r.positions}
              pathOptions={{ color: r.color, weight: 3, opacity: 0.85 }}
              eventHandlers={{
                add: (e) => {
                  const el = e.target.getElement();
                  if (el) el.classList.add("route-line");
                },
              }}
            />
          ))}

          {markers.map((m) => (
            <Marker
              key={m.id}
              position={m.coord}
              icon={truckIcon(m.trip.status, m.id === focusTripId)}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">{m.trip.id}</p>
                  <p className="text-slate-500">{m.trip.route}</p>
                  <p className="mt-1">Driver: {m.trip.driver}</p>
                  <p>ETA: {m.trip.eta}</p>
                  <p
                    className="mt-1 font-semibold"
                    style={{ color: statusHex(m.trip.status) }}
                  >
                    {m.trip.status}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-6 border-t border-slate-100 py-3">
        <LegendDot color="#10b981" label="In transit" />
        <LegendDot color="#f59e0b" label="Delayed" />
        <LegendDot color="#3b82f6" label="Completed" />
        <LegendDot color="#0f172a" label="Hub" />
      </div>
    </div>
  );
}