import { apiGet, apiPatch, type ApiResponse } from "./api.service";

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

export async function fetchNotifications(token: string) {
  const response = await apiGet<ApiResponse<{ notifications: AdminNotification[]; unreadCount: number }>>("/notifications", token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to load notifications.");
  return response.data;
}

export async function markNotificationAsRead(token: string, id: string) {
  const response = await apiPatch<ApiResponse<{ id: string; read_at: string }>>(`/notifications/${id}/read`, {}, token);
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to mark notification as read.");
  return response.data;
}
