import {useEffect,useRef,useState,type ReactNode} from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {roadDisplayView,validPoint,type RoadTrip,type RoadMode,type Point} from "../../services/road-routing";
import {fleetStatus,fleetTooltip,fleetViewport} from "../../services/fleet-map";
import {createRoadLayers} from "./road-map-layer";
type Props={selectionOverlay?:ReactNode;onOpenAssignment?:(row:RoadTrip)=>void;fleetMode?:boolean;rows:RoadTrip[];mode:RoadMode|"auto";selected:string;onSelect:(key:string)=>void;height?:number;offlineStyle?:boolean;onReady?:(map:mapboxgl.Map)=>void;onCoordinatePick?:(point:Point)=>void;draftPoint?:Point|null};
export default function RoadRouteMap({selectionOverlay,onOpenAssignment,fleetMode=false,rows,mode,selected,onSelect,height=440,offlineStyle=false,onReady,onCoordinatePick,draftPoint}:Props){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<mapboxgl.Map|null>(null),callback=useRef(onSelect),layer=useRef<ReturnType<typeof createRoadLayers>|null>(null),markers=useRef(new Map<string,mapboxgl.Marker>()),fitted=useRef("");
 const selectedRef=useRef(selected),rowsRef=useRef(rows),openRef=useRef(onOpenAssignment);
 useEffect(()=>{selectedRef.current=selected;rowsRef.current=rows;openRef.current=onOpenAssignment;},[selected,rows,onOpenAssignment]);
 const tooltip=useRef<mapboxgl.Popup|null>(null),tooltipPinned=useRef("");
 const fitBounds=useRef<mapboxgl.LngLatBounds|null>(null);
 const [loaded,setLoaded]=useState(false),[error,setError]=useState(""),[supported]=useState(()=>mapboxgl.supported());
 const ready=useRef(onReady);useEffect(()=>{ready.current=onReady;},[onReady]);
 const pick=useRef(onCoordinatePick);useEffect(()=>{pick.current=onCoordinatePick;},[onCoordinatePick]);
 useEffect(()=>{callback.current=onSelect;},[onSelect]);
 useEffect(()=>{
  if(!container.current)return;let disposed=false;
  if(!supported)return;
  const pins=markers.current;
  const map=new mapboxgl.Map({container:container.current,testMode:offlineStyle,accessToken:offlineStyle?undefined:import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,style:offlineStyle?{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#edf2f7"}}]}:"mapbox://styles/mapbox/light-v11",center:[121.03,14.58],zoom:10,attributionControl:true});mapRef.current=map;
  map.addControl(new mapboxgl.NavigationControl(),"top-right");
  const load=()=>{if(disposed)return;layer.current=createRoadLayers(map,key=>callback.current(key));setLoaded(true);ready.current?.(map);};
  const failure=()=>{if(!disposed)setError("Map resources could not be loaded. Cached route details remain available.");};
  const coordinate=(event:mapboxgl.MapMouseEvent)=>{if(event.originalEvent.target instanceof Element&&event.originalEvent.target.closest(".mapboxgl-marker,.mapboxgl-popup,.mapboxgl-control-container,.home-fleet-selection-overlay"))return;
   const popup=tooltip.current?.getElement();
   if(fleetMode&&popup?.isConnected){const bounds=popup.getBoundingClientRect(),eventPoint=event.originalEvent;if(eventPoint.clientX>=bounds.left&&eventPoint.clientX<=bounds.right&&eventPoint.clientY>=bounds.top&&eventPoint.clientY<=bounds.bottom)return;}
   if(fleetMode&&selectedRef.current&&!pick.current){if(map.getLayer("alzhen-road-lines")&&map.queryRenderedFeatures(event.point,{layers:["alzhen-road-lines"]}).length)return;callback.current("");return;}
   pick.current?.({latitude:event.lngLat.lat,longitude:event.lngLat.wrap().lng});};
  map.on("click",coordinate);
  map.on("load",load);map.on("error",failure);
  tooltip.current=new mapboxgl.Popup({offset:22,closeButton:false,closeOnClick:false,maxWidth:"210px",className:"home-fleet-tooltip"});
  const resize=new ResizeObserver(()=>{map.resize();if(fitBounds.current)map.fitBounds(fitBounds.current,{padding:40,maxZoom:15,duration:0});});resize.observe(container.current);
  return()=>{disposed=true;tooltip.current?.remove();tooltip.current=null;resize.disconnect();map.off("load",load);map.off("error",failure);map.off("click",coordinate);for(const marker of pins.values())marker.remove();pins.clear();layer.current?.dispose();layer.current=null;map.remove();mapRef.current=null;};
 },[offlineStyle,supported]);
 useEffect(()=>{
  const map=mapRef.current;if(!loaded||!map||!layer.current)return;
  if(tooltipPinned.current&&tooltipPinned.current!==selected){tooltip.current?.remove();tooltipPinned.current="";}
  const now=Date.now();layer.current.update(fleetMode?fleetViewport(rows,selected,"focus"):rows,mode,selected,now);
  const used=new Set<string>();
  const marker=(id:string,point:{latitude:number;longitude:number},text:string,title:string,key:string,completed=false,simulated=false,status?:ReturnType<typeof fleetStatus>)=>{
   used.add(id);let pin=markers.current.get(id);
   if(!pin){const el=document.createElement("button");el.type="button";el.className=`flex h-7 min-w-7 items-center justify-center border-2 border-white px-1.5 text-[11px] font-bold text-white shadow-md transition-opacity ${text==="W"?"rounded-lg bg-[#0b2341]":text==="T"?"h-8 min-w-8 rounded-full bg-emerald-600 text-sm":text==="Draft"?"rounded-full bg-amber-500":"rounded-full bg-[#2678b9]"}`;el.addEventListener("click",event=>{if(fleetMode)event.stopPropagation();if(fleetMode&&text==="T"){if(selectedRef.current===key){const row=rowsRef.current.find(row=>row.key===key);if(row)openRef.current?.(row);return;}tooltipPinned.current=key;showTooltip();}callback.current(key);});
    const showTooltip=()=>{const content=document.createElement("div");content.textContent=el.dataset.tooltip??"";tooltip.current?.setLngLat(pin!.getLngLat()).setDOMContent(content).addTo(map);};
    if(fleetMode&&text==="T"){el.addEventListener("mouseenter",showTooltip);el.addEventListener("focus",showTooltip);el.addEventListener("mouseleave",()=>{if(tooltipPinned.current!==key)tooltip.current?.remove();});el.addEventListener("blur",()=>{if(tooltipPinned.current!==key)tooltip.current?.remove();});}
    pin=new mapboxgl.Marker({element:el}).setLngLat([point.longitude,point.latitude]).addTo(map);markers.current.set(id,pin);if(id==="coordinate-draft")pin.on("dragend",()=>{const point=pin!.getLngLat().wrap();pick.current?.({latitude:point.lat,longitude:point.lng});});}
   if(id==="coordinate-draft")pin.setDraggable(Boolean(onCoordinatePick));
   const element=pin.getElement();
   element.setAttribute("role","button");if(fleetMode&&text==="T")element.setAttribute("aria-pressed",String(key===selected));
   element.dataset.kind=text==="T"?"truck":text==="W"?"warehouse":"stop";element.dataset.assignment=key;element.dataset.tooltip=title;
   element.classList.toggle("is-muted",fleetMode&&!!selected&&key!==selected);element.classList.toggle("home-fleet-truck",fleetMode&&text==="T");element.classList.toggle("is-selected",fleetMode&&key===selected);
   element.style.backgroundColor=text==="W"?"#0b2341":text==="T"?(fleetMode&&status?status.color:simulated?"#a86b12":"#16846c"):text==="Draft"?"#a86b12":completed?"#16846c":"#2678b9";
   if(!fleetMode&& !pin.getPopup())pin.setPopup(new mapboxgl.Popup({offset:18}).setText(title));else if(!fleetMode)pin.getPopup()!.setText(title);
   element.replaceChildren();
   if(text==="T"){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","19");svg.setAttribute("height","19");svg.setAttribute("aria-hidden","true");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.8");
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d","M2 5h12v12H2z M14 9h4l4 5v3h-8 M5 17a2 2 0 1 0 4 0 M16 17a2 2 0 1 0 4 0");svg.appendChild(path);element.appendChild(svg);
    if(fleetMode&&status){const badge=document.createElement("span");badge.className="home-fleet-status";badge.textContent=status.symbol;badge.title=status.label;element.appendChild(badge);if(simulated){const demo=document.createElement("span");demo.className="home-fleet-demo-dot";demo.textContent="D";demo.title="Demo / Simulated GPS";element.appendChild(demo);}}
   }else element.textContent=completed?`${text} OK`:text;
   pin.setLngLat([point.longitude,point.latitude]);element.title=fleetMode&&text==="T"?"":title;element.setAttribute("aria-label",title);element.style.opacity=!selected||key===selected?"1":fleetMode?"0.28":"0.65";
  };
  for(const row of rows){const view=roadDisplayView(row,mode,now);
   if((!fleetMode||row.key===selected)&&validPoint(row.warehouse.point))marker(`${row.key}:warehouse`,row.warehouse.point,"W",`Warehouse: ${row.warehouse.name}`,row.key);
   for(const stop of (!fleetMode||row.key===selected?row.stops:[]))if(validPoint(stop.point))marker(`${row.key}:stop:${stop.id}`,stop.point,String(stop.sequence),`${row.dispatchNumber??"Trip"} | ${row.plateNumber??"Truck not recorded"} | Stop ${stop.sequence}: ${stop.name} | ${stop.status}`,row.key,["COMPLETED","DELIVERED"].includes(stop.status.toUpperCase()));
   if(validPoint(row.position))marker(`${row.key}:truck`,row.position,"T",fleetMode?fleetTooltip(row):`${row.position.simulated?"DEMO / SIMULATED GPS":view.positionStale?"STALE recorded truck GPS":"Recorded truck GPS"} | ${row.dispatchNumber??"Trip"} | ${row.plateNumber??"Plate not recorded"} | ${row.driverName??"Driver not recorded"} | ${new Date(row.position.capturedAt).toLocaleString()}`,row.key,false,Boolean(row.position.simulated),fleetStatus(row,now));
  }
  if(validPoint(draftPoint))marker("coordinate-draft",draftPoint,"Draft","Unsaved coordinate draft",selected);
  for(const [id,pin] of markers.current)if(!used.has(id)){pin.remove();markers.current.delete(id);}
  if(!rows.length&&validPoint(draftPoint)){const center:[number,number]=[draftPoint.longitude,draftPoint.latitude];if(fitted.current!=="coordinate-draft"||!map.getBounds()?.contains(center)){map.jumpTo({center,zoom:15});fitted.current="coordinate-draft";}return;}
  const chosen=rows.find(r=>r.key===selected),view=chosen?roadDisplayView(chosen,mode,now):null;
  const identity=`${fleetMode&&!selected?rows.map(row=>`${row.key}:${row.position?.latitude}:${row.position?.longitude}`).join(";"):""}:${selected}:${mode}:${JSON.stringify(view?.geometry??chosen?.stops.map(s=>[s.id,s.point]))}`;
  if(identity!==fitted.current){fitted.current=identity;const anchors:[number,number][]=fleetMode&&!selected?rows.flatMap(row=>validPoint(row.position)?[[row.position.longitude,row.position.latitude] as [number,number]]:[]):[chosen?.warehouse.point,...(view?.stops.map(s=>s.point)??chosen?.stops.map(s=>s.point)??[]),chosen?.position].filter(validPoint).map(p=>[p.longitude,p.latitude]);const points:[number,number][]=[...(view?.geometry?.coordinates??[]) as [number,number][],...anchors];if(points.length){const bounds=new mapboxgl.LngLatBounds(points[0],points[0]);points.forEach(p=>bounds.extend(p));fitBounds.current=bounds;map.fitBounds(bounds,{padding:40,maxZoom:fleetMode&&!selected?11:15,duration:fleetMode&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches?650:0});}}
 },[rows,mode,selected,loaded,draftPoint,onCoordinatePick,fleetMode]);
 return <div className="space-y-2" data-fleet-mode={fleetMode?(selected?"focus":"overview"):undefined}>
  <div className="relative overflow-hidden rounded-2xl bg-[#eceff3] ring-1 ring-slate-900/5">
   <div ref={container} style={{height}} aria-label="Road routes map"/>
   {selectionOverlay&&<div className="home-fleet-selection-overlay">{selectionOverlay}</div>}
   {!supported?<p role="alert" className="absolute inset-x-3 top-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow">This browser cannot render WebGL maps. Route details remain available below.</p>:!loaded&&!error&&<p role="status" className="absolute inset-x-3 top-3 rounded-xl bg-[#0b2341]/90 px-3 py-2 text-center text-xs text-white shadow">Loading road map…</p>}
   {error&&<p role="alert" className="absolute inset-x-3 bottom-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow">{error}</p>}
  </div>
  {rows.some(row=>row.position?.simulated)&&<p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{fleetMode?"Demo GPS / Simulated positions":"Demo / Simulated GPS. The sample coordinates are not live driver updates."}</p>}
  {fleetMode?<ul className="home-fleet-legend"><li><i style={{background:"#2678b9"}}/>In Progress</li><li><i style={{background:"#b94536"}}/>! Delayed / overdue</li><li><i style={{background:"#16846c"}}/>Completed</li><li>D / Demo GPS</li></ul>:<ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500">
   <li className="inline-flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded bg-[#0b2341] text-[8px] font-bold text-white">W</span>Warehouse</li>
   <li className="inline-flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2678b9] text-[8px] font-bold text-white">1</span>Pending stop</li>
   <li className="inline-flex items-center gap-1.5"><span className="rounded-full bg-emerald-700 px-1 text-[9px] text-white">OK</span>Completed stop</li>
   <li className="inline-flex items-center gap-1.5"><span aria-hidden="true">🚚</span>Last truck position</li>
   <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-5 border-t-2 border-slate-400"/>Cached road geometry</li>
   <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-slate-400"/>Stale route</li>
  </ul>}
 </div>;
}
