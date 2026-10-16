import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { assertOperationsManagementRole, requireReportUuid, type ReportActor } from "./operations-report.logic.js";

type Job = { id: string; offload_id: string; trip_id: string; trip_stop_id: string | null; state: "PENDING_STORAGE" | "COMPLETE"; storage_paths: string[]; attempts: number };
const fields = "id,offload_id,trip_id,trip_stop_id,state,storage_paths,attempts";
const running = new Map<string, Promise<ReturnType<typeof publicResult>>>();
function publicResult(job: Job) {
  return { operation_id: job.id, source_type: "OFFLOAD" as const, record_id: job.offload_id, trip_id: job.trip_id, trip_stop_id: job.trip_stop_id, cleanup_pending: job.state !== "COMPLETE", state: job.state };
}
async function clean(job: Job) {
  if (job.state === "COMPLETE") return publicResult(job);
  const prefix = `operations/${job.trip_id}/offload/${job.offload_id}/`;
  if (job.storage_paths.some((path) => typeof path !== "string" || !path.startsWith(prefix) || !/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/.test(path.slice(prefix.length)))) return publicResult(job);
  let failed = false;
  try { if (job.storage_paths.length) { const result = await supabaseAdmin.storage.from("report-receipts").remove(job.storage_paths); failed = Boolean(result.error); } }
  catch { failed = true; }
  const { data, error } = await supabaseAdmin.from("offload_deletion_jobs").update({ attempts: job.attempts + 1,
    last_error: failed ? "Image cleanup failed. Retry cleanup." : null,
    ...(failed ? {} : { state: "COMPLETE", completed_at: new Date().toISOString() }),
  }).eq("id", job.id).eq("offload_id", job.offload_id).eq("state", "PENDING_STORAGE").select(fields).maybeSingle();
  // The database deletion is already committed. Never describe an acknowledgement
  // failure as a report deletion failure or claim Storage cleanup is complete.
  return publicResult(!error && data ? data as Job : job);
}
async function cleanOnce(job: Job) {
  if (!running.has(job.id)) running.set(job.id, clean(job).finally(() => { running.delete(job.id); }));
  return running.get(job.id)!;
}
export async function deleteOffloadPermanently(actor: ReportActor, recordId: string) {
  assertOperationsManagementRole(actor);
  const id = requireReportUuid(recordId, "offload_id");
  const { data, error } = await supabaseAdmin.rpc("delete_offload_with_cleanup_v1", { p_offload_id: id, p_actor_id: actor.profileId });
  if (error) {
    if (error.code === "P0002") throw new ApiError("Offload report not found.", 404, "REPORT_NOT_FOUND");
    if (["55000", "23503", "23514"].includes(error.code)) throw new ApiError(error.code === "55000" ? error.message : "Protected dependencies prevent deletion. No report or image was deleted.", 409, "REPORT_DEPENDENCIES_PROTECTED");
    throw new ApiError("Offload deletion could not be confirmed. Retry the same report ID; do not delete a different row.", 503, "OFFLOAD_DELETE_UNCONFIRMED");
  }
  if (!data?.id || data.offload_id !== id) throw new ApiError("Deletion outcome could not be verified. Retry the same report.", 503, "OFFLOAD_DELETE_UNCONFIRMED");
  return cleanOnce(data as Job);
}
export async function retryOffloadCleanup(actor: ReportActor, operationId: string) {
  assertOperationsManagementRole(actor);
  const { data, error } = await supabaseAdmin.from("offload_deletion_jobs").select(fields).eq("id", requireReportUuid(operationId, "operation_id")).maybeSingle();
  if (error) throw new ApiError("Cleanup operation could not be loaded.", 503, "CLEANUP_READ_FAILED");
  if (!data) throw new ApiError("Cleanup operation not found.", 404, "CLEANUP_NOT_FOUND");
  return cleanOnce(data as Job);
}
export async function listPendingOffloadCleanup(actor: ReportActor) {
  assertOperationsManagementRole(actor);
  const { data, error } = await supabaseAdmin.from("offload_deletion_jobs").select("id,offload_id,trip_id,trip_stop_id,state,attempts,created_at").eq("state", "PENDING_STORAGE").order("created_at").limit(50);
  if (error) throw new ApiError("Pending image cleanup could not be loaded.", 503, "CLEANUP_READ_FAILED");
  return data ?? [];
}
