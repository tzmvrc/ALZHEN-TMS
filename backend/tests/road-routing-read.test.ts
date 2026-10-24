import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated";
test("road read validates roles, coordinate order and bounded exact trip IDs before database access",async()=>{
 const {coordinatePair,parseRoadTripIds,parseRoadContextAssignment,readRoadRouting}=await import("../src/services/road-routing-read.service.js");
 assert.deepEqual(coordinatePair("10","123"),{latitude:10,longitude:123});for(const pair of [[null,123],[10,""],[123,10],[10,181],[NaN,0]])assert.equal(coordinatePair(...pair as [unknown,unknown]),null);
 const id="00000000-0000-4000-8000-000000000001";assert.deepEqual(parseRoadTripIds(id),[id]);for(const input of [undefined,"",`${id},${id}`,"bad",Array(51).fill(id).join(",")])assert.throws(()=>parseRoadTripIds(input));
 assert.equal(parseRoadContextAssignment(undefined),undefined);assert.equal(parseRoadContextAssignment('none'),null);assert.equal(parseRoadContextAssignment(id),id);assert.throws(()=>parseRoadContextAssignment('bad'));assert.throws(()=>parseRoadContextAssignment([id]));
 await assert.rejects(readRoadRouting({id,role:"TRUCKER"},[id]),/access denied/);
});
test("read-only road assembly isolates assignments/stops and archived rows, checks cache context without writes or Directions",async()=>{
 const {supabaseAdmin:db}=await import("../src/config/supabase.js"),{readRoadRouting}=await import("../src/services/road-routing-read.service.js"),{destinationFingerprint}=await import("../src/services/tracking.logic.js");
 const original=db.from,rpc=db.rpc,id="00000000-0000-4000-8000-000000000001",archived="00000000-0000-4000-8000-000000000002",calls:string[]=[];
 const destinations=[{id:"s2",latitude:11,longitude:123}],fingerprint=destinationFingerprint("a",destinations,"revision");
 const fixture:Record<string,object[]>={trips:[{id,warehouse_id:"w"},{id:archived,archived_at:"date"}],trip_stops:[{id:"s2",trip_id:id,store_id:"store2",stop_sequence:2,delivery_status:"PENDING"},{id:"s1",trip_id:id,store_id:"store1",stop_sequence:1,delivery_status:"COMPLETED"},{id:"old",trip_id:id,archived_at:"date"},{id:"hidden",trip_id:archived}],trip_truck_assignments:[{id:"a",trip_id:id,driver_id:"d",truck_id:"t"},{id:"old",trip_id:id,unassigned_at:"date"}],warehouses:[{id:"w",name:"Warehouse",latitude:10,longitude:123}],customer_stores:[{id:"store1",name:"First",latitude:10.5,longitude:123},{id:"store2",name:"Second",latitude:11,longitude:123}],trucks:[{id:"t",plate_number:"Fixture"}],drivers:[{id:"d",profile_id:"driver",first_name:"Test",last_name:"Driver"}],trip_tracking_locations:[{assignment_id:"a",profile_id:"driver",enabled:true,latitude:10,longitude:123,captured_at:"2026-10-17T10:00:00Z",accuracy_meters:5}],trip_route_cache:[{assignment_id:"a",destination_fingerprint:fingerprint,route_geometry:{type:"LineString",coordinates:[[123,10],[123,11]]}}]};
 db.from=((table:string)=>({select:()=>({in:()=>({limit:async()=>{calls.push(table);return {error:null,data:fixture[table]??[]};}})})})) as typeof original;
 db.rpc=(async(name:string,args:Record<string,unknown>)=>{assert.ok(["tracking_route_context_v1","planned_route_context_v1"].includes(name));assert.equal(args.p_lock,false);return {error:null,data:{context_token:"revision",destinations}};}) as typeof rpc;
 try{const rows=await readRoadRouting({id,role:"STAFF"},[id,archived]);assert.equal(rows.length,1);assert.equal(rows[0].assignmentId,"a");assert.deepEqual(rows[0].stops.map(s=>s.id),["s1","s2"]);assert.equal(rows[0].cache?.matchesContext,true);assert.equal(rows[0].cache?.mode,"remaining");assert.equal(rows[0].position?.latitude,10);assert.equal(calls.length,10);
  const rpcBefore=db.rpc;let overviewRpcs=0;db.rpc=(async()=>{overviewRpcs++;throw Error('Overview must not validate hidden routes');}) as typeof rpc;
  const overview=await readRoadRouting({id,role:'STAFF'},[id],null);assert.equal(overview.length,1);assert.equal(overview[0].position?.latitude,10);assert.equal(overview[0].plannedCache,null);assert.equal(overview[0].cache,null);assert.equal(overviewRpcs,0);db.rpc=rpcBefore;
  fixture.trip_tracking_locations=[{assignment_id:"a",profile_id:"unrelated",enabled:true,latitude:10,longitude:123}];assert.equal((await readRoadRouting({id,role:"ADMIN"},[id]))[0].position,null);
  const flag=process.env.PLANNED_ROUTES_ENABLED;
  try{process.env.PLANNED_ROUTES_ENABLED="true";Object.assign(fixture.trip_route_cache[0],{planned_fingerprint:fingerprint,planned_geometry:{type:"LineString",coordinates:[[123,9],[123,11]]},planned_expires_at:"2026-10-17T12:00:00Z"});
   const planned=(await readRoadRouting({id,role:"STAFF"},[id]))[0];assert.equal(planned.plannedCache?.matchesContext,true);assert.equal(planned.plannedCache?.mode,"planned");assert.equal(planned.cache?.mode,"remaining");assert.notDeepEqual(planned.plannedCache?.geometry,planned.cache?.geometry);
  }finally{if(flag===undefined)delete process.env.PLANNED_ROUTES_ENABLED;else process.env.PLANNED_ROUTES_ENABLED=flag;}
 }finally{db.from=original;db.rpc=rpc;}
});
