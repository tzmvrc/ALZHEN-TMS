import { ApiError } from "../utils/api-response.js";
import { requireReportUuid, type ReportActor } from "./operations-report.logic.js";

export function splitOffloadDetails(input: unknown, actor: ReportActor, creating: boolean, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("Provide a report object.", 400, "INVALID_BODY");
  const body = { ...(input as Record<string, unknown>) };
  const metadata: Record<string, unknown> = {};
  const management = ["ADMIN", "STAFF"].includes(actor.role.toUpperCase());
  for (const key of ["reported_at", "reported_by"]) {
    if (!(key in body)) continue;
    if (!management) throw new ApiError("Only ADMIN or STAFF can change Report Date or Reported By.", 403, "OFFLOAD_REPORTER_ACCESS_DENIED");
    const value = body[key];
    if (key === "reported_by") metadata[key] = requireReportUuid(value, key);
    else {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiError("Report Date must include its timezone.", 400, "INVALID_REPORT_DATE");
      const calendarDate = value.slice(0, 10);
      if (new Date(`${calendarDate}T00:00:00Z`).toISOString().slice(0, 10) !== calendarDate) throw new ApiError("Enter a valid Report Date.", 400, "INVALID_REPORT_DATE");
      metadata[key] = new Date(value).toISOString();
    }
    delete body[key];
  }
  if (creating) {
    metadata.reported_at ??= now.toISOString();
    metadata.reported_by ??= requireReportUuid(actor.profileId, "creator_id");
    metadata.created_by = actor.profileId;
    metadata.submitted_by = actor.profileId;
    metadata.submitted_at = now.toISOString();
  }
  for (const [field, maximum] of [["reason", 2000], ["comments", 10000]] as const) {
    if (typeof body[field] === "string" && body[field].trim().length > maximum) throw new ApiError(`${field} must be at most ${maximum} characters.`, 400, "INVALID_TEXT");
  }
  if (metadata.reported_at) metadata.report_date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(String(metadata.reported_at)));
  return { body, metadata };
}
