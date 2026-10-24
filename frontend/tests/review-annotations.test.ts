import assert from "node:assert/strict";
import test from "node:test";
import { annotateRows, rowAppearance, reviewFingerprint } from "../src/services/review-annotations.ts";

const fingerprint = reviewFingerprint({ model: "S45H", qty: "4", address: { city: "Tagbilaran", verified: false } }, ["Unverified address"]);
test("warnings are yellow; manual colors including none take precedence", () => {
  assert.equal(rowAppearance(undefined, fingerprint, ["Unverified address"]).color, "yellow");
  for (const color of ["red", "green", "blue", "none"] as const) assert.equal(rowAppearance({ color }, fingerprint, ["Unverified address"]).color, color);
});
test("review is retained on recovery and clears only for changed data or reasons", () => {
  const annotation = annotateRows({}, [{ id: "a", fingerprint }], { type: "review" }).a;
  assert.equal(rowAppearance(annotation, fingerprint, ["Unverified address"]).color, "none");
  assert.equal(rowAppearance(JSON.parse(JSON.stringify(annotation)), fingerprint, ["Unverified address"]).reviewed, true);
  assert.equal(rowAppearance(annotation, reviewFingerprint({ qty: "5" }, ["Unverified address"]), ["Unverified address"]).color, "yellow");
  assert.notEqual(fingerprint, reviewFingerprint({ model: "S45H", qty: "4", address: { city: "Tagbilaran", verified: true } }, ["Unverified address"]));
});
test("fingerprints ignore nested object key order and warning order", () => {
  assert.equal(reviewFingerprint({ a: { x: 1, y: 2 }, b: 3 }, ["b", "a"]), reviewFingerprint({ b: 3, a: { y: 2, x: 1 } }, ["a", "b"]));
});
test("bulk colors and reset preserve independent skip choices and do not mutate the draft", () => {
  const original = { a: { skip: true, color: "red" as const } };
  const next = annotateRows(original, [{ id: "a", fingerprint }, { id: "b", fingerprint }], { type: "color", color: "blue" });
  assert.equal(next.b.color, "blue"); assert.equal(original.a.color, "red");
  const reset = annotateRows(next, [{ id: "a", fingerprint }, { id: "b", fingerprint }], { type: "reset" });
  assert.deepEqual(reset, { a: { skip: true } });
});
