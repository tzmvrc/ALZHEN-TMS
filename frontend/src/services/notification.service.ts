import { apiGet, apiGetCached, apiPatch, invalidateApiCache, type ApiResponse } from "./api.service";
import type { ReportKey } from "./report.service";

export type AdminNotification = {
  id: string;
  actor_profile_id: string | null;
  notification_type: string;
  reference_type: string;
  reference_id: string;
  message: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type AdminNotificationTarget = {
  notificationId: string;
  navigationKey: string;
  reportKey: ReportKey;
  referenceType: string;
  referenceId: string;
  searchText?: string;
  masterListCells?: Array<{ scope: "dispatch" | "dr" | "line"; id: string; field: string }>;
};

export async function fetchNotifications(token: string, cached = false) {
  const response = await (cached ? apiGetCached : apiGet)<ApiResponse<{ notifications: AdminNotification[]; unreadCount: number }>>("/notifications", token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to load notifications.");
  return response.data;
}

export async function markNotificationAsRead(token: string, id: string) {
  const response = await apiPatch<ApiResponse<{ id: string; read_at: string }>>(`/notifications/${id}/read`, {}, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to mark notification as read.");
  invalidateApiCache("/notifications");
  return response.data;
}

export async function markAllNotificationsAsRead(token: string) {
  const response = await apiPatch<ApiResponse<{ notifications: Array<{ id: string; read_at: string }>; read_at: string }>>("/notifications/read-all", {}, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to mark notifications as read.");
  invalidateApiCache("/notifications");
  return response.data;
}
