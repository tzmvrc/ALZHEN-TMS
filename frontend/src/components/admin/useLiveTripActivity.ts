import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import { fetchTripDetail, fetchTripStops, invalidateTripCache } from "../../services/trip.service";
import { invalidateTripImagesCache } from "../../services/trip-image.service";
import { deriveActivities, WATCHED_TABLES, type RawActivity } from "../../services/live-activity.service";
import {subscribeCollaborationEvents} from '../../services/collaboration.service';
import {apiGet,type ApiResponse} from '../../services/api.service';

export type ActivityItem = RawActivity & {
  id: string;
  at: number;
  tripLabel: string;
  stopLabel: string | null;
};

export type HistoryItem = ActivityItem & { read: boolean };

const MAX_ITEMS = 20;
const MAX_HISTORY = 50;
const HISTORY_KEY = "live-trip-history-v1";
const SAME_MOMENT_MS = 30_000;

function loadHistory(): HistoryItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is HistoryItem => Boolean(item) && typeof item.id === "string" && typeof item.at === "number").slice(0, MAX_HISTORY)
      : [];
  } catch {
    return [];
  }
}
const PING_MS = 15_000;
const LABEL_TIMEOUT_MS = 1_500;

const withTimeout = <T,>(promise: Promise<T>, fallback: T) =>
  Promise.race([promise, new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), LABEL_TIMEOUT_MS))]);

/** Listens to trucker updates in realtime and keeps a short list of fresh activity. */
export function useLiveTripActivity() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  /* Kept (and remembered across reloads) so an update missed while away is still in the bell. */
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [pings, setPings] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const memory = useRef(new Map<string, string>());
  const labels = useRef(new Map<string, string>());
  const counter = useRef(0);

  const resolveLabels = useCallback(async (token: string, tripId: string, stopId: string | null) => {
    let tripLabel = labels.current.get(`trip:${tripId}`);
    if (!tripLabel) {
      try {
        const detail = await withTimeout(fetchTripDetail(token, tripId), null);
        const dispatch = String(detail?.trip.dispatch_number ?? "").trim();
        tripLabel = dispatch ? `Trip ${dispatch}` : "A trip";
        if (dispatch) labels.current.set(`trip:${tripId}`, tripLabel);
      } catch {
        tripLabel = "A trip";
      }
    }
    let stopLabel: string | null = null;
    if (stopId) {
      stopLabel = labels.current.get(`stop:${stopId}`) ?? null;
      if (!stopLabel) {
        try {
          const stops = await withTimeout(fetchTripStops(token, tripId), []);
          const stop = stops.find((candidate) => candidate.id === stopId);
          if (stop) {
            const name = [stop.store_name, stop.customer_name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
            const sequence = stop.stop_sequence !== undefined && stop.stop_sequence !== null ? `Stop ${stop.stop_sequence}` : "Stop";
            stopLabel = name ? `${sequence} · ${name}` : sequence;
            labels.current.set(`stop:${stopId}`, stopLabel);
          }
        } catch {
          stopLabel = null;
        }
      }
    }
    return { tripLabel, stopLabel };
  }, []);

  const publish = useCallback(
    async (token: string, raw: RawActivity) => {
      /* Drop stale cached trip data first so the page the admin opens next is current. */
      invalidateTripCache(raw.tripId);
      invalidateTripImagesCache(raw.tripId);
      const { tripLabel, stopLabel } = await resolveLabels(token, raw.tripId, raw.stopId);
      const at = Date.now();
      setPings((current) => ({ ...current, [raw.tripId]: at }));
      setHistory((current) => {
        const recent = current.find((entry) => entry.dedupeKey === raw.dedupeKey && at - entry.at < SAME_MOMENT_MS);
        const entry: HistoryItem = {
          ...raw,
          id: recent?.id ?? `h${at}-${(counter.current += 1)}`,
          at,
          tripLabel,
          stopLabel,
          read: false,
        };
        return [entry, ...current.filter((existing) => existing !== recent)].slice(0, MAX_HISTORY);
      });
      setItems((current) => {
        const existing = current.find((item) => item.dedupeKey === raw.dedupeKey);
        const next: ActivityItem = {
          ...raw,
          id: existing?.id ?? `${at}-${(counter.current += 1)}`,
          at,
          tripLabel,
          stopLabel,
        };
        const rest = current.filter((item) => item.dedupeKey !== raw.dedupeKey);
        return [next, ...rest].slice(0, MAX_ITEMS);
      });
    },
    [resolveLabels],
  );

  useEffect(() => {
    if (!accessToken) return;
    let active=true;
    const stop=subscribeCollaborationEvents(event=>{
      if(event.kind!=='commit'||event.commit.source!=='trip_events'||event.commit.operation==='DELETE')return;
      // Fetch only the confirmed event through the authorized API. Socket
      // invalidations deliberately carry no private notes or evidence.
      void apiGet<ApiResponse<Record<string,unknown>>>(`/delivery/events/${encodeURIComponent(event.commit.recordId)}/notification`,accessToken).then(result=>{
        if(!active||!result.data||Number(result.data.delivery_version)>0)return;
        for(const raw of deriveActivities('trip_events',result.data,true,memory.current))void publish(accessToken,raw);
      }).catch(()=>{/* The timeline remains the authoritative, retryable history. */});
    });
    return()=>{active=false;stop();};
  },[accessToken,publish]);

  useEffect(() => {
    if (!accessToken) return;
    return subscribeToAdminRealtime((event) => {
      // Metadata signals deliberately contain no business row payload. Detailed
      // activity messages require an authorized row-level source; do not invent them.
      if (event.kind !== "change") return;
      const payload = event.payload as typeof event.payload & Record<string, unknown>;
      const table = String(payload.table);
      const next = payload.new as Record<string, unknown> | null | undefined;
      if (!(WATCHED_TABLES as readonly string[]).includes(table) || !next) return;
      const kind = payload.eventType ?? payload.type ?? payload.event;
      const old = payload.old as Record<string, unknown> | null | undefined;
      const isInsert = kind ? String(kind).toUpperCase() === "INSERT" : !old || Object.keys(old).length === 0;
      for (const raw of deriveActivities(table, next, isInsert, memory.current)) void publish(accessToken, raw);
    });
  }, [accessToken, publish]);

  /* Re-render once a second only while something is pinging, to expire the map highlight. */
  const hasPings = Object.keys(pings).length > 0;
  useEffect(() => {
    if (!hasPings) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      setPings((existing) => {
        const live = Object.entries(existing).filter(([, at]) => current - at < PING_MS);
        return live.length === Object.keys(existing).length ? existing : Object.fromEntries(live);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasPings]);

  const pingingTripIds = new Set(Object.entries(pings).filter(([, at]) => now - at < PING_MS).map(([id]) => id));
  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* History just will not survive a reload. */
    }
  }, [history]);

  const markRead = useCallback(
    (id: string) => setHistory((current) => current.map((entry) => (entry.id === id ? { ...entry, read: true } : entry))),
    [],
  );
  const markAllRead = useCallback(() => setHistory((current) => current.map((entry) => ({ ...entry, read: true }))), []);
  const clearHistory = useCallback(() => setHistory([]), []);
  const unreadCount = history.filter((entry) => !entry.read).length;

  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const dismissAll = useCallback(() => setItems([]), []);

  return { items, pingingTripIds, dismiss, dismissAll, history, unreadCount, markRead, markAllRead, clearHistory };
}
