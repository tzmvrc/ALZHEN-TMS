import assert from "node:assert/strict";
import test from "node:test";
import { nextCreationRequest } from "../src/services/trip-creation-request.ts";

const ids = () => {
  let next = 0;
  return () => `request-${++next}`;
};

test("an identical retry replays the same trip creation request", () => {
  const createId = ids();
  const first = nextCreationRequest({ payload: "", id: "" }, { trip: { loading_date: "2026-10-27" }, stops: [] }, createId);
  const retry = nextCreationRequest(first, { trip: { loading_date: "2026-10-27" }, stops: [] }, createId);
  assert.equal(retry.id, first.id);
  assert.equal(retry.payload, first.payload);
});

test("changing any saved detail starts a new creation request", () => {
  const createId = ids();
  const first = nextCreationRequest({ payload: "", id: "" }, { trip: { loading_date: "2026-10-27" } }, createId);
  const changed = nextCreationRequest(first, { trip: { loading_date: "2026-10-28" } }, createId);
  assert.notEqual(changed.id, first.id);
  assert.equal(changed.payload, JSON.stringify({ trip: { loading_date: "2026-10-28" } }));
});

test("the first attempt always receives an identity", () => {
  const createId = ids();
  const first = nextCreationRequest({ payload: "", id: "" }, { stops: [] }, createId);
  assert.equal(first.id, "request-1");
});

test("a reordered payload is treated conservatively as a new request", () => {
  const createId = ids();
  const first = nextCreationRequest({ payload: "", id: "" }, { a: 1, b: 2 }, createId);
  const reordered = nextCreationRequest(first, { b: 2, a: 1 }, createId);
  assert.notEqual(reordered.id, first.id);
});
