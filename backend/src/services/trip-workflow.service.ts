import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { validateTripBundle } from "./trip-bundle.logic.js";
import { buildTripLineItemPayload } from "./trip.service.js";
import { assertActiveDropdownOption } from "./dropdown-option.service.js";
import { readImportSourceHistory } from "./trip-import-history.service.js";

export function workflowFailure(error: { code?: string; message?: string }): never {
  if (["PGRST202", "PGRST204", "PGRST205", "42703", "42P01", "42883"].includes(error.code ?? "")) throw new ApiError("This operation needs the trip_workflow_completion and trip_import_recovery database updates. This operation did not commit; earlier completed import chunks are preserved.", 503, "TRIP_WORKFLOW_SETUP_REQUIRED");
  if (["23505", "40001", "40P01", "55P03"].includes(error.code ?? "")) throw new ApiError("The trip or allocation changed or is being saved elsewhere. Reopen it before retrying the same request.", 409, "TRIP_WORKFLOW_CONFLICT");
  throw new ApiError(error.code === "42501" ? "Access denied." : error.message ?? "Unable to save the trip workflow.", error.code === "42501" ? 403 : 400, "TRIP_WORKFLOW_INVALID");
}
export async function createAtomicTripBundle(input: Record<string, unknown>, actor: string) {
  if (typeof input.request_id !== "string" || !isValidUuid(input.request_id) || !["new", "existing"].includes(String(input.dispatch_mode))) throw new ApiError("A stable creation request and dispatch mode are required.", 400);
  const validated = validateTripBundle(input);
  await assertActiveDropdownOption("trip_status", validated.trip.status ?? "PLANNED");
  const keys = new Set<string>();
  const stops = validated.stops.map(stop => ({ ...stop, line_items: stop.line_items.map(line => {
    const key = String(line.client_key ?? "");
    if (!key || keys.has(key)) throw new ApiError("Every cargo row requires a distinct source identity.", 400);
    keys.add(key);
    return { ...line, ...buildTripLineItemPayload(line) };
  }) }));
  const payload = { ...input, trip: validated.trip, stops, assignments: validated.assignments };
  const result = await supabaseAdmin.rpc("create_trip_bundle_v2", { p_actor: actor, p_request: input.request_id, p_payload: payload });
  if (result.error) workflowFailure(result.error);
  if (!result.data || !isValidUuid(result.data.id)) throw new ApiError("Save acknowledgement unavailable. Retry the same request without changing its contents.", 503);
  return result.data;
}
export async function finalizeImportCargo(input: Record<string, unknown>, actor: string) {
  if (typeof input.batch_id !== "string" || !isValidUuid(input.batch_id) || typeof input.group !== "string" || !input.group.trim() || !input.plan || typeof input.plan !== "object" || Array.isArray(input.plan)) throw new ApiError("Choose an import group and confirm its cargo proposal.", 400);
  const batch = await supabaseAdmin.from("trip_import_batches").select("workflow_draft").eq("id", input.batch_id).eq("created_by", actor).maybeSingle();
  if (batch.error) workflowFailure(batch.error);
  if (!batch.data) throw new ApiError("Import batch unavailable for this account.", 404);
  const sourceRows = (batch.data.workflow_draft?.preview?.rows ?? []).filter((row: { group: string; errors?: string[] }) => row.group === input.group && !row.errors?.length) as Array<{source_identity:string;filename:string;line:number;values:Record<string,string>}>;
  const history = await readImportSourceHistory(sourceRows.map(row => row.source_identity));
  const incomplete = sourceRows.find(row => history[row.source_identity]?.status !== "live");
  if (incomplete) throw new ApiError(`${incomplete.filename}, CSV row ${incomplete.line}, ${incomplete.values.customer_model}: expected Qty ${incomplete.values.quantity}, CBM ${incomplete.values.cbm}. Its product is not saved. Finish failed rows and missing-history recovery before confirming truck allocations.`, 409, "IMPORT_SOURCE_INCOMPLETE");
  const result = await supabaseAdmin.rpc("finalize_trip_import_cargo_v1", { p_actor: actor, p_batch: input.batch_id, p_group: input.group, p_plan: input.plan });
  if (result.error) workflowFailure(result.error);
  const saved=await supabaseAdmin.from("trip_import_batches").update({last_error:null,updated_at:new Date().toISOString()}).eq("id",input.batch_id).eq("created_by",actor);
  if(saved.error)console.error("Unable to update import recovery timestamp",{code:saved.error.code});
  return result.data;
}
export async function setDefaultTripDriver(input: Record<string,unknown>,actor:string){
  if(typeof input.truck_id!=="string"||!isValidUuid(input.truck_id)||(input.driver_id!==null&&(typeof input.driver_id!=="string"||!isValidUuid(input.driver_id))))throw new ApiError("Select a valid truck and driver.",400);
  const result=await supabaseAdmin.rpc("set_trip_default_driver_v1",{p_actor:actor,p_truck:input.truck_id,p_driver:input.driver_id});
  if(result.error)workflowFailure(result.error);
  return {truck_id:input.truck_id,driver_id:input.driver_id};
}
