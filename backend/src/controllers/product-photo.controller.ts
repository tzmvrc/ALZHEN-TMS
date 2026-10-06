import type { Request, Response } from "express";
import {
  deleteProductPhoto,
  getProductPhoto,
  ProductPhotoError,
  uploadProductPhoto,
} from "../services/product-photo.service.js";

function failure(res: Response, error: unknown) {
  if (error instanceof ProductPhotoError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error("Product photo request failed:", error);
  return res.status(502).json({ success: false, message: "Unable to complete product photo request." });
}

export async function getPhoto(req: Request, res: Response) {
  try {
    return res.json({
      success: true,
      data: await getProductPhoto(String(req.params.productId)),
    });
  } catch (error) {
    return failure(res, error);
  }
}

export async function uploadPhoto(req: Request, res: Response) {
  try {
    if (!Buffer.isBuffer(req.body)) {
      throw new ProductPhotoError("Choose a JPEG, PNG, or WebP image up to 5 MB.");
    }
    let fileName = String(req.headers["x-file-name"] ?? "");
    try {
      fileName = decodeURIComponent(fileName);
    } catch {
      throw new ProductPhotoError("Invalid image filename.");
    }
    return res.status(201).json({
      success: true,
      data: await uploadProductPhoto(
        String(req.params.productId),
        req.body,
        String(req.headers["content-type"] ?? ""),
        fileName,
      ),
    });
  } catch (error) {
    return failure(res, error);
  }
}

export async function removePhoto(req: Request, res: Response) {
  try {
    return res.json({
      success: true,
      data: await deleteProductPhoto(String(req.params.productId)),
    });
  } catch (error) {
    return failure(res, error);
  }
}
