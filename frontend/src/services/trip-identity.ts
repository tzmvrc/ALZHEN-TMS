/** Display identifiers may be shared; report enrichment must use the parent ID. */
export function reportBelongsToTrip(row: Record<string, unknown>, tripId: unknown): boolean {
  const parent = row.trip_id ?? row._trip_id;
  return typeof parent === "string" && parent.length > 0 && typeof tripId === "string" && parent === tripId;
}
