import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";
test("whole-trip deletion deduplicates physical IDs, is Admin-only and cannot use a non-atomic fallback",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js"),{wholeTripIds,createWholeTripDeleter}=await import("../src/services/whole-trip-deletion.service.js");
 const deleteWholeTrips=createWholeTripDeleter(async(_actor,_credentials,commit)=>commit());
 const trip="00000000-0000-4000-8000-000000000001",actor={id:trip,role:"ADMIN"};
 assert.deepEqual(wholeTripIds(actor,[trip,trip]),[trip]);for(const role of ["STAFF","TRUCKER"])assert.throws(()=>wholeTripIds({...actor,role},[trip]));assert.throws(()=>wholeTripIds(actor,["row-index-1"]));
 const rpc=db.rpc,flag=process.env.WHOLE_TRIP_DELETE_ENABLED;let calls=0;
 db.rpc=(async(name:string)=>{calls++;assert.equal(name,"delete_whole_trips_v1");return {data:null,error:{code:"55000",message:"Protected accounting records"}};}) as typeof rpc;
 try{delete process.env.WHOLE_TRIP_DELETE_ENABLED;await assert.rejects(deleteWholeTrips(actor,[trip]),/disabled/);assert.equal(calls,0);process.env.WHOLE_TRIP_DELETE_ENABLED="true";await assert.rejects(deleteWholeTrips(actor,[trip,trip]),/Protected accounting/);assert.equal(calls,1);}finally{db.rpc=rpc;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});

test("impact uses the narrow Admin RPC, preserves private table grants and fails closed",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js"),{wholeTripImpact,WHOLE_TRIP_IMPACT_COUNTS}=await import("../src/services/whole-trip-deletion.service.js");
 const trip="00000000-0000-4000-8000-000000000001",actor={id:trip,role:"ADMIN"},original=db.rpc,originalFrom=db.from,flag=process.env.WHOLE_TRIP_DELETE_ENABLED;
 let missing=false,calls=0,pending=0;
 db.from=(()=>{const q={select(){return q},in(){return q},eq:async()=>({count:pending,error:null})};return q;}) as typeof originalFrom;
 db.rpc=(async(name:string,args:unknown)=>{calls++;assert.equal(name,"preview_whole_trip_deletion_v1");assert.deepEqual(args,{p_trip_ids:[trip],p_actor_id:trip});return {data:{trips:[{id:trip,dispatch_number:"TEST"}],counts:{...Object.fromEntries(WHOLE_TRIP_IMPACT_COUNTS.map(key=>[key,0])),trip_stops:3,billings:missing?null:1},blockers:["Billing records require accounting review."]},error:null};}) as typeof original;
 try{delete process.env.WHOLE_TRIP_DELETE_ENABLED;const result=await wholeTripImpact(actor,[trip,trip]);assert.equal(result.counts.trip_stops,3);assert.equal(result.can_delete,false);assert.match(result.blockers.join(" "),/accounting/);assert.equal(calls,1);pending=1;assert.match((await wholeTripImpact(actor,[trip])).blockers.join(" "),/upload is incomplete/);missing=true;await assert.rejects(wholeTripImpact(actor,[trip]),/counts are unavailable/);}finally{db.rpc=original;db.from=originalFrom;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});

test("whole-trip acknowledgement retries durable exact Storage cleanup without false completion",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js"),{createWholeTripDeleter}=await import("../src/services/whole-trip-deletion.service.js");
 const deleteWholeTrips=createWholeTripDeleter(async(_actor,_credentials,commit)=>commit());
 const trip="00000000-0000-4000-8000-000000000001",operation="00000000-0000-4000-8000-000000000011",actor={id:trip,role:"ADMIN"};
 const originalRpc=db.rpc,originalFrom=db.from,originalStorage=db.storage.from,flag=process.env.WHOLE_TRIP_DELETE_ENABLED;let fail=true,calls=0;const removed:string[][]=[];
 let job={id:operation,trip_id:trip,trip_stop_id:null,transaction_id:trip,state:"PENDING_STORAGE",attempts:0,storage_objects:[{bucket:"trip-images",path:`trips/${trip}/${operation}.jpg`,object_id:operation}]};
 db.rpc=(async(name:string)=>{if(name==="validate_transaction_cleanup_objects_v1")return {data:job.storage_objects,error:null};calls++;return {data:[{id:operation,trip_id:trip}],error:null};}) as typeof originalRpc;
 db.from=(()=>{let patch:Record<string,unknown>|null=null;const q={select(){return q},eq(){return q},update(value:Record<string,unknown>){patch=value;return q},async maybeSingle(){if(patch)job={...job,...patch};return {data:job,error:null}}};return q;}) as typeof originalFrom;
 db.storage.from=(()=>({async remove(paths:string[]){removed.push(paths);return {error:fail?{message:"Storage unavailable"}:null};}})) as typeof originalStorage;
 try{process.env.WHOLE_TRIP_DELETE_ENABLED="true";const pending=await deleteWholeTrips(actor,[trip,trip]);assert.equal(pending.cleanup_pending,true);assert.equal(pending.deleted_trips,1);fail=false;const completed=await deleteWholeTrips(actor,[trip]);assert.equal(completed.cleanup_pending,false);assert.equal(job.state,"COMPLETE");assert.equal(calls,2);assert.deepEqual(removed,[[`trips/${trip}/${operation}.jpg`],[`trips/${trip}/${operation}.jpg`]]);}finally{db.rpc=originalRpc;db.from=originalFrom;db.storage.from=originalStorage;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});
test("a changed database role is rejected even after an earlier Admin authorization",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js"),{createWholeTripDeleter}=await import("../src/services/whole-trip-deletion.service.js");const deleteWholeTrips=createWholeTripDeleter(async(_actor,_credentials,commit)=>commit());const original=db.rpc,flag=process.env.WHOLE_TRIP_DELETE_ENABLED;
 db.rpc=(async()=>({data:null,error:{code:"42501"}})) as typeof original;
 try{process.env.WHOLE_TRIP_DELETE_ENABLED="true";await assert.rejects(deleteWholeTrips({id:"00000000-0000-4000-8000-000000000001",role:"ADMIN"},["00000000-0000-4000-8000-000000000001"]),(e:unknown)=>(e as {statusCode:number}).statusCode===403);}finally{db.rpc=original;if(flag===undefined)delete process.env.WHOLE_TRIP_DELETE_ENABLED;else process.env.WHOLE_TRIP_DELETE_ENABLED=flag;}
});
