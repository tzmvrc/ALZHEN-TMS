import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { requireUuid } from "./flexible-table.validation.js";
import { updateTrackerCell } from "./transmittal-tracker.service.js";

type Actor = { id: string; role: string };
function management(actor: Actor) {
  if (!["ADMIN", "STAFF"].includes(actor.role.toUpperCase())) throw new ApiError("Only ADMIN or STAFF can manage transactions.", 403, "TRANSACTION_ACCESS_DENIED");
}

async function ownedStop(tripIdInput: unknown, stopIdInput: unknown) {
  const tripId = requireUuid(tripIdInput, "trip_id");
  const stopId = requireUuid(stopIdInput, "trip_stop_id");
  const { data, error } = await supabaseAdmin.from("trip_stops").select("id,trip_id,archived_at").eq("id", stopId).eq("trip_id", tripId).maybeSingle();
  if (error) throw new ApiError("Unable to read transaction.", 500, "TRANSACTION_READ_FAILED");
  if (!data) throw new ApiError("Transaction does not belong to this trip.", 404, "TRANSACTION_NOT_FOUND");
  return data;
}

export async function setTransactionArchive(actor: Actor, tripIdInput: unknown, stopIdInput: unknown, archived: unknown) {
  management(actor);
  if (typeof archived !== "boolean") throw new ApiError("archived must be a boolean.", 400, "INVALID_TRANSACTION_ARCHIVE");
  const tripId = requireUuid(tripIdInput, "trip_id");
  const stop = stopIdInput == null ? null : await ownedStop(tripId, stopIdInput);
  if (!stop) {
    const { data, error } = await supabaseAdmin.from("trip_stops").select("id").eq("trip_id", tripId).limit(1);
    if (error) throw new ApiError("Unable to check trip transactions.", 500, "TRANSACTION_READ_FAILED");
    if (data?.length) throw new ApiError("Select the exact delivery transaction to archive.", 409, "TRANSACTION_STOP_REQUIRED");
  }
  let query = supabaseAdmin.from(stop ? "trip_stops" : "trips").update({
    archived_at: archived ? new Date().toISOString() : null,
    archived_by: archived ? requireUuid(actor.id, "actor_id") : null,
  }).eq("id", stop?.id ?? tripId);
  if (stop) query = query.eq("trip_id", tripId);
  const { data, error } = await query.select("id,archived_at,archived_by").maybeSingle();
  if (error) throw new ApiError("Unable to archive or restore transaction.", 500, "TRANSACTION_ARCHIVE_FAILED");
  if (!data) throw new ApiError("Transaction not found.", 404, "TRANSACTION_NOT_FOUND");
  return data;
}

export async function updateTransactionReference(actor: Actor, tripId: unknown, stopId: unknown, input: Record<string, unknown>) {
  management(actor);
  const stop = await ownedStop(tripId, stopId);
  const result = await updateTrackerCell(actor, stop.id, "transmittal_ref", input);
  return { id: stop.id, trip_id: stop.trip_id, transmittal_ref: result.cell.value, transmittal_ref_version: result.cell.version,
    ...(result.audit_warning ? { _mention_notification_warning: result.audit_warning } : {}) };
}
