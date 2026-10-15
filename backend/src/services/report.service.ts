import { supabaseAdmin } from "../config/supabase.js";
import { REPORT_DEFINITIONS, REPORT_KEYS } from "../config/reports.js";
import type {
  ReportDefinition,
  ReportQueryParams,
  ReportResponse,
} from "../types/report.types.js";
import { ApiError } from "../utils/api-response.js";
import {
  buildPaginationMeta,
  normalizePagination,
} from "../utils/pagination.js";
import { isValidUuid, normalizeSortOrder, normalizeText } from "../utils/validation.js";
import { buildIlikeOrFilter } from "../utils/postgrest-search.js";

const REPORT_ROUTE_MAP = {
  combined: "v_tms_combined",
  "dispatch-monitoring": "v_dispatch_monitoring",
  dispatch: "v_dispatch_report",
  "trip-booking": "v_trip_booking",
  "store-calling": "vw_store_calling_tracker",
  "pod-status": "vw_pod_status_tracker",
  "pod-drive-files": "vw_pod_drive_files",
  "trip-exceptions": "vw_trip_exceptions",
} as const;

function getQueryString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

function validateArrayQuery(value: unknown, key: string) {
  if (Array.isArray(value)) {
    throw new ApiError(
      `Invalid query parameter: ${key}`,
      400,
      "INVALID_QUERY_PARAMETER",
    );
  }
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function toDateFilterValue(value: string, endOfDay = false) {
  if (!isValidDateString(value)) {
    throw new ApiError(
      "Invalid date value. Use YYYY-MM-DD format.",
      400,
      "INVALID_DATE",
    );
  }

  const date = endOfDay
    ? new Date(`${value}T23:59:59.999Z`)
    : new Date(`${value}T00:00:00.000Z`);
  return date.toISOString();
}

function applySearch(
  queryBuilder: any,
  searchValue: string | undefined,
  columns: ReportDefinition["columns"],
  matchingTripIds: string[] = [],
) {
  const searchFilter = buildIlikeOrFilter(
    columns
      .filter((column) => !column.key.endsWith("_id") && column.type === "text")
      .map((column) => column.key),
    searchValue,
  );
  if (!searchValue) return queryBuilder;

  const safeColumns = columns.filter((column) => !column.key.endsWith("_id"));
  const clauses = searchFilter ? [searchFilter] : [];
  // Some deployed report views project blank references. An exact saved dispatch
  // can still be found through its authoritative trip record before pagination.
  const safeTripIds = matchingTripIds.filter(isValidUuid);
  if (safeTripIds.length) clauses.push(`trip_id.in.(${safeTripIds.join(",")})`);
  const numericSearch = searchValue.trim();
  if (/^-?\d+(\.\d+)?$/.test(numericSearch)) {
    clauses.push(
      ...safeColumns
        .filter((column) => column.type === "number")
        .map((column) => `${column.key}.eq.${numericSearch}`),
    );
  }

  if (clauses.length === 0) {
    return queryBuilder;
  }

  const clause = clauses
    .join(",");

  return queryBuilder.or(clause);
}

function applyFilters(
  queryBuilder: any,
  definition: ReportDefinition,
  params: ReportQueryParams,
) {
  for (const filter of definition.filters) {
    const rawValue = params[filter.key];
    validateArrayQuery(rawValue, filter.key);

    const value = normalizeText(getQueryString(rawValue));
    if (!value) {
      continue;
    }

    if (filter.key === "date_from" || filter.key === "date_to") {
      const dateValue = toDateFilterValue(value, filter.key === "date_to");

      if (filter.operator === "gte") {
        queryBuilder = queryBuilder.gte(filter.field, dateValue);
      }

      if (filter.operator === "lte") {
        queryBuilder = queryBuilder.lte(filter.field, dateValue);
      }

      continue;
    }

    if (filter.operator === "eq") {
      queryBuilder = queryBuilder.eq(filter.field, value);
    }

    if (filter.operator === "gte") {
      queryBuilder = queryBuilder.gte(filter.field, value);
    }

    if (filter.operator === "lte") {
      queryBuilder = queryBuilder.lte(filter.field, value);
    }
  }

  return queryBuilder;
}

function shouldRetryLegacyView(
  errorMessage: string | undefined,
  reportKey: string,
) {
  if (!errorMessage) {
    return false;
  }

  const relationMissingPattern =
    /(relation .* does not exist|could not find the table|table .* does not exist|view .* does not exist)/i;
  if (relationMissingPattern.test(errorMessage)) return true;

  // The migrated v_ views must never silently fall back to a legacy vw_ view
  // because of a permission error; that could return rows without exact IDs.
  if (
    ["combined", "dispatch-monitoring", "dispatch", "trip-booking"].includes(
      reportKey,
    )
  ) {
    return false;
  }

  // Keep the pre-existing fallback behavior for reports outside this change.
  return /(permission denied for (table|view|relation)|42501)/i.test(
    errorMessage,
  );
}

function resolveViewNames(definition: ReportDefinition) {
  if (definition.views?.length) {
    return definition.views;
  }

  if (definition.view) {
    return [definition.view];
  }

  return [];
}

async function attachOperationalRecordIds(rows: Record<string, unknown>[]) {
  // Copy internal IDs with underscore prefix to standard field names for frontend compatibility
  for (const row of rows) {
    const aliases: Record<string, string> = {
      trip_id: "_trip_id",
      trip_stop_id: "_trip_stop_id",
      trip_line_item_id: "_trip_line_item_id",
      product_id: "_product_id",
      trip_type_id: "_trip_type_id",
      warehouse_id: "_warehouse_id",
      customer_id: "_customer_id",
      store_id: "_store_id",
      truck_id: "_truck_id",
      driver_id: "_driver_id",
      trucking_company_id: "_trucking_company_id",
      assignment_id: "_assignment_id",
      truck_allocated_by: "_truck_allocated_by",
      tms_done_by: "_tms_done_by",
      billing_id: "_billing_id",
      store_call_id: "_store_call_id",
    };
    for (const [publicName, internalName] of Object.entries(aliases)) {
      if (row[publicName] == null && row[internalName] != null) {
        row[publicName] = row[internalName];
      }
    }
  }

  const tripIds = [...new Set(rows.map((row) => row.trip_id).filter((id): id is string => typeof id === "string"))];
  if (tripIds.length) {
    const { data: trips, error } = await supabaseAdmin.from("trips")
      .select("id, dispatch_number, transaction_number").in("id", tripIds);
    if (error) throw new ApiError("Unable to load saved trip references", 500, "TRIP_REFERENCE_QUERY_FAILED");
    const tripById = new Map((trips ?? []).map((trip) => [String(trip.id), trip]));
    for (const row of rows) {
      const trip = tripById.get(String(row.trip_id));
      if (!trip) continue;
      row.dispatch_number ??= trip.dispatch_number;
      row.transaction_number ??= trip.transaction_number;
    }
  }

  // Enrich product_id for rows that have trip_line_item_id but not product_id
  const lineItemIds = [
    ...new Set(
      rows
        .map((row) => row.trip_line_item_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (lineItemIds.length > 0) {
    const { data: lineItems, error } = await supabaseAdmin
      .from("trip_line_items")
      .select("id, product_id")
      .in("id", lineItemIds);
    if (error) {
      console.error("Report line-item relationship enrichment failed:", error);
    } else {
      const productsByLineItem = new Map(
        (lineItems ?? []).map((item) => [String(item.id), item.product_id]),
      );
      for (const row of rows) {
        if (typeof row.trip_line_item_id === "string" && !row.product_id) {
          row.product_id =
            productsByLineItem.get(row.trip_line_item_id) ?? null;
        }
      }
    }
  }

  const productIds = [
    ...new Set(
      rows
        .map((row) => row.product_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (productIds.length > 0) {
    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("id, photo_path")
      .in("id", productIds);
    if (error) {
      console.error("Report product photo enrichment failed:", error);
    } else {
      const photoUrls = await Promise.all(
        (products ?? []).map(async (product) => {
          if (!product.photo_path) return [String(product.id), null] as const;
          const { data, error: photoError } = await supabaseAdmin.storage
            .from("product-photos")
            .createSignedUrl(product.photo_path, 60 * 60);
          if (photoError || !data?.signedUrl) {
            console.error("Report product photo URL failed:", {
              productId: product.id,
              error: photoError,
            });
            return [String(product.id), null] as const;
          }
          return [String(product.id), data.signedUrl] as const;
        }),
      );
      const photoByProductId = new Map(photoUrls);
      for (const row of rows) {
        if (typeof row.product_id === "string") {
          row.product_photo_url = photoByProductId.get(row.product_id) ?? null;
        }
      }
    }
  }

  // Enrich assigned_to_name for Store Calling
  const storeCallIds = [
    ...new Set(
      rows
        .map((row) => row.store_call_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (storeCallIds.length > 0) {
    const { data: storeCalls, error } = await supabaseAdmin
      .from("store_calls")
      .select("id, assigned_to, contact_id, trip_id, trip_stop_id")
      .in("id", storeCallIds);
    if (error) {
      console.error("Store-call relationship enrichment failed:", error);
    } else {
      const callById = new Map(
        (storeCalls ?? []).map((call) => [String(call.id), call]),
      );
      const assignedIds = [
        ...new Set(
          (storeCalls ?? [])
            .map((call) => call.assigned_to)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const { data: profiles } = assignedIds.length
        ? await supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", assignedIds)
        : { data: [] };
      const profileNames = new Map(
        (profiles ?? []).map((profile) => [
          String(profile.id),
          [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(" ")
            .trim(),
        ]),
      );

      const stopIds = [
        ...new Set(
          (storeCalls ?? [])
            .map((call) => call.trip_stop_id)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const { data: stops, error: stopsError } = stopIds.length
        ? await supabaseAdmin
            .from("trip_stops")
            .select("id, trip_id, customer_id, store_id")
            .in("id", stopIds)
        : { data: [], error: null };
      if (stopsError) {
        console.error("Store-call stop identity enrichment failed:", stopsError);
      }
      const stopsById = new Map(
        (stops ?? []).map((stop) => [String(stop.id), stop]),
      );

      const tripIds = [
        ...new Set(
          (storeCalls ?? [])
            .map((call) => call.trip_id)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const { data: assignments, error: assignmentsError } = tripIds.length
        ? await supabaseAdmin
            .from("trip_truck_assignments")
            .select("id, trip_id, truck_id, driver_id, trucking_company_id")
            .in("trip_id", tripIds)
            .eq("assignment_type", "PRIMARY")
        : { data: [], error: null };
      if (assignmentsError) {
        console.error(
          "Store-call primary assignment identity enrichment failed:",
          assignmentsError,
        );
      }
      const assignmentsByTrip = new Map<string, typeof assignments>();
      for (const assignment of assignments ?? []) {
        if (typeof assignment.trip_id !== "string") continue;
        const current = assignmentsByTrip.get(assignment.trip_id) ?? [];
        current.push(assignment);
        assignmentsByTrip.set(assignment.trip_id, current);
      }

      for (const row of rows) {
        if (typeof row.store_call_id !== "string") continue;
        const call = callById.get(row.store_call_id);
        if (!call) continue;
        const callTripId =
          typeof call.trip_id === "string" ? call.trip_id : undefined;
        const callStopId =
          typeof call.trip_stop_id === "string" ? call.trip_stop_id : undefined;
        const stop = callStopId ? stopsById.get(callStopId) : undefined;
        const stopTripId =
          typeof stop?.trip_id === "string" ? stop.trip_id : undefined;
        if (callTripId && stopTripId && callTripId !== stopTripId) {
          console.error("Store-call stop does not belong to its trip", {
            storeCallId: row.store_call_id,
            tripId: callTripId,
            stopId: callStopId,
          });
          continue;
        }
        const exactTripId = callTripId ?? stopTripId;
        const viewTripId =
          typeof row._trip_id === "string"
            ? row._trip_id
            : typeof row.trip_id === "string"
              ? row.trip_id
              : undefined;
        const viewStopId =
          typeof row._trip_stop_id === "string"
            ? row._trip_stop_id
            : typeof row.trip_stop_id === "string"
              ? row.trip_stop_id
              : undefined;
        if (
          (exactTripId && viewTripId && exactTripId !== viewTripId) ||
          (callStopId && viewStopId && callStopId !== viewStopId)
        ) {
          console.error("Store-call view identity conflicts with source record", {
            storeCallId: row.store_call_id,
            viewTripId,
            sourceTripId: exactTripId,
            viewStopId,
            sourceStopId: callStopId,
          });
          row.assigned_to_id = call.assigned_to;
          row.assigned_to_name =
            typeof call.assigned_to === "string"
              ? (profileNames.get(call.assigned_to) ?? "")
              : "";
          row.contact_id = call.contact_id;
          continue;
        }
        if (exactTripId) {
          row._trip_id ??= exactTripId;
          row.trip_id ??= exactTripId;
        }
        if (callStopId) {
          row._trip_stop_id ??= callStopId;
          row.trip_stop_id ??= callStopId;
        }
        if (typeof stop?.customer_id === "string") {
          row._customer_id ??= stop.customer_id;
          row.customer_id ??= stop.customer_id;
        }
        if (typeof stop?.store_id === "string") {
          row._store_id ??= stop.store_id;
          row.store_id ??= stop.store_id;
        }
        if (exactTripId && !assignmentsError) {
          const primaryAssignments = assignmentsByTrip.get(exactTripId) ?? [];
          // A corrupted trip with multiple PRIMARY rows is ambiguous; leave it read-only.
          if (primaryAssignments.length === 1) {
            const assignment = primaryAssignments[0];
            row._assignment_id ??= assignment.id;
            row.assignment_id ??= assignment.id;
            row._truck_id ??= assignment.truck_id;
            row.truck_id ??= assignment.truck_id;
            row._driver_id ??= assignment.driver_id;
            row.driver_id ??= assignment.driver_id;
            row._trucking_company_id ??= assignment.trucking_company_id;
            row.trucking_company_id ??= assignment.trucking_company_id;
          }
        }
        row.assigned_to_id = call.assigned_to;
        row.assigned_to_name =
          typeof call.assigned_to === "string"
            ? (profileNames.get(call.assigned_to) ?? "")
            : "";
        row.contact_id = call.contact_id;
      }

      // Store-call rows can gain exact IDs above; expose the same canonical aliases
      // used by the cell editor without replacing any IDs already returned by a view.
      for (const row of rows) {
        const aliases: Record<string, string> = {
          trip_id: "_trip_id",
          trip_stop_id: "_trip_stop_id",
          customer_id: "_customer_id",
          store_id: "_store_id",
          assignment_id: "_assignment_id",
          truck_id: "_truck_id",
          driver_id: "_driver_id",
          trucking_company_id: "_trucking_company_id",
        };
        for (const [canonical, internal] of Object.entries(aliases)) {
          if (row[canonical] == null && row[internal] != null) {
            row[canonical] = row[internal];
          }
        }
      }
    }
  }

  return rows;
}

function getReportDefinition(reportKey: string): ReportDefinition {
  const definition = REPORT_DEFINITIONS[reportKey];
  if (!definition) throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  return definition;
}

export async function getReportData(
  reportKey: string,
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  const definition = getReportDefinition(key);
  const viewNames = resolveViewNames(definition);
  if (!viewNames.length) throw new ApiError("Report view configuration is missing", 500, "REPORT_CONFIG_ERROR");

  const rawPage = Number(getQueryString(query.page) ?? 1);
  const rawLimit = Number(getQueryString(query.limit) ?? 50);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 50;
  const { from } = normalizePagination({ page: String(page), limit: String(limit) }, 500);
  const search = normalizeText(getQueryString(query.search));
  const requestedSort = normalizeText(getQueryString(query.sort_by));
  const sortBy = requestedSort && definition.sortableColumns.includes(requestedSort) ? requestedSort : definition.defaultSort;
  const sortOrder = normalizeSortOrder(getQueryString(query.sort_order), definition.defaultSortOrder);

  let matchingTripIds: string[] = [];
  if (search && ["combined", "dispatch-monitoring", "dispatch", "trip-booking"].includes(key)) {
    const { data, error } = await supabaseAdmin.from("trips").select("id").eq("dispatch_number", search);
    if (error) throw new ApiError("Unable to search saved trip references", 500, "TRIP_REFERENCE_QUERY_FAILED");
    matchingTripIds = (data ?? []).map((trip) => String(trip.id));
  }

  let lastError: Error | null = null;
  for (const viewName of viewNames) {
    let builder = supabaseAdmin.from(viewName).select("*", { count: "exact" });
    builder = applyFilters(builder, definition, query);
    const reportTableKeys = [
      "combined",
      "dispatch-monitoring",
      "dispatch",
      "trip-booking",
      "store-calling",
    ];
    const searchColumns = reportTableKeys.includes(key)
      ? definition.columns.filter(
          // Store Calling's assigned_to projection is a profile UUID; its
          // display name is enriched after the query and is searched client-side.
          (column) => !(key === "store-calling" && column.key === "assigned_to"),
        )
      : definition.searchableColumns.map((column) => ({
          key: column,
          title: column,
          type: "text" as const,
        }));
    builder = applySearch(builder, search, searchColumns, matchingTripIds);
    builder = builder.order(sortBy, { ascending: sortOrder === "asc" });
    builder = builder.range(from, from + limit - 1);
    const { data, error, count } = await builder;
    if (!error) {
      const rows = (data ?? []) as Record<string, unknown>[];
      const enriched = ["combined", "dispatch", "dispatch-monitoring", "trip-booking", "store-calling"].includes(key)
        ? await attachOperationalRecordIds(rows)
        : rows;
      return {
        rows: enriched,
        pagination: buildPaginationMeta(page, limit, count ?? rows.length),
      };
    }
    lastError = new Error(error.message ?? "Report query failed");
    if (!shouldRetryLegacyView(lastError.message, key)) break;
  }
  console.error("Report query failed:", { reportKey: key, viewNames, error: lastError?.message, query });
  throw new ApiError("Unable to fetch report data", 500, "REPORT_QUERY_FAILED");
}

export const getCombinedReport = (query: ReportQueryParams = {}) => getReportData("combined", query);
export const getDispatchReport = (query: ReportQueryParams = {}) => getReportData("dispatch", query);
export const getDispatchMonitoringReport = (query: ReportQueryParams = {}) => getReportData("dispatch-monitoring", query);
export const getTripBookingReport = (query: ReportQueryParams = {}) => getReportData("trip-booking", query);
export const getStoreCallingReport = (query: ReportQueryParams = {}) => getReportData("store-calling", query);
export const getPodStatusReport = (query: ReportQueryParams = {}) => getReportData("pod-status", query);
export const getPodDriveFilesReport = (query: ReportQueryParams = {}) => getReportData("pod-drive-files", query);
export const getTripExceptionsReport = (query: ReportQueryParams = {}) => getReportData("trip-exceptions", query);

export async function getReportColumns(reportKey: string) {
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  return { report: key, columns: REPORT_DEFINITIONS[key].columns };
}

export async function getAvailableReportKeys() { return REPORT_KEYS; }

export function getReportRouteKey(reportKey: string) {
  const routeKey = reportKey.trim();
  if (!(routeKey in REPORT_ROUTE_MAP)) throw new Error("Unsupported report key");
  return REPORT_ROUTE_MAP[routeKey as keyof typeof REPORT_ROUTE_MAP];
}

export function validateReportKey(reportKey: string) {
  if (!reportKey || !REPORT_KEYS.includes(reportKey)) throw new Error("Invalid report key");
  return reportKey;
}

export function validateReportQuery(query: Record<string, unknown>) {
  const definition = REPORT_DEFINITIONS[query.reportKey as string];
  if (typeof query.sort_by === "string" && query.sort_by && !definition?.sortableColumns.includes(query.sort_by)) throw new Error("Invalid sort_by parameter");
  if (typeof query.sort_order === "string" && query.sort_order && !["asc", "desc"].includes(query.sort_order)) throw new Error("Invalid sort_order parameter");
  if (typeof query.page === "string" && (Number(query.page) <= 0 || !Number.isInteger(Number(query.page)))) throw new Error("page must be a positive integer");
  if (typeof query.limit === "string" && (Number(query.limit) <= 0 || Number(query.limit) > 500 || !Number.isInteger(Number(query.limit)))) throw new Error("limit must be a positive integer up to 500");
  return true;
}
