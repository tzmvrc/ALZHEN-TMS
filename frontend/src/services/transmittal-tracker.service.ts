import { apiGetCached, apiPatch, apiPost, invalidateApiCache, type ApiResponse } from "./api.service";

export type TransmittalTrackerCell = { value: unknown; version: number; row_id: string };
export type TransmittalTrackerRow = {
  trip_stop_id: string;
  trip_id: string;
  transmittal_ref: string;
  warehouse_code: string;
  delivered_to: string;
  plate_number: string;
  driver_name: string;
  delivery_receipt_no: string;
  sales_order_no: string;
  date_created: string;
  status: string;
  lbc_waybill_no: string;
  shipping_date_via_lbc: string;
  remarks: string;
  loading_date: string;
  date_delivered: string;
  cells: Record<string, TransmittalTrackerCell>;
  legacy_conflicts: string[];
};
export type TransmittalTrackerResponse = {
  table_id: string;
  access: { canView: boolean; canEdit: boolean; canManage: boolean; isOwner: boolean; isAdmin: boolean };
  columns: Array<{ id: string; name: string; settings: Record<string, unknown>; value_type: string; input_mode: string; binding_scope: string }>;
  rows: TransmittalTrackerRow[];
};

export const TRANSMITTAL_TRACKER_ENDPOINT = "/reports/transmittal-tracker";
export const TRANSMITTAL_TRACKER_CACHE_TTL_MS = 30_000;
export const invalidateTransmittalTrackerCache = () => invalidateApiCache(TRANSMITTAL_TRACKER_ENDPOINT);

async function unwrap<T>(request: Promise<ApiResponse<T>>) {
  const response = await request;
  if (!response.success || response.data === undefined) throw new Error(response.message ?? "Transmittal Tracker request failed.");
  return response.data;
}

export const fetchTransmittalTracker = (token: string, search = "") =>
  unwrap(apiGetCached<ApiResponse<TransmittalTrackerResponse>>(`${TRANSMITTAL_TRACKER_ENDPOINT}?search=${encodeURIComponent(search)}`, token, TRANSMITTAL_TRACKER_CACHE_TTL_MS));

export const initializeTransmittalTracker = async (token: string) => {
  const result = await unwrap(apiPost<ApiResponse<{ id: string; initialized: boolean }>>("/reports/transmittal-tracker/initialize", {}, token));
  invalidateTransmittalTrackerCache();
  return result;
};

export const saveTransmittalTrackerCell = async (token: string, stopId: string, field: string, value: unknown, expected_version: number, resolve_legacy_conflict = false) => {
  const result = await unwrap(apiPatch<ApiResponse<{ field: string; trip_stop_id: string; row_id: string; cell: TransmittalTrackerCell; audit_warning?: string }>>(
    `/reports/transmittal-tracker/stops/${encodeURIComponent(stopId)}/cells/${encodeURIComponent(field)}`,
    { value, expected_version, ...(resolve_legacy_conflict ? { resolve_legacy_conflict: true } : {}) },
    token,
  ));
  invalidateTransmittalTrackerCache();
  return result;
};
