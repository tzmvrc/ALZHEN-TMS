import {memo,useMemo,useEffect,useRef} from "react";
import {CircleMarker,Polyline,Popup,Tooltip,useMap} from "react-leaflet";
import {locationIsStale} from "../../services/location-capture";

export type TrackedAssignment={
 assignmentId:string;tripId:string;plateNumber:string;dispatchNumber:string|null;
 latitude:number;longitude:number;capturedAt:string;active:boolean;accuracyMeters?:number;
 destinations:Array<{id:string;name:string;latitude:number;longitude:number}>;
 geometry:{type:"LineString";coordinates:[number,number][]}|null;
};
function color(id:string){let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))|0;return `hsl(${Math.abs(hash)%360} 65% 42%)`;}
const Road=memo(function Road({geometry,tint}:{geometry:NonNullable<TrackedAssignment["geometry"]>;tint:string}){
 const positions=useMemo(()=>geometry.coordinates.map(([lng,lat]):[number,number]=>[lat,lng]),[geometry]);
 return <Polyline positions={positions} pathOptions={{color:tint,weight:4,opacity:0.75}}/>;
});
/** Prepared layer for the existing Leaflet/Mapbox-raster map. No provider request
 * or automatic GPS collection here. The protected tracking API is not active yet. */
export default function TrackedTruckLayer({assignments,now,onSelect}:{assignments:TrackedAssignment[];now:number;onSelect?:(tripId:string)=>void}){
 return <><TrackingBounds assignments={assignments}/>{assignments.filter(row=>row.active).map(row=>{
  const tint=color(row.assignmentId),stale=locationIsStale(row.capturedAt,now);
  return <TrackedTruck key={row.assignmentId} row={row} tint={tint} stale={stale} onSelect={onSelect}/>;
 })}</>;
}
function TrackingBounds({assignments}:{assignments:TrackedAssignment[]}){
 const map=useMap(),previous=useRef("");
 useEffect(()=>{
  const identity=assignments.map(a=>a.assignmentId).sort().join(",");
  if(identity===previous.current)return;previous.current=identity;
  const points=assignments.filter(a=>a.active).map(a=>[a.latitude,a.longitude] as [number,number]);
  if(points.length)map.fitBounds(points,{padding:[30,30],maxZoom:13});
 },[assignments,map]);return null;
}
const TrackedTruck=memo(function TrackedTruck({row,tint,stale,onSelect}:{row:TrackedAssignment;tint:string;stale:boolean;onSelect?:((tripId:string)=>void)}){
 return <>
  {row.geometry&&<Road geometry={row.geometry} tint={tint}/>}
  {row.destinations.map(stop=><CircleMarker key={stop.id} center={[stop.latitude,stop.longitude]} radius={5} pathOptions={{color:tint}}><Tooltip>{stop.name}</Tooltip></CircleMarker>)}
  <CircleMarker center={[row.latitude,row.longitude]} radius={10} pathOptions={{color:tint,fillOpacity:stale?0.3:0.9}} eventHandlers={{click:()=>onSelect?.(row.tripId)}}>
   <Tooltip>{row.plateNumber}{stale?" (stale location)":""}</Tooltip>
   <Popup>{row.accuracyMeters!=null&&<p>GPS accuracy: {Math.round(row.accuracyMeters)} m</p>}<strong>{row.plateNumber}</strong><p>{row.dispatchNumber||"Dispatch unavailable"}</p><p>{stale?"Last known location":"Location updated"}: {new Date(row.capturedAt).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</p></Popup>
  </CircleMarker>
 </>;
});
