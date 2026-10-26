import { supabaseAdmin } from "../config/supabase.js";

const EVENT_TYPES = new Set([
  "WAREHOUSE_ARRIVAL", "LOADING_STARTED", "LOADING_FINISHED", "WAREHOUSE_DEPARTURE",
  "IN_TRANSIT", "ARRIVED", "UNLOADING_STARTED", "PARTIAL_UNLOAD", "UNLOADING_FINISHED",
  "STOP_DEPARTURE", "ASSIGNMENT_COMPLETED", "POD_SUBMITTED", "PHOTO_UPLOADED",
  "BACKLOAD_REPORTED", "OFFLOAD_REPORTED", "CUSTOM_STATUS", "STORE_ARRIVAL",
]);
type Source = "trip_events" | "driver_trip_updates";
type DriverRow = Record<string, unknown> & { id: string; trip_id: string };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function saveNotifications(entries: { source: Source; row: DriverRow }[], recipientId?: string, historical = false) {
  const tripIds = [...new Set(entries.map(entry => entry.row.trip_id))];
  const actorIds = [...new Set(entries.filter(entry => entry.source === "trip_events").map(entry => text(entry.row.recorded_by)).filter(Boolean))];
  const driverIds = [...new Set(entries.filter(entry => entry.source === "driver_trip_updates").map(entry => text(entry.row.driver_id)).filter(Boolean))];
  if (!tripIds.length) return;
  const [tripResult, recipientsResult, actorsResult, driversResult, assignmentsResult] = await Promise.all([
    supabaseAdmin.from("trips").select("id,dispatch_number,trip_reference,archived_at").in("id", tripIds),
    recipientId ? Promise.resolve({ data: [{ id: recipientId }], error: null }) : supabaseAdmin.from("profiles").select("id").in("role", ["ADMIN", "STAFF"]),
    actorIds.length ? supabaseAdmin.from("profiles").select("id,first_name,last_name,role").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
    driverIds.length ? supabaseAdmin.from("drivers").select("id,first_name,last_name").in("id", driverIds) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("trip_truck_assignments").select("id,trip_id,driver_id,unassigned_at,trucks(plate_number)").in("trip_id", tripIds).limit(500),
  ]);
  if (tripResult.error || recipientsResult.error || actorsResult.error || driversResult.error || assignmentsResult.error) throw new Error("Driver notification context unavailable.");
  const trips = new Map((tripResult.data ?? []).map(trip => [trip.id, trip]));
  const actors = new Map((actorsResult.data ?? []).map(actor => [actor.id, actor]));
  const drivers = new Map((driversResult.data ?? []).map(driver => [driver.id, driver]));
  const payload = entries.flatMap(({ source, row }) => {
    if (/SIMULATED|\[ALZHEN_.*DEMO/i.test(text(row.notes))) return [];
    if (source === "trip_events" && !EVENT_TYPES.has(text(row.event_type))) return [];
    const trip = trips.get(row.trip_id);
    if (!trip || trip.archived_at) return [];
    if (/^DEMO\d/i.test(text(trip.trip_reference) || text(trip.dispatch_number))) return [];
    const person = source === "trip_events" ? actors.get(text(row.recorded_by)) : drivers.get(text(row.driver_id));
    if (source === "trip_events" && actors.get(text(row.recorded_by))?.role !== "TRUCKER" && !row.assignment_id) return [];
    const driver = [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Driver";
    const assignment = (assignmentsResult.data ?? []).find(candidate => source === "trip_events"
      ? candidate.id === row.assignment_id
      : candidate.trip_id === row.trip_id && candidate.driver_id === row.driver_id && !candidate.unassigned_at);
    const truck = assignment?.trucks;
    const plate = text(truck?.[0]?.plate_number);
    const eventType = source === "trip_events" ? text(row.event_type) : text(row.status) || text(row.delivery_status);
    const title = source === "trip_events" && eventType === "CUSTOM_STATUS" && typeof (row.delivery_metadata as { title?: unknown } | null)?.title === "string"
      ? String((row.delivery_metadata as { title: string }).title) : eventType.replaceAll("_", " ").toLowerCase().replace(/^./, letter => letter.toUpperCase());
    const dispatch = text(trip.dispatch_number) || text(trip.trip_reference) || "Trip";
    const occurredAt = text(row.created_at) || text(row.updated_at) || text(row.event_time) || new Date().toISOString();
    return (recipientsResult.data ?? []).map(recipient => ({
    recipient_profile_id: recipient.id,
    actor_profile_id: source === "trip_events" && actors.has(text(row.recorded_by)) ? row.recorded_by : null,
    // The deployed constraint currently accepts this type; event_kind provides
    // the precise UI category without changing the existing contract.
    notification_type: "report_mention",
    reference_type: "trip",
    reference_id: row.trip_id,
    trip_id: row.trip_id,
    event_key: row.id,
    message: `${driver}${plate ? ` · ${plate}` : ""} · ${dispatch} · ${title}`,
    metadata: { event_kind: "driver_update", recovered: historical, source, source_id: row.id, dispatch_number: dispatch,
      driver_name: driver, plate_number: plate || null, event_type: eventType, stop_id: source === "trip_events" ? row.trip_stop_id ?? null : null,
      assignment_id: source === "trip_events" ? row.assignment_id ?? null : null },
    created_at: occurredAt,
    read_at: null,
    }));
  });
  if (!payload.length) return;
  const { error } = await supabaseAdmin.from("admin_notifications").upsert(payload, { onConflict: "recipient_profile_id,event_key", ignoreDuplicates: true });
  if (error) throw new Error(`Driver notification write failed: ${error.code}`);
}

const recentWrites = new Map<string, number>();
export async function notifyDriverActivity(source: Source, id: string) {
  const key = `${source}:${id}`;
  if ((recentWrites.get(key) ?? 0) > Date.now() - 120_000) return;
  recentWrites.set(key, Date.now());
  for (const [stored, at] of recentWrites) if (at < Date.now() - 120_000) recentWrites.delete(stored);
  try {
  const projection = source === "trip_events"
    ? "id,trip_id,trip_stop_id,assignment_id,recorded_by,event_type,event_time,created_at,notes,delivery_metadata"
    : "id,trip_id,driver_id,status,delivery_status,updated_at,created_at";
  const { data, error } = await supabaseAdmin.from(source).select(projection).eq("id", id).maybeSingle();
  if (error) throw new Error("Driver activity could not be loaded for notification.");
  if (data) await saveNotifications([{ source, row: data as unknown as DriverRow }]);
  } catch (error) { recentWrites.delete(key); throw error; }
}

const lastBackfill = new Map<string, number>();
export async function backfillDriverNotifications(recipientId: string) {
  if ((lastBackfill.get(recipientId) ?? 0) > Date.now() - 60_000) return;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const [events, updates] = await Promise.all([
    supabaseAdmin.from("trip_events").select("id,trip_id,trip_stop_id,assignment_id,recorded_by,event_type,event_time,created_at,notes,delivery_metadata").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    supabaseAdmin.from("driver_trip_updates").select("id,trip_id,driver_id,status,delivery_status,updated_at,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
  ]);
  if (events.error || updates.error) throw new Error("Recent driver activity unavailable.");
  await saveNotifications([
    ...(events.data ?? []).map(row => ({ source: "trip_events" as const, row: row as DriverRow })),
    ...(updates.data ?? []).map(row => ({ source: "driver_trip_updates" as const, row: row as DriverRow })),
  ], recipientId, true);
  lastBackfill.set(recipientId, Date.now());
}
