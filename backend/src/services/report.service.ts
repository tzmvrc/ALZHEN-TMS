import {readConfirmedOperationalState,attachConfirmedOperationalState} from './confirmed-operational-state.service.js';
import {signStoragePaths} from "./storage-links.service.js";
import {REPORT_PROJECTIONS} from "../config/report-projections.js";
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
import { getTripRoutes } from "./trip-route.service.js";
import { resolveLegacyPodCellValue } from "./transmittal-tracker.logic.js";
import { tripReferenceAvailable } from "./trip-reference.schema.js";
import { tripImportAvailable,tripAllocationReportAvailable } from "./trip-import.schema.js";
import { TRIP_SOURCE_COLUMNS, TRIP_CARGO_COLUMNS, SOURCE_LINE_COLUMNS, SOURCE_REPORTS, sourceOrderedColumns } from "../config/trip-source-columns.js";
import { MASTER_LIST_COLUMNS } from "../config/master-list-columns.js";
import { masterListAvailable } from "./master-list.service.js";
import { MASTER_LIST_READ_COLUMNS } from "../config/master-list-read-columns.js";
import { readTripIssuesForTripIds } from "./trip-issues.service.js";

const incidentLabel = (type: string) => type === "FOU_ALERT" ? "FOU Alert" : type.charAt(0) + type.slice(1).toLowerCase();
async function attachIncidentSummary(rows: Record<string, unknown>[]) {
  const ids = [...new Set(rows.map(row => String(row.trip_id ?? row._trip_id ?? "")).filter(isValidUuid))];
  const issues = await Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
    readTripIssuesForTripIds(ids.slice(index * 100, index * 100 + 100)))).then(groups => groups.flat()).catch(() => []);
  const byTrip = new Map<string, typeof issues>();
  for (const issue of issues) byTrip.set(issue.trip_id, [...(byTrip.get(issue.trip_id) ?? []), issue]);
  for (const row of rows) {
    const tripId = String(row.trip_id ?? row._trip_id ?? "");
    const stopId = String(row.trip_stop_id ?? row._trip_stop_id ?? "");
    const scoped = (byTrip.get(tripId) ?? []).filter(issue => !issue.trip_stop_id || !stopId || issue.trip_stop_id === stopId);
    if (scoped.length) {
      row.incident_report = [...new Set(scoped.map(issue => incidentLabel(issue.type)))].join(", ");
      row.incident_boxes = scoped.filter(issue => issue.number_of_boxes !== null).map(issue => `${incidentLabel(issue.type)}: ${issue.number_of_boxes}`).join(" · ");
      row.incident_details = `${scoped.length} ${scoped.length === 1 ? "report" : "reports"}`;
      continue;
    }
    // Imported legacy values have no physical incident record. Keep them visible
    // and available in detailed exports without claiming an editable report exists.
    const legacy = [row.backload_reason || row.backload_number_of_boxes != null ? "Backload" : "",
      row.offload_reason || row.offload_number_of_boxes != null ? "Offload" : "",
      row.incident_date || row.ir_status ? "Incident" : ""].filter(Boolean);
    row.incident_report = legacy.join(", ");
    row.incident_boxes = [row.backload_number_of_boxes != null ? `Backload: ${row.backload_number_of_boxes}` : "",
      row.offload_number_of_boxes != null ? `Offload: ${row.offload_number_of_boxes}` : ""].filter(Boolean).join(" · ");
    row.incident_details = legacy.length ? "Imported details" : "";
  }
}

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
  tripIdField = "trip_id",
  extraClauses: string[] = [],
) {
  const searchFilter = buildIlikeOrFilter(
    columns
      .filter((column) => !column.key.endsWith("_id") && column.key !== "so_approval_date" && column.type === "text")
      .map((column) => column.key),
    searchValue,
  );
  if (!searchValue) return queryBuilder;

  const safeColumns = columns.filter((column) => !column.key.endsWith("_id"));
  const clauses = [...(searchFilter ? [searchFilter] : []),...extraClauses];
  // Some deployed report views project blank references. An exact saved dispatch
  // can still be found through its authoritative trip record before pagination.
  const safeTripIds = matchingTripIds.filter(isValidUuid);
  if (safeTripIds.length) clauses.push(`${tripIdField}.in.(${safeTripIds.join(",")})`);
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
      const column = definition.columns.find(column => column.key === filter.key);
      // Text filters keep their exact-match semantics while ignoring capitalization.
      // The assigned_to relationship remains a UUID equality filter.
      if (column?.type === "text" && filter.key !== "assigned_to") {
        queryBuilder = queryBuilder.or(buildIlikeOrFilter([filter.field], value, "exact")!);
      } else {
        queryBuilder = queryBuilder.eq(filter.field, value);
      }
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

async function attachOperationalRecordIds(
  rows: Record<string, unknown>[],
  fallbackMissingDispatchNumber = false,
  suppliedTrips?: Record<string,unknown>[],
  includeDeleteVersions=false,
  includeProductPhotos=true,
) {
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
      incident_id: "_incident_id",
      backload_id: "_backload_id",
      offload_id: "_offload_id",
      store_call_id: "_store_call_id",
    };
    for (const [publicName, internalName] of Object.entries(aliases)) {
      if (row[publicName] == null && row[internalName] != null) {
        row[publicName] = row[internalName];
      }
    }
  }

  const tripIds = [...new Set(rows
    .filter((row) => {
      const hasTripId = typeof row.trip_id === "string";
      const hasNoStop = row.trip_stop_id == null && row._trip_stop_id == null;
      const hasNoDispatchNumber =
        typeof row.dispatch_number !== "string" || !row.dispatch_number.trim();
      return hasTripId && (hasNoStop || (fallbackMissingDispatchNumber && hasNoDispatchNumber));
    })
    .map((row) => row.trip_id).filter((id): id is string => typeof id === "string"))];
  if (tripIds.length) {
    const { data: trips, error } = suppliedTrips ? {data:suppliedTrips,error:null} : await supabaseAdmin.from("trips")
      .select("id, dispatch_number, transaction_number").in("id", tripIds);
    if (error) throw new ApiError("Unable to load saved trip references", 500, "TRIP_REFERENCE_QUERY_FAILED");
    const tripById = new Map((trips ?? []).map((trip) => [String(trip.id), trip]));
    for (const row of rows) {
      const trip = tripById.get(String(row.trip_id));
      if (
        fallbackMissingDispatchNumber &&
        (typeof row.dispatch_number !== "string" || !row.dispatch_number.trim()) &&
        typeof trip?.dispatch_number === "string" &&
        trip.dispatch_number.trim()
      ) {
        row.dispatch_number = trip.dispatch_number;
      }
      // Preserve stop-level edits; only the missing dispatch reference falls
      // back to the parent trip.
      if (row.trip_stop_id != null || row._trip_stop_id != null) continue;
      if (!trip) continue;
      if (typeof trip.dispatch_number === "string") {
        row.dispatch_number = trip.dispatch_number;
      }
      row.transaction_number ??= trip.transaction_number;
    }
  }

  // Enrich product_id for rows that have trip_line_item_id but not product_id
  const enrichCargo = async () => {
  const lineItemIds = [
    ...new Set(
      rows
        .filter(row=>!Object.hasOwn(row,"product_id")&&!Object.hasOwn(row,"_product_id"))
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
        delete row._search_text;
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
  if (includeProductPhotos && productIds.length > 0) {
    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("id, photo_path")
      .in("id", productIds);
    if (error) {
      console.error("Report product photo enrichment failed:", error);
    } else {
      const photoUrls=await signStoragePaths("product-photos",(products??[]).map(product=>product.photo_path),60*60);
      const photoByProductId=new Map((products??[]).map(product=>[String(product.id),photoUrls.get(product.photo_path)??null]));
      for (const row of rows) {
        if (typeof row.product_id === "string") {
          row.product_photo_url = photoByProductId.get(row.product_id) ?? null;
        }
      }
    }
  }

  };
  const enrichCalls = async () => {
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
      .select("id, assigned_to, contact_id, trip_id, trip_stop_id, collaboration_version")
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
            .is("unassigned_at", null)
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
        row._store_call_version = call.collaboration_version;
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
  };
  await Promise.all([enrichCargo(), enrichCalls()]);
  const stopIds=[...new Set(rows.filter(row=>!row.trip_line_item_id).map(row=>row.trip_stop_id).filter((id):id is string=>typeof id==="string"))];
  if(includeDeleteVersions&&stopIds.length){const result=await supabaseAdmin.from("trip_stops").select("id,collaboration_version").in("id",stopIds);if(!result.error){const versions=new Map((result.data??[]).map(row=>[row.id,row.collaboration_version]));for(const row of rows)if(typeof row.trip_stop_id==="string")row._stop_version=versions.get(row.trip_stop_id);}}


  return rows;
}

/** Loading milestones live on loading_reports, outside the flattened views.
 * Enrich only report pages whose operational rows make trip loading progress
 * useful; fetch distinct page trip IDs in bounded batches to avoid N+1 reads. */
async function attachLoadingMilestones(rows: Record<string, unknown>[]) {
  for (const row of rows) {
    row.loading_report_id = null;
    row.warehouse_arrival_at ??= null;
    row.loading_start_at ??= null;
    row.loading_finished_at ??= null;
  }
  const tripIds = [...new Set(rows
    .map((row) => row.trip_id ?? row._trip_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!tripIds.length) return rows;

  const reports: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < tripIds.length; offset += 100) {
    const batch = tripIds.slice(offset, offset + 100);
    const { data, error } = await supabaseAdmin
      .from("loading_reports")
      .select("id, trip_id, warehouse_arrival_at, loading_start_at, loading_finished_at")
      .in("trip_id", batch);
    if (error) {
      console.error("Report loading-milestone enrichment failed:", { code: error.code, message: error.message });
      return rows;
    }
    reports.push(...(data ?? []));
  }
  const byTrip = new Map(reports.map((report) => [String(report.trip_id), report]));
  for (const row of rows) {
    const tripId = row.trip_id ?? row._trip_id;
    if (typeof tripId !== "string") continue;
    const report = byTrip.get(tripId);
    if (!report) continue;
    row.loading_report_id = report.id ?? null;
    if(row.delivery_status_source === "CONFIRMED_MILESTONES") continue;
    row.warehouse_arrival_at = report.warehouse_arrival_at ?? null;
    row.loading_start_at = report.loading_start_at ?? null;
    row.loading_finished_at = report.loading_finished_at ?? null;
  }
  return rows;
}

/** Workbook-only Dispatch columns come from their actual related records.
 * Keep this enrichment page-scoped; it never changes the other report views. */
async function attachDispatchWorkbookFields(rows: Record<string, unknown>[]) {
  const ids = (field: string) => [...new Set(rows.map(row => row[field]).filter((value): value is string => typeof value === "string" && isValidUuid(value)))];
  const tripIds = ids("trip_id");
  if (!tripIds.length) return;
  const driverIds = ids("driver_id");
  const warehouseIds = ids("warehouse_id");
  const storeIds = ids("store_id");
  const [trips, drivers, warehouses, stores, billings] = await Promise.all([
    supabaseAdmin.from("trips").select("id,created_by,authorization_letter,page_no,trip_type_id").in("id", tripIds),
    driverIds.length ? supabaseAdmin.from("drivers").select("id,contact_number").in("id", driverIds) : Promise.resolve({data:[],error:null}),
    warehouseIds.length ? supabaseAdmin.from("warehouses").select("id,city").in("id", warehouseIds) : Promise.resolve({data:[],error:null}),
    storeIds.length ? supabaseAdmin.from("customer_stores").select("id,city").in("id", storeIds) : Promise.resolve({data:[],error:null}),
    supabaseAdmin.from("billings").select("id,trip_id,invoice_number").in("trip_id", tripIds),
  ]);
  const tripRows = trips.error ? [] : trips.data ?? [];
  const creatorIds = [...new Set(tripRows.map(trip => trip.created_by).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
  const typeIds = [...new Set(tripRows.map(trip => trip.trip_type_id).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
  const [creators, types] = await Promise.all([
    creatorIds.length ? supabaseAdmin.from("profiles").select("id,first_name,last_name").in("id", creatorIds) : Promise.resolve({data:[],error:null}),
    typeIds.length ? supabaseAdmin.from("trip_types").select("id,name").in("id", typeIds) : Promise.resolve({data:[],error:null}),
  ]);
  const stops: Array<{id:string;trip_id:string}> = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseAdmin.from("trip_stops").select("id,trip_id").in("trip_id", tripIds).order("id").range(offset, offset + 999);
    if (page.error) break;
    stops.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const byId = <T extends {id:string}>(records: T[] | null | undefined) => new Map((records ?? []).map(record => [record.id, record]));
  const tripById = byId(tripRows);
  const driverById = byId(drivers.error ? [] : drivers.data);
  const warehouseById = byId(warehouses.error ? [] : warehouses.data);
  const storeById = byId(stores.error ? [] : stores.data);
  const creatorById = byId(creators.error ? [] : creators.data);
  const typeById = byId(types.error ? [] : types.data);
  const billingByTrip = new Map<string, typeof billings.data>();
  if (!billings.error) for (const billing of billings.data ?? []) billingByTrip.set(billing.trip_id, [...(billingByTrip.get(billing.trip_id) ?? []), billing]);
  const dropsByTrip = new Map<string, number>();
  for (const stop of stops) dropsByTrip.set(stop.trip_id, (dropsByTrip.get(stop.trip_id) ?? 0) + 1);
  for (const row of rows) {
    const tripId = String(row.trip_id ?? "");
    const trip = tripById.get(tripId);
    const creator = creatorById.get(String(trip?.created_by ?? ""));
    const cityFrom = warehouseById.get(String(row.warehouse_id ?? ""))?.city || null;
    const cityTo = storeById.get(String(row.store_id ?? ""))?.city || null;
    const relatedBillings = billingByTrip.get(tripId) ?? [];
    row.added_by_name = creator ? [creator.first_name, creator.last_name].filter(Boolean).join(" ") : null;
    row.trip_type = typeById.get(String(trip?.trip_type_id ?? row.trip_type_id ?? ""))?.name ?? null;
    row.contact_number = driverById.get(String(row.driver_id ?? ""))?.contact_number ?? null;
    row.authorization_letter = trip?.authorization_letter ?? null;
    row.page_no = trip?.page_no ?? null;
    row.number_of_drops = dropsByTrip.get(tripId) ?? 0;
    row.ship_from_city = cityFrom;
    row.ship_to_city = cityTo;
    row.from_to = cityFrom && cityTo ? `${cityFrom} - ${cityTo}` : null;
    // The workbook looks this rate up in another file. No saved rate table or
    // equivalent formula exists here; the manual rate is not a substitute.
    row.subcon_rate_automated = null;
    row.billing = null;
    row.transaction_number_repeat = row.transaction_number ?? null;
    row.invoice_number = relatedBillings.length === 1 ? relatedBillings[0].invoice_number : null;
    row.billing_id = relatedBillings.length === 1 ? relatedBillings[0].id : null;
  }
}

function getReportDefinition(reportKey: string): ReportDefinition {
  const definition = REPORT_DEFINITIONS[reportKey];
  if (!definition) throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  return definition;
}

async function attachSourceDecimals(rows: Record<string, unknown>[]) {
  if(rows.every(row=>Object.hasOwn(row,"_source_quantity_text"))){for(const row of rows)for(const field of ["quantity","cbm","unit_cbm","stock_quantity"]){row[field]=row[`_source_${field}_text`];delete row[`_source_${field}_text`];}return;}

  const ids = [...new Set(rows.map(row => row.trip_line_item_id).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
  for (let offset = 0; offset < ids.length; offset += 100) {
    // Cast at the database boundary, before JSON numeric values become JavaScript doubles.
    const { data, error } = await supabaseAdmin.from("trip_line_items")
      .select("id, quantity::text, cbm::text, unit_cbm::text, stock_quantity::text")
      .in("id", ids.slice(offset, offset + 100));
    if (error) throw new ApiError("Unable to load source decimal precision.", 503, "SOURCE_DECIMAL_QUERY_FAILED");
    const values = new Map((data ?? []).map(item => [String(item.id), item]));
    for (const row of rows) {
      const item = values.get(String(row.trip_line_item_id));
      if (item) for (const field of ["quantity", "cbm", "unit_cbm", "stock_quantity"] as const) row[field] = item[field];
    }
  }
  const allocationIds=[...new Set(rows.map(row=>row._cargo_allocation_id).filter((id):id is string=>typeof id==="string"&&isValidUuid(id)))];
  for(let offset=0;offset<allocationIds.length;offset+=100){
    const result=await supabaseAdmin.from("trip_cargo_allocations").select("id,quantity::text,allocated_cbm::text").in("id",allocationIds.slice(offset,offset+100));
    if(result.error)throw new ApiError("Unable to load exact truck cargo values.",503,"ALLOCATION_DECIMAL_QUERY_FAILED");
    const allocations=new Map((result.data??[]).map(row=>[String(row.id),row]));
    for(const row of rows){const allocation=allocations.get(String(row._cargo_allocation_id));if(allocation){row.line_allocated_quantity=allocation.quantity;row.line_allocated_cbm=allocation.allocated_cbm;}}
  }
}
async function attachLegacyStopData(rows: Record<string, unknown>[], trips?: Record<string, unknown>[]) {
  const departures = new Map((trips ?? []).map(trip => [String(trip.id), trip.departure_from_warehouse_at]));
  for (const row of rows) row.warehouse_departure_time = departures.get(String(row.trip_id)) ?? null;
  const ids = [...new Set(rows.map(row => row.trip_stop_id).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await supabaseAdmin.from("trip_stops").select("id, arrival_time, start_unloading_time, finish_unloading_time, departure_time, dr_number, quantity, total_cbm").in("id", ids.slice(offset, offset + 100));
    if (result.error) throw new ApiError("Unable to load delivery execution fields.", 503);
    const stops = new Map((result.data ?? []).map(stop => [String(stop.id), stop]));
    for (const row of rows) {
      const stop = stops.get(String(row.trip_stop_id)); if (!stop) continue;
      for (const key of ["arrival_time", "start_unloading_time", "finish_unloading_time", "departure_time"] as const) row[key] = stop[key];
      row.transaction_dr_number = stop.dr_number; row.transaction_quantity = stop.quantity; row.transaction_total_cbm = stop.total_cbm;
    }
  }
}

async function attachGeneratedTripNumbers(rows: Record<string, unknown>[], suppliedTrips?: Record<string,unknown>[]) {
  const ids = [...new Set(rows.map(row => row.trip_id ?? row._trip_id).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
  if (!ids.length) return;
  const { data, error } = suppliedTrips ? {data:suppliedTrips,error:null} : await supabaseAdmin.from("trips").select("id, trip_reference").in("id", ids);
  if(error&&["42703","PGRST204"].includes(error.code)&&/trip_reference/i.test(error.message))return;
  if (error) throw new ApiError("Unable to load generated trip numbers", 500, "TRIP_REFERENCE_QUERY_FAILED");
  const references = new Map((data ?? []).map(trip => [String(trip.id), trip.trip_reference]));
  for (const row of rows) {
    const reference = references.get(String(row.trip_id ?? row._trip_id));
    if (typeof reference !== "string" || !reference.trim()) continue;
    row.trip_reference = reference;
    // The generated reference is separate from Trip no., which is numbered
    // within the dispatch and must remain visible as 1, 2, and so on.
  }
}

/** Resolve progress from every trip linked to each dispatch on this page, not
 * merely from the product lines that happened to land in the current window. */
async function attachCardMetadata(rows: Record<string, unknown>[]) {
  const tripIds = [...new Set(rows.map(row => row.trip_id ?? row._trip_id).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
  const dispatchNumbers = [...new Set(rows.map(row => row.dispatch_number).filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map(value => value.trim()))];
  let driverIds = [...new Set(rows.map(row => row.driver_id ?? row._driver_id).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
  const stopCounts = new Map<string, {total:number;completed:number}>();
  const deliveryDateByTrip = new Map<string,string>();
  const tripsByDispatch = new Map<string, Set<string>>();
  const tripById = new Map<string, {dispatch_number:string|null;estimated_delivery_date:string|null}>();
  let tripsAvailable = true;
  if (dispatchNumbers.length) for (let index=0; index<dispatchNumbers.length; index+=100) {
    const batch=dispatchNumbers.slice(index,index+100);
    for (let offset=0;;offset+=1000) {
      const {data,error}=await supabaseAdmin.from("trips").select("id,dispatch_number,estimated_delivery_date").in("dispatch_number",batch).order("id").range(offset,offset+999);
      if(error){console.warn("Card dispatch progress unavailable",{code:error.code});tripsAvailable=false;break;}
      for(const trip of data??[]){
        const id=String(trip.id),number=String(trip.dispatch_number??"").trim();
        tripById.set(id,{dispatch_number:number||null,estimated_delivery_date:trip.estimated_delivery_date??null});
        if(number){const linked=tripsByDispatch.get(number)??new Set<string>();linked.add(id);tripsByDispatch.set(number,linked);}
      }
      if((data?.length??0)<1000)break;
    }
    if(!tripsAvailable)break;
  }
  const missingTripIds=tripIds.filter(id=>!tripById.has(id));
  if (missingTripIds.length) {
    const {data,error}=await supabaseAdmin.from("trips").select("id,dispatch_number,estimated_delivery_date").in("id",missingTripIds);
    if(error){console.warn("Card trip progress unavailable",{code:error.code});tripsAvailable=false;}
    else for(const trip of data??[]){
      const id=String(trip.id),number=String(trip.dispatch_number??"").trim();
      tripById.set(id,{dispatch_number:number||null,estimated_delivery_date:trip.estimated_delivery_date??null});
      if(number){const linked=tripsByDispatch.get(number)??new Set<string>();linked.add(id);tripsByDispatch.set(number,linked);}
    }
  }
  for(const [id,trip] of tripById)if(trip.estimated_delivery_date)deliveryDateByTrip.set(id,trip.estimated_delivery_date);
  const linkedTripIds=[...tripById.keys()];
  const nativeStates=await readConfirmedOperationalState(linkedTripIds);
  const convoyAssignments:Record<string,any>[]=[];
  for(let index=0;index<linkedTripIds.length;index+=100)for(let offset=0;;offset+=1000){const result=await supabaseAdmin.from('trip_truck_assignments').select('id,trip_id,driver_id,driver:drivers(id,profile_id,first_name,last_name),truck:trucks(plate_number),company:trucking_companies(name)').in('trip_id',linkedTripIds.slice(index,index+100)).is('unassigned_at',null).order('id').range(offset,offset+999);if(result.error)throw new ApiError('Convoy card assignments could not load.',503);convoyAssignments.push(...result.data??[]);if((result.data?.length??0)<1000)break;}
  driverIds=[...new Set([...driverIds,...convoyAssignments.map(a=>a.driver_id).filter((id):id is string=>typeof id==='string'&&isValidUuid(id))])];
  const stopIdsByTrip=new Map<string,string[]>();
  for(let index=0;tripsAvailable&&index<linkedTripIds.length;index+=100) {
    const ids=linkedTripIds.slice(index,index+100);
    for (let offset=0;;offset+=1000) {
      const {data,error}=await supabaseAdmin.from("trip_stops")
        .select("id,trip_id,delivery_status,finish_unloading_time")
        .in("trip_id",ids).is("archived_at",null).order("id").range(offset,offset+999);
      if (error) { console.warn("Card stop progress unavailable", {code:error.code});stopCounts.clear();tripsAvailable=false;break; }
      for (const stop of data ?? []) {
        const id = String(stop.trip_id);
        const count = stopCounts.get(id) ?? {total:0,completed:0};
        count.total += 1;
        const scoped=nativeStates.filter(s=>s.trip_stop_id===stop.id);
        if(scoped.length&&scoped.every(s=>s.delivery_status==='COMPLETED'))count.completed++;
        const stopIds=stopIdsByTrip.get(id)??[];stopIds.push(String(stop.id));stopIdsByTrip.set(id,stopIds);
        stopCounts.set(id,count);
      }
      if ((data?.length ?? 0) < 1000) break;
    }
    if(!tripsAvailable)break;
  }
  const photoByDriver = new Map<string,string>();
  if (driverIds.length) {
    const {data:drivers,error:driversError} = await supabaseAdmin.from("drivers").select("id,profile_id").in("id",driverIds);
    if (!driversError) {
      const profileIds = [...new Set((drivers ?? []).map(driver => driver.profile_id).filter((id): id is string => typeof id === "string" && isValidUuid(id)))];
      if (profileIds.length) {
        const {data:profiles,error:profilesError} = await supabaseAdmin.from("profiles").select("id,profile_picture_path").in("id",profileIds);
        if (!profilesError) {
          const paths = (profiles ?? []).map(profile => profile.profile_picture_path).filter((path): path is string => typeof path === "string" && !/^https?:\/\//i.test(path));
          const signed = await signStoragePaths("profile-pictures",paths,60*60);
          const photoByProfile = new Map((profiles ?? []).map(profile => [String(profile.id), typeof profile.profile_picture_path === "string" ? /^https?:\/\//i.test(profile.profile_picture_path) ? profile.profile_picture_path : signed.get(profile.profile_picture_path) ?? null : null]));
          for (const driver of drivers ?? []) {
            const photo = photoByProfile.get(String(driver.profile_id));
            if (photo) photoByDriver.set(String(driver.id),photo);
          }
        }
      }
    }
  }
  const metadataAssigned=new Set<string>();
  const one=(value:any)=>Array.isArray(value)?value[0]:value;
  for (const row of rows) {
    const tripId = String(row.trip_id ?? row._trip_id);
    if(!metadataAssigned.has(tripId)){
     metadataAssigned.add(tripId);const own=nativeStates.filter(s=>s.trip_id===tripId);
     row.card_operational_states=own;row.card_unassigned_stops=(stopIdsByTrip.get(tripId)??[]).filter(id=>!own.some(s=>s.trip_stop_id===id)).length;
     row.card_drivers=convoyAssignments.filter(a=>a.trip_id===tripId&&a.driver_id).map(a=>({id:a.driver_id||a.id,name:[one(a.driver)?.first_name,one(a.driver)?.last_name].filter(Boolean).join(' ')||'Driver not assigned',plate:one(a.truck)?.plate_number||'Truck not assigned',company:one(a.company)?.name||'',avatarUrl:photoByDriver.get(String(a.driver_id))??null}));
    }
    const dispatchNumber=typeof row.dispatch_number==="string"?row.dispatch_number.trim():"";
    const linked=dispatchNumber?tripsByDispatch.get(dispatchNumber):null;
    const ids=linked?.size?[...linked]:tripById.has(tripId)?[tripId]:[];
    row.card_stop_total = tripsAvailable&&tripById.has(tripId)?stopCounts.get(tripId)?.total??0:null;
    row.card_stop_completed = tripsAvailable&&tripById.has(tripId)?stopCounts.get(tripId)?.completed??0:null;
    row.card_delivery_date = ids.map(id=>deliveryDateByTrip.get(id)).filter((date):date is string=>Boolean(date)).sort().at(-1)??null;
    row.driver_photo_url = photoByDriver.get(String(row.driver_id ?? row._driver_id)) ?? null;
  }
}

export async function getReportData(
  reportKey: string,
  query: ReportQueryParams = {},
  scope?: {tripIds?: string[];storeCallIds?:string[]},
): Promise<ReportResponse> {
  if(scope && Object.values(scope).some(ids=>!ids||!ids.length||ids.length>100||ids.some(id=>!isValidUuid(id))))throw new ApiError("Invalid physical report scope.",400);
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  const requestedSourceLines = key === "dispatch-monitoring" && getQueryString(query.source_lines) === "true";
  const selectionOnly = getQueryString(query.selection_only) === "true";
  const csvMaster = requestedSourceLines && await masterListAvailable();
  // The CSV projection already depends on the source schema being installed.
  const sourceLines = requestedSourceLines && (csvMaster || await tripImportAvailable());
  // The existing booking view already exposes physical cargo IDs. Use it before
  // source-schema activation so manually added products remain visible after refresh.
  const legacySourceLines = requestedSourceLines && !sourceLines;
  const baseDefinition = getReportDefinition(legacySourceLines ? "trip-booking" : key);
  const hasSource = sourceLines || SOURCE_REPORTS.includes(key) && await tripImportAvailable();
  const hasCargoColumns=!requestedSourceLines&&hasSource&&await tripAllocationReportAvailable();
  const sourceColumns = [...TRIP_SOURCE_COLUMNS, ...(sourceLines ? SOURCE_LINE_COLUMNS : []),...(hasCargoColumns?TRIP_CARGO_COLUMNS:[])];
  const sourceDefinition = hasSource ? {
    ...baseDefinition, columns: [...baseDefinition.columns, ...sourceColumns],
    sortableColumns: [...baseDefinition.sortableColumns, ...sourceColumns.map(column => column.key)],
    filters: [...baseDefinition.filters, ...sourceColumns.map(column => ({ key: column.key, field: column.key, operator: "eq" as const }))],
  } : baseDefinition;
  // These views expose the physical parent as an internal field; the public
  // trip_id alias is attached only after querying, so it cannot be filtered in SQL.
  const definition = csvMaster ? { ...sourceDefinition, columns: MASTER_LIST_COLUMNS,
    sortableColumns: [...new Set([...sourceDefinition.sortableColumns, ...MASTER_LIST_COLUMNS.map(column => column.key).filter(key => !["incident_report", "incident_boxes", "incident_details"].includes(key))])] } : sourceDefinition;
  const tripIdField = legacySourceLines || ["trip-booking", "dispatch"].includes(key) ? "_trip_id" : "trip_id";
  validateArrayQuery(query.trip_id, "trip_id");
  const tripId = normalizeText(getQueryString(query.trip_id));
  if (tripId && !isValidUuid(tripId)) {
    throw new ApiError("Invalid trip id", 400, "INVALID_TRIP_ID");
  }
  const viewNames = csvMaster ? ["v_trip_master_csv"] : sourceLines ? ["v_trip_source_master"] : resolveViewNames(definition);
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
  const ongoingOnly = key === "dispatch-monitoring" && getQueryString(query.ongoing_only) === "true";
  const issueFilter=getQueryString(query.issue_filter)??"All";
  const tripIdsRaw=getQueryString(query.trip_ids);
  const requestedTripIds=tripIdsRaw?.split(",").map(id=>id.trim())??[];
  if(requestedTripIds.length>100||requestedTripIds.some(id=>!isValidUuid(id)))throw new ApiError("Invalid report trip scope.",400);
  const issueFields:Record<string,string>={"In Progress":"_filter_in_progress",Completed:"_filter_completed",Offload:"_filter_offload",Backload:"_filter_backload",Demurrage:"_filter_demurrage"};
  if(issueFilter!=="All"&&!Object.hasOwn(issueFields,issueFilter))throw new ApiError("Invalid trip issue filter.",400);
  let matchingTripIds: string[] = [];

  const matchingAssignees:string[]=[];

  let scopedCalls:string[]|undefined;
  if(key==="store-calling"&&tripId){scopedCalls=[];for(let offset=0;;offset+=1000){const result=await supabaseAdmin.from("store_calls").select("id").eq("trip_id",tripId).order("id").range(offset,offset+999);if(result.error)throw new ApiError("Unable to read trip store calls.",503);scopedCalls.push(...(result.data??[]).map(row=>row.id));if((result.data?.length??0)<1000)break;}if(!scopedCalls.length)return {rows:[],pagination:buildPaginationMeta(page,limit,0)};}
  let lastError: Error | null = null;
  // For default Master List and Dispatch Monitoring pages, constrain the wide
  // view to the leading trips. Each trip contributes at least one row and the
  // view's loading date comes from trips, preserving the global row order.
  // Search and filtered views continue through the unrestricted query.
  let leadingTripIds: string[] | undefined;
  const monitoringPage = key === "dispatch-monitoring" && !requestedSourceLines;
  const useLeadingTrips = (csvMaster || monitoringPage) && sortBy === "loading_date" && !search && !tripId && !scope?.tripIds
    && !requestedTripIds.length
    && !ongoingOnly && issueFilter === "All"
    && !definition.filters.some(filter => Boolean(getQueryString(query[filter.key])))
    && page * limit <= 500;
  if (useLeadingTrips) {
    const activeMonitoring=monitoringPage&&getQueryString(query.active_transactions)==="true";
    let leadingQuery = supabaseAdmin.from("trips").select("id");
    if (getQueryString(query.active_transactions) === "true") leadingQuery = getQueryString(query.archive_scope) === "archived"
      ? leadingQuery.not("archived_at", "is", null) : leadingQuery.is("archived_at", null);
    const leading = await leadingQuery.order("loading_date", { ascending: sortOrder === "asc" })
      .order("id", { ascending: true }).range(0, activeMonitoring?500:page * limit - 1 + (monitoringPage ? 1 : 0));
    // Active transactions are filtered at the stop level. Scope only when all
    // candidate trips fit, so archived stops cannot shift later pages.
    if (!leading.error&&(!activeMonitoring||(leading.data?.length??0)<=500)) leadingTripIds = (leading.data ?? []).map(trip => trip.id);
  }
  if(monitoringPage&&!leadingTripIds&&!tripId&&!requestedTripIds.length&&!scope?.tripIds){
    let allTrips=supabaseAdmin.from("trips").select("id");
    if(getQueryString(query.active_transactions)==="true")allTrips=getQueryString(query.archive_scope)==="archived"
      ?allTrips.not("archived_at","is",null):allTrips.is("archived_at",null);
    const candidates=await allTrips.order("id").range(0,500);
    // This scope is exact only when every candidate fits. Larger reports keep
    // their existing database pagination and filters.
    if(!candidates.error&&(candidates.data?.length??0)<=500)leadingTripIds=(candidates.data??[]).map(trip=>trip.id);
  }
  if (leadingTripIds?.length === 0) return { rows: [], pagination: buildPaginationMeta(page, limit, 0) };
  for (const viewName of viewNames) {
    const projection=csvMaster
      ? [...new Set([...(REPORT_PROJECTIONS[viewName]??[]),...MASTER_LIST_READ_COLUMNS.split(",")])].join(",")
      : REPORT_PROJECTIONS[viewName]?.join(",")??"*";
    const selectionFields=new Set(["id","trip_id","_trip_id","trip_stop_id","_trip_stop_id","trip_line_item_id","_trip_line_item_id","assignment_id","_assignment_id","billing_id","_billing_id","incident_id","_incident_id","backload_id","_backload_id","offload_id","_offload_id","store_call_id","_store_call_id","pod_record_id","pod_drive_file_id","_stop_version","_store_call_version"]);
    const selectionProjection=projection.split(",").filter(field=>selectionFields.has(field));
    const rowProjection=selectionOnly&&selectionProjection.length?selectionProjection.join(",")
      :requestedSourceLines&&!legacySourceLines?`${projection},_source_quantity_text:quantity::text,_source_cbm_text:cbm::text,_source_unit_cbm_text:unit_cbm::text,_source_stock_quantity_text:stock_quantity::text`:projection;
    const mapField=(field:string)=>key==="trip-exceptions"?({backload_reason:"backload_reasons",offload_reason:"offload_reasons"} as Record<string,string>)[field]??field:key==="dispatch"&&field==="warehouse_departure_time"?"_parent_departure_at":key!=="store-calling"?field:viewName==="vw_store_calling_tracker"?({status:"contact_status",assigned_to:"assigned_to_id"} as Record<string,string>)[field]??field:({ship_to:"store_name",trucker_gc_name:"trucking_company"} as Record<string,string>)[field]??field;
    const readQuery=(head=false)=>{
    // Counting the expanded view can scan every joined row before returning a
    // page. Dispatch Monitoring uses one lookahead row for pagination instead.
    let builder = supabaseAdmin.from(viewName).select(head ? "trip_id" : rowProjection, head ? {count:"exact",head:true} : csvMaster || monitoringPage ? {} : {count:"exact"});
    if (tripId && key!=="store-calling") builder = builder.eq(tripIdField, tripId);
    if(requestedTripIds.length)builder=builder.in(tripIdField,requestedTripIds);
    if (!head && leadingTripIds?.length) builder = builder.in("trip_id", leadingTripIds);
    if(scopedCalls)builder=builder.in("store_call_id",scopedCalls);
    if(scope?.tripIds)builder=builder.in(tripIdField,scope.tripIds);
    if(scope?.storeCallIds)builder=builder.in("store_call_id",scope.storeCallIds);
    if (key === "dispatch-monitoring" && !legacySourceLines && getQueryString(query.active_transactions) === "true") {
      builder = getQueryString(query.archive_scope) === "archived"
        ? builder.not("transaction_archived_at", "is", null)
        : builder.is("transaction_archived_at", null);
    }
    if(ongoingOnly)builder=builder.eq("_filter_ongoing",true);
    if(issueFilter!=="All")builder=builder.eq(issueFields[issueFilter],true);
    builder = applyFilters(builder, key==="store-calling"?{...definition,filters:definition.filters.map(filter=>({...filter,field:mapField(filter.field)}))}:definition, query);
    const reportTableKeys = [
      "combined",
      "dispatch-monitoring",
      "dispatch",
      "trip-booking",
      "store-calling",
    ];
    const searchColumns = reportTableKeys.includes(key)
      ? definition.columns.filter(
          // Relationship UUIDs and derived Route values are not text-search columns.
          (column) =>
            column.key !== "route" &&
            !(key === "store-calling" && column.key === "assigned_to"),
        )
      : definition.searchableColumns.map((column) => ({
          key: column,
          title: column,
          type: "text" as const,
        }));
    const serverSearch=["combined","dispatch-monitoring","dispatch","trip-booking","store-calling"].includes(key);
    builder = serverSearch&&search?builder.ilike("_search_text",`%${search.replace(/[\\%_]/g,"\\$&")}%`):applySearch(builder, search, searchColumns.map(column=>({...column,key:mapField(column.key)})), matchingTripIds, tripIdField,
      matchingAssignees.length?[`${mapField("assigned_to")}.in.(${matchingAssignees.join(",")})`]:[]);
    if(head)return builder;
    builder = builder.order(key === "store-calling" && sortBy === "assigned_to" && viewName === "vw_store_calling_tracker"
      ? "assigned_to_name"
      : mapField(sortBy), { ascending: sortOrder === "asc" });
    // Stable boundaries when many Master List rows share the selected sort value.
    // These physical columns are part of the existing dispatch-monitoring view.
    const tieBreakers: Record<string,string[]> = {
      "dispatch-monitoring": ["trip_id","_trip_stop_id","_assignment_id"],
      dispatch: ["_trip_id","_trip_stop_id","_trip_line_item_id","_assignment_id","_incident_id","_backload_id","_offload_id"],
      "trip-booking": ["_trip_id","_trip_stop_id","_trip_line_item_id","_assignment_id","_billing_id"],
      "store-calling": ["store_call_id"],
    };
    for(const column of tieBreakers[legacySourceLines ? "trip-booking" : key]??[])if(column!==sortBy)builder=builder.order(column,{ascending:true,nullsFirst:false});
    if (sourceLines) builder = builder.order("_trip_line_item_id", { ascending: true, nullsFirst: false });
    // Every report, including aggregate and POD/file sheets, needs deterministic
    // physical tie breakers before range pagination.
    const existingOrders=new Set([sortBy,...(tieBreakers[legacySourceLines?"trip-booking":key]??[]),...(sourceLines?["_trip_line_item_id"]:[])]);
    const available=REPORT_PROJECTIONS[viewName]??[];
    for(const field of ["pod_drive_file_id","pod_record_id","_trip_id","trip_id","_trip_stop_id","trip_stop_id","_trip_line_item_id","trip_line_item_id","_assignment_id","assignment_id","_billing_id","_incident_id","_backload_id","_offload_id","store_call_id"]){if(available.includes(field)&&!existingOrders.has(field))builder=builder.order(field,{ascending:true,nullsFirst:false});}

    return builder.range(from, from + limit - 1 + (monitoringPage ? 1 : 0));
    };
    const result = await readQuery();
    const data=monitoringPage?result.data?.slice(0,limit):result.data;
    let {error,count}=result;
    if(monitoringPage&&!error)count=from+(data?.length??0)+((result.data?.length??0)>limit?1:0);
    if(csvMaster&&!error&&count==null){
      if((data?.length??0)<limit&&(page===1||(data?.length??0)>0))count=from+(data?.length??0);
      else if(useLeadingTrips){
        // Master CSV adds only one-to-one enrichment to the source rows. Count
        // the source view so pagination does not execute the expensive nested
        // presentation view a second time.
        let totalQuery=supabaseAdmin.from("v_trip_source_master").select("trip_id",{count:"exact",head:true});
        if(getQueryString(query.active_transactions)==="true")totalQuery=getQueryString(query.archive_scope)==="archived"
          ? totalQuery.not("transaction_archived_at","is",null) : totalQuery.is("transaction_archived_at",null);
        const total=await totalQuery;error=total.error;count=total.count;
      }else {const total=await readQuery(true);error=total.error;count=total.count;}
    }
    if (!error) {
      // The projection is assembled from validated column definitions at runtime.
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      // Selection only needs stable physical IDs. Skip relationship, product,
      // route and incident enrichment; these are expensive on expanded views.
      if(selectionOnly)return {rows,pagination:buildPaginationMeta(page,limit,count??rows.length)};
      for (const row of rows) {
        if (requestedSourceLines) row._master_list = true;
        if(key==="trip-exceptions"){row.backload_reason??=row.backload_reasons;row.offload_reason??=row.offload_reasons;}
        if(key==="store-calling"){row.ship_to??=row.store_name;row.trucker_gc_name??=row.trucking_company;row.status??=row.contact_status;row.assigned_to??=row.assigned_to_id;}
        if (Object.hasOwn(row, "transmittal_ref")) {
          const reference = resolveLegacyPodCellValue(row.transmittal_ref);
          row.transmittal_ref = reference.value;
          row.transmittal_ref_conflict = reference.conflict;
        }
      }
      let parentTrips:Record<string,unknown>[]|undefined;
      if(["combined","dispatch","dispatch-monitoring","trip-booking"].includes(key)&&rows.every(row=>Object.hasOwn(row,"_parent_trip_reference"))){
        parentTrips=[...new Map(rows.map(row=>[row.trip_id??row._trip_id,{id:row.trip_id??row._trip_id,dispatch_number:row._parent_dispatch_number,transaction_number:row._parent_transaction_number,trip_reference:row._parent_trip_reference,warehouse_id:row._parent_warehouse_id,departure_from_warehouse_at:row._parent_departure_at}])).values()];
      }else if(["combined","dispatch","dispatch-monitoring","trip-booking"].includes(key)){
        const ids=[...new Set(rows.map(row=>row.trip_id??row._trip_id).filter((id):id is string=>typeof id==="string"&&isValidUuid(id)))];
        const tripFields = requestedSourceLines && !legacySourceLines
          ? "id,dispatch_number,transaction_number,trip_reference"
          : "id,dispatch_number,transaction_number,trip_reference,warehouse_id,departure_from_warehouse_at";
        if(ids.length){let result=await supabaseAdmin.from("trips").select(tripFields).in("id",ids);
          if(result.error&&["42703","PGRST204"].includes(result.error.code)&&/trip_reference/i.test(result.error.message))result=await supabaseAdmin.from("trips").select(tripFields.replace(",trip_reference", "")).in("id",ids) as typeof result;
          if(result.error)throw new ApiError("Unable to load report trip relationships.",503);parentTrips=(result.data??[]) as unknown as Record<string,unknown>[];
        }else parentTrips=[];
      }
      for(const row of rows){delete row._search_text;for(const field of Object.keys(row))if(field.startsWith("_filter_"))delete row[field];}
      const enriched = ["combined", "dispatch", "dispatch-monitoring", "trip-booking", "store-calling"].includes(key)
        ? await attachOperationalRecordIds(rows, key === "dispatch-monitoring", parentTrips, getQueryString(query.record_delete_versions)==="true", !requestedSourceLines)
        : rows;
      if(getQueryString(query.selection_only)==="true"){
        const identityFields=new Set(["id","trip_id","trip_stop_id","trip_line_item_id","assignment_id","billing_id","incident_id","backload_id","offload_id","store_call_id","_trip_id","_trip_stop_id","_trip_line_item_id","_assignment_id","_billing_id","_incident_id","_backload_id","_offload_id","_store_call_id"]);
        return {rows:enriched.map(row=>Object.fromEntries(Object.entries(row).filter(([field])=>identityFields.has(field)||/^_.*version$/.test(field)))),pagination:buildPaginationMeta(page,limit,count??enriched.length)};
      }
      const tripIds = [...new Set(enriched.map(row => row.trip_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
      await Promise.all([
        legacySourceLines ? attachLegacyStopData(enriched,parentTrips) : Promise.resolve(),
        hasSource ? attachSourceDecimals(enriched) : Promise.resolve(),
        attachGeneratedTripNumbers(enriched,parentTrips),
        !requestedSourceLines && ["combined", "dispatch", "dispatch-monitoring"].includes(key) ? attachLoadingMilestones(enriched) : Promise.resolve(),
        !requestedSourceLines && ["combined", "dispatch", "dispatch-monitoring", "trip-booking", "store-calling"].includes(key) ? getTripRoutes(tripIds,parentTrips?.map(trip=>({id:String(trip.id),warehouse_id:typeof trip.warehouse_id==="string"?trip.warehouse_id:null})),true).then(routes => {
          for (const row of enriched) row.route = typeof row.trip_id === "string" ? routes.get(row.trip_id) ?? null : null;
        }).catch(() => { for (const row of enriched) row.route = null; console.warn("Report route enrichment unavailable", {reportKey:key}); }) : Promise.resolve(),
      ]);
      if (key === "dispatch") for (const row of enriched) {
        if(row.delivery_status_source!=="CONFIRMED_MILESTONES")row.warehouse_departure_time = row._parent_departure_at ?? null;
        // Imported line values take precedence over catalog/store defaults.
        // Keep the same keys so editing and export use the displayed values.
        if (typeof row.source_product_category === "string" && row.source_product_category.trim()) row.category = row.source_product_category;
        if (typeof row.source_province === "string" && row.source_province.trim()) row.province = row.source_province;
        if (typeof row.source_city === "string" && row.source_city.trim()) row.city = row.source_city;
      }
      if (key === "store-calling") for (const row of enriched) {
        // The cell editor retains assigned_to_id; the CSV column displays the
        // staff member's name rather than the underlying profile UUID.
        row.assigned_to = row.assigned_to_name ?? null;
      }
      if (key === "dispatch-monitoring" && !requestedSourceLines) await attachDispatchWorkbookFields(enriched);
      if (key === "dispatch" || (key === "dispatch-monitoring" && requestedSourceLines)) await attachIncidentSummary(enriched);
      if(["combined","dispatch","dispatch-monitoring","trip-booking"].includes(key) && !enriched.every(row=>row._operational_projection_ready===true))await attachConfirmedOperationalState(enriched);
      for(const row of enriched)delete row._operational_projection_ready;
      if (getQueryString(query.card_meta) === "true" && ["combined", "dispatch", "dispatch-monitoring", "trip-booking", "store-calling"].includes(key)) {
        await attachCardMetadata(enriched);
      }
      for(const row of enriched)for(const field of Object.keys(row))if(field.startsWith("_parent_"))delete row[field];
      return {
        rows: enriched,
        pagination: buildPaginationMeta(page, limit, count ?? rows.length),
      };
    }
    if (error.code === "57014" || /statement timeout|AbortError|operation was aborted/i.test(error.message ?? "")) {
      console.warn("Report read timed out", { reportKey: key, viewName, code: error.code });
      throw new ApiError("The report query took too long. Your records are unchanged. Retry loading in a moment.", 503, "REPORT_READ_TIMEOUT");
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

export async function getReportColumns(reportKey: string, sourceLines = false) {
  const key = reportKey.trim();
  if (!REPORT_KEYS.includes(key)) throw new ApiError("Report not found", 404, "REPORT_NOT_FOUND");
  const master = sourceLines && key === "dispatch-monitoring";
  if (master) return { report: key, columns: MASTER_LIST_COLUMNS };
  // The Dispatch Report CSV is the complete UI schema. Keep source and cargo
  // values in the row payload for operational features, without adding headers.
  if (key === "dispatch") return { report: key, columns: REPORT_DEFINITIONS.dispatch.columns };
  const source = (master || SOURCE_REPORTS.includes(key)) && await tripImportAvailable();
  const columns = [...REPORT_DEFINITIONS[key].columns, ...(source || master ? [...TRIP_SOURCE_COLUMNS, ...(master ? SOURCE_LINE_COLUMNS : []),...(source&&await tripAllocationReportAvailable()?TRIP_CARGO_COLUMNS:[])] : [])];
  if(["combined","dispatch","dispatch-monitoring","trip-booking"].includes(key))for(const [field,title]of [["pod_submitted_at","POD Submitted"],["pod_received_at","POD Approved / Received"],["delivery_completed_date","Delivery Completed"]])if(!columns.some(c=>c.key===field))columns.push({key:field,title,type:"date"});
  return { report: key, columns: source || master ? sourceOrderedColumns(columns, master) : columns };
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
  if (typeof query.sort_by === "string" && query.sort_by && !definition?.sortableColumns.includes(query.sort_by) && ![...TRIP_SOURCE_COLUMNS, ...SOURCE_LINE_COLUMNS].some(column => column.key === query.sort_by)) throw new Error("Invalid sort_by parameter");
  if (typeof query.sort_order === "string" && query.sort_order && !["asc", "desc"].includes(query.sort_order)) throw new Error("Invalid sort_order parameter");
  if (typeof query.page === "string" && (Number(query.page) <= 0 || !Number.isInteger(Number(query.page)))) throw new Error("page must be a positive integer");
  if (typeof query.limit === "string" && (Number(query.limit) <= 0 || Number(query.limit) > 500 || !Number.isInteger(Number(query.limit)))) throw new Error("limit must be a positive integer up to 500");
  return true;
}
