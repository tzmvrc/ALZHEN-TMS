import { supabaseAdmin } from "../config/supabase.js";
import {
  DocumentCreateInput,
  DocumentListResponse,
  DocumentQueryParams,
  DocumentRecord,
  DocumentUpdateInput,
} from "../types/document.types.js";
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

const DOCUMENT_TYPE_VALUES = ["POD", "ACCOUNTING_COPY"] as const;
const DOCUMENT_STATUS_VALUES = ["PENDING", "VERIFIED"] as const;
const OCR_STATUS_VALUES = ["PENDING", "COMPLETED"] as const;
const DOCUMENT_SORT_FIELDS = [
  "id",
  "trip_id",
  "trip_stop_id",
  "document_type",
  "document_number",
  "file_name",
  "mime_type",
  "status",
  "uploaded_by",
  "uploaded_at",
  "verified_by",
  "verified_at",
  "ocr_status",
  "created_at",
  "updated_at",
] as const;
const DOCUMENT_CREATE_FIELDS = [
  "trip_id",
  "trip_stop_id",
  "document_type",
  "document_number",
  "file_path",
  "file_name",
  "mime_type",
  "status",
  "ocr_status",
  "ocr_text",
  "remarks",
] as const;
const DOCUMENT_UPDATE_FIELDS = [
  "document_number",
  "file_path",
  "file_name",
  "mime_type",
  "status",
  "ocr_status",
  "ocr_text",
  "remarks",
] as const;

function normalizeKnownValue(
  value: unknown,
  fieldName: string,
  allowed: readonly string[],
) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (!allowed.includes(normalized)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }

  return normalized;
}

function normalizeStringField(value: unknown, fieldName: string) {
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

  return trimmed;
}

function normalizeNullableText(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return value === null ? null : undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function assertTripExists(tripId: string) {
  const { data, error } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Trip existence lookup failed:", error);
    throw new Error("Unable to validate trip");
  }

  if (!data) {
    throw new Error("Trip not found");
  }
}

async function assertTripStopBelongsToTrip(tripId: string, tripStopId: string) {
  const { data, error } = await supabaseAdmin
    .from("trip_stops")
    .select("id, trip_id")
    .eq("id", tripStopId)
    .maybeSingle();

  if (error) {
    console.error("Trip stop ownership lookup failed:", error);
    throw new Error("Unable to validate trip stop");
  }

  if (!data) {
    throw new Error("Stop not found");
  }

  if (data.trip_id !== tripId) {
    throw new Error("Stop does not belong to this trip");
  }
}

function ensureAllowedCreateFields(input: Record<string, unknown>) {
  const unknown = Object.keys(input).filter(
    (key) =>
      !DOCUMENT_CREATE_FIELDS.includes(
        key as (typeof DOCUMENT_CREATE_FIELDS)[number],
      ),
  );

  if (unknown.length > 0) {
    throw new Error(`Invalid document field(s): ${unknown.join(", ")}`);
  }
}

function ensureAllowedUpdateFields(input: Record<string, unknown>) {
  const protectedFields = [
    "id",
    "trip_id",
    "trip_stop_id",
    "uploaded_by",
    "uploaded_at",
    "created_at",
    "updated_at",
    "verified_by",
    "verified_at",
  ];

  const disallowed = Object.keys(input).filter(
    (key) =>
      protectedFields.includes(key) ||
      !DOCUMENT_UPDATE_FIELDS.includes(
        key as (typeof DOCUMENT_UPDATE_FIELDS)[number],
      ),
  );

  if (disallowed.length > 0) {
    throw new Error(
      `Invalid or protected document field(s): ${disallowed.join(", ")}`,
    );
  }
}

function buildDocumentCreatePayload(input: DocumentCreateInput) {
  const payload: Record<string, unknown> = {};

  if (!input.trip_id) {
    throw new Error("trip_id is required.");
  }

  if (!isValidUuid(input.trip_id)) {
    throw new Error("trip_id must be a valid UUID.");
  }

  payload.trip_id = input.trip_id;

  if (input.trip_stop_id !== undefined && input.trip_stop_id !== null) {
    const tripStopId = String(input.trip_stop_id).trim();
    if (!isValidUuid(tripStopId)) {
      throw new Error("trip_stop_id must be a valid UUID.");
    }
    payload.trip_stop_id = tripStopId;
  } else if (input.trip_stop_id === null) {
    payload.trip_stop_id = null;
  }

  const documentType = normalizeKnownValue(
    input.document_type,
    "document_type",
    DOCUMENT_TYPE_VALUES,
  );
  if (documentType === undefined) {
    throw new Error("document_type is required.");
  }
  payload.document_type = documentType;

  const documentNumber = normalizeStringField(
    input.document_number,
    "document_number",
  );
  if (documentNumber === undefined) {
    throw new Error("document_number is required.");
  }
  payload.document_number = documentNumber;

  const filePath = normalizeStringField(input.file_path, "file_path");
  if (filePath === undefined) {
    throw new Error("file_path is required.");
  }
  payload.file_path = filePath;

  const fileName = normalizeStringField(input.file_name, "file_name");
  if (fileName === undefined) {
    throw new Error("file_name is required.");
  }
  payload.file_name = fileName;

  const mimeType = normalizeStringField(input.mime_type, "mime_type");
  if (mimeType === undefined) {
    throw new Error("mime_type is required.");
  }
  payload.mime_type = mimeType;

  const status = normalizeKnownValue(
    input.status,
    "status",
    DOCUMENT_STATUS_VALUES,
  );
  if (status === undefined) {
    throw new Error("status is required.");
  }
  payload.status = status;

  const ocrStatus = normalizeKnownValue(
    input.ocr_status ?? "PENDING",
    "ocr_status",
    OCR_STATUS_VALUES,
  );
  payload.ocr_status = ocrStatus ?? "PENDING";

  const ocrText = normalizeNullableText(input.ocr_text, "ocr_text");
  if (ocrText !== undefined) {
    payload.ocr_text = ocrText;
  }

  const remarks = normalizeNullableText(input.remarks, "remarks");
  if (remarks !== undefined) {
    payload.remarks = remarks;
  }

  return payload;
}

function buildDocumentUpdatePayload(input: DocumentUpdateInput) {
  const payload: Record<string, unknown> = {};

  if (input.document_number !== undefined) {
    const value = normalizeStringField(
      input.document_number,
      "document_number",
    );
    if (value === undefined) {
      throw new Error("document_number cannot be empty.");
    }
    payload.document_number = value;
  }

  if (input.file_path !== undefined) {
    const value = normalizeStringField(input.file_path, "file_path");
    if (value === undefined) {
      throw new Error("file_path cannot be empty.");
    }
    payload.file_path = value;
  }

  if (input.file_name !== undefined) {
    const value = normalizeStringField(input.file_name, "file_name");
    if (value === undefined) {
      throw new Error("file_name cannot be empty.");
    }
    payload.file_name = value;
  }

  if (input.mime_type !== undefined) {
    const value = normalizeStringField(input.mime_type, "mime_type");
    if (value === undefined) {
      throw new Error("mime_type cannot be empty.");
    }
    payload.mime_type = value;
  }

  if (input.status !== undefined) {
    const value = normalizeKnownValue(
      input.status,
      "status",
      DOCUMENT_STATUS_VALUES,
    );
    if (value === undefined) {
      throw new Error("status cannot be empty.");
    }
    payload.status = value;
  }

  if (input.ocr_status !== undefined) {
    const value = normalizeKnownValue(
      input.ocr_status,
      "ocr_status",
      OCR_STATUS_VALUES,
    );
    if (value === undefined) {
      throw new Error("ocr_status cannot be empty.");
    }
    payload.ocr_status = value;
  }

  if (input.ocr_text !== undefined) {
    const value = normalizeNullableText(input.ocr_text, "ocr_text");
    payload.ocr_text = value;
  }

  if (input.remarks !== undefined) {
    const value = normalizeNullableText(input.remarks, "remarks");
    payload.remarks = value;
  }

  return payload;
}

export async function getDocumentList(
  query: DocumentQueryParams = {},
): Promise<DocumentListResponse> {
  const { page, limit, from } = normalizePagination(
    { page: query.page ?? "1", limit: query.limit ?? "20" },
    100,
  );

  const sortBy =
    query.sort_by &&
    DOCUMENT_SORT_FIELDS.includes(
      query.sort_by as (typeof DOCUMENT_SORT_FIELDS)[number],
    )
      ? query.sort_by
      : "uploaded_at";
  const sortOrder = normalizeSortOrder(query.sort_order, "desc");

  let queryBuilder = supabaseAdmin
    .from("documents")
    .select("*", { count: "exact" });

  if (query.trip_id) {
    if (!isValidUuid(query.trip_id)) {
      throw new Error("trip_id must be a valid UUID.");
    }
    queryBuilder = queryBuilder.eq("trip_id", query.trip_id);
  }

  if (query.trip_stop_id) {
    if (!isValidUuid(query.trip_stop_id)) {
      throw new Error("trip_stop_id must be a valid UUID.");
    }
    queryBuilder = queryBuilder.eq("trip_stop_id", query.trip_stop_id);
  }

  if (query.document_type) {
    const normalizedType = normalizeKnownValue(
      query.document_type,
      "document_type",
      DOCUMENT_TYPE_VALUES,
    );
    if (normalizedType === undefined) {
      throw new Error("document_type must be one of: POD, ACCOUNTING_COPY.");
    }
    queryBuilder = queryBuilder.eq("document_type", normalizedType);
  }

  if (query.status) {
    const normalizedStatus = normalizeKnownValue(
      query.status,
      "status",
      DOCUMENT_STATUS_VALUES,
    );
    if (normalizedStatus === undefined) {
      throw new Error("status must be one of: PENDING, VERIFIED.");
    }
    queryBuilder = queryBuilder.eq("status", normalizedStatus);
  }

  if (query.ocr_status) {
    const normalizedStatus = normalizeKnownValue(
      query.ocr_status,
      "ocr_status",
      OCR_STATUS_VALUES,
    );
    if (normalizedStatus === undefined) {
      throw new Error("ocr_status must be one of: PENDING, COMPLETED.");
    }
    queryBuilder = queryBuilder.eq("ocr_status", normalizedStatus);
  }

  const searchText = normalizeText(query.search);
  if (searchText) {
    const filter = buildIlikeOrFilter(
      ["document_number", "file_name", "remarks"],
      searchText,
    );
    if (filter) queryBuilder = queryBuilder.or(filter);
  }

  queryBuilder = queryBuilder.order(sortBy, {
    ascending: sortOrder === "asc",
  });
  queryBuilder = queryBuilder.range(from, from + limit - 1);

  const { data, error, count } = await queryBuilder;
  if (error) {
    console.error("Document list query failed:", { query, error });
    throw new Error("Unable to fetch documents");
  }

  return {
    rows: (data ?? []) as DocumentRecord[],
    pagination: buildPaginationMeta(page, limit, count ?? (data ?? []).length),
  };
}

export async function getDocumentById(id: string): Promise<DocumentRecord> {
  if (!isValidUuid(id)) {
    throw new Error("Invalid document id");
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Document detail query failed:", { id, error });
    throw new Error("Unable to fetch document");
  }

  if (!data) {
    throw new Error("Document not found");
  }

  return data as DocumentRecord;
}

export async function createDocumentRecord(
  input: DocumentCreateInput,
  userId: string,
): Promise<DocumentRecord> {
  if (!userId) {
    throw new Error("Authentication required");
  }

  if (!isValidUuid(userId)) {
    throw new Error("Invalid authenticated user id");
  }

  ensureAllowedCreateFields(input as Record<string, unknown>);

  if (!input.trip_id) {
    throw new Error("trip_id is required.");
  }

  if (!isValidUuid(input.trip_id)) {
    throw new Error("trip_id must be a valid UUID.");
  }

  await assertTripExists(input.trip_id);

  if (input.trip_stop_id !== undefined && input.trip_stop_id !== null) {
    if (!isValidUuid(String(input.trip_stop_id))) {
      throw new Error("trip_stop_id must be a valid UUID.");
    }
    await assertTripStopBelongsToTrip(
      input.trip_id,
      String(input.trip_stop_id),
    );
  }

  const payload = buildDocumentCreatePayload(input);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("documents")
    .insert({
      ...payload,
      uploaded_by: userId,
      uploaded_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Document creation failed:", { input, payload, error });
    if (
      error.code === "23503" ||
      /foreign key|violates/.test(String(error.message))
    ) {
      throw new Error("Document references an invalid trip or stop.");
    }
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Document already exists.");
    }
    throw new Error("Unable to create document");
  }

  return data as DocumentRecord;
}

export async function updateDocumentRecord(
  id: string,
  input: DocumentUpdateInput,
): Promise<DocumentRecord> {
  if (!isValidUuid(id)) {
    throw new Error("Invalid document id");
  }

  const existing = await getDocumentById(id);
  if (!existing) {
    throw new Error("Document not found");
  }

  if (Object.keys(input).length === 0) {
    throw new Error("No valid document fields were provided for update.");
  }

  ensureAllowedUpdateFields(input as Record<string, unknown>);

  const payload = buildDocumentUpdatePayload(input);
  if (Object.keys(payload).length === 0) {
    throw new Error("No valid document fields were provided for update.");
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("Document update failed:", { id, payload, error });
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Document already exists.");
    }
    throw new Error("Unable to update document");
  }

  return data as DocumentRecord;
}

export async function verifyDocumentRecord(
  id: string,
  userId: string,
): Promise<DocumentRecord> {
  if (!isValidUuid(id)) {
    throw new Error("Invalid document id");
  }

  if (!isValidUuid(userId)) {
    throw new Error("Invalid authenticated user id");
  }

  const existing = await getDocumentById(id);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("documents")
    .update({
      status: "VERIFIED",
      verified_by: userId,
      verified_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("Document verification failed:", { id, userId, error });
    throw new Error("Unable to verify document");
  }

  return data as DocumentRecord;
}
