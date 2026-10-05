import type { Request, Response } from "express";
import { getCalendarEvents } from "../services/calendar.service.js";

export async function listCalendarEvents(req: Request, res: Response) {
  const start = String(req.query.start ?? "");
  const end = String(req.query.end ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start >= end) {
    return res.status(400).json({ success: false, message: "A valid calendar date range is required." });
  }
  try {
    return res.json({ success: true, data: await getCalendarEvents(start, end) });
  } catch (error) {
    console.error("Calendar events query failed:", error);
    return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "Unable to load calendar events." });
  }
}
