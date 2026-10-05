import { Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/api-response.js";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notification.service.js";

function actorId(req: Request) {
  if (!req.user?.id) throw new Error("Authenticated profile is unavailable.");
  return req.user.id;
}

export async function getNotifications(req: Request, res: Response) {
  try {
    return sendSuccess(res, 200, "Notifications retrieved", await listNotifications(actorId(req)));
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Unable to load notifications", "NOTIFICATIONS_QUERY_FAILED");
  }
}

export async function readNotification(req: Request, res: Response) {
  try {
    const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await markNotificationRead(actorId(req), notificationId);
    if (!data) return sendError(res, 404, "Notification not found", "NOTIFICATION_NOT_FOUND");
    return sendSuccess(res, 200, "Notification marked as read", data);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Unable to update notification", "NOTIFICATION_UPDATE_FAILED");
  }
}

export async function readAllNotifications(req: Request, res: Response) {
  try {
    return sendSuccess(res, 200, "Notifications marked as read", await markAllNotificationsRead(actorId(req)));
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : "Unable to update notifications", "NOTIFICATION_UPDATE_FAILED");
  }
}
