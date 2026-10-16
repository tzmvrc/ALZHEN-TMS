import assert from "node:assert/strict";
import test from "node:test";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
test("shared widths authorize management and compare table, column and revision before writing", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { saveSharedWidth, validateLayoutRequest } = await import("../src/services/table-layout.service.js");
  const actor = { profileId: "123e4567-e89b-42d3-a456-000000000001", role: "STAFF" };
  assert.throws(() => validateLayoutRequest({ ...actor, role: "TRUCKER" }, "trips"), /Only ADMIN or STAFF/);
  for (const input of [{ width_px: 10, expected_revision: 1 }, { width_px: 201.5, expected_revision: 1 }, { width_px: 200, expected_revision: -1 }, { width_px: 200, expected_revision: 0, table_name: "profiles" }]) assert.throws(() => validateLayoutRequest(actor, "trips", "route", input));
  const original = supabaseAdmin.from;
  const writes: unknown[] = [], filters: unknown[] = [];
  let conflict = false, fail = false;
  (supabaseAdmin as any).from = (table: string) => {
    assert.equal(table, "shared_table_column_widths");
    const chain: any = { update: (values: unknown) => { writes.push(values); return chain; }, insert: (values: unknown) => { writes.push(values); return chain; }, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, select: () => chain, maybeSingle: async () => ({ data: conflict || fail ? null : { width_px: 420, revision: 4 }, error: fail ? { code: "XX000" } : null }) }; return chain;
  };
  try {
    await assert.rejects(saveSharedWidth({ ...actor, role: "TRUCKER" }, "trips", "route", { width_px: 420, expected_revision: 3 }));
    assert.equal(writes.length, 0);
    await saveSharedWidth(actor, "trips", "route", { width_px: 420, expected_revision: 3 });
    assert.deepEqual(filters, [["table_key", "trips"], ["column_key", "route"], ["revision", 3]]);
    assert.equal((writes[0] as any).revision, 4);
    conflict = true;
    await assert.rejects(saveSharedWidth(actor, "trips", "route", { width_px: 430, expected_revision: 3 }), /Another user/);
    conflict = false; fail = true;
    await assert.rejects(saveSharedWidth(actor, "trips", "route", { width_px: 430, expected_revision: 4 }), /not saved/);
  } finally { (supabaseAdmin as any).from = original; }
});
