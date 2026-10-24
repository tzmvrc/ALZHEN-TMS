import assert from "node:assert/strict";
import test from "node:test";
import { deliveryAddress, importLocationForRpc } from "../src/services/trip-delivery-address.logic.ts";
const point = { address: "Main Street", province: "Bohol", city: "Tagbilaran", latitude: "9.65", longitude: "123.85", verified: true, store_id: "store", update_store_location: false };
test("trip-only reviews never authorize the legacy RPC to write the shared store", () => {
  const rpc = importLocationForRpc(point);
  assert.equal(rpc.verified, false); assert.equal(rpc.address, ""); assert.equal(rpc.latitude, ""); assert.equal(rpc.store_id, "store");
  assert.equal(point.verified, true); assert.equal(deliveryAddress(point)?.latitude, 9.65);
});
test("explicit shared-store opt-in retains the confirmed coordinates", () => {
  const input = { ...point, update_store_location: true };
  assert.deepEqual(importLocationForRpc(input), input);
});
test("unverified drafts are not persisted and invalid or mismatched pins are rejected", () => {
  assert.equal(deliveryAddress({ ...point, verified: false }), null);
  assert.throws(() => deliveryAddress({ ...point, latitude: "" }));
  assert.throws(() => deliveryAddress({ ...point, latitude: "91" }));
  assert.throws(() => deliveryAddress({ ...point, pin_address_mismatch: true }));
});
