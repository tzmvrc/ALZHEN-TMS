import {apiGetCached,type ApiResponse} from "./api.service";
export type Point={latitude:number;longitude:number};
export type RoadGeometry={type:"LineString";coordinates:[number,number][]};
export type RoadMode="planned"|"remaining";
export type RoadCache={mode:RoadMode;matchesContext:boolean;geometry:RoadGeometry|null;calculatedAt:string|null;expiresAt?:string|null;distanceMeters:number|null;durationSeconds:number|null;error:string|null};
export type RoadTrip={tripStatus?:string;estimatedDeliveryDate?:string|null;driverId?:string|null;demonstration?:boolean;key:string;assignmentId:string|null;tripId:string;dispatchNumber:string|null;plateNumber:string|null;driverName:string|null;warehouse:{id:string|null;name:string;point:Point|null};stops:Array<{id:string;sequence:number;stopSequence:number|null;status:string;name:string;point:Point|null}>;position:(Point&{capturedAt:string;accuracyMeters:number;simulated?:boolean})|null;cache:RoadCache|null;plannedCache?:RoadCache|null};
export const validPoint=(p:Point|null|undefined):p is Point=>!!p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
export function validRoadGeometry(g:RoadGeometry|null|undefined):g is RoadGeometry{return !!g&&g.type==="LineString"&&Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.length<=20000&&g.coordinates.every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Math.abs(p[0])<=180&&Number.isFinite(p[1])&&Math.abs(p[1])<=90);}
export function roadView(row:RoadTrip,mode:RoadMode,now=Date.now()){
 const ordered=[...row.stops].sort((a,b)=>(a.stopSequence??Infinity)-(b.stopSequence??Infinity)||a.id.localeCompare(b.id));
 const seen=new Set<string>();let duplicate=false;
 const stops=ordered.filter(s=>{if(seen.has(s.id)){duplicate=true;return false;}seen.add(s.id);return mode==="planned"||!["COMPLETED","DELIVERED","CANCELLED"].includes(s.status.toUpperCase());});
 const origin=mode==="planned"?row.warehouse.point:row.position;
 const missing=duplicate?"Duplicate stop identity requires review":!stops.length?"No remaining destinations":!validPoint(origin)?mode==="planned"?"Warehouse coordinates missing":"No authorized truck position":stops.some(s=>!validPoint(s.point))?"Delivery-stop coordinates missing":null;
 const cache=mode==="planned"?(row.plannedCache??row.cache):row.cache,compatible=cache?.mode===mode&&cache.matchesContext;
 const geometry=!missing&&compatible&&validRoadGeometry(cache?.geometry)?cache.geometry:null;
 const stale=!!geometry&&(!cache?.calculatedAt||!Number.isFinite(Date.parse(cache.calculatedAt))||now-Date.parse(cache.calculatedAt)>=3600000||(cache.expiresAt!==undefined&&(!cache.expiresAt||!Number.isFinite(Date.parse(cache.expiresAt))||now>=Date.parse(cache.expiresAt)))||!!cache.error);
 const status=missing??(!compatible?(cache?.mode===mode?"Route inputs changed — cached road withheld":"No cached road route for this mode"):!geometry?"Road geometry unavailable":cache?.error?cache.error:stale?"Cached route is stale":"Cached road route");
 return {stops,origin:validPoint(origin)?origin:null,cache:compatible?cache:null,geometry,stale,status,positionStale:!!row.position&&(!Number.isFinite(Date.parse(row.position.capturedAt))||now-Date.parse(row.position.capturedAt)>120000)};
}
export function roadDisplayView(row:RoadTrip,mode:RoadMode|"auto",now=Date.now()){
 if(mode!=="auto")return roadView(row,mode,now);
 const planned=roadView(row,"planned",now),remaining=roadView(row,"remaining",now);
 return planned.geometry?planned:remaining.geometry?remaining:planned;
}
export function roadEndpoint(ids:string[],contextAssignment?:string|null){return `/tracking/roads?trip_ids=${encodeURIComponent([...new Set(ids)].sort().join(","))}${contextAssignment===undefined?'':`&context_assignment=${encodeURIComponent(contextAssignment??'none')}`}`;}
export async function fetchRoadTrips(token:string,ids:string[],contextAssignment?:string|null){
 if(!ids.length)return [];
 const result=await apiGetCached<ApiResponse<{rows:RoadTrip[]}>>(roadEndpoint(ids,contextAssignment),token,15000);
 if(!result.success||!result.data)throw Error("Road routing could not be loaded");return result.data.rows;
}
