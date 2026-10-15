import type { OperationsSourceType } from "./operations-report.service";

export type OperationsReportDeleteTarget = { row_id: string; source_type: OperationsSourceType; record_id: string; label: string };
export type OperationsReportDeleteFailure = { target: OperationsReportDeleteTarget; message: string };

/** Runs confirmed deletion sequentially so each source record has an explicit
 * outcome and callers can report partial success without claiming atomicity. */
export async function deleteConfirmedOperationsReports(
  confirmed: boolean,
  targets: OperationsReportDeleteTarget[],
  remove: (sourceType: OperationsSourceType, recordId: string) => Promise<unknown>,
) {
  const deletedRowIds: string[] = [];
  const failures: OperationsReportDeleteFailure[] = [];
  if (!confirmed) return { deletedRowIds, failures };

  for (const target of targets) {
    try {
      await remove(target.source_type, target.record_id);
      deletedRowIds.push(target.row_id);
    } catch (cause) {
      failures.push({
        target,
        message: cause instanceof Error ? cause.message : "Delete failed.",
      });
    }
  }
  return { deletedRowIds, failures };
}
