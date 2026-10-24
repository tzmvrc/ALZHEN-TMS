import {isApprovedDemoTrip} from "../../../services/demo-trip-identity";
import type { TripEvent, TripPage } from "../../../services/trip.service";
import type { ReportRow } from "../../../services/report.service";
import type { TripEventTrack, TripLocationRoute } from "../LiveTripMap";
import { reportBelongsToTrip } from "../../../services/trip-identity";

export type HomeSnapshot = {
  recent: TripPage["rows"]; photoUrls: Record<string, string>; tracks: TripEventTrack[];
  events: (TripEvent & { dispatch_number: string })[]; bookingRows: ReportRow[];
  eventsUnavailable: boolean; bookingUnavailable: boolean; bookingLimited: boolean; detailsLoading: boolean;
  total: number; inProgress: number; completed: number; planned: number; fetchedAt: number;
};
export type HomeStatus = "In progress" | "Delayed" | "Planned" | "Completed" | "Other";
export const STATUS_COLORS: Record<HomeStatus, string> = {
  "In progress": "#2678b9", Delayed: "#be4242", Planned: "#a86b12", Completed: "#16846c", Other: "#64748b",
};
export const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
export const normalized = (value: unknown) => text(value).toUpperCase().replaceAll("_", " ");
export function manilaDay(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Number.isFinite(Date.parse(raw)) ? raw : null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shortDay(value: string | null) {
  return value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : "Not set";
}
export type HomeTrip = {
  demonstration: boolean; id: string; reference: string; origin: string; destination: string; driver: string;
  plates: string[]; truckKeys: string[]; rawStatus: string; status: HomeStatus;
  loadingDay: string | null; dueDay: string | null; completionDay: string | null;
  stops: number; delivered: number; progress: number | null; issue: string | null;
};

/** Facts from the existing bounded overview read, never synthesized telemetry. */
export function buildHomeTrips(snapshot: HomeSnapshot): HomeTrip[] {
  const today = manilaDay(new Date().toISOString())!;
  const eventsByTrip = new Map(snapshot.tracks.map(track => [text(track.trip.id), track.events]));
  return snapshot.recent.flatMap(trip => {
    const id = text(trip.id);
    if (!id) return [];
    const rows = snapshot.bookingRows.filter(row => reportBelongsToTrip(row, id));
    const events = eventsByTrip.get(id) ?? [];
    const raw = normalized(trip.status);
    const completed = ["COMPLETED", "DELIVERED"].includes(raw);
    const cancelled = ["CANCELLED", "CANCELED", "VOID", "ARCHIVED"].includes(raw);
    const dueDay = manilaDay(trip.estimated_delivery_date);
    const delayed = !completed && !cancelled && (raw === "DELAYED" || Boolean(dueDay && dueDay < today));
    const status: HomeStatus = completed ? "Completed" : delayed ? "Delayed" : raw === "IN PROGRESS" ? "In progress" : raw === "PLANNED" ? "Planned" : "Other";
    const plates = [...new Set(rows.map(row => text(row.plate_number)).filter(Boolean))];
    const truckKeys = [...new Set(rows.map(row => text(row.truck_id ?? row._truck_id) || text(row.plate_number).toUpperCase()).filter(Boolean))];
    const stops = new Map<string, boolean>();
    for (const row of rows) {
      const stop = text(row.trip_stop_id ?? row._trip_stop_id);
      if (stop) stops.set(stop, Boolean(stops.get(stop)) || ["COMPLETED", "DELIVERED"].includes(normalized(row.delivery_status)) || Boolean(manilaDay(row.finish_unloading_time)));
    }
    const delivered = [...stops.values()].filter(Boolean).length;
    const completionDays = completed ? [
      ...(snapshot.bookingLimited ? [] : rows.map(row => manilaDay(row.finish_unloading_time))),
      ...events.filter(event => !event.trip_stop_id && ["COMPLETED", "TRIP_COMPLETED", "TRIP_FINISHED"].includes(event.event_type.toUpperCase())).map(event => manilaDay(event.event_time)),
    ].filter((day): day is string => day !== null).sort() : [];
    return [{ demonstration: isApprovedDemoTrip({id,dispatch_number:trip.dispatch_number,remarks:trip.remarks}), id, reference: text(trip.dispatch_number ?? trip.trip_reference) || id.slice(0, 8),
      origin: text(rows.find(row => row.warehouse_name || row.warehouse_code)?.warehouse_name) || text(rows.find(row => row.warehouse_code)?.warehouse_code) || "Warehouse not recorded",
      destination: [...new Set(rows.map(row => text(row.store_name)).filter(Boolean))].join(" · ") || "Destination not recorded",
      driver: [...new Set(rows.map(row => text(row.driver_name)).filter(Boolean))].join(", ") || "Driver not recorded",
      plates, truckKeys, rawStatus: text(trip.status).replaceAll("_", " ") || "Not recorded", status,
      loadingDay: manilaDay(trip.loading_date), dueDay, completionDay: completionDays.at(-1) ?? null,
      stops: stops.size, delivered, progress: stops.size ? Math.round(delivered / stops.size * 100) : null,
      issue: delayed ? raw === "DELAYED" ? "Flagged as delayed" : "Past estimated delivery date" : !snapshot.bookingUnavailable && !snapshot.bookingLimited && !snapshot.detailsLoading && raw === "IN PROGRESS" && !truckKeys.length ? "Truck assignment not recorded" : null,
    }];
  });
}

export function homeMapData(snapshot: HomeSnapshot, trips: HomeTrip[]) {
  const active = new Set(trips.filter(trip => trip.status !== "Other").map(trip => trip.id));
  const tracks: TripEventTrack[] = snapshot.recent.filter(trip => active.has(text(trip.id))).map(trip => ({ trip, events: snapshot.tracks.find(track => track.trip.id === trip.id)?.events ?? [] }));
  const routes: TripLocationRoute[] = [];
  const locationIds = new Set<string>();
  for (const trip of tracks) {
    const rows = snapshot.bookingRows.filter(row => reportBelongsToTrip(row, text(trip.trip.id)));
    const warehouse = text(trip.trip.warehouse_id) || text(rows.find(row => row._warehouse_id || row.warehouse_id)?._warehouse_id ?? rows.find(row => row.warehouse_id)?.warehouse_id);
    const stores = [...new Set(rows.map(row => text(row._store_id ?? row.store_id)).filter(Boolean))];
    if (warehouse) locationIds.add(warehouse);
    stores.forEach(store => locationIds.add(store));
    if (warehouse && stores.length) routes.push({ tripId: text(trip.trip.id), tripLabel: text(trip.trip.dispatch_number), originWarehouseId: warehouse, destinationStoreIds: stores });
  }
  return { tracks, routes, locationIds: [...locationIds], activeIds: active };
}

export function homeAnalytics(trips: HomeTrip[], snapshot: HomeSnapshot, days: number) {
  const today = manilaDay(new Date().toISOString())!;
  const end = Date.parse(`${today}T12:00:00Z`);
  const series = Array.from({ length: days }, (_, index) => {
    const day = new Date(end - (days - index - 1) * 86400000).toISOString().slice(0, 10);
    return { day, label: shortDay(day), trips: 0, completed: 0, events: 0 };
  });
  const byDay = new Map(series.map(point => [point.day, point]));
  for (const trip of trips) {
    const loading = trip.loadingDay ? byDay.get(trip.loadingDay) : null;
    if (loading) loading.trips++;
    const completion = trip.completionDay ? byDay.get(trip.completionDay) : null;
    if (completion) completion.completed++;
  }
  const ids = new Set(trips.map(trip => trip.id));
  for (const event of snapshot.events) {
    if (!ids.has(event.trip_id)) continue;
    const day = manilaDay(event.event_time), point = day ? byDay.get(day) : null;
    if (point) point.events++;
  }
  const cohort = trips.filter(trip => trip.loadingDay && byDay.has(trip.loadingDay));
  const distribution = (Object.keys(STATUS_COLORS) as HomeStatus[]).map(name => ({ name, value: cohort.filter(trip => trip.status === name).length, color: STATUS_COLORS[name] }));
  const comparable = trips.filter(trip => trip.status === "Completed" && trip.completionDay && trip.dueDay && byDay.has(trip.completionDay));
  const onTime = comparable.filter(trip => trip.completionDay! <= trip.dueDay!).length;
  const active = trips.filter(trip => ["In progress", "Delayed"].includes(trip.status));
  const assigned = active.filter(trip => trip.truckKeys.length > 0);
  return { series, distribution, cohort, onTime, late: comparable.length - onTime, comparable: comparable.length,
    assigned: assigned.length, active: active.length, truckCount: new Set(assigned.flatMap(trip => trip.truckKeys)).size,
    missingCompletion: trips.filter(trip => trip.status === "Completed" && (!trip.completionDay || !trip.dueDay)).length };
}
