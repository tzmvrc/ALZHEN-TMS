import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { prepareImport } from "../src/services/trip-import.logic.js";
import { importFileFromGrid, importPayload } from "../../frontend/src/components/admin/tripImportFiles.js";
import { parseCsv } from "../../frontend/src/components/admin/tripCsv.js";

const setup = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE profiles(id uuid PRIMARY KEY);
CREATE TABLE trips(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispatch_number text NOT NULL, trip_number integer, status text NOT NULL DEFAULT 'PLANNED', created_by uuid REFERENCES profiles(id), remarks text, loading_date date, archived_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, status text NOT NULL);
CREATE TABLE customer_stores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id), name text NOT NULL, status text NOT NULL, province text, city text);
CREATE TABLE trip_stops(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES trips(id), customer_id uuid NOT NULL REFERENCES customers(id), store_id uuid REFERENCES customer_stores(id), stop_sequence integer NOT NULL, delivery_status text NOT NULL DEFAULT 'PENDING', UNIQUE(trip_id,stop_sequence));
CREATE TABLE trip_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES trips(id), trip_stop_id uuid REFERENCES trip_stops(id), product_id uuid, quantity numeric, cbm numeric, dr_number text, sap_so_number text, customer_po_number text, internal_po_number text, customer_model text, remarks text);
CREATE TABLE trip_truck_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid NOT NULL REFERENCES trips(id),truck_id uuid NOT NULL);
CREATE VIEW v_dispatch_monitoring AS SELECT t.id trip_id,t.id _trip_id,s.id _trip_stop_id,t.dispatch_number,s.delivery_status FROM trips t LEFT JOIN trip_stops s ON s.trip_id=t.id;
CREATE VIEW v_trip_booking AS SELECT t.id _trip_id,s.id _trip_stop_id,li.id _trip_line_item_id,li.dr_number,li.customer_model,li.quantity,li.cbm FROM trips t LEFT JOIN trip_stops s ON s.trip_id=t.id LEFT JOIN trip_line_items li ON li.trip_stop_id=s.id AND li.trip_id=t.id;
`;
async function fixture() {
  const db = new PGlite(); await db.exec(setup);
  await db.exec(readFileSync(new URL("../migrations/2026_11_16_generated_trip_references.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../migrations/2026_10_21_trip_source_import.sql", import.meta.url), "utf8"));
  await db.exec("INSERT INTO profiles(id) VALUES('123e4567-e89b-42d3-a456-426614174000')"); return db;
}
const creator = "123e4567-e89b-42d3-a456-426614174000", batch = "223e4567-e89b-42d3-a456-426614174000";
const root = process.env.TRIP_IMPORT_SAMPLE_DIR ?? "C:/Users/Hazel Gundaya/Downloads/trip_request_tables_csv";
const names = ["CDO trip request 1.csv", "CDO trip request 2.csv", "Cebu trip request 1.csv", "Cebu trip request 2.csv"];
test("isolated PostgreSQL persists all 160 source rows and skips exact re-imports without changing siblings", { skip: !names.every(name => existsSync(`${root}/${name}`)) }, async () => {
  const db = await fixture();
  try {
    const files = names.map(name => importFileFromGrid(name, parseCsv(readFileSync(`${root}/${name}`, "utf8"))));
    const rows = prepareImport(importPayload(files));
    const run = (group: string, records: typeof rows) => db.query<{ result: { rows: { status: string; error?: string }[] } }>("SELECT import_trip_source_rows($1,$2,$3,$4::jsonb,$5::jsonb,false) result", [batch, creator, group, JSON.stringify({ mode: "new", value: "", allow_create: true }), JSON.stringify(records)]);
    for (const name of names) {
      const result = await run(name, rows.filter(row => row.filename === name));
      assert.ok(result.rows[0].result.rows.every(row => row.status === "imported"), JSON.stringify(result.rows[0].result));
    }
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM trip_line_items")).rows[0].count, 160);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM v_trip_source_master WHERE _trip_line_item_id IS NOT NULL")).rows[0].count, 160);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM trips")).rows[0].count, 4);
    assert.equal((await db.query<{ total: string }>("SELECT sum(cbm)::text total FROM trip_line_items")).rows[0].total, "158.11870000");
    for (const name of names) assert.ok((await run(name, rows.filter(row => row.filename === name))).rows[0].result.rows.every(row => row.status === "skipped"));
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM trip_line_items")).rows[0].count, 160);
    await db.exec("UPDATE trip_line_items SET quantity=999 WHERE id=(SELECT id FROM trip_line_items ORDER BY id LIMIT 1)");
    for (const name of names) await run(name, rows.filter(row => row.filename === name));
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM trip_line_items WHERE quantity=999")).rows[0].count, 1);
    console.log("Verified persisted source rows: 23 + 37 + 56 + 44 = 160; Master List 160; re-import count unchanged; source CBM 158.11870000.");
  } finally { await db.close(); }
});

test("isolated PostgreSQL handles 5000 distinct source lines in 100-row chunks", async () => {
  const db = await fixture();
  try {
    const files = [{ name: "5000.csv", rows: Array.from({ length: 5000 }, (_, index) => ({ line: index + 2, group: "Reviewed 5000-row trip", values: { customer_name: "Customer", ship_to: "Store", customer_model: `MODEL-${index}`, dr_number: "SHARED-DR", quantity: "1", unit_cbm: "0.12345678", cbm: "0.12345678" } })) }];
    const rows = prepareImport(files), started = performance.now();
    for (let offset = 0; offset < rows.length; offset += 100) {
      const result = await db.query<{ result: { rows: { status: string; error?: string }[] } }>("SELECT import_trip_source_rows($1,$2,$3,$4::jsonb,$5::jsonb,false) result", [batch, creator, "Reviewed 5000-row trip", JSON.stringify({ mode: "new", value: "", allow_create: true }), JSON.stringify(rows.slice(offset, offset + 100))]);
      assert.ok(result.rows[0].result.rows.every(row => row.status === "imported"), JSON.stringify(result.rows[0].result));
    }
    const count = (await db.query<{ count: number }>("SELECT count(*)::int count FROM trip_line_items")).rows[0].count;
    assert.equal(count, 5000);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM trip_stops")).rows[0].count, 1);
    console.log(`Verified ${count} persisted lines using 50 chunks in ${Math.round(performance.now() - started)} ms (embedded PostgreSQL fixture).`);
  } finally { await db.close(); }
});

test("Add Row persists five unique product children, safely retries and never inserts blank placeholders", async () => {
  const db = await fixture();
  process.env.SUPABASE_URL = "http://127.0.0.1:54321"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture"; process.env.SUPABASE_ANON_KEY = "fixture";
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const { createProductRows } = await import("../src/services/trip-row-creation.service.js");
  const originalFrom = supabaseAdmin.from;
  const trip = "323e4567-e89b-42d3-a456-426614174000", stop = "423e4567-e89b-42d3-a456-426614174000";
  await db.exec(`INSERT INTO trips(id,dispatch_number,status) VALUES('${trip}','EXISTING','PLANNED'); INSERT INTO customers(id,name,status) VALUES('${creator}','Customer','ACTIVE'); INSERT INTO trip_stops(id,trip_id,customer_id,stop_sequence) VALUES('${stop}','${trip}','${creator}',1); INSERT INTO trip_line_items(trip_id,trip_stop_id,customer_model,quantity) VALUES('${trip}','${stop}','EXISTING-SIBLING',17);`);
  (supabaseAdmin as any).from = (table: string) => {
    assert.ok(["trip_stops", "trip_line_items"].includes(table));
    const filters: string[] = [], params: unknown[] = []; let single = false, payload: Record<string, unknown>[] | null = null;
    const q: any = { select: () => q, eq: (key: string, value: unknown) => { params.push(value); filters.push(`${key}=$${params.length}`); return q; }, in: (key: string, values: unknown[]) => { params.push(values); filters.push(`${key}=ANY($${params.length}::uuid[])`); return q; }, maybeSingle: () => { single = true; return q; }, upsert: (rows: Record<string,unknown>[]) => { payload = rows; return q; }, then: (resolve: (value: unknown) => unknown, reject: (value: unknown) => unknown) => (async () => {
      try {
        if (payload) {
          const keys = [...new Set(payload.flatMap(row => Object.keys(row)))];
          const args: unknown[] = []; const tuples = payload.map(row => `(${keys.map(key => { args.push(row[key] ?? null); return `$${args.length}`; }).join(",")})`);
          await db.query(`INSERT INTO ${table}(${keys.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT(id) DO NOTHING`, args);
          return { data: null, error: null };
        }
        const result = await db.query(`SELECT * FROM ${table}${filters.length ? " WHERE " + filters.join(" AND ") : ""}`, params);
        return { data: single ? result.rows[0] ?? null : result.rows, error: null };
      } catch (e) { return { data: null, error: { code: (e as any).code, message: (e as Error).message } }; }
    })().then(resolve,reject) }; return q;
  };
  try {
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: crypto.randomUUID(), values: { customer_model: `NEW-${index}`, quantity: "2", unit_cbm: "0.123456789123" } }));
    assert.equal((await createProductRows(trip, stop, rows)).length, 5);
    assert.equal((await createProductRows(trip, stop, rows)).length, 5);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM trip_line_items")).rows[0].count, 6);
    assert.equal((await db.query<{ qty: string }>("SELECT quantity::text qty FROM trip_line_items WHERE customer_model='EXISTING-SIBLING'")).rows[0].qty, "17");
    await assert.rejects(createProductRows(trip, stop, [{ id: crypto.randomUUID(), values: {} }]), /Blank placeholders/);
    await assert.rejects(createProductRows(trip, creator, rows), /does not belong/);
  } finally { supabaseAdmin.from = originalFrom; await db.close(); }
});

test("appending an import preserves both existing trucks, delivered stops and operational cargo", async () => {
  const db = await fixture();
  const trip = "323e4567-e89b-42d3-a456-426614174000", stop = "423e4567-e89b-42d3-a456-426614174000";
  try {
    await db.exec(`INSERT INTO trips(id,dispatch_number,status) VALUES('${trip}','EXISTING-DISPATCH','IN_PROGRESS'); INSERT INTO customers(id,name,status) VALUES('${creator}','Existing Customer','ACTIVE'); INSERT INTO trip_stops(id,trip_id,customer_id,stop_sequence,delivery_status) VALUES('${stop}','${trip}','${creator}',1,'DELIVERED'); INSERT INTO trip_line_items(trip_id,trip_stop_id,customer_model,quantity) VALUES('${trip}','${stop}','OLD-CARGO',17); INSERT INTO trip_truck_assignments(trip_id,truck_id) VALUES('${trip}',gen_random_uuid()),('${trip}',gen_random_uuid());`);
    const rows = prepareImport([{ name: "extra.csv", rows: [{ line: 2, group: "Approved append", values: { customer_name: "Existing Customer", ship_to: "New destination", customer_model: "NEW-CARGO", quantity: "3", unit_cbm: "0.1", cbm: "0.3", ph_truck_reference: "SOURCE-NOT-A-PLATE" } }] }]);
    const result = await db.query<{ result: { rows: { status: string }[] } }>("SELECT import_trip_source_rows($1,$2,$3,$4::jsonb,$5::jsonb,false) result", [batch, creator, "Approved append", JSON.stringify({ mode: "trip", value: trip, allow_create: true }), JSON.stringify(rows)]);
    assert.equal(result.rows[0].result.rows[0].status, "imported");
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int count FROM trip_truck_assignments")).rows[0].count, 2);
    assert.equal((await db.query<{ status: string }>("SELECT status FROM trips WHERE id=$1", [trip])).rows[0].status, "IN_PROGRESS");
    assert.equal((await db.query<{ status: string }>("SELECT delivery_status status FROM trip_stops WHERE id=$1", [stop])).rows[0].status, "DELIVERED");
    assert.equal((await db.query<{ qty: string }>("SELECT quantity::text qty FROM trip_line_items WHERE customer_model='OLD-CARGO'")).rows[0].qty, "17");
  } finally { await db.close(); }
});
