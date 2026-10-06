import type { Request, Response } from "express";
import {
  deleteTripImage,
  listTripImages,
  TripImageError,
  uploadTripImage,
} from "../services/trip-image.service.js";

function tripImageFailure(res: Response, error: unknown) {
  if (error instanceof TripImageError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error("Trip photo request failed:", error);
  return res.status(502).json({ success: false, message: "Unable to complete trip photo request." });
}

export async function listImages(req: Request, res: Response) {
  try {
    return res.json({
      success: true,
      data: await listTripImages(String(req.params.id)),
    });
  } catch (error) {
    return tripImageFailure(res, error);
  }
}

export async function uploadImage(req: Request, res: Response) {
  try {
    if (!Buffer.isBuffer(req.body)) {
      throw new TripImageError("Choose a JPEG, PNG, or WebP image up to 5 MB.");
    }
    let name = String(req.headers["x-file-name"] ?? "");
    try {
      name = decodeURIComponent(name);
    } catch {
      throw new TripImageError("Invalid image filename.");
    }
    const image = await uploadTripImage(
      String(req.params.id),
      req.body,
      String(req.headers["content-type"] ?? ""),
      name,
    );
    return res.status(201).json({ success: true, data: image });
  } catch (error) {
    return tripImageFailure(res, error);
  }
}

export async function removeImage(req: Request, res: Response) {
  try {
    return res.json({
      success: true,
      data: await deleteTripImage(String(req.params.id), String(req.params.imageId)),
    });
  } catch (error) {
    return tripImageFailure(res, error);
  }
}
