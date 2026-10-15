import type { TripCreateInput } from "../types/trip.types.js";

type Row = Record<string, unknown>;
type Stop = Row & { line_items: Row[] };
export function validateTripBundle(input: unknown): { trip: Row; stops: Stop[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid trip request.");
  const { trip, stops } = input as Row;
  if (!trip || typeof trip !== "object" || Array.isArray(trip)) throw new Error("Invalid trip details.");
  if (!Array.isArray(stops) || !stops.length) throw new Error("At least one delivery stop is required.");
  if (!(trip as Row).dispatch_number || !(trip as Row).loading_date || !(trip as Row).warehouse_id) throw new Error("Dispatch reference, loading date, and warehouse are required.");
  if ((trip as Row).driver_id && !(trip as Row).truck_id) throw new Error("A truck is required when assigning a driver.");
  for (const stop of stops) {
    if (!stop || typeof stop !== "object" || !stop.store_id || !Array.isArray(stop.line_items) || !stop.line_items.length) throw new Error("Each stop requires a store and product lines.");
    for (const item of stop.line_items) {
      if (!item || typeof item !== "object" || !item.product_id || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("Each product line requires a product and a positive whole quantity.");
      if (item.cbm != null && (typeof item.cbm !== "number" || !Number.isFinite(item.cbm) || item.cbm < 0)) throw new Error("Total CBM must be a non-negative number.");
    }
  }
  return { trip: trip as Row, stops: stops as Stop[] };
}

type Dependencies = {
  createTrip: (input: TripCreateInput) => Promise<{ id: string }>;
  createStop: (tripId: string, input: Row) => Promise<Row>;
  createLine: (tripId: string, stopId: string, input: Row) => Promise<unknown>;
  createAssignment: (tripId: string, input: Row) => Promise<unknown>;
  rollback: (tripId: string) => Promise<void>;
};

export async function saveTripBundle(input: unknown, deps: Dependencies) {
  const { trip, stops } = validateTripBundle(input);
  const { truck_id, driver_id, ...details } = trip;
  const created = await deps.createTrip(details as TripCreateInput);
  try {
    for (const { line_items, ...stop } of stops) {
      const savedStop = await deps.createStop(created.id, stop);
      for (const item of line_items) await deps.createLine(created.id, String(savedStop.id), item);
    }
    if (truck_id) await deps.createAssignment(created.id, { truck_id, driver_id: driver_id || null, assignment_type: "PRIMARY" });
    return created;
  } catch (error) {
    try { await deps.rollback(created.id); }
    catch (cleanupError) {
      console.error("Trip creation rollback failed", { tripId: created.id, cleanupError });
      throw new Error(`Trip ${created.id} was partially saved. Contact an administrator before retrying.`);
    }
    throw error;
  }
}
