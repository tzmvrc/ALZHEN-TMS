import { apiGet, type ApiResponse } from "./api.service";

export const REPORTS = {
  combined: { title: "Combined Report", endpoint: "/reports/combined" },
  "dispatch-monitoring": {
    title: "Dispatch Monitoring",
    endpoint: "/reports/dispatch-monitoring",
  },
  dispatch: { title: "Dispatch Report", endpoint: "/reports/dispatch" },
  "trip-booking": { title: "Trip Booking", endpoint: "/reports/trip-booking" },
  "store-calling": { title: "Store Calling", endpoint: "/reports/store-calling" },
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
    "loading_date",
    "dispatch_number",
    "customer_name",
    "status",
    "confirmation_status",
    "date_assigned",
    "assigned_to",
  ],
};

const reportFilters: Record<ReportKey, ReportFilter[]> = {
  combined: [
    { key: "loading_date_from", label: "Loading date from", type: "date" },
    { key: "loading_date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status" },
    { key: "trip_status", label: "Trip status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "customer_id", label: "Customer ID" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status" },
  ],
  "dispatch-monitoring": [
    { key: "loading_date_from", label: "Loading date from", type: "date" },
    { key: "loading_date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status" },
    { key: "trip_status", label: "Trip status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status" },
  ],
  dispatch: [
    { key: "loading_date_from", label: "Loading date from", type: "date" },
    { key: "loading_date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status" },
    { key: "wh_code", label: "Warehouse code" },
    { key: "customer_name", label: "Customer" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status" },
  ],
  "trip-booking": [
    { key: "loading_date_from", label: "Loading date from", type: "date" },
    { key: "loading_date_to", label: "Loading date to", type: "date" },
    { key: "dispatch_number", label: "Dispatch number" },
    { key: "trip_status", label: "Trip status" },
    { key: "delivery_status", label: "Delivery status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status" },
  ],
  "store-calling": [
    { key: "status", label: "Status" },
    { key: "confirmation_status", label: "Confirmation status" },
    { key: "assigned_to", label: "Assigned to" },
    { key: "date_assigned_from", label: "Assigned date from", type: "date" },
    { key: "date_assigned_to", label: "Assigned date to", type: "date" },
    { key: "warehouse_code", label: "Warehouse code" },
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
  const response = await apiGet<
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
    sort_by: sortFields[reportKey].includes(options.sortBy)
      ? options.sortBy
      : "",
    sort_order: options.sortOrder,
  });
  if (options.search.trim()) params.set("search", options.search.trim());
  if (!params.get("sort_by")) params.delete("sort_by");
  for (const filter of reportFilters[reportKey]) {
    const value = options.filters[filter.key]?.trim();
    if (value) params.set(filter.key, value);
  }

  const response = await apiGet<ApiResponse<ReportData<ReportRow>>>(
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