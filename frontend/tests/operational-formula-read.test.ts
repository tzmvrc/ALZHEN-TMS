import assert from "node:assert/strict";
import test from "node:test";
import {invalidateOperationalFormulaReads,readOperationalFormulas,retryOperationalFormulaReads} from "../src/services/operational-formula.service.ts";

test("formula failures dedupe readers and respect cooldown across realtime invalidations; explicit Refresh retries immediately",async()=>{
 const original=globalThis.fetch;invalidateOperationalFormulaReads();let reads=0,fail=true;
 globalThis.fetch=async()=>{reads++;return new Response(JSON.stringify(fail?{success:false,message:"Unavailable"}:{success:true,data:{formulas:[],sources:[]}}),{status:fail?503:200});};
 try{
  const burst=await Promise.allSettled(Array.from({length:5},()=>readOperationalFormulas("user-a","trips",["trip:a"])));
  assert.ok(burst.every(result=>result.status==="rejected"));assert.equal(reads,1);
  invalidateOperationalFormulaReads("trips");
  await assert.rejects(readOperationalFormulas("user-a","trips",["trip:a"]));assert.equal(reads,1);
  fail=false;retryOperationalFormulaReads("user-a","trips");
  assert.deepEqual(await readOperationalFormulas("user-a","trips",["trip:a"]),{formulas:[],sources:[]});assert.equal(reads,2);
  await readOperationalFormulas("user-a","trips",["trip:a"]);assert.equal(reads,2);
 }finally{globalThis.fetch=original;invalidateOperationalFormulaReads();}
});

test("formula failure cooldown expires and is isolated by user, table and logout",async()=>{
 const original=globalThis.fetch,now=Date.now;invalidateOperationalFormulaReads();let reads=0,time=now();Date.now=()=>time;
 globalThis.fetch=async()=>{reads++;return new Response(JSON.stringify({success:false}),{status:503});};
 try{
  await assert.rejects(readOperationalFormulas("a","trips",["trip:a"]));
  await assert.rejects(readOperationalFormulas("b","trips",["trip:a"]));
  await assert.rejects(readOperationalFormulas("a","report:dispatch",["trip:a"]));assert.equal(reads,3);
  time+=10001;await assert.rejects(readOperationalFormulas("a","trips",["trip:a"]));assert.equal(reads,4);
  invalidateOperationalFormulaReads();await assert.rejects(readOperationalFormulas("a","trips",["trip:a"]));assert.equal(reads,5);
 }finally{globalThis.fetch=original;Date.now=now;invalidateOperationalFormulaReads();}
});
