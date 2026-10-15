export type OngoingTrip = { id: string; status: string | null };
export type OngoingStop = { trip_id: string; delivery_status: string | null; departure_time: string | null };

const TERMINAL_TRIP_STATUSES = new Set(["COMPLETED", "CANCELLED", "CANCELED", "CLOSED", "FINISHED", "ARCHIVED", "REJECTED"]);

/** Mirrors TripDetailView's established stop completion rule. The schema has
 * no optional-stop marker, so every trip_stops row is treated as required. */
export function isStopComplete(stop: Pick<OngoingStop, "delivery_status" | "departure_time">): boolean {
  return /COMPLET|DELIVER|FINISH/i.test(String(stop.delivery_status ?? "")) || Boolean(stop.departure_time);
}

export function isTripOngoing(trip: OngoingTrip, stops: OngoingStop[]): boolean {
  const status = String(trip.status ?? "").trim().toUpperCase();
  if (["CANCELLED", "CANCELED", "CLOSED", "ARCHIVED", "REJECTED"].includes(status)) return false;
  // With no stops, there is no delivery evidence. Preserve the trip's known
  // status as fallback; a missing/nonterminal status remains visible for review.
  if (!stops.length) return !TERMINAL_TRIP_STATUSES.has(status);
  return !stops.every(isStopComplete);
}

export function groupStopsByTrip(stops: OngoingStop[]) {
  const grouped = new Map<string, OngoingStop[]>();
  for (const stop of stops) {
    const rows = grouped.get(stop.trip_id) ?? [];
    rows.push(stop);
    grouped.set(stop.trip_id, rows);
  }
  return grouped;
}
