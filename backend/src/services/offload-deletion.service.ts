import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { assertOperationsManagementRole, requireReportUuid, type ReportActor } from "./operations-report.logic.js";

type Job = { id: string; offload_id?: string; backload_id?: string; trip_id: string; trip_stop_id: string | null; state: "PENDING_STORAGE" | "COMPLETE"; storage_paths: string[]; attempts: number };
/** Same private journal/Storage recovery algorithm for each physical cargo report. */
export function createCargoReportCleanup<const S extends "OFFLOAD"|"BACKLOAD">(source:S){
 const name=source.toLowerCase(), idField=`${name}_id`, table=`${name}_deletion_jobs`;
 const recordId=(job:Job)=>String(job[idField as "offload_id"|"backload_id"]??"");
const fields = `id,${idField},trip_id,trip_stop_id,state,storage_paths,attempts`;
const running = new Map<string, Promise<ReturnType<typeof publicResult>>>();
function publicResult(job: Job) {
  return { operation_id: job.id, source_type: source, record_id: recordId(job), trip_id: job.trip_id, trip_stop_id: job.trip_stop_id, cleanup_pending: job.state !== "COMPLETE", state: job.state };
}
async function clean(job: Job) {
  if (job.state === "COMPLETE") return publicResult(job);
  const prefix = `operations/${job.trip_id}/${name}/${recordId(job)}/`;
  if (job.storage_paths.some((path) => typeof path !== "string" || !path.startsWith(prefix) || !/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/.test(path.slice(prefix.length)))) return publicResult(job);
  let failed = false;
  try { if (job.storage_paths.length) { const result = await supabaseAdmin.storage.from("report-receipts").remove(job.storage_paths); failed = Boolean(result.error); } }
  catch { failed = true; }
  const { data, error } = await supabaseAdmin.from(table).update({ attempts: job.attempts + 1,
    last_error: failed ? "Image cleanup failed. Retry cleanup." : null,
    ...(failed ? {} : { state: "COMPLETE", completed_at: new Date().toISOString() }),
  }).eq("id", job.id).eq(idField, recordId(job)).eq("state", "PENDING_STORAGE").select(fields).maybeSingle();
  // The database deletion is already committed. Never describe an acknowledgement
  // failure as a report deletion failure or claim Storage cleanup is complete.
  return publicResult(!error && data ? data as unknown as Job : job);
}
async function cleanOnce(job: Job) {
  if (!running.has(job.id)) running.set(job.id, clean(job).catch(() => publicResult(job)).finally(() => { running.delete(job.id); }));
  return running.get(job.id)!;
}
async function remove(actor: ReportActor, recordIdValue: string) {
  assertOperationsManagementRole(actor);
  const id = requireReportUuid(recordIdValue, idField);
  const { data, error } = await supabaseAdmin.rpc(`delete_${name}_with_cleanup_v1`, { [`p_${idField}`]: id, p_actor_id: actor.profileId });
  if (error) {
    if(source==="BACKLOAD" && ["PGRST202","42883"].includes(error.code)) throw new ApiError("Backload receipt images are protected until the proposed durable cleanup migration is approved. No report or image was deleted.",409,"REPORT_RECEIPTS_PROTECTED");
    if (error.code === "P0002") throw new ApiError(`${source} report not found.`, 404, "REPORT_NOT_FOUND");
    if (["55000", "23503", "23514"].includes(error.code)) throw new ApiError(error.code === "55000" ? error.message : "Protected dependencies prevent deletion. No report or image was deleted.", 409, "REPORT_DEPENDENCIES_PROTECTED");
    throw new ApiError(`${source} deletion could not be confirmed. Retry the same report ID; do not delete a different row.`, 503, `${source}_DELETE_UNCONFIRMED`);
  }
  if (!data?.id || recordId(data as unknown as Job) !== id) throw new ApiError("Deletion outcome could not be verified. Retry the same report.", 503, `${source}_DELETE_UNCONFIRMED`);
  return cleanOnce(data as unknown as Job);
}
async function retry(actor: ReportActor, operationId: string) {
  assertOperationsManagementRole(actor);
  const { data, error } = await supabaseAdmin.from(table).select(fields).eq("id", requireReportUuid(operationId, "operation_id")).maybeSingle();
  if (error) throw new ApiError("Cleanup operation could not be loaded.", 503, "CLEANUP_READ_FAILED");
  if (!data) throw new ApiError("Cleanup operation not found.", 404, "CLEANUP_NOT_FOUND");
  return cleanOnce(data as unknown as Job);
}
async function pending(actor: ReportActor) {
  assertOperationsManagementRole(actor);
  const { data, error } = await supabaseAdmin.from(table).select(`id,${idField},trip_id,trip_stop_id,state,attempts,created_at`).eq("state", "PENDING_STORAGE").order("created_at").limit(50);
  if(error && source==="BACKLOAD" && ["PGRST205","42P01"].includes(error.code))return [];
  if (error) throw new ApiError("Pending image cleanup could not be loaded.", 503, "CLEANUP_READ_FAILED");
  return (data ?? []) as unknown as Array<{id:string;offload_id?:string;backload_id?:string;state:"PENDING_STORAGE";attempts:number}>;
}

 return {remove,retry,pending};
}
const offload=createCargoReportCleanup("OFFLOAD"),backload=createCargoReportCleanup("BACKLOAD");
export const deleteOffloadPermanently=offload.remove,retryOffloadCleanup=offload.retry,listPendingOffloadCleanup=offload.pending;
export const deleteBackloadPermanently=backload.remove,retryBackloadCleanup=backload.retry,listPendingBackloadCleanup=backload.pending;
