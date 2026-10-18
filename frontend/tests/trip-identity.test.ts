import test from "node:test";
import assert from "node:assert/strict";
import { reportBelongsToTrip } from "../src/services/trip-identity.ts";

test("Home enrichment never merges trips that share a dispatch label", () => {
  assert.equal(reportBelongsToTrip({ trip_id: "parent-a", dispatch_number: "SHARED" }, "parent-b"), false);
  assert.equal(reportBelongsToTrip({ trip_id: "parent-a", dispatch_number: "SHARED" }, "parent-a"), true);
  assert.equal(reportBelongsToTrip({ _trip_id: "parent-a" }, "parent-a"), true);
  assert.equal(reportBelongsToTrip({ dispatch_number: "SHARED" }, "parent-a"), false);
  assert.equal(reportBelongsToTrip({ trip_id: "parent-b", _trip_id: "parent-a" }, "parent-a"), false);
});
