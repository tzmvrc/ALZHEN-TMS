export type ChangeSignal = { topic: string; revision: string };
export const ADMIN_CHANGE_TOPICS = [
  "trip_cargo_allocations", "trip_assignment_stops", "trips", "trip_stops", "trip_line_items", "trip_truck_assignments", "trip_events",
  "store_calls", "documents", "trip_images", "incidents", "incident_reasons", "demurrages",
  "backloads", "backload_items", "offloads", "offload_items", "loading_reports",
  "unloading_reports", "report_receipts", "operations_report_conversions",
  "pod_records", "pod_drive_files", "profiles", "admin_notifications", "customers",
  "customer_stores", "store_contacts", "store_exceptions", "warehouses", "drivers",
  "trucks", "truck_images", "trucking_companies", "trip_types", "products", "rate_cards",
  "billings", "payables", "receivables", "tms_dropdown_options", "tms_route_options",
  "flex_tables", "flex_columns", "flex_rows", "flex_cells", "flex_dropdown_options",
  "flex_table_permissions", "flex_cell_mentions", "shared_table_column_widths",
  "driver_trip_updates", "offload_deletion_jobs", "transaction_deletion_jobs",
] as const;
const topics = new Set<string>(ADMIN_CHANGE_TOPICS);

/** One bounded coalescer shared by websocket and recovery snapshots. Transport
 * is injected so ordering, deduplication and logout races can be tested locally. */
export function createAdminChangeFeed(options: {
  changed: (topics: string[]) => void;
  snapshot: () => Promise<ChangeSignal[]>;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const revisions = new Map<string, string>(), pending = new Set<string>();
  let active = true, request: Promise<void> | null = null, timer: ReturnType<typeof setTimeout> | null = null, epoch = 0;
  function ingest(signal: ChangeSignal) {
    if (!active || !topics.has(signal?.topic) || typeof signal.revision !== "string" || !signal.revision || revisions.get(signal.topic) === signal.revision) return;
    revisions.set(signal.topic, signal.revision); pending.add(signal.topic);
    if (timer === null) timer = options.schedule(() => {
      timer = null;
      if (!active) return;
      const changed = [...pending]; pending.clear();
      if (changed.length) options.changed(changed);
    }, 150);
  }
  return {
    push(signal: ChangeSignal) { if (active) { epoch++; ingest(signal); } },
    reconcile() {
      if (!active) return Promise.resolve();
      if (request) return request;
      const started = epoch;
      request = options.snapshot().then((rows) => {
        if (!active || started !== epoch) return;
        rows.forEach(ingest);
      }).catch(() => { /* Keep valid cached pages; the next recovery tick retries. */ }).finally(() => { request = null; });
      return request;
    },
    stop() { active = false; epoch++; pending.clear(); if (timer !== null) options.cancel(timer); },
  };
}
