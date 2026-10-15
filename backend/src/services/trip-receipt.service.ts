import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";

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
    uploaded_at: row.created_at, ocr_text: row.ocr_text, ocr_confidence: row.ocr_confidence,
    ocr_version: row.ocr_version, reviewed_at: row.reviewed_at, reviewed_by: row.reviewed_by,
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
