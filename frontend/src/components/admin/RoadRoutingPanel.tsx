import {useEffect,useState,useMemo,useRef} from "react";
import {useNavigate} from "react-router-dom";
import {assignmentTripUrl} from "../../services/activity-presentation";
import {createPortal} from "react-dom";
import {ChevronDown,MapPin,X} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {apiPost,getCachedApiResponse,invalidateApiCache,type ApiResponse} from "../../services/api.service";
import {subscribeCollaborationEvents} from "../../services/collaboration.service";
import {fetchRoadTrips,roadEndpoint,roadView,roadDisplayView,type RoadTrip,type RoadMode} from "../../services/road-routing";
import {demonstrationRoadTrips,demoKeyFor,realRoutesAvailable} from "../../services/demo-road-routes";
import RoadRouteMap from "./RoadRouteMap";
import WarehouseCoordinateEditor from "./WarehouseCoordinateEditor";

export default function RoadRoutingPanel({tripIds,active=true,height=440,demoFallback=false,offlineStyle=false,focusKey=null,compact=false,dashboard=false,assignmentOnly=false,minimal=false,onSelection,onRows}:{tripIds:string[];active?:boolean;height?:number;demoFallback?:boolean;offlineStyle?:boolean;focusKey?:string|null;compact?:boolean;dashboard?:boolean;assignmentOnly?:boolean;minimal?:boolean;onSelection?:(row:RoadTrip|null)=>void;onRows?:(rows:RoadTrip[])=>void}){
 const navigate=useNavigate();
 const {accessToken,profile}=useAuth();
 const panel=useRef<HTMLElement|null>(null);
 const ids=[...new Set(tripIds)].sort().slice(0,50),identity=ids.join(",");
 const allowed=profile&&["ADMIN","STAFF"].includes(profile.role);
 const [snapshot,setSnapshot]=useState<{token:string;identity:string;rows:RoadTrip[]}|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0),[selection,setSelection]=useState(()=>focusKey?(demoFallback?demoKeyFor(focusKey):focusKey):""),[mode,setMode]=useState<RoadMode>("planned");
 const [seenFocus,setSeenFocus]=useState(focusKey);
 const contextAssignment=dashboard?(snapshot?.token===accessToken&&snapshot.identity===identity?snapshot.rows.find(r=>r.key===selection||r.tripId===selection)?.assignmentId:null)??null:undefined;
 const endpoint=roadEndpoint(ids,contextAssignment);
 /* Clicking a trip elsewhere (fleet list, trip details) picks that trip's own demo route. */
 if(seenFocus!==focusKey){setSeenFocus(focusKey);setSelection(focusKey?(demoFallback?demoKeyFor(focusKey):focusKey):"");}
 const cached=allowed&&accessToken?getCachedApiResponse<ApiResponse<{rows:RoadTrip[]}>>(endpoint,accessToken,300000)?.data?.rows:null;
 const realRows=allowed&&accessToken?(snapshot?.token===accessToken&&snapshot.identity===identity?snapshot.rows:cached):null;
 const demoRows=useMemo(()=>demonstrationRoadTrips(),[]);
 const isDemo=Boolean(demoFallback&&(realRows||error||!identity)&&!realRoutesAvailable(realRows??[]));
 const rows=isDemo?demoRows:realRows,displayMode=demoFallback||minimal?"auto":mode;
 const selected=rows?.find(r=>r.key===selection||r.tripId===selection)??(dashboard||assignmentOnly&&focusKey?undefined:rows?.[0]),view=selected?roadDisplayView(selected,displayMode):null;
 const remaining=selected?roadView(selected,"remaining").stops:[];
 useEffect(()=>{onSelection?.(selected??null);},[selected,onSelection]);
 useEffect(()=>{if(rows)onRows?.(rows);},[rows,onRows]);
 const [coordinates,setCoordinates]=useState(false);
 const [routeBusy,setRouteBusy]=useState(false),[routeMessage,setRouteMessage]=useState("");
 // A deliberate user action after the demo seed has been approved and created.
 // Reading the dashboard never calculates a route or writes to the cache.
 const calculateDemoRoad=async()=>{
  if(routeBusy||!accessToken||!selected?.demonstration||!selected.assignmentId)return;
  setRouteBusy(true);setRouteMessage("");
  try{
   const result=await apiPost<ApiResponse<{state?:string}>>(`/tracking/roads/${encodeURIComponent(selected.assignmentId)}/planned`,{},accessToken);
   if(!result.success)throw Error(result.message??"Road calculation was not confirmed.");
   setRouteMessage(result.data?.state==="UPDATED"?"Mapbox road saved to the shared hourly cache.":`Routing result: ${result.data?.state??"confirmed"}. The existing hourly route guards remain active.`);
   invalidateApiCache(endpoint);setRetry(value=>value+1);
  }catch(cause){setRouteMessage(cause instanceof Error?cause.message:"Road routing unavailable. No straight-line route was substituted.");}
  finally{setRouteBusy(false);}
 };
 useEffect(()=>{
  if(!coordinates)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setCoordinates(false);};
  const previous=document.body.style.overflow;
  document.body.style.overflow="hidden";
  document.addEventListener("keydown",onKey);
  return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",onKey);};
 },[coordinates]);
 useEffect(()=>{
  if(!active||!accessToken||!allowed||!identity)return;let current=true,busy=false,queued=false,failures=0,nextAttempt=0;
  let eventTimer:ReturnType<typeof setTimeout>|undefined;
  const visible=()=>document.visibilityState==='visible'&&Boolean(panel.current?.getClientRects().length);
  const refresh=async()=>{if(!visible()||Date.now()<nextAttempt)return;if(busy){queued=true;return;}busy=true;try{const result=await fetchRoadTrips(accessToken,identity.split(","),contextAssignment);failures=0;nextAttempt=0;if(current){setSnapshot({token:accessToken,identity,rows:result});setError("");}}catch{failures++;nextAttempt=Date.now()+Math.min(120_000,15_000*2**Math.min(failures,4));if(current)setError("Road details could not refresh. Retry to load the latest saved data.");}finally{busy=false;if(current&&queued){queued=false;requestRefresh();}}};
  const requestRefresh=()=>{if(!eventTimer)eventTimer=setTimeout(()=>{eventTimer=undefined;void refresh();},200);};
  void refresh();const timer=setInterval(()=>void refresh(),15000);
  const topics=["trips","trip_stops","trip_truck_assignments","warehouses","customer_stores","trucks","drivers"];
  const unsubscribe=subscribeCollaborationEvents(e=>{if(e.kind==="tracking"||e.kind==="connected"||(e.kind==="signal"&&topics.includes(e.topic))||(e.kind==="commit"&&topics.includes(e.commit.source))){invalidateApiCache('/tracking/roads?');requestRefresh();}});
  document.addEventListener('visibilitychange',requestRefresh);
  return()=>{current=false;clearInterval(timer);clearTimeout(eventTimer);document.removeEventListener('visibilitychange',requestRefresh);unsubscribe();};
 },[accessToken,allowed,identity,endpoint,retry,active]);
 if(!allowed)return <p className="p-4">Road routing is available to authorized Admin and Staff accounts.</p>;
 if(!identity&&!demoFallback)return <p className="p-4 text-sm">No trips selected for routing.</p>;
 const stamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila"}):"Unavailable";
 const distance=view?.cache?.distanceMeters,duration=view?.cache?.durationSeconds;
 const field="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-[#0b2341] shadow-sm outline-none focus:border-[#2678b9]/50 focus-visible:ring-2 focus-visible:ring-[#2678b9]/30";
 const hasEstimate=Boolean(view?.geometry&&typeof distance==="number"&&typeof duration==="number");
 const estimate=hasEstimate?`${((distance as number)/1000).toFixed(1)} km · ${Math.round((duration as number)/60)} min`:isDemo?"Estimate not included in demo":"Road estimate unavailable";
 const card="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-900/5";
 const label="text-[10px] font-semibold uppercase tracking-wide text-slate-400";
 return <section ref={panel} data-dashboard-map={dashboard||undefined} className="space-y-3 overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_1px_2px_rgba(11,35,65,0.03)] ring-1 ring-slate-900/[0.04]">
  {!dashboard&&<header className="flex items-center justify-between gap-3">
   <div>
    <h2 className="text-[17px] font-semibold tracking-tight text-[#0b2341]">Live trip map</h2>
    <p className="text-[11px] text-slate-500">Road routes, delivery stops and truck position</p>
   </div>
   {!!rows?.length&&<span className="shrink-0 rounded-full bg-[#e6f0f9] px-3 py-1 text-[11px] font-semibold text-[#1d5f94]">{rows.length} {rows.length===1?"trip":"trips"}</span>}
  </header>}
  {isDemo&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">Demonstration data — synthetic trucks on saved road routes across the Philippines, not live GPS. No operational data is changed.</p>}
  {!dashboard&&!minimal&&selected?.demonstration&&<div role="note" className={`rounded-xl border border-amber-200 bg-amber-50 text-xs leading-relaxed text-amber-900 ${dashboard?"home-map-demo":"px-3 py-3"}`}><strong>Demo trip / {selected.position?.simulated?"Simulated GPS":"Demonstration data"}</strong><p className={dashboard?"sr-only":undefined}>This sample position is not a live driver fix and does not start location sharing. Road geometry comes from Mapbox and the existing hourly cache.</p><button type="button" disabled={routeBusy} onClick={()=>void calculateDemoRoad()} className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold disabled:opacity-50">{routeBusy?"Calculating road...":"Calculate demo road route"}</button>{routeMessage&&<p role="status" className="mt-2">{routeMessage}</p>}</div>}
  {dashboard&&<div className="home-fleet-toolbar"><span><strong>{rows?.filter(row=>row.position).length??0}</strong> trucks with GPS{rows?.some(row=>row.position?.simulated)?" / includes demo GPS":""}</span>{selected?<button type="button" className="home-button home-button-outline" onClick={()=>setSelection("")}>Back to All Trucks</button>:<span>Select a truck to view its route</span>}</div>}
  {dashboard&&selected&&<details className="home-map-options"><summary>Map options</summary><div><label>Route view<select aria-label="Route view" value={mode} onChange={e=>setMode(e.target.value as RoadMode)}><option value="planned">Planned route</option><option value="remaining">Remaining deliveries</option></select></label><button type="button" onClick={()=>setCoordinates(true)}>Warehouse coordinates</button>{selected.demonstration&&<button type="button" disabled={routeBusy} onClick={()=>void calculateDemoRoad()}>{routeBusy?"Refreshing road...":"Refresh road route"}</button>}{routeMessage&&<p role="status">{routeMessage}</p>}</div></details>}
  {!compact&&!dashboard&&<div className="flex flex-wrap items-center gap-2">
   <div className="relative min-w-0 flex-1 basis-48">
    <select aria-label="Road route trip" className={`${field} w-full appearance-none truncate pr-9`} value={selected?.key??""} onChange={e=>setSelection(e.target.value)}>{dashboard&&<option value="">All trucks / Fleet overview</option>}{rows?.map(row=><option key={row.key} value={row.key}>{row.dispatchNumber??row.tripId} · {row.plateNumber??"Unassigned truck"}</option>)}</select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
   </div>
   {!demoFallback&&<div className="relative min-w-0 flex-1 basis-48">
    <select disabled={dashboard&&!selected} aria-label="Route mode" className={`${field} w-full appearance-none truncate pr-9`} value={mode} onChange={e=>setMode(e.target.value as RoadMode)}><option value="planned">Planned: warehouse → stops</option><option value="remaining">Remaining: truck → undelivered</option></select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
   </div>}
   <button type="button" className={`${field} inline-flex shrink-0 items-center gap-1.5 hover:bg-slate-50 ${coordinates?"bg-[#e6f0f9] text-[#1d5f94]":""}`} aria-expanded={coordinates} onClick={()=>setCoordinates(v=>!v)}><MapPin aria-hidden="true" className="h-3.5 w-3.5"/>Warehouse coordinates</button>
  </div>}
  {coordinates&&createPortal(<div className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-900/30 p-4">
   <button type="button" aria-label="Close warehouse coordinates" tabIndex={-1} className="absolute inset-0 cursor-default" onClick={()=>setCoordinates(false)}/>
   <div role="dialog" aria-modal="true" aria-labelledby="warehouse-coordinates-title" className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
     <div>
      <h3 id="warehouse-coordinates-title" className="text-[17px] font-semibold tracking-tight text-[#0b2341]">Warehouse coordinates</h3>
      <p className="text-[11px] text-slate-500">Preview a location on the map. Nothing is saved without separate approval.</p>
     </div>
     <button type="button" aria-label="Close" onClick={()=>setCoordinates(false)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"><X aria-hidden="true" className="h-4 w-4"/></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm text-slate-600 [&>*]:!m-0 [&>*]:!border-0 [&>*]:!p-0 [&>*]:!shadow-none [&_h2]:hidden [&_h3]:hidden [&_label]:mb-1 [&_label]:block [&_label]:text-xs [&_label]:font-semibold [&_label]:text-slate-500 [&_input]:h-9 [&_input]:w-full [&_input]:rounded-full [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-sm [&_input]:text-[#0b2341] [&_input]:outline-none [&_input]:focus:border-[#2678b9]/50 [&_input]:focus:ring-2 [&_input]:focus:ring-[#2678b9]/30 [&_select]:h-9 [&_select]:w-full [&_select]:rounded-full [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm [&_select]:outline-none [&_select]:focus:ring-2 [&_select]:focus:ring-[#2678b9]/30 [&_p]:text-xs [&_p]:leading-relaxed [&_button:not(.mapboxgl-ctrl_button)]:rounded-full [&_button:not(.mapboxgl-ctrl_button)]:border [&_button:not(.mapboxgl-ctrl_button)]:border-slate-200 [&_button:not(.mapboxgl-ctrl_button)]:bg-white [&_button:not(.mapboxgl-ctrl_button)]:px-4 [&_button:not(.mapboxgl-ctrl_button)]:py-1.5 [&_button:not(.mapboxgl-ctrl_button)]:text-xs [&_button:not(.mapboxgl-ctrl_button)]:font-semibold [&_button:not(.mapboxgl-ctrl_button):disabled]:opacity-50">
     <WarehouseCoordinateEditor/>
    </div>
   </div>
  </div>,document.body)}
  {error&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error} <button type="button" className="font-semibold underline" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}
  {!rows&&!error&&<div role="status" aria-busy="true" className="animate-pulse rounded-2xl bg-slate-100" style={{height}}/>}
  {dashboard&&!!rows?.length&&!rows.some(row=>row.position)&&<p role="status" className="home-data-note">No recorded truck positions are available. Select a trip to inspect its saved route.</p>}
  {rows?.length===0&&<p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">No active trips available.</p>}
  {!!rows?.length&&<><RoadRouteMap selectionOverlay={dashboard&&selected?<><strong>{selected.plateNumber??"Truck"} / {selected.driverName??"Driver unavailable"}</strong><small>{selected.dispatchNumber} / {selected.stops.filter(stop=>["COMPLETED","DELIVERED"].includes(stop.status.toUpperCase())).length} of {selected.stops.length} stops complete</small></>:undefined} onOpenAssignment={row=>{if(row.assignmentId)navigate(assignmentTripUrl(row.tripId,row.assignmentId));}} fleetMode={dashboard} rows={assignmentOnly?(selected?[selected]:[]):isDemo&&selected?[selected]:rows} mode={displayMode} selected={selected?.key??""} onSelect={setSelection} height={height} offlineStyle={offlineStyle}/>
   {(!dashboard||selected)&&<>{(dashboard||minimal)&&!view?.geometry&&<p role="status" className="home-update-warning">{view?.status??"Road route unavailable"}. No calculated road line is shown.</p>}<details open={dashboard||minimal?undefined:true} className={dashboard||minimal?"home-map-details":undefined}><summary className={dashboard||minimal?undefined:"hidden"}>Route &amp; GPS details / {estimate}</summary><div className="grid gap-2 text-xs sm:grid-cols-2">
    <div className={card}><p className={label}>Trip</p><p className="mt-1 text-sm font-semibold text-[#0b2341]">{selected?.dispatchNumber??"No dispatch"}</p><p className="text-slate-600">{selected?.driverName??"Driver unavailable"} · {selected?.plateNumber??"Plate unavailable"}</p><p className="text-slate-500">From {selected?.warehouse.name}</p></div>
    <div className={card}><p className={label}>Next delivery</p><p className="mt-1 text-sm font-semibold text-[#0b2341]">{remaining[0]?.name??"No remaining destinations"}</p><p className="text-slate-600">{remaining.length} remaining · {view?.stops.length??0} stops in saved order</p></div>
    <div className={card}><p className={label}>Route</p><p className="mt-1 text-sm font-semibold text-[#0b2341]">{estimate}</p><p className="text-slate-600">{view?.status}</p><p className="text-slate-500">{isDemo?"Static demonstration geometry":`Calculated ${stamp(view?.cache?.calculatedAt)}`}</p></div>
    <div className={card}><p className={label}>{selected?.position?.simulated?"Demo / Simulated GPS":"Truck position"}</p><p className="mt-1 text-sm font-semibold text-[#0b2341]">{isDemo||selected?.position?.simulated?"Synthetic — not live GPS":stamp(selected?.position?.capturedAt)}{view?.positionStale?" (stale)":""}</p><p className="text-slate-600">{selected?.position?.simulated?`Sample captured ${stamp(selected.position.capturedAt)}`:selected?.position&&!isDemo?`Accuracy ${selected.position.accuracyMeters} m`:isDemo?"Demo position":"Accuracy unavailable"}</p></div>
   </div>
   {minimal&&selected?.demonstration&&<div className="mt-2 text-xs"><button type="button" disabled={routeBusy} onClick={()=>void calculateDemoRoad()} className="rounded border px-3 py-2">{routeBusy?"Refreshing road...":"Refresh road route"}</button>{routeMessage&&<p role="status">{routeMessage}</p>}</div>}</details></>}<p className={dashboard||minimal?"sr-only":"px-1 text-[11px] text-slate-400"}>Reading this view uses cached roads and does not collect GPS. The demo calculation button explicitly requests Mapbox through the existing hourly cache guards.</p>
  </>}
 </section>;
}
