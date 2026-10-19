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

test("versionless Loading and Offload item saves notify conflicts only after successful persistence",()=>{
 const events:Commit[]=[];const receive=(event:Commit)=>events.push(event);collaborationEvents.on("commit",receive);
 const trip="123e4567-e89b-42d3-a456-000000000010",id="123e4567-e89b-42d3-a456-000000000012";
 const response=(path:string,body:unknown,data:unknown,status=200)=>{
  const res=Object.assign(new EventEmitter(),{statusCode:status,json:(value:unknown)=>value});
  collaborationResponseMiddleware({method:"PATCH",originalUrl:path,user:{id:"trusted"},body} as never,res as never,()=>{});res.json({success:true,data});return res;
 };
 try{
  const loading=response(`/api/reports/operations/loading/${trip}/reports/${id}`,{loading_start_at:"timestamp",service_key:"never broadcast"},{id,trip_id:trip});assert.equal(events.length,0);loading.emit("finish");
  assert.equal(events.length,1);assert.equal(events[0].draftOnly,true);assert.deepEqual(events[0].fields,["loading_start_at"]);assert.equal(events[0].version,null);
  response(`/api/reports/operations/offloads/${id}`,{item:{id:"item",quantity:10,total_cbm:3,secret:"no"}},{report:{id,trip_id:trip},item:{id:"item"}}).emit("finish");
  assert.equal(events.length,3);assert.deepEqual(events[1].fields,["quantity","total_cbm"]);assert.equal(events[2].source,"offloads");assert.deepEqual(events[2].fields,["item.quantity","item.total_cbm"]);
  response(`/api/reports/operations/loading/${trip}/reports/${id}`,{loading_start_at:"bad"},{id,trip_id:trip},500).emit("finish");assert.equal(events.length,3);
  assert.ok(!JSON.stringify(events).includes("never broadcast"));assert.ok(!JSON.stringify(events).includes("timestamp"));
 }finally{collaborationEvents.off("commit",receive);}
});
