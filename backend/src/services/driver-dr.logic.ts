type Row = Record<string, unknown>;
export function collectDriverDrNumbers(stops: Row[], lines: Row[]) {
  const activeStops = new Set(stops.filter(stop => !stop.archived_at).map(stop => String(stop.id)));
  const numbers = new Map<string, Set<string>>();
  const add = (row: Row) => {
    if (typeof row.trip_id !== "string" || typeof row.dr_number !== "string" || !row.dr_number.trim()) return;
    const values = numbers.get(row.trip_id) ?? new Set<string>();
    values.add(row.dr_number.trim()); numbers.set(row.trip_id, values);
  };
  stops.filter(stop => !stop.archived_at).forEach(add);
  lines.filter(line => !line.trip_stop_id || activeStops.has(String(line.trip_stop_id))).forEach(add);
  return new Map([...numbers].map(([id, values]) => [id, [...values].join(", ")]));
}
