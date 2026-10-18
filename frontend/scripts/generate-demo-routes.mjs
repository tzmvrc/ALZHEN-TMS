#!/usr/bin/env node
/**
 * Bakes real road geometry for the demo trips (run once, commit the JSON).
 *
 *   MAPBOX_TOKEN=pk.xxx node scripts/generate-demo-routes.mjs [output.json]
 *
 * Default output: src/services/demo-road-geometry.json
 * Needs Node 18+ (global fetch). Waypoints are approximate landmarks; Mapbox
 * snaps each one to the nearest drivable road, and the snapped positions are
 * what the demo uses for the warehouse and stops, so every marker sits on the
 * route line.
 */
import { writeFile } from "node:fs/promises";

const token = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN;
if (!token) {
  console.error("Set MAPBOX_TOKEN (a public pk. token) first.");
  process.exit(1);
}
const out = process.argv[2] || "src/services/demo-road-geometry.json";

/* [name, lng, lat] — approximate is fine, Mapbox snaps to the road. */
const trips = [
  { city: "Metro Manila", wh: ["Valenzuela demonstration warehouse", 120.983, 14.7011], stops: [["SM City North EDSA", 121.029, 14.6567], ["Robinsons Place Manila", 120.983, 14.5788]] },
  { city: "Metro Manila", wh: ["Taguig demonstration warehouse", 121.05, 14.519], stops: [["SM Megamall", 121.0565, 14.5848], ["Greenhills Shopping Center", 121.0488, 14.6019]] },
  { city: "Metro Manila", wh: ["Bicutan demonstration warehouse", 121.0450, 14.485], stops: [["Alabang Town Center", 121.031, 14.4207], ["SM Mall of Asia", 120.9822, 14.5352]] },
  { city: "Laguna", wh: ["Biñan demonstration warehouse", 121.08, 14.335], stops: [["SM City Santa Rosa", 121.111, 14.31], ["SM City Calamba", 121.1645, 14.2103]] },
  { city: "Laguna", wh: ["Calamba demonstration warehouse", 121.1653, 14.2117], stops: [["SM City Santa Rosa", 121.111, 14.31], ["Alabang Town Center", 121.031, 14.4207]] },
  { city: "Cavite", wh: ["Imus demonstration warehouse", 120.9367, 14.4297], stops: [["SM City Bacoor", 120.947, 14.459], ["SM Southmall", 121.0108, 14.4337]] },
  { city: "Cebu", wh: ["Mandaue demonstration warehouse", 123.942, 10.3236], stops: [["SM City Cebu", 123.918, 10.3117], ["Ayala Center Cebu", 123.905, 10.3181]] },
  { city: "Cebu", wh: ["Mandaue demonstration warehouse", 123.942, 10.3236], stops: [["Colon Street", 123.9022, 10.295], ["SM Seaside City Cebu", 123.881, 10.281]] },
  { city: "Davao", wh: ["Davao demonstration warehouse", 125.59, 7.09], stops: [["Abreeza Mall", 125.612, 7.0912], ["SM City Davao Ecoland", 125.6086, 7.0586]] },
  { city: "Pampanga", wh: ["Clark demonstration warehouse", 120.53, 15.17], stops: [["SM City Clark", 120.546, 15.184], ["SM City Pampanga", 120.662, 15.062]] },
];

const result = [];
for (const trip of trips) {
  const points = [trip.wh, ...trip.stops];
  const coords = points.map(([, lng, lat]) => `${lng},${lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  const body = await response.json();
  const route = body.routes?.[0];
  if (!response.ok || !route) {
    console.error(`${trip.city} / ${trip.wh[0]} failed:`, body.message ?? response.status);
    process.exit(1);
  }
  const snapped = body.waypoints.map((w) => w.location);
  result.push({
    city: trip.city,
    warehouseName: trip.wh[0],
    warehouse: snapped[0],
    stops: trip.stops.map(([name], index) => ({ name, point: snapped[index + 1] })),
    geometry: route.geometry.coordinates,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
  });
  console.log(`✓ ${trip.city} · ${trip.wh[0]} · ${(route.distance / 1000).toFixed(1)} km`);
}
await writeFile(out, JSON.stringify(result));
console.log(`Wrote ${result.length} routes to ${out}`);
