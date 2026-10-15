import assert from "node:assert/strict";
import test from "node:test";
import { getReportRowIdentity } from "../src/services/report-row-identity.ts";

const tripId = "trip-1";
const stopId = "stop-1";
const collidingUuid = "same-table-local-uuid";

test("typed report row IDs keep report source rows distinct from line-item rows", () => {
  const lineItem = getReportRowIdentity("dispatch", {
    trip_id: tripId,
    trip_stop_id: stopId,
    trip_line_item_id: collidingUuid,
  });
  const incident = getReportRowIdentity("dispatch", {
    trip_id: tripId,
    trip_stop_id: stopId,
    incident_id: collidingUuid,
  });
  const backload = getReportRowIdentity("dispatch", {
    trip_id: tripId,
    trip_stop_id: stopId,
    backload_id: collidingUuid,
  });
  const offload = getReportRowIdentity("dispatch", {
    trip_id: tripId,
    trip_stop_id: stopId,
    offload_id: collidingUuid,
  });

  assert.equal(new Set([lineItem, incident, backload, offload]).size, 4);
});

test("billing row identity retains its physical billing ID separately from trip identity", () => {
  assert.equal(
    getReportRowIdentity("trip-booking", { trip_id: tripId, billing_id: "billing-7" }),
    "trip-booking:trip:trip-1:billing:billing-7",
  );
  assert.notEqual(
    getReportRowIdentity("trip-booking", { trip_id: tripId, billing_id: "billing-7" }),
    getReportRowIdentity("trip-booking", { trip_id: tripId, trip_stop_id: "billing-7" }),
  );
});
