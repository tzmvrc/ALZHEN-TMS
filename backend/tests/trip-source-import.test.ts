import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareImport, SOURCE_FIELDS, sourceTimestamp, cbmMatches } from "../src/services/trip-import.logic.js";
import { parseCsv } from "../../frontend/src/components/admin/tripCsv.js";
import { detectImportMapping, importFileFromGrid, importPayload, regroupImportFile } from "../../frontend/src/components/admin/tripImportFiles.js";
import { getReportEditDefinition } from "../../frontend/src/services/report-editing.config.js";
import { getReportRowIdentity } from "../../frontend/src/services/report-row-identity.js";

function rows(text: string, name = "request.csv") { return prepareImport(importPayload([importFileFromGrid(name, parseCsv(text))])); }
const header = "Customer Name,Ship To,DR,Customer Model,Qty,CBM,Total CBM,Order Item No.";

test("combining PH groups keeps signed source identities, original products and exact totals", () => {
  const file = importFileFromGrid("requests.csv", parseCsv("Customer Name,Ship To,DR,Customer Model,Qty,Total CBM,PH TRUCK NAME\nCustomer,Store A,DR1,MODEL-A,1,0.123456789123456789,PH1\nCustomer,Store B,DR2,MODEL-B,2,1.25,PH2"));
  const separate = prepareImport(importPayload([regroupImportFile(file, "ph_truck_reference")]));
  const combined = prepareImport(importPayload([file]));
  assert.equal(new Set(combined.map(row => row.group)).size, 1);
  assert.equal(new Set(separate.map(row => row.group)).size, 2);
  for (let i = 0; i < combined.length; i++) {
    assert.equal(combined[i].source_identity, separate[i].source_identity);
    assert.equal(combined[i].document_hash, separate[i].document_hash);
    assert.equal(combined[i].fingerprint, separate[i].fingerprint);
    assert.deepEqual(combined[i].values, separate[i].values);
    assert.deepEqual(combined[i].original_values, separate[i].original_values);
  }
});
test("keeps separate products sharing DR, repeated identical rows, identifiers and original decimal precision", () => {
  const result = rows(`${header}\nCustomer,Store,00123,MODEL-A,2,0.123456789123,0.246913578246,4.1\nCustomer,Store,00123,MODEL-B,1,0.1,0.1,4.2\nCustomer,Store,00123,MODEL-B,1,0.1,0.1,4.2`);
  assert.equal(result.length, 3); assert.ok(result.every(row => !row.errors.length));
  assert.equal(new Set(result.map(row => row.source_identity)).size, 3);
  assert.equal(result[0].values.dr_number, "00123"); assert.equal(result[0].values.order_item_number, "4.1");
  assert.equal(result[0].values.unit_cbm, "0.123456789123"); assert.equal(result[0].values.cbm, "0.246913578246");
});
test("all four truck header aliases are source references and never plates", () => {
  for (const alias of ["PH TRUCK NAME", "PHTRRUCK", "PHTRUCK", "TRUCK NAME"]) {
    const mapping = detectImportMapping([alias]); assert.equal(mapping.ph_truck_reference, 0);
    const result = rows(`Customer Name,Ship To,Customer Model,${alias}\nCustomer,Store,MODEL,PHTRUCK123`);
    assert.equal(result[0].values.ph_truck_reference, "PHTRUCK123"); assert.equal("plate_number" in result[0].values, false);
  }
  assert.equal(Object.keys(SOURCE_FIELDS).length, 22);
});
test("renaming files does not change import identity; changed quantities flag a business match", () => {
  const input = `${header}\nCustomer,Store,DR1,MODEL,2,0.1,0.2,1`;
  const first = rows(input), renamed = rows(input, "renamed.csv"), changed = rows(input.replace(",2,0.1,0.2,", ",3,0.1,0.3,"));
  assert.equal(first[0].source_identity, renamed[0].source_identity);
  assert.notEqual(first[0].source_identity, changed[0].source_identity);
  assert.equal(first[0].fingerprint, changed[0].fingerprint);
});
test("validates every source row, leaves missing optional values null and flags CBM differences", () => {
  const result = rows(`${header}\nCustomer,Store,DR1,MODEL,2,0.1,0.3,1\nCustomer,Store,DR2,MODEL,bad,,,2\nCustomer,Store,DR3,MODEL,,,,3`);
  assert.match(result[0].warnings.join(" "), /Total CBM differs/); assert.equal(result[0].values.cbm, "0.3");
  assert.match(result[1].errors.join(" "), /Qty/); assert.equal(result[2].values.cbm, null);
  assert.equal(result[2].values.item_status, null); assert.ok(!result[2].errors.length);
  assert.ok(cbmMatches("2", "0.123456789123456789", "0.246913578246913578"));
});
test("approval timestamps preserve source-local time and reject invalid calendar dates", () => {
  assert.equal(sourceTimestamp("2026-09-04 14:22:46"), "2026-09-04 14:22:46");
  assert.equal(sourceTimestamp("06-15-2026 08:28:52"), "2026-06-15 08:28:52");
  assert.throws(() => sourceTimestamp("2026-02-30 14:00:00"));
  assert.throws(() => sourceTimestamp("2026-09-04 24:00:00"));
});
test("tracks physical CSV rows through blank lines and embedded newlines", () => {
  const lines: number[] = [];
  const grid = parseCsv('Customer Name,Ship To,Customer Model\r\n\r\n"Customer\nName",Store,MODEL\r\nCustomer,Store,MODEL2', line => lines.push(line));
  assert.deepEqual(lines, [1, 3, 5]); assert.equal(grid.length, 3);
});
test("source cells edit the exact physical line and preserve distinct Master List identities", () => {
  const first = { trip_id: "trip", trip_stop_id: "stop", trip_line_item_id: "line-a" };
  const second = { ...first, trip_line_item_id: "line-b" };
  assert.notEqual(getReportRowIdentity("dispatch-monitoring", first), getReportRowIdentity("dispatch-monitoring", second));
  for (const key of ["ph_truck_reference", "so_approval_date", "unit_cbm", "item_status", "order_item_number"]) {
    const edit = getReportEditDefinition("dispatch-monitoring", key, first);
    assert.equal(edit?.sourceEntity, "lineItem"); assert.equal(edit?.recordIdField, "trip_line_item_id");
  }
  assert.equal(getReportEditDefinition("dispatch-monitoring", "quantity", first)?.sourceEntity, "lineItem");
});

const sampleDir = process.env.TRIP_IMPORT_SAMPLE_DIR ?? "C:/Users/Hazel Gundaya/Downloads/trip_request_tables_csv";
const samples = [["CDO trip request 1.csv", 23], ["CDO trip request 2.csv", 37], ["Cebu trip request 1.csv", 56], ["Cebu trip request 2.csv", 44]] as const;
test("client samples retain all 160 product rows with compatible fields and valid totals", { skip: !samples.every(([name]) => existsSync(join(sampleDir, name))) }, () => {
  const all = [];
  for (const [name, expected] of samples) {
    const file = importFileFromGrid(name, parseCsv(readFileSync(join(sampleDir, name), "utf8")));
    const result = prepareImport(importPayload([file]));
    assert.equal(result.length, expected, name);
    const invalid = result.filter(row => row.errors.length);
    assert.deepEqual(invalid.map(row => [row.line, row.errors]), [], name);
    assert.ok(result.every(row => row.values.ph_truck_reference));
    assert.equal(result.filter(row => row.warnings.length).length, name === "Cebu trip request 2.csv" ? 1 : 0);
    if (name === "Cebu trip request 1.csv") assert.equal(Object.values(file.mapping).filter(index => index >= 0).length, 22);
    console.log(JSON.stringify({ file: name, rows: result.length, quantity: result.reduce((sum, row) => sum + Number(row.values.quantity), 0), total_cbm: result.reduce((sum, row) => sum + Number(row.values.cbm), 0) }));
    all.push(...result);
  }
  assert.equal(all.length, 160); assert.equal(new Set(all.map(row => row.source_identity)).size, 160);
});
