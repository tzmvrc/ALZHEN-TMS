export type TransmittalStopRecord = {
  id: string;
  trip_id: string;
  stop_sequence: number | null;
  customer_id: string | null;
  store_id: string | null;
  delivery_status: string | null;
  finish_unloading_time: string | null;
  dr_number?: string | null;
  quantity?: number | null;
  total_cbm?: number | null;
  updated_at?: string | null;
  dr_version?: number;
};

export type TransmittalTripRecord = {
  dispatch_number?: string | null;
  id: string;
  warehouse_id: string | null;
  loading_date: string | null;
  lbc_tracking_number: string | null;
  pod_ac_shipping_date: string | null;
};

export type TransmittalWarehouse = { id: string; code: string | null };
export type TransmittalNamedRecord = { id: string; name: string | null };
export type TransmittalAssignment = { trip_id: string; truck_id: string | null; driver_id: string | null; assignment_type: string; unassigned_at: string | null };
export type TransmittalTruck = { id: string; plate_number: string | null };
export type TransmittalDriver = { id: string; first_name: string | null; last_name: string | null };
export type TransmittalLineItem = { trip_stop_id: string; dr_number: string | null; sap_so_number: string | null };

export type TransmittalSourceValues = {
  stops: TransmittalStopRecord[];
  trips: TransmittalTripRecord[];
  warehouses: TransmittalWarehouse[];
  stores: TransmittalNamedRecord[];
  customers: TransmittalNamedRecord[];
  assignments: TransmittalAssignment[];
  trucks: TransmittalTruck[];
  drivers: TransmittalDriver[];
  line_items: TransmittalLineItem[];
};

export type TransmittalCell = { value: unknown; version: number; row_id: string };
export type TransmittalTrackerRow = {
  assignment_id?: string | null;
  assigned_plate_number?: string | null;
  trip_stop_id: string;
  trip_id: string;
  dispatch_number?: string;
  transmittal_ref: string;
  warehouse_code: string;
  delivered_to: string;
  plate_number: string;
  driver_name: string;
  delivery_receipt_no: string;
  sales_order_no: string;
  /** No verified stop/tracker creation timestamp exists in the checked-in contracts. */
  date_created: string;
  status: string;
  lbc_waybill_no: string;
  shipping_date_via_lbc: string;
  remarks: string;
  loading_date: string;
  date_delivered: string;
  cells: Record<string, TransmittalCell>;
  legacy_conflicts: string[];
};

function distinct(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort();
}

function joinDistinct(values: Array<string | null | undefined>) {
  return distinct(values).join(", ");
}

function firstDate(values: Array<string | null | undefined>) {
  return distinct(values).map((value) => value.slice(0, 10)).sort()[0] ?? "";
}

const LEGACY_POD_VALUE_MAP_KEY = "__alzhen_transmittal_pod_values_v1";
export const TRACKER_EMPTY_OVERRIDE = { __alzhen_tracker_empty_override_v1__: true } as const;

export function isTrackerEmptyOverride(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).__alzhen_tracker_empty_override_v1__ === true);
}

/** Decode old POD-keyed TEXT cells only when every populated POD value agrees.
 * A conflict is surfaced to the user and is never chosen implicitly. */
export function resolveLegacyPodCellValue(value: unknown): { value: unknown; conflict: boolean } {
  if (typeof value !== "string") return { value, conflict: false };
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return { value, conflict: false }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { value, conflict: false };
  const values = (parsed as Record<string, unknown>)[LEGACY_POD_VALUE_MAP_KEY];
  if (!values || typeof values !== "object" || Array.isArray(values)) return { value, conflict: false };
  const populated = Object.values(values as Record<string, unknown>).filter((item) => item !== null && item !== undefined && item !== "");
  const distinctValues = new Map(populated.map((item) => [JSON.stringify(item), item]));
  if (distinctValues.size > 1) return { value: null, conflict: true };
  return { value: distinctValues.values().next().value ?? null, conflict: false };
}

export function shouldSeedDefaultStaffPermission(existingPermissions: unknown[]) {
  return existingPermissions.length === 0;
}

export function isTrackerCellVersionCurrent(expectedVersion: number, currentVersion: number | null | undefined) {
  return expectedVersion === (currentVersion ?? 0);
}

/** Run the cell CAS write before audit. A rejected CAS never reaches audit; an
 * audit failure is returned alongside the committed cell so callers can report
 * the partial outcome without presenting the save as failed. */
export async function persistTrackerCellAndAudit<T>(
  persist: () => Promise<T>,
  recordAudit: (saved: T) => Promise<void>,
): Promise<{ saved: T; auditError?: unknown }> {
  const saved = await persist();
  try {
    await recordAudit(saved);
    return { saved };
  } catch (auditError) {
    return { saved, auditError };
  }
}

export function filterTransmittalTrackerRowsByReference(rows: TransmittalTrackerRow[], reference: string) {
  return rows.filter((row) => row.transmittal_ref === reference);
}

export function isTransmittalEligible(stop: Pick<TransmittalStopRecord, "delivery_status">, hasStoredHistory: boolean) {
  return hasStoredHistory || /^(COMPLETED|COMPLETE|DELIVERED)$/i.test(String(stop.delivery_status ?? "").trim());
}

/** One row is driven exclusively by each trip_stops.id. Every enrichment is
 * grouped independently by its owning trip/stop so one-to-many sources cannot
 * multiply tracker rows. */
export function buildTransmittalTrackerRows(
  source: TransmittalSourceValues,
  cellsByStop: Map<string, Record<string, TransmittalCell>> = new Map(),
): TransmittalTrackerRow[] {
  const trips = new Map(source.trips.map((trip) => [trip.id, trip]));
  const warehouses = new Map(source.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const stores = new Map(source.stores.map((record) => [record.id, record.name ?? ""]));
  const customers = new Map(source.customers.map((record) => [record.id, record.name ?? ""]));
  const trucks = new Map(source.trucks.map((truck) => [truck.id, truck.plate_number ?? ""]));
  const drivers = new Map(source.drivers.map((driver) => [driver.id, [driver.first_name, driver.last_name].filter(Boolean).join(" ")]));
  const assignmentsByTrip = new Map<string, TransmittalAssignment[]>();
  for (const assignment of source.assignments) {
    if (assignment.assignment_type !== "PRIMARY" || assignment.unassigned_at !== null) continue;
    const list = assignmentsByTrip.get(assignment.trip_id) ?? [];
    list.push(assignment);
    assignmentsByTrip.set(assignment.trip_id, list);
  }
  const lineItemsByStop = new Map<string, TransmittalLineItem[]>();
  for (const item of source.line_items) {
    const list = lineItemsByStop.get(item.trip_stop_id) ?? [];
    list.push(item);
    lineItemsByStop.set(item.trip_stop_id, list);
  }

  const seenStopIds = new Set<string>();
  const stopSequenceById = new Map(source.stops.map((stop) => [stop.id, stop.stop_sequence ?? 0]));
  return source.stops.map((stop) => {
    if (!stop.id || !stop.trip_id) throw new Error("A tracker stop is missing its stable stop or trip ID.");
    if (seenStopIds.has(stop.id)) throw new Error("The trip_stops source returned a duplicate stop ID.");
    seenStopIds.add(stop.id);

    const trip = trips.get(stop.trip_id);
    const assignmentRows = assignmentsByTrip.get(stop.trip_id) ?? [];
    const items = lineItemsByStop.get(stop.id) ?? [];
    const storedCells = cellsByStop.get(stop.id) ?? {};
    const cells: Record<string, TransmittalCell> = {};
    const legacyConflicts: string[] = [];
    for (const [field, cell] of Object.entries(storedCells)) {
      const resolved = resolveLegacyPodCellValue(cell.value);
      cells[field] = { ...cell, value: isTrackerEmptyOverride(resolved.value) ? "" : resolved.value };
      if (resolved.conflict) legacyConflicts.push(field);
    }
    const getCell = (field: string, fallback: string) => {
      const cell = cells[field];
      if (!cell) return fallback;
      if (cell.value === "") return "";
      if (cell.value === null || cell.value === undefined) return fallback;
      return typeof cell.value === "string" ? cell.value : "";
    };
    // Match report views: ambiguous active PRIMARY assignments provide no
    // arbitrary vehicle/driver context, while the transaction row is retained.
    const assignments = assignmentRows.length === 1 ? assignmentRows : [];
    const itemDate = stop.finish_unloading_time?.slice(0, 10) ?? "";
    const legacyDrs = distinct(items.map((item) => item.dr_number));
    const legacyDr = getCell("delivery_receipt_no_override", legacyDrs.length === 1 ? legacyDrs[0] : "");
    if (stop.dr_number == null && !cells.delivery_receipt_no_override && legacyDrs.length > 1) legacyConflicts.push("delivery_receipt_no_override");
    const deliveryReceipt = stop.dr_number ?? legacyDr;
    // DR now writes the authoritative stop field. Keep legacy overrides stored
    // for history; the stop's DR version protects this source field.
    cells.delivery_receipt_no_override = { value: deliveryReceipt, version: Number(stop.dr_version ?? 0), row_id: stop.id };

    return {
      trip_stop_id: stop.id,
      trip_id: stop.trip_id,
      dispatch_number: trip?.dispatch_number ?? "",
      transmittal_ref: getCell("transmittal_ref", ""),
      warehouse_code: getCell("warehouse_code_override", warehouses.get(trip?.warehouse_id ?? "")?.code?.trim() ?? ""),
      delivered_to: getCell("delivered_to_override", stores.get(stop.store_id ?? "") || customers.get(stop.customer_id ?? "") || ""),
      plate_number: getCell("plate_number_override", joinDistinct(assignments.map((assignment) => trucks.get(assignment.truck_id ?? "")))),
      driver_name: joinDistinct(assignments.map((assignment) => drivers.get(assignment.driver_id ?? ""))),
      delivery_receipt_no: deliveryReceipt,
      sales_order_no: getCell("sales_order_no_override", joinDistinct(items.map((item) => item.sap_so_number))),
      date_created: getCell("date_created_override", ""),
      status: getCell("tracker_status", stop.delivery_status?.trim() ?? ""),
      lbc_waybill_no: getCell("lbc_waybill_no", trip?.lbc_tracking_number?.trim() ?? ""),
      shipping_date_via_lbc: getCell("lbc_shipping_date", trip?.pod_ac_shipping_date?.slice(0, 10) ?? ""),
      remarks: getCell("tracker_remarks", ""),
      loading_date: getCell("loading_date_override", trip?.loading_date?.slice(0, 10) ?? ""),
      date_delivered: getCell("delivery_date_override", itemDate),
      cells,
      legacy_conflicts: legacyConflicts.sort(),
    };
  }).sort((left, right) => {
    const leftStop = stopSequenceById.get(left.trip_stop_id) ?? 0;
    const rightStop = stopSequenceById.get(right.trip_stop_id) ?? 0;
    return left.trip_id.localeCompare(right.trip_id) || leftStop - rightStop || left.trip_stop_id.localeCompare(right.trip_stop_id);
  });
}

export function filterTransmittalTrackerRows(rows: TransmittalTrackerRow[], search: string) {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => [
    row.warehouse_code, row.delivered_to, row.plate_number, row.delivery_receipt_no,
    row.sales_order_no, row.transmittal_ref, row.date_created, row.status,
    row.lbc_waybill_no, row.shipping_date_via_lbc, row.remarks,
  ].some((value) => value.toLocaleLowerCase().includes(needle)));
}
