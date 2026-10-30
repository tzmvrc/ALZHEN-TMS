import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { SOURCE_FIELDS,validVersion,type Commit } from "./collaboration.logic.js";
import { DRAFT_EXTRA_FIELDS } from "./cell-draft.logic.js";
export const collaborationEvents=new EventEmitter();
let versionsReady=false;
export function setCollaborationVersionsReady(value:boolean){versionsReady=value;}
export function collaborationSelect<T extends string>(fields:T):T|`${T}, collaboration_version`{return versionsReady?`${fields}, collaboration_version`:fields;}
const paths:Array<[RegExp,string]>=[
 [/^\/api\/trips\/([0-9a-f-]+)$/i,"trips"],
 [/^\/api\/trips\/[0-9a-f-]+\/stops\/([0-9a-f-]+)$/i,"trip_stops"],
 [/^\/api\/trips\/[0-9a-f-]+\/(?:stops\/[0-9a-f-]+\/)?line-items\/([0-9a-f-]+)$/i,"trip_line_items"],
 [/^\/api\/trips\/[0-9a-f-]+\/assignments\/([0-9a-f-]+)$/i,"trip_truck_assignments"],
 [/^\/api\/trips\/[0-9a-f-]+\/billings\/([0-9a-f-]+)$/i,"billings"],
 [/^\/api\/store-calls\/([0-9a-f-]+)$/i,"store_calls"],
];
/** Observe only confirmed protected API responses. Sockets never perform writes. */
export const collaborationResponseMiddleware:RequestHandler=(req,res,next)=>{
 // Mounted routers trim req.url/req.path before controllers call res.json.
 const requestPath=(req.originalUrl??req.path).split("?")[0];
 const original=res.json.bind(res);
 res.json=(body)=>{
  const layout=requestPath.match(/^\/api\/table-layouts\/([^/]+)\/(?:design\/)?([^/]+)$/);
  if(req.method==="PATCH"&&layout&&body?.success&&body.data?.table_key&&req.user){
   const row=body.data;
   const event={table:row.table_key,column:row.column_key,revision:row.revision,actorId:req.user.id,eventId:`layout:${row.table_key}:${row.column_key}:${row.revision}`};
   res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300)collaborationEvents.emit("layout",event);});
  }
  if(req.method==="DELETE"&&body?.success&&body.data?.id&&req.user){
   const match=requestPath.match(/^\/api\/trips\/([0-9a-f-]+)\/stops\/([0-9a-f-]+)\/line-items\/([0-9a-f-]+)$/i);
   if(match&&body.data.id===match[3]){
    const event:Commit={source:"trip_line_items",recordId:body.data.id,operation:"DELETE",version:null,actorId:req.user.id,eventId:`trip_line_items:${body.data.id}:deleted`,fields:[],tripId:match[1],stopId:match[2]};
    res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300){console.info("Operational line item deletion",{actorId:event.actorId,tripId:event.tripId,stopId:event.stopId,lineItemId:event.recordId,eventId:event.eventId});collaborationEvents.emit("commit",event);}});
   }
  }
  if(req.method==="PATCH"&&body?.success&&body.data?.id&&req.user){
   for(const [pattern,source] of paths){const match=requestPath.match(pattern);if(!match||body.data.id!==match[1])continue;
    const record=body.data,version=validVersion(record.collaboration_version);
    const event:Commit={source,recordId:record.id,version,operation:"UPDATE",actorId:req.user.id,fields:Object.keys(req.body??{}).filter(key=>SOURCE_FIELDS[source].includes(key)),eventId:version===null?randomUUID():`${source}:${record.id}:${version}`,
     tripId:source==="trips"?record.id:record.trip_id,stopId:source==="trip_stops"?record.id:record.trip_stop_id};
    res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300)collaborationEvents.emit("commit",event);});break;
   }
  }
  if(["PATCH","PUT"].includes(req.method)&&body?.success&&req.user){
   const loading=requestPath.match(/^\/api\/reports\/operations\/loading\/([0-9a-f-]+)\/reports\/([0-9a-f-]+)$/i);
   if(loading&&body.data?.id===loading[2]&&body.data?.trip_id===loading[1]){
    const notice:Commit={source:"loading_reports",recordId:body.data.id,tripId:body.data.trip_id,fields:Object.keys(req.body??{}).filter(field=>DRAFT_EXTRA_FIELDS.loading_reports!.includes(field)),version:null,actorId:req.user.id,eventId:randomUUID(),draftOnly:true};
    res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300&&notice.fields.length)collaborationEvents.emit("commit",notice);});
   }
   const unloading=requestPath.match(/^\/api\/reports\/operations\/unloading\/([0-9a-f-]+)\/stops\/([0-9a-f-]+)$/i);
   if(unloading&&body.data?.stop?.id===unloading[2]&&body.data.stop.trip_id===unloading[1]){
    const notice:Commit={source:"trip_stops",recordId:body.data.stop.id,tripId:body.data.stop.trip_id,stopId:body.data.stop.id,fields:Object.keys(req.body??{}).filter(field=>["arrival_time","start_unloading_time","finish_unloading_time"].includes(field)),version:null,actorId:req.user.id,eventId:randomUUID(),draftOnly:true};
    res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300&&notice.fields.length)collaborationEvents.emit("commit",notice);});
   }
   const match=requestPath.match(/^\/api\/reports\/operations\/(offloads|backloads)\/([0-9a-f-]+)$/i);
   if(match){const source=match[1]!.toLowerCase(),record=body.data?.report??body.data;
    if(record?.id===match[2]){const fields=Object.keys(req.body??{}).filter(field=>DRAFT_EXTRA_FIELDS[source]?.includes(field));
     const item=body.data?.item;const notice:Commit=item?{source:"offload_items",recordId:item.id,fields:Object.keys(req.body?.item??{}).filter(field=>["quantity","total_cbm"].includes(field)),version:null,actorId:req.user.id,eventId:randomUUID(),draftOnly:true,tripId:record.trip_id,stopId:record.trip_stop_id}:{source,recordId:record.id,fields,version:null,actorId:req.user.id,eventId:randomUUID(),draftOnly:true,tripId:record.trip_id,stopId:record.trip_stop_id};
     res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300&&notice.fields.length)collaborationEvents.emit("commit",notice);});
     if(item&&source==="offloads"){
      const bound={...notice,source:"offloads",recordId:record.id,fields:notice.fields.map(field=>`item.${field}`),eventId:randomUUID()};
      res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300&&bound.fields.length)collaborationEvents.emit("commit",bound);});
     }
    }
   }
  }
  return original(body);
 };next();
};
