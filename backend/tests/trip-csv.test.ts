import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, readTripCsv, csvNumber, csvDate, tripCapacity } from "../../frontend/src/components/admin/tripCsv.js";

test("reads Excel UTF-8 CSV quoting, embedded newlines, escaped quotes and blank cells", () => {
  assert.deepEqual(parseCsv('\uFEFFShip To,Customer Model,Comments\r\n"Store, Manila",TV,"first\nsecond ""quoted"""\r\n'), [["Ship To", "Customer Model", "Comments"], ["Store, Manila", "TV", 'first\nsecond "quoted"']]);
  assert.deepEqual(parseCsv("sep=;\r\nQty;DR\r\n3;\r\n"), [["Qty", "DR"], ["3", ""]]);
  assert.throws(() => parseCsv('Qty,DR\n3,"unfinished'), /not closed/);
  assert.throws(() => parseCsv('Qty,DR\n3,"closed"oops'), /unexpected/);
});

test("maps the supplied booking headers, preserves references and separates trips", () => {
  const groups = readTripCsv("Dispatch no.,Trip no.,WH CODE,Ship To,Customer Model,Qty,CBM,Total CBM,DR,SAP SO No.,PO NO.,Incident Date\nTRIP260305-1,1,SQ CEBU,DU EK SAM - LOON,MHA-TWF85-P60,3,,1.014,8910789330,2300736074,PO001,2026-03-06\nTRIP260305-1,1,SQ CEBU,DU EK SAM - LOON,MHA-TWF75-P60,3,,0.969,8910789330,2300736074,,\nTRIP260305-2,1,SQ CEBU,STORE 2,TV,1,0.1,0.1,,,,");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].rows.length, 2);
  const row = groups[0].rows[0];
  assert.equal(row.values.cbm, "1.014");
  assert.equal(row.values.unitCbm, "");
  assert.equal(row.values.dr, "8910789330");
  assert.equal(row.values.sapSo, "2300736074");
  assert.match(row.extra, /Incident Date: 2026-03-06/);
});

test("maps raw booking and dispatch report columns and rejects unrelated files", () => {
  const [raw] = readTripCsv("Pickup,Trip no.,Email date,DR,DN,TRUCK NAME,SP,SO NO.,Customer Model,Qty,Warehouse,Customer PO,PO NO.,Customer Name,Ship To,Province,City,CBM,Total CBM,SAP SO No.\nCagayan de Oro,1,3/23/2026,8910800627,DNPH6032300438,,SPPH26032300387,PH0126030300682,TAC-13CSD/KEI2-ID,2,SQ CDO,PO-CALD-146-AC,POPH26022700053,DES APPLIANCE,DES CALAMBA,Misamis Occidental,Calamba,0.079,0.158,2300751675");
  assert.equal(raw.rows[0].values.unitCbm, "0.079");
  assert.equal(raw.rows[0].values.cbm, "0.158");
  const [dispatch] = readTripCsv("Loading date,Estimated Delivery Date,Delivery Status,Dispatch no.,Plate no.,Ship To,Customer Model,Qty,Total CBM\n2026-07-01,,Completed,TRIP260626-21,NEW 9875,Carmen WHSE,TAC-09CWI/UB2,200,21.2");
  assert.equal(dispatch.rows[0].values.itemStatus, "Completed");
  assert.equal(dispatch.rows[0].values.plate, "NEW 9875");
  assert.throws(() => readTripCsv("name,email\nName,test@example.com"), /No trip columns/);
  assert.throws(() => readTripCsv("Qty,DR\n1,2,3"), /more values/);
});

test("allows missing numbers, validates supplied quantities and dates", () => {
  assert.equal(csvNumber("", "Quantity", 2, true), "");
  assert.equal(csvNumber("1,053", "Quantity", 2, true), "1053");
  for (const value of ["-1", "1.5", "NaN", "Infinity"]) assert.throws(() => csvNumber(value, "Quantity", 2, true), /row 2/);
  assert.equal(csvDate("3/23/2026"), "2026-03-23");
  assert.equal(csvDate("2026-03-23T00:00:00.000Z"), "2026-03-23");
  assert.throws(() => csvDate("2026-02-30"));
  assert.throws(() => csvDate("TRIP261006-1"));
});

test("capacity alerts trigger at full, above full, and clear after another truck", () => {
  assert.equal(tripCapacity(10, [10]).full, true);
  assert.equal(tripCapacity(0.1 + 0.2, [0.3]).exceeded, false);
  assert.equal(tripCapacity(11, [10]).overflow, 1);
  assert.equal(tripCapacity(11, [10, 10]).full, false);
  assert.equal(tripCapacity(11, [10, null]).unknown, true);
  assert.equal(tripCapacity(11, [10, null]).full, false);
  assert.equal(tripCapacity(0, []).full, false);
});
