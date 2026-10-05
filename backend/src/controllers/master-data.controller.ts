import type { Request, Response } from "express";
import { listMasterData, saveMasterData } from "../services/master-data.service.js";
import { deleteTruckImage, listTruckImages, TruckImageError, uploadTruckImage } from "../services/truck-image.service.js";

function failure(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Master data request failed.";
  return res.status(/required|valid|cannot|unsupported|number|true or false|references|at least one|outside/i.test(message) ? 400 : 502)
    .json({ success: false, message });
}

export async function list(req: Request, res: Response) {
  try { return res.json({ success: true, data: await listMasterData(String(req.params.resource), req.query) }); }
  catch (error) { return failure(res, error); }
}

export async function create(req: Request, res: Response) {
  try { return res.status(201).json({ success: true, data: await saveMasterData(String(req.params.resource), req.body ?? {}) }); }
  catch (error) { return failure(res, error); }
}

export async function update(req: Request, res: Response) {
  try { return res.json({ success: true, data: await saveMasterData(String(req.params.resource), req.body ?? {}, String(req.params.id)) }); }
  catch (error) { return failure(res, error); }
}

function truckImageFailure(res: Response, error: unknown) {
  if (error instanceof TruckImageError) return res.status(error.statusCode).json({ success: false, message: error.message });
  console.error("Truck image request failed:", error);
  return res.status(502).json({ success: false, message: "Unable to complete truck image request." });
}

export async function listImages(req: Request, res: Response) {
  try { return res.json({ success: true, data: await listTruckImages(String(req.params.truckId)) }); }
  catch (error) { return truckImageFailure(res, error); }
}

export async function uploadImage(req: Request, res: Response) {
  try {
    if (!Buffer.isBuffer(req.body)) throw new TruckImageError("Choose a JPEG, PNG, or WebP image up to 5 MB.");
    let name = String(req.headers["x-file-name"] ?? "");
    try { name = decodeURIComponent(name); } catch { throw new TruckImageError("Invalid image filename."); }
    const image = await uploadTruckImage(String(req.params.truckId), req.body, String(req.headers["content-type"] ?? ""), name);
    return res.status(201).json({ success: true, data: image });
  } catch (error) { return truckImageFailure(res, error); }
}

export async function removeImage(req: Request, res: Response) {
  try { return res.json({ success: true, data: await deleteTruckImage(String(req.params.truckId), String(req.params.imageId)) }); }
  catch (error) { return truckImageFailure(res, error); }
}
