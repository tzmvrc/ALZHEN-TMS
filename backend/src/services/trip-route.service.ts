import { supabaseAdmin } from "../config/supabase.js";
import { consumeReportReadRows, reportReadPageSize } from "./report-read-budget.js";
import { buildTripRoutes, type RouteNamedRecord, type RouteStop, type RouteTrip } from "./trip-route.logic.js";

const ID_BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

async function readByIds<T>(table: string, select: string, column: string, ids: string[]): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = reportReadPageSize(PAGE_SIZE);
  for (let index = 0; index < ids.length; index += ID_BATCH_SIZE) {
    const batchIds = ids.slice(index, index + ID_BATCH_SIZE);
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(select)
        .in(column, batchIds)
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as T[];
      consumeReportReadRows(table, page.length);
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }
  return rows;
}

/** Fetch one bounded, batched enrichment set for the distinct report trip IDs. */
export async function getTripRoutes(tripIds: string[], suppliedTrips?: RouteTrip[]): Promise<Map<string, string>> {
  const ids = [...new Set(tripIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];
  if (!ids.length) return new Map();

  const [trips, stops] = await Promise.all([
    suppliedTrips ? Promise.resolve(suppliedTrips.filter(trip=>ids.includes(trip.id))) : readByIds<RouteTrip>("trips", "id, warehouse_id", "id", ids),
    readByIds<RouteStop>("trip_stops", "id, trip_id, stop_sequence, store_id, customer_id", "trip_id", ids),
  ]);
  const warehouseIds = [...new Set(trips.map((trip) => trip.warehouse_id).filter((id): id is string => Boolean(id)))];
  const storeIds = [...new Set(stops.map((stop) => stop.store_id).filter((id): id is string => Boolean(id)))];
  const customerIds = [...new Set(stops.map((stop) => stop.customer_id).filter((id): id is string => Boolean(id)))];
  const [warehouses, stores, customers] = await Promise.all([
    readByIds<RouteNamedRecord>("warehouses", "id, name", "id", warehouseIds),
    readByIds<RouteNamedRecord>("customer_stores", "id, name", "id", storeIds),
    readByIds<RouteNamedRecord>("customers", "id, name", "id", customerIds),
  ]);

  return buildTripRoutes({ tripIds: ids, trips, stops, warehouses, stores, customers });
}
