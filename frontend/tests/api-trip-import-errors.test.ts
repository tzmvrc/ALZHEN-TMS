import assert from "node:assert/strict";
import test from "node:test";
import { apiGet, apiPost, ApiError } from "../src/services/api.service.ts";

test('delivery workspace outages preserve the safe recovery message',async()=>{
 const original=globalThis.fetch;
 try{
  const message='Delivery data could not be confirmed. Your draft is preserved.';
  globalThis.fetch=async()=>new Response(JSON.stringify({success:false,message,error:{code:'DELIVERY_UNAVAILABLE'}}),{status:503});
  await assert.rejects(apiGet('/delivery/assignments/fixture','fixture-token'),error=>{
   assert.ok(error instanceof ApiError);assert.equal(error.code,'DELIVERY_UNAVAILABLE');assert.equal(error.message,message);return true;
  });
 }finally{globalThis.fetch=original;}
});

test("login preserves safe service-outage messages without exposing them on unrelated endpoints",async()=>{
 const original=globalThis.fetch;
 try{
  const message="Sign-in is temporarily unavailable because the database or authentication service is not responding. Please try again shortly.";
  for(const endpoint of ["/auth/login","/trips/import/commit"]){
   globalThis.fetch=async()=>new Response(JSON.stringify({success:false,code:"AUTH_SERVICE_UNAVAILABLE",message}),{status:503});
   await assert.rejects(apiPost(endpoint,{},"fixture"),error=>{
    assert.ok(error instanceof ApiError);assert.equal(error.status,503);
    assert.equal(error.message,endpoint==="/auth/login"?message:"Something went wrong. Please try again later.");return true;
   });
  }
 }finally{globalThis.fetch=original;}
});

test("report timeouts preserve the actionable message", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const message = "The report query took too long. Your records are unchanged. Retry loading in a moment.";
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message, error: { code: "REPORT_READ_TIMEOUT" } }), { status: 503 });
    await assert.rejects(apiGet("/reports/dispatch-monitoring", "fixture-token"), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "REPORT_READ_TIMEOUT");
      assert.equal(error.message, message);
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});

test("CSV commits preserve actionable setup and recovery errors from the backend", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const code of ["IMPORT_TRIP_DETAILS_SETUP_REQUIRED", "IMPORT_RECOVERY_SETUP_REQUIRED", "MASTER_LIST_SETUP_REQUIRED", "TRIP_WORKFLOW_SETUP_REQUIRED", "TRIP_IMPORT_SETUP_REQUIRED", "TRIP_LOCATION_FOLLOWUP_REQUIRED", "TRIP_DELIVERY_LOCATION_SETUP_REQUIRED", "TRIP_DELIVERY_LOCATION_UNAVAILABLE"]) {
      const message = code === "IMPORT_TRIP_DETAILS_SETUP_REQUIRED"
        ? "Saving imported trip details requires the prepared database migration. No rows in this chunk were saved; the draft is preserved."
        : `Action required: ${code}`;
      for (const envelope of [{ success: false, message, error: { code } }, { success: false, message, code }]) {
        globalThis.fetch = async () => new Response(JSON.stringify(envelope), { status: 503 });
        await assert.rejects(apiPost("/trips/import/commit", {}, "fixture-token"), error => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 503);
          assert.equal(error.code, code);
          assert.equal(error.message, message);
          return true;
        });
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("unrecognized server errors and unrelated endpoints keep the generic failure message", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [endpoint, code] of [["/trips/import/commit", "UNEXPECTED_DATABASE_ERROR"], ["/reports/dispatch-monitoring", "IMPORT_TRIP_DETAILS_SETUP_REQUIRED"]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: "Internal diagnostic details", error: { code } }), { status: 503 });
      await assert.rejects(apiPost(endpoint, {}, "fixture-token"), error => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 503);
        assert.equal(error.code, code);
        assert.equal(error.message, "Something went wrong. Please try again later.");
        return true;
      });
    }
  } finally { globalThis.fetch = originalFetch; }
});
