import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import * as model from "../models/clientwebsite.model.js";
import {
  ContentInputError,
  validateContent,
  imageMime,
  type Collection,
} from "../models/clientwebsite.validation.js";
function collection(req: Request): Collection {
  if (
    req.params.collection !== "trucks" &&
    req.params.collection !== "announcements" &&
    req.params.collection !== "careers"
  )
    throw new ContentInputError("Unknown website collection.");
  return req.params.collection;
}
function revision(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new ContentInputError("Refresh the record before saving.");
  return n;
}
function failure(res: Response, err: unknown) {
  if (err instanceof ContentInputError)
    return res.status(400).json({ error: err.message });
  const code = (err as { code?: string })?.code;
  if (code === "PGRST205" || code === "42P01")
    return res
      .status(503)
      .json({
        error:
          "Website database setup is pending. Run the website-content SQL migration.",
      });
  if (code === "23514") return res.status(503).json({error:"Careers database setup is pending. Run 002_clientwebsite_careers.sql in Supabase, then try again."});
  console.error("Website content operation failed", { code });
  return res
    .status(502)
    .json({
      error: "Website content could not be saved or loaded. Please try again.",
    });
}
export async function list(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(await model.listContent(collection(req)));
  } catch (e) {
    failure(res, e);
  }
}
export async function listAdmin(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(await model.listContent(collection(req), true)); }
  catch (e) { failure(res, e); }
}
export async function save(req: Request, res: Response) {
  try {
    const kind = collection(req);
    let input = req.body;
    if (kind === "announcements" || kind === "careers") {
      const existing = req.params.id ? await model.getContent(kind, String(req.params.id)) : null;
      if (req.params.id && !existing) { res.status(409).json({error:"This post no longer exists. Refresh and try again."}); return; }
      const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila", year:"numeric", month:"2-digit", day:"2-digit"}).format(new Date());
      input = {...req.body, date: existing?.data.date || today};
    }
    const data = validateContent(kind, input);
    const record = req.params.id
      ? await model.updateContent(
          kind,
          String(req.params.id),
          revision(req.body._revision),
          data,
        )
      : await model.createContent(kind, data);
    if (!record) {
      res
        .status(409)
        .json({
          error: "This record changed or was deleted. Refresh and try again.",
        });
      return;
    }
    res.status(req.params.id ? 200 : 201).json(record);
  } catch (e) {
    failure(res, e);
  }
}
export async function remove(req: Request, res: Response) {
  try {
    const removed = await model.deleteContent(
      collection(req),
      String(req.params.id),
      revision(req.query.revision),
    );
    if (!removed) {
      res
        .status(409)
        .json({
          error: "This record changed or was deleted. Refresh and try again.",
        });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    failure(res, e);
  }
}
export async function upload(req: Request, res: Response) {
  try {
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length || body.length > 5 * 1024 * 1024)
      throw new ContentInputError("Choose an image up to 5 MB.");
    const mime = imageMime(body);
    if (!mime) throw new ContentInputError("Use a JPEG, PNG, or WebP image.");
    const file = `${randomUUID()}.${mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp"}`;
    const { error } = await supabaseAdmin.storage
      .from("website-media")
      .upload(file, body, { contentType: mime, upsert: false });
    if (error) {
      res
        .status(502)
        .json({
          error:
            "Image upload failed. Check the website-media storage bucket and try again.",
        });
      return;
    }
    res
      .status(201)
      .json({
        url: supabaseAdmin.storage.from("website-media").getPublicUrl(file).data
          .publicUrl,
      });
  } catch (e) {
    failure(res, e);
  }
}
