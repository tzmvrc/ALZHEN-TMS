import {ApiError} from "../utils/api-response.js";
import { Request, Response } from "express";
import {
  UserServiceError,
  createUserAccount,
  listManagedUsers,
  updateManagedUser,
  uploadProfilePicture,
} from "../services/user.service.js";

function sendFailure(res: Response, error: unknown) {
  if(error instanceof ApiError)return res.status(error.statusCode).json({success:false,message:error.message});
  if (error instanceof UserServiceError) return res.status(error.statusCode).json({ success: false, message: error.message });
  console.error("User management request failed:", error);
  return res.status(502).json({ success: false, message: "Unable to complete user management request." });
}

export async function listUsers(_req: Request, res: Response) {
  try { return res.json({ success: true, data: await listManagedUsers() }); }
  catch (error) { return sendFailure(res, error); }
}

export async function updateUser(req: Request, res: Response) {
  try { return res.json({ success: true, data: await updateManagedUser(String(req.params.id), req.body ?? {}, req.user!.id) }); }
  catch (error) { return sendFailure(res, error); }
}

export async function setProfilePicture(req: Request, res: Response) {
  try {
    if (!Buffer.isBuffer(req.body)) throw new UserServiceError("Choose an image up to 5 MB.", 400);
    const result = await uploadProfilePicture(String(req.params.id), req.body, String(req.headers["content-type"] ?? ""), req.user!.id);
    return res.status(201).json({ success: true, data: result });
  } catch (error) { return sendFailure(res, error); }
}

export async function createUser(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await createUserAccount({
      ...req.body,
      created_by: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof UserServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("User creation controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
}
