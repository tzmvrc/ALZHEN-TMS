import {roadView,type RoadTrip,type RoadMode} from "./road-routing";
import baked from "./demo-road-geometry.json";

/** Demonstration fixtures. The trucks, drivers and positions are SYNTHETIC.
 * The road geometry is real street geometry baked once by
 * scripts/generate-demo-routes.mjs (Mapbox Directions, run offline by a developer),
 * so the demo never calls Directions at runtime, is never persisted, and is never
 * mixed with operational positions. */
type Pt=[number,number];
type BakedRoute={city:string;warehouseName:string;warehouse:Pt;stops:{name:string;point:Pt}[];geometry:Pt[];distanceMeters:number;durationSeconds:number};

const routes=baked as unknown as BakedRoute[];

/** Last-resort shape used only until the generator has been run. */
const fallback:BakedRoute={
 city:"Metro Manila",warehouseName:"Metro Manila demonstration warehouse",
 warehouse:[120.9820,14.5860],
 stops:[{name:"Sample delivery 1",point:[120.9842,14.5801]},{name:"Sample delivery 2",point:[120.9885,14.5781]}],
 geometry:[[120.9820,14.5860],[120.9842,14.5801],[120.9855,14.5770],[120.9885,14.5781]],
 distanceMeters:0,durationSeconds:0,
};

const usable=(r:BakedRoute|undefined):r is BakedRoute=>Boolean(r&&Array.isArray(r.geometry)&&r.geometry.length>1&&r.stops?.length>=2);
const toPoint=(p:Pt)=>({longitude:p[0],latitude:p[1]});

export function demonstrationRoadTrips(now=Date.now()):RoadTrip[]{
 const stamp=new Date(now).toISOString();
 return Array.from({length:10},(_,i)=>{
  const route=usable(routes[i])?routes[i]:fallback,ready=usable(routes[i]);
  /* Truck sits ON the road line, a little way along the trip (spread across trips). */
  const along=route.geometry[Math.min(route.geometry.length-1,Math.floor(route.geometry.length*(0.25+(i%4)*0.15)))];
  return {
   key:`demo:assignment:${i}`,
   tripId:`demo:trip:${i}`,
   assignmentId:null,
   dispatchNumber:`DEMO ${route.city} ${i+1}`,
   plateNumber:`DEMO-${i+1}`,
   driverName:"Synthetic driver",
   warehouse:{id:`demo:warehouse:${i}`,name:route.warehouseName,point:toPoint(route.warehouse)},
   stops:route.stops.slice(0,2).map((stop,n)=>({id:`demo:stop:${i}:${n+1}`,sequence:n+1,stopSequence:n+1,name:stop.name,status:"PENDING",point:toPoint(stop.point)})),
   position:{...toPoint(along),capturedAt:stamp,accuracyMeters:0},
   cache:null,
   plannedCache:{
    mode:"planned",matchesContext:true,
    geometry:{type:"LineString",coordinates:route.geometry},
    calculatedAt:stamp,
    distanceMeters:ready?route.distanceMeters:null,
    durationSeconds:ready?route.durationSeconds:null,
    error:null,
   },
  };
 });
}
export function realRoutesAvailable(rows:RoadTrip[]){return rows.some(row=>(["planned","remaining"] as RoadMode[]).some(mode=>Boolean(roadView(row,mode).geometry)));}