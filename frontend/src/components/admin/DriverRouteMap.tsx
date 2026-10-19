import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Crosshair, Maximize2, Minimize2, Navigation, Pause, Play } from "lucide-react";
import { demonstrationRoadTripFor } from "../../services/demo-road-routes";

/* Waze-style route view for the driver portal.
   DEMO: the truck replays the saved road route for this trip . It is not
   live GPS and nothing is sent anywhere. The same trip id shows the same demo route in
   the admin trip details, so dispatch and driver see matching maps. */

type Pt = [number, number];
type Path = { coords: Pt[]; cum: number[]; total: number };
type Ui = { remaining: number; next: { name: string; seq: number; meters: number } | null; stopsLeft: number };

const SPEED = 11; /* metres per second (about 40 km/h, a loaded truck in town) */
const RAD = Math.PI / 180;

const meters = (a: Pt, b: Pt) => {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

const bearing = (a: Pt, b: Pt) => {
  const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
};

const buildPath = (coords: Pt[]): Path => {
  const cum = [0];
  for (let i = 1; i < coords.length; i += 1) cum.push(cum[i - 1] + meters(coords[i - 1], coords[i]));
  return { coords, cum, total: cum[cum.length - 1] ?? 0 };
};

function pointAt(path: Path, distance: number): { point: Pt; index: number } {
  const last = path.coords.length - 1;
  if (distance <= 0) return { point: path.coords[0], index: 0 };
  if (distance >= path.total) return { point: path.coords[last], index: last };
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (path.cum[mid] <= distance) low = mid;
    else high = mid;
  }
  const span = path.cum[low + 1] - path.cum[low] || 1;
  const t = (distance - path.cum[low]) / span;
  const a = path.coords[low];
  const b = path.coords[low + 1];
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: low };
}

const line = (coordinates: Pt[]): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates },
});

const km = (value: number) => (value < 950 ? `${Math.max(10, Math.round(value / 10) * 10)} m` : `${(value / 1000).toFixed(1)} km`);

const round = "flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]";

export default function DriverRouteMap({ tripId, live = false, height = 440 }: { tripId: string; live?: boolean; height?: number }) {
  const trip = useMemo(() => demonstrationRoadTripFor(tripId), [tripId]);
  const coords = useMemo(() => ((trip.plannedCache?.geometry?.coordinates ?? []) as unknown as Pt[]), [trip]);
  const path = useMemo(() => buildPath(coords), [coords]);
  const stopMarks = useMemo(() => {
    let from = 0;
    return trip.stops.flatMap((stop) => {
      if (!stop.point) return [];
      const point: Pt = [stop.point.longitude, stop.point.latitude];
      let best = from;
      let bestDistance = Infinity;
      for (let i = from; i < coords.length; i += 1) {
        const d = meters(coords[i], point);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      from = best;
      return [{ id: stop.id, name: stop.name, seq: stop.sequence, point, at: path.cum[best] ?? 0 }];
    });
  }, [trip, coords, path]);
  const warehouse: Pt = trip.warehouse.point ? [trip.warehouse.point.longitude, trip.warehouse.point.latitude] : (coords[0] ?? [121.03, 14.58]);
  const duration = trip.plannedCache?.durationSeconds ?? path.total / 8.3;

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const truck = useRef<mapboxgl.Marker | null>(null);
  const pins = useRef<{ el: HTMLElement; at: number }[]>([]);
  const dist = useRef(0);
  const heading = useRef(0);
  const [supported] = useState(() => mapboxgl.supported());
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(live);
  const [playing, setPlaying] = useState(live);
  const [expanded, setExpanded] = useState(false);
  const [ui, setUi] = useState<Ui>({ remaining: path.total, next: null, stopsLeft: stopMarks.length });
  const followRef = useRef(following);
  const playingRef = useRef(playing);
  const expandedRef = useRef(expanded);
  useEffect(() => { followRef.current = following; }, [following]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  /* Starting the trip turns on follow + replay; before that it is a route preview. */
  useEffect(() => {
    setFollowing(live);
    setPlaying(live);
  }, [live, tripId]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  useEffect(() => {
    const node = container.current;
    if (!node || !supported || path.coords.length < 2) return;
    let disposed = false;
    dist.current = 0;
    heading.current = bearing(path.coords[0], path.coords[Math.min(6, path.coords.length - 1)]);
    const map = new mapboxgl.Map({
      container: node,
      accessToken: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
      style: "mapbox://styles/mapbox/light-v11",
      center: path.coords[0],
      zoom: 13,
      attributionControl: true,
    });
    mapRef.current = map;
    const unfollow = (event: object) => { if ("originalEvent" in event && event.originalEvent) setFollowing(false); };
    map.on("dragstart", unfollow);
    map.on("zoomstart", unfollow);
    map.on("rotatestart", unfollow);
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(node);

    map.on("load", () => {
      if (disposed) return;
      const empty = line([]);
      map.addSource("drv-route", { type: "geojson", data: line(path.coords) });
      map.addSource("drv-done", { type: "geojson", data: empty });
      map.addSource("drv-rest", { type: "geojson", data: line(path.coords) });
      const layout = { "line-join": "round", "line-cap": "round" } as const;
      map.addLayer({ id: "drv-casing", type: "line", source: "drv-route", layout, paint: { "line-color": "#ffffff", "line-width": 12 } });
      map.addLayer({ id: "drv-done", type: "line", source: "drv-done", layout, paint: { "line-color": "#9aa7b8", "line-width": 7 } });
      map.addLayer({ id: "drv-rest", type: "line", source: "drv-rest", layout, paint: { "line-color": "#2f80ed", "line-width": 7 } });

      const pin = (text: string, className: string, point: Pt, title: string, at: number) => {
        const el = document.createElement("div");
        el.className = `flex items-center justify-center border-2 border-white text-[11px] font-bold text-white shadow-md ${className}`;
        el.textContent = text;
        el.title = title;
        new mapboxgl.Marker({ element: el }).setLngLat(point).addTo(map);
        pins.current.push({ el, at });
      };
      pins.current = [];
      pin("W", "h-7 w-7 rounded-lg bg-[#0b2341]", warehouse, `Warehouse: ${trip.warehouse.name}`, -1);
      stopMarks.forEach((stop) => pin(String(stop.seq), "h-8 w-8 rounded-full bg-[#2678b9] text-sm", stop.point, `Stop ${stop.seq}: ${stop.name}`, stop.at));

      const arrow = document.createElement("div");
      arrow.className = "relative flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_6px_18px_rgba(11,35,65,0.45)] ring-4 ring-[#2f80ed]/30";
      arrow.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="#2f80ed" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 19.5 21 12 17 4.5 21z"/></svg>';
      arrow.setAttribute("role", "img");
      arrow.setAttribute("aria-label", "Your truck (demo position)");
      truck.current = new mapboxgl.Marker({ element: arrow, rotationAlignment: "map", pitchAlignment: "map" })
        .setLngLat(path.coords[0])
        .setRotation(heading.current)
        .addTo(map);

      const bounds = new mapboxgl.LngLatBounds(path.coords[0], path.coords[0]);
      path.coords.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: 50, duration: 0 });
      setLoaded(true);
    });

    return () => {
      disposed = true;
      resize.disconnect();
      truck.current = null;
      pins.current = [];
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, [tripId, supported, path, stopMarks, trip, warehouse[0], warehouse[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The replay loop: moves the truck along the road, keeps the camera behind it. */
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !path.total) return;
    const done = map.getSource("drv-done") as mapboxgl.GeoJSONSource | undefined;
    const rest = map.getSource("drv-rest") as mapboxgl.GeoJSONSource | undefined;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    let lastUi = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (playingRef.current) {
        dist.current += SPEED * dt;
        if (dist.current >= path.total) dist.current = 0;
      }
      const here = pointAt(path, dist.current);
      const ahead = pointAt(path, dist.current + 45);
      const same = here.point[0] === ahead.point[0] && here.point[1] === ahead.point[1];
      const target = same ? heading.current : bearing(here.point, ahead.point);
      const diff = ((target - heading.current + 540) % 360) - 180;
      heading.current = (heading.current + diff * Math.min(1, dt * 4) + 360) % 360;
      truck.current?.setLngLat(here.point).setRotation(heading.current);
      if (followRef.current) {
        map.jumpTo({
          center: here.point,
          bearing: heading.current,
          pitch: expandedRef.current ? 60 : 50,
          zoom: expandedRef.current ? 16.5 : 16,
          padding: expandedRef.current ? { top: 130, bottom: 150, left: 0, right: 0 } : { top: 90, bottom: 105, left: 0, right: 0 },
        });
      }
      if (now - lastPaint > 120) {
        lastPaint = now;
        done?.setData(line([...path.coords.slice(0, here.index + 1), here.point]));
        rest?.setData(line([here.point, ...path.coords.slice(here.index + 1)]));
      }
      if (now - lastUi > 250) {
        lastUi = now;
        const upcoming = stopMarks.find((stop) => stop.at > dist.current + 20) ?? null;
        pins.current.forEach(({ el, at }) => {
          const reached = at >= 0 && at <= dist.current + 20;
          el.style.opacity = reached ? "0.5" : "1";
          el.style.boxShadow = upcoming && at === upcoming.at ? "0 0 0 4px rgba(245,158,11,0.55)" : "";
        });
        setUi({
          remaining: Math.max(path.total - dist.current, 0),
          next: upcoming ? { name: upcoming.name, seq: upcoming.seq, meters: Math.max(upcoming.at - dist.current, 0) } : null,
          stopsLeft: stopMarks.filter((stop) => stop.at > dist.current + 20).length,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loaded, path, stopMarks]);

  /* Leaving follow mode shows the whole route again. */
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || following || !path.coords.length) return;
    const bounds = new mapboxgl.LngLatBounds(path.coords[0], path.coords[0]);
    path.coords.forEach((point) => bounds.extend(point));
    map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 400 });
    map.fitBounds(bounds, { padding: expanded ? 90 : 50, duration: 600 });
  }, [following, loaded, path, expanded]);

  const fraction = path.total ? ui.remaining / path.total : 0;
  const remainingSeconds = duration * fraction;
  const eta = new Date(Date.now() + remainingSeconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (!supported || path.coords.length < 2) {
    return (
      <div role="status" className="rounded-3xl bg-white p-5 text-sm text-slate-500 shadow-sm ring-1 ring-slate-900/5">
        {supported ? "Route map is unavailable for this trip." : "This browser can't show the route map."}
      </div>
    );
  }

  return (
    <div
      className={expanded ? "fixed inset-0 z-[60] bg-slate-100" : "relative overflow-hidden rounded-3xl bg-slate-100 shadow-sm ring-1 ring-slate-900/5"}
      style={expanded ? undefined : { height }}
    >
      <div ref={container} style={{ position: "absolute", inset: 0 }} aria-label="Route map" />

      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-2" style={expanded ? { paddingTop: "env(safe-area-inset-top)" } : undefined}>
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-[#0b2341] px-4 py-3 text-white shadow-lg">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Navigation aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
              {live ? (ui.next ? `Next stop ${ui.next.seq}` : "Route complete") : "Route preview"}
            </p>
            <p className="truncate text-sm font-bold">{ui.next?.name ?? stopMarks[0]?.name ?? "Delivery stop"}</p>
          </div>
          {live && ui.next && <p className="shrink-0 text-lg font-extrabold tabular-nums">{km(ui.next.meters)}</p>}
        </div>
        <div className="pointer-events-auto flex flex-col gap-2">
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Exit full screen" : "Full screen map"} className={round}>
            {expanded ? <Minimize2 aria-hidden="true" className="h-[18px] w-[18px]" /> : <Maximize2 aria-hidden="true" className="h-[18px] w-[18px]" />}
          </button>
          {live && (
            <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause demo drive" : "Resume demo drive"} className={round}>
              {playing ? <Pause aria-hidden="true" className="h-[18px] w-[18px]" /> : <Play aria-hidden="true" className="h-[18px] w-[18px]" />}
            </button>
          )}
          {!following && (
            <button type="button" onClick={() => setFollowing(true)} aria-label="Re-center on my truck" className={`${round} text-[#2f80ed]`}>
              <Crosshair aria-hidden="true" className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-7" style={expanded ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}>
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.4)] ring-1 ring-slate-900/5">
          <div className="min-w-0">
            <p className="text-xl font-extrabold leading-none tabular-nums text-[#0b2341]">{eta}</p>
            <p className="mt-1 text-[11px] text-slate-500">Arrival</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold leading-none tabular-nums text-[#0b2341]">{Math.max(1, Math.round(remainingSeconds / 60))} min</p>
            <p className="mt-1 text-[11px] text-slate-500">Remaining</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold leading-none tabular-nums text-[#0b2341]">{(ui.remaining / 1000).toFixed(1)} km</p>
            <p className="mt-1 text-[11px] text-slate-500">Distance</p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold leading-none tabular-nums text-[#0b2341]">{ui.stopsLeft}</p>
            <p className="mt-1 text-[11px] text-slate-500">{ui.stopsLeft === 1 ? "Stop left" : "Stops left"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}