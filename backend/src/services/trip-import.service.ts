import { importLocationForRpc, deliveryAddress } from "./trip-delivery-address.logic.js";
import { requireTripDeliveryAddresses } from "./trip-delivery-address.service.js";
import { workflowFailure } from "./trip-workflow.service.js";
import { validateImportTripDetails } from "./import-trip-details.logic.js";
import { assertActiveDropdownOption } from "./dropdown-option.service.js";
import { readImportSourceHistory } from "./trip-import-history.service.js";
import { masterListAvailable } from "./master-list.service.js";
import { schemaCapability } from "./schema-capability-cache.js";
import { matchImportWarehouses, checkImportWarehouseTargets } from "./trip-import-warehouse.service.js";
import { prepareImportDestinationDecisions, persistImportDestinationLocations } from "./trip-location.service.js";
import { destinationLookupKey, storeIdentityText } from "./trip-location.logic.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { prepareImport, rowFingerprint, type SourceFile, type ImportRow, type ImportTarget } from "./trip-import.logic.js";

const locationFingerprint = (row: ImportRow) => JSON.stringify([row.fingerprint, destinationLookupKey({ ship_to: row.values.ship_to ?? "", province: row.values.province ?? "", city: row.values.city ?? "" })]);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
function signature(row: ImportRow) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(JSON.stringify(canonical([
    row.filename, row.line, row.document_hash, row.source_identity, row.fingerprint, row.values, row.errors, row.warnings, row.unmapped ?? {}, row.original_values ?? {}, row.master_values ?? {},
  ]))).digest("hex");
}
function schemaError(error: { code?: string; message?: string }): never {
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    throw new ApiError("Bulk import needs the 2026_10_21_trip_source_import.sql database update. No trip data was imported.", 503, "TRIP_IMPORT_SETUP_REQUIRED");
  }
  throw new ApiError("Unable to check import records. Try again before importing.", 503, "TRIP_IMPORT_UNAVAILABLE");
}
const missingImportSchema = (error: { code?: string } | null) => Boolean(error && ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? ""));
const importWorkflowAvailable = schemaCapability(async () => {
  const { error } = await supabaseAdmin.from("trips").select("creation_request_id").limit(0);
  if (error && !missingImportSchema(error)) schemaError(error);
  return !error;
});
export async function previewTripImport(files: SourceFile[]) {
  let rows: ImportRow[];
  try { rows = prepareImport(files); } catch (e) { throw new ApiError((e as Error).message, 400, "INVALID_IMPORT"); }
  const known = new Set<string>(), fingerprints = new Set<string>();
  let setupRequired = false;
  const masterSetupRequired = rows.some(row => Object.keys(row.master_values ?? {}).length > 0) && !await masterListAvailable();
  if (masterSetupRequired) setupRequired = true;
  if (!await importWorkflowAvailable()) setupRequired = true;
  const rowsByDelivery = new Map<string, ImportRow[]>();
  for (const row of rows) if (row.values.dr_number) {
    const candidates = rowsByDelivery.get(row.values.dr_number) ?? [];
    candidates.push(row); rowsByDelivery.set(row.values.dr_number, candidates);
  }
  // Supabase's page limit is not an import limit. Read every matching provenance page.
  const hashes = [...new Set(rows.map(row => row.fingerprint))];
  for (let offset = 0; offset < hashes.length; offset += 100) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin.from("trip_import_rows").select("source_identity, fingerprint, source_ship_to:source_values->>ship_to, source_province:source_values->>province, source_city:source_values->>city")
        .eq("status", "imported").not("line_item_id", "is", null).in("fingerprint", hashes.slice(offset, offset + 100)).order("source_identity").range(page * 500, page * 500 + 499);
      if (missingImportSchema(error)) { setupRequired = true; break; }
      if (error) schemaError(error);
      for (const row of data ?? []) {
        known.add(row.source_identity);
        fingerprints.add(JSON.stringify([row.fingerprint, destinationLookupKey({ ship_to: row.source_ship_to ?? "", province: row.source_province ?? "", city: row.source_city ?? "" })]));
      }
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
        .select("dr_number, customer_model, order_item_number, sp_reference, dn_reference, source_province, source_city")
        .in("dr_number", deliveryRefs.slice(offset, offset + 100)).order("id").range(page * 500, page * 500 + 499);
      if (missingImportSchema(error)) { setupRequired = true; break; }
      if (error) schemaError(error);
      for (const item of data ?? []) for (const row of rowsByDelivery.get(item.dr_number) ?? []) {
        if (item.dr_number === row.values.dr_number && item.customer_model === row.values.customer_model
          && (!item.source_province || storeIdentityText(item.source_province) === storeIdentityText(row.values.province))
          && (!item.source_city || storeIdentityText(item.source_city) === storeIdentityText(row.values.city))
          && (!item.order_item_number || !row.values.order_item_number || item.order_item_number === row.values.order_item_number)
          && (!item.sp_reference || !row.values.sp_reference || item.sp_reference === row.values.sp_reference)
          && (!item.dn_reference || !row.values.dn_reference || item.dn_reference === row.values.dn_reference)) businessMatches.add(locationFingerprint(row));
      }
      if ((data?.length ?? 0) < 500) break;
    }
  }
  const seen = new Set<string>();
  const history: Awaited<ReturnType<typeof readImportSourceHistory>> = setupRequired ? {} : await readImportSourceHistory(rows.map(row => row.source_identity));
  const selectedFingerprints = new Map<string, Set<string>>();
  for (const row of rows) {
    const identity = locationFingerprint(row);
    const documents = selectedFingerprints.get(identity) ?? new Set<string>();
    documents.add(row.document_hash); selectedFingerprints.set(identity, documents);
  }
  rows = rows.map(row => {
    const duplicate = (known.has(row.source_identity) && history[row.source_identity]?.status === "live") || seen.has(row.source_identity);
    seen.add(row.source_identity);
    return { ...row, duplicate, potential_duplicate: !duplicate && (businessMatches.has(locationFingerprint(row)) || fingerprints.has(locationFingerprint(row)) || (selectedFingerprints.get(locationFingerprint(row))?.size ?? 0) > 1), signature: signature(row) };
  });
  const warehouse_matches = setupRequired ? {} : await matchImportWarehouses(rows);
  return { rows, warehouse_matches, history, detected: rows.length, valid: rows.filter(row => !row.errors.length).length,
    setup_required: setupRequired, duplicate_check_status: setupRequired ? "unavailable" as const : "complete" as const,
    setup_message: masterSetupRequired ? "Preview is available. Master List values require approval and application of 2026_11_17_proposed_master_list_csv.sql before importing. No trip data has been saved." : setupRequired ? "Preview is available. Apply the reviewed source-import and 2026_10_21_trip_workflow_completion.sql migrations to enable duplicate checks and saving. No trip data has been saved." : null,
    invalid: rows.filter(row => row.errors.length).length, duplicates: rows.filter(row => row.duplicate).length,
    potential_duplicates: rows.filter(row => row.potential_duplicate).length };
}
export async function commitTripImport(input: { batch_id: string; rows: ImportRow[]; target: ImportTarget; group: string; verified_matches?: boolean; verified_cbm?: boolean; verified_unmapped?: boolean; location_resolutions?: Record<string,Record<string,unknown>> }, creator: string) {
  if (!input || !isValidUuid(input.batch_id) || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > 100) throw new ApiError("Send 1–100 source rows per chunk, with a valid import batch ID.", 400, "INVALID_IMPORT");
  if (!input.group?.trim() || !["new", "dispatch", "trip"].includes(input.target?.mode) || typeof input.target.allow_create !== "boolean") throw new ApiError("Confirm the trip grouping and customer creation policy.", 400, "IMPORT_GROUP_REQUIRED");
  if (input.target.mode === "trip" && !isValidUuid(input.target.value)) throw new ApiError("Select a valid existing trip.", 400, "INVALID_IMPORT_TRIP");
  if (input.target.mode === "dispatch" && !input.target.value?.trim()) throw new ApiError("Select an existing dispatch.", 400, "INVALID_IMPORT_DISPATCH");
  if (input.target.trip_details !== undefined) {
    validateImportTripDetails(input.target.trip_details);
    if (input.target.mode === "trip") throw new ApiError("Existing trip details are read-only during CSV append. Edit the saved trip separately.", 400);
    if (input.target.origin_warehouse_id && input.target.trip_details.origin_warehouse_id && input.target.origin_warehouse_id !== input.target.trip_details.origin_warehouse_id) throw new ApiError("The group origin and trip-details origin must identify the same warehouse.", 400);
    await assertActiveDropdownOption("trip_status", input.target.trip_details.status);
  }
  if(input.target.origin_warehouse_id&&!isValidUuid(input.target.origin_warehouse_id))throw new ApiError("Select a valid trip origin warehouse.",400);
  if(input.target.warehouse_ids && (typeof input.target.warehouse_ids!=="object" || Object.values(input.target.warehouse_ids).some(id=>!isValidUuid(id))))throw new ApiError("Select valid warehouse identities.",400);
  for (const row of input.rows) {
    if (row.group !== input.group.trim()) throw new ApiError("Every source row must belong to the selected trip group.", 400, "IMPORT_GROUP_REQUIRED");
    if (Object.keys(row.unmapped ?? {}).length && !input.verified_unmapped) throw new ApiError("Review unmapped source columns before importing. Their values will be retained in provenance.", 400, "IMPORT_MAPPING_REVIEW_REQUIRED");
    if (row.warnings?.some(warning=>warning.includes("Total CBM differs")) && !input.verified_cbm) throw new ApiError("Review the CBM discrepancies and confirm the supplied totals.", 400, "IMPORT_CBM_REVIEW_REQUIRED");
    const expected = Buffer.from(signature(row), "hex"), supplied = Buffer.from(row.signature ?? "", "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied) || row.errors.length || rowFingerprint(row.values) !== row.fingerprint) throw new ApiError("The preview changed or contains invalid rows. Prepare the preview again.", 400, "IMPORT_PREVIEW_EXPIRED");
  }
  const locations = input.location_resolutions ?? {};
  if (!locations || typeof locations !== "object" || Array.isArray(locations) || Object.keys(locations).some(identity=>!input.rows.some(row=>row.source_identity===identity))) throw new ApiError("Invalid destination review scope.",400);
  for (const location of Object.values(locations)) {
    if (!location || typeof location !== "object" || Array.isArray(location)) throw new ApiError("Invalid destination review.",400);
    if (location.update_store_location != null && typeof location.update_store_location !== "boolean") throw new ApiError("Choose whether to update the saved store location.", 400);
    if (location.pin_address_mismatch != null && typeof location.pin_address_mismatch !== "boolean") throw new ApiError("Confirm the address and pin match explicitly.", 400);
    if (location.pin_address_mismatch === true && location.verified === true) throw new ApiError("Review the address against the moved map pin before verifying.", 400, "LOCATION_PIN_ADDRESS_MISMATCH");
    for (const field of ["province", "city", "address"]) if (location[field] != null && (typeof location[field] !== "string" || String(location[field]).length > (field === "address" ? 2000 : 200))) throw new ApiError("Use text for the reviewed address, province and city within the supported field length.", 400);
    for(const key of ["customer_id","store_id","product_id"])if(location[key]&&(typeof location[key]!=="string"||!isValidUuid(location[key] as string)))throw new ApiError("Invalid destination or product identity.",400);
    for (const key of ["restore_missing_source", "product_match_confirmed"]) if (location[key] != null && typeof location[key] !== "boolean") throw new ApiError("Confirm source recovery and product matching explicitly.", 400);
    if(location.verified===true){for(const key of ["latitude","longitude"]){const value=location[key];if(value===null||value===undefined||String(value).trim()===""||!Number.isFinite(Number(value))||Math.abs(Number(value))>(key==="latitude"?90:180))throw new ApiError("Review a valid destination coordinate pair.",400);}}
  }
  let hasTripAddresses;
  try { hasTripAddresses = Object.values(locations).map(location => location.update_store_location !== undefined ? deliveryAddress(location) : null).some(Boolean); } catch (cause) { throw new ApiError(cause instanceof Error ? cause.message : "Review the delivery address.", 400); }
  if (hasTripAddresses) await requireTripDeliveryAddresses();
  const hasMasterValues = input.rows.some(row => Object.keys(row.master_values ?? {}).length > 0);
  if (hasMasterValues && !await masterListAvailable()) throw new ApiError("Master List import requires the proposed Master List database update. No rows were imported.", 503, "MASTER_LIST_SETUP_REQUIRED");
  await checkImportWarehouseTargets(input.rows, input.target);
  const history = await readImportSourceHistory(input.rows.map(row => row.source_identity));
  for (const row of input.rows) if (history[row.source_identity]?.status === "missing" && (locations[row.source_identity]?.restore_missing_source !== true || locations[row.source_identity]?.restore_history_version !== history[row.source_identity].imported_at)) {
    throw new ApiError(`${row.filename}, CSV row ${row.line}, ${row.values.customer_model}: history says imported but its product record is missing. Explicitly review recovery of this source row; it is not a live duplicate. Expected Qty ${row.values.quantity}, CBM ${row.values.cbm}.`, 409, "IMPORT_SOURCE_RECOVERY_REQUIRED");
  }
  const preparedLocations = await prepareImportDestinationDecisions(input.rows, locations);
  const advancedRecovery = input.rows.some(row => locations[row.source_identity]?.product_id || history[row.source_identity]?.status === "missing");
  if (advancedRecovery && hasMasterValues) throw new ApiError("This recovery path supports source trip-request fields. Operational Master List recovery needs a separately reviewed database update.", 409);
  const hasTripDetails = input.target.trip_details !== undefined;
  const rpc = hasTripDetails ? hasMasterValues ? "import_trip_master_rows_with_details_v1" : "import_trip_source_rows_with_details_v1" : advancedRecovery ? "import_trip_source_rows_v3" : hasMasterValues ? "import_trip_master_rows_v1" : "import_trip_source_rows_v2";
  const { data, error } = await supabaseAdmin.rpc(rpc, {
    p_batch: input.batch_id, p_creator: creator, p_group: input.group.trim(), p_target: input.target,
    p_rows: input.rows, p_verified: input.verified_matches === true, p_locations: Object.fromEntries(Object.entries(preparedLocations).map(([key, decision]) => [key, importLocationForRpc(decision)])),
  });
  if (error && hasTripDetails && ["PGRST202", "42883"].includes(error.code)) throw new ApiError("Saving imported trip details requires approval and application of 2026_10_23_proposed_import_trip_details.sql. No rows in this chunk were saved; your draft and earlier saved rows are preserved.", 503, "IMPORT_TRIP_DETAILS_SETUP_REQUIRED");
  if (error && advancedRecovery && error.code === "PGRST202") throw new ApiError("Source recovery and explicit product matches need approval and application of 2026_10_22_proposed_csv_import_recovery.sql. No rows in this chunk were saved; the existing batch is preserved.", 503, "IMPORT_RECOVERY_SETUP_REQUIRED");
  if (error) workflowFailure(error);
  try {
    await persistImportDestinationLocations(creator, input.batch_id, input.rows, data?.rows ?? [], preparedLocations);
  } catch (failure) {
    console.error("Trip location follow-up incomplete", { code: (failure as { code?: string })?.code });
    throw new ApiError("Trip rows were saved, but location details or admin notifications are incomplete. Retry this same batch; completed products will not be duplicated.", 503, "TRIP_LOCATION_FOLLOWUP_REQUIRED");
  }
  if(data?.rows?.every((row:{status:string})=>row.status!=="failed")){
    const updated=await supabaseAdmin.from("trip_import_batches").update({last_error:null,updated_at:new Date().toISOString()}).eq("id",input.batch_id).eq("created_by",creator);
    if(updated.error)console.error("Unable to update import recovery timestamp",{code:updated.error.code});
  }
  const described = (data?.rows ?? []).map((outcome: { source_identity: string; status: string; error?: string }) => {
    const row = input.rows.find(source => source.source_identity === outcome.source_identity);
    return outcome.status === "failed" && row ? { ...outcome, error: `${row.filename}, CSV row ${row.line}, ${row.values.customer_model}, ${row.values.ph_truck_reference ?? "no PH reference"}: expected Qty ${row.values.quantity}, Total CBM ${row.values.cbm}. ${outcome.error ?? "Source import failed."}` } : outcome;
  });
  return { ...data, rows: described, history: await readImportSourceHistory(input.rows.map(row => row.source_identity)) };
}
