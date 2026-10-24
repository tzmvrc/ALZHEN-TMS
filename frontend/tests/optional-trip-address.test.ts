import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/services/api.service.ts";
import { withOptionalTripAddress, withoutTripMapPins } from "../src/services/optional-trip-address.ts";

test("only the known no-write address setup failure retries without pins", async () => {
  const calls: boolean[] = []; let deferred = 0;
  const result = await withOptionalTripAddress(async flag => {
    calls.push(flag);
    if (!flag) throw new ApiError("Address setup needed", 503, "TRIP_DELIVERY_LOCATION_SETUP_REQUIRED");
    return "saved";
  }, () => { deferred++; });
  assert.equal(result, "saved"); assert.deepEqual(calls, [false, true]); assert.equal(deferred, 1);
});
test("uncertain failures and other setup errors are never retried", async () => {
  for (const code of ["TRIP_LOCATION_FOLLOWUP_REQUIRED", "TRIP_DELIVERY_LOCATION_UNAVAILABLE", "IMPORT_RECOVERY_SETUP_REQUIRED", undefined]) {
    let calls = 0;
    await assert.rejects(withOptionalTripAddress(async () => { calls++; throw new ApiError("Unavailable", 503, code); }, () => assert.fail("Unexpected fallback")));
    assert.equal(calls, 1);
  }
});
test("deferred pins keep plain text and approvals without mutating the draft", () => {
  const source = { row: { address: "Cebu address", latitude: "10.3", longitude: "123.9", verified: true, update_store_location: true, store_id: "store", restore_missing_source: true, restore_history_version: "version" } };
  const result = withoutTripMapPins(source);
  assert.equal(source.row.verified, true); assert.equal(source.row.latitude, "10.3");
  assert.deepEqual(result.row, { ...source.row, verified: false, latitude: "", longitude: "", update_store_location: false });
});
