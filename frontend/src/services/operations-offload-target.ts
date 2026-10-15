import type { OperationsEventRow } from "./operations-report.service";

export function exactOffloadReport(row: OperationsEventRow) {
  if (row.source_type !== "OFFLOAD" || row.offload_records.length !== 1) return null;
  const report = row.offload_records[0];
  return report.id === row.source_record_id && report.trip_id === row.trip_id && report.trip_stop_id === row.trip_stop_id ? report : null;
}
