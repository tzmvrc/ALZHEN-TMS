import assert from "node:assert/strict";
import test from "node:test";
import {rememberConfirmedVersion,readCommittedRecord,type Commit} from "../src/services/collaboration.service.ts";

test("server versions reject late saves and late refreshes without using client timestamps",()=>{
 assert.equal(rememberConfirmedVersion("trip_stops","fixture-stop",2),true);
 assert.equal(rememberConfirmedVersion("trip_stops","fixture-stop",1),false);
 assert.equal(rememberConfirmedVersion("trip_stops","fixture-stop",2),true);
 assert.equal(rememberConfirmedVersion("trip_stops","fixture-sibling",1),true);
 assert.equal(rememberConfirmedVersion("trips","fixture-stop",1),true);
 assert.equal(rememberConfirmedVersion("trip_stops","fixture-stop",3),true);
 assert.equal(rememberConfirmedVersion("trip_stops","fixture-stop",2),false);
});

test("overlapping committed signals share one protected canonical read and failed reads retry",async()=>{
 const original=globalThis.fetch;let requests=0,fail=false;
 globalThis.fetch=async(input,init)=>{requests++;assert.match(String(input),/\/realtime\/records\/trip_stops\/fixture-request$/);assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer fixture-only");await new Promise(resolve=>setTimeout(resolve,10));return new Response(JSON.stringify(fail?{success:false,message:"fixture failed"}:{success:true,data:{id:"fixture-request",dispatch_number:"confirmed",collaboration_version:2}}),{status:fail?503:200,headers:{"Content-Type":"application/json"}});};
 const commit:Commit={source:"trip_stops",recordId:"fixture-request",version:2,eventId:"fixture-request:2",actorId:"fixture",fields:["dispatch_number"]};
 try{
  const first=readCommittedRecord("fixture-only",commit),second=readCommittedRecord("fixture-only",{...commit,fields:[],actorId:null});
  assert.equal(first,second);assert.equal((await first).dispatch_number,"confirmed");assert.equal(requests,1);
  fail=true;await assert.rejects(readCommittedRecord("fixture-only",commit));fail=false;
  assert.equal((await readCommittedRecord("fixture-only",commit)).collaboration_version,2);assert.equal(requests,3);
 }finally{globalThis.fetch=original;}
});
