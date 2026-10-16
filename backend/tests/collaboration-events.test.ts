import assert from "node:assert/strict";
import test from "node:test";
import {EventEmitter} from "node:events";
import {collaborationEvents,collaborationResponseMiddleware} from "../src/services/collaboration-events.js";
import {parseCellTarget,type Commit} from "../src/services/collaboration.logic.js";

test("commit observer waits for successful physical response finish and excludes draft/secret fields",()=>{
 const events:Commit[]=[];const receive=(event:Commit)=>events.push(event);collaborationEvents.on("commit",receive);
 const id="123e4567-e89b-42d3-a456-000000000012";
 const response=(status:number,body:unknown)=>{
  const res=Object.assign(new EventEmitter(),{statusCode:status,json:(value:unknown)=>value});
  const req={method:"PATCH",originalUrl:`/api/trips/123e4567-e89b-42d3-a456-000000000010/stops/${id}?fixture=true`,path:`/stops/${id}`,user:{id:"server-user"},body:{dispatch_number:"saved",draft:"private",service_key:"secret"}};
  collaborationResponseMiddleware(req as never,res as never,()=>{});res.json(body);return res;
 };
 try{
  const res=response(200,{success:true,data:{id,trip_id:"trip",collaboration_version:2,dispatch_number:"saved"}});
  assert.equal(events.length,0);res.emit("finish");assert.equal(events.length,1);
  assert.deepEqual(events[0].fields,["dispatch_number"]);assert.equal(events[0].actorId,"server-user");assert.equal(events[0].version,2);
  assert.equal(Object.hasOwn(events[0],"dispatch_number"),false);
  response(500,{success:true,data:{id}}).emit("finish");
  response(200,{success:false,data:{id}}).emit("finish");
  response(200,{success:true,data:{id:"wrong-record"}}).emit("finish");assert.equal(events.length,1);
  assert.throws(()=>parseCellTarget({table:"trips",source:"constructor",recordId:id,field:"name",status:"editing"}),/Invalid cell/);
 }finally{collaborationEvents.off("commit",receive);}
});
