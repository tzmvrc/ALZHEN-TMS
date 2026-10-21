import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("proposed lookup clearing is transactional and preserves trip, assignment, cargo and attachment ownership",async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text);
 CREATE TABLE trucks(id uuid PRIMARY KEY,plate_number text,capacity_cbm numeric);
 CREATE TABLE drivers(id uuid PRIMARY KEY);CREATE TABLE customers(id uuid PRIMARY KEY);
 CREATE TABLE warehouses(id uuid PRIMARY KEY);CREATE TABLE trucking_companies(id uuid PRIMARY KEY);
 CREATE TABLE products(id uuid PRIMARY KEY,photo_path text);
 CREATE TABLE customer_stores(id uuid PRIMARY KEY);
 CREATE TABLE store_contacts(id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES customer_stores(id) ON DELETE CASCADE);
 CREATE TABLE store_exceptions(id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES customer_stores(id) ON DELETE CASCADE);
 CREATE TABLE trips(id uuid PRIMARY KEY,dispatch_number text,warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL);
 CREATE TABLE trip_stops(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id),store_id uuid REFERENCES customer_stores(id) ON UPDATE CASCADE ON DELETE RESTRICT);
 CREATE TABLE trip_truck_assignments(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id),truck_id uuid NOT NULL REFERENCES trucks(id) ON UPDATE CASCADE ON DELETE RESTRICT,unassigned_at timestamptz,stop_scope text DEFAULT 'ALL');
 CREATE TABLE trip_line_items(id uuid PRIMARY KEY,trip_id uuid REFERENCES trips(id),trip_stop_id uuid REFERENCES trip_stops(id),source_warehouse_id uuid REFERENCES warehouses(id),product_id uuid REFERENCES products(id) ON DELETE SET NULL,quantity numeric,cbm numeric);
 CREATE TABLE trip_cargo_allocations(id uuid PRIMARY KEY,assignment_id uuid REFERENCES trip_truck_assignments(id),trip_line_item_id uuid REFERENCES trip_line_items(id),quantity numeric,allocated_cbm numeric);
 CREATE TABLE trip_assignment_stops(id uuid PRIMARY KEY,assignment_id uuid REFERENCES trip_truck_assignments(id),trip_stop_id uuid REFERENCES trip_stops(id));
 CREATE TABLE truck_images(id uuid PRIMARY KEY,truck_id uuid NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,storage_path text);
 CREATE TABLE audit_logs(id bigserial PRIMARY KEY,user_id uuid,action text,entity_type text,entity_id uuid,old_data jsonb);`);
 const sql=await readFile(new URL('../migrations/2026_10_22_database_lookup_reference_clearing.sql',import.meta.url),'utf8');await db.exec(sql);
 await db.exec(`CREATE TRIGGER cargo_guard BEFORE UPDATE ON trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION protect_allocated_cargo_source_v1();
 INSERT INTO profiles VALUES('${id(1)}','ADMIN'),('${id(2)}','TRUCKER');
 INSERT INTO trucks VALUES('${id(10)}','TARGET',50),('${id(11)}','SIBLING',50);
 INSERT INTO warehouses VALUES('${id(20)}');INSERT INTO customer_stores VALUES('${id(30)}');
 INSERT INTO trips VALUES('${id(40)}','SAME-DISPATCH','${id(20)}'),('${id(41)}','SAME-DISPATCH',NULL);
 INSERT INTO trip_stops VALUES('${id(50)}','${id(40)}','${id(30)}');
 INSERT INTO trip_truck_assignments(id,trip_id,truck_id) VALUES('${id(60)}','${id(40)}','${id(10)}'),('${id(61)}','${id(41)}','${id(11)}');
 INSERT INTO trip_line_items VALUES('${id(70)}','${id(40)}','${id(50)}','${id(20)}',NULL,10,20);
 INSERT INTO trip_cargo_allocations VALUES('${id(80)}','${id(60)}','${id(70)}',10,20);`);
 await assert.rejects(db.query('SELECT delete_master_data_record_v1($1,$2,$3)',['trucks',id(10),id(2)]),/Access denied/);
 // A normal edit cannot clear the truck while it still exists.
 await assert.rejects(db.query('UPDATE trip_truck_assignments SET truck_id=NULL WHERE id=$1',[id(60)]),/Reallocate cargo/);
 await db.query('SELECT delete_master_data_record_v1($1,$2,$3)',['trucks',id(10),id(1)]);
 assert.equal((await db.query<any>('SELECT truck_id FROM trip_truck_assignments WHERE id=$1',[id(60)])).rows[0].truck_id,null);
 assert.equal((await db.query<any>('SELECT truck_id FROM trip_truck_assignments WHERE id=$1',[id(61)])).rows[0].truck_id,id(11));
 for(const [table,count] of [['trips',2],['trip_stops',1],['trip_line_items',1],['trip_cargo_allocations',1],['trip_truck_assignments',2]] as const)assert.equal(Number((await db.query<any>(`SELECT count(*) FROM ${table}`)).rows[0].count),count);
 const audit=(await db.query<any>('SELECT old_data FROM audit_logs WHERE entity_id=$1',[id(10)])).rows[0].old_data;assert.equal((await db.query<any>('SELECT assigned_cbm,capacity_cbm FROM v_trip_assignment_totals WHERE assignment_id=$1',[id(60)])).rows[0].assigned_cbm,'20');assert.equal(audit.plate_number,'TARGET');assert.deepEqual(audit._cleared_references[0].record_ids,[id(60)]);
 await db.query('SELECT delete_master_data_record_v1($1,$2,$3)',['warehouses',id(20),id(1)]);assert.equal((await db.query<any>('SELECT source_warehouse_id FROM trip_line_items')).rows[0].source_warehouse_id,null);
 await db.query('SELECT delete_master_data_record_v1($1,$2,$3)',['stores',id(30),id(1)]);assert.equal((await db.query<any>('SELECT store_id FROM trip_stops')).rows[0].store_id,null);
 // Attachments block atomically; no deleted owner, lost file metadata or false audit.
 await db.exec(`INSERT INTO truck_images VALUES('${id(90)}','${id(11)}','private/preserve.png');`);
 await assert.rejects(db.query('SELECT delete_master_data_record_v1($1,$2,$3)',['trucks',id(11),id(1)]),/Protected relationships/);
 assert.equal((await db.query<any>('SELECT storage_path FROM truck_images')).rows[0].storage_path,'private/preserve.png');assert.equal((await db.query<any>('SELECT count(*) FROM trucks WHERE id=$1',[id(11)])).rows[0].count,1);
 assert.equal(Number((await db.query<any>('SELECT count(*) FROM audit_logs WHERE entity_id=$1',[id(11)])).rows[0].count),0);
 }finally{await db.close();}
});

test("backend bulk deletion deduplicates exact IDs and preserves failed results without a parent fallback",async()=>{
 process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated';process.env.SUPABASE_ANON_KEY='isolated';
 const {supabaseAdmin}=await import('../src/config/supabase.js'),{deleteMasterDataRecords}=await import('../src/services/master-data.service.js');const original=supabaseAdmin.rpc,calls:unknown[]=[];
 (supabaseAdmin as any).rpc=async(name:string,args:any)=>{assert.equal(name,'delete_master_data_record_v1');calls.push(args);return args.p_id===id(10)?{data:{id:id(10),deleted:true},error:null}:{data:null,error:{code:'55000',message:'Protected attachments'}};};
 try{
  await assert.rejects(deleteMasterDataRecords('trucks',[id(10)],{id:id(1),role:'TRUCKER'}),/permission/);assert.equal(calls.length,0);
  const result=await deleteMasterDataRecords('trucks',[id(10),id(10),id(11)],{id:id(1),role:'ADMIN'});assert.deepEqual(result.deleted,[id(10)]);assert.equal(result.failed[0].id,id(11));assert.equal(calls.length,2);
 }finally{supabaseAdmin.rpc=original;}
});
