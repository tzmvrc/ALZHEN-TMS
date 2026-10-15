import { apiGetCached, getAppSessionHeaders, handleSessionExpiredResponse, invalidateApiCache, type ApiResponse } from "./api.service";

export type TripImage = {
  id: string;
  trip_id: string;
  storage_path: string;
  file_name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  signed_url: string;
  /* Text read from a receipt photo, or the admin's corrected version. */
  ocr_text?: string | null;
  ocr_confidence?: number | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";
const TRIP_IMAGE_CACHE_TTL_MS = 45_000;

export function invalidateTripImagesCache(tripId: string) {
  invalidateApiCache(`/trips/${encodeURIComponent(tripId)}/images`);
}

async function imageRequest<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...getAppSessionHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null;
  if (!response.ok) await handleSessionExpiredResponse(response.status, payload, true);
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.message ?? "Trip photo request failed.");
  }
  return payload.data;
}

export async function fetchTripImages(token: string, tripId: string): Promise<TripImage[]> {
  const endpoint = `/trips/${encodeURIComponent(tripId)}/images`;
  const response = await apiGetCached<ApiResponse<TripImage[]>>(
    endpoint,
    token,
    TRIP_IMAGE_CACHE_TTL_MS,
  );
  if (!response.success || !response.data) throw new Error(response.message ?? "Unable to load trip photos.");
  return response.data;
}

export async function uploadTripImage(token: string, tripId: string, file: File) {
  const result = await imageRequest<TripImage>(`/trips/${encodeURIComponent(tripId)}/images`, token, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  invalidateTripImagesCache(tripId);
  return result;
}

export const deleteTripImage = (
  token: string,
  tripId: string,
  imageId: string,
) =>
  imageRequest<{ id: string }>(
    `/trips/${encodeURIComponent(tripId)}/images/${encodeURIComponent(imageId)}`,
    token,
    { method: "DELETE" },
  ).then((result) => {
    invalidateTripImagesCache(tripId);
    return result;
  });

export async function saveTripImageText(
  token: string,
  tripId: string,
  imageId: string,
  payload: { ocr_text: string; ocr_confidence?: number | null; reviewed: boolean },
) {
  const result = await imageRequest<TripImage>(
    `/trips/${encodeURIComponent(tripId)}/images/${encodeURIComponent(imageId)}/ocr`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  invalidateTripImagesCache(tripId);
  return result;
}