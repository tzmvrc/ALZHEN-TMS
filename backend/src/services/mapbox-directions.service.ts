import {ApiError} from "../utils/api-response.js";
import {destinationFingerprint,type RoutePoint} from "./tracking.logic.js";

export type RoadGeometry={type:"LineString";coordinates:[number,number][]};
export type RoadRoute={geometry:RoadGeometry;distance_meters:number;duration_seconds:number};

/** Backend adapter only. Not mounted or scheduled until routing activation is approved. */
export function createMapboxDirections(options:{token:()=>string|undefined;fetcher?:typeof fetch;now?:()=>number;concurrency?:number}){
 const request=options.fetcher??fetch,now=options.now??Date.now;
 const limit=options.concurrency??2;
 if(!Number.isInteger(limit)||limit<1||limit>4)throw new Error("Routing concurrency must be between 1 and 4.");
 let active=0;const queue:Array<()=>void>=[];let windowStart=now(),windowCount=0;
 const counts={requests:0,completed:0,failed:0};
 async function acquire(){
  if(active>=limit){if(queue.length>=32)throw new ApiError("Routing queue is busy.",503,"ROUTE_BUSY");await new Promise<void>(resolve=>queue.push(resolve));}
  else active++;
 }
 function release(){const next=queue.shift();if(next)next();else active--;}
 return {
  metrics:()=>({...counts,active,queued:queue.length}),
  async calculate(origin:RoutePoint,destinations:RoutePoint[]):Promise<RoadRoute>{
   destinationFingerprint("route-validation",destinations);
   destinationFingerprint("origin-validation",[origin]);
   const token=options.token()?.trim();
   if(!token)throw new ApiError("Backend Mapbox Directions configuration is missing.",503,"ROUTE_NOT_CONFIGURED");
   await acquire();
   try{
    if(now()-windowStart>=60000){windowStart=now();windowCount=0;}
    if(windowCount>=30)throw new ApiError("Routing request budget reached. Keep the last valid route.",429,"ROUTE_RATE_LIMITED");
    windowCount++;counts.requests++;
    const coordinates=[origin,...destinations].map(p=>`${p.longitude},${p.latitude}`).join(";");
    const url=new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`);
    url.search=new URLSearchParams({access_token:token,geometries:"geojson",overview:"full",steps:"false",alternatives:"false"}).toString();
    // Never log request URLs: the provider credential is a query parameter.
    const response=await request(url,{signal:AbortSignal.timeout(15000),redirect:"error"});
    if(!response.ok){await response.body?.cancel();throw new ApiError(response.status===429?"Mapbox rate limited routing. Keep the last valid route.":"Road routing is unavailable. Keep the last valid route.",response.status===429?429:503,response.status===429?"ROUTE_RATE_LIMITED":"ROUTE_UNAVAILABLE");}
    const reader=response.body?.getReader();if(!reader)throw new Error("Missing route response");
    let size=0;const chunks:Uint8Array[]=[];
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024*1024)throw new Error("Route response too large");chunks.push(part.value);}}
    finally{await reader.cancel().catch(()=>{});}
    const data=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const route=data?.code==="Ok"?data.routes?.[0]:null,geometry=route?.geometry;
    if(!geometry||geometry.type!=="LineString"||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.length>20000||geometry.coordinates.some((p:unknown)=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)||!Number.isFinite(route.distance)||route.distance<0||!Number.isFinite(route.duration)||route.duration<0)throw new Error("Invalid road geometry");
    counts.completed++;
    return {geometry,distance_meters:route.distance,duration_seconds:route.duration};
   }catch(error){counts.failed++;if(error instanceof ApiError)throw error;throw new ApiError("Road routing failed. Keep the last valid route.",503,"ROUTE_UNAVAILABLE");}
   finally{release();}
  },
 };
}
