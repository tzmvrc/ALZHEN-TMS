import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { invalidateApiCache } from "./api.service";
import {
  invalidateReportPageCache,
  REPORTS,
  type ReportKey,
} from "./report.service";
import { TRANSMITTAL_TRACKER_ENDPOINT } from "./transmittal-tracker.service";

export type RealtimePayload = {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
  table: string;
};

// Tables are based on the checked-in view definitions and report enrichment queries.
export const REPORT_REALTIME_TABLES: Record<ReportKey, readonly string[]> = {
  combined: [
    "flex_cells", "flex_rows", "flex_columns", "flex_tables",
    "trips",
    "trip_truck_assignments",
    "trucks",
    "drivers",
    "trucking_companies",
    "trip_stops",
    "customers",
    "customer_stores",
    "trip_line_items",
    "products",
    "profiles",
    "trip_events",
    "trip_types",
    "warehouses",
  ],
  "dispatch-monitoring": [
    "flex_cells", "flex_rows", "flex_columns", "flex_tables",
    "trips",
    "trip_truck_assignments",
    "trucks",
    "drivers",
    "trucking_companies",
    "trip_stops",
    "customers",
    "customer_stores",
    "profiles",
    "trip_events",
    "trip_types",
    "warehouses",
  ],
  dispatch: [
    "trips",
    "trip_stops",
    "trip_line_items",
    "products",
    "customer_stores",
    "customers",
    "trip_truck_assignments",
    "trucks",
    "drivers",
    "trucking_companies",
    "profiles",
    "incidents",
    "backloads",
    "offloads",
    "warehouses",
  ],
  "trip-booking": [
    "trips",
    "trip_stops",
    "trip_line_items",
    "products",
    "trip_truck_assignments",
    "trucks",
    "drivers",
    "trucking_companies",
    "profiles",
    "billings",
    "customers",
    "customer_stores",
    "warehouses",
    "trip_types",
  ],
  "store-calling": [
    "store_calls",
    "trip_stops",
    "trip_truck_assignments",
    "trips",
    "profiles",
    "customers",
    "customer_stores",
    "trucks",
    "drivers",
  ],
};

export const TRANSMITTAL_TRACKER_REALTIME_TABLES = [
  "trips", "trip_stops", "trip_line_items", "trip_truck_assignments", "trucks",
  "drivers", "customer_stores", "customers", "warehouses", "flex_cells", "flex_rows",
] as const;

/** Existing source tables used by authenticated admin pages. Publication
 * membership is a deployment setting and cannot be inferred from this list. */
export const ADMIN_REALTIME_TABLES = [...new Set([
  ...Object.values(REPORT_REALTIME_TABLES).flat(),
  ...TRANSMITTAL_TRACKER_REALTIME_TABLES,
  "trip_images",
  "documents",
  "truck_images",
  "store_contacts",
  "admin_notifications",
  "loading_reports",
  "unloading_reports",
  "offload_items",
  "report_receipts",
  "operations_report_conversions",
  // Flexible tracker metadata and cells are also source dependencies.
  "flex_rows",
  "flex_cells",
])];

export type AdminRealtimeEvent =
  | { kind: "change"; payload: RealtimePayload }
  | { kind: "recovered"; table: string }
  | { kind: "resume" };
type AdminRealtimeListener = (event: AdminRealtimeEvent) => void;
const adminRealtimeListeners = new Set<AdminRealtimeListener>();
let adminRealtimeSession: string | null = null;
let stopAdminRealtime: (() => void) | null = null;

export function subscribeToAdminRealtime(listener: AdminRealtimeListener) {
  adminRealtimeListeners.add(listener);
  return () => {
    adminRealtimeListeners.delete(listener);
  };
}

function emitAdminRealtime(event: AdminRealtimeEvent) {
  [...adminRealtimeListeners].forEach((listener) => listener(event));
}

function invalidateForTable(table: string, payload?: RealtimePayload) {
  if (["loading_reports", "unloading_reports", "backloads", "offloads", "offload_items", "report_receipts", "operations_report_conversions", "trip_stops", "trips", "trip_truck_assignments", "drivers", "trucks", "profiles", "warehouses", "customers", "customer_stores"].includes(table)) {
    invalidateApiCache("/reports/operations/");
  }
  if ((TRANSMITTAL_TRACKER_REALTIME_TABLES as readonly string[]).includes(table)) {
    invalidateApiCache(TRANSMITTAL_TRACKER_ENDPOINT);
  }
  const affectedReports = Object.entries(REPORT_REALTIME_TABLES)
    .filter(([, tables]) => tables.includes(table))
    .map(([key]) => key as ReportKey);
  for (const key of affectedReports) {
    invalidateApiCache(REPORTS[key].endpoint);
    invalidateReportPageCache(key);
  }

  if (table === "trips") invalidateApiCache("/trips");
  // Loading reports also project milestones onto the cached trip detail.
  if (["loading_reports", "unloading_reports", "driver_trip_updates"].includes(table)) {
    const ids = [payload?.new?.trip_id, payload?.old?.trip_id].filter((id): id is string => typeof id === "string");
    if (!payload) invalidateApiCache("/trips");
    else for (const id of ids) invalidateApiCache(`/trips/${encodeURIComponent(id)}`);
  }
  // Active trip lists depend on whether their delivery stops are archived.
  if (table === "trip_stops") invalidateApiCache("/trips?");
  if (["trips", "trip_events", "trip_stops", "store_calls", "customer_stores", "warehouses"].includes(table)) {
    invalidateApiCache("/calendar/events");
  }
  if (["trip_events", "trip_images", "trip_stops", "trip_line_items", "trip_truck_assignments"].includes(table)) {
    const resource = table === "trip_events" ? "events" : table === "trip_images" ? "images" : table === "trip_stops" ? "stops" : table === "trip_line_items" ? "line-items" : null;
    const tripIds = new Set(
      [payload?.new?.trip_id, payload?.old?.trip_id].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    );
    for (const tripId of tripIds) {
      if (resource) invalidateApiCache(`/trips/${encodeURIComponent(tripId)}/${resource}`);
      if (table === "trip_truck_assignments") invalidateApiCache(`/trips/${encodeURIComponent(tripId)}`);
    }
  }
  if (table === "profiles" || table === "drivers") {
    invalidateApiCache("/users");
    invalidateApiCache("/lookups/profiles");
    invalidateApiCache("/truckers");
  }
  if (table === "trips" || table === "trip_truck_assignments") {
    invalidateApiCache("/truckers");
  }
  if (table === "documents") invalidateApiCache("/documents");
  if (["trucks", "truck_images", "warehouses", "customer_stores", "store_contacts", "products"].includes(table)) {
    invalidateApiCache("/master-data/");
  }
}

/** Keep one authenticated table-channel set for the admin session, independent
 * of which page is mounted. Returned cleanup is safe across token/account swaps. */
export function startAdminRealtime(
  token: string | null,
  profileId: string | null | undefined,
  role: string | null | undefined,
) {
  const sessionKey = token && profileId && (role === "ADMIN" || role === "STAFF")
    ? `${profileId}:${token}`
    : null;
  if (adminRealtimeSession === sessionKey) return () => {};

  stopAdminRealtime?.();
  stopAdminRealtime = null;
  adminRealtimeSession = sessionKey;
  if (!sessionKey) return () => {};

  const onVisible = () => {
    if (document.visibilityState === "visible") emitAdminRealtime({ kind: "resume" });
  };
  document.addEventListener("visibilitychange", onVisible);
  const unsubscribers = ADMIN_REALTIME_TABLES.map((table) =>
    subscribeToTable(
      table,
      (payload) => {
        invalidateForTable(table, payload);
        emitAdminRealtime({ kind: "change", payload });
      },
      () => {
        invalidateForTable(table);
        emitAdminRealtime({ kind: "recovered", table });
      },
    ),
  );

  const cleanup = () => {
    document.removeEventListener("visibilitychange", onVisible);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
  stopAdminRealtime = cleanup;
  return () => {
    if (adminRealtimeSession !== sessionKey) return;
    cleanup();
    stopAdminRealtime = null;
    adminRealtimeSession = null;
  };
}

type Listener = (event: RealtimePayload) => void;
type Entry = {
  channel: RealtimeChannel;
  listeners: Map<Listener, () => void>;
  unavailable: boolean;
  replacing: boolean;
  recoveryTimer?: number;
};

const channels = new Map<string, Entry>();

function removeChannelAndReconcile(table: string, entry: Entry) {
  if (channels.get(table) !== entry || entry.replacing) return;
  entry.replacing = true;
  entry.unavailable = true;
  const channel = entry.channel;
  const reconcile = () => {
    if (channels.get(table) !== entry) return;
    entry.replacing = false;
    if (entry.listeners.size === 0) {
      channels.delete(table);
      return;
    }
    entry.channel = createTableChannel(table, entry);
  };
  void supabase.removeChannel(channel).then(reconcile, reconcile);
}

function createTableChannel(table: string, entry: Entry): RealtimeChannel {
  let channel: RealtimeChannel;
  channel = supabase
    .channel(`report:${table}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        if (channels.get(table) !== entry || entry.channel !== channel) return;
        const event: RealtimePayload = {
          eventType: payload.eventType,
          new: payload.new as Record<string, unknown> | null,
          old: payload.old as Record<string, unknown> | null,
          table: payload.table,
        };
        [...entry.listeners.keys()].forEach((listener) => listener(event));
      },
    )
    .subscribe((status, error) => {
      if (channels.get(table) !== entry || entry.channel !== channel) return;
      if (entry.replacing) return;

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        entry.unavailable = true;
        console.warn(
          `Realtime unavailable for public.${table}; periodic report refresh remains active.`,
          error,
        );
        return;
      }

      if (status === "CLOSED") {
        if (entry.listeners.size === 0 || entry.replacing) return;
        entry.unavailable = true;
        console.warn(
          `Realtime channel closed for public.${table}; reconnecting the table channel.`,
        );
        if (entry.recoveryTimer === undefined) {
          entry.recoveryTimer = window.setTimeout(() => {
            entry.recoveryTimer = undefined;
            if (channels.get(table) !== entry || entry.listeners.size === 0)
              return;
            removeChannelAndReconcile(table, entry);
          }, 500);
        }
        return;
      }

      if (status === "SUBSCRIBED" && entry.unavailable) {
        entry.unavailable = false;
        [...entry.listeners.values()].forEach((onRecovered) => onRecovered());
      }
    });
  return channel;
}

export function subscribeToTable(
  table: string,
  callback: Listener,
  onRecovered: () => void = () => {},
): () => void {
  let entry = channels.get(table);
  if (!entry) {
    entry = {
      channel: undefined as unknown as RealtimeChannel,
      listeners: new Map(),
      unavailable: false,
      replacing: false,
    };
    channels.set(table, entry);
    entry.channel = createTableChannel(table, entry);
  }

  entry.listeners.set(callback, onRecovered);
  return () => {
    const current = channels.get(table);
    if (!current) return;
    current.listeners.delete(callback);
    if (current.listeners.size === 0) {
      if (current.recoveryTimer !== undefined)
        window.clearTimeout(current.recoveryTimer);
      current.recoveryTimer = undefined;
      removeChannelAndReconcile(table, current);
    }
  };
}
