import { workflowFailure } from "./trip-workflow.service.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { prepareImport, rowFingerprint, type SourceFile, type ImportRow, type ImportTarget } from "./trip-import.logic.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
function signature(row: ImportRow) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(JSON.stringify(canonical([
    row.filename, row.line, row.document_hash, row.source_identity, row.fingerprint, row.values, row.errors, row.warnings, row.unmapped ?? {}, row.original_values ?? {},
  ]))).digest("hex");
}
function schemaError(error: { code?: string; message?: string }): never {
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    throw new ApiError("Bulk import needs the 2026_10_21_trip_source_import.sql database update. No trip data was imported.", 503, "TRIP_IMPORT_SETUP_REQUIRED");
  }
  throw new ApiError("Unable to check import records. Try again before importing.", 503, "TRIP_IMPORT_UNAVAILABLE");
}
const missingImportSchema = (error: { code?: string } | null) => Boolean(error && ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? ""));
export async function previewTripImport(files: SourceFile[]) {
  let rows: ImportRow[];
  try { rows = prepareImport(files); } catch (e) { throw new ApiError((e as Error).message, 400, "INVALID_IMPORT"); }
  const known = new Set<string>(), fingerprints = new Set<string>();
  let setupRequired = false;
  const workflowSchema = await supabaseAdmin.from("trips").select("creation_request_id").limit(0);
  if (missingImportSchema(workflowSchema.error)) setupRequired = true;
  else if (workflowSchema.error) schemaError(workflowSchema.error);
  const rowsByDelivery = new Map<string, ImportRow[]>();
  for (const row of rows) if (row.values.dr_number) {
    const candidates = rowsByDelivery.get(row.values.dr_number) ?? [];
    candidates.push(row); rowsByDelivery.set(row.values.dr_number, candidates);
  }
  // Supabase's page limit is not an import limit. Read every matching provenance page.
  const hashes = [...new Set(rows.map(row => row.fingerprint))];
  for (let offset = 0; offset < hashes.length; offset += 100) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin.from("trip_import_rows").select("source_identity, fingerprint")
        .eq("status", "imported").in("fingerprint", hashes.slice(offset, offset + 100)).range(page * 500, page * 500 + 499);
      if (missingImportSchema(error)) { setupRequired = true; break; }
      if (error) schemaError(error);
      for (const row of data ?? []) { known.add(row.source_identity); fingerprints.add(row.fingerprint); }
      if ((data?.length ?? 0) < 500) break;
    }
    if (setupRequired) break;
  }
  // Existing manually entered cargo predates the provenance ledger. Treat a business match
  // as reviewable, never as an exact duplicate or permission to overwrite the old cargo.
  const businessMatches = new Set<string>();
  const deliveryRefs = [...new Set(rows.map(row => row.values.dr_number).filter((value): value is string => Boolean(value)))];
  for (let offset = 0; !setupRequired && offset < deliveryRefs.length; offset += 100) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin.from("trip_line_items")
        .select("dr_number, customer_model, order_item_number, sp_reference, dn_reference")
        .in("dr_number", deliveryRefs.slice(offset, offset + 100)).range(page * 500, page * 500 + 499);
      if (missingImportSchema(error)) { setupRequired = true; break; }
      if (error) schemaError(error);
      for (const item of data ?? []) for (const row of rowsByDelivery.get(item.dr_number) ?? []) {
        if (item.dr_number === row.values.dr_number && item.customer_model === row.values.customer_model
          && (!item.order_item_number || !row.values.order_item_number || item.order_item_number === row.values.order_item_number)
          && (!item.sp_reference || !row.values.sp_reference || item.sp_reference === row.values.sp_reference)
          && (!item.dn_reference || !row.values.dn_reference || item.dn_reference === row.values.dn_reference)) businessMatches.add(row.fingerprint);
      }
      if ((data?.length ?? 0) < 500) break;
    }
  }
  const seen = new Set<string>();
  const selectedFingerprints = new Map<string, Set<string>>();
  for (const row of rows) {
    const documents = selectedFingerprints.get(row.fingerprint) ?? new Set<string>();
    documents.add(row.document_hash); selectedFingerprints.set(row.fingerprint, documents);
  }
  rows = rows.map(row => {
    const duplicate = known.has(row.source_identity) || seen.has(row.source_identity);
    seen.add(row.source_identity);
    return { ...row, duplicate, potential_duplicate: !duplicate && (businessMatches.has(row.fingerprint) || fingerprints.has(row.fingerprint) || (selectedFingerprints.get(row.fingerprint)?.size ?? 0) > 1), signature: signature(row) };
  });
  return { rows, detected: rows.length, valid: rows.filter(row => !row.errors.length).length,
    setup_required: setupRequired, duplicate_check_status: setupRequired ? "unavailable" as const : "complete" as const,
    setup_message: setupRequired ? "Preview is available. Apply the reviewed source-import and 2026_10_21_trip_workflow_completion.sql migrations to enable duplicate checks and saving. No trip data has been saved." : null,
    invalid: rows.filter(row => row.errors.length).length, duplicates: rows.filter(row => row.duplicate).length,
    potential_duplicates: rows.filter(row => row.potential_duplicate).length };
}
export async function commitTripImport(input: { batch_id: string; rows: ImportRow[]; target: ImportTarget; group: string; verified_matches?: boolean; verified_cbm?: boolean; verified_unmapped?: boolean; location_resolutions?: Record<string,Record<string,unknown>> }, creator: string) {
  if (!input || !isValidUuid(input.batch_id) || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > 100) throw new ApiError("Send 1–100 source rows per chunk, with a valid import batch ID.", 400, "INVALID_IMPORT");
  if (!input.group?.trim() || !["new", "dispatch", "trip"].includes(input.target?.mode) || typeof input.target.allow_create !== "boolean") throw new ApiError("Confirm the trip grouping and customer creation policy.", 400, "IMPORT_GROUP_REQUIRED");
  if (input.target.mode === "trip" && !isValidUuid(input.target.value)) throw new ApiError("Select a valid existing trip.", 400, "INVALID_IMPORT_TRIP");
  if (input.target.mode === "dispatch" && !input.target.value?.trim()) throw new ApiError("Select an existing dispatch.", 400, "INVALID_IMPORT_DISPATCH");
  if(input.target.origin_warehouse_id&&!isValidUuid(input.target.origin_warehouse_id))throw new ApiError("Select a valid trip origin warehouse.",400);
  if(input.target.warehouse_ids && (typeof input.target.warehouse_ids!=="object" || Object.values(input.target.warehouse_ids).some(id=>!isValidUuid(id))))throw new ApiError("Select valid warehouse identities.",400);
  for (const row of input.rows) {
    if (Object.keys(row.unmapped ?? {}).length && !input.verified_unmapped) throw new ApiError("Review unmapped source columns before importing. Their values will be retained in provenance.", 400, "IMPORT_MAPPING_REVIEW_REQUIRED");
    if (row.warnings?.some(warning=>warning.includes("Total CBM differs")) && !input.verified_cbm) throw new ApiError("Review the CBM discrepancies and confirm the supplied totals.", 400, "IMPORT_CBM_REVIEW_REQUIRED");
    const expected = Buffer.from(signature(row), "hex"), supplied = Buffer.from(row.signature ?? "", "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied) || row.errors.length || rowFingerprint(row.values) !== row.fingerprint) throw new ApiError("The preview changed or contains invalid rows. Prepare the preview again.", 400, "IMPORT_PREVIEW_EXPIRED");
  }
  const locations = input.location_resolutions ?? {};
  if (!locations || typeof locations !== "object" || Array.isArray(locations) || Object.keys(locations).some(identity=>!input.rows.some(row=>row.source_identity===identity))) throw new ApiError("Invalid destination review scope.",400);
  for (const location of Object.values(locations)) {
    if (!location || typeof location !== "object" || Array.isArray(location)) throw new ApiError("Invalid destination review.",400);
    for(const key of ["customer_id","store_id"])if(location[key]&&(typeof location[key]!=="string"||!isValidUuid(location[key] as string)))throw new ApiError("Invalid destination identity.",400);
    if(location.verified===true){for(const key of ["latitude","longitude"]){const value=location[key];if(value===null||value===undefined||String(value).trim()===""||!Number.isFinite(Number(value))||Math.abs(Number(value))>(key==="latitude"?90:180))throw new ApiError("Review a valid destination coordinate pair.",400);}}
  }
  const { data, error } = await supabaseAdmin.rpc("import_trip_source_rows_v2", {
    p_batch: input.batch_id, p_creator: creator, p_group: input.group.trim(), p_target: input.target,
    p_rows: input.rows, p_verified: input.verified_matches === true, p_locations: locations,
  });
  if (error) workflowFailure(error);
  if(data?.rows?.every((row:{status:string})=>row.status!=="failed")){
    const updated=await supabaseAdmin.from("trip_import_batches").update({last_error:null,updated_at:new Date().toISOString()}).eq("id",input.batch_id).eq("created_by",creator);
    if(updated.error)console.error("Unable to update import recovery timestamp",{code:updated.error.code});
  }
  return data;
}
