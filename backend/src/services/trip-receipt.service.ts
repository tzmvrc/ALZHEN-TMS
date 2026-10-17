import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { interpretPodText, matchPodTransaction } from "./pod-interpretation.service.js";

function uuid(value: string) {
  if (!isValidUuid(value)) throw new ApiError("Invalid receipt or trip identifier.", 400, "INVALID_RECEIPT_ID");
}

function fail(error: { code?: string; message?: string }) {
  if (["42703", "PGRST204"].includes(error.code ?? "")) {
    throw new ApiError("Apply backend/migrations/2026_10_16_trip_receipt_ocr.sql in Supabase, then retry.", 502, "RECEIPT_SCHEMA_MISSING");
  }
  console.error("Receipt database request failed:", { code: error.code, message: error.message });
  throw new ApiError("Unable to load or save delivery receipt details.", 502, "RECEIPT_QUERY_FAILED");
}

export function validateReceiptText(input: Record<string, unknown>) {
  if (typeof input.ocr_text !== "string" || !input.ocr_text.trim() || input.ocr_text.length > 100_000) {
    throw new ApiError("Enter receipt text up to 100,000 characters.", 400, "INVALID_RECEIPT_TEXT");
  }
  const confidence = input.ocr_confidence ?? null;
  if (confidence !== null && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)) {
    throw new ApiError("OCR confidence must be between 0 and 100.", 400, "INVALID_OCR_CONFIDENCE");
  }
  return { ocr_text: input.ocr_text.trim(), ocr_confidence: confidence };
}

async function signedReceipt(row: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.storage.from("trip-images").createSignedUrl(String(row.storage_path), 3600);
  if (error || !data?.signedUrl) throw new ApiError("Unable to create a secure receipt link.", 502, "RECEIPT_LINK_FAILED");
  return {
    id: row.id, trip_id: row.trip_id, trip_stop_id: row.trip_stop_id,
    dr_number: row.dr_number, file_name: row.file_name, signed_url: data.signedUrl,
    mime_type: row.mime_type??(String(row.storage_path).endsWith(".pdf")?"application/pdf":null),
    uploaded_at: row.created_at, ocr_text: row.ocr_text, ocr_confidence: row.ocr_confidence,
    ocr_version: row.ocr_version, reviewed_at: row.reviewed_at, reviewed_by: row.reviewed_by,
    pod_review_status: row.pod_review_status ?? null, pod_review_version: row.pod_review_version ?? null,
    pod_reviewed_at: row.pod_reviewed_at ?? null, pod_rejection_reason: row.pod_rejection_reason ?? null,
  };
}

export async function listTripReceipts(tripId: string) {
  uuid(tripId);
  const { data, error } = await supabaseAdmin.from("trip_images").select("*")
    .eq("trip_id", tripId).eq("kind", "receipt").order("created_at", { ascending: false });
  if (error) fail(error);
  return Promise.all((data ?? []).map(signedReceipt));
}

async function getReceipt(tripId: string, receiptId: string) {
  uuid(tripId); uuid(receiptId);
  const { data, error } = await supabaseAdmin.from("trip_images").select("*")
    .eq("trip_id", tripId).eq("id", receiptId).eq("kind", "receipt").maybeSingle();
  if (error) fail(error);
  if (!data) throw new ApiError("Delivery receipt not found for this trip.", 404, "RECEIPT_NOT_FOUND");
  return data;
}
export async function getSignedTripReceipt(tripId:string,receiptId:string){return signedReceipt(await getReceipt(tripId,receiptId));}

/** Suggestions only: no review, POD, transaction or notification writes. */
export async function interpretTripReceipt(tripId: string, receiptId: string, actor: {profileId:string;role:string}, input: Record<string, unknown>) {
  if (!["ADMIN", "STAFF"].includes(actor.role)) throw new ApiError("Only Admin and Staff can request interpretation.", 403, "POD_AI_ACCESS_DENIED");
  if (input.external_processing_consent !== true) throw new ApiError("Authorize sending this receipt's OCR text to Gemini first.", 400, "POD_AI_CONSENT_REQUIRED");
  if (!Number.isInteger(input.expected_version) || Number(input.expected_version) < 0) throw new ApiError("Reload the receipt before interpretation.", 400, "INVALID_RECEIPT_REVIEW");
  const receipt = await getReceipt(tripId, receiptId);
  if (receipt.ocr_version !== input.expected_version) throw new ApiError("This receipt changed. Reload it before interpretation.", 409, "RECEIPT_CONFLICT");
  const [trip, stops] = await Promise.all([
    supabaseAdmin.from("trips").select("id, dispatch_number").eq("id", tripId).maybeSingle(),
    supabaseAdmin.from("trip_stops").select("id, trip_id, dispatch_number, dr_number, customer_id, store_id").eq("trip_id", tripId).is("archived_at", null).order("id").limit(101),
  ]);
  if (trip.error || stops.error) throw new ApiError("Unable to load transaction matching context.", 502, "POD_MATCH_FAILED");
  if (!trip.data || !receipt.trip_stop_id || !stops.data?.some(stop => stop.id === receipt.trip_stop_id)) throw new ApiError("This receipt has no eligible active transaction. Review its association manually.", 409, "POD_MATCH_REQUIRED");
  if (stops.data.length > 100) throw new ApiError("Too many transactions for automatic matching. Review this receipt manually.", 409, "POD_MATCH_REQUIRED");
  const customerIds = [...new Set(stops.data.flatMap(stop => stop.customer_id ? [stop.customer_id] : []))];
  const storeIds = [...new Set(stops.data.flatMap(stop => stop.store_id ? [stop.store_id] : []))];
  const [customers, stores] = await Promise.all([
    customerIds.length ? supabaseAdmin.from("customers").select("id, name").in("id", customerIds) : Promise.resolve({data:[],error:null}),
    storeIds.length ? supabaseAdmin.from("customer_stores").select("id, name").in("id", storeIds) : Promise.resolve({data:[],error:null}),
  ]);
  if (customers.error || stores.error) throw new ApiError("Unable to load transaction matching labels.", 502, "POD_MATCH_FAILED");
  // Reviewed headers are not original OCR evidence. Never send trip/profile/Storage data.
  const stored = String(receipt.ocr_text ?? ""), marker = "--- Scanned text ---", at = stored.indexOf(marker);
  const originalText = at < 0 ? stored : stored.slice(at + marker.length).trim();
  const interpretation = await interpretPodText(actor.profileId, receiptId, receipt.ocr_version, originalText);
  const current = await getReceipt(tripId, receiptId);
  if (current.ocr_version !== receipt.ocr_version || current.trip_stop_id !== receipt.trip_stop_id) throw new ApiError("This receipt changed during interpretation. Reload before reviewing suggestions.", 409, "RECEIPT_CONFLICT");
  const tripDispatch = trip.data.dispatch_number;
  const matching = matchPodTransaction(interpretation, stops.data.map(stop => ({
    trip_id:tripId,trip_stop_id:stop.id,dispatch_number:stop.dispatch_number ?? tripDispatch,
    dr_number:stop.dr_number,customer_name:customers.data?.find(row=>row.id===stop.customer_id)?.name ?? null,
    store_name:stores.data?.find(row=>row.id===stop.store_id)?.name ?? null,
  })));
  return {receipt_id:receiptId,ocr_version:receipt.ocr_version,model:"gemini-2.5-flash",interpretation,matching,
    linked_stop_mismatch:matching.suggested !== null && matching.suggested.trip_stop_id !== receipt.trip_stop_id,
    persisted:false,approved:false};
}

export async function saveAdminReceiptText(tripId: string, receiptId: string, profileId: string, input: Record<string, unknown>) {
  const text = validateReceiptText(input);
  if (typeof input.reviewed !== "boolean" || !Number.isInteger(input.expected_version) || Number(input.expected_version) < 0) {
    throw new ApiError("Receipt review state and expected version are required.", 400, "INVALID_RECEIPT_REVIEW");
  }
  const current = await getReceipt(tripId, receiptId);
  if (current.ocr_version !== input.expected_version) throw new ApiError("This receipt changed. Reload it before saving your edits.", 409, "RECEIPT_CONFLICT");
  // An automatic scan must never replace a reviewed transcription.
  if (!input.reviewed && current.reviewed_at) return signedReceipt(current);
  const timestamp = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("trip_images").update({
    ...text, ocr_version: Number(input.expected_version) + 1,
    reviewed_at: input.reviewed ? timestamp : null,
    reviewed_by: input.reviewed ? profileId : null, updated_at: timestamp,
  }).eq("trip_id", tripId).eq("id", receiptId).eq("kind", "receipt")
    .eq("ocr_version", input.expected_version).select("*").maybeSingle();
  if (error) fail(error);
  if (!data) throw new ApiError("This receipt changed. Reload it before saving your edits.", 409, "RECEIPT_CONFLICT");
  return signedReceipt(data);
}

// The caller checks the driver's current assignment and active stop first.
export async function storeDriverReceiptText(tripId: string, stopId: string, profileId: string, input: Record<string, unknown>) {
  uuid(stopId);
  const text = validateReceiptText(input);
  const receiptId = typeof input.receipt_id === "string" ? input.receipt_id : "";
  const current = await getReceipt(tripId, receiptId);
  if (current.trip_stop_id !== stopId || current.uploaded_by !== profileId) {
    throw new ApiError("This receipt does not belong to your selected delivery stop.", 403, "RECEIPT_ACCESS_DENIED");
  }
  // Late phone OCR is best effort. Keep any text already saved by dispatch.
  if (current.reviewed_at || current.ocr_text) return { receipt_id: receiptId, trip_stop_id: stopId, saved: false };
  const { data, error } = await supabaseAdmin.from("trip_images").update({
    ...text, ocr_version: Number(current.ocr_version) + 1, updated_at: new Date().toISOString(),
  }).eq("id", receiptId).eq("trip_id", tripId).eq("trip_stop_id", stopId).eq("uploaded_by", profileId)
    .eq("kind", "receipt").eq("ocr_version", current.ocr_version).is("reviewed_at", null).is("ocr_text", null)
    .select("id").maybeSingle();
  if (error) fail(error);
  return { receipt_id: receiptId, trip_stop_id: stopId, saved: Boolean(data) };
}
