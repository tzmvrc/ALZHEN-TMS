import { supabaseAdmin } from "../config/supabase.js";

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  type: string;
  detail: string;
  trip_id?: string | null;
};

const tripDateFields = [
  ["loading_date", "Loading"],
  ["estimated_delivery_date", "Estimated delivery"],
  ["signed_dr_upload_date", "Signed DR upload"],
  ["transmittal_date", "Transmittal"],
  ["tms_date", "TMS"],
  ["pod_ac_shipping_date", "POD / AC shipping"],
  ["request_received_at", "Request received"],
  ["departure_from_warehouse_at", "Warehouse departure"],
] as const;

async function rowsForRange(table: string, fields: string, dateField: string, start: string, end: string) {
  const { data, error } = await (supabaseAdmin.from(table) as any)
    .select(fields).gte(dateField, start).lt(dateField, end).limit(1000);
  if (error) throw new Error(`Unable to load calendar ${table} events.`);
  return (data ?? []) as Record<string, any>[];
}

function safeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : value;
}

export async function getCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
  const tripRequests = tripDateFields.map(([field]) => rowsForRange(
    "trips", "*", field, start, end,
  ).then((rows) => ({ field, rows })));
  const [tripGroups, stops, tripEvents, calls] = await Promise.all([
    Promise.all(tripRequests),
    Promise.all(["arrival_time", "start_unloading_time", "finish_unloading_time", "departure_time"].map((field) =>
      rowsForRange("trip_stops", "*", field, start, end).then((rows) => ({ field, rows })))),
    rowsForRange("trip_events", "*", "event_time", start, end),
    Promise.all(["date_assigned", "date_of_contact"].map((field) =>
      rowsForRange("store_calls", "*", field, start, end).then((rows) => ({ field, rows })))),
  ]);
  const relatedTripIds = [...new Set([
    ...stops.flatMap((group) => group.rows.map((row) => row.trip_id).filter((id): id is string => typeof id === "string")),
    ...tripEvents.map((row) => row.trip_id).filter((id): id is string => typeof id === "string"),
    ...calls.flatMap((group) => group.rows.map((row) => row.trip_id).filter((id): id is string => typeof id === "string")),
  ])];
  const relatedStoreIds = [...new Set([
    ...stops.flatMap((group) => group.rows.map((row) => row.store_id).filter((id): id is string => typeof id === "string")),
    ...calls.flatMap((group) => group.rows.map((row) => row.store_id).filter((id): id is string => typeof id === "string")),
  ])];
  const relatedWarehouseIds = [...new Set(stops.flatMap((group) => group.rows.map((row) => row.warehouse_id).filter((id): id is string => typeof id === "string")))];
  const [tripLookup, storeLookup, warehouseLookup] = await Promise.all([
    relatedTripIds.length ? supabaseAdmin.from("trips").select("id,dispatch_number,trip_number").in("id", relatedTripIds) : Promise.resolve({ data: [], error: null }),
    relatedStoreIds.length ? supabaseAdmin.from("customer_stores").select("id,name,code").in("id", relatedStoreIds) : Promise.resolve({ data: [], error: null }),
    relatedWarehouseIds.length ? supabaseAdmin.from("warehouses").select("id,name,code").in("id", relatedWarehouseIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (tripLookup.error || storeLookup.error || warehouseLookup.error) throw new Error("Unable to load related calendar details.");
  const tripById = new Map((tripLookup.data ?? []).map((row) => [row.id, row]));
  const storeById = new Map((storeLookup.data ?? []).map((row) => [row.id, row]));
  const warehouseById = new Map((warehouseLookup.data ?? []).map((row) => [row.id, row]));
  const events: CalendarEvent[] = [];
  for (const group of tripGroups) {
    const label = tripDateFields.find(([field]) => field === group.field)?.[1] ?? group.field;
    for (const row of group.rows) {
      const date = safeDate(row[group.field]);
      if (!date) continue;
      const number = row.dispatch_number ?? row.trip_number ?? "Trip";
      const detail = [row.customer_name, row.store_name, row.warehouse_name].filter(Boolean).join(" · ");
      events.push({ id: `${group.field}:${row.id}`, date, title: `${label} · ${number}`, type: label, detail: detail || "Trip activity", trip_id: row.id });
    }
  }
  const stopLabels: Record<string, string> = { arrival_time: "Stop arrival", start_unloading_time: "Unloading started", finish_unloading_time: "Unloading finished", departure_time: "Stop departure" };
  for (const group of stops) for (const row of group.rows) {
    const date = safeDate(row[group.field]); if (!date) continue;
    const trip = tripById.get(row.trip_id);
    const store = storeById.get(row.store_id);
    const warehouse = warehouseById.get(row.warehouse_id);
    const place = store ? [store.code, store.name].filter(Boolean).join(" · ") : warehouse ? [warehouse.code, warehouse.name].filter(Boolean).join(" · ") : "Trip stop";
    events.push({ id: `${group.field}:${row.id}`, date, title: `${stopLabels[group.field] ?? "Trip stop"} · ${trip?.dispatch_number ?? trip?.trip_number ?? `Stop ${row.stop_sequence ?? ""}`}`.trim(), type: stopLabels[group.field] ?? "Trip stop", detail: place, trip_id: row.trip_id ?? null });
  }
  for (const row of tripEvents) {
    const date = safeDate(row.event_time); if (!date) continue;
    const trip = tripById.get(row.trip_id);
    events.push({ id: `trip-event:${row.id}`, date, title: `${String(row.event_type ?? "Trip event").replaceAll("_", " ")} · ${trip?.dispatch_number ?? trip?.trip_number ?? "Trip"}`, type: "Trip event", detail: row.description ?? "Trip activity", trip_id: row.trip_id ?? null });
  }
  const callLabels: Record<string, string> = { date_assigned: "Store call assigned", date_of_contact: "Store contacted" };
  for (const group of calls) for (const row of group.rows) {
    const date = safeDate(row[group.field]); if (!date) continue;
    const trip = tripById.get(row.trip_id);
    const store = storeById.get(row.store_id);
    events.push({ id: `${group.field}:${row.id}`, date, title: `${callLabels[group.field] ?? "Store call"} · ${trip?.dispatch_number ?? trip?.trip_number ?? ""}`.trim(), type: "Store call", detail: [store?.code, store?.name, row.status].filter(Boolean).join(" · ") || row.notes || "Store call activity", trip_id: row.trip_id ?? null });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
