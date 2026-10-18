import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReportRole,
  assertOperationsConversionRole,
  assertCargoSourceNotConverted,
  assertStopBelongsToTrip,
  assertTripAssignment,
  buildOperationsEventRows,
  assertConversionTargetScope,
  assertConversionSemanticMapping,
  assertReportSourceNotConverted,
  mapOperationsConversionConcurrencyError,
  mapOperationsConversionHistory,
  filterConvertedReportSources,
  filterActiveCargoSources,
  validateOperationsReportConversion,
  validateOperationsEventSubmission,
  validateOperationsEventType,
  validateOperationsReportSourceIdentity,
  validateOperationsOffloadItemUpdate,
  assertOffloadItemSourceScope,
  type OperationsReportConversionEntry,
  validateBackloadOffloadInput,
  validateLoadingInput,
  validateUnloadingInput,
} from "../src/services/operations-report.logic.js";

const trucker = { profileId: "123e4567-e89b-42d3-a456-426614174000", role: "TRUCKER" };
const trip = "223e4567-e89b-42d3-a456-426614174000";
const stopA = "323e4567-e89b-42d3-a456-426614174000";
const stopB = "423e4567-e89b-42d3-a456-426614174000";
const assignmentId = "523e4567-e89b-42d3-a456-426614174000";

test("dispatch based backload/offload submissions validate only the trucker inputs", () => {
  assert.deepEqual(validateOperationsEventSubmission({
    dispatch_number: " DIS-100 ", event_type: "backload", remarks: "Return damaged items",
  }), { dispatchNumber: "DIS-100", eventType: "BACKLOAD", remarks: "Return damaged items" });
  assert.deepEqual(validateOperationsEventSubmission({
    dispatch_number: "DIS-101", event_type: "OFFLOAD", remarks: "Wrong model delivered",
  }), { dispatchNumber: "DIS-101", eventType: "OFFLOAD", remarks: "Wrong model delivered" });
  assert.throws(() => validateOperationsEventSubmission({ dispatch_number: "DIS-1", event_type: "DAMAGE", remarks: "note" }), /BACKLOAD or OFFLOAD/);
  assert.throws(() => validateOperationsEventSubmission({ dispatch_number: "missing", event_type: "BACKLOAD", remarks: " " }), /Remarks are required/);
  assert.throws(() => validateOperationsEventSubmission({ dispatch_number: "D-1", event_type: "BACKLOAD", remarks: "note", trip_id: trip }), /Unsupported report field/);
});

test("Event Type edits accept exactly the four editable classifications", () => {
  for (const event_type of ["Loading", "Unloading", "Backload", "Offload"] as const) {
    assert.equal(validateOperationsEventType({ event_type }), event_type);
  }
  for (const event_type of ["LOADING", "Damage", "", null]) {
    assert.throws(() => validateOperationsEventType({ event_type }), /event_type must be Loading, Unloading, Backload, or Offload/);
  }
  assert.throws(() => validateOperationsEventType({ event_type: "Loading", trip_id: trip }), /Unsupported report field/);
});

test("report source identities require one allowlisted physical type and UUID", () => {
  assert.deepEqual(validateOperationsReportSourceIdentity("offload", "623e4567-e89b-42d3-a456-426614174000"), {
    source_type: "OFFLOAD", record_id: "623e4567-e89b-42d3-a456-426614174000",
  });
  assert.throws(() => validateOperationsReportSourceIdentity("trips", "623e4567-e89b-42d3-a456-426614174000"), /exactly one/);
  assert.throws(() => validateOperationsReportSourceIdentity("OFFLOAD", "not-a-uuid"), /valid UUID/);
});

test("Offload item updates accept numeric values and reject invalid or empty edits", () => {
  const itemId = "623e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(validateOperationsOffloadItemUpdate({ id: itemId, trip_line_item_id: null, quantity: 2.5, total_cbm: "1.25" }), {
    id: itemId, trip_line_item_id: null, quantity: 2.5, total_cbm: 1.25,
  });
  assert.throws(() => validateOperationsOffloadItemUpdate({ id: itemId, trip_line_item_id: null }), /At least one Offload item value/);
  assert.throws(() => validateOperationsOffloadItemUpdate({ id: itemId, trip_line_item_id: null, quantity: -1 }), /non-negative number/);
  assert.throws(() => validateOperationsOffloadItemUpdate({ id: itemId, trip_line_item_id: null, total_cbm: Number.NaN }), /non-negative number/);
  assert.throws(() => validateOperationsOffloadItemUpdate({ id: itemId, trip_line_item_id: null, quantity: 1, source_trip_id: trip }), /Unsupported report field/);
});

test("Offload source items must belong to the same trip and exact stop when stop-scoped", () => {
  const offload = { trip_id: trip, trip_stop_id: stopB };
  assert.doesNotThrow(() => assertOffloadItemSourceScope(offload, { trip_id: trip, trip_stop_id: stopB }));
  assert.throws(() => assertOffloadItemSourceScope(offload, { trip_id: trip, trip_stop_id: stopA }), /does not belong to this Offload stop/);
  assert.throws(() => assertOffloadItemSourceScope(offload, { trip_id: "923e4567-e89b-42d3-a456-426614174000", trip_stop_id: stopB }), /does not belong to this Offload trip/);
  assert.doesNotThrow(() => assertOffloadItemSourceScope({ trip_id: trip, trip_stop_id: null }, { trip_id: trip, trip_stop_id: stopA }));
});

test("event rows include only existing reports and retain exact source IDs", () => {
  const rows = buildOperationsEventRows({
    trips: [{ id: trip, trip_number: 10, dispatch_number: "D-10", status: "IN_PROGRESS" }],
    stops: [
      { id: stopA, trip_id: trip, stop_sequence: 1, arrival_time: "2026-10-13T08:00:00Z", start_unloading_time: "2026-10-13T08:30:00Z", finish_unloading_time: "2026-10-13T09:15:00Z" },
      { id: stopB, trip_id: trip, stop_sequence: 2, arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
    ],
    lineItems: [
      { id: "line-a", trip_id: trip, trip_stop_id: stopA, dr_number: "DR-1", quantity: 2, cbm: 1.25 },
      { id: "line-b", trip_id: trip, trip_stop_id: stopA, dr_number: "DR-2", quantity: 3, cbm: 2 },
      { id: "line-c", trip_id: trip, trip_stop_id: stopB, dr_number: "DR-3", quantity: 7, cbm: 4 },
    ],
    loading: [{ id: "load-1", trip_id: trip, warehouse_arrival_at: "2026-10-13T06:00:00Z", loading_start_at: "2026-10-13T06:30:00Z", loading_finished_at: "2026-10-13T07:00:00Z" }], unloading: [], backloads: [], offloads: [],
    routes: new Map([[trip, "Warehouse → Stores"]]), vehicles: new Map([[trip, { trip_id: trip, assignment_id: assignmentId, plate_number: "ABC-123", driver_name: "Driver One" }]]),
  });
  assert.equal(rows.length, 1, "stops without an Unloading report do not create synthetic report rows");
  const loading = rows.find((row) => row.report_type === "Loading")!;
  assert.equal(loading.trip_stop_id, null);
  assert.equal(loading.quantity, 12, "loading aggregates all trip line items once");
  assert.equal(loading.total_cbm, 7.25);
  assert.equal(loading.source_record_id, "load-1", "loading values target their exact report record");
  assert.equal(loading.date, null, "trip loading timestamps and ETA are not presented as a delivery date");
  assert.equal(loading.assignment_id, assignmentId, "assignment edits retain the exact assignment identity");
  assert.equal(loading.source_type, "LOADING");
  assert.deepEqual(loading.report_types, ["Loading"]);
  assert.deepEqual(loading.event_type_records, [{ id: "load-1", source_type: "LOADING", event_type: "Loading" }]);
});

test("backload validation accepts only existing source fields and whole-box quantities", () => {
  assert.deepEqual(validateBackloadOffloadInput({ trip_id: trip, trip_stop_id: stopB, reason: "Damaged cargo", number_of_boxes: "3", comments: "Inspect" }, true).fields, {
    reason: "Damaged cargo", number_of_boxes: 3, comments: "Inspect",
  });
  for (const unsupported of [
    { date: "2026-10-14" }, { total_cbm: 1.25 }, { quantity: 3 }, { event_type: "Damage" },
  ]) {
    assert.throws(() => validateBackloadOffloadInput({ trip_id: trip, ...unsupported }, true), /Unsupported report field/);
  }
  assert.throws(() => validateBackloadOffloadInput({ trip_id: trip, number_of_boxes: 1.5 }, true), /whole number/);
});

test("trip-level Backload and Offload each produce one independently identified row", () => {
  const rows = buildOperationsEventRows({
    trips: [{ id: trip, trip_number: 10, dispatch_number: "D-10", status: "IN_PROGRESS" }],
    stops: [], lineItems: [], loading: [], unloading: [],
    backloads: [{ id: "backload-record", trip_id: trip, trip_stop_id: null, reason: "Damage", number_of_boxes: 2, comments: "Backload note" }],
    offloads: [{ id: "offload-record", trip_id: trip, trip_stop_id: null, reason: "Return", number_of_boxes: 3, comments: "Offload note" }],
    routes: new Map(), vehicles: new Map(),
  });
  assert.equal(rows.length, 2);
  const backload = rows.find((row) => row.source_type === "BACKLOAD")!;
  const offload = rows.find((row) => row.source_type === "OFFLOAD")!;
  assert.equal(backload.id, "backload:backload-record");
  assert.equal(backload.source_record_id, "backload-record");
  assert.deepEqual(backload.report_types, ["Backload"]);
  assert.equal(backload.backload_records[0].reason, "Damage");
  assert.equal(backload.backload_records[0].comments, "Backload note");
  assert.equal(offload.id, "offload:offload-record");
  assert.equal(offload.source_record_id, "offload-record");
  assert.deepEqual(offload.report_types, ["Offload"]);
  assert.equal(offload.offload_records[0].reason, "Return");
  assert.equal(offload.offload_records[0].comments, "Offload note");
});

test("stop-scoped cargo produces its own row and keeps the exact stop identity", () => {
  const stopC = "523e4567-e89b-42d3-a456-426614174000";
  const rows = buildOperationsEventRows({
    trips: [{ id: trip, trip_number: 10, dispatch_number: "D-10", status: "IN_PROGRESS" }],
    stops: [
      { id: stopA, trip_id: trip, stop_sequence: 1, dispatch_number: "DISPATCH-1", arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
      { id: stopB, trip_id: trip, stop_sequence: 2, dispatch_number: "DISPATCH-2", arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
      { id: stopC, trip_id: trip, stop_sequence: 3, dispatch_number: "DISPATCH-3", arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
    ],
    lineItems: [
      { id: "line-a", trip_id: trip, trip_stop_id: stopA, dr_number: "DR-A", quantity: 1, cbm: 0.5 },
      { id: "line-b", trip_id: trip, trip_stop_id: stopB, dr_number: "DR-B", quantity: 2, cbm: 1 },
      { id: "line-c", trip_id: trip, trip_stop_id: stopC, dr_number: "DR-C", quantity: 3, cbm: 1.5 },
    ],
    loading: [], unloading: [],
    backloads: [{ id: "backload-stop-2", trip_id: trip, trip_stop_id: stopB, reason: "Damaged cargo", number_of_boxes: 2, comments: "Stop 2 only" }],
    offloads: [], routes: new Map(), vehicles: new Map(),
  });
  assert.equal(rows.length, 1, "only the stop with an actual report is rendered");
  const stop2Row = rows[0];
  assert.equal(stop2Row.id, "backload:backload-stop-2");
  assert.equal(stop2Row.source_type, "BACKLOAD");
  assert.equal(stop2Row.source_record_id, "backload-stop-2");
  assert.equal(stop2Row.dispatch_number, "DISPATCH-2");
  assert.equal(stop2Row.trip_stop_id, stopB);
  assert.deepEqual(stop2Row.report_types, ["Backload"], "only persisted event records contribute a classification");
  assert.equal(stop2Row.backload_records[0].id, "backload-stop-2");
  assert.equal(stop2Row.quantity, 2, "Backload quantity uses the report's box count");
  assert.equal(stop2Row.line_items.length, 1);
  assert.equal(stop2Row.line_items[0].trip_stop_id, stopB);
});

test("three-stop trips emit one row per physical report without sharing sibling identities", () => {
  const stopC = "523e4567-e89b-42d3-a456-426614174000";
  const rows = buildOperationsEventRows({
    trips: [{ id: trip, trip_number: 10, dispatch_number: "TRIP-DISPATCH", status: "IN_PROGRESS" }],
    stops: [
      { id: stopA, trip_id: trip, stop_sequence: 1, dispatch_number: "STOP-DISPATCH-1" },
      { id: stopB, trip_id: trip, stop_sequence: 2, dispatch_number: "STOP-DISPATCH-2" },
      { id: stopC, trip_id: trip, stop_sequence: 3, dispatch_number: "STOP-DISPATCH-3" },
    ],
    lineItems: [
      { id: "line-1", trip_id: trip, trip_stop_id: stopA, dr_number: "DR-1", quantity: 1, cbm: 0.1 },
      { id: "line-2", trip_id: trip, trip_stop_id: stopB, dr_number: "DR-2", quantity: 2, cbm: 0.2 },
      { id: "line-3", trip_id: trip, trip_stop_id: stopC, dr_number: "DR-3", quantity: 3, cbm: 0.3 },
    ],
    loading: [{ id: "load-physical", trip_id: trip, event_type: "Loading", warehouse_arrival_at: null, loading_start_at: null, loading_finished_at: null }],
    unloading: [{ id: "unload-physical", trip_id: trip, trip_stop_id: stopA, event_type: "Unloading" }],
    backloads: [{ id: "back-physical", trip_id: trip, trip_stop_id: stopB, event_type: "Backload", reason: "Backload reason", number_of_boxes: 2, comments: null }],
    offloads: [{ id: "off-physical", trip_id: trip, trip_stop_id: stopC, event_type: "Offload", reason: "Offload reason", number_of_boxes: 3, comments: null, items: [{ id: "off-item", offload_id: "off-physical", trip_line_item_id: "line-3", quantity: 9, total_cbm: 0.9, dr_number: "OFFLOAD-DR" }] }],
    routes: new Map(), vehicles: new Map(),
  });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.source_type).sort(), ["BACKLOAD", "LOADING", "OFFLOAD", "UNLOADING"]);
  assert.equal(new Set(rows.map((row) => row.id)).size, 4);
  for (const row of rows) {
    assert.equal(row.event_type_records.length, 1);
    assert.equal(row.event_type_records[0].id, row.source_record_id);
    assert.equal(row.event_type_records[0].source_type, row.source_type);
    assert.deepEqual(row.report_types, [row.report_type]);
  }
  assert.equal(rows.find((row) => row.source_type === "UNLOADING")?.dispatch_number, "STOP-DISPATCH-1");
  assert.equal(rows.find((row) => row.source_type === "BACKLOAD")?.dispatch_number, "STOP-DISPATCH-2");
  assert.equal(rows.find((row) => row.source_type === "OFFLOAD")?.dispatch_number, "STOP-DISPATCH-3");
  assert.equal(rows.find((row) => row.source_type === "OFFLOAD")?.quantity, 9, "Offload row values come from the Offload item rather than the trip source line item");
  assert.equal(rows.find((row) => row.source_type === "OFFLOAD")?.total_cbm, 0.9);
  assert.equal(rows.find((row) => row.source_type === "OFFLOAD")?.line_items[0].id, "line-3");
});

test("invalid stop associations remain visible but are never attached to another trip's stop", () => {
  const otherTrip = "623e4567-e89b-42d3-a456-426614174000";
  const rows = buildOperationsEventRows({
    trips: [
      { id: trip, trip_number: 10, dispatch_number: "D-10", status: "IN_PROGRESS" },
      { id: otherTrip, trip_number: 11, dispatch_number: "D-11", status: "IN_PROGRESS" },
    ],
    stops: [{ id: stopA, trip_id: trip, stop_sequence: 1, arrival_time: null, start_unloading_time: null, finish_unloading_time: null }],
    lineItems: [{ id: "bad-line", trip_id: otherTrip, trip_stop_id: stopA, dr_number: "WRONG", quantity: 99, cbm: 99 }],
    loading: [], unloading: [],
    backloads: [{ id: "bad-scope", trip_id: otherTrip, trip_stop_id: stopA, reason: "Keep visible", number_of_boxes: 1, comments: null }],
    offloads: [], routes: new Map(), vehicles: new Map(),
  });
  const malformed = rows.find((row) => row.id === "backload:bad-scope")!;
  assert.equal(rows.some((row) => row.trip_stop_id === stopA), false, "a stop without a report is not rendered as a report row");
  assert.equal(malformed.quantity, 1);
  assert.equal(malformed.trip_id, otherTrip);
  assert.equal(malformed.line_items.length, 0, "a malformed stop scope does not display trip or sibling-stop line items");
  assert.equal(malformed.trip_stop_id, null);
  assert.equal(malformed.scope_label, "Stop reference unavailable");
  assert.equal(malformed.backload_records[0].trip_stop_id, stopA, "original source scope remains untouched in the nested record");
});

test("ADMIN and STAFF are accepted; unknown roles are rejected", () => {
  assert.doesNotThrow(() => assertReportRole({ profileId: "x", role: "ADMIN" }));
  assert.doesNotThrow(() => assertReportRole({ profileId: "x", role: "STAFF" }));
  assert.throws(() => assertReportRole({ profileId: "x", role: "CLIENT" }), /Access denied/);
});

test("TRUCKER requires an active assignment to the exact non-terminal trip", () => {
  assert.doesNotThrow(() => assertTripAssignment(trucker, trip, [{ trip_id: trip, unassigned_at: null }], "IN_PROGRESS"));
  assert.throws(() => assertTripAssignment(trucker, trip, [{ trip_id: trip, unassigned_at: "2026-10-01T00:00:00Z" }], "IN_PROGRESS"), /actively assigned/);
  assert.throws(() => assertTripAssignment(trucker, trip, [{ trip_id: stopA, unassigned_at: null }], "IN_PROGRESS"), /actively assigned/);
  assert.throws(() => assertTripAssignment(trucker, trip, [{ trip_id: trip, unassigned_at: null }], "COMPLETED"), /actively assigned/);
});

test("stop scope is checked against both stop ID and owning trip", () => {
  assert.doesNotThrow(() => assertStopBelongsToTrip(trip, { id: stopA, trip_id: trip }, stopA));
  assert.throws(() => assertStopBelongsToTrip(trip, { id: stopB, trip_id: trip }, stopA), /does not belong/);
  assert.throws(() => assertStopBelongsToTrip(trip, { id: stopA, trip_id: stopB }, stopA), /does not belong/);
});

test("loading and unloading payloads allow only verified timestamp columns", () => {
  assert.deepEqual(validateLoadingInput({ warehouse_arrival_at: null, loading_start_at: "2026-10-13T10:00:00Z" }), { warehouse_arrival_at: null, loading_start_at: "2026-10-13T10:00:00Z" });
  assert.deepEqual(validateUnloadingInput({ arrival_time: "2026-10-13T11:00:00Z" }), { arrival_time: "2026-10-13T11:00:00Z" });
  assert.throws(() => validateUnloadingInput({ trip_id: trip }), /Unsupported/);
  assert.throws(() => validateLoadingInput({ loading_finished_at: "not-a-date" }), /valid timestamp/);
});

test("Backload and Offload payloads preserve nullable whole-trip scope and validate stop IDs", () => {
  assert.deepEqual(validateBackloadOffloadInput({ trip_id: trip, trip_stop_id: null, reason: "Return", number_of_boxes: 4, comments: "OK" }, true), {
    tripId: trip, stopId: null, fields: { reason: "Return", number_of_boxes: 4, comments: "OK" },
  });
  assert.deepEqual(validateBackloadOffloadInput({ trip_id: trip, trip_stop_id: stopB, reason: "Damage" }, true), {
    tripId: trip, stopId: stopB, fields: { reason: "Damage" },
  });
  assert.throws(() => validateBackloadOffloadInput({ trip_id: trip, reason: null, number_of_boxes: null, comments: null }, true, true), /before submitting/);
  assert.throws(() => validateBackloadOffloadInput({ trip_id: trip, trip_stop_id: "bad", reason: "Damage" }, true), /valid UUID/);
});

test("loading retry keeps one trip row and stop saves remain isolated", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
  process.env.SUPABASE_ANON_KEY = "isolated-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const {mockDeleteOperationsReport}=await import("./fixtures/mock-report-deletion.js");
  const service = {...await import("../src/services/operations-report.service.js"),deleteOperationsReport:mockDeleteOperationsReport};
  const tripA = "523e4567-e89b-42d3-a456-426614174000";
  const otherTrip = "623e4567-e89b-42d3-a456-426614174000";
  const stop1 = "723e4567-e89b-42d3-a456-426614174000";
  const stop2 = "823e4567-e89b-42d3-a456-426614174000";
  const otherStop = "923e4567-e89b-42d3-a456-426614174000";
  const driverId = "a23e4567-e89b-42d3-a456-426614174000";
  const tables: Record<string, Record<string, unknown>[]> = {
    trips: [
      { id: tripA, trip_number: "TR-1", dispatch_number: "DP-1", status: "IN_PROGRESS" },
      { id: otherTrip, trip_number: "TR-2", dispatch_number: "DP-2", status: "COMPLETED" },
    ],
    trip_stops: [
      { id: stop1, trip_id: tripA, stop_sequence: 1, dispatch_number: "DP-1", arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
      { id: stop2, trip_id: tripA, stop_sequence: 2, dispatch_number: "DP-1-2", arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
      { id: otherStop, trip_id: otherTrip, stop_sequence: 1, dispatch_number: "DP-2", arrival_time: null, start_unloading_time: null, finish_unloading_time: null },
    ],
    drivers: [{ id: driverId, profile_id: trucker.profileId, first_name: "Current", last_name: "Driver" }],
    profiles: [{ id: trucker.profileId, role: "TRUCKER", first_name: "Current", last_name: "Driver" }, { id: "923e4567-e89b-42d3-a456-426614174000", role: "ADMIN", first_name: "Fixture", last_name: "Admin" }],
    trucks: [{ id: "b23e4567-e89b-42d3-a456-426614174000", plate_number: "CURRENT-123" }],
    trip_truck_assignments: [
      { id: "c23e4567-e89b-42d3-a456-426614174000", trip_id: tripA, driver_id: driverId, truck_id: "b23e4567-e89b-42d3-a456-426614174000", assignment_type: "PRIMARY", unassigned_at: null },
      { trip_id: otherTrip, driver_id: driverId, unassigned_at: null },
    ],
    loading_reports: [], unloading_reports: [], backloads: [], offloads: [],
    report_receipts: [], operations_report_conversions: [],
  };
  const originalFrom = supabaseAdmin.from;
  const originalStorageFrom = supabaseAdmin.storage.from;
  const originalRpc = supabaseAdmin.rpc;
  let generatedId = 0;
  const generatedUuid = () => `f23e4567-e89b-42d3-a456-${String(++generatedId).padStart(12, "0")}`;
  (supabaseAdmin as any).rpc = async (name: string, input: { p_report: Record<string, unknown>; p_item: Record<string, unknown>; p_offload_id?: string }) => {
    if (name === "delete_offload_with_cleanup_v1") {
      const parent = tables.offloads.find((row) => row.id === input.p_offload_id);
      if (!parent) return { data: null, error: { code: "P0002" } };
      if (tables.operations_report_conversions.some((row) => row.source_id === parent.id || row.target_id === parent.id)) return { data: null, error: { code: "55000", message: "This report is protected by conversion history." } };
      tables.offloads = tables.offloads.filter((row) => row.id !== parent.id);
      return { data: { id: generatedUuid(), offload_id: parent.id, trip_id: parent.trip_id, trip_stop_id: parent.trip_stop_id, state: "COMPLETE", storage_paths: [], attempts: 0 }, error: null };
    }
    if(name==="delete_backload_with_cleanup_v1")return {data:null,error:{code:"PGRST202"}};
    assert.equal(name, "create_offload_with_item_v1");
    const report = { id: generatedUuid(), event_type: "Offload", ...input.p_report };
    tables.offloads.push(report);
    return { data: report, error: null };
  };
  let failNextStopTimestampUpdate = false;
  let failNextLoadingTimestampUpdate = false;
  let raceNextLoadingInsert = false;
  let updateCount = 0;
  let failNextReportDelete = false;
  (supabaseAdmin as any).from = (table: string) => {
    let operation = "select";
    let payload: Record<string, unknown> = {};
    let headOnly = false;
    const filters: Array<[string, unknown]> = [];
    const chain: any = {
      select: (_columns?: string, options?: { head?: boolean }) => { headOnly = options?.head === true; return chain; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      in: (key: string, values: unknown[]) => { filters.push([key, values]); return chain; },
      limit: () => chain,
      order: () => chain,
      range: () => chain,
      insert: (value: Record<string, unknown>) => { operation = "insert"; payload = value; return chain; },
      update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return chain; },
      delete: () => { operation = "delete"; return chain; },
      maybeSingle: async () => execute(true),
      single: async () => execute(false),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(execute(false)).then(resolve, reject),
    };
    function execute(single: boolean) {
      const rows = tables[table] ?? (tables[table] = []);
      const matching = rows.filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
      if (headOnly) return { data: null, count: matching.length, error: null };
      if (operation === "insert") {
        if (table === "loading_reports" && raceNextLoadingInsert && !rows.some((row) => row.trip_id === payload.trip_id)) {
          raceNextLoadingInsert = false;
          rows.push({ id: generatedUuid(), trip_id: payload.trip_id, warehouse_arrival_at: "2026-10-13T07:00:00Z", loading_start_at: null, loading_finished_at: null });
          return { data: null, error: { code: "23505", message: "unique trip race" } };
        }
        if (table === "loading_reports" && rows.some((row) => row.trip_id === payload.trip_id)) return { data: null, error: { code: "23505", message: "unique trip" } };
        if (table === "unloading_reports" && rows.some((row) => row.trip_stop_id === payload.trip_stop_id)) return { data: null, error: { code: "23505", message: "unique stop" } };
        const row = { id: generatedUuid(), ...payload };
        rows.push(row);
        return { data: row, error: null };
      }
      if (operation === "update") {
        updateCount += 1;
        if (!matching[0]) return { data: null, error: null };
        if (table === "loading_reports" && failNextLoadingTimestampUpdate) {
          failNextLoadingTimestampUpdate = false;
          return { data: null, error: { code: "XX000", message: "simulated loading write failure" } };
        }
        if (table === "trip_stops" && failNextStopTimestampUpdate) {
          failNextStopTimestampUpdate = false;
          return { data: null, error: { code: "XX000", message: "simulated timestamp write failure" } };
        }
        Object.assign(matching[0], payload);
        return { data: single ? matching[0] : matching, error: null };
      }
      if (operation === "delete") {
        if (failNextReportDelete) {
          failNextReportDelete = false;
          return { data: null, error: { code: "42501", message: "permission denied for table unloading_reports" } };
        }
        if (!matching[0]) return { data: null, error: null };
        const index = rows.indexOf(matching[0]);
        rows.splice(index, 1);
        return { data: matching[0], error: null };
      }
      return { data: single ? matching[0] ?? null : matching, error: null };
    }
    return chain;
  };
  const uploadedPaths: string[] = [];
  (supabaseAdmin.storage as any).from = (_bucket: string) => ({
    upload: async (path: string) => { uploadedPaths.push(path); return { error: null }; },
    remove: async (paths: string[]) => { for (const path of paths) { const index = uploadedPaths.indexOf(path); if (index >= 0) uploadedPaths.splice(index, 1); } return { error: null }; },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}` }, error: null }),
  });
  try {
    const admin = { profileId: "923e4567-e89b-42d3-a456-426614174000", role: "ADMIN" };
    const serviceTrucker = await import("../src/services/operations-report.service.js");
    await assert.rejects(serviceTrucker.getOperationsOverview(trucker), /Access denied/);
    await assert.rejects(serviceTrucker.getAssignedOperations(admin), /for trucker accounts/);
    const assigned = await serviceTrucker.getAssignedOperations(trucker);
    assert.deepEqual(assigned.trips.map((row) => row.id), [tripA], "trucker reads include only active assigned trips");
    assert.deepEqual(assigned.stops.map((row) => row.id), [stop1, stop2], "stops are limited to the authorized trip set");
    assert.equal(assigned.trip_options.length, 1, "trips with no operational reports remain available for Add Report");
    assert.equal(assigned.trip_options[0].driver_name, "Current Driver", "driver names come from the assigned driver record");
    assert.equal(assigned.trip_options[0].plate_number, "CURRENT-123");
    assert.deepEqual(assigned.trip_options[0].stops.map((stop) => stop.id), [stop1, stop2]);
    assert.match(assigned.trip_options[0].route ?? "", /Stop 1.*Stop 2/);
    assert.equal(tables.offloads.length, 0, "reading trip choices never creates optional reports");
    tables.trip_truck_assignments.push({ id: "d23e4567-e89b-42d3-a456-426614174000", trip_id: tripA, driver_id: driverId, assignment_type: "PRIMARY", unassigned_at: null });
    const ambiguous = await serviceTrucker.getAssignedOperations(trucker);
    assert.equal(ambiguous.trip_options[0].driver_name, null);
    assert.equal(ambiguous.trip_options[0].plate_number, null, "ambiguous assignments do not select an arbitrary truck");
    tables.trip_truck_assignments.pop();
    const submitted = await serviceTrucker.submitOperationsEvent(trucker, {
      dispatch_number: " DP-1 ", event_type: "BACKLOAD", remarks: "Return damaged items",
    });
    assert.equal(submitted.event_type, "BACKLOAD");
    assert.equal(submitted.report.trip_id, tripA, "dispatch resolves to the existing trip");
    assert.equal(submitted.report.trip_stop_id, stop1, "dispatch resolves to the exact matching stop");
    assert.equal(submitted.report.reason, "Return damaged items");
    assert.equal(submitted.report.created_by, trucker.profileId);
    assert.equal(submitted.report.submitted_by, trucker.profileId);
    assert.equal(tables.backloads.length, 1);
    for(const submitter of [admin,trucker]){
      const created=await serviceTrucker.createBackload(submitter,{trip_id:tripA,trip_stop_id:stop1,reason:"Attribution test"});
      assert.equal(created.created_by,submitter.profileId);assert.equal(created.submitted_by,submitter.profileId);
      const projection=await serviceTrucker.getTripOperations(admin,tripA);
      assert.equal(projection.event_rows.find(row=>row.source_record_id===created.id)?.reported_by,submitter.role==="ADMIN"?"Fixture Admin":"Current Driver");
      await serviceTrucker.updateBackload(admin,String(created.id),{trip_id:tripA,trip_stop_id:stop1,reason:"Edited by Admin"});
      assert.equal(tables.backloads.find(row=>row.id===created.id)?.created_by,submitter.profileId);
      await assert.rejects(serviceTrucker.updateBackload(admin,String(created.id),{trip_id:tripA,created_by:admin.profileId}),/Unsupported/);
      tables.backloads.splice(tables.backloads.findIndex(row=>row.id===created.id),1);
    }
    const backloadPhysicalId = String(submitted.report.id);
    await assert.rejects(service.updateOperationsEventType(admin, "BACKLOAD", backloadPhysicalId, { event_type: "Offload" }), /cannot be relabeled/);
    const classified = await service.updateOperationsEventType(admin, "BACKLOAD", backloadPhysicalId, { event_type: "Backload" });
    assert.equal(classified.id, backloadPhysicalId);
    assert.equal(tables.backloads.length, 1, "classification edits leave the report in its existing physical table");
    assert.equal(tables.backloads[0].event_type, "Backload", "only the classification field is changed");
    assert.equal(tables.backloads[0].trip_stop_id, stop1, "report stop relationship remains intact");
    assert.equal(tables.backloads[0].reason, "Return damaged items", "report details remain intact");
    const refreshedRow = buildOperationsEventRows({
      trips: [tables.trips[0] as any], stops: [tables.trip_stops[0] as any], lineItems: [], loading: [], unloading: [],
      backloads: tables.backloads as any, offloads: [], routes: new Map(), vehicles: new Map(),
    }).find((row) => row.trip_stop_id === stop1)!;
    assert.deepEqual(refreshedRow.event_type_records, [{ id: backloadPhysicalId, source_type: "BACKLOAD", event_type: "Backload" }], "a subsequent overview projection retains the saved type on the same physical report ID");
    await assert.rejects(serviceTrucker.submitOperationsEvent(trucker, { dispatch_number: "DP-1", event_type: "OFFLOAD", remarks: "Wrong item was received" }), /DR Number/);
    tables.trip_stops[0].dr_number = "DR-1";
    const submittedOffload = await serviceTrucker.submitOperationsEvent(trucker, {
      trip_id: tripA, trip_stop_id: stop1, event_type: "OFFLOAD", remarks: "Wrong item was received",
    });
    assert.equal(submittedOffload.report.trip_id, tripA);
    assert.equal(tables.offloads.length, 1, "OFFLOAD persists to the existing offloads table");
    assert.equal(tables.offloads[0].reason, "Wrong item was received");
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const receipt = await serviceTrucker.uploadOperationsReceipt(trucker, "BACKLOAD", String(submitted.report.id), image, "image/png", "proof.png");
    assert.equal(receipt.file_name, "proof.png");
    assert.equal(receipt.mime_type, "image/png");
    assert.equal(receipt.file_size_bytes, image.length);
    assert.equal(tables.report_receipts.length, 1, "receipt metadata is persisted against the existing backload");
    assert.equal(tables.report_receipts[0].backload_id, submitted.report.id);
    assert.equal(tables.report_receipts[0].trip_id, tripA);
    const receiptsBeforeInvalidImage = tables.report_receipts.length;
    await assert.rejects(serviceTrucker.uploadOperationsReceipt(trucker, "BACKLOAD", String(submitted.report.id), Buffer.from("not an image"), "image/png", "fake.png"), /valid JPEG, PNG, or WebP/);
    assert.equal(tables.report_receipts.length, receiptsBeforeInvalidImage, "invalid image content is rejected before metadata is written");
    const listedReceipts = await serviceTrucker.listOperationsReceipts(trucker, "BACKLOAD", String(submitted.report.id));
    assert.match(listedReceipts[0].signed_url, /^https:\/\/storage\.test\//);
    assert.equal("storage_path" in listedReceipts[0], false, "private storage paths are not returned to callers");
    await assert.rejects(service.deleteOperationsReport(admin, "BACKLOAD", String(submitted.report.id)), /receipt images/);
    await assert.rejects(service.deleteOperationsReport(trucker, "OFFLOAD", String(submittedOffload.report.id)), /Only ADMIN or STAFF/);
    await assert.rejects(service.deleteOperationsReport(admin, "TRIPS", String(submittedOffload.report.id)), /exactly one/);
    await assert.rejects(service.deleteOperationsReport(admin, "OFFLOAD", "bad-id"), /valid UUID/);
    const offloadSiblingId = "b23e4567-e89b-42d3-a456-426614174000";
    tables.offloads.push({ id: offloadSiblingId, trip_id: tripA, trip_stop_id: stop2, reason: "Sibling report", number_of_boxes: 1, comments: null, event_type: "Offload" });
    const historyProtectedId = "c23e4567-e89b-42d3-a456-426614174000";
    tables.offloads.push({ id: historyProtectedId, trip_id: tripA, trip_stop_id: stop2, reason: "History target", number_of_boxes: 1, comments: null, event_type: "Offload" });
    tables.operations_report_conversions.push({ id: "history-link", source_type: "BACKLOAD", source_id: "historical-source", target_type: "OFFLOAD", target_id: historyProtectedId });
    await assert.rejects(service.deleteOperationsReport(admin, "OFFLOAD", historyProtectedId), /conversion history/);
    assert.equal(tables.offloads.some((row) => row.id === historyProtectedId), true, "conversion history targets are preserved");
    const unloadingPermissionTargetId = "d23e4567-e89b-42d3-a456-426614174000";
    tables.unloading_reports.push({ id: unloadingPermissionTargetId, trip_id: tripA, trip_stop_id: stop2 });
    failNextReportDelete = true;
    await assert.rejects(
      service.deleteOperationsReport(admin, "UNLOADING", unloadingPermissionTargetId),
      (error: unknown) => error instanceof Error
        && "code" in error
        && error.code === "REPORT_PRIVILEGE_NOT_CONFIGURED"
        && /not permitted to delete operational report/i.test(error.message),
      "42501 on unloading_reports is returned as a clear backend privilege configuration error",
    );
    assert.equal(tables.unloading_reports.some((row) => row.id === unloadingPermissionTargetId), true, "permission failure preserves the unloading report");
    assert.equal(tables.offloads.some((row) => row.id === submittedOffload.report.id), true, "failed deletion does not affect another report type");
    tables.unloading_reports.pop();
    const deletedOffload = await service.deleteOperationsReport(admin, "OFFLOAD", String(submittedOffload.report.id));
    assert.equal(deletedOffload.record_id, submittedOffload.report.id);
    assert.equal(tables.offloads.some((row) => row.id === submittedOffload.report.id), false);
    assert.equal(tables.offloads.some((row) => row.id === offloadSiblingId), true, "deletion is scoped to the exact source record, not its sibling stop");
    tables.trip_stops.find((stop) => stop.id === stop2)!.dr_number = "DR-2";
    const scopedOffload = await service.createOffload(trucker, { trip_id: tripA, trip_stop_id: stop2, reason: "Selected trip and stop", number_of_boxes: 0, comments: "Own report data" });
    assert.equal(scopedOffload.trip_id, tripA);
    assert.equal(scopedOffload.trip_stop_id, stop2);
    assert.equal(scopedOffload.number_of_boxes, 0);
    assert.equal(scopedOffload.comments, "Own report data");
    for (let index = 0; index < 5; index++) {
      await service.uploadOperationsReceipt(admin, "OFFLOAD", String(scopedOffload.id), image, "image/png", `offload-${index}.png`);
    }
    const offloadReceipts = tables.report_receipts.filter((row) => row.offload_id === scopedOffload.id);
    assert.equal(offloadReceipts.length, 5, "all five images are linked to the exact Offload report");
    assert.ok(offloadReceipts.every((row) => row.trip_id === tripA && row.trip_stop_id === stop2), "image scope retains the exact transaction");
    const beforeSixthUpload = uploadedPaths.length;
    await assert.rejects(service.uploadOperationsReceipt(admin, "OFFLOAD", String(scopedOffload.id), image, "image/png", "sixth.png"), /up to 5 images/);
    assert.equal(uploadedPaths.length, beforeSixthUpload, "a rejected sixth image does not create a storage object");
    assert.equal(tables.report_receipts.filter((row) => row.offload_id === scopedOffload.id).length, 5);
    await assert.rejects(service.createOffload(admin, { trip_id: tripA, trip_stop_id: null, reason: "Whole trip", number_of_boxes: null, comments: null }), /DR Number/, "new Offloads require an exact DR transaction; existing trip-level reports are untouched");
    const reportCount = tables.offloads.length;
    await assert.rejects(service.createOffload(trucker, { trip_id: otherTrip, trip_stop_id: null, reason: "Unauthorized trip" }), /not actively assigned/);
    await assert.rejects(service.createOffload(admin, { trip_id: tripA, trip_stop_id: otherStop, reason: "Wrong stop" }), /does not belong/);
    assert.equal(tables.offloads.length, reportCount, "invalid scope creates no report");
    await assert.rejects(serviceTrucker.submitOperationsEvent(trucker, {
      trip_id: otherTrip, trip_stop_id: otherStop, event_type: "OFFLOAD", remarks: "Unauthorized trip",
    }), /actively assigned/);
    await assert.rejects(serviceTrucker.submitOperationsEvent(trucker, {
      dispatch_number: "NO-SUCH-DISPATCH", event_type: "BACKLOAD", remarks: "Unknown trip",
    }), /No trip or stop matches/);
    tables.trips.push({ id: "a23e4567-e89b-42d3-a456-426614174001", dispatch_number: "DP-1", status: "IN_PROGRESS" });
    await assert.rejects(serviceTrucker.submitOperationsEvent(trucker, {
      dispatch_number: "DP-1", event_type: "OFFLOAD", remarks: "Ambiguous dispatch",
    }), /DR Number/);
    tables.trips.pop();
    const updatesBeforeUnauthorizedWrites = updateCount;
    await assert.rejects(serviceTrucker.saveLoadingReport(trucker, otherTrip, { loading_start_at: "2026-10-13T09:00:00Z" }), /actively assigned/);
    await assert.rejects(serviceTrucker.saveUnloadingReport(trucker, tripA, otherStop, { finish_unloading_time: "2026-10-13T12:00:00Z" }), /does not belong/);
    assert.equal(updateCount, updatesBeforeUnauthorizedWrites, "unauthorized trip/stop writes do not reach UPDATE");

    await service.saveLoadingReport(admin, tripA, { warehouse_arrival_at: "2026-10-13T08:00:00Z" });
    await service.saveLoadingReport(admin, tripA, { loading_start_at: "2026-10-13T09:00:00Z" });
    assert.equal(tables.loading_reports.length, 1, "unique trip identity is retried/updated rather than duplicated");
    assert.equal(tables.loading_reports[0].warehouse_arrival_at, "2026-10-13T08:00:00Z");
    assert.equal(tables.loading_reports[0].loading_start_at, "2026-10-13T09:00:00Z");
    const exactLoadingId = tables.loading_reports[0].id;
    const stopSnapshot = structuredClone(tables.trip_stops);
    const canonical = await service.saveLoadingReport(admin, tripA, { loading_start_at: "2026-10-16T15:50:23.250Z" }, exactLoadingId);
    assert.equal(canonical.id, exactLoadingId);
    assert.equal(canonical.trip_id, tripA);
    assert.equal(canonical.loading_start_at, "2026-10-16T15:50:23.250Z");
    await service.saveLoadingReport(admin, tripA, { loading_finished_at: "2026-10-16T16:35:10Z" }, exactLoadingId);
    assert.equal(tables.loading_reports[0].loading_start_at, "2026-10-16T15:50:23.250Z");
    assert.equal(tables.loading_reports[0].loading_finished_at, "2026-10-16T16:35:10Z");
    await service.saveLoadingReport(admin, tripA, { loading_finished_at: null }, exactLoadingId);
    assert.equal(tables.loading_reports[0].loading_finished_at, null);
    failNextLoadingTimestampUpdate = true;
    await assert.rejects(service.saveLoadingReport(admin, tripA, { loading_start_at: "2026-10-16T11:00:00Z" }, exactLoadingId), /Unable to save loading/);
    assert.equal(tables.loading_reports[0].loading_start_at, "2026-10-16T15:50:23.250Z");
    const writesBeforeScopeFailure = updateCount;
    await assert.rejects(service.saveLoadingReport(admin, otherTrip, { loading_start_at: "2026-10-16T00:00:00Z" }, exactLoadingId), /no longer belongs/);
    await assert.rejects(service.saveLoadingReport(admin, tripA, { loading_start_at: null }, otherTrip), /no longer belongs/);
    assert.equal(updateCount, writesBeforeScopeFailure);
    assert.equal(tables.loading_reports.length, 1, "a cell save must not create a missing report");
    assert.deepEqual(tables.trip_stops, stopSnapshot, "loading changes never write to unloading stops");
    raceNextLoadingInsert = true;
    await service.saveLoadingReport(admin, otherTrip, { loading_finished_at: "2026-10-13T13:00:00Z" });
    assert.equal(tables.loading_reports.filter((row) => row.trip_id === otherTrip).length, 1, "a concurrent unique-key winner is reread and updated instead of duplicated");
    assert.equal(tables.loading_reports.find((row) => row.trip_id === otherTrip)?.warehouse_arrival_at, "2026-10-13T07:00:00Z", "concurrent retries preserve unrelated timestamp values");

    failNextStopTimestampUpdate = true;
    await assert.rejects(service.saveUnloadingReport(admin, tripA, stop1, { finish_unloading_time: "2026-10-13T11:00:00Z" }), /Unable to save unloading timestamps/);
    assert.equal(tables.unloading_reports.length, 1, "the retry marker may succeed before the timestamp write");
    await service.saveUnloadingReport(admin, tripA, stop1, { finish_unloading_time: "2026-10-13T11:00:00Z" });
    await service.saveUnloadingReport(admin, tripA, stop1, { start_unloading_time: "2026-10-13T10:30:00Z" });
    await service.saveUnloadingReport(admin, tripA, stop2, { finish_unloading_time: "2026-10-13T12:00:00Z" });
    assert.equal(tables.unloading_reports.length, 2);
    assert.equal(tables.trip_stops.find((row) => row.id === stop1)?.finish_unloading_time, "2026-10-13T11:00:00Z");
    assert.equal(tables.trip_stops.find((row) => row.id === stop1)?.start_unloading_time, "2026-10-13T10:30:00Z");
    assert.equal(tables.trip_stops.find((row) => row.id === stop2)?.finish_unloading_time, "2026-10-13T12:00:00Z");
    assert.equal(tables.trip_stops.find((row) => row.id === stop1)?.trip_id, tripA);
    assert.equal(tables.trip_stops.find((row) => row.id === stop2)?.trip_id, tripA);
    const loadingRecord = tables.loading_reports.find((row) => row.trip_id === tripA)!;
    tables.operations_report_conversions = [{ id: "conversion-1", source_type: "LOADING", source_id: loadingRecord.id }];
    const beforeConvertedLoadingWrite = updateCount;
    await assert.rejects(service.saveLoadingReport(admin, tripA, { loading_start_at: "2026-10-13T10:00:00Z" }), /read-only/);
    assert.equal(updateCount, beforeConvertedLoadingWrite, "converted Loading source is rejected before UPDATE");
    const unloadingRecord = tables.unloading_reports.find((row) => row.trip_stop_id === stop1)!;
    tables.operations_report_conversions.push({ id: "conversion-2", source_type: "UNLOADING", source_id: unloadingRecord.id });
    const beforeConvertedUnloadingWrite = updateCount;
    await assert.rejects(service.saveUnloadingReport(admin, tripA, stop1, { finish_unloading_time: "2026-10-13T13:00:00Z" }), /read-only/);
    assert.equal(updateCount, beforeConvertedUnloadingWrite, "converted Unloading source is rejected before stop timestamp UPDATE");
    assert.notEqual(otherTrip, tripA);
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (supabaseAdmin.storage as any).from = originalStorageFrom;
    (supabaseAdmin as any).rpc = originalRpc;
  }
});

test("conversion ledger projection handles both directions, duplicates, and untouched records", () => {
  const cargo = (id: string) => ({ id, trip_id: trip, trip_stop_id: stopA, reason: id, number_of_boxes: 1, comments: null });
  const backloadToOffload: OperationsReportConversionEntry = {
    source_type: "backloads", source_record_id: "back-old", target_type: "offloads", target_record_id: "off-new",
    trip_id: trip, trip_stop_id: stopA, actor_profile_id: "actor-1", actor_role: "ADMIN", converted_at: "2026-10-14T00:00:00Z",
  };
  const offloadToBackload: OperationsReportConversionEntry = {
    source_type: "offloads", source_record_id: "off-old", target_type: "backloads", target_record_id: "back-new",
    trip_id: trip, trip_stop_id: null, actor_profile_id: "actor-2", actor_role: "STAFF", converted_at: "2026-10-14T00:01:00Z",
  };

  const untouched = filterActiveCargoSources([cargo("back-old"), cargo("back-current")], [cargo("off-old"), cargo("off-current")], []);
  assert.deepEqual(untouched.backloads.map((row) => row.id), ["back-old", "back-current"]);
  assert.deepEqual(untouched.offloads.map((row) => row.id), ["off-old", "off-current"]);

  const active = filterActiveCargoSources(
    [cargo("back-old"), cargo("back-current"), cargo("back-new")],
    [cargo("off-old"), cargo("off-current"), cargo("off-new")],
    [backloadToOffload, backloadToOffload, offloadToBackload],
  );
  assert.deepEqual(active.backloads.map((row) => row.id), ["back-current", "back-new"], "old Backload is hidden; converted Offload target remains active");
  assert.deepEqual(active.offloads.map((row) => row.id), ["off-current", "off-new"], "old Offload is hidden; converted Backload target remains active");
});

test("conversion ledger write guard rejects edits to converted source records", async () => {
  const entry: OperationsReportConversionEntry = {
    source_type: "backloads", source_record_id: "converted-backload", target_type: "offloads", target_record_id: "target-offload",
    trip_id: trip, trip_stop_id: null, actor_profile_id: "actor-1", actor_role: "ADMIN", converted_at: "2026-10-14T00:00:00Z",
  };
  const ledger = { readEntries: async () => [entry] };

  await assert.rejects(assertCargoSourceNotConverted(ledger, "backloads", entry.source_record_id), (error: any) => error?.statusCode === 409 && error?.code === "REPORT_ALREADY_CONVERTED");
  await assert.doesNotReject(assertCargoSourceNotConverted(ledger, "offloads", entry.source_record_id));
  await assert.doesNotReject(assertCargoSourceNotConverted(ledger, "backloads", "another-source"));
});

test("converted-source write guard covers all four report types", () => {
  const sources = [
    ["LOADING", "loading-source"],
    ["UNLOADING", "unloading-source"],
    ["BACKLOAD", "backload-source"],
    ["OFFLOAD", "offload-source"],
  ] as const;
  for (const [source_type, source_id] of sources) {
    assert.throws(
      () => assertReportSourceNotConverted([{ source_type, source_id }], source_type, source_id),
      (error: any) => error?.statusCode === 409 && error?.code === "REPORT_ALREADY_CONVERTED",
    );
    assert.doesNotThrow(() => assertReportSourceNotConverted([], source_type, source_id));
  }
});

test("request validation accepts the twelve directed type pairs for backend scope checks", () => {
  const types = ["LOADING", "UNLOADING", "BACKLOAD", "OFFLOAD"] as const;
  for (const source_type of types) for (const target_type of types) {
    if (source_type === target_type) continue;
    assert.equal(validateOperationsReportConversion({
      source_type, target_type,
      source_id: "623e4567-e89b-42d3-a456-426614174000",
      target_fields: target_type === "LOADING" ? { loading_start_at: "2026-10-14T00:00:00Z" } : target_type === "BACKLOAD" || target_type === "OFFLOAD" ? { reason: "validated reason" } : {},
    }).target_type, target_type);
  }
});

test("conversion projection hides source IDs of all four types and leaves targets active", () => {
  const record = (id: string) => ({ id });
  const active = filterConvertedReportSources(
    [record("load-source"), record("load-target")],
    [record("unload-source"), record("unload-target")],
    [record("back-source"), record("back-target")],
    [record("off-source"), record("off-target")],
    ["LOADING", "UNLOADING", "BACKLOAD", "OFFLOAD"].map((source_type, i) => ({ source_type, source_id: ["load-source", "unload-source", "back-source", "off-source"][i], target_type: "OFFLOAD", target_id: "target", trip_id: trip, trip_stop_id: null } as any)),
  );
  assert.deepEqual(active.loading, [record("load-target")]);
  assert.deepEqual(active.unloading, [record("unload-target")]);
  assert.deepEqual(active.backloads, [record("back-target")]);
  assert.deepEqual(active.offloads, [record("off-target")]);
});

test("conversion to Unloading requires an existing stop scope", () => {
  assert.throws(() => assertConversionTargetScope("LOADING", "UNLOADING", null), (error: any) => error?.code === "CONVERSION_SEMANTIC_MAPPING_UNSUPPORTED");
  assert.throws(() => assertConversionTargetScope("BACKLOAD", "UNLOADING", null), (error: any) => error?.code === "CONVERSION_STOP_REQUIRED");
  assert.doesNotThrow(() => assertConversionTargetScope("BACKLOAD", "UNLOADING", stopA));
});

test("conversion semantic policy requires target-specific data and rejects Loading to Unloading", () => {
  const types = ["LOADING", "UNLOADING", "BACKLOAD", "OFFLOAD"] as const;
  const stopTimeline = { arrival_time: null, start_unloading_time: "2026-10-14T10:00:00Z", finish_unloading_time: null };
  const supported: Array<[typeof types[number], typeof types[number]]> = [];
  for (const source of types) for (const target of types) {
    if (source === target) continue;
    const stop = source === "LOADING" ? null : stopTimeline;
    if (target === "UNLOADING" && source === "LOADING") {
      assert.throws(() => assertConversionSemanticMapping(source, target, stop), (error: any) => error?.code === "CONVERSION_SEMANTIC_MAPPING_UNSUPPORTED");
    } else if (target === "UNLOADING") {
      assert.doesNotThrow(() => assertConversionSemanticMapping(source, target, stop));
      supported.push([source, target]);
    } else {
      assert.doesNotThrow(() => assertConversionSemanticMapping(source, target, stop));
      supported.push([source, target]);
    }
  }
  assert.equal(supported.length, 11);
  assert.throws(() => validateOperationsReportConversion({
    source_type: "UNLOADING", target_type: "OFFLOAD", source_id: "623e4567-e89b-42d3-a456-426614174000",
  }), (error: any) => error?.code === "CONVERSION_TARGET_DATA_REQUIRED");
  assert.throws(() => validateOperationsReportConversion({
    source_type: "BACKLOAD", target_type: "LOADING", source_id: "623e4567-e89b-42d3-a456-426614174000",
  }), (error: any) => error?.code === "CONVERSION_TARGET_DATA_REQUIRED");
  assert.throws(() => assertConversionSemanticMapping("OFFLOAD", "UNLOADING", { arrival_time: null, start_unloading_time: null, finish_unloading_time: null }),
    (error: any) => error?.code === "CONVERSION_TARGET_DATA_REQUIRED");
});

test("only ADMIN and STAFF may convert reports", () => {
  assert.doesNotThrow(() => assertOperationsConversionRole({ profileId: trucker.profileId, role: "ADMIN" }));
  assert.doesNotThrow(() => assertOperationsConversionRole({ profileId: trucker.profileId, role: "STAFF" }));
  assert.throws(() => assertOperationsConversionRole(trucker), (error: any) => error?.statusCode === 403);
  assert.throws(() => validateOperationsReportConversion({ source_type: "LOADING", target_type: "BACKLOAD", source_id: "623e4567-e89b-42d3-a456-426614174000", actor_profile_id: trucker.profileId }), /Unsupported report field/);
});

test("retryable conversion lock failures map to a conflict response", () => {
  for (const code of ["40001", "55P03"]) {
    const error = mapOperationsConversionConcurrencyError(code, "Retry conversion.");
    assert.equal(error?.statusCode, 409);
    assert.equal(error?.code, "REPORT_CONVERSION_CONFLICT");
    assert.equal(error?.message, "Retry conversion.");
  }
  assert.equal(mapOperationsConversionConcurrencyError("23505"), null);
});

test("conversion history mapping includes target and cargo details while filtering private receipt locations", () => {
  const history = mapOperationsConversionHistory([{
    id: "conversion-1",
    source_type: "OFFLOAD",
    source_id: "offload-source",
    target_type: "BACKLOAD",
    target_id: "backload-target",
    trip_id: trip,
    trip_stop_id: stopA,
    actor_profile_id: "staff-profile",
    created_at: "2026-10-14T10:00:00Z",
    source_snapshot: {
      parent: { id: "offload-source", reason: "Original reason" },
      stop: { id: stopA },
      receipts: [{
        id: "receipt-1", file_name: "receipt.pdf", mime_type: "application/pdf", file_size: 1234,
        uploaded_by: "staff-profile", received_at: "2026-10-14T09:00:00Z", trip_id: trip,
        storage_path: "private/path/receipt.pdf", signed_url: "https://example.invalid/signed?token=secret",
      }],
    },
    source_items_snapshot: [{ id: "offload-item-1", offload_id: "offload-source", reason: "Damaged" }],
  }], [{ report_type: "BACKLOAD", report: { id: "backload-target", reason: "Converted reason", trip_id: trip } }]);

  assert.equal(history.length, 1);
  assert.equal(history[0].source_snapshot.parent && (history[0].source_snapshot.parent as any).reason, "Original reason");
  assert.equal(history[0].target_report?.reason, "Converted reason");
  assert.equal((history[0].source_items_snapshot[0] as any).reason, "Damaged");
  assert.deepEqual(history[0].receipt_metadata[0], {
    id: "receipt-1", file_name: "receipt.pdf", mime_type: "application/pdf", file_size: 1234,
    uploaded_by: "staff-profile", received_at: "2026-10-14T09:00:00Z", trip_id: trip,
  });
  assert.equal(JSON.stringify(history).includes("storage_path"), false);
  assert.equal(JSON.stringify(history).includes("signed_url"), false);
});
