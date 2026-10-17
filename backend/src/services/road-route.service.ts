import {randomUUID} from "node:crypto";
import {destinationFingerprint,planRoadRoute,type RoutePoint} from "./tracking.logic.js";
import type {RoadRoute} from "./mapbox-directions.service.js";

export type RouteSnapshot={revision:number;fingerprint:string|null;calculatedAt:number|null;leaseUntil:number|null;retryAfter:number|null;route:RoadRoute|null};
export type AuthorizedRoutePlan={assignmentId:string;assignmentRevision:string;active:boolean;origin:RoutePoint|null;destinations:RoutePoint[]};
/** Durable implementation must CAS leases/finalization and recheck assignment/
 * destination identity inside its transaction. No in-memory production fallback. */
export interface RouteRepository{
 read(assignmentId:string):Promise<RouteSnapshot>;
 claim(plan:AuthorizedRoutePlan,revision:number,token:string,until:number):Promise<boolean>;
 finish(plan:AuthorizedRoutePlan,token:string,fingerprint:string,route:RoadRoute,at:number):Promise<boolean>;
 fail(assignmentId:string,token:string,code:string,retryAfter:number):Promise<void>;
}
export function createRoadRouteService(repository:RouteRepository,directions:{calculate(origin:RoutePoint,stops:RoutePoint[]):Promise<RoadRoute>},now=Date.now){
 return async function refresh(plan:AuthorizedRoutePlan){
  // Caller must resolve this plan from authorized physical records, never body labels.
  const snapshot=await repository.read(plan.assignmentId);
  if(!plan.active||!plan.origin||!plan.destinations.length)return {route:snapshot.route,state:!plan.active?"INACTIVE":"NO_COORDINATES"};
  const fingerprint=destinationFingerprint(plan.assignmentId,plan.destinations,plan.assignmentRevision);
  const decision=planRoadRoute({active:plan.active,hasPosition:true,fingerprint,cachedFingerprint:snapshot.fingerprint,calculatedAt:snapshot.route?snapshot.calculatedAt:null,leaseUntil:snapshot.leaseUntil,retryAfter:snapshot.retryAfter},now());
  if(!decision.fetch)return {route:snapshot.route,state:decision.reason};
  const token=randomUUID();
  if(!await repository.claim(plan,snapshot.revision,token,now()+60000))return {route:snapshot.route,state:"LEASED"};
  try{
   const route=await directions.calculate(plan.origin,plan.destinations);
   if(!await repository.finish(plan,token,fingerprint,route,now())){await repository.fail(plan.assignmentId,token,"ROUTE_CONTEXT_CHANGED",now());return {route:null,state:"CHANGED"};}
   return {route,state:"UPDATED"};
  }catch(error){
   const code=error&&typeof error==="object"&&"code" in error?String(error.code):"ROUTE_UNAVAILABLE";
   await repository.fail(plan.assignmentId,token,code,now()+(code==="ROUTE_RATE_LIMITED"?300000:60000));
   return {route:snapshot.route,state:"RETRY_PENDING"};
  }
 };
}
