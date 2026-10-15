import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";

test("receipts are separate from photos; OCR is scoped, validated, and cannot overwrite reviews", async () => {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/trip-receipt.service.js");
  const { listTripImages } = await import("../src/services/trip-image.service.js");
  const { saveDriverReceiptOcr } = await import("../src/services/trucker.service.js");
  const trip = "223e4567-e89b-42d3-a456-426614174000";
  const stop = "323e4567-e89b-42d3-a456-426614174000";
  const receipt = "423e4567-e89b-42d3-a456-426614174000";
  const photo = "523e4567-e89b-42d3-a456-426614174000";
  const otherReceipt = "623e4567-e89b-42d3-a456-426614174000";
  const tables: Record<string, Record<string, any>[]> = {
    trips: [{ id: trip, archived_at: null }],
    drivers: [{ id: "driver", profile_id: "owner" }],
    trip_truck_assignments: [{ trip_id: trip, driver_id: "driver", unassigned_at: null }],
    trip_stops: [{ id: stop, trip_id: trip, archived_at: null }],
    trip_images: [
      { id: photo, trip_id: trip, kind: "photo", storage_path: "photo.png" },
      { id: receipt, trip_id: trip, kind: "receipt", trip_stop_id: stop, uploaded_by: "owner", storage_path: "receipt.png", ocr_version: 0, ocr_text: null, reviewed_at: null },
      { id: otherReceipt, trip_id: trip, kind: "receipt", trip_stop_id: "another-stop", uploaded_by: "another-driver", storage_path: "other.png", ocr_version: 0, ocr_text: null, reviewed_at: null },
    ],
  };
  const originalFrom = supabaseAdmin.from;
  const originalStorageFrom = supabaseAdmin.storage.from;
  const originalGetBucket = supabaseAdmin.storage.getBucket;
  let race = false;
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let patch: Record<string, unknown> | null = null;
    let single = false;
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return chain; },
      is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return chain; },
      order: () => chain,
      update: (value: Record<string, unknown>) => { patch = value; return chain; },
      maybeSingle: () => { single = true; return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        if (patch && race) { race = false; tables.trip_images[1].ocr_version += 1; }
        const matched = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        if (patch) matched.forEach((row) => Object.assign(row, patch));
        const data = matched.map((row) => ({ ...row }));
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };
  (supabaseAdmin.storage as any).getBucket = async () => ({ data: { public: false }, error: null });
  (supabaseAdmin.storage as any).from = () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}` }, error: null }) });
  try {
    assert.deepEqual((await listTripImages(trip)).map((row) => row.id), [photo]);
    assert.deepEqual((await service.listTripReceipts(trip)).map((row) => row.id), [receipt, otherReceipt]);
    const first = await saveDriverReceiptOcr("owner", trip, stop, { receipt_id: receipt, ocr_text: "DR 123", ocr_confidence: 85 });
    assert.equal(first.saved, true);
    await assert.rejects(service.storeDriverReceiptText(trip, stop, "owner", { receipt_id: otherReceipt, ocr_text: "wrong" }), /does not belong/);
    await assert.rejects(service.saveAdminReceiptText(trip, receipt, "admin", { ocr_text: "invalid", ocr_confidence: 101, reviewed: true, expected_version: 1 }), /confidence/);
    const reviewed = await service.saveAdminReceiptText(trip, receipt, "admin", { ocr_text: "Corrected DR 123", reviewed: true, expected_version: 1 });
    assert.equal(reviewed.reviewed_by, "admin");
    assert.equal(reviewed.ocr_version, 2);
    assert.equal((await service.storeDriverReceiptText(trip, stop, "owner", { receipt_id: receipt, ocr_text: "late OCR" })).saved, false);
    assert.equal(tables.trip_images[1].ocr_text, "Corrected DR 123");
    await assert.rejects(service.saveAdminReceiptText(trip, receipt, "staff", { ocr_text: "stale edit", reviewed: true, expected_version: 1 }), /changed/);
    const automatic = await service.saveAdminReceiptText(trip, receipt, "staff", { ocr_text: "automatic scan", reviewed: false, expected_version: 2 });
    assert.equal(automatic.ocr_text, "Corrected DR 123");
    race = true;
    await assert.rejects(service.saveAdminReceiptText(trip, receipt, "staff", { ocr_text: "racing edit", reviewed: true, expected_version: 2 }), /changed/);
    assert.equal(tables.trip_images[1].ocr_text, "Corrected DR 123");
    tables.trip_stops[0].archived_at = "2026-10-16";
    await assert.rejects(saveDriverReceiptOcr("owner", trip, stop, { receipt_id: receipt, ocr_text: "late" }), /archived/);
    tables.trip_stops[0].archived_at = null;
    tables.trips[0].archived_at = "2026-10-16";
    await assert.rejects(saveDriverReceiptOcr("owner", trip, stop, { receipt_id: receipt, ocr_text: "late" }), /archived/);
    assert.equal(tables.trip_images[0].ocr_text, undefined);
  } finally {
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.storage.from = originalStorageFrom;
    supabaseAdmin.storage.getBucket = originalGetBucket;
  }
});
