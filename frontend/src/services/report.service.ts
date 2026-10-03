import { apiGetCached, type ApiResponse } from "./api.service";
import type { DropdownField } from "./dropdown-option.service";

export const REPORTS = {
  combined: { title: "Combined Report", endpoint: "/reports/combined" },
  "dispatch-monitoring": {
    title: "Dispatch Monitoring",
    endpoint: "/reports/dispatch-monitoring",
  },
  dispatch: { title: "Dispatch Report", endpoint: "/reports/dispatch" },
  "trip-booking": { title: "Trip Booking", endpoint: "/reports/trip-booking" },
  "store-calling": {
    title: "Store Calling",
    endpoint: "/reports/store-calling",
  },
} as const;

export type ReportKey = keyof typeof REPORTS;
export type ReportColumn = {
  key: string;
  title: string;
  type: string;
};
export type ReportRow = Record<string, unknown>;
export type ReportFilter = {
  key: string;
  label: string;
  type?: "date" | "text";
  dropdownField?: DropdownField;
};
export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ReportData<T> = {
  rows: T[];
  pagination: Pagination;
};

const sortFields: Record<ReportKey, string[]> = {
  combined: [
    "loading_date",
    "dispatch_number",
    "trip_number",
    "trip_status",
    "delivery_status",
    "customer_name",
    "warehouse_code",
    "plate_number",
    "quantity",
    "cbm",
  ],
  "dispatch-monitoring": [
    "loading_date",
    "dispatch_number",
    "trip_status",
    "delivery_status",
    "customer_name",
    "warehouse_code",
  ],
  dispatch: [
    "loading_date",
    "dispatch_number",
    "customer_name",
    "delivery_status",
    "wh_code",
    "plate_number",
  ],
  "trip-booking": [
    "loading_date",
    "dispatch_number",
    "trip_type",
    "warehouse_code",
    "customer_name",
    "trip_status",
    "delivery_status",
  ],
  "store-calling": [
    "date_assigned",
    "dispatch_number",
    "customer_name",
    "status",
    "confirmation_status",
    "assigned_to",
  ],
};

const reportFilters: Record<ReportKey, ReportFilter[]> = {
  combined: [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "trip_status", label: "Trip status", dropdownField: "trip_status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "customer_name", label: "Customer" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  "dispatch-monitoring": [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "trip_status", label: "Trip status", dropdownField: "trip_status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "customer_name", label: "Customer" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  dispatch: [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "wh_code", label: "Warehouse code" },
    { key: "customer_name", label: "Customer" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  "trip-booking": [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "dispatch_number", label: "Dispatch number" },
    { key: "trip_status", label: "Trip status", dropdownField: "trip_status" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  "store-calling": [
    { key: "status", label: "Status", dropdownField: "store_call_status" },
    { key: "confirmation_status", label: "Confirmation status", dropdownField: "confirmation_status" },
    { key: "assigned_to", label: "Assigned to" },
    { key: "date_from", label: "Assigned date from", type: "date" },
    { key: "date_to", label: "Assigned date to", type: "date" },
  ],
};

function unwrap<T>(response: ApiResponse<T>, message: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.message ?? message);
  }
  return response.data;
}

export async function fetchReportColumns(
  reportKey: ReportKey,
  token: string,
): Promise<ReportColumn[]> {
  const response = await apiGetCached<
    ApiResponse<{ report: string; columns: ReportColumn[] }>
  >(`/reports/${reportKey}/columns`, token);
  return unwrap(response, "Unable to load report columns.").columns;
}

export async function fetchReportRows(
  reportKey: ReportKey,
  token: string,
  options: {
    page: number;
    limit: number;
    search: string;
    sortBy: string;
    sortOrder: "asc" | "desc";
    filters: Record<string, string>;
  },
): Promise<ReportData<ReportRow>> {
  const params = new URLSearchParams({
    page: String(options.page),
    limit: String(options.limit),
    sort_by: options.sortBy,
    sort_order: options.sortOrder,
  });
  if (options.search.trim()) params.set("search", options.search.trim());
  if (!params.get("sort_by")) params.delete("sort_by");
  for (const filter of reportFilters[reportKey]) {
    const value = options.filters[filter.key]?.trim();
    if (value) params.set(filter.key, value);
  }

  const response = await apiGetCached<ApiResponse<ReportData<ReportRow>>>(
    `${REPORTS[reportKey].endpoint}?${params.toString()}`,
    token,
  );
  return unwrap(response, "Unable to load report rows.");
}

export function getSortableFields(reportKey: ReportKey): string[] {
  return sortFields[reportKey];
}

export function getReportFilters(reportKey: ReportKey): ReportFilter[] {
  return reportFilters[reportKey];
}
