import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { requireReportUuid, type ReportActor } from "./operations-report.logic.js";

/** Request keys belong to a submission, not a trip. Never regenerate on retry. */
export function submissionRequest(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("Provide a report object.", 400, "INVALID_BODY");
  const { request_id, ...body } = input as Record<string, unknown>;
  return { body, requestId: request_id === undefined ? undefined : requireReportUuid(request_id, "request_id") };
}

export function submissionError(error: { code?: string; message?: string } | null, operation: string): never {
  if (error?.code === "40001") throw new ApiError("This request was already used with different content. Review the original submission before retrying.", 409, "SUBMISSION_CONFLICT");
  if (error?.code === "42501") throw new ApiError("You are no longer authorized for this trip.", 403, "REPORT_ACCESS_DENIED");
  if (error?.code === "23514" && /images/i.test(error.message ?? "")) throw new ApiError("The report image limit has been reached. Refresh the existing images.", 409, "REPORT_IMAGE_LIMIT");
  if (["22023", "22P02", "23514"].includes(error?.code ?? "")) throw new ApiError("The report or image details are invalid. Check the selected trip, stop and field values.", 400, "INVALID_REPORT_SUBMISSION");
  if (error?.code === "55000" || error?.code === "P0002") throw new ApiError("The report changed or is unavailable. Reload before retrying.", 409, "REPORT_CHANGED");
  throw new ApiError(`Unable to ${operation}. Retry the same request; do not create another submission.`, 502, "REPORT_REQUEST_FAILED");
}

export async function submitReportOnce(actor: ReportActor, requestId: string, type: "BACKLOAD" | "OFFLOAD", payload: Record<string, unknown>, report: Record<string, unknown>, item = {}) {
  const { data, error } = await supabaseAdmin.rpc("submit_operations_report_v1", {
    p_actor: actor.profileId, p_request: requireReportUuid(requestId, "request_id"), p_type: type,
    p_payload: payload, p_report: report, p_item: item,
  });
  if (error || !data) submissionError(error, "save the report");
  return data;
}

/** Ownership is durable BEFORE bytes are uploaded. An interrupted upload keeps
 * its reservation and capacity slot; retry uses the same immutable path/hash. */
export async function uploadReceiptOnce(actor: ReportActor, type: "BACKLOAD" | "OFFLOAD", recordId: string, bytes: Buffer, mime: string, name: string, requestId: string = randomUUID()) {
  const key = requireReportUuid(requestId, "upload_request_id");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const { data: reservation, error } = await supabaseAdmin.rpc("reserve_operations_receipt_v1", {
    p_actor: actor.profileId, p_request: key, p_type: type, p_record: recordId,
    p_name: name, p_mime: mime, p_size: bytes.length, p_sha256: sha,
  });
  if (error || !reservation) submissionError(error, "reserve the report image");
  if (reservation.upload_status !== "READY") {
    const bucket = supabaseAdmin.storage.from("report-receipts");
    const result = await bucket.upload(reservation.storage_path, bytes, { contentType: mime, upsert: false });
    if (result.error) {
      // A lost successful upload response or a simultaneous identical retry
      // may already have stored the bytes. Verify content; never overwrite it.
      const existing = await bucket.download(reservation.storage_path);
      if (existing.error || !existing.data || createHash("sha256").update(Buffer.from(await existing.data.arrayBuffer())).digest("hex") !== sha) {
        throw new ApiError("The report is saved but this image is incomplete. Retry the same image upload.", 502, "REPORT_IMAGE_UPLOAD_FAILED");
      }
    }
    const completed = await supabaseAdmin.rpc("complete_operations_receipt_v1", { p_actor: actor.profileId, p_request: key });
    if (completed.error || !completed.data) submissionError(completed.error, "confirm the report image");
    return safeReceipt(completed.data);
  }
  return safeReceipt(reservation);
}

function safeReceipt(row: Record<string, unknown>) {
  const { storage_path: _path, upload_sha256: _sha, upload_request_id: _request, ...safe } = row;
  return safe;
}
