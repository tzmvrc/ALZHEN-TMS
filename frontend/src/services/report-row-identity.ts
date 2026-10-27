import type { ReportKey } from "./report.service";

type ReportIdentityRow = Record<string, unknown>;
const physicalId = (row: ReportIdentityRow, field: string) => {
  const value = row[field];
  return typeof value === "string" && value ? value : row[`_${field}`];
};

export function getReportRowIdentity(
  reportKey: ReportKey | "pod-status" | "pod-drive-files" | "trip-exceptions",
  row: ReportIdentityRow,
): string | null {
  if(reportKey==="pod-drive-files"&&typeof row.pod_drive_file_id==="string"&&row.pod_drive_file_id)return `${reportKey}:file:${row.pod_drive_file_id}`;
  if((reportKey==="pod-status"||reportKey==="pod-drive-files")&&typeof row.pod_record_id==="string"&&row.pod_record_id)return `${reportKey}:pod:${row.pod_record_id}`;
  if (reportKey === "store-calling") {
    const callId = physicalId(row, "store_call_id");
    const assignmentId = physicalId(row, "assignment_id");
    return typeof callId === "string" && callId
      ? `${reportKey}:store-call:${callId}${assignmentId ? `:assignment:${assignmentId}` : ""}`
      : null;
  }

  const ids = [
    ["trip", physicalId(row, "trip_id")],
    ["stop", physicalId(row, "trip_stop_id")],
    ["line-item", physicalId(row, "trip_line_item_id")],
    ["assignment", physicalId(row, "assignment_id")],
    ["billing", physicalId(row, "billing_id")],
    ["incident", physicalId(row, "incident_id")],
    ["backload", physicalId(row, "backload_id")],
    ["offload", physicalId(row, "offload_id")],
  ].filter(([, id]) => typeof id === "string" && id) as [string, string][];

  return ids.length
    ? `${reportKey}:${ids.map(([kind, id]) => `${kind}:${id}`).join(":")}`
    : null;
}
