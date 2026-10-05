import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { imageMime } from "../models/clientwebsite.validation.js";

const bucket = "truck-images";
const maxBytes = 5 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export class TruckImageError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); this.name = "TruckImageError"; }
}

function validateTruckId(truckId: string) {
  if (!uuidPattern.test(truckId)) throw new TruckImageError("Invalid truck record.");
}

async function assertTruckExists(truckId: string) {
  validateTruckId(truckId);
  const { data, error } = await supabaseAdmin.from("trucks").select("id").eq("id", truckId).maybeSingle();
  if (error) throw new TruckImageError("Unable to verify the truck record.", 502);
  if (!data) throw new TruckImageError("Truck not found.", 404);
}

async function withSignedUrl(row: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(String(row.storage_path), 60 * 60);
  if (error || !data?.signedUrl) throw new TruckImageError("Unable to create a secure image link.", 502);
  return { ...row, signed_url: data.signedUrl };
}

export async function listTruckImages(truckId: string) {
  await assertTruckExists(truckId);
  const { data, error } = await supabaseAdmin.from("truck_images").select("id, truck_id, storage_path, file_name, display_order, created_at, updated_at").eq("truck_id", truckId).order("display_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw new TruckImageError("Unable to load truck images.", 502);
  return Promise.all((data ?? []).map((row) => withSignedUrl(row as Record<string, unknown>)));
}

export async function uploadTruckImage(truckId: string, bytes: Buffer, contentType: string, originalName: string) {
  await assertTruckExists(truckId);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) throw new TruckImageError("Choose an image up to 5 MB.");
  const detectedType = imageMime(bytes);
  if (!detectedType || detectedType !== contentType || !extensions[detectedType]) throw new TruckImageError("Choose a valid JPEG, PNG, or WebP image.");
  const fileName = originalName.trim().replace(/[\0\r\n]/g, "").slice(0, 255) || `truck-image.${extensions[detectedType]}`;
  const storagePath = `trucks/${truckId}/${randomUUID()}.${extensions[detectedType]}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(storagePath, bytes, { contentType: detectedType, upsert: false });
  if (uploadError) throw new TruckImageError("Truck image upload failed. Check the existing private truck-images bucket.", 502);

  const { data: last, error: orderError } = await supabaseAdmin.from("truck_images").select("display_order").eq("truck_id", truckId).order("display_order", { ascending: false }).limit(1).maybeSingle();
  if (orderError) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
    if (cleanupError) console.error("Truck image cleanup failed after order lookup error:", cleanupError);
    throw new TruckImageError("Unable to determine the image order.", 502);
  }
  const displayOrder = Number(last?.display_order ?? -1) + 1;
  const { data: inserted, error: insertError } = await supabaseAdmin.from("truck_images").insert({ truck_id: truckId, storage_path: storagePath, file_name: fileName, display_order: displayOrder }).select("id, truck_id, storage_path, file_name, display_order, created_at, updated_at").single();
  if (insertError || !inserted) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
    if (cleanupError) console.error("Truck image cleanup failed after database insert error:", cleanupError);
    throw new TruckImageError("Unable to save truck image details.", 502);
  }
  try {
    return await withSignedUrl(inserted as Record<string, unknown>);
  } catch (error) {
    const { error: rowCleanupError } = await supabaseAdmin.from("truck_images").delete().eq("id", inserted.id).eq("truck_id", truckId);
    const { error: fileCleanupError } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
    if (rowCleanupError || fileCleanupError) console.error("Truck image cleanup failed after signed URL creation error:", { rowCleanupError, fileCleanupError });
    throw error;
  }
}

export async function deleteTruckImage(truckId: string, imageId: string) {
  await assertTruckExists(truckId);
  if (!uuidPattern.test(imageId)) throw new TruckImageError("Invalid truck image record.");
  const { data: deleted, error: deleteError } = await supabaseAdmin.from("truck_images").delete().eq("id", imageId).eq("truck_id", truckId).select("id, truck_id, storage_path, file_name, display_order, created_at, updated_at").maybeSingle();
  if (deleteError) throw new TruckImageError("Unable to remove truck image details.", 502);
  if (!deleted) throw new TruckImageError("Truck image not found.", 404);

  const { error: storageError } = await supabaseAdmin.storage.from(bucket).remove([deleted.storage_path]);
  if (storageError) {
    const { error: restoreError } = await supabaseAdmin.from("truck_images").insert(deleted);
    if (restoreError) console.error("Truck image metadata restore failed after storage deletion error:", restoreError);
    throw new TruckImageError(restoreError ? "Storage deletion failed and image metadata could not be restored; contact support." : "Storage deletion failed. The image was kept in the gallery.", 502);
  }
  return { id: deleted.id };
}
