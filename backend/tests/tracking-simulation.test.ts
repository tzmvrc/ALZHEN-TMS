import test from "node:test";
import assert from "node:assert/strict";
import {createTrackingService,type TrackingRepository,type TrackingFix} from "../src/services/tracking.service.js";
import {createRoadRouteService,type RouteRepository,type RouteSnapshot} from "../src/services/road-route.service.js";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("ten trucks preserve exact assignments and stop order while GPS moves independently of hourly routes",async()=>{
 let now=Date.now(),directions=0;
 const assignments=Array.from({length:10},(_,i)=>({id:id(i+1),tripId:id(i+101),profileId:id(i+201),active:true,revision:0}));
 const locations=new Map<string,TrackingFix&{revision:number;enabled:boolean}>(),sessions=new Map<string,string>();
 const repository:TrackingRepository={assignment:async a=>assignments.find(x=>x.id===a)??null,begin:async(a,s)=>{sessions.set(a.id,s);locations.delete(a.id);},capture:async(a,s,f)=>{if(sessions.get(a.id)!==s||f.captured_at<=(locations.get(a.id)?.captured_at??""))return false;locations.set(a.id,{...f,enabled:true,revision:(locations.get(a.id)?.revision??0)+1});return true;},stop:async(a,s)=>{if(sessions.get(a.id)!==s)return false;sessions.delete(a.id);locations.delete(a.id);return true;},latest:async a=>locations.get(a)??null};
 const cache=new Map<string,RouteSnapshot>(),leases=new Map<string,string>();
 const empty=():RouteSnapshot=>({revision:0,fingerprint:null,calculatedAt:null,leaseUntil:null,retryAfter:null,route:null});
 const routes:RouteRepository={read:async a=>cache.get(a)??empty(),claim:async(p,v,t,until)=>{const old=cache.get(p.assignmentId)??empty();if(old.revision!==v||(old.leaseUntil??0)>now)return false;cache.set(p.assignmentId,{...old,revision:v+1,leaseUntil:until});leases.set(p.assignmentId,t);return true;},finish:async(p,t,f,route,at)=>{if(leases.get(p.assignmentId)!==t)return false;cache.set(p.assignmentId,{revision:(cache.get(p.assignmentId)?.revision??0)+1,fingerprint:f,calculatedAt:at,leaseUntil:null,retryAfter:null,route});return true;},fail:async()=>{}};
 const service=createTrackingService(repository,()=>now),refresh=createRoadRouteService(routes,{calculate:async(origin,stops)=>{directions++;return {geometry:{type:"LineString",coordinates:[origin,...stops].map(p=>[p.longitude,p.latitude])},distance_meters:100,duration_seconds:60};}},()=>now);
 const actors=assignments.map(a=>({profileId:a.profileId,role:"TRUCKER"}));
 const owned=await Promise.all(assignments.map((a,i)=>service.begin(actors[i],a.id,true)));
 const stops=assignments.map((_,i)=>[{id:id(400+i*2),latitude:10+i/100,longitude:123},{id:id(401+i*2),latitude:11+i/100,longitude:124}]);
 const fix=(i:number,step:number)=>({session_id:owned[i].session_id,latitude:9+i/100+step/1000,longitude:122,accuracy_meters:5,captured_at:new Date(now).toISOString()});
 const plans=()=>assignments.map((a,i)=>({assignmentId:a.id,assignmentRevision:String(a.revision),active:true,origin:{id:a.id,latitude:locations.get(a.id)!.latitude,longitude:122},destinations:stops[i]}));
 await Promise.all(assignments.map((a,i)=>service.capture(actors[i],a.id,fix(i,0))));
 await Promise.all(plans().map(refresh));assert.equal(directions,10);
 for(let step=1;step<=3;step++){now+=30000;await Promise.all(assignments.map((a,i)=>service.capture(actors[i],a.id,fix(i,step))));await Promise.all(plans().map(refresh));}
 assert.equal(directions,10);assert.equal(locations.size,10);
 const otherBefore=locations.get(assignments[1].id);
 await assert.rejects(service.capture(actors[0],assignments[1].id,fix(0,4)),/not available/);
 await assert.rejects(service.latest(actors[0],assignments[1].id),/not available/);assert.strictEqual(locations.get(assignments[1].id),otherBefore);
 await assert.rejects(service.capture(actors[0],assignments[0].id,fix(0,3)),/newer capture/);
 await assert.rejects(service.capture(actors[0],assignments[0].id,{...fix(0,3),captured_at:new Date(now-1000).toISOString()}),/newer capture/);
 for(const invalid of [{latitude:91},{longitude:181},{latitude:NaN},{accuracy_meters:-1},{captured_at:new Date(now-121000).toISOString()}])await assert.rejects(service.capture(actors[0],assignments[0].id,{...fix(0,3),...invalid}),/recent GPS/);
 stops[0]=[...stops[0]].reverse();await refresh(plans()[0]);assert.equal(directions,11);
 assignments[1].revision++;await refresh(plans()[1]);assert.equal(directions,12);
 now+=3600000;await Promise.all(plans().map(refresh));assert.equal(directions,22);
 assert.equal((await service.latest({profileId:id(999),role:"STAFF"},assignments[0].id)).stale,true);
 await service.stop(actors[0],assignments[0].id,owned[0].session_id);
 assert.equal(locations.size,9);assert.ok(locations.has(assignments[1].id));
 await assert.rejects(service.capture(actors[0],assignments[0].id,fix(0,5)),/session changed/);
 console.log(JSON.stringify({simulated:true,trucks:10,trips:10,stopsPerTrip:2,initialRoutes:10,movementAdditionalRoutes:0,contextChangeRoutes:2,hourlyRoutes:10,liveWrites:0,providerCalls:0}));
});
