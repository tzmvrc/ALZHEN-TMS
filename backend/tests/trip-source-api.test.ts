import assert from "node:assert/strict";
import test from "node:test";
import { prepareImport } from "../src/services/trip-import.logic.js";

test("signed preview protects rows, skips renamed reimports, flags cross-file matches and requires CBM review", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-import-test";
  process.env.SUPABASE_ANON_KEY = "isolated-import-test";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { previewTripImport, commitTripImport } = await import("../src/services/trip-import.service.js");
  const file = { name: "request.csv", rows: [{ line: 2, group: "confirmed-group", values: { customer_name: "Customer", ship_to: "Store", customer_model: "MODEL", quantity: "2", unit_cbm: "0.1", cbm: "0.3" } }] };
  const existing = prepareImport([file])[0];
  const originalFrom = supabaseAdmin.from, originalRpc = supabaseAdmin.rpc;
  let saved: unknown = null, reads: unknown[] = [];
  (supabaseAdmin as any).from = () => { const chain: any = { select: () => chain, eq: () => chain, in: () => chain,
    range: async () => ({ data: reads, error: null }) }; return chain; };
  (supabaseAdmin as any).rpc = async (_name: string, payload: unknown) => { saved = payload; return { data: { batch_id: "batch", rows: [] }, error: null }; };
  try {
    const first = await previewTripImport([file]);
    assert.equal(first.rows.length, 1); assert.equal(first.valid, 1); assert.equal(first.rows[0].warnings.length, 1);
    const payload = { batch_id: "123e4567-e89b-42d3-a456-426614174000", rows: first.rows, group: "confirmed-group", target: { mode: "new" as const, value: "", allow_create: false } };
    await assert.rejects(commitTripImport(payload, "creator"), /CBM discrepancies/);
    await commitTripImport({ ...payload, verified_cbm: true }, "creator");
    assert.equal((saved as any).p_target.allow_create, false); assert.equal((saved as any).p_rows[0].values.cbm, "0.3");
    await assert.rejects(commitTripImport({ ...payload, verified_cbm: true, rows: [{ ...first.rows[0], values: { ...first.rows[0].values, customer_model: "TAMPERED" } }] }, "creator"), /preview changed/);
    reads = [{ source_identity: existing.source_identity, fingerprint: existing.fingerprint }];
    const repeated = await previewTripImport([{ ...file, name: "renamed.csv" }]);
    assert.equal(repeated.duplicates, 1);
    const modified = await previewTripImport([{ ...file, rows: [{ ...file.rows[0], values: { ...file.rows[0].values, quantity: "3" } }] }]);
    assert.equal(modified.duplicates, 0); assert.equal(modified.potential_duplicates, 1);
    reads = [];
    const together = await previewTripImport([file, { ...file, name: "changed.csv", rows: [{ ...file.rows[0], values: { ...file.rows[0].values, quantity: "3" } }] }]);
    assert.equal(together.potential_duplicates, 2);
  } finally { supabaseAdmin.from = originalFrom; supabaseAdmin.rpc = originalRpc; }
});

test("XLSX reader retains all populated worksheets, row numbers and formatted decimals", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
  const ExcelJS = require("exceljs");
  const { readImportFile, importPayload } = await import("../../frontend/src/components/admin/tripImportFiles.js");
  const book = new ExcelJS.Workbook();
  for (const name of ["First", "Second"]) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(["Customer Name", "Ship To", "Customer Model", "CBM", "SO Approval Date"]);
    sheet.addRow(["Customer", "Store", "MODEL", 0.12345678, new Date("2026-09-04T14:22:46Z")]);
    sheet.getCell("D2").numFmt = "0.00000000";
  }
  const buffer = await book.xlsx.writeBuffer();
  const files = await readImportFile(new File([buffer], "book.xlsx"));
  assert.equal(files.length, 2); assert.equal(files.reduce((total, file) => total + file.rows.length, 0), 2);
  const payload = importPayload(files);
  assert.equal(payload[0].rows[0].values.unit_cbm, "0.12345678");
  assert.equal(payload[0].rows[0].values.so_approval_date, "2026-09-04 14:22:46");
});
