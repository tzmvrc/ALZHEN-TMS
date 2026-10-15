import { supabaseAdmin } from "../config/supabase.js";
import { groupStopsByTrip, isStopComplete, isTripOngoing, type OngoingStop, type OngoingTrip } from "./trip-ongoing.logic.js";

const PAGE_SIZE = 1000;
const TERMINAL = "(COMPLETED,CANCELLED,CANCELED,CLOSED,FINISHED,ARCHIVED,REJECTED)";

async function readStops(): Promise<OngoingStop[]> {
  const rows: OngoingStop[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.from("trip_stops")
      .select("id, trip_id, delivery_status, departure_time")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Unable to determine trip stop completion.");
    const page = (data ?? []) as OngoingStop[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readNonterminalTrips(): Promise<OngoingTrip[]> {
  const rows: OngoingTrip[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.from("trips")
      .select("id, status")
      .not("status", "in", TERMINAL)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Unable to load ongoing trips.");
    const page = (data ?? []) as OngoingTrip[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  // PostgREST's NOT IN excludes SQL NULL, so include missing statuses explicitly.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.from("trips").select("id, status")
      .is("status", null).order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Unable to load trips with missing status.");
    const page = (data ?? []) as OngoingTrip[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function readTripsByIds(ids: string[]): Promise<OngoingTrip[]> {
  const rows: OngoingTrip[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabaseAdmin.from("trips").select("id, status").in("id", ids.slice(offset, offset + 100));
    if (error) throw new Error("Unable to load trips with unfinished stops.");
    rows.push(...((data ?? []) as OngoingTrip[]));
  }
  return rows;
}

/** Return trip IDs before report pagination so each page and its count contain
 * only ongoing trips. Historical completed trip records remain in reports. */
export async function getOngoingTripIds(): Promise<string[]> {
  const stops = await readStops();
  const stopsByTrip = groupStopsByTrip(stops);
  const unfinishedStopTripIds = [...stopsByTrip.entries()]
    .filter(([, tripStops]) => tripStops.some((stop) => !isStopComplete(stop)))
    .map(([tripId]) => tripId);
  const [nonterminal, unfinished] = await Promise.all([
    readNonterminalTrips(),
    readTripsByIds(unfinishedStopTripIds),
  ]);
  const candidates = new Map([...nonterminal, ...unfinished].map((trip) => [trip.id, trip]));
  return [...candidates.values()]
    .filter((trip) => isTripOngoing(trip, stopsByTrip.get(trip.id) ?? []))
    .map((trip) => trip.id);
}
