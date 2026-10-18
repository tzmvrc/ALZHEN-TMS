import {useEffect,useState,useMemo} from "react";
import {useAuth} from "../../context/AuthContext";
import {getCachedApiResponse,invalidateApiCache,type ApiResponse} from "../../services/api.service";
import {subscribeCollaborationEvents} from "../../services/collaboration.service";
import {fetchRoadTrips,roadEndpoint,roadView,roadDisplayView,type RoadTrip,type RoadMode} from "../../services/road-routing";
import {demonstrationRoadTrips,realRoutesAvailable} from "../../services/demo-road-routes";
import RoadRouteMap from "./RoadRouteMap";
import WarehouseCoordinateEditor from "./WarehouseCoordinateEditor";

export default function RoadRoutingPanel({tripIds,height=440,demoFallback=false,offlineStyle=false}:{tripIds:string[];height?:number;demoFallback?:boolean;offlineStyle?:boolean}){
 const {accessToken,profile}=useAuth();
 const ids=[...new Set(tripIds)].sort().slice(0,50),identity=ids.join(","),endpoint=roadEndpoint(ids);
 const allowed=profile&&["ADMIN","STAFF"].includes(profile.role);
 const [snapshot,setSnapshot]=useState<{token:string;identity:string;rows:RoadTrip[]}|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0),[selection,setSelection]=useState(""),[mode,setMode]=useState<RoadMode>("planned");
 const cached=allowed&&accessToken?getCachedApiResponse<ApiResponse<{rows:RoadTrip[]}>>(endpoint,accessToken,300000)?.data?.rows:null;
 const realRows=allowed&&accessToken?(snapshot?.token===accessToken&&snapshot.identity===identity?snapshot.rows:cached):null;
 const demoRows=useMemo(()=>demonstrationRoadTrips(),[]);
 const isDemo=Boolean(demoFallback&&(realRows||error||!identity)&&!realRoutesAvailable(realRows??[]));
 const rows=isDemo?demoRows:realRows,displayMode=demoFallback?"auto":mode;
 const selected=rows?.find(r=>r.key===selection)??rows?.[0],view=selected?roadDisplayView(selected,displayMode):null;
 const remaining=selected?roadView(selected,"remaining").stops:[];
 const [coordinates,setCoordinates]=useState(false);
 useEffect(()=>{
  if(!accessToken||!allowed||!identity)return;let current=true,busy=false,queued=false;
  const refresh=async()=>{if(busy){queued=true;return;}busy=true;try{const result=await fetchRoadTrips(accessToken,identity.split(","));if(current){setSnapshot({token:accessToken,identity,rows:result});setError("");}}catch{if(current)setError("Road details could not refresh. Retry to load the latest saved data.");}finally{busy=false;if(current&&queued){queued=false;void refresh();}}};
  void refresh();const timer=setInterval(()=>void refresh(),15000);
  const topics=["trips","trip_stops","trip_truck_assignments","warehouses","customer_stores","trucks","drivers"];
  const unsubscribe=subscribeCollaborationEvents(e=>{if(e.kind==="tracking"||e.kind==="connected"||(e.kind==="signal"&&topics.includes(e.topic))||(e.kind==="commit"&&topics.includes(e.commit.source))){invalidateApiCache(endpoint);void refresh();}});
  return()=>{current=false;clearInterval(timer);unsubscribe();};
 },[accessToken,allowed,identity,endpoint,retry]);
 if(!allowed)return <p className="p-4">Road routing is available to authorized Admin and Staff accounts.</p>;
 if(!identity&&!demoFallback)return <p className="p-4 text-sm">No trips selected for routing.</p>;
 const stamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila"}):"Unavailable";
 const distance=view?.cache?.distanceMeters,duration=view?.cache?.durationSeconds;
 return <section className="space-y-3 p-3">
  {isDemo&&<p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Philippine demonstration data — synthetic trucks and road-shape fixtures, not verified directions or live GPS. No operational data is changed.</p>}
  <button type="button" className="rounded border px-3 py-1 text-sm" aria-expanded={coordinates} onClick={()=>setCoordinates(v=>!v)}>Warehouse coordinates</button>
  {coordinates&&<WarehouseCoordinateEditor/>}
  <div className="flex flex-wrap items-center gap-2"><label className="text-sm">Trip <select aria-label="Road route trip" className="rounded border p-2" value={selected?.key??""} onChange={e=>setSelection(e.target.value)}>{rows?.map(row=><option key={row.key} value={row.key}>{row.dispatchNumber??row.tripId} · {row.plateNumber??"Unassigned truck"}</option>)}</select></label>{!demoFallback&&<label className="text-sm">Route <select aria-label="Route mode" className="rounded border p-2" value={mode} onChange={e=>setMode(e.target.value as RoadMode)}><option value="planned">Planned: warehouse → ordered stops</option><option value="remaining">Remaining: truck → undelivered stops</option></select></label>}</div>
  {error&&<p role="alert" className="text-sm text-amber-800">{error} <button className="underline" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}
  {!rows&&!error&&<div role="status" className="animate-pulse rounded bg-slate-100" style={{height}}>Loading cached road details…</div>}
  {rows?.length===0&&<p>No active trips available.</p>}
  {!!rows?.length&&<><RoadRouteMap rows={rows} mode={displayMode} selected={selected?.key??""} onSelect={setSelection} height={height} offlineStyle={offlineStyle}/>
   <div className="grid gap-2 text-sm sm:grid-cols-3"><p><strong>{selected?.dispatchNumber??"No dispatch"}</strong><br/>{selected?.driverName??"Driver unavailable"} · {selected?.plateNumber??"Plate unavailable"}<br/>Warehouse: {selected?.warehouse.name}</p><p>Next delivery: {remaining[0]?.name??"No remaining destinations"}<br/>{remaining.length} remaining · {view?.stops.length??0} route stops in saved delivery order</p><p>{view?.geometry&&typeof distance==="number"&&typeof duration==="number"?`${(distance/1000).toFixed(1)} km · ${Math.round(duration/60)} min`:"Road estimates unavailable"}<br/>{view?.status}</p><p>{isDemo?"Synthetic position — not live GPS":`Position: ${stamp(selected?.position?.capturedAt)}`}{view?.positionStale?" (stale)":""}<br/>Accuracy: {selected?.position?`${selected.position.accuracyMeters} m`:"Unavailable"}</p><p>{isDemo?"Static demonstration geometry":`Route calculated: ${stamp(view?.cache?.calculatedAt)}`}</p><p>Read-only cached routing. This view does not request Directions or collect GPS.</p></div>
  </>}
 </section>;
}
