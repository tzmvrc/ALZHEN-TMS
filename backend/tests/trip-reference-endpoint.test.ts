import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";

test("dispatch generation succeeds and trip details remain readable before the trip-reference migration", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { nextDispatchNumber } = await import("../src/controllers/trip.controller.js");
  const { getTripById } = await import("../src/services/trip.service.js");
  const original = supabaseAdmin.from;
  const id = "00000000-0000-4000-8000-000000000001";
  let detailSelect = "";
  (supabaseAdmin as any).from = () => {
    let fields = "", single = false;
    const chain: any = {
      select: (value: string) => { fields = value; return chain; },
      limit: () => chain, like: () => chain, order: () => chain, range: () => chain, eq: () => chain, returns: () => chain,
      maybeSingle: () => { single = true; detailSelect = fields; return chain; },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(fields.includes("trip_reference")
        ? { data: null, error: { code: "42703", message: "column trips.trip_reference does not exist" } }
        : { data: single ? { id, dispatch_number: "DISPATCH261020-4", trip_number: 1 } : [{ dispatch_number: "DISPATCH261020-3" }], error: null }).then(resolve, reject),
    };
    return chain;
  };
  try {
    let status = 0, body: any;
    const res: any = { status: (value: number) => { status = value; return res; }, json: (value: unknown) => { body = value; return res; } };
    await nextDispatchNumber({ query: { prefix: "DISPATCH261020" } } as any, res);
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.dispatch_number, "DISPATCH261020-4");
    assert.equal(body.data.trip_reference, null);
    assert.equal(body.data.trip_reference_status, "setup_required");
    const details = await getTripById(id);
    assert.equal(details.trip.id, id);
    assert.equal(detailSelect.includes("trip_reference"), false);
  } finally { supabaseAdmin.from = original; }
});
