import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { imageMime } from "../models/clientwebsite.validation.js";

export const PRODUCT_PHOTO_BUCKET = "product-photos";
const bucket = PRODUCT_PHOTO_BUCKET;
/** Shared exact-path Storage removal for photo management and durable cleanup. */
export const removeProductPhotoObjects = (paths: string[]) => supabaseAdmin.storage.from(bucket).remove(paths);
const maxBytes = 5 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class ProductPhotoError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "ProductPhotoError";
  }
}

async function assertProductExists(productId: string) {
  if (!uuidPattern.test(productId)) throw new ProductPhotoError("Invalid product record.");
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, photo_path")
    .eq("id", productId)
    .maybeSingle();
  if (error) {
    console.error("Product photo lookup failed:", error);
    throw new ProductPhotoError("Unable to verify the product record.", 502);
  }
  if (!data) throw new ProductPhotoError("Product not found.", 404);
  return data;
}

async function withSignedUrl(storagePath: string | null) {
  if (!storagePath) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) {
    console.error("Product photo signed URL failed:", error);
    throw new ProductPhotoError("Unable to create a secure product photo link.", 502);
  }
  return data.signedUrl;
}

export async function getProductPhoto(productId: string) {
  const product = await assertProductExists(productId);
  return { product_id: product.id, signed_url: await withSignedUrl(product.photo_path) };
}

export async function uploadProductPhoto(
  productId: string,
  bytes: Buffer,
  contentType: string,
  originalName: string,
) {
  const product = await assertProductExists(productId);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw new ProductPhotoError("Choose an image up to 5 MB.");
  }
  const detectedType = imageMime(bytes);
  if (!detectedType || detectedType !== contentType || !extensions[detectedType]) {
    throw new ProductPhotoError("Choose a valid JPEG, PNG, or WebP image.");
  }

  const fileName =
    originalName.trim().replace(/[\0\r\n]/g, "").slice(0, 255) ||
    `product-photo.${extensions[detectedType]}`;
  const storagePath = `products/${productId}/${randomUUID()}.${extensions[detectedType]}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: detectedType, upsert: false });
  if (uploadError) {
    console.error("Product photo upload failed:", uploadError);
    throw new ProductPhotoError(`Product photo upload failed: ${uploadError.message}`, 502);
  }

  let signedUrl: string;
  try {
    const url = await withSignedUrl(storagePath);
    if (!url) throw new ProductPhotoError("Unable to create a secure product photo link.", 502);
    signedUrl = url;
  } catch (error) {
    const { error: cleanupError } = await removeProductPhotoObjects([storagePath]);
    if (cleanupError) console.error("Product photo cleanup failed after signed URL error:", cleanupError);
    throw error;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("products")
    .update({ photo_path: storagePath, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    const { error: cleanupError } = await removeProductPhotoObjects([storagePath]);
    if (cleanupError) console.error("Product photo cleanup failed after database update error:", cleanupError);
    if (updateError) console.error("Product photo database update failed:", updateError);
    throw new ProductPhotoError("Unable to save product photo details.", 502);
  }

  if (product.photo_path) {
    const { error: removeError } = await removeProductPhotoObjects([product.photo_path]);
    if (removeError) {
      console.error("Previous product photo cleanup failed:", removeError);
    }
  }

  return { product_id: productId, file_name: fileName, signed_url: signedUrl };
}

export async function deleteProductPhoto(productId: string) {
  const product = await assertProductExists(productId);
  if (!product.photo_path) return { product_id: productId };

  const { error: updateError } = await supabaseAdmin
    .from("products")
    .update({ photo_path: null, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (updateError) {
    console.error("Product photo database delete failed:", updateError);
    throw new ProductPhotoError("Unable to remove product photo details.", 502);
  }
  const { error: removeError } = await removeProductPhotoObjects([product.photo_path]);
  if (removeError) {
    const { error: restoreError } = await supabaseAdmin
      .from("products")
      .update({ photo_path: product.photo_path })
      .eq("id", productId);
    if (restoreError) console.error("Product photo metadata restore failed:", restoreError);
    throw new ProductPhotoError(
      restoreError
        ? "Photo deletion failed and the product photo could not be restored; contact support."
        : "Photo deletion failed. The existing photo was kept.",
      502,
    );
  }
  return { product_id: productId };
}
