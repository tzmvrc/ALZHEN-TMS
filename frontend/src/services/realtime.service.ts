import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ReportKey } from "./report.service";

export type RealtimePayload = {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
  table: string;
};

// Tables are based on the checked-in view definitions and report enrichment queries.
export const REPORT_REALTIME_TABLES: Record<ReportKey, readonly string[]> = {
  combined: [
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
