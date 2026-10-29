import { apiGet, apiGetCached, apiPatch, apiPost, invalidateApiCache, type ApiResponse } from "./api.service";
import { invalidateReportData } from "./report.service";

export async function fetchPodReviewCapabilities(token:string){
  const response=await apiGetCached<ApiResponse<{enabled:boolean}>>("/trips/pod-review-capabilities",token,30000);
  if(!response.success||!response.data)throw new Error("POD review availability could not be checked.");
  return response.data;
}
export type PodDecisionDraft={request_id:string;decision:"APPROVED"|"REJECTED";reason:string;reviewed_fields:Record<string,unknown>;expected_review_version:number;expected_ocr_version:number};
export type PodReviewEvent={id:string;actor_snapshot:string;decision:string;reason:string|null;created_at:string};
export async function fetchPodDecisionHistory(token:string,tripId:string,receiptId:string){
  const response=await apiGetCached<ApiResponse<PodReviewEvent[]>>(`/trips/${encodeURIComponent(tripId)}/receipts/${encodeURIComponent(receiptId)}/decisions`,token,30000);
  if(!response.success||!response.data)throw new Error("POD history could not be loaded.");return response.data;
}
export async function savePodDecision(token:string,tripId:string,receiptId:string,draft:PodDecisionDraft){
  const response=await apiPost<ApiResponse<{receipt:TripReceipt;outcome:{status:string}}>>(`/trips/${encodeURIComponent(tripId)}/receipts/${encodeURIComponent(receiptId)}/decision`,draft,token);
  if(!response.success||!response.data)throw new Error(response.message??"Decision could not be confirmed. Retry the same request.");
  invalidateApiCache(`/trips/${encodeURIComponent(tripId)}`);
  invalidateApiCache("/reports/pod-status");invalidateApiCache("/reports/transmittal-tracker");invalidateReportData("combined");
  invalidateApiCache('/delivery/current');
  if(response.data.receipt.assignment_id)invalidateApiCache(`/delivery/assignments/${encodeURIComponent(response.data.receipt.assignment_id)}`);
  window.dispatchEvent(new CustomEvent('pod-review-saved',{detail:{tripId,receipt:response.data.receipt}}));
  return response.data;
}

export type ReceiptInterpretation = {
  receipt_id:string; ocr_version:number; model:string; persisted:false; approved:false;
  linked_stop_mismatch:boolean;
  interpretation:{fields:Record<string,{value:string|number|null;evidence:string|null;uncertain:boolean}>;warnings:string[];status:"NEEDS_REVIEW"};
  matching:{ambiguous:boolean;suggested:{store_name:string|null;customer_name:string|null;evidence:string[]}|null};
};

export async function interpretReceiptText(token:string, tripId:string, receiptId:string, version:number):Promise<ReceiptInterpretation> {
  const response=await apiPost<ApiResponse<ReceiptInterpretation>>(`/trips/${encodeURIComponent(tripId)}/receipts/${encodeURIComponent(receiptId)}/interpret`,{expected_version:version,external_processing_consent:true},token);
  if(!response.success || !response.data)throw new Error(response.message ?? "Unable to interpret receipt. Manual review remains available.");
  return response.data;
}

export type TripReceipt = {
  replaces_receipt_id?:string|null;pod_reviewer_name?:string|null;
  delivery_event_id?:string|null;display_order?:number;
  assignment_id?:string|null;uploaded_by?:string|null;uploader_name?:string|null;uploader_crew_role?:'DRIVER'|'HELPER'|null;
  mime_type?:string|null;
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
  pod_review_status?:"PENDING"|"APPROVED"|"REJECTED"|null;
  pod_review_version?:number|null;
  pod_reviewed_at?:string|null;
  pod_rejection_reason?:string|null;
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
