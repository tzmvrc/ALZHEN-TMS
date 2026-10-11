import { apiGet, apiGetCached, invalidateApiCache, type ApiResponse } from "./api.service";
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

export type ReportPageOptions = {
  page: number;
  limit: number;
  search: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filters: Record<string, string>;
};

export type ReportPageBundle = {
  columns: ReportColumn[];
  rows: ReportRow[];
  pagination: Pagination;
};

export const REPORT_PAGE_CACHE_TTL_MS = 90_000;
export const REPORT_PAGE_STALE_TTL_MS = 5 * 60_000;
const reportPageCache = new Map<string, { reportKey: ReportKey; token: string; expiresAt: number; staleUntil: number; value: ReportPageBundle }>();
const reportPageRequests = new Map<string, Promise<ReportPageBundle>>();
let reportPageCacheGeneration = 0;

function reportPageCacheKey(reportKey: ReportKey, token: string, options: ReportPageOptions) {
  return JSON.stringify([
    token,
    reportKey,
    options.page,
    options.limit,
    options.search.trim(),
    options.sortBy,
    options.sortOrder,
    Object.fromEntries(Object.entries(options.filters).sort(([left], [right]) => left.localeCompare(right))),
  ]);
}

export function getCachedReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
): ReportPageBundle | null {
  const key = reportPageCacheKey(reportKey, token, options);
  const entry = reportPageCache.get(key);
  if (!entry) return null;
  return entry.expiresAt > Date.now() ? entry.value : null;
}

export function getStaleReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
): ReportPageBundle | null {
  const key = reportPageCacheKey(reportKey, token, options);
  const entry = reportPageCache.get(key);
  if (!entry) return null;
  if (entry.staleUntil <= Date.now()) {
    reportPageCache.delete(key);
    return null;
  }
  return entry.value;
}

export function clearReportPageCache() {
  reportPageCacheGeneration += 1;
  reportPageCache.clear();
  reportPageRequests.clear();
}

export function invalidateReportPageCache(reportKey?: ReportKey) {
  reportPageCacheGeneration += 1;
  for (const [key, entry] of reportPageCache) {
    if (!reportKey || entry.reportKey === reportKey) reportPageCache.delete(key);
  }
  for (const key of reportPageRequests.keys()) {
    if (!reportKey || key.includes(`"${reportKey}"`)) reportPageRequests.delete(key);
  }
}

export function setCachedReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
  value: ReportPageBundle,
) {
  reportPageCache.set(reportPageCacheKey(reportKey, token, options), {
    reportKey,
    token,
    expiresAt: Date.now() + REPORT_PAGE_CACHE_TTL_MS,
    staleUntil: Date.now() + REPORT_PAGE_STALE_TTL_MS,
    value,
  });
}

export function updateCachedReportPages(
  reportKey: ReportKey,
  token: string,
  update: (bundle: ReportPageBundle) => ReportPageBundle,
) {
  for (const [key, entry] of reportPageCache) {
    if (entry.reportKey === reportKey && entry.token === token) {
      reportPageCache.set(key, { ...entry, value: update(entry.value) });
    }
  }
}

export function invalidateReportData(reportKey: ReportKey) {
  invalidateApiCache(REPORTS[reportKey].endpoint);
  invalidateReportPageCache(reportKey);
}

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
  fresh = false,
): Promise<ReportColumn[]> {
  const endpoint = `/reports/${reportKey}/columns`;
  const response = fresh
    ? await apiGet<ApiResponse<{ report: string; columns: ReportColumn[] }>>(endpoint, token)
    : await apiGetCached<ApiResponse<{ report: string; columns: ReportColumn[] }>>(endpoint, token, REPORT_PAGE_CACHE_TTL_MS);
  return unwrap(response, "Unable to load report columns.").columns;
}

export async function fetchReportRows(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions & { fresh?: boolean },
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

  const endpoint = `${REPORTS[reportKey].endpoint}?${params.toString()}`;
  const response = options.fresh
    ? await apiGet<ApiResponse<ReportData<ReportRow>>>(endpoint, token)
    : await apiGetCached<ApiResponse<ReportData<ReportRow>>>(endpoint, token, REPORT_PAGE_CACHE_TTL_MS);
  return unwrap(response, "Unable to load report rows.");
}

/** Shared by login preloading and ReportDataView so both warm and consume the same page cache. */
export async function fetchReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
  refresh = false,
): Promise<ReportPageBundle> {
  const key = reportPageCacheKey(reportKey, token, options);
  const cached = getCachedReportPage(reportKey, token, options);
  if (cached && !refresh) return cached;
  const pending = reportPageRequests.get(key);
  if (pending) return pending;

  const requestGeneration = reportPageCacheGeneration;
  const request = Promise.all([
    fetchReportColumns(reportKey, token, refresh),
    fetchReportRows(reportKey, token, { ...options, fresh: refresh }),
  ]).then(([columns, result]) => {
    const bundle = { columns, rows: result.rows, pagination: result.pagination };
    if (requestGeneration === reportPageCacheGeneration) {
      const now = Date.now();
      reportPageCache.set(key, {
        reportKey,
        token,
        expiresAt: now + REPORT_PAGE_CACHE_TTL_MS,
        staleUntil: now + REPORT_PAGE_STALE_TTL_MS,
        value: bundle,
      });
    }
    return bundle;
  }).finally(() => {
    if (reportPageRequests.get(key) === request) reportPageRequests.delete(key);
  });
  reportPageRequests.set(key, request);
  return request;
}

export function getSortableFields(reportKey: ReportKey): string[] {
  return sortFields[reportKey];
}

export function getReportFilters(reportKey: ReportKey): ReportFilter[] {
  return reportFilters[reportKey];
}
