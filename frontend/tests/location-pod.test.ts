import test from "node:test";
import assert from "node:assert/strict";
import {validatePodUpload} from "../src/services/pod-upload-validation.ts";
import {createLocationCapture,locationIsStale} from "../src/services/location-capture.ts";

test("POD client intake enforces private rollout boundary, MIME and unchanged 5 MB cap",()=>{
 assert.throws(()=>validatePodUpload({name:"receipt.pdf",size:50,type:"application/pdf"}),/not activated/);
 validatePodUpload({name:"receipt.pdf",size:50,type:"application/pdf"},true);
 validatePodUpload({name:"receipt.png",size:50,type:"image/png"});
 for(const patch of [{size:0},{size:5242881},{type:"image/svg+xml"},{name:"bad\nname.png"}])assert.throws(()=>validatePodUpload({name:"receipt.png",size:50,type:"image/png",...patch}));
});

test("GPS coalesces throttled fixes, retries network failure, rejects invalid/order violations and cancels timers",async()=>{
 let now=Date.now(),callback:PositionCallback=()=>{},sends=0,offline=false,clears=0,stops=0;
 const timers=new Map<number,()=>void>();let timerId=0;
 const states:string[]=[],sent:number[]=[];
 const position=(latitude=10,time=now)=>({timestamp:time,coords:{latitude,longitude:123,accuracy:4}} as GeolocationPosition);
 const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
 const tick=async()=>{const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());await flush();};
 const capture=createLocationCapture({now:()=>now,onState:s=>states.push(s),schedule:fn=>{timers.set(++timerId,fn);return timerId as unknown as ReturnType<typeof setTimeout>;},cancelScheduled:id=>{timers.delete(id as unknown as number);},geolocation:{getCurrentPosition:fn=>fn(position()),watchPosition:fn=>{callback=fn;return 1;},clearWatch:()=>{clears++;}},api:{begin:async()=>({session_id:"fixture"}),send:async(_s,fix)=>{sends++;sent.push(fix.latitude);if(offline)throw Error("offline");},stop:async()=>{stops++;}}});
 await capture.start();await flush();assert.equal(sends,1);
 now+=1000;callback(position(11));now+=1000;callback(position(12));callback(position(999,now+1));callback(position(13,now-500));
 assert.equal(sends,1);assert.equal(timers.size,1);now+=28000;await tick();assert.deepEqual(sent,[10,12]);
 offline=true;now+=30000;callback(position(14));await flush();assert.equal(states.at(-1),"LOCATION_NOT_SAVED");
 offline=false;now+=30000;await tick();assert.equal(states.at(-1),"SHARING");assert.deepEqual(sent,[10,12,14,14]);
 now+=1000;callback(position(15));assert.equal(timers.size,1);await capture.stop();assert.equal(timers.size,0);assert.equal(clears,1);assert.equal(stops,1);
 callback(position(16));await tick();assert.equal(sends,4);
});

test("invalid initial GPS never begins a session and watch setup failure stops the created session",async()=>{
 let begins=0,stops=0,sends=0;const states:string[]=[];
 for(const invalid of [true,false]){
  const capture=createLocationCapture({onState:s=>states.push(s),geolocation:{getCurrentPosition:fn=>fn({timestamp:Date.now(),coords:{latitude:invalid?NaN:10,longitude:123,accuracy:1}} as GeolocationPosition),watchPosition:()=>{throw Error("watch unavailable");},clearWatch:()=>{}},api:{begin:async()=>{begins++;return {session_id:"fixture"};},send:async()=>{sends++;},stop:async()=>{stops++;}}});
  await capture.start();
 }
 assert.equal(begins,1);assert.equal(stops,1);assert.equal(sends,0);assert.equal(states.at(-1),"TRACKING_UNAVAILABLE");
});

test("failed STOP retains only its session for explicit retry and prevents silently starting another",async()=>{
 let begins=0,stops=0,fail=true;const states:string[]=[],sessions:string[]=[];
 const capture=createLocationCapture({onState:s=>states.push(s),geolocation:{getCurrentPosition:fn=>fn({timestamp:Date.now(),coords:{latitude:10,longitude:123,accuracy:4}} as GeolocationPosition),watchPosition:()=>1,clearWatch:()=>{}},api:{begin:async()=>{begins++;return {session_id:"owned-session"};},send:async()=>{},stop:async s=>{sessions.push(s);stops++;if(fail)throw Error("offline");}}});
 await capture.start();assert.equal(begins,1);assert.equal(await capture.stop(),false);assert.equal(states.at(-1),"STOP_CONFIRMATION_PENDING");
 await capture.start();assert.equal(begins,1);assert.equal(stops,2);
 fail=false;assert.equal(await capture.stop(),true);assert.equal(states.at(-1),"STOPPED");assert.deepEqual(sessions,["owned-session","owned-session","owned-session"]);
});
test("GPS asks permission only on explicit start, throttles, stops watches and never resumes after logout",async()=>{
 let now=Date.now(),permissionCalls=0,watchCalls=0,clears=0,sends=0,stops=0,denied=false;
 let callback:PositionCallback=()=>{},errorCallback:PositionErrorCallback=()=>{};
 const position=()=>({timestamp:now,coords:{latitude:10,longitude:123,accuracy:4}} as GeolocationPosition);
 const states:string[]=[];
 const geolocation={getCurrentPosition:(success:PositionCallback,error?:PositionErrorCallback|null)=>{permissionCalls++;if(denied)error?.({code:1} as GeolocationPositionError);else success(position());},watchPosition:(success:PositionCallback,error?:PositionErrorCallback|null)=>{watchCalls++;callback=success;errorCallback=error!;return watchCalls;},clearWatch:()=>{clears++;}};
 const capture=createLocationCapture({geolocation,now:()=>now,onState:s=>states.push(s),api:{begin:async()=>({session_id:"test-session"}),send:async()=>{sends++;},stop:async()=>{stops++;}}});
 assert.equal(permissionCalls,0);await capture.start();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(permissionCalls,1);assert.equal(sends,1);
 for(let i=0;i<10;i++){now+=1000;callback(position());}assert.equal(sends,1);
 now+=30000;callback(position());await new Promise(resolve=>setTimeout(resolve,0));assert.equal(sends,2);
 await capture.stop();callback(position());assert.equal(sends,2);assert.equal(clears,1);assert.equal(stops,1);
 denied=true;await capture.start();assert.equal(watchCalls,1);assert.equal(states.at(-1),"PERMISSION_OR_LOCATION_UNAVAILABLE");
 errorCallback({code:2} as GeolocationPositionError);assert.equal(watchCalls,1);
 assert.equal(locationIsStale(new Date(now-121000).toISOString(),now),true);assert.equal(locationIsStale(new Date(now).toISOString(),now),false);
});
test("stopping while browser permission is pending never starts a tracking session",async()=>{
 let grant:PositionCallback=()=>{},begins=0;
 const capture=createLocationCapture({geolocation:{getCurrentPosition:fn=>{grant=fn;},watchPosition:()=>{throw Error("must not watch");},clearWatch:()=>{}},onState:()=>{},api:{begin:async()=>{begins++;return {session_id:"x"};},send:async()=>{},stop:async()=>{}}});
 const pending=capture.start();await new Promise(resolve=>setTimeout(resolve,0));await capture.stop();grant({timestamp:Date.now(),coords:{latitude:10,longitude:123,accuracy:1}} as GeolocationPosition);await pending;assert.equal(begins,0);
});
test("overlapping explicit starts create one watch and close a session returned after logout",async()=>{
 let watches=0,begins=0,stopCalls=0,finishBegin:(value:{session_id:string})=>void=()=>{};
 const position={timestamp:Date.now(),coords:{latitude:10,longitude:123,accuracy:1}} as GeolocationPosition;
 const capture=createLocationCapture({geolocation:{getCurrentPosition:fn=>fn(position),watchPosition:()=>{watches++;return 1;},clearWatch:()=>{}},onState:()=>{},api:{begin:()=>{begins++;return new Promise(resolve=>{finishBegin=resolve;});},send:async()=>{},stop:async()=>{stopCalls++;}}});
 const first=capture.start(),second=capture.start();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(begins,1);
 await capture.stop();finishBegin({session_id:"late-session"});await Promise.all([first,second]);assert.equal(watches,0);assert.equal(stopCalls,1);
});
