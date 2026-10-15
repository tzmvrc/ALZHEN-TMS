import { apiDelete, apiGetCached, apiPatch, apiPost, apiPostFile, apiPut, invalidateApiCache, type ApiResponse } from "./api.service";
import { updateTripAssignmentRecord, updateTripLineItemRecord, updateTripRecord, updateTripStopRecord, updateTripUnscopedLineItemRecord } from "./trip.service";
import { invalidateReportPageCache } from "./report.service";

export type OperationsTrip = { id: string; trip_number: string | number | null; dispatch_number: string | null; status: string | null };
export type OperationsStop = { id: string; trip_id: string; stop_sequence: number | null; dispatch_number?: string | null; arrival_time: string | null; start_unloading_time: string | null; finish_unloading_time: string | null; delivery_status?: string | null; remarks?: string | null };
export type OperationsTripOption = OperationsTrip & {
  driver_name: string | null;
  plate_number: string | null;
  route: string | null;
  stops: Array<Pick<OperationsStop, "id" | "stop_sequence" | "dispatch_number"> & { quantity?: number | null; total_cbm?: number | null }>;
};
export type LoadingReport = { id: string; trip_id: string; warehouse_arrival_at: string | null; loading_start_at: string | null; loading_finished_at: string | null };
export type UnloadingReport = { id: string; trip_id: string; trip_stop_id: string };
export type ScopeReport = { id: string; trip_id: string; trip_stop_id: string | null; reason: string | null; number_of_boxes: number | null; comments: string | null; reported_at?: string | null; reported_by?: string | null; reported_by_id?: string | null; reported_by_name?: string | null; creator_name?: string | null };
export type OperationsOffloadItem = { id: string; offload_id: string; trip_line_item_id: string | null; quantity: number | string | null; total_cbm: number | string | null; dr_number?: string | null; customer_model?: string | null };
export type OperationsCargoEntry = ScopeReport & { items?: OperationsOffloadItem[] };
export type OperationsLineItem = { id: string; trip_id: string; trip_stop_id: string | null; dr_number: string | null; quantity: number | string | null; cbm: number | string | null };
export type OperationsEventType = "Loading" | "Unloading" | "Backload" | "Offload";
export type OperationsSourceType = "LOADING" | "UNLOADING" | "BACKLOAD" | "OFFLOAD";
export type OperationsEventRow = { id: string; source_type: OperationsSourceType; source_record_id: string; loading_report_id: string | null; unloading_report_id: string | null; assignment_id: string | null; trip_id: string; trip_stop_id: string | null; trip_number: string | number | null; dispatch_number: string | null; date: string | null; plate_number: string | null; driver_name: string | null; route: string | null; dr_number: string | null; quantity: number | null; quantity_scope: "Trip total" | "Stop total" | "Boxes" | null; total_cbm: number | null; report_type: OperationsEventType; report_types: OperationsEventType[]; event_type_records: Array<{ id: string; source_type: OperationsSourceType; event_type: OperationsEventType }>; backload_records: OperationsCargoEntry[]; offload_records: OperationsCargoEntry[]; line_items: OperationsLineItem[]; loading_timestamps: Pick<LoadingReport, "warehouse_arrival_at" | "loading_start_at" | "loading_finished_at"> | null; unloading_timestamps: Pick<OperationsStop, "arrival_time" | "start_unloading_time" | "finish_unloading_time"> | null; remarks: string | null; reason: string | null; reported_by: string | null; stop_sequence: number | null; scope_label: string };
export type OperationsReceipt = { id: string; file_name: string; mime_type: string; file_size_bytes: number; signed_url: string; received_at: string | null; created_at: string | null };
export type OperationsReceiptEventType = "LOADING" | "UNLOADING" | "BACKLOAD" | "OFFLOAD";
export type OperationsReceiptUpload = { id: string; trip_id: string; trip_stop_id: string | null; file_name: string; mime_type: string; file_size_bytes: number; uploaded_by: string; received_at: string | null; created_at: string | null };
export type OperationsReportData = { trips: OperationsTrip[]; trip_options: OperationsTripOption[]; stops: OperationsStop[]; loading: LoadingReport[]; unloading: UnloadingReport[]; backloads: ScopeReport[]; offloads: ScopeReport[]; event_rows: OperationsEventRow[] };

const ROOT = "/reports/operations";
export type OperationsReporter = { id: string; name: string; role: string };
export const fetchOperationsReporters = (token: string, search = "") => unwrap(apiGetCached<ApiResponse<OperationsReporter[]>>(`${ROOT}/reporters?search=${encodeURIComponent(search)}`, token, 30_000));
const unwrap = <T,>(promise: Promise<ApiResponse<T>>): Promise<T> => promise.then((response) => {
  if (!response.success || response.data === undefined) throw new Error(response.message ?? "Unable to load operational reports.");
  return response.data;
});

export const fetchOperationsOverview = (token: string) => unwrap(apiGetCached<ApiResponse<OperationsReportData>>(`${ROOT}/overview`, token, 30_000));
export const fetchAssignedOperations = (token: string) => unwrap(apiGetCached<ApiResponse<OperationsReportData>>(`${ROOT}/assigned`, token, 15_000));
export const fetchTripOperations = (token: string, tripId: string) => unwrap(apiGetCached<ApiResponse<OperationsReportData>>(`${ROOT}/trips/${encodeURIComponent(tripId)}`, token, 30_000));

function invalidateOperations() {
  invalidateReportPageCache();
  invalidateApiCache(`${ROOT}/`);
  invalidateApiCache("/trips");
  invalidateApiCache("/reports/");
}

export function invalidateOperationsReportsCache() {
  invalidateOperations();
}

export async function saveLoadingReport(token: string, tripId: string, values: Partial<Pick<LoadingReport, "warehouse_arrival_at" | "loading_start_at" | "loading_finished_at">>) {
  const response = await unwrap(apiPut<ApiResponse<LoadingReport>>(`${ROOT}/loading/${encodeURIComponent(tripId)}`, values, token));
  invalidateOperations();
  return response;
}

export async function saveUnloadingReport(token: string, tripId: string, stopId: string, values: Partial<Pick<OperationsStop, "arrival_time" | "start_unloading_time" | "finish_unloading_time">>) {
  const response = await unwrap(apiPut<ApiResponse<{ report: UnloadingReport; stop: OperationsStop }>>(`${ROOT}/unloading/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}`, values, token));
  invalidateOperations();
  return response;
}

export async function createScopedReport(token: string, kind: "backloads" | "offloads", values: Omit<ScopeReport, "id"> & { quantity?: number | null; total_cbm?: number | null }) {
  const response = await unwrap(apiPost<ApiResponse<ScopeReport>>(`${ROOT}/${kind}`, values, token));
  invalidateOperations();
  return response;
}

export async function updateScopedReport(token: string, kind: "backloads" | "offloads", id: string, values: Pick<ScopeReport, "trip_id" | "trip_stop_id"> & Partial<Omit<ScopeReport, "id" | "trip_id" | "trip_stop_id">>) {
  const response = await unwrap(apiPatch<ApiResponse<ScopeReport>>(`${ROOT}/${kind}/${encodeURIComponent(id)}`, values, token));
  invalidateOperations();
  return response;
}

export async function updateOffloadItem(token: string, report: ScopeReport, item: { id: string; trip_line_item_id: string | null }, updates: { quantity?: number | null; total_cbm?: number | null }) {
  const response = await unwrap(apiPatch<ApiResponse<{ report: ScopeReport; item: OperationsOffloadItem }>>(`${ROOT}/offloads/${encodeURIComponent(report.id)}`, {
    trip_id: report.trip_id,
    trip_stop_id: report.trip_stop_id,
    item: { ...item, ...updates },
  }, token));
  invalidateOperations();
  return response;
}

export async function submitOperationsEvent(token: string, values: { dispatch_number: string; event_type: "BACKLOAD" | "OFFLOAD"; remarks: string }) {
  const response = await unwrap(apiPost<ApiResponse<{ event_type: "BACKLOAD" | "OFFLOAD"; dispatch_number: string | null; report: ScopeReport }>>(`${ROOT}/events`, values, token));
  invalidateOperations();
  return response;
}

export async function updateOperationsEventType(token: string, sourceType: OperationsSourceType, recordId: string, eventType: OperationsEventType) {
  const response = await unwrap(apiPatch<ApiResponse<Record<string, unknown>>>(`${ROOT}/types/${sourceType.toLowerCase()}/${encodeURIComponent(recordId)}`, { event_type: eventType }, token));
  invalidateOperations();
  return response;
}

export async function deleteOperationsReport(token: string, sourceType: OperationsSourceType, recordId: string) {
  const response = await unwrap(apiDelete<ApiResponse<{ source_type: OperationsSourceType; record_id: string }>>(`/reports/operations/reports/${sourceType.toLowerCase()}/${encodeURIComponent(recordId)}`, token));
  invalidateOperations();
  return response;
}

export async function uploadOperationsReceipt(token: string, eventType: "BACKLOAD" | "OFFLOAD", recordId: string, file: File) {
  const response = await unwrap(apiPostFile<ApiResponse<OperationsReceiptUpload>>(`${ROOT}/${eventType.toLowerCase()}/${encodeURIComponent(recordId)}/receipts`, file, token));
  invalidateOperations();
  return response;
}

export async function fetchOperationsReceipts(token: string, eventType: OperationsReceiptEventType, recordId: string) {
  return unwrap(apiGetCached<ApiResponse<OperationsReceipt[]>>(`${ROOT}/${eventType.toLowerCase()}/${encodeURIComponent(recordId)}/receipts`, token, 0));
}

export async function updateOperationsAssignment(token: string, tripId: string, assignmentId: string, updates: Record<string, unknown>) {
  const result = await updateTripAssignmentRecord(token, tripId, assignmentId, updates);
  invalidateOperations();
  return result;
}

export async function updateOperationsTrip(token: string, tripId: string, updates: Record<string, unknown>) {
  const result = await updateTripRecord(token, tripId, updates);
  invalidateOperations();
  return result;
}

export async function updateOperationsStop(token: string, tripId: string, stopId: string, updates: Record<string, unknown>) {
  const result = await updateTripStopRecord(token, tripId, stopId, updates);
  invalidateOperations();
  return result;
}

export async function updateOperationsLineItem(token: string, lineItem: OperationsLineItem, updates: Record<string, unknown>) {
  if (lineItem.trip_stop_id) {
    return updateTripLineItemRecord(token, lineItem.trip_id, lineItem.trip_stop_id, lineItem.id, updates);
  }
  return updateTripUnscopedLineItemRecord(token, lineItem.trip_id, lineItem.id, updates);
}
