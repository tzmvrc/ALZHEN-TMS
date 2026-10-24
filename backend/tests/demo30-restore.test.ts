import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("demo restoration inserts missing IDs, preserves other records/edits, and rejects namespace collisions",async()=>{
 const db=new PGlite();
 try{
  const schema=JSON.parse(await readFile(new URL("./fixtures/spreadsheet-scale-schema.json",import.meta.url),"utf8"));
  for(const type of schema.enums??[])await db.exec(`create type "${type.name}" as enum (${type.values.map((v:string)=>"'"+v.replaceAll("'","''")+"'").join(",")})`);
  for(const table of schema.tables)await db.exec(`create table "${table.name}" (${table.columns.map((c:any)=>`"${c.name}" ${c.type}`).join(",")})`);
  await db.exec(`create table driver_trip_updates(id uuid,trip_id uuid,driver_id uuid,status text,delivery_status text,notes text,created_at timestamptz,updated_at timestamptz);
   create table tms_dropdown_options(field_key text,option_value text,active bool);
   insert into tms_dropdown_options values('trip_status','PLANNED',true),('trip_status','IN_PROGRESS',true),('trip_status','COMPLETED',true);
   insert into profiles(id,role)values('8eaf7847-e806-493d-8338-ac0412153245','ADMIN');
   insert into trips(id,dispatch_number,remarks) values('f0241024-0000-4000-9000-000000000001','REAL-PRESERVE','Existing operational record');`);
  const sql=await readFile(new URL("../migrations/proposals/2026_10_24_demo30_restore.sql",import.meta.url),"utf8");
  await db.exec(sql);assert.equal((await db.query<{n:number}>("select count(*)::int n from trips")).rows[0].n,31);
  await db.exec("update customers set name='Edited demo label' where id='e6301024-0000-4000-9000-000000000001';delete from trip_events where id=(select id from trip_events limit 1)");
  await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from trip_events")).rows[0].n,255);
  assert.equal((await db.query<{name:string}>("select name from customers where id='e6301024-0000-4000-9000-000000000001'")).rows[0].name,"Edited demo label");
  assert.equal((await db.query<{remarks:string}>("select remarks from trips where dispatch_number='REAL-PRESERVE'")).rows[0].remarks,"Existing operational record");
  await db.exec("insert into customers(id,name) values('e6301024-ffff-4000-9000-000000000001','Unrelated reserved ID')");
  await assert.rejects(db.exec(sql),/namespace contains an unexpected ID/);await db.exec("rollback");
  assert.equal((await db.query<{n:number}>("select count(*)::int n from trips")).rows[0].n,31);
 }finally{await db.close();}
});
