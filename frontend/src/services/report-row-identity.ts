import type { ReportKey } from "./report.service";

type ReportIdentityRow = Record<string, unknown>;

export function getReportRowIdentity(
  reportKey: ReportKey | "pod-status" | "pod-drive-files" | "trip-exceptions",
  row: ReportIdentityRow,
): string | null {
  if(reportKey==="pod-drive-files"&&typeof row.pod_drive_file_id==="string"&&row.pod_drive_file_id)return `${reportKey}:file:${row.pod_drive_file_id}`;
  if((reportKey==="pod-status"||reportKey==="pod-drive-files")&&typeof row.pod_record_id==="string"&&row.pod_record_id)return `${reportKey}:pod:${row.pod_record_id}`;
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
