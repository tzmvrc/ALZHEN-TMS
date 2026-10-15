import type { OperationsTripOption } from "./operations-report.service";

export type OperationsTripChoice = {
  id: string;
  trip: OperationsTripOption;
  stopId: string | null;
  dispatchNumber: string;
  label: string;
  selectable: boolean;
};

/** Mirror dispatch-monitoring's transaction grain: one row per stop, or one
 * trip row only when no stops exist. Never fall back to a stale parent label. */
export function buildOperationsTripChoices(trips: readonly OperationsTripOption[]): OperationsTripChoice[] {
  const uniqueTrips = [...new Map(trips.map((trip) => [trip.id, trip])).values()];
  const choices: OperationsTripChoice[] = [];
  for (const trip of uniqueTrips) {
    const stops = [...new Map(trip.stops.map((stop) => [stop.id, stop])).values()];
    const dispatch = trip.dispatch_number?.trim() ?? "";
    // An exact stop dispatch is selectable directly; no separate stop picker
    // and no arbitrary first-stop fallback are needed.
    if (!stops.length) {
      const label = dispatch || "Dispatch number unavailable";
      choices.push({ id: trip.id, trip, stopId: null, dispatchNumber: dispatch, label, selectable: Boolean(dispatch) });
    }
    for (const stop of stops) {
      const stopDispatch = stop.dispatch_number?.trim() ?? "";
      choices.push({ id: `${trip.id}:${stop.id}`, trip, stopId: stop.id, dispatchNumber: stopDispatch, label: stopDispatch || "Dispatch number unavailable", selectable: Boolean(stopDispatch) });
    }
  }
  const counts = new Map<string, number>();
  for (const choice of choices) counts.set(choice.dispatchNumber, (counts.get(choice.dispatchNumber) ?? 0) + 1);
  return choices.map((choice) => (counts.get(choice.dispatchNumber) ?? 0) > 1 ? {
    ...choice,
    label: `${choice.dispatchNumber || "Dispatch number unavailable"} · Trip ${choice.trip.trip_number ?? choice.trip.id} (${choice.id})`,
  } : choice);
}

export function findOperationsTripChoice(choices: readonly OperationsTripChoice[], choiceId: string) {
  return choices.find((choice) => choice.id === choiceId) ?? null;
}
