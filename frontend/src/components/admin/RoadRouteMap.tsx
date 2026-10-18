import {useEffect,useRef,useState} from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {roadDisplayView,validPoint,type RoadTrip,type RoadMode,type Point} from "../../services/road-routing";
import {createRoadLayers} from "./road-map-layer";
type Props={rows:RoadTrip[];mode:RoadMode|"auto";selected:string;onSelect:(key:string)=>void;height?:number;offlineStyle?:boolean;onReady?:(map:mapboxgl.Map)=>void;onCoordinatePick?:(point:Point)=>void;draftPoint?:Point|null};
export default function RoadRouteMap({rows,mode,selected,onSelect,height=440,offlineStyle=false,onReady,onCoordinatePick,draftPoint}:Props){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<mapboxgl.Map|null>(null),callback=useRef(onSelect),layer=useRef<ReturnType<typeof createRoadLayers>|null>(null),markers=useRef(new Map<string,mapboxgl.Marker>()),fitted=useRef("");
 const [loaded,setLoaded]=useState(false),[error,setError]=useState(""),[supported]=useState(()=>mapboxgl.supported());
 const ready=useRef(onReady);useEffect(()=>{ready.current=onReady;},[onReady]);
 const pick=useRef(onCoordinatePick);useEffect(()=>{pick.current=onCoordinatePick;},[onCoordinatePick]);
 useEffect(()=>{callback.current=onSelect;},[onSelect]);
 useEffect(()=>{
  if(!container.current)return;let disposed=false;
  if(!supported)return;
  const pins=markers.current;
  const map=new mapboxgl.Map({container:container.current,testMode:offlineStyle,accessToken:offlineStyle?undefined:import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,style:offlineStyle?{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#edf2f7"}}]}:"mapbox://styles/mapbox/light-v11",center:[123.9,10.3],zoom:7,attributionControl:true});mapRef.current=map;
  map.addControl(new mapboxgl.NavigationControl(),"top-right");
  const load=()=>{if(disposed)return;layer.current=createRoadLayers(map,key=>callback.current(key));setLoaded(true);ready.current?.(map);};
  const failure=()=>{if(!disposed)setError("Map resources could not be loaded. Cached route details remain available.");};
  const coordinate=(event:mapboxgl.MapMouseEvent)=>pick.current?.({latitude:event.lngLat.lat,longitude:event.lngLat.wrap().lng});
  map.on("click",coordinate);
  map.on("load",load);map.on("error",failure);
  const resize=new ResizeObserver(()=>map.resize());resize.observe(container.current);
  return()=>{disposed=true;resize.disconnect();map.off("load",load);map.off("error",failure);map.off("click",coordinate);for(const marker of pins.values())marker.remove();pins.clear();layer.current?.dispose();layer.current=null;map.remove();mapRef.current=null;};
 },[offlineStyle,supported]);
 useEffect(()=>{
  const map=mapRef.current;if(!loaded||!map||!layer.current)return;
  const now=Date.now();layer.current.update(rows,mode,selected,now);
  const used=new Set<string>();
  const marker=(id:string,point:{latitude:number;longitude:number},text:string,title:string,key:string)=>{
   used.add(id);let pin=markers.current.get(id);
   if(!pin){const el=document.createElement("button");el.type="button";el.className="rounded-full border-2 border-white bg-[#0b2341] px-2 py-1 text-xs font-bold text-white shadow";el.addEventListener("click",()=>callback.current(key));pin=new mapboxgl.Marker({element:el}).setLngLat([point.longitude,point.latitude]).addTo(map);markers.current.set(id,pin);}
   pin.setLngLat([point.longitude,point.latitude]);pin.getElement().textContent=text;pin.getElement().title=title;pin.getElement().setAttribute("aria-label",title);pin.getElement().style.opacity=key===selected?"1":"0.65";
  };
  for(const row of rows){const view=roadDisplayView(row,mode,now);
   if(validPoint(row.warehouse.point))marker(`${row.key}:warehouse`,row.warehouse.point,"W",`Warehouse: ${row.warehouse.name}`,row.key);
   for(const stop of view.stops)if(validPoint(stop.point))marker(`${row.key}:stop:${stop.id}`,stop.point,String(stop.sequence),`Stop ${stop.sequence}: ${stop.name}`,row.key);
   if(validPoint(row.position))marker(`${row.key}:truck`,row.position,"T",`${row.plateNumber??"Truck"}${view.positionStale?" — stale position":""}`,row.key);
  }
  if(validPoint(draftPoint))marker("coordinate-draft",draftPoint,"Draft","Unsaved coordinate draft",selected);
  for(const [id,pin] of markers.current)if(!used.has(id)){pin.remove();markers.current.delete(id);}
  const chosen=rows.find(r=>r.key===selected),view=chosen?roadDisplayView(chosen,mode,now):null;
  const identity=`${selected}:${mode}:${JSON.stringify(view?.geometry??chosen?.stops.map(s=>[s.id,s.point]))}`;
  if(identity!==fitted.current){fitted.current=identity;const points:[number,number][]=view?.geometry?.coordinates??[view?.origin,...(view?.stops.map(s=>s.point)??[])].filter(validPoint).map(p=>[p.longitude,p.latitude]);if(points.length){const bounds=new mapboxgl.LngLatBounds(points[0],points[0]);points.forEach(p=>bounds.extend(p));map.fitBounds(bounds,{padding:55,maxZoom:15,duration:0});}}
 },[rows,mode,selected,loaded,draftPoint]);
 return <div><div ref={container} style={{height}} aria-label="Road routes map"/>{!supported?<p role="alert">This browser cannot render WebGL maps. Route details remain available below.</p>:!loaded&&!error&&<p role="status">Loading road map…</p>}{error&&<p role="alert" className="p-2 text-sm text-amber-800">{error}</p>}<p className="px-2 text-xs text-slate-500">W: warehouse · numbered delivery stops · T: last authorized truck position. Lines show cached geometry only.</p></div>;
}
