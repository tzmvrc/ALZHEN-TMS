import type { ReportKey } from "./report.service";

type ReportIdentityRow = Record<string, unknown>;

export function getReportRowIdentity(
  reportKey: ReportKey,
  row: ReportIdentityRow,
): string | null {
  if (reportKey === "store-calling") {
    return typeof row.store_call_id === "string" && row.store_call_id
      ? `${reportKey}:store-call:${row.store_call_id}${row.assignment_id ? `:assignment:${row.assignment_id}` : ""}`
      : null;
  }

  const ids = [
    ["trip", row.trip_id],
    ["stop", row.trip_stop_id],
    ["line-item", row.trip_line_item_id],
    ["assignment", row.assignment_id],
    ["billing", row.billing_id],
    ["incident", row.incident_id],
    ["backload", row.backload_id],
    ["offload", row.offload_id],
  ].filter(([, id]) => typeof id === "string" && id) as [string, string][];

  return ids.length
    ? `${reportKey}:${ids.map(([kind, id]) => `${kind}:${id}`).join(":")}`
    : null;
}
