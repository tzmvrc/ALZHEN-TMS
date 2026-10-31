import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { imageMime } from "../models/clientwebsite.validation.js";
import {preparePodIntake} from "./pod-intake.service.js";
import {renderPodPdf} from "./pdf-renderer.service.js";
import {validatePodDocument} from "./pod-document.logic.js";

const bucket = "trip-images";
const maxBytes = 5 * 1024 * 1024;
const maxImagesPerTrip = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type TripImageRecord = {
  id: string;
  trip_id: string;
  storage_path: string;
  file_name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  signed_url: string;
  mime_type?:string;
  assignment_id?:unknown;trip_stop_id?:unknown;delivery_event_id?:unknown;uploaded_by?:unknown;dr_number?:unknown;
};

export class TripImageError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "TripImageError";
  }
}

function databaseFailure(action: string, error: { code?: string; message?: string }) {
  console.error(`Trip photo database ${action} failed:`, {
    code: error.code,
    message: error.message,
  });

  if (
    error.message?.includes("display_order")
  ) {
    return new TripImageError(
      "Trip photo database schema is missing display_order. Apply backend/migrations/2026_10_06_create_trip_images.sql in Supabase, then retry.",
      502,
    );
  }
  if (error.code === "42703" || error.code === "PGRST204") {
    return new TripImageError("Trip receipt schema is missing. Apply backend/migrations/2026_10_16_trip_receipt_ocr.sql in Supabase, then retry.", 502);
  }
  if (error.code === "42P01" || error.code === "PGRST205") {
    return new TripImageError(
      "Trip photo database table is missing. Apply backend/migrations/2026_10_06_create_trip_images.sql in Supabase, then retry.",
      502,
    );
  }
  return new TripImageError(`Unable to ${action}: ${error.message ?? "database request failed."}`, 502);
}

function validateTripId(tripId: string) {
  if (!uuidPattern.test(tripId)) throw new TripImageError("Invalid trip record.");
}

async function assertTripExists(tripId: string) {
  validateTripId(tripId);
  const { data, error } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();
  if (error) throw databaseFailure("verify the trip record", error);
  if (!data) throw new TripImageError("Trip not found.", 404);
}

async function withSignedUrl(
  row: Record<string, unknown>,
): Promise<TripImageRecord> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(String(row.storage_path), 60 * 60);
  if (error || !data?.signedUrl) {
    throw new TripImageError("Unable to create a secure photo link.", 502);
  }
  return {
    id: String(row.id),
    trip_id: String(row.trip_id),
    storage_path: String(row.storage_path),
    file_name: String(row.file_name),
    display_order: Number(row.display_order ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    signed_url: data.signedUrl,
    mime_type:typeof row.mime_type==="string"?row.mime_type:undefined,
    assignment_id:row.assignment_id??null,trip_stop_id:row.trip_stop_id??null,
    delivery_event_id:row.delivery_event_id??null,uploaded_by:row.uploaded_by??null,dr_number:row.dr_number??null,
  };
}

async function ensureTripImageBucket() {
  // Configuration is an approved administrative operation, never a side effect
  // of reading/uploading/deleting a receipt or photo.
  const { data: existing, error } = await supabaseAdmin.storage.getBucket(bucket);
  if (error || !existing) throw new TripImageError("The private trip-images bucket is unavailable. Ask an administrator to review Storage configuration.", 503);
  if (existing.public) throw new TripImageError("The trip-images bucket must be private. Administrator approval is required to correct Storage configuration.", 503);
  return existing;
}

export async function listTripImages(tripId: string) {
  await assertTripExists(tripId);
  await ensureTripImageBucket();
  const { data, error } = await supabaseAdmin
    .from("trip_images")
    .select("id, trip_id, storage_path, file_name, display_order, created_at, updated_at, assignment_id, trip_stop_id, delivery_event_id, uploaded_by, dr_number, mime_type")
    .eq("trip_id", tripId)
    .eq("kind", "photo")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw databaseFailure("load trip photos", error);
  return Promise.all((data ?? []).map((row) => withSignedUrl(row as Record<string, unknown>)));
}

export async function uploadTripImage(
  tripId: string,
  bytes: Buffer,
  contentType: string,
  originalName: string,
  receipt?: { stopId: string; profileId: string; drNumber: string },
) {
  if(receipt){
    try{validatePodDocument(bytes,contentType,originalName,process.env.POD_PDF_ENABLED==="true");}
    catch(error){throw new TripImageError(error instanceof Error?error.message:"Invalid POD document.",contentType==="application/pdf"?409:400);}
  }
  await assertTripExists(tripId);
  const configuration=await ensureTripImageBucket();
  const pdf=Boolean(receipt)&&contentType==="application/pdf";
  const prepared=pdf?await preparePodIntake(bytes,contentType,originalName,{pdfEnabled:process.env.POD_PDF_ENABLED==="true",bucketPrivate:!configuration.public,allowedMimeTypes:configuration.allowed_mime_types??[],maxBytes:configuration.file_size_limit??maxBytes},renderPodPdf):null;
  if(prepared&&receipt){
    const prior=await supabaseAdmin.from("trip_images").select("*").eq("trip_id",tripId).eq("trip_stop_id",receipt.stopId).eq("kind","receipt").eq("file_sha256",prepared.metadata.file_sha256).maybeSingle();
    if(prior.error)throw databaseFailure("check receipt content",prior.error);
    // Never return an old original as a newly uploaded object: the caller may
    // compensate a later failed audit by deleting its newly owned upload.
    if(prior.data)throw new TripImageError("This PDF is already saved for this transaction. Open the existing receipt instead of uploading it again.",409);
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw new TripImageError("Choose an image up to 5 MB.");
  }
  const detectedType = pdf?"application/pdf":imageMime(bytes);
  if (!detectedType || detectedType !== contentType || !extensions[detectedType]) {
    throw new TripImageError("Choose a valid JPEG, PNG, or WebP image.");
  }

  const { count, error: countError } = await supabaseAdmin
    .from("trip_images")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("kind", receipt ? "receipt" : "photo");
  if (countError) throw databaseFailure("check the trip photo limit", countError);
  if ((count ?? 0) >= maxImagesPerTrip) {
    throw new TripImageError(`A trip can have up to ${maxImagesPerTrip} photos.`, 409);
  }

  const fileName =
    originalName.trim().replace(/[\0\r\n]/g, "").slice(0, 255) ||
    `trip-photo.${extensions[detectedType]}`;
  const storagePath = `trips/${tripId}/${randomUUID()}.${extensions[detectedType]}`;
  const { data: last, error: orderError } = await supabaseAdmin
    .from("trip_images")
    .select("display_order")
    .eq("trip_id", tripId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) {
    throw databaseFailure("determine photo order", orderError);
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("trip_images")
    .insert({
      trip_id: tripId,
      storage_path: storagePath,
      file_name: fileName,
      kind: receipt ? "receipt" : "photo",
      ...(prepared?{mime_type:prepared.metadata.mime_type,file_sha256:prepared.metadata.file_sha256}:{}),
      ...(receipt ? { trip_stop_id: receipt.stopId, uploaded_by: receipt.profileId, dr_number: receipt.drNumber } : {}),
      display_order: Number(last?.display_order ?? -1) + 1,
    })
    .select("id, trip_id, storage_path, file_name, display_order, created_at, updated_at")
    .single();
  if (insertError || !inserted) {
    if (insertError) throw databaseFailure("save trip photo details", insertError);
    throw new TripImageError("Unable to save trip photo details.", 502);
  }

  // Reserve the physical receipt before external Storage I/O. A missing object
  // now has a durable owner row and blocks trip deletion while upload is pending.
  // Never discard that evidence until exact-object compensation is confirmed.
  const compensate = async () => {
    try {
      const removed = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
      if (removed.error) return false;
      const deleted = await supabaseAdmin.from("trip_images").delete().eq("id", inserted.id).eq("trip_id", tripId);
      return !deleted.error;
    } catch { return false; }
  };
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(storagePath, bytes, { contentType: detectedType, upsert: false });
  if (uploadError) {
    const cleaned = await compensate();
    throw new TripImageError(cleaned ? "Trip photo upload failed. Please retry." : "Trip photo upload could not be confirmed. Its reserved receipt is retained for recovery; do not delete the trip until reviewed.", 502);
  }
  try {
    return await withSignedUrl(inserted as Record<string, unknown>);
  } catch (error) {
    if (!await compensate()) throw new TripImageError("Private document access failed. Its reserved receipt is retained for recovery; do not delete the trip until reviewed.", 502);
    throw error;
  }
}

export async function deleteTripImage(tripId: string, imageId: string) {
  await assertTripExists(tripId);
  await ensureTripImageBucket();
  if (!uuidPattern.test(imageId)) throw new TripImageError("Invalid trip photo record.");

  const { data: deleted, error: deleteError } = await supabaseAdmin
    .from("trip_images")
    .delete()
    .eq("id", imageId)
    .eq("trip_id", tripId)
    .select("*")
    .maybeSingle();
  if (deleteError) throw databaseFailure("remove trip photo details", deleteError);
  if (!deleted) throw new TripImageError("Trip photo not found.", 404);

  const { error: storageError } = await supabaseAdmin.storage
    .from(bucket)
    .remove([deleted.storage_path]);
  if (storageError) {
    const { error: restoreError } = await supabaseAdmin.from("trip_images").insert(deleted);
    if (restoreError) console.error("Trip photo metadata restore failed after storage deletion error:", restoreError);
    throw new TripImageError(
      restoreError
        ? "Storage deletion failed and photo metadata could not be restored; contact support."
        : "Storage deletion failed. The photo was kept in the gallery.",
      502,
    );
  }
  return { id: deleted.id };
}

/** First photo per dashboard trip, signed together in the existing private bucket. */
export async function listOverviewTripImages(ids:string[]):Promise<TripImageRecord[]>{
 if(!ids.length)return [];ids.forEach(validateTripId);if(ids.length>100)throw new TripImageError("Select at most 100 trips.");
 const first=new Map<string,Record<string,unknown>>();
 for(let offset=0;;offset+=1000){const result=await supabaseAdmin.from("trip_images").select("id,trip_id,storage_path,file_name,display_order,created_at,updated_at").in("trip_id",ids).eq("kind","photo").order("display_order").order("created_at").order("id").range(offset,offset+999);if(result.error)throw databaseFailure("load dashboard photos",result.error);for(const row of result.data)if(!first.has(row.trip_id))first.set(row.trip_id,row);if(result.data.length<1000)break;}
 const rows=[...first.values()];if(!rows.length)return [];await ensureTripImageBucket();
 const result=await supabaseAdmin.storage.from(bucket).createSignedUrls(rows.map(row=>String(row.storage_path)),3600);if(result.error)throw new TripImageError("Unable to create secure dashboard photo links.",502);
 return rows.map((row,index)=>{const signed=result.data?.[index];if(!signed?.signedUrl||signed.error)throw new TripImageError("Unable to create a secure dashboard photo link.",502);return {...row,signed_url:signed.signedUrl} as TripImageRecord;});
}
