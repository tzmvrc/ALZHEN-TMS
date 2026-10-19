// Isolated in-memory transport fixture. Never connects to production Supabase.
import {createServer} from "node:http";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";
process.env.SUPABASE_ANON_KEY="isolated-test";
async function main(){
const {attachCollaborationServer}=await import("../../src/services/collaboration-server.js");
const {collaborationEvents}=await import("../../src/services/collaboration-events.js");
const {validateDesignPatch,mergeDesign}=await import("../../src/services/table-design.logic.js");
const layouts=new Map<string,{table_key:string;column_key:string;revision:number;width_px:number;design:Record<string,unknown>}>();
let deletionFixtureRun=0;
const trip="123e4567-e89b-42d3-a456-000000000010",stop="123e4567-e89b-42d3-a456-000000000012";
let record={id:stop,trip_id:trip,dispatch_number:"DSP-2",collaboration_version:0};
const http=createServer(async(req,res)=>{
 res.setHeader("Access-Control-Allow-Origin","http://localhost:5173");
 res.setHeader("Content-Type","application/json");
 if(req.method==="POST"&&req.url==="/layout-reset"){layouts.clear();res.end(JSON.stringify({ok:true}));return;}
 if(req.method==="GET"&&req.url?.startsWith("/layout?")){const table=new URL(req.url,"http://fixture").searchParams.get("table");res.end(JSON.stringify([...layouts.values()].filter(row=>row.table_key===table)));return;}
 if(req.method==="POST"&&req.url==="/layout"){
  let input="";for await(const part of req){input+=part;if(input.length>262144){res.writeHead(413).end();return;}}
  const body=JSON.parse(input),key=`${body.table}:${body.column}`,old=layouts.get(key);
  if((old?.revision??0)!==body.expected_revision){res.writeHead(409).end(JSON.stringify({error:"fixture conflict"}));return;}
  const row={table_key:body.table,column_key:body.column,revision:(old?.revision??0)+1,width_px:old?.width_px??body.initial_width_px,design:mergeDesign(old?.design??{},validateDesignPatch(body.patch))};layouts.set(key,row);res.end(JSON.stringify(row));collaborationEvents.emit("layout",{table:row.table_key,column:row.column_key,revision:row.revision,eventId:`layout:${row.table_key}:${row.column_key}:${row.revision}`});return;
 }
 if(req.method==="GET"&&req.url==="/record"){res.end(JSON.stringify(record));return;}
 if(req.method==="POST"&&req.url==="/trip-deleted"){
  // Browser runs recreate independent synthetic data with the same fixture UUID.
  // Give those separate test operations distinct identities; production dedup
  // remains intact and production trips still use their stable deletion ID.
  collaborationEvents.emit("commit",{source:"trips",recordId:trip,tripId:trip,operation:"DELETE",version:null,fields:[],actorId:"fixture-admin",eventId:`fixture:${++deletionFixtureRun}:trips:${trip}:deleted`});
  res.end(JSON.stringify({ok:true}));return;
 }
 if(req.method==="POST"&&(req.url==="/drop-staff"||req.url==="/disconnect-staff")){
  for(const socket of service.io.of("/").sockets.values())if(socket.data.actor.id==="fixture-staff"){if(req.url==="/disconnect-staff")socket.disconnect(true);else socket.conn.close();}
  res.end(JSON.stringify({ok:true}));return;
 }
 if(req.method==="POST"&&req.url==="/commit"){
  let input="";for await(const part of req){input+=part;if(input.length>1000){res.writeHead(413).end();return;}}
  const body=JSON.parse(input);if(!["admin","staff"].includes(body.actor)||typeof body.value!=="string"||body.value.length>100){res.writeHead(400).end();return;}
  record={...record,dispatch_number:body.value,collaboration_version:record.collaboration_version+1};
  res.end(JSON.stringify(record));
  service.publish({eventId:`trip_stops:${stop}:${record.collaboration_version}`,source:"trip_stops",recordId:stop,tripId:trip,stopId:stop,fields:["dispatch_number"],version:record.collaboration_version,actorId:`fixture-${body.actor}`});return;
 }
 res.writeHead(404).end();
});
const service=await attachCollaborationServer(http,{bridge:false,authenticate:async(token,session)=>{
 if(!["admin","admin-refresh","staff"].includes(String(token))||session!=="fixture-session")throw Error("Denied");
 const identity=token==="admin-refresh"?"admin":token;
 return {id:`fixture-${identity}`,role:identity==="admin"?"ADMIN":"STAFF",name:identity==="admin"?"Fixture Admin":"Fixture Staff",expiresAt:Date.now()+3600000};
},canTrip:async()=>true,authorizeCell:async cell=>{if(cell.recordId!==stop||cell.tripId!==trip)throw Error("Wrong fixture record");},authorizeDraft:async cell=>{
 if(cell.tripId!==trip)throw Error("Wrong fixture trip");
 if(cell.source==="trip_stops"&&cell.recordId===stop&&cell.stopId===stop)return;
 if(cell.source==="flex_columns"&&cell.recordId==="123e4567-e89b-42d3-a456-000000000014"&&cell.stopId===stop)return;
 throw Error("Wrong fixture cell");
}});
http.listen(5199,"127.0.0.1",()=>console.log("Isolated collaboration fixture ready:5199"));
process.on("SIGTERM",()=>void service.close());
}
void main();
