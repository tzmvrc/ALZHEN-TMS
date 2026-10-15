import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";

export type ReportActor = { profileId: string; role: string };

export type OperationsConversionHistoryRecord = {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  trip_id: string;
  trip_stop_id: string | null;
  actor_profile_id?: string | null;
  created_at?: string | null;
  source_snapshot: unknown;
  source_items_snapshot: unknown;
};

export type OperationsConversionTarget = { report_type: string; report: Record<string, unknown> };

const SAFE_RECEIPT_METADATA_FIELDS = new Set([
  "id", "trip_id", "trip_stop_id", "file_name", "original_file_name", "original_name", "mime_type", "content_type",
  "file_size", "file_size_bytes", "size_bytes", "uploaded_by", "uploaded_by_profile_id", "uploader", "uploader_id",
  "uploader_profile_id", "created_by", "received_by", "received_at", "uploaded_at", "created_at",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeReceiptMetadata(value: unknown): Record<string, unknown> {
  const receipt = asRecord(value) ?? {};
  return Object.fromEntries(Object.entries(receipt).filter(([key]) => SAFE_RECEIPT_METADATA_FIELDS.has(key)));
}

/** Build the ADMIN/STAFF history response without exposing storage paths or signed URLs. */
export function mapOperationsConversionHistory(
  entries: readonly OperationsConversionHistoryRecord[],
  targets: readonly OperationsConversionTarget[],
) {
  const targetByKey = new Map(targets.map(({ report_type, report }) => [`${report_type}:${String(report.id ?? "")}`, report]));
  return entries.map((entry) => {
    const source = asRecord(entry.source_snapshot) ?? {};
    const receipts = Array.isArray(source.receipts) ? source.receipts.map(safeReceiptMetadata) : [];
    const sourceSnapshot = { ...source, receipts };
    return {
      id: entry.id,
      source_type: entry.source_type,
      source_id: entry.source_id,
      target_type: entry.target_type,
      target_id: entry.target_id,
      trip_id: entry.trip_id,
      trip_stop_id: entry.trip_stop_id,
      actor_profile_id: entry.actor_profile_id ?? null,
      created_at: entry.created_at ?? null,
      source_snapshot: sourceSnapshot,
      source_items_snapshot: Array.isArray(entry.source_items_snapshot) ? entry.source_items_snapshot : [],
      receipt_metadata: receipts,
      target_report: targetByKey.get(`${entry.target_type}:${entry.target_id}`) ?? null,
    };
  });
}
export type TripAssignment = { trip_id: string; unassigned_at: string | null };

export type OperationsEventRow = {
  id: string;
  source_type: "LOADING" | "UNLOADING" | "BACKLOAD" | "OFFLOAD";
  source_record_id: string;
  assignment_id: string | null;
  trip_id: string;
  trip_stop_id: string | null;
  loading_report_id: string | null;
  unloading_report_id: string | null;
  trip_number: string | number | null;
  dispatch_number: string | null;
  date: string | null;
  plate_number: string | null;
  driver_name: string | null;
  route: string | null;
  dr_number: string | null;
  quantity: number | null;
  quantity_scope: "Trip total" | "Stop total" | "Boxes" | null;
  total_cbm: number | null;
  report_type: "Loading" | "Unloading" | "Backload" | "Offload";
  report_types: Array<"Loading" | "Unloading" | "Backload" | "Offload">;
  event_type_records: Array<{
    id: string;
    source_type: "LOADING" | "UNLOADING" | "BACKLOAD" | "OFFLOAD";
    event_type: "Loading" | "Unloading" | "Backload" | "Offload";
  }>;
  backload_records: OperationsCargoEntry[];
  offload_records: OperationsCargoEntry[];
  loading_timestamps: Pick<EventLoading, "warehouse_arrival_at" | "loading_start_at" | "loading_finished_at"> | null;
  unloading_timestamps: Pick<EventStop, "arrival_time" | "start_unloading_time" | "finish_unloading_time"> | null;
  remarks: string | null;
  reason: string | null;
  reported_by: string | null;
  stop_sequence: number | null;
  scope_label: string;
  line_items: OperationsLineItem[];
};

export type OperationsCargoEntry = {
  id: string;
  trip_id: string;
  trip_stop_id: string | null;
  reason: string | null;
  number_of_boxes: number | null;
  comments: string | null;
  reported_at?: string | null;
  report_date?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  reported_by_id?: string | null;
  reported_by_name?: string | null;
  creator_name?: string | null;
  event_type?: "Loading" | "Unloading" | "Backload" | "Offload" | null;
  items?: OperationsOffloadItemEntry[];
};

export type OperationsOffloadItemEntry = {
  id: string;
  offload_id: string;
  trip_line_item_id: string | null;
  quantity: number | string | null;
  total_cbm: number | string | null;
  dr_number?: string | null;
  customer_model?: string | null;
};

export type OperationsOffloadItemUpdate = {
  id: string;
  trip_line_item_id: string | null;
  quantity?: number | null;
  total_cbm?: number | null;
};

export function validateOperationsOffloadItemUpdate(value: unknown): OperationsOffloadItemUpdate {
  const input = validateObject(value);
  rejectUnknown(input, ["id", "trip_line_item_id", "quantity", "total_cbm"]);
  const id = requireReportUuid(input.id, "item.id");
  const tripLineItemId = input.trip_line_item_id === null ? null : requireReportUuid(input.trip_line_item_id, "item.trip_line_item_id");
  const result: OperationsOffloadItemUpdate = { id, trip_line_item_id: tripLineItemId };
  for (const field of ["quantity", "total_cbm"] as const) {
    if (!(field in input)) continue;
    const value = input[field];
    if (value === null || value === "") result[field] = null;
    else {
      const numeric = typeof value === "number" || typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
      if (!Number.isFinite(numeric) || numeric < 0) throw new ApiError(`${field} must be a non-negative number or empty.`, 400, "INVALID_NUMBER");
      result[field] = numeric;
    }
  }
  if (!("quantity" in result) && !("total_cbm" in result)) throw new ApiError("At least one Offload item value is required.", 400, "EMPTY_OFFLOAD_ITEM");
  return result;
}

export function assertOffloadItemSourceScope(
  offload: { trip_id: string; trip_stop_id: string | null },
  source: { trip_id: string; trip_stop_id: string | null },
) {
  if (source.trip_id !== offload.trip_id) throw new ApiError("The source line item does not belong to this Offload trip.", 409, "OFFLOAD_ITEM_SCOPE_CONFLICT");
  if (offload.trip_stop_id !== null && source.trip_stop_id !== offload.trip_stop_id) {
    throw new ApiError("The source line item does not belong to this Offload stop.", 409, "OFFLOAD_ITEM_SCOPE_CONFLICT");
  }
}

export type OperationsReportType = "LOADING" | "UNLOADING" | "BACKLOAD" | "OFFLOAD";
export function validateOperationsReportSourceIdentity(sourceTypeValue: unknown, recordIdValue: unknown) {
  const sourceType = typeof sourceTypeValue === "string" ? sourceTypeValue.trim().toUpperCase() : "";
  if (!(sourceType === "LOADING" || sourceType === "UNLOADING" || sourceType === "BACKLOAD" || sourceType === "OFFLOAD")) {
    throw new ApiError("source_type must identify exactly one Loading, Unloading, Backload, or Offload report.", 400, "INVALID_SOURCE_TYPE");
  }
  const recordId = requireReportUuid(recordIdValue, "record_id");
  return { source_type: sourceType as OperationsReportType, record_id: recordId };
}
export type PersistedOperationsReportConversionEntry = {
  source_type: OperationsReportType;
  source_id: string;
  target_type: OperationsReportType;
  target_id: string;
  trip_id: string;
  trip_stop_id: string | null;
};

export function assertReportSourceNotConverted(
  conversions: readonly Pick<PersistedOperationsReportConversionEntry, "source_type" | "source_id">[],
  sourceType: OperationsReportType,
  sourceId: string,
) {
  if (conversions.some((entry) => entry.source_type === sourceType && entry.source_id === sourceId)) {
    throw new ApiError("This report has been converted and is read-only in its original category.", 409, "REPORT_ALREADY_CONVERTED");
  }
}
// Kept for the earlier in-memory cargo projection tests/helpers. The database
// ledger uses the uppercase source_type/source_id shape above.
export type OperationsReportConversionEntry = LegacyOperationsReportConversionEntry;

export type OperationsReportConversionRequest = {
  source_type: OperationsReportType;
  source_id: string;
  target_type: OperationsReportType;
  target_fields: Record<string, unknown>;
};

/** PostgreSQL serialization/NOWAIT failures are safe to retry after the
 * concurrent receipt mutation completes. This maps the database signal only;
 * it does not claim to exercise trigger or locking behavior locally. */
export function mapOperationsConversionConcurrencyError(code: string | null | undefined, message?: string) {
  if (code !== "40001" && code !== "55P03") return null;
  return new ApiError(message || "A receipt or report is being changed. Retry the conversion.", 409, "REPORT_CONVERSION_CONFLICT");
}

const REPORT_TYPES = new Set<OperationsReportType>(["LOADING", "UNLOADING", "BACKLOAD", "OFFLOAD"]);
const LOADING_TARGET_FIELDS = ["warehouse_arrival_at", "loading_start_at", "loading_finished_at"] as const;
const CARGO_TARGET_FIELDS = ["reason", "number_of_boxes", "comments"] as const;

export function validateOperationsReportConversion(value: unknown): OperationsReportConversionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("Request body must be an object.", 400, "INVALID_BODY");
  }
  const input = value as Record<string, unknown>;
  rejectUnknown(input, ["source_type", "source_id", "target_type", "target_fields"]);
  const sourceType = typeof input.source_type === "string" ? input.source_type.toUpperCase() as OperationsReportType : null;
  const targetType = typeof input.target_type === "string" ? input.target_type.toUpperCase() as OperationsReportType : null;
  if (!sourceType || !REPORT_TYPES.has(sourceType) || !targetType || !REPORT_TYPES.has(targetType)) {
    throw new ApiError("source_type and target_type must be LOADING, UNLOADING, BACKLOAD, or OFFLOAD.", 400, "INVALID_CONVERSION_TYPE");
  }
  if (sourceType === targetType) throw new ApiError("Choose a different target event type.", 400, "SAME_CONVERSION_TYPE");
  const sourceId = requireReportUuid(input.source_id, "source_id");
  const fields = input.target_fields === undefined ? {} : input.target_fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new ApiError("target_fields must be an object.", 400, "INVALID_CONVERSION_FIELDS");
  }
  const allowed = targetType === "LOADING" ? LOADING_TARGET_FIELDS : targetType === "BACKLOAD" || targetType === "OFFLOAD" ? CARGO_TARGET_FIELDS : [];
  const fieldObject = fields as Record<string, unknown>;
  rejectUnknown(fieldObject, allowed);
  const targetFields: Record<string, unknown> = {};
  for (const field of LOADING_TARGET_FIELDS) {
    if (!(field in fieldObject)) continue;
    targetFields[field] = normalizeTimestamp(fieldObject[field], field);
  }
  if ("reason" in fieldObject) targetFields.reason = normalizeText(fieldObject.reason, "reason");
  if ("comments" in fieldObject) targetFields.comments = normalizeText(fieldObject.comments, "comments");
  if ("number_of_boxes" in fieldObject) {
    const count = fieldObject.number_of_boxes;
    if (count === null || count === "") targetFields.number_of_boxes = null;
    else if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) targetFields.number_of_boxes = count;
    else if (typeof count === "string" && count.trim() !== "" && Number.isSafeInteger(Number(count)) && Number(count) >= 0) targetFields.number_of_boxes = Number(count);
    else throw new ApiError("number_of_boxes must be a non-negative whole number or empty.", 400, "INVALID_NUMBER");
  }
  if (targetType === "LOADING" && !LOADING_TARGET_FIELDS.some((field) => typeof targetFields[field] === "string")) {
    throw new ApiError("Enter at least one target Loading timestamp; source event times are kept in conversion history and are not reinterpreted.", 400, "CONVERSION_TARGET_DATA_REQUIRED");
  }
  if ((targetType === "BACKLOAD" || targetType === "OFFLOAD") && !String(targetFields.reason ?? "").trim()) {
    throw new ApiError("Enter a reason for the new Backload or Offload report. The source reason is preserved in history and is not assumed equivalent.", 400, "CONVERSION_TARGET_DATA_REQUIRED");
  }
  return { source_type: sourceType, source_id: sourceId, target_type: targetType, target_fields: targetFields };
}

export function filterConvertedReportSources<T extends { id: string }>(
  loading: readonly T[],
  unloading: readonly T[],
  backloads: readonly T[],
  offloads: readonly T[],
  conversions: readonly PersistedOperationsReportConversionEntry[],
) {
  const hidden = new Map<OperationsReportType, Set<string>>();
  for (const conversion of conversions) {
    const set = hidden.get(conversion.source_type) ?? new Set<string>();
    set.add(conversion.source_id);
    hidden.set(conversion.source_type, set);
  }
  const keep = (type: OperationsReportType, rows: readonly T[]) => rows.filter((row) => !hidden.get(type)?.has(row.id));
  return {
    loading: keep("LOADING", loading),
    unloading: keep("UNLOADING", unloading),
    backloads: keep("BACKLOAD", backloads),
    offloads: keep("OFFLOAD", offloads),
  };
}

export function assertConversionTargetScope(sourceType: OperationsReportType, targetType: OperationsReportType, stopId: string | null) {
  if (sourceType === "LOADING" && targetType === "UNLOADING") {
    throw new ApiError("Loading is trip-scoped and has no stop association or Unloading timeline to map. This conversion is not supported.", 409, "CONVERSION_SEMANTIC_MAPPING_UNSUPPORTED");
  }
  if (targetType === "UNLOADING" && !stopId) {
    throw new ApiError("A stop-scoped source is required to convert to Unloading; a stop cannot be inferred.", 409, "CONVERSION_STOP_REQUIRED");
  }
  // Loading reports are trip-scoped. Their source timestamps remain in the
  // conversion snapshot and are not reinterpreted as a stop association.
}

/**
 * Unloading timestamps belong to the existing trip_stops row, not to the
 * unloading_reports parent. Reuse that stop timeline only when it already
 * contains unloading data; never reinterpret Loading timestamps as Unloading.
 */
export function assertConversionSemanticMapping(
  sourceType: OperationsReportType,
  targetType: OperationsReportType,
  stop: { arrival_time?: string | null; start_unloading_time?: string | null; finish_unloading_time?: string | null } | null,
) {
  if (sourceType === "LOADING" && targetType === "UNLOADING") {
    throw new ApiError("Loading has no stop association or Unloading timeline to map. This conversion is not supported.", 409, "CONVERSION_SEMANTIC_MAPPING_UNSUPPORTED");
  }
  if (targetType === "UNLOADING" && ![stop?.arrival_time, stop?.start_unloading_time, stop?.finish_unloading_time].some((value) => typeof value === "string" && value.trim() !== "")) {
    throw new ApiError("The selected stop has no saved arrival or unloading timestamp. Add the stop timeline before converting to Unloading.", 409, "CONVERSION_TARGET_DATA_REQUIRED");
  }
}

export type ConvertibleCargoSource = "backloads" | "offloads";
export type LegacyOperationsReportConversionEntry = {
  source_type: ConvertibleCargoSource;
  source_record_id: string;
  target_type: ConvertibleCargoSource;
  target_record_id: string;
  trip_id: string;
  trip_stop_id: string | null;
  actor_profile_id: string;
  actor_role: "ADMIN" | "STAFF";
  converted_at: string;
};
export interface OperationsConversionLedgerReader {
  readEntries(): Promise<readonly LegacyOperationsReportConversionEntry[]>;
}

/** Exclude converted source rows while retaining target rows as active records.
 * Set semantics make duplicated ledger results harmless for projection. */
export function filterActiveCargoSources(
  backloads: readonly OperationsCargoEntry[],
  offloads: readonly OperationsCargoEntry[],
  conversions: readonly LegacyOperationsReportConversionEntry[],
) {
  const convertedBackloads = new Set(conversions.filter((entry) => entry.source_type === "backloads").map((entry) => entry.source_record_id));
  const convertedOffloads = new Set(conversions.filter((entry) => entry.source_type === "offloads").map((entry) => entry.source_record_id));
  return {
    backloads: backloads.filter((record) => !convertedBackloads.has(record.id)),
    offloads: offloads.filter((record) => !convertedOffloads.has(record.id)),
  };
}

/** Dependency-injected write guard for update handlers once an approved
 * database adapter exists. Not wired to live service routes before migration. */
export async function assertCargoSourceNotConverted(
  ledger: OperationsConversionLedgerReader,
  sourceType: ConvertibleCargoSource,
  sourceRecordId: string,
) {
  const entries = await ledger.readEntries();
  if (entries.some((entry) => entry.source_type === sourceType && entry.source_record_id === sourceRecordId)) {
    throw new ApiError("This report has been converted and is read-only in its original category.", 409, "REPORT_ALREADY_CONVERTED");
  }
}

export type OperationsLineItem = {
  id: string;
  trip_id: string;
  trip_stop_id: string | null;
  dr_number: string | null;
  quantity: number | string | null;
  cbm: number | string | null;
};

const LOADING_FIELDS = ["warehouse_arrival_at", "loading_start_at", "loading_finished_at"] as const;
const UNLOADING_FIELDS = ["arrival_time", "start_unloading_time", "finish_unloading_time"] as const;
const BACKLOAD_OFFLOAD_FIELDS = ["reason", "number_of_boxes", "comments"] as const;

export type OperationsEventSubmission = {
  dispatchNumber: string;
  eventType: "BACKLOAD" | "OFFLOAD";
  remarks: string;
};

export function validateOperationsEventSubmission(value: unknown): OperationsEventSubmission {
  const input = validateObject(value);
  rejectUnknown(input, ["dispatch_number", "event_type", "remarks"]);
  const dispatchNumber = typeof input.dispatch_number === "string" ? input.dispatch_number.trim() : "";
  if (!dispatchNumber || dispatchNumber.length > 100) {
    throw new ApiError("dispatch_number is required and must be at most 100 characters.", 400, "INVALID_DISPATCH_NUMBER");
  }
  const eventType = typeof input.event_type === "string" ? input.event_type.trim().toUpperCase() : "";
  if (eventType !== "BACKLOAD" && eventType !== "OFFLOAD") {
    throw new ApiError("event_type must be BACKLOAD or OFFLOAD.", 400, "INVALID_EVENT_TYPE");
  }
  const remarks = normalizeText(input.remarks, "remarks");
  if (!remarks) throw new ApiError("Remarks are required.", 400, "REMARKS_REQUIRED");
  if (remarks.length > 2000) throw new ApiError("Remarks must be at most 2000 characters.", 400, "INVALID_TEXT");
  return { dispatchNumber, eventType, remarks };
}

export type OperationsEventType = "Loading" | "Unloading" | "Backload" | "Offload";
export type OperationsSourceType = "LOADING" | "UNLOADING" | "BACKLOAD" | "OFFLOAD";

export function validateOperationsEventType(value: unknown): OperationsEventType {
  const input = validateObject(value);
  rejectUnknown(input, ["event_type"]);
  const eventType = typeof input.event_type === "string" ? input.event_type.trim() : "";
  if (!["Loading", "Unloading", "Backload", "Offload"].includes(eventType)) {
    throw new ApiError("event_type must be Loading, Unloading, Backload, or Offload.", 400, "INVALID_EVENT_TYPE");
  }
  return eventType as OperationsEventType;
}

export function requireReportUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new ApiError(`${label} must be a valid UUID.`, 400, "INVALID_UUID");
  }
  return value;
}

export function isTerminalTripStatus(status: unknown): boolean {
  return typeof status === "string" && ["COMPLETED", "CANCELLED", "CANCELED", "CLOSED", "FINISHED", "ARCHIVED", "REJECTED"].includes(status.trim().toUpperCase());
}

export function assertReportRole(actor: ReportActor) {
  if (!["ADMIN", "STAFF", "TRUCKER"].includes(actor.role.toUpperCase())) {
    throw new ApiError("Access denied.", 403, "REPORT_ACCESS_DENIED");
  }
}

export function assertOperationsConversionRole(actor: ReportActor) {
  if (!['ADMIN', 'STAFF'].includes(actor.role.toUpperCase())) {
    throw new ApiError('Only ADMIN or STAFF may convert operational reports.', 403, 'REPORT_ACCESS_DENIED');
  }
}

export function assertOperationsManagementRole(actor: ReportActor) {
  if (!['ADMIN', 'STAFF'].includes(actor.role.toUpperCase())) {
    throw new ApiError('Only ADMIN or STAFF may edit report Event Type.', 403, 'REPORT_ACCESS_DENIED');
  }
}

export function assertTripAssignment(
  actor: ReportActor,
  tripId: string,
  assignments: TripAssignment[],
  tripStatus: unknown,
) {
  assertReportRole(actor);
  if (actor.role.toUpperCase() !== "TRUCKER") return;
  if (isTerminalTripStatus(tripStatus) || !assignments.some((row) => row.trip_id === tripId && row.unassigned_at === null)) {
    throw new ApiError("This trip is not actively assigned to your driver account.", 403, "TRIP_ASSIGNMENT_REQUIRED");
  }
}

function normalizeTimestamp(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new ApiError(`${field} must be a valid timestamp or empty.`, 400, "INVALID_TIMESTAMP");
  }
  return value;
}

function validateObject(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError("Request body must be an object.", 400, "INVALID_BODY");
  }
  return input as Record<string, unknown>;
}

function rejectUnknown(input: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ApiError(`Unsupported report field: ${unknown[0]}.`, 400, "UNSUPPORTED_FIELD");
}

export function validateLoadingInput(value: unknown) {
  const input = validateObject(value);
  rejectUnknown(input, LOADING_FIELDS);
  if (!Object.keys(input).length) throw new ApiError("At least one loading timestamp is required.", 400, "EMPTY_REPORT");
  return Object.fromEntries(LOADING_FIELDS.filter((field) => field in input).map((field) => [field, normalizeTimestamp(input[field], field)]));
}

export function validateUnloadingInput(value: unknown) {
  const input = validateObject(value);
  rejectUnknown(input, UNLOADING_FIELDS);
  if (!Object.keys(input).length) throw new ApiError("At least one unloading timestamp is required.", 400, "EMPTY_REPORT");
  return Object.fromEntries(UNLOADING_FIELDS.filter((field) => field in input).map((field) => [field, normalizeTimestamp(input[field], field)]));
}

export function validateBackloadOffloadInput(value: unknown, requireTrip = false, requireContent = false) {
  const input = validateObject(value);
  const allowed = ["trip_id", "trip_stop_id", ...BACKLOAD_OFFLOAD_FIELDS] as const;
  rejectUnknown(input, allowed);
  const tripId = input.trip_id === undefined && !requireTrip ? undefined : requireReportUuid(input.trip_id, "trip_id");
  const stopId = input.trip_stop_id === undefined ? undefined : input.trip_stop_id === null || input.trip_stop_id === "" ? null : requireReportUuid(input.trip_stop_id, "trip_stop_id");
  const fields: Record<string, unknown> = {};
  if ("reason" in input) fields.reason = normalizeText(input.reason, "reason");
  if ("comments" in input) fields.comments = normalizeText(input.comments, "comments");
  if ("number_of_boxes" in input) {
    const count = input.number_of_boxes;
    if (count === null || count === "") fields.number_of_boxes = null;
    else if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) fields.number_of_boxes = count;
    else if (typeof count === "string" && count.trim() !== "" && Number.isSafeInteger(Number(count)) && Number(count) >= 0) fields.number_of_boxes = Number(count);
    else throw new ApiError("number_of_boxes must be a non-negative whole number or empty.", 400, "INVALID_NUMBER");
  }
  if (requireTrip && !Object.keys(fields).length) throw new ApiError("At least one report field is required.", 400, "EMPTY_REPORT");
  if (requireContent && !Object.values(fields).some((field) => field !== null && field !== "")) {
    throw new ApiError("Enter a reason, box count, or comment before submitting this report.", 400, "EMPTY_REPORT");
  }
  return { tripId, stopId, fields };
}

function normalizeText(value: unknown, field: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(`${field} must be text or empty.`, 400, "INVALID_TEXT");
  return value.trim() || null;
}

export function assertStopBelongsToTrip(requestTripId: string, stop: { id: string; trip_id: string } | null, stopId: string) {
  if (!stop || stop.id !== stopId || stop.trip_id !== requestTripId) {
    throw new ApiError("The selected stop does not belong to this trip.", 404, "TRIP_STOP_NOT_FOUND");
  }
}

type EventTrip = { id: string; trip_number: string | number | null; dispatch_number: string | null; loading_date?: string | null; estimated_delivery_date?: string | null; remarks?: string | null };
type EventStop = { id: string; trip_id: string; stop_sequence: number | null; dispatch_number?: string | null; arrival_time?: string | null; start_unloading_time?: string | null; finish_unloading_time?: string | null; delivery_status?: string | null; remarks?: string | null };
type EventLineItem = OperationsLineItem & { remarks?: string | null };
type EventLoading = { id: string; trip_id: string; event_type?: OperationsEventType | null; warehouse_arrival_at: string | null; loading_start_at: string | null; loading_finished_at: string | null };
type EventUnloading = { id: string; trip_id: string; trip_stop_id: string; event_type?: OperationsEventType | null };
type EventCargo = OperationsCargoEntry;
type EventVehicle = { trip_id: string; assignment_id: string | null; plate_number: string | null; driver_name: string | null };

function sumField(items: EventLineItem[], field: "quantity" | "cbm"): number | null {
  return sumNumericValues(items.map((item) => item[field]));
}

function sumNumericValues(input: Array<number | string | null | undefined>): number | null {
  const values = input.filter((value) => value !== null && value !== undefined && value !== "").map(Number);
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0);
}

function distinctDrNumbers(items: Array<{ dr_number?: string | null }>): string | null {
  const values = [...new Set(items.map((item) => item.dr_number?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return values.length ? values.join(", ") : null;
}

function joinRemarks(...values: Array<string | null | undefined>): string | null {
  const unique = [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  return unique.length ? unique.join(" · ") : null;
}

/** Build one stable row per physical report. Related line items remain context
 * and are aggregated only within that report's trip or exact stop scope. */
export function buildOperationsEventRows(input: {
  trips: EventTrip[];
  stops: EventStop[];
  lineItems: EventLineItem[];
  loading: EventLoading[];
  unloading: EventUnloading[];
  backloads: EventCargo[];
  offloads: EventCargo[];
  convertedUnloadingIds?: ReadonlySet<string>;
  routes: Map<string, string>;
  vehicles: Map<string, EventVehicle>;
}): OperationsEventRow[] {
  const trips = new Map(input.trips.map((trip) => [trip.id, trip]));
  const stops = new Map(input.stops.map((stop) => [stop.id, stop]));
  const linesByTrip = new Map<string, EventLineItem[]>();
  const linesByStop = new Map<string, EventLineItem[]>();
  for (const line of input.lineItems) {
    const tripLines = linesByTrip.get(line.trip_id) ?? [];
    tripLines.push(line);
    linesByTrip.set(line.trip_id, tripLines);
    if (line.trip_stop_id) {
      const owningStop = stops.get(line.trip_stop_id);
      if (!owningStop || owningStop.trip_id !== line.trip_id) continue;
      const stopLines = linesByStop.get(line.trip_stop_id) ?? [];
      stopLines.push(line);
      linesByStop.set(line.trip_stop_id, stopLines);
    }
  }
  const rows: OperationsEventRow[] = [];
  const base = (trip: EventTrip, reportType: OperationsEventRow["report_type"], sourceType: OperationsEventRow["source_type"], sourceId: string, tripStopId: string | null, stopSequence: number | null): OperationsEventRow => {
    const vehicle = input.vehicles.get(trip.id);
    const route = input.routes.get(trip.id) ?? null;
    return {
      id: `${sourceType.toLowerCase()}:${sourceId}`, source_type: sourceType, source_record_id: sourceId, assignment_id: vehicle?.assignment_id ?? null, trip_id: trip.id, trip_stop_id: tripStopId,
      loading_report_id: null, unloading_report_id: null,
      trip_number: trip.trip_number, dispatch_number: tripStopId ? null : trip.dispatch_number,
      date: null, plate_number: vehicle?.plate_number ?? null, driver_name: vehicle?.driver_name ?? null,
      route: route && stopSequence !== null ? `${route} · Stop ${stopSequence}` : route,
      dr_number: null, quantity: null, quantity_scope: null, total_cbm: null,
      report_type: reportType, report_types: [reportType], event_type_records: [], backload_records: [], offload_records: [], loading_timestamps: null, unloading_timestamps: null,
      remarks: null, reason: null, reported_by: null, stop_sequence: stopSequence,
      scope_label: tripStopId ? `Stop ${stopSequence ?? "—"}` : "Whole trip", line_items: [],
    };
  };

  const actualType = (value: unknown, fallback: OperationsEventType): OperationsEventType =>
    value === "Loading" || value === "Unloading" || value === "Backload" || value === "Offload" ? value : fallback;
  const eventTypeRecord = (
    id: string,
    sourceType: OperationsSourceType,
    value: unknown,
  ) => ({
    id,
    source_type: sourceType,
    event_type: actualType(value, sourceType === "LOADING" ? "Loading" : sourceType === "UNLOADING" ? "Unloading" : sourceType === "BACKLOAD" ? "Backload" : "Offload"),
  });
  const pushReport = (args: {
    trip: EventTrip; sourceType: OperationsEventRow["source_type"]; sourceId: string;
    fallbackType: OperationsEventType; eventType: unknown; stopId: string | null;
    loading?: EventLoading; unloading?: EventUnloading; cargo?: EventCargo;
  }) => {
    const stop = args.stopId ? stops.get(args.stopId) : undefined;
    const validStop = stop?.trip_id === args.trip.id ? stop : undefined;
    const scopeStopId = validStop?.id ?? null;
    const type = actualType(args.eventType, args.fallbackType);
    const row = base(args.trip, type, args.sourceType, args.sourceId, scopeStopId, validStop?.stop_sequence ?? null);
    row.report_type = type;
    row.report_types = [type];
    row.event_type_records = [eventTypeRecord(args.sourceId, args.sourceType, args.eventType)];
    row.dispatch_number = args.stopId ? validStop?.dispatch_number ?? null : args.trip.dispatch_number ?? null;
    if (args.sourceType === "LOADING" && args.loading) {
      const lines = linesByTrip.get(args.trip.id) ?? [];
      row.loading_report_id = args.sourceId;
      row.loading_timestamps = { warehouse_arrival_at: args.loading.warehouse_arrival_at, loading_start_at: args.loading.loading_start_at, loading_finished_at: args.loading.loading_finished_at };
      row.line_items = lines;
      row.dr_number = distinctDrNumbers(lines);
      row.quantity = sumField(lines, "quantity");
      row.quantity_scope = "Trip total";
      row.total_cbm = sumField(lines, "cbm");
      row.remarks = args.trip.remarks ?? null;
    } else if (args.sourceType === "UNLOADING" && args.unloading) {
      row.unloading_report_id = args.sourceId;
      if (validStop) {
        const lines = linesByStop.get(validStop.id) ?? [];
        row.unloading_timestamps = { arrival_time: validStop.arrival_time ?? null, start_unloading_time: validStop.start_unloading_time ?? null, finish_unloading_time: validStop.finish_unloading_time ?? null };
        row.date = validStop.finish_unloading_time ?? null;
        row.line_items = lines;
        row.dr_number = distinctDrNumbers(lines);
        row.quantity = sumField(lines, "quantity");
        row.quantity_scope = "Stop total";
        row.total_cbm = sumField(lines, "cbm");
        row.remarks = validStop.remarks ?? null;
      } else row.scope_label = "Stop reference unavailable";
    } else if (args.cargo) {
      if (args.sourceType === "BACKLOAD") row.backload_records = [args.cargo];
      if (args.sourceType === "OFFLOAD") row.offload_records = [args.cargo];
      row.reason = args.cargo.reason ?? null;
      row.remarks = args.sourceType === "OFFLOAD" ? args.cargo.comments ?? null : args.cargo.comments ?? args.cargo.reason ?? null;
      if (args.sourceType === "OFFLOAD") {
        row.date = args.cargo.reported_at ?? args.cargo.report_date ?? args.cargo.created_at ?? null;
        row.reported_by = args.cargo.reported_by_name ?? null;
      }
      row.quantity = args.sourceType === "OFFLOAD" ? sumNumericValues((args.cargo.items ?? []).map((item) => item.quantity)) : args.cargo.number_of_boxes ?? null;
      row.quantity_scope = args.sourceType === "OFFLOAD" ? null : "Boxes";
      row.total_cbm = args.sourceType === "OFFLOAD" ? sumNumericValues((args.cargo.items ?? []).map((item) => item.total_cbm)) : null;
      const lines = args.stopId
        ? validStop ? linesByStop.get(validStop.id) ?? [] : []
        : linesByTrip.get(args.trip.id) ?? [];
      row.line_items = lines;
      row.dr_number = args.sourceType === "OFFLOAD"
        ? distinctDrNumbers(args.cargo.items ?? [])
        : distinctDrNumbers(lines);
      if (args.stopId && !validStop) row.scope_label = "Stop reference unavailable";
    }
    rows.push(row);
  };

  for (const report of input.loading) {
    const trip = trips.get(report.trip_id);
    if (trip) pushReport({ trip, sourceType: "LOADING", sourceId: report.id, fallbackType: "Loading", eventType: report.event_type, stopId: null, loading: report });
  }
  for (const report of input.unloading) {
    if (input.convertedUnloadingIds?.has(report.id)) continue;
    const trip = trips.get(report.trip_id);
    if (trip) pushReport({ trip, sourceType: "UNLOADING", sourceId: report.id, fallbackType: "Unloading", eventType: report.event_type, stopId: report.trip_stop_id, unloading: report });
  }
  for (const [sourceType, records, fallbackType] of [
    ["BACKLOAD", input.backloads, "Backload"], ["OFFLOAD", input.offloads, "Offload"],
  ] as const) {
    for (const record of records) {
      const trip = trips.get(record.trip_id);
      if (trip) pushReport({ trip, sourceType, sourceId: record.id, fallbackType, eventType: record.event_type, stopId: record.trip_stop_id, cargo: record });
    }
  }
  return rows.sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0) || a.trip_id.localeCompare(b.trip_id) || a.id.localeCompare(b.id));
}

export const REPORT_TIMESTAMP_FIELDS = { loading: LOADING_FIELDS, unloading: UNLOADING_FIELDS } as const;
