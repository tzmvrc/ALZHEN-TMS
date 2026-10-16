import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { SOURCE_FIELDS,validVersion,type Commit } from "./collaboration.logic.js";
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
  if(req.method==="PATCH"&&body?.success&&body.data?.id&&req.user){
   for(const [pattern,source] of paths){const match=requestPath.match(pattern);if(!match||body.data.id!==match[1])continue;
    const record=body.data,version=validVersion(record.collaboration_version);
    const event:Commit={source,recordId:record.id,version,operation:"UPDATE",actorId:req.user.id,fields:Object.keys(req.body??{}).filter(key=>SOURCE_FIELDS[source].includes(key)),eventId:version===null?randomUUID():`${source}:${record.id}:${version}`,
     tripId:source==="trips"?record.id:record.trip_id,stopId:source==="trip_stops"?record.id:record.trip_stop_id};
    res.once("finish",()=>{if(res.statusCode>=200&&res.statusCode<300)collaborationEvents.emit("commit",event);});break;
   }
  }
  return original(body);
 };next();
};
