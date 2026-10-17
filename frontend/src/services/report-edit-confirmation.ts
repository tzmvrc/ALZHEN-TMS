import type { ReportEditTarget, ReportEditor } from "./report-editing.config";

type Target = {
  sourceEntity: ReportEditTarget;
  tripId?: string;
  stopId?: string;
  lineItemId?: string;
  assignmentId?: string;
  billingId?: string;
  storeCallId?: string;
  loadingReportId?: string;
};

/** A successful HTTP response alone is not confirmation of this cell's write. */
export function confirmReportCellWrite(record: Record<string, unknown>, target: Target, field: string, requested?: {value: unknown; editor: ReportEditor}): unknown {
  const id = {
    trip: target.tripId, stop: target.stopId, lineItem: target.lineItemId,
    assignment: target.assignmentId, billing: target.billingId, storeCall: target.storeCallId, loadingReport: target.loadingReportId,
  }[target.sourceEntity];
  if (!id || record.id !== id || !Object.hasOwn(record, field) || record[field] === undefined) {
    throw new Error("The server did not confirm this cell's saved record and value. Your draft is retained; refresh to verify before retrying.");
  }
  if (target.sourceEntity !== "trip" && target.sourceEntity !== "storeCall" && record.trip_id !== target.tripId) {
    throw new Error("The save response belongs to a different trip. Your draft is retained; refresh to verify the record.");
  }
  if (target.sourceEntity === "lineItem" && record.trip_stop_id !== target.stopId) {
    throw new Error("The save response belongs to a different stop. Your draft is retained; refresh to verify the record.");
  }
  if (requested) {
    const actual = record[field], expected = requested.value;
    let matches = actual === expected;
    if (!matches && requested.editor === "number" && actual != null && expected != null
      && String(actual).trim() !== "" && String(expected).trim() !== "") {
      matches = Number.isFinite(Number(actual)) && Number(actual) === Number(expected);
    }
    if (!matches && ["date", "datetime"].includes(requested.editor) && typeof actual === "string" && typeof expected === "string") {
      matches = Number.isFinite(Date.parse(actual)) && Date.parse(actual) === Date.parse(expected);
    }
    // The stop DR contract uses an explicit empty string to suppress legacy fallback.
    if (!matches && field === "dr_number" && expected === null && actual === "") matches = true;
    if (!matches) throw new Error("The server did not confirm the requested value. Your draft is retained; refresh to verify before retrying.");
  }
  return record[field]; // null, zero and normalized server values stay distinct.
}
