import { supabaseAdmin } from "../config/supabase.js";
import { buildPaginationMeta } from "../utils/pagination.js";

export const DATABASE_SOURCES = [
  { name: "audit_logs", label: "Audit logs", kind: "table", orderBy: "created_at" },
  { name: "backloads", label: "Backloads", kind: "table", orderBy: "id" },
  { name: "billings", label: "Billings", kind: "table", orderBy: "id" },
  { name: "customer_stores", label: "Customer stores", kind: "table", orderBy: "id" },
  { name: "customers", label: "Customers", kind: "table", orderBy: "id" },
  { name: "demurrages", label: "Demurrages", kind: "table", orderBy: "id" },
  { name: "documents", label: "Documents", kind: "table", orderBy: "id" },
  { name: "drivers", label: "Drivers", kind: "table", orderBy: "id" },
  { name: "incident_reasons", label: "Incident reasons", kind: "table", orderBy: "id" },
  { name: "incidents", label: "Incidents", kind: "table", orderBy: "id" },
  { name: "offloads", label: "Offloads", kind: "table", orderBy: "id" },
  { name: "payables", label: "Payables", kind: "table", orderBy: "id" },
  { name: "products", label: "Products", kind: "table", orderBy: "id" },
  { name: "profiles", label: "Profiles", kind: "table", orderBy: "id" },
  { name: "rate_cards", label: "Rate cards", kind: "table", orderBy: "id" },
  { name: "receivables", label: "Receivables", kind: "table", orderBy: "id" },
  { name: "store_calls", label: "Store calls", kind: "table", orderBy: "id" },
  { name: "store_contacts", label: "Store contacts", kind: "table", orderBy: "id" },
  { name: "store_exceptions", label: "Store exceptions", kind: "table", orderBy: "id" },
  { name: "trip_events", label: "Trip events", kind: "table", orderBy: "event_time" },
  { name: "trip_line_items", label: "Trip line items", kind: "table", orderBy: "id" },
  { name: "trip_stops", label: "Trip stops", kind: "table", orderBy: "stop_sequence" },
  { name: "trip_truck_assignments", label: "Trip truck assignments", kind: "table", orderBy: "id" },
  { name: "trip_types", label: "Trip types", kind: "table", orderBy: "id" },
  { name: "trips", label: "Trips", kind: "table", orderBy: "loading_date" },
  { name: "trucking_companies", label: "Trucking companies", kind: "table", orderBy: "id" },
  { name: "trucks", label: "Trucks", kind: "table", orderBy: "id" },
  { name: "v_dispatch_monitoring", label: "Dispatch monitoring view", kind: "view", orderBy: "loading_date" },
  { name: "v_dispatch_report", label: "Dispatch report view", kind: "view", orderBy: "loading_date" },
  { name: "v_store_calling", label: "Store calling view", kind: "view", orderBy: "date_assigned" },
  { name: "v_tms_combined", label: "Combined TMS view", kind: "view", orderBy: "loading_date" },
  { name: "v_trip_booking", label: "Trip booking view", kind: "view", orderBy: "loading_date" },
] as const;

export async function getDatabaseSourcePage(
  sourceName: string,
  pageInput: unknown,
  limitInput: unknown,
) {
  const source = DATABASE_SOURCES.find((item) => item.name === sourceName);
  if (!source) throw new Error("Database source not found");

  const page = pageInput === undefined ? 1 : Number(pageInput);
  const limit = limitInput === undefined ? 25 : Number(limitInput);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error("page must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }

  const from = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from(source.name)
    .select("*", { count: "exact" })
    .order(source.orderBy, { ascending: false, nullsFirst: false })
    .range(from, from + limit - 1);

  if (error) {
    console.error("Database browser query failed:", {
      source: source.name,
      error,
    });
    throw new Error("Unable to read this database source");
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    source,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    rows,
    pagination: buildPaginationMeta(page, limit, count ?? rows.length),
  };
}