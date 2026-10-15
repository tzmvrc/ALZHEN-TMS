import assert from "node:assert/strict";
import test from "node:test";
import { buildTripRoutes } from "../src/services/trip-route.logic.js";
import { REPORT_DEFINITIONS } from "../src/config/reports.js";

test("builds ordered warehouse and stop routes with store then customer fallback", () => {
  const routes = buildTripRoutes({
    tripIds: ["trip-1"],
    trips: [{ id: "trip-1", warehouse_id: "warehouse-1" }],
    stops: [
      { id: "stop-2", trip_id: "trip-1", stop_sequence: 2, store_id: null, customer_id: "customer-2" },
      { id: "stop-1", trip_id: "trip-1", stop_sequence: 1, store_id: "store-1", customer_id: "customer-1" },
    ],
    warehouses: [{ id: "warehouse-1", name: "Warehouse" }],
    stores: [{ id: "store-1", name: "Store One" }],
    customers: [{ id: "customer-2", name: "Customer Two" }],
  });
  assert.equal(routes.get("trip-1"), "Warehouse → Store One → Customer Two");
});

test("never attaches another trip's stops or names and degrades safely for missing names", () => {
  const routes = buildTripRoutes({
    tripIds: ["trip-1", "trip-2", "trip-missing"],
    trips: [
      { id: "trip-1", warehouse_id: "warehouse-1" },
      { id: "trip-2", warehouse_id: "warehouse-missing" },
    ],
    stops: [
      { id: "stop-1", trip_id: "trip-1", stop_sequence: null, store_id: "store-missing", customer_id: null },
      { id: "stop-2", trip_id: "trip-2", stop_sequence: 1, store_id: null, customer_id: null },
      { id: "foreign-stop", trip_id: "trip-other", stop_sequence: 1, store_id: "store-1", customer_id: null },
    ],
    warehouses: [{ id: "warehouse-1", name: "Warehouse One" }],
    stores: [{ id: "store-1", name: "Foreign Store" }],
    customers: [],
  });
  assert.equal(routes.get("trip-1"), "Warehouse One → Stop (sequence unavailable)");
  assert.equal(routes.get("trip-2"), "Warehouse not set → Stop 1");
  assert.equal(routes.has("trip-missing"), false);
});

test("orders equal and null stop sequences deterministically by stop ID", () => {
  const routes = buildTripRoutes({
    tripIds: ["trip-1"],
    trips: [{ id: "trip-1", warehouse_id: null }],
    stops: [
      { id: "b", trip_id: "trip-1", stop_sequence: 1, store_id: null, customer_id: null },
      { id: "a", trip_id: "trip-1", stop_sequence: 1, store_id: null, customer_id: null },
      { id: "c", trip_id: "trip-1", stop_sequence: null, store_id: null, customer_id: null },
    ],
    warehouses: [],
    stores: [],
    customers: [],
  });
  assert.equal(routes.get("trip-1"), "Warehouse not set → Stop 1 → Stop 1 → Stop (sequence unavailable)");
});

test("Route is configured for reports but excluded from database sorting", () => {
  for (const key of ["combined", "dispatch", "dispatch-monitoring", "trip-booking", "store-calling"]) {
    assert.ok(REPORT_DEFINITIONS[key].columns.some((column) => column.key === "route"));
    assert.equal(REPORT_DEFINITIONS[key].sortableColumns.includes("route"), false);
  }
});
