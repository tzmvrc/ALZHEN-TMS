import type { OperationsEventRow, OperationsSourceType } from "./operations-report.service";

export type OperationsReportDeleteTarget = { row_id: string; source_type: OperationsSourceType; record_id: string; label: string };
export type OperationsReportDeleteFailure = { target: OperationsReportDeleteTarget; message: string };

export function operationsDeleteTargets(rows: readonly OperationsEventRow[], selected: ReadonlySet<string>): OperationsReportDeleteTarget[] | null {
  const matches = rows.filter((row) => selected.has(row.id));
  if (matches.length !== selected.size) return null;
  const seen = new Set<string>();
  const targets: OperationsReportDeleteTarget[] = [];
  for (const row of matches) {
    const event = row.event_type_records[0];
    const key = `${row.source_type}:${row.source_record_id}`;
    if (!["LOADING", "UNLOADING", "BACKLOAD", "OFFLOAD"].includes(row.source_type) || !row.source_record_id || row.event_type_records.length !== 1 || event.id !== row.source_record_id || event.source_type !== row.source_type || seen.has(key)) return null;
    seen.add(key);
    targets.push({ row_id: row.id, source_type: row.source_type, record_id: row.source_record_id, label: `${row.source_type} ${row.dispatch_number || row.trip_number || row.source_record_id}` });
  }
  return targets;
}

/** Runs confirmed deletion sequentially so each source record has an explicit
 * outcome and callers can report partial success without claiming atomicity. */
export async function deleteConfirmedOperationsReports(
  confirmed: boolean,
  targets: OperationsReportDeleteTarget[],
  remove: (sourceType: OperationsSourceType, recordId: string) => Promise<unknown>,
) {
  const deletedRowIds: string[] = [];
  const failures: OperationsReportDeleteFailure[] = [];
  const cleanupPending: Array<{ target: OperationsReportDeleteTarget; operationId: string }> = [];
  if (!confirmed) return { deletedRowIds, failures, cleanupPending };

  for (const target of targets) {
    try {
      const result = await remove(target.source_type, target.record_id);
      deletedRowIds.push(target.row_id);
      if (result && typeof result === "object" && "cleanup_pending" in result && result.cleanup_pending && "operation_id" in result && typeof result.operation_id === "string") cleanupPending.push({ target, operationId: result.operation_id });
    } catch (cause) {
      failures.push({
        target,
        message: cause instanceof Error ? cause.message : "Delete failed.",
      });
    }
  }
  return { deletedRowIds, failures, cleanupPending };
}
