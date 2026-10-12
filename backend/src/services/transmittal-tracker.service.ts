import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import type { FlexActor } from "../types/flexible-table.types.js";
import { assertFlexAccess, calculateFlexAccess } from "./flexible-table.authorization.js";
import { requireCellVersion, requireUuid, validateCellValue } from "./flexible-table.validation.js";
import { buildTransmittalTrackerRows, filterTransmittalTrackerRows, isTrackerCellVersionCurrent, isTrackerEmptyOverride, persistTrackerCellAndAudit, resolveLegacyPodCellValue, shouldSeedDefaultStaffPermission, TRACKER_EMPTY_OVERRIDE, type TransmittalAssignment, type TransmittalDriver, type TransmittalLineItem, type TransmittalNamedRecord, type TransmittalStopRecord, type TransmittalTripRecord, type TransmittalTruck, type TransmittalWarehouse } from "./transmittal-tracker.logic.js";

const SYSTEM_KEY = "alzhen_transmittal_tracker_v1";
const TABLE_NAME = "Transmittal Tracker (System)";
const BATCH_SIZE = 500;
const TRACKER_COLUMNS = [
  { key: "warehouse_code_override", name: "WH CODE", value_type: "TEXT", input_mode: "TEXT" },
  { key: "delivered_to_override", name: "Delivered to", value_type: "TEXT", input_mode: "TEXT" },
  { key: "plate_number_override", name: "Plate #", value_type: "TEXT", input_mode: "TEXT" },
  { key: "delivery_receipt_no_override", name: "Delivery Receipt No.", value_type: "TEXT", input_mode: "TEXT" },
  { key: "sales_order_no_override", name: "S.O. No.", value_type: "TEXT", input_mode: "TEXT" },
  { key: "transmittal_ref", name: "Transmittal Ref#", value_type: "TEXT", input_mode: "TEXT" },
  { key: "date_created_override", name: "Date created", value_type: "DATE", input_mode: "DATE" },
  { key: "tracker_status", name: "Status", value_type: "TEXT", input_mode: "DROPDOWN", dropdown_field: "delivery_status" },
  { key: "lbc_waybill_no", name: "LBC Waybill no.", value_type: "TEXT", input_mode: "TEXT" },
  { key: "lbc_shipping_date", name: "Shipping date via LBC", value_type: "DATE", input_mode: "DATE" },
  { key: "tracker_remarks", name: "Remarks", value_type: "TEXT", input_mode: "TEXT" },
  { key: "loading_date_override", name: "Loading Date override", value_type: "DATE", input_mode: "DATE" },
  { key: "delivery_date_override", name: "Date Delivered override", value_type: "DATE", input_mode: "DATE" },
] as const;
const EDITABLE_FIELDS = new Set<string>(TRACKER_COLUMNS.map((column) => column.key));
const TABLE_FIELDS = "id, name, table_kind, report_key, settings, created_by, version, created_at, updated_at, archived_at";
const COLUMN_FIELDS = "id, table_id, name, position, value_type, input_mode, binding_scope, settings, is_hidden, is_archived, created_by, version, created_at, updated_at";
const ROW_FIELDS = "id, table_id, row_kind, source_entity_type, source_entity_id, position, created_by, version, created_at, updated_at, archived_at";
const CELL_FIELDS = "id, row_id, column_id, value, version, updated_by, created_at, updated_at";
type DbRecord = Record<string, any>;

function failDb(operation: string, error: unknown): never {
  console.error(`Transmittal tracker ${operation} failed:`, error);
  throw new ApiError("Unable to load or save the Transmittal Tracker.", 500, "TRANSMITTAL_TRACKER_QUERY_FAILED");
}

async function audit(tableId: string, actorId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown, requestId?: string) {
  const { error } = await supabaseAdmin.from("flex_audit_events").insert({
    table_id: tableId,
    actor_profile_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_data: before ?? null,
    after_data: after ?? null,
    request_id: requestId && requestId.length <= 100 ? requestId : randomUUID(),
  });
  if (error) failDb("audit write", error);
}

async function findSystemTable() {
  const { data: byName, error } = await supabaseAdmin.from("flex_tables").select(TABLE_FIELDS).eq("name", TABLE_NAME).eq("table_kind", "CUSTOM").is("archived_at", null).maybeSingle();
  if (error) failDb("system table lookup", error);
  if (!byName) return null;
  if (!byName.settings || byName.settings.system_key !== SYSTEM_KEY) {
    throw new ApiError("A custom table is using the reserved Transmittal Tracker name.", 409, "TRANSMITTAL_TRACKER_NAME_RESERVED");
  }
  return byName as DbRecord;
}

async function ensureStaffPermission(tableId: string, actorId: string) {
  const { data: existing, error: findError } = await supabaseAdmin.from("flex_table_permissions")
    .select("id, subject_type, subject_role, subject_profile_id, can_view, can_edit, can_manage")
    .eq("table_id", tableId);
  if (findError) failDb("STAFF access lookup", findError);
  // Do not add a broad role grant over existing per-profile policy. Defaults
  // are seeded only for a permission-empty table.
  if (!shouldSeedDefaultStaffPermission(existing ?? [])) return;
  const { data, error } = await supabaseAdmin.from("flex_table_permissions").insert({
    table_id: tableId, subject_type: "ROLE", subject_role: "STAFF", subject_profile_id: null,
    can_view: true, can_edit: true, can_manage: false, created_by: actorId,
  }).select("id, table_id, subject_type, subject_role, can_view, can_edit, can_manage").single();
  if (error && error.code !== "23505") failDb("STAFF access creation", error);
  if (data) await audit(tableId, actorId, "grant", "PERMISSION", data.id, null, data);
}

async function ensureColumns(table: DbRecord, actorId: string) {
  const { data: existing, error } = await supabaseAdmin.from("flex_columns").select(COLUMN_FIELDS).eq("table_id", table.id).eq("is_archived", false);
  if (error) failDb("column lookup", error);
  const byName = new Map((existing ?? []).map((column) => [column.name, column]));
  let position = Math.max(-1, ...(existing ?? []).map((column) => Number(column.position))) + 1;
  for (const [index, definition] of TRACKER_COLUMNS.entries()) {
    const column = byName.get(definition.name);
    if (column) {
      if (column.settings?.system_key !== definition.key) {
        throw new ApiError(`A non-system column is already using the reserved Transmittal Tracker name “${definition.name}”. Rename it before initializing the tracker.`, 409, "TRANSMITTAL_TRACKER_COLUMN_NAME_RESERVED");
      }
      if (column.binding_scope !== "STOP" || column.value_type !== definition.value_type || column.is_archived) {
        throw new ApiError(`The Transmittal Tracker column “${definition.name}” has an incompatible configuration.`, 409, "TRANSMITTAL_TRACKER_SCHEMA_CONFLICT");
      }
      const settings = column.settings && typeof column.settings === "object" && !Array.isArray(column.settings) ? column.settings : {};
      const nextSettings = { ...settings, system_key: definition.key, ...( "dropdown_field" in definition ? { dropdown_field: definition.dropdown_field } : {}) };
      if (column.input_mode !== definition.input_mode || JSON.stringify(settings) !== JSON.stringify(nextSettings)) {
        const { data: updated, error: updateError } = await supabaseAdmin.from("flex_columns")
          .update({ input_mode: definition.input_mode, settings: nextSettings, version: Number(column.version) + 1, updated_at: new Date().toISOString() })
          .eq("id", column.id).eq("version", column.version).select(COLUMN_FIELDS).maybeSingle();
        if (updateError) failDb("column configuration update", updateError);
        if (!updated) throw new ApiError(`The Transmittal Tracker column “${definition.name}” changed during initialization. Retry once.`, 409, "TRANSMITTAL_TRACKER_COLUMN_CONFLICT");
        await audit(table.id, actorId, "update", "COLUMN", column.id, column, updated);
      }
      continue;
    }
    const { data, error: createError } = await supabaseAdmin.from("flex_columns").insert({
      table_id: table.id,
      name: definition.name,
      position: position++,
      value_type: definition.value_type,
      input_mode: definition.input_mode,
      binding_scope: "STOP",
      settings: { system_key: definition.key, ...( "dropdown_field" in definition ? { dropdown_field: definition.dropdown_field } : {}) },
      is_hidden: false,
      is_archived: false,
      created_by: actorId,
    }).select(COLUMN_FIELDS).single();
    if (createError) {
      if (createError.code === "23505") continue;
      failDb("column creation", createError);
    }
    await audit(table.id, actorId, "create", "COLUMN", data.id, null, data);
    byName.set(definition.name, data);
  }
}

/**
 * Initializes the shared backing table from an ADMIN request. This is
 * deliberately idempotent but consists of multiple PostgREST requests; it is
 * not presented as an atomic transaction. Each step is safe to retry.
 */
export async function initializeTracker(actor: FlexActor, requestId?: string) {
  if (actor.role !== "ADMIN") throw new ApiError("Only an ADMIN can initialize the Transmittal Tracker.", 403, "TRANSMITTAL_TRACKER_ADMIN_REQUIRED");
  let table = await findSystemTable();
  if (!table) {
    const { data: created, error } = await supabaseAdmin.from("flex_tables").insert({
      name: TABLE_NAME,
      table_kind: "CUSTOM",
      report_key: null,
      settings: { system_key: SYSTEM_KEY },
      created_by: actor.id,
    }).select(TABLE_FIELDS).single();
    if (error && error.code !== "23505") failDb("system table creation", error);
    table = created ?? await findSystemTable();
    if (!table) throw new ApiError("Tracker initialization raced with another request. Retry once.", 409, "TRANSMITTAL_TRACKER_INIT_CONFLICT");
    if (created) await audit(table.id, actor.id, "create", "TABLE", table.id, null, created, requestId);
  }
  await ensureColumns(table, actor.id);
  await ensureStaffPermission(table.id, actor.id);
  return { id: table.id, initialized: true };
}

async function getTrackerAccess(actor: FlexActor, level: "view" | "edit") {
  const table = await findSystemTable();
  if (!table) throw new ApiError("The Transmittal Tracker has not been initialized by an administrator.", 503, "TRANSMITTAL_TRACKER_NOT_INITIALIZED");
  const isAdmin = actor.role === "ADMIN";
  let permissions: Array<{ subject_type: string; subject_role: string | null; subject_profile_id: string | null; can_view: boolean; can_edit: boolean; can_manage: boolean }> = [];
  if (!isAdmin && table.created_by !== actor.id) {
    const { data, error } = await supabaseAdmin.from("flex_table_permissions")
      .select("subject_type, subject_role, subject_profile_id, can_view, can_edit, can_manage")
      .eq("table_id", table.id)
      .or(`and(subject_type.eq.ROLE,subject_role.eq.${actor.role}),and(subject_type.eq.PROFILE,subject_profile_id.eq.${actor.id})`);
    if (error) failDb("table permission lookup", error);
    permissions = data ?? [];
  }
  const access = calculateFlexAccess(actor, table.created_by, permissions);
  assertFlexAccess(access, level);
  return { table, access };
}

async function readPaged<T>(tableName: string, select: string, configure?: (builder: any) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    let builder = supabaseAdmin.from(tableName).select(select);
    if (configure) builder = configure(builder);
    const { data, error } = await builder.range(from, from + BATCH_SIZE - 1);
    if (error) failDb(`${tableName} source query`, error);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < BATCH_SIZE) break;
  }
  return rows;
}

async function readByIds<T>(tableName: string, select: string, column: string, ids: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batchIds = ids.slice(index, index + 100);
    rows.push(...await readPaged<T>(tableName, select, (query) => query.in(column, batchIds)));
  }
  return rows;
}

async function readSourceData() {
  // Stops define tracker cardinality. Every enrichment collection is fetched
  // separately and grouped in logic, avoiding line-item/assignment cross joins.
  const stops = await readPaged<TransmittalStopRecord>("trip_stops", "id, trip_id, stop_sequence, customer_id, store_id, delivery_status, finish_unloading_time", (query) => query.order("trip_id", { ascending: true }).order("stop_sequence", { ascending: true }).order("id", { ascending: true }));
  const tripIds = [...new Set(stops.map((stop) => stop.trip_id).filter(Boolean))];
  const storeIds = [...new Set(stops.map((stop) => stop.store_id).filter((id): id is string => Boolean(id)))];
  const customerIds = [...new Set(stops.map((stop) => stop.customer_id).filter((id): id is string => Boolean(id)))];
  const stopIds = stops.map((stop) => stop.id);

  const [trips, stores, customers, assignments, lineItems] = await Promise.all([
    readByIds<TransmittalTripRecord>("trips", "id, warehouse_id, loading_date, lbc_tracking_number, pod_ac_shipping_date", "id", tripIds),
    readByIds<TransmittalNamedRecord>("customer_stores", "id, name", "id", storeIds),
    readByIds<TransmittalNamedRecord>("customers", "id, name", "id", customerIds),
    readByIds<TransmittalAssignment>("trip_truck_assignments", "trip_id, truck_id, driver_id, assignment_type", "trip_id", tripIds),
    readByIds<TransmittalLineItem>("trip_line_items", "trip_stop_id, dr_number, sap_so_number", "trip_stop_id", stopIds),
  ]);
  const warehouseIds = [...new Set(trips.map((trip) => trip.warehouse_id).filter((id): id is string => Boolean(id)))];
  const truckIds = [...new Set(assignments.map((row) => row.truck_id).filter((id): id is string => Boolean(id)))];
  const driverIds = [...new Set(assignments.map((row) => row.driver_id).filter((id): id is string => Boolean(id)))];
  const [warehouses, trucks, drivers] = await Promise.all([
    readByIds<TransmittalWarehouse>("warehouses", "id, code", "id", warehouseIds),
    readByIds<TransmittalTruck>("trucks", "id, plate_number", "id", truckIds),
    readByIds<TransmittalDriver>("drivers", "id, first_name, last_name", "id", driverIds),
  ]);
  return { stops, trips, warehouses, stores, customers, assignments, trucks, drivers, line_items: lineItems };
}

async function readSourceRowsAndCells(tableId: string, stopIds: string[]) {
  const rows: DbRecord[] = [];
  for (let index = 0; index < stopIds.length; index += 100) {
    const ids = stopIds.slice(index, index + 100);
    const batch = await readPaged<DbRecord>("flex_rows", ROW_FIELDS, (query) => query.eq("table_id", tableId).eq("row_kind", "SOURCE").eq("source_entity_type", "STOP").is("archived_at", null).in("source_entity_id", ids).order("id", { ascending: true }));
    rows.push(...batch);
  }
  const rowIds = rows.map((row) => row.id as string);
  const cells: DbRecord[] = [];
  for (let index = 0; index < rowIds.length; index += 100) {
    const ids = rowIds.slice(index, index + 100);
    const batch = await readPaged<DbRecord>("flex_cells", CELL_FIELDS, (query) => query.in("row_id", ids).order("id", { ascending: true }));
    cells.push(...batch);
  }
  return { rows, cells };
}

export async function getTracker(actor: FlexActor, searchInput: unknown, requestId?: string) {
  const { table, access } = await getTrackerAccess(actor, "view");
  const [source, columnResult] = await Promise.all([
    readSourceData(),
    supabaseAdmin.from("flex_columns").select(COLUMN_FIELDS).eq("table_id", table.id).eq("is_archived", false),
  ]);
  if (columnResult.error) failDb("column load", columnResult.error);
  const configured = new Map((columnResult.data ?? []).map((column) => [column.settings?.system_key, column]));
  const columns = TRACKER_COLUMNS.map((definition) => {
    const column = configured.get(definition.key);
    if (!column || column.binding_scope !== "STOP" || column.value_type !== definition.value_type) {
      throw new ApiError("Tracker storage is incomplete. An ADMIN must initialize or repair it.", 503, "TRANSMITTAL_TRACKER_SCHEMA_INCOMPLETE");
    }
    return { ...column, input_mode: definition.input_mode, settings: { ...column.settings, ...( "dropdown_field" in definition ? { dropdown_field: definition.dropdown_field } : {}) } };
  });
  const stopIds = source.stops.map((record) => record.id);
  const storage = await readSourceRowsAndCells(table.id, stopIds);
  const rowByStop = new Map<string, DbRecord>();
  for (const row of storage.rows) {
    const sourceId = String(row.source_entity_id);
    if (rowByStop.has(sourceId)) throw new ApiError("Multiple active tracker rows refer to one delivery stop.", 409, "TRANSMITTAL_TRACKER_DUPLICATE_STOP_BINDING");
    rowByStop.set(sourceId, row);
  }
  const columnById = new Map(columns.map((column) => [column.id, column.settings.system_key as string]));
  const rowById = new Map(storage.rows.map((row) => [row.id, row]));
  const cellsByStop = new Map<string, Record<string, { value: unknown; version: number; row_id: string }>>();
  for (const cell of storage.cells) {
    const parent = rowById.get(cell.row_id);
    const field = columnById.get(cell.column_id);
    if (!parent || !field) continue;
    const record = cellsByStop.get(parent.source_entity_id) ?? {};
    record[field] = { value: cell.value, version: cell.version, row_id: parent.id };
    cellsByStop.set(parent.source_entity_id, record);
  }
  const rows = filterTransmittalTrackerRows(buildTransmittalTrackerRows(source, cellsByStop), searchInput === undefined ? "" : String(searchInput));
  const requestIdValue = requestId && requestId.length <= 100 ? requestId : undefined;
  return { table_id: table.id, access, columns, rows, request_id: requestIdValue };
}

async function getOrCreateSourceRow(table: DbRecord, actorId: string, stopId: string, requestId?: string) {
  const active = await supabaseAdmin.from("flex_rows").select(ROW_FIELDS).eq("table_id", table.id).eq("row_kind", "SOURCE").eq("source_entity_type", "STOP").eq("source_entity_id", stopId).is("archived_at", null).maybeSingle();
  if (active.error) failDb("source row lookup", active.error);
  if (active.data) return active.data as DbRecord;

  const archived = await supabaseAdmin.from("flex_rows").select(ROW_FIELDS).eq("table_id", table.id).eq("row_kind", "SOURCE").eq("source_entity_type", "STOP").eq("source_entity_id", stopId).not("archived_at", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (archived.error) failDb("archived source row lookup", archived.error);
  if (archived.data) {
    const before = archived.data;
    const { data, error } = await supabaseAdmin.from("flex_rows").update({ archived_at: null, version: before.version + 1, updated_at: new Date().toISOString() }).eq("id", before.id).eq("version", before.version).select(ROW_FIELDS).maybeSingle();
    if (error) failDb("source row restoration", error);
    if (data) {
      await audit(table.id, actorId, "restore", "ROW", data.id, before, data, requestId);
      return data as DbRecord;
    }
    const retry = await supabaseAdmin.from("flex_rows").select(ROW_FIELDS).eq("table_id", table.id).eq("row_kind", "SOURCE").eq("source_entity_type", "STOP").eq("source_entity_id", stopId).is("archived_at", null).maybeSingle();
    if (retry.error) failDb("source row conflict recovery", retry.error);
    if (retry.data) return retry.data as DbRecord;
    throw new ApiError("The tracker row changed during save. Retry the edit.", 409, "TRANSMITTAL_TRACKER_ROW_CONFLICT");
  }

  const { data, error } = await supabaseAdmin.from("flex_rows").insert({
    table_id: table.id, row_kind: "SOURCE", source_entity_type: "STOP", source_entity_id: stopId,
    position: 0, created_by: actorId,
  }).select(ROW_FIELDS).single();
  if (error) {
    if (error.code === "23505") {
      const retry = await supabaseAdmin.from("flex_rows").select(ROW_FIELDS).eq("table_id", table.id).eq("row_kind", "SOURCE").eq("source_entity_type", "STOP").eq("source_entity_id", stopId).is("archived_at", null).maybeSingle();
      if (retry.error) failDb("source row conflict recovery", retry.error);
      if (retry.data) return retry.data as DbRecord;
      throw new ApiError("The tracker row changed during save. Retry the edit.", 409, "TRANSMITTAL_TRACKER_ROW_CONFLICT");
    }
    failDb("source row creation", error);
  }
  await audit(table.id, actorId, "create", "ROW", data.id, null, data, requestId);
  return data as DbRecord;
}

export async function updateTrackerCell(actor: FlexActor, stopIdInput: unknown, fieldInput: unknown, input: Record<string, unknown>, requestId?: string) {
  const { table } = await getTrackerAccess(actor, "edit");
  const stopId = requireUuid(stopIdInput, "trip_stop_id");
  const field = typeof fieldInput === "string" ? fieldInput : "";
  if (!EDITABLE_FIELDS.has(field)) throw new ApiError("This Transmittal Tracker field is read-only.", 400, "TRANSMITTAL_TRACKER_FIELD_READ_ONLY");
  if (Object.keys(input).some((key) => !["value", "expected_version", "resolve_legacy_conflict"].includes(key)) || !Object.hasOwn(input, "value")) {
    throw new ApiError("Provide value, expected_version, and optionally resolve_legacy_conflict only.", 400, "INVALID_TRANSMITTAL_TRACKER_INPUT");
  }
  if (input.resolve_legacy_conflict !== undefined && typeof input.resolve_legacy_conflict !== "boolean") {
    throw new ApiError("resolve_legacy_conflict must be a boolean.", 400, "INVALID_TRANSMITTAL_TRACKER_INPUT");
  }
  const { data: sourceStop, error: sourceError } = await supabaseAdmin.from("trip_stops").select("id").eq("id", stopId).maybeSingle();
  if (sourceError) failDb("stop validation", sourceError);
  if (!sourceStop) throw new ApiError("Delivery stop not found in the Transmittal Tracker.", 404, "TRANSMITTAL_TRACKER_STOP_NOT_FOUND");
  const { data: column, error: columnError } = await supabaseAdmin.from("flex_columns").select(COLUMN_FIELDS).eq("table_id", table.id).eq("settings->>system_key", field).eq("binding_scope", "STOP").eq("is_archived", false).maybeSingle();
  if (columnError) failDb("editable column lookup", columnError);
  if (!column) throw new ApiError("The tracker field is not configured.", 409, "TRANSMITTAL_TRACKER_COLUMN_MISSING");
  const value = input.value === null ? null : input.value === "" ? TRACKER_EMPTY_OVERRIDE : validateCellValue(input.value, column.value_type);
  const responseValue = input.value === "" ? "" : value;
  const expectedVersion = requireCellVersion(input.expected_version);
  const row = await getOrCreateSourceRow(table, actor.id, stopId, requestId);
  const { data: existing, error: existingError } = await supabaseAdmin.from("flex_cells").select(CELL_FIELDS).eq("row_id", row.id).eq("column_id", column.id).maybeSingle();
  if (existingError) failDb("cell lookup", existingError);
  const legacyValue = resolveLegacyPodCellValue(existing?.value);
  if (legacyValue.conflict && input.resolve_legacy_conflict !== true) {
    throw new ApiError("This field contains different legacy values for this stop. Review the warning and explicitly save the replacement value to resolve them.", 409, "TRANSMITTAL_TRACKER_LEGACY_VALUE_CONFLICT");
  }
  const { saved, auditError } = await persistTrackerCellAndAudit(async () => {
    if (existing) {
      if (!isTrackerCellVersionCurrent(expectedVersion, existing.version)) throw new ApiError("This value changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
      const { data, error } = await supabaseAdmin.from("flex_cells").update({ value, version: expectedVersion + 1, updated_by: actor.id, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("version", expectedVersion).select(CELL_FIELDS).maybeSingle();
      if (error) failDb("cell update", error);
      if (!data) throw new ApiError("This value changed since it was loaded. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
      return data as DbRecord;
    }
    if (!isTrackerCellVersionCurrent(expectedVersion, null)) throw new ApiError("This value was created by another editor. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
    const { data, error } = await supabaseAdmin.from("flex_cells").insert({ row_id: row.id, column_id: column.id, value, version: 1, updated_by: actor.id }).select(CELL_FIELDS).single();
    if (error) {
      if (error.code === "23505") throw new ApiError("This value was created by another editor. Refresh and retry.", 409, "FLEX_VERSION_CONFLICT");
      failDb("cell creation", error);
    }
    return data as DbRecord;
  }, async (written) => {
    await audit(table.id, actor.id, existing ? "update" : "create", "CELL", written.id,
      existing ? { trip_stop_id: stopId, field, value: isTrackerEmptyOverride(existing.value) ? "" : existing.value, resolved_legacy_conflict: legacyValue.conflict } : null,
      { trip_stop_id: stopId, field, value: responseValue, version: written.version }, requestId);
  });
  let auditWarning: string | undefined;
  if (auditError) {
    console.error("Transmittal Tracker cell was saved, but its audit event failed:", auditError);
    auditWarning = "Value saved, but its audit event could not be recorded. Contact an administrator.";
  }
  return { field, trip_stop_id: stopId, cell: { ...saved, value: responseValue }, row_id: row.id, audit_warning: auditWarning };
}
