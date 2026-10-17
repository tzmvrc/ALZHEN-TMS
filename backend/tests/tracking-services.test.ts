import test from "node:test";
import assert from "node:assert/strict";
import {createTrackingService,type TrackingRepository,type TrackingFix} from "../src/services/tracking.service.js";
import {createMapboxDirections} from "../src/services/mapbox-directions.service.js";
import {createRoadRouteService,type RouteRepository,type RouteSnapshot,type AuthorizedRoutePlan} from "../src/services/road-route.service.js";
import {preparePodIntake} from "../src/services/pod-intake.service.js";

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCzAAAAAASUVORK5CYII=','base64');
test("existing receipt uploader rejects disabled PDFs before any database or Storage operation",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {supabaseAdmin}=await import("../src/config/supabase.js"),{uploadTripImage}=await import("../src/services/trip-image.service.js");
 const original=supabaseAdmin.from;let calls=0;
 supabaseAdmin.from=(()=>{calls++;throw Error("Disabled PDFs must not reach the database");}) as typeof original;
 try{await assert.rejects(uploadTripImage(id(10),Buffer.from('%PDF-1.7\n%%EOF'),"application/pdf","fixture.pdf",{stopId:id(100),profileId:id(3),drNumber:"333"}),/awaits approved/);assert.equal(calls,0);}
 finally{supabaseAdmin.from=original;}
});
test("prepared PDF intake preserves original/hash, bounds raster work and stays disabled with current bucket",async()=>{
 const bytes=Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
 const policy={pdfEnabled:false,bucketPrivate:true,maxBytes:5242880,allowedMimeTypes:["image/png"]};
 let renders=0;
 const render=async()=>{renders++;return [{bytes:png,width:1,height:1,mime:"image/png" as const}];};
 await assert.rejects(preparePodIntake(bytes,"application/pdf","fixture.pdf",policy,render),/not activated/);assert.equal(renders,0);
 const allowed={...policy,pdfEnabled:true,allowedMimeTypes:["image/png","application/pdf"]};
 await assert.rejects(preparePodIntake(bytes,"application/pdf","fixture.pdf",allowed),/not activated/);
 const result=await preparePodIntake(bytes,"application/pdf","fixture.pdf",allowed,render);
 assert.equal(result.original,bytes);assert.equal(result.ocrPages[0],png);assert.equal(result.metadata.file_sha256.length,64);
 await assert.rejects(preparePodIntake(bytes,"application/pdf","fixture.pdf",{...allowed,bucketPrivate:false},render),/private/);
 await assert.rejects(preparePodIntake(bytes,"application/pdf","fixture.pdf",allowed,async()=>Array(11).fill({bytes:png,width:1,height:1,mime:"image/png"})),/safely rendered/);
 await assert.rejects(preparePodIntake(bytes,"application/pdf","fixture.pdf",allowed,async()=>[{bytes:png,width:10000,height:10000,mime:"image/png"}]),/safely rendered/);
 await assert.rejects(preparePodIntake(Buffer.alloc(5242881),"application/pdf","large.pdf",allowed,render),/5 MB/);
 const image=await preparePodIntake(png,"image/png","receipt.png",policy);assert.equal(image.original,png);
});
test("tracking service derives owner, requires consent, rejects stale/session/reassignment and restricts reads",async()=>{
 let now=Date.parse("2026-10-17T01:00:00Z"),session="",enabled=false,fix:(TrackingFix&{revision:number;enabled:boolean})|null=null,race=false;
 const assignment={id:id(1),tripId:id(2),profileId:id(3),active:true,revision:1};
 const repository:TrackingRepository={assignment:async()=>({...assignment}),begin:async(_a,s)=>{session=s;enabled=true;},capture:async(a,s,f)=>{
  if(race||a.revision!==assignment.revision||s!==session||!enabled||(fix&&Date.parse(f.captured_at)<=Date.parse(fix.captured_at)))return false;
  fix={...f,revision:(fix?.revision??0)+1,enabled};return true;
 },stop:async(_a,s)=>{if(s!==session)return false;enabled=false;return true;},latest:async()=>fix};
 const service=createTrackingService(repository,()=>now),actor={profileId:id(3),role:"TRUCKER"};
 await assert.rejects(service.begin(actor,id(1),false),/permission/);
 await assert.rejects(service.begin({...actor,profileId:id(4)},id(1),true),/not available/);
 await assert.rejects(service.begin({...actor,role:"ADMIN"},id(1),true),/denied/);
 const first=await service.begin(actor,id(1),true);
 const input={session_id:first.session_id,latitude:10,longitude:123,accuracy_meters:3,captured_at:new Date(now).toISOString(),profile_id:id(4)};
 await service.capture(actor,id(1),input);assert.equal((await service.latest(actor,id(1))).stale,false);
 await assert.rejects(service.capture(actor,id(1),input),/newer capture/);
 await assert.rejects(service.latest({...actor,profileId:id(4)},id(1)),/not available/);
 assert.equal((await service.latest({...actor,role:"STAFF"},id(1))).assignment_id,id(1));
 const second=await service.begin(actor,id(1),true);assert.notEqual(second.session_id,first.session_id);
 assert.equal((await service.stop(actor,id(1),first.session_id)).stopped,false);
 now+=1000;race=true;await assert.rejects(service.capture(actor,id(1),{...input,session_id:second.session_id,captured_at:new Date(now).toISOString()}),/session changed/);
 race=false;now+=122000;assert.equal((await service.latest(actor,id(1))).stale,true);
 assignment.active=false;await assert.rejects(service.capture(actor,id(1),input),/not available/);
});

function routeRepository(){
 const rows=new Map<string,RouteSnapshot>(),leases=new Map<string,string>();
 const store:RouteRepository={
  read:async id=>({...rows.get(id)??{revision:0,fingerprint:null,calculatedAt:null,leaseUntil:null,retryAfter:null,route:null}}),
  claim:async(p,revision,token,until)=>{const old=rows.get(p.assignmentId)??{revision:0,fingerprint:null,calculatedAt:null,leaseUntil:null,retryAfter:null,route:null};if(old.revision!==revision||(old.leaseUntil??0)>Date.now())return false;rows.set(p.assignmentId,{...old,revision:revision+1,leaseUntil:until});leases.set(p.assignmentId,token);return true;},
  finish:async(p,token,fingerprint,route,at)=>{if(leases.get(p.assignmentId)!==token)return false;rows.set(p.assignmentId,{revision:(rows.get(p.assignmentId)?.revision??0)+1,fingerprint,route,calculatedAt:at,leaseUntil:null,retryAfter:null});return true;},
  fail:async(id,token,_code,retryAfter)=>{if(leases.get(id)!==token)return;rows.set(id,{...await store.read(id),leaseUntil:null,retryAfter});},
 };return store;
}
test("ten independently cached road routes bound provider concurrency, move pins without requests and refresh hourly",async()=>{
 let now=Date.now(),active=0,maximum=0,rateLimited=false;
 const provider=createMapboxDirections({token:()=>"synthetic-token",now:()=>now,concurrency:2,fetcher:(async url=>{
  const parsed=new URL(String(url));assert.equal(parsed.hostname,"api.mapbox.com");assert.equal(parsed.searchParams.get("geometries"),"geojson");assert.ok(parsed.pathname.includes("123,10;124,11;125,12"));
  active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;
  return rateLimited?new Response("rate limit",{status:429}):new Response(JSON.stringify({code:"Ok",routes:[{geometry:{type:"LineString",coordinates:[[123,10],[123.1,10.2],[124,11],[125,12]]},distance:1000,duration:120}]}));
 }) as typeof fetch});
 const store=routeRepository(),refresh=createRoadRouteService(store,provider,()=>now);
 const plans:AuthorizedRoutePlan[]=Array.from({length:10},(_,i)=>({assignmentId:id(i+10),assignmentRevision:"1",active:true,origin:{id:"truck",latitude:10,longitude:123},destinations:[{id:"stop-a",latitude:11,longitude:124},{id:"stop-b",latitude:12,longitude:125}]}));
 const results=await Promise.all(plans.map(refresh));assert.ok(results.every(r=>r.state==="UPDATED"));assert.equal(provider.metrics().requests,10);assert.equal(maximum,2);
 await Promise.all(plans.map(p=>refresh({...p,origin:{...p.origin!,latitude:10.1}})));assert.equal(provider.metrics().requests,10);
 now+=3600000;await Promise.all(plans.map(refresh));assert.equal(provider.metrics().requests,20);
 rateLimited=true;now+=3600000;const fallback=await refresh(plans[0]);assert.equal(fallback.state,"RETRY_PENDING");assert.ok(fallback.route);
 await refresh(plans[0]);assert.equal(provider.metrics().requests,21);
 const inactive=await refresh({...plans[1],active:false});assert.equal(inactive.state,"INACTIVE");assert.equal(provider.metrics().requests,21);
 console.log(JSON.stringify({mockedRouting:true,assignments:10,initialDirections:10,pinUpdateAdditionalRequests:0,hourlyAdditionalRequests:10,maxConcurrent:maximum,productionCalls:0}));
});
test("Directions rejects missing credentials, invalid geometry, token-bearing errors and rate limits safely",async()=>{
 const origin={id:"truck",latitude:10,longitude:123},stops=[{id:"stop",latitude:11,longitude:124}];
 let calls=0;const missing=createMapboxDirections({token:()=>undefined,fetcher:(async()=>{calls++;throw Error();}) as typeof fetch});
 await assert.rejects(missing.calculate(origin,stops),/configuration/);assert.equal(calls,0);
 for(const reply of [{code:"NoRoute",routes:[]},{code:"Ok",routes:[{geometry:{type:"LineString",coordinates:[[999,10],[124,11]]},distance:1,duration:1}]}]){
  const provider=createMapboxDirections({token:()=>"secret-not-for-logs",fetcher:(async()=>new Response(JSON.stringify(reply))) as typeof fetch});
  await assert.rejects(provider.calculate(origin,stops),error=>error instanceof Error&&!error.message.includes("secret-not-for-logs")&&error.message.includes("last valid route"));
 }
 const failing=createMapboxDirections({token:()=>"secret-not-for-logs",fetcher:(async()=>{throw Error("https://provider/?token=secret-not-for-logs");}) as typeof fetch});
 await assert.rejects(failing.calculate(origin,stops),error=>error instanceof Error&&!error.message.includes("secret-not-for-logs"));
});

test("Directions enforces its 30-request minute budget before calling the provider",async()=>{
 let now=1000,calls=0;
 const provider=createMapboxDirections({token:()=>"synthetic-token",now:()=>now,fetcher:(async()=>{
  calls++;return new Response(JSON.stringify({code:"Ok",routes:[{geometry:{type:"LineString",coordinates:[[123,10],[124,11]]},distance:1,duration:1}]}));
 }) as typeof fetch});
 const origin={id:"truck",latitude:10,longitude:123},stops=[{id:"stop",latitude:11,longitude:124}];
 for(let i=0;i<30;i++)await provider.calculate(origin,stops);
 await assert.rejects(provider.calculate(origin,stops),/budget reached/);assert.equal(calls,30);
 assert.equal(provider.metrics().active,0);
 now+=60000;await provider.calculate(origin,stops);assert.equal(calls,31);
});
test("independent route workers share a durable claim and reject a late result after destinations change",async()=>{
 const store=routeRepository();let calls=0,release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const directions={calculate:async()=>{calls++;await gate;return {geometry:{type:"LineString" as const,coordinates:[[123,10],[124,11]] as [number,number][]},distance_meters:1,duration_seconds:1};}};
 const plan={assignmentId:id(200),assignmentRevision:"1",active:true,origin:{id:"truck",latitude:10,longitude:123},destinations:[{id:"a",latitude:11,longitude:124}]};
 const first=createRoadRouteService(store,directions)(plan),second=createRoadRouteService(store,directions)(plan);
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1);release();
 const results=await Promise.all([first,second]);assert.ok(results.some(r=>r.state==="UPDATED"));assert.ok(results.some(r=>r.state==="LEASED"));
 const staleStore={...routeRepository(),finish:async()=>false};
 const stale=await createRoadRouteService(staleStore,directions)(plan);assert.equal(stale.state,"CHANGED");assert.equal(stale.route,null);
});
