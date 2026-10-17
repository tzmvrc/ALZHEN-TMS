import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createPlannedRouteService,plannedRoutePlan,type PlannedContext} from "../src/services/planned-route.service.js";
import {destinationFingerprint} from "../src/services/tracking.logic.js";
import type {RouteRepository,RouteSnapshot} from "../src/services/road-route.service.js";
import type {RoadGeometry,RoadRoute} from "../src/services/mapbox-directions.service.js";
const geometry=JSON.parse(readFileSync(new URL("../../frontend/tests/fixtures/road-geometry.json",import.meta.url),"utf8")) as RoadGeometry;
const road:RoadRoute={geometry,distance_meters:176.7,duration_seconds:26.2},actor={id:"admin",role:"ADMIN"};
const context=(id="a"):PlannedContext=>({id,tripId:`trip-${id}`,active:true,context_token:"v1",origin:{id:"warehouse",latitude:52.50807,longitude:13.42658},destinations:[{id:"second",latitude:52.5069,longitude:13.42729,stopSequence:2},{id:"first",latitude:52.50755,longitude:13.42775,stopSequence:1}]});
function fixture(){
 let time=1000000,calls=0,reads=0,claims=0,fail=false;const snapshots=new Map<string,RouteSnapshot>(),contexts=new Map<string,PlannedContext>();
 const empty=():RouteSnapshot=>({revision:0,fingerprint:null,calculatedAt:null,leaseUntil:null,retryAfter:null,route:null});
 const repository:RouteRepository={read:async id=>{reads++;return {...snapshots.get(id)??empty()};},claim:async(p,v)=>{claims++;const r=snapshots.get(p.assignmentId)??empty();if(r.revision!==v||r.leaseUntil&&r.leaseUntil>time)return false;snapshots.set(p.assignmentId,{...r,revision:v+1,leaseUntil:time+60000});return true;},finish:async(p,_t,f,r)=>{snapshots.set(p.assignmentId,{revision:(snapshots.get(p.assignmentId)?.revision??0)+1,fingerprint:f,calculatedAt:time,leaseUntil:null,retryAfter:null,route:r});return true;},fail:async(id)=>{const r=snapshots.get(id)!;snapshots.set(id,{...r,leaseUntil:null,retryAfter:time+60000});}};
 const directions={calculate:async(_origin:unknown,stops:Array<{id:string}>)=>{calls++;assert.deepEqual(stops.map(s=>s.id),["first","second"]);if(fail)throw Error("mock provider unavailable");return road;}};
 const service=createPlannedRouteService({enabled:()=>true,resolve:async id=>contexts.get(id)??context(id),repository,directions,now:()=>time});
 return {service,repository,directions,contexts,snapshots,stats:()=>({calls,reads,claims}),advance:(ms:number)=>{time+=ms;},fail:()=>{fail=true;}};
}
test("planned route generation is fail-closed and role restricted before context/cache/provider access",async()=>{
 const f=fixture(),service=createPlannedRouteService({resolve:async()=>{throw Error("must not read");},repository:f.repository,directions:f.directions});
 await assert.rejects(service(actor,"a"),/disabled/);await assert.rejects(f.service({id:"driver",role:"TRUCKER"},"a"),/Management/);assert.deepEqual(f.stats(),{calls:0,reads:0,claims:0});
});
test("planned route resolves warehouse and every ordered stop without GPS; missing/duplicate/over-limit inputs fail before cache or provider",async()=>{
 const p=plannedRoutePlan(context());assert.equal(p.origin?.id,"warehouse");assert.deepEqual(p.destinations.map(s=>s.id),["first","second"]);
 const f=fixture();for(const [id,c] of [["missingWarehouse",{...context(),origin:null}],["missingStore",{...context(),destinations:[{id:"bad",latitude:null,longitude:13}]}],["limit",{...context(),destinations:Array.from({length:25},(_,i)=>({id:`s${i}`,latitude:10,longitude:123}))}],["duplicate",{...context(),destinations:[context().destinations[0],context().destinations[0]]}],["empty",{...context(),destinations:[]}],["inactive",{...context(),active:false}]] as Array<[string,PlannedContext]>){f.contexts.set(id,{...c,id});await assert.rejects(f.service(actor,id));}
 assert.equal(f.stats().calls,0);assert.equal(f.stats().reads,0);assert.equal(f.stats().claims,0);
});
test("planned caches reuse geometry, expire hourly and invalidate only changed origin/order context",async()=>{
 const f=fixture();assert.equal((await f.service(actor,"a")).state,"UPDATED");assert.equal((await f.service(actor,"a")).state,"CACHED");assert.equal(f.stats().calls,1);
 f.advance(3600000);assert.equal((await f.service(actor,"a")).state,"UPDATED");assert.equal(f.stats().calls,2);
 f.contexts.set("a",{...context(),context_token:"warehouse-coordinates-v2"});assert.equal((await f.service(actor,"a")).state,"UPDATED");assert.equal(f.stats().calls,3);
 const p=plannedRoutePlan(f.contexts.get("a")!);assert.equal(f.snapshots.get("a")?.fingerprint,destinationFingerprint("a",p.destinations,p.assignmentRevision));
});
test("simultaneous requests deduplicate, ten independent trips cache separately and no GPS repository is used",async()=>{
 const f=fixture();await Promise.all(Array.from({length:10},()=>f.service(actor,"a")));assert.equal(f.stats().calls,1);assert.equal(f.stats().claims,1);
 await Promise.all(Array.from({length:10},(_,i)=>f.service(actor,`trip-${i}`)));assert.equal(f.stats().calls,11);assert.equal(f.snapshots.size,11);
 await Promise.all(Array.from({length:10},(_,i)=>f.service(actor,`trip-${i}`)));assert.equal(f.stats().calls,11);
});
test("failed route refresh retains last good geometry and backoff prevents repeated requests",async()=>{
 const f=fixture();await f.service(actor,"a");f.advance(3600000);f.fail();const result=await f.service(actor,"a");assert.equal(result.state,"RETRY_PENDING");assert.equal(result.route,road);assert.equal((await f.service(actor,"a")).state,"RETRY_DELAY");assert.equal(f.stats().calls,2);
});
