import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { prepareImport } from "../src/services/trip-import.logic.js";
import { importFileFromGrid, importPayload } from "../../frontend/src/components/admin/tripImportFiles.js";
import { parseCsv } from "../../frontend/src/components/admin/tripCsv.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const proposal = read("../migrations/proposals/2026_10_24_proposed_source_csv_save_prerequisites.sql");
const actor = "123e4567-e89b-42d3-a456-426614174000";
const batch = "223e4567-e89b-42d3-a456-426614174000";

test("proposed CSV prerequisites install locally, save details, recover missing lines and protect live siblings", async () => {
  const db = new PGlite();
  try {
    // Reuse the existing minimal source-import schema; this database is entirely
    // in memory and never imports the application's live Supabase client.
    const base = read("./trip-source-persistence.test.ts").match(/const setup = `([\s\S]*?)`;/)?.[1];
    assert.ok(base);
    await db.exec(base);
    await db.exec(read("../migrations/2026_11_16_generated_trip_references.sql"));
    await db.exec(read("../migrations/2026_10_21_trip_source_import.sql"));
    await db.exec(`
      CREATE TABLE warehouses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text, name text, status text DEFAULT 'ACTIVE');
      CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text, model_code text, name text, category text, unit_cbm numeric, status text, description text, notes text);
      CREATE TABLE trip_types(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text, name text, active boolean DEFAULT true);
      ALTER TABLE trips ADD COLUMN warehouse_id uuid REFERENCES warehouses(id), ADD COLUMN trip_type_id uuid REFERENCES trip_types(id), ADD COLUMN estimated_delivery_date date;
      ALTER TABLE trip_line_items ADD COLUMN source_warehouse_id uuid REFERENCES warehouses(id);
      ALTER TABLE trip_import_batches ADD COLUMN workflow_outcomes jsonb NOT NULL DEFAULT '{}', ADD COLUMN updated_at timestamptz DEFAULT now();
      ALTER TABLE customers ADD COLUMN code text;
      ALTER TABLE customer_stores ADD COLUMN code text, ADD COLUMN address text, ADD COLUMN latitude numeric, ADD COLUMN longitude numeric, ADD COLUMN location_verified boolean DEFAULT false, ADD COLUMN location_verified_at timestamptz, ADD COLUMN location_verified_by uuid;
      INSERT INTO profiles(id) VALUES('${actor}');
    `);
    const workflow = read("../migrations/2026_10_21_trip_workflow_completion.sql");
    await db.exec(workflow.slice(workflow.indexOf("CREATE OR REPLACE FUNCTION public.workflow_identity("), workflow.indexOf("CREATE OR REPLACE FUNCTION public.apply_trip_cargo_plan_v1(")));
    await db.exec(proposal);
    const permissions = await db.query<{ allowed: boolean; denied: boolean }>("SELECT has_function_privilege('service_role','import_trip_source_rows_v3(uuid,uuid,text,jsonb,jsonb,boolean,jsonb)','EXECUTE') allowed, NOT has_function_privilege('authenticated','import_trip_source_rows_v3(uuid,uuid,text,jsonb,jsonb,boolean,jsonb)','EXECUTE') denied");
    assert.equal(permissions.rows[0].allowed, true); assert.equal(permissions.rows[0].denied, true);
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM trips")).rows[0].n, 0, "Installing functions must not create trips");

    const csv = process.env.TRIP_IMPORT_SAMPLE_FILE
      ? readFileSync(process.env.TRIP_IMPORT_SAMPLE_FILE, "utf8")
      : "Customer Name,Ship To,Province,City,Customer Model,Quantity,Total CBM,DR Number,Warehouse,PH TRUCK NAME\nCustomer,Store,Cebu,Cebu City,MODEL-A,1.5,0.12345678,DR-1,Cebu SQ,PHTRUCK-1\nCustomer,Store,Cebu,Cebu City,MODEL-B,2,0.2,DR-1,Cebu SQ,PHTRUCK-1";
    const rows = prepareImport(importPayload([importFileFromGrid("Cebu trip request 1.csv", parseCsv(csv))]));
    assert.ok(rows.length >= 2 && rows.every(row => !row.errors.length));
    const warehouse = crypto.randomUUID();
    await db.query("INSERT INTO warehouses(id,code,name) VALUES($1,'CEBU','Cebu SQ')", [warehouse]);
    const resolutions: Record<string, Record<string, unknown>> = {};
    const customers = new Map<string, string>(), stores = new Map<string, string>();
    for (const row of rows) {
      const customerName = row.values.customer_name!;
      let customer = customers.get(customerName);
      if (!customer) { customer = crypto.randomUUID(); customers.set(customerName, customer); await db.query("INSERT INTO customers(id,name,status) VALUES($1,$2,'ACTIVE')", [customer, customerName]); }
      const key = JSON.stringify([customer, row.values.ship_to, row.values.province, row.values.city]);
      let store = stores.get(key);
      if (!store) { store = crypto.randomUUID(); stores.set(key, store); await db.query("INSERT INTO customer_stores(id,customer_id,name,province,city,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')", [store, customer, row.values.ship_to, row.values.province, row.values.city]); }
      resolutions[row.source_identity] = { customer_id: customer, store_id: store, verified: false, update_store_location: false };
    }
    const target = { mode: "new", value: "", allow_create: true, warehouse_ids: Object.fromEntries(rows.map(row => [row.values.source_warehouse!, warehouse])), origin_warehouse_id: warehouse, trip_details: { status: "PLANNED", trip_type_name: "Delivery", loading_date: "2026-10-23", estimated_delivery_date: "2026-10-24", remarks: "Reviewed CSV", origin_warehouse_id: warehouse } };
    const run = (source = rows, decisions = resolutions) => db.query<{ result: { rows: Array<{ status: string; error?: string; line_item_id: string }> } }>("SELECT import_trip_source_rows_with_details_v1($1,$2,$3,$4::jsonb,$5::jsonb,false,$6::jsonb) result", [batch, actor, rows[0].group, JSON.stringify(target), JSON.stringify(source), JSON.stringify(decisions)]);
    let saved = (await run()).rows[0].result.rows;
    assert.ok(saved.every(row => row.status === "imported"), JSON.stringify(saved));
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM trip_line_items")).rows[0].n, rows.length);
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM jsonb_array_elements($1::jsonb) src JOIN trip_import_rows ledger ON ledger.source_identity=src->>'source_identity' JOIN trip_line_items li ON li.id=ledger.line_item_id WHERE li.quantity IS DISTINCT FROM (src->'values'->>'quantity')::numeric OR li.cbm IS DISTINCT FROM (src->'values'->>'cbm')::numeric", [JSON.stringify(rows)])).rows[0].n, 0, "Source quantities and CBM must remain exact");
    const trip = (await db.query<{ loading: string; origin: string; remarks: string }>("SELECT loading_date::text loading,warehouse_id::text origin,remarks FROM trips")).rows[0];
    assert.equal(trip.loading, "2026-10-23"); assert.equal(trip.origin, warehouse); assert.equal(trip.remarks, "Reviewed CSV");
    assert.ok((await run()).rows[0].result.rows.every(row => row.status === "skipped"));

    // Recreate only the missing child; never replace a live, edited sibling.
    await db.query("DELETE FROM trip_line_items WHERE id=$1", [saved[0].line_item_id]);
    await db.query("UPDATE trip_line_items SET quantity=999 WHERE id=$1", [saved[1].line_item_id]);
    const refused = (await run([rows[0]])).rows[0].result.rows;
    assert.equal(refused[0].status, "failed");
    const stamp = (await db.query<{ version: string }>("SELECT imported_at::text version FROM trip_import_rows WHERE source_identity=$1", [rows[0].source_identity])).rows[0].version;
    const approved = { ...resolutions, [rows[0].source_identity]: { ...resolutions[rows[0].source_identity], restore_missing_source: true, restore_history_version: stamp } };
    saved = (await run([rows[0]], approved)).rows[0].result.rows;
    assert.equal(saved[0].status, "imported", JSON.stringify(saved));
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM trip_line_items WHERE quantity=999")).rows[0].n, 1);
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM trip_line_items")).rows[0].n, rows.length);
    const stop = (await db.query<{ id: string }>("SELECT id FROM trip_stops LIMIT 1")).rows[0].id;
    await db.query("UPDATE trip_stops SET delivery_location=$1::jsonb WHERE id=$2", [JSON.stringify({ address: "Reviewed Cebu address", latitude: 10.3, longitude: 123.9, verified: true }), stop]);
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int n FROM customer_stores WHERE location_verified")).rows[0].n, 0);
    const basic = prepareImport([{ name: "without-details.csv", rows: [{ line: 2, group: "basic", values: { ...rows[0].values, customer_model: "BASIC-MODEL", dr_number: "BASIC-DR" } }] }]);
    const basicBatch = crypto.randomUUID(), basicTarget = { mode: "new", value: "", allow_create: true, warehouse_ids: target.warehouse_ids };
    const runBasic = () => db.query<{ result: { rows: Array<{ status: string; error?: string }> } }>("SELECT import_trip_source_rows_v3($1,$2,'basic',$3::jsonb,$4::jsonb,false,$5::jsonb) result", [basicBatch, actor, JSON.stringify(basicTarget), JSON.stringify(basic), JSON.stringify({ [basic[0].source_identity]: resolutions[rows[0].source_identity] })]);
    const basicSaved = (await runBasic()).rows[0].result.rows;
    assert.equal(basicSaved[0].status, "imported", JSON.stringify(basicSaved));
    assert.equal((await runBasic()).rows[0].result.rows[0].status, "skipped");
    console.log(JSON.stringify({ isolatedPostgres: true, lines: rows.length, detailsSaved: true, recoveryAndLiveSiblingProtection: true, tripOnlyAddressStored: true, liveWrites: 0 }));
  } finally { await db.close(); }
});
