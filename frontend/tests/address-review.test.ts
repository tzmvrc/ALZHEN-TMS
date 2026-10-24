import assert from "node:assert/strict";
import test from "node:test";
import { suggestedAddress, validAddress } from "../src/services/address-review.ts";
import type { LocationDecision } from "../src/components/admin/ImportDestinationReview.tsx";

const source = { key: "store", customer: "Customer", shipTo: "Store", province: "Bohol", city: "Tagbilaran" };
const draft: LocationDecision = { address: "Main Street, Tagbilaran, Bohol", province: "Bohol", city: "Tagbilaran", latitude: "9.65", longitude: "123.85", verified: false, replace_verified: false };

test("bulk confirmation accepts a complete suggested point without mutating the draft", () => {
  assert.equal(suggestedAddress(source, draft)?.verified, true);
  assert.equal(draft.verified, false);
  assert.equal(suggestedAddress(source, { ...draft, verified: true }), null);
});
test("bulk confirmation never replaces protected stores or mismatched pins", () => {
  assert.equal(suggestedAddress(source, { ...draft, store_verified: true }), null);
  assert.equal(suggestedAddress(source, { ...draft, pin_address_mismatch: true }), null);
});
test("missing and ambiguous matches stay flagged", () => {
  const empty = { ...draft, address: "", latitude: "", longitude: "" };
  assert.equal(suggestedAddress(source, empty), null);
  assert.equal(suggestedAddress(source, { ...empty, lookup: { status: "multiple", message: "", source: "geoapify", candidates: [{ display_name: draft.address, latitude: 9.65, longitude: 123.85 }] } }), null);
});
test("blank, out-of-range and nonfinite coordinates cannot be confirmed", () => {
  for (const patch of [{ latitude: "" }, { latitude: "91" }, { longitude: "181" }, { longitude: "NaN" }, { address: "" }]) assert.equal(validAddress({ ...draft, ...patch }), false);
  assert.equal(validAddress(draft), true);
});
