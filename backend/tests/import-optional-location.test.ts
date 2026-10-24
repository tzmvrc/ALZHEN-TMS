import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-optional-location";
process.env.SUPABASE_ANON_KEY="isolated-optional-location";
const store={id:"123e4567-e89b-42d3-a456-426614174000",customer_id:"223e4567-e89b-42d3-a456-426614174000",name:"Store",province:"Cebu",city:"Cebu City"};
const rows=Array.from({length:56},(_,i)=>({source_identity:`source-${i}`,values:{ship_to:store.name,customer_name:"Customer",province:store.province,city:store.city,customer_model:`MODEL-${i}`,quantity:"1",cbm:"0.1"}}));

test("saving 56 products resolves the selected store once and never performs an optional address search",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {prepareImportDestinationDecisions,persistImportDestinationLocations}=await import("../src/services/trip-location.service.js");
 const original=supabaseAdmin.from;let reads=0;
 (supabaseAdmin as any).from=(table:string)=>{
  assert.equal(table,"customer_stores","save must not query address suggestions or notification recipients");reads++;
  const q:any={select:(fields:string)=>{assert.equal(fields,"id,customer_id,name,province,city");return q;},eq:()=>q,maybeSingle:async()=>({data:store,error:null})};return q;
 };
 try{
  const decisions=Object.fromEntries(rows.map(row=>[row.source_identity,{store_id:store.id,customer_id:store.customer_id,verified:false,update_store_location:false}]));
  const prepared=await prepareImportDestinationDecisions(rows,decisions);
  assert.equal(Object.keys(prepared).length,56);assert.equal(reads,1);
  assert.ok(Object.values(prepared).every(value=>!value.lookup));
  (supabaseAdmin as any).from=()=>{throw Error("Unconfirmed optional addresses must require no follow-up writes or notifications");};
  await persistImportDestinationLocations("actor","batch",rows,rows.map((row,i)=>({source_identity:row.source_identity,status:"imported",line_item_id:`line-${i}`})),prepared);
 }finally{supabaseAdmin.from=original;}
});

test("confirmed trip addresses save once per stop even when many product lines share it",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {persistImportDestinationLocations}=await import("../src/services/trip-location.service.js");
 const original=supabaseAdmin.from;let writes=0;
 const point={address:"Confirmed address",province:store.province,city:store.city,latitude:10.3,longitude:123.9,verified:true,update_store_location:false};
 (supabaseAdmin as any).from=(table:string)=>{
  assert.ok(["trip_line_items","trip_stops"].includes(table),"no unrelated store changes or notifications");let updating=false;
  const q:any={select:()=>q,in:async()=>({error:null,data:table==="trip_line_items"?rows.map((_,i)=>({id:`line-${i}`,trip_id:"trip",trip_stop_id:"stop"})):[{id:"stop",store_id:store.id}]}),update:(payload:any)=>{updating=true;writes++;assert.equal(payload.delivery_location.address,point.address);return q;},eq:async(key:string,value:string)=>{assert.ok(updating);assert.equal(key,"id");assert.equal(value,"stop");return {error:null};}};return q;
 };
 try{
  const outcomes=rows.map((row,i)=>({source_identity:row.source_identity,status:"imported",line_item_id:`line-${i}`}));
  await persistImportDestinationLocations("actor","batch",rows,outcomes,Object.fromEntries(rows.map(row=>[row.source_identity,point])));
  assert.equal(writes,1);
 }finally{supabaseAdmin.from=original;}
});
