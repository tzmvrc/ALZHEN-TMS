import type { ApiResponse } from "./api.service";

export type TripImage = {
  id: string;
  trip_id: string;
  storage_path: string;
  file_name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  signed_url: string;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

async function imageRequest<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.message ?? "Trip photo request failed.");
  }
  return payload.data;
}

export const fetchTripImages = (token: string, tripId: string) =>
  imageRequest<TripImage[]>(`/trips/${encodeURIComponent(tripId)}/images`, token);

export const uploadTripImage = (token: string, tripId: string, file: File) =>
  imageRequest<TripImage>(`/trips/${encodeURIComponent(tripId)}/images`, token, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });

export const deleteTripImage = (
  token: string,
  tripId: string,
  imageId: string,
) =>
  imageRequest<{ id: string }>(
    `/trips/${encodeURIComponent(tripId)}/images/${encodeURIComponent(imageId)}`,
    token,
    { method: "DELETE" },
  );
