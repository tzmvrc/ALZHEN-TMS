import {withCurrentUserSession,type DeletionCredentials} from "./deletion-password.service.js";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { requireUuid } from "./flexible-table.validation.js";
import { isValidUuid } from "../utils/validation.js";

type Actor = { id: string; role: string };
type StorageObject = { bucket: string; path: string; object_id?: string };
type Job = { id: string; transaction_id: string; trip_id: string; trip_stop_id: string | null; state: string; attempts: number; storage_objects: StorageObject[] };
const fields = "id,transaction_id,trip_id,trip_stop_id,state,attempts,storage_objects";
const running = new Map<string, Promise<ReturnType<typeof result>>>();
function authorize(actor: Actor) {
  if (!["ADMIN", "STAFF"].includes(actor.role.toUpperCase())) throw new ApiError("Only ADMIN or STAFF may delete transactions.", 403, "TRANSACTION_ACCESS_DENIED");
}
function result(job: Job, blockedReason?: string) {
  return { operation_id: job.id, transaction_id: job.transaction_id, trip_id: job.trip_id, trip_stop_id: job.trip_stop_id, cleanup_pending: job.state !== "COMPLETE", ...(blockedReason ? { cleanup_blocked_reason: blockedReason } : {}) };
}
function ownedObject(job: Job, object: { bucket: string; path: string }) {
  if (typeof object?.path !== "string") return false;
  const prefix = object.bucket === "trip-images" ? `trips/${job.trip_id}/` : object.bucket === "report-receipts" ? `operations/${job.trip_id}/` : null;
  if (!prefix || !object.path.startsWith(prefix)) return false;
  const tail = object.path.slice(prefix.length);
  return (object.bucket === "trip-images"
    ? /^(?:[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp)|delivery\/[a-f0-9-]{36}\/[a-f0-9-]{36})$/
    : /^(loading|unloading|backload|offload)\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/).test(tail);
}
async function clean(job: Job, actor: Actor) {
  if (job.state === "COMPLETE") return result(job);
  const blocked = async (reason: string) => {
    try { await supabaseAdmin.from("transaction_deletion_jobs").update({ last_error: reason }).eq("id", job.id).eq("state", "PENDING_STORAGE"); } catch { /* Journal remains pending even if diagnostic acknowledgement fails. */ }
    return result(job, reason);
  };
  if (!Array.isArray(job.storage_objects) || job.storage_objects.some((object) => !ownedObject(job, object))) return blocked("Cleanup manifest contains an unverified object. Ownership review is required.");
  // A committed journal is necessary but not sufficient: retained references or
  // a replacement object at the same path must stop cleanup. The separately
  // proposed service-only RPC validates exact identities without browser grants.
  let objects: StorageObject[];
  try {
    const { data, error } = await supabaseAdmin.rpc("validate_transaction_cleanup_objects_v1", { p_operation_id: job.id, p_actor_id: actor.id });
    if (error || !Array.isArray(data) || data.some((object: StorageObject) => !ownedObject(job, object) || !isValidUuid(object.object_id) || !job.storage_objects.some(item => item.bucket === object.bucket && item.path === object.path && item.object_id === object.object_id))) return blocked("Storage ownership verification is unavailable or blocked. The committed journal is retained for review and retry.");
    objects = data;
  } catch { return blocked("Storage ownership verification is unavailable. The committed journal is retained for retry."); }
  let failed = false;
  for (const bucket of ["report-receipts", "trip-images"]) {
    const paths = [...new Set(objects.filter((object) => object.bucket === bucket).map((object) => object.path))];
    // Exact objects only. Retrying an already-removed object is safe.
    for (let start = 0; start < paths.length; start += 100) {
      try { const outcome = await supabaseAdmin.storage.from(bucket).remove(paths.slice(start, start + 100)); if (outcome.error) failed = true; }
      catch { failed = true; }
    }
  }
  try {
    const { data, error } = await supabaseAdmin.from("transaction_deletion_jobs").update({ attempts: job.attempts + 1,
      last_error: failed ? "Image cleanup failed; retry the same operation." : null,
      ...(failed ? {} : { state: "COMPLETE", completed_at: new Date().toISOString() }),
    }).eq("id", job.id).eq("transaction_id", job.transaction_id).eq("state", "PENDING_STORAGE").select(fields).maybeSingle();
    return result(!error && data ? data as Job : job);
  } catch { return result(job); } // DB deletion is committed even if acknowledgement fails.
}
function cleanOnce(job: Job, actor: Actor) {
  if (!running.has(job.id)) running.set(job.id, clean(job, actor).finally(() => { running.delete(job.id); }));
  return running.get(job.id)!;
}
async function deleteConfirmedTransaction(actor: Actor, tripInput: unknown, stopInput: unknown) {
  authorize(actor);
  const trip = requireUuid(tripInput, "trip_id"), stop = stopInput == null ? null : requireUuid(stopInput, "trip_stop_id");
  const { data, error } = await supabaseAdmin.rpc("delete_transaction_with_cleanup_v1", { p_trip_id: trip, p_stop_id: stop, p_actor_id: requireUuid(actor.id, "actor_id") });
  if (error) {
    if (error.code === "P0002") throw new ApiError(error.message, 404, "TRANSACTION_NOT_FOUND");
    if (["55000", "23001", "23503", "23514"].includes(error.code)) throw new ApiError(error.code === "55000" ? error.message : "Protected dependencies prevent deletion. Nothing was deleted.", 409, "TRANSACTION_DELETE_PROTECTED");
    throw new ApiError("Deletion could not be confirmed. Retry this same transaction, not another row.", 503, "TRANSACTION_DELETE_UNCONFIRMED");
  }
  if (!data?.id || data.trip_id !== trip || data.trip_stop_id !== stop || data.transaction_id !== (stop ?? trip)) throw new ApiError("Deletion identity could not be confirmed. Retry the same transaction.", 503, "TRANSACTION_DELETE_UNCONFIRMED");
  return cleanOnce(data as Job, actor);
}
export async function listTransactionCleanup(actor: Actor) {
  authorize(actor);
  const { data, error } = await supabaseAdmin.from("transaction_deletion_jobs").select("id,transaction_id,trip_id,trip_stop_id,created_at,last_error").eq("state", "PENDING_STORAGE").order("created_at").limit(50);
  if (error) throw new ApiError("Pending transaction cleanup could not be loaded.", 503, "CLEANUP_READ_FAILED");
  return data ?? [];
}
export async function transactionDeletionVersion(actor: Actor) {
  authorize(actor);
  const { data, error } = await supabaseAdmin.from("transaction_deletion_jobs").select("revision").order("revision", { ascending: false }).limit(1);
  if (error) throw new ApiError("Transaction changes could not be checked.", 503, "TRANSACTION_CHANGES_FAILED");
  return { version: data?.[0]?.revision == null ? null : String(data[0].revision) };
}
export async function retryTransactionCleanup(actor: Actor, input: unknown) {
  authorize(actor);
  const { data, error } = await supabaseAdmin.from("transaction_deletion_jobs").select(fields).eq("id", requireUuid(input, "operation_id")).maybeSingle();
  if (error) throw new ApiError("Cleanup could not be loaded.", 503, "CLEANUP_READ_FAILED");
  if (!data) throw new ApiError("Cleanup operation not found.", 404, "CLEANUP_NOT_FOUND");
  return cleanOnce(data as Job, actor);
}

/** Last-stop/empty-parent deletion is never reachable without fresh current-user authentication. */
export function createTransactionDeleter(verify=withCurrentUserSession){
 return async(actor:Actor,tripInput:unknown,stopInput:unknown,credentials:DeletionCredentials={password:undefined,accessToken:"",appSessionId:null})=>{
  authorize(actor);
  const owner=Object.freeze({...actor}),trip=requireUuid(tripInput,"trip_id"),stop=stopInput==null?null:requireUuid(stopInput,"trip_stop_id");
  return verify(owner,credentials,()=>deleteConfirmedTransaction(owner,trip,stop));
 };
}
export const deleteTransaction=createTransactionDeleter();
