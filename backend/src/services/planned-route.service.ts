import {ApiError} from "../utils/api-response.js";
import {destinationFingerprint,type RoutePoint} from "./tracking.logic.js";
import {createRoadRouteService,type RouteRepository,type AuthorizedRoutePlan} from "./road-route.service.js";
import type {RoadRoute} from "./mapbox-directions.service.js";

export type PlannedContext={id:string;tripId:string;active:boolean;context_token:string;origin:RoutePoint|null;destinations:Array<RoutePoint&{stopSequence?:number|null}>};
const valid=(point:RoutePoint|null)=>point&&typeof point.latitude==="number"&&Number.isFinite(point.latitude)&&Math.abs(point.latitude)<=90&&typeof point.longitude==="number"&&Number.isFinite(point.longitude)&&Math.abs(point.longitude)<=180;
export function plannedRoutePlan(context:PlannedContext):AuthorizedRoutePlan{
 if(!context.active)throw new ApiError("This trip assignment is no longer eligible for planned routing.",409,"PLANNED_ASSIGNMENT_INACTIVE");
 if(!valid(context.origin))throw new ApiError("Verify warehouse coordinates before generating this route.",422,"PLANNED_WAREHOUSE_COORDINATES");
 if(!context.destinations.length)throw new ApiError("This trip has no active delivery stops.",422,"PLANNED_NO_STOPS");
 if(context.destinations.length>24)throw new ApiError("This trip exceeds 24 delivery stops plus the warehouse. No stops were omitted; split-route support requires review.",422,"PLANNED_WAYPOINT_LIMIT");
 const destinations=[...context.destinations].sort((a,b)=>(a.stopSequence??Infinity)-(b.stopSequence??Infinity)||a.id.localeCompare(b.id));
 if(destinations.some(p=>!valid(p)))throw new ApiError("Verify coordinates for every delivery stop before generating this route.",422,"PLANNED_STOP_COORDINATES");
 if(new Set(destinations.map(p=>p.id)).size!==destinations.length)throw new ApiError("Duplicate physical stop identity requires review.",409,"PLANNED_STOP_IDENTITY");
 const plan={assignmentId:context.id,assignmentRevision:context.context_token,active:true,origin:context.origin!,destinations};
 destinationFingerprint(plan.assignmentId,destinations,plan.assignmentRevision);return plan;
}
export function createPlannedRouteService(options:{enabled?:()=>boolean;resolve:(id:string)=>Promise<PlannedContext|null>;repository:RouteRepository;directions:{calculate(origin:RoutePoint,stops:RoutePoint[]):Promise<RoadRoute>};now?:()=>number}){
 const refresh=createRoadRouteService(options.repository,options.directions,options.now),pending=new Map<string,ReturnType<typeof refresh>>();
 return async(actor:{id:string;role:string},assignmentId:string)=>{
  if(!["ADMIN","STAFF"].includes(actor.role))throw new ApiError("Management routing access required.",403,"PLANNED_FORBIDDEN");
  if(!options.enabled?.())throw new ApiError("Planned route generation is disabled pending migration and provider approval.",503,"PLANNED_DISABLED");
  const context=await options.resolve(assignmentId);if(!context||context.id!==assignmentId)throw new ApiError("Trip assignment not found.",404,"PLANNED_ASSIGNMENT_MISSING");
  const plan=plannedRoutePlan(context),key=`${plan.assignmentId}:${plan.assignmentRevision}`;
  const existing=pending.get(key);if(existing)return existing;
  if(pending.size>=32)throw new ApiError("Planned routing queue is busy.",503,"ROUTE_BUSY");
  const result=refresh(plan);pending.set(key,result);
  try{return await result;}finally{if(pending.get(key)===result)pending.delete(key);}
 };
}
