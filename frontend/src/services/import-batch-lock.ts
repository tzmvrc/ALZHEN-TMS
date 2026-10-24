import type { ImportBatchRecovery } from "./trip-import.service";

/** Recovery also synthesizes failed outcomes for products missing from an older
 * import. Those warnings are not evidence of rows recorded in this batch. */
export function importBatchHasRecordedRows(batch: Pick<ImportBatchRecovery, "imported" | "failed" | "awaiting_allocation" | "outcomes" | "history" | "cargo_saved">): boolean {
  if (batch.imported > 0 || batch.failed > 0 || batch.awaiting_allocation > 0 || Object.values(batch.cargo_saved).some(Boolean)) return true;
  return batch.outcomes.some(row => {
    if (row.trip_id || row.line_item_id) return true;
    if (row.status === "failed" && batch.history?.[row.source_identity]?.status === "missing") return false;
    return true;
  });
}
