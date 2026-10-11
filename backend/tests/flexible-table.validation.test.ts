import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/utils/api-response.js";
import { assertCellParentTables, assertFlexAccess, calculateFlexAccess } from "../src/services/flexible-table.authorization.js";
import { permissionFlags, readSectionConnections, requireCellVersion, requireName, requireSectionKey, requireVersion, validateCellValue, validateColumnConfiguration } from "../src/services/flexible-table.validation.js";

const staff = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "STAFF" };

test("ADMIN and table owner have full access", () => {
  const admin = calculateFlexAccess({ id: staff.id, role: "ADMIN" }, null, []);
  const owner = calculateFlexAccess(staff, staff.id, []);
  assert.doesNotThrow(() => assertFlexAccess(admin, "manage"));
  assert.doesNotThrow(() => assertFlexAccess(owner, "manage"));
});

test("STAFF requires matching profile or STAFF role permission", () => {
  const noPermission = calculateFlexAccess(staff, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", []);
  assert.throws(() => assertFlexAccess(noPermission, "view"), (error) => error instanceof ApiError && error.statusCode === 403);
  const profilePermission = calculateFlexAccess(staff, null, [{ subject_type: "PROFILE", subject_role: null, subject_profile_id: staff.id, can_view: true, can_edit: true, can_manage: false }]);
  assert.doesNotThrow(() => assertFlexAccess(profilePermission, "edit"));
  assert.throws(() => assertFlexAccess(profilePermission, "manage"), (error) => error instanceof ApiError && error.code === "FLEX_TABLE_FORBIDDEN");
  const rolePermission = calculateFlexAccess(staff, null, [{ subject_type: "ROLE", subject_role: "STAFF", subject_profile_id: null, can_view: true, can_edit: false, can_manage: false }]);
  assert.doesNotThrow(() => assertFlexAccess(rolePermission, "view"));
});

test("cell parent validation rejects cross-table row and column links", () => {
  assert.doesNotThrow(() => assertCellParentTables("table-a", "table-a", "table-a"));
  assert.throws(() => assertCellParentTables("table-a", "table-a", "table-b"), (error) => error instanceof ApiError && error.code === "FLEX_CELL_TABLE_MISMATCH");
});

test("cell versions require explicit non-negative optimistic versions", () => {
  assert.equal(requireCellVersion(0), 0);
  assert.equal(requireCellVersion(2), 2);
  for (const value of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => requireCellVersion(value), (error) => error instanceof ApiError);
  }
});

test("section connections use supported keys and preserve valid distinct associations", () => {
  assert.equal(requireSectionKey("combined_report"), "combined_report");
  assert.deepEqual(readSectionConnections({ theme: "blue", section_connections: ["combined_report", "fleet"] }), ["combined_report", "fleet"]);
  assert.deepEqual(readSectionConnections({ theme: "blue" }), []);
  assert.throws(() => requireSectionKey("calendar"));
  assert.throws(() => readSectionConnections({ section_connections: ["calendar"] }));
  assert.throws(() => readSectionConnections({ section_connections: ["fleet", "fleet"] }));
});

test("validates column types, typed values, names, versions, and permission implications", () => {
  assert.equal(validateColumnConfiguration({ name: "Quantity", value_type: "NUMBER", input_mode: "NUMBER" }).value_type, "NUMBER");
  assert.throws(() => validateColumnConfiguration({ name: "Bad", value_type: "NUMBER", input_mode: "DROPDOWN" }));
  assert.equal(validateCellValue(12.5, "NUMBER"), 12.5);
  assert.throws(() => validateCellValue("12.5", "NUMBER"));
  assert.equal(requireName("  Notes  "), "Notes");
  assert.throws(() => requireName(" "));
  assert.equal(requireVersion(3), 3);
  assert.throws(() => requireVersion(0));
  assert.throws(() => permissionFlags({ can_view: false, can_edit: true, can_manage: false }));
});
