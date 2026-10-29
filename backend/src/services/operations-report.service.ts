import {activeCrewAssignmentIds,hasCrewAccess} from './truck-crew.service.js';
import {signStoragePaths} from "./storage-links.service.js";
import { collaborationEvents } from "./collaboration-events.js";
import { withCurrentUserSession, type DeletionCredentials } from "./deletion-password.service.js";
import { operationsPageRequest, parseOperationsPageQuery } from "./operations-pagination.js";
import { randomUUID } from "node:crypto";
import { submissionRequest, submitReportOnce, uploadReceiptOnce } from "./operations-submission.service.js";
import { supabaseAdmin } from "../config/supabase.js";
import { imageMime } from "../models/clientwebsite.validation.js";
import { ApiError } from "../utils/api-response.js";
import { getTripRoutes } from "./trip-route.service.js";
import { splitOffloadDetails } from "./offload-details.logic.js";
import { deleteOffloadPermanently, deleteBackloadPermanently } from "./offload-deletion.service.js";
import { buildIlikeOrFilter } from "../utils/postgrest-search.js";
import { consumeReportReadRows, reportReadPageSize } from "./report-read-budget.js";
import {
  assertReportRole,
  assertReportSourceNotConverted as assertReportSourceNotConvertedInLedger,
  assertOperationsConversionRole,
  assertOperationsManagementRole,
  assertConversionSemanticMapping,
  assertConversionTargetScope,
  mapOperationsConversionConcurrencyError,
  assertStopBelongsToTrip,
  assertTripAssignment,
  buildOperationsEventRows,
  offloadSubmitterId,
  filterConvertedReportSources,
  validateOperationsReportConversion,
  validateOperationsEventSubmission,
  validateOperationsEventType,
  validateOperationsReportSourceIdentity,
  requireReportUuid,
  validateBackloadOffloadInput,
  validateOperationsOffloadItemUpdate,
  assertOffloadItemSourceScope,
  validateLoadingInput,
  validateUnloadingInput,
  mapOperationsConversionHistory,
  type ReportActor,
  type OperationsConversionHistoryRecord,
} from "./operations-report.logic.js";

const LOADING_SELECT = "id, trip_id, warehouse_arrival_at, loading_start_at, loading_finished_at";
const UNLOADING_SELECT = "id, trip_id, trip_stop_id";
const STOP_SELECT = "*";
const BACKLOAD_SELECT = "id, trip_id, trip_stop_id, reason, number_of_boxes, comments, created_by, submitted_by, submitted_at, created_at";
const OFFLOAD_SELECT = `${BACKLOAD_SELECT}, reported_at, reported_by, report_date`;
const OPERATIONAL_TRIP_SELECT = "id, trip_number, dispatch_number, status, loading_date, estimated_delivery_date, warehouse_id, remarks, archived_at";
const RECEIPT_BUCKET = "report-receipts";
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const RECEIPT_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

// report_receipts and the private report-receipts bucket are the verified live
// storage contract. Durable metadata reservations precede all Storage writes.

type Trip = { id: string; trip_number: string | number | null; dispatch_number: string | null; status: string | null; loading_date?: string | null; estimated_delivery_date?: string | null; warehouse_id?: string | null; remarks?: string | null; archived_at?: string | null };
type Stop = { id: string; trip_id: string; stop_sequence: number | null; dispatch_number?: string | null; store_id?: string | null; customer_id?: string | null; delivery_status?: string | null; departure_time?: string | null; arrival_time: string | null; start_unloading_time: string | null; finish_unloading_time: string | null; remarks?: string | null; archived_at?: string | null };
type Assignment = { trip_id: string; unassigned_at: string | null };

function throwDb(error: { message?: string; code?: string } | null, operation: string): never {
  console.error(`Operational report ${operation} failed:`, { code: error?.code, message: error?.message });
  if (error?.code === "42501") {
    throw new ApiError(
      `The backend database role is not permitted to ${operation}. Verify effective service_role privileges for the report tables.`,
      503,
      "REPORT_PRIVILEGE_NOT_CONFIGURED",
    );
  }
  throw new ApiError(`Unable to ${operation} report data.`, 500, "REPORT_STORAGE_FAILED");
}

async function readPaged<T>(table: string, columns: string, apply?: (query: any) => any): Promise<T[]> {
  const result: T[] = [];
  const pageSize = reportReadPageSize(1000);
  for (let from = 0; ; from += pageSize) {
    let query = supabaseAdmin.from(table).select(columns).order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) throwDb(error, "read");
    const page = (data ?? []) as T[];
    consumeReportReadRows(table, page.length);
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

async function readByForeignIds<T>(table: string, columns: string, foreignKey: string, ids: string[]): Promise<T[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const batch = uniqueIds.slice(index, index + 100);
    rows.push(...await readPaged<T>(table, columns, (query) => query.in(foreignKey, batch)));
  }
  return rows;
}

async function getTrip(actor: ReportActor, tripId: string): Promise<Trip> {
  // Role validation is deliberately before the service-role lookup.
  assertReportRole(actor);
  const id = requireReportUuid(tripId, "trip_id");
  const { data, error } = await supabaseAdmin.from("trips").select(OPERATIONAL_TRIP_SELECT).eq("id", id).maybeSingle();
  if (error) throwDb(error, "read trip");
  if (!data) throw new ApiError("Trip not found.", 404, "TRIP_NOT_FOUND");
  return data as Trip;
}

async function assertActorTripAccess(actor: ReportActor, trip: Trip) {
  assertReportRole(actor);
  if (actor.role.toUpperCase() !== "TRUCKER") return;
  const ids=await activeCrewAssignmentIds(actor.profileId,trip.id);
  assertTripAssignment(actor,trip.id,ids.map(()=>({trip_id:trip.id,unassigned_at:null})),trip.status);
}

async function getOwnedStop(tripId: string, stopId: string): Promise<Stop> {
  const validTripId = requireReportUuid(tripId, "trip_id");
  const validStopId = requireReportUuid(stopId, "trip_stop_id");
  const { data, error } = await supabaseAdmin.from("trip_stops").select(STOP_SELECT).eq("id", validStopId).eq("trip_id", validTripId).maybeSingle();
  if (error) throwDb(error, "read trip stop");
  const stop = (data as Stop | null) ?? null;
  assertStopBelongsToTrip(validTripId, stop ? { id: stop.id, trip_id: stop.trip_id } : null, validStopId);
  return stop!;
}

async function getDriverTripIds(profileId: string) {
  const memberIds=await activeCrewAssignmentIds(profileId);if(!memberIds.length)return [] as string[];
  const {data:assignmentRows,error}=await supabaseAdmin.from('trip_truck_assignments').select('trip_id,unassigned_at').in('id',memberIds);if(error)throwDb(error,'read crew assignments');
  const ids = [...new Set((assignmentRows ?? []).map((row) => row.trip_id).filter((id): id is string => typeof id === "string"))];
  if (!ids.length) return [];
  const trips = await readPaged<Trip>("trips", "id, trip_number, dispatch_number, status", (query) => query.in("id", ids));
  const active = new Set(trips.filter((trip) => !["COMPLETED", "CANCELLED", "CANCELED", "CLOSED", "FINISHED", "ARCHIVED", "REJECTED"].includes(String(trip.status ?? "").toUpperCase())).map((trip) => trip.id));
  return ids.filter((id) => active.has(id));
}

async function readReportCollections(tripIds?: string[], activeOnly = false, sources?: Record<string, string[]>) {
  if (tripIds && tripIds.length === 0) {
    return { trips: [], stops: [], loading: [], unloading: [], backloads: [], offloads: [], conversions: [] };
  }
  const byTrip = (query: any) => tripIds ? query.in("trip_id", tripIds) : query;
  const reports = (table: string) => sources && !sources[table]?.length ? Promise.resolve([]) : readPaged<Record<string, unknown>>(table, "*", (q) => sources ? byTrip(q).in("id", sources[table]) : byTrip(q));
  const [trips, stops, loading, unloading, backloads, offloads, conversions] = await Promise.all([
    // `trips` is keyed by `id`; only child/report tables use `trip_id`.
    tripIds ? readPaged<Trip>("trips", OPERATIONAL_TRIP_SELECT, (query) => query.in("id", tripIds)) : readPaged<Trip>("trips", OPERATIONAL_TRIP_SELECT, (q) => q.order("created_at", { ascending: false })),
    tripIds ? readPaged<Stop>("trip_stops", STOP_SELECT, byTrip) : readPaged<Stop>("trip_stops", STOP_SELECT),
    reports("loading_reports"),
    reports("unloading_reports"),
    reports("backloads"),
    reports("offloads"),
    readPaged<Record<string, unknown>>("operations_report_conversions", "id, source_type, source_id, target_type, target_id, trip_id, trip_stop_id", tripIds ? (q) => q.in("trip_id", tripIds) : undefined),
  ]);
  const tripSet = tripIds ? new Set(tripIds) : null;
  const tripRows = trips.filter((row) => (!tripSet || tripSet.has(row.id)) &&
    (!activeOnly || (!row.archived_at &&
      (!stops.some((stop) => stop.trip_id === row.id) || stops.some((stop) => stop.trip_id === row.id && !stop.archived_at)))));
  const relatedIds = new Set(tripRows.map((trip) => trip.id));
  const visibleStops = stops.filter((stop) => relatedIds.has(stop.trip_id) && (!activeOnly || !stop.archived_at));
  const visibleStopIds = new Set(visibleStops.map((stop) => stop.id));
  const visibleReport = (row: Record<string, unknown>) => relatedIds.has(String(row.trip_id)) &&
    (!activeOnly || !row.trip_stop_id || visibleStopIds.has(String(row.trip_stop_id)));
  const active = filterConvertedReportSources<Record<string, unknown> & { id: string; trip_id: string }>(loading as any, unloading as any, backloads as any, offloads as any, conversions as any);
  const activeOffloads = (active.offloads as Record<string, unknown>[]).filter(visibleReport);
  const [backloadItems,offloadItems]=await Promise.all([
    readByForeignIds<Record<string,unknown>>('backload_items','id,backload_id,trip_line_item_id,quantity,total_cbm,dr_number,customer_model','backload_id',(active.backloads as Record<string,unknown>[]).filter(visibleReport).map(row=>String(row.id))),
    readByForeignIds<Record<string,unknown>>('offload_items','id,offload_id,trip_line_item_id,quantity,total_cbm,dr_number,customer_model','offload_id',activeOffloads.map(row=>String(row.id))),
  ]);
  const itemsByBackloadId=new Map<string,Record<string,unknown>[]>();
  for(const item of backloadItems){const id=String(item.backload_id);const group=itemsByBackloadId.get(id)??[];group.push(item);itemsByBackloadId.set(id,group);}
  const itemsByOffloadId = new Map<string, Record<string, unknown>[]>();
  for (const item of offloadItems) {
    const id = String(item.offload_id);
    itemsByOffloadId.set(id, [...(itemsByOffloadId.get(id) ?? []), item]);
  }
  return {
    trips: tripRows,
    stops: visibleStops.sort((a, b) => a.trip_id.localeCompare(b.trip_id) || (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0) || a.id.localeCompare(b.id)),
    loading: (active.loading as Record<string, unknown>[]).filter(visibleReport),
    unloading: (active.unloading as Record<string, unknown>[]).filter(visibleReport),
    backloads: (active.backloads as Record<string, unknown>[]).filter(visibleReport).map((row):Record<string,unknown>&{items:Record<string,unknown>[]}=>({...row,items:itemsByBackloadId.get(String(row.id))??[]})),
    offloads: activeOffloads.map((row): Record<string, unknown> & { items: Record<string, unknown>[] } => ({ ...row, items: itemsByOffloadId.get(String(row.id)) ?? [] })),
    conversions,
  };
}

async function crewReportScope(profile:string,collections:Awaited<ReturnType<typeof readReportCollections>>){
 const ids=await activeCrewAssignmentIds(profile);if(!ids.length)return {...collections,trips:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],conversions:[]};
 const [events,assignments,responsibilities]=await Promise.all([readByForeignIds<Record<string,any>>('trip_events','id,trip_stop_id,backload_id,offload_id,delivery_metadata','assignment_id',ids),readByForeignIds<Record<string,any>>('trip_truck_assignments','id,trip_id,stop_scope','id',ids),readByForeignIds<Record<string,any>>('trip_assignment_stops','trip_stop_id','assignment_id',ids)]);
 const reports=new Set(events.flatMap(e=>[e.backload_id,e.offload_id,e.delivery_metadata?.report_id]).filter(Boolean));
 const stopIds=new Set(responsibilities.map(r=>r.trip_stop_id));
 const stops=collections.stops.filter(stop=>stopIds.has(stop.id)||assignments.some(a=>a.trip_id===stop.trip_id&&a.stop_scope==='ALL'));
 const filter=(rows:Record<string,unknown>[])=>rows.filter(row=>reports.has(row.id));
 return {...collections,stops,loading:filter(collections.loading),unloading:filter(collections.unloading),backloads:collections.backloads.filter(row=>reports.has(row.id)),offloads:collections.offloads.filter(row=>reports.has(row.id)),conversions:collections.conversions.filter(row=>reports.has(row.source_id)||reports.has(row.target_id))};
}

async function buildEventRows(collections: Awaited<ReturnType<typeof readReportCollections>>,crewAssignmentIds?:string[]) {
  const tripIds = collections.trips.map((trip) => trip.id);
  if (!tripIds.length) return { event_rows: [], trip_options: [] };
  const [rawLineItems, rawAssignments, routes] = await Promise.all([
    readByForeignIds<Record<string, unknown>>("trip_line_items", "id, trip_id, trip_stop_id, dr_number, quantity, cbm, remarks", "trip_id", tripIds),
    readByForeignIds<Record<string, unknown>>("trip_truck_assignments", "id, trip_id, truck_id, driver_id, assignment_type, unassigned_at", "trip_id", tripIds),
    getTripRoutes(tripIds),
  ]);
  const assignedLines=crewAssignmentIds?await readByForeignIds<Record<string,unknown>>('trip_cargo_allocations','trip_line_item_id','assignment_id',crewAssignmentIds):[];
  const lineItems=crewAssignmentIds?rawLineItems.filter(row=>assignedLines.some(allocation=>allocation.trip_line_item_id===row.id)):rawLineItems;
  const assignments=crewAssignmentIds?rawAssignments.filter(row=>crewAssignmentIds.includes(String(row.id))):rawAssignments;
  const primaryByTrip = new Map<string, Record<string, unknown>[]>();
  for (const assignment of assignments) {
    if ((!crewAssignmentIds&&assignment.assignment_type !== "PRIMARY") || typeof assignment.trip_id !== "string") continue;
    const list = primaryByTrip.get(assignment.trip_id) ?? [];
    list.push(assignment);
    primaryByTrip.set(assignment.trip_id, list);
  }
  const chosenAssignments = new Map<string, Record<string, unknown>>();
  for (const [tripId, primary] of primaryByTrip) {
    const active = primary.filter((assignment) => assignment.unassigned_at == null);
    if (active.length === 1) chosenAssignments.set(tripId, active[0]);
  }
  const truckIds = [...new Set([...chosenAssignments.values()].map((row) => row.truck_id).filter((id): id is string => typeof id === "string"))];
  const driverIds = [...new Set([...chosenAssignments.values()].map((row) => row.driver_id).filter((id): id is string => typeof id === "string"))];
  const [trucks, drivers] = await Promise.all([
    readByForeignIds<Record<string, unknown>>("trucks", "id, plate_number", "id", truckIds),
    readByForeignIds<Record<string, unknown>>("drivers", "id, profile_id, first_name, last_name", "id", driverIds),
  ]);
  const profileIds = [...new Set([...drivers.map((driver) => driver.profile_id), ...[...collections.offloads, ...collections.backloads].flatMap((report) => [report.reported_by, report.created_by, report.submitted_by])].filter((id): id is string => typeof id === "string"))];
  const profiles = await readByForeignIds<Record<string, unknown>>("profiles", "id, first_name, last_name", "id", profileIds);
  const truckById = new Map(trucks.map((row) => [String(row.id), row]));
  const profileById = new Map(profiles.map((row) => [String(row.id), row]));
  const driverById = new Map(drivers.map((row) => [String(row.id), row]));
  const vehicles = new Map<string, { trip_id: string; assignment_id: string | null; plate_number: string | null; driver_name: string | null }>();
  for (const [tripId, assignment] of chosenAssignments) {
    const truck = typeof assignment.truck_id === "string" ? truckById.get(assignment.truck_id) : undefined;
    const driver = typeof assignment.driver_id === "string" ? driverById.get(assignment.driver_id) : undefined;
    const profile = typeof driver?.profile_id === "string" ? profileById.get(driver.profile_id) : undefined;
    const driverName = [driver?.first_name, driver?.last_name].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).join(" ").trim()
      || [profile?.first_name, profile?.last_name].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).join(" ").trim();
    vehicles.set(tripId, {
      trip_id: tripId,
      assignment_id: typeof assignment.id === "string" ? assignment.id : null,
      plate_number: typeof truck?.plate_number === "string" ? truck.plate_number : null,
      driver_name: driverName || null,
    });
  }
  const event_rows = buildOperationsEventRows({
    trips: collections.trips,
    stops: collections.stops,
    lineItems: lineItems as Parameters<typeof buildOperationsEventRows>[0]["lineItems"],
    loading: collections.loading as Parameters<typeof buildOperationsEventRows>[0]["loading"],
    unloading: collections.unloading as Parameters<typeof buildOperationsEventRows>[0]["unloading"],
    backloads: collections.backloads.map((report) => {
      // Original authenticated creator, never delegate/reported-on-behalf-of user.
      const reporterId = offloadSubmitterId(report);
      const name = (id: unknown) => { const profile = typeof id === "string" ? profileById.get(id) : undefined; return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null; };
      return { ...report, reported_by_id: reporterId ?? null, reported_by_name: name(reporterId), creator_name: name(report.created_by) };
    }) as Parameters<typeof buildOperationsEventRows>[0]["backloads"],
    offloads: collections.offloads.map((report) => {
      // Original authenticated creator, never delegate/reported-on-behalf-of user.
      const reporterId = offloadSubmitterId(report);
      const name = (id: unknown) => { const profile = typeof id === "string" ? profileById.get(id) : undefined; return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null; };
      return { ...report, reported_by_id: reporterId ?? null, reported_by_name: name(reporterId), creator_name: name(report.created_by) };
    }) as Parameters<typeof buildOperationsEventRows>[0]["offloads"],
    convertedUnloadingIds: new Set((collections.conversions as any[]).filter((entry) => entry.source_type === "UNLOADING").map((entry) => String(entry.source_id))),
    routes,
    vehicles,
  });
  const stopsByTrip = new Map<string, Stop[]>();
  for (const stop of collections.stops) {
    const stops = stopsByTrip.get(stop.trip_id) ?? [];
    stops.push(stop);
    stopsByTrip.set(stop.trip_id, stops);
  }
  // Active transactions include planned and completed deliveries as well as
  // ongoing ones. Historical report rows are never filtered by archive state.
  const trip_options = collections.trips.filter((trip) => !trip.archived_at &&
    (!(stopsByTrip.get(trip.id)?.length) || stopsByTrip.get(trip.id)!.some((stop) => !(stop as Stop & { archived_at?: string | null }).archived_at)),
  ).map((trip) => {
    const vehicle = vehicles.get(trip.id);
    return {
      id: trip.id,
      trip_number: trip.trip_number,
      dispatch_number: trip.dispatch_number,
      status: trip.status,
      driver_name: vehicle?.driver_name ?? null,
      plate_number: vehicle?.plate_number ?? null,
      route: routes.get(trip.id) ?? null,
      stops: (stopsByTrip.get(trip.id) ?? []).filter((stop) => !(stop as Stop & { archived_at?: string | null }).archived_at).map((stop) => ({
        id: stop.id,
        stop_sequence: stop.stop_sequence,
        dispatch_number: stop.dispatch_number ?? null,
        quantity: (stop as Stop & { quantity?: number | null }).quantity ?? null,
        total_cbm: (stop as Stop & { total_cbm?: number | null }).total_cbm ?? null,
      })),
    };
  });
  return { event_rows, trip_options };
}

export async function convertOperationsReport(actor: ReportActor, input: unknown) {
  assertOperationsConversionRole(actor);
  const request = validateOperationsReportConversion(input);
  const tableByType = { LOADING: "loading_reports", UNLOADING: "unloading_reports", BACKLOAD: "backloads", OFFLOAD: "offloads" } as const;
  const selectByType = { LOADING: "id, trip_id", UNLOADING: "id, trip_id, trip_stop_id", BACKLOAD: "id, trip_id, trip_stop_id", OFFLOAD: "id, trip_id, trip_stop_id" } as const;
  const { data: source, error } = await (supabaseAdmin.from(tableByType[request.source_type]) as any).select(selectByType[request.source_type]).eq("id", request.source_id).maybeSingle();
  if (error) throwDb(error, "read conversion source");
  if (!source) throw new ApiError("Source report was not found.", 404, "CONVERSION_SOURCE_NOT_FOUND");
  const trip = await getTrip(actor, String(source.trip_id));
  await assertActorTripAccess(actor, trip);
  const sourceStop = source.trip_stop_id ? await getOwnedStop(trip.id, String(source.trip_stop_id)) : null;
  assertConversionTargetScope(request.source_type, request.target_type, sourceStop?.id ?? null);
  assertConversionSemanticMapping(request.source_type, request.target_type, sourceStop);
  const { data, error: conversionError } = await supabaseAdmin.rpc("convert_operations_report_v1", {
    p_source_type: request.source_type,
    p_source_id: request.source_id,
    p_target_type: request.target_type,
    p_actor_profile_id: actor.profileId,
    p_target_fields: request.target_fields,
  });
  if (conversionError) {
    const message = conversionError.message ?? "Report conversion failed.";
    const concurrencyError = mapOperationsConversionConcurrencyError(conversionError.code, message);
    if (concurrencyError) throw concurrencyError;
    if (conversionError.code === "P0002") throw new ApiError(message, 404, "CONVERSION_SOURCE_NOT_FOUND");
    if (conversionError.code === "42501") throw new ApiError(message, 403, "REPORT_ACCESS_DENIED");
    if (conversionError.code === "23502" || conversionError.code === "23503" || conversionError.code === "23514") throw new ApiError(message, 409, "REPORT_CONVERSION_SCOPE_CONFLICT");
    if (conversionError.code === "23505" || /conflict|already converted|unique/i.test(message)) throw new ApiError(message, 409, "REPORT_CONVERSION_CONFLICT");
    if (conversionError.code === "22023") throw new ApiError(message, 400, "INVALID_REPORT_CONVERSION");
    if (conversionError.code === "55000") throw new ApiError(message, 409, "REPORT_CONVERSION_UNSUPPORTED");
    if (/stop|required|scope|field|unsupported|cannot convert/i.test(message)) throw new ApiError(message, 400, "INVALID_REPORT_CONVERSION");
    throwDb(conversionError, "convert report");
  }
  return data;
}

/** Query page identities in PostgreSQL, then hydrate only their related trips/reports. */
export async function getOperationsPage(actor: ReportActor, input: Record<string, unknown>) {
  assertOperationsManagementRole(actor);
  const options = parseOperationsPageQuery(input);
  const { data, error, count } = await operationsPageRequest(supabaseAdmin, options,input.selection_only==="true");
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) throw new ApiError("Operations pagination is not configured. Apply the reviewed pagination proposal before enabling this feature.", 503, "OPERATIONS_PAGE_NOT_CONFIGURED");
    throwDb(error, "read Operations page");
  }
  if (count === null) throw new ApiError("Operations pagination count is unavailable.", 503, "OPERATIONS_PAGE_COUNT_FAILED");
  const identities = (data ?? []) as unknown as Array<Record<string,any>>;
  if(input.selection_only==="true")return {rows:identities.map(row=>({id:`${row.source_type.toLowerCase()}:${row.source_record_id}`,source_type:row.source_type,source_record_id:row.source_record_id,trip_id:row.trip_id,trip_stop_id:row.trip_stop_id,dispatch_number:(row as Record<string,unknown>).trip,event_type_records:[{id:row.source_record_id,source_type:row.source_type}]})),pagination:{page:options.page,limit:options.limit,total:count,totalPages:Math.max(1,Math.ceil(count/options.limit))}};
  const sources: Record<string, string[]> = {};
  const tables: Record<string, string> = {LOADING:"loading_reports",UNLOADING:"unloading_reports",BACKLOAD:"backloads",OFFLOAD:"offloads"};
  for (const row of identities) {
    if (!Object.hasOwn(tables, row.source_type)) throw new ApiError("Unexpected Operations page identity.", 503, "OPERATIONS_PAGE_IDENTITY_FAILED");
    (sources[tables[row.source_type]] ??= []).push(row.source_record_id);
  }
  const collections = await readReportCollections([...new Set<string>(identities.map(row => row.trip_id))], false, sources);
  const built = await buildEventRows(collections);
  const byId = new Map(built.event_rows.map(row => [`${row.source_type}:${row.source_record_id}`, row]));
  const event_rows = identities.flatMap(identity => {
    const row = byId.get(`${identity.source_type}:${identity.source_record_id}`);
    // A concurrent deletion/conversion may remove a selected source. Never replace
    // it with a sibling or a different physical type; the next refresh reconciles.
    return row ? [{...row, dr_number:identity.dr_number,quantity:identity.quantity,total_cbm:identity.total_cbm,route:identity.route,date:identity.date,reported_by:["OFFLOAD", "BACKLOAD"].includes(identity.source_type) ? row.reported_by : identity.reported_by}] : [];
  });
  return {...collections,...built,event_rows,pagination:{page:options.page,limit:options.limit,total:count,totalPages:Math.max(1,Math.ceil(count/options.limit))}};
}

export async function getOperationsOverview(actor: ReportActor) {
  if (actor.role.toUpperCase() !== "ADMIN" && actor.role.toUpperCase() !== "STAFF") throw new ApiError("Access denied.", 403, "REPORT_ACCESS_DENIED");
  const collections = await readReportCollections();
  const historyRows = await readPaged<Record<string, unknown>>(
    "operations_report_conversions",
    "id, source_type, source_id, target_type, target_id, trip_id, trip_stop_id, actor_profile_id, created_at, source_snapshot, source_items_snapshot",
  );
  const targetIdsByType = new Map<string, string[]>();
  for (const row of historyRows) {
    const type = String(row.target_type ?? "");
    const id = typeof row.target_id === "string" ? row.target_id : "";
    if (!id) continue;
    targetIdsByType.set(type, [...(targetIdsByType.get(type) ?? []), id]);
  }
  const targetTables = {
    LOADING: ["loading_reports", LOADING_SELECT],
    UNLOADING: ["unloading_reports", UNLOADING_SELECT],
    BACKLOAD: ["backloads", BACKLOAD_SELECT],
    OFFLOAD: ["offloads", BACKLOAD_SELECT],
  } as const;
  const targetGroups = await Promise.all(Object.entries(targetTables).map(async ([report_type, [table, columns]]) => {
    const ids = targetIdsByType.get(report_type) ?? [];
    const reports = await readByForeignIds<Record<string, unknown>>(table, columns, "id", ids);
    return reports.map((report) => ({ report_type, report }));
  }));
  const conversion_history = mapOperationsConversionHistory(
    historyRows as unknown as OperationsConversionHistoryRecord[],
    targetGroups.flat(),
  );
  return { ...collections, conversion_history, ...await buildEventRows(collections) };
}

export async function getAssignedOperations(actor: ReportActor) {
  if (actor.role.toUpperCase() !== "TRUCKER") throw new ApiError("This endpoint is for trucker accounts.", 403, "TRUCKER_ROLE_REQUIRED");
  const collections = await crewReportScope(actor.profileId,await readReportCollections(await getDriverTripIds(actor.profileId), true));
  return { ...collections, ...await buildEventRows(collections,await activeCrewAssignmentIds(actor.profileId)) };
}

async function readTripExceptions(tripId:string){
 const [incidents,demurrages]=await Promise.all([
  readPaged<Record<string,any>>('incidents','id,trip_id,trip_stop_id,incident_date,status,description,created_at,reason:incident_reasons(code,name)',q=>q.eq('trip_id',tripId)),
  readPaged<Record<string,any>>('demurrages','id,trip_id,trip_stop_id,time_in,time_out,waiting_minutes,reason,status,checking_status,remarks,created_at',q=>q.eq('trip_id',tripId)),
 ]);
 return [...incidents.map(row=>({...row,report_type:'INCIDENT',reason:row.reason?.name??null,incident_category:row.reason?.name??row.reason?.code??null,comments:row.description,reported_at:row.created_at,source:'incidents'})),...demurrages.map(row=>({...row,report_type:'DEMURRAGE',comments:row.remarks,reported_at:row.time_in??row.created_at,source:'demurrages'}))];
}

export async function getTripOperations(actor: ReportActor, tripId: string, includeEvidence: boolean | "metadata" = false) {
  const trip = await getTrip(actor, tripId);
  await assertActorTripAccess(actor, trip);
  const [rawCollections,exception_reports]=await Promise.all([readReportCollections([trip.id]),['ADMIN','STAFF'].includes(actor.role)?readTripExceptions(trip.id):Promise.resolve([])]);
  const collections=actor.role==="TRUCKER"?await crewReportScope(actor.profileId,rawCollections):rawCollections;
  const result = { ...collections, exception_reports, ...await buildEventRows(collections,actor.role==="TRUCKER"?await activeCrewAssignmentIds(actor.profileId,trip.id):undefined) };
  if(!includeEvidence||!['ADMIN','STAFF'].includes(actor.role))return result;
  const sources=[['loading_report_id',collections.loading],['unloading_report_id',collections.unloading],['backload_id',collections.backloads],['offload_id',collections.offloads]] as const;
  const filters=sources.flatMap(([field,records])=>records.length?[`${field}.in.(${records.map(record=>record.id).join(',')})`]:[]);
  if(!filters.length)return {...result,report_evidence:[],evidence_limited:false};
  const evidence=await supabaseAdmin.from('report_receipts').select('id,loading_report_id,unloading_report_id,backload_id,offload_id,file_name,mime_type,storage_path,created_at').or(filters.join(',')).eq('upload_status','READY').order('created_at',{ascending:false}).order('id').limit(61);
  if(evidence.error)return {...result,report_evidence:[],evidence_error:'Report attachments could not load. Open the report image viewer to retry.'};
  const files=(evidence.data??[]).slice(0,60);
  const links=files.length&&includeEvidence!=="metadata"?await supabaseAdmin.storage.from(RECEIPT_BUCKET).createSignedUrls(files.map(file=>file.storage_path),600):null;
  return {...result,evidence_links_pending:includeEvidence==="metadata",evidence_limited:(evidence.data?.length??0)>60,report_evidence:files.map(({storage_path,...file},index)=>({...file,signed_url:links?.data?.[index]?.signedUrl??null})),...(links?.error?{evidence_error:'Some attachment links are unavailable. Open the report viewer to retry.'}:{})};

}

export async function saveLoadingReport(actor: ReportActor, tripId: string, input: unknown, expectedReportId?: string) {
  const expectedId = expectedReportId === undefined ? undefined : requireReportUuid(expectedReportId, "loading_report_id");
  const trip = await getTrip(actor, tripId);
  await assertActorTripAccess(actor, trip);
  if(actor.role.toUpperCase()==="TRUCKER")throw new ApiError("Use My trip to record loading milestones. Saved times can only be corrected by Admin with a reason.",409,"DELIVERY_WORKFLOW_REQUIRED");
  const values = validateLoadingInput(input);
  const { data: current, error: readError } = await supabaseAdmin.from("loading_reports").select(LOADING_SELECT).eq("trip_id", trip.id).maybeSingle();
  if (readError) throwDb(readError, "read loading");
  if (expectedId && current?.id !== expectedId) {
    throw new ApiError("This Loading Report no longer belongs to the selected trip. Refresh before editing.", 409, "LOADING_REPORT_SCOPE_CONFLICT");
  }
  if (current) {
    await assertReportSourceNotConverted("LOADING", current.id);
    const { data, error } = await supabaseAdmin.from("loading_reports").update(values).eq("id", current.id).eq("trip_id", trip.id).select(LOADING_SELECT).maybeSingle();
    if (error) throwDb(error, "save loading");
    if (!data) throw new ApiError("The loading report changed before it could be saved.", 409, "LOADING_REPORT_CONFLICT");
    return data;
  }
  const { data, error } = await supabaseAdmin.from("loading_reports").insert({ trip_id: trip.id, ...values }).select(LOADING_SELECT).single();
  if (error?.code === "23505") {
    // A concurrent first submission won the trip_id unique key. Apply only the
    // fields sent by this editor so unrelated loading timestamps remain intact.
    const { data: raced, error: rereadError } = await supabaseAdmin.from("loading_reports").select("id").eq("trip_id", trip.id).maybeSingle();
    if (rereadError || !raced) throwDb(rereadError ?? error, "save loading");
    await assertReportSourceNotConverted("LOADING", raced.id);
    const { data: updated, error: updateError } = await supabaseAdmin.from("loading_reports").update(values).eq("id", raced.id).eq("trip_id", trip.id).select(LOADING_SELECT).maybeSingle();
    if (updateError) throwDb(updateError, "save loading");
    if (!updated) throw new ApiError("The loading report changed before it could be saved.", 409, "LOADING_REPORT_CONFLICT");
    return updated;
  }
  if (error) throwDb(error, "save loading");
  return data;
}

export async function saveUnloadingReport(actor: ReportActor, tripId: string, stopId: string, input: unknown) {
  const trip = await getTrip(actor, tripId);
  await assertActorTripAccess(actor, trip);
  const stop = await getOwnedStop(trip.id, stopId);
  if(actor.role.toUpperCase()==="TRUCKER")throw new ApiError("Use My trip to record unloading against your assigned cargo.",409,"DELIVERY_WORKFLOW_REQUIRED");
  const values = validateUnloadingInput(input);

  // The unique trip_stop_id index makes this create-once marker safe to retry.
  // Timestamp writes remain a separate, exact (id + trip_id) stop update.
  const { data: report, error: readError } = await supabaseAdmin.from("unloading_reports").select(UNLOADING_SELECT).eq("trip_stop_id", stop.id).maybeSingle();
  if (readError) throwDb(readError, "read unloading");
  let savedReport = report;
  if (!savedReport) {
    const { data, error } = await supabaseAdmin.from("unloading_reports").insert({ trip_id: trip.id, trip_stop_id: stop.id }).select(UNLOADING_SELECT).single();
    if (error?.code === "23505") {
      const { data: concurrentReport, error: retryError } = await supabaseAdmin.from("unloading_reports").select(UNLOADING_SELECT).eq("trip_stop_id", stop.id).maybeSingle();
      if (retryError || !concurrentReport) throwDb(retryError ?? error, "create unloading");
      savedReport = concurrentReport;
    } else if (error) throwDb(error, "create unloading");
    else savedReport = data;
  }
  if (savedReport.trip_id !== trip.id || savedReport.trip_stop_id !== stop.id) throw new ApiError("An unloading report exists for a different trip/stop relationship.", 409, "UNLOADING_SCOPE_CONFLICT");
  await assertReportSourceNotConverted("UNLOADING", savedReport.id);

  const { data: updatedStop, error: updateError } = await supabaseAdmin.from("trip_stops").update(values).eq("id", stop.id).eq("trip_id", trip.id).select(STOP_SELECT).maybeSingle();
  if (updateError) throwDb(updateError, "save unloading timestamps");
  if (!updatedStop) throw new ApiError("The stop was not updated because its trip relationship changed.", 409, "TRIP_STOP_SCOPE_CONFLICT");
  return { report: savedReport, stop: updatedStop };
}

async function validateReportScope(actor: ReportActor, tripId: string, stopId?: string | null) {
  const trip = await getTrip(actor, tripId);
  await assertActorTripAccess(actor, trip);
  if (stopId) await getOwnedStop(trip.id, stopId);
  return trip;
}

async function assertNewReportTransactionActive(trip: Trip, stopId?: string | null) {
  const stop = stopId ? await getOwnedStop(trip.id, stopId) : null;
  if (trip.archived_at || (stop as (Stop & { archived_at?: string | null }) | null)?.archived_at) {
    throw new ApiError("Restore the archived transaction before submitting a new report.", 409, "TRANSACTION_ARCHIVED");
  }
}

const EVENT_REPORT_TABLE = {
  LOADING: { table: "loading_reports", receiptColumn: "loading_report_id" },
  UNLOADING: { table: "unloading_reports", receiptColumn: "unloading_report_id" },
  BACKLOAD: { table: "backloads", receiptColumn: "backload_id" },
  OFFLOAD: { table: "offloads", receiptColumn: "offload_id" },
} as const;

type OperationsReceiptType = keyof typeof EVENT_REPORT_TABLE;

function parseEventType(value: string): "BACKLOAD" | "OFFLOAD" {
  const normalized = value.toUpperCase();
  if (normalized !== "BACKLOAD" && normalized !== "OFFLOAD") {
    throw new ApiError("Event type must be BACKLOAD or OFFLOAD.", 400, "INVALID_EVENT_TYPE");
  }
  return normalized;
}

function parseReceiptEventType(value: string): OperationsReceiptType {
  const normalized = value.toUpperCase();
  if (!(normalized in EVENT_REPORT_TABLE)) throw new ApiError("Report type must be Loading, Unloading, Backload, or Offload.", 400, "INVALID_EVENT_TYPE");
  return normalized as OperationsReceiptType;
}

/** Resolve a dispatch number to its exact stop first. A legacy trip-level
 * dispatch may resolve to a trip with one stop; a multi-stop trip without an
 * exact stop dispatch is rejected rather than guessed. */
export async function submitOperationsEvent(actor: ReportActor, input: unknown) {
  assertReportRole(actor);
  const request = submissionRequest(input);
  input = request.body;
  if (input && typeof input === "object" && !Array.isArray(input) && String((input as Record<string, unknown>).event_type).trim().toUpperCase() === "OFFLOAD") {
    const body = input as Record<string, unknown>;
    if (!body.trip_id || !body.trip_stop_id) throw new ApiError("Select a delivery transaction by DR Number; dispatch-only Offload submission is no longer supported.", 400, "OFFLOAD_DR_REQUIRED");
    const report = await createOffload(actor, { trip_id: body.trip_id, trip_stop_id: body.trip_stop_id, reason: body.remarks, request_id: request.requestId });
    return { event_type: "OFFLOAD" as const, dispatch_number: null, report };
  }
  const submission = validateOperationsEventSubmission(input);
  if (submission.eventType === "OFFLOAD") throw new ApiError("Select a delivery transaction by DR Number.", 400, "OFFLOAD_DR_REQUIRED");
  const { data: stopMatches, error: stopLookupError } = await supabaseAdmin
    .from("trip_stops")
    .select("*")
    .eq("dispatch_number", submission.dispatchNumber)
    .limit(2);
  if (stopLookupError && !/dispatch_number|column/i.test(stopLookupError.message ?? "")) throwDb(stopLookupError, "resolve stop dispatch number");
  if ((stopMatches?.length ?? 0) > 1) throw new ApiError("That dispatch number matches multiple stops. Contact an administrator.", 409, "AMBIGUOUS_DISPATCH_NUMBER");
  let trip: Trip;
  let stopId: string | null = stopMatches?.[0]?.id ?? null;
  const { data: matches, error: lookupError } = await supabaseAdmin
    .from("trips")
    .select(OPERATIONAL_TRIP_SELECT)
    .eq("dispatch_number", submission.dispatchNumber)
    .limit(2);
  if (lookupError) throwDb(lookupError, "resolve dispatch number");
  if ((matches?.length ?? 0) > 1) throw new ApiError("That dispatch number matches multiple trips. Contact an administrator.", 409, "AMBIGUOUS_DISPATCH_NUMBER");
  if (stopId) {
    trip = await getTrip(actor, String(stopMatches![0].trip_id));
    if (matches?.[0] && matches[0].id !== trip.id) {
      throw new ApiError("That dispatch number matches more than one trip or stop. Contact an administrator.", 409, "AMBIGUOUS_DISPATCH_NUMBER");
    }
  } else {
    if (!matches?.length) throw new ApiError("No trip or stop matches that dispatch number.", 404, "TRIP_NOT_FOUND");
    trip = matches[0] as Trip;
    const { data: stops, error: stopsError } = await supabaseAdmin.from("trip_stops").select("id, trip_id").eq("trip_id", trip.id).limit(2);
    if (stopsError) throwDb(stopsError, "resolve dispatch stop scope");
    if ((stops?.length ?? 0) > 1) throw new ApiError("This trip has multiple stops and no stop matches that dispatch number. Use the dispatch number assigned to the intended stop.", 409, "AMBIGUOUS_DISPATCH_STOP");
    stopId = stops?.[0]?.id ?? null;
  }
  await assertActorTripAccess(actor, trip);

  const data = await createBackload(actor, { trip_id: trip.id, trip_stop_id: stopId, reason: submission.remarks, request_id: request.requestId });
  return { event_type: submission.eventType, dispatch_number: submission.dispatchNumber, report: data };
}

const EVENT_TYPE_TABLE = { LOADING: "loading_reports", UNLOADING: "unloading_reports", BACKLOAD: "backloads", OFFLOAD: "offloads" } as const;

export async function updateOperationsEventType(actor: ReportActor, sourceTypeValue: string, recordIdValue: string, input: unknown) {
  assertOperationsManagementRole(actor);
  const sourceType = sourceTypeValue.trim().toUpperCase() as keyof typeof EVENT_TYPE_TABLE;
  if (!(sourceType in EVENT_TYPE_TABLE)) throw new ApiError("source_type must identify a Loading, Unloading, Backload, or Offload report.", 400, "INVALID_SOURCE_TYPE");
  const id = requireReportUuid(recordIdValue, "report_id");
  const eventType = validateOperationsEventType(input);
  if (["BACKLOAD", "OFFLOAD"].includes(sourceType) && eventType.toUpperCase() !== sourceType) throw new ApiError("Offload and Backload report types cannot be relabeled after submission.",409,"REPORT_TYPE_IMMUTABLE");
  const table = EVENT_TYPE_TABLE[sourceType];
  const { data: current, error: readError } = await (supabaseAdmin.from(table) as any)
    .select("*").eq("id", id).maybeSingle();
  if (readError) throwDb(readError, "read report event type");
  if (!current) throw new ApiError("Operational report was not found.", 404, "REPORT_NOT_FOUND");
  const trip = await getTrip(actor, String(current.trip_id));
  const stopId = current.trip_stop_id ? String(current.trip_stop_id) : null;
  if (stopId) await getOwnedStop(trip.id, stopId);
  const query = (supabaseAdmin.from(table) as any).update({ event_type: eventType }).eq("id", id).eq("trip_id", trip.id);
  if (stopId) query.eq("trip_stop_id", stopId);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) {
    if (error.code === "42703" || /event_type.*does not exist/i.test(error.message ?? "")) {
      throw new ApiError("Event Type persistence requires the approved Operations Reports migration.", 503, "OPERATIONS_EVENT_TYPE_SCHEMA_PENDING");
    }
    throwDb(error, "update report event type");
  }
  if (!data) throw new ApiError("Operational report changed before its Event Type could be saved.", 409, "REPORT_EVENT_TYPE_CONFLICT");
  return data;
}

/** Delete one exact physical report. Linked receipts block deletion so their
 * private storage objects and metadata remain intact. Backload/Offload items
 * follow the verified parent-owned ON DELETE CASCADE relationship. */
async function deleteReportRecord(actor: ReportActor, sourceTypeValue: unknown, recordIdValue: unknown) {
  assertOperationsManagementRole(actor);
  const identity = validateOperationsReportSourceIdentity(sourceTypeValue, recordIdValue);
  if (identity.source_type === "OFFLOAD") return deleteOffloadPermanently(actor, identity.record_id);
  if (identity.source_type === "BACKLOAD") return deleteBackloadPermanently(actor, identity.record_id);
  const target = EVENT_REPORT_TABLE[identity.source_type];
  const { data: report, error: readError } = await (supabaseAdmin.from(target.table) as any)
    .select(identity.source_type === "LOADING" ? "id, trip_id" : "id, trip_id, trip_stop_id").eq("id", identity.record_id).maybeSingle();
  if (readError) throwDb(readError, "read report before delete");
  if (!report) throw new ApiError("Operational report was not found.", 404, "REPORT_NOT_FOUND");
  const trip = await getTrip(actor, String(report.trip_id));
  const stopId = typeof report.trip_stop_id === "string" ? report.trip_stop_id : null;
  if (stopId) await getOwnedStop(trip.id, stopId);

  const [sourceConversion, targetConversion, receiptResult] = await Promise.all([
    supabaseAdmin.from("operations_report_conversions").select("id").eq("source_type", identity.source_type).eq("source_id", identity.record_id).maybeSingle(),
    supabaseAdmin.from("operations_report_conversions").select("id").eq("target_type", identity.source_type).eq("target_id", identity.record_id).maybeSingle(),
    supabaseAdmin.from("report_receipts").select("id", { count: "exact", head: true }).eq(target.receiptColumn, identity.record_id),
  ]);
  if (sourceConversion.error) throwDb(sourceConversion.error, "check report conversion history");
  if (targetConversion.error) throwDb(targetConversion.error, "check report conversion history");
  if (sourceConversion.data || targetConversion.data) {
    throw new ApiError("This report is referenced by conversion history and cannot be deleted.", 409, "REPORT_CONVERSION_HISTORY_PROTECTED");
  }
  if (receiptResult.error) throwDb(receiptResult.error, "check report receipts");
  if ((receiptResult.count ?? 0) > 0) {
    throw new ApiError("This report cannot be deleted because its receipt images must be retained. Open View Details to review the attachments. No report or image was deleted.", 409, "REPORT_RECEIPTS_PROTECTED");
  }

  let query = (supabaseAdmin.from(target.table) as any).delete().eq("id", identity.record_id).eq("trip_id", trip.id);
  if (identity.source_type !== "LOADING") query = stopId ? query.eq("trip_stop_id", stopId) : query.is("trip_stop_id", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error?.code === "23503") throw new ApiError("Linked records now protect this report from deletion. Refresh and review View Details. No report or image was deleted.", 409, "REPORT_DEPENDENCIES_PROTECTED");
  if (error && /converted|conversion history|immutable/i.test(error.message ?? "")) throw new ApiError("This historical report is protected and cannot be deleted. No report or image was deleted.", 409, "REPORT_CONVERSION_HISTORY_PROTECTED");
  if (error) throwDb(error, "delete operational report");
  if (!data) throw new ApiError("The report changed before it could be deleted. Reload and retry.", 409, "REPORT_DELETE_CONFLICT");
  return { source_type: identity.source_type, record_id: identity.record_id, trip_id: trip.id, trip_stop_id: stopId };
}

async function getEventReportForActor(actor: ReportActor, eventType: OperationsReceiptType, recordId: string) {
  assertReportRole(actor);
  const id = requireReportUuid(recordId, "report_id");
  const target = EVENT_REPORT_TABLE[eventType];
  const columns = eventType === "LOADING" ? "id, trip_id" : eventType === "UNLOADING" ? "id, trip_id, trip_stop_id" : "id, trip_id, trip_stop_id";
  // The table is selected from a closed report-type map; the generated client
  // typings cannot express this dynamic table/column pairing.
  const { data, error } = await (supabaseAdmin.from(target.table) as any)
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) throwDb(error, "read report receipt scope");
  if (!data) throw new ApiError("Report not found.", 404, "REPORT_NOT_FOUND");
  const trip = await validateReportScope(actor, data.trip_id, "trip_stop_id" in data ? data.trip_stop_id : null);
  if(actor.role==='TRUCKER'){
    let linkedQuery=supabaseAdmin.from('trip_events').select('assignment_id');linkedQuery=eventType==='BACKLOAD'||eventType==='OFFLOAD'?linkedQuery.eq(eventType==='BACKLOAD'?'backload_id':'offload_id',id):linkedQuery.eq('delivery_metadata->>report_id',id);const linked=await linkedQuery.limit(1).maybeSingle();
    if(linked.error)throwDb(linked.error,'check delivery report assignment');
    if(!linked.data?.assignment_id||!await hasCrewAccess(actor.profileId,linked.data.assignment_id))throw new ApiError('This report belongs to another truck assignment.',403,'REPORT_FORBIDDEN');
  }
  await assertReportSourceNotConverted(eventType, id);
  return { target, report: data, trip };
}

function validateReceiptImage(bytes: Buffer, contentType: string) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_RECEIPT_BYTES) {
    throw new ApiError("Choose a JPEG, PNG, or WebP image up to 5 MB.", 400, "INVALID_IMAGE");
  }
  const detectedType = imageMime(bytes);
  if (!detectedType || detectedType !== contentType || !(detectedType in RECEIPT_IMAGE_TYPES)) {
    throw new ApiError("The uploaded file must be a valid JPEG, PNG, or WebP image.", 400, "INVALID_IMAGE");
  }
  return detectedType as keyof typeof RECEIPT_IMAGE_TYPES;
}

export async function uploadOperationsReceipt(
  actor: ReportActor,
  eventTypeValue: string,
  recordId: string,
  bytes: Buffer,
  contentType: string,
  originalName: string,
  requestId?: string,
) {
  const eventType = parseEventType(eventTypeValue);
  const { report } = await getEventReportForActor(actor, eventType, recordId);
  const mimeType = validateReceiptImage(bytes, contentType);
  const fileName = originalName.trim().replace(/[\\/\0\r\n]/g, "").slice(0, 255)
    || `report-image.${RECEIPT_IMAGE_TYPES[mimeType]}`;
  return uploadReceiptOnce(actor, eventType, report.id, bytes, mimeType, fileName, requestId);

}

export async function listOperationsReceipts(actor: ReportActor, eventTypeValue: string, recordId: string) {
  const eventType = parseReceiptEventType(eventTypeValue);
  const { target, report } = await getEventReportForActor(actor, eventType, recordId);
  const { data, error } = await supabaseAdmin.from("report_receipts")
    .select("id, storage_path, file_name, mime_type, file_size_bytes, uploaded_by, received_at, created_at, upload_status, upload_request_id")
    .eq(target.receiptColumn, report.id)
    .order("created_at", { ascending: true });
  if (error) throwDb(error, "read report images");
  const receiptLinks=await signStoragePaths(RECEIPT_BUCKET,(data??[]).filter(receipt=>receipt.upload_status!=="PENDING").map(receipt=>receipt.storage_path),60*60);
  const existing = (data ?? []).map(receipt => {
    if (receipt.upload_status === "PENDING") {
      const { storage_path: _path, upload_request_id, ...pending } = receipt;
      return { ...pending, signed_url: "", ...(receipt.uploaded_by === actor.profileId ? { upload_request_id } : {}) };
    }
    const signedUrl=receiptLinks.get(receipt.storage_path);
    if (!signedUrl) throw new ApiError("Unable to create a secure report image link.", 502, "REPORT_IMAGE_LINK_FAILED");
    const { storage_path: _privatePath, upload_request_id: _requestId, ...safeReceipt } = receipt;
    return { ...safeReceipt, signed_url: signedUrl };
  });
  if(eventType!=="BACKLOAD"&&eventType!=="OFFLOAD")return existing;
  const events=await supabaseAdmin.from("trip_events").select("id").eq(eventType==="BACKLOAD"?"backload_id":"offload_id",report.id).limit(10);
  if(events.error)throwDb(events.error,"read delivery report evidence");
  if(!events.data?.length)return existing;
  const images=await supabaseAdmin.from("trip_images").select("id,storage_path,file_name,mime_type,uploaded_by,created_at").in("delivery_event_id",events.data.map(e=>e.id)).eq("delivery_upload_state","READY").limit(60);
  if(images.error)throwDb(images.error,"read delivery evidence images");
  const imageLinks=await signStoragePaths("trip-images",(images.data??[]).map(image=>image.storage_path),600);
  const linked=(images.data??[]).map(({storage_path,...image})=>{const signedUrl=imageLinks.get(storage_path);if(!signedUrl)throw new ApiError("Evidence link unavailable. Retry to refresh it.",503);return {...image,signed_url:signedUrl,upload_status:"READY",file_size_bytes:null,received_at:image.created_at};});
  return [...existing,...linked];
}

async function assertExistingReportScope(table: "backloads" | "offloads", recordId: string, tripId: string) {
  const { data, error } = await supabaseAdmin.from(table).select("id, trip_id, trip_stop_id").eq("id", recordId).maybeSingle();
  if (error) throwDb(error, "read report scope");
  if (!data || data.trip_id !== tripId) throw new ApiError("Report not found for this trip.", 404, "REPORT_NOT_FOUND");
  if (data.trip_stop_id) await getOwnedStop(tripId, data.trip_stop_id);
}

async function assertReportSourceNotConverted(sourceType: "LOADING" | "UNLOADING" | "BACKLOAD" | "OFFLOAD", sourceId: string) {
  const { data, error } = await supabaseAdmin.from("operations_report_conversions")
    .select("id").eq("source_type", sourceType).eq("source_id", sourceId).maybeSingle();
  if (error) throwDb(error, "check converted report state");
  assertReportSourceNotConvertedInLedger(data ? [{ source_type: sourceType, source_id: sourceId }] : [], sourceType, sourceId);
}

export async function createBackload(actor: ReportActor, input: unknown) {
  const { body, requestId = randomUUID() } = submissionRequest(input);
  const parsed = validateBackloadOffloadInput(body, true, true);
  const trip = await validateReportScope(actor, parsed.tripId!, parsed.stopId);
  await assertNewReportTransactionActive(trip, parsed.stopId);
  return submitReportOnce(actor, requestId, "BACKLOAD", body, { trip_id: trip.id, trip_stop_id: parsed.stopId ?? null, ...parsed.fields });
}

export async function updateBackload(actor: ReportActor, recordId: string, input: unknown) {
  const id = requireReportUuid(recordId, "backload_id");
  const parsed = validateBackloadOffloadInput(input, true);
  const trip = await validateReportScope(actor, parsed.tripId!, parsed.stopId);
  await assertExistingReportScope("backloads", id, trip.id);
  await assertReportSourceNotConverted("BACKLOAD", id);
  const update = { ...(parsed.stopId === undefined ? {} : { trip_stop_id: parsed.stopId }), ...parsed.fields };
  const { data, error } = await supabaseAdmin.from("backloads").update(update).eq("id", id).eq("trip_id", trip.id).select(BACKLOAD_SELECT).maybeSingle();
  if (error) throwDb(error, "update backload");
  if (!data) throw new ApiError("Backload not found for this trip.", 404, "BACKLOAD_NOT_FOUND");
  return data;
}

export async function createOffload(actor: ReportActor, input: unknown) {
  assertReportRole(actor);
  const { body: payload, requestId = randomUUID() } = submissionRequest(input);
  const { body, metadata } = splitOffloadDetails(payload, actor, true);
  const quantity = body.quantity, totalCbm = body.total_cbm;
  delete body.quantity; delete body.total_cbm;
  const parsed = validateBackloadOffloadInput(body, true, true);
  const trip = await getTrip(actor, parsed.tripId!);
  await assertActorTripAccess(actor, trip);
  if (!parsed.stopId) throw new ApiError("Select an eligible delivery transaction by DR Number.", 400, "OFFLOAD_DR_REQUIRED");
  const stop = await getOwnedStop(trip.id, parsed.stopId) as Stop & { dr_number?: string | null; quantity?: number | null; total_cbm?: number | null; archived_at?: string | null };
  if (trip.archived_at || stop.archived_at) throw new ApiError("This transaction is archived and cannot receive new reports.", 409, "TRANSACTION_ARCHIVED");
  if (!stop.dr_number?.trim()) throw new ApiError("The selected transaction no longer has a DR Number. Select another transaction.", 409, "OFFLOAD_DR_REQUIRED");
  await assertEligibleReporter(metadata.reported_by);
  const item = validateOperationsOffloadItemUpdate({ id: randomUUID(), trip_line_item_id: null,
    quantity: quantity === undefined ? stop?.quantity ?? null : quantity,
    total_cbm: totalCbm === undefined ? stop?.total_cbm ?? null : totalCbm });
  return submitReportOnce(actor, requestId, "OFFLOAD", payload,
    { trip_id: trip.id, trip_stop_id: parsed.stopId ?? null, ...parsed.fields, ...metadata },
    { quantity: item.quantity, total_cbm: item.total_cbm });
}

export async function searchOffloadTransactions(actor: ReportActor, search: string, page = 1) {
  assertReportRole(actor);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || search.length > 200) throw new ApiError("Invalid transaction search or page.", 400, "INVALID_LOOKUP_QUERY");
  let query = supabaseAdmin.from("v_dispatch_monitoring")
    .select("_trip_id,_trip_stop_id,dispatch_number,transaction_dr_number,transaction_quantity,transaction_total_cbm,warehouse_name,store_name,customer_name,driver_name,plate_number")
    .is("transaction_archived_at", null).not("transaction_dr_number", "is", null).neq("transaction_dr_number", "")
    .order("transaction_dr_number").order("_trip_id").order("_trip_stop_id")
    .range((page - 1) * 50, page * 50);
  if (actor.role.toUpperCase() === "TRUCKER") {
    const ids = await getDriverTripIds(actor.profileId);
    if (!ids.length) return { rows: [], hasMore: false, page };
    query = query.in("_trip_id", ids);
  }
  const filter = buildIlikeOrFilter(["transaction_dr_number", "warehouse_name", "store_name", "customer_name"], search);
  if (filter) query = query.or(filter);
  const { data, error } = await query;
  if (error) throwDb(error, "read DR transactions");
  return { rows: (data ?? []).slice(0, 50).filter((row) => row.transaction_dr_number?.trim() && row._trip_stop_id).map((row) => ({
    id: row._trip_stop_id, trip_id: row._trip_id, trip_stop_id: row._trip_stop_id,
    dr_number: row.transaction_dr_number, dispatch_number: row.dispatch_number,
    warehouse: row.warehouse_name, destination: row.store_name || row.customer_name || null,
    driver_name: row.driver_name, plate_number: row.plate_number,
    quantity: row.transaction_quantity, total_cbm: row.transaction_total_cbm,
    route: [row.warehouse_name, row.store_name || row.customer_name].filter(Boolean).join(" → "),
  })), hasMore: (data?.length ?? 0) > 50, page };
}

async function assertEligibleReporter(id: unknown) {
  const { data, error } = await supabaseAdmin.from("profiles").select("id,role").eq("id", requireReportUuid(id, "reported_by")).maybeSingle();
  if (error) throwDb(error, "read reporter");
  if (!data || !["ADMIN", "STAFF", "TRUCKER"].includes(String(data.role).toUpperCase())) throw new ApiError("Choose an eligible ADMIN, STAFF or TRUCKER user.", 400, "INVALID_REPORTER");
}

export async function listOperationsReporters(actor: ReportActor, search: string) {
  assertOperationsManagementRole(actor);
  let query = supabaseAdmin.from("profiles").select("id,first_name,last_name,role").in("role", ["ADMIN", "STAFF", "TRUCKER"]).order("first_name").order("last_name").order("id").limit(100);
  for (const term of search.trim().split(/\s+/).filter(Boolean).slice(0, 8)) {
    const filter = buildIlikeOrFilter(["first_name", "last_name"], term);
    if (filter) query = query.or(filter);
  }
  const { data, error } = await query;
  if (error) throwDb(error, "list reporters");
  return (data ?? []).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || "Name not recorded", role: profile.role }));
}

export async function updateOffload(actor: ReportActor, recordId: string, input: unknown) {
  const id = requireReportUuid(recordId, "offload_id");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("Request body must be an object.", 400, "INVALID_BODY");
  const { body, metadata } = splitOffloadDetails(input, actor, false);
  const itemInput = body.item === undefined ? null : validateOperationsOffloadItemUpdate(body.item);
  const parentInput = { ...body };
  delete parentInput.item;
  const parsed = validateBackloadOffloadInput(parentInput);
  const requestedTripId = parsed.tripId ?? requireReportUuid(parentInput.trip_id, "trip_id");
  const trip = await validateReportScope(actor, requestedTripId, parsed.stopId);
  const { data: report, error: reportError } = await supabaseAdmin.from("offloads")
    .select(OFFLOAD_SELECT)
    .eq("id", id)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (reportError) throwDb(reportError, "read Offload scope");
  if (!report) throw new ApiError("Offload not found for this trip.", 404, "OFFLOAD_NOT_FOUND");
  if (report.trip_stop_id) await getOwnedStop(trip.id, report.trip_stop_id);
  if (itemInput && parsed.stopId !== undefined && parsed.stopId !== report.trip_stop_id) {
    throw new ApiError("An Offload item cannot be edited while changing its stop association.", 409, "OFFLOAD_ITEM_SCOPE_CONFLICT");
  }
  await assertReportSourceNotConverted("OFFLOAD", id);
  if (metadata.reported_by) await assertEligibleReporter(metadata.reported_by);
  let existingItem: Record<string, unknown> | null = null;
  if (itemInput?.trip_line_item_id) {
    const { data, error } = await supabaseAdmin.from("trip_line_items")
      .select("id, trip_id, trip_stop_id")
      .eq("id", itemInput.trip_line_item_id)
      .maybeSingle();
    if (error) throwDb(error, "read Offload source item");
    if (!data) throw new ApiError("The source trip line item was not found.", 404, "OFFLOAD_SOURCE_ITEM_NOT_FOUND");
    assertOffloadItemSourceScope(report, data);
  }

  const readExistingOffloadItem = async (item: NonNullable<typeof itemInput>) => {
    const { data: byId, error: idError } = await supabaseAdmin.from("offload_items")
      .select("id, offload_id, trip_line_item_id")
      .eq("id", item.id)
      .maybeSingle();
    if (idError) throwDb(idError, "read Offload item");
    if (byId) return byId;
    let bySourceQuery = supabaseAdmin.from("offload_items")
      .select("id, offload_id, trip_line_item_id")
      .eq("offload_id", id);
    bySourceQuery = item.trip_line_item_id
      ? bySourceQuery.eq("trip_line_item_id", item.trip_line_item_id)
      : bySourceQuery.is("trip_line_item_id", null);
    const { data: bySource, error: sourceError } = await bySourceQuery.maybeSingle();
    if (sourceError?.code === "PGRST116") {
      throw new ApiError("Multiple Offload items match this source. Reload and resolve the duplicate rows before editing.", 409, "OFFLOAD_ITEM_AMBIGUOUS");
    }
    if (sourceError) throwDb(sourceError, "read Offload source item link");
    return bySource;
  };
  if (itemInput) {
    existingItem = await readExistingOffloadItem(itemInput);
    if (existingItem && (existingItem.offload_id !== id || existingItem.trip_line_item_id !== itemInput.trip_line_item_id)) {
      throw new ApiError("The Offload item does not belong to this report and source item.", 409, "OFFLOAD_ITEM_SCOPE_CONFLICT");
    }
  }

  // Resolve and validate every report/item relationship before the first write.
  const update = {
    ...(parsed.stopId === undefined || parsed.stopId === report.trip_stop_id ? {} : { trip_stop_id: parsed.stopId }),
    ...parsed.fields,
    ...metadata,
  };
  let savedReport = report;
  if (Object.keys(update).length) {
    const { data, error } = await supabaseAdmin.from("offloads").update(update).eq("id", id).eq("trip_id", trip.id).select(OFFLOAD_SELECT).maybeSingle();
    if (error) throwDb(error, "update offload");
    if (!data) throw new ApiError("Offload not found for this trip.", 404, "OFFLOAD_NOT_FOUND");
    savedReport = data;
  }
  if (!itemInput) return savedReport;

  if (existingItem) {
    const values = Object.fromEntries(["quantity", "total_cbm"].filter((field) => field in itemInput).map((field) => [field, itemInput[field as "quantity" | "total_cbm"]]));
    const { data, error } = await supabaseAdmin.from("offload_items").update(values)
      .eq("id", existingItem.id).eq("offload_id", id).select("id, offload_id, trip_line_item_id, quantity, total_cbm, dr_number, customer_model").maybeSingle();
    if (error) throwDb(error, "update Offload item");
    if (!data) throw new ApiError("Offload item not found for this report.", 404, "OFFLOAD_ITEM_NOT_FOUND");
    return { report: savedReport, item: data };
  }

  const { data, error } = await supabaseAdmin.from("offload_items").insert({
    id: itemInput.id,
    offload_id: id,
    trip_line_item_id: itemInput.trip_line_item_id,
    quantity: itemInput.quantity === undefined ? null : itemInput.quantity,
    total_cbm: itemInput.total_cbm === undefined ? null : itemInput.total_cbm,
  }).select("id, offload_id, trip_line_item_id, quantity, total_cbm, dr_number, customer_model").single();
  if (error) {
    if (error.code === "23505") {
      // A prior request with this client-generated item ID may have committed
      // even if its response was lost. Re-read by ID and retry as an update
      // only when the existing row has the exact same parent/source scope.
      const racedItem = await readExistingOffloadItem(itemInput);
      if (racedItem && racedItem.offload_id === id && racedItem.trip_line_item_id === itemInput.trip_line_item_id) {
        const values = Object.fromEntries(["quantity", "total_cbm"].filter((field) => field in itemInput).map((field) => [field, itemInput[field as "quantity" | "total_cbm"]]));
        const { data: retriedItem, error: retryError } = await supabaseAdmin.from("offload_items").update(values)
          .eq("id", racedItem.id).eq("offload_id", id).select("id, offload_id, trip_line_item_id, quantity, total_cbm, dr_number, customer_model").maybeSingle();
        if (retryError) throwDb(retryError, "retry Offload item update");
        if (!retriedItem) throw new ApiError("Offload item not found for this report.", 404, "OFFLOAD_ITEM_NOT_FOUND");
        return { report: savedReport, item: retriedItem };
      }
      if (racedItem) throw new ApiError("The Offload item does not belong to this report and source item.", 409, "OFFLOAD_ITEM_SCOPE_CONFLICT");
      throw new ApiError("This Offload item conflicts with an existing item. Reload the report and retry.", 409, "OFFLOAD_ITEM_CONFLICT");
    }
    throwDb(error, "create Offload item");
  }
  return { report: savedReport, item: data };
}

/** One fresh session authorization is bound to this immutable, bounded record batch. */
export function createOperationsReportDeleter(verify=withCurrentUserSession){
 return async function deleteBatch(actor: ReportActor, input: unknown, credentials: DeletionCredentials) {
  assertOperationsManagementRole(actor);
  if(!Array.isArray(input)||!input.length||input.length>20) throw new ApiError("Select between 1 and 20 report records.",400,"INVALID_REPORT_BATCH");
  const targets=Object.freeze([...new Map(input.map(value=>{
    if(!value||typeof value!=="object")throw new ApiError("Invalid report selection.",400,"INVALID_REPORT_BATCH");
    const row=value as Record<string,unknown>,identity=validateOperationsReportSourceIdentity(row.source_type,row.record_id);
    return [`${identity.source_type}:${identity.record_id}`,Object.freeze(identity)] as const;
  })).values()]);
  const owner=Object.freeze({...actor});
  return verify({id:owner.profileId,role:owner.role},credentials,async()=>{
    const outcomes=[];
    for(const target of targets){
      try{
        const result = await deleteReportRecord(owner,target.source_type,target.record_id);
        outcomes.push({...target,success:true as const,result});
        try { collaborationEvents.emit("commit", { source: EVENT_REPORT_TABLE[target.source_type].table, recordId: target.record_id, tripId: result.trip_id, stopId: result.trip_stop_id ?? undefined, fields: [], version: null, actorId: owner.profileId, operation: "DELETE", eventId: `${EVENT_REPORT_TABLE[target.source_type].table}:${target.record_id}:deleted` }); }
        catch { console.warn("Report deletion committed; realtime notification requires reconciliation."); }
      }
      catch(error){outcomes.push({...target,success:false as const,message:error instanceof ApiError ? error.message : "This report deletion could not be confirmed. Refresh before retrying.",code:error instanceof ApiError ? error.code : "REPORT_DELETE_UNCONFIRMED"});}
    }
    return {outcomes};
  });
}
}
export const deleteOperationsReports=createOperationsReportDeleter();
export async function deleteOperationsReport(actor: ReportActor, sourceType:unknown, recordId:unknown, credentials:DeletionCredentials={password:undefined,accessToken:"",appSessionId:null}){
 const response=await deleteOperationsReports(actor,[{source_type:sourceType,record_id:recordId}],credentials);
 const outcome=response.outcomes[0];
 if(!outcome.success)throw new ApiError(outcome.message??"Report deletion failed.",409,outcome.code);
 return outcome.result;
}
