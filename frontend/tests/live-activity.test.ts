import assert from "node:assert/strict";
import test from "node:test";
import { deriveActivities, trackerIndex } from "../src/services/live-activity.service.ts";

const now = Date.parse("2026-10-16T08:00:00Z");
const timestamp = new Date(now).toISOString();

test("real stop timestamp changes announce progress once without replaying earlier stages", () => {
  const memory = new Map<string, string>();
  const row = { id: "stop", trip_id: "trip", delivery_status: "IN PROGRESS", arrival_time: timestamp, updated_at: timestamp };
  assert.equal(deriveActivities("trip_stops", row, false, memory, now)[0].stage, "arrived");
  assert.deepEqual(deriveActivities("trip_stops", { ...row, remarks: "admin edit" }, false, memory, now, row), []);
  const unloading = { ...row, start_unloading_time: timestamp };
  assert.equal(deriveActivities("trip_stops", unloading, false, memory, now, row)[0].stage, "unloading");
  const delivered = { ...unloading, delivery_status: "COMPLETED", finish_unloading_time: timestamp };
  assert.deepEqual(deriveActivities("trip_stops", delivered, false, memory, now, unloading).map((event) => event.stage), ["delivered"]);
  assert.deepEqual(deriveActivities("trip_stops", delivered, false, memory, now), []);
  assert.deepEqual(deriveActivities("trip_stops", { ...delivered, archived_at: timestamp }, false, memory, now), []);
});

test("receipt alerts use the real classified image rows and retain review alerts", () => {
  const memory = new Map<string, string>();
  const photo = { id: "image", trip_id: "trip", kind: "photo" };
  assert.deepEqual(deriveActivities("trip_images", photo, true, memory, now), []);
  const receipt = { ...photo, kind: "receipt", trip_stop_id: "stop", dr_number: "DR-1" };
  const received = deriveActivities("trip_images", receipt, true, memory, now);
  assert.equal(received[0].stage, "receipt");
  assert.equal(received[0].stopId, "stop");
  const ready = deriveActivities("trip_images", { ...receipt, ocr_text: "DR-1" }, false, memory, now);
  assert.equal(ready[0].sticky, true);
  assert.equal(trackerIndex("receipt"), 5);
  assert.deepEqual(deriveActivities("trip_images", { ...receipt, ocr_text: "DR-1", reviewed_at: timestamp }, false, memory, now), []);
});

test("loading corrections do not announce unchanged milestones or historical events", () => {
  const memory = new Map<string, string>();
  const row = { id: "loading", trip_id: "trip", warehouse_arrival_at: timestamp, loading_start_at: timestamp, loading_finished_at: timestamp };
  assert.deepEqual(deriveActivities("loading_reports", row, false, memory, now).map((event) => event.stage), ["loaded"]);
  assert.deepEqual(deriveActivities("loading_reports", row, false, memory, now), []);
  assert.deepEqual(deriveActivities("loading_reports", row, false, new Map(), now + 600_000), []);
});
