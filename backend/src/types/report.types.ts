export type ReportKey =
  | "combined"
  | "dispatch-monitoring"
  | "dispatch"
  | "trip-booking"
  | "store-calling"
  | "pod-status"
  | "pod-drive-files"
  | "trip-exceptions";

export type ReportColumnType = "text" | "date" | "number" | "boolean";

export interface ReportColumnDefinition {
  key: string;
  title: string;
  type: ReportColumnType;
}

export interface ReportFilterDefinition {
  key: string;
  field: string;
  operator: "eq" | "gte" | "lte";
}

export interface ReportDefinition {
  key: string;
  view?: string;
  views?: string[];
  title: string;
  columns: ReportColumnDefinition[];
  searchableColumns: string[];
  sortableColumns: string[];
  filterableColumns: string[];
  defaultSort: string;
  defaultSortOrder: "asc" | "desc";
  filters: ReportFilterDefinition[];
}

export interface ReportQueryParams {
  page?: string | number;
  limit?: string | number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  [key: string]: string | number | string[] | undefined | unknown;
}

export interface ReportPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReportListResponse<T> {
  rows: T[];
  pagination: ReportPagination;
}

export interface ReportResponse extends ReportListResponse<
  Record<string, unknown>
> {}

export interface CombinedReportRow {
  trip_id?: string | number | null;
  trip_stop_id?: string | number | null;
  trip_line_item_id?: string | number | null;
  dispatch_number?: string | null;
  trip_number?: number | null;
  loading_date?: string | null;
  estimated_delivery_date?: string | null;
  trip_status?: string | null;
  trip_type?: string | null;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  plate_number?: string | null;
  driver_name?: string | null;
  customer_name?: string | null;
  store_name?: string | null;
  province?: string | null;
  city?: string | null;
  delivery_status?: string | null;
}

export interface DispatchReportRow {
  dispatch_number?: string | null;
  trip_number?: number | null;
  loading_date?: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  customer_name?: string | null;
  driver_name?: string | null;
  plate_number?: string | null;
  trucker_gc_name?: string | null;
  dr?: string | null;
  customer_model?: string | null;
  province?: string | null;
  city?: string | null;
  delivery_status?: string | null;
}

export interface DispatchMonitoringReportRow {
  dispatch_number?: string | null;
  transaction_number?: string | null;
  loading_date?: string | null;
  trip_type?: string | null;
  pick_up_location?: string | null;
  transfer_to_location?: string | null;
  driver_name?: string | null;
  plate_number?: string | null;
  trucker_gc_name?: string | null;
  trip_status?: string | null;
}

export interface TripBookingReportRow {
  dispatch_number?: string | null;
  trip_number?: number | null;
  loading_date?: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  customer_name?: string | null;
  dr?: string | null;
  province?: string | null;
  city?: string | null;
  invoice_number?: string | null;
  trip_type?: string | null;
  trip_status?: string | null;
  delivery_status?: string | null;
}

export interface StoreCallingReportRow {
  store_call_id?: string | null;
  dispatch_number?: string | null;
  ship_to?: string | null;
  customer_name?: string | null;
  driver_name?: string | null;
  plate_number?: string | null;
  assigned_to?: string | null;
  contact_name?: string | null;
  contact_number?: string | null;
  status?: string | null;
  confirmation_status?: string | null;
  date_assigned?: string | null;
  date_of_contact?: string | null;
}

export interface PodStatusReportRow {
  dispatch_number?: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  dr_number?: string | null;
  pod_status?: string | null;
  transmittal_reference?: string | null;
  pod_remarks?: string | null;
}

export interface PodDriveFileReportRow {
  dispatch_number?: string | null;
  folder_name?: string | null;
  file_name?: string | null;
  dr_number?: string | null;
  dr_number_cleaned?: string | null;
  owner_name?: string | null;
}

export interface TripExceptionReportRow {
  dispatch_number?: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  customer_name?: string | null;
  backload_reason?: string | null;
  offload_reason?: string | null;
  incident_reason?: string | null;
  ir_status?: string | null;
}
