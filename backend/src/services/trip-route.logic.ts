export type RouteTrip = { id: string; warehouse_id: string | null };
export type RouteStop = {
  id: string;
  trip_id: string;
  stop_sequence: number | null;
  store_id: string | null;
  customer_id: string | null;
};
export type RouteNamedRecord = { id: string; name: string | null };

function nonEmptyName(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/** Build display-only routes while keeping every source lookup tied to its exact ID. */
export function buildTripRoutes(input: {
  tripIds: string[];
  trips: RouteTrip[];
  stops: RouteStop[];
  warehouses: RouteNamedRecord[];
  stores: RouteNamedRecord[];
  customers: RouteNamedRecord[];
}): Map<string, string> {
  const wanted = new Set(input.tripIds.filter(Boolean));
  const tripsById = new Map(input.trips.map((trip) => [trip.id, trip]));
  const warehousesById = new Map(input.warehouses.map((row) => [row.id, row]));
  const storesById = new Map(input.stores.map((row) => [row.id, row]));
  const customersById = new Map(input.customers.map((row) => [row.id, row]));
  const stopsByTrip = new Map<string, RouteStop[]>();

  for (const stop of input.stops) {
    if (!wanted.has(stop.trip_id) || !tripsById.has(stop.trip_id)) continue;
    const tripStops = stopsByTrip.get(stop.trip_id) ?? [];
    tripStops.push(stop);
    stopsByTrip.set(stop.trip_id, tripStops);
  }

  const routes = new Map<string, string>();
  for (const tripId of wanted) {
    const trip = tripsById.get(tripId);
    if (!trip) continue;
    const parts = [
      nonEmptyName(trip.warehouse_id ? warehousesById.get(trip.warehouse_id)?.name : null) ?? "Warehouse not set",
    ];
    const orderedStops = [...(stopsByTrip.get(tripId) ?? [])].sort((left, right) => {
      const leftSequence = left.stop_sequence;
      const rightSequence = right.stop_sequence;
      if (leftSequence === null && rightSequence !== null) return 1;
      if (leftSequence !== null && rightSequence === null) return -1;
      if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) {
        return leftSequence - rightSequence;
      }
      return left.id.localeCompare(right.id);
    });

    for (const stop of orderedStops) {
      const destination = nonEmptyName(stop.store_id ? storesById.get(stop.store_id)?.name : null)
        ?? nonEmptyName(stop.customer_id ? customersById.get(stop.customer_id)?.name : null)
        ?? `Stop ${stop.stop_sequence ?? "(sequence unavailable)"}`;
      parts.push(destination);
    }
    routes.set(tripId, parts.join(" → "));
  }
  return routes;
}
