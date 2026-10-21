import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supabaseAdmin} from "../src/config/supabase.js";
import {deletePhysicalRecord} from "../src/services/record-deletion.service.js";
const id="123e4567-e89b-42d3-a456-000000000011",trip="123e4567-e89b-42d3-a456-000000000012",actor={id:"123e4567-e89b-42d3-a456-000000000013",role:"ADMIN"};
test("physical deletion uses only reviewed RPCs, rejects roles/versions, and never falls back to a parent",async()=>{const original=supabaseAdmin.rpc;const calls:any[]=[];let error:any=null;
 (supabaseAdmin as any).rpc=async(name:string,p:any)=>{calls.push({name,p});return{data:error?null:{id:p.p_id,trip_id:trip},error};};
 try{await assert.rejects(deletePhysicalRecord({...actor,role:"TRUCKER"},"store_calls",id,0));assert.equal(calls.length,0);await assert.rejects(deletePhysicalRecord(actor,"store_calls",id,undefined));await assert.rejects(deletePhysicalRecord(actor,"trip_stops",id,0,"invalid"));assert.equal(calls.length,0);
  await deletePhysicalRecord(actor,"store_calls",id,3);assert.deepEqual(calls[0],{name:"delete_store_call_record_v1",p:{p_id:id,p_actor:actor.id,p_expected_version:3}});
  await deletePhysicalRecord({...actor,role:"STAFF"},"trip_stops",id,4,trip);assert.equal(calls[1].name,"delete_empty_trip_stop_v1");assert.equal(calls[1].p.p_trip,trip);
  for(const code of ["PGRST202","23503","55000","40001","42501","P0002"]){error={code};const count=calls.length;await assert.rejects(deletePhysicalRecord(actor,"trip_stops",id,4,trip));assert.equal(calls.length,count+1);assert.equal(calls.at(-1).name,"delete_empty_trip_stop_v1");}
 }finally{supabaseAdmin.rpc=original;}});
test("proposed SQL retains parent trips, rejects dependencies and makes audit plus deletion transactional",()=>{const sql=readFileSync(new URL("../migrations/2026_10_21_proposed_narrow_record_deletion.sql",import.meta.url),"utf8");assert.doesNotMatch(sql,/DELETE\s+FROM\s+(?:public\.)?(?:trips|trip_line_items|pod_records)\b/i);assert.match(sql,/FOR UPDATE/);assert.match(sql,/pg_constraint/);assert.match(sql,/audit_logs/);assert.match(sql,/REVOKE ALL/);assert.match(sql,/p_expected_version/);});
