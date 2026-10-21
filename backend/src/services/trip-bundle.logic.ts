import { decimal } from "./trip-import.logic.js";
import type { TripCreateInput } from "../types/trip.types.js";

type Row = Record<string, unknown>;
type Stop = Row & { line_items: Row[] };
type Assignment = Row & { truck_id: string; driver_id?: string | null; assignment_type: string };
export function validateTripBundle(input: unknown): { trip: Row; stops: Stop[]; assignments: Assignment[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid trip request.");
  const { trip, stops = [], assignments: requestedAssignments } = input as Row;
  if (!trip || typeof trip !== "object" || Array.isArray(trip)) throw new Error("Invalid trip details.");
  if (!Array.isArray(stops)) throw new Error("Delivery stops must be an array.");
  if ((trip as Row).driver_id && !(trip as Row).truck_id) throw new Error("A truck is required when assigning a driver.");
  if (requestedAssignments !== undefined && !Array.isArray(requestedAssignments)) {
    throw new Error("Assignments must be an array.");
  }
  if (Array.isArray(requestedAssignments) && ((trip as Row).truck_id || (trip as Row).driver_id)) {
    throw new Error("Use either trip truck fields or the assignments list, not both.");
  }
  const assignments: Assignment[] = [];
  if (Array.isArray(requestedAssignments)) {
    requestedAssignments.forEach((assignment, index) => {
      if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
        throw new Error("Each truck assignment must be an object.");
      }
      const row = assignment as Row;
      const truckId = row.truck_id;
      if (typeof truckId !== "string" || !truckId.trim()) {
        throw new Error("Each truck assignment requires a truck.");
      }

      let driverId: string | null | undefined;
      if (row.driver_id == null) {
        driverId = row.driver_id;
      } else if (typeof row.driver_id === "string" && row.driver_id.trim()) {
        driverId = row.driver_id.trim();
      } else {
        throw new Error("Assignment driver must be a valid identifier.");
      }

      const requestedType = row.assignment_type;
      if (requestedType != null && typeof requestedType !== "string") {
        throw new Error("Assignment type must be a string.");
      }
      assignments.push({
        ...row,
        truck_id: truckId.trim(),
        driver_id: driverId,
        assignment_type: typeof requestedType === "string" && requestedType.trim()
          ? requestedType.trim().toUpperCase()
          : index === 0 ? "PRIMARY" : "ADDITIONAL",
      });
    });
  } else {
    const tripRow = trip as Row;
    const truckId = tripRow.truck_id;
    if (typeof truckId === "string" && truckId.trim()) {
      const driverId = tripRow.driver_id;
      if (driverId != null && typeof driverId !== "string") {
        throw new Error("Assignment driver must be a valid identifier.");
      }
      assignments.push({
        truck_id: truckId.trim(),
        driver_id: typeof driverId === "string" ? driverId : null,
        assignment_type: "PRIMARY",
      });
    }
  }
  const assignedTrucks = new Set<string>();
  const assignedDrivers = new Set<string>();
  let primaryCount = 0;
  for (const assignment of assignments) {
    if (assignedTrucks.has(assignment.truck_id)) {
      throw new Error("A truck cannot be assigned to the same trip more than once.");
    }
    assignedTrucks.add(assignment.truck_id);
    if (assignment.driver_id && assignedDrivers.has(assignment.driver_id)) throw new Error("A driver cannot be assigned to different trucks in the same trip.");
    if (assignment.driver_id) assignedDrivers.add(assignment.driver_id);
    if (assignment.assignment_type === "PRIMARY") primaryCount += 1;
  }
  if (primaryCount > 1 || (assignments.length > 0 && primaryCount !== 1)) {
    throw new Error("Exactly one truck assignment must be primary.");
  }
  for (const stop of stops) {
    if (!stop || typeof stop !== "object" || Array.isArray(stop) || !Array.isArray(stop.line_items)) throw new Error("Each stop must have a product lines array.");
    for (const item of stop.line_items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Each product line must be an object.");
      for (const key of ["quantity","cbm","unit_cbm","stock_quantity"]) if(item[key]!=null) decimal(item[key],key);
    }
  }
  return { trip: trip as Row, stops: stops as Stop[], assignments };
}

type Dependencies = {
  createTrip: (input: TripCreateInput) => Promise<{ id: string }>;
  createStop: (tripId: string, input: Row) => Promise<Row>;
  createLine: (tripId: string, stopId: string, input: Row) => Promise<unknown>;
  createAssignment: (tripId: string, input: Row) => Promise<unknown>;
  /** Finds or creates a trip type from a typed-in name and returns its id. */
  resolveTripType?: (name: string) => Promise<string>;
  /** Finds or creates a product from a typed-in code and returns its id. */
  resolveProduct?: (code: string, category: string | null) => Promise<string>;
  rollback: (tripId: string) => Promise<void>;
};

export async function saveTripBundle(input: unknown, deps: Dependencies) {
  const { trip, stops, assignments } = validateTripBundle(input);
  const { truck_id, driver_id, trip_type_name, ...details } = trip;
  if (typeof trip_type_name === "string" && trip_type_name.trim()) {
    if (!deps.resolveTripType) throw new Error("Creating new trip types is not supported.");
    details.trip_type_id = await deps.resolveTripType(trip_type_name.trim());
  }

  // Turn typed-in product codes into product ids (once per code) before anything is saved.
  const productIds = new Map<string, string>();
  const prepared: Array<{ stop: Row; lines: Row[] }> = [];
  for (const { line_items, ...stop } of stops) {
    const lines: Row[] = [];
    for (const { new_product_code, new_product_category, ...line } of line_items) {
      const code = typeof new_product_code === "string" ? new_product_code.trim() : "";
      if (!line.product_id && code) {
        if (!deps.resolveProduct) throw new Error("Creating new product codes is not supported.");
        const key = code.toLowerCase();
        let id = productIds.get(key);
        if (!id) {
          const category = typeof new_product_category === "string" ? new_product_category.trim() : "";
          id = await deps.resolveProduct(code, category || null);
          productIds.set(key, id);
        }
        line.product_id = id;
      }
      lines.push(line);
    }
    prepared.push({ stop: { ...stop, stop_sequence: stop.stop_sequence ?? prepared.length + 1 }, lines });
  }

  const created = await deps.createTrip(details as TripCreateInput);
  try {
    for (const { stop, lines } of prepared) {
      const savedStop = await deps.createStop(created.id, stop);
      for (const line of lines) await deps.createLine(created.id, String(savedStop.id), line);
    }
    for (const assignment of assignments) {
      await deps.createAssignment(created.id, assignment);
    }
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
