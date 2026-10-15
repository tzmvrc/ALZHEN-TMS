import assert from "node:assert/strict";
import test from "node:test";
import { TRIP_EDIT_STEPS, tripEditFieldStep, tripEditFieldChanged, validateTripEditField } from "../src/services/trip-edit-wizard.ts";
import type { ReportEditDefinition } from "../src/services/report-editing.config.ts";

const definition = (sourceField: string, editor: ReportEditDefinition["editor"] = "text", sourceEntity: ReportEditDefinition["sourceEntity"] = "stop"): ReportEditDefinition => ({ label: sourceField, sourceEntity, sourceField, editor, recordIdField: "trip_stop_id" });
const field = (value: string, def: ReportEditDefinition, originalValue = "") => ({ value, originalValue, definition: def });

test("Trips wizard groups transaction info, shared assignments, and delivery fields before Review", () => {
  assert.deepEqual(TRIP_EDIT_STEPS, ["Trip Info", "Assignment", "Delivery / DR", "Review"]);
  assert.equal(tripEditFieldStep(definition("dispatch_number")), 0);
  assert.equal(tripEditFieldStep(definition("customer_id", "relationship")), 0);
  assert.equal(tripEditFieldStep(definition("truck_id", "relationship", "assignment")), 1);
  for (const key of ["dr_number", "quantity", "total_cbm", "transmittal_ref", "delivery_status"]) assert.equal(tripEditFieldStep(definition(key)), 2);
});

test("wizard validates manual numeric drafts independently, preserving blank versus zero", () => {
  for (const key of ["quantity", "total_cbm"]) {
    assert.equal(validateTripEditField(field("0", definition(key, "number"))), null);
    assert.equal(validateTripEditField(field("", definition(key, "number"), "2")), null);
    for (const value of ["-1", "NaN", "1e3"]) assert.ok(validateTripEditField(field(value, definition(key, "number"))));
  }
  assert.ok(validateTripEditField(field("1.2345", definition("quantity", "number"))));
  assert.equal(validateTripEditField(field("1.234567", definition("total_cbm", "number"))), null);
  assert.ok(validateTripEditField(field("1.2345678", definition("total_cbm", "number"))));
});

test("wizard keeps unchanged drafts, validates chosen relationships and permits clearing nullable Store", () => {
  const unchanged = field("old invalid value", definition("quantity", "number"), "old invalid value");
  assert.equal(tripEditFieldChanged(unchanged), false);
  assert.equal(validateTripEditField(unchanged), null);
  assert.ok(validateTripEditField(field("Typed customer", definition("customer_id", "relationship"))));
  assert.equal(validateTripEditField({ ...field("", definition("store_id", "relationship"), "Old store"), originalRelationshipId: "old-store", relationshipId: "" }), null);
  assert.ok(validateTripEditField(field("x".repeat(101), definition("dr_number"))));
});
