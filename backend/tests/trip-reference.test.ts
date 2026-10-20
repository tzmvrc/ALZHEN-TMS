import assert from "node:assert/strict";
import test from "node:test";
import { createTripReferenceCapability, dispatchReferencePrefix, nextReference } from "../src/services/trip-reference.logic.js";

test("new dispatch references use DISPATCH, including legacy prefix requests", () => {
  assert.equal(dispatchReferencePrefix("DISPATCH261020"), "DISPATCH261020");
  assert.equal(dispatchReferencePrefix(" trip261020 "), "DISPATCH261020");
  assert.throws(() => dispatchReferencePrefix("DISPATCH-not-a-date"), /Invalid/);
});

test("missing trip reference column is an unavailable feature, and is rechecked after migration", async () => {
  let time = 0, calls = 0, migrated = false;
  const available = createTripReferenceCapability(async () => {
    calls++;
    return { error: migrated ? null : { code: "42703", message: "column trips.trip_reference does not exist" } };
  }, () => time);
  assert.equal(await available(), false);
  assert.equal(await available(), false);
  assert.equal(calls, 1);
  migrated = true; time = 5001;
  assert.equal(await available(), true);
});

test("connectivity and permission failures are not treated as a missing column", async () => {
  const available = createTripReferenceCapability(async () => ({ error: { code: "42501", message: "permission denied" } }));
  await assert.rejects(available(), /Unable to check/);
});

test("dispatch and trip references have independent numeric sequences", () => {
  const references = ["DISPATCH261020-2", "DISPATCH261020-10", "TRIP261020-4", "TRIP261019-20", null];
  assert.equal(nextReference("DISPATCH261020", references), "DISPATCH261020-11");
  assert.equal(nextReference("TRIP261020", references), "TRIP261020-5");
  assert.equal(nextReference("TRIP261021", references), "TRIP261021-1");
});
