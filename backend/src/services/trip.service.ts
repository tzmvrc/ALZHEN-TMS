import {deletePhysicalRecord} from "./record-deletion.service.js";
import {ApiError} from "../utils/api-response.js";
import { supabaseAdmin } from "../config/supabase.js";
import { collaborationSelect } from "./collaboration-events.js";
import { normalizeTransactionNumber } from "./transaction-values.logic.js";
import { assertActiveDropdownOption } from "./dropdown-option.service.js";
import {
  TripCreateInput,
  TripDetail,
  TripListResponse,
  TripQueryParams,
  TripRecord,
  TripUpdateInput,
} from "../types/trip.types.js";
import {
  buildPaginationMeta,
  normalizePagination,
} from "../utils/pagination.js";
import {
  isValidUuid,
  normalizeSortOrder,
  normalizeText,
} from "../utils/validation.js";
import { buildIlikeOrFilter } from "../utils/postgrest-search.js";
import { dispatchReferencePrefix, nextReference } from "./trip-reference.logic.js";
import { tripReferenceAvailable } from "./trip-reference.schema.js";

const ALLOWED_TRIP_SORTS = [
  "loading_date",
  "estimated_delivery_date",
  "dispatch_number",
  "trip_number",
  "transaction_number",
  "status",
  "created_at",
  "updated_at",
];

const TRIP_CREATE_FIELDS = [
  "dispatch_number",
  "trip_type_id",
  "warehouse_id",
  "loading_date",
  "estimated_delivery_date",
  "status",
  "authorization_letter",
  "page_no",
  "remarks",
  "transaction_number",
  "trip_number",
  "added_to_report",
  "letter_status",
  "truck_allocated_by",
  "subcon_rate_manual",
  "signed_dr_upload_date",
  "transmittal_date",
  "tms_date",
  "tms_done_by",
  "pod_ac_shipping_date",
  "lbc_tracking_number",
  "request_received_at",
  "departure_from_warehouse_at",
  "spreadsheet_issue_type",
  "spreadsheet_issue_reason",
] as const;

const TRIP_UPDATE_FIELDS = [
  "dispatch_number",
  "trip_type_id",
  "warehouse_id",
  "loading_date",
  "estimated_delivery_date",
  "status",
  "authorization_letter",
  "page_no",
  "remarks",
  "transaction_number",
  "trip_number",
  "added_to_report",
  "letter_status",
  "truck_allocated_by",
  "subcon_rate_manual",
  "signed_dr_upload_date",
  "transmittal_date",
  "tms_date",
  "tms_done_by",
  "pod_ac_shipping_date",
  "lbc_tracking_number",
  "request_received_at",
  "departure_from_warehouse_at",
  "spreadsheet_issue_type",
  "spreadsheet_issue_reason",
] as const;

function parseDateString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return value === "" ? null : (value ?? undefined);
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null.`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date string.`);
  }

  return trimmed;
}

function normalizeTripQuery(query: Record<string, unknown>) {
  const sortBy = ALLOWED_TRIP_SORTS.includes(String(query.sort_by ?? ""))
    ? String(query.sort_by)
    : "loading_date";
  const sortOrder = normalizeSortOrder(
    typeof query.sort_order === "string" ? query.sort_order : undefined,
    "desc",
  );

  if (
    query.page &&
    (Number(query.page) <= 0 || !Number.isInteger(Number(query.page)))
  ) {
    throw new Error("page must be a positive integer");
  }

  if (
    query.limit &&
    (Number(query.limit) <= 0 ||
      Number(query.limit) > 100 ||
      !Number.isInteger(Number(query.limit)))
  ) {
    throw new Error("limit must be a positive integer up to 100");
  }

  return { sortBy, sortOrder };
}

function applyTripSearch(queryBuilder: any, search: string, hasTripReference: boolean) {
  const filter = buildIlikeOrFilter(
    ["dispatch_number", "transaction_number", ...(hasTripReference ? ["trip_reference"] : []), "remarks"],
    search,
  );
  return filter ? queryBuilder.or(filter) : queryBuilder;
}

function sanitizeUuid(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }

  return value;
}

function sanitizeString(value: unknown, fieldName: string, maxLength?: number) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (maxLength && trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds the maximum length allowed.`);
  }

  return trimmed;
}

function sanitizeNumber(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`${fieldName} must be numeric.`);
}

function sanitizeBoolean(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  throw new Error(`${fieldName} must be a boolean.`);
}

function buildTripPayload(
  input: TripCreateInput | TripUpdateInput,
  userId?: string,
) {
  const payload: Record<string, unknown> = {};

  for (const field of TRIP_CREATE_FIELDS) {
    if (!(field in input)) continue;
    const value = (input as Record<string, unknown>)[field];

    if (value === null) {
      payload[field] = null;
      continue;
    }

    if(field==="spreadsheet_issue_type"||field==="spreadsheet_issue_reason"){
      payload[field]=sanitizeString(value,field,field==="spreadsheet_issue_type"?500:2000);
    } else if (field === "dispatch_number") {
      payload[field] = sanitizeString(value, "dispatch_number", 100);
    } else if (
      field === "trip_type_id" ||
      field === "warehouse_id" ||
      field === "tms_done_by" ||
      field === "truck_allocated_by"
    ) {
      payload[field] = sanitizeUuid(value, field);
    } else if (
      field === "loading_date" ||
      field === "estimated_delivery_date" ||
      field === "signed_dr_upload_date" ||
      field === "transmittal_date" ||
      field === "tms_date" ||
      field === "pod_ac_shipping_date" ||
      field === "request_received_at" ||
      field === "departure_from_warehouse_at"
    ) {
      payload[field] = parseDateString(value, field);
    } else if (
      field === "page_no" ||
      field === "subcon_rate_manual" ||
      field === "trip_number"
    ) {
      const parsed = sanitizeNumber(value, field);
      if (field === "trip_number" && parsed !== undefined && !Number.isInteger(parsed)) {
        throw new Error("trip_number must be an integer.");
      }
      payload[field] = parsed;
    } else if (field === "added_to_report") {
      payload[field] = sanitizeBoolean(value, field);
    } else if (
      field === "status" ||
      field === "authorization_letter" ||
      field === "remarks" ||
      field === "transaction_number" ||
      field === "letter_status" ||
      field === "lbc_tracking_number"
    ) {
      payload[field] = sanitizeString(value, field, 255);
    } else {
      payload[field] = value;
    }
  }

  if (userId) {
    payload.created_by = userId;
  }

  if (
    payload.dispatch_number !== undefined &&
    payload.dispatch_number === null
  ) {
    delete payload.dispatch_number;
  }

  return payload;
}

async function validateTripReferences(payload: Record<string, unknown>) {
  if (typeof payload.trip_type_id === "string") {
    const { data, error } = await supabaseAdmin
      .from("trip_types")
      .select("id, active")
      .eq("id", payload.trip_type_id)
      .maybeSingle();
    if (error) throw new Error("Unable to validate trip type.");
    if (!data) throw new Error("Trip type not found.");
    if (data.active !== true) throw new Error("Trip type must be active.");
  }

  if (typeof payload.warehouse_id === "string") {
    const { data, error } = await supabaseAdmin
      .from("warehouses")
      .select("id, status")
      .eq("id", payload.warehouse_id)
      .maybeSingle();
    if (error) throw new Error("Unable to validate warehouse.");
    if (!data) throw new Error("Warehouse not found.");
    if (String(data.status).toUpperCase() !== "ACTIVE") {
      throw new Error("Warehouse must be active.");
    }
  }
}

function isDuplicateDispatchError(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "23505" ||
    /dispatch_number/.test(message) ||
    /duplicate key/.test(message)
  );
}

export async function getTripList(
  query: TripQueryParams,
): Promise<TripListResponse> {
  const { sortBy, sortOrder } = normalizeTripQuery(
    query as Record<string, unknown>,
  );
  const { page, limit, from } = normalizePagination(query, 100);
  const search = normalizeText(query.search);
  const status = normalizeText(query.status);
  const dateFrom = normalizeText(query.date_from ?? query.loading_date_from);
  const dateTo = normalizeText(query.date_to ?? query.loading_date_to);
  const warehouseId = normalizeText(query.warehouse_id);
  const tripTypeId = normalizeText(query.trip_type_id);

  let queryBuilder = supabaseAdmin
    .from("trips")
    .select("*", { count: "exact" });

  // Match the Trips screen: a trip remains visible while at least one of its
  // transactions is unarchived (including trips with no stops yet).
  if (query.archive_scope === "active") {
    const activeIds = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data: transactions, error: archiveError } = await supabaseAdmin
        .from("v_dispatch_monitoring")
        .select("trip_id")
        .is("transaction_archived_at", null)
        .order("trip_id")
        .range(offset, offset + 999);
      if (archiveError) throw new Error("Unable to fetch active trip transactions");
      for (const row of transactions ?? []) {
        if (typeof row.trip_id === "string") activeIds.add(row.trip_id);
      }
      if (!transactions || transactions.length < 1000) break;
    }
    if (activeIds.size === 0) {
      return { rows: [], pagination: buildPaginationMeta(page, limit, 0) };
    }
    queryBuilder = queryBuilder.in("id", [...activeIds]);
  }

  if (status) queryBuilder = queryBuilder.eq("status", status);
  if (dateFrom) queryBuilder = queryBuilder.gte("loading_date", dateFrom);
  if (dateTo) queryBuilder = queryBuilder.lte("loading_date", dateTo);
  if (warehouseId) {
    if (!isValidUuid(warehouseId))
      throw new Error("warehouse_id must be a valid UUID.");
    queryBuilder = queryBuilder.eq("warehouse_id", warehouseId);
  }
  if (tripTypeId) {
    if (!isValidUuid(tripTypeId))
      throw new Error("trip_type_id must be a valid UUID.");
    queryBuilder = queryBuilder.eq("trip_type_id", tripTypeId);
  }
  if (search) queryBuilder = applyTripSearch(queryBuilder, search, await tripReferenceAvailable());

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.range(from, from + limit - 1);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error("Trip list query error:", { query, error });
    throw new Error("Unable to fetch trips");
  }

  return {
    rows: (data ?? []) as TripRecord[],
    pagination: buildPaginationMeta(page, limit, count ?? (data ?? []).length),
  };
}

async function getTripReferenceMap(
  ids: string[],
  table: string,
  select = "id, code, name",
) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, Record<string, unknown>>();

  const { data, error } = await supabaseAdmin
    .from(table)
    .select(select)
    .in("id", uniqueIds);

  if (error) {
    return new Map<string, Record<string, unknown>>();
  }

  const map = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    if (typeof row === "object" && row !== null && "id" in row) {
      const record = row as Record<string, unknown>;
      if (typeof record.id === "string" && record.id) {
        map.set(record.id, record);
      }
    }
  }

  return map;
}

async function getTripProfileMap(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, Record<string, unknown>>();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", uniqueIds);

  if (error) {
    return new Map<string, Record<string, unknown>>();
  }

  const map = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    if (typeof row === "object" && row !== null && "id" in row) {
      const record = row as Record<string, unknown>;
      if (typeof record.id === "string" && record.id) {
        map.set(record.id, record);
      }
    }
  }

  return map;
}

export async function getTripById(id: string): Promise<TripDetail> {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const fields = "id, dispatch_number, trip_type_id, warehouse_id, loading_date, estimated_delivery_date, status, authorization_letter, page_no, remarks, created_by, created_at, updated_at, transaction_number, trip_number, added_to_report, letter_status, truck_allocated_by, subcon_rate_manual, signed_dr_upload_date, transmittal_date, tms_date, tms_done_by, pod_ac_shipping_date, lbc_tracking_number, request_received_at, departure_from_warehouse_at".split(", ");
  if (await tripReferenceAvailable()) fields.push("trip_reference");
  const { data, error } = await supabaseAdmin
    .from("trips")
    .select(
      fields.join(", "),
    )
    .eq("id", id)
    .maybeSingle()
    .returns<TripRecord>();

  if (error) {
    console.error("Trip detail query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip details");
  }

  if (!data) {
    throw new Error("Trip not found");
  }

  const tripRecord = data as TripRecord;
  const tripTypeMap = await getTripReferenceMap(
    tripRecord.trip_type_id ? [tripRecord.trip_type_id] : [],
    "trip_types",
    "id, code, name",
  );
  const warehouseMap = await getTripReferenceMap(
    tripRecord.warehouse_id ? [tripRecord.warehouse_id] : [],
    "warehouses",
    "id, code, name",
  );
  const createdByProfileMap = await getTripProfileMap(
    tripRecord.created_by ? [tripRecord.created_by] : [],
  );
  const tmsDoneByProfileMap = await getTripProfileMap(
    tripRecord.tms_done_by ? [tripRecord.tms_done_by] : [],
  );

  const tripType = tripRecord.trip_type_id
    ? (tripTypeMap.get(tripRecord.trip_type_id) ?? null)
    : null;
  const warehouse = tripRecord.warehouse_id
    ? (warehouseMap.get(tripRecord.warehouse_id) ?? null)
    : null;
  const createdByProfile = tripRecord.created_by
    ? (createdByProfileMap.get(tripRecord.created_by) ?? null)
    : null;
  const tmsDoneByProfile = tripRecord.tms_done_by
    ? (tmsDoneByProfileMap.get(tripRecord.tms_done_by) ?? null)
    : null;

  return {
    trip: tripRecord,
    trip_type: tripType
      ? {
          id: typeof tripType.id === "string" ? tripType.id : null,
          code: typeof tripType.code === "string" ? tripType.code : null,
          name: typeof tripType.name === "string" ? tripType.name : null,
        }
      : null,
    warehouse: warehouse
      ? {
          id: typeof warehouse.id === "string" ? warehouse.id : null,
          code: typeof warehouse.code === "string" ? warehouse.code : null,
          name: typeof warehouse.name === "string" ? warehouse.name : null,
        }
      : null,
    created_by_profile: createdByProfile
      ? {
          id:
            typeof createdByProfile.id === "string"
              ? createdByProfile.id
              : null,
          first_name:
            typeof createdByProfile.first_name === "string"
              ? createdByProfile.first_name
              : null,
          last_name:
            typeof createdByProfile.last_name === "string"
              ? createdByProfile.last_name
              : null,
          full_name:
            [createdByProfile.first_name, createdByProfile.last_name]
              .filter(
                (value) => typeof value === "string" && value.trim().length > 0,
              )
              .join(" ") || null,
        }
      : null,
    tms_done_by_profile: tmsDoneByProfile
      ? {
          id:
            typeof tmsDoneByProfile.id === "string"
              ? tmsDoneByProfile.id
              : null,
          first_name:
            typeof tmsDoneByProfile.first_name === "string"
              ? tmsDoneByProfile.first_name
              : null,
          last_name:
            typeof tmsDoneByProfile.last_name === "string"
              ? tmsDoneByProfile.last_name
              : null,
          full_name:
            [tmsDoneByProfile.first_name, tmsDoneByProfile.last_name]
              .filter(
                (value) => typeof value === "string" && value.trim().length > 0,
              )
              .join(" ") || null,
        }
      : null,
  };
}

export async function getTripByDispatchNumber(dispatchNumberInput: string) {
  const dispatchNumber = dispatchNumberInput.trim();
  if (!dispatchNumber || dispatchNumber.length > 100) {
    throw new Error("Invalid dispatch number");
  }

  const { data, error } = await supabaseAdmin
    .from("trips")
    .select("id, dispatch_number")
    .eq("dispatch_number", dispatchNumber)
    .order("trip_number", { ascending: true, nullsFirst: false })
    .limit(2);

  if (error) {
    console.error("Trip dispatch lookup error:", { dispatchNumber, error });
    throw new Error("Unable to resolve dispatch number");
  }
  if (!data?.length) throw new Error("Trip not found");
  if(data.length>1)throw new ApiError("This dispatch contains multiple trips. Select the physical trip from Master List.",409,"AMBIGUOUS_DISPATCH");
  return data[0];
}


/** Next dispatch reference for a day, e.g. prefix "TRIP260305" -> "TRIP260305-3". */
export async function getNextDispatchNumber(prefixInput: string) {
  return getNextGeneratedReference(dispatchReferencePrefix(String(prefixInput ?? "")), "dispatch_number");
}

export async function getNextTripReference(dispatchPrefix: string) {
  const prefix = dispatchReferencePrefix(dispatchPrefix).replace(/^DISPATCH/, "TRIP");
  if (!await tripReferenceAvailable()) return null;
  return getNextGeneratedReference(prefix, "trip_reference");
}

async function getNextGeneratedReference(prefix: string, column: "dispatch_number" | "trip_reference") {
  const references: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from("trips").select(column).like(column, `${prefix}-%`).order("id").range(offset, offset + 999);
    if (error) throw new Error(`Unable to generate ${column === "dispatch_number" ? "dispatch" : "trip"} number`);
    const rows = data ?? [];
    references.push(...rows.map(row => (row as unknown as Record<string, unknown>)[column]));
    if (rows.length < 1000) return nextReference(prefix, references);
  }
}

export type DispatchOption = {
  dispatch_number: string;
  trip_count: number;
  next_trip_number: number;
  loading_date: string | null;
  warehouse_id: string | null;
  trip_type_id: string | null;
};

/** Existing dispatches (most recent first) with how many trips each already has. */
export async function listDispatchOptions(queryInput?: unknown): Promise<DispatchOption[]> {
  const q = typeof queryInput === "string" ? queryInput.trim().slice(0, 100) : "";
  let builder = supabaseAdmin
    .from("trips")
    .select("dispatch_number, trip_number, loading_date, warehouse_id, trip_type_id, created_at")
    .not("dispatch_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(3000);
  if (q) builder = builder.ilike("dispatch_number", `%${q.replace(/[\\%_]/g, "\\$&")}%`);

  const { data, error } = await builder;
  if (error) {
    console.error("Dispatch list query error:", { q, error });
    throw new Error("Unable to fetch dispatches");
  }

  const groups = new Map<string, DispatchOption & { highest: number }>();
  for (const row of data ?? []) {
    const key = String(row.dispatch_number);
    let group = groups.get(key);
    if (!group) {
      // rows arrive newest first, so the first row seen is the latest trip of that dispatch
      group = {
        dispatch_number: key, trip_count: 0, next_trip_number: 1, highest: 0,
        loading_date: row.loading_date ?? null, warehouse_id: row.warehouse_id ?? null, trip_type_id: row.trip_type_id ?? null,
      };
      groups.set(key, group);
    }
    group.trip_count += 1;
    if (typeof row.trip_number === "number") group.highest = Math.max(group.highest, row.trip_number);
    if (!group.loading_date && row.loading_date) group.loading_date = row.loading_date;
  }

  return [...groups.values()].slice(0, 200).map(({ highest, ...group }) => ({
    ...group,
    next_trip_number: Math.max(highest, group.trip_count) + 1,
  }));
}

/** Find a trip type by name (case-insensitive) or create it. Returns its id. */
export async function resolveTripTypeByName(nameInput: unknown): Promise<string> {
  const name = sanitizeString(nameInput, "trip_type_name", 100);
  if (!name) throw new Error("trip_type_name is required.");

  const findExisting = async () => {
    const escaped = name.replace(/[\\%_]/g, "\\$&"); // exact, case-insensitive match
    const { data, error } = await supabaseAdmin
      .from("trip_types")
      .select("id, active")
      .ilike("name", escaped)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Unable to look up trip type.");
    return data;
  };

  const existing = await findExisting();
  if (existing) {
    if (existing.active !== true) throw new Error("Trip type must be active.");
    return existing.id as string;
  }

  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  const { data, error } = await supabaseAdmin
    .from("trip_types")
    .insert({ name, code: code || null, active: true })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await findExisting(); // someone created it at the same moment
      if (raced) return raced.id as string;
    }
    console.error("Trip type create error:", { name, error });
    throw new Error("Unable to create trip type");
  }
  return data.id as string;
}

/** Find a product by model code (or SKU), case-insensitive, or create it. Returns its id. */
export async function resolveProductByCode(codeInput: unknown, categoryInput?: unknown): Promise<string> {
  const code = sanitizeString(codeInput, "product code", 100);
  if (!code) throw new Error("Product code is required.");
  const category = sanitizeString(categoryInput, "product category", 100);
  const escaped = code.replace(/[\\%_]/g, "\\$&"); // exact, case-insensitive match

  const findExisting = async () => {
    for (const column of ["model_code", "sku"] as const) {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("id, status")
        .ilike(column, escaped)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("Unable to look up product.");
      if (data) return data;
    }
    return null;
  };

  const existing = await findExisting();
  if (existing) {
    if (String(existing.status).toUpperCase() !== "ACTIVE") throw new Error("Product must be active.");
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .insert({ name: code, sku: code, model_code: code, category: category ?? null, status: "ACTIVE" })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await findExisting(); // created by someone else at the same moment
      if (raced) return raced.id as string;
    }
    console.error("Product create error:", { code, error });
    throw new Error("Unable to create product");
  }
  return data.id as string;
}

export async function createTripRecord(
  input: TripCreateInput,
  authUser?: { id?: string } | null,
  profile?: { id?: string } | null,
) {
  const creatorId = profile?.id ?? authUser?.id;
  if (!creatorId) {
    throw new Error("Authentication required to create a trip.");
  }

  const payload = buildTripPayload(input, creatorId);
  await validateTripReferences(payload);

  if (payload.status !== undefined) {
    await assertActiveDropdownOption("trip_status", payload.status);
  }
  if (payload.letter_status !== undefined) {
    await assertActiveDropdownOption("letter_status", payload.letter_status);
  }

  if (!payload.dispatch_number) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "2-digit", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: string) => parts.find(value => value.type === type)?.value ?? "";
    const date = typeof payload.loading_date === "string" ? payload.loading_date.slice(0, 10).replaceAll("-", "").slice(2) : `${part("year")}${part("month")}${part("day")}`;
    payload.dispatch_number = await getNextDispatchNumber(`DISPATCH${date}`);
  }

  const { data, error } = await supabaseAdmin
    .from("trips")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Trip create error:", { input, payload, error });
    if (isDuplicateDispatchError(error)) {
      throw new Error("A trip with this dispatch and trip number, or trip reference, already exists. Choose a different trip number/reference.");
    }
    throw new Error("Unable to create trip");
  }

  return data as TripRecord;
}

export async function updateTripRecord(
  id: string,
  input: TripUpdateInput,
  authUser?: { id?: string } | null,
  profile?: { id?: string } | null,
) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const unknownFields = Object.keys(input).filter(
    (field) =>
      field !== "created_by" &&
      !TRIP_UPDATE_FIELDS.includes(
        field as (typeof TRIP_UPDATE_FIELDS)[number],
      ),
  );
  if (unknownFields.length > 0) {
    throw new Error(`Invalid trip field(s): ${unknownFields.join(", ")}`);
  }

  if (input.created_by !== undefined) {
    delete (input as Record<string, unknown>).created_by;
  }

  const existing = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existing.error) {
    console.error("Trip update existence check error:", {
      id,
      error: existing.error,
    });
    throw new Error("Unable to update trip");
  }

  if (!existing.data) {
    throw new Error("Trip not found");
  }

  const payload = buildTripPayload(input, profile?.id ?? authUser?.id);
  await validateTripReferences(payload);
  if (payload.status !== undefined) {
    await assertActiveDropdownOption("trip_status", payload.status);
  }
  if (payload.letter_status !== undefined) {
    await assertActiveDropdownOption("letter_status", payload.letter_status);
  }
  if (Object.keys(payload).length === 0) {
    throw new Error("No valid trip fields were provided for update.");
  }

  if (payload.created_by !== undefined) {
    delete payload.created_by;
  }

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("trips")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Trip update error:", { id, input, payload, error });
    if (isDuplicateDispatchError(error)) {
      throw new Error("A trip with this dispatch and trip number, or trip reference, already exists. Choose a different trip number/reference.");
    }
    throw new Error("Unable to update trip");
  }

  return data as TripRecord;
}

export async function deleteTripRecord(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (tripError) {
    console.error("Trip delete existence query error:", {
      id,
      error: tripError,
    });
    throw new Error("Unable to delete trip");
  }

  if (!trip) {
    throw new Error("Trip not found");
  }

  const relationChecks = [
    "trip_stops",
    "trip_line_items",
    "trip_events",
    "trip_assignments",
    "store_calls",
    "documents",
    "pod_records",
    "pod_drive_files",
    "backloads",
    "offloads",
    "incidents",
    "billings",
    "payables",
    "receivables",
    "demurrages",
  ];

  for (const tableName of relationChecks) {
    const { error } = await supabaseAdmin
      .from(tableName)
      .select("id")
      .eq("trip_id", id)
      .limit(1);

    if (!error) {
      const { data: rows } = await supabaseAdmin
        .from(tableName)
        .select("id")
        .eq("trip_id", id)
        .limit(1);

      if ((rows ?? []).length > 0) {
        throw new Error(
          "Trip deletion is not safe while related records exist. Use the archive/business workflow instead.",
        );
      }
    }
  }

  const { error } = await supabaseAdmin.from("trips").delete().eq("id", id);

  if (error) {
    console.error("Trip delete error:", { id, error });
    throw new Error("Unable to delete trip");
  }

  return { id };
}

const TRIP_STOP_ALLOWED_FIELDS = [
  "dr_number",
  "quantity",
  "total_cbm",
  "stop_sequence",
  "dispatch_number",
  "transaction_number",
  "customer_id",
  "store_id",
  "delivery_status",
  "arrival_time",
  "start_unloading_time",
  "finish_unloading_time",
  "departure_time",
  "remarks",
  "spreadsheet_issue_type",
  "spreadsheet_issue_reason",
] as const;



function normalizeStopSequence(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("stop_sequence must be a non-negative integer.");
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error("stop_sequence must be a non-negative integer.");
    }
    return parsed;
  }

  throw new Error("stop_sequence must be a non-negative integer.");
}

function normalizeUuidField(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }

  return value;
}

function normalizeTimestampField(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a valid date string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const iso = new Date(trimmed);
  if (Number.isNaN(iso.getTime())) {
    throw new Error(`${fieldName} must be a valid date string.`);
  }

  return trimmed;
}

function normalizeTextField(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function assertTripExists(tripId: string) {
  const { data, error } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Trip stop trip lookup failed:", error);
    throw new Error("Unable to load trip");
  }

  if (!data) {
    throw new Error("Trip not found");
  }
}

function buildTripStopPayload(input: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  for (const field of TRIP_STOP_ALLOWED_FIELDS) {
    if (!(field in input)) continue;

    const value = input[field];

    if (field === "stop_sequence") {
      const normalized = normalizeStopSequence(value);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    if (field === "customer_id" || field === "store_id") {
      const normalized = normalizeUuidField(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    if (field === "quantity" || field === "total_cbm") {
      payload[field] = normalizeTransactionNumber(value, field);
      continue;
    }
    if (field === "dr_number") {
      payload[field] = value === null || value === "" ? "" : sanitizeString(value, field, 100);
      continue;
    }
    if (field === "dispatch_number" || field === "transaction_number") {
      if (value === null || value === "") {
        payload[field] = null;
      } else {
        payload[field] = sanitizeString(value, field, 100);
      }
      continue;
    }

    if (
      field === "arrival_time" ||
      field === "start_unloading_time" ||
      field === "finish_unloading_time" ||
      field === "departure_time"
    ) {
      const normalized = normalizeTimestampField(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    if (field === "delivery_status") {
      if (value === null || value === undefined || value === "") {
        if (value === null) {
          payload[field] = null;
        }
        continue;
      }

      if (typeof value !== "string") {
        throw new Error("delivery_status must be a string.");
      }
      payload[field] = value.trim() || null;
      continue;
    }

    if(field==="spreadsheet_issue_type"||field==="spreadsheet_issue_reason"){payload[field]=value===null||value===""?null:sanitizeString(value,field,field==="spreadsheet_issue_type"?500:2000);continue;}
    if (field === "remarks") {
      const normalized = normalizeTextField(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
    }
  }

  return payload;
}

async function validateTripStopReferences(
  customerId: unknown,
  storeId: unknown,
) {
  let resolvedCustomerId =
    typeof customerId === "string" ? customerId : undefined;
  if (resolvedCustomerId) {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, status")
      .eq("id", resolvedCustomerId)
      .maybeSingle();
    if (error) throw new Error("Unable to validate customer.");
    if (!data) throw new Error("Customer not found.");
    if (String(data.status).toUpperCase() !== "ACTIVE") {
      throw new Error("Customer must be active.");
    }
  }

  if (typeof storeId === "string") {
    const { data, error } = await supabaseAdmin
      .from("customer_stores")
      .select("id, customer_id, status")
      .eq("id", storeId)
      .maybeSingle();
    if (error) throw new Error("Unable to validate store.");
    if (!data) throw new Error("Store not found.");
    if (String(data.status).toUpperCase() !== "ACTIVE") {
      throw new Error("Store must be active.");
    }
    resolvedCustomerId = resolvedCustomerId ?? data.customer_id ?? undefined;
    if (customerId && data.customer_id !== customerId) {
      throw new Error("Store does not belong to the selected customer.");
    }
  }
}

export async function getTripStops(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_stops")
    .select("*")
    .eq("trip_id", id)
    .order("stop_sequence", { ascending: true });

  if (error) {
    console.error("Trip stop query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip stops");
  }

  return data ?? [];
}

export async function createTripStopRecord(
  tripId: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  await assertTripExists(tripId);

  const unknownFields = Object.keys(input).filter(
    (key) =>
      !TRIP_STOP_ALLOWED_FIELDS.includes(
        key as (typeof TRIP_STOP_ALLOWED_FIELDS)[number],
      ),
  );

  if (unknownFields.length > 0) {
    throw new Error(`Invalid trip stop field(s): ${unknownFields.join(", ")}`);
  }

  const payload: Record<string, unknown> = { trip_id: tripId };
  const patch = buildTripStopPayload(input);
  await validateTripStopReferences(patch.customer_id, patch.store_id);
  if (patch.delivery_status !== undefined) {
    await assertActiveDropdownOption("delivery_status", patch.delivery_status);
  }
  Object.assign(payload, patch);

  if (Object.keys(payload).length === 1) {
    throw new Error("No valid trip stop fields were provided for creation.");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_stops")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("Trip stop creation failed:", { tripId, payload, error });
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Stop sequence already exists for this trip.");
    }
    if (
      error.code === "23503" ||
      /foreign key|violates/.test(String(error.message))
    ) {
      throw new Error("Trip stop reference is invalid.");
    }
    throw new Error("Unable to create trip stop");
  }

  return data;
}

export async function updateTripStopRecord(
  tripId: string,
  stopId: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  if (!isValidUuid(stopId)) {
    throw new Error("Invalid stop id");
  }

  await assertTripExists(tripId);

  const { data: existingStop, error: existingError } = await supabaseAdmin
    .from("trip_stops")
    .select("id, trip_id, customer_id, store_id")
    .eq("id", stopId)
    .maybeSingle();

  if (existingError) {
    console.error("Trip stop ownership lookup failed:", existingError);
    throw new Error("Unable to fetch trip stop");
  }

  if (!existingStop) {
    throw new Error("Stop not found");
  }

  if (existingStop.trip_id !== tripId) {
    throw new Error("Stop does not belong to this trip");
  }

  const unknownFields = Object.keys(input).filter(
    (key) =>
      !TRIP_STOP_ALLOWED_FIELDS.includes(
        key as (typeof TRIP_STOP_ALLOWED_FIELDS)[number],
      ),
  );

  if (unknownFields.length > 0) {
    throw new Error(`Invalid trip stop field(s): ${unknownFields.join(", ")}`);
  }

  if (Object.keys(input).length === 0) {
    throw new Error("No valid trip stop fields were provided for update.");
  }

  const payload = buildTripStopPayload(input);
  await validateTripStopReferences(
    payload.customer_id !== undefined
      ? payload.customer_id
      : existingStop.customer_id,
    payload.store_id !== undefined ? payload.store_id : existingStop.store_id,
  );
  if (payload.delivery_status !== undefined) {
    await assertActiveDropdownOption(
      "delivery_status",
      payload.delivery_status,
    );
  }
  if (Object.keys(payload).length === 0) {
    throw new Error("No valid trip stop fields were provided for update.");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_stops")
    .update(payload)
    .eq("id", stopId)
    .eq("trip_id", tripId)
    .select("*")
    .single();

  if (error) {
    console.error("Trip stop update failed:", {
      tripId,
      stopId,
      payload,
      error,
    });
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Stop sequence already exists for this trip.");
    }
    if (
      error.code === "23503" ||
      /foreign key|violates/.test(String(error.message))
    ) {
      throw new Error("Trip stop value is invalid.");
    }
    throw new Error("Unable to update trip stop");
  }

  return data;
}

/** Child deletion never delegates to the legacy final-stop/parent cleanup RPC. */
export async function deleteTripStopRecord(tripId:string,stopId:string,actor:{id:string;role:string},expectedVersion:unknown){
  return deletePhysicalRecord(actor,"trip_stops",stopId,expectedVersion,tripId);
}

const TRIP_LINE_ITEM_ALLOWED_FIELDS = [
  "product_id",
  "quantity",
  "cbm",
  "dr_number",
  "sap_so_number",
  "customer_po_number",
  "internal_po_number",
  "customer_model",
  "remarks",
] as const;

function normalizeNumericField(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} must be a valid number.`);
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${fieldName} must be a valid number.`);
    }
    return parsed;
  }

  throw new Error(`${fieldName} must be a valid number.`);
}

function normalizeTripLineItemText(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function assertStopExistsForTrip(tripId: string, stopId: string) {
  const { data, error } = await supabaseAdmin
    .from("trip_stops")
    .select("id, trip_id")
    .eq("id", stopId)
    .maybeSingle();

  if (error) {
    console.error("Trip stop lookup failed:", error);
    throw new Error("Unable to load stop");
  }

  if (!data) {
    throw new Error("Stop not found");
  }

  if (data.trip_id !== tripId) {
    throw new Error("Stop does not belong to this trip");
  }
}

async function assertProductExists(productId: string | null | undefined) {
  if (productId === undefined || productId === null || productId === "") {
    return;
  }

  if (typeof productId !== "string" || !isValidUuid(productId)) {
    throw new Error("product_id must be a valid UUID.");
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error("Product lookup failed:", error);
    throw new Error("Unable to validate product");
  }

  if (!data) {
    throw new Error("Product not found");
  }
}

export function buildTripLineItemPayload(input: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  for (const field of TRIP_LINE_ITEM_ALLOWED_FIELDS) {
    if (!(field in input)) continue;
    const value = input[field];

    if (field === "product_id") {
      if (value === null || value === undefined || value === "") {
        if (value === null) {
          payload[field] = null;
        }
        continue;
      }
      if (typeof value !== "string" || !isValidUuid(value)) {
        throw new Error("product_id must be a valid UUID.");
      }
      payload[field] = value;
      continue;
    }

    if (field === "quantity" || field === "cbm") {
      const normalized = normalizeNumericField(value, field);
      if (normalized !== undefined) {
        if (normalized < 0) throw new Error(`${field} must be a non-negative number.`);
        if (field === "quantity" && !Number.isSafeInteger(normalized)) {
          throw new Error("quantity must be a non-negative whole number.");
        }
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    const normalized = normalizeTripLineItemText(value, field);
    if (normalized !== undefined) {
      payload[field] = normalized;
    } else if (value === null) {
      payload[field] = null;
    }
  }

  return payload;
}

export async function getTripLineItems(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_line_items")
    .select("*")
    .eq("trip_id", id)
    .order("id", { ascending: true });

  if (error) {
    console.error("Trip line item query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip line items");
  }

  return data ?? [];
}

export async function createTripLineItemRecord(
  tripId: string,
  stopId: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  if (!isValidUuid(stopId)) {
    throw new Error("Invalid stop id");
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();

  if (tripError) {
    console.error("Trip validation failed:", tripError);
    throw new Error("Unable to load trip");
  }

  if (!trip) {
    throw new Error("Trip not found");
  }

  await assertStopExistsForTrip(tripId, stopId);

  const unknownFields = Object.keys(input).filter(
    (key) =>
      !TRIP_LINE_ITEM_ALLOWED_FIELDS.includes(
        key as (typeof TRIP_LINE_ITEM_ALLOWED_FIELDS)[number],
      ),
  );

  if (unknownFields.length > 0) {
    throw new Error(
      `Invalid trip line item field(s): ${unknownFields.join(", ")}`,
    );
  }

  if (input.product_id !== undefined) {
    await assertProductExists(input.product_id as string | null | undefined);
  }

  const payload = buildTripLineItemPayload(input);
  if (Object.keys(payload).length === 0) {
    throw new Error(
      "No valid trip line item fields were provided for creation.",
    );
  }

  const finalPayload: Record<string, unknown> = {
    trip_id: tripId,
    trip_stop_id: stopId,
    ...payload,
  };

  const { data, error } = await supabaseAdmin
    .from("trip_line_items")
    .insert(finalPayload)
    .select("*")
    .single();

  if (error) {
    console.error("Trip line item create failed:", {
      tripId,
      stopId,
      payload: finalPayload,
      error,
    });
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Trip line item already exists.");
    }
    if (
      error.code === "23503" ||
      /foreign key|violates/.test(String(error.message))
    ) {
      throw new Error("Trip line item relationship is invalid.");
    }
    throw new Error("Unable to create trip line item");
  }

  return data;
}

export async function updateTripLineItemRecord(
  tripId: string,
  stopId: string | null,
  lineItemId: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  if (stopId !== null && !isValidUuid(stopId)) {
    throw new Error("Invalid stop id");
  }

  if (!isValidUuid(lineItemId)) {
    throw new Error("Invalid line item id");
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();

  if (tripError) {
    console.error("Trip validation failed:", tripError);
    throw new Error("Unable to load trip");
  }

  if (!trip) {
    throw new Error("Trip not found");
  }

  if (stopId !== null) await assertStopExistsForTrip(tripId, stopId);

  const { data: existingItem, error: itemError } = await supabaseAdmin
    .from("trip_line_items")
    .select("id, trip_id, trip_stop_id")
    .eq("id", lineItemId)
    .maybeSingle();

  if (itemError) {
    console.error("Line item lookup failed:", itemError);
    throw new Error("Unable to fetch trip line item");
  }

  if (!existingItem) {
    throw new Error("Line item not found");
  }

  if (existingItem.trip_id !== tripId) {
    throw new Error("Line item does not belong to this trip");
  }

  if (existingItem.trip_stop_id !== stopId) {
    throw new Error("Line item does not belong to this stop");
  }

  const unknownFields = Object.keys(input).filter(
    (key) =>
      !TRIP_LINE_ITEM_ALLOWED_FIELDS.includes(
        key as (typeof TRIP_LINE_ITEM_ALLOWED_FIELDS)[number],
      ),
  );

  if (unknownFields.length > 0) {
    throw new Error(
      `Invalid trip line item field(s): ${unknownFields.join(", ")}`,
    );
  }

  if (Object.keys(input).length === 0) {
    throw new Error("No valid trip line item fields were provided for update.");
  }

  if (input.product_id !== undefined) {
    await assertProductExists(input.product_id as string | null | undefined);
  }

  const payload = buildTripLineItemPayload(input);
  if (Object.keys(payload).length === 0) {
    throw new Error("No valid trip line item fields were provided for update.");
  }

  let updateQuery = supabaseAdmin
    .from("trip_line_items")
    .update(payload)
    .eq("id", lineItemId)
    .eq("trip_id", tripId);
  updateQuery = stopId === null ? updateQuery.is("trip_stop_id", null) : updateQuery.eq("trip_stop_id", stopId);
  const { data, error } = await updateQuery.select("*").single();

  if (error) {
    console.error("Trip line item update failed:", {
      tripId,
      stopId,
      lineItemId,
      payload,
      error,
    });
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Trip line item already exists.");
    }
    if (
      error.code === "23503" ||
      /foreign key|violates/.test(String(error.message))
    ) {
      throw new Error("Trip line item relationship is invalid.");
    }
    throw new Error("Unable to update trip line item");
  }

  return data;
}

export function updateTripUnscopedLineItemRecord(
  tripId: string,
  lineItemId: string,
  input: Record<string, unknown>,
) {
  return updateTripLineItemRecord(tripId, null, lineItemId, input);
}

export async function deleteTripLineItemRecord(
  tripId: string,
  stopId: string,
  lineItemId: string,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  if (!isValidUuid(stopId)) {
    throw new Error("Invalid stop id");
  }

  if (!isValidUuid(lineItemId)) {
    throw new Error("Invalid line item id");
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();

  if (tripError) {
    console.error("Trip validation failed:", tripError);
    throw new Error("Unable to load trip");
  }

  if (!trip) {
    throw new Error("Trip not found");
  }

  await assertStopExistsForTrip(tripId, stopId);

  const { data: lineItem, error: itemError } = await supabaseAdmin
    .from("trip_line_items")
    .select("id, trip_id, trip_stop_id")
    .eq("id", lineItemId)
    .eq("trip_id", tripId)
    .eq("trip_stop_id", stopId)
    .maybeSingle();

  if (itemError) {
    console.error("Line item ownership check failed:", itemError);
    throw new Error("Unable to delete trip line item");
  }

  if (!lineItem) {
    const { data: fallback, error: fallbackError } = await supabaseAdmin
      .from("trip_line_items")
      .select("id, trip_id, trip_stop_id")
      .eq("id", lineItemId)
      .maybeSingle();

    if (fallbackError) {
      console.error("Fallback line item lookup failed:", fallbackError);
      throw new Error("Unable to delete trip line item");
    }

    if (!fallback) {
      throw new Error("Line item not found");
    }

    if (fallback.trip_id !== tripId) {
      throw new Error("Line item does not belong to this trip");
    }

    if (fallback.trip_stop_id !== stopId) {
      throw new Error("Line item does not belong to this stop");
    }
  }

  const { data: deleted, error: deleteError } = await supabaseAdmin
    .from("trip_line_items")
    .delete()
    .eq("id", lineItemId)
    .eq("trip_id", tripId)
    .eq("trip_stop_id", stopId).select("id").maybeSingle();

  if (deleteError) {
    console.error("Trip line item deletion failed:", {
      tripId,
      stopId,
      lineItemId,
      error: deleteError,
    });
    if (
      deleteError.code === "23503" ||
      /foreign key|violates/.test(String(deleteError.message))
    ) {
      throw new Error(
        "Trip line item deletion is blocked by existing dependent records.",
      );
    }
    throw new Error("Unable to delete trip line item");
  }

  if(!deleted) throw new Error("Line item not found");
  return { id: deleted.id };
}

export async function getTripEvents(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid trip id");
  }

  const { data, error } = await supabaseAdmin
    .from("trip_events")
    .select("*")
    .eq("trip_id", id)
    .order("event_time", { ascending: true });

  if (error) {
    console.error("Trip event query error:", { tripId: id, error });
    throw new Error("Unable to fetch trip events");
  }

  return data ?? [];
}

export async function updateTripBillingRecord(
  tripId: string,
  billingId: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(tripId)) throw new Error("Invalid trip id");
  if (!isValidUuid(billingId)) throw new Error("Invalid billing id");
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "invoice_number") {
    throw new Error("Only invoice_number can be updated from this report.");
  }
  const value = input.invoice_number;
  if (value !== null && typeof value !== "string") {
    throw new Error("invoice_number must be a string or null.");
  }
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("billings")
    .select("id, trip_id")
    .eq("id", billingId)
    .maybeSingle();
  if (lookupError) {
    console.error("Billing lookup failed:", lookupError);
    throw new Error("Unable to load billing record");
  }
  if (!existing) throw new Error("Billing record not found");
  if (existing.trip_id !== tripId) {
    throw new Error("Billing record does not belong to this trip");
  }
  const { data, error } = await supabaseAdmin
    .from("billings")
    .update({ invoice_number: value })
    .eq("id", billingId)
    .eq("trip_id", tripId)
    .select(collaborationSelect("id, trip_id, invoice_number"))
    .single<{id:string;trip_id:string;invoice_number:string|null;collaboration_version?:number}>();
  if (error) {
    console.error("Billing update failed:", { tripId, billingId, error });
    throw new Error("Unable to update billing record");
  }
  return data;
}
