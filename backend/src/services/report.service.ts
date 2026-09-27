import { supabaseAdmin } from "../config/supabase.js";
import { REPORT_DEFINITIONS, REPORT_KEYS } from "../config/reports.js";
import { ReportQueryParams, ReportResponse } from "../types/report.types.js";
import {
  buildPaginationMeta,
  normalizePagination,
} from "../utils/pagination.js";
import {
  isValidUuid,
  normalizeSortOrder,
  normalizeText,
} from "../utils/validation.js";

const REPORT_ROUTE_MAP = {
  combined: "v_tms_combined",
  "dispatch-monitoring": "v_dispatch_monitoring",
  dispatch: "v_dispatch_report",
  "trip-booking": "v_trip_booking",
  "store-calling": "v_store_calling",
} as const;

function getReportDefinition(reportKey: string) {
  const definition = REPORT_DEFINITIONS[reportKey];
  if (!definition) {
    throw new Error(`Unsupported report key: ${reportKey}`);
  }

  return definition;
}

function buildSearchClause(
  search: string | undefined,
  searchableColumns: string[],
) {
  if (!search || searchableColumns.length === 0) {
    return null;
  }

  const normalizedSearch = search.trim();
  if (!normalizedSearch) {
    return null;
  }

  return searchableColumns
    .map((column) => `${column}.ilike.%${normalizedSearch}%`)
    .join(",");
}

function applyAllowedFilters(
  queryBuilder: any,
  filters: Array<{
    key: string;
    field: string;
    operator: "eq" | "gte" | "lte";
  }>,
  params: ReportQueryParams,
) {
  for (const filter of filters) {
    const value = normalizeText(params[filter.key] as string | undefined);
    if (!value) continue;

    if (filter.operator === "eq") {
      queryBuilder = queryBuilder.eq(filter.field, value);
    } else if (filter.operator === "gte") {
      queryBuilder = queryBuilder.gte(filter.field, value);
    } else if (filter.operator === "lte") {
      queryBuilder = queryBuilder.lte(filter.field, value);
    }
  }

  return queryBuilder;
}

export async function getReportData(
  reportKey: string,
  query: ReportQueryParams,
): Promise<ReportResponse> {
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) {
    throw new Error("Report not found");
  }

  const definition = getReportDefinition(key);
  const { page, limit, from } = normalizePagination(query);
  const searchValue = normalizeText(query.search);
  const sortByValue =
    typeof query.sort_by === "string" ? query.sort_by : undefined;
  const sortBy = definition.sortableColumns.includes(sortByValue ?? "")
    ? (sortByValue ?? definition.defaultSort)
    : definition.defaultSort;
  const sortOrder = normalizeSortOrder(
    typeof query.sort_order === "string" ? query.sort_order : undefined,
    definition.defaultSortOrder,
  );

  for (const field of ["page", "limit", "search", "sort_by", "sort_order"]) {
    const value = query[field];
    if (Array.isArray(value)) {
      throw new Error(`Invalid query parameter: ${field}`);
    }
  }

  let queryBuilder = supabaseAdmin
    .from(definition.view)
    .select("*", { count: "exact" });

  for (const filter of definition.filters) {
    const filterValue = normalizeText(query[filter.key] as string | undefined);
    if (!filterValue) continue;
    if (filter.operator === "eq") {
      queryBuilder = queryBuilder.eq(filter.field, filterValue);
    }
    if (filter.operator === "gte") {
      queryBuilder = queryBuilder.gte(filter.field, filterValue);
    }
    if (filter.operator === "lte") {
      queryBuilder = queryBuilder.lte(filter.field, filterValue);
    }
  }

  if (searchValue) {
    const searchTerms = definition.searchableColumns
      .map((column) => `${column}.ilike.%${searchValue}%`)
      .join(",");
    queryBuilder = queryBuilder.or(searchTerms);
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.range(from, from + limit - 1);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error("Report query error:", {
      reportKey: key,
      view: definition.view,
      filterKeys: Object.keys(query),
      error,
    });
    throw new Error("Unable to fetch report data");
  }

  return {
    rows: (data ?? []) as Record<string, unknown>[],
    pagination: buildPaginationMeta(page, limit, count ?? (data ?? []).length),
  };
}

export async function getReportColumns(reportKey: string) {
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) {
    throw new Error("Report not found");
  }

  return {
    report: key,
    columns: REPORT_DEFINITIONS[key].columns,
  };
}

export async function getAvailableReportKeys() {
  return REPORT_KEYS;
}

export function getReportRouteKey(reportKey: string) {
  const routeKey = reportKey.trim();
  if (!(routeKey in REPORT_ROUTE_MAP)) {
    throw new Error("Unsupported report key");
  }

  return REPORT_ROUTE_MAP[routeKey as keyof typeof REPORT_ROUTE_MAP];
}

export function validateReportKey(reportKey: string) {
  if (!reportKey || !REPORT_KEYS.includes(reportKey)) {
    throw new Error("Invalid report key");
  }
  return reportKey;
}

export function validateReportQuery(query: Record<string, unknown>) {
  const invalidSortBy =
    typeof query.sort_by === "string" &&
    query.sort_by.length > 0 &&
    !REPORT_DEFINITIONS[query.reportKey as string]?.sortableColumns.includes(
      query.sort_by,
    );
  if (invalidSortBy) {
    throw new Error("Invalid sort_by parameter");
  }

  const invalidSortOrder =
    typeof query.sort_order === "string" &&
    query.sort_order.length > 0 &&
    !["asc", "desc"].includes(query.sort_order);
  if (invalidSortOrder) {
    throw new Error("Invalid sort_order parameter");
  }

  const invalidPage =
    typeof query.page === "string" &&
    (Number(query.page) <= 0 || !Number.isInteger(Number(query.page)));
  if (invalidPage) {
    throw new Error("page must be a positive integer");
  }

  const invalidLimit =
    typeof query.limit === "string" &&
    (Number(query.limit) <= 0 ||
      Number(query.limit) > 200 ||
      !Number.isInteger(Number(query.limit)));
  if (invalidLimit) {
    throw new Error("limit must be a positive integer up to 200");
  }

  return true;
}
