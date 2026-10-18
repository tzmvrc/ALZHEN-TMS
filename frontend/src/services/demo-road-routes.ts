import {roadView,type RoadTrip,type RoadMode} from "./road-routing";
/** Explicitly SYNTHETIC Philippine road-shape fixtures. Not Directions output,
 * not verified navigation, never persisted or mixed with operational positions. */
const examples=[
 {city:"Metro Manila",points:[[120.9820,14.5860],[120.9824,14.5847],[120.9829,14.5832],[120.9834,14.5818],[120.9842,14.5801],[120.9850,14.5783],[120.9855,14.5770],[120.9871,14.5775],[120.9885,14.5781]]},
 {city:"Laguna",points:[[121.1191,14.3130],[121.1195,14.3118],[121.1202,14.3105],[121.1210,14.3095],[121.1222,14.3085],[121.1232,14.3075],[121.1240,14.3068],[121.1250,14.3071],[121.1260,14.3075]]},
 {city:"Cebu",points:[[123.8930,10.3085],[123.8937,10.3078],[123.8945,10.3072],[123.8953,10.3065],[123.8962,10.3057],[123.8972,10.3050],[123.8980,10.3042],[123.8989,10.3036],[123.9000,10.3030]]},
];
export function demonstrationRoadTrips(now=Date.now()):RoadTrip[]{return Array.from({length:10},(_,i)=>{
 const example=examples[i%examples.length],point=(n:number)=>({longitude:example.points[n][0],latitude:example.points[n][1]}),key=`demo:assignment:${i}`;
 return {key,tripId:`demo:trip:${i}`,assignmentId:null,dispatchNumber:`DEMO ${example.city} ${i+1}`,plateNumber:`DEMO-${i+1}`,driverName:"Synthetic driver",warehouse:{id:`demo:warehouse:${i}`,name:`${example.city} demonstration warehouse`,point:point(0)},stops:[{id:`demo:stop:${i}:1`,sequence:1,stopSequence:1,name:`${example.city} sample delivery 1`,status:"PENDING",point:point(4)},{id:`demo:stop:${i}:2`,sequence:2,stopSequence:2,name:`${example.city} sample delivery 2`,status:"PENDING",point:point(8)}],position:{...point(1+Math.floor(i/3)),capturedAt:new Date(now).toISOString(),accuracyMeters:0},cache:null,plannedCache:{mode:"planned",matchesContext:true,geometry:{type:"LineString",coordinates:example.points.map(p=>[p[0],p[1]] as [number,number])},calculatedAt:new Date(now).toISOString(),distanceMeters:null,durationSeconds:null,error:null}};
});}
export function realRoutesAvailable(rows:RoadTrip[]){return rows.some(row=>(["planned","remaining"] as RoadMode[]).some(mode=>Boolean(roadView(row,mode).geometry)));}
