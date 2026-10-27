import type { RealtimeChannel } from "@supabase/supabase-js";
import {subscribeCollaborationEvents} from "./collaboration.service";
import { supabase } from "../lib/supabase";
import { apiGet, invalidateApiCache, type ApiResponse } from "./api.service";
import {
  invalidateReportPageCache,
  removeCachedReportRecord,
  REPORTS,
  type ReportKey,
} from "./report.service";
import { TRANSMITTAL_TRACKER_ENDPOINT } from "./transmittal-tracker.service";
import { createTransactionChangeMonitor } from "./transaction-change-monitor";
import { ADMIN_CHANGE_TOPICS, createAdminChangeFeed, type ChangeSignal } from "./admin-change-feed";

export type RealtimePayload = {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
  table: string;
};

// Tables are based on the checked-in view definitions and report enrichment queries.
export const REPORT_REALTIME_TABLES: Record<ReportKey, readonly string[]> = {
  combined: [
    "loading_reports",
    "flex_cells", "flex_rows", "flex_columns", "flex_tables",
    "trips",
    "trip_truck_assignments",
    "trip_cargo_allocations", "trip_assignment_stops",
    "trucks",
    "drivers",
    "trucking_companies",
    "trip_stops",
    "customers",
    "customer_stores",
    "trip_line_items",
    "products",
    "profiles",
    "trip_events", "trip_images", "pod_records", "pod_review_events",
    "trip_types",
    "warehouses",
  ],
  "dispatch-monitoring": [
    "trip_line_items", "products", "incidents", "backloads", "offloads", "pod_records", "billings",
    "loading_reports",
    "flex_cells", "flex_rows", "flex_columns", "flex_tables",
    "trips",
    "trip_truck_assignments",
    "trip_cargo_allocations", "trip_assignment_stops",
    "trucks",
    "drivers",
    "trucking_companies",
    "trip_stops",
    "customers",
    "customer_stores",
    "profiles",
    "trip_events", "trip_images", "pod_records", "pod_review_events",
    "trip_types",
    "warehouses",
  ],
  dispatch: [
    "trip_events", "trip_images", "pod_records", "pod_review_events",
    "loading_reports",
    "trips",
    "trip_stops",
    "trip_line_items",
    "products",
    "customer_stores",
    "customers",
    "trip_truck_assignments",
    "trip_cargo_allocations", "trip_assignment_stops",
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
    "trip_events", "trip_images", "pod_records", "pod_review_events",
    "trips",
    "trip_stops",
    "trip_line_items",
    "products",
    "trip_truck_assignments",
    "trip_cargo_allocations", "trip_assignment_stops",
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
    "trip_cargo_allocations", "trip_assignment_stops",
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
  "spreadsheet_cell_formulas",
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
  | { kind: "batch"; tables: readonly string[] }
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

// Invalidate actual reference dependencies, not every master/lookup response
// for each imported product line or stop. Operational projections are handled
// separately below, and unknown/recovery signals still use their table topics.
const lookupDependencies:Record<string,readonly string[]>={
 profiles:["profiles","assignees"],drivers:["drivers","trucks"],trucks:["trucks","drivers"],
 customers:["customers","stores"],customer_stores:["stores","store-contacts"],store_contacts:["store-contacts"],
 warehouses:["warehouses"],products:["products"],trucking_companies:["trucking-companies","trucks","drivers"],trip_types:["trip-types"],incident_reasons:["incident-reasons"],
};
const masterDependencies:Record<string,readonly string[]>={
 drivers:["drivers","trucks"],trucks:["trucks","drivers"],truck_images:["trucks"],customers:["customers","stores"],customer_stores:["stores","store-contacts"],
 store_contacts:["store-contacts"],warehouses:["warehouses"],products:["products"],trucking_companies:["trucking-companies","trucks","drivers"],
};
function invalidateForTable(table: string, payload?: RealtimePayload, invalidated=new Set<string>()) {
  const invalidate=(prefix:string)=>{if(invalidated.has(prefix))return;invalidated.add(prefix);invalidateApiCache(prefix);};
  const invalidateReport=(report?:ReportKey)=>{const key=`report:${report??"*"}`;if(invalidated.has("report:*")||invalidated.has(key))return;invalidated.add(key);invalidateReportPageCache(report);};
  if(payload?.eventType==="DELETE"&&typeof payload.old?.id==="string")removeCachedReportRecord(table,payload.old.id);
  if(["profiles","drivers"].includes(table))invalidate("/users");
  for(const kind of lookupDependencies[table]??[])invalidate(`/lookups/${kind}`);
  if (["tms_dropdown_options", "flex_dropdown_options"].includes(table)) invalidate("/dropdown-options");
  if (table.startsWith("flex_")) invalidate("/flexible-tables");
  if (["pod_records", "pod_drive_files", "driver_trip_updates", "flex_cell_mentions", "flex_table_permissions", "flex_dropdown_options"].includes(table)) invalidate(TRANSMITTAL_TRACKER_ENDPOINT);
  if (["transaction_deletion_jobs", "offload_deletion_jobs"].includes(table)) {
    invalidate("/trips"); invalidate("/reports"); invalidateReport();
    if(table==="transaction_deletion_jobs")for(const prefix of [TRANSMITTAL_TRACKER_ENDPOINT,"/truckers","/tracking","/dashboard","/flexible-tables","/calendar/events","/documents"])invalidate(prefix);
  }
  if (["incidents", "incident_reasons", "demurrages", "pod_records", "pod_drive_files", "backload_items", "driver_trip_updates", "tms_route_options"].includes(table)) invalidate("/reports/operations/");
  if (table === "admin_notifications") invalidate("/notifications");
  if (!table.startsWith("operational_email_")&&ADMIN_CHANGE_TOPICS.includes(table as typeof ADMIN_CHANGE_TOPICS[number])) invalidate("/dashboard");
  if (["loading_reports", "unloading_reports", "backloads", "offloads", "offload_items", "report_receipts", "operations_report_conversions", "trip_stops", "trips", "trip_truck_assignments", "drivers", "trucks", "profiles", "warehouses", "customers", "customer_stores"].includes(table)) {
    invalidate("/reports/operations/");
  }
  if ((TRANSMITTAL_TRACKER_REALTIME_TABLES as readonly string[]).includes(table)) {
    invalidate(TRANSMITTAL_TRACKER_ENDPOINT);
  }
  const affectedReports = Object.entries(REPORT_REALTIME_TABLES)
    .filter(([, tables]) => tables.includes(table))
    .map(([key]) => key as ReportKey);
  for (const key of affectedReports) {
    invalidate(REPORTS[key].endpoint);
    invalidateReport(key);
  }

  if(["trip_cargo_allocations","trip_assignment_stops"].includes(table))invalidate("/trips/");
  if (table === "trips") invalidate("/trips");
  // Loading reports also project milestones onto the cached trip detail.
  if (["loading_reports", "unloading_reports", "driver_trip_updates"].includes(table)) {
    const ids = [payload?.new?.trip_id, payload?.old?.trip_id].filter((id): id is string => typeof id === "string");
    if (!payload) invalidate("/trips");
    else for (const id of ids) invalidate(`/trips/${encodeURIComponent(id)}`);
  }
  // Signals intentionally contain no trip IDs. Clear child-resource caches too.
  if (!payload && ["trip_stops", "trip_line_items", "trip_truck_assignments", "trip_events", "trip_images", "loading_reports", "unloading_reports", "backloads", "offloads", "billings"].includes(table)) invalidate("/trips/");

  // Active trip lists depend on whether their delivery stops are archived.
  if (table === "trip_stops") invalidate("/trips?");
  if (["trips", "trip_events", "trip_stops", "store_calls", "customer_stores", "warehouses"].includes(table)) {
    invalidate("/calendar/events");
  }
  if (["trip_events", "trip_images", "trip_stops", "trip_line_items", "trip_truck_assignments"].includes(table)) {
    const resource = table === "trip_events" ? "events" : table === "trip_images" ? "images" : table === "trip_stops" ? "stops" : table === "trip_line_items" ? "line-items" : null;
    const tripIds = new Set(
      [payload?.new?.trip_id, payload?.old?.trip_id].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    );
    for (const tripId of tripIds) {
      if (resource) invalidate(`/trips/${encodeURIComponent(tripId)}/${resource}`);
      if (table === "trip_truck_assignments") invalidate(`/trips/${encodeURIComponent(tripId)}`);
    }
  }
  if (table === "profiles" || table === "drivers") {
    invalidate("/users");
    invalidate("/lookups/profiles");
    invalidate("/truckers");
  }
  if (["trips","trip_stops","trip_line_items","trip_truck_assignments","trucks"].includes(table)) {
    invalidate("/truckers");
  }
  if (table === "documents") invalidate("/documents");
  for(const resource of masterDependencies[table]??[])invalidate(`/master-data/${resource}`);
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

  let active = true, healthy = false, connectionVersion = 0, reconnectAttempt = 0;
  let signalChannel: RealtimeChannel | null = null;
  let reconnectTimer: number | undefined;
  const feed = createAdminChangeFeed({
    changed: (tables) => {
      if (!active || adminRealtimeSession !== sessionKey) return;
      const invalidated=new Set<string>();
      tables.forEach((table) => invalidateForTable(table,undefined,invalidated));
      emitAdminRealtime({ kind: "batch", tables });
      if (tables.includes("admin_notifications")) channels.get("admin_notifications")?.listeners.forEach((recovered) => recovered());
    },
    snapshot: async () => {
      const response = await apiGet<ApiResponse<ChangeSignal[]>>("/realtime/changes", token!);
      if (!response.success || !response.data) throw new Error("Change signals unavailable");
      return response.data;
    },
    schedule: (callback, delay) => setTimeout(callback, delay), cancel: clearTimeout,
  });
  const stopSocketSignals=subscribeCollaborationEvents(event=>{
    if(!active)return;
    if(event.kind==="commit"&&event.commit.operation==="DELETE")removeCachedReportRecord(event.commit.source,event.commit.recordId);
    if(event.kind==="signal")feed.push({topic:event.topic,revision:event.revision});
    if(event.kind==="commit"&&event.commit.operation==="DELETE"&&event.commit.source==="trips"){
      invalidateForTable("trips");invalidateForTable("transaction_deletion_jobs");
      emitAdminRealtime({kind:"batch",tables:["trips","transaction_deletion_jobs"]});
    }
      if(event.kind==="commit"&&["trip_cargo_allocations","trip_assignment_stops","offloads","backloads","demurrages","incidents","loading_reports","unloading_reports"].includes(event.commit.source)) {
        const tables = [event.commit.source, ...(["trip_cargo_allocations","trip_assignment_stops"].includes(event.commit.source)?[]:["report_receipts"]), ...(event.commit.source === "offloads" ? ["offload_items", "offload_deletion_jobs"] : event.commit.source === "backloads" ? ["backload_items", "backload_deletion_jobs"] : [])];
        tables.forEach(table=>invalidateForTable(table));
        emitAdminRealtime({kind:"batch",tables});
      }
  });
  const connect = async () => {
    const version = ++connectionVersion;
    const previous = signalChannel; signalChannel = null;
    if (previous) await supabase.removeChannel(previous);
    if (!active || version !== connectionVersion) return;
    await supabase.realtime.setAuth(token!);
    if (!active || version !== connectionVersion) return;
    signalChannel = supabase.channel(`admin-change-signals:${profileId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_change_signals" }, (payload) => {
        if (active && version === connectionVersion) feed.push(payload.new as ChangeSignal);
      }).on("postgres_changes",{event:"*",schema:"public",table:"spreadsheet_cell_formulas"},()=>{if(active&&version===connectionVersion)emitAdminRealtime({kind:"batch",tables:["spreadsheet_cell_formulas"]});}).subscribe((status) => {
        if (!active || version !== connectionVersion) return;
        if (status === "SUBSCRIBED") { healthy = true; emitAdminRealtime({kind:"batch",tables:["spreadsheet_cell_formulas"]}); reconnectAttempt = 0; window.clearTimeout(reconnectTimer); reconnectTimer = undefined; void feed.reconcile(); }
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          healthy = false;
          if (reconnectTimer === undefined) reconnectTimer = window.setTimeout(() => {
            reconnectTimer = undefined; void connect().catch(() => { healthy = false; });
          }, Math.min(30_000, 1_000 * 2 ** reconnectAttempt++));
        }
      });
  };
  // StrictMode's mount/cleanup probe must not open a discarded connection or
  // launch a duplicate recovery read before the real mounted session starts.
  const initialTimer=window.setTimeout(()=>{if(active){void connect().catch(() => { healthy = false; });void feed.reconcile();}},0);
  const signalRecoveryTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void feed.reconcile();
    if (!healthy && reconnectTimer === undefined) void connect().catch(() => { healthy = false; });
  }, 60_000);

  // Retain the previous deletion-only recovery when the signal transport is down.
  const transactionChanges = createTransactionChangeMonitor(token!, () => {
    invalidateApiCache("/trips");
    invalidateApiCache("/reports");
    invalidateReportPageCache();
    emitAdminRealtime({ kind: "resume" });
  });
  const transactionTimer = window.setInterval(() => { if (!healthy && document.visibilityState === "visible") void transactionChanges.check(); }, 15_000);

  const onVisible = () => {
    if (document.visibilityState === "visible") void feed.reconcile();
    if (document.visibilityState === "visible") emitAdminRealtime({ kind: "resume" });
  };
  document.addEventListener("visibilitychange", onVisible);
  const cleanup = () => {
    active = false; healthy = false; connectionVersion++;
    window.clearTimeout(initialTimer);
    feed.stop();stopSocketSignals(); window.clearInterval(signalRecoveryTimer); window.clearTimeout(reconnectTimer);
    if (signalChannel) void supabase.removeChannel(signalChannel);
    transactionChanges.stop();
    window.clearInterval(transactionTimer);
    document.removeEventListener("visibilitychange", onVisible);
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
  recoveryAttempt?: number;
  lastWarningAt?: number;
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
  const channel = supabase
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
    .subscribe((status) => {
      if (channels.get(table) !== entry || entry.channel !== channel) return;
      if (entry.replacing) return;

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        entry.unavailable = true;
        if(Date.now()-(entry.lastWarningAt??0)>=60_000){entry.lastWarningAt=Date.now();console.warn(`Realtime unavailable for public.${table}; periodic report refresh remains active.`);}
        return;
      }

      if (status === "CLOSED") {
        if (entry.listeners.size === 0 || entry.replacing) return;
        entry.unavailable = true;
        if(Date.now()-(entry.lastWarningAt??0)>=60_000){entry.lastWarningAt=Date.now();console.warn(`Realtime channel closed for public.${table}; reconnecting the table channel.`);}
        if (entry.recoveryTimer === undefined) {
          entry.recoveryTimer = window.setTimeout(() => {
            entry.recoveryTimer = undefined;
            if (channels.get(table) !== entry || entry.listeners.size === 0)
              return;
            removeChannelAndReconcile(table, entry);
          }, Math.round(Math.min(30_000,1000*2**Math.min(entry.recoveryAttempt??0,5))*(.9+Math.random()*.2)));
          entry.recoveryAttempt=(entry.recoveryAttempt??0)+1;
        }
        return;
      }

      if (status === "SUBSCRIBED" && entry.unavailable) {
        entry.unavailable = false;
        entry.recoveryAttempt=0;
        window.clearTimeout(entry.recoveryTimer);entry.recoveryTimer=undefined;
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
