/**
 * Realtime-ready service for future Supabase channel wiring.
 *
 * Future features should subscribe to a base table, react to INSERT/UPDATE events,
 * then invalidate a cached query (or trigger a local refresh) without coupling the
 * UI to raw subscription lifecycle details.
 */
import { supabase } from "../lib/supabase";

export const REALTIME_ENABLED = false;

type RealtimePayload = {
  eventType: string;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
  table?: string;
  schema?: string;
};

const subscriptionRegistry = new Map<string, ReturnType<typeof supabase.channel>>();

export function subscribeToTable(
  table: string,
  callback: (payload: RealtimePayload) => void,
): string | null {
  if (!REALTIME_ENABLED) {
    return null;
  }

  const channelName = `realtime:${table}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: (payload.new ?? null) as Record<string, unknown> | null,
          old: (payload.old ?? null) as Record<string, unknown> | null,
          table: payload.table,
          schema: payload.schema,
        });
      },
    )
    .subscribe();

  subscriptionRegistry.set(channelName, channel);
  return channelName;
}

export function unsubscribe(channel: string | ReturnType<typeof supabase.channel>): void {
  const target = typeof channel === "string" ? subscriptionRegistry.get(channel) : channel;

  if (!target) {
    return;
  }

  void target.unsubscribe();

  if (typeof channel === "string") {
    subscriptionRegistry.delete(channel);
  }
}
