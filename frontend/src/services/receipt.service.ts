import { apiGet, apiPatch, type ApiResponse } from "./api.service";

export type TripReceipt = {
  id: string;
  trip_id: string;
  trip_stop_id: string | null;
  dr_number: string | null;
  file_name: string | null;
  signed_url: string | null;
  uploaded_at: string | null;
  /** Text read from the photo, or the admin's corrected version. */
  ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_version: number;
  /** Set once an admin has checked the text. */
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export async function fetchTripReceipts(token: string, tripId: string): Promise<TripReceipt[]> {
  const response = await apiGet<ApiResponse<TripReceipt[]>>(
    `/trips/${encodeURIComponent(tripId)}/receipts`,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load delivery receipts.");
  }
  return response.data;
}

export async function saveReceiptText(
  token: string,
  tripId: string,
  receiptId: string,
  payload: { ocr_text: string; ocr_confidence?: number | null; reviewed: boolean; expected_version: number },
): Promise<TripReceipt> {
  const response = await apiPatch<ApiResponse<TripReceipt>>(
    `/trips/${encodeURIComponent(tripId)}/receipts/${encodeURIComponent(receiptId)}/ocr`,
    payload,
    token,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to save receipt text.");
  }
  return response.data;
}
