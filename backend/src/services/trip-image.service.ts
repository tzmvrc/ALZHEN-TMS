import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { imageMime } from "../models/clientwebsite.validation.js";

const bucket = "trip-images";
const maxBytes = 5 * 1024 * 1024;
const maxImagesPerTrip = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const allowedMimeTypes = Object.keys(extensions);

export type TripImageRecord = {
  id: string;
  trip_id: string;
  storage_path: string;
  file_name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  signed_url: string;
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
  };
}

async function ensureTripImageBucket() {
  const { data: existing, error: lookupError } =
    await supabaseAdmin.storage.getBucket(bucket);
  if (existing) {
    if (existing.public) {
      const { error: updateError } = await supabaseAdmin.storage.updateBucket(bucket, {
        public: false,
        fileSizeLimit: maxBytes,
        allowedMimeTypes,
      });
      if (updateError) {
        throw new TripImageError(
          `The ${bucket} bucket must be private: ${updateError.message}`,
          502,
        );
      }
    }
    return;
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: maxBytes,
    allowedMimeTypes,
  });
  if (!createError) return;

  const { data: createdByAnotherRequest } =
    await supabaseAdmin.storage.getBucket(bucket);
  if (createdByAnotherRequest) return;

  const lookupMessage = lookupError?.message ? ` Bucket lookup: ${lookupError.message}` : "";
  throw new TripImageError(
    `Could not create the private ${bucket} bucket: ${createError.message}.${lookupMessage}`,
    502,
  );
}

export async function listTripImages(tripId: string) {
  await assertTripExists(tripId);
  await ensureTripImageBucket();
  const { data, error } = await supabaseAdmin
    .from("trip_images")
    .select("id, trip_id, storage_path, file_name, display_order, created_at, updated_at")
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
  await assertTripExists(tripId);
  await ensureTripImageBucket();
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw new TripImageError("Choose an image up to 5 MB.");
  }
  const detectedType = imageMime(bytes);
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
  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: detectedType, upsert: false });
  if (uploadError) {
    console.error("Trip photo storage upload failed:", {
      statusCode: uploadError.statusCode,
      error: uploadError.message,
    });
    throw new TripImageError(`Trip photo upload failed: ${uploadError.message}`, 502);
  }

  const { data: last, error: orderError } = await supabaseAdmin
    .from("trip_images")
    .select("display_order")
    .eq("trip_id", tripId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
    if (cleanupError) console.error("Trip photo cleanup failed after order lookup error:", cleanupError);
    throw databaseFailure("determine photo order", orderError);
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("trip_images")
    .insert({
      trip_id: tripId,
      storage_path: storagePath,
      file_name: fileName,
      kind: receipt ? "receipt" : "photo",
      ...(receipt ? { trip_stop_id: receipt.stopId, uploaded_by: receipt.profileId, dr_number: receipt.drNumber } : {}),
      display_order: Number(last?.display_order ?? -1) + 1,
    })
    .select("id, trip_id, storage_path, file_name, display_order, created_at, updated_at")
    .single();
  if (insertError || !inserted) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
    if (cleanupError) console.error("Trip photo cleanup failed after database insert error:", cleanupError);
    if (insertError) throw databaseFailure("save trip photo details", insertError);
    throw new TripImageError("Unable to save trip photo details.", 502);
  }

  try {
    return await withSignedUrl(inserted as Record<string, unknown>);
  } catch (error) {
    const { error: rowCleanupError } = await supabaseAdmin
      .from("trip_images")
      .delete()
      .eq("id", inserted.id)
      .eq("trip_id", tripId);
    const { error: fileCleanupError } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
    if (rowCleanupError || fileCleanupError) {
      console.error("Trip photo cleanup failed after signed URL creation error:", {
        rowCleanupError,
        fileCleanupError,
      });
    }
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
