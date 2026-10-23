import type { CargoPlan } from "./cargo-planning";
import { fetchTripAssignments, updateTripAssignmentRecord } from "./trip.service";
import type { LocationDecision } from "../components/admin/ImportDestinationReview";
import { apiGet, apiPost, invalidateApiCache, type ApiResponse } from "./api.service";
import { invalidateReportPageCache } from "./report.service";
import type { importPayload } from "../components/admin/tripImportFiles";
import type { TripDetails } from "../../../packages/trip-import/trip-details.js";
export type { TripDetails } from "../../../packages/trip-import/trip-details.js";
export type ImportRow = {
  master_values?: Record<string, string | null>;
  filename: string; line: number; group: string; values: Record<string, string | null>; errors: string[]; warnings: string[];
  source_identity: string; document_hash: string; fingerprint: string; signature: string;
  duplicate: boolean; potential_duplicate: boolean;
  original_values?: Record<string,string>;
  unmapped?: Record<string, string>;
};
export type ImportWarehouseMatch = { status: "matched" | "missing" | "conflict"; id?: string; label?: string; candidates: Array<{ id: string; code: string; name: string }> };
export type ImportSourceHistory = { status: "live" | "missing" | "failed"; batch_id: string; line_item_id: string | null; trip_id?: string; source_row: number; model: string | null; imported_at: string | null };
export type ImportRowResolution = { product_id?: string; product_label?: string; product_match_confirmed?: boolean; restore_missing_source?: boolean; restore_history_version?: string | null };
export type ImportPreview = { rows: ImportRow[]; detected: number; valid: number; invalid: number; duplicates: number; potential_duplicates: number; history?: Record<string, ImportSourceHistory>; warehouse_matches?: Record<string, ImportWarehouseMatch>; setup_required?: boolean; duplicate_check_status?: "complete" | "unavailable"; setup_message?: string | null };
export type ImportTarget = { mode: "new" | "dispatch" | "trip"; value: string; allow_create: boolean; warehouse_ids?: Record<string,string>; origin_warehouse_id?: string; trip_details?: TripDetails };
export type ImportOutcome = { source_identity: string; status: "imported" | "skipped" | "failed"; error?: string; line_item_id?: string; trip_id?: string; trip_created?: boolean; trip_reference?: string; original_batch_id?: string };
export type ImportBatchSummary = { id: string; state: "Pending" | "Partially Imported" | "Awaiting Allocation" | "Completed" | "Failed"; revision: number; imported: number; failed: number; awaiting_allocation: number; location_retry_required?: boolean; last_error: string | null; updated_at: string };
export type ImportRecoveryDraft = { trip_details?: TripDetails; files: import("../components/admin/tripImportFiles").ImportFile[]; preview: ImportPreview | null; targets: Record<string,ImportTarget>; plans: Record<string,CargoPlan>; locations: Record<string,LocationDecision>; rowResolutions?: Record<string, ImportRowResolution>; initialTarget?: ImportTarget; confirmed: boolean; verified: boolean; verifiedCbm: boolean; verifiedUnmapped: boolean; started: boolean; locationFollowupPending?: boolean; detailsDirty?: boolean };
export type ImportBatchRecovery = ImportBatchSummary & { draft: ImportRecoveryDraft; outcomes: ImportOutcome[]; history?: Record<string,ImportSourceHistory>; cargo_saved: Record<string,boolean> };
/** A retry updates only missing company details on the existing assignments. */
export async function saveImportAssignmentCompanies(token: string, tripId: string, plan: CargoPlan) {
  const trucks = plan.trucks.filter(truck => truck.companyId);
  if (!trucks.length) return;
  invalidateApiCache(`/trips/${encodeURIComponent(tripId)}/assignments`);
  const assignments = await fetchTripAssignments(token, tripId);
  for (const truck of trucks) {
    const assignment = assignments.find(row => row.truck_id === truck.id && !row.unassigned_at);
    if (!assignment) throw new Error("Cargo was saved, but a truck assignment changed. Review Trip details before retrying company assignment.");
    if (assignment.trucking_company_id !== truck.companyId) {
      try { await updateTripAssignmentRecord(token, tripId, String(assignment.id), { trucking_company_id: truck.companyId }); }
      catch { throw new Error("The trip and cargo are saved. Retry this same batch to finish trucking company details without creating another trip."); }
    }
  }
}
export async function setDefaultTripDriver(token:string,truck_id:string,driver_id:string|null){const response=await apiPost<ApiResponse<unknown>>("/trips/default-driver",{truck_id,driver_id},token);if(!response.success)throw Error(response.message??"Unable to save default driver.");invalidateApiCache("/lookup");return response.data;}
export async function fetchImportBatches(token:string){const response=await apiGet<ApiResponse<ImportBatchSummary[]>>("/trips/import/batches",token);if(!response.success||!response.data)throw Error(response.message??"Unable to load saved imports.");return response.data;}
export async function reopenImportBatch(token:string,id:string){const response=await apiGet<ApiResponse<ImportBatchRecovery>>(`/trips/import/batches/${encodeURIComponent(id)}`,token);if(!response.success||!response.data)throw Error(response.message??"Unable to reopen this import.");return response.data;}
export async function saveImportBatchDraft(token:string,id:string,revision:number,draft:ImportRecoveryDraft){const response=await apiPost<ApiResponse<{revision:number}>>(`/trips/import/batches/${encodeURIComponent(id)}/draft`,{revision,draft},token);if(!response.success||!response.data)throw Error(response.message??"Unable to save the import draft. Keep this window open.");return response.data;}
export async function previewImport(token: string, files: ReturnType<typeof importPayload>) {
  const response = await apiPost<ApiResponse<ImportPreview>>("/trips/import/preview", { files }, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to prepare import preview.");
  return response.data;
}
export async function commitImport(token: string, batch_id: string, group: string, target: ImportTarget, rows: ImportRow[], verified_matches: boolean, verified_cbm: boolean, verified_unmapped = false, location_resolutions: Record<string,Partial<LocationDecision> & ImportRowResolution> = {}) {
  const response = await apiPost<ApiResponse<{ batch_id: string; rows: ImportOutcome[]; history?: Record<string,ImportSourceHistory> }>>("/trips/import/commit", { batch_id, group, target, rows, verified_matches, verified_cbm, verified_unmapped, location_resolutions }, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to confirm import. Retry the same batch.");
  invalidateApiCache("/reports"); invalidateApiCache("/trips"); invalidateReportPageCache();
  return response.data;
}

export async function confirmImportCargo(token:string,batch_id:string,group:string,plan:CargoPlan){const response=await apiPost<ApiResponse<{trip_id:string}>>("/trips/import/allocate",{batch_id,group,plan},token);if(!response.success||!response.data)throw new Error(response.message??"Cargo is not confirmed. Retry this batch; imported rows remain safe.");invalidateApiCache("/trips");invalidateApiCache("/reports");invalidateReportPageCache();return response.data;}
