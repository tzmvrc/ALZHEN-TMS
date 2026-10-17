import test from "node:test";
import assert from "node:assert/strict";
import {syntheticPdf} from "./fixtures/synthetic-pdf.js";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
test("PDF receipt intake renders original, saves MIME/hash at exact stop, preserves milestones and rejects duplicate content safely",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");const {saveDriverTripReceipt}=await import("../src/services/trucker.service.js");
 const trip="00000000-0000-4000-8000-000000000010",stop="00000000-0000-4000-8000-000000000100",oldFinish="2026-10-16T16:30:25.123Z";
 const seeds:Record<string,Record<string,unknown>[]>={drivers:[{id:"driver",profile_id:"owner"}],trip_truck_assignments:[{trip_id:trip,driver_id:"driver",unassigned_at:null}],trips:[{id:trip,archived_at:null,status:"COMPLETED"}],trip_stops:[{id:stop,trip_id:trip,archived_at:null,delivery_status:"COMPLETED",dr_number:"333",finish_unloading_time:oldFinish},{id:"sibling",trip_id:trip,dr_number:"444",finish_unloading_time:oldFinish}],trip_images:[{id:"original",trip_id:trip,trip_stop_id:stop,kind:"receipt",storage_path:"preserved-original",display_order:0}],driver_trip_updates:[]};
 const oldFlag=process.env.POD_PDF_ENABLED;process.env.POD_PDF_ENABLED="true";
 const original=supabaseAdmin.from,storage=supabaseAdmin.storage.from,get=supabaseAdmin.storage.getBucket;let uploads=0;
 supabaseAdmin.from=((table:string)=>{
  const filters:Array<(row:Record<string,unknown>)=>boolean>=[];let single=false,insert:Record<string,unknown>|null=null;
  const chain={select:()=>chain,eq:(k:string,v:unknown)=>{filters.push(row=>row[k]===v);return chain;},is:(k:string,v:unknown)=>{filters.push(row=>(row[k]??null)===v);return chain;},order:()=>chain,limit:()=>chain,maybeSingle:()=>{single=true;return chain;},single:()=>{single=true;return chain;},insert:(v:Record<string,unknown>)=>{insert=v;return chain;},update:()=>{throw Error('Resubmission must not update any business source');},then:(resolve:(v:unknown)=>unknown,reject:(v:unknown)=>unknown)=>{
   let rows=(seeds[table]??[]).filter(row=>filters.every(f=>f(row)));
   if(insert){const row={id:"new-receipt",...insert};(seeds[table]??=[]).push(row);rows=[row];}
   return Promise.resolve({data:single?rows[0]??null:rows,count:rows.length,error:null}).then(resolve,reject);
  }};return chain;
 }) as typeof original;
 supabaseAdmin.storage.getBucket=(async()=>({data:{public:false,allowed_mime_types:["application/pdf","image/png"],file_size_limit:5242880},error:null})) as typeof get;
 supabaseAdmin.storage.from=(()=>({upload:async()=>{uploads++;return {error:null};},createSignedUrl:async()=>({data:{signedUrl:"https://isolated.test/new"},error:null}),remove:async()=>{throw Error('Original files must remain');}})) as typeof storage;
 const bytes=syntheticPdf(1);
 try{
  const result=await saveDriverTripReceipt('owner',trip,stop,bytes,'application/pdf','synthetic.pdf','333');assert.equal(result.receipt_only,true);assert.equal(result.finish_unloading_time,oldFinish);assert.equal(seeds.trip_stops[0].finish_unloading_time,oldFinish);assert.equal(seeds.trip_stops[1].dr_number,'444');assert.equal(seeds.trips[0].status,'COMPLETED');assert.equal(seeds.trip_images.length,2);assert.equal(seeds.trip_images[0].storage_path,'preserved-original');assert.equal(seeds.driver_trip_updates.length,1);
  await assert.rejects(saveDriverTripReceipt('owner',trip,stop,bytes,'application/pdf','synthetic.pdf','999'),/saved DR/);assert.equal(uploads,1);
  assert.equal(seeds.trip_images[1].mime_type,"application/pdf");assert.match(String(seeds.trip_images[1].file_sha256),/^[a-f0-9]{64}$/);
  await assert.rejects(saveDriverTripReceipt("owner",trip,stop,bytes,"application/pdf","synthetic.pdf","333"),/already saved/);assert.equal(uploads,1);assert.equal(seeds.trip_images.length,2);
 }finally{supabaseAdmin.from=original;supabaseAdmin.storage.from=storage;supabaseAdmin.storage.getBucket=get;if(oldFlag===undefined)delete process.env.POD_PDF_ENABLED;else process.env.POD_PDF_ENABLED=oldFlag;}
});
