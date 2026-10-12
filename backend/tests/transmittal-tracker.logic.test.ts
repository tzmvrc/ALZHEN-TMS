import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTransmittalTrackerRows,
  filterTransmittalTrackerRows,
  filterTransmittalTrackerRowsByReference,
  isTrackerCellVersionCurrent,
  persistTrackerCellAndAudit,
  resolveLegacyPodCellValue,
  shouldSeedDefaultStaffPermission,
  TRACKER_EMPTY_OVERRIDE,
  type TransmittalSourceValues,
} from "../src/services/transmittal-tracker.logic.js";
import { projectTrackerExportRows, projectTransmittalSheetRows, reconcileTrackerRows } from "../../frontend/src/services/transmittal-tracker-export.logic.ts";

const fixture: TransmittalSourceValues = {
  stops: [
    { id: "stop-1", trip_id: "trip-1", stop_sequence: 1, customer_id: "customer-1", store_id: "store-1", delivery_status: "Delivered", finish_unloading_time: "2026-10-02T10:00:00Z" },
    { id: "stop-2", trip_id: "trip-1", stop_sequence: 2, customer_id: "customer-2", store_id: "store-2", delivery_status: "Pending", finish_unloading_time: null },
  ],
  trips: [{ id: "trip-1", warehouse_id: "warehouse-1", loading_date: "2026-10-01", lbc_tracking_number: "LBC-1", pod_ac_shipping_date: "2026-10-05" }],
  warehouses: [{ id: "warehouse-1", code: "WH-A" }],
  stores: [{ id: "store-1", name: "Store A" }, { id: "store-2", name: "Store B" }],
  customers: [{ id: "customer-1", name: "Customer A" }, { id: "customer-2", name: "Customer B" }],
  assignments: [
    { trip_id: "trip-1", truck_id: "truck-1", driver_id: "driver-1", assignment_type: "PRIMARY" },
    { trip_id: "trip-1", truck_id: "truck-2", driver_id: "driver-2", assignment_type: "PRIMARY" },
    { trip_id: "trip-1", truck_id: "truck-ignored", driver_id: "driver-ignored", assignment_type: "SECONDARY" },
  ],
  trucks: [{ id: "truck-1", plate_number: "ABC-123" }, { id: "truck-2", plate_number: "XYZ-456" }, { id: "truck-ignored", plate_number: "IGNORED" }],
  drivers: [{ id: "driver-1", first_name: "Ada", last_name: "One" }, { id: "driver-2", first_name: "Bea", last_name: "Two" }, { id: "driver-ignored", first_name: "No", last_name: "Three" }],
  line_items: [
    { trip_stop_id: "stop-1", dr_number: "DR-2", sap_so_number: "SO-2" },
    { trip_stop_id: "stop-1", dr_number: "DR-1", sap_so_number: "SO-1" },
    { trip_stop_id: "stop-1", dr_number: "DR-1", sap_so_number: "SO-1" },
    { trip_stop_id: "stop-1", dr_number: "", sap_so_number: null },
    { trip_stop_id: "stop-2", dr_number: "DR-3", sap_so_number: "SO-3" },
  ],
};

test("trip_stops produce exactly one row per stop without POD rows or join multiplication", () => {
  const rows = buildTransmittalTrackerRows(fixture);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.trip_stop_id), ["stop-1", "stop-2"]);
  assert.equal(rows[0].delivery_receipt_no, "DR-1, DR-2");
  assert.equal(rows[0].sales_order_no, "SO-1, SO-2");
  assert.equal(rows[0].plate_number, "ABC-123, XYZ-456");
  assert.equal(rows[0].driver_name, "Ada One, Bea Two");
  assert.equal(rows[0].delivered_to, "Store A");
  assert.equal(rows[0].date_created, "");
  assert.equal(rows[1].delivery_receipt_no, "DR-3");
});

test("transmittal reference is a stop cell, searchable and used for exact-reference sheet filtering", () => {
  const cells = new Map([[
    "stop-1",
    { transmittal_ref: { value: "TR-1", version: 2, row_id: "flex-row-1" } },
  ]]);
  const rows = buildTransmittalTrackerRows(fixture, cells);
  assert.equal(filterTransmittalTrackerRows(rows, "TR-1")[0]?.trip_stop_id, "stop-1");
  assert.deepEqual(filterTransmittalTrackerRowsByReference(rows, "TR-1").map((row) => row.trip_stop_id), ["stop-1"]);
  assert.deepEqual(filterTransmittalTrackerRowsByReference(rows, "TR-2"), []);
});

test("editable source projections are stop-scoped flex overrides and can be cleared without changing operational defaults", () => {
  const rows = buildTransmittalTrackerRows(fixture, new Map([
    ["stop-1", {
      warehouse_code_override: { value: "CUSTOM-WH", version: 1, row_id: "flex-row-1" },
      delivery_receipt_no_override: { value: "DR-CUSTOM-1, DR-CUSTOM-2", version: 1, row_id: "flex-row-1" },
      sales_order_no_override: { value: "SO-CUSTOM", version: 1, row_id: "flex-row-1" },
      date_created_override: { value: TRACKER_EMPTY_OVERRIDE, version: 1, row_id: "flex-row-1" },
    }],
  ]));
  assert.equal(rows[0].warehouse_code, "CUSTOM-WH");
  assert.equal(rows[0].delivery_receipt_no, "DR-CUSTOM-1, DR-CUSTOM-2");
  assert.equal(rows[0].sales_order_no, "SO-CUSTOM");
  assert.equal(rows[0].date_created, "");
  assert.equal(rows[1].warehouse_code, "WH-A");
  assert.equal(rows[1].delivery_receipt_no, "DR-3");
});

test("tracker Excel export uses stop-keyed reconciled cell values", () => {
  const incoming = buildTransmittalTrackerRows(fixture).map((row) => row.trip_stop_id === "stop-1" ? {
    ...row,
    status: "Delivered",
    lbc_waybill_no: "old-waybill",
    delivery_receipt_no: "stale receipt",
    sales_order_no: "stale SO",
    cells: {
      ...row.cells,
      tracker_status: { value: "Older value", version: 1, row_id: "flex-row-1" },
      lbc_waybill_no: { value: "older-waybill", version: 1, row_id: "flex-row-1" },
      transmittal_ref: { value: "TR-OLD", version: 1, row_id: "flex-row-1" },
      delivery_receipt_no_override: { value: "stale receipt", version: 1, row_id: "flex-row-1" },
      sales_order_no_override: { value: "stale SO", version: 1, row_id: "flex-row-1" },
    },
  } : row);
  const current = incoming.map((row) => row.trip_stop_id === "stop-1" ? {
    ...row,
    status: "Verified",
    lbc_waybill_no: "new-waybill",
    transmittal_ref: "TR-NEW",
    delivery_receipt_no: "latest receipt",
    sales_order_no: "latest SO",
    cells: {
      ...row.cells,
      tracker_status: { value: "Verified", version: 3, row_id: "flex-row-1" },
      lbc_waybill_no: { value: "new-waybill", version: 2, row_id: "flex-row-1" },
      transmittal_ref: { value: "TR-NEW", version: 2, row_id: "flex-row-1" },
      delivery_receipt_no_override: { value: "latest receipt", version: 2, row_id: "flex-row-1" },
      sales_order_no_override: { value: "latest SO", version: 2, row_id: "flex-row-1" },
    },
  } : row);
  const reconciled = reconcileTrackerRows(incoming, current);
  const row = reconciled.find((candidate) => candidate.trip_stop_id === "stop-1");
  assert.equal(row?.status, "Verified");
  assert.equal(row?.transmittal_ref, "TR-NEW");
  assert.equal(row?.delivery_receipt_no, "latest receipt");
  assert.equal(row?.sales_order_no, "latest SO");
  const exported = projectTrackerExportRows(reconciled, [["Status", "status"], ["Reference", "transmittal_ref"], ["Receipt", "delivery_receipt_no"], ["S.O.", "sales_order_no"]]);
  assert.ok(exported.some((candidate) => candidate.status === "Verified" && candidate.transmittal_ref === "TR-NEW" && candidate.delivery_receipt_no === "latest receipt" && candidate.sales_order_no === "latest SO"));
});

test("Transmittal Sheet export uses reconciled overrides and only the selected reference", () => {
  const base = buildTransmittalTrackerRows(fixture, new Map([[
    "stop-1",
    { transmittal_ref: { value: "TR-1", version: 1, row_id: "flex-row-1" } },
  ]]));
  const incoming = base.map((row) => row.trip_stop_id === "stop-1" ? {
    ...row,
    loading_date: "2026-10-01",
    date_delivered: "2026-10-02",
    cells: {
      ...row.cells,
      loading_date_override: { value: "2026-10-08", version: 1, row_id: "flex-row-1" },
      delivery_date_override: { value: "2026-10-09", version: 1, row_id: "flex-row-1" },
    },
  } : row);
  const current = incoming.map((row) => row.trip_stop_id === "stop-1" ? {
    ...row,
    cells: {
      ...row.cells,
      loading_date_override: { value: "2026-10-09", version: 4, row_id: "flex-row-1" },
      delivery_date_override: { value: "2026-10-10", version: 2, row_id: "flex-row-1" },
    },
  } : row);
  const exported = projectTransmittalSheetRows(reconcileTrackerRows(incoming, current), "TR-1");
  assert.equal(exported.length, 1);
  assert.equal(exported[0].trip_stop_id, "stop-1");
  assert.equal(exported[0].loading_date, "2026-10-09");
  assert.equal(exported[0].date_delivered, "2026-10-10");
});

test("legacy POD map values survive only when unambiguous; conflicts are surfaced", () => {
  const wrapper = (values: Record<string, unknown>) => JSON.stringify({ __alzhen_transmittal_pod_values_v1: values });
  assert.deepEqual(resolveLegacyPodCellValue(wrapper({ pod1: "same", pod2: "same" })), { value: "same", conflict: false });
  assert.deepEqual(resolveLegacyPodCellValue(wrapper({ pod1: "one", pod2: "two" })), { value: null, conflict: true });
  assert.deepEqual(resolveLegacyPodCellValue("legacy scalar"), { value: "legacy scalar", conflict: false });
  const rows = buildTransmittalTrackerRows(fixture, new Map([[
    "stop-1",
    { tracker_status: { value: wrapper({ pod1: "Hold", pod2: "Verified" }), version: 3, row_id: "flex-row-1" } },
  ]]));
  assert.deepEqual(rows[0].legacy_conflicts, ["tracker_status"]);
  assert.equal(rows[0].cells.tracker_status.value, null);
});

test("cell version checks reject stale drafts", () => {
  assert.equal(isTrackerCellVersionCurrent(1, 1), true);
  assert.equal(isTrackerCellVersionCurrent(1, 2), false);
  assert.equal(isTrackerCellVersionCurrent(0, null), true);
  assert.equal(isTrackerCellVersionCurrent(1, null), false);
});

test("tracker CAS conflict prevents audit and leaves the newer cell unchanged", async () => {
  const persisted = { version: 2, value: "newer value" };
  let auditCalled = false;
  await assert.rejects(persistTrackerCellAndAudit(async () => {
    if (!isTrackerCellVersionCurrent(1, persisted.version)) throw Object.assign(new Error("version conflict"), { status: 409 });
    return persisted;
  }, async () => { auditCalled = true; }), { status: 409 });
  assert.deepEqual(persisted, { version: 2, value: "newer value" });
  assert.equal(auditCalled, false);
});

test("tracker keeps a committed cell result when the following audit insert fails", async () => {
  let persisted = { version: 1, value: "before" };
  const result = await persistTrackerCellAndAudit(async () => {
    persisted = { version: 2, value: "saved value" };
    return persisted;
  }, async () => { throw new Error("audit unavailable"); });
  assert.deepEqual(result.saved, { version: 2, value: "saved value" });
  assert.ok(result.auditError instanceof Error);
  assert.deepEqual(persisted, { version: 2, value: "saved value" });
});

test("initialization does not seed a STAFF role grant over existing profile permissions", () => {
  assert.equal(shouldSeedDefaultStaffPermission([]), true);
  assert.equal(shouldSeedDefaultStaffPermission([{ subject_type: "PROFILE", subject_profile_id: "staff-1", can_view: true }]), false);
  assert.equal(shouldSeedDefaultStaffPermission([{ subject_type: "ROLE", subject_role: "STAFF", can_view: false }]), false);
});

test("tracker search covers reference, store, plate, receipt, sales order and status", () => {
  const rows = buildTransmittalTrackerRows(fixture, new Map([[
    "stop-1",
    { transmittal_ref: { value: "TR-1", version: 1, row_id: "flex-row-1" } },
  ]]));
  assert.equal(filterTransmittalTrackerRows(rows, "TR-1")[0]?.trip_stop_id, "stop-1");
  assert.equal(filterTransmittalTrackerRows(rows, "Store A").length, 1);
  assert.equal(filterTransmittalTrackerRows(rows, "ABC-123").length, 2);
  assert.equal(filterTransmittalTrackerRows(rows, "DR-2")[0]?.trip_stop_id, "stop-1");
  assert.equal(filterTransmittalTrackerRows(rows, "SO-3")[0]?.trip_stop_id, "stop-2");
  assert.equal(filterTransmittalTrackerRows(rows, "Pending").length, 1);
  assert.equal(filterTransmittalTrackerRows(rows, "LBC-1").length, 2);
});
