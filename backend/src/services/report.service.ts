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
import { normalizeSortOrder, normalizeText } from "../utils/validation.js";

const REPORT_ROUTE_MAP = {
  combined: "v_tms_combined",
  "dispatch-monitoring": "vw_dispatch_monitoring",
  dispatch: "vw_dispatch_report",
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
  searchableColumns: string[],
) {
  if (!searchValue || searchableColumns.length === 0) {
    return queryBuilder;
  }

  const clause = searchableColumns
    .map((column) => `${column}.ilike.%${searchValue}%`)
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

function shouldRetryLegacyView(errorMessage: string | undefined) {
  if (!errorMessage) {
    return false;
  }

  const relationMissingPattern =
    /(relation .* does not exist|could not find the table|table .* does not exist|view .* does not exist)/i;
  const permissionPattern =
    /(permission denied for (table|view|relation)|42501)/i;

  return (
    relationMissingPattern.test(errorMessage) ||
    permissionPattern.test(errorMessage)
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

function normalizedDate(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

async function attachOperationalRecordIds(rows: Record<string, unknown>[]) {
  const rowsMissingTripId = rows.filter(
    (row) => typeof row.trip_id !== "string" || !row.trip_id,
  );
  const dispatchNumbers = [
    ...new Set(
      rowsMissingTripId
        .map((row) => row.dispatch_number)
        .filter(
          (value): value is string => typeof value === "string" && !!value,
        ),
    ),
  ];

  if (dispatchNumbers.length > 0) {
    const { data: trips, error } = await supabaseAdmin
      .from("trips")
      .select(
        "id, dispatch_number, trip_number, transaction_number, loading_date",
      )
      .in("dispatch_number", dispatchNumbers);

    if (error) {
      console.error("Report trip ID enrichment failed:", error);
    } else {
      for (const row of rowsMissingTripId) {
        const candidates = (trips ?? []).filter((trip) => {
          if (trip.dispatch_number !== row.dispatch_number) return false;
          for (const field of ["trip_number", "transaction_number"] as const) {
            const rowValue = row[field];
            if (
              rowValue !== null &&
              rowValue !== undefined &&
              rowValue !== ""
            ) {
              if (trip[field] !== rowValue) return false;
            }
          }
          if (row.loading_date && trip.loading_date) {
            return (
              normalizedDate(row.loading_date) ===
              normalizedDate(trip.loading_date)
            );
          }
          return true;
        });

        if (candidates.length === 1) {
          row.trip_id = candidates[0].id;
        }
      }
    }
  }

  const tripIds = [
    ...new Set(
      rows
        .map((row) => row.trip_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];

  const [tripResult, assignmentResult, stopResult] = await Promise.all([
    tripIds.length
      ? supabaseAdmin
          .from("trips")
          .select("id, trip_type_id, warehouse_id")
          .in("id", tripIds)
      : Promise.resolve({ data: [], error: null }),
    tripIds.length
      ? supabaseAdmin
          .from("trip_truck_assignments")
          .select("id, trip_id, truck_id, driver_id, trucking_company_id")
          .in("trip_id", tripIds)
          .is("unassigned_at", null)
      : Promise.resolve({ data: [], error: null }),
    tripIds.length
      ? supabaseAdmin
          .from("trip_stops")
          .select("id, trip_id, stop_sequence, customer_id, store_id")
          .in("trip_id", tripIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tripResult.error) {
    console.error(
      "Report trip relationship enrichment failed:",
      tripResult.error,
    );
  }
  if (assignmentResult.error) {
    console.error(
      "Report assignment enrichment failed:",
      assignmentResult.error,
    );
  }
  if (stopResult.error) {
    console.error("Report stop ID enrichment failed:", stopResult.error);
  }

  const tripMap = new Map(
    (tripResult.data ?? []).map((trip) => [String(trip.id), trip]),
  );
  for (const row of rows) {
    const tripId = typeof row.trip_id === "string" ? row.trip_id : "";
    const trip = tripMap.get(tripId);
    if (!trip) continue;
    row.trip_type_id = trip.trip_type_id;
    row.warehouse_id = trip.warehouse_id;
  }

  const assignments = assignmentResult.data ?? [];
  const truckIds = [
    ...new Set(assignments.map((item) => item.truck_id).filter(Boolean)),
  ];
  const driverIds = [
    ...new Set(assignments.map((item) => item.driver_id).filter(Boolean)),
  ];
  const [truckResult, driverResult] = await Promise.all([
    truckIds.length
      ? supabaseAdmin
          .from("trucks")
          .select("id, plate_number")
          .in("id", truckIds)
      : Promise.resolve({ data: [], error: null }),
    driverIds.length
      ? supabaseAdmin
          .from("drivers")
          .select("id, first_name, last_name")
          .in("id", driverIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const truckById = new Map(
    (truckResult.data ?? []).map((truck) => [String(truck.id), truck]),
  );
  const driverById = new Map(
    (driverResult.data ?? []).map((driver) => [String(driver.id), driver]),
  );
  const normalizeName = (value: unknown) =>
    typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

  for (const row of rows) {
    const tripId = typeof row.trip_id === "string" ? row.trip_id : "";
    if (!tripId) continue;
    let candidates = assignments.filter(
      (assignment) => assignment.trip_id === tripId,
    );
    const plate = normalizeName(row.plate_number);
    if (plate) {
      const matching = candidates.filter(
        (assignment) =>
          normalizeName(
            truckById.get(String(assignment.truck_id ?? ""))?.plate_number,
          ) === plate,
      );
      if (matching.length > 0) candidates = matching;
    }
    const driverName = normalizeName(row.driver_name);
    if (driverName) {
      const matching = candidates.filter((assignment) => {
        const driver = driverById.get(String(assignment.driver_id ?? ""));
        return (
          normalizeName(
            [driver?.first_name, driver?.last_name].filter(Boolean).join(" "),
          ) === driverName
        );
      });
      if (matching.length > 0) candidates = matching;
    }
    if (candidates.length === 1) {
      const assignment = candidates[0];
      row.assignment_id = assignment.id;
      row.driver_id = assignment.driver_id;
      row.truck_id = assignment.truck_id;
      row.trucking_company_id = assignment.trucking_company_id;
    }
  }

  const stops = stopResult.data ?? [];
  const customerIds = [
    ...new Set(stops.map((stop) => stop.customer_id).filter(Boolean)),
  ];
  const storeIds = [
    ...new Set(stops.map((stop) => stop.store_id).filter(Boolean)),
  ];
  const [customersResult, storesResult] = await Promise.all([
    customerIds.length
      ? supabaseAdmin.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      ? supabaseAdmin
          .from("customer_stores")
          .select("id, name")
          .in("id", storeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const customerNames = new Map(
    (customersResult.data ?? []).map((item) => [
      String(item.id),
      String(item.name ?? ""),
    ]),
  );
  const storeNames = new Map(
    (storesResult.data ?? []).map((item) => [
      String(item.id),
      String(item.name ?? ""),
    ]),
  );

  for (const row of rows) {
    const tripId = typeof row.trip_id === "string" ? row.trip_id : "";
    if (!tripId) continue;
    let candidates = stops.filter((stop) => stop.trip_id === tripId);
    if (typeof row.trip_stop_id === "string") {
      candidates = candidates.filter((stop) => stop.id === row.trip_stop_id);
    } else if (row.stop_sequence !== null && row.stop_sequence !== undefined) {
      candidates = candidates.filter(
        (stop) => String(stop.stop_sequence) === String(row.stop_sequence),
      );
    } else {
      const destinations = [row.ship_to, row.store_name, row.customer_name]
        .map(normalizeName)
        .filter(Boolean);
      if (destinations.length > 0) {
        candidates = candidates.filter((stop) =>
          [
            storeNames.get(String(stop.store_id ?? "")),
            customerNames.get(String(stop.customer_id ?? "")),
          ].some((name) => destinations.includes(normalizeName(name))),
        );
      }
    }
    if (candidates.length === 1) {
      const stop = candidates[0];
      row.trip_stop_id = stop.id;
      row.customer_id = stop.customer_id;
      row.store_id = stop.store_id;
    }
  }

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
        if (typeof row.trip_line_item_id === "string") {
          row.product_id =
            productsByLineItem.get(row.trip_line_item_id) ?? null;
        }
      }
    }
  }

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
      .select("id, assigned_to, contact_id")
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
      for (const row of rows) {
        if (typeof row.store_call_id !== "string") continue;
        const call = callById.get(row.store_call_id);
        if (!call) continue;
        row.assigned_to_id = call.assigned_to;
        row.assigned_to_name =
          typeof call.assigned_to === "string"
            ? (profileNames.get(call.assigned_to) ?? "")
            : "";
        row.contact_id = call.contact_id;
      }
    }
  }

  return rows;
}

function getReportDefinition(reportKey: string) {
  const definition = REPORT_DEFINITIONS[reportKey];
  if (!definition) {
    throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  }

  return definition;
}

export async function getReportData(
  reportKey: string,
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) {
    throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  }

  const definition = getReportDefinition(key);
  const viewNames = resolveViewNames(definition);
  if (viewNames.length === 0) {
    throw new ApiError(
      "Report view configuration is missing",
      500,
      "REPORT_CONFIG_ERROR",
    );
  }

  const rawPage = getQueryString(query.page) ?? "1";
  const rawLimit = getQueryString(query.limit) ?? "50";
  const pageValue = Number(rawPage);
  const limitValue = Number(rawLimit);

  const page =
    Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1;
  const limit =
    Number.isFinite(limitValue) && limitValue > 0
      ? Math.min(Math.floor(limitValue), 500)
      : 50;
  const normalizedPage = page === 0 ? 1 : page;
  const normalizedLimit = Number.isNaN(limit) || limit <= 0 ? 50 : limit;

  const { from } = normalizePagination(
    {
      page: String(normalizedPage),
      limit: String(normalizedLimit),
    },
    500,
  );

  const searchValue = normalizeText(getQueryString(query.search));
  const sortByValue = normalizeText(getQueryString(query.sort_by));
  const sortBy =
    sortByValue && definition.sortableColumns.includes(sortByValue)
      ? sortByValue
      : definition.defaultSort;
  const sortOrder = normalizeSortOrder(
    getQueryString(query.sort_order),
    definition.defaultSortOrder,
  );

  let lastError: Error | null = null;
  let data: Record<string, unknown>[] = [];
  let count: number | null = null;

  for (const viewName of viewNames) {
    let queryBuilder = supabaseAdmin
      .from(viewName)
      .select("*", { count: "exact" });

    queryBuilder = applyFilters(queryBuilder, definition, query);
    queryBuilder = applySearch(
      queryBuilder,
      searchValue,
      definition.searchableColumns,
    );
    queryBuilder = queryBuilder.order(sortBy, {
      ascending: sortOrder === "asc",
    });
    queryBuilder = queryBuilder.range(from, from + normalizedLimit - 1);

    const result = await queryBuilder;
    const { data: rows, error, count: totalCount } = result;

    if (!error) {
      data = (rows ?? []) as Record<string, unknown>[];
      if (
        [
          "combined",
          "dispatch",
          "dispatch-monitoring",
          "trip-booking",
          "store-calling",
        ].includes(key)
      ) {
        data = await attachOperationalRecordIds(data);
      }
      count = totalCount ?? rows?.length ?? 0;
      return {
        rows: data,
        pagination: buildPaginationMeta(normalizedPage, normalizedLimit, count),
      };
    }

    const message = error.message ?? "";
    lastError = new Error(message);

    if (!shouldRetryLegacyView(message)) {
      break;
    }
  }

  if (lastError) {
    console.error("Report query failed:", {
      reportKey: key,
      viewNames,
      error: lastError.message,
      query,
    });
    throw new ApiError(
      "Unable to fetch report data",
      500,
      "REPORT_QUERY_FAILED",
    );
  }

  return {
    rows: data,
    pagination: buildPaginationMeta(
      normalizedPage,
      normalizedLimit,
      count ?? 0,
    ),
  };
}

export async function getCombinedReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("combined", query);
}

export async function getDispatchReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("dispatch", query);
}

export async function getDispatchMonitoringReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("dispatch-monitoring", query);
}

export async function getTripBookingReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("trip-booking", query);
}

export async function getStoreCallingReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("store-calling", query);
}

export async function getPodStatusReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("pod-status", query);
}

export async function getPodDriveFilesReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("pod-drive-files", query);
}

export async function getTripExceptionsReport(
  query: ReportQueryParams = {},
): Promise<ReportResponse> {
  return getReportData("trip-exceptions", query);
}

export async function getReportColumns(reportKey: string) {
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) {
    throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
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
      Number(query.limit) > 500 ||
      !Number.isInteger(Number(query.limit)));

  if (invalidLimit) {
    throw new Error("limit must be a positive integer up to 500");
  }

  return true;
}
